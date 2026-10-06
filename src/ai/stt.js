/* Collancer voice — on-device STT engine (singleton).
 *
 * Owns the Whisper Web Worker (src/ai/stt-worker.js). The worker + model stay
 * alive across voice sessions so repeat opens are instant; only the mic +
 * VAD are torn down when the voice assistant closes.
 *
 *   preloadStt()            -> starts model download, resolves when ready
 *   sttStatus()             -> 'idle' | 'loading' | 'ready' | 'error'
 *   onSttStatus(fn)         -> subscribe to status changes (returns unsub)
 *   transcribePcm(float32)  -> Promise<string> (waits for readiness)
 */

let worker = null;
let seq = 0;
const pending = new Map();
const statusListeners = new Set();
let status = 'idle';
let loadPromise = null;

function setStatus(s) {
  if (status === s) return;
  status = s;
  statusListeners.forEach((fn) => { try { fn(s); } catch { /* ignore */ } });
}

export function sttStatus() {
  return status;
}

export function onSttStatus(fn) {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./stt-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'load-progress') {
        statusListeners.forEach((fn) => {
          try { fn(status, msg.progress); } catch { /* ignore */ }
        });
        return;
      }
      const { id, type } = msg;
      const entry = id != null ? pending.get(id) : null;
      if (!entry) return;
      pending.delete(id);
      if (type === 'error') entry.reject(new Error(msg.error || 'stt-failed'));
      else entry.resolve(msg);
    };
    worker.onerror = () => {
      setStatus('error');
      pending.forEach((entry) => { try { entry.reject(new Error('stt-worker-error')); } catch { /* ignore */ } });
      pending.clear();
    };
  }
  return worker;
}

function callWorker(type, payload, transfer) {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage({ id, type, payload }, transfer || []);
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
  });
}

/** Start downloading/loading the Whisper model (idempotent). */
export function preloadStt() {
  if (status === 'ready') return Promise.resolve();
  if (loadPromise) return loadPromise;
  setStatus('loading');
  loadPromise = (async () => {
    try {
      if (typeof Worker === 'undefined') throw new Error('workers-unsupported');
      await callWorker('load');
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      loadPromise = null;
      throw e;
    }
  })();
  return loadPromise;
}

/**
 * Transcribe 16kHz mono PCM. Waits for the model when it is still loading
 * (up to ~90s); rejects when the engine failed.
 */
export async function transcribePcm(pcm16) {
  if (!(pcm16 instanceof Float32Array) || pcm16.length < 1600) return '';
  if (status === 'error') throw new Error('stt-unavailable');
  if (status !== 'ready') {
    const ready = preloadStt();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('stt-timeout')), 90000));
    await Promise.race([ready, timeout]);
  }
  // Transfer the buffer to the worker (zero-copy); the caller's view is neutered.
  const res = await callWorker('transcribe', { pcm: pcm16, sampleRate: 16000 }, [pcm16.buffer]);
  return (res && typeof res.text === 'string') ? res.text : '';
}


/* Realtime browser STT fast path. Chrome/Edge can emit interim results while the user is speaking; Whisper remains the fallback. */
let realtime = null;
function realtimeCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
export function realtimeSttSupported() { return !!realtimeCtor(); }
export function startRealtimeStt({ lang = 'en-IN', onInterim, onFinal, onError } = {}) {
  const Ctor = realtimeCtor();
  if (!Ctor) return null;
  stopRealtimeStt();
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = lang;
  const state = { stopped: false, restarting: false, finalText: '', interimText: '' };
  realtime = { recognition, state };
  recognition.onresult = (event) => {
    let interim = '';
    let finals = '';
    for (let i = event.resultIndex || 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript || '';
      if (result.isFinal) finals += ' ' + text;
      else interim += ' ' + text;
    }
    if (finals.trim()) {
      state.finalText = (state.finalText + ' ' + finals).replace(/\\s+/g, ' ').trim();
      try { onFinal && onFinal(state.finalText); } catch { /* ignore */ }
    }
    state.interimText = interim.replace(/\\s+/g, ' ').trim();
    try { onInterim && onInterim((state.finalText + ' ' + state.interimText).replace(/\\s+/g, ' ').trim()); } catch { /* ignore */ }
  };
  recognition.onerror = (event) => {
    if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
      try { onError && onError(event?.error || 'stt-error'); } catch { /* ignore */ }
    }
  };
  recognition.onend = () => {
    if (state.stopped || realtime?.recognition !== recognition || state.restarting) return;
    state.restarting = true;
    setTimeout(() => {
      state.restarting = false;
      if (state.stopped || realtime?.recognition !== recognition) return;
      try { recognition.start(); } catch { /* ignore */ }
    }, 30);
  };
  try { recognition.start(); } catch { return null; }
  return { reset() { state.finalText = ''; state.interimText = ''; }, getText() { return (state.finalText || state.interimText || '').trim(); }, getFinalText() { return state.finalText.trim(); }, stop() { stopRealtimeStt(); } };
}
export function getRealtimeSttText() { return realtime?.state ? (realtime.state.finalText || realtime.state.interimText || '').trim() : ''; }
export function getRealtimeSttFinalText() { return realtime?.state ? realtime.state.finalText.trim() : ''; }
export function resetRealtimeStt() { if (realtime?.state) { realtime.state.finalText = ''; realtime.state.interimText = ''; } }
export function stopRealtimeStt() {
  const current = realtime;
  realtime = null;
  if (!current) return;
  current.state.stopped = true;
  try { current.recognition.onend = null; current.recognition.stop(); } catch { /* ignore */ }
}
