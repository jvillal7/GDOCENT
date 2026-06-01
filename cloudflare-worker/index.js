// Cloudflare Worker — proxy per a l'API de Claude
// Autenticació: valida el JWT de Supabase (no cal token separat al bundle)
// SUPABASE_JWT_SECRET: afegir com a secret a Cloudflare Dashboard

const ALLOWED_ORIGINS = [
  'https://app.horariapro.com',
  'http://localhost:5173',
  'http://localhost:8080',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
    ? origin : '';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Valida JWT HS256 contra el secret de Supabase
async function verifySupabaseJwt(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [headerB64, payloadB64, sigB64] = parts;
  const sigData = `${headerB64}.${payloadB64}`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(sigData));
    if (!valid) return false;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    if (payload.role !== 'authenticated') return false;

    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const originAllowed = ALLOWED_ORIGINS.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:');
    if (!originAllowed) {
      return new Response('Forbidden', { status: 403 });
    }

    // Validar JWT de Supabase
    const auth  = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const valid = await verifySupabaseJwt(token, (env.SUPABASE_JWT_SECRET || '').trim());
    if (!valid) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const hasPdf = JSON.stringify(body).includes('"application/pdf"');
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        ...(hasPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok && !body.stream) {
      const err = await upstream.text();
      return new Response(err, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (body.stream) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...corsHeaders(origin) },
      });
    }

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
