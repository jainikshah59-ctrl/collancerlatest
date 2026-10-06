/* GET /api/cleo-search?q=...
 * Live web search for Cleo: scrapes Google + Bing HTML (no API key),
 * parses snippets, scores against query terms, dedupes, returns top 10.
 * Returns { ok, engine, answer, results, searchedAt, live }.
 * Errors -> HTTP 200 safe fallback (never throws).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const STOP = new Set(['what', 'how', 'does', 'the', 'and', 'for', 'with', 'about', 'your', 'you', 'can', 'are', 'this', 'that', 'from', 'have', 'has', 'will', 'when', 'where', 'who', 'why', 'which', 'there', 'their', 'been', 'into', 'than', 'then']);
const toks = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanUrl(u) {
  try {
    const url = new URL(u, 'https://www.google.com');
    // Unwrap Google/Bing redirect wrappers.
    if (url.hostname.includes('google.') && url.pathname === '/url') {
      const q = url.searchParams.get('q') || url.searchParams.get('url');
      if (q) return cleanUrl(q);
    }
    if (url.hostname.includes('bing.com') && url.pathname === '/ck/a') {
      const u2 = url.searchParams.get('u');
      if (u2) return 'https://' + u2.replace(/^https?:\/\//, '');
    }
    return url.toString();
  } catch { return null; }
}

function parseGoogle(html) {
  const out = [];
  const re = /<a[^>]+href="(\/url\?[^"]+|https?:\/\/[^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const url = cleanUrl(decodeEntities(m[1]));
    const title = decodeEntities(m[2]);
    if (!url || !title || /google\.com/.test(url)) continue;
    out.push({ url, title, snippet: '', engine: 'google' });
  }
  // Snippets: grab the first div text after each result link (best-effort).
  return out;
}

function parseBing(html) {
  const out = [];
  const re = /<li class="b_algo"[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const url = cleanUrl(m[1]);
    const title = decodeEntities(m[2]);
    const snippet = decodeEntities(m[3]);
    if (!url || !title) continue;
    out.push({ url, title, snippet, engine: 'bing' });
  }
  return out;
}

async function fetchHtml(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; } finally { clearTimeout(t); }
}

function scoreResult(r, terms) {
  const hay = toks(`${r.title} ${r.snippet} ${r.url}`);
  const set = new Set(hay);
  let hits = 0;
  for (const t of terms) if (set.has(t)) hits++;
  return hits / Math.max(1, terms.length);
}

export default async function handler(req, res) {
  const started = Date.now();
  const fail = (reason) => res.status(200).json({
    ok: false, engine: 'google+bing', answer: '', results: [],
    searchedAt: new Date().toISOString(), live: false, reason,
  });
  try {
    const q = String(req.query?.q || '').trim().slice(0, 200);
    if (!q) return fail('missing q');

    const [gHtml, bHtml] = await Promise.all([
      fetchHtml(`https://www.google.com/search?q=${encodeURIComponent(q)}&num=10&hl=en`),
      fetchHtml(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10`),
    ]);

    const terms = toks(q);
    const seen = new Set();
    const scored = [];
    for (const r of [...parseGoogle(gHtml), ...parseBing(bHtml)]) {
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (seen.has(host + r.title.slice(0, 40))) continue;
      seen.add(host + r.title.slice(0, 40));
      scored.push({ ...r, score: Math.round(scoreResult(r, terms) * 100) / 100 });
    }
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, 10);

    const answer = results.length
      ? `Top web result: ${results[0].title} — ${results[0].snippet || results[0].url}`.slice(0, 500)
      : 'No web results found for that query.';

    return res.status(200).json({
      ok: results.length > 0,
      engine: 'google+bing',
      answer,
      results,
      searchedAt: new Date().toISOString(),
      live: true,
      tookMs: Date.now() - started,
    });
  } catch {
    return fail('exception');
  }
}
