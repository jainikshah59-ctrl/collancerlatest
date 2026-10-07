/* TEMP — one-use: backfill handle/handleLower from Instagram for manually linked accounts. DELETE AFTER USE. */
import { getAdmin } from './_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const app = getAdmin();
    const db = app.firestore();
    const snap = await db.collection('creators').get();
    const fixed = [];
    for (const d of snap.docs) {
      const c = d.data();
      const igUsername = c.instagram?.username;
      // If IG connected but no top-level handle, backfill it
      if (igUsername && (!c.handle || !c.handleLower)) {
        const handleLower = igUsername.toLowerCase();
        const batch = db.batch();
        // Reserve the handle
        const handleRef = db.collection('creatorHandles').doc(handleLower);
        const handleSnap = await handleRef.get();
        if (!handleSnap.exists) {
          batch.set(handleRef, { creatorId: d.id, handle: igUsername, createdAt: new Date() });
        }
        batch.update(d.ref, {
          handle: igUsername,
          handleLower: handleLower,
          updatedAt: new Date().toISOString(),
        });
        await batch.commit();
        fixed.push({ id: d.id, handle: igUsername });
      }
    }
    return res.json({ ok: true, fixed });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e?.message || e).slice(0, 200) });
  }
}
