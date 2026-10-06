/* Creator support + legal pages — local/static functional content.
   Exports: HomeSupportPage, HomeLegalPage (canonical audit names),
   plus SupportPage, PrivacyPage, TermsPage aliases. */
import React, { useState } from 'react';
import { HelpCircle, ChevronRight, ShieldCheck, FileText, Lock, ArrowLeft, MessageCircle } from 'lucide-react';
import { Page, TopBar, IconBtn, Card, EmptyState } from '../components/ui.jsx';

const FAQS = [
  {
    q: 'How do I start getting bookings?',
    a: 'Complete your profile (name, handle, bio, platform, niche, city, 10K+ followers and at least one rate-card price), submit verification from your dashboard, and wait for admin approval. Once verified and added to Collancer, brands can discover and book you. Creator Pro also unlocks the Requirements Marketplace where you can pitch on brand briefs directly.',
  },
  {
    q: 'How does the booking lifecycle work?',
    a: 'Pending: a brand sends a request — you must explicitly accept or reject it. Active: the collaboration is live; complete the deliverables. PendingCompletion: you submitted your delivery link and it is under admin review. Completed: admin approved the delivery and released your payment. Cancelled: the request was rejected or withdrawn.',
  },
  {
    q: 'When and how do I get paid?',
    a: 'You earn 95% of the creator price on every paid booking. Funds are held in escrow and released only after admin approves your delivered work. Released earnings appear in Earnings; request a payout (minimum Rs. 100) via UPI or bank transfer and the admin team processes it.',
  },
  {
    q: 'What is verification and why was I rejected?',
    a: 'Verification confirms your identity and social presence. Common rejection reasons: profile URL not matching your handle, follower count below the bar for your niche, or incomplete details. You can resubmit any time after a rejection — the previous reason is shown on the verification screen so you can fix it.',
  },
  {
    q: 'How does Be On Top promotion work?',
    a: 'Be On Top boosts your profile in brand discovery for 1–7 days. Pick a plan, choose promotion categories, and complete the demo checkout. Active boosts are shown on your dashboard while they run.',
  },
  {
    q: 'What are barter collaborations?',
    a: 'Brands offer products instead of money. If you accept a barter booking, your shipping address (from Profile > Account) is shared with the brand so they can ship the products. Keep your address up to date.',
  },
  {
    q: 'Can I change my creator handle later?',
    a: 'Yes, from Profile > Profile tab. Handle changes use an atomic reservation swap: the new handle is reserved only if it is free, then your old reservation is released. Handles are unique and case-insensitive.',
  },
];

function FaqList() {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {FAQS.map((f, i) => (
        <Card key={i} pressable style={{ padding: 0, overflow: 'hidden' }} onClick={() => setOpen(open === i ? -1 : i)}>
          <div className="cl-row" style={{ padding: '14px 16px', gap: 10 }}>
            <HelpCircle style={{ width: 18, height: 18, color: 'var(--cyan-deep)', flexShrink: 0 }} />
            <div className="cl-grow" style={{ fontWeight: 700, fontSize: 14 }}>{f.q}</div>
            <ChevronRight style={{
              width: 17, height: 17, color: 'var(--faint)', flexShrink: 0,
              transform: open === i ? 'rotate(90deg)' : 'none', transition: 'transform .2s var(--ease)',
            }} />
          </div>
          {open === i && (
            <div className="cl-fade" style={{ padding: '0 16px 16px 44px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
              {f.a}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Shell({ title, subtitle, onBack, children, pageKey }) {
  return (
    <Page pageKey={pageKey}>
      <TopBar title={title} subtitle={subtitle} left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 28 }}>
        {children}
      </div>
    </Page>
  );
}

export function HomeSupportPage({ onBack, onNav }) {
  return (
    <Shell title="Help & Support" subtitle="Answers, instantly" onBack={onBack} pageKey="creator-support">
      <Card className="cl-glass" style={{ marginBottom: 16 }}>
        <div className="cl-row" style={{ gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <MessageCircle style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Creator help centre</div>
            <div className="cl-small cl-muted" style={{ marginTop: 2, lineHeight: 1.55 }}>
              Instant answers below. For account-specific issues, contact us from your registered creator email and mention your handle.
            </div>
          </div>
        </div>
      </Card>
      <div className="cl-section-title"><h3>Frequently asked</h3></div>
      <FaqList />
      {onNav && (
        <div className="cl-row" style={{ gap: 10, marginTop: 16 }}>
          <Card pressable className="cl-grow" style={{ textAlign: 'center', padding: 14 }} onClick={() => onNav('privacy')}>
            <Lock style={{ width: 18, height: 18, color: 'var(--cyan-deep)', margin: '0 auto 6px' }} />
            <div className="cl-small" style={{ fontWeight: 700 }}>Privacy Policy</div>
          </Card>
          <Card pressable className="cl-grow" style={{ textAlign: 'center', padding: 14 }} onClick={() => onNav('terms')}>
            <FileText style={{ width: 18, height: 18, color: 'var(--cyan-deep)', margin: '0 auto 6px' }} />
            <div className="cl-small" style={{ fontWeight: 700 }}>Terms of Service</div>
          </Card>
        </div>
      )}
    </Shell>
  );
}

export function HomeLegalPage({ onBack }) {
  const [tab, setTab] = useState('privacy');
  return (
    <Shell title="Legal" subtitle="Privacy & Terms" onBack={onBack} pageKey="creator-legal">
      <div className="cl-tabs" style={{ marginBottom: 16 }}>
        <button className={`cl-tab ${tab === 'privacy' ? 'on' : ''}`} onClick={() => setTab('privacy')}>
          <Lock style={{ width: 14, height: 14 }} /> Privacy
        </button>
        <button className={`cl-tab ${tab === 'terms' ? 'on' : ''}`} onClick={() => setTab('terms')}>
          <FileText style={{ width: 14, height: 14 }} /> Terms
        </button>
      </div>
      {tab === 'privacy' ? <PrivacyBody /> : <TermsBody />}
    </Shell>
  );
}

function PrivacyBody() {
  const rows = [
    ['What we collect', 'Your profile details (name, handle, bio, platform, audience metrics), contact details (email, WhatsApp, shipping address), booking and payout records, and verification submissions.'],
    ['How we use it', 'To show your profile to brands, operate bookings and escrow, process payouts, and keep the marketplace safe. Your shipping address is shared with a brand only after you accept their barter booking.'],
    ['Sharing', 'We never sell your data. Limited booking details are shared with the brand you collaborate with and with admins for verification, quality review and payouts.'],
    ['Your control', 'You can edit your profile any time, delete your promo demos, and request account changes from support.'],
    ['Security', 'Access is gated by Firebase Authentication; financial writes are transactional and admin-gated.'],
  ];
  return (
    <Card>
      <div className="cl-row" style={{ marginBottom: 10 }}>
        <ShieldCheck style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
        <h3 style={{ fontSize: 16 }}>Privacy Policy</h3>
      </div>
      <dl style={{ margin: 0 }}>
        {rows.map(([k, v]) => (
          <div className="cl-kv" key={k} style={{ display: 'block', borderTop: '1px solid var(--line-soft)' }}>
            <dt style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{k}</dt>
            <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--ink-2)', lineHeight: 1.65 }}>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TermsBody() {
  const rows = [
    'You must provide accurate identity, audience and contact information.',
    'Creator handles are unique and case-insensitive; impersonation leads to removal.',
    'Paid bookings require explicit accept/reject. Accepting a booking is a commitment to deliver as per the brief.',
    'You earn 95% of the creator price. Payments release only after admin approves your delivered work.',
    'Payouts need a minimum of Rs. 100 and are processed by the admin team after your request.',
    'Barter acceptances share your shipping address with the brand for fulfilment.',
    'Content you deliver must be original and comply with platform and advertising norms.',
    'Collancer may remove profiles or demos that violate policy, with notice where appropriate.',
    'Demo checkouts (Pro, Be On Top) are simulated in-app confirmations, not real payment gateway charges.',
  ];
  return (
    <Card>
      <div className="cl-row" style={{ marginBottom: 10 }}>
        <FileText style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
        <h3 style={{ fontSize: 16 }}>Terms of Service</h3>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
        {rows.map((r, i) => <li key={i}>{r}</li>)}
      </ol>
    </Card>
  );
}

export const SupportPage = HomeSupportPage;
export function PrivacyPage({ onBack }) {
  return (
    <Shell title="Privacy Policy" subtitle="How your data is handled" onBack={onBack} pageKey="creator-privacy">
      <PrivacyBody />
    </Shell>
  );
}
export function TermsPage({ onBack }) {
  return (
    <Shell title="Terms of Service" subtitle="The creator agreement" onBack={onBack} pageKey="creator-terms">
      <TermsBody />
    </Shell>
  );
}
export function EmptySupport() {
  return <EmptyState icon={HelpCircle} title="Support" body="Help content is on its way." />;
}
