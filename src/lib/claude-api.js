import { WORKER_URL, WORKER_AUTH_TOKEN, SUPA_URL, SUPA_KEY } from './constants';

export const MODEL = 'claude-sonnet-4-6';

// Extreu i parseja el primer objecte JSON vàlid de la resposta del model.
// Problemes que resol:
//   1. Text/notes de Claude DESPRÉS del JSON amb {} → lastIndexOf('}') incorrecte
//   2. Comes finals (trailing commas) → "[1, 2,]" no és JSON vàlid
//   3. Comentaris JS (// i /* */) generats per Claude
function extractJSON(raw) {
  const clean = raw.replace(/```json\n?|```/g, '').trim();

  // Troba l'inici del JSON: prefereix l'objecte que comenci amb una clau coneguda
  const jsonStart = /\{(?:\s*"(?:proposta|franja|nom|docent|titol|horari|canvis|resum)"\s*:)/.exec(clean);
  const start = jsonStart ? jsonStart.index : clean.indexOf('{');
  if (start === -1) throw new Error("No s'ha trobat JSON a la resposta IA");

  // Comptador de claus balancejat per trobar el tancament correcte
  // (evita agafar un '}' d'algun text posterior al JSON)
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (esc)                 { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true;  continue; }
    if (c === '"')           { inStr = !inStr; continue; }
    if (!inStr) {
      if      (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) throw new Error("No s'ha trobat JSON a la resposta IA");

  // Sanititza: elimina comments JS i trailing commas que Claude de vegades genera
  const jsonStr = clean.slice(start, end + 1)
    .replace(/\/\/[^\n\r"]*/g, '')       // comments //
    .replace(/\/\*[\s\S]*?\*\//g, '')    // comments /* */
    .replace(/,(\s*[\]}])/g, '$1');      // trailing commas

  return JSON.parse(jsonStr);
}

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
    return extractJSON(raw);
  }
}

export async function callClaudeRaw(messages, maxTokens = 1500, onChunk = null, system = null) {
  const streaming = typeof onChunk === 'function';
  const payload = { model: MODEL, max_tokens: maxTokens, messages, stream: streaming };
  if (system) payload.system = system;
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': WORKER_AUTH_TOKEN },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Error al Worker: ' + res.status);

  if (streaming && res.headers.get('content-type')?.includes('event-stream')) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = '', buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            full += evt.delta.text;
            onChunk(full);
          }
          if (evt.type === 'error') throw new Error(evt.error?.message || 'Error streaming IA');
        } catch (e) { if (e.message.startsWith('Error streaming')) throw e; }
      }
    }
    return full;
  }

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

// Registra una conversa de xat (fire-and-forget)
export async function logChat(entry) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/chat_logs`, {
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
