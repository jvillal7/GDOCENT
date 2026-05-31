import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';

const ALLOWED_ORIGINS = ['https://app.horariapro.com', 'http://localhost:5173', 'http://localhost:8080'];

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Vary': 'Origin',
  };
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = 'https://app.horariapro.com';

const FRANJES_LABEL: Record<string, string> = {
  f1a: '9:00-9:30', f1b: '9:30-10:00', f2a: '10:00-10:30',
  patiA: '10:30-11:00', patiB: '11:00-11:30',
  f3a: '11:30-12:00', f3b: '12:00-12:30',
  f5a: '15:00-15:30', f5b: '15:30-16:00', f5c: '16:00-16:30',
};

function fmtData(data: string): string {
  return new Date(data + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function frangesText(ids: string[]): string {
  if (!ids?.length) return '-';
  return ids.map(id => FRANJES_LABEL[id] || id).join(', ');
}

function diaDeLaSetmana(data: string): string {
  const d = new Date(data + 'T12:00:00').getDay();
  return ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][d];
}

function cicleDeGrup(g: string): string | null {
  const u = (g || '').toUpperCase();
  if (/^I[3-5]/.test(u)) return 'petits';
  const norm = u.replace(/N(?=\b)/, 'R').replace(/ER(?=\b)/, 'R');
  if (/^[12]R|^3R/.test(norm)) return 'mitjans';
  if (/^[456][TE]/.test(u) || /^[456]/.test(u)) return 'grans';
  if (/^1[RN]|^2N|^3R/.test(u)) return 'mitjans';
  return null;
}

function stripAcc(s: string): string {
  // NFD decomposes accented chars, then filter removes combining marks (0x0300-0x036F)
  return [...(s || '').toLowerCase().normalize('NFD')]
    .filter(c => { const cp = c.codePointAt(0)!; return cp < 0x0300 || cp > 0x036F; })
    .join('');
}
function nomIgual(a: string, b: string): boolean {
  return stripAcc(a).trim() === stripAcc(b).trim();
}
function normGrup(s: string): string {
  return stripAcc(s).replace(/ /g, '').replace(/\./g, '');
}

function esDeBaixa(nom: string, baixes: any[]): boolean {
  if (!baixes?.length) return false;
  const n = nom.toLowerCase().trim();
  return baixes.some(b => {
    const bn = (b.absent || b || '').toLowerCase().trim();
    if (!bn) return false;
    return n === bn || n.startsWith(bn) || bn.startsWith(n);
  });
}

function extraerGrup(val: string): string | null {
  if (!val) return null;
  const mSuport = /^Suport\s+(.+)/i.exec(val);
  if (mSuport) return mSuport[1].trim();
  const mGrup = /^([I][3-5][AB]|[1-6][rnte][AB]|[1-6]r[AB])/i.exec(val);
  if (mGrup) return mGrup[1];
  return null;
}

function escHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailCobertura(opts: { cobrint: string; absent: string; data: string; frangesIds: string[]; grup: string; esFutura: boolean; notes?: string; escolaKey: string }) {
  const { cobrint, absent, data, frangesIds, grup, esFutura, notes, escolaKey } = opts;
  const dataFmt = fmtData(data);
  const horariText = frangesText(frangesIds);
  const firstName = cobrint.split(' ')[0];
  const notesHtml = notes?.trim()
    ? `<div style="margin-top:20px;background:#f0f7ff;border-left:4px solid #4285F4;border-radius:6px;padding:14px 16px">
        <div style="font-size:11px;font-weight:700;color:#4285F4;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Missatge de ${escHtml(absent)}</div>
        <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6">${escHtml(notes.trim()).replace(/\n/g, '<br>')}</p>
      </div>`
    : '';
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Hola, <strong>${escHtml(firstName)}</strong></p>
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">&#128203; ${esFutura ? 'Cobertura provisional assignada' : 'Cobertura assignada per avui'}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:110px">Nom</td><td style="padding:8px 0;font-weight:600">${escHtml(cobrint)}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Data</td><td style="padding:8px 0">${dataFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Horari</td><td style="padding:8px 0;font-weight:600">${horariText}</td></tr>
          ${grup ? `<tr><td style="padding:8px 0;color:#666">Grup</td><td style="padding:8px 0">${escHtml(grup)}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666">Substitueix</td><td style="padding:8px 0">${escHtml(absent)}</td></tr>
        </table>
        ${notesHtml}
        <div style="margin-top:24px;text-align:center">
          <a href="${APP_URL}?escola=${escolaKey}&page=tc" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Veure la meva cobertura a HORARIA &#8594;
          </a>
        </div>
      </div>
    </div>`;
}

function emailAfectat(opts: { tutor: string; absent: string; cobrint: string; data: string; grup: string; esFutura: boolean; escolaKey: string }) {
  const { tutor, absent, cobrint, data, grup, esFutura, escolaKey } = opts;
  const dataFmt = fmtData(data);
  const firstName = tutor.split(' ')[0];
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Hola, <strong>${escHtml(firstName)}</strong></p>
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">&#8505;&#65039; Canvi d'organitzacio al teu grup</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#444;line-height:1.6">
          <strong>${escHtml(absent)}</strong> ${esFutura ? 'no podra venir' : 'no vindra'} a fer suport a <strong>${escHtml(grup)}</strong> el <strong>${dataFmt}</strong>.
          ${cobrint && cobrint !== absent ? `La cobertura queda assignada a <strong>${escHtml(cobrint)}</strong>.` : "La franja quedara gestionada per la cap d'estudis."}
        </p>
        <div style="margin-top:20px;text-align:center">
          <a href="${APP_URL}?escola=${escolaKey}&page=tc" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Veure detalls a HORARIA &#8594;
          </a>
        </div>
      </div>
    </div>`;
}

function emailCoordinador(opts: { coord: string; cobrint: string; absent: string; data: string; esFutura: boolean; escolaKey: string }) {
  const { coord, cobrint, absent, data } = opts;
  const dataFmt = fmtData(data);
  const firstName = coord.split(' ')[0];
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Hola, <strong>${escHtml(firstName)}</strong></p>
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">&#128203; Cobertura al teu cicle</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:110px">Data</td><td style="padding:8px 0">${dataFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Absent</td><td style="padding:8px 0;font-weight:600">${escHtml(absent)}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Cobreix</td><td style="padding:8px 0;font-weight:600">${escHtml(cobrint)}</td></tr>
        </table>
        <p style="margin-top:20px;color:#aaa;font-size:11px;text-align:center">Enviat per HORARIA - horariapro.com</p>
      </div>
    </div>`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  try {
    const { escola_id, absent_nom, absent_notes, cobridors, data, is_futura } = await req.json();

    if (!escola_id || !absent_nom || !cobridors?.length || !data) {
      return new Response('missing params', { status: 400, headers: corsHeaders(origin) });
    }

    const supabase = createClient(SUPA_URL, SERVICE_KEY);

    const [docentRes, escolaRes] = await Promise.all([
      supabase.from('docents').select('nom, email, grup_principal, horari, coordinador_cicle').eq('escola_id', escola_id).eq('actiu', true),
      supabase.from('escoles').select('nom, oriol_baixes').eq('id', escola_id).single(),
    ]);

    const docents: any[] = docentRes.data || [];
    const escolaKey = (escolaRes.data?.nom || '').toLowerCase().includes('oriol') ? 'oriol' : 'rivo';
    const baixes: any[] = escolaRes.data?.oriol_baixes || [];
    const esFutura = !!is_futura;
    const dia = diaDeLaSetmana(data);
    const absentDocent = docents.find(d => nomIgual(d.nom, absent_nom));

    const tutorsAvisats = new Set<string>();
    const coordsAvisats = new Set<string>();
    const sends: Promise<any>[] = [];

    for (const cobr of cobridors) {
      const cobrintDocent = docents.find(d => nomIgual(d.nom, cobr.nom));

      // Email al docent cobrint — cobr.email té prioritat (passa des del frontend)
      const cobrintEmail = cobr.email || cobrintDocent?.email;
      if (cobrintEmail) {
        sends.push(resend.emails.send({
          from: 'HORARIA <horaria@horariapro.com>',
          to: [cobrintEmail],
          subject: `Cobertura assignada - ${data}`,
          html: emailCobertura({
            cobrint: cobr.nom,
            absent: absent_nom,
            data,
            frangesIds: cobr.franges_ids || [],
            grup: cobr.grup || '',
            esFutura,
            notes: absent_notes,
            escolaKey,
          }),
        }));
      }

      // Tutors afectats: buscar al horari de l'absent quin grup tenia a cada franja
      if (absentDocent?.horari && dia && cobr.franges_ids?.length) {
        for (const fid of cobr.franges_ids) {
          const val = absentDocent.horari[dia]?.[fid] || '';
          const grup = extraerGrup(val) || cobr.grup;
          if (!grup) continue;

          const tutorNorm = normGrup(grup);
          const tutor = docents.find(d =>
            d.grup_principal &&
            normGrup(d.grup_principal) === tutorNorm &&
            !(d.grup_principal || '').includes('SIEI') &&
            !nomIgual(d.nom, absent_nom) &&
            d.email &&
            !esDeBaixa(d.nom, baixes)
          );
          if (tutor && !tutorsAvisats.has(tutor.nom)) {
            tutorsAvisats.add(tutor.nom);
            sends.push(resend.emails.send({
              from: 'HORARIA <horaria@horariapro.com>',
              to: [tutor.email],
              subject: `Canvi d'organitzacio - ${data}`,
              html: emailAfectat({
                tutor: tutor.nom,
                absent: absent_nom,
                cobrint: cobr.nom,
                data,
                grup,
                esFutura,
                escolaKey,
              }),
            }));
          }
        }
      }

      // Coordinador del cicle del docent cobrint
      if (cobrintDocent?.grup_principal) {
        const cicle = cicleDeGrup(cobrintDocent.grup_principal);
        if (cicle && !coordsAvisats.has(cicle)) {
          const coord = docents.find(d =>
            (d.coordinador_cicle || '').toLowerCase() === cicle &&
            !nomIgual(d.nom, cobr.nom) &&
            !nomIgual(d.nom, absent_nom) &&
            d.email &&
            !esDeBaixa(d.nom, baixes)
          );
          if (coord) {
            coordsAvisats.add(cicle);
            sends.push(resend.emails.send({
              from: 'HORARIA <horaria@horariapro.com>',
              to: [coord.email],
              subject: `Cobertura al teu cicle - ${data}`,
              html: emailCoordinador({ coord: coord.nom, cobrint: cobr.nom, absent: absent_nom, data, esFutura, escolaKey }),
            }));
          }
        }
      }
    }

    // Coordinador del cicle de l'absent (si no s'ha avisat ja)
    if (absentDocent?.grup_principal) {
      const cicle = cicleDeGrup(absentDocent.grup_principal);
      if (cicle && !coordsAvisats.has(cicle)) {
        const coord = docents.find(d =>
          (d.coordinador_cicle || '').toLowerCase() === cicle &&
          !nomIgual(d.nom, absent_nom) &&
          d.email &&
          !esDeBaixa(d.nom, baixes)
        );
        if (coord) {
          coordsAvisats.add(cicle);
          const primerCobrint = cobridors[0]?.nom || '-';
          sends.push(resend.emails.send({
            from: 'HORARIA <horaria@horariapro.com>',
            to: [coord.email],
            subject: `Cobertura al teu cicle - ${data}`,
            html: emailCoordinador({ coord: coord.nom, cobrint: primerCobrint, absent: absent_nom, data, esFutura, escolaKey }),
          }));
        }
      }
    }

    await Promise.allSettled(sends);

    return new Response(JSON.stringify({ sent: sends.length }), {
      status: 200,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('coverage-notifier error:', e.message);
    return new Response(e.message, { status: 500, headers: corsHeaders(origin) });
  }
});
