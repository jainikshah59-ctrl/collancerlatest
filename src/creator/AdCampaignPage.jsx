/* Be On Top — creator-paid profile promotion (audit §7.10).
   Plans from AD_PLANS, category selection, honestly-labeled demo checkout.
   Creates adCampaigns + the permitted creator-side adminRevenue ad_revenue entry. */
import React, { useMemo, useState } from 'react';
import { Megaphone, ArrowLeft, CheckCircle2, Timer, Tag } from 'lucide-react';
import { ensureFirebase, db, collection, addDoc, serverTimestamp } from '../lib/firebase.js';
import { AD_PLANS, CATEGORIES } from '../lib/constants.js';
import { inr, fmtDate } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Badge, Chip, EmptyState, useToast,
} from '../components/ui.jsx';
import CashfreeDemoPay from '../components/CashfreeDemoPay.jsx';

function endsMs(a) {
  if (!a?.endsAt) return 0;
  return a.endsAt.seconds ? a.endsAt.seconds * 1000 : Number(a.endsAt) || 0;
}

export default function AdCampaignPage({ creator, adCampaigns, loading, onBack, onDone }) {
  const toast = useToast();
  const [planId, setPlanId] = useState(AD_PLANS[2].id);
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cfOpen, setCfOpen] = useState(false);

  const plan = AD_PLANS.find((p) => p.id === planId) || AD_PLANS[0];

  const active = useMemo(() => {
    const now = Date.now();
    return (adCampaigns || [])
      .filter((a) => a.status === 'active' && endsMs(a) > now)
      .sort((a, b) => endsMs(a) - endsMs(b));
  }, [adCampaigns]);

  const past = useMemo(() => {
    const now = Date.now();
    return (adCampaigns || [])
      .filter((a) => !(a.status === 'active' && endsMs(a) > now))
      .sort((a, b) => endsMs(b) - endsMs(a))
      .slice(0, 5);
  }, [adCampaigns]);

  const toggleCat = (c) => setCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  async function launch(payRef, meta) {
    setCfOpen(false);
    setErr('');
    setBusy(true);
    try {
      await ensureFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db(), 'adCampaigns'), {
        creatorId: creator.id,
        creatorName: creator.name,
        creatorHandle: creator.handle,
        planId: plan.id,
        days: plan.days,
        price: plan.price,
        categories: cats,
        status: 'active',
        startedAt: serverTimestamp(),
        endsAt: now + plan.days * 86400000,
        createdAt: serverTimestamp(),
        demoPayment: true,
        paymentMethod: 'cashfree',
        paymentReference: payRef,
        cashfreeEnv: meta?.env || 'demo',
      });
      // Permitted creator-side revenue entry (audit §4 adminRevenue).
      await addDoc(collection(db(), 'adminRevenue'), {
        type: 'ad_revenue',
        bookingId: null,
        creatorId: creator.id,
        adCampaignId: ref.id,
        grossAmount: plan.price,
        creatorShare: 0,
        platformRevenue: plan.price,
        createdAt: serverTimestamp(),
      });
      toast.ok(`Be On Top is live for ${plan.days} day${plan.days > 1 ? 's' : ''}.`);
      onDone?.();
    } catch (e) {
      setErr('Could not start the boost. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page pageKey="creator-beontop">
      <TopBar title="Be On Top" subtitle="Get discovered first"
        left={<IconBtn icon={ArrowLeft} label="Back" onClick={onBack} />} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 28, display: 'grid', gap: 14 }}>
        {active.length > 0 && (
          <div>
            <div className="cl-section-title"><h3>Running now</h3></div>
            <div style={{ display: 'grid', gap: 10 }}>
              {active.map((a) => (
                <Card key={a.id} className="cl-glass" style={{ borderColor: 'var(--cyan)' }}>
                  <div className="cl-row" style={{ gap: 10 }}>
                    <Megaphone style={{ width: 20, height: 20, color: 'var(--cyan-deep)', flexShrink: 0 }} />
                    <div className="cl-grow">
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {a.days} day{a.days > 1 ? 's' : ''} boost · {inr(a.price)}
                      </div>
                      <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                        <Timer style={{ width: 12, height: 12, verticalAlign: -1 }} /> Ends {fmtDate(a.endsAt)}
                        {a.categories?.length ? ` · ${a.categories.slice(0, 3).join(', ')}${a.categories.length > 3 ? ' +' + (a.categories.length - 3) : ''}` : ''}
                      </div>
                    </div>
                    <Badge tone="cyan" icon={CheckCircle2}>Live</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Start a new boost</h3>
          <p className="cl-small cl-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Your profile jumps to the top of brand discovery, optionally filtered by category.
          </p>
          <div className="cl-small" style={{ fontWeight: 700, marginBottom: 8 }}>1 · Pick a duration</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            {AD_PLANS.map((p) => (
              <button key={p.id} onClick={() => setPlanId(p.id)}
                className={`cl-card pressable ${planId === p.id ? '' : ''}`}
                style={{
                  padding: 12, cursor: 'pointer', textAlign: 'left',
                  border: planId === p.id ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
                }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{p.days} day{p.days > 1 ? 's' : ''}</div>
                <div className="cl-money" style={{ color: 'var(--cyan-deep)', marginTop: 2 }}>{inr(p.price)}</div>
                <div className="cl-small cl-muted">{inr(Math.round(p.price / p.days))}/day</div>
              </button>
            ))}
          </div>
          <div className="cl-small" style={{ fontWeight: 700, marginBottom: 8 }}>2 · Promotion categories</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} on={cats.includes(c)} cyan={cats.includes(c)} onClick={() => toggleCat(c)} icon={Tag}>
                {c}
              </Chip>
            ))}
          </div>
          <Card style={{ background: 'var(--surface-2)', marginBottom: 14, padding: 12 }}>
            <div className="cl-kv"><dt>Plan</dt><dd>{plan.days} day{plan.days > 1 ? 's' : ''}</dd></div>
            <div className="cl-kv"><dt>Total</dt><dd className="cl-money" style={{ color: 'var(--cyan-deep)' }}>{inr(plan.price)}</dd></div>
            <div className="cl-small cl-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
              Cashfree demo page — no real money moves. This simulates the purchase so you can experience the flow.
            </div>
          </Card>
          {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
          <Button block size="lg" loading={busy} onClick={() => {
            setErr('');
            if (!cats.length) return setErr('Pick at least one promotion category for the boost.');
            setCfOpen(true);
          }} icon={Megaphone}>
            Pay via Cashfree · {inr(plan.price)}
          </Button>
          <CashfreeDemoPay
            open={cfOpen}
            amount={plan.price}
            purpose={`Be On Top boost — ${plan.days} day${plan.days > 1 ? 's' : ''}`}
            customer={{ id: creator?.id, email: creator?.email, phone: creator?.whatsapp }}
            onClose={() => setCfOpen(false)}
            onSuccess={launch}
          />
        </Card>

        {past.length > 0 && (
          <div>
            <div className="cl-section-title"><h3>Past boosts</h3></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {past.map((a) => (
                <Card key={a.id} style={{ padding: 12 }}>
                  <div className="cl-row" style={{ gap: 10 }}>
                    <div className="cl-grow cl-small">
                      <strong>{a.days} day{a.days > 1 ? 's' : ''}</strong> · {inr(a.price)} · ended {fmtDate(a.endsAt)}
                    </div>
                    <Badge tone="grey">Ended</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
