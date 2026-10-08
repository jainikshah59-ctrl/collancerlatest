/* TEMP DEBUG — read recent OAuth failure diagnostics.
 * DELETE AFTER USE. */
import { getAdmin } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
  try {
    const db = getAdmin().firestore();
    const snap = await db.collection('instagram_debug')
      .orderBy('at', 'desc').limit(5).get();
    const out = [];
    snap.forEach((d) => {
      const data = d.data();
      out.push({
        id: d.id,
        gotState: data.gotState || null,
        existingStates: data.existingStates || null,
        count: data.count ?? null,
        at: data.at?.toDate?.()?.toISOString?.() || String(data.at),
      });
    });
    // Also check current states
    const states = await db.collection('instagram_oauth_states').limit(20).get();
    const stateIds = [];
    states.forEach((d) => stateIds.push(d.id.slice(0, 16)));
    return res.status(200).json({ ok: true, failures: out, currentStates: stateIds, currentCount: states.size });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: String(e?.message || e).slice(0, 200) });
  }
}
