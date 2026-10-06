/* CleoPanel v2 — Collancer Chat AI + Voice Assistant.
 *
 * One shared brain (engine.js answerQuery / creatorAi.js askCreatorAI, backed by
 * the 276-entry Cleo knowledge base): chat text and voice transcripts converge
 * into the same pipeline. Only input capture and presentation differ.
 *
 * Layout: the Chat assistant stays where it is (the AI tab). The Voice
 * assistant lives in the same space, switched via the Chat | Voice toggle.
 *
 * Chat states: idle, thinking (dots + progress meter), answer (progressive
 * output), creator results, profile sheet, booking, error.
 * Voice states: idle, warming, listening, speech-detected, researching,
 * speaking, error. Our own listening system: one continuous mic stream
 * (AudioWorklet + energy VAD, no browser SpeechRecognition, no mic beeps),
 * on-device Whisper transcription in a worker, barge-in while speaking.
 * Opening auto-listens; answers are spoken (never shown); then it listens
 * again. Mute silences the mic only. Stop interrupts speech and resumes
 * listening. Close plays our own chime and exits to chat. The gear opens a
 * 10-voice picker (5 male / 5 female).
 *
 * Visuals: app Sharp Glass (sharp cards, pill buttons, cyan accent, Lucide
 * icons only). Animations per spec: animated mark, generating dots, thinking
 * meter, mark glow, card gloss, sheet transition, word-synced transcript.
 */
import './cleo.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, ArrowUp, ArrowLeft, Mic, Square, Volume2, VolumeX, Plus,
  MapPin, Users, Star, MessageCircle, AudioLines, X, Check, Settings,
} from 'lucide-react';
import { Button, IconBtn, Avatar, EmptyState, VerifiedTick } from '../components/ui.jsx';
import { answerQuery, extractCampaign } from './engine.js';
import { askCreatorAI } from './creatorAi.js';
import { QA_ENTRIES, KB_TOPICS } from './knowledge.js';
import {
  loadConvo, pushTurn, clearConvo, loadMemory, rememberCampaignFacts,
} from './conversation.js';
import { speak, stopSpeak, unlockAudio, playVoiceChime, playVoiceCloseChime, VOICE_META } from './voice.js';
import { preloadStt, sttStatus, transcribePcm, startRealtimeStt, getRealtimeSttText, getRealtimeSttFinalText, resetRealtimeStt, stopRealtimeStt, realtimeSttSupported } from './stt.js';
import { ContinuousListener } from './listen.js';
import { compact, inr } from '../lib/format.js';

const VOICE_KEY = 'cleo-voice';

const SUGGESTIONS = [
  'Find fashion creators under ₹10k',
  'How do wallet deposits work?',
  'Draft my campaign requirement',
  'What is the platform fee?',
  'How much do creators charge in India?',
];
const CREATOR_SUGGESTIONS = [
  'How complete is my profile?',
  'What should I charge for a reel?',
  'Draft a pitch for a brand',
  'How do I disclose a paid partnership?',
];

/** Strip markdown decoration for clean display (spec: output sanitization). */
function cleanText(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/^(\s*[-*•])\s+/gm, '• ');
}
function renderText(text) {
  return cleanText(text).split('\n').map((line, i) => (
    <p key={i} style={{ margin: i ? '8px 0 0' : 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line || ' '}</p>
  ));
}

/* ================= animated assistant mark ================= */

function CleoMark({ state = 'idle', size = 38 }) {
  const listening = state === 'listening' || state === 'speech-detected';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {listening && (<><span className="cleo-pulse-ring" /><span className="cleo-pulse-ring r2" /><span className="cleo-pulse-ring r3" /></>)}
      <div className={`cleo-mark${listening ? ' listening' : ''}`} style={{ width: size, height: size }}>
        {state === 'speaking'
          ? <AudioLines size={size * 0.44} />
          : <Sparkles size={size * 0.5} />}
      </div>
    </div>
  );
}

/* ================= thinking: dots + meter ================= */

const THINK_LABELS = [
  'Thinking…',
  'Searching knowledge…',
  'Ranking creators…',
  'Composing answer…',
];
function ThinkingBlock() {
  const [li, setLi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLi((v) => (v + 1) % THINK_LABELS.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="cl-card cl-fade" style={{ borderRadius: '16px 16px 16px 5px', padding: '12px 14px', minWidth: 200 }}>
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <span className="cleo-dots"><span /><span /><span /></span>
        <span className="cl-small" style={{ fontWeight: 700 }}>{THINK_LABELS[li]}</span>
      </div>
      <div className="cleo-meter"><i /></div>
    </div>
  );
}

/* ================= progressive answer reveal ================= */

function ProgressiveText({ text, done }) {
  const clean = useMemo(() => cleanText(text), [text]);
  const [shown, setShown] = useState(done ? clean.length : 0);
  useEffect(() => {
    setShown(done ? clean.length : 0);
  }, [clean, done]);
  useEffect(() => {
    if (done || shown >= clean.length) return;
    const t = setInterval(() => {
      setShown((v) => {
        const next = v + 24;
        return next >= clean.length ? clean.length : next;
      });
    }, 18);
    return () => clearInterval(t);
  }, [done, clean, shown >= clean.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const complete = shown >= clean.length;
  return (
    <div
      className={complete ? undefined : 'cleo-caret'}
      style={{ fontSize: 14.5, lineHeight: 1.55 }}
      onClick={() => setShown(clean.length)}
    >
      {clean.slice(0, shown).split('\n').map((line, i) => (
        <p key={i} style={{ margin: i ? '8px 0 0' : 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line || ' '}</p>
      ))}
    </div>
  );
}

/* ================= creator card + sheet ================= */

function CreatorCard({ item, onBook, onOpen }) {
  const c = item.creator || item;
  const reasons = item.reasons || [];
  return (
    <div className="cl-card cleo-card-gloss cl-fade" style={{ marginTop: 10, padding: 14, cursor: onOpen ? 'pointer' : undefined }} onClick={() => onOpen && onOpen(item)}>
      <div className="cl-row">
        <Avatar src={c.pfp} name={c.name} size={48} pro={!!c.creatorIsPro} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div className="cl-row" style={{ gap: 6 }}>
            <strong style={{ fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</strong>
            {c.verified && <VerifiedTick size={15} />}
          </div>
          <div className="cl-small cl-muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
            {c.handle && <span>@{c.handle}</span>}
            {c.niche && <span>{c.niche}</span>}
          </div>
        </div>
      </div>
      <div className="cl-row" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {c.followers > 0 && (
          <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Users size={13} /> {compact(c.followers)}
          </span>
        )}
        {c.city && (
          <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={13} /> {c.city}
          </span>
        )}
        {c.rating > 0 && (
          <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Star size={13} /> {Number(c.rating).toFixed(1)}
          </span>
        )}
        {c.minPrice != null && <span className="cl-money" style={{ fontSize: 14 }}>{inr(c.minPrice)}+</span>}
      </div>
      {reasons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {reasons.slice(0, 4).map((r, i) => (
            <span key={i} className="cl-chip cyan" style={{ fontSize: 11 }}>{r}</span>
          ))}
        </div>
      )}
      <div className="cl-row" style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
        <Button variant="dark" size="sm" block onClick={() => onBook && onBook(c)}>
          Book {String(c.name || 'creator').split(' ')[0]}
        </Button>
      </div>
    </div>
  );
}

function CreatorSheet({ item, onClose, onBook }) {
  const [closing, setClosing] = useState(false);
  const c = item.creator || item;
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return createPortal(
    <div className="cleo-sheet-backdrop" onClick={close}>
      <div className={`cleo-sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Creator profile">
        <div className="cleo-sheet-grab" />
        <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
          <Avatar src={c.pfp} name={c.name} size={60} pro={!!c.creatorIsPro} />
          <div className="cl-grow" style={{ minWidth: 0 }}>
            <div className="cl-row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 17 }}>{c.name}</strong>
              {c.verified && <VerifiedTick size={16} />}
            </div>
            <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
              {[c.handle && `@${c.handle}`, c.niche, c.city].filter(Boolean).join(' · ')}
            </div>
          </div>
          <IconBtn icon={X} label="Close" onClick={close} />
        </div>
        {(item.reasons || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {item.reasons.map((r, i) => (
              <span key={i} className="cl-chip cyan" style={{ fontSize: 11.5 }}><Check size={12} /> {r}</span>
            ))}
          </div>
        )}
        <div className="cl-card" style={{ padding: 14, marginBottom: 12 }}>
          <div className="cl-row" style={{ gap: 18, flexWrap: 'wrap' }}>
            {c.followers > 0 && <div><div style={{ fontWeight: 800, fontSize: 16 }}>{compact(c.followers)}</div><div className="cl-small cl-muted">Followers</div></div>}
            {c.engagement > 0 && <div><div style={{ fontWeight: 800, fontSize: 16 }}>{Number(c.engagement).toFixed(1)}%</div><div className="cl-small cl-muted">Engagement</div></div>}
            {c.rating > 0 && <div><div style={{ fontWeight: 800, fontSize: 16 }}>{Number(c.rating).toFixed(1)}</div><div className="cl-small cl-muted">Rating</div></div>}
            {c.minPrice != null && <div><div className="cl-money" style={{ fontSize: 16 }}>{inr(c.minPrice)}+</div><div className="cl-small cl-muted">From</div></div>}
          </div>
        </div>
        {c.bio && <p className="cl-small" style={{ lineHeight: 1.6, marginBottom: 14 }}>{c.bio}</p>}
        <Button variant="dark" block onClick={() => { onBook && onBook(c); close(); }}>
          Start booking
        </Button>
      </div>
    </div>,
    document.body
  );
}

/* ================= shared brain call ================= */

async function brainAnswer(text, { isCreator, context, liveOn = true }) {
  const q = String(text || '').trim();
  if (!q) return null;
  if (isCreator) {
    const res = await askCreatorAI(q, {
      creator: context.user || {},
      bookings: context.extra?.bookings || [],
      payouts: context.extra?.payouts || [],
      verification: context.extra?.verification || null,
    });
    return { answer: res.answer, creators: [], actions: res.actions || [], confidence: 0.8 };
  }
  const ctx = {
    creators: context.creators || [],
    user: context.user || null,
    role: 'business',
    isPro: !!context.isPro,
    live: liveOn,
    knowledge: QA_ENTRIES,
    kbTopics: KB_TOPICS,
    convo: loadConvo(),
  };
  const res = await answerQuery(q, ctx);
  if (!isCreator) {
    try {
      const camp = extractCampaign(q);
      if (camp.brand || camp.product || camp.budget || camp.niche) {
        rememberCampaignFacts({ brand: camp.brand, product: camp.product, budget: camp.budget, niche: camp.niche });
      }
    } catch { /* ignore */ }
  }
  return res;
}

/* ================= chat view ================= */

function ChatView({ context, isCreator, onAction, convo, setConvo, busy, setBusy, creatorsByTurn, voicePref, liveOn, onOpenVoice }) {
  const [input, setInput] = useState('');
  const [sheetItem, setSheetItem] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true);
  const busyRef = useRef(false);

  const onChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }, []);

  const messages = useMemo(() => {
    const out = [];
    for (const t of convo.turns || []) {
      out.push({ role: 'user', text: t.query });
      out.push({ role: 'ai', text: t.answer, resultKeys: t.resultKeys });
    }
    return out;
  }, [convo]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => () => { stopSpeak(); }, []);

  const handleBook = useCallback((creator) => {
    onAction && onAction({ type: 'book', creator });
  }, [onAction]);

  const runQuery = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    stopSpeak();
    stickRef.current = true;
    setBusy(true);
    setInput('');
    let res;
    try {
      res = await brainAnswer(q, { isCreator, context, liveOn });
    } catch {
      res = { answer: 'Something went wrong on my side. Please try again.', creators: [], actions: [], confidence: 0 };
    }
    if (!res) { busyRef.current = false; setBusy(false); return; }
    const resultKeys = (res.creators || []).map((r) => (r.creator || r).id || (r.creator || r).handleLower).filter(Boolean);
    const turnIndex = (loadConvo().turns || []).length;
    creatorsByTurn.current.set(turnIndex, res.creators || []);
    const next = pushTurn(loadConvo(), {
      query: q,
      intent: isCreator ? 'creator-ai' : 'business-ai',
      constraints: null,
      answer: res.answer,
      resultKeys,
      pageKeys: resultKeys.slice(0, 8),
    });
    setConvo(next);
    busyRef.current = false;
    setBusy(false);
    if (inputRef.current) inputRef.current.focus();
  }, [busy, context, isCreator, liveOn, setBusy, setConvo, creatorsByTurn]);

  const lastAiText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai' && messages[i].text) return messages[i].text;
    }
    return '';
  }, [messages]);
  const [replaying, setReplaying] = useState(false);
  const replayVoice = useCallback(() => {
    if (!lastAiText) return;
    if (replaying) { stopSpeak(); setReplaying(false); return; }
    setReplaying(true);
    speak(lastAiText, { voice: voicePref, onDone: () => setReplaying(false) });
  }, [lastAiText, replaying, voicePref]);

  const chips = isCreator ? CREATOR_SUGGESTIONS : SUGGESTIONS;
  const showEmpty = messages.length === 0 && !busy;
  const lastAiIdx = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'ai') return i; return -1; })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div
        ref={scrollRef}
        onScroll={onChatScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 4px 10px', display: 'flex', flexDirection: 'column', gap: 8, scrollBehavior: 'smooth' }}
      >
        {showEmpty && (
          <EmptyState
            icon={Sparkles}
            title={isCreator ? 'Ask your creator copilot' : 'What are you looking for?'}
            body={isCreator
              ? 'Bookings, earnings, payouts, pricing, pitches, checklists — ask in plain words, or tap the wave icon for voice.'
              : 'Describe the creators you need — niche, budget, city, followers — and I will shortlist exact matches. Or tap the wave icon for voice.'}
          />
        )}
        {showEmpty && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', padding: '0 8px' }}>
            {chips.map((c) => (
              <button key={c} className="cl-chip cyan cl-fade" style={{ cursor: 'pointer', fontSize: 11.5, padding: '6px 10px' }} onClick={() => runQuery(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} className="cl-fade" style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
            <div style={{
              background: 'var(--chat-user-bg)', color: '#fff', borderRadius: '16px 16px 5px 16px',
              padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, boxShadow: 'var(--shadow-btn)',
            }}>
              {renderText(m.text)}
            </div>
          </div>
        ) : (
          <div key={i} className="cl-fade" style={{ alignSelf: 'flex-start', maxWidth: '94%', width: '100%' }}>
            <div className="cl-card" style={{ borderRadius: '16px 16px 16px 5px', fontSize: 13.5, lineHeight: 1.5, padding: '12px 14px' }}>
              {i === lastAiIdx && !busy
                ? <ProgressiveText text={m.text} done={false} />
                : renderText(m.text)}
              {(m.resultKeys || []).length > 0 && (() => {
                const turnIdx = Math.floor(i / 2);
                const items = creatorsByTurn.current.get(turnIdx) || [];
                return items.map((item, j) => (
                  <CreatorCard key={`${i}-${j}`} item={item} onBook={handleBook} onOpen={setSheetItem} />
                ));
              })()}
            </div>
            <div className="cl-row" style={{ marginTop: 6, gap: 4 }}>
              <IconBtn
                icon={replaying ? Square : Volume2}
                label={replaying ? 'Stop' : 'Read aloud'}
                onClick={replayVoice}
              />
            </div>
          </div>
        ))}

        {busy && (
          <div className="cl-fade" style={{ alignSelf: 'flex-start' }}>
            <ThinkingBlock />
          </div>
        )}
      </div>

      {/* composer — full-width bar, pinned above the bottom nav */}
      <div style={{
        padding: '8px 4px 10px', flexShrink: 0,
        borderTop: '1px solid var(--line-soft)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0), var(--composer-fade))',
      }}>
        <form onSubmit={(e) => { e.preventDefault(); runQuery(input); }} className="cleo-composer">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isCreator ? 'Ask about bookings, earnings, pricing…' : 'Describe creators you need…'}
            disabled={busy}
            aria-label="Type your message"
          />
          <button
            type="button"
            className="cleo-wavebtn"
            onClick={onOpenVoice}
            aria-label="Open voice assistant"
            title="Voice assistant"
          >
            <span className="cleo-wave" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.14}s` }} />
              ))}
            </span>
          </button>
          <button
            type="submit"
            className="cleo-sendbtn"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        </form>
      </div>

      {sheetItem && (
        <CreatorSheet item={sheetItem} onClose={() => setSheetItem(null)} onBook={handleBook} />
      )}
    </div>
  );
}

/* ================= voice view =================
 * Reference-faithful layout in app colors + 3D glass (never the ref's palette):
 * top bar (back | Collancer AI | LIVE) -> glowing orb + side waveforms ->
 * status -> heading -> sub -> transcript card -> answer card ->
 * controls (Mute | center mic | Stop) -> Male/Female -> footer.
 * States: idle -> listening -> speech-detected -> researching -> speaking.
 * Mute, voice gender, and stop are non-destructive: stop only halts audio.
 */

/* ================= voice view v2 — ChatGPT-style =================
 * Zero text on screen. One aurora orb + Mute | mic | Stop + Male/Female.
 * The orb wakes on mic tap: smoky aurora blobs drift inside; live mic level
 * scales it while listening, word pulses scale it while the AI speaks.
 */
function VoiceView({ context, isCreator, onAction, voicePref, setVoicePref, liveOn, onBackToChat }) {
  // vState: idle | warming | listening | speech-detected | researching | speaking | error
  const [vState, setVState] = useState('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const micMutedRef = useRef(false);
  const closedRef = useRef(false);
  const stateRef = useRef('idle');
  const orbRef = useRef(null);
  const orbPulseRef = useRef(null);
  const listenerRef = useRef(null);
  const turnSeqRef = useRef(0);
  const realtimeSttRef = useRef(null);
  const speechStartRef = useRef(null);
  const speechEndRef = useRef(null);

  const setState = useCallback((s) => { stateRef.current = s; setVState(s); }, []);

  const setOrbScale = useCallback((s) => {
    if (orbRef.current) orbRef.current.style.setProperty('--orb-s', s);
  }, []);

  // unmount: stop everything (mic stream closed here; Whisper worker stays warm)
  useEffect(() => () => {
    closedRef.current = true;
    turnSeqRef.current += 1;
    try { listenerRef.current && listenerRef.current.stop(); } catch { /* ignore */ }
    listenerRef.current = null;
    try { stopRealtimeStt(); } catch { /* ignore */ }
    realtimeSttRef.current = null;
    stopSpeak();
    try { clearTimeout(orbPulseRef.current); } catch { /* ignore */ }
  }, []);

  // Browser SpeechRecognition is the realtime transcription fast path. The
  // AudioWorklet/VAD still owns speech boundaries and barge-in detection.
  useEffect(() => {
    if (typeof window === 'undefined' || !realtimeSttSupported()) return undefined;
    realtimeSttRef.current = startRealtimeStt({
      lang: 'en-IN',
      onInterim: () => {},
      onFinal: () => {},
      onError: () => {},
    });
    return () => {
      try { stopRealtimeStt(); } catch { /* ignore */ }
      realtimeSttRef.current = null;
    };
  }, []);

  /** Brain: transcript -> spoken answer text (voice only, never displayed). */
  const processTranscript = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q) return '';
    let res;
    try {
      res = await brainAnswer(q, { isCreator, context, liveOn });
    } catch {
      res = { answer: 'Something went wrong on my side. Please try again.', creators: [] };
    }
    if (!res) return '';
    let spoken = res.answer || '';
    const picks = (res.creators || []).slice(0, 3);
    if (picks.length) {
      const names = picks.map((r) => {
        const c = r.creator || r;
        return c.name || (c.handle ? '@' + c.handle : '');
      }).filter(Boolean);
      if (names.length) spoken = spoken.replace(/\s*$/, '') + ' ' + names.join(', ') + '.';
    }
    return spoken;
  }, [context, isCreator, liveOn]);

  /** One full turn. A generation id makes every in-flight turn disposable. */
  const runTurn = useCallback(async (transcript, generation) => {
    setState('researching');
    const spoken = await processTranscript(transcript);
    if (closedRef.current || generation !== turnSeqRef.current) return;
    if (!spoken) { setState('listening'); return; }
    setState('speaking');
    try { listenerRef.current && listenerRef.current.setBargeIn(true); } catch { /* ignore */ }
    speak(spoken, {
      voice: voicePref,
      onProgress: () => {
        if (generation !== turnSeqRef.current) return;
        setOrbScale(1.09);
        try { clearTimeout(orbPulseRef.current); } catch { /* ignore */ }
        orbPulseRef.current = setTimeout(() => setOrbScale(1), 120);
      },
      onDone: () => {
        if (closedRef.current || generation !== turnSeqRef.current) return;
        try { listenerRef.current && listenerRef.current.setBargeIn(false); } catch { /* ignore */ }
        setOrbScale(1);
        setState('listening');
      },
    });
  }, [processTranscript, voicePref, setState, setOrbScale]);

  /** VAD ended an utterance. Prefer realtime browser text; Whisper is fallback only. */
  const handleSpeechEnd = useCallback(async (pcm16) => {
    if (closedRef.current || micMutedRef.current) return;
    const generation = turnSeqRef.current;
    setState('researching');

    // Give the browser recognizer a tiny window to deliver its final result.
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (closedRef.current || generation !== turnSeqRef.current) return;

    let transcript = getRealtimeSttFinalText() || getRealtimeSttText();
    if (!transcript || transcript.split(/\s+/).filter(Boolean).length < 1) {
      try { transcript = await transcribePcm(pcm16); } catch { transcript = ''; }
    }

    const q = String(transcript || '').trim();
    const words = q.split(/\s+/).filter(Boolean);
    if (!q || !words.length || generation !== turnSeqRef.current) {
      if (!closedRef.current && generation === turnSeqRef.current) setState('listening');
      return;
    }
    resetRealtimeStt();
    await runTurn(q, generation);
  }, [setState, runTurn]);

  /** Any new speech invalidates the previous answer immediately. */
  const handleSpeechStart = useCallback(() => {
    if (closedRef.current || micMutedRef.current) return;
    const st = stateRef.current;
    turnSeqRef.current += 1;
    resetRealtimeStt();
    if (st === 'speaking' || st === 'researching') {
      stopSpeak();
      try { listenerRef.current && listenerRef.current.setBargeIn(false); } catch { /* ignore */ }
      setOrbScale(1);
    }
    if (st === 'listening' || st === 'speaking' || st === 'researching' || st === 'speech-detected') {
      setState('speech-detected');
    }
  }, [setState, setOrbScale]);

  speechStartRef.current = handleSpeechStart;
  speechEndRef.current = handleSpeechEnd;

  // Open: our chime, warm up Whisper, then open ONE continuous mic stream.
  useEffect(() => {
    playVoiceChime();
    let cancelled = false;
    (async () => {
      if (sttStatus() !== 'ready') {
        setState('warming');
        try { await preloadStt(); } catch { /* handled below */ }
      }
      if (cancelled || closedRef.current) return;
      if (sttStatus() !== 'ready') {
        setState('error');
        speak('My listening engine could not start. Please check your connection and try again.', { voice: voicePref });
        setTimeout(() => { if (stateRef.current === 'error' && !closedRef.current) setState('idle'); }, 5000);
        return;
      }
      const listener = new ContinuousListener({
        onSpeechStart: () => { try { speechStartRef.current && speechStartRef.current(); } catch { /* ignore */ } },
        onSpeechEnd: (pcm) => { try { speechEndRef.current && speechEndRef.current(pcm); } catch { /* ignore */ } },
        onLevel: (rms) => {
          const st = stateRef.current;
          if (st === 'listening' || st === 'speech-detected') {
            setOrbScale((1 + Math.min(0.24, rms * 1.6)).toFixed(3));
          }
        },
      });
      listenerRef.current = listener;
      try {
        await listener.start();
      } catch (e) {
        if (cancelled || closedRef.current) return;
        setState('error');
        const msg = e && e.message === 'mic-unsupported'
          ? 'Voice input is not supported in this browser. Try Chrome.'
          : e && e.message === 'mic-blocked'
            ? 'Microphone access was blocked. Please allow the microphone and try again.'
            : 'Microphone access was blocked. Please allow the microphone and try again.';
        speak(msg, { voice: voicePref });
        setTimeout(() => { if (stateRef.current === 'error' && !closedRef.current) setState('idle'); }, 6000);
        return;
      }
      if (cancelled || closedRef.current) { try { listener.stop(); } catch { /* ignore */ } return; }
      setState('listening');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Mute = microphone ONLY. It changes nothing else: the voice state machine,
   * the assistant's speech, and any in-flight turn continue untouched.
   */
  const toggleMicMute = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
    try { listenerRef.current && listenerRef.current.setMuted(next); } catch { /* ignore */ }
  }, []);

  /** Stop = interrupt the assistant's speech, then hear me again. */
  const stopAndListen = useCallback(() => {
    turnSeqRef.current += 1;
    stopSpeak();
    resetRealtimeStt();
    try { listenerRef.current && listenerRef.current.setBargeIn(false); } catch { /* ignore */ }
    setOrbScale(1);
    if (!closedRef.current) setState(micMutedRef.current ? 'idle' : 'listening');
  }, [setState, setOrbScale]);

  /** Close = our own closing chime, smooth exit, back to chat. */
  const closeVoice = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    playVoiceCloseChime();
    try { listenerRef.current && listenerRef.current.stop(); } catch { /* ignore */ }
    listenerRef.current = null;
    stopSpeak();
    setOrbScale(1);
    setShowVoices(false);
    setClosing(true);
    setTimeout(() => { onBackToChat && onBackToChat(); }, 430);
  }, [setOrbScale, onBackToChat]);

  /** Tap the orb to nudge back to listening when idle. */
  const tapOrb = useCallback(() => {
    if (closedRef.current || showVoices || micMutedRef.current) return;
    if (stateRef.current === 'idle') setState('listening');
  }, [showVoices, setState]);

  return (
    <div className={`cleo-v2${closing ? ' closing' : ''}`}>
      {/* aurora orb — our own continuous listening, no browser mic UI */}
      <div className="cleo-v2-stage">
        <div
          ref={orbRef}
          className={`cleo-orb2 st-${vState}${micMuted ? ' st-muted' : ''}`}
          role="img"
          aria-label="Voice assistant"
          onClick={tapOrb}
        >
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="blob b4" />
          <span className="blob b5" />
          <span className="blob b6" />
          <span className="blob b7" />
          <span className="swirl" />
          <span className="swirl2" />
          <span className="sheen" />
        </div>
      </div>

      {/* Mute | Stop | Close — one line, 3D glass, transparent stage */}
      <div className="cleo-v2-controls">
        <button className={`cleo-vpill${micMuted ? ' on' : ''}`} onClick={toggleMicMute} aria-pressed={micMuted}>
          {micMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}{micMuted ? 'Muted' : 'Mute'}
        </button>
        <button className="cleo-vpill" onClick={stopAndListen}>
          <Square size={11} />Stop
        </button>
        <button className="cleo-vpill" onClick={closeVoice}>
          <X size={13} />Close
        </button>
      </div>

      {/* settings: 10 voice models */}
      <div className="cleo-v2-gearwrap">
        <button className="cleo-vgear" onClick={() => setShowVoices(true)} aria-label="Voice settings">
          <Settings size={18} />
        </button>
      </div>

      {/* voice picker sheet */}
      {showVoices && (
        <div className="cleo-vsheet-wrap">
          <div className="cleo-vsheet-backdrop" onClick={() => setShowVoices(false)} />
          <div className="cleo-vsheet" role="dialog" aria-label="Choose voice">
            <div className="cleo-vsheet-grip" />
            {VOICE_META.map((m) => (
              <button
                key={m.key}
                className={`cleo-vrow${voicePref === m.key ? ' on' : ''}`}
                onClick={() => { setVoicePref(m.key); setShowVoices(false); }}
                aria-pressed={voicePref === m.key}
              >
                <span className="cleo-vrow-name">{m.name}</span>
                <span className="cleo-vrow-gender">{m.gender}</span>
                {voicePref === m.key && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



/* ================= panel shell ================= */

const LIVE_KEY = 'colenso_live';

function LiveToggle({ on, onChange }) {
  return (
    <button
      className={`cleo-live${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label="Live marketplace intelligence"
      title={on ? 'Live marketplace intelligence is on' : 'Live marketplace intelligence is off'}
    >
      <span className="cleo-live-track"><span className="cleo-live-knob" /></span>
      <span className="cleo-live-label">Live</span>
    </button>
  );
}

export default function CleoPanel({ mode = 'business', context = {}, onAction, onBack }) {
  const isCreator = mode === 'creator';
  const [view, setView] = useState('chat');
  const [convo, setConvo] = useState(() => loadConvo());
  const [busy, setBusy] = useState(false);
  const [liveOn, setLiveOn] = useState(() => {
    try { return localStorage.getItem(LIVE_KEY) !== 'off'; }
    catch { return true; }
  });
  const [voicePref, setVoicePrefState] = useState(() => {
    try { return localStorage.getItem(VOICE_KEY) || 'christopher'; }
    catch { return 'christopher'; }
  });
  const creatorsByTurn = useRef(new Map());

  const setVoicePref = useCallback((v) => {
    setVoicePrefState(v);
    try { localStorage.setItem(VOICE_KEY, v); } catch { /* ignore */ }
  }, []);

  const setLive = useCallback((v) => {
    setLiveOn(v);
    try { localStorage.setItem(LIVE_KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
  }, []);

  const handleNewChat = useCallback(() => {
    stopSpeak();
    creatorsByTurn.current.clear();
    setConvo(clearConvo());
    setView('chat');
  }, []);

  useEffect(() => {
    loadMemory();
    // Warm up the on-device listening engine while the user is on the AI tab,
    // so the voice assistant is ready the moment it opens (~40MB, cached after).
    try { preloadStt().catch(() => {}); } catch { /* ignore */ }
  }, []);

  return (
    <div className="cl-page-anim" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {view === 'chat' ? (
        <>
          {/* top bar (this IS the app top bar on the AI tab): back? + logo + Collancer Ai + tagline | Live toggle + new chat */}
          <div className="cleo-topbar">
            {onBack && <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} />}
            <div className="cl-row" style={{ gap: 8, minWidth: 0, flexShrink: 1 }}>
              <CleoMark state="idle" size={36} />
              <div style={{ minWidth: 0, flexShrink: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16.5, fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>Collancer Ai</div>
                <div className="cl-muted" style={{ fontSize: 10, letterSpacing: '.01em', whiteSpace: 'nowrap' }}>
                  Live Colenso Marketplace Intelligence
                </div>
              </div>
            </div>
            <div className="cl-grow" />
            <LiveToggle on={liveOn} onChange={setLive} />
            <IconBtn icon={Plus} label="New chat" onClick={handleNewChat} />
          </div>
          <ChatView
            context={context}
            isCreator={isCreator}
            onAction={onAction}
            convo={convo}
            setConvo={setConvo}
            busy={busy}
            setBusy={setBusy}
            creatorsByTurn={creatorsByTurn}
            voicePref={voicePref}
            liveOn={liveOn}
            onOpenVoice={() => { unlockAudio(); setView('voice'); }}
          />
        </>
      ) : (
        <VoiceView
          context={context}
          isCreator={isCreator}
          onAction={onAction}
          voicePref={voicePref}
          setVoicePref={setVoicePref}
          liveOn={liveOn}
          onBackToChat={() => setView('chat')}
        />
      )}
    </div>
  );
}
