export function ResumPage() {
  return (
    <>
      <div className="page-hdr"><h1>Resum del centre</h1><p>Vista de consulta</p></div>
      <div className="alert alert-green">👁️ Vista de <strong>només lectura.</strong></div>
      <div className="kpi-grid">
        <div className="kpi k-red"><div className="kpi-label">Absències</div><div className="kpi-value">—</div><div className="kpi-sub">avui</div></div>
        <div className="kpi k-green"><div className="kpi-label">Cobertura</div><div className="kpi-value">—</div><div className="kpi-sub">aquest mes</div></div>
        <div className="kpi k-amber"><div className="kpi-label">Deutes TP</div><div className="kpi-value">—</div><div className="kpi-sub">pendents</div></div>
        <div className="kpi k-ink"><div className="kpi-label">Presents</div><div className="kpi-value">—</div><div className="kpi-sub">avui</div></div>
      </div>
    </>
  );
}

export function InformesPage() {
  return (
    <>
      <div className="page-hdr"><h1>Informes</h1></div>
      <div className="card">
        <div className="card-head"><h3>Exportar</h3></div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📄 Absències per docent</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🕐 Historial TP</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📊 Estadístiques del curs</button>
        </div>
      </div>
    </>
  );
}

export function AdminPage() {
  return (
    <>
      <div className="page-hdr"><h1>Administració</h1></div>
      <div className="alert alert-amber">⚙️ Accés total al sistema.</div>
      <div className="card">
        <div className="card-head"><h3>Usuaris</h3></div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>👥 Gestionar docents</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📅 Configurar horaris TP</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>💾 Còpia de seguretat</button>
        </div>
      </div>
    </>
  );
}
