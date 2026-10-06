/* POST /api/cashfree-order
 * Creates a Cashfree PG order server-side (secret key never leaves the server).
 * Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV ('test' | 'production', default 'test').
 * Input:  { amount, purpose, customer: { id, email, phone } }
 * Output: { configured: true, payment_session_id, order_id, order_status, env }
 *         or { configured: false } when keys are not set (frontend falls back to demo simulation).
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

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000)
    return json(res, 400, { error: 'bad_amount' });

  const customer = body.customer || {};
  const orderId = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  try {
    const cfRes = await fetch(base(env) + '/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': API_VERSION,
        'x-client-id': appId,
        'x-client-secret': secret,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: Math.round(amount * 100) / 100,
        order_currency: 'INR',
        customer_details: {
          customer_id: String(customer.id || 'guest').slice(0, 64),
          customer_email: String(customer.email || 'noreply@collancer.in').slice(0, 128),
          customer_phone: String(customer.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999',
        },
        order_meta: {
          return_url: body.returnUrl || 'https://collancer.in/payment/return?order_id=' + orderId,
          notify_url: body.notifyUrl || undefined,
        },
        order_note: String(body.purpose || 'Collancer payment').slice(0, 200),
      }),
    });
    const data = await cfRes.json().catch(() => ({}));
    if (!cfRes.ok || !data.payment_session_id) {
      console.error('[cashfree-order]', cfRes.status, JSON.stringify(data).slice(0, 300));
      return json(res, 502, { error: 'order_failed', detail: String(data.message || '').slice(0, 160) });
    }
    return json(res, 200, {
      configured: true,
      payment_session_id: data.payment_session_id,
      order_id: data.order_id,
      order_status: data.order_status,
      env,
    });
  } catch (e) {
    console.error('[cashfree-order] network', String(e && e.message || e).slice(0, 160));
    return json(res, 502, { error: 'network' });
  }
}
