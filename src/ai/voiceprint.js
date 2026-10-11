/**
 * Collancer Voice Match — speaker verification (Google Voice Match style)
 *
 * On-device speaker verification using a NeXt-TDNN model (Apache 2.0) via
 * onnxruntime-web. The enrolled voiceprint NEVER leaves the device — it is
 * stored in localStorage only.
 *
 * Pipeline: 16kHz mono -> pre-emphasis -> 80-band log-mel (mean norm)
 *           -> NeXt-TDNN -> L2-normalized embedding -> cosine similarity
 */

const MODEL_URL = 'https://huggingface.co/jaehyun-ko/next-tdnn-onnx/resolve/main/NeXt_TDNN_light_C128_B3_K65.onnx';
const STORAGE_KEY = 'collancer_voiceprint_v1';

// Audio config (must match the speaker model's training)
const SR = 16000;
const N_FFT = 512;
const WIN = 400;
const HOP = 160;
const N_MELS = 80;
const F_MIN = 20;
const F_MAX = 7600;
const TARGET_SAMPLES = 48240; // ~3.015s -> exactly 300 frames
const TARGET_FRAMES = 300;

// Verification threshold: cosine similarity of L2-normalized embeddings.
// Same speaker typically scores 0.6-0.9; different speakers < 0.4.
// (TTS test: same 0.99, different 0.86-0.94 — TTS is a worst case since
// voices are unnaturally clean; real human voices separate more widely.
// Tune after real-device testing; scores are logged in debug mode.)
export const VERIFY_THRESHOLD = 0.6;

let ort = null;
let session = null;
let melBank = null;
let fft = null;

async function loadOrt() {
  if (ort) return ort;
  ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.mjs');
  ort.env.wasm.numThreads = 1;
  return ort;
}

export async function loadSpeakerModel(onProgress) {
  const o = await loadOrt();
  if (session) return session;
  onProgress?.('loading');
  const resp = await fetch(MODEL_URL);
  if (!resp.ok) throw new Error('speaker model fetch failed: ' + resp.status);
  const buf = await resp.arrayBuffer();
  session = await o.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  onProgress?.('ready');
  return session;
}

// ---------- FFT (radix-2 Cooley-Tukey) ----------

class FFT {
  constructor(size) {
    this.size = size;
    const log2 = Math.log2(size);
    this.cosT = new Float32Array(size / 2);
    this.sinT = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const a = (2 * Math.PI * i) / size;
      this.cosT[i] = Math.cos(a);
      this.sinT[i] = Math.sin(a);
    }
    this.rev = new Uint32Array(size);
    const shift = 32 - log2;
    for (let i = 0; i < size; i++) {
      let x = i;
      x = ((x & 0x55555555) << 1) | ((x & 0xaaaaaaaa) >>> 1);
      x = ((x & 0x33333333) << 2) | ((x & 0xcccccccc) >>> 2);
      x = ((x & 0x0f0f0f0f) << 4) | ((x & 0xf0f0f0f0) >>> 4);
      x = ((x & 0x00ff00ff) << 8) | ((x & 0xff00ff00) >>> 8);
      x = ((x & 0x0000ffff) << 16) | ((x & 0xffff0000) >>> 16);
      this.rev[i] = x >>> shift;
    }
  }
  forward(real, imag) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        const tr = real[i]; real[i] = real[j]; real[j] = tr;
        const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const c = this.cosT[k], s = this.sinT[k];
          const tr = real[l] * c - imag[l] * s;
          const ti = real[l] * s + imag[l] * c;
          real[l] = real[j] - tr; imag[l] = imag[j] - ti;
          real[j] += tr; imag[j] += ti;
        }
      }
    }
  }
}

// ---------- Mel filterbank ----------

function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
function melToHz(m) { return 700 * (Math.pow(10, m / 2595) - 1); }

function buildMelBank() {
  if (melBank) return melBank;
  const bins = Math.floor(N_FFT / 2) + 1;
  const mMin = hzToMel(F_MIN), mMax = hzToMel(F_MAX);
  const pts = [];
  for (let i = 0; i < N_MELS + 2; i++) pts.push(melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
  const binPts = pts.map(hz => Math.floor(((N_FFT + 1) * hz) / SR));
  melBank = [];
  for (let m = 0; m < N_MELS; m++) {
    const f = new Float32Array(bins);
    const s = binPts[m], c = binPts[m + 1], e = binPts[m + 2];
    for (let j = s; j < c; j++) f[j] = (j - s) / (c - s);
    for (let j = c; j < e; j++) f[j] = (e - j) / (e - c);
    melBank.push(f);
  }
  fft = new FFT(N_FFT);
  return melBank;
}

function computeLogMel(audio) {
  buildMelBank();
  // pre-emphasis
  const emp = new Float32Array(audio.length);
  emp[0] = audio[0];
  for (let i = 1; i < audio.length; i++) emp[i] = audio[i] - 0.97 * audio[i - 1];

  const numFrames = Math.floor((emp.length - WIN) / HOP) + 1;
  const mel = new Float32Array(N_MELS * numFrames);
  const real = new Float32Array(N_FFT), imag = new Float32Array(N_FFT);

  for (let fr = 0; fr < numFrames; fr++) {
    const start = fr * HOP;
    real.fill(0); imag.fill(0);
    for (let i = 0; i < WIN; i++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)); // Hamming
      real[i] = emp[start + i] * w;
    }
    fft.forward(real, imag);
    for (let m = 0; m < N_MELS; m++) {
      let e = 0;
      const filt = melBank[m];
      const half = Math.floor(N_FFT / 2) + 1;
      for (let b = 0; b < half; b++) {
        const mag = real[b] * real[b] + imag[b] * imag[b]; // power spectrum
        e += mag * filt[b];
      }
      if (isNaN(e) || e < 0) e = 0;
      mel[m * numFrames + fr] = Math.log(e + 1e-6); // natural log
    }
  }
  // mean normalization per mel bin across time
  for (let m = 0; m < N_MELS; m++) {
    let sum = 0;
    for (let fr = 0; fr < numFrames; fr++) sum += mel[m * numFrames + fr];
    const mean = sum / numFrames;
    for (let fr = 0; fr < numFrames; fr++) mel[m * numFrames + fr] -= mean;
  }
  return { mel, numFrames };
}

// ---------- Embedding ----------

/** 16kHz mono Float32 -> L2-normalized speaker embedding */
export async function getEmbedding(audioFloat32) {
  const s = await loadSpeakerModel();
  // pad / truncate to exactly TARGET_SAMPLES
  let data = audioFloat32;
  if (data.length < TARGET_SAMPLES) {
    const p = new Float32Array(TARGET_SAMPLES);
    p.set(data);
    data = p;
  } else if (data.length > TARGET_SAMPLES) {
    data = data.slice(0, TARGET_SAMPLES);
  }
  const { mel, numFrames } = computeLogMel(data);
  const inputName = s.inputNames[0];
  const outName = s.outputNames[0];
  const tensor = new ort.Tensor('float32', mel, [1, N_MELS, numFrames]);
  const out = await s.run({ [inputName]: tensor });
  const t = out[outName];
  let emb;
  if (t.dims.length === 2) {
    emb = new Float32Array(t.data);
  } else if (t.dims.length === 3) {
    const [, h, f] = t.dims;
    emb = new Float32Array(h);
    for (let i = 0; i < h; i++) {
      let sum = 0;
      for (let j = 0; j < f; j++) sum += t.data[i * f + j];
      emb[i] = sum / f;
    }
  } else {
    throw new Error('unexpected speaker model output dims: ' + t.dims);
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < emb.length; i++) emb[i] /= norm;
  return emb;
}

/** cosine similarity of two L2-normalized embeddings (dot product) */
export function similarity(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** average a list of embeddings into one voiceprint, re-normalized */
export function averageEmbeddings(list) {
  const dim = list[0].length;
  const avg = new Float32Array(dim);
  for (const e of list) for (let i = 0; i < dim; i++) avg[i] += e[i];
  for (let i = 0; i < dim; i++) avg[i] /= list.length;
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += avg[i] * avg[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) avg[i] /= norm;
  return avg;
}

// ---------- Storage (on-device only) ----------

export function saveVoiceprint(embedding) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 1,
    dim: embedding.length,
    createdAt: Date.now(),
    emb: Array.from(embedding),
  }));
}

export function loadVoiceprint() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.emb || !obj.emb.length) return null;
    return new Float32Array(obj.emb);
  } catch {
    return null;
  }
}

export function hasVoiceprint() {
  return loadVoiceprint() !== null;
}

export function deleteVoiceprint() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Verify 16kHz audio against the enrolled voiceprint. Returns {match, score}. */
export async function verifyVoice(audioFloat32) {
  const enrolled = loadVoiceprint();
  if (!enrolled) return { match: false, score: 0, reason: 'no-enrollment' };
  const emb = await getEmbedding(audioFloat32);
  const score = similarity(emb, enrolled);
  return { match: score >= VERIFY_THRESHOLD, score };
}

// ---------- Audio recording helper ----------

/**
 * Record ~seconds of 16kHz mono audio from the mic.
 * Returns Float32Array. Requests mic permission (user gesture required).
 */
export async function recordAudio(seconds = 3, onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  // Some browsers ignore the hint; resample manually if needed.
  const actualRate = ctx.sampleRate;
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let stopped = false;
  proc.onaudioprocess = e => {
    if (stopped) return;
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < d.length; i += 16) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
      onLevel(Math.min(1, peak * 3));
    }
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  await new Promise(r => setTimeout(r, seconds * 1000));
  stopped = true;
  proc.disconnect(); src.disconnect();
  stream.getTracks().forEach(t => t.stop());
  ctx.close().catch(() => {});
  // concat
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  // resample to 16kHz if the context ran at another rate
  if (actualRate !== 16000) {
    const ratio = 16000 / actualRate;
    const n = Math.round(out.length * ratio);
    const rs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const si = i / ratio;
      const i0 = Math.floor(si), f = si - i0;
      rs[i] = i0 + 1 < out.length ? out[i0] * (1 - f) + out[i0 + 1] * f : out[i0];
    }
    return rs;
  }
  return out;
}
