/* Shared Firebase Admin helper for Vercel serverless functions.
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (the service-account private key JSON,
 * one line) in the Vercel environment. All admin access bypasses Firestore
 * rules — it is only used for Instagram OAuth token handling, which must
 * never pass through the client.
 */
import admin from 'firebase-admin';

let _app = null;

export function getAdmin() {
  if (_app) return _app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const e = new Error('Firebase Admin is not configured on the server.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    const e = new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    e.code = 'BAD_CONFIG';
    throw e;
  }
  _app = admin.initializeApp({ credential: admin.credential.cert(sa) });
  return _app;
}

/** Verify a Firebase ID token, return the uid. Throws on invalid token. */
export async function verifyUid(idToken) {
  const token = String(idToken || '');
  if (!token) {
    const e = new Error('Missing ID token.');
    e.code = 'NO_TOKEN';
    throw e;
  }
  const decoded = await getAdmin().auth().verifyIdToken(token);
  if (!decoded || !decoded.uid) {
    const e = new Error('Invalid ID token.');
    e.code = 'BAD_TOKEN';
    throw e;
  }
  return decoded.uid;
}

export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body && typeof body === 'object' ? body : {};
}
