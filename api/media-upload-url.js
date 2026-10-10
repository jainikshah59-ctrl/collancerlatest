/* POST /api/media-upload-url — authenticated GCS upload policy.
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON, GCS_BUCKET.
 * These existing public-media surfaces use public Cloudinary URLs; keep only
 * equivalent non-sensitive public media in this bucket/folder allowlist.
 */
import { randomUUID } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getAdmin, verifyUid, readBody } from '../lib/firebaseAdmin.js';

const FOLDERS = new Set([
  'collancer_pfps', 'collancer_market_briefs', 'collancer_briefs',
  'collancer_promos', 'collancer_promos_thumbnails',
]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 200 * 1024 * 1024;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function safeName(value) {
  const name = String(value || 'upload').split(/[\\/]/).pop()
    .normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90);
  return name || 'upload';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = readBody(req);
    let uid;
    try { uid = await verifyUid(body.idToken); }
    catch { return json(res, 401, { ok: false, error: 'unauthenticated' }); }

    const bucketName = process.env.GCS_BUCKET;
    if (!bucketName) return json(res, 503, { ok: false, error: 'media_storage_not_configured' });

    const folder = String(body.folder || '');
    const contentType = String(body.contentType || '').toLowerCase();
    const size = Number(body.size);
    if (!FOLDERS.has(folder)) return json(res, 400, { ok: false, error: 'invalid_folder' });
    const maxBytes = IMAGE_TYPES.has(contentType) ? IMAGE_MAX : VIDEO_TYPES.has(contentType) ? VIDEO_MAX : 0;
    if (!maxBytes) return json(res, 415, { ok: false, error: 'unsupported_file_type' });
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
      return json(res, 413, { ok: false, error: 'file_size_limit', maxBytes });
    }

    const bucket = getStorage(getAdmin()).bucket(bucketName);
    const objectPath = `users/${uid}/${folder}/${randomUUID()}-${safeName(body.fileName)}`;
    const [policy] = await bucket.file(objectPath).generateSignedPostPolicyV4({
      expires: Date.now() + 10 * 60 * 1000,
      fields: { key: objectPath, 'Content-Type': contentType },
      conditions: [
        ['eq', '$key', objectPath],
        ['eq', '$Content-Type', contentType],
        ['content-length-range', 1, maxBytes],
      ],
    });
    const url = `https://storage.googleapis.com/${bucket.name}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
    return json(res, 200, { ok: true, uploadUrl: policy.url, fields: policy.fields, url, objectPath, maxBytes });
  } catch (error) {
    console.error('[media-upload-url]', String(error?.message || error).slice(0, 200));
    return json(res, 500, { ok: false, error: 'upload_policy_failed' });
  }
}
