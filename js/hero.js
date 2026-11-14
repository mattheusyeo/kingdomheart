// Home page banner: cycles through the products that have a `banner` in data/products.json.
// Pauses when the mouse is over it, when something inside has keyboard focus, or when the tab is hidden.
// Visitors who prefer reduced motion get no automatic cycling (they can still use the dots or swipe).
(function () {
  var slidesBox = document.getElementById('hero-slides');
  var dotsBox = document.getElementById('hero-dots');
  var hero = document.getElementById('hero');
  if (!slidesBox || !dotsBox || !hero) return;

  var INTERVAL = 5500;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function money(cents) {
    var d = cents / 100;
    return '$' + (Number.isInteger(d) ? d : d.toFixed(2));
  }

  fetch('data/products.json')
    .then(function (r) { if (!r.ok) throw new Error('products'); return r.json(); })
    .then(function (catalog) {
      var products = catalog.products.filter(function (p) { return p.banner && p.banner.wide; })
        .sort(function (a, b) { return (a.banner.order || 99) - (b.banner.order || 99); });
      if (!products.length) return;   // keep the static first slide

      slidesBox.textContent = '';
      var slides = [], dots = [], current = 0, timer = null, hovering = false;

      products.forEach(function (p, i) {
        var b = p.banner;
        var a = el('a', 'hero-slide');
        a.href = 'product.html?id=' + encodeURIComponent(p.id);
        a.setAttribute('role', 'group');
        a.setAttribute('aria-roledescription', 'slide');
        a.setAttribute('aria-label', (i + 1) + ' of ' + products.length + ': ' + p.name);

        var pic = el('picture');
        if (b.square) {
          var src = el('source');
          src.media = '(max-width: 700px)';
          src.srcset = b.square;
          pic.appendChild(src);
        }
        var img = el('img');
        img.src = b.wide;
        if (b.wide2x) {
          img.srcset = b.wide + ' 1200w, ' + b.wide2x + ' 2400w' + (b.wide4k ? ', ' + b.wide4k + ' 3840w' : '');
          // the banner is the page width minus its margins, and never wider than 1720px
          img.sizes = '(min-width: 1880px) 1720px, calc(100vw - 160px)';
        }
        img.alt = b.alt || p.alt || p.name;
        img.decoding = 'async';
        if (i > 0) img.loading = 'eager';
        pic.appendChild(img);
        a.appendChild(pic);

        var cap = el('span', 'hero-caption');
        cap.appendChild(el('span', 'hero-name', p.name));
        cap.appendChild(el('span', 'hero-price', money(p.price)));
        cap.appendChild(el('span', 'hero-cta', 'Shop now'));
        a.appendChild(cap);

        slidesBox.appendChild(a);
        slides.push(a);

        if (products.length > 1) {
          var dot = el('button', 'hero-dot');
          dot.type = 'button';
          dot.setAttribute('aria-label', 'Show ' + p.name);
          dot.addEventListener('click', function () { show(i); restart(); });
          dotsBox.appendChild(dot);
          dots.push(dot);
        }
      });

      function show(n) {
        current = (n + slides.length) % slides.length;
        slides.forEach(function (s, i) {
          var on = i === current;
          s.classList.toggle('is-active', on);
          s.setAttribute('aria-hidden', on ? 'false' : 'true');
          if (on) s.removeAttribute('inert'); else s.setAttribute('inert', '');
        });
        dots.forEach(function (d, i) { d.setAttribute('aria-current', i === current ? 'true' : 'false'); });
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function start() {
        stop();
        if (reduced || slides.length < 2 || hovering || document.hidden) return;
        timer = setInterval(function () { show(current + 1); }, INTERVAL);
      }
      function restart() { start(); }

      show(0);
      if (slides.length < 2) return;
      hero.setAttribute('aria-live', 'off');   // do not read out every automatic change
      hero.addEventListener('mouseenter', function () { hovering = true; stop(); });
      hero.addEventListener('mouseleave', function () { hovering = false; start(); });
      hero.addEventListener('focusin', stop);
      hero.addEventListener('focusout', start);
      document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

      // swipe on touch screens
      var x0 = null;
      hero.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
      hero.addEventListener('touchend', function (e) {
        if (x0 !== null) {
          var dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
        }
        x0 = null; start();
      });
      // arrow keys while the banner has focus
      hero.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { show(current + 1); }
        else if (e.key === 'ArrowLeft') { show(current - 1); }
      });

      start();
    })
    .catch(function () { /* keep the static first slide */ });
})();
