/* Minimal AWS Signature V4 presigned PUT URL helper for Cloudflare R2.
 * Signs only the exact object key and Content-Type; never expose credentials to clients.
 */
import { createHash, createHmac } from 'crypto';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function hmac(key, value, encoding) {
  const result = createHmac('sha256', key).update(value);
  return encoding ? result.digest(encoding) : result.digest();
}
function awsEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) =>
    '%' + char.charCodeAt(0).toString(16).toUpperCase()
  );
}

export function createR2PresignedPutUrl({
  accountId, accessKeyId, secretAccessKey, bucket, key, contentType, expiresIn = 600,
}) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !key || !contentType) {
    throw new Error('Missing required R2 signing input.');
  }
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) {
    throw new Error('Invalid presigned URL expiry.');
  }
  const host = accountId + '.r2.cloudflarestorage.com';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = dateStamp + '/auto/s3/aws4_request';
  const canonicalUri = '/' + [bucket, ...String(key).split('/')].map(awsEncode).join('/');
  const signedHeaders = 'content-type;host';
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', accessKeyId + '/' + scope],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ].map(([name, value]) => awsEncode(name) + '=' + awsEncode(value)).sort().join('&');
  const canonicalHeaders = 'content-type:' + contentType.trim() + '\n' + 'host:' + host + '\n';
  const canonicalRequest = [
    'PUT', canonicalUri, query, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest),
  ].join('\n');
  const dateKey = hmac('AWS4' + secretAccessKey, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return 'https://' + host + canonicalUri + '?' + query + '&X-Amz-Signature=' + signature;
}
