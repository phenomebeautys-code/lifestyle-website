/* ============================================================
   Phenomebeauty — site.js
   Navigation and motion for the redesigned pages.

   Everything here is progressive: without JS the pages are fully
   readable, and with prefers-reduced-motion nothing moves, nothing
   auto-plays and nothing is hidden waiting for a scroll.
   ============================================================ */
(function () {
  'use strict';

  var d = document;
  var w = window;
  var root = d.documentElement;
  var reduce = w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = w.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var toArray = function (list) { return Array.prototype.slice.call(list); };

  /* ── Footer year ─────────────────────────────────────────── */
  toArray(d.querySelectorAll('[data-year]')).forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ── Cart count in the header (same cart the shop uses) ─── */
  function cartCount() {
    try {
      var raw = sessionStorage.getItem('pb_cart') || localStorage.getItem('pb_cart') || '[]';
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return 0;
      return items.reduce(function (sum, item) { return sum + (Number(item.qty) || 1); }, 0);
    } catch (e) { return 0; }
  }
  var count = cartCount();
  toArray(d.querySelectorAll('[data-cart-count]')).forEach(function (el) { el.textContent = count; });
  toArray(d.querySelectorAll('[data-cart-link]')).forEach(function (el) {
    el.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
  });

  /* ── Mobile menu ─────────────────────────────────────────── */
  var header = d.querySelector('.site-header');
  var toggle = d.getElementById('menuToggle');
  var nav = d.getElementById('siteNav');

  function setMenu(open) {
    if (!header || !toggle) return;
    header.classList.toggle('menu-open', open);
    header.classList.remove('is-hidden');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    d.body.classList.toggle('menu-locked', open);
    if (open && nav) {
      var first = nav.querySelector('a');
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
  }
  if (toggle) {
    toggle.addEventListener('click', function () { setMenu(!header.classList.contains('menu-open')); });
  }
  if (nav) {
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  }
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && header && header.classList.contains('menu-open')) {
      setMenu(false);
      if (toggle) toggle.focus();
    }
  });
  var desktopMQ = w.matchMedia('(min-width: 861px)');
  var onDesktop = function (e) { if (e.matches) setMenu(false); };
  if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', onDesktop);

  /* ── Smart header: hides on the way down, returns on the way up ── */
  var lastY = w.scrollY;
  function updateHeader() {
    if (!header) return;
    var y = w.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    if (!header.classList.contains('menu-open')) {
      if (y > lastY + 4 && y > 240) header.classList.add('is-hidden');
      else if (y < lastY - 4 || y <= 240) header.classList.remove('is-hidden');
    }
    lastY = y;
  }
  if (header) header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  /* ── Split text (footer wordmark) into letters ──────────── */
  toArray(d.querySelectorAll('[data-split]')).forEach(function (el) {
    var text = el.textContent;
    el.textContent = '';
    text.split('').forEach(function (ch, i) {
      var s = d.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--i', i);
      el.appendChild(s);
    });
  });

  /* ── Fit text to its container (footer wordmark) ────────── */
  function fitText() {
    toArray(d.querySelectorAll('[data-fit]')).forEach(function (el) {
      var avail = el.parentElement.clientWidth * (parseFloat(el.getAttribute('data-fit')) || 0.98);
      el.style.fontSize = '100px';
      el.style.display = 'inline-block';
      var natural = el.getBoundingClientRect().width;
      el.style.display = '';
      if (natural) el.style.fontSize = (100 * avail / natural).toFixed(2) + 'px';
    });
  }
  fitText();
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(fitText);
  w.addEventListener('resize', fitText);

  /* ── Scroll reveals ─────────────────────────────────────── */
  toArray(d.querySelectorAll('[data-stagger]')).forEach(function (group) {
    toArray(group.children).forEach(function (child, i) {
      child.style.setProperty('--i', i);
      if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', group.getAttribute('data-stagger') || '');
    });
  });
  toArray(d.querySelectorAll('[data-reveal="lines"]')).forEach(function (el) {
    toArray(el.querySelectorAll('.line > span')).forEach(function (s, i) { s.style.setProperty('--d', i); });
  });

  var io = null;
  function reveal(el) {
    if (!io) { el.classList.add('is-in'); return; }
    var r = el.getBoundingClientRect();
    if (r.top < w.innerHeight * 0.92 && r.bottom > 0 && !root.classList.contains('motion-ready')) el.classList.add('is-in');
    else io.observe(el);
  }
  if (!reduce && 'IntersectionObserver' in w) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    toArray(d.querySelectorAll('[data-reveal]')).forEach(reveal);
    root.classList.add('motion-ready');
  } else {
    toArray(d.querySelectorAll('[data-reveal]')).forEach(function (el) { el.classList.add('is-in'); });
  }
  /* Other scripts (home.js) register content they add later */
  w.PB = w.PB || {};
  w.PB.reveal = function (el) { if (el) reveal(el); };

  /* ── Parallax + scroll-linked marquee (one rAF per frame) ── */
  var parallaxEls = reduce ? [] : toArray(d.querySelectorAll('[data-parallax]'));
  var marquees = reduce ? [] : toArray(d.querySelectorAll('[data-marquee]'));

  function updateParallax() {
    var vh = w.innerHeight;
    parallaxEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      var offset = (r.top + r.height / 2 - vh / 2) * -speed;
      el.style.setProperty('--py', offset.toFixed(1) + 'px');
    });
  }
  function updateMarquees() {
    marquees.forEach(function (m) {
      var track = m.firstElementChild;
      if (!track) return;
      var r = m.getBoundingClientRect();
      if (r.bottom < 0 || r.top > w.innerHeight) return;
      var half = track.scrollWidth / 2;
      if (!half) return;
      var x = (w.scrollY * 0.55) % half;
      var dir = m.getAttribute('data-marquee') === 'right' ? 1 : -1;
      track.style.transform = 'translate3d(' + (dir < 0 ? -x : x - half).toFixed(1) + 'px,0,0)';
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    w.requestAnimationFrame(function () {
      ticking = false;
      updateHeader();
      if (parallaxEls.length) updateParallax();
      if (marquees.length) updateMarquees();
    });
  }
  w.addEventListener('scroll', onScroll, { passive: true });
  w.addEventListener('resize', onScroll);
  onScroll();

  /* ── Image cyclers (the pills inside the hero headline) ──── */
  if (!reduce) {
    toArray(d.querySelectorAll('[data-cycle]')).forEach(function (box, n) {
      var imgs = box.querySelectorAll('img');
      if (imgs.length < 2) return;
      var i = 0;
      setInterval(function () {
        if (d.hidden) return;
        imgs[i].classList.remove('is-on');
        i = (i + 1) % imgs.length;
        imgs[i].classList.add('is-on');
      }, 2800 + n * 900);
    });
  }

  /* ── Spotlight: story-style rotator with progress + pause ── */
  toArray(d.querySelectorAll('[data-rotator]')).forEach(function (rot) {
    var slides = toArray(rot.querySelectorAll('[data-slide]'));
    var bars = toArray(rot.querySelectorAll('[data-bar]'));
    var prev = rot.querySelector('[data-prev]');
    var next = rot.querySelector('[data-next]');
    var playBtn = rot.querySelector('[data-toggle]');
    var counter = rot.querySelector('[data-counter]');
    if (slides.length < 2) return;

    var idx = 0;
    var userPaused = reduce;          /* reduced motion: never auto-advance */
    var hoverPaused = false;

    function syncPause() {
      rot.classList.toggle('is-paused', userPaused || hoverPaused);
      rot.classList.toggle('is-user-paused', userPaused);
      if (playBtn) {
        playBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
        playBtn.setAttribute('aria-pressed', String(userPaused));
      }
    }
    function render() {
      slides.forEach(function (s, i) {
        var on = i === idx;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
        if (on) s.removeAttribute('tabindex'); else s.setAttribute('tabindex', '-1');
      });
      bars.forEach(function (b, i) {
        b.classList.toggle('is-done', i < idx);
        b.classList.remove('is-active');
      });
      var active = bars[idx];
      if (active) {
        void active.offsetWidth;      /* restart the progress animation */
        active.classList.add('is-active');
      }
      if (counter) counter.textContent = (idx + 1) + ' / ' + slides.length;
    }
    function go(n) { idx = (n + slides.length) % slides.length; render(); }

    bars.forEach(function (b) {
      var fill = b.querySelector('i');
      if (fill) fill.addEventListener('animationend', function () {
        if (b.classList.contains('is-active') && !userPaused && !hoverPaused) go(idx + 1);
      });
    });
    if (prev) prev.addEventListener('click', function () { go(idx - 1); });
    if (next) next.addEventListener('click', function () { go(idx + 1); });
    if (playBtn) playBtn.addEventListener('click', function () { userPaused = !userPaused; syncPause(); });

    rot.addEventListener('mouseenter', function () { hoverPaused = true; syncPause(); });
    rot.addEventListener('mouseleave', function () { hoverPaused = false; syncPause(); });
    rot.addEventListener('focusin', function () { hoverPaused = true; syncPause(); });
    rot.addEventListener('focusout', function (e) { if (!rot.contains(e.relatedTarget)) { hoverPaused = false; syncPause(); } });

    /* Swipe like a story */
    var startX = null;
    rot.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') startX = e.clientX; });
    rot.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
    });

    syncPause();
    render();
  });

  /* ── Carousels (scroll-snap + arrows + dots + mouse drag) ── */
  toArray(d.querySelectorAll('[data-carousel]')).forEach(function (car) {
    var track = car.querySelector('[data-track]');
    if (!track) return;
    var prev = car.querySelector('[data-prev]');
    var next = car.querySelector('[data-next]');
    var dots = toArray(car.querySelectorAll('[data-dot]'));

    function stepSize() {
      var first = track.children[0];
      var gap = parseFloat(w.getComputedStyle(track).columnGap) || 0;
      return first ? first.getBoundingClientRect().width + gap : track.clientWidth;
    }
    function update() {
      var max = track.scrollWidth - track.clientWidth;
      car.classList.toggle('is-static', max < 6);
      if (prev) prev.disabled = track.scrollLeft < 6;
      if (next) next.disabled = track.scrollLeft > max - 6;
      var i = max < 6 ? 0 : Math.round((track.scrollLeft / max) * (dots.length - 1));
      dots.forEach(function (dot, k) { dot.classList.toggle('is-on', k === i); });
    }
    function scrollByStep(dir) {
      track.scrollBy({ left: dir * stepSize(), behavior: reduce ? 'auto' : 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { scrollByStep(-1); });
    if (next) next.addEventListener('click', function () { scrollByStep(1); });
    track.addEventListener('scroll', function () { w.requestAnimationFrame(update); }, { passive: true });
    w.addEventListener('resize', update);
    update();

    /* Mouse drag to scroll; a drag never counts as a click */
    var down = false, moved = false, startX = 0, startLeft = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
    });
    w.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); }
      if (moved) track.scrollLeft = startLeft - dx;
    });
    w.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      if (moved) {
        track.classList.remove('is-dragging');
        var i = Math.round(track.scrollLeft / stepSize());
        track.scrollTo({ left: i * stepSize(), behavior: reduce ? 'auto' : 'smooth' });
      }
    });
    track.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
  });

  /* ── Hover reveal: an image follows the pointer over a list ─ */
  if (finePointer && !reduce) {
    toArray(d.querySelectorAll('[data-hover-reveal]')).forEach(function (list) {
      var fig = d.createElement('div');
      fig.className = 'hover-reveal';
      fig.setAttribute('aria-hidden', 'true');
      var img = d.createElement('img');
      img.alt = '';
      fig.appendChild(img);
      d.body.appendChild(fig);

      var x = 0, y = 0, tx = 0, ty = 0, active = false, frame = null;
      function loop() {
        x += (tx - x) * 0.14;
        y += (ty - y) * 0.14;
        fig.style.transform = 'translate3d(' + (x + 28).toFixed(1) + 'px,' + (y - 150).toFixed(1) + 'px,0)';
        if (active || Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) frame = w.requestAnimationFrame(loop);
        else frame = null;
      }
      toArray(list.querySelectorAll('[data-img]')).forEach(function (row) {
        row.addEventListener('pointerenter', function (e) {
          img.src = row.getAttribute('data-img');
          tx = e.clientX; ty = e.clientY;
          if (!active && !frame) { x = tx; y = ty; }
          active = true;
          fig.classList.add('is-on');
          if (!frame) loop();
        });
        row.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; if (!frame) loop(); });
        row.addEventListener('pointerleave', function () { active = false; fig.classList.remove('is-on'); });
      });
    });
  }
})();
