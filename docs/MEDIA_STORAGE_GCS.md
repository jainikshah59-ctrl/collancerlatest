# Collancer media storage: Google Cloud Storage

Firebase Authentication and Firestore remain in place. The browser requests a short-lived upload policy from `POST /api/media-upload-url` (a Vercel rewrite to the existing serverless handler, to stay within the Hobby function-count limit), then uploads file bytes directly to GCS. The service-account key is server-only.

## Required setup before enabling uploads

1. In Google Cloud Console, select project `collancer-8fd62` and create/choose a dedicated Cloud Storage bucket. Bucket names are globally unique; choose location and retention settings deliberately.
2. In Vercel → Project → Settings → Environment Variables, set:
   - `GCS_BUCKET` to the exact bucket name (not a URL).
   - `FIREBASE_SERVICE_ACCOUNT_JSON` to the server-only service-account JSON already used by `lib/firebaseAdmin.js`.
3. Give that service account permission to create objects and sign upload policies for this bucket. Never commit its private key or put it in frontend variables.
4. Configure bucket CORS for exact production/preview origins, method `POST`, and header `Content-Type`. Avoid wildcard origins in production.
5. Existing profile photos, portfolio items, marketplace briefs and booking media are served as public Cloudinary URLs. To preserve current rendering, this migration expects public-readable objects for these non-sensitive media paths. Do not put private identity-verification files or confidential documents in these public folders; those require a separate private-bucket/download flow.
6. Deploy this branch as a Vercel Preview and test sign-in, image upload, video upload/playback, and profile/brief display before merging. Missing configuration returns an explicit error and does not fall back to storing Base64 in Firestore.

The API allowlist contains `collancer_pfps`, `collancer_market_briefs`, `collancer_briefs`, `collancer_promos`, and `collancer_promos_thumbnails`. Images are limited to 10 MiB and videos to 200 MiB. Signed POST policies constrain the key, MIME type and content-length range.

## Existing media migration

The migration script is separate from deployment. It scans Firestore documents/subcollections for Cloudinary URLs and legacy Base64 image data, uploads replacements to GCS and updates matching Firestore fields. It never deletes the original Cloudinary assets.

Run a dry run first (default):

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"...":"..."}' GCS_BUCKET='your-bucket-name' node scripts/migrate-cloudinary-to-gcs.js
```

Review the report, then explicitly apply:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"...":"..."}' GCS_BUCKET='your-bucket-name' node scripts/migrate-cloudinary-to-gcs.js --apply
```

Back up Firestore first, migrate during a low-traffic window, and retain Cloudinary originals until production verification and the rollback window are complete.
