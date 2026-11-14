// Product page: product.html?id=acrylic-pen-holder
// Shows a photo collage (click a photo to enlarge it), the description, and "Add to cart".
(function () {
  var root = document.getElementById('product-root');
  if (!root) return;

  var CATEGORY = { lifestyle: 'Lifestyle', stationery: 'Stationery', accessories: 'Accessories' };
  var id = new URLSearchParams(window.location.search).get('id');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function money(cents, unit) {
    var dollars = cents / 100;
    var text = '$' + (Number.isInteger(dollars) ? dollars : dollars.toFixed(2));
    return unit ? text + '/' + unit : text;
  }

  // Enlarged view of a collage photo (closes on click or Esc)
  function makeLightbox() {
    var box = el('dialog', 'lightbox');
    var img = el('img');
    var caption = el('p', 'lightbox-caption');
    box.appendChild(img);
    box.appendChild(caption);
    box.addEventListener('click', function () { box.close(); });
    document.getElementById('product-wrap').appendChild(box);
    return function open(src, alt) {
      img.src = src; img.alt = alt; caption.textContent = alt;
      if (box.showModal) box.showModal();
    };
  }

  function render(catalog) {
    var product = catalog.products.filter(function (p) { return p.id === id; })[0];
    root.textContent = '';

    if (!product) {
      document.title = 'Product not found – Kingdomheart';
      var missing = el('div', 'cart-empty');
      missing.appendChild(el('p', null, 'We could not find that product.'));
      var back = el('a', 'button', 'Keep shopping');
      back.href = 'gallery.html?category=lifestyle';
      missing.appendChild(back);
      root.appendChild(missing);
      document.getElementById('product-back').hidden = true;
      return;
    }

    document.title = product.name + ' – Kingdomheart';
    var cat = (product.categories || [])[0];
    var backLink = document.getElementById('product-back');
    if (cat && CATEGORY[cat]) {
      backLink.href = 'gallery.html?category=' + cat;
      backLink.textContent = '← ' + CATEGORY[cat];
    }

    /* ----- photo collage ----- */
    var photos = (product.images && product.images.length)
      ? product.images
      : [{ src: product.image, alt: product.alt || product.name }];
    var openPhoto = makeLightbox();
    var collage = el('div', 'collage ' + (photos.length >= 5 ? 'collage-5' : 'collage-stack'));
    collage.style.setProperty('--n', String(Math.max(1, photos.length - 1)));
    photos.slice(0, 5).forEach(function (ph, i) {
      var tile = el('button', 'collage-item');
      tile.type = 'button';
      tile.setAttribute('aria-label', 'Enlarge photo ' + (i + 1) + ' of ' + Math.min(photos.length, 5));
      var img = el('img');
      img.src = ph.src; img.alt = ph.alt || product.name;
      if (i > 0) img.loading = 'lazy';
      tile.appendChild(img);
      tile.addEventListener('click', function () { openPhoto(ph.src, ph.alt || product.name); });
      collage.appendChild(tile);
    });

    /* ----- product information ----- */
    var info = el('div', 'product-info');
    info.appendChild(el('h1', 'product-title', product.name));
    info.appendChild(el('p', 'product-price', money(product.price, product.unit)));
    info.appendChild(el('p', 'cart-fineprint product-aud', 'Prices in Australian dollars (AUD).'));

    (product.description || []).forEach(function (para) {
      info.appendChild(el('p', 'product-desc', para));
    });

    var add = el('button', 'button button-lg product-add');
    add.type = 'button';
    add.setAttribute('data-add-to-cart', product.id);
    var dot = el('img'); dot.src = 'assets/dot.svg'; dot.alt = ''; dot.width = 4; dot.height = 4;
    add.appendChild(dot);
    add.appendChild(document.createTextNode('Add to cart'));
    info.appendChild(add);

    var ship = catalog.shipping || {};
    var shipText = (ship.amount === 0 ? 'Free shipping to Australia' : 'Shipping ' + money(ship.amount)) +
      (ship.minBusinessDays ? '. Estimated delivery ' + ship.minBusinessDays + '–' + ship.maxBusinessDays + ' business days.' : '.');
    info.appendChild(el('p', 'product-ship', shipText));

    if (product.details && product.details.length) {
      info.appendChild(el('h2', 'product-details-title', 'Details'));
      var list = el('ul', 'product-details');
      product.details.forEach(function (d) { list.appendChild(el('li', null, d)); });
      info.appendChild(list);
    }

    root.appendChild(collage);
    root.appendChild(info);
  }

  fetch('data/products.json')
    .then(function (r) { if (!r.ok) throw new Error('products'); return r.json(); })
    .then(render)
    .catch(function () {
      root.textContent = '';
      root.appendChild(el('p', 'cart-error', 'We could not load this product. Please refresh the page.'));
    });
})();
