import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MX = 12;
const MY = 15;
const CW = 210 - MX * 2;
const PAGE_H = 297;
const LINE_H = 5.5;

const PURPLE       = [91, 75, 138];
const PURPLE_LIGHT = [216, 199, 232];
const GRAY_ROW     = [240, 240, 240];
const COLOR_INF    = [212, 237, 208]; // verd clar  — Infantil/Primària
const COLOR_SEC    = [255, 228, 192]; // taronja clar — Secundària

function hexToRgb(hex) {
  if (!hex || hex.length < 7) return [232, 213, 196];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

async function fetchBase64(url) {
  try {
    const blob = await fetch(url).then(r => r.blob());
    return await new Promise(res => {
      const r = new FileReader();
      r.onloadend = () => res(r.result);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function guard(doc, y, needed) {
  if (y + needed > PAGE_H - MY) { doc.addPage(); return MY; }
  return y;
}

function underlineTitle(doc, text, x, y, fontSize) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize || 9);
  doc.setTextColor(0, 0, 0);
  doc.text(text, x, y);
  const w = doc.getTextWidth(text);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(x, y + 1.5, x + w, y + 1.5);
}

function personBlockHeight(person) {
  return 7 + (person.horaris?.length || 0) * 5.5;
}

function drawPersonBlock(doc, person, sx, sy, w) {
  const HEADER_H = 7;
  const ROW_H    = 5.5;
  const col1W    = w * 0.46;
  const col2W    = w * 0.54;
  const [r, g, b] = hexToRgb(person.color_fons);
  let y = sy;

  doc.setFillColor(r, g, b);
  doc.rect(sx, y, w, HEADER_H, 'F');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(sx, y, w, HEADER_H);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(person.nom || '', sx + w / 2, y + HEADER_H * 0.65, { align: 'center' });
  y += HEADER_H;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (const h of person.horaris || []) {
    doc.setFillColor(r, g, b);
    doc.rect(sx, y, col1W, ROW_H, 'F');
    doc.rect(sx + col1W, y, col2W, ROW_H, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(sx, y, col1W, ROW_H);
    doc.rect(sx + col1W, y, col2W, ROW_H);
    doc.setTextColor(0, 0, 0);
    doc.text(doc.splitTextToSize(h.hora || '', col1W - 2.5), sx + 1.5, y + ROW_H * 0.66);
    doc.text(doc.splitTextToSize(h.activitat || '', col2W - 2.5), sx + col1W + 1.5, y + ROW_H * 0.66);
    y += ROW_H;
  }
  return y;
}

// ── Graella d'informació (absents / baixes / reunions / CEEPSIR) ──────────────

function calcTextH(doc, lines, width, fs, pad) {
  if (!lines.length) return pad * 2 + LINE_H;
  doc.setFontSize(fs);
  let h = pad;
  for (const l of lines) h += doc.splitTextToSize(l, width).length * LINE_H;
  return h + pad;
}

function drawInfoGrid(doc, data, startY) {
  const SECT_H = 7;
  const PAD    = 3;
  const FS     = 8.5;
  const divW   = 0.5;
  const halfW  = (CW - divW) / 2;

  const prep = s => (s || '').split('\n').map(l => l.replace(/^[•\-]\s*/, '').trim()).filter(Boolean).map(l => `• ${l}`);
  const abLines = prep(data.absents_text);
  const bxLines = (data.baixes || []).map(b => `• ${b.absent} — ${b.substitut}`);
  const rnLines = prep(data.reunions_text);
  const ceLines = prep(data.ceepsir_text);

  doc.setFontSize(FS);
  const abH   = calcTextH(doc, abLines.length ? abLines : [' '], halfW - PAD * 2, FS, PAD);
  const bxH   = calcTextH(doc, bxLines.length ? bxLines : [' '], halfW - PAD * 2, FS, PAD);
  const row1H = Math.max(abH, bxH);
  const rnH   = rnLines.length ? SECT_H + calcTextH(doc, rnLines, CW - PAD * 2, FS, PAD) : 0;
  const ceH   = ceLines.length ? SECT_H + calcTextH(doc, ceLines, CW - PAD * 2, FS, PAD) : 0;
  const totalH = SECT_H + row1H + rnH + ceH;

  let y = guard(doc, startY, totalH + 5);
  const x0 = MX, xD = MX + halfW, xR = MX + halfW + divW;

  // Marc exterior
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.5);
  doc.rect(x0, y, CW, totalH);

  // ── Capçalera fila 1: absents | baixes ─────────────────────────────────
  doc.setFillColor(...PURPLE_LIGHT);
  doc.rect(x0, y, halfW, SECT_H, 'F');
  doc.rect(xR, y, halfW, SECT_H, 'F');

  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.3);
  doc.line(xD + divW / 2, y, xD + divW / 2, y + SECT_H + row1H);  // divisor vertical
  doc.line(x0, y + SECT_H, x0 + CW, y + SECT_H);                   // sota capçalera

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Persones que s'absenten", x0 + PAD, y + SECT_H * 0.67);
  doc.text('Baixes amb substitució',   xR + PAD, y + SECT_H * 0.67);
  y += SECT_H;

  // Contingut fila 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS);
  let yL = y + PAD, yR2 = y + PAD;
  for (const l of abLines) { const w = doc.splitTextToSize(l, halfW - PAD * 2); doc.text(w, x0 + PAD, yL); yL += w.length * LINE_H; }
  for (const l of bxLines) { const w = doc.splitTextToSize(l, halfW - PAD * 2); doc.text(w, xR + PAD, yR2); yR2 += w.length * LINE_H; }
  y += row1H;

  // ── Reunions ────────────────────────────────────────────────────────────
  if (rnLines.length) {
    doc.setDrawColor(...PURPLE); doc.setLineWidth(0.3);
    doc.line(x0, y, x0 + CW, y);
    doc.setFillColor(...PURPLE_LIGHT);
    doc.rect(x0, y, CW, SECT_H, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
    doc.text('Reunions i aspectes organitzatius', x0 + PAD, y + SECT_H * 0.67);
    doc.line(x0, y + SECT_H, x0 + CW, y + SECT_H);
    y += SECT_H;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
    let yy = y + PAD;
    for (const l of rnLines) { const w = doc.splitTextToSize(l, CW - PAD * 2); doc.text(w, x0 + PAD, yy); yy += w.length * LINE_H; }
    y += rnH - SECT_H;
  }

  // ── CEEPSIR ─────────────────────────────────────────────────────────────
  if (ceLines.length) {
    doc.setDrawColor(...PURPLE); doc.setLineWidth(0.3);
    doc.line(x0, y, x0 + CW, y);
    doc.setFillColor(...PURPLE_LIGHT);
    doc.rect(x0, y, CW, SECT_H, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
    doc.text('Actuacions CEEPSIR', x0 + PAD, y + SECT_H * 0.67);
    doc.line(x0, y + SECT_H, x0 + CW, y + SECT_H);
    y += SECT_H;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
    let yy = y + PAD;
    for (const l of ceLines) { const w = doc.splitTextToSize(l, CW - PAD * 2); doc.text(w, x0 + PAD, yy); yy += w.length * LINE_H; }
    y += ceH - SECT_H;
  }

  return y + 6;
}

function drawPersonsTable(doc, persons, startY, title) {
  let y = guard(doc, startY, 30);
  underlineTitle(doc, title, MX, y + 4);
  y += 12;

  const GAP   = 3;
  const colW  = (CW - GAP) / 2;
  const colsX = [MX, MX + colW + GAP];
  const colsY = [y, y];

  // Bin-packing greedy: cada bloc va a la columna més baixa (menys ocupada)
  for (const p of persons) {
    const col = colsY[0] <= colsY[1] ? 0 : 1;
    colsY[col] = guard(doc, colsY[col], personBlockHeight(p));
    colsY[col] = drawPersonBlock(doc, p, colsX[col], colsY[col], colW);
    colsY[col] += 2;
  }
  return Math.max(colsY[0], colsY[1]) + 2;
}

export async function generarOriolPDF(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoBase64 = await fetchBase64('/logo_canoriol.png');
  let y = MY;

  // ── HEADER ────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Generalitat de Catalunya', MX, y + 3.5);
  doc.text("Departament d'Educació", MX, y + 7.5);
  doc.text("CEE Ca n'Oriol", MX, y + 11.5);

  if (logoBase64) {
    const props = doc.getImageProperties(logoBase64);
    const maxW = 40, maxH = 16;
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    const iw = props.width * ratio;
    const ih = props.height * ratio;
    doc.addImage(logoBase64, 'PNG', MX + CW - iw, y - 1 + (maxH - ih) / 2, iw, ih);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text("CA N'ORIOL", MX + CW, y + 8, { align: 'right' });
  }

  y += 16;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(MX, y, MX + CW, y);
  y += 3;

  // ── TÍTOL ────────────────────────────────────────────────────────────
  doc.setFillColor(...PURPLE);
  doc.rect(MX, y, CW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MODIFICACIONS HORÀRIES', MX + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const meta = data.metadata || {};
  const capcel = [meta.dia_setmana, meta.data].filter(Boolean).join(' ');
  doc.text(capcel, MX + 4, y + 11.5);
  y += 14;

  // ── LEMA ─────────────────────────────────────────────────────────────
  doc.setFillColor(...PURPLE_LIGHT);
  doc.rect(MX, y, CW, 9, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  if (meta.lema) doc.text(meta.lema, MX + CW / 2, y + 5.8, { align: 'center', maxWidth: CW - 8 });
  y += 9 + 5;

  // ── GRAELLA INFO (absents / baixes / reunions / CEEPSIR) ──────────────
  y = drawInfoGrid(doc, data, y);

  // ── TAULA 1: GRUPS ────────────────────────────────────────────────────
  const grups = data.taula_grups || [];
  if (grups.length) {
    y = guard(doc, y, 25);
    autoTable(doc, {
      startY: y,
      margin: { left: MX, right: MX },
      tableWidth: CW,
      head: [['ETAPA', 'GRUP', 'HORA', 'SUPORT']],
      body: grups.map(r => [r.etapa || '', r.grup || '', r.hora || '', r.suport || '']),
      theme: 'grid',
      headStyles: {
        fillColor: PURPLE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 8,
        halign: 'center',
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const etapa = grups[d.row.index]?.etapa;
        if (etapa === 'INFANTIL/PRIMÀRIA') d.cell.styles.fillColor = COLOR_INF;
        else if (etapa === 'SECUNDÀRIA')   d.cell.styles.fillColor = COLOR_SEC;
        else                               d.cell.styles.fillColor = GRAY_ROW;
      },
      columnStyles: {
        0: { cellWidth: 34, halign: 'center' },
        1: { cellWidth: 17, halign: 'center' },
        2: { cellWidth: 58, halign: 'center' },
        3: { cellWidth: CW - 34 - 17 - 58, halign: 'left' },
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // ── TAULA 2: ESPECIALISTES ────────────────────────────────────────────
  const esp = data.taula_especialistes || [];
  if (esp.length) {
    y = drawPersonsTable(doc, esp, y, 'SUPORTS I/O ESPECIALISTES AMB MODIFICACIÓ HORÀRIA');
  }

  // ── TAULA 3: PRACTICANTS ──────────────────────────────────────────────
  const prac = data.taula_practicants || [];
  if (prac.length) {
    y = guard(doc, y, 20);
    y = drawPersonsTable(doc, prac, y, 'ALUMNAT DE PRÀCTIQUES AMB MODIFICACIÓ HORÀRIA');
  }

  // Footer a totes les pàgines
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 160);
    doc.text('Gestionat per HorariaPro · app.horariapro.com', MX + CW / 2, PAGE_H - 5, { align: 'center' });
  }

  return doc;
}
