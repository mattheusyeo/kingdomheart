// Shared product-list loader. The first page loads data/products.json; later pages in the same visit
// get it instantly from memory (so the Gallery and product pages draw straight away instead of
// waiting and jumping), while a fresh copy is fetched quietly in the background for next time.
(function () {
  var KEY = 'kh-catalog-v1';
  var mem = null;

  function readStored() {
    if (mem) return mem;
    try {
      var s = sessionStorage.getItem(KEY);
      if (s) { mem = JSON.parse(s); return mem; }
    } catch (e) { /* storage blocked: fall back to fetching */ }
    return null;
  }
  function fetchFresh() {
    return fetch('data/products.json').then(function (r) {
      if (!r.ok) throw new Error('catalog');
      return r.json();
    }).then(function (data) {
      mem = data;
      try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return data;
    });
  }

  window.khLoadCatalog = function () {
    var stored = readStored();
    if (stored) {
      fetchFresh().catch(function () {});          // refresh for the next page
      return Promise.resolve(stored);
    }
    return fetchFresh();
  };

  // Fade a photo in once it has loaded, instead of letting it pop in line by line.
  window.khFadeIn = function (img) {
    img.classList.add('fade-img');
    function done() { img.classList.add('is-loaded'); }
    if (img.complete && img.naturalWidth > 0) { requestAnimationFrame(done); return; }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  };
})();
