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
