/* Public legal pages — accessible without login at ?legal=privacy and
   ?legal=data-deletion. Meta App Review requires a public Privacy Policy URL
   and Data Deletion instructions for Instagram API permissions. */
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Page, Card, Logo } from '../components/ui.jsx';

function Shell({ title, updated, children }) {
  return (
    <Page pageKey="public-legal">
      <div className="cl-container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo size={52} />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="cl-row" style={{ gap: 8, justifyContent: 'center', marginBottom: 6 }}>
            <ShieldCheck style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} />
            <h2 style={{ fontSize: 22 }}>{title}</h2>
          </div>
          <p className="cl-small cl-muted">Last updated: {updated}</p>
        </div>
        <Card>
          <div style={{ display: 'grid', gap: 18 }}>
            {children}
          </div>
        </Card>
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 18 }}>
          Collancer — WHERE INFLUENCE MEETS INDUSTRY
        </p>
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

export function PublicPrivacyPage() {
  return (
    <Shell title="Privacy Policy" updated="October 2026">
      <Section h="1. What we collect">
        <p>When you register as a business we collect your business name, email, WhatsApp number, address and industry. When you register as a creator we collect your name, phone number and email. Campaign briefs, booking records, wallet transactions and support messages are stored to operate the marketplace.</p>
      </Section>
      <Section h="2. Instagram data">
        <p>If you connect your Instagram account, we access your Instagram Business or Creator profile through Meta's Instagram API: profile photo, username, bio, follower and following counts, media count, and insights such as reach and profile views. This data is used to build your Collancer creator profile, match you with brands, and keep your stats up to date. Your access token is stored securely on our servers and never shown to other users. Synced Instagram details are display-only and cannot be edited on Collancer — they always reflect your real Instagram account.</p>
      </Section>
      <Section h="3. How we use it">
        <p>Your data is used to run your account, match businesses with creators, process escrow payments, prevent fraud and improve Collancer. We never sell your personal data.</p>
      </Section>
      <Section h="4. Wallet and payments">
        <p>Wallet top-ups are verified manually against UPI references you submit. Demo checkouts in the app are simulated and move no real money. Escrow accounting is recorded in an append-only ledger.</p>
      </Section>
      <Section h="5. Sharing">
        <p>Campaign briefs businesses create are shared with the creators they book. Creator profile data synced from Instagram (username, photo, follower counts) is visible to businesses discovering creators. We share data with service providers (authentication, database, media hosting) only as needed to run the platform, and with authorities when legally required.</p>
      </Section>
      <Section h="6. Your control and deletion">
        <p>You can update your profile from the dashboard. To disconnect Instagram and delete your synced Instagram data, open your profile and tap "Disconnect Instagram" — this immediately deletes your stored access token and all synced Instagram data from our servers. To request export or deletion of your full account data, contact support from your registered email.</p>
      </Section>
      <Section h="7. Security">
        <p>Access is gated by Firebase Authentication and party-scoped database rules. Instagram access tokens are stored server-side only and never exposed to browsers or other users. Wallet balances cannot be self-credited and escrow can only be released by a Collancer admin after work approval.</p>
      </Section>
    </Shell>
  );
}

export function PublicDataDeletionPage() {
  return (
    <Shell title="Data Deletion Instructions" updated="October 2026">
      <Section h="Delete your Instagram data">
        <p><strong>Option 1 — In the app (fastest):</strong></p>
        <p>1. Log in to Collancer as a creator.<br />2. Open your Profile.<br />3. Find your connected Instagram card and tap "Disconnect Instagram", then confirm.<br />4. Your stored Instagram access token and all synced Instagram data (profile details, follower counts, insights) are deleted from our servers immediately. Your Collancer account itself is kept.</p>
      </Section>
      <Section h="Delete your full Collancer account">
        <p><strong>Option 2 — Contact support:</strong></p>
        <p>Send an email to our support team from your registered email address with the subject "Delete my account". Include your registered name and phone number. We will delete your account, profile data, synced Instagram data, and access tokens within 7 working days and confirm by email. Wallet ledger entries required for financial record-keeping are retained in anonymized form as required by law.</p>
      </Section>
      <Section h="Revoke from Instagram directly">
        <p>You can also revoke Collancer's access at any time from Instagram: Settings → Business tools → Active apps → remove Collancer. This stops future syncing; already-synced data on our servers is deleted when you disconnect in the app or request deletion via support as above.</p>
      </Section>
    </Shell>
  );
}
