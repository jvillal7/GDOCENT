import { useState, useEffect, useRef } from 'react';
import { supaFetch } from '../../lib/api';
import { MANAGEMENT_USERS, AVATAR_COLORS } from '../../lib/constants';
import { useApp } from '../../context/AppContext';
import { initials, mangementColor } from '../../lib/utils';

export default function LoginFlow() {
  const { login } = useApp();
  const [step, setStep]               = useState(() => localStorage.getItem('gd_last_escola_key') ? 'role' : 'school');
  const [schools, setSchools]         = useState([]);
  const [school, setSchool]           = useState(null);
  const [roleGroup, setRoleGroup]     = useState(null);
  const [users, setUsers]             = useState([]);
  const [selected, setSelected]       = useState(null);
  const [pin, setPin]                 = useState('');
  const [search, setSearch]           = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [pendingKey, setPendingKey]   = useState(null);
  const pinRef = useRef(null);

  useEffect(() => {
    supaFetch('escoles', { bypassSchoolId: true }).then(data => {
      if (!data) return;
      setSchools(data);
      const lastKey = localStorage.getItem('gd_last_escola_key');
      if (lastKey) {
        const matched = data.find(e => e.nom.toLowerCase().includes(lastKey));
        if (matched) setSchool(matched);
      }
    });
  }, []);

  function selectSchool(key) {
    if (!schools.length) return setError('Carregant escoles, espera un moment...');
    const matched = schools.find(e => e.nom.toLowerCase().includes(key));
    if (!matched) return setError("No s'ha trobat la configuració per aquest centre.");
    setError('');
    if (!localStorage.getItem('gd_consent_accepted')) {
      setPendingKey(key);
      setShowConsent(true);
      return;
    }
    localStorage.setItem('gd_last_escola_key', key);
    setSchool(matched);
    setStep('role');
  }

  function handleConsentAccept() {
    localStorage.setItem('gd_consent_accepted', '1');
    setShowConsent(false);
    const matched = schools.find(e => e.nom.toLowerCase().includes(pendingKey));
    if (matched) {
      localStorage.setItem('gd_last_escola_key', pendingKey);
      setSchool(matched);
      setStep('role');
    }
    setPendingKey(null);
  }

  async function selectRoleGroup(group) {
    setRoleGroup(group);
    setError('');
    setLoading(true);
    setStep('details');
    setSelected(null);
    setPin('');
    setSearch('');
    try {
      if (group === 'teacher') {
        const data = await supaFetch(`docents?actiu=eq.true&order=nom&escola_id=eq.${school.id}&rol=not.in.(educador,vetllador)`);
        setUsers(data || []);
      } else if (group === 'educador' || group === 'vetllador') {
        const data = await supaFetch(`docents?actiu=eq.true&order=nom&escola_id=eq.${school.id}&rol=eq.${group}`);
        setUsers(data || []);
      } else {
        const key = school.nom.toLowerCase().includes('rivo') ? 'rivo' : 'oriol';
        setUsers((MANAGEMENT_USERS[key] || []).map(u => ({ ...u, escola_id: school.id })));
      }
    } catch {
      setError('Error carregant usuaris.');
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user) {
    setSelected(user);
    setPin('');
    setError('');
    setTimeout(() => pinRef.current?.focus(), 50);
  }

  function doLogin() {
    if (!selected) return setError('Selecciona el teu nom a la llista.');
    if (pin !== selected.pin) return setError('PIN incorrecte. Torna-ho a provar.');
    let perfil;
    if (roleGroup === 'teacher' || roleGroup === 'educador' || roleGroup === 'vetllador') {
      perfil = { id: selected.id, escola_id: school.id, nom: selected.nom, rol: roleGroup };
    } else {
      perfil = selected;
    }
    login(perfil, school, perfil.rol);
  }

  const filtered = users.filter(u => u.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <div id="login">
      {showConsent && <ConsentModal onAccept={handleConsentAccept} />}
      <div className="login-hero">
        <div className="hero-text">
          <h1>Gestió<br /><em>Docent</em></h1>
          <p>{school ? school.nom : 'Selecciona la teva escola per accedir'}</p>
        </div>
      </div>
      <div className="login-body">
        {error && (
          <div className="login-error" style={{ display: 'block', padding: '12px 14px' }}>{error}</div>
        )}

        {/* Step 1: Escola */}
        {step === 'school' && (
          <div className="login-step active">
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Benvingut/da</h2>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 24, textAlign: 'center' }}>
              Tria el teu centre educatiu
            </p>
            <div className="school-logo-grid">
              <button className="school-logo-btn" onClick={() => selectSchool('rivo')}>
                <img src="logo_rivo.png" alt="Rivo Rubeo"
                  onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }} />
                <div className="fallback-logo-text" style={{ display: 'none' }}>RIVO RUBEO</div>
              </button>
              <button className="school-logo-btn" onClick={() => selectSchool('oriol')}>
                <img src="logo_canoriol.png" alt="Ca n'Oriol"
                  onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }} />
                <div className="fallback-logo-text" style={{ display: 'none' }}>CEE CA N'ORIOL</div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Rol */}
        {step === 'role' && (
          <div className="login-step active">
            <h2>Hola de nou</h2>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 16 }}>
              Selecciona el teu perfil per accedir.
            </p>
            <div className="role-cards">
              <button className="role-card" onClick={() => selectRoleGroup('directiu')}>
                <div className="role-card-icon">🏛️</div>
                <div className="role-card-text">
                  <h3>Equip Directiu</h3>
                  <p>Cap d'estudis, direcció i administració</p>
                </div>
                <div className="role-card-arrow">→</div>
              </button>
              <button className="role-card" onClick={() => selectRoleGroup('teacher')}>
                <div className="role-card-icon" style={{ background: '#EAF2FF' }}>👩‍🏫</div>
                <div className="role-card-text">
                  <h3>Docent</h3>
                  <p>Accés al teu perfil i avís d'absències</p>
                </div>
                <div className="role-card-arrow">→</div>
              </button>
              <button className="role-card" onClick={() => selectRoleGroup('educador')}>
                <div className="role-card-icon" style={{ background: '#F0FFF4' }}>🧑‍🤝‍🧑</div>
                <div className="role-card-text">
                  <h3>Educador/a</h3>
                  <p>Accés al teu perfil i avís d'absències</p>
                </div>
                <div className="role-card-arrow">→</div>
              </button>
              <button className="role-card" onClick={() => selectRoleGroup('vetllador')}>
                <div className="role-card-icon" style={{ background: '#FFF8E7' }}>👁️</div>
                <div className="role-card-text">
                  <h3>Vetllador/a</h3>
                  <p>Accés al teu perfil i avís d'absències</p>
                </div>
                <div className="role-card-arrow">→</div>
              </button>
            </div>
            <button className="back-btn" onClick={() => setStep('school')}>← Canviar d'escola</button>
          </div>
        )}

        {/* Step 3: Nom + PIN */}
        {step === 'details' && (
          <div className="login-step active">
            <div className="detail-header">
              <div className="icon-wrap">
                <span style={{ fontSize: 18 }}>
                  {roleGroup === 'teacher' ? '👩‍🏫' : roleGroup === 'educador' ? '🧑‍🤝‍🧑' : roleGroup === 'vetllador' ? '👁️' : '🏛️'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {roleGroup === 'teacher' ? 'Docent' : roleGroup === 'educador' ? 'Educador/a' : roleGroup === 'vetllador' ? 'Vetllador/a' : 'Equip Directiu'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>Selecciona el teu nom</span>
                </div>
              </div>
              <button className="n-back" onClick={() => setStep('role')}>← Torna</button>
            </div>

            <div className="name-search-wrap">
              <span className="name-search-icon">🔍</span>
              <input
                type="text"
                className="name-search-input"
                placeholder="Cerca el teu nom..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="name-list">
              {loading ? (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} />
                </div>
              ) : filtered.map(u => {
                const color = roleGroup === 'teacher'
                  ? AVATAR_COLORS[Math.abs(u.nom.length) % AVATAR_COLORS.length]
                  : mangementColor(u.rol);
                const sub = u.grup_principal || u.rol;
                return (
                  <div
                    key={u.id}
                    className={`name-item${selected?.id === u.id ? ' selected' : ''}`}
                    onClick={() => selectUser(u)}
                  >
                    <div className="n-avatar" style={{ background: color }}>{initials(u.nom)}</div>
                    <div className="n-info"><p>{u.nom}</p><span>{sub}</span></div>
                  </div>
                );
              })}
            </div>

            <div className="pin-section">
              <label>CODI PERSONAL (4 DÍGITS)</label>
              <input
                ref={pinRef}
                type="password"
                className="pin-field"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
              <button className="btn-accedir" onClick={doLogin}>Accedir →</button>
              <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-4)', marginTop: 10 }}>
                Codi de prova: 1234
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentModal({ onAccept }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 9999, padding: '0 0 env(safe-area-inset-bottom)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 540,
        padding: '24px 24px 32px', boxShadow: '0 -4px 32px rgba(0,0,0,.15)',
        animation: 'fadeUp .25s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 24 }}>🔐</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Consentiment de tractament de dades</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Protecció de Dades — RGPD</div>
          </div>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
          En accedir a aquesta aplicació, el centre educatiu tractarà les dades personals següents amb finalitats organitzatives internes:
        </p>
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 14 }}>
          <li><strong>Nom i cognoms</strong> del docent</li>
          <li><strong>Horari lectiu setmanal</strong> i franges de Treball Personal</li>
          <li><strong>Registre d'absències i cobertures</strong></li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 16 }}>
          Aquestes dades s'utilitzen exclusivament per a la <strong>gestió interna d'absències i cobertures</strong> del centre.
          No es cediran a tercers ni s'usaran amb cap altra finalitat.
          Podeu exercir els vostres drets d'accés, rectificació, supressió i portabilitat adreçant-vos a la direcció del centre,
          d'acord amb el <strong>Reglament (UE) 2016/679 (RGPD)</strong> i la <strong>Llei Orgànica 3/2018 (LOPDGDD)</strong>.
        </p>
        <div style={{ background: 'var(--blue-bg)', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--blue)' }}>
          Aquest avís apareix <strong>una sola vegada</strong> per dispositiu. Un cop acceptat, no tornarà a aparèixer.
        </div>

        <button
          onClick={onAccept}
          style={{
            width: '100%', padding: 16, background: '#000', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Accepto i continuo →
        </button>
      </div>
    </div>
  );
}
