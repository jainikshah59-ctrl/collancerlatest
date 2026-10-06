/* Cleo conversation state + long-term memory.
 * DOM-free: uses localStorage when available, otherwise an in-memory shim
 * (so node tests and SSR-style imports never crash).
 */

export const CONVO_KEY = 'collancer_ai_conversation_v2';
export const MEMORY_KEY = 'collancer_ai_memory_v2';
export const PAGE_SIZE = 8;
const MAX_TURNS = 60;

const _mem = new Map();

function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch { /* fall through */ }
  return {
    getItem: (k) => (_mem.has(k) ? _mem.get(k) : null),
    setItem: (k, v) => { _mem.set(k, String(v)); },
    removeItem: (k) => { _mem.delete(k); },
  };
}

function read(key, fallback) {
  try {
    const raw = storage().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { storage().setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const blankConvo = () => ({ turns: [], pageSize: PAGE_SIZE, activeSearch: null });

/** loadConvo() -> { turns:[{query,intent,constraints,answer,resultKeys,pageKeys}], pageSize } */
export function loadConvo() {
  const c = read(CONVO_KEY, null);
  if (!c || !Array.isArray(c.turns)) return blankConvo();
  return { turns: c.turns.slice(-MAX_TURNS), pageSize: c.pageSize || PAGE_SIZE, activeSearch: c.activeSearch || null };
}

/** saveConvo(convo) */
export function saveConvo(convo) {
  if (!convo || !Array.isArray(convo.turns)) return;
  write(CONVO_KEY, {
    turns: convo.turns.slice(-MAX_TURNS),
    pageSize: convo.pageSize || PAGE_SIZE,
    activeSearch: convo.activeSearch || null,
  });
}

/** Append one turn; keeps the log bounded. Returns the updated convo. */
export function pushTurn(convo, turn) {
  const c = convo && Array.isArray(convo.turns) ? convo : blankConvo();
  const next = {
    turns: [...c.turns, {
      query: String(turn.query || ''),
      intent: turn.intent || null,
      constraints: turn.constraints || null,
      answer: String(turn.answer || '').slice(0, 2000),
      resultKeys: Array.isArray(turn.resultKeys) ? turn.resultKeys.slice(0, 40) : [],
      pageKeys: Array.isArray(turn.pageKeys) ? turn.pageKeys.slice(0, 40) : [],
      at: Date.now(),
    }].slice(-MAX_TURNS),
    pageSize: c.pageSize || PAGE_SIZE,
    activeSearch: turn.activeSearch !== undefined ? turn.activeSearch : (c.activeSearch || null),
  };
  saveConvo(next);
  return next;
}

/** clearConvo() — forget the conversation (memory facts survive). */
export function clearConvo() {
  write(CONVO_KEY, blankConvo());
  return blankConvo();
}

const blankMemory = () => ({ brand: '', product: '', budget: '', niche: '', preferences: {} });

/** loadMemory() -> { brand, product, budget, niche, preferences } */
export function loadMemory() {
  const m = read(MEMORY_KEY, null);
  if (!m || typeof m !== 'object') return blankMemory();
  return {
    brand: String(m.brand || ''),
    product: String(m.product || ''),
    budget: String(m.budget || ''),
    niche: String(m.niche || ''),
    preferences: (m.preferences && typeof m.preferences === 'object') ? m.preferences : {},
  };
}

/** saveMemory(memory) */
export function saveMemory(memory) {
  const m = memory || {};
  write(MEMORY_KEY, {
    brand: String(m.brand || ''),
    product: String(m.product || ''),
    budget: String(m.budget || ''),
    niche: String(m.niche || ''),
    preferences: (m.preferences && typeof m.preferences === 'object') ? m.preferences : {},
  });
}

/** Merge extracted campaign facts into memory (non-empty wins). */
export function rememberCampaignFacts(facts) {
  const m = loadMemory();
  const f = facts || {};
  const next = {
    ...m,
    brand: f.brand || m.brand,
    product: f.product || m.product,
    budget: f.budget || m.budget,
    niche: f.niche || m.niche,
    preferences: { ...m.preferences, ...(f.preferences || {}) },
  };
  saveMemory(next);
  return next;
}
