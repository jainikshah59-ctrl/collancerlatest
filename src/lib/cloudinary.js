/* Google Cloud Storage media uploads.
 * Browser requests a short-lived, authenticated upload policy from Vercel,
 * then sends file bytes directly to GCS. No service-account secret is client-side.
 */
import { auth as getFirebaseAuth, ensureFirebase } from './firebase.js';

export const GCS_FOLDERS = {
  pfp: 'collancer_pfps',
  marketBriefs: 'collancer_market_briefs',
  briefs: 'collancer_briefs',
  promos: 'collancer_promos',
  promoThumbnails: 'collancer_promos_thumbnails',
};
// Compatibility alias for older imports.
export const CLOUDINARY_FOLDERS = GCS_FOLDERS;

export async function uploadToGCS(file, resourceType = 'image', folder = GCS_FOLDERS.pfp) {
  await ensureFirebase();
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new Error('Please sign in again before uploading media.');

  const contentType = String(file?.type || '').toLowerCase();
  if (!contentType) throw new Error('This file has no recognised content type.');
  if (resourceType === 'image' && !contentType.startsWith('image/')) throw new Error('Choose an image file.');
  if (resourceType === 'video' && !contentType.startsWith('video/')) throw new Error('Choose a video file.');

  const response = await fetch('/api/media-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: await user.getIdToken(),
      folder,
      contentType,
      size: Number(file.size || 0),
      fileName: String(file.name || 'upload'),
    }),
  });
  const policy = await response.json().catch(() => ({}));
  if (!response.ok || !policy.ok || !policy.uploadUrl || !policy.fields) {
    throw new Error(policy.error || 'Could not prepare secure media upload.');
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(policy.fields)) form.append(key, value);
  form.append('file', file, String(file.name || 'upload'));
  const uploaded = await fetch(policy.uploadUrl, { method: 'POST', body: form });
  if (!uploaded.ok) throw new Error('Google Cloud Storage upload failed (' + uploaded.status + ').');
  return { url: policy.url, publicId: policy.objectPath };
}

// Backwards-compatible export while any external/local call sites are updated.
export const uploadToCloudinary = uploadToGCS;

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

/** Legacy helper retained for compatibility; new uploads should use GCS. */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}
