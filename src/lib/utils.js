import { AVATAR_COLORS, FRANJES, FRANJES_ORIOL, MANAGEMENT_USERS, APP_URL } from './constants';

export const initials = nom =>
  (nom || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

export const avatarColor = nom =>
  AVATAR_COLORS[Math.abs((nom || '').length) % AVATAR_COLORS.length];

export function normGrup(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[\s\-.]/g, '')
    .replace(/[èé]/g, 'e').replace(/à/g, 'a')
    .replace(/[òó]/g, 'o').replace(/[úü]/g, 'u')
    .replace(/[íï]/g, 'i').replace(/º/g, '');
}

export const todayISO = () => new Date().toISOString().split('T')[0];

// Supabase retorna `franges` com a array natiu (jsonb) o string (text antic).
export function parseFranges(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
}

export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ca-ES', opts);
}

export function rolLabel(rol) {
  const map = {
    jefa: "Cap d'Estudis", director: 'Director', secretaria: 'Secretaria',
    dev: 'Administrador', teacher: 'Docent',
    tutor: 'Tutor/a', especialista: 'Especialista', ee: 'Ed. Especial', directiu: 'Equip Directiu',
    educador: 'Educador/a', vetllador: 'Vetllador/a',
  };
  return map[rol] || rol;
}

export function chipClass(rol) {
  if (rol === 'dev') return 'chip-dev';
  if (rol === 'jefa') return 'chip-jefa';
  if (rol === 'director' || rol === 'secretaria') return 'chip-dir';
  return 'chip-teacher';
}

export function mangementColor(rol) {
  if (rol === 'jefa') return 'var(--green)';
  if (rol === 'director') return 'var(--purple)';
  if (rol === 'secretaria') return '#4285F4';
  return 'var(--ink)';
}

export function frangesText(ids, isOriol) {
  const allFranjes = isOriol ? FRANJES_ORIOL : FRANJES;
  const schoolFranjes = allFranjes.filter(f => !f.lliure);
  if (!ids?.length) return '—';
  if (ids.length >= schoolFranjes.length) return 'Tot el dia';
  const sel = allFranjes.filter(f => ids.includes(f.id));
  if (!sel.length) return '—';
  const labels = [...new Set(sel.map(f => f.label))].join(', ');
  const start = sel[0].sub.split('–')[0].trim();
  const end = sel[sel.length - 1].sub.split('–')[1]?.trim() || '';
  return `${labels} · ${start}–${end}`;
}

export function emailAbsencia({ nom, dates, franges, motiu, isOriol, escola }) {
  const escolaKey = escola?.nom?.toLowerCase().includes('oriol') ? 'oriol' : 'rivo';
  const jefaUser = MANAGEMENT_USERS[escolaKey]?.find(u => u.rol === 'jefa');
  const deepLink = `${APP_URL}?escola=${escolaKey}&u=${encodeURIComponent(jefaUser?.nom || 'Veronica')}&p=${jefaUser?.pin || '1234'}`;

  const datesHtml = dates.map(d =>
    `<li style="margin-bottom:2px">${new Date(d + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</li>`
  ).join('');
  const frangesHtml = frangesText(franges, isOriol);

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">🔔 Nova absència registrada</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:110px">Docent</td><td style="padding:8px 0;font-weight:600">${nom}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Motiu</td><td style="padding:8px 0">${motiu || 'No especificat'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;vertical-align:top">Dies</td><td style="padding:8px 0"><ul style="margin:0;padding-left:16px">${datesHtml}</ul></td></tr>
          <tr><td style="padding:8px 0;color:#666">Horari</td><td style="padding:8px 0;font-weight:600">${frangesHtml}</td></tr>
        </table>
        <div style="margin-top:24px;text-align:center">
          <a href="${deepLink}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Gestionar cobertura a GDOCENT →
          </a>
        </div>
      </div>
    </div>`;
}
