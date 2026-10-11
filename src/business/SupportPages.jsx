/* Business support + legal pages. Support: deterministic FAQ responses with local
   contact guidance. Legal: static privacy + terms content.
   Exports: SupportPage, PrivacyPage, TermsPage. */
import React, { useState } from 'react';
import {
  LifeBuoy, ChevronDown, Wallet as WalletIcon, CalendarCheck, Store,
  Crown, ShieldCheck, MessageSquare, HelpCircle,
} from 'lucide-react';
import { Card, Page, Badge } from '../components/ui.jsx';

const FAQS = [
  {
    icon: CalendarCheck, q: 'How does booking a creator work?',
    a: 'Pick a creator, choose Paid or Barter, select their package, and fill in the campaign brief. Paid bookings hold your money in escrow — it is released to the creator only after the Collancer admin approves the delivered work. The creator must explicitly accept your request before anything goes active.',
  },
  {
    icon: WalletIcon, q: 'How do I add money to my wallet?',
    a: 'Open the Wallet tab, tap Add money, and enter an amount (minimum ₹100). Pay from your own UPI app to the Collancer UPI ID shown, then submit the UPI ID you paid from plus the 12-digit UTR. An admin verifies the payment externally and credits your wallet. You cannot credit the wallet yourself.',
  },
  {
    icon: ShieldCheck, q: 'Is my payment safe?',
    a: 'Yes. Paid bookings are held in escrow with paymentStatus "escrow_held". Funds move to the creator only after admin QC approves the delivery. If a wallet-paid booking is cancelled before acceptance, the exact escrow amount is refunded to your wallet automatically.',
  },
  {
    icon: Store, q: 'What is the Requirements Marketplace?',
    a: 'Post a campaign requirement with a budget and creators send you offers. Accept an offer to convert it into a booking with the same escrow protection. You can reject offers you do not like — the creator is notified politely.',
  },
  {
    icon: Crown, q: 'What do I get with Collancer Pro?',
    a: 'Pro unlocks the Requirements Marketplace, the Collancer AI assistant, 5% off every booking, deeper creator analytics and promotion demo videos. Plans are fixed-term (monthly, 6-month, annual) with no auto-renewal.',
  },
  {
    icon: MessageSquare, q: 'A creator declined my booking. What now?',
    a: 'You will see the reason in your Dashboard. Your escrowed amount for wallet-paid bookings is refunded automatically. You can adjust the brief or budget and book another creator — boosted "Be On Top" profiles are usually quick to respond.',
  },
];

function FaqItem({ item, open, onToggle }) {
  return (
    <Card style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'none', border: 0, cursor: 'pointer',
          display: 'flex', gap: 12, alignItems: 'center', padding: 16, textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: 'var(--cyan-soft)',
          display: 'grid', placeItems: 'center', color: 'var(--cyan-deep)',
          transition: 'all 200ms var(--ease)',
        }}>
          <item.icon style={{ width: 17, height: 17 }} />
        </div>
        <strong style={{ fontSize: 14.5, flex: 1 }}>{item.q}</strong>
        <ChevronDown style={{
          width: 17, height: 17, color: 'var(--faint)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 220ms var(--ease)',
        }} />
      </button>
      <div style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 260ms var(--ease)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <p className="cl-small" style={{ padding: '0 16px 16px 64px', lineHeight: 1.7, color: 'var(--ink-2)' }}>{item.a}</p>
        </div>
      </div>
    </Card>
  );
}

export function SupportPage() {
  const [open, setOpen] = useState(0);
  return (
    <Page pageKey="support">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-fade" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LifeBuoy style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} /> Support
          </h2>
          <p className="cl-small cl-muted" style={{ marginTop: 4 }}>Answers to the questions businesses ask most.</p>
        </div>
        {FAQS.map((f, i) => (
          <FaqItem key={f.q} item={f} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
        <Card style={{ marginTop: 16, background: 'var(--surface-2)' }}>
          <div className="cl-row" style={{ gap: 10 }}>
            <HelpCircle style={{ width: 18, height: 18, color: 'var(--cyan-deep)', flexShrink: 0 }} />
            <p className="cl-small cl-muted" style={{ lineHeight: 1.65 }}>
              Still stuck? Write to us from your registered business email with your campaign name and booking ID —
              include screenshots where possible and the team will respond within one business day.
            </p>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function LegalShell({ pageKey, title, updated, children }) {
  return (
    <Page pageKey={pageKey}>
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-fade" style={{ marginBottom: 14 }}>
          <div className="cl-row" style={{ gap: 8, marginBottom: 6 }}>
            <ShieldCheck style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
            <h2 style={{ fontSize: 20 }}>{title}</h2>
          </div>
          <p className="cl-small cl-muted">Last updated: {updated}</p>
        </div>
        <Card className="cl-fade">
          <div style={{ display: 'grid', gap: 18 }}>
            {children}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Section({ h, children }) {
  return (
    <section>
      <h4 style={{ fontSize: 15, marginBottom: 8 }}>{h}</h4>
      <div className="cl-small" style={{ lineHeight: 1.75, color: 'var(--ink-2)', display: 'grid', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell pageKey="privacy" title="Privacy Policy" updated="October 2026">
      <Section h="1. What we collect">
        <p>When you register as a business we collect your business name, email, WhatsApp number, address and industry. Campaign briefs, booking records, wallet transactions and support messages are stored to operate the marketplace.</p>
      </Section>
      <Section h="2. How we use it">
        <p>Your data is used to run your account, match you with creators, process escrow payments, prevent fraud and improve Collancer. We never sell your personal data.</p>
      </Section>
      <Section h="3. Wallet and payments">
        <p>Wallet top-ups are verified manually against UPI references you submit. Demo checkouts in the app are simulated and move no real money. Escrow accounting is recorded in an append-only ledger.</p>
      </Section>
      <Section h="4. Sharing">
        <p>Campaign briefs you create are shared with the creators you book. We share data with service providers (authentication, database, media hosting) only as needed to run the platform, and with authorities when legally required.</p>
      </Section>
      <Section h="5. Your control">
        <p>You can update your business name and profile photo from the dashboard. To request export or deletion of your data, contact support from your registered email.</p>
      </Section>
      <Section h="6. Security">
        <p>Access is gated by Firebase Authentication and party-scoped database rules. Wallet balances cannot be self-credited and escrow can only be released by a Collancer admin after work approval.</p>
      </Section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell pageKey="terms" title="Terms of Service" updated="October 2026">
      <Section h="1. The service">
        <p>Collancer connects businesses with independent creators for paid and barter collaborations. Collancer is a marketplace, not an agency, and is not a party to the creative agreement between you and the creator beyond escrow and quality review.</p>
      </Section>
      <Section h="2. Bookings and escrow">
        <p>Paid bookings begin as Pending and require explicit creator acceptance. Your payment is held in escrow and released to the creator (95% of the creator price) only after admin approval of the delivered work. Creator package prices are set by creators and cannot be modified at booking.</p>
      </Section>
      <Section h="3. Fees and Pro">
        <p>A 12% platform fee applies to paid bookings; Pro members receive a 5% discount on the creator price. Pro plans are fixed-term with no auto-renewal. Demo checkouts are simulated and create no payment obligation.</p>
      </Section>
      <Section h="4. Cancellations and refunds">
        <p>You may cancel a Pending booking with a reason. Wallet-paid bookings cancelled before creator acceptance are refunded to your wallet for the exact escrow amount. Barter bookings carry no monetary obligation.</p>
      </Section>
      <Section h="5. Your responsibilities">
        <p>Provide accurate briefs, honour agreed usage rights and timelines, and do not misuse creator contact details. Reviews must reflect genuine completed collaborations.</p>
      </Section>
      <Section h="6. Acceptable use">
        <p>No spam, fraud, harassment or attempts to circumvent escrow. Violations may lead to suspension of your business account.</p>
      </Section>
      <Section h="7. Liability">
        <p>Collancer provides the platform "as is". To the extent permitted by law, our liability is limited to the fees paid for the booking in question.</p>
      </Section>
    </LegalShell>
  );
}
