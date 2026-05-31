/**
 * SuperAdmin Dashboard — accés exclusiu per a Jorge Villalba
 * URL: /?superadmin=1
 * PIN: definit a SUPER_PIN
 *
 * Consulta directa a Supabase (sense filtre escola_id).
 * NO utilitza AppContext.
 */
import { useState, useEffect, useCallback } from 'react';
import { SUPA_URL, SUPA_KEY } from '../../lib/constants';

// ── Configuració ──────────────────────────────────────────────────────────────
const AUTH_KEY = 'gdocent_sa_v1';
const PRICE_PER_SCHOOL  = 79;       // €/mes per escola
// Estimació cost Claude Sonnet 4.6 per crida
const COST_PER_PROPOSAL = 0.020;    // ~4000 tok input + 500 tok output ≈ €0.020
const COST_PER_CHAT_MSG = 0.015;    // ~2000 tok input + 500 tok output ≈ €0.015

// ── Supabase helper (usa JWT de superadmin per bypass RLS) ───────────────────
function getSaJwt() {
  try { return sessionStorage.getItem('gd_sa_jwt') || null; } catch { return null; }
}

async function supa(path) {
  const jwt = getSaJwt();
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPA_KEY,
      Authorization: `Bearer ${jwt || SUPA_KEY}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.status);
    throw new Error(`[supa] ${res.status} — ${path}: ${txt}`);
  }
  return res.json();
}

// ── Utilitats ─────────────────────────────────────────────────────────────────
function isoAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
}

function fmt(n) {
  if (n == null) return '—';
  return n.toLocaleString('ca-ES');
}

function fmtEur(n) {
  if (n == null) return '—';
  return n.toLocaleString('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
}

function relDate(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return 'fa < 1h';
  if (h < 24) return `fa ${h}h`;
  const d = Math.floor(h / 24);
  return `fa ${d}d`;
}

// ── Colours per escola ────────────────────────────────────────────────────────
const SCHOOL_COLORS = ['#4285F4','#34A853','#FBBC05','#EA4335','#A142F4','#24C1E0'];
function schoolColor(idx) { return SCHOOL_COLORS[idx % SCHOOL_COLORS.length]; }

// ═══════════════════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════════════════

function KPICard({ label, value, sub, color = '#4285F4', icon }) {
  return (
    <div style={{
      background: 'var(--surface,#fff)', borderRadius: 14,
      padding: '18px 20px', border: '1px solid var(--border,#e5e7eb)',
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3,#6b7280)',
          textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3,#6b7280)' }}>{sub}</div>}
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', flexShrink: 0,
      boxShadow: `0 0 0 3px ${ok ? '#dcfce7' : '#fee2e2'}`,
    }} />
  );
}

function ErrorPill({ n }) {
  if (!n) return <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ 0 errors</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 10, background: '#fee2e2', color: '#dc2626',
    }}>⚠ {n} {n === 1 ? 'error' : 'errors'}</span>
  );
}

// ── Detall escola ─────────────────────────────────────────────────────────────
function SchoolDetail({ escola, stats, onClose }) {
  const { docents, absencies, cobertures, deutesTP, chatLogs, iaLogs, errors, lastActivity } = stats;
  const c = escola._color;

  const recentAbs = (absencies || []).slice(0, 8);
  const recentChat = (chatLogs || []).slice(0, 10);
  const recentErrors = [...(chatLogs || []).filter(l => l.error_msg), ...(iaLogs || []).filter(l => l.error_msg)].slice(0, 10);

  const tipoLogs = (iaLogs || []).reduce((acc, l) => {
    const t = l.tipus || 'desconegut';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 560, height: '92vh',
        background: 'var(--surface,#fff)',
        borderRadius: '16px 0 0 0',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 40px rgba(0,0,0,.25)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)',
          background: c, color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{escola.nom}</div>
              <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
                {docents?.length ?? '?'} docents actius · codi: {escola.codi || escola.id?.slice(0,8)}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,.25)', border: 'none', borderRadius: '50%',
                width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 16 }}
            >✕</button>
          </div>
        </div>

        {/* Contingut scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPIs ràpids */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { l: 'Absències (30d)', v: fmt(absencies?.length) },
              { l: 'Cobertures (30d)', v: fmt(cobertures?.length) },
              { l: 'TP pendents', v: fmt(deutesTP?.length) },
              { l: 'Xat IA (30d)', v: fmt(chatLogs?.length) },
              { l: 'Propostes IA (30d)', v: fmt(iaLogs?.length) },
              { l: 'Errors IA', v: errors?.total || 0, color: errors?.total ? '#dc2626' : '#22c55e' },
            ].map((k, i) => (
              <div key={i} style={{
                background: 'var(--bg-2,#f9fafb)', borderRadius: 10, padding: '10px 12px',
                border: '1px solid var(--border,#e5e7eb)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3,#6b7280)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.color || c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Tipus de crides IA */}
          {Object.keys(tipoLogs).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2,#374151)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                🤖 Tipus de crides IA (30d)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(tipoLogs).map(([t, n]) => (
                  <span key={t} style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20,
                    background: 'var(--bg-2,#f9fafb)', border: '1px solid var(--border,#e5e7eb)',
                    color: 'var(--ink,#111)',
                  }}>{t} · <strong>{n}</strong></span>
                ))}
              </div>
            </div>
          )}

          {/* Errors recents */}
          {recentErrors.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                ⚠️ Errors recents
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentErrors.map((e, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: '#fef2f2', border: '1px solid #fca5a5',
                    fontSize: 12, color: '#7f1d1d',
                  }}>
                    <span style={{ fontWeight: 600 }}>{fmtDate(e.creat_el || e.ts)}</span>
                    {' — '}{e.error_msg}
                    {e.absent_nom ? <span style={{ opacity: .7 }}> · {e.absent_nom}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Darreres converses xat */}
          {recentChat.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2,#374151)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                💬 Darreres converses IA
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentChat.map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 10,
                    background: 'var(--bg-2,#f9fafb)', border: '1px solid var(--border,#e5e7eb)',
                  }}>
                    <span style={{ fontSize: 16 }}>{l.resultat === 'aprovada' ? '✅' : '💬'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink,#111)' }}>
                        {l.docent_absent || 'Consulta general'}
                        {l.data_absencia ? ` · ${l.data_absencia}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3,#6b7280)' }}>
                        {fmtDate(l.creat_el)} · {l.num_missatges} msg
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: l.resultat === 'aprovada' ? '#dcfce7' : '#f3f4f6',
                      color: l.resultat === 'aprovada' ? '#166534' : '#6b7280',
                    }}>{l.resultat || '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Darreres absències */}
          {recentAbs.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2,#374151)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                📋 Darreres absències
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentAbs.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 12px', borderRadius: 8,
                    background: 'var(--bg-2,#f9fafb)', border: '1px solid var(--border,#e5e7eb)',
                    fontSize: 12,
                  }}>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                      background: a.estat === 'resolt' ? '#dcfce7' : a.estat === 'arxivat' ? '#f3f4f6' : '#fef3c7',
                      color: a.estat === 'resolt' ? '#166534' : a.estat === 'arxivat' ? '#6b7280' : '#92400e',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{a.estat}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{a.docent_nom || '?'}</span>
                      {' · '}{a.data}{a.motiu ? ` · ${a.motiu.slice(0, 40)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Targeta escola ─────────────────────────────────────────────────────────────
function SchoolCard({ escola, stats, loading, period, onClick }) {
  const c = escola._color;
  const { docents, absencies, cobertures, deutesTP, chatLogs, iaLogs, errors, lastActivity, aiCost } = stats || {};

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface,#fff)', borderRadius: 16,
        border: `2px solid ${c}22`,
        boxShadow: '0 2px 12px rgba(0,0,0,.06)',
        overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow .2s, transform .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 24px ${c}33`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Cap */}
      <div style={{ background: c, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{escola.nom}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>
            {escola.codi || escola.id?.slice(0, 8)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!loading && <StatusDot ok={!errors?.total} />}
          <span style={{ fontSize: 12, color: '#fff', opacity: .8, fontWeight: 600 }}>
            {docents?.length ?? '?'} mestres
          </span>
        </div>
      </div>

      {/* Mètriques */}
      <div style={{ padding: '14px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-3,#9ca3af)', fontSize: 13 }}>
            Carregant dades…
          </div>
        ) : (
          <>
            {/* Fila 1: Activitat */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <MetricBox label="Absències" value={fmt(absencies?.length)} sub={`${period}d`} color={c} />
              <MetricBox label="Cobertures" value={fmt(cobertures?.length)} sub={`${period}d`} color={c} />
              <MetricBox label="Deutes TP" value={fmt(deutesTP?.length)} sub="pendents"
                color={deutesTP?.length > 5 ? '#f59e0b' : c} />
            </div>

            {/* Fila 2: IA */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <MetricBox label="Xat IA" value={fmt(chatLogs?.length)} sub={`${period}d`} color="#7c3aed" />
              <MetricBox label="Propostes IA" value={fmt(iaLogs?.length)} sub={`${period}d`} color="#7c3aed" />
              <MetricBox label="Cost IA est." value={aiCost ? fmtEur(aiCost) : '—'} sub={`${period}d`} color="#7c3aed" />
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 10, borderTop: '1px solid var(--border,#e5e7eb)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ErrorPill n={errors?.total} />
                {errors?.chat > 0 && <span style={{ fontSize: 10, color: 'var(--ink-3,#9ca3af)' }}>({errors.chat} xat, {errors.ia} IA)</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3,#9ca3af)' }}>
                {lastActivity ? `actiu ${relDate(lastActivity)}` : 'sense activitat'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-2,#f9fafb)', borderRadius: 8,
      padding: '8px 10px', textAlign: 'center',
      border: '1px solid var(--border,#e5e7eb)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--ink-3,#9ca3af)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 1 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--ink-4,#d1d5db)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ── Gràfic d'activitat per dies ───────────────────────────────────────────────
function ActivityChart({ absencies, cobertures, days = 14 }) {
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return d.toISOString().split('T')[0];
  });

  const absByDay = {};
  const cobByDay = {};
  (absencies || []).forEach(a => { absByDay[a.data] = (absByDay[a.data] || 0) + 1; });
  (cobertures || []).forEach(c => { cobByDay[c.data] = (cobByDay[c.data] || 0) + 1; });

  const maxVal = Math.max(1, ...dates.map(d => Math.max(absByDay[d] || 0, cobByDay[d] || 0)));

  return (
    <div style={{ background: 'var(--surface,#fff)', borderRadius: 14, padding: '16px 20px',
      border: '1px solid var(--border,#e5e7eb)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2,#374151)', marginBottom: 12,
        textTransform: 'uppercase', letterSpacing: '.05em' }}>
        📈 Activitat global — últims {days} dies
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 50 }}>
        {dates.map(d => {
          const abs = absByDay[d] || 0;
          const cob = cobByDay[d] || 0;
          const hAbs = Math.round((abs / maxVal) * 44);
          const hCob = Math.round((cob / maxVal) * 44);
          const isWeekend = [0, 6].includes(new Date(d + 'T12:00:00').getDay());
          return (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              title={`${d}: ${abs} absències, ${cob} cobertures`}>
              <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <div style={{ width: 5, height: hAbs || 2, background: isWeekend ? '#e5e7eb' : '#ef4444',
                  borderRadius: '2px 2px 0 0', opacity: isWeekend ? .3 : .8 }} />
                <div style={{ width: 5, height: hCob || 2, background: isWeekend ? '#e5e7eb' : '#3b82f6',
                  borderRadius: '2px 2px 0 0', opacity: isWeekend ? .3 : .8 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--ink-3,#9ca3af)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: 2, display: 'inline-block' }} />Absències
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} />Cobertures
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Visor de conversa completa (per a Logs Xat)
// ═══════════════════════════════════════════════════════════════════════════════
function ChatViewer({ log, schoolName, schoolColor: sc, onClose }) {
  const missatges = log.missatges || [];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 560, height: '94vh',
        background: '#fff', borderRadius: '16px 0 0 0',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 40px rgba(0,0,0,.25)', overflow: 'hidden',
      }}>
        {/* Cap */}
        <div style={{ background: sc || '#4285F4', padding: '14px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {log.docent_absent ? `Conversa — ${log.docent_absent}` : 'Consulta general'}
              </div>
              <div style={{ color: 'rgba(255,255,255,.8)', fontSize: 11, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{schoolName}</span>
                <span>{fmtDate(log.creat_el)}</span>
                {log.data_absencia && <span>Absència: {log.data_absencia}</span>}
                <span>{missatges.length} missatges</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%',
              width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: 15, flexShrink: 0,
            }}>✕</button>
          </div>
          {/* Badge resultat */}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700,
              background: log.resultat === 'aprovada' ? '#dcfce7' : '#f3f4f6',
              color: log.resultat === 'aprovada' ? '#166534' : '#6b7280',
            }}>{log.resultat === 'aprovada' ? '✅ Aprovada' : '💬 ' + (log.resultat || 'Pendent')}</span>
            {log.error_msg && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700,
                background: '#fee2e2', color: '#dc2626' }}>⚠ Error</span>
            )}
          </div>
        </div>

        {/* Missatges */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {missatges.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 13 }}>
              Sense missatges registrats
            </div>
          )}
          {missatges.map((m, i) => {
            const isUser = m.role === 'user';
            const cleanContent = (m.content || '').replace(/<proposta>[\s\S]*?<\/proposta>/gi, '').trim();
            if (!cleanContent) return null;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '9px 13px',
                  borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: isUser ? '#1e293b' : '#f1f5f9',
                  color: isUser ? '#fff' : '#1e293b',
                  fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {!isUser && <div style={{ fontSize: 10, fontWeight: 700, color: sc || '#4285F4',
                    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Horaria IA</div>}
                  {cleanContent}
                </div>
              </div>
            );
          })}

          {/* Proposta aprovada */}
          {log.proposta_aprovada?.length > 0 && (
            <div style={{ marginTop: 8, padding: '12px 14px', background: '#f0fdf4',
              border: '1px solid #86efac', borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '.05em' }}>✅ Proposta aprovada i aplicada</div>
              {log.proposta_aprovada.map((p, i) => (
                <div key={i} style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.7 }}>
                  <strong>{p.docent}</strong>
                  {p.hores ? ` · ${p.hores}` : ''}
                  {p.grup_origen ? ` · ${p.grup_origen}` : ''}
                  {p.tp_afectat ? <span style={{ color: '#f59e0b', fontWeight: 700 }}> ⚠TP</span> : ''}
                  {p.motiu ? <span style={{ color: '#6b7280', fontSize: 12 }}> — {p.motiu}</span> : ''}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {log.error_msg && (
            <div style={{ padding: '10px 14px', background: '#fef2f2',
              border: '1px solid #fca5a5', borderRadius: 10, fontSize: 12, color: '#dc2626' }}>
              ⚠ Error: {log.error_msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pestanya: Logs Xat (tots els xats de totes les escoles)
// ═══════════════════════════════════════════════════════════════════════════════
function LogsTab({ schools }) {
  const [logs,        setLogs]        = useState(null);   // null = no carregat
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [filtrEscola, setFiltrEscola] = useState('tots');
  const [filtrResult, setFiltrResult] = useState('tots');
  const [cerca,       setCerca]       = useState('');
  const [selected,    setSelected]    = useState(null);
  const [limit,       setLimit]       = useState(150);

  // Mapa escolaId → {nom, color}
  const schoolMap = Object.fromEntries(schools.map(e => [e.id, e]));

  async function loadLogs(lim = limit) {
    setLoading(true);
    setError(null);
    try {
      const data = await supa(
        `chat_logs?select=id,escola_id,creat_el,docent_absent,data_absencia,resultat,num_missatges,error_msg,proposta_aprovada,missatges&order=creat_el.desc&limit=${lim}`
      );
      setLogs(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLogs(); }, []);

  const filtered = (logs || []).filter(l => {
    if (filtrEscola !== 'tots' && l.escola_id !== filtrEscola) return false;
    if (filtrResult !== 'tots' && l.resultat !== filtrResult) return false;
    if (cerca && !(l.docent_absent || '').toLowerCase().includes(cerca.toLowerCase())) return false;
    return true;
  });

  // Comptadors per filtre
  const countByResult = { tots: (logs || []).length };
  (logs || []).forEach(l => { countByResult[l.resultat || 'altres'] = (countByResult[l.resultat || 'altres'] || 0) + 1; });
  const countByEscola = {};
  (logs || []).forEach(l => { countByEscola[l.escola_id] = (countByEscola[l.escola_id] || 0) + 1; });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 48px' }}>

      {/* Capçalera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: 0 }}>💬 Historial de converses IA</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {logs === null ? 'Carregant…' : `${(logs).length} converses totals · ${filtered.length} visibles`}
          </p>
        </div>
        <button
          onClick={() => loadLogs(limit)}
          disabled={loading}
          style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >{loading ? '⟳ Carregant…' : '⟳ Actualitzar'}</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2',
          border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
          Error: {error}
        </div>
      )}

      {/* Filtres escola */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFiltrEscola('tots')}
          style={filterBtnStyle(filtrEscola === 'tots', '#1e293b')}
        >Totes ({(logs || []).length})</button>
        {schools.map(e => (
          <button key={e.id}
            onClick={() => setFiltrEscola(filtrEscola === e.id ? 'tots' : e.id)}
            style={filterBtnStyle(filtrEscola === e.id, e._color)}
          >
            {e.nom.replace('CEIP ', '').replace('CEE ', '').replace(' - HorariaPro', '')}
            {' '}({countByEscola[e.id] || 0})
          </button>
        ))}
      </div>

      {/* Filtres resultat + cerca */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'tots',      label: 'Totes' },
          { key: 'aprovada',  label: '✅ Aprovades' },
          { key: 'abandonada',label: '💬 Abandonades' },
        ].map(f => (
          <button key={f.key}
            onClick={() => setFiltrResult(f.key)}
            style={filterBtnStyle(filtrResult === f.key, '#7c3aed', true)}
          >
            {f.label} ({f.key === 'tots' ? (logs || []).length : (countByResult[f.key] || 0)})
          </button>
        ))}
        <input
          type="text"
          placeholder="🔍 Cerca per docent absent..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 12px', borderRadius: 8,
            border: '1px solid #e5e7eb', fontSize: 13, background: '#fff',
            outline: 'none', minWidth: 200,
          }}
        />
      </div>

      {/* Llista de logs */}
      {loading && logs === null ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14 }}>Carregant converses…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14 }}>Cap conversa trobada</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(log => {
            const escola = schoolMap[log.escola_id];
            const sc = escola?._color || '#6b7280';
            return (
              <div
                key={log.id}
                onClick={() => setSelected(log)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 12,
                  background: '#fff', border: '1px solid #e5e7eb',
                  cursor: 'pointer', transition: 'box-shadow .15s, transform .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 12px ${sc}33`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
              >
                {/* Icona resultat */}
                <span style={{ fontSize: 20, flexShrink: 0 }}>
                  {log.resultat === 'aprovada' ? '✅' : log.error_msg ? '⚠️' : '💬'}
                </span>

                {/* Info principal */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                      {log.docent_absent || 'Consulta general'}
                    </span>
                    {log.data_absencia && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(log.data_absencia + 'T12:00:00').toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                    {/* Badge escola */}
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      background: sc + '22', color: sc, border: `1px solid ${sc}44`,
                    }}>
                      {escola?.codi?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {fmtDate(log.creat_el)} · {log.num_missatges || 0} missatges
                    {log.error_msg && <span style={{ color: '#ef4444', fontWeight: 600 }}> · ⚠ error</span>}
                  </div>
                </div>

                {/* Badge resultat */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700, flexShrink: 0,
                  background: log.resultat === 'aprovada' ? '#dcfce7' : '#f3f4f6',
                  color: log.resultat === 'aprovada' ? '#166534' : '#6b7280',
                }}>{log.resultat || '—'}</span>
              </div>
            );
          })}

          {/* Botó carregar més */}
          {(logs || []).length >= limit && (
            <button
              onClick={() => { const newLim = limit + 150; setLimit(newLim); loadLogs(newLim); }}
              style={{
                marginTop: 8, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: '#f1f5f9', border: '1px solid #e5e7eb', cursor: 'pointer', color: '#475569',
              }}
            >Carregar-ne més (+150)</button>
          )}
        </div>
      )}

      {/* Visor conversa */}
      {selected && (
        <ChatViewer
          log={selected}
          schoolName={schoolMap[selected.escola_id]?.nom || '?'}
          schoolColor={schoolMap[selected.escola_id]?._color}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function filterBtnStyle(active, color, small = false) {
  return {
    padding: small ? '5px 12px' : '6px 14px',
    borderRadius: 20, fontSize: small ? 12 : 12.5, fontWeight: 600,
    border: active ? `2px solid ${color}` : '2px solid #e5e7eb',
    background: active ? color + '18' : '#fff',
    color: active ? color : '#6b7280',
    cursor: 'pointer', transition: 'all .15s',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard principal
// ═══════════════════════════════════════════════════════════════════════════════
export default function SuperAdminDashboard() {
  const [pin,           setPin]           = useState('');
  const [auth,          setAuth]          = useState(() => sessionStorage.getItem(AUTH_KEY) === '1');
  const [pinError,      setPinError]      = useState(false);
  const [schools,       setSchools]       = useState([]);
  const [statsMap,      setStatsMap]      = useState({});   // escolaId → stats
  const [loadingMap,    setLoadingMap]    = useState({});   // escolaId → bool
  const [selected,      setSelected]      = useState(null); // escola seleccionada per detall
  const [period,        setPeriod]        = useState(30);   // dies
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError,   setGlobalError]   = useState(null);
  const [allAbsencies,  setAllAbsencies]  = useState([]);
  const [allCobertures, setAllCobertures] = useState([]);
  const [lastRefresh,   setLastRefresh]   = useState(null);
  const [tab,           setTab]           = useState('resum'); // 'resum' | 'logs'

  // ── Auth ────────────────────────────────────────────────────────────────────
  async function handlePinSubmit(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
        body: JSON.stringify({ grup: 'superadmin', pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(true);
        setPin('');
        return;
      }
      sessionStorage.setItem('gd_sa_jwt', data.jwt);
      sessionStorage.setItem(AUTH_KEY, '1');
      setAuth(true);
      setPinError(false);
    } catch {
      setPinError(true);
      setPin('');
    }
  }

  // ── Càrrega dades ──────────────────────────────────────────────────────────
  const loadSchoolStats = useCallback(async (escola, fromDate) => {
    const id = escola.id;
    setLoadingMap(m => ({ ...m, [id]: true }));
    try {
      const [docents, absencies, cobertures, deutesTP, chatLogs, iaLogs] = await Promise.all([
        supa(`docents?select=id,nom&actiu=eq.true&escola_id=eq.${id}&limit=200`),
        supa(`absencies?select=id,estat,docent_nom,data,motiu,creat_el&escola_id=eq.${id}&creat_el=gt.${fromDate}&order=creat_el.desc&limit=300`),
        supa(`cobertures?select=id,data&escola_id=eq.${id}&data=gt.${fromDate}&order=data.desc&limit=300`),
        supa(`deutes_tp?select=id&escola_id=eq.${id}&retornat=eq.false&limit=200`),
        supa(`chat_logs?select=id,resultat,error_msg,num_missatges,creat_el,docent_absent,data_absencia&escola_id=eq.${id}&creat_el=gt.${fromDate}&order=creat_el.desc&limit=200`),
        supa(`ia_logs?select=id,tipus,error_msg,duration_ms,ts,prompt_chars,absent_nom&escola_id=eq.${id}&ts=gt.${fromDate}&order=ts.desc&limit=200`),
      ]);

      const chatErrors = (chatLogs || []).filter(l => l.error_msg).length;
      const iaErrors   = (iaLogs   || []).filter(l => l.error_msg).length;

      // Última activitat (la data/hora més recent entre absències i cobertures)
      const lastAbs = absencies?.[0]?.creat_el;
      const lastCob = cobertures?.[0]?.data ? cobertures[0].data + 'T00:00:00Z' : null;
      const lastActivity = [lastAbs, lastCob].filter(Boolean).sort().pop() || null;

      // Cost IA estimat
      const aiCost = ((chatLogs || []).reduce((s, l) => s + (l.num_missatges || 0), 0) * COST_PER_CHAT_MSG)
                   + ((iaLogs   || []).length * COST_PER_PROPOSAL);

      setStatsMap(m => ({
        ...m,
        [id]: {
          docents, absencies, cobertures, deutesTP, chatLogs, iaLogs,
          errors: { chat: chatErrors, ia: iaErrors, total: chatErrors + iaErrors },
          lastActivity, aiCost,
        },
      }));
    } catch (e) {
      setStatsMap(m => ({ ...m, [id]: { error: e.message } }));
    } finally {
      setLoadingMap(m => ({ ...m, [id]: false }));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setGlobalLoading(true);
    setGlobalError(null);
    try {
      const esc = await supa('escoles?select=id,nom,codi&order=nom');
      const escWithColor = (esc || []).map((e, i) => ({ ...e, _color: schoolColor(i) }));
      setSchools(escWithColor);

      const fromDate = isoAgo(period);

      // Dades globals per al gràfic
      const [absAll, cobAll] = await Promise.all([
        supa(`absencies?select=data,escola_id&creat_el=gt.${isoAgo(14)}&limit=500`),
        supa(`cobertures?select=data,escola_id&data=gt.${isoAgo(14)}&limit=500`),
      ]);
      setAllAbsencies(absAll || []);
      setAllCobertures(cobAll || []);

      // Stats per escola en paral·lel
      await Promise.all(escWithColor.map(e => loadSchoolStats(e, fromDate)));
      setLastRefresh(new Date());
    } catch (e) {
      setGlobalError(e.message);
    } finally {
      setGlobalLoading(false);
    }
  }, [period, loadSchoolStats]);

  // Recàrrega quan canvia el període
  useEffect(() => {
    if (auth) loadAll();
  }, [auth, period]);

  // ── KPIs globals ──────────────────────────────────────────────────────────
  const totalTeachers   = schools.reduce((s, e) => s + (statsMap[e.id]?.docents?.length || 0), 0);
  const totalAbsencies  = schools.reduce((s, e) => s + (statsMap[e.id]?.absencies?.length || 0), 0);
  const totalCobertures = schools.reduce((s, e) => s + (statsMap[e.id]?.cobertures?.length || 0), 0);
  const totalChatLogs   = schools.reduce((s, e) => s + (statsMap[e.id]?.chatLogs?.length || 0), 0);
  const totalIaLogs     = schools.reduce((s, e) => s + (statsMap[e.id]?.iaLogs?.length || 0), 0);
  const totalErrors     = schools.reduce((s, e) => s + (statsMap[e.id]?.errors?.total || 0), 0);
  const totalAiCost     = schools.reduce((s, e) => s + (statsMap[e.id]?.aiCost || 0), 0);
  const monthlyRevenue  = schools.length * PRICE_PER_SCHOOL;

  // ── PIN screen ─────────────────────────────────────────────────────────────
  if (!auth) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      }}>
        <div style={{
          background: 'rgba(255,255,255,.05)', backdropFilter: 'blur(20px)',
          borderRadius: 24, padding: '40px 48px',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 25px 50px rgba(0,0,0,.4)',
          textAlign: 'center', width: 340,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>SuperAdmin</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 28 }}>
            HorariaPro · Panell de control
          </div>
          <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="password"
              placeholder="PIN d'accés"
              value={pin}
              onChange={e => { setPin(e.target.value); setPinError(false); }}
              autoFocus
              style={{
                padding: '12px 16px', borderRadius: 12, fontSize: 16, textAlign: 'center',
                border: pinError ? '2px solid #ef4444' : '2px solid rgba(255,255,255,.2)',
                background: 'rgba(255,255,255,.08)', color: '#fff',
                outline: 'none', letterSpacing: '.15em',
              }}
            />
            {pinError && (
              <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>PIN incorrecte</div>
            )}
            <button type="submit" style={{
              padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #4285F4, #7c3aed)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(66,133,244,.4)',
            }}>
              Accedir
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg,#f8fafc)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15,23,42,.97)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <div>
            <span style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>HorariaPro</span>
            <span style={{ color: 'rgba(255,255,255,.4)', margin: '0 8px' }}>/</span>
            <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>SuperAdmin Dashboard</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Pestanyes */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.08)', borderRadius: 8, padding: 2 }}>
            {[
              { id: 'resum', label: '📊 Resum' },
              { id: 'logs',  label: '💬 Logs Xat' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: tab === t.id ? '#4285F4' : 'transparent',
                color: tab === t.id ? '#fff' : 'rgba(255,255,255,.5)',
                transition: 'all .15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </div>

          {tab === 'resum' && (<>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
                {lastRefresh.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.08)', borderRadius: 8, padding: 2 }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setPeriod(d)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: period === d ? '#7c3aed' : 'transparent',
                  color: period === d ? '#fff' : 'rgba(255,255,255,.5)',
                  transition: 'all .15s',
                }}>{d}d</button>
              ))}
            </div>
            <button onClick={loadAll} disabled={globalLoading} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(66,133,244,.2)', border: '1px solid rgba(66,133,244,.4)',
              color: '#93c5fd', cursor: 'pointer',
            }}>{globalLoading ? '⟳ Carregant…' : '⟳ Actualitzar'}</button>
          </>)}
          <button
            onClick={() => { sessionStorage.removeItem(AUTH_KEY); window.location.href = '/'; }}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: '1px solid rgba(255,255,255,.15)',
              color: 'rgba(255,255,255,.4)', cursor: 'pointer',
            }}
          >Sortir</button>
        </div>
      </div>

      {/* Pestanya Logs Xat */}
      {tab === 'logs' && <LogsTab schools={schools} />}

      {/* Pestanya Resum */}
      {tab === 'resum' && <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 48px' }}>

        {globalError && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#dc2626', fontSize: 13,
          }}>⚠️ Error carregant dades: {globalError}</div>
        )}

        {/* KPIs globals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          <KPICard icon="🏫" label="Escoles actives"  value={schools.length}      color="#4285F4"
            sub={`${fmtEur(monthlyRevenue)}/mes`} />
          <KPICard icon="👩‍🏫" label="Docents actius"   value={fmt(totalTeachers)}  color="#34A853"
            sub="total escoles" />
          <KPICard icon="📋" label={`Absències (${period}d)`} value={fmt(totalAbsencies)} color="#EA4335"
            sub="totes les escoles" />
          <KPICard icon="🔄" label={`Cobertures (${period}d)`} value={fmt(totalCobertures)} color="#FBBC05"
            sub="totes les escoles" />
          <KPICard icon="🤖" label={`Crides IA (${period}d)`}  value={fmt(totalChatLogs + totalIaLogs)}   color="#7c3aed"
            sub={`xat: ${totalChatLogs} · prop: ${totalIaLogs}`} />
          <KPICard icon="💰" label={`Cost IA est. (${period}d)`} value={fmtEur(totalAiCost)} color="#0ea5e9"
            sub={`marge: ${fmtEur(monthlyRevenue - totalAiCost * (30 / period))}/mes`} />
          {totalErrors > 0 && (
            <KPICard icon="⚠️" label="Errors IA"         value={totalErrors}         color="#ef4444"
              sub={`últims ${period}d`} />
          )}
        </div>

        {/* Gràfic activitat global */}
        <div style={{ marginBottom: 24 }}>
          <ActivityChart absencies={allAbsencies} cobertures={allCobertures} days={14} />
        </div>

        {/* Targetes per escola */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink,#111)', margin: 0 }}>
            Escoles / Clients
          </h2>
          <span style={{ fontSize: 12, color: 'var(--ink-3,#9ca3af)' }}>
            Clica una escola per veure el detall complet
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {schools.map(escola => (
            <SchoolCard
              key={escola.id}
              escola={escola}
              stats={statsMap[escola.id]}
              loading={loadingMap[escola.id] ?? true}
              period={period}
              onClick={() => setSelected(escola)}
            />
          ))}
          {schools.length === 0 && !globalLoading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0',
              color: 'var(--ink-3,#9ca3af)', fontSize: 14 }}>
              No s'han trobat escoles a la base de dades.
            </div>
          )}
        </div>

        {/* Taula resum costos */}
        {schools.length > 0 && Object.keys(statsMap).length > 0 && (
          <div style={{ marginTop: 32, background: 'var(--surface,#fff)', borderRadius: 16,
            border: '1px solid var(--border,#e5e7eb)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,#e5e7eb)',
              fontWeight: 700, fontSize: 14 }}>
              💰 Resum econòmic mensual
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-2,#f9fafb)' }}>
                  {['Escola', 'Subscripció', 'Cost IA est.', 'Marge est.', 'Crides IA', 'Errors'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--ink-3,#6b7280)', textTransform: 'uppercase',
                      letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schools.map((e, i) => {
                  const s = statsMap[e.id];
                  const calls = (s?.chatLogs?.length || 0) + (s?.iaLogs?.length || 0);
                  const costIA = s?.aiCost || 0;
                  const costIAMonth = costIA * (30 / period);
                  const marge = PRICE_PER_SCHOOL - costIAMonth;
                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid var(--border,#e5e7eb)',
                      cursor: 'pointer', transition: 'background .1s' }}
                      onClick={() => setSelected(e)}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-2,#f9fafb)'}
                      onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: e._color }}>{e.nom}</td>
                      <td style={{ padding: '10px 16px', color: '#22c55e', fontWeight: 600 }}>{fmtEur(PRICE_PER_SCHOOL)}</td>
                      <td style={{ padding: '10px 16px', color: costIAMonth > 10 ? '#f59e0b' : 'var(--ink,#111)' }}>
                        {fmtEur(costIAMonth)}
                        <span style={{ fontSize: 10, color: 'var(--ink-3,#9ca3af)', marginLeft: 4 }}>(extrap. 30d)</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 700,
                        color: marge > 70 ? '#22c55e' : marge > 50 ? '#f59e0b' : '#ef4444' }}>
                        {fmtEur(marge)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>{fmt(calls)}</td>
                      <td style={{ padding: '10px 16px' }}><ErrorPill n={s?.errors?.total || 0} /></td>
                    </tr>
                  );
                })}
                {/* Total */}
                <tr style={{ background: 'var(--bg-2,#f9fafb)', borderTop: '2px solid var(--border,#e5e7eb)',
                  fontWeight: 700 }}>
                  <td style={{ padding: '10px 16px', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ padding: '10px 16px', color: '#22c55e', fontWeight: 700 }}>{fmtEur(monthlyRevenue)}</td>
                  <td style={{ padding: '10px 16px' }}>{fmtEur(totalAiCost * (30 / period))}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 800, color: '#22c55e' }}>
                    {fmtEur(monthlyRevenue - totalAiCost * (30 / period))}
                  </td>
                  <td style={{ padding: '10px 16px' }}>{fmt(totalChatLogs + totalIaLogs)}</td>
                  <td style={{ padding: '10px 16px' }}><ErrorPill n={totalErrors} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: 'var(--ink-4,#9ca3af)' }}>
          HorariaPro SuperAdmin · Ús exclusiu Jorge Villalba (jvillal7@xtec.cat)
          {' · '}Cost IA estimat basat en Claude Sonnet 4.6 (€0.020/proposta, €0.015/missatge xat)
        </div>
      </div>}

      {/* Panell de detall */}
      {tab === 'resum' && selected && (
        <SchoolDetail
          escola={selected}
          stats={statsMap[selected.id] || {}}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
