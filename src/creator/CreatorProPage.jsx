/* Creator Pro — plans, features, honestly-labeled demo checkout (audit §7.13).
   Purchase writes creators/{uid} {creatorIsPro, creatorProPlan, creatorProExpiresAt}
   + creatorProPayments log. Expiry is revoked by CreatorApp (snapshot + 60s). */
import React, { useState } from 'react';
import { Crown, ArrowLeft, CheckCircle2, Store, Video, Percent, BadgeCheck, Timer } from 'lucide-react';
import { ensureFirebase, db, doc, collection, addDoc, updateDoc, serverTimestamp } from '../lib/firebase.js';
import { CREATOR_PRO_PLANS } from '../lib/constants.js';
import { inr, fmtDate } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Badge, useToast,
} from '../components/ui.jsx';
import CashfreeDemoPay from '../components/CashfreeDemoPay.jsx';

const FEATURES = [
  { icon: Store, title: 'Requirements Marketplace', desc: 'Browse brand briefs and pitch proposals directly.' },
  { icon: Video, title: 'Personal Ad Shoot', desc: 'Unlock the premium dedicated ad-shoot package.' },
  { icon: Percent, title: 'MRP + discounted pricing', desc: 'Show a strike-through MRP with your deal price in discovery.' },
  { icon: BadgeCheck, title: 'Pro badge', desc: 'Stand out with the Pro ring on your profile.' },
];

function expMs(v) {
  if (!v) return 0;
  return v.seconds ? v.seconds * 1000 : Number(v) || 0;
}

export default function CreatorProPage({ creator, onBack }) {
  const toast = useToast();
  const [planId, setPlanId] = useState(CREATOR_PRO_PLANS[1].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cfOpen, setCfOpen] = useState(false);

  const plan = CREATOR_PRO_PLANS.find((p) => p.id === planId) || CREATOR_PRO_PLANS[0];
  const active = creator?.creatorIsPro && expMs(creator.creatorProExpiresAt) > Date.now();

  async function buy(ref, meta) {
    setCfOpen(false);
    setErr('');
    setBusy(true);
    try {
      await ensureFirebase();
      const expiresAt = Date.now() + plan.days * 86400000;
      await updateDoc(doc(db(), 'creators', creator.id), {
        creatorIsPro: true,
        creatorProPlan: plan.id,
        creatorProExpiresAt: expiresAt,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db(), 'creatorProPayments'), {
        creatorId: creator.id,
        plan: plan.id,
        days: plan.days,
        amount: plan.total,
        method: 'cashfree',
        paymentReference: ref,
        cashfreeEnv: meta?.env || 'demo',
        demo: true,
        createdAt: serverTimestamp(),
      });
      toast.ok(`Creator Pro ${plan.label} activated for ${plan.days} days.`);
    } catch (e) {
      setErr('Could not activate Pro. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page pageKey="creator-pro">
      <TopBar title="Creator Pro" subtitle="Grow faster on Collancer"
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 28, display: 'grid', gap: 14 }}>
        {active ? (
          <Card className="cl-glass" style={{ borderColor: 'var(--cyan)', textAlign: 'center', padding: 24 }}>
            <Crown style={{ width: 38, height: 38, color: 'var(--cyan-deep)', margin: '0 auto 10px' }} />
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Pro is active</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
              Plan: <strong>{CREATOR_PRO_PLANS.find((p) => p.id === creator.creatorProPlan)?.label || creator.creatorProPlan}</strong>
              {' '}· valid till <strong>{fmtDate(creator.creatorProExpiresAt)}</strong>
            </p>
            <Badge tone="dark" icon={BadgeCheck} style={{ marginTop: 10 }}>Pro member</Badge>
          </Card>
        ) : (
          <Card className="cl-glass" style={{ textAlign: 'center', padding: 24 }}>
            <Crown style={{ width: 38, height: 38, color: 'var(--cyan-deep)', margin: '0 auto 10px' }} />
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>Creator Pro</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.65 }}>
              Everything you need to win more brand deals — marketplace access, premium
              packages and pricing that converts.
            </p>
          </Card>
        )}

        <div>
          <div className="cl-section-title"><h3>What you get</h3></div>
          <div style={{ display: 'grid', gap: 10 }}>
            {FEATURES.map((f) => (
              <Card key={f.title} style={{ padding: 14 }}>
                <div className="cl-row" style={{ gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <f.icon style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{f.title}</div>
                    <div className="cl-small cl-muted" style={{ marginTop: 2, lineHeight: 1.55 }}>{f.desc}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="cl-section-title"><h3>Choose a plan</h3></div>
          <div style={{ display: 'grid', gap: 10 }}>
            {CREATOR_PRO_PLANS.map((p) => {
              const on = planId === p.id;
              return (
                <button key={p.id} onClick={() => setPlanId(p.id)}
                  className="cl-card pressable"
                  aria-pressed={on}
                  style={{
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    border: '1px solid var(--line-soft)',
                    outline: on ? '2px solid var(--cyan)' : 'none',
                    outlineOffset: -1,
                    boxShadow: on ? '0 0 0 4px var(--cyan-glow)' : undefined,
                    padding: 16,
                  }}>
                  <div className="cl-row" style={{ gap: 10 }}>
                    <div className="cl-grow">
                      <div className="cl-row" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{p.label}</span>
                        {p.tag && <Badge tone="cyan">{p.tag}</Badge>}
                      </div>
                      <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                        {p.days} days · {inr(Math.round(p.total / p.days))}/day
                      </div>
                    </div>
                    <div className="cl-money" style={{ fontSize: 18 }}>{inr(p.total)}</div>
                    {on && <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--cyan-deep)', flexShrink: 0 }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {!active && (
          <Card>
            <div className="cl-kv"><dt>Plan</dt><dd>{plan.label} ({plan.days} days)</dd></div>
            <div className="cl-kv">
              <dt>Total</dt>
              <dd className="cl-money" style={{ color: 'var(--cyan-deep)', fontSize: 16 }}>{inr(plan.total)}</dd>
            </div>
            <div className="cl-small cl-muted" style={{ margin: '8px 0 12px', lineHeight: 1.6 }}>
              Cashfree demo page — no real money moves. This simulates the purchase so you can experience the flow.
            </div>
            {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
            <Button block size="lg" loading={busy} onClick={() => setCfOpen(true)} icon={Crown}>
              Pay via Cashfree · {inr(plan.total)}
            </Button>
            <CashfreeDemoPay
              open={cfOpen}
              amount={plan.total}
              purpose={`Creator Pro — ${plan.label}`}
              customer={{ id: creator?.id, email: creator?.email, phone: creator?.whatsapp }}
              onClose={() => setCfOpen(false)}
              onSuccess={buy}
            />
            <div className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 10 }}>
              <Timer style={{ width: 13, height: 13, verticalAlign: -2 }} /> Pro expires automatically after {plan.days} days.
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}
