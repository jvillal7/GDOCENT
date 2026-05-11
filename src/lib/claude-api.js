import { WORKER_URL, WORKER_AUTH_TOKEN, SUPA_URL, SUPA_KEY } from './constants';

export const MODEL = 'claude-sonnet-4-6';

export async function callClaude(messages, maxTokens = 1000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': WORKER_AUTH_TOKEN },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
    });
    if (!res.ok) throw new Error('Error al Worker: ' + res.status);
    const data = await res.json();
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      const isOverloaded = msg.toLowerCase().includes('overload') || data.error.type === 'overloaded_error';
      if (isOverloaded && attempt < retries) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw new Error(isOverloaded ? 'La IA està sobrecarregada, torna-ho a intentar en uns minuts' : msg);
    }
    let raw = '';
    if (Array.isArray(data.content)) raw = data.content.map(b => b.text || '').join('');
    else if (typeof data.content === 'string') raw = data.content;
    else if (data.choices?.[0]?.message) raw = data.choices[0].message.content;
    else throw new Error('Format de resposta IA no reconegut');
    const clean = raw.replace(/```json|```/g, '').trim();
    const jsonStart = /\{(?:\s*"(?:proposta|franja|nom|docent|titol|horari)"\s*:)/.exec(clean);
    const start = jsonStart ? jsonStart.index : clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error("No s'ha trobat JSON a la resposta IA");
    return JSON.parse(clean.slice(start, end + 1));
  }
}

export async function callClaudeRaw(messages, maxTokens = 2000) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': WORKER_AUTH_TOKEN },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error('Error al Worker: ' + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (Array.isArray(data.content)) return data.content.map(b => b.text || '').join('');
  if (typeof data.content === 'string') return data.content;
  if (data.choices?.[0]?.message) return data.choices[0].message.content;
  throw new Error('Format de resposta IA no reconegut');
}

// Fire-and-forget — no bloqueja mai el flux principal
export async function logIA(entry) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/ia_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(entry),
    });
  } catch { /* silencioso */ }
}
