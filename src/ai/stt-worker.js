/* Collancer voice — on-device speech-to-text worker.
 *
 * Runs Whisper (tiny.en) fully in the browser via @huggingface/transformers.
 * No server, no API key, no browser SpeechRecognition — this is our own
 * listening system. The model (~40MB) downloads once from the HuggingFace
 * CDN and is cached by the browser afterwards.
 *
 * Protocol (postMessage):
 *   in:  { id, type: 'load' }                                  -> { id, type: 'ready' }
 *   in:  { id, type: 'transcribe', payload: { pcm, sampleRate } } -> { id, type: 'result', text }
 *   out: { type: 'load-progress', progress }                     (unsolicited, 0..1)
 *   out: { id, type: 'error', error }
 */

import { pipeline, env } from '@huggingface/transformers';

// Never look for local models — always fetch (and cache) from the hub.
env.allowLocalModels = false;

const MODEL_ID = 'Xenova/whisper-tiny.en';

let transcriberPromise = null;

function ensureTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      progress_callback: (p) => {
        try {
          if (p && typeof p.progress === 'number') {
            self.postMessage({ type: 'load-progress', progress: Math.max(0, Math.min(1, p.progress)) });
          }
        } catch { /* ignore */ }
      },
    }).then((t) => {
      try { self.postMessage({ type: 'load-progress', progress: 1 }); } catch { /* ignore */ }
      return t;
    });
  }
  return transcriberPromise;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const { id, type, payload } = msg;
  try {
    if (type === 'load') {
      await ensureTranscriber();
      self.postMessage({ id, type: 'ready' });
    } else if (type === 'transcribe') {
      const transcriber = await ensureTranscriber();
      const pcm = payload && payload.pcm;
      const sampleRate = (payload && payload.sampleRate) || 16000;
      if (!pcm || !pcm.length) {
        self.postMessage({ id, type: 'result', text: '' });
        return;
      }
      const out = await transcriber(pcm, {
        sampling_rate: sampleRate,
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });
      let text = '';
      if (out) {
        if (typeof out.text === 'string') text = out.text;
        else if (Array.isArray(out) && out[0] && typeof out[0].text === 'string') text = out[0].text;
      }
      self.postMessage({ id, type: 'result', text: String(text || '').trim() });
    }
  } catch (e) {
    self.postMessage({ id, type: 'error', error: String((e && e.message) || e) });
  }
};
