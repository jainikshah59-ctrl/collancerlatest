# Collancer media storage: Cloudflare R2

Firebase Authentication and Firestore remain unchanged. New public creator/business media uploads use Cloudflare R2. The browser requests a short-lived signed S3-compatible PUT URL from `POST /api/media-upload-url` (rewritten to the existing Vercel serverless handler to preserve the function-count budget), then uploads bytes directly to R2. R2 credentials remain server-only.

## Required setup before enabling uploads

1. In Cloudflare Dashboard → R2, create a dedicated bucket. Create an R2 API token scoped to that bucket with Object Read & Write permissions. Store its Access Key ID and Secret Access Key in Vercel only.
2. Configure these Vercel Environment Variables for Preview first, then Production after testing:
   - `R2_ACCOUNT_ID`: Cloudflare account ID.
   - `R2_BUCKET`: exact bucket name.
   - `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: R2 S3 credentials.
   - `R2_PUBLIC_BASE_URL`: HTTPS custom domain connected to this bucket (recommended for production). Use the bucket's `r2.dev` URL only for testing if enabled; do not expose credentials.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: existing server-only Firebase Admin service-account JSON.
3. Configure the bucket's CORS policy to allow the exact Vercel preview and production origins, method `PUT`, and header `Content-Type`. Do not use wildcard origins in production.
4. Ensure the public domain is configured for this bucket and HTTPS works. The media URLs returned by the API use this base domain.
5. This public-media route is only for profile photos, public portfolio media, campaign/marketplace briefs and promo media. Do not upload private identity-verification files, government IDs, confidential booking data, or other sensitive files to the public bucket; those need a separate private bucket and authenticated download flow.
6. Deploy the feature branch to Vercel Preview and test sign-in, image upload, video upload/playback, and profile/brief display before merging. Missing configuration returns an explicit error; it does not fall back to Base64 in Firestore.

The API allowlist contains `collancer_pfps`, `collancer_market_briefs`, `collancer_briefs`, `collancer_promos`, and `collancer_promos_thumbnails`. The signing endpoint validates declared image size (10 MiB maximum) and video size (200 MiB maximum), MIME type, and folder. Signed PUT URLs expire after 10 minutes. The browser also validates the selected file. Because S3-compatible presigned PUT URLs do not enforce the browser's declared size as a server-side content-length policy, production abuse protection should include per-user rate/usage limits; do not treat client-declared size as a hard storage quota.

## Existing media migration

The migration script is separate from deployment. It scans Firestore documents/subcollections for Cloudinary URLs and legacy Base64 image data, uploads replacements to R2, and updates matching Firestore fields. It never deletes the original Cloudinary assets. It skips unsupported source URLs and records failures.

Run a dry run first (default):

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"...":"..."}' R2_ACCOUNT_ID='...' R2_BUCKET='your-bucket' R2_ACCESS_KEY_ID='...' R2_SECRET_ACCESS_KEY='...' R2_PUBLIC_BASE_URL='https://media.example.com' node scripts/migrate-cloudinary-to-r2.js
```

Review the report, back up Firestore, then explicitly apply:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"...":"..."}' R2_ACCOUNT_ID='...' R2_BUCKET='your-bucket' R2_ACCESS_KEY_ID='...' R2_SECRET_ACCESS_KEY='...' R2_PUBLIC_BASE_URL='https://media.example.com' node scripts/migrate-cloudinary-to-r2.js --apply
```

Migrate during a low-traffic window. Keep Cloudinary originals until production verification and the rollback window are complete.
