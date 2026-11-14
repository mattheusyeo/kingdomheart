import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

import { encodeForm, verifyStripeSignature } from '../functions/_lib/stripe.js';
import { priceCart } from '../functions/_lib/catalog.js';
import { buildOrder } from '../functions/_lib/fulfil.js';
import { onRequestPost as checkout } from '../functions/api/checkout.js';
import { onRequestPost as webhook } from '../functions/api/webhook.js';

const catalogText = readFileSync(new URL('../data/products.json', import.meta.url), 'utf8');
const catalog = JSON.parse(catalogText);

const realFetch = globalThis.fetch;
let stripeCalls;
beforeEach(() => { stripeCalls = []; });
afterEach(() => { globalThis.fetch = realFetch; });

// Pretend to be Stripe
function fakeStripe(respond) {
  globalThis.fetch = async (url, init = {}) => {
    stripeCalls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const { status = 200, data } = respond(String(url), init);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

const env = (extra = {}) => ({
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  ASSETS: { fetch: async () => new Response(catalogText, { status: 200 }) },
  ...extra,
});
const post = (url, body, headers = {}) =>
  new Request(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

// ---------- helpers ----------
test('encodeForm nests objects and arrays the way Stripe expects', () => {
  const out = decodeURIComponent(encodeForm({ a: 1, line_items: [{ quantity: 2, price_data: { currency: 'aud' } }], skip: undefined, nope: null }));
  assert.equal(out, 'a=1&line_items[0][quantity]=2&line_items[0][price_data][currency]=aud');
});

test('priceCart accepts a valid cart and rejects bad ones', () => {
  assert.equal(priceCart(catalog, [{ id: 'dawn-bloom', qty: 2 }]).lines[0].qty, 2);
  for (const bad of [[], null, [{ id: 'nope', qty: 1 }], [{ id: 'dawn-bloom', qty: 0 }], [{ id: 'dawn-bloom', qty: 11 }],
    [{ id: 'dawn-bloom', qty: 1.5 }], [{ id: 'dawn-bloom', qty: '2' }], [{ id: 'dawn-bloom', qty: 1 }, { id: 'dawn-bloom', qty: 1 }]]) {
    assert.ok(priceCart(catalog, bad).error, `should reject ${JSON.stringify(bad)}`);
  }
});

test('products.json is well formed', () => {
  assert.equal(catalog.currency, 'aud');
  assert.deepEqual(catalog.allowedCountries, ['AU']);
  const ids = new Set();
  for (const p of catalog.products) {
    assert.match(p.id, /^[a-z0-9-]+$/);
    assert.ok(Number.isInteger(p.price) && p.price > 0, `${p.id} price must be whole cents`);
    assert.ok(!ids.has(p.id), `${p.id} duplicated`);
    ids.add(p.id);
    assert.ok(p.categories.length > 0 && p.categories.every((c) => ['lifestyle', 'stationery', 'accessories'].includes(c)), `${p.id} needs valid categories`);
    assert.ok(p.alt && p.image, `${p.id} needs an image and alt text`);
  }
  for (const c of ['lifestyle', 'stationery', 'accessories']) {
    assert.ok(catalog.products.some((p) => p.categories.includes(c)), `${c} tab would be empty`);
  }
});

test('every photo mentioned in products.json exists, and descriptions are lists of text', () => {
  for (const p of catalog.products) {
    const files = [p.image, ...(p.images || []).map((i) => i.src)];
    for (const f of files) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${p.id}: missing file ${f}`);
    for (const i of p.images || []) assert.ok(i.alt, `${p.id}: photo ${i.src} needs alt text`);
    for (const key of ['description', 'details']) {
      if (p[key] !== undefined) assert.ok(Array.isArray(p[key]) && p[key].every((t) => typeof t === 'string' && t.length > 0), `${p.id}.${key}`);
    }
  }
});

test('the stationery tab has the pen holder at $20 with its AliExpress id', () => {
  const p = catalog.products.find((x) => x.id === 'acrylic-pen-holder');
  assert.equal(p.price, 2000);
  assert.deepEqual(p.categories, ['stationery']);
  assert.equal(p.aliexpress.productId, '1005013160170720');
});

// ---------- checkout ----------
test('checkout builds a Stripe session from SERVER prices, ignoring prices sent by the browser', async () => {
  fakeStripe(() => ({ data: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } }));
  const res = await checkout({ request: post('https://shop.example/api/checkout', { items: [{ id: 'dawn-bloom', qty: 2, price: 1 }] }), env: env() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

  assert.equal(stripeCalls.length, 1);
  const call = stripeCalls[0];
  assert.equal(call.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call.headers.Authorization, 'Bearer sk_test_123');
  const f = Object.fromEntries(new URLSearchParams(call.body));
  assert.equal(f.mode, 'payment');
  assert.equal(f['line_items[0][quantity]'], '2');
  assert.equal(f['line_items[0][price_data][currency]'], 'aud');
  assert.equal(f['line_items[0][price_data][unit_amount]'], '5500'); // not the 1 the browser sent
  assert.equal(f['line_items[0][price_data][product_data][name]'], 'Dawn Bloom');
  assert.equal(f['line_items[0][price_data][product_data][metadata][sku]'], 'dawn-bloom');
  assert.equal(f['line_items[0][price_data][product_data][images][0]'], 'https://shop.example/assets/gallery-1.jpg');
  assert.equal(f['shipping_address_collection[allowed_countries][0]'], 'AU');
  assert.equal(f['phone_number_collection[enabled]'], 'true');
  assert.equal(f['shipping_options[0][shipping_rate_data][fixed_amount][currency]'], 'aud');
  assert.equal(f['shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]'], 'business_day');
  assert.equal(f.success_url, 'https://shop.example/success.html?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(f.cancel_url, 'https://shop.example/cart.html?canceled=1');
});

test('checkout leaves product images out on a non-https site (Stripe cannot fetch them)', async () => {
  fakeStripe(() => ({ data: { url: 'https://checkout.stripe.com/x' } }));
  await checkout({ request: post('http://localhost:8788/api/checkout', { items: [{ id: 'dawn-bloom', qty: 1 }] }), env: env() });
  const f = Object.fromEntries(new URLSearchParams(stripeCalls[0].body));
  assert.equal(f['line_items[0][price_data][product_data][images][0]'], undefined);
});

test('checkout rejects bad carts without calling Stripe', async () => {
  fakeStripe(() => ({ data: {} }));
  for (const body of [{ items: [] }, { items: [{ id: 'nope', qty: 1 }] }, { items: [{ id: 'dawn-bloom', qty: 99 }] }, {}]) {
    const res = await checkout({ request: post('https://shop.example/api/checkout', body), env: env() });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const res = await checkout({ request: post('https://shop.example/api/checkout', 'not json'), env: env() });
  assert.equal(res.status, 400);
  assert.equal(stripeCalls.length, 0);
});

test('checkout says so when Stripe is not configured, and hides Stripe errors from customers', async () => {
  const res = await checkout({ request: post('https://shop.example/api/checkout', { items: [{ id: 'dawn-bloom', qty: 1 }] }), env: env({ STRIPE_SECRET_KEY: undefined }) });
  assert.equal(res.status, 503);

  fakeStripe(() => ({ status: 401, data: { error: { message: 'Invalid API Key provided: sk_test_123' } } }));
  const bad = await checkout({ request: post('https://shop.example/api/checkout', { items: [{ id: 'dawn-bloom', qty: 1 }] }), env: env() });
  assert.equal(bad.status, 502);
  assert.ok(!(await bad.text()).includes('sk_test'), 'must not leak Stripe error details');
});

// ---------- webhook ----------
const sign = (body, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

const paidSession = {
  id: 'cs_test_paid', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1', created: 1700000000,
  currency: 'aud', amount_total: 11000, total_details: { amount_shipping: 0 },
  customer_details: { email: 'buyer@example.com', name: 'Sam Buyer', phone: '+61400000000' },
  shipping_details: { name: 'Sam Buyer', address: { line1: '1 George St', line2: null, city: 'Sydney', state: 'NSW', postal_code: '2000', country: 'AU' } },
  line_items: { data: [{ description: 'Dawn Bloom', quantity: 2, amount_total: 11000, price: { unit_amount: 5500, product: { metadata: { sku: 'dawn-bloom' } } } }] },
};
const event = (type = 'checkout.session.completed') => JSON.stringify({ id: 'evt_1', type, data: { object: { id: 'cs_test_paid' } } });
const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };

test('verifyStripeSignature accepts a good signature and rejects bad, old or missing ones', async () => {
  const body = '{"a":1}';
  assert.equal(await verifyStripeSignature(body, sign(body), 'whsec_test'), true);
  assert.equal(await verifyStripeSignature(body, sign(body, 'whsec_other'), 'whsec_test'), false);
  assert.equal(await verifyStripeSignature(body + ' ', sign(body), 'whsec_test'), false, 'tampered body');
  assert.equal(await verifyStripeSignature(body, sign(body, 'whsec_test', Math.floor(Date.now() / 1000) - 3600), 'whsec_test'), false, 'too old');
  assert.equal(await verifyStripeSignature(body, null, 'whsec_test'), false);
  assert.equal(await verifyStripeSignature(body, 't=abc,v1=00', 'whsec_test'), false);
});

test('webhook rejects unsigned or wrongly signed requests', async () => {
  fakeStripe(() => ({ data: paidSession }));
  const body = event();
  for (const headers of [{}, { 'stripe-signature': sign(body, 'whsec_wrong') }]) {
    const res = await webhook({ request: post('https://shop.example/api/webhook', body, headers), env: env() });
    assert.equal(res.status, 400);
  }
  assert.equal(stripeCalls.length, 0);
});

test('webhook turns a paid session into a saved order, and only once', async () => {
  fakeStripe(() => ({ data: paidSession }));
  const store = kv();
  const body = event();
  const req = () => post('https://shop.example/api/webhook', body, { 'stripe-signature': sign(body) });

  const first = await webhook({ request: req(), env: env({ ORDERS: store }) });
  assert.equal(first.status, 200);
  assert.equal(await first.text(), 'OK');
  assert.match(stripeCalls[0].url, /\/v1\/checkout\/sessions\/cs_test_paid\?expand%5B0%5D=line_items\.data\.price\.product$/);

  const saved = JSON.parse(store.m.get('order:cs_test_paid'));
  assert.equal(saved.customer.email, 'buyer@example.com');
  assert.equal(saved.shipping.postalCode, '2000');
  assert.deepEqual(saved.items, [{ sku: 'dawn-bloom', name: 'Dawn Bloom', quantity: 2, unitAmount: 5500, total: 11000 }]);
  assert.equal(saved.fulfilment.status, 'manual');
  assert.match(saved.fulfilment.reason, /dawn-bloom/);

  const again = await webhook({ request: req(), env: env({ ORDERS: store }) });
  assert.equal(await again.text(), 'Already processed');
  assert.equal(store.m.size, 1);
});

test('webhook ignores other events and unpaid sessions, and asks Stripe to retry on failure', async () => {
  fakeStripe(() => ({ data: { ...paidSession, payment_status: 'unpaid' } }));
  let body = event('payment_intent.created');
  let res = await webhook({ request: post('https://shop.example/api/webhook', body, { 'stripe-signature': sign(body) }), env: env() });
  assert.equal(await res.text(), 'Ignored');
  assert.equal(stripeCalls.length, 0);

  body = event();
  res = await webhook({ request: post('https://shop.example/api/webhook', body, { 'stripe-signature': sign(body) }), env: env() });
  assert.equal(await res.text(), 'Not paid yet');

  fakeStripe(() => ({ status: 500, data: {} }));
  res = await webhook({ request: post('https://shop.example/api/webhook', body, { 'stripe-signature': sign(body) }), env: env() });
  assert.equal(res.status, 500);
});

test('buildOrder copes with a session that has no shipping details', () => {
  const order = buildOrder({ id: 'cs_x', created: 1, line_items: { data: [] } });
  assert.equal(order.shipping.line1, null);
  assert.deepEqual(order.items, []);
});

test('the gel pens are in stationery at $13 with their AliExpress id', () => {
  const p = catalog.products.find((x) => x.id === 'gel-pens-5-pack');
  assert.equal(p.price, 1300);
  assert.deepEqual(p.categories, ['stationery']);
  assert.equal(p.aliexpress.productId, '1005012367079794');
});
