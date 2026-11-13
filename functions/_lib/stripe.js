// Small helpers for talking to Stripe without any dependencies.

// Pinned so Stripe's responses keep the same shape even when Stripe releases new versions.
export const STRIPE_VERSION = '2024-06-20';

/**
 * Turns a nested object into the form format Stripe expects:
 *   { line_items: [{ quantity: 2 }] }  ->  line_items[0][quantity]=2
 * null / undefined values are skipped.
 */
export function encodeForm(obj) {
  const pairs = [];
  const walk = (value, key) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}[${k}]` : k);
    } else {
      pairs.push([key, String(value)]);
    }
  };
  walk(obj, '');
  return new URLSearchParams(pairs).toString();
}

/** Calls the Stripe API. Throws an Error (with .status) if Stripe says no. */
export async function stripeRequest(env, method, path, params) {
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  let url = `https://api.stripe.com${path}`;
  const init = { method, headers };
  const body = params ? encodeForm(params) : '';
  if (method === 'GET') {
    if (body) url += `?${body}`;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = body;
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || `Stripe error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks that a webhook really came from Stripe.
 * Stripe signs `${timestamp}.${rawBody}` with the endpoint's signing secret (whsec_...).
 */
export async function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = (parts.find(([k]) => k === 't') || [])[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(mac);
  return signatures.some((s) => safeEqual(s, expected));
}
