import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET   = Deno.env.get('SUPABASE_JWT_SECRET')!;
const SA_PIN       = Deno.env.get('SA_PIN') || '';

const ALLOWED_ORIGINS = ['https://app.horariapro.com', 'http://localhost:5173', 'http://localhost:8080'];
const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minuts
const JWT_TTL   = 8 * 3600;       // 8 hores

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Signatura HMAC-SHA256 per generar JWT compatible amb Supabase
async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const header  = encode({ alg: 'HS256', typ: 'JWT' });
  const body    = encode(payload);
  const sigData = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigData));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${sigData}.${sigB64}`;
}

// Rate limiting: compta els intents fallits dels últims WINDOW_MS
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  userKey: string,
): Promise<{ blocked: boolean; fails: number }> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('login_attempts')
    .select('success')
    .eq('ip', ip)
    .eq('user_key', userKey)
    .gte('attempted_at', since);

  const fails = (data || []).filter((r: { success: boolean }) => !r.success).length;
  return { blocked: fails >= MAX_FAILS, fails };
}

async function recordAttempt(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  userKey: string,
  success: boolean,
) {
  await supabase.from('login_attempts').insert({ ip, user_key: userKey, success });
  // Neteja periòdica (1 de cada 20 peticions)
  if (Math.random() < 0.05) {
    await supabase.rpc('cleanup_login_attempts').maybeSingle();
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const ip      = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
  const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { escola_id?: string; user_id?: string; pin?: string; grup?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invàlid' }), {
      status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const { escola_id, user_id, pin, grup } = body;

  if (!pin || !grup) {
    return new Response(JSON.stringify({ error: 'Falten camps obligatoris' }), {
      status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // ── Cerca per email (pre-login) ───────────────────────────────────────────
  if (grup === 'check_email') {
    const email = (body as any).email?.toLowerCase?.() ?? '';
    if (!email) {
      return new Response(JSON.stringify({ type: 'notfound' }), {
        status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    const ADMIN_EMAIL = 'horaria.admin@gmail.com';
    if (email === ADMIN_EMAIL) {
      return new Response(JSON.stringify({ type: 'superadmin' }), {
        status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    const { data: escoles } = await supabase
      .from('escoles')
      .select('id, nom, emails_notificacions, email_notificacions');
    const found = (escoles || []).find((e: any) => {
      const arr = Array.isArray(e.emails_notificacions) ? e.emails_notificacions : [];
      const single = (e.email_notificacions || '').toLowerCase();
      return arr.some((x: string) => x?.toLowerCase() === email) || single === email;
    });
    return new Response(JSON.stringify(found ? { type: 'school', escola: { id: found.id, nom: found.nom } } : { type: 'notfound' }), {
      status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // ── Superadmin: ruta independent (sense escola_id ni user_id) ─────────────
  if (grup === 'superadmin') {
    if (!SA_PIN) {
      return new Response(JSON.stringify({ error: 'Superadmin no configurat' }), {
        status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    const saKey = 'superadmin';
    const { blocked } = await checkRateLimit(supabase, ip, saKey);
    if (blocked) {
      return new Response(JSON.stringify({ error: 'Massa intents. Espera 5 minuts.' }), {
        status: 429, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    if (pin !== SA_PIN) {
      await recordAttempt(supabase, ip, saKey, false);
      return new Response(JSON.stringify({ error: 'PIN incorrecte' }), {
        status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    await recordAttempt(supabase, ip, saKey, true);
    const now = Math.floor(Date.now() / 1000);
    const jwt = await signJwt({
      aud: 'authenticated', iss: `${SUPA_URL}/auth/v1`,
      sub: 'superadmin', exp: now + JWT_TTL, iat: now,
      role: 'authenticated', email: '',
      user_metadata: { rol: 'superadmin', user_id: 'superadmin' },
      app_metadata: { provider: 'superadmin_pin' },
    }, JWT_SECRET);
    return new Response(JSON.stringify({ jwt, perfil: { id: 'superadmin', nom: 'SuperAdmin', rol: 'superadmin' } }), {
      status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  if (!escola_id || !user_id) {
    return new Response(JSON.stringify({ error: 'Falten escola_id o user_id' }), {
      status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Validació bàsica per evitar injeccions (PINs numèrics per a docents/directius)
  if (typeof pin !== 'string' || pin.length > 8 || !/^\d+$/.test(pin)) {
    return new Response(JSON.stringify({ error: 'PIN invàlid' }), {
      status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const userKey = `${escola_id}:${user_id}`;

  // Rate limiting
  const { blocked } = await checkRateLimit(supabase, ip, userKey);
  if (blocked) {
    return new Response(JSON.stringify({ error: 'Massa intents. Espera 5 minuts.' }), {
      status: 429, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Buscar l'usuari a la taula corresponent
  let user: Record<string, unknown> | null = null;
  let userRol = '';

  if (grup === 'directiu') {
    const { data } = await supabase
      .from('directius')
      .select('id, nom, rol, grup_principal, pin, escola_id')
      .eq('escola_id', escola_id)
      .eq('id', user_id)
      .eq('actiu', true)
      .single();
    user = data;
    userRol = data?.rol ?? '';
  } else {
    // teacher, pae, vetllador — tots a docents
    const { data } = await supabase
      .from('docents')
      .select('id, nom, rol, grup_principal, pin, escola_id')
      .eq('escola_id', escola_id)
      .eq('id', user_id)
      .eq('actiu', true)
      .single();
    user = data;
    userRol = grup === 'pae' ? (data?.rol ?? 'educador') : (grup === 'vetllador' ? 'vetllador' : 'teacher');
  }

  if (!user) {
    await recordAttempt(supabase, ip, userKey, false);
    return new Response(JSON.stringify({ error: 'Usuari no trobat' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Validar PIN
  const storedPin = String(user.pin ?? '');
  if (storedPin !== pin) {
    await recordAttempt(supabase, ip, userKey, false);
    return new Response(JSON.stringify({ error: 'PIN incorrecte' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  await recordAttempt(supabase, ip, userKey, true);

  // Crear JWT amb claims per a RLS
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      aud:  'authenticated',
      iss:  `${SUPA_URL}/auth/v1`,
      sub:  String(user.id),
      exp:  now + JWT_TTL,
      iat:  now,
      role: 'authenticated',
      email: '',
      user_metadata: {
        escola_id: escola_id,
        rol:       userRol,
        user_id:   String(user.id),
        nom:       user.nom,
      },
      app_metadata: { provider: 'pin' },
    },
    JWT_SECRET,
  );

  const perfil = {
    id:            String(user.id),
    escola_id:     escola_id,
    nom:           user.nom,
    rol:           userRol,
    grup_principal: user.grup_principal ?? '',
  };

  return new Response(JSON.stringify({ jwt, perfil }), {
    status: 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
});
