// POST /api/webhook   (Stripe calls this after a payment)
import { stripeRequest, verifyStripeSignature } from '../_lib/stripe.js';
import { loadCatalog } from '../_lib/catalog.js';
import { buildOrder, fulfil } from '../_lib/fulfil.js';

const reply = (text, status = 200) => new Response(text, { status });

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return reply('Webhook is not set up yet', 503);
  }

  // The signature is calculated over the exact raw text, so read it before parsing.
  const raw = await request.text();
  const genuine = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!genuine) return reply('Invalid signature', 400);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    return reply('Invalid payload', 400);
  }

  // "completed" fires when the customer finishes; "async_payment_succeeded" when a slower
  // payment method (e.g. bank transfer) finally clears.
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return reply('Ignored');
  }

  try {
    const id = event.data && event.data.object && event.data.object.id;
    // Fetch the full session so the line items and address are in a known format
    const session = await stripeRequest(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      expand: ['line_items.data.price.product'],
    });
    if (session.payment_status !== 'paid') return reply('Not paid yet');

    const catalog = await loadCatalog(request, env);
    const result = await fulfil(buildOrder(session), catalog, env);
    return reply(result.duplicate ? 'Already processed' : 'OK');
  } catch (e) {
    // A 500 makes Stripe retry later
    console.log('Webhook error:', e.message);
    return reply('Error', 500);
  }
}
