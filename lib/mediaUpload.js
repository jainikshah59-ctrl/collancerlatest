/* Shared handler for /api/media-upload-url — authenticated Cloudflare R2 upload signing.
 * Required server-only env: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON.
 * This endpoint is for public creator/business media only, never private verification files.
 */
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyUid, readBody } from '../lib/firebaseAdmin.js';

const FOLDERS = new Set([
  'collancer_pfps', 'collancer_market_briefs', 'collancer_briefs',
  'collancer_promos', 'collancer_promos_thumbnails',
]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 200 * 1024 * 1024;
let client;

function getR2Client() {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    const error = new Error('R2 media storage is not configured.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function safeName(value) {
  const raw = String(value || 'upload').split('/').pop().split(String.fromCharCode(92)).pop();
  const name = raw.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90);
  return name || 'upload';
}
function publicUrl(objectPath) {
  let base = String(process.env.R2_PUBLIC_BASE_URL || '').trim();
  while (base.endsWith('/')) base = base.slice(0, -1);
  if (!base.startsWith('https://')) throw new Error('R2_PUBLIC_BASE_URL must be an HTTPS public/custom domain.');
  return base + '/' + objectPath.split('/').map(encodeURIComponent).join('/');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = readBody(req);
    let uid;
    try { uid = await verifyUid(body.idToken); }
    catch { return json(res, 401, { ok: false, error: 'unauthenticated' }); }

    const bucketName = process.env.R2_BUCKET;
    if (!bucketName || !process.env.R2_PUBLIC_BASE_URL) {
      return json(res, 503, { ok: false, error: 'media_storage_not_configured' });
    }
    const folder = String(body.folder || '');
    const contentType = String(body.contentType || '').toLowerCase();
    const size = Number(body.size);
    if (!FOLDERS.has(folder)) return json(res, 400, { ok: false, error: 'invalid_folder' });
    const maxBytes = IMAGE_TYPES.has(contentType) ? IMAGE_MAX : VIDEO_TYPES.has(contentType) ? VIDEO_MAX : 0;
    if (!maxBytes) return json(res, 415, { ok: false, error: 'unsupported_file_type' });
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
      return json(res, 413, { ok: false, error: 'file_size_limit', maxBytes });
    }

    const objectPath = `users/${uid}/${folder}/${randomUUID()}-${safeName(body.fileName)}`;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectPath,
      ContentType: contentType,
      CacheControl: 'public, max-age=86400',
    });
    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 600 });
    return json(res, 200, {
      ok: true,
      uploadUrl,
      headers: { 'Content-Type': contentType },
      url: publicUrl(objectPath),
      objectPath,
      maxBytes,
    });
  } catch (error) {
    console.error('[media-upload-url]', String(error?.message || error).slice(0, 200));
    return json(res, 500, { ok: false, error: 'upload_policy_failed' });
  }
}
