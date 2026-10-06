/* Collancer voice — our own listening system.
 *
 * One continuous microphone stream (no browser SpeechRecognition, no mic
 * on/off beeps): an AudioWorklet captures raw PCM, a custom energy VAD
 * (voice activity detector) finds speech segments, and each segment is
 * resampled to 16kHz mono for the on-device Whisper engine.
 *
 * Pure helpers (computeRms, resampleTo16k) and the Vad state machine are
 * DOM-free and unit-tested.
 */

/** RMS energy of a Float32Array. Pure. */
export function computeRms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** Linear-interpolation resample of mono PCM to 16kHz. Pure. */
export function resampleTo16k(input, fromRate) {
  if (!input || !input.length) return new Float32Array(0);
  if (!fromRate || fromRate === 16000) return Float32Array.from(input);
  const ratio = fromRate / 16000;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = i0 + 1 > last ? last : i0 + 1;
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Energy VAD with adaptive noise floor.
 * push(chunk, nowMs, sourceRate). Callbacks: onSpeechStart(), onSpeechEnd(pcm16).
 * The emitted segment is resampled to 16kHz mono.
 */
export class Vad {
  constructor({ onSpeechStart, onSpeechEnd, silenceMs = 850, minSpeechMs = 350, maxSpeechMs = 25000, threshold = 0.02, confirmMs = 120 } = {}) {
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.base = { silenceMs, minSpeechMs, maxSpeechMs, threshold, confirmMs };
    this.profile = { ...this.base };
    this.reset();
  }

  /** Barge-in mode: while the assistant speaks, demand louder + longer speech. */
  setBargeIn(armed) {
    this.profile = armed
      ? { ...this.base, threshold: Math.max(this.base.threshold, 0.05), confirmMs: Math.max(this.base.confirmMs, 350), silenceMs: 750 }
      : { ...this.base };
  }

  reset() {
    this.state = 'silence'; // silence | maybe | speech
    this.floor = 0.005;
    this.smooth = 0;
    this.maybeStart = 0;
    this.speechStart = 0;
    this.lastVoiceMs = 0;
    this.lastPushMs = 0;
    this.voicedMs = 0; // voiced time inside the current segment (blip filter)
    this.chunks = []; // collected source-rate PCM (speech + pre-roll)
    this.chunksLen = 0;
    this.preRoll = []; // rolling ~400ms buffer so onsets are not clipped
    this.preRollLen = 0;
    this.preRollCap = 0; // set on first push from sourceRate
  }

  _pushPreRoll(samples) {
    this.preRoll.push(samples);
    this.preRollLen += samples.length;
    while (this.preRollLen > this.preRollCap && this.preRoll.length) {
      const s = this.preRoll.shift();
      this.preRollLen -= s.length;
    }
  }

  _collect(samples) {
    this.chunks.push(samples);
    this.chunksLen += samples.length;
  }

  _finish(nowMs, sourceRate) {
    const voicedMs = this.voicedMs;
    const pcm = this.chunks;
    this.reset();
    if (voicedMs < this.profile.minSpeechMs) return; // blip — discard
    // concat at source rate, then resample the whole segment once
    let total = 0;
    for (const c of pcm) total += c.length;
    const joined = new Float32Array(total);
    let off = 0;
    for (const c of pcm) { joined.set(c, off); off += c.length; }
    const pcm16 = resampleTo16k(joined, sourceRate);
    try { this.onSpeechEnd && this.onSpeechEnd(pcm16); } catch { /* ignore */ }
  }

  push(samples, nowMs, sourceRate) {
    if (!samples || !samples.length) return;
    if (!this.preRollCap && sourceRate) this.preRollCap = Math.floor(sourceRate * 0.4);
    const dt = this.lastPushMs ? Math.max(0, nowMs - this.lastPushMs) : 0;
    this.lastPushMs = nowMs;
    const rms = computeRms(samples);
    // Adaptive noise floor: drop instantly when quieter, but creep up only
    // during confirmed silence — never let sustained speech raise its own bar.
    if (rms < this.floor) {
      this.floor = rms;
    } else if (this.state === 'silence') {
      this.floor += (rms - this.floor) * 0.0003;
      if (this.floor > 0.08) this.floor = 0.08;
    }
    this.smooth = this.smooth * 0.7 + rms * 0.3;
    const thresh = Math.max(this.profile.threshold, this.floor * 4, 0.008);
    const voiced = this.smooth > thresh;

    this._pushPreRoll(samples);

    if (this.state === 'silence') {
      if (voiced) { this.state = 'maybe'; this.maybeStart = nowMs; }
      return;
    }
    if (this.state === 'maybe') {
      if (!voiced) {
        // require near-continuous voicing through the confirm window
        if (nowMs - this.maybeStart > this.profile.confirmMs * 2) { this.state = 'silence'; }
        return;
      }
      if (nowMs - this.maybeStart >= this.profile.confirmMs) {
        this.state = 'speech';
        this.speechStart = nowMs;
        this.lastVoiceMs = nowMs;
        // seed with pre-roll so the onset is intact
        this.chunks = this.preRoll.slice();
        this.chunksLen = this.preRollLen;
        try { this.onSpeechStart && this.onSpeechStart(); } catch { /* ignore */ }
      }
      return;
    }
    // state === 'speech'
    this._collect(samples);
    if (voiced) {
      this.lastVoiceMs = nowMs;
      this.voicedMs += dt;
    } else if (nowMs - this.lastVoiceMs >= this.profile.silenceMs) {
      this._finish(nowMs, sourceRate);
      return;
    }
    if (nowMs - this.speechStart >= this.profile.maxSpeechMs) {
      this._finish(nowMs, sourceRate);
    }
  }
}

const WORKLET_CODE = `
class CleoCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs && inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('cleo-capture', CleoCapture);
`;

/**
 * ContinuousListener — one mic stream, always open while the voice assistant
 * is up. No start/stop cycling, no system beeps.
 */
export class ContinuousListener {
  constructor({ onSpeechStart, onSpeechEnd, onLevel } = {}) {
    this.onLevel = onLevel;
    this.vad = new Vad({ onSpeechStart, onSpeechEnd });
    this.muted = false;
    this.dead = false;
    this._cleanup = [];
    this._lastLevelMs = 0;
  }

  setMuted(m) {
    this.muted = !!m;
    // Software mute ONLY: the mic stream stays open (no beeps, no re-acquire
    // quirks on Android). We just ignore the captured audio. Never touch
    // track.enabled, never disturb the voice state machine.
    if (this.muted) { try { this.vad.reset(); } catch { /* ignore */ } }
  }

  setBargeIn(armed) {
    try { this.vad.setBargeIn(armed); } catch { /* ignore */ }
  }

  async start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('mic-unsupported');
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = e && e.name;
      throw new Error(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic-blocked' : 'mic-unavailable');
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } throw new Error('audio-unsupported'); }
    const ctx = new AC();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }

    const src = ctx.createMediaStreamSource(stream);
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    const node = new AudioWorkletNode(ctx, 'cleo-capture');

    node.port.onmessage = (ev) => {
      if (this.dead || this.muted) return;
      const chunk = ev.data;
      if (!(chunk instanceof Float32Array)) return;
      // orb level (throttled)
      if (this.onLevel) {
        const now = performance.now();
        if (now - this._lastLevelMs > 90) {
          this._lastLevelMs = now;
          try { this.onLevel(computeRms(chunk)); } catch { /* ignore */ }
        }
      }
      try { this.vad.push(chunk, performance.now(), ctx.sampleRate); } catch { /* ignore */ }
    };
    src.connect(node);
    // NOTE: not connected to destination — capture only, no feedback.

    this._cleanup = [
      () => { try { node.port.close(); } catch { /* ignore */ } try { node.disconnect(); } catch { /* ignore */ } },
      () => { try { src.disconnect(); } catch { /* ignore */ } },
      () => { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } },
      () => { try { ctx.close(); } catch { /* ignore */ } },
    ];
    this._ctx = ctx;
  }

  stop() {
    this.dead = true;
    const steps = this._cleanup;
    this._cleanup = [];
    for (const fn of steps) { try { fn(); } catch { /* ignore */ } }
    try { this.vad.reset(); } catch { /* ignore */ }
  }
}
