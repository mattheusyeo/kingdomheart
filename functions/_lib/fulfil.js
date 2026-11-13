// What happens after a customer has paid.

/** Turns a Stripe Checkout Session (with line items expanded) into a simple order record. */
export function buildOrder(session) {
  const ship = session.shipping_details || {};
  const addr = ship.address || {};
  const customer = session.customer_details || {};
  return {
    id: session.id,
    paymentIntent: session.payment_intent || null,
    createdAt: new Date((session.created || 0) * 1000).toISOString(),
    currency: session.currency,
    amountTotal: session.amount_total,
    shippingCost: (session.total_details && session.total_details.amount_shipping) || 0,
    customer: {
      name: ship.name || customer.name || null,
      email: customer.email || null,
      phone: customer.phone || null,
    },
    shipping: {
      line1: addr.line1 || null,
      line2: addr.line2 || null,
      city: addr.city || null,
      state: addr.state || null,
      postalCode: addr.postal_code || null,
      country: addr.country || null,
    },
    items: ((session.line_items && session.line_items.data) || []).map((li) => ({
      sku: (li.price && li.price.product && li.price.product.metadata && li.price.product.metadata.sku) || null,
      name: li.description,
      quantity: li.quantity,
      unitAmount: li.price ? li.price.unit_amount : null,
      total: li.amount_total,
    })),
  };
}

/**
 * Records the order and works out what the supplier needs.
 *
 * Placing the order on AliExpress automatically is NOT connected yet. It needs an approved
 * AliExpress Open Platform app (dropshipping API). Until then every order is saved with the
 * status "manual" and the supplier product ids it will need, so it can be ordered by hand from
 * the Stripe Dashboard or the saved record.
 *
 * The AliExpress call belongs where `fulfilment` is set below.
 */
export async function fulfil(order, catalog, env) {
  const key = `order:${order.id}`;

  // Stripe can send the same event more than once: never process an order twice.
  if (env.ORDERS) {
    const existing = await env.ORDERS.get(key);
    if (existing) return { duplicate: true };
  }

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const supplierLines = order.items.map((item) => {
    const product = byId.get(item.sku);
    const ali = (product && product.aliexpress) || {};
    return { sku: item.sku, quantity: item.quantity, aliexpressProductId: ali.productId || null, aliexpressSkuId: ali.skuId || null };
  });
  const missing = supplierLines.filter((l) => !l.aliexpressProductId).map((l) => l.sku);

  const fulfilment = {
    status: 'manual',
    reason: missing.length
      ? `No AliExpress product id saved for: ${missing.join(', ')}`
      : 'AliExpress automatic ordering is not connected yet',
    supplierLines,
  };

  if (env.ORDERS) {
    await env.ORDERS.put(key, JSON.stringify({ ...order, fulfilment }));
  }
  // Deliberately no customer details in the logs
  console.log(`Order ${order.id} paid (${order.amountTotal} ${order.currency}); fulfilment: ${fulfilment.status}`);
  return { duplicate: false, fulfilment: fulfilment.status };
}
