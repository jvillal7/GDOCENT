import { describe, it, expect } from 'vitest';
import {
  initials, oriolInitials, avatarColor, normGrup, parseFranges,
  formatDate, rolLabel, chipClass, escHtml, frangesText,
} from '../lib/utils';

describe('initials', () => {
  it('retorna les inicials de dos noms', () => {
    expect(initials('Laura Mas')).toBe('LM');
  });
  it('retorna les inicials de tres noms (màx 2)', () => {
    expect(initials('Xavier Tort Puig')).toBe('XT');
  });
  it('retorna string buit si no hi ha nom', () => {
    expect(initials('')).toBe('');
    expect(initials(null)).toBe('');
    expect(initials(undefined)).toBe('');
  });
  it('majúscules correctes', () => {
    expect(initials('anna garcia')).toBe('AG');
  });
});

describe('oriolInitials', () => {
  it('elimina el sufix entre parèntesis', () => {
    expect(oriolInitials('A.Y (PAE)')).toBe('A.Y');
    expect(oriolInitials('R.E (MALL)')).toBe('R.E');
  });
  it('retorna el nom sense parèntesis intacte', () => {
    expect(oriolInitials('Laura')).toBe('Laura');
  });
  it('retorna buit per valors buits', () => {
    expect(oriolInitials('')).toBe('');
    expect(oriolInitials(null)).toBe('');
  });
});

describe('normGrup', () => {
  it('normalitza espais, guions i punts', () => {
    expect(normGrup('1r A')).toBe('1ra');
    expect(normGrup('2n-B')).toBe('2nb');
    expect(normGrup('3r.C')).toBe('3rc');
  });
  it('normalitza accents', () => {
    expect(normGrup('Educació')).toBe('educacio');
    expect(normGrup('Àrea')).toBe('area');
    expect(normGrup('Música')).toBe('musica');
  });
  it('retorna buit si no hi ha valor', () => {
    expect(normGrup('')).toBe('');
    expect(normGrup(null)).toBe('');
    expect(normGrup(undefined)).toBe('');
  });
  it('comparació entre variants del mateix grup és consistent', () => {
    expect(normGrup('1r A')).toBe(normGrup('1rA'));
    expect(normGrup('2n-B')).toBe(normGrup('2n B'));
  });
});

describe('parseFranges', () => {
  it('retorna array directament si ja és array', () => {
    expect(parseFranges(['f1a', 'f1b'])).toEqual(['f1a', 'f1b']);
  });
  it('parseja un string JSON', () => {
    expect(parseFranges('["f1a","f2a"]')).toEqual(['f1a', 'f2a']);
  });
  it('retorna array buit per string buit', () => {
    expect(parseFranges('')).toEqual([]);
  });
  it('retorna array buit per JSON invàlid', () => {
    expect(parseFranges('not-json')).toEqual([]);
  });
  it('retorna array buit per null/undefined', () => {
    expect(parseFranges(null)).toEqual([]);
    expect(parseFranges(undefined)).toEqual([]);
  });
});

describe('formatDate', () => {
  it('retorna string buit per valor buit', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
  it('formata una data ISO correctament', () => {
    const result = formatDate('2026-06-03');
    expect(result).toMatch(/\d/);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('rolLabel', () => {
  it('retorna etiquetes correctes per rols coneguts', () => {
    expect(rolLabel('jefa')).toBe("Cap d'Estudis");
    expect(rolLabel('director')).toBe('Director');
    expect(rolLabel('secretaria')).toBe('Secretaria');
    expect(rolLabel('teacher')).toBe('Docent');
    expect(rolLabel('dev')).toBe('Administrador');
    expect(rolLabel('educador')).toBe('Educador/a');
    expect(rolLabel('vetllador')).toBe('Vetllador/a');
  });
  it('retorna el rol original per rols desconeguts', () => {
    expect(rolLabel('desconegut')).toBe('desconegut');
    expect(rolLabel('')).toBe('');
  });
});

describe('chipClass', () => {
  it('retorna chip-dev per dev', () => {
    expect(chipClass('dev')).toBe('chip-dev');
  });
  it('retorna chip-jefa per jefa', () => {
    expect(chipClass('jefa')).toBe('chip-jefa');
  });
  it('retorna chip-dir per director i secretaria', () => {
    expect(chipClass('director')).toBe('chip-dir');
    expect(chipClass('secretaria')).toBe('chip-dir');
  });
  it('retorna chip-teacher per qualsevol altre rol', () => {
    expect(chipClass('teacher')).toBe('chip-teacher');
    expect(chipClass('educador')).toBe('chip-teacher');
    expect(chipClass('vetllador')).toBe('chip-teacher');
  });
});

describe('escHtml', () => {
  it('escapa caràcters HTML perillosos', () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });
  it('escapa ampersands', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });
  it('escapa cometes simples', () => {
    expect(escHtml("it's")).toBe("it&#39;s");
  });
  it('retorna string buit per valors buits', () => {
    expect(escHtml('')).toBe('');
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });
  it('no modifica text pla', () => {
    expect(escHtml('Hola món')).toBe('Hola món');
  });
});

describe('avatarColor', () => {
  it('retorna un string no buit', () => {
    expect(avatarColor('Laura')).toBeTruthy();
  });
  it('retorna el mateix color per al mateix nom', () => {
    expect(avatarColor('Laura')).toBe(avatarColor('Laura'));
  });
  it('funciona amb nom buit o null', () => {
    expect(avatarColor('')).toBeTruthy();
    expect(avatarColor(null)).toBeTruthy();
  });
});

describe('frangesText', () => {
  it('retorna em dash per array buit', () => {
    expect(frangesText([])).toBe('—');
    expect(frangesText(null)).toBe('—');
  });
  it('retorna text per una franja vàlida', () => {
    const result = frangesText(['f1a']);
    expect(result).toContain('9:00');
  });
  it('retorna "Tot el dia" quan es seleccionen totes les franges lectives', () => {
    const todasFranjes = ['f1a','f1b','f2a','patiA','patiB','f3a','f3b','f5a','f5b','f5c'];
    const result = frangesText(todasFranjes);
    expect(result).toBe('Tot el dia');
  });
});
