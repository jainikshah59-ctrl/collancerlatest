/* Creator AI — thin wrapper over the shared CleoPanel in creator mode.
   NOTE (contract deviation): the task brief cited '../../ai/CleoPanel.jsx', which would
   resolve outside src/. The canonical contract path is src/ai/CleoPanel.jsx, i.e.
   '../ai/CleoPanel.jsx' from here. Loaded lazily so the creator module builds and runs
   even before the AI module lands. */
import React, { Suspense } from 'react';
import { Sparkles } from 'lucide-react';
import { Page, Card, Skeleton, EmptyState } from '../components/ui.jsx';

const CleoPanel = React.lazy(() => import('../ai/CleoPanel.jsx'));

function PanelFallback() {
  return (
    <Card>
      <Skeleton h={18} w="70%" />
      <div style={{ height: 10 }} />
      <Skeleton h={14} w="95%" />
      <div style={{ height: 8 }} />
      <Skeleton h={14} w="85%" />
      <div style={{ height: 14 }} />
      <Skeleton h={120} r={16} />
    </Card>
  );
}

function PanelMissing() {
  return (
    <EmptyState
      icon={Sparkles}
      title="Creator AI is being set up"
      body="Your AI assistant will appear here shortly — with booking answers, earnings explainers, pricing guidance and pitch drafting."
    />
  );
}

class PanelGuard extends React.Component {
  constructor(p) { super(p); this.state = { missing: false }; }
  static getDerivedStateFromError() { return { missing: true }; }
  render() { return this.state.missing ? <PanelMissing /> : this.props.children; }
}

export default function CreatorAIPage({ creator, bookings, payouts, verification, onBack }) {
  const context = {
    user: creator,
    creator,
    bookings: bookings || [],
    payouts: payouts || [],
    verification: verification || null,
    extra: { role: 'creator' },
  };
  return (
    <Page pageKey="creator-ai">
      {/* fixed chat shell: conversation scrolls, composer stays pinned above the bottom nav.
          No app top bar here — the assistant's own bar is the top bar (back goes via onBack). */}
      <div style={{
        height: 'calc(100dvh - var(--nav-h) - env(safe-area-inset-bottom))',
        marginBottom: 'calc(-1 * (var(--nav-h) + 28px))',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        padding: '0 16px',
      }}>
        <PanelGuard>
          <Suspense fallback={<PanelFallback />}>
            <CleoPanel mode="creator" context={context} onAction={() => {}} onBack={onBack} />
          </Suspense>
        </PanelGuard>
      </div>
    </Page>
  );
}
