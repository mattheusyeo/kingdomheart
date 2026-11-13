// The product list lives in data/products.json. The server always re-reads it, so prices can
// never be changed from the browser: the cart only sends product ids and quantities.

export const MAX_QTY = 10;
export const MAX_LINES = 20;

export async function loadCatalog(request, env) {
  const res = await env.ASSETS.fetch(new URL('/data/products.json', request.url));
  if (!res.ok) throw new Error('Product list unavailable');
  return res.json();
}

/** Checks the cart from the browser against the catalog. Returns { lines } or { error }. */
export function priceCart(catalog, items) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'Your cart is empty.' };
  if (items.length > MAX_LINES) return { error: 'Too many different items in the cart.' };

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const seen = new Set();
  const lines = [];
  for (const item of items) {
    const product = byId.get(item && item.id);
    if (!product) return { error: 'One of the items in your cart is no longer available.' };
    if (seen.has(product.id)) return { error: 'The same item appears twice in the cart.' };
    seen.add(product.id);
    const qty = item.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { error: `Quantity must be between 1 and ${MAX_QTY}.` };
    }
    lines.push({ product, qty });
  }
  return { lines };
}
