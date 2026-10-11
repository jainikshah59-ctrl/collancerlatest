/* POST /api/cashfree-verify
 * Verifies a Cashfree order's payment status server-side. NEVER trust the
 * frontend checkout result alone — only order_status === 'PAID' counts.
 * Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV.
 * Input:  { order_id }
 * Output: { order_status, order_amount, cf_payment_id, env }  (order_status: PAID | ACTIVE | EXPIRED | ...)
 */
const API_VERSION = '2023-08-01';

function base(env) {
  return env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const env = (process.env.CASHFREE_ENV || 'test').toLowerCase() === 'production' ? 'production' : 'test';
  if (!appId || !secret) return json(res, 200, { configured: false });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return json(res, 400, { error: 'bad_json' }); }
  const orderId = String(body.order_id || '').trim();
  if (!orderId) return json(res, 400, { error: 'missing_order_id' });

  try {
    const cfRes = await fetch(base(env) + '/orders/' + encodeURIComponent(orderId), {
      headers: {
        'x-api-version': API_VERSION,
        'x-client-id': appId,
        'x-client-secret': secret,
      },
    });
    const data = await cfRes.json().catch(() => ({}));
    if (!cfRes.ok) {
      console.error('[cashfree-verify]', cfRes.status, JSON.stringify(data).slice(0, 200));
      return json(res, 502, { error: 'verify_failed' });
    }
    return json(res, 200, {
      order_status: data.order_status,
      order_amount: data.order_amount,
      cf_payment_id: data.cf_order_id || null,
      env,
    });
  } catch (e) {
    console.error('[cashfree-verify] network', String(e && e.message || e).slice(0, 160));
    return json(res, 502, { error: 'network' });
  }
}
