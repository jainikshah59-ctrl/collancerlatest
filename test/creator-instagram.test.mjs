/* Instagram client-lib tests — pure sync-state helpers (no network, no DOM). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  needsInstagramSync,
  lastSyncedLabel,
  INSTAGRAM_SYNC_INTERVAL_MS,
} from '../src/lib/instagram.js';

const igDoc = (lastSyncedMs) => ({
  instagram: {
    username: 'aarav.creates',
    followersCount: 25000,
    avgViews30d: 1200,
    postsLast30Days: 12,
    videoCount30d: 5,
    lastSyncedAt: { seconds: Math.floor(lastSyncedMs / 1000) },
  },
});

describe('instagram sync helpers', () => {
  it('needsInstagramSync is false without an instagram connection', () => {
    assert.equal(needsInstagramSync(null), false);
    assert.equal(needsInstagramSync({}), false);
    assert.equal(needsInstagramSync({ instagram: null }), false);
  });

  it('needsInstagramSync is false for fresh data, true for stale data', () => {
    const now = Date.now();
    assert.equal(needsInstagramSync(igDoc(now - 1000), now), false);
    assert.equal(
      needsInstagramSync(igDoc(now - INSTAGRAM_SYNC_INTERVAL_MS - 1000), now),
      true,
    );
  });

  it('refreshes legacy snapshots missing the 30-day metrics once', () => {
    const now = Date.now();
    const legacy = igDoc(now - 1000);
    delete legacy.instagram.avgViews30d;
    delete legacy.instagram.postsLast30Days;
    delete legacy.instagram.videoCount30d;
    assert.equal(needsInstagramSync(legacy, now), true);
  });

  it('needsInstagramSync is false when the token is invalid', () => {
    const now = Date.now();
    const c = igDoc(now - INSTAGRAM_SYNC_INTERVAL_MS - 100000);
    c.instagram.tokenInvalid = true;
    assert.equal(needsInstagramSync(c, now), false);
  });

  it('lastSyncedLabel renders human times', () => {
    const now = Date.now();
    assert.equal(lastSyncedLabel(igDoc(now - 20000), now), 'just now');
    assert.equal(lastSyncedLabel(igDoc(now - 5 * 60000), now), '5m ago');
    assert.equal(lastSyncedLabel(igDoc(now - 3 * 3600000), now), '3h ago');
    assert.equal(lastSyncedLabel(igDoc(now - 2 * 86400000), now), '2d ago');
    assert.equal(lastSyncedLabel(null), '');
  });
});
