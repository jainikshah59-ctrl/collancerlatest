/* Creator go-live: Instagram-connected accounts go live instantly, no admin verification.
 * Verifies the user owns the account and has Instagram connected, then marks them live
 * via Admin SDK (bypasses client Firestore rules for verified/addedToCollancer). */
import { getAdmin, verifyUid, readBody } from './_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'method' });
  try {
    const body = await readBody(req);
    let uid;
    try {
      uid = await verifyUid(body.idToken);
    } catch (e) {
      return res.status(401).json({ ok: false, reason: 'bad-token' });
    }
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.collection('creators').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, reason: 'not-found' });
    const c = snap.data();
    // Must have Instagram connected (username present)
    const igUsername = c.instagram?.username;
    if (!igUsername) return res.status(400).json({ ok: false, reason: 'instagram-required' });

    await ref.update({
      igGoLive: true,
      verified: true,
      addedToCollancer: true,
      // Ensure handle is set from Instagram if missing
      ...(c.handle ? {} : { handle: igUsername, handleLower: igUsername.toLowerCase() }),
      liveAt: app.firestore.FieldValue.serverTimestamp(),
      updatedAt: app.firestore.FieldValue.serverTimestamp(),
    });
    // Reserve handle if not already
    const handleLower = (c.handleLower || igUsername.toLowerCase());
    const handleRef = db.collection('creatorHandles').doc(handleLower);
    const handleSnap = await handleRef.get();
    if (!handleSnap.exists) {
      await handleRef.set({ creatorId: uid, handle: c.handle || igUsername, createdAt: new Date() });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: 'server-error' });
  }
}
