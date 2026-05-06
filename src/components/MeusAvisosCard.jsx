import { parseFranges } from '../lib/utils';

export default function MeusAvisosCard({ avisos, franjesAct, schoolFranjesAct }) {
  if (!avisos || avisos.length === 0) return null;

  function frangesResum(frangesJson) {
    const ids = parseFranges(frangesJson);
    if (ids.length >= schoolFranjesAct.length) return <span className="slot-chip all-day">Tot el dia</span>;
    const selected = franjesAct.filter(f => ids.includes(f.id));
    const seen = new Set();
    return selected
      .filter(f => { if (seen.has(f.label)) return false; seen.add(f.label); return true; })
      .map(f => <span key={f.label} className={`slot-chip${f.patio ? ' patio' : ''}`}>{f.label}</span>);
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head" style={{ padding: '10px 14px' }}>
        <h3 style={{ fontSize: 13 }}>Les teves absències recents</h3>
      </div>
      {avisos.map(a => {
        const dataFmt = a.data
          ? new Date(a.data + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' })
          : '—';
        const cobert  = a.estat === 'resolt' || a.estat === 'arxivat';
        const pendent = a.estat === 'pendent';
        const cobrantsUnics = [...new Set(a.cobrants)];
        return (
          <div key={a.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, color: 'var(--ink)' }}>{dataFmt}</span>
              {pendent
                ? <span className="sp sp-red" style={{ fontSize: 10 }}>Pendent</span>
                : <span className="sp sp-green" style={{ fontSize: 10 }}>✓ Cobert</span>
              }
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {frangesResum(a.franges)}
            </div>
            {cobert && cobrantsUnics.length > 0 && (
              <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10, padding: '8px 10px', marginTop: 2 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Cobert per</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cobrantsUnics.slice(0, 4).map(nom => {
                    const parts = nom.trim().split(' ');
                    const ini = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
                    return (
                      <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 20, padding: '4px 10px 4px 4px', border: '1px solid var(--green-mid)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {ini.toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{parts[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {cobert && cobrantsUnics.length === 0 && (
              <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}>
                ✓ Marcat com a resolt
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
