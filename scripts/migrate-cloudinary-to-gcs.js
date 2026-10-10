/* One-time Cloudinary/Base64 -> GCS migration. Dry-run unless --apply is passed.
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, GCS_BUCKET.
 * Original Cloudinary assets are never deleted.
 */
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'crypto';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const bucketName = process.env.GCS_BUCKET;
if (!raw || !bucketName) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON and GCS_BUCKET first.');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const bucket = getStorage().bucket(bucketName);
const cache = new Map();
const replacementMap = new Map();
let candidates = 0, migrated = 0, failed = 0;

function cloudinary(value) {
  try { const u = new URL(value); return u.hostname === 'res.cloudinary.com' && /^https?:$/.test(u.protocol); }
  catch { return false; }
}
function dataImage(value) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(value);
  return m ? { contentType: m[1].toLowerCase(), bytes: Buffer.from(m[2].replace(/\s/g, ''), 'base64') } : null;
}
async function uploadBytes(bytes, contentType, identity) {
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 28);
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'bin';
  const objectPath = `migrated/legacy/${digest}.${ext}`;
  if (apply) await bucket.file(objectPath).save(bytes, {
    resumable: false,
    metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return apply
    ? `https://storage.googleapis.com/${bucket.name}/${objectPath.split('/').map(encodeURIComponent).join('/')}`
    : '[DRY RUN] ' + objectPath;
}
async function migrateString(value, path) {
  if (replacementMap.has(value)) return replacementMap.get(value);
  if (cloudinary(value)) {
    candidates++;
    try {
      const pending = cache.get(value) || (async () => {
        const response = await fetch(value);
        if (!response.ok) throw new Error('source HTTP ' + response.status);
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
        if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error('unsupported MIME ' + contentType);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error('empty source');
        return uploadBytes(bytes, contentType, value);
      })();
      cache.set(value, pending);
      const next = await pending;
      if (apply) { replacementMap.set(value, next); migrated++; }
      return next;
    } catch (error) {
      failed++;
      console.error('Cloudinary migration failed at', path, String(error?.message || error));
      return value;
    }
  }
  const image = dataImage(value);
  if (image && image.bytes.length > 1024) {
    candidates++;
    try {
      const next = await uploadBytes(image.bytes, image.contentType, path + ':' + createHash('sha256').update(image.bytes).digest('hex'));
      if (apply) { replacementMap.set(value, next); migrated++; }
      return next;
    } catch (error) {
      failed++;
      console.error('Base64 migration failed at', path, String(error?.message || error));
    }
  }
  return value;
}
async function transform(value, path = '') {
  if (typeof value === 'string') return migrateString(value, path);
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) out.push(await transform(value[i], path + '[' + i + ']'));
    return out;
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toDate !== 'function') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = await transform(child, path ? path + '.' + key : key);
    return out;
  }
  return value;
}
function replaceMapped(value) {
  if (typeof value === 'string') return replacementMap.get(value) || value;
  if (Array.isArray(value)) return value.map(replaceMapped);
  if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toDate !== 'function') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = replaceMapped(child);
    return out;
  }
  return value;
}
async function visitCollection(ref) {
  let cursor = null;
  while (true) {
    let q = ref.orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const document of snap.docs) {
      const before = document.data();
      const after = await transform(before, ref.path + '/' + document.id);
      if (apply && JSON.stringify(after) !== JSON.stringify(before)) {
        // Upload work happens before the transaction; the transaction only
        // swaps strings that were in the reviewed snapshot, avoiding network
        // calls or new uploads inside Firestore's retryable transaction.
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(document.ref);
          if (!fresh.exists) return;
          tx.set(document.ref, replaceMapped(fresh.data()));
        });
      }
      for (const child of await document.ref.listCollections()) await visitCollection(child);
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 100) break;
  }
}
try {
  for (const root of await db.listCollections()) await visitCollection(root);
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY RUN', uniqueCloudinaryUrls: cache.size,
    candidateFields: candidates, migratedFields: migrated, failures: failed,
    originalsDeleted: false,
  }, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply after review.');
} catch (error) {
  console.error('Migration stopped:', String(error?.stack || error));
  process.exitCode = 1;
} finally {
  await admin.app().delete();
}
