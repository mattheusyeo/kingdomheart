# Kingdomheart

A static website (HTML, CSS, a little JavaScript) with a Stripe Checkout shop.

| Page | File |
| --- | --- |
| Home | `index.html` |
| Gallery (Lifestyle / Stationery / Accessories tabs) | `gallery.html` |
| Product page (opens from the Gallery) | `product.html` |
| Cart | `cart.html` |
| Thank-you page after paying | `success.html` |

## How buying works

1. A customer clicks **Add to cart** on the Gallery page. The cart lives in their browser (ids and quantities only).
2. On the cart page they click **Checkout**. The site asks `functions/api/checkout.js` to create a Stripe Checkout session.
3. The server looks up the **real prices** in `data/products.json`. Anything the browser sends about prices is ignored.
4. The customer pays on Stripe's own page (card, Apple Pay and Google Pay if switched on in Stripe) and gives a delivery address and phone number.
5. Stripe calls `functions/api/webhook.js`, which checks the message is genuinely from Stripe, and records the order with the delivery address and what to order from the supplier.
6. The customer lands on `success.html` and their cart is emptied.

Everything is in Australian dollars (AUD) and deliveries are limited to Australia.

## Things you edit

Everything about products and shipping is in **`data/products.json`**, and the Gallery page is built from it, so a price only ever needs changing in one place:

- `price` is in **cents** (`2000` = $20.00).
- `categories` says which tab shows the product: `lifestyle`, `stationery` and/or `accessories`.
- `unit` (optional) adds a suffix on the Gallery, e.g. `Bunch` shows "$55/Bunch".
- `image` and `alt` are the photo shown in the Gallery and at Stripe checkout, and its description. `tint: true` darkens a photo slightly.
- `images` (optional) is the list of photos on the product page, as `{ "src", "alt" }`. With five photos they form a collage (one large photo and four close-ups); with fewer they sit in a row under the main photo. Click a photo to enlarge it.
- `description` (optional) is a list of paragraphs, and `details` (optional) a list of bullet points, shown on the product page.
- `labels` is the small heading shown beside each tab's products.
- `shipping` is the delivery cost (`amount`, in cents, `0` = free) and the delivery time shown to the customer (`minBusinessDays` / `maxBusinessDays`).
- `allowedCountries` is the list of countries you deliver to.
- `aliexpress.productId` / `skuId` is the AliExpress product each item is ordered from. `productId` is the long number in the AliExpress link (`aliexpress.com/item/<number>.html`). `skuId` is the chosen variant and is still empty.

To add a product: save its photo in `assets/`, then add a line to `products` in `data/products.json`.

> **Real vs placeholder:** the **Acrylic Pen Holder** (Stationery) is a real product. The nine flower items under Lifestyle and Accessories are still the template's **placeholders** with no supplier. Replace them before taking real payments, or customers could buy things you cannot supply.

## Setting up Stripe (test mode first)

1. Create a Stripe account and stay in **test mode** (the "Test mode" switch in the Stripe Dashboard).
2. Copy your **secret key** (starts with `sk_test_`): Dashboard, Developers, API keys. Never put it in a file in this repo or paste it into chat.
3. Deploy the site on **Cloudflare Pages** (Workers & Pages, Create, Pages, connect this GitHub repo). Leave the build command empty and the output directory as `/`. The `functions/` folder is picked up automatically.
4. In the Pages project, Settings, Variables and Secrets, add these as **secrets**:
   - `STRIPE_SECRET_KEY` = your `sk_test_...` key
   - `STRIPE_WEBHOOK_SECRET` = from the next step
5. In Stripe, Developers, Webhooks, **Add endpoint**:
   - URL: `https://YOUR-SITE/api/webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy the **signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`, then redeploy.
6. (Recommended) Create a **KV namespace** and bind it to the Pages project with the variable name `ORDERS`. Orders are saved there and duplicate webhook deliveries are ignored.
7. Place a test order with the test card `4242 4242 4242 4242` (any future expiry, any CVC). It should appear in Stripe, Payments, and in your `ORDERS` KV.

To run it on your own computer: create a file `.dev.vars` containing `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` (it is git-ignored), then run `npm run dev`. Use the Stripe CLI (`stripe listen --forward-to localhost:8788/api/webhook`) to send webhooks to it.

Run the automated tests with `npm test`.

## Going live checklist

- [ ] Real products, prices and photos in `data/products.json` and `gallery.html`
- [ ] Switch Stripe to **live mode**: new `sk_live_` key, a new live webhook endpoint and its `whsec_` secret
- [ ] Add a refund / returns policy, shipping times and your contact details (customers and Stripe both expect them)
- [ ] **GST:** if you are registered, make sure prices include GST (or set up Stripe Tax)
- [ ] Turn on customer receipt emails in Stripe (Settings, Customer emails)
- [ ] Test a real small purchase and refund it

## AliExpress ordering (not connected yet)

Right now each paid order is **recorded**, not forwarded. It is saved with the customer's delivery address and the AliExpress product ids it needs, marked `fulfilment.status: "manual"`. You order from AliExpress yourself, using the details in Stripe or the saved record.

To place AliExpress orders automatically you need an approved app on the **AliExpress Open Platform** with access to the dropshipping API. Once you have its app key and secret, the order call goes in `functions/_lib/fulfil.js` (the comment marks the spot), and each product needs its AliExpress `productId` and `skuId` in `data/products.json`.

## Project layout

```
index.html, gallery.html, cart.html, success.html   pages
css/styles.css                                      all styling
js/menu.js                                          menu dropdown + page fade
js/gallery.js                                       fills the Gallery page from products.json
js/product.js                                       product page: collage, description, add to cart
js/cart.js                                          cart + hand-off to Stripe
data/products.json                                  products, prices, shipping
functions/api/checkout.js                           creates the Stripe Checkout session
functions/api/webhook.js                            receives Stripe's payment message
functions/_lib/                                     helpers (Stripe, prices, order saving)
tests/functions.test.js                             automated tests for the server code
```
