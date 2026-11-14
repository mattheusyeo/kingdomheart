// POST /api/checkout   body: { items: [{ id, qty }] }   ->   { url }  (Stripe Checkout page)
import { stripeRequest } from '../_lib/stripe.js';
import { loadCatalog, priceCart } from '../_lib/catalog.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Checkout is not set up yet.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }

  let catalog;
  try {
    catalog = await loadCatalog(request, env);
  } catch (e) {
    return json({ error: 'Products are unavailable right now. Please try again.' }, 503);
  }

  const priced = priceCart(catalog, body && body.items);
  if (priced.error) return json({ error: priced.error }, 400);

  const origin = new URL(request.url).origin;
  const shipping = catalog.shipping;

  const params = {
    mode: 'payment',
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cart.html?canceled=1`,
    line_items: priced.lines.map(({ product, option, qty, unitAmount }) => ({
      quantity: qty,
      price_data: {
        currency: catalog.currency,
        unit_amount: unitAmount, // cents, always taken from the server's list
        product_data: {
          name: option ? `${product.name} (${option.name})` : product.name,
          // read back by the webhook to know what to order from the supplier
          metadata: { sku: product.id, option: option ? option.id : undefined },
          // Stripe can only fetch images from a public https address
          images: origin.startsWith('https://')
            ? [new URL((option && (option.thumb || option.image)) || product.image, `${origin}/`).href]
            : undefined,
        },
      },
    })),
    // The supplier needs a delivery address and a phone number for the courier
    shipping_address_collection: { allowed_countries: catalog.allowedCountries },
    phone_number_collection: { enabled: true },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: shipping.label,
          fixed_amount: { amount: shipping.amount, currency: catalog.currency },
          delivery_estimate: {
            minimum: { unit: 'business_day', value: shipping.minBusinessDays },
            maximum: { unit: 'business_day', value: shipping.maxBusinessDays },
          },
        },
      },
    ],
  };

  try {
    const session = await stripeRequest(env, 'POST', '/v1/checkout/sessions', params);
    return json({ url: session.url });
  } catch (e) {
    console.log('Stripe checkout error:', e.message);
    return json({ error: 'We could not start checkout. Please try again in a moment.' }, 502);
  }
}
