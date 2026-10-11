import React, { useState, useRef, useEffect } from 'react';
import { Mic, Check, X, Loader2, ShieldCheck, RotateCcw } from 'lucide-react';
import { loadSpeakerModel, recordAudio, getEmbedding, averageEmbeddings, saveVoiceprint } from './voiceprint';

const PHRASES = [
  'Hey Collancer',
  'Hey Collancer, open my dashboard',
  'Hey Collancer, show my bookings',
  'Hey Collancer, what are my earnings',
];

export default function VoiceEnrollWizard({ onDone, onCancel }) {
  const [step, setStep] = useState(-1); // -1 intro, 0..3 phrases, 4 processing, 5 done
  const [modelState, setModelState] = useState('idle'); // idle|loading|ready|error
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const embeddings = useRef([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModelState('loading');
      try {
        await loadSpeakerModel();
        if (!cancelled) setModelState('ready');
      } catch (e) {
        if (!cancelled) { setModelState('error'); setError('Voice model failed to load. Check your connection and retry.'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startPhrase = async (idx) => {
    setError('');
    setRecording(true);
    setCountdown(3);
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    try {
      const audio = await recordAudio(3, setLevel);
      const emb = await getEmbedding(audio);
      embeddings.current[idx] = emb;
      setStep(idx + 1);
      if (idx + 1 >= PHRASES.length) {
        setStep(4);
        const avg = averageEmbeddings(embeddings.current.filter(Boolean));
        saveVoiceprint(avg);
        setStep(5);
      }
    } catch (e) {
      setError(e?.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow mic access and try again.'
        : 'Recording failed: ' + (e?.message || 'unknown error'));
    } finally {
      clearInterval(tick);
      setRecording(false);
      setLevel(0);
      setCountdown(0);
    }
  };

  const retryPhrase = (idx) => {
    embeddings.current[idx] = null;
    startPhrase(idx);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-[#0b0f14]">
      {/* header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-cyan-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Voice Match Setup</h2>
        </div>
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Close">
          <X size={20} className="text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8 flex flex-col">
        {step === -1 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <div className="w-20 h-20 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <Mic size={36} className="text-cyan-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Teach Collancer your voice</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              Say {PHRASES.length} short phrases out loud. Collancer learns how <em>you</em> sound —
              after this, "Hey Collancer" will respond only to your voice.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-100 dark:bg-white/5 rounded-full px-4 py-2">
              <ShieldCheck size={14} className="text-emerald-500" />
              Your voiceprint stays on this phone only. Never uploaded.
            </div>
            <button
              disabled={modelState !== 'ready'}
              onClick={() => setStep(0)}
              className="mt-2 px-8 py-3.5 rounded-2xl bg-cyan-500 text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition flex items-center gap-2"
            >
              {modelState === 'loading' && <Loader2 size={18} className="animate-spin" />}
              {modelState === 'loading' ? 'Loading voice model…' : modelState === 'ready' ? 'Start Setup' : 'Retry'}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}

        {step >= 0 && step < PHRASES.length && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            {/* progress dots */}
            <div className="flex gap-2">
              {PHRASES.map((_, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition ${embeddings.current[i] ? 'bg-emerald-500' : i === step ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-white/10'}`} />
              ))}
            </div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Phrase {step + 1} of {PHRASES.length}</p>
            <div className="text-2xl font-semibold text-slate-900 dark:text-white px-4 leading-snug">
              "{PHRASES[step]}"
            </div>
            {/* mic button */}
            <button
              onClick={() => startPhrase(step)}
              disabled={recording}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center transition active:scale-95 ${recording ? 'bg-red-500' : 'bg-cyan-500'}`}
              aria-label={recording ? 'Recording' : 'Record phrase'}
            >
              {recording && (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
              {recording
                ? <span className="text-white text-2xl font-bold">{countdown}</span>
                : <Mic size={36} className="text-white" />}
            </button>
            {/* level meter */}
            <div className="w-48 h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {recording ? 'Speak now…' : 'Tap the mic, then say the phrase clearly'}
            </p>
            {error && <p className="text-sm text-red-500 max-w-xs">{error}</p>}
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 size={40} className="animate-spin text-cyan-500" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">Creating your voiceprint…</p>
          </div>
        )}

        {step === 5 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check size={40} className="text-emerald-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Voice Match is on!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              From now on, "Hey Collancer" responds only when <em>you</em> say it.
            </p>
            <button
              onClick={onDone}
              className="mt-2 px-8 py-3.5 rounded-2xl bg-cyan-500 text-white font-semibold text-base active:scale-[0.98] transition"
            >
              Done
            </button>
            <button
              onClick={() => { embeddings.current = []; setStep(0); }}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
            >
              <RotateCcw size={14} /> Redo setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
