import { parseFranges } from '../lib/utils';
import { FRANJES, FRANJES_ORIOL, SCHOOL_FRANJES, SCHOOL_FRANJES_ORIOL } from '../lib/constants';

export default function FrangesChips({ frangesJson, isOriol }) {
  const ids = parseFranges(frangesJson);
  const franjesAct = isOriol ? FRANJES_ORIOL : FRANJES;
  const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
  if (!ids.length) return null;
  if (ids.length >= schoolFranjesAct.length) {
    return <span className="slot-chip all-day">✨ Tot el dia</span>;
  }
  const seen = new Set();
  const chips = franjesAct
    .filter(f => ids.includes(f.id))
    .filter(f => { if (seen.has(f.label)) return false; seen.add(f.label); return true; })
    .map(f => <span key={f.label} className={`slot-chip${f.patio ? ' patio' : ''}`}>{f.label}</span>);
  return <>{chips}</>;
}
