// Shopping cart: add to cart on the Gallery page, the cart page, and the hand-off to Stripe.
// The cart only remembers product ids and quantities. Prices always come from data/products.json
// for display and are re-checked on the server before anyone is charged.
(function () {
  var KEY = 'kh-cart';
  var MAX_QTY = 10;
  var memory = {}; // used only if the browser blocks localStorage

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && typeof c === 'object' && !Array.isArray(c)) return c;
    } catch (e) { return memory; }
    return {};
  }
  function write(cart) {
    memory = cart;
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* memory fallback */ }
    updateBadge();
  }
  function count() {
    var c = read(), n = 0;
    Object.keys(c).forEach(function (id) { n += c[id]; });
    return n;
  }
  function add(id) {
    var c = read();
    c[id] = Math.min((c[id] || 0) + 1, MAX_QTY);
    write(c);
  }
  function setQty(id, qty) {
    var c = read();
    if (qty < 1) delete c[id]; else c[id] = Math.min(qty, MAX_QTY);
    write(c);
  }
  function clear() { write({}); }

  function updateBadge() {
    var n = count();
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
    });
    document.querySelectorAll('.cart-link').forEach(function (el) {
      el.setAttribute('aria-label', n ? 'Cart, ' + n + (n === 1 ? ' item' : ' items') : 'Cart, empty');
    });
  }

  var money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  function fmt(cents) { return money.format(cents / 100); }

  var catalogPromise;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('data/products.json').then(function (r) {
        if (!r.ok) throw new Error('catalog');
        return r.json();
      });
    }
    return catalogPromise;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- Gallery page: "Add to cart" buttons (created by gallery.js, so listen on the page) ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    if (btn._label === undefined) btn._label = btn.lastChild.textContent;
    add(btn.getAttribute('data-add-to-cart'));
    btn.lastChild.textContent = 'Added';
    btn.setAttribute('aria-live', 'polite');
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.lastChild.textContent = btn._label; }, 1400);
  });

  /* ---------- Cart page ---------- */
  var root = document.getElementById('cart-root');
  if (root) {
    var message = '';
    if (new URLSearchParams(window.location.search).get('canceled')) {
      message = 'Checkout was cancelled. Your cart is still here.';
    }

    var render = function (catalog) {
      var byId = {};
      catalog.products.forEach(function (p) { byId[p.id] = p; });
      var cart = read();
      // forget anything that is no longer sold
      var ids = Object.keys(cart).filter(function (id) { return byId[id]; });
      if (ids.length !== Object.keys(cart).length) {
        var cleaned = {};
        ids.forEach(function (id) { cleaned[id] = cart[id]; });
        write(cleaned); cart = cleaned;
      }

      root.textContent = '';
      if (message) root.appendChild(el('p', 'cart-note', message));

      if (ids.length === 0) {
        var empty = el('div', 'cart-empty');
        empty.appendChild(el('p', null, 'Your cart is empty.'));
        var shop = el('a', 'button', 'Keep shopping');
        shop.href = 'gallery.html?category=lifestyle';
        empty.appendChild(shop);
        root.appendChild(empty);
        return;
      }

      var grid = el('div', 'cart-grid');
      var list = el('ul', 'cart-items');
      var subtotal = 0;

      ids.forEach(function (id) {
        var p = byId[id], qty = cart[id];
        subtotal += p.price * qty;

        var row = el('li', 'cart-row');
        var img = el('img', 'cart-thumb');
        img.src = p.image; img.alt = p.name; img.width = 96; img.height = 96;
        row.appendChild(img);

        var info = el('div', 'cart-info');
        info.appendChild(el('p', 'cart-name', p.name));
        info.appendChild(el('p', 'cart-unit', fmt(p.price)));
        var remove = el('button', 'cart-remove', 'Remove');
        remove.type = 'button';
        remove.addEventListener('click', function () { setQty(id, 0); render(catalog); });
        info.appendChild(remove);
        row.appendChild(info);

        var stepper = el('div', 'qty');
        var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Fewer ' + p.name);
        var num = el('span', null, String(qty)); num.setAttribute('aria-live', 'polite');
        var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'More ' + p.name);
        plus.disabled = qty >= MAX_QTY;
        minus.addEventListener('click', function () { setQty(id, qty - 1); render(catalog); });
        plus.addEventListener('click', function () { setQty(id, qty + 1); render(catalog); });
        stepper.appendChild(minus); stepper.appendChild(num); stepper.appendChild(plus);
        row.appendChild(stepper);

        row.appendChild(el('p', 'cart-line', fmt(p.price * qty)));
        list.appendChild(row);
      });

      var summary = el('aside', 'cart-summary');
      summary.appendChild(el('h2', 'cart-summary-title', 'Order summary'));
      var line = el('p', 'cart-subtotal');
      line.appendChild(el('span', null, 'Subtotal'));
      line.appendChild(el('strong', null, fmt(subtotal)));
      summary.appendChild(line);
      summary.appendChild(el('p', 'cart-fineprint', 'Shipping is shown at checkout. Prices are in Australian dollars (AUD).'));
      var status = el('p', 'cart-error'); status.setAttribute('role', 'alert'); status.hidden = true;
      var go = el('button', 'button button-lg', 'Checkout');
      go.type = 'button';
      go.addEventListener('click', function () { checkout(go, status); });
      summary.appendChild(go);
      summary.appendChild(status);

      grid.appendChild(list);
      grid.appendChild(summary);
      root.appendChild(grid);
    };

    var checkout = function (button, status) {
      var cart = read();
      var items = Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; });
      button.disabled = true;
      var original = button.textContent;
      button.textContent = 'Taking you to payment…';
      status.hidden = true;

      var fail = function (text) {
        button.disabled = false;
        button.textContent = original;
        status.textContent = text;
        status.hidden = false;
      };

      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (r) {
        if (!r.ok || !r.data.url) { fail(r.data.error || 'We could not start checkout. Please try again.'); return; }
        var host = '';
        try { host = new URL(r.data.url).hostname; } catch (e) { /* ignore */ }
        if (!/(^|\.)stripe\.com$/.test(host)) { fail('We could not start checkout. Please try again.'); return; }
        window.location.assign(r.data.url);
      }).catch(function () {
        fail('Checkout is not available right now. Please try again shortly.');
      });
    };

    loadCatalog().then(render).catch(function () {
      root.textContent = '';
      root.appendChild(el('p', 'cart-error', 'We could not load your cart. Please refresh the page.'));
    });
  }

  /* ---------- Thank-you page: empty the cart once the payment went through ---------- */
  if (document.getElementById('order-complete') && new URLSearchParams(window.location.search).get('session_id')) {
    clear();
  }

  updateBadge();
  window.addEventListener('storage', function (e) { if (e.key === KEY) updateBadge(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) updateBadge(); });
})();
