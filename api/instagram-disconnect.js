/* POST /api/instagram-disconnect — disconnect a creator's Instagram account.
 *
 * Deletes the stored access token (server-only collection) and clears the
 * synced Instagram data from the creator document. The creator's Collancer
 * account, handle reservation, and non-Instagram profile data are kept.
 *
 * Request:  { idToken }  (Firebase ID token of the logged-in creator)
 * Response: { ok: true } | { ok: false, reason }
 */
import { getAdmin, verifyUid, readBody } from './_firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  const fail = (reason, extra = {}) => res.status(200).json({ ok: false, reason, ...extra });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    const body = readBody(req);
    let uid;
    try {
      uid = await verifyUid(body.idToken);
    } catch (e) {
      return fail(e.code === 'NOT_CONFIGURED' ? 'server-not-configured' : 'bad-token');
    }

    const db = getAdmin().firestore();
    const batch = db.batch();

    // 1. Delete the access token — this revokes our API access immediately.
    batch.delete(db.collection('instagram_tokens').doc(uid));

    // 2. Clear synced Instagram data from the creator doc.
    batch.set(
      db.collection('creators').doc(uid),
      {
        instagram: FieldValue.delete(),
        instagramConnected: false,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    await batch.commit();
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return fail('server-not-configured');
    return fail('disconnect-failed');
  }
}
