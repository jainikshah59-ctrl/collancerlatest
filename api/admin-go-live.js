/* TEMP — one-use: manually make jainikshah599@gmail.com live. DELETE AFTER USE. */
import { getAdmin } from './_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const app = getAdmin();
    const auth = app.auth();
    const db = app.firestore();
    const user = await auth.getUserByEmail('jainikshah599@gmail.com').catch(() => null);
    if (!user) return res.status(404).json({ ok: false, err: 'user-not-found' });
    const uid = user.uid;
    const ref = db.collection('creators').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, err: 'creator-not-found' });
    const c = snap.data();
    const igUsername = c.instagram?.username || 'collancerr';
    await ref.update({
      igGoLive: true,
      verified: true,
      addedToCollancer: true,
      handle: c.handle || igUsername,
      handleLower: c.handleLower || igUsername.toLowerCase(),
      liveAt: app.firestore.FieldValue.serverTimestamp(),
      updatedAt: app.firestore.FieldValue.serverTimestamp(),
    });
    // Reserve handle
    const handleLower = (c.handleLower || igUsername.toLowerCase());
    const handleRef = db.collection('creatorHandles').doc(handleLower);
    const hsnap = await handleRef.get();
    if (!hsnap.exists) {
      await handleRef.set({ creatorId: uid, handle: c.handle || igUsername, createdAt: new Date() });
    }
    const updated = await ref.get();
    const u = updated.data();
    return res.json({
      ok: true, uid,
      live: !!(u.igGoLive && u.verified && u.addedToCollancer),
      handle: u.handle, followers: u.followers,
      instagram: !!u.instagram?.username,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e?.message || e).slice(0, 200) });
  }
}
