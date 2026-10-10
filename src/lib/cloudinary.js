/* Cloudflare R2 media uploads.
 * The authenticated Vercel API signs a short-lived S3-compatible PUT URL.
 * R2 credentials remain server-only; Firebase Auth/Firestore remain unchanged.
 */
import { auth as getFirebaseAuth, ensureFirebase } from './firebase.js';

export const R2_FOLDERS = {
  pfp: 'collancer_pfps',
  marketBriefs: 'collancer_market_briefs',
  briefs: 'collancer_briefs',
  promos: 'collancer_promos',
  promoThumbnails: 'collancer_promos_thumbnails',
};
// Compatibility aliases for existing call sites/imports.
export const GCS_FOLDERS = R2_FOLDERS;
export const CLOUDINARY_FOLDERS = R2_FOLDERS;

export async function uploadToR2(file, resourceType = 'image', folder = R2_FOLDERS.pfp) {
  await ensureFirebase();
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new Error('Please sign in again before uploading media.');

  const contentType = String(file?.type || '').toLowerCase();
  if (!contentType) throw new Error('This file has no recognised content type.');
  if (resourceType === 'image' && !contentType.startsWith('image/')) throw new Error('Choose an image file.');
  if (resourceType === 'video' && !contentType.startsWith('video/')) throw new Error('Choose a video file.');
  if (!Number.isSafeInteger(Number(file?.size)) || file.size < 1) throw new Error('Choose a non-empty file.');

  const response = await fetch('/api/media-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: await user.getIdToken(),
      folder,
      contentType,
      size: Number(file.size),
      fileName: String(file.name || 'upload'),
    }),
  });
  const policy = await response.json().catch(() => ({}));
  if (!response.ok || !policy.ok || !policy.uploadUrl || !policy.url) {
    throw new Error(policy.error || 'Could not prepare secure media upload.');
  }

  const uploaded = await fetch(policy.uploadUrl, {
    method: 'PUT',
    headers: policy.headers || { 'Content-Type': contentType },
    body: file,
  });
  if (!uploaded.ok) throw new Error('Cloudflare R2 upload failed (' + uploaded.status + ').');
  return { url: policy.url, publicId: policy.objectPath };
}

// Keep old imports working while call sites migrate to the neutral helper name.
export const uploadToGCS = uploadToR2;
export const uploadToCloudinary = uploadToR2;

/** Downscale an image file to a JPEG blob (for profile photos). */
export function compressImage(file, maxDim = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}

/** Legacy helper retained for compatibility; new uploads should use R2. */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}
