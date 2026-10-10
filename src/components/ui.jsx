/* Collancer UI kit — shared primitives. Lucide icons only, no emojis. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info, Loader2, Search as SearchIcon, ChevronDown, Check, Moon, Sun, Crown } from 'lucide-react';
import { initials } from '../lib/format.js';

/* ---------------- Theme (light / dark / pro gold) ---------------- */
const THEME_KEY = 'collancer_theme';
const GOLD_KEY = 'collancer_gold';
export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
function getGoldOn() {
  try { return localStorage.getItem(GOLD_KEY) !== 'off'; } /* Pro gold defaults ON */
  catch { return true; }
}
export function applyTheme(t) {
  const theme = t === 'gold' ? 'gold' : t === 'dark' ? 'dark' : 'light';
  try {
    document.documentElement.dataset.theme = theme;
    // 'gold' is derived from Pro status, never persisted as the manual choice
    if (theme !== 'gold') localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#ffffff' : '#0b0d11';
  } catch { /* noop */ }
}
/* Manual light/dark choice — shared across the whole app via an external store,
   so the menu toggle and the app-level effect always see the same value. */
let manualTheme = getTheme();
const themeListeners = new Set();
function emitTheme() { themeListeners.forEach((l) => { try { l(); } catch { /* noop */ } }); }
function subscribeTheme(l) { themeListeners.add(l); return () => { themeListeners.delete(l); }; }
function getManualThemeSnap() { return manualTheme; }
export function setManualTheme(t) {
  manualTheme = t === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, manualTheme); } catch { /* noop */ }
  emitTheme();
}
export function useManualTheme() {
  const manual = useSyncExternalStore(subscribeTheme, getManualThemeSnap, getManualThemeSnap);
  const toggleManual = useCallback(() => {
    setManualTheme(manualTheme === 'dark' ? 'light' : 'dark');
  }, []);
  return [manual, toggleManual];
}
/* Premium gold toggle — Pro-only, shared external store, defaults ON. */
let goldOn = getGoldOn();
const goldListeners = new Set();
function emitGold() { goldListeners.forEach((l) => { try { l(); } catch { /* noop */ } }); }
function subscribeGold(l) { goldListeners.add(l); return () => { goldListeners.delete(l); }; }
function getGoldSnap() { return goldOn; }
export function setGoldOn(v) {
  goldOn = !!v;
  try { localStorage.setItem(GOLD_KEY, goldOn ? 'on' : 'off'); } catch { /* noop */ }
  emitGold();
}
export function useGoldTheme() {
  const on = useSyncExternalStore(subscribeGold, getGoldSnap, getGoldSnap);
  const toggleGold = useCallback(() => { setGoldOn(!goldOn); }, []);
  return [on, toggleGold];
}
/* Effective theme: Pro + gold enabled => gold; otherwise the manual light/dark. */
export function useEffectiveTheme(isPro) {
  const [manual, toggleManual] = useManualTheme();
  const [gold] = useGoldTheme();
  const effective = isPro && gold ? 'gold' : manual;
  useEffect(() => { applyTheme(effective); }, [effective]);
  return [effective, toggleManual, manual];
}
export function ThemeToggle({ pro }) {
  const [manual, toggleManual] = useManualTheme();
  const [gold, toggleGold] = useGoldTheme();
  if (pro) {
    const dark = manual === 'dark';
    return (
      <>
        <div
          onClick={toggleGold}
          role="switch"
          aria-checked={gold}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGold(); } }}
          className="cl-card pressable"
          style={{
            display: 'flex', gap: 12, alignItems: 'center', width: '100%',
            textAlign: 'left', cursor: 'pointer', marginBottom: 10,
            borderColor: 'rgba(212,175,55,.45)',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(212,175,55,.28), rgba(212,175,55,.12))',
            display: 'grid', placeItems: 'center', color: '#d4af37',
          }}>
            <Crown style={{ width: 18, height: 18 }} />
          </div>
          <div className="cl-grow">
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Premium gold theme</div>
            <div className="cl-small cl-muted">Your exclusive Pro look</div>
          </div>
          <span onClick={(e) => e.stopPropagation()}>
            <Toggle on={gold} onChange={toggleGold} />
          </span>
        </div>
        {!gold && (
          <div
            onClick={toggleManual}
            role="switch"
            aria-checked={dark}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleManual(); } }}
            className="cl-card pressable"
            style={{
              display: 'flex', gap: 12, alignItems: 'center', width: '100%',
              textAlign: 'left', cursor: 'pointer', marginBottom: 10,
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center',
              color: 'var(--cyan-deep)',
            }}>
              {dark ? <Sun style={{ width: 18, height: 18 }} /> : <Moon style={{ width: 18, height: 18 }} />}
            </div>
            <div className="cl-grow">
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{dark ? 'Light mode' : 'Dark mode'}</div>
              <div className="cl-small cl-muted">Switch the app appearance</div>
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle on={dark} onChange={toggleManual} />
            </span>
          </div>
        )}
      </>
    );
  }
  const dark = manual === 'dark';
  return (
    <div
      onClick={toggleManual}
      role="switch"
      aria-checked={dark}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleManual(); } }}
      className="cl-card pressable"
      style={{
        display: 'flex', gap: 12, alignItems: 'center', width: '100%',
        textAlign: 'left', cursor: 'pointer', marginBottom: 10,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
        background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center', color: 'var(--cyan-deep)',
      }}>
        {dark ? <Sun style={{ width: 18, height: 18 }} /> : <Moon style={{ width: 18, height: 18 }} />}
      </div>
      <div className="cl-grow">
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{dark ? 'Light mode' : 'Dark mode'}</div>
        <div className="cl-small cl-muted">{dark ? 'Switch back to the light theme' : 'Dim the lights — easy on the eyes'}</div>
      </div>
      {/* stopPropagation: the switch handles its own tap, otherwise the row toggles twice */}
      <span onClick={(e) => e.stopPropagation()}>
        <Toggle on={dark} onChange={toggleManual} />
      </span>
    </div>
  );
}

/* ---------------- Toast ---------------- */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((msg, kind = 'info') => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const api = {
    ok: (m) => push(m, 'ok'),
    err: (m) => push(m, 'err'),
    info: (m) => push(m, 'info'),
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="cl-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`cl-toast ${t.kind}`}>
            {t.kind === 'ok' ? <CheckCircle2 /> : t.kind === 'err' ? <AlertCircle /> : <Info />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx) || { ok() {}, err() {}, info() {} };

/* ---------------- Buttons ---------------- */
export function Button({ variant = 'dark', size, block, loading, icon: Icon, children, ...rest }) {
  const cls = ['cl-btn', `cl-btn-${variant}`];
  if (size) cls.push(`cl-btn-${size}`);
  if (block) cls.push('cl-btn-block');
  const hasLabel = children !== undefined && children !== null && children !== false && children !== '';
  return (
    <button className={cls.join(' ')} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 className="lucide spin" /> : Icon ? <Icon /> : null}
      {hasLabel ? <span className="cl-btn-label">{children}</span> : children}
    </button>
  );
}

export function IconBtn({ icon: Icon, label, ...rest }) {
  return (
    <button
      aria-label={label || 'button'}
      {...rest}
      style={{
        width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line)',
        background: 'linear-gradient(180deg, var(--glass-hi), var(--glass-lo))', display: 'grid', placeItems: 'center',
        cursor: 'pointer', color: 'var(--ink-2)', flexShrink: 0,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        transition: 'transform .15s var(--ease)',
        ...rest.style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.9)'; rest.onMouseDown?.(e); }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; rest.onMouseUp?.(e); }}
    >
      <Icon style={{ width: 18, height: 18 }} />
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({ pressable, lift, style, children, onClick, className = '' }) {
  return (
    <div
      className={`cl-card ${pressable ? 'pressable' : ''} ${lift ? 'lift' : ''} ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/* ---------------- Fields ---------------- */
export function Field({ label, hint, error, children }) {
  return (
    <div className="cl-field">
      {label && <label className="cl-label">{label}</label>}
      {children}
      {error ? <div className="cl-error-text">{error}</div> : hint ? <div className="cl-hint">{hint}</div> : null}
    </div>
  );
}
export const Input = React.forwardRef((props, ref) => <input ref={ref} className="cl-input" {...props} />);
export const TextArea = React.forwardRef((props, ref) => <textarea ref={ref} className="cl-textarea" {...props} />);
/* Custom 3D glass dropdown — replaces the native browser select popup.
   Drop-in compatible: <Select value onChange={(e) => set(e.target.value)}><option/></Select> */
function optionLabel(node) {
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(optionLabel).join('');
  if (typeof node === 'object') return '';
  return String(node);
}
export function Select({ children, value, onChange, placeholder = 'Select…', disabled, style, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);

  const opts = useMemo(() => React.Children.toArray(children)
    .filter((c) => c && c.type === 'option')
    .map((o, i) => ({
      key: o.key ?? i,
      value: o.props.value ?? '',
      label: optionLabel(o.props.children) || String(o.props.value ?? ''),
    })), [children]);

  const current = opts.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open ]);

  function toggle() {
    if (disabled) return;
    if (!open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const menuH = Math.min(260, 48 * opts.length + 12);
      const flip = r.bottom + menuH + 12 > window.innerHeight;
      setPos({
        left: r.left + window.scrollX,
        width: r.width,
        top: flip ? undefined : r.bottom + window.scrollY + 6,
        bottom: flip ? window.innerHeight - r.top - window.scrollY + 6 : undefined,
      });
    }
    setOpen((o) => !o);
  }

  function pick(v) {
    setOpen(false);
    onChange?.({ target: { value: v } });
  }

  return (
    <div ref={wrapRef} className="cl-select-wrap" style={style}>
      <button
        type="button"
        className="cl-input cl-select-btn"
        aria-label={ariaLabel || placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .55 : 1, textAlign: 'left' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: current ? 'var(--ink)' : 'var(--faint)' }}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown style={{ width: 17, height: 17, color: 'var(--faint)', flexShrink: 0, transition: 'transform .25s var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="cl-select-backdrop" onClick={() => setOpen(false)} />
          <div
            className="cl-select-menu cl-pop"
            role="listbox"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          >
            {opts.map((o) => {
              const on = String(o.value) === String(value);
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`cl-select-opt ${on ? 'on' : ''}`}
                  onClick={() => pick(o.value)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {on && <Check style={{ width: 16, height: 16, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div className="cl-search" style={style}>
      <SearchIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search"
          style={{ border: 0, background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--faint)' }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      )}
    </div>
  );
}
// ---- end SearchInput helpers ----

/* ---------------- Tabs ---------------- */
export function Tabs({ tabs, value, onChange, style, className = '' }) {
  return (
    <div className={`cl-tabs ${className}`.trim()} style={style} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key} role="tab" aria-selected={value === t.key}
          className={`cl-tab ${value === t.key ? 'on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.icon ? <t.icon /> : null}{t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal / Sheet ---------------- */
function useLockBody(open) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open ]);
}

export function Sheet({ open, onClose, children, labelledBy }) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    if (render) {
      setClosing(true);
      const t = setTimeout(() => { setRender(false); setClosing(false); }, 240);
      return () => clearTimeout(t);
    }
  }, [open, render]);
  useLockBody(render);
  useEffect(() => {
    if (!render) return;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [render, onClose]);
  if (!render) return null;
  return (
    <div className={`cl-overlay ${closing ? 'closing' : ''}`} onClick={onClose} role="dialog" aria-modal="true" aria-label={labelledBy}>
      <div className={`cl-sheet ${closing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="cl-sheet-grip" />
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, children, wide }) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    if (render) {
      setClosing(true);
      const t = setTimeout(() => { setRender(false); setClosing(false); }, 240);
      return () => clearTimeout(t);
    }
  }, [open, render]);
  useLockBody(render);
  useEffect(() => {
    if (!render) return;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [render, onClose]);
  if (!render) return null;
  return (
    <div className={`cl-overlay ${closing ? 'closing' : ''}`} onClick={onClose} role="dialog" aria-modal="true">
      <div className={`cl-modal ${closing ? 'closing' : ''}`} style={wide ? { maxWidth: 640 } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, title, body, confirmLabel = 'Confirm', danger, onConfirm, loading }) {
  return (
    <Modal open={open} onClose={onClose}>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
      <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>{body}</p>
      <div className="cl-row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'dark'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Badge / Chip / Avatar ---------------- */
export function Badge({ tone = 'grey', icon: Icon, children }) {
  return <span className={`cl-badge ${tone}`}>{Icon ? <Icon /> : null}{children}</span>;
}
export function Chip({ on, cyan, tag, children, onClick, icon: Icon }) {
  return (
    <button
      className={`cl-chip ${on ? 'on' : ''} ${cyan ? 'cyan' : ''} ${tag ? 'tag' : ''}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {Icon ? <Icon style={{ width: 13, height: 13 }} /> : null}{children}
    </button>
  );
}
export function Avatar({ src, name, size = 48, className = '', pro = false, style }) {
  const [err, setErr] = useState(false);
  /* 3D golden glowing Pro ring */
  const goldRing = pro ? {
    padding: 2.5, border: 0,
    background: 'conic-gradient(from 210deg, #fef3c7, #fbbf24, #b45309, #fde68a, #f59e0b, #fef3c7)',
    boxShadow: '0 0 14px 3px rgba(245,158,11,.55), 0 0 30px 6px rgba(245,158,11,.22)',
  } : null;
  if (!src || err) {
    return (
      <div className={`cl-avatar ${className}`} style={{
        width: size, height: size, display: 'grid', placeItems: 'center',
        ...(goldRing || {}), ...style,
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, var(--cyan-soft), #f1f5f9)',
          fontWeight: 700, color: 'var(--cyan-deep)', fontSize: size * 0.36,
          fontFamily: 'var(--font-display)',
        }}>
          {initials(name)}
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name || 'avatar'}
      className={`cl-avatar ${className}`}
      onError={() => setErr(true)}
      style={{ width: size, height: size, ...(goldRing || {}), ...style }}
    />
  );
}

/* ---------------- Empty / Skeleton / Stat ---------------- */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="cl-empty">
      {Icon && <div className="cl-empty-icon"><Icon /></div>}
      <h4>{title}</h4>
      <p>{body}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }) {
  return <div className="cl-skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
export function SkeletonCard() {
  return (
    <Card>
      <div className="cl-row"><Skeleton h={44} w={44} r={22} /><div className="cl-grow"><Skeleton h={14} w="60%" /><div style={{ height: 8 }} /><Skeleton h={12} w="40%" /></div></div>
      <div style={{ height: 12 }} /><Skeleton h={12} /><div style={{ height: 8 }} /><Skeleton h={12} w="80%" />
    </Card>
  );
}

export function Stat({ label, value, icon: Icon, tone, className = '' }) {
  return (
    <Card className={`cl-stat-card ${className}`.trim()} style={{ padding: 14 }}>
      <div className="cl-row cl-stat-layout" style={{ gap: 10 }}>
        {Icon && (
          <div className="cl-stat-icon" style={{
            width: 38, height: 38, borderRadius: 8, display: 'grid', placeItems: 'center',
            background: tone === 'cyan' ? 'var(--cyan-soft)' : 'var(--surface-2)',
            color: tone === 'cyan' ? 'var(--cyan-deep)' : 'var(--ink-2)', flexShrink: 0,
          }}>
            <Icon style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div className="cl-stat-copy">
          <div className="cl-money cl-stat-value">{value}</div>
          <div className="cl-small cl-muted cl-stat-label">{label}</div>
        </div>
      </div>
    </Card>
  );
}

export function ProgressBar({ value }) {
  return <div className="cl-progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Toggle({ on, onChange }) {
  return <button className={`cl-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} aria-label="Toggle" />;
}

/* ---------------- TopBar / BottomNav ---------------- */
export function TopBar({ title, left, right, subtitle, brand, pro }) {
  return (
    <header className="cl-topbar">
      {brand ? (
        <>
          <Logo size={34} style={{ flexShrink: 0 }} />
          <div className="cl-grow" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
                letterSpacing: '-.02em', lineHeight: 1.05, whiteSpace: 'nowrap',
              }}>Collancer</div>
              {pro && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontWeight: 800, letterSpacing: '.08em',
                  padding: '3px 8px', borderRadius: 6, marginLeft: 10, flexShrink: 0,
                  background: 'linear-gradient(180deg, rgba(212,175,55,.28), rgba(212,175,55,.12))',
                  border: '1px solid rgba(212,175,55,.5)', color: '#d4af37',
                  boxShadow: 'inset 0 1px 0 rgba(240,215,120,.25)',
                }}>
                  <Crown style={{ width: 10, height: 10 }} />PRO
                </span>
              )}
            </div>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '.06em',
              color: 'var(--cyan-deep)', marginTop: 2, whiteSpace: 'nowrap',
            }}>WHERE INFLUENCE MEETS INDUSTRY</div>
          </div>
        </>
      ) : (
        <>
          {left}
          <div className="cl-grow" style={{ minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
            {subtitle && <div className="cl-small cl-muted" style={{ marginTop: 1 }}>{subtitle}</div>}
          </div>
        </>
      )}
      {right}
    </header>
  );
}

export function BottomNav({ items, value, onChange }) {
  return (
    <nav className="cl-bottomnav" aria-label="Primary">
      {items.map((it) => (
        <button key={it.key} className={value === it.key ? 'on' : ''} onClick={() => onChange(it.key)} aria-label={it.label}>
          <it.icon />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------------- Error boundary ---------------- */
export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('[ui] boundary', err); }
  render() {
    if (this.state.err) {
      return (
        <div className="cl-container" style={{ paddingTop: 48 }}>
          <EmptyState
            icon={AlertCircle} title="Something went wrong"
            body="This section hit an unexpected error. Your data is safe — try reloading."
            action={<Button onClick={() => window.location.reload()}>Reload</Button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Page transition wrapper ---------------- */
export function Page({ pageKey, children, className = '' }) {
  return <div key={pageKey} className={`cl-page-anim ${className}`}>{children}</div>;
}

/* ---------------- Instagram-style verified tick ---------------- */
export function VerifiedTick({ size = 16, style }) {
  /* Instagram-style verified seal — a soft flower/rosette, not a plain circle. */
  const lobes = 12, amp = 0.075, steps = lobes * 6;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = 11.2 * (1 - amp + amp * Math.cos(a * lobes));
    const x = (12 + r * Math.cos(a)).toFixed(2), y = (12 + r * Math.sin(a)).toFixed(2);
    d += (i === 0 ? 'M' : 'L') + x + ' ' + y;
  }
  d += 'Z';
  const gid = 'vtick';
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-2px', ...style }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4cc3ff" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.7" />
      <path d="M8.2 12.3l2.5 2.6 5-5.4" fill="none" stroke="#fff" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Brand logo ---------------- */
export function Logo({ size = 64, radius, style }) {
  const r = radius ?? Math.round(size * 0.14);
  return (
    <img
      src="/logo.png"
      alt="Collancer"
      width={size}
      height={size}
      draggable={false}
      style={{
        width: size, height: size, borderRadius: r, display: 'block',
        boxShadow: 'var(--shadow-btn)', objectFit: 'cover', ...style,
      }}
    />
  );
}

/* ---------------- Deadline countdown (72h windows) ---------------- */
export function DeadlineCountdown({ deadline, label }) {
  const [_now, _setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => _setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - _now;
  if (ms <= 0) return (
    <span className="cl-small" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>
      {label} expired
    </span>
  );
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const urgent = h < 12;
  return (
    <span className="cl-small" style={{ color: urgent ? 'var(--danger, #dc2626)' : 'var(--amber, #d97706)', fontWeight: 600 }}>
      {label}: {h}h {m}m left
    </span>
  );
}
