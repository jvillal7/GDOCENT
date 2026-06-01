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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const { to, subject, html, attachments } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Falten camps: to, subject, html' }), {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const emailPayload: any = {
      from: 'HORARIA <horaria@horariapro.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (attachments?.length) emailPayload.attachments = attachments;
    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ id: data?.id }), {
      status: 200,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
