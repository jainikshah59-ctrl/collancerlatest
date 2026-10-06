/* Cloudinary unsigned uploads — per audit §12.1 / §14. */
export const CLOUDINARY_CLOUD = 'dd77dqbho';
export const CLOUDINARY_PRESET = 'collancer';

export const CLOUDINARY_FOLDERS = {
  pfp: 'collancer_pfps',
  marketBriefs: 'collancer_market_briefs',
  briefs: 'collancer_briefs',
};

/**
 * Upload a File/Blob to Cloudinary (unsigned).
 * @param {File|Blob} file
 * @param {'image'|'video'|'auto'} resourceType
 * @param {string} folder
 * @returns {Promise<{url, publicId}>} secure_url
 */
export async function uploadToCloudinary(file, resourceType = 'image', folder = CLOUDINARY_FOLDERS.pfps) {
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', folder);
  const res = await fetch(endpoint, { method: 'POST', body: fd });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${res.status}): ${t.slice(0, 120)}`);
  }
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

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

/** Read a file as a base64 data URL (business pfp path — stored directly in Firestore). */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}
