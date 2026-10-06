// POST /api/edge-tts — server-side proxy for Microsoft Edge TTS (Christopher / Emma).
// Why a proxy: browsers cannot spoof the handshake headers (Origin etc.) that
// speech.platform.bing.com now requires, so the direct browser WebSocket is
// rejected. This server-side hop sends the exact Edge-style headers and returns
// MP3 audio (base64) + word-boundary timings for synchronized highlighting.
//
// Uses the `ws` package (NOT the undici global WebSocket) because only `ws`
// allows custom handshake headers on the server side.
//
// Request JSON: { text, voice, rate (0..2), pitch (-50..50), volume (0..100) }
// Response JSON: { ok, audioBase64, wordTimings:[{word,offsetMs,durationMs}], voice }
// On failure: { ok:false, reason } — the client then falls back to device speech.

import WebSocket from 'ws';
import { createHash, randomUUID } from 'crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '1-143.0.3650.75';

/**
 * Microsoft now requires time-based DRM query params on the WS URL.
 * Sec-MS-GEC = UPPER(SHA256("<win-filetime-rounded-to-5min><trusted-client-token>"))
 * (mirrors edge-tts drm.py: generate_sec_ms_gec; params per communicate.py)
 */
function secMsGec() {
  const WIN_EPOCH = 11644473600;
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  const filetime = Math.round(ticks * 1e7);
  return createHash('sha256').update(`${filetime}${TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}

function edgeWsUrl() {
  const connectionId = randomUUID().replace(/-/g, '');
  return (
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${connectionId}` +
    `&Sec-MS-GEC=${secMsGec()}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
  );
}

// Handshake headers copied from the actively-maintained edge-tts project —
// speech.platform.bing.com rejects handshakes without the Edge extension Origin
// and the Sec-MS-GEC DRM token.
function wssHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Sec-CH-UA': '" Not;A Brand";v="99", "Microsoft Edge";v="143", "Chromium";v="143"',
    'Sec-CH-UA-Mobile': '?0',
    'Accept': '*/*',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
}

const ALLOW_VOICES = new Set([
  'en-US-ChristopherNeural',
  'en-US-GuyNeural',
  'en-US-EricNeural',
  'en-US-RogerNeural',
  'en-US-SteffanNeural',
  'en-US-EmmaNeural',
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-MichelleNeural',
  'en-US-AnaNeural',
]);
const MAX_CHARS = 1200;

const escXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildSsml(text, voice, rate, pitch) {
  const ratePct = Math.round((rate - 1) * 100);
  const rateStr = (ratePct >= 0 ? '+' : '') + ratePct + '%';
  const pitchHz = Math.round(pitch);
  const pitchStr = (pitchHz >= 0 ? '+' : '') + pitchHz + 'Hz';
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitchStr}'>${escXml(text)}</prosody></voice></speak>`
  );
}

function synthesize(text, voice, rate, pitch) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws = null;
    const done = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      try { if (ws) { ws.removeAllListeners(); ws.terminate(); } } catch { /* noop */ }
      if (err) reject(err);
      else resolve(result);
    };
    const fail = (msg) => done(new Error(msg));

    const audioChunks = [];
    const wordTimings = [];
    const overall = setTimeout(() => fail('edge-timeout'), 25000);

    const parseBoundary = (jsonText) => {
      try {
        const msg = JSON.parse(jsonText);
        const items = msg && Array.isArray(msg.Metadata) ? msg.Metadata : [];
        for (const it of items) {
          if (it && it.Type === 'WordBoundary' && it.Data) {
            const word = it.Data.text && it.Data.text.Text ? String(it.Data.text.Text) : '';
            if (!word) continue;
            wordTimings.push({
              word,
              offsetMs: Math.round((it.Data.Offset || 0) / 10000),
              durationMs: Math.round((it.Data.Duration || 0) / 10000),
            });
          }
        }
      } catch { /* ignore malformed metadata */ }
    };

    try {
      ws = new WebSocket(edgeWsUrl(), { headers: wssHeaders(), handshakeTimeout: 12000 });
    } catch (e) {
      return reject(new Error('edge-ws-init: ' + (e && e.message ? e.message : 'failed')));
    }

    ws.on('open', () => {
      const ts = new Date().toUTCString();
      const reqId = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      try {
        ws.send(
          'X-Timestamp:' + ts + '\r\n' +
          'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          })
        );
        ws.send(
          'X-RequestId:' + reqId + '\r\n' +
          'Content-Type:application/ssml+xml\r\n' +
          'X-Timestamp:' + ts + 'Z\r\n' +
          'Path:ssml\r\n\r\n' +
          buildSsml(text, voice, rate, pitch)
        );
      } catch (e) {
        fail('edge-send: ' + (e && e.message ? e.message : 'failed'));
      }
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Audio chunk: first 2 bytes (big-endian) = header length, then headers, then MP3.
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        const start = 2 + headerLen;
        if (start < buf.length) audioChunks.push(buf.subarray(start));
        return;
      }
      const str = data.toString('utf8');
      const headEnd = str.indexOf('\r\n\r\n');
      const head = headEnd >= 0 ? str.slice(0, headEnd) : str;
      if (/Path:audio\.metadata/i.test(head)) {
        const body = headEnd >= 0 ? str.slice(headEnd + 4) : '';
        const m = body.match(/\{[\s\S]*\}/);
        if (m) parseBoundary(m[0]);
      } else if (/Path:turn\.end/i.test(head)) {
        const audio = Buffer.concat(audioChunks);
        if (!audio.length) return fail('edge-no-audio');
        done(null, { audio, wordTimings });
      }
    });

    ws.on('error', (e) => fail('edge-ws-error' + (e && e.message ? ': ' + e.message : '')));
    ws.on('unexpected-response', (_req, res) => fail('edge-http-' + (res && res.statusCode)));
    ws.on('close', (code) => {
      if (!settled) {
        // Closed before turn.end — salvage any audio already received.
        const audio = Buffer.concat(audioChunks);
        if (audio.length) done(null, { audio, wordTimings });
        else fail('edge-closed-' + code);
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method-not-allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === 'object' ? body : {};
  const text = String(body.text || '').slice(0, MAX_CHARS).trim();
  const voice = ALLOW_VOICES.has(body.voice) ? body.voice : 'en-US-ChristopherNeural';
  const rate = Math.min(2, Math.max(0.5, Number(body.rate) || 1));
  const pitch = Math.min(50, Math.max(-50, Number(body.pitch) || 0));
  if (!text) return res.status(400).json({ ok: false, reason: 'empty-text' });

  try {
    const { audio, wordTimings } = await synthesize(text, voice, rate, pitch);
    return res.status(200).json({
      ok: true,
      audioBase64: audio.toString('base64'),
      wordTimings,
      voice,
      v: 3,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      reason: (e && e.message ? e.message : 'edge-failed').slice(0, 120),
      voice,
      v: 3,
    });
  }
}
