/* POST /api/llm-pool — free keyless LLM pool, server lane.
 *
 * The Kilo Code gateway (https://api.kilo.ai/api/gateway, model `kilo-auto/free`,
 * ~200 req/hour/IP, auto-rotates free models, no key/signup) sends no CORS
 * headers, so browsers can't call it directly — this function calls it
 * server-side where CORS doesn't apply. 8s budget (Vercel hobby cap).
 *
 * Input:  { system, user }
 * Output: { provider: 'kilo' | 'none', text }
 * Always HTTP 200, never throws. Empty text = lane failed; the client falls
 * back to Pollinations-direct, then to the deterministic Collancer brain.
 */

const KILO_URL = 'https://api.kilo.ai/api/gateway/chat/completions';
const KILO_MODEL = 'kilo-auto/free';
const KILO_TIMEOUT_MS = 8000;

function clean(s) {
  let t = String(s || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/[*_~`#>|]/g, '');
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length > 1200) t = t.slice(0, 1200).replace(/\s\S*$/, '').trim() + '…';
  return t;
}

function extractContent(json) {
  const m = json && json.choices && json.choices[0] && json.choices[0].message;
  if (!m) return '';
  let t = typeof m.content === 'string' ? m.content : '';
  if (!t && typeof m.reasoning === 'string') t = m.reasoning;
  if (!t && Array.isArray(m.reasoning_details)) {
    t = m.reasoning_details.map((d) => (d && d.text) || '').join(' ');
  }
  return clean(t);
}

export default async function handler(req, res) {
  const done = (provider, text) => res.status(200).json({ provider, text: String(text || '') });
  try {
    if (req.method !== 'POST') return done('none', '');
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body && typeof body === 'object' ? body : {};
    const system = String(body.system || '').slice(0, 4000);
    const user = String(body.user || '').slice(0, 2000);
    if (!user) return done('none', '');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), KILO_TIMEOUT_MS);
    try {
      const r = await fetch(KILO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: KILO_MODEL,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: user },
          ],
          max_tokens: 700,
          temperature: 0.6,
        }),
        signal: ctrl.signal,
      });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        const t = extractContent(j);
        if (t) return done('kilo', t);
      }
    } catch { /* lane failed */ } finally {
      clearTimeout(timer);
    }
    return done('none', '');
  } catch {
    return done('none', '');
  }
}
