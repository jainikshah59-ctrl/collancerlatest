/* Cleo voice AI — text to speech with transport fallback.
 * DOM-free module (browser APIs touched only inside functions at runtime).
 *
 * Voice output: Microsoft Edge TTS/read-aloud is the primary provider.
 * Curated voices: en-US-ChristopherNeural (default male),
 * en-US-EmmaNeural (female). Preference persisted as `cleo-voice-gender`
 * (see CleoPanel). Output is SSML-driven with configurable
 * rate/pitch/volume; word-boundary metadata is requested and mapped back
 * to character indexes.
 *
 * Fallback chain (exact transport strategy):
 *   1. Direct browser WebSocket to speech.platform.bing.com
 *   2. Same-origin HTTPS POST /api/edge-tts
 *      (accepts text/rate/pitch/volume/voice, caps text length, allowlists
 *      Christopher/Emma only, performs the Edge WebSocket handshake and
 *      synthesis, returns base64 MP3 + word timing data)
 *   3. Browser/device speech synthesis
 *
 * Client-side TTS caches by voice + text (+ prosody), prefetches upcoming
 * chunks while the current one plays, and can cancel active audio.
 *
 * Word-synchronized transcript pipeline:
 *   answer -> chunking -> TTS -> audio playback -> real currentTime ->
 *   nearest word-boundary lookup (binary search over ordered timing data)
 *   -> character index -> progressive transcript.
 * The final onDone callback commits the complete answer.
 *
 * speak(text, { voice, rate, pitch, volume, onProgress, onDone })
 *   - chunks text at ~1150 chars on sentence boundaries
 *   - word/character progress via onProgress({ chunkIndex, charIndex, word, text })
 *   - onDone({ cancelled, error }) when finished
 * stopSpeak() cancels safely.
 */

export const VOICES = {
  christopher: 'en-US-ChristopherNeural',
  guy: 'en-US-GuyNeural',
  eric: 'en-US-EricNeural',
  roger: 'en-US-RogerNeural',
  steffan: 'en-US-SteffanNeural',
  emma: 'en-US-EmmaNeural',
  aria: 'en-US-AriaNeural',
  jenny: 'en-US-JennyNeural',
  michelle: 'en-US-MichelleNeural',
  ana: 'en-US-AnaNeural',
};

/** Display metadata for the voice picker (10 voices: 5 male, 5 female). */
export const VOICE_META = [
  { key: 'christopher', name: 'Christopher', gender: 'Male' },
  { key: 'guy', name: 'Guy', gender: 'Male' },
  { key: 'eric', name: 'Eric', gender: 'Male' },
  { key: 'roger', name: 'Roger', gender: 'Male' },
  { key: 'steffan', name: 'Steffan', gender: 'Male' },
  { key: 'emma', name: 'Emma', gender: 'Female' },
  { key: 'aria', name: 'Aria', gender: 'Female' },
  { key: 'jenny', name: 'Jenny', gender: 'Female' },
  { key: 'michelle', name: 'Michelle', gender: 'Female' },
  { key: 'ana', name: 'Ana', gender: 'Female' },
];

/** True when the voice key maps to a female voice (device-voice fallback). */
export function isFemaleVoice(key) {
  const m = VOICE_META.find((v) => v.key === key);
  return m ? m.gender === 'Female' : key === 'emma';
}

const EDGE_WS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
  '?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const CHUNK_LIMIT = 800;
/** Must stay in sync with the server cap in api/edge-tts.js */
const PROXY_TEXT_CAP = 1200;

let _cancelToken = 0;
let _activeSocket = null;
let _activeAudio = null;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

const clampNum = (v, dflt, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/* ---------------- TTS cache (voice + prosody + text) ---------------- */

const _ttsCache = new Map();
const TTS_CACHE_LIMIT = 40;

function ttsCacheKey(voiceName, rate, pitch, text) {
  return `${voiceName}|${rate}|${pitch}|${text}`;
}

function ttsCacheGet(key) {
  const v = _ttsCache.get(key);
  if (v) { _ttsCache.delete(key); _ttsCache.set(key, v); } // LRU touch
  return v || null;
}

function ttsCacheSet(key, val) {
  if (_ttsCache.has(key)) _ttsCache.delete(key);
  _ttsCache.set(key, val);
  while (_ttsCache.size > TTS_CACHE_LIMIT) {
    _ttsCache.delete(_ttsCache.keys().next().value);
  }
}

/* ---------------- text prep ---------------- */

/** Strip markdown/links so speech sounds natural. */
function cleanForSpeech(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split text into ~1150-char chunks on sentence boundaries. */
function chunkText(text, limit = CHUNK_LIMIT) {
  const t = cleanForSpeech(text);
  if (t.length <= limit) return [t].filter(Boolean);
  const sentences = t.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) || [t];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((cur + ' ' + piece).trim().length > limit && cur) {
      chunks.push(cur.trim());
      cur = piece;
    } else {
      cur = (cur + ' ' + piece).trim();
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  // Hard-split any pathological oversized chunk.
  const out = [];
  for (const c of chunks) {
    if (c.length <= limit) out.push(c);
    else for (let i = 0; i < c.length; i += limit) out.push(c.slice(i, i + limit));
  }
  return out;
}

/* ---------------- SSML + Edge protocol ---------------- */

function ssml(text, voiceName, prosody = {}) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const rate = prosody.rate || 0;
  const pitch = prosody.pitch || 0;
  const volume = prosody.volume || 0;
  const r = (rate >= 0 ? '+' : '') + rate + '%';
  const p = (pitch >= 0 ? '+' : '') + pitch + 'Hz';
  const v = (volume >= 0 ? '+' : '') + volume + '%';
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voiceName}'><prosody rate='${r}' pitch='${p}' volume='${v}'>${esc}</prosody></voice></speak>`;
}

function wsSend(ws, text) {
  ws.send(text);
}

function edgeConfigMessage() {
  return (
    'X-Timestamp:' + new Date().toUTCString() + '\r\n' +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })
  );
}

function edgeSsmlMessage(requestId, voiceName, text, prosody) {
  return (
    'X-RequestId:' + requestId + '\r\n' +
    'Content-Type:application/ssml+xml\r\n' +
    'X-Timestamp:' + new Date().toUTCString() + 'Z\r\n' +
    'Path:ssml\r\n\r\n' + ssml(text, voiceName, prosody)
  );
}

function randomHex(n) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

/* ---------------- word-boundary -> charIndex ---------------- */

/**
 * Binary search over word-boundary timing data (sorted by offsetMs ascending):
 * returns the index of the last word whose start time <= elapsedMs, or -1.
 */
function nearestWordIndex(timings, elapsedMs) {
  let lo = 0, hi = timings.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((timings[mid].offsetMs || 0) <= elapsedMs) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/**
 * Map ordered word boundaries back to character indexes in the chunk text.
 * Sequential search keeps repeated words aligned in spoken order.
 */
function mapWordsToCharIndex(chunkText, words) {
  const lower = String(chunkText || '').toLowerCase();
  let cursor = 0;
  return (words || []).map((w) => {
    const needle = String(w.word || '').toLowerCase().trim();
    let idx = -1;
    if (needle) {
      idx = lower.indexOf(needle, cursor);
      if (idx === -1 && cursor > 0) idx = lower.indexOf(needle);
    }
    if (idx >= 0) cursor = idx + needle.length;
    return { word: w.word || '', offsetMs: w.offsetMs || 0, charIndex: idx >= 0 ? idx : cursor };
  });
}

/* ---------------- synced audio playback ---------------- */

/**
 * Play MP3 bytes with word-synced progress driven by the REAL audio clock:
 * currentTime -> binary search over ordered word-boundary timings ->
 * character index -> onProgress. Resolves when playback ends; rejects if
 * playback itself is blocked so the next transport is tried.
 */
function playAudioWithSync(bytes, timings, chunkIndex, chunkText, token, opts) {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return resolve();
    let url = null;
    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      if (url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
      fn(val);
    };
    try {
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      _activeAudio = audio;
      const ordered = [...(timings || [])].sort((a, b) => (a.offsetMs || 0) - (b.offsetMs || 0));
      let lastIdx = -1;
      opts.onProgress && opts.onProgress({ chunkIndex, charIndex: 0, word: '', text: chunkText });
      const timer = setInterval(() => {
        if (token !== _cancelToken) {
          clearInterval(timer);
          try { audio.pause(); } catch { /* ignore */ }
          if (_activeAudio === audio) _activeAudio = null;
          settle(resolve);
          return;
        }
        try {
          const elapsedMs = Math.max(0, (audio.currentTime || 0) * 1000);
          const idx = nearestWordIndex(ordered, elapsedMs);
          if (idx > lastIdx) {
            lastIdx = idx;
            const t = ordered[idx];
            opts.onProgress && opts.onProgress({
              chunkIndex, charIndex: t.charIndex || 0, word: t.word || '', text: chunkText,
            });
          }
        } catch { /* ignore */ }
      }, 90);
      const finish = () => {
        clearInterval(timer);
        if (_activeAudio === audio) _activeAudio = null;
        settle(resolve);
      };
      audio.onended = finish;
      // A mid-playback error just ends this chunk; a blocked play() rejects
      // so the fallback chain continues instead of fake-silence.
      audio.onerror = finish;
      const pr = audio.play();
      if (pr && typeof pr.catch === 'function') {
        pr.catch((e) => {
          clearInterval(timer);
          if (_activeAudio === audio) _activeAudio = null;
          settle(reject, e instanceof Error ? e : new Error('audio-play-blocked'));
        });
      }
    } catch (e) {
      settle(resolve);
    }
  });
}

function concatAudioParts(parts) {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(new Uint8Array(p), off); off += p.byteLength; }
  return out.buffer;
}

/* ---- transport 1: direct Edge WebSocket ---- */

function speakViaEdge(chunks, voiceName, token, opts, prosody) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === 'undefined') return reject(new Error('no-websocket'));
    const ws = new WebSocket(EDGE_WS_URL);
    _activeSocket = ws;
    let chunkIdx = 0;
    let audioParts = [];
    let audioBytes = 0;
    let wordEvents = [];
    let finished = false;
    // Fail fast: browsers send their page Origin which Edge now rejects. If the
    // socket neither opens nor errors within 8s, give up so the proxy runs.
    const openTimer = setTimeout(() => {
      if (!finished) done(new Error('edge-ws-timeout'));
    }, 8000);
    const done = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(openTimer);
      try { ws.close(); } catch { /* ignore */ }
      if (_activeSocket === ws) _activeSocket = null;
      if (token !== _cancelToken) return resolve({ cancelled: true });
      err ? reject(err) : resolve({ cancelled: false });
    };

    function sendNext() {
      if (token !== _cancelToken) return done();
      if (chunkIdx >= chunks.length) return done();
      audioParts = [];
      audioBytes = 0;
      wordEvents = [];
      const requestId = randomHex(32);
      wsSend(ws, edgeSsmlMessage(requestId, voiceName, chunks[chunkIdx], prosody));
      opts.onProgress && opts.onProgress({
        chunkIndex: chunkIdx, charIndex: 0, word: '', text: chunks[chunkIdx],
      });
    }

    ws.onopen = () => {
      if (token !== _cancelToken) return done();
      wsSend(ws, edgeConfigMessage());
      sendNext();
    };
    ws.onerror = () => done(new Error('edge-ws-error'));

    ws.onmessage = async (ev) => {
      if (token !== _cancelToken) return done();
      const data = ev.data;
      if (typeof data === 'string') {
        if (data.includes('Path:audio.metadata')) {
          // Collect word boundaries; they are mapped to char indexes and
          // played back in sync once the audio for this chunk arrives.
          try {
            const meta = JSON.parse(data.slice(data.indexOf('{')));
            const items = meta?.Metadata || meta?.metadata || [];
            for (const it of items) {
              if (it?.Type === 'WordBoundary' && it?.Data) {
                const w = it.Data.text && typeof it.Data.text === 'object' ? it.Data.text.Text : it.Data.text;
                if (!w) continue;
                wordEvents.push({
                  word: String(w),
                  offsetMs: Math.round((it.Data.Offset || 0) / 10000),
                  durationMs: Math.round((it.Data.Duration || 0) / 10000),
                });
              }
            }
          } catch { /* ignore malformed metadata */ }
        } else if (data.includes('Path:turn.end')) {
          // No audio received for this chunk (e.g. revoked token / throttled):
          // fail loudly so the next transport is tried instead of silence.
          if (audioBytes === 0) return done(new Error('edge-no-audio'));
          try {
            const bytes = concatAudioParts(audioParts);
            const timings = mapWordsToCharIndex(
              chunks[chunkIdx],
              [...wordEvents].sort((a, b) => a.offsetMs - b.offsetMs),
            );
            ttsCacheSet(ttsCacheKey(voiceName, prosody.rate, prosody.pitch, chunks[chunkIdx]), { bytes, timings });
            await playAudioWithSync(bytes, timings, chunkIdx, chunks[chunkIdx], token, opts);
          } catch (e) {
            return done(e instanceof Error ? e : new Error('edge-playback-failed'));
          }
          chunkIdx++;
          sendNext();
        }
      } else if (data instanceof Blob || data instanceof ArrayBuffer) {
        // Binary audio message: headers then raw mp3 bytes after \r\n\r\n
        try {
          const buf = data instanceof Blob ? await data.arrayBuffer() : data;
          const bytes = new Uint8Array(buf);
          let headerEnd = -1;
          for (let i = 0; i + 3 < bytes.length; i++) {
            if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) { headerEnd = i + 4; break; }
          }
          if (headerEnd > 0 && headerEnd < bytes.length) {
            audioBytes += bytes.length - headerEnd;
            audioParts.push(bytes.slice(headerEnd).buffer);
          }
        } catch { /* ignore */ }
      }
    };
  });
}

/* ---- transport 2: /api/edge-tts proxy (with cache + prefetch) ---- */

const _prefetch = new Map(); // key -> Promise<{bytes, timings}>

/** Fetch one chunk's TTS (cache-first, deduped in-flight). */
function fetchChunkTTS(chunkText, voiceName, prosody) {
  const key = ttsCacheKey(voiceName, prosody.rate, prosody.pitch, chunkText);
  const hit = ttsCacheGet(key);
  if (hit) return Promise.resolve(hit);
  let p = _prefetch.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch('/api/edge-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: String(chunkText).slice(0, PROXY_TEXT_CAP),
          voice: voiceName,
          // proxy expects rate as a ratio (-0.5..1); pitch/volume as-is
          rate: prosody.rate / 100, pitch: prosody.pitch, volume: prosody.volume,
        }),
      });
      if (!res.ok) throw new Error('edge-proxy-error');
      const json = await res.json();
      // The proxy returns HTTP 200 with { ok:false } on failure — treat that
      // (and empty audio) as a failure so speechSynthesis is tried next,
      // instead of silently skipping the chunk with no sound.
      if (json.ok === false || !json.audioBase64) {
        throw new Error('edge-proxy-no-audio' + (json.reason ? `: ${json.reason}` : ''));
      }
      const bin = atob(json.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
      const raw = (Array.isArray(json.wordTimings) ? json.wordTimings : [])
        .map((t) => ({ word: t.word || '', offsetMs: t.offsetMs || 0 }))
        .sort((a, b) => a.offsetMs - b.offsetMs);
      const timings = mapWordsToCharIndex(chunkText, raw);
      const val = { bytes: bytes.buffer, timings };
      ttsCacheSet(key, val);
      return val;
    })();
    _prefetch.set(key, p);
    p.then(() => _prefetch.delete(key), () => _prefetch.delete(key));
  }
  return p;
}

async function speakViaProxy(chunks, voiceName, token, opts, prosody) {
  for (let i = 0; i < chunks.length; i++) {
    if (token !== _cancelToken) return { cancelled: true };
    // Prefetch the upcoming chunk while this one plays.
    if (i + 1 < chunks.length) {
      fetchChunkTTS(chunks[i + 1], voiceName, prosody).catch(() => {});
    }
    const { bytes, timings } = await fetchChunkTTS(chunks[i], voiceName, prosody);
    if (token !== _cancelToken) return { cancelled: true };
    await playAudioWithSync(bytes, timings, i, chunks[i], token, opts);
  }
  return { cancelled: token !== _cancelToken };
}

/* ---- transport 3: speechSynthesis ---- */

// Last resort only: pick the best on-device voice instead of the raw default.
// Prefers Microsoft natural voices matching the chosen gender, then any en-US voice.
function pickDeviceVoice(preferFemale) {
  try {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices ? synth.getVoices() : [];
    if (!voices || !voices.length) return null;
    const en = voices.filter((v) => /^en([-_]US)?/i.test(v.lang || ''));
    const pool = en.length ? en : voices;
    const byGender = (list, female) =>
      list.find((v) => {
        const n = (v.name || '').toLowerCase();
        if (female) return /female|zira|aria|jenny|emma|michelle|samantha|google uk english female/i.test(n);
        return /male|david|christopher|guy|daniel|google uk english male/i.test(n);
      });
    return (
      pool.find((v) => /microsoft/i.test(v.name || '') && (preferFemale ? /female|zira|aria|jenny|emma/i.test(v.name) : /male|david|christopher|guy/i.test(v.name))) ||
      byGender(pool, preferFemale) ||
      pool.find((v) => v.default) ||
      pool[0] ||
      null
    );
  } catch { return null; }
}

function speakViaBrowser(chunks, token, opts, preferFemale) {
  return new Promise((resolve) => {
    if (!isBrowser() || !('speechSynthesis' in window)) return resolve({ cancelled: token !== _cancelToken });
    const synth = window.speechSynthesis;
    try { synth.cancel(); } catch { /* ignore */ }
    // Chrome quirk: a suspended synthesiser silently drops utterances.
    try { if (typeof synth.resume === 'function') synth.resume(); } catch { /* ignore */ }
    const voice = pickDeviceVoice(preferFemale);
    let i = 0;
    const speakNext = () => {
      if (token !== _cancelToken || i >= chunks.length) {
        return resolve({ cancelled: token !== _cancelToken });
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      if (voice) u.voice = voice;
      u.rate = 1.05; u.pitch = 1;
      opts.onProgress && opts.onProgress({ chunkIndex: i, charIndex: 0, word: '', text: chunks[i] });
      u.onboundary = (ev) => {
        if (token !== _cancelToken) return;
        opts.onProgress && opts.onProgress({
          chunkIndex: i, charIndex: ev.charIndex || 0,
          word: (chunks[i] || '').slice(ev.charIndex, (ev.charIndex || 0) + 24).split(/\s/)[0] || '',
          text: chunks[i],
        });
      };
      u.onend = u.onerror = () => { i++; speakNext(); };
      try { synth.speak(u); } catch { i++; speakNext(); }
    };
    // Voices may load async; retry once after they arrive.
    if (!voice && typeof synth.onvoiceschanged !== 'undefined') {
      const retry = () => { try { synth.onvoiceschanged = null; } catch {} };
      try { synth.onvoiceschanged = retry; } catch {}
    }
    speakNext();
  });
}

/* ---------------- public API ---------------- */

/**
 * speak(text, { voice: 'christopher'|'emma', rate, pitch, volume,
 *                onProgress, onDone })
 * rate: -50..+50 (%), pitch: -50..+50 (Hz), volume: -50..+50 (%)
 */
export async function speak(text, options = {}) {
  stopSpeak();
  const token = ++_cancelToken;
  const clean = cleanForSpeech(text);
  if (!clean) { options.onDone && options.onDone({ cancelled: false }); return; }
  const chunks = chunkText(clean);
  const voiceName = VOICES[options.voice] || VOICES[options.voice === 'emma' ? 'emma' : 'christopher'] || VOICES.christopher;
  const prosody = {
    rate: clampNum(options.rate, 0, -50, 50),
    pitch: clampNum(options.pitch, 0, -50, 50),
    volume: clampNum(options.volume, 0, -50, 50),
  };
  const opts = { onProgress: options.onProgress };

  // Fast path: every chunk already cached -> play directly, no network.
  if (isBrowser()) {
    const cached = chunks.map((c) => ttsCacheGet(ttsCacheKey(voiceName, prosody.rate, prosody.pitch, c)));
    if (cached.every(Boolean)) {
      try {
        for (let i = 0; i < chunks.length; i++) {
          if (token !== _cancelToken) break;
          await playAudioWithSync(cached[i].bytes, cached[i].timings, i, chunks[i], token, opts);
        }
        options.onDone && options.onDone({ cancelled: token !== _cancelToken });
        return;
      } catch (e) { /* fall through to the transport chain */ }
    }
  }

  // Microsoft Edge Neural TTS is the product voice. The server proxy is
  // primary because Microsoft rejects browser-originated Edge WebSocket headers.
  // Browser speech synthesis is an emergency fallback only.
  const attempts = [
    () => speakViaProxy(chunks, voiceName, token, opts, prosody),
    () => speakViaEdge(chunks, voiceName, token, opts, prosody),
    () => speakViaBrowser(chunks, token, opts, isFemaleVoice(options.voice)),
  ];
  let lastError = null;
  for (const attempt of attempts) {
    if (token !== _cancelToken) break;
    try {
      const r = await attempt();
      if (r && r.cancelled) break;
      options.onDone && options.onDone({ cancelled: false });
      return;
    } catch (e) {
      lastError = e;
    }
  }
  options.onDone && options.onDone({ cancelled: token !== _cancelToken, error: lastError });
}

/** stopSpeak() — cancel safely: sockets, audio, synthesis. */
export function stopSpeak() {
  _cancelToken++;
  try { if (_activeSocket) _activeSocket.close(); } catch { /* ignore */ }
  _activeSocket = null;
  try { if (_activeAudio) { _activeAudio.pause(); _activeAudio = null; } } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}

/**
 * unlockAudio() — MUST be called from a real user gesture (mic tap) before
 * speaking. Mobile browsers block audio/speech until the page has audible
 * activation; priming here prevents silent "speaking" with no sound.
 */
export function unlockAudio() {
  if (!isBrowser()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const actx = new AC();
      if (actx.state === 'suspended') {
        try { actx.resume().catch(() => {}); } catch { /* ignore */ }
      }
      // Play one silent sample so the output path is hot.
      try {
        const buf = actx.createBuffer(1, 1, 22050);
        const src = actx.createBufferSource();
        src.buffer = buf;
        src.connect(actx.destination);
        src.start(0);
      } catch { /* ignore */ }
      setTimeout(() => { try { actx.close(); } catch { /* ignore */ } }, 30000);
    }
  } catch { /* ignore */ }
  try {
    if ('speechSynthesis' in window) {
      // Warm up the voice list (Chrome loads it lazily) and clear stale state.
      window.speechSynthesis.getVoices();
      window.speechSynthesis.cancel();
    }
  } catch { /* ignore */ }
}

/**
 * playVoiceChime() — a soft, pleasant "hello" chime played when the voice
 * assistant opens. Replaces the harsh default mic-on beep some devices make.
 * Synthesized with WebAudio (no files). Safe to call right after unlockAudio().
 */
export function playVoiceChime() {
  if (!isBrowser()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const play = () => {
      try {
        const t = ctx.currentTime + 0.02;
        // Gentle ascending major arpeggio: G4 -> C5 -> E5, very soft.
        const notes = [[392.0, 0], [523.25, 0.1], [659.25, 0.2]];
        notes.forEach(([freq, dt]) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(0.13, t + dt + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.7);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + dt);
          o.stop(t + dt + 0.75);
        });
        setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1400);
      } catch { /* ignore */ }
    };
    if (ctx.state === 'suspended') {
      try { ctx.resume().then(play).catch(play); } catch { play(); }
    } else {
      play();
    }
  } catch { /* ignore */ }
}

/**
 * playVoiceCloseChime() — a soft descending "goodbye" chime when the voice
 * assistant closes. Our own sound; the browser mic system is never involved.
 */
export function playVoiceCloseChime() {
  if (!isBrowser()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const play = () => {
      try {
        const t = ctx.currentTime + 0.02;
        // Gentle descending: E5 -> C5 -> G4, very soft.
        const notes = [[659.25, 0], [523.25, 0.1], [392.0, 0.2]];
        notes.forEach(([freq, dt]) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(0.11, t + dt + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.7);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + dt);
          o.stop(t + dt + 0.75);
        });
        setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1400);
      } catch { /* ignore */ }
    };
    if (ctx.state === 'suspended') {
      try { ctx.resume().then(play).catch(play); } catch { play(); }
    } else {
      play();
    }
  } catch { /* ignore */ }
}

/** Current speech state (best-effort). */
export function isSpeaking() {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) return true;
  } catch { /* ignore */ }
  return !!_activeSocket || !!_activeAudio;
}

/* ---------------- test hooks (DOM-free parts) ---------------- */
export const __test = {
  nearestWordIndex,
  mapWordsToCharIndex,
  chunkText,
  cleanForSpeech,
  ssml,
  ttsCacheKey,
};
