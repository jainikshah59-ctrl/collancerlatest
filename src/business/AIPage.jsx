/* Business AI page — thin wrapper over the shared CleoPanel (src/ai/CleoPanel.jsx).
   mode="business", context { user, creators, isPro }.
   onAction: { type: 'book', creator } -> opens the booking flow. */
import React, { Suspense, lazy } from 'react';
import { Sparkles } from 'lucide-react';
import { useBiz, isBizPro } from './ctx.jsx';
import { Page } from '../components/ui.jsx';

const CleoPanel = lazy(() => import('../ai/CleoPanel.jsx'));

function PanelFallback() {
  return (
    <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="cl-fade" style={{ textAlign: 'center' }}>
        <Sparkles style={{ width: 30, height: 30, color: 'var(--cyan-deep)', margin: '0 auto 12px' }} />
        <p className="cl-small cl-muted">Loading Collancer AI…</p>
      </div>
    </div>
  );
}

function PanelUnavailable() {
  return (
    <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="cl-fade" style={{ textAlign: 'center', maxWidth: 340 }}>
        <Sparkles style={{ width: 30, height: 30, color: 'var(--faint)', margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: 17, marginBottom: 8 }}>AI is unavailable right now</h3>
        <p className="cl-small cl-muted" style={{ lineHeight: 1.65 }}>
          The assistant module could not be loaded. You can still browse creators from the Discover tab.
        </p>
      </div>
    </div>
  );
}

class PanelBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.error('[ai-page] cleo panel', e); }
  render() {
    return this.state.failed ? <PanelUnavailable /> : this.props.children;
  }
}

export default function AIPage() {
  const { user, biz, creators, openBooking } = useBiz();
  const context = { user, creators: creators || [], isPro: isBizPro(biz), extra: { bizName: biz?.bizName } };

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'book' && action.creator) {
      openBooking(action.creator);
    }
  }

  return (
    <Page pageKey="ai">
      {/* fixed chat shell: conversation scrolls, composer stays pinned above the bottom nav.
          No global top bar on this tab — the assistant's own bar is the top bar. */}
      <div style={{
        height: 'calc(100dvh - var(--nav-h) - env(safe-area-inset-bottom))',
        marginBottom: 'calc(-1 * (var(--nav-h) + 28px))',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <PanelBoundary>
          <Suspense fallback={<PanelFallback />}>
            <CleoPanel mode="business" context={context} onAction={handleAction} />
          </Suspense>
        </PanelBoundary>
      </div>
    </Page>
  );
}
