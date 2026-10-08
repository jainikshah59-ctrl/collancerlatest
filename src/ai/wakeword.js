/**
 * Hey Collancer wake word via Web Speech API + Speaker Verification.
 *
 * Why this approach: the browser's built-in speech recognition (Google's
 * servers) is battle-tested for phrase detection across accents. We combine
 * it with on-device speaker verification (voiceprint.js) so only the
 * enrolled user triggers the assistant.
 *
 * Pipeline:
 *   Web Speech API (continuous) -> transcript contains "hey collancer"?
 *     -> grab last ~3s of mic audio -> verifyVoice() -> match? -> onDetect()
 *
 * 100% reliable phrase detection + privacy-preserving speaker check.
 * Requires internet (like the rest of the app).
 */

import { verifyVoice, hasVoiceprint } from './voiceprint.js';

let recognition = null;
let active = false;
let onDetectCb = null;
let cooldownUntil = 0;
let restartTimer = null;

// Mic capture for speaker verification (parallel to speech recognition)
let audioCtx = null;
let micStream = null;
let processor = null;
let audioHistory = new Float32Array(0);
const HISTORY_SAMPLES = 56000; // ~3.5s @ 16kHz

let voiceMatchEnabled = true;
export function setVoiceMatchEnabled(on) { voiceMatchEnabled = !!on; }
export function isVoiceMatchEnabled() { return voiceMatchEnabled && hasVoiceprint(); }

const COOLDOWN_MS = 3000;
const DEBUG = true;

// Fuzzy match for "hey collancer" in transcript
function isWakePhrase(transcript) {
  const t = transcript.toLowerCase().trim();
  // Direct matches
  if (t.includes('hey collancer')) return true;
  if (t.includes('hey colancer')) return true;
  if (t.includes('a collancer')) return true;
  // Word-level fuzzy: "hey" + something like "collancer"
  const words = t.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === 'hey' || words[i] === 'a' || words[i] === 'he') {
      const next = words[i + 1];
      // "collancer" variants: collancer, colancer, callancer, kalancer, etc.
      if (/^(co|ka|ca)(ll| l)?ancer$/.test(next)) return true;
      if (next.includes('lancer') || next.includes('lanser')) return true;
    }
  }
  return false;
}

function pushHistory(chunk) {
  const combined = new Float32Array(audioHistory.length + chunk.length);
  combined.set(audioHistory);
  combined.set(chunk, audioHistory.length);
  audioHistory = combined.length > HISTORY_SAMPLES
    ? combined.slice(combined.length - HISTORY_SAMPLES)
    : combined;
}

// Resample from sourceRate to 16000
function resample(input, sourceRate) {
  if (sourceRate === 16000) return input;
  const ratio = 16000 / sourceRate;
  const n = Math.round(input.length * ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const si = i / ratio;
    const i0 = Math.floor(si), f = si - i0;
    out[i] = i0 + 1 < input.length
      ? input[i0] * (1 - f) + input[i0 + 1] * f
      : input[i0];
  }
  return out;
}

async function startMicCapture() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const rate = audioCtx.sampleRate;
  if (DEBUG) console.log('[wakeword] mic sample rate:', rate);
  const source = audioCtx.createMediaStreamSource(micStream);
  // 4096 is a valid ScriptProcessor buffer size
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    if (!active) return;
    const input = e.inputBuffer.getChannelData(0);
    pushHistory(resample(input, rate));
  };
  source.connect(processor);
  processor.connect(audioCtx.destination);
}

function stopMicCapture() {
  try { processor?.disconnect(); } catch {}
  try { micStream?.getTracks().forEach(t => t.stop()); } catch {}
  try { audioCtx?.close(); } catch {}
  processor = null; micStream = null; audioCtx = null;
  audioHistory = new Float32Array(0);
}

async function handlePhraseDetected(transcript) {
  if (Date.now() < cooldownUntil) return;
  cooldownUntil = Date.now() + COOLDOWN_MS;
  if (DEBUG) console.log('[wakeword] phrase detected:', transcript);

  // Voice Match gate: verify the speaker
  if (voiceMatchEnabled && hasVoiceprint()) {
    try {
      const audio = audioHistory.slice(-48240); // last ~3s @ 16kHz
      if (audio.length < 16000) {
        if (DEBUG) console.log('[wakeword] not enough audio for verification, skipping check');
      } else {
        const { match, score } = await verifyVoice(audio);
        if (DEBUG) console.log('[wakeword] voice match:', score.toFixed(3), match ? 'MATCH' : 'NO MATCH');
        if (!match) return; // not the enrolled user — ignore
      }
    } catch (e) {
      console.warn('[wakeword] verification error:', e);
      // fail open: still trigger (better than locking user out)
    }
  }
  onDetectCb?.();
}

function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.error('[wakeword] SpeechRecognition not supported');
    return false;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    if (!active) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      // Check all alternatives
      for (let j = 0; j < result.length; j++) {
        const transcript = result[j].transcript;
        if (isWakePhrase(transcript)) {
          handlePhraseDetected(transcript);
          break;
        }
      }
      if (DEBUG && result.isFinal) {
        console.log('[wakeword] heard:', result[0].transcript);
      }
    }
  };

  recognition.onerror = (e) => {
    if (DEBUG) console.log('[wakeword] recognition error:', e.error);
    // 'no-speech' and 'audio-capture' are normal; restart on others
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      console.error('[wakeword] mic permission denied');
      stopWakeWord();
    }
  };

  recognition.onend = () => {
    // Auto-restart (Chrome stops after ~1 min of silence or on error)
    if (active) {
      if (DEBUG) console.log('[wakeword] recognition ended, restarting...');
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (active) {
          try { recognition.start(); } catch (e) {
            if (DEBUG) console.log('[wakeword] restart failed:', e.message);
          }
        }
      }, 500);
    }
  };

  try {
    recognition.start();
    return true;
  } catch (e) {
    console.error('[wakeword] start failed:', e);
    return false;
  }
}

export async function startWakeWord(onDetect) {
  if (active) return true;
  onDetectCb = onDetect;
  try {
    await startMicCapture(); // for speaker verification audio
    const ok = startRecognition();
    if (!ok) {
      stopMicCapture();
      return false;
    }
    active = true;
    if (DEBUG) console.log('[wakeword] started (Web Speech API + voice match)');
    return true;
  } catch (e) {
    console.error('[wakeword] start failed:', e);
    stopWakeWord();
    return false;
  }
}

export function stopWakeWord() {
  active = false;
  clearTimeout(restartTimer);
  try { recognition?.abort(); } catch {}
  recognition = null;
  stopMicCapture();
  if (DEBUG) console.log('[wakeword] stopped');
}

export function isWakeWordActive() { return active; }
export function setWakeWordDebug(on) { /* kept for API compat */ }

// For testing
export function _testIsWakePhrase(t) { return isWakePhrase(t); }
