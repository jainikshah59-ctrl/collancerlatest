/* Instagram connect — post-signup step + profile status components.
 * The OAuth flow runs through /api/instagram-* (app secret + tokens stay on
 * the server). Synced Instagram details are display-only and refresh live
 * from the Instagram account; the creator cannot edit them.
 */
import React, { useState } from 'react';
import {
  Instagram, Lock, RefreshCw, CheckCircle2, Loader2, ArrowRight,
  Users, Image as ImageIcon, Eye,
} from 'lucide-react';
import { Card, Button, useToast } from '../components/ui.jsx';
import {
  startInstagramConnect, refreshInstagram, disconnectInstagram, lastSyncedLabel,
} from '../lib/instagram.js';

function SyncRow({ icon: Icon, label, value, last }) {
  return (
    <div className="cl-row" style={{ gap: 12, padding: '10px 0', borderBottom: last ? 0 : '1px solid var(--hairline)' }}>
      <span style={{
        width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, var(--glass-hi), var(--glass-lo))',
        border: '1px solid var(--glass-border)', flexShrink: 0,
      }}>
        <Icon style={{ width: 16, height: 16, color: 'var(--cyan-deep)' }} />
      </span>
      <div className="cl-grow">
        <div className="cl-small" style={{ fontWeight: 700 }}>{label}</div>
        <div className="cl-small cl-muted">{value}</div>
      </div>
      <Lock style={{ width: 13, height: 13, color: 'var(--faint)', flexShrink: 0 }} />
    </div>
  );
}

/* ---------- full-screen post-signup step ---------- */

export function InstagramConnectScreen({ creatorName, onSkip }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      await startInstagramConnect();
      // browser redirects to Instagram — we don't get here on success
    } catch (e) {
      const m = String(e?.message || '');
      if (m.includes('not-configured') || m.includes('server-not-configured')) {
        setNotConfigured(true);
      } else {
        toast.err('Could not start Instagram connect. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cl-page">
      <div className="cl-container cl-fade" style={{ maxWidth: 460, paddingTop: 56, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{
            width: 84, height: 84, borderRadius: 24, margin: '0 auto 16px',
            display: 'grid', placeItems: 'center', color: '#fff',
            background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 10px 24px -8px rgba(220,39,67,.5)',
          }}>
            <Instagram style={{ width: 40, height: 40 }} />
          </div>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>
            {creatorName ? `Welcome, ${String(creatorName).split(' ')[0]} — ` : ''}connect your Instagram
          </h1>
          <p className="cl-small cl-muted" style={{ lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
            Your Collancer profile is built straight from your Instagram account —
            no forms to fill, and it stays live and up to date on its own.
          </p>
        </div>

        <Card className="cl-glass" style={{ marginBottom: 16 }}>
          <div className="cl-small" style={{ fontWeight: 800, marginBottom: 4, letterSpacing: '.04em' }}>
            WHAT SYNCES AUTOMATICALLY
          </div>
          <SyncRow icon={Instagram} label="Profile" value="Photo, username and bio — straight from Instagram" />
          <SyncRow icon={Users} label="Audience" value="Follower and following counts, live" />
          <SyncRow icon={ImageIcon} label="Content" value="Post count and content insights" />
          <div>
            <SyncRow icon={Eye} label="Insights" value="Reach, views and engagement refresh automatically where Instagram provides them" last />
          </div>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Synced details are managed by Instagram and can't be edited here — they'll
            always match your real account. Works with Instagram Business or Creator accounts.
          </p>
        </Card>

        {notConfigured ? (
          <Card style={{ borderColor: 'var(--amber-border, rgba(245,158,11,.4))', marginBottom: 16 }}>
            <div className="cl-row" style={{ gap: 10 }}>
              <CheckCircle2 style={{ width: 18, height: 18, color: 'var(--amber, #d97706)', flexShrink: 0 }} />
              <p className="cl-small" style={{ lineHeight: 1.6 }}>
                Instagram connect is being set up on our side. Your account is ready —
                you can connect it from your profile as soon as it's live.
              </p>
            </div>
          </Card>
        ) : (
          <Button block size="lg" loading={busy} onClick={connect} icon={Instagram}
            style={{
              background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
              border: 'none', color: '#fff',
            }}>
            Connect Instagram
          </Button>
        )}

        <button onClick={onSkip}
          style={{
            display: 'block', margin: '18px auto 0', border: 0, background: 'none',
            color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
          I'll do this later <ArrowRight style={{ width: 13, height: 13, verticalAlign: -2 }} />
        </button>
      </div>
    </div>
  );
}

/* ---------- persistent banner for profiles not yet connected ---------- */

export function InstagramConnectBanner({ onConnect }) {
  return (
    <Card className="cl-glass" style={{
      border: '1px solid rgba(220,39,67,.25)',
      background: 'linear-gradient(135deg, rgba(240,148,51,.08), rgba(188,24,136,.08))',
    }}>
      <div className="cl-row" style={{ gap: 12 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(45deg, #f09433, #dc2743, #bc1888)', color: '#fff', flexShrink: 0,
        }}>
          <Instagram style={{ width: 20, height: 20 }} />
        </span>
        <div className="cl-grow">
          <div style={{ fontWeight: 800, fontSize: 14 }}>Connect your Instagram</div>
          <div className="cl-small cl-muted" style={{ lineHeight: 1.5 }}>
            Auto-build your profile and keep followers & insights live.
          </div>
        </div>
        <Button size="sm" onClick={onConnect} icon={ArrowRight}>Connect</Button>
      </div>
    </Card>
  );
}

/* ---------- compact connected status banner (no profile duplication) ---------- */

export function InstagramSyncCard({ creator, onDisconnected, onSynced }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ig = creator?.instagram;
  if (!ig) return null;

  async function onRefresh() {
    setBusy(true);
    try {
      const j = await refreshInstagram(true);
      if (j?.ok) {
        toast.ok(j.fresh ? 'Already up to date.' : 'Instagram data refreshed.');
        if (j?.instagram) onSynced?.(j.instagram);
        return;
      }
      if (j?.reason === 'token-expired') {
        toast.err('Instagram session expired — please reconnect.');
      } else if (j?.reason === 'not-configured' || j?.reason === 'server-not-configured') {
        toast.err('Instagram sync is temporarily unavailable. Please try again later.');
      } else if (j?.reason === 'not-connected') {
        toast.err('Instagram is no longer connected. Please reconnect.');
      } else {
        toast.err('Instagram could not be refreshed. Your last saved data has been kept.');
      }
    } catch {
      toast.err('Instagram sync could not reach the server. Your last saved data has been kept.');
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      await disconnectInstagram();
      toast.ok('Instagram disconnected. Your synced data was deleted.');
      setConfirming(false);
      onDisconnected?.();
    } catch {
      toast.err('Could not disconnect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="cl-glass" style={{
      border: '1px solid rgba(34,197,94,.25)',
      background: 'linear-gradient(135deg, rgba(34,197,94,.07), rgba(34,197,94,.03))',
      padding: '10px 14px',
    }}>
      <div className="cl-row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(45deg, #f09433, #dc2743, #bc1888)', color: '#fff', flexShrink: 0,
        }}>
          <Instagram style={{ width: 16, height: 16 }} />
        </span>
        <div className="cl-grow" style={{ minWidth: 120 }}>
          <div className="cl-row" style={{ gap: 6, alignItems: 'center' }}>
            <CheckCircle2 style={{ width: 14, height: 14, color: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Instagram connected</span>
            <span className="cl-small cl-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{ig.username}</span>
          </div>
          <div className="cl-small cl-faint" style={{ marginTop: 1 }}>
            Synced {lastSyncedLabel(creator)} · <Lock style={{ width: 10, height: 10, verticalAlign: -1 }} /> managed by Instagram
          </div>
        </div>
        <div className="cl-row" style={{ gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Button size="sm" variant="light" onClick={onRefresh} disabled={busy} icon={busy ? Loader2 : RefreshCw}>
            {busy ? 'Syncing…' : 'Sync'}
          </Button>
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="cl-small"
            style={{
              background: 'none', border: 0, cursor: 'pointer',
              color: confirming ? 'var(--danger, #dc2626)' : 'var(--faint)',
              fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3,
              whiteSpace: 'nowrap',
            }}>
            {confirming ? 'Confirm?' : 'Disconnect'}
          </button>
        </div>
      </div>
    </Card>
  );
}
