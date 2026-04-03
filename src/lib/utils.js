import { AVATAR_COLORS } from './constants';

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

export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ca-ES', opts);
}

export function rolLabel(rol) {
  const map = {
    jefa: "Cap d'Estudis", director: 'Director', secretaria: 'Secretaria',
    dev: 'Administrador', teacher: 'Docent',
    tutor: 'Tutor/a', especialista: 'Especialista', ee: 'Ed. Especial', directiu: 'Equip Directiu',
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
