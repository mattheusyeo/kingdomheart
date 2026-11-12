// Shared by every page: the three-stripe button opens and closes the dropdown menu
// (tablet and phone), and the Gallery page picks its title from the clicked tab.
(function () {
  var nav = document.getElementById('nav');
  var btn = nav.querySelector('.menu-toggle');

  function setOpen(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
  nav.querySelectorAll('.nav-items a').forEach(function (a) {
    a.addEventListener('click', function () { setOpen(false); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  // Gallery page: gallery.html?category=lifestyle | stationery | accessories
  var title = document.getElementById('page-title');
  if (title) {
    var names = { lifestyle: 'Lifestyle', stationery: 'Stationery', accessories: 'Accessories' };
    var category = new URLSearchParams(window.location.search).get('category');
    if (names[category]) {
      title.textContent = names[category];
      document.title = names[category] + ' – Kingdomheart';
      nav.querySelectorAll('.nav-items a').forEach(function (a) {
        if (a.getAttribute('href').indexOf('category=' + category) !== -1) a.classList.add('active');
      });
    }
  }

  // Page transition: fade the page out, then go to the next page.
  var LEAVE_MS = 250;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (!/^(https?|file):$/.test(a.protocol)) return;               // mailto:, tel: ...
    if (a.origin !== window.location.origin) return;                 // other websites
    var samePage = a.pathname === window.location.pathname && a.search === window.location.search;
    if (samePage && a.hash) return;                                  // jump within this page
    e.preventDefault();
    if (samePage) { setOpen(false); return; }                        // already here
    document.documentElement.classList.add('is-leaving');
    setTimeout(function () { window.location.href = a.href; }, LEAVE_MS);
  });
  // Coming back with the browser's Back button: show the page again.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.documentElement.classList.remove('is-leaving');
  });
})();
