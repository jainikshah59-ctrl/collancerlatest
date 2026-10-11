/* Business Pro — plans from BUSINESS_PRO_PLANS, benefits, honestly-labeled demo
   checkout, purchase writes businesses/{uid} {isPro, proActive, proPlan,
   proExpiresAt, proPurchasedAt} + proPayments log. ProStatusPage for active state.
   Expiry check lives in BusinessApp (snapshot + 60s interval). */
import React, { useState } from 'react';
import {
  Crown, Check, Store, Sparkles, BadgePercent, BarChart3, PlayCircle,
  Info, X, CalendarClock, RefreshCw,
} from 'lucide-react';
import { useBiz, isBizPro } from './ctx.jsx';
import {
  ensureFirebase, updateDoc, doc, addDoc, collection, serverTimestamp,
} from '../lib/firebase.js';
import { BUSINESS_PRO_PLANS } from '../lib/constants.js';
import { inr, fmtDate } from '../lib/format.js';
import {
  Card, Button, Badge, Sheet, Page, useToast,
} from '../components/ui.jsx';
import CashfreeDemoPay from '../components/CashfreeDemoPay.jsx';

const BENEFITS = [
  { icon: Store, title: 'Requirements Marketplace', desc: 'Post briefs and receive creator offers.' },
  { icon: Sparkles, title: 'Collancer AI Assistant', desc: 'AI-powered creator discovery and campaign help.' },
  { icon: BadgePercent, title: '5% booking discount', desc: 'Save 5% on every creator package price.' },
  { icon: BarChart3, title: 'Deeper analytics', desc: 'Engagement, audience and campaign estimates per creator.' },
  { icon: PlayCircle, title: 'Promotion demo videos', desc: 'Watch creator portfolio demos before you book.' },
];

function CheckoutSheet({ plan, open, onClose, onDone }) {
  const toast = useToast();
  const { user, biz } = useBiz();
  const [cfOpen, setCfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function purchase(ref, meta) {
    setCfOpen(false);
    setError('');
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const expiresAt = new Date(Date.now() + plan.months * 30 * 24 * 3600 * 1000);
      await updateDoc(doc(db, 'businesses', user.uid), {
        isPro: true,
        proActive: true,
        proPlan: plan.id,
        proExpiresAt: expiresAt,
        proPurchasedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'proPayments'), {
        bizId: user.uid,
        plan: plan.id,
        planLabel: plan.label,
        amount: plan.total,
        method: 'cashfree',
        paymentReference: ref,
        cashfreeEnv: meta?.env || 'demo',
        demo: true,
        createdAt: serverTimestamp(),
      });
      toast.ok('Collancer Pro activated. Enjoy the benefits.');
      onDone();
    } catch (err) {
      console.error('[pro] purchase', err);
      setError('Could not activate Pro. Please try again.');
    } finally { setBusy(false); }
  }

  if (!plan) return null;
  return (
    <Sheet open={open} onClose={onClose} labelledBy="Pro checkout">
      <div className="cl-row" style={{ marginBottom: 12 }}>
        <div className="cl-grow">
          <h3 style={{ fontSize: 18 }}>Activate Pro — {plan.label}</h3>
          <p className="cl-small cl-muted" style={{ marginTop: 2 }}>{inr(plan.total)} · {plan.months} month{plan.months > 1 ? 's' : ''}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X style={{ width: 18, height: 18 }} /></Button>
      </div>

      <Card style={{ marginBottom: 12, background: 'var(--cyan-soft)', borderColor: 'transparent' }}>
        <div className="cl-row" style={{ gap: 8 }}>
          <Info style={{ width: 16, height: 16, color: 'var(--cyan-deep)', flexShrink: 0 }} />
          <strong style={{ fontSize: 13, color: 'var(--cyan-deep)' }}>Cashfree demo page — no real money moves</strong>
        </div>
        <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Pay via a Cashfree-style page (UPI, cards, netbanking). It is simulated for demo — connect a Cashfree account to accept live payments.
        </p>
      </Card>

      {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
      <Button block size="lg" loading={busy} icon={Crown} onClick={() => setCfOpen(true)}>
        Pay via Cashfree · {inr(plan.total)}
      </Button>
      <CashfreeDemoPay
        open={cfOpen}
        amount={plan.total}
        purpose={`Business Pro — ${plan.label}`}
        customer={{ id: user?.uid, email: biz?.email || user?.email, phone: biz?.whatsapp }}
        onClose={() => setCfOpen(false)}
        onSuccess={purchase}
      />
    </Sheet>
  );
}

export function ProStatusPage() {
  const { biz, goPage } = useBiz();
  const plan = BUSINESS_PRO_PLANS.find((p) => p.id === biz?.proPlan);
  return (
    <Page pageKey="pro-status">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <Card className="cl-fade" style={{
          background: 'linear-gradient(135deg,#0b0b0c 0%,#12333b 100%)',
          border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'center', padding: '30px 22px', marginBottom: 14,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 10, margin: '0 auto 14px',
            background: 'rgba(6,182,212,.18)', border: '1px solid rgba(6,182,212,.4)',
            display: 'grid', placeItems: 'center',
          }}>
            <Crown style={{ width: 28, height: 28, color: '#22d3ee' }} />
          </div>
          <h2 style={{ fontSize: 22, color: '#fff' }}>Collancer Pro</h2>
          <p style={{ fontSize: 13.5, opacity: .75, marginTop: 6 }}>
            {plan ? `${plan.label} plan` : 'Active plan'} · valid till {fmtDate(biz?.proExpiresAt)}
          </p>
          <div style={{ marginTop: 12 }}><Badge tone="cyan" icon={Check}>Active</Badge></div>
        </Card>

        <div className="cl-section-title"><h3>Your Pro benefits</h3></div>
        {BENEFITS.map((b) => (
          <Card key={b.title} style={{ marginBottom: 10 }}>
            <div className="cl-row" style={{ gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center', color: 'var(--cyan-deep)',
              }}>
                <b.icon style={{ width: 19, height: 19 }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{b.title}</div>
                <div className="cl-small cl-muted" style={{ marginTop: 2 }}>{b.desc}</div>
              </div>
            </div>
          </Card>
        ))}

        <Card style={{ marginTop: 14, background: 'var(--surface-2)' }}>
          <div className="cl-row" style={{ gap: 10 }}>
            <CalendarClock style={{ width: 18, height: 18, color: 'var(--muted)' }} />
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
              Pro renews as a fixed-term plan. Your access ends automatically on {fmtDate(biz?.proExpiresAt)} — no auto-renewal, no hidden charges.
            </p>
          </div>
        </Card>
      </div>
    </Page>
  );
}

export default function ProPage() {
  const { biz } = useBiz();
  const [plan, setPlan] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isBizPro(biz)) return <ProStatusPage />;

  return (
    <Page pageKey="pro">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-fade" style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 10, margin: '0 auto 12px',
            background: 'linear-gradient(135deg,#0b0b0c,#1c1c1f)',
            display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-btn)',
          }}>
            <Crown style={{ width: 26, height: 26, color: 'var(--cyan)' }} />
          </div>
          <h2 style={{ fontSize: 22 }}>Collancer Pro</h2>
          <p className="cl-small cl-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
            Unlock the marketplace, AI discovery, deeper analytics and 5% off every booking.
          </p>
        </div>

        {BUSINESS_PRO_PLANS.map((p, i) => (
          <Card key={p.id} pressable lift onClick={() => { setPlan(p); setSheetOpen(true); }}
            className="cl-fade"
            style={{
              marginBottom: 12, animationDelay: `${i * 60}ms`,
              border: p.tag ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
              position: 'relative',
            }}>
            {p.tag && (
              <div style={{ position: 'absolute', top: -11, right: 16 }}>
                <Badge tone="cyan">{p.tag}</Badge>
              </div>
            )}
            <div className="cl-row">
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.label}</div>
                <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                  {inr(p.perMonth)}/month · billed {inr(p.total)}
                </div>
              </div>
              <div className="cl-money" style={{ fontSize: 20 }}>{inr(p.total)}</div>
            </div>
          </Card>
        ))}

        <div className="cl-section-title" style={{ marginTop: 20 }}><h3>Everything in Pro</h3></div>
        {BENEFITS.map((b) => (
          <div key={b.title} className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8, flexShrink: 0,
              background: 'var(--green-soft)', display: 'grid', placeItems: 'center', color: 'var(--green)',
            }}>
              <Check style={{ width: 17, height: 17 }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.title}</div>
              <div className="cl-small cl-muted">{b.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <CheckoutSheet plan={plan} open={sheetOpen} onClose={() => setSheetOpen(false)} onDone={() => setSheetOpen(false)} />
    </Page>
  );
}
