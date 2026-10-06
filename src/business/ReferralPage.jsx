/* Referral page — STATIC/DEMO content, honestly labeled.
   Audit §6.9: hardcoded code BIZ-COLLANCER-2026, hardcoded link, hardcoded example
   rows + totals, email invite toggles local UI only. No backend, no email service. */
import React, { useState } from 'react';
import { Gift, Copy, Check, Send, Users, IndianRupee, Mail, FlaskConical } from 'lucide-react';
import { useBiz } from './ctx.jsx';
import { inr } from '../lib/format.js';
import {
  Card, Button, Field, Input, Badge, EmptyState, Page, useToast, Stat,
} from '../components/ui.jsx';

const REFERRAL_CODE = 'BIZ-COLLANCER-2026';
const REFERRAL_LINK = `https://collancer.in/r/${REFERRAL_CODE}`;

// Hardcoded example rows (demo preview only — no backend attribution exists).
const DEMO_ROWS = [
  { name: 'Priya Mehta', detail: 'Nova Cosmetics · joined 12 Sep', status: 'Rewarded', earned: 400 },
  { name: 'Rahul Verma', detail: 'FitFuel Nutrition · joined 28 Sep', status: 'Rewarded', earned: 400 },
  { name: 'Ananya Iyer', detail: 'Casa Living · invite pending', status: 'Pending', earned: 0 },
];
const DEMO_TOTAL = DEMO_ROWS.reduce((s, r) => s + r.earned, 0);

export default function ReferralPage() {
  const toast = useToast();
  const { biz } = useBiz();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState([]);

  function copyLink() {
    try {
      navigator.clipboard.writeText(REFERRAL_LINK).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        toast.ok('Referral link copied.');
      });
    } catch (e) { toast.err('Copy not available on this device.'); }
  }

  function sendInvite(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.err('Enter a valid email address.'); return; }
    // Local UI only — no email service is invoked (audit §6.9).
    setInvited((list) => [email.trim(), ...list]);
    setEmail('');
    toast.ok('Invite noted (demo) — no email was actually sent.');
  }

  return (
    <Page pageKey="referral">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-row" style={{ marginBottom: 14 }}>
          <div className="cl-grow">
            <h2 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gift style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} /> Referrals
            </h2>
            <p className="cl-small cl-muted" style={{ marginTop: 3 }}>Earn 5% when a business you invite books creators.</p>
          </div>
          <Badge tone="amber" icon={FlaskConical}>Demo preview</Badge>
        </div>

        <Card className="cl-fade" style={{
          background: 'linear-gradient(135deg,#0b0b0c 0%,#12333b 100%)',
          border: '1px solid var(--glass-border)', color: '#fff', marginBottom: 14,
        }}>
          <div className="cl-small" style={{ opacity: .7, marginBottom: 6 }}>Your referral code</div>
          <div className="cl-row" style={{ gap: 10 }}>
            <code style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.04em' }}>{REFERRAL_CODE}</code>
            <div className="cl-grow" />
            <Button variant="cyan" size="sm" icon={copied ? Check : Copy} onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <div className="cl-small" style={{ opacity: .6, marginTop: 8, wordBreak: 'break-all' }}>{REFERRAL_LINK}</div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Stat label="Invites sent" value={DEMO_ROWS.length + invited.length} icon={Users} tone="cyan" />
          <Stat label="Rewards earned" value={inr(DEMO_TOTAL)} icon={IndianRupee} />
        </div>

        <Card style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail style={{ width: 16, height: 16, color: 'var(--cyan-deep)' }} /> Invite by email
          </h4>
          <form onSubmit={sendInvite} className="cl-row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div className="cl-grow">
              <Input type="email" placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" icon={Send}>Invite</Button>
          </form>
          {invited.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {invited.map((em) => (
                <div key={em} className="cl-small cl-muted" style={{ padding: '6px 0', borderTop: '1px solid var(--line-soft)' }}>
                  {em} · <span style={{ color: 'var(--amber)', fontWeight: 600 }}>demo — not sent</span>
                </div>
              ))}
            </div>
          )}
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Demo preview: invites are recorded locally only — no email is sent and no referral is tracked.
          </p>
        </Card>

        <div className="cl-section-title"><h3>Referral history</h3></div>
        {DEMO_ROWS.map((r, i) => (
          <Card key={i} style={{ marginBottom: 10 }}>
            <div className="cl-row">
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div className="cl-small cl-muted" style={{ marginTop: 2 }}>{r.detail}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="cl-money" style={{ color: r.earned ? 'var(--green)' : 'var(--faint)' }}>
                  {r.earned ? `+${inr(r.earned)}` : '—'}
                </div>
                <Badge tone={r.status === 'Rewarded' ? 'green' : 'amber'}>{r.status}</Badge>
              </div>
            </div>
          </Card>
        ))}
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          Example data shown for preview. Real referral attribution and payouts are not yet implemented.
        </p>
      </div>
    </Page>
  );
}
