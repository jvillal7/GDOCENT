import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FRANJES_LABEL: Record<string, string> = {
  f1a: '9:00–9:30', f1b: '9:30–10:00', f2a: '10:00–10:30',
  patiA: '10:30–11:00', patiB: '11:00–11:30',
  f3a: '11:30–12:00', f3b: '12:00–12:30',
  f5a: '15:00–15:30', f5b: '15:30–16:00', f5c: '16:00–16:30',
};

function buildHtml(nom: string, dates: string[], franges: string[], motiu: string, escolaNom: string): string {
  const dies = dates.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }).join(', ');
  const frangesText = franges.map(f => FRANJES_LABEL[f] || f).join(', ') || 'Totes les franges';
  return `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a">🔔 Nova absència notificada</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:8px 0;color:#555;width:120px">Docent</td><td style="padding:8px 0;font-weight:600">${nom}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Centre</td><td style="padding:8px 0">${escolaNom}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Dies</td><td style="padding:8px 0">${dies}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Franges</td><td style="padding:8px 0">${frangesText}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Motiu</td><td style="padding:8px 0">${motiu || 'No especificat'}</td></tr>
      </table>
      <p style="margin-top:24px;color:#888;font-size:12px">Enviat per HORARIA · horariapro.com</p>
    </div>`;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const abs = payload.record ?? payload;

    const { escola_id, docent_nom, data, franges: frangesRaw, motiu } = abs;
    if (!escola_id || !docent_nom) return new Response('ok', { status: 200 });

    const supabase = createClient(SUPA_URL, SERVICE_KEY);

    // Obtenir caps d'estudis i nom de l'escola en paral·lel
    const [capsRes, escolaRes] = await Promise.all([
      supabase.from('docents').select('email').eq('escola_id', escola_id).eq('grup_principal', "Cap d'Estudis").eq('actiu', true),
      supabase.from('escoles').select('nom').eq('id', escola_id).single(),
    ]);

    const emails = (capsRes.data || []).map((d: any) => d.email).filter(Boolean);
    if (!emails.length) return new Response('no caps', { status: 200 });

    const escolaNom = escolaRes.data?.nom || '';
    const dates = [data].filter(Boolean);
    const franges: string[] = (() => { try { return JSON.parse(frangesRaw || '[]'); } catch { return []; } })();

    await resend.emails.send({
      from: 'HORARIA <horaria@horariapro.com>',
      to: emails,
      subject: `🔔 Nova absència — ${docent_nom}`,
      html: buildHtml(docent_nom, dates, franges, motiu || 'No especificat', escolaNom),
    });

    return new Response('sent', { status: 200 });
  } catch (e: any) {
    console.error('absence-notifier error:', e.message);
    return new Response(e.message, { status: 500 });
  }
});
