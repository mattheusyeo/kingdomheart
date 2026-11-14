// Fills the Gallery page from data/products.json, so each tab shows only its own products
// and every price lives in one place. gallery.html?category=lifestyle | stationery | accessories
(function () {
  var grid = document.getElementById('product-grid');
  if (!grid) return;

  var category = new URLSearchParams(window.location.search).get('category');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function price(cents, unit) {
    var dollars = cents / 100;
    var text = '$' + (Number.isInteger(dollars) ? dollars : dollars.toFixed(2));
    return unit ? text + '/' + unit : text;
  }

  fetch('data/products.json')
    .then(function (r) { if (!r.ok) throw new Error('products'); return r.json(); })
    .then(function (catalog) {
      var items = catalog.products.filter(function (p) {
        return !category || (p.categories || []).indexOf(category) !== -1;
      });
      // an unknown ?category= falls back to showing everything
      if (items.length === 0) items = catalog.products;

      var label = document.getElementById('collection-label');
      if (label && catalog.labels && catalog.labels[category]) label.textContent = catalog.labels[category];

      items.forEach(function (p) {
        var li = el('li', 'g-item');

        var href = 'product.html?id=' + encodeURIComponent(p.id);

        var info = el('div', 'g-info');
        var name = el('p', 'g-name');
        var nameLink = el('a', null, p.name);
        nameLink.href = href;
        name.appendChild(nameLink);
        info.appendChild(name);
        info.appendChild(el('p', 'g-price', price(p.price, p.unit)));
        li.appendChild(info);

        var frame = el('a', p.tint ? 'g-img g-tint' : 'g-img');
        frame.href = href;
        frame.setAttribute('aria-label', 'View ' + p.name);
        var img = el('img');
        img.src = p.image; img.alt = p.alt || p.name; img.loading = 'lazy';
        frame.appendChild(img);
        li.appendChild(frame);

        var add = el('button', 'button g-add');
        add.type = 'button';
        add.setAttribute('data-add-to-cart', p.id);
        var dot = el('img'); dot.src = 'assets/dot.svg'; dot.alt = ''; dot.width = 4; dot.height = 4;
        add.appendChild(dot);
        add.appendChild(document.createTextNode('Add to cart'));
        li.appendChild(add);

        grid.appendChild(li);
      });
    })
    .catch(function () {
      grid.appendChild(el('li', 'g-empty', 'We could not load the products. Please refresh the page.'));
    });
})();
