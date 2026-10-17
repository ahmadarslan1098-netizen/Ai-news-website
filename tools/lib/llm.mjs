/* Provider-agnostic chat call. Uses the global fetch only. Returns the raw text
   of the model's reply; parsing/validation happens in generate.mjs. */

function stripFences(s) {
  return String(s).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

/* Pull the first balanced JSON object out of a reply that may carry prose. */
export function extractJson(text) {
  const s = stripFences(text);
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  if (start === -1) throw new Error('No JSON object in model reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(s.slice(start, i + 1)); }
  }
  throw new Error('Unbalanced JSON in model reply');
}

async function post(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(cfg, { system, user, timeoutMs = 120000 }) {
  if (!cfg.key && cfg.provider !== 'openai-compatible') throw new Error('No AI_API_KEY set');
  if (!cfg.model) throw new Error('No AI_MODEL set');

  if (cfg.provider === 'anthropic') {
    const data = await post(`${cfg.base}/messages`, {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01'
    }, {
      model: cfg.model,
      max_tokens: 4096,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: user }]
    }, timeoutMs);
    return data?.content?.[0]?.text || '';
  }

  if (cfg.provider === 'google') {
    const data = await post(`${cfg.base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
      'content-type': 'application/json'
    }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
    }, timeoutMs);
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  }

  /* openai + openai-compatible */
  const headers = { 'content-type': 'application/json' };
  if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
  const data = await post(`${cfg.base}/chat/completions`, headers, {
    model: cfg.model,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  }, timeoutMs);
  return data?.choices?.[0]?.message?.content || '';
}
