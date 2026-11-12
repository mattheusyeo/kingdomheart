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
})();
