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

/* Upstream 5xx / rate limits are usually momentary. Retry with exponential
   backoff so a brief 503 does not lose the whole day's run. */
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(attempt, retryAfter) {
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 60000);
  return Math.min(2000 * 2 ** (attempt - 1), 30000) + Math.floor(Math.random() * 1000);
}

async function post(url, headers, body, timeoutMs) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let retryAfter = null;
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      const err = new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      if (!RETRY_STATUS.has(res.status)) throw err;
      lastErr = err;
      retryAfter = res.headers.get('retry-after');
    } catch (e) {
      if (e && e.status && !RETRY_STATUS.has(e.status)) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) {
      const wait = retryDelay(attempt, retryAfter);
      const why = String((lastErr && lastErr.message) || 'network error').split('\n')[0].slice(0, 140);
      console.warn(`  ! ${why} - retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function callOnce(cfg, model, system, user, timeoutMs) {
  if (cfg.provider === 'anthropic') {
    const data = await post(`${cfg.base}/messages`, {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01'
    }, {
      model,
      max_tokens: 4096,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: user }]
    }, timeoutMs);
    return data?.content?.[0]?.text || '';
  }

  if (cfg.provider === 'google') {
    const data = await post(`${cfg.base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
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
    model,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  }, timeoutMs);
  return data?.choices?.[0]?.message?.content || '';
}

export async function chat(cfg, { system, user, timeoutMs = 120000 }) {
  if (!cfg.key && cfg.provider !== 'openai-compatible') throw new Error('No AI_API_KEY set');
  if (!cfg.model) throw new Error('No AI_MODEL set');

  const models = [cfg.model, ...(cfg.fallbacks || []).filter((m) => m && m !== cfg.model)];
  let lastErr;
  for (let i = 0; i < models.length; i++) {
    try {
      return await callOnce(cfg, models[i], system, user, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (i < models.length - 1) {
        const why = String((e && e.message) || e).split('\n')[0].slice(0, 120);
        console.warn(`  ! ${models[i]} unavailable (${why}); falling back to ${models[i + 1]}`);
      }
    }
  }
  throw lastErr;
}
