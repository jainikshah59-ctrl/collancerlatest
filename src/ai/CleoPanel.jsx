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
 * Voice states: idle, listening, speech-detected, researching, speaking,
 * error. Browser SpeechRecognition (continuous + interim) for maximum speed:
 * the mic starts instantly in the open gesture and stays on (immediate
 * restart on browser auto-stop); streaming partials drive barge-in while the
 * assistant speaks. Answers are spoken (never shown), then it listens again.
 * Mute is software-only (results ignored, mic never cycled). Stop interrupts
 * speech and resumes listening. Close plays our own chime and exits to chat.
 * The gear opens a 10-voice picker (5 male / 5 female).
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
/**
 * Rough echo guard: if what the mic "heard" is mostly words the assistant
 * just spoke, it's the speaker leaking into the mic — not the user.
 */
function isEchoResult(heard, spoken) {
  if (!heard || !spoken) return false;
  const hWords = String(heard).toLowerCase().split(/\s+/).filter(Boolean);
  if (hWords.length < 2) return false;
  const sSet = new Set(String(spoken).toLowerCase().split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const w of hWords) if (sSet.has(w)) overlap++;
  return overlap / hWords.length > 0.6;
}

function VoiceView({ context, isCreator, onAction, voicePref, setVoicePref, liveOn, onBackToChat }) {
  // vState: idle | listening | speech-detected | researching | speaking | error
  // (no warming — the browser mic needs no model download)
  const [vState, setVState] = useState('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const micMutedRef = useRef(false);
  const closedRef = useRef(false);
  const stateRef = useRef('idle');
  const orbRef = useRef(null);
  const orbPulseRef = useRef(null);
  const recogRef = useRef(null);
  const restartTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const finalBufferRef = useRef('');
  const turnActiveRef = useRef(false);
  const pendingQueryRef = useRef('');
  const lastSpokenRef = useRef('');
  const speakStartRef = useRef(0);
  const lastRestartRef = useRef(0);

  const setState = useCallback((s) => { stateRef.current = s; setVState(s); }, []);

  const setOrbScale = useCallback((s) => {
    if (orbRef.current) orbRef.current.style.setProperty('--orb-s', s);
  }, []);

  // unmount: stop everything
  useEffect(() => () => {
    closedRef.current = true;
    try { clearTimeout(debounceTimerRef.current); } catch { /* ignore */ }
    try { clearTimeout(restartTimerRef.current); } catch { /* ignore */ }
    try { recogRef.current && recogRef.current.stop(); } catch { /* ignore */ }
    recogRef.current = null;
    stopSpeak();
    try { clearTimeout(orbPulseRef.current); } catch { /* ignore */ }
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

  const checkPending = useCallback(() => {
    const q = pendingQueryRef.current;
    pendingQueryRef.current = '';
    if (q && !closedRef.current && !micMutedRef.current) {
      processTurnRef.current(q);
    }
  }, []);

  const processTurnRef = useRef(null);

  /** One full turn: brain -> speak -> back to listening. */
  const processTurn = useCallback(async (q) => {
    turnActiveRef.current = true;
    setState('researching');
    const spoken = await processTranscript(q);
    if (closedRef.current) { turnActiveRef.current = false; return; }
    if (!spoken) {
      turnActiveRef.current = false;
      setState('listening');
      checkPending();
      return;
    }
    setState('speaking');
    lastSpokenRef.current = spoken;
    speakStartRef.current = Date.now();
    speak(spoken, {
      voice: voicePref,
      onProgress: () => {
        setOrbScale(1.09);
        try { clearTimeout(orbPulseRef.current); } catch { /* ignore */ }
        orbPulseRef.current = setTimeout(() => setOrbScale(1), 150);
      },
      onDone: () => {
        turnActiveRef.current = false;
        if (stateRef.current !== 'speaking') { checkPending(); return; }
        setOrbScale(1);
        setState('listening');
        checkPending();
        // Recognition is still running (continuous) — mic never stopped.
      },
    });
  }, [processTranscript, voicePref, setState, setOrbScale, checkPending]);
  processTurnRef.current = processTurn;

  /**
   * Results from the browser mic. Interim = streaming partials (fast!),
   * final = completed utterance pieces. Debounced: when results stop for
   * 700ms, the utterance is done -> process it.
   */
  const handleResult = useCallback((interim, final) => {
    if (closedRef.current || micMutedRef.current) return;
    const st = stateRef.current;

    // Barge-in: the user talks over the answer.
    if (st === 'speaking') {
      if (Date.now() - speakStartRef.current < 800) return; // let EC settle
      const text = (final || interim).trim();
      if (!text) return;
      if (isEchoResult(text, lastSpokenRef.current)) return; // speaker leak
      stopSpeak(); // onDone fires -> clears turnActive (state !== 'speaking')
      setOrbScale(1);
      setState('listening');
      // Fall through: this speech becomes the new utterance.
    }

    if (final) {
      finalBufferRef.current += (finalBufferRef.current ? ' ' : '') + final.trim();
    }
    if (stateRef.current === 'listening' && (final || interim)) {
      setState('speech-detected');
    }
    // Live orb reaction to incoming speech.
    if (final || interim) {
      setOrbScale(1.06);
      try { clearTimeout(orbPulseRef.current); } catch { /* ignore */ }
      orbPulseRef.current = setTimeout(() => setOrbScale(1), 220);
    }

    try { clearTimeout(debounceTimerRef.current); } catch { /* ignore */ }
    debounceTimerRef.current = setTimeout(() => {
      const q = finalBufferRef.current.trim();
      finalBufferRef.current = '';
      if (closedRef.current || micMutedRef.current) {
        if (!closedRef.current && stateRef.current === 'speech-detected') setState('listening');
        return;
      }
      if (!q) {
        if (stateRef.current === 'speech-detected') setState('listening');
        return;
      }
      if (turnActiveRef.current) {
        pendingQueryRef.current = q; // queue behind the current turn
      } else {
        processTurnRef.current(q);
      }
    }, 700);
  }, [setState, setOrbScale]);

  const handleResultRef = useRef(null);
  handleResultRef.current = handleResult;

  /**
   * Start (or restart) the browser mic. continuous=true keeps the session
   * alive; onend restarts immediately so the mic is effectively always on.
   */
  const startRecognition = useCallback(() => {
    if (closedRef.current) return;
    const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setState('error');
      speak('Voice input is not supported in this browser. Try Chrome.', { voice: voicePref });
      setTimeout(() => { if (stateRef.current === 'error' && !closedRef.current) setState('idle'); }, 4500);
      return;
    }
    try { if (recogRef.current) { try { recogRef.current.stop(); } catch { /* ignore */ } } } catch { /* ignore */ }
    try {
      const recog = new SR();
      recogRef.current = recog;
      recog.lang = 'en-IN';
      recog.continuous = true; // stay on — no per-utterance shutdown
      recog.interimResults = true; // streaming partials — fast
      recog.maxAlternatives = 1;
      recog.onresult = (ev) => {
        try {
          if (closedRef.current || micMutedRef.current) return;
          let interim = '', final = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = (ev.results[i][0] && ev.results[i][0].transcript) || '';
            if (ev.results[i].isFinal) final += t;
            else interim += t;
          }
          if (handleResultRef.current) handleResultRef.current(interim, final);
        } catch { /* ignore */ }
      };
      recog.onerror = (ev) => {
        const err = (ev && ev.error) || '';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setState('error');
          speak('Microphone access was blocked. Please allow the microphone and try again.', { voice: voicePref });
          setTimeout(() => { if (stateRef.current === 'error' && !closedRef.current) setState('idle'); }, 6000);
        }
        // 'no-speech', 'network', 'audio-capture' -> onend will restart us.
      };
      recog.onend = () => {
        if (closedRef.current) return;
        // The browser ended the session — restart right away to keep the
        // mic on. Guard against a tight fail-loop (each restart can beep).
        const now = Date.now();
        const wait = now - lastRestartRef.current < 2000 ? 2500 : 300;
        lastRestartRef.current = now;
        try { clearTimeout(restartTimerRef.current); } catch { /* ignore */ }
        restartTimerRef.current = setTimeout(() => {
          if (!closedRef.current) startRecognitionRef.current();
        }, wait);
      };
      recog.start();
      if (!closedRef.current && (stateRef.current === 'idle' || stateRef.current === 'error')) {
        setState('listening');
      }
    } catch {
      // Transient start failure (Chrome throws on too-rapid restart) — retry.
      if (!closedRef.current) {
        try { clearTimeout(restartTimerRef.current); } catch { /* ignore */ }
        restartTimerRef.current = setTimeout(() => {
          if (!closedRef.current) startRecognitionRef.current();
        }, 900);
      }
    }
  }, [setState, voicePref]);
  const startRecognitionRef = useRef(null);
  startRecognitionRef.current = startRecognition;

  // Open: chime + INSTANT mic — the browser recognizer starts in the same
  // gesture chain, no model download, no warm-up.
  useEffect(() => {
    playVoiceChime();
    startRecognitionRef.current();
    return () => {
      try { clearTimeout(restartTimerRef.current); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Mute = microphone ONLY (software). The browser recognition keeps
   * running so there's no stop/start beep; we just ignore its results.
   * Nothing else — no state change, no TTS touch, no dropped turns.
   */
  const toggleMicMute = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
    if (next) {
      try { clearTimeout(debounceTimerRef.current); } catch { /* ignore */ }
      finalBufferRef.current = '';
      setOrbScale(1);
      // If we were mid-utterance, drop it back to listening (muted).
      if (stateRef.current === 'speech-detected') setState('listening');
    }
  }, [setState, setOrbScale]);

  /** Stop = interrupt the assistant's speech, then hear me again. */
  const stopAndListen = useCallback(() => {
    stopSpeak();
    try { clearTimeout(debounceTimerRef.current); } catch { /* ignore */ }
    finalBufferRef.current = '';
    pendingQueryRef.current = '';
    setOrbScale(1);
    if (!closedRef.current) setState('listening');
    // Recognition never stopped — the mic is already on.
  }, [setState, setOrbScale]);

  /** Close = our own closing chime, smooth exit, back to chat. */
  const closeVoice = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    playVoiceCloseChime();
    try { clearTimeout(restartTimerRef.current); } catch { /* ignore */ }
    try { clearTimeout(debounceTimerRef.current); } catch { /* ignore */ }
    try { recogRef.current && recogRef.current.stop(); } catch { /* ignore */ }
    recogRef.current = null;
    stopSpeak();
    setOrbScale(1);
    setShowVoices(false);
    setClosing(true);
    setTimeout(() => { onBackToChat && onBackToChat(); }, 430);
  }, [setOrbScale, onBackToChat]);

  /** Tap the orb to nudge back to listening when idle. */
  const tapOrb = useCallback(() => {
    if (closedRef.current || showVoices || micMutedRef.current) return;
    if (stateRef.current === 'idle') {
      setState('listening');
      startRecognitionRef.current();
    }
  }, [showVoices, setState]);

  return (
    <div className={`cleo-v2${closing ? ' closing' : ''}`}>
      {/* aurora orb — browser mic, always on while the assistant is up */}
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
