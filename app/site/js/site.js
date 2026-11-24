/* Vipra Realty — public site ↔ API wiring (vanilla JS, no build step). */
(function () {
  'use strict';

  var PLACEHOLDER = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#AEB7C2" stroke-width="1.2" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  // Short Indian format for large sale prices: ₹4.2 Cr, ₹96 L; smaller amounts stay exact.
  function inrShort(n) {
    n = Number(n);
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(n % 1e7 ? 2 : 0).replace(/\.?0+$/, '') + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(n % 1e5 ? 2 : 0).replace(/\.?0+$/, '') + ' L';
    return inr(n);
  }
  function imgSrc(p) { return /^https?:/.test(p) ? p : ('/' + String(p).replace(/^\/+/, '')); }

  // Rent breakdown rows for the property page price box (rent listings only):
  // Maintenance ("+ ₹5,000/mo" for a number, the text as entered otherwise),
  // Monthly Total when maintenance is a number, then Security Deposit.
  function rentRows(l) {
    if (l.search_type === 'Buy') return buyRows(l);
    var rows = [];
    var m = String(l.maintenance == null ? '' : l.maintenance).trim();
    if (m) {
      var digits = m.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
      if (/^\d+(\.\d+)?$/.test(digits)) {
        var mn = Math.round(Number(digits));
        rows.push(['Maintenance', '+ ' + inr(mn) + '/mo']);
        if (l.monthly_rent) rows.push(['Monthly Total', inr(Number(l.monthly_rent) + mn), true]);
      } else {
        rows.push(['Maintenance', m.charAt(0).toUpperCase() + m.slice(1)]);
      }
    }
    if (l.deposit_amount) rows.push(['Security Deposit', inr(l.deposit_amount)]);
    return rows.concat(brokerageRows(l));
  }
  // Sale breakdown: "+ Stamp Duty, Regn + Taxes" as "+ ₹3,50,000" for a number,
  // "+ 7%" for a percentage, or the text as entered (e.g. "Extra").
  function buyRows(l) {
    var s = String(l.stamp_duty == null ? '' : l.stamp_duty).trim();
    if (!s) return brokerageRows(l);
    var digits = s.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
    var val;
    if (/^\d+(\.\d+)?$/.test(digits)) val = '+ ' + inr(Math.round(Number(digits)));
    else if (/^\d+(\.\d+)?%$/.test(digits)) val = '+ ' + digits;
    else val = s.charAt(0).toUpperCase() + s.slice(1);
    return [['Stamp Duty, Regn + Taxes', val]].concat(brokerageRows(l));
  }
  // Brokerage (Rent and Buy): "₹50,000" for a number, "2%" for a percentage,
  // or the text as entered (e.g. "1 month rent").
  function brokerageRows(l) {
    var s = String(l.brokerage == null ? '' : l.brokerage).trim();
    if (!s) return [];
    var digits = s.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
    var val;
    if (/^\d+(\.\d+)?$/.test(digits)) val = inr(Math.round(Number(digits)));
    else if (/^\d+(\.\d+)?%$/.test(digits)) val = digits;
    else val = s.charAt(0).toUpperCase() + s.slice(1);
    return [['Brokerage', val]];
  }
  function priceText(l) {
    if (l.search_type === 'Buy') return l.sale_price ? inrShort(l.sale_price) : 'Price on request';
    return l.monthly_rent ? inr(l.monthly_rent) + '<small>/mo</small>' : 'Rent on request';
  }
  function badge(l) {
    if (l.status === 'sold_out') return ['Sold out', ''];
    if (l.status === 'rented_out') return ['Rented out', ''];
    var custom = String(l.image_label == null ? '' : l.image_label).trim();
    if (custom) return [custom, ''];
    return [l.search_type === 'Buy' ? 'For sale' : 'For rent', ''];
  }
  function specs(l) {
    var out = [];
    if (l.category === 'Residential') {
      if (l.bedrooms != null) out.push(l.bedrooms + ' Beds');
      if (l.bathrooms != null) out.push(l.bathrooms + ' Baths');
      if (l.carpet_area || l.builtup_area) out.push(Number(l.carpet_area || l.builtup_area).toLocaleString('en-IN') + ' sq ft');
    } else {
      if (l.carpet_area || l.builtup_area) out.push(Number(l.carpet_area || l.builtup_area).toLocaleString('en-IN') + ' sq ft');
      if (l.floor_no != null) out.push(l.floor_no + ' Floor');
      if (l.ceiling_height) out.push(l.ceiling_height + ' ceiling');
    }
    return out;
  }

  function cardHTML(l) {
    var b = badge(l);
    var title = (l.project_title || '').trim() || 'Untitled';
    var closed = (l.status === 'sold_out' || l.status === 'rented_out');
    var cardImg = (l.thumbs && l.thumbs[0]) || (l.images && l.images[0]);
    var media = cardImg
      ? '<img src="' + esc(imgSrc(cardImg)) + '" alt="" loading="lazy">'
      : PLACEHOLDER;
    var sp = specs(l);
    var dep = (l.search_type !== 'Buy' && l.deposit_amount) ? inrShort(l.deposit_amount) : '';
    return '' +
      '<article class="card' + (closed ? ' is-closed' : '') + '"><a href="property-detail.html?id=' + l.id + '">' +
      '<div class="media">' + media + '<span class="pill' + (closed ? ' pill-dark' : '') + '">' + esc(b[0]) + '</span></div>' +
      '<div class="row"><div class="ttl"><h3>' + esc(title) + '</h3>' +
        '<p class="loc">' + esc([l.locality, l.city].filter(Boolean).join(', ')) + '</p></div>' +
        '<span class="price-col"><span class="price">' + priceText(l) + '</span>' +
        (dep ? '<span class="dep">Deposit ' + dep + '</span>' : '') + '</span></div>' +
      (sp.length ? '<p class="specs">' + sp.map(esc).join(' · ') + (l.sub_category ? ' · ' + esc(l.sub_category) : '') + '</p>' : '') +
      '<p class="pid">Property ID: ' + esc(l.id) + '</p>' +
      '</a></article>';
  }

  function getListings(params) {
    var qs = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { if (params[k]) qs.set(k, params[k]); });
    return fetch('/api/listings' + (qs.toString() ? '?' + qs.toString() : ''))
      .then(function (r) { return r.json(); });
  }

  // Category → sub-category tree (cached), drives the dependent filters.
  var _treeP;
  function loadTree() {
    if (!_treeP) _treeP = fetch('/api/categories').then(function (r) { return r.json(); })
      .then(function (d) { return d.tree || {}; }).catch(function () { return {}; });
    return _treeP;
  }

  // Make a Sub-category <select> depend on a Category <select>.
  function wireCascade(catId, subId, tree) {
    var catSel = document.getElementById(catId);
    var subSel = document.getElementById(subId);
    if (!catSel || !subSel) return;
    // normalise an "All categories" placeholder to an empty value so it means "no filter"
    if (catSel.options.length && /all categor/i.test(catSel.options[0].text)) catSel.options[0].value = '';
    var desired = subSel.getAttribute('data-value') || '';
    function fillSubs() {
      var cat = catSel.value;
      var names = (cat && tree[cat]) ? tree[cat]
        : Object.keys(tree).reduce(function (a, k) { return a.concat(tree[k]); }, []);
      subSel.innerHTML = '<option value="">Any type</option>';
      names.forEach(function (n) {
        var o = document.createElement('option'); o.value = n; o.textContent = n;
        if (n === desired) o.selected = true;
        subSel.appendChild(o);
      });
    }
    catSel.addEventListener('change', function () { desired = ''; fillSubs(); });
    fillSubs();
  }

  // ---------------- Home ----------------
  function initHome() {
    var grid = document.getElementById('featured-grid');
    if (!grid) return;
    getListings({}).then(function (d) {
      var ls = (d.listings || []).slice(0, 6);
      grid.innerHTML = ls.length ? ls.map(cardHTML).join('')
        : '<p class="empty">No listings yet — add some from the admin panel.</p>';
    }).catch(function () { grid.innerHTML = '<p class="empty">Could not load listings.</p>'; });

    loadTree().then(function (tree) { wireCascade('hero-cat', 'hero-sub', tree); });

    var sb = document.getElementById('hero-search');
    if (sb) sb.addEventListener('click', function (e) {
      e.preventDefault();
      var p = new URLSearchParams();
      var q = document.getElementById('hero-q'); if (q && q.value.trim()) p.set('q', q.value.trim());
      var st = document.getElementById('hero-type'); if (st && st.value) p.set('search_type', st.value);
      var ct = document.getElementById('hero-cat'); if (ct && ct.value) p.set('category', ct.value);
      var sub = document.getElementById('hero-sub'); if (sub && sub.value) p.set('sub', sub.value);
      location.href = 'properties.html' + (p.toString() ? '?' + p.toString() : '');
    });
  }

  // ---------------- Properties ----------------
  function initProperties() {
    var grid = document.getElementById('results-grid');
    if (!grid) return;
    var PAGE = 12;
    var all = [], page = 1;
    var url = new URLSearchParams(location.search);
    // prefill controls from URL
    [['f-type', 'search_type'], ['f-cat', 'category'], ['f-city', 'city'], ['f-q', 'q'], ['f-min', 'min_price'], ['f-max', 'max_price'], ['f-sort', 'sort']].forEach(function (m) {
      var el = document.getElementById(m[0]); if (el && url.get(m[1])) el.value = url.get(m[1]);
    });
    syncChips();
    // Sub-category is populated by the cascade; remember the desired value from the URL.
    var subEl = document.getElementById('f-sub');
    if (subEl && url.get('sub')) subEl.setAttribute('data-value', url.get('sub'));
    loadTree().then(function (tree) { wireCascade('f-cat', 'f-sub', tree); run(); });

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function num(id) { return String(val(id)).replace(/[^0-9]/g, ''); }
    function syncChips() {
      var t = val('f-type');
      document.querySelectorAll('[data-chip]').forEach(function (b) { b.classList.toggle('chip-active', b.getAttribute('data-chip') === t); });
    }

    function run() {
      var params = {
        search_type: val('f-type'), category: val('f-cat'), sub: val('f-sub'),
        city: val('f-city'), q: val('f-q'), min_price: num('f-min'), max_price: num('f-max'), sort: val('f-sort'),
      };
      grid.innerHTML = '<p class="empty">Loading…</p>';
      getListings(params).then(function (d) {
        all = d.listings || []; page = 1;
        var count = document.getElementById('results-count');
        if (count) count.textContent = all.length;
        render();
      }).catch(function () { grid.innerHTML = '<p class="empty">Could not load listings.</p>'; });
    }

    function render() {
      var pages = Math.max(1, Math.ceil(all.length / PAGE));
      page = Math.min(Math.max(1, page), pages);
      var slice = all.slice((page - 1) * PAGE, page * PAGE);
      grid.innerHTML = slice.length ? slice.map(cardHTML).join('')
        : '<p class="empty">No properties match these filters.</p>';
      var pg = document.getElementById('pager');
      if (!pg) return;
      if (pages <= 1) { pg.innerHTML = ''; return; }
      var h = '<button type="button" data-page="' + (page - 1) + '" aria-label="Previous page"' + (page === 1 ? ' disabled' : '') + '>←</button>';
      for (var i = 1; i <= pages; i++) h += '<button type="button" data-page="' + i + '"' + (i === page ? ' aria-current="page"' : '') + '>' + i + '</button>';
      h += '<button type="button" data-page="' + (page + 1) + '" aria-label="Next page"' + (page === pages ? ' disabled' : '') + '>→</button>';
      pg.innerHTML = h;
    }

    var pager = document.getElementById('pager');
    if (pager) pager.addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
      page = parseInt(b.getAttribute('data-page'), 10); render();
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    var apply = document.getElementById('apply-filters');
    if (apply) apply.addEventListener('click', function (e) { e.preventDefault(); syncChips(); run(); });
    var reset = document.getElementById('reset-filters');
    if (reset) reset.addEventListener('click', function () {
      ['f-q', 'f-city', 'f-type', 'f-cat', 'f-min', 'f-max'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
      var cat = document.getElementById('f-cat'); if (cat) cat.dispatchEvent(new Event('change'));
      var sort = document.getElementById('f-sort'); if (sort) sort.value = 'newest';
      syncChips(); run();
    });
    var sortEl = document.getElementById('f-sort');
    if (sortEl) sortEl.addEventListener('change', run);
    document.querySelectorAll('[data-chip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = document.getElementById('f-type'); if (t) t.value = btn.getAttribute('data-chip');
        syncChips();
        run();
      });
    });
    // initial run() is triggered by the cascade callback above once the tree loads
  }

  // ---------------- Property detail ----------------
  // Highlight tiles for the detail page: [value, label] pairs by category/type.
  function highlights(l) {
    var out = [];
    var area = l.carpet_area || l.builtup_area;
    var areaLabel = l.carpet_area ? 'Carpet area (sq ft)' : 'Built-up area (sq ft)';
    var floors = (l.floor_no != null && l.total_floors) ? l.floor_no + ' of ' + l.total_floors
      : (l.total_floors ? String(l.total_floors) : (l.floor_no != null ? String(l.floor_no) : ''));
    if (l.category === 'Residential') {
      if (l.bedrooms != null) out.push([l.bedrooms, 'Bedrooms']);
      if (l.bathrooms != null) out.push([l.bathrooms, 'Bathrooms']);
      if (area) out.push([Number(area).toLocaleString('en-IN'), areaLabel]);
      if (floors) out.push([floors, l.floor_no != null ? 'Floor' : 'Total floors']);
    } else {
      if (area) out.push([Number(area).toLocaleString('en-IN'), areaLabel]);
      if (l.bathrooms != null) out.push([l.bathrooms, 'Bathrooms']);
      if (floors) out.push([floors, l.floor_no != null ? 'Floor' : 'Total floors']);
      if (l.ceiling_height) out.push([l.ceiling_height, 'Ceiling height']);
    }
    return out;
  }

  // Full-screen photo viewer: arrows, keyboard (Left / Right / Esc) and swipe.
  var viewer = null;
  function openViewer(imgs, start, title) {
    if (!viewer) {
      var el = document.createElement('div');
      el.className = 'viewer'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Property photos');
      el.innerHTML =
        '<button type="button" class="viewer-close" aria-label="Close photos">&times;</button>' +
        '<button type="button" class="viewer-nav viewer-prev" aria-label="Previous photo">&#8249;</button>' +
        '<img class="viewer-img" alt="">' +
        '<button type="button" class="viewer-nav viewer-next" aria-label="Next photo">&#8250;</button>' +
        '<div class="viewer-count" aria-live="polite"></div>';
      document.body.appendChild(el);
      viewer = { el: el, img: el.querySelector('.viewer-img'), count: el.querySelector('.viewer-count'), imgs: [], i: 0, title: '', back: null };
      el.querySelector('.viewer-close').addEventListener('click', closeViewer);
      el.querySelector('.viewer-prev').addEventListener('click', function () { step(-1); });
      el.querySelector('.viewer-next').addEventListener('click', function () { step(1); });
      el.addEventListener('click', function (e) { if (e.target === el) closeViewer(); });
      document.addEventListener('keydown', function (e) {
        if (viewer.el.hidden) return;
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
      });
      var x0 = null;
      el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (x0 == null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      });
    }
    viewer.imgs = imgs; viewer.title = title || 'Property'; viewer.back = document.activeElement;
    viewer.el.classList.toggle('is-single', imgs.length < 2);
    viewer.el.hidden = false;
    document.body.style.overflow = 'hidden';
    showPhoto(start);
    viewer.el.querySelector('.viewer-close').focus();
  }
  function showPhoto(i) {
    var n = viewer.imgs.length;
    viewer.i = (i + n) % n;
    viewer.img.src = imgSrc(viewer.imgs[viewer.i]);
    viewer.img.alt = viewer.title + ' — photo ' + (viewer.i + 1) + ' of ' + n;
    viewer.count.textContent = (viewer.i + 1) + ' / ' + n;
    if (n > 1) new Image().src = imgSrc(viewer.imgs[(viewer.i + 1) % n]);   // warm the next one
  }
  function step(d) { if (viewer.imgs.length > 1) showPhoto(viewer.i + d); }
  function closeViewer() {
    if (!viewer) return;
    viewer.el.hidden = true;
    document.body.style.overflow = '';
    if (viewer.back && viewer.back.focus) viewer.back.focus();
  }

  function initDetail() {
    var root = document.getElementById('detail-root');
    if (!root) return;
    var id = new URLSearchParams(location.search).get('id');
    if (!id) { root.innerHTML = '<p class="muted">No property selected.</p>'; return; }
    getListings({ id: id }).then(function (d) {
      var l = (d.listings || [])[0];
      if (!l) { root.innerHTML = '<p class="muted">Property not found.</p>'; return; }
      var title = (l.project_title || '').trim() || 'Property';
      var place = [l.locality, l.city].filter(Boolean).join(', ');
      document.title = title + ' — Vipra Realty';
      set('d-title', title);
      set('d-crumb', title);
      set('d-loc', place);
      set('d-price-label', l.search_type === 'Buy' ? 'Sale price' : 'Monthly rent');
      setHTML('d-price', priceText(l));
      set('d-pid', 'Property ID: ' + l.id);
      var rr = rentRows(l), rEl = document.getElementById('d-rent-rows');
      if (rEl) {
        rEl.innerHTML = rr.map(function (r) {
          return '<div class="rr' + (r[2] ? ' rr-total' : '') + '"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
        }).join('');
        rEl.hidden = !rr.length;
      }
      var b = badge(l);
      setHTML('d-badges', '' +
        (l.category ? '<span class="badge">' + esc(l.category + (l.sub_category ? ' · ' + l.sub_category : '')) + '</span>' : '') +
        (l.city ? '<span class="badge">' + esc(l.city) + '</span>' : ''));
      // Type-aware fields from the admin (already filtered to "show on site" + filled).
      // First four become the stat tiles, the rest a "Property highlights" list.
      var typed = l.highlights || [];
      var hl = typed.length ? typed.slice(0, 4).map(function (h) { return [h.value, h.label]; }) : highlights(l);
      kvSection('d-more', typed.slice(4));
      kvSection('d-amenities', (l.amenities || []).map(function (a) { return { label: a.label, value: a.value || 'Yes' }; }));
      kvSection('d-furnishings', l.furnishings || []);
      setHTML('d-highlights', hl.map(function (h) {
        return '<div class="stat"><div class="v">' + esc(h[0]) + '</div><div class="l">' + esc(h[1]) + '</div></div>';
      }).join(''));
      if (!hl.length) { var hs = document.getElementById('d-highlights'); if (hs) hs.hidden = true; }
      set('d-desc', l.description || 'No description provided.');
      // gallery
      var g = document.getElementById('d-gallery');
      if (g) {
        var imgs = (l.images || []);
        if (!imgs.length) g.innerHTML = '<div class="single">' + PLACEHOLDER + '</div>';
        else if (imgs.length === 1) g.innerHTML = '<div class="single"><img src="' + esc(imgSrc(imgs[0])) + '" alt=""></div>';
        else g.innerHTML = imgs.slice(0, 3).map(function (src) {
          return '<div><img src="' + esc(imgSrc(src)) + '" alt="" loading="lazy"></div>';
        }).join('');
        // status box (For sale / For rent / Sold out / Rented out) on the large photo, top left
        var closed = (l.status === 'sold_out' || l.status === 'rented_out');
        g.firstElementChild.insertAdjacentHTML('beforeend',
          '<span class="gallery-pill' + (closed ? ' gallery-pill-dark' : '') + '">' + esc(b[0]) + '</span>');
        // The large photo slides through all photos in place (arrows, swipe); the
        // side tiles follow with the next two. Any tile opens the full-screen viewer.
        if (imgs.length) {
          var n = imgs.length, cur = 0;
          var tiles = Array.prototype.slice.call(g.querySelectorAll(':scope > div'));
          var paint = function () {
            tiles.forEach(function (tile, i) {
              var im = tile.querySelector('img'), src = imgSrc(imgs[(cur + i) % n]);
              if (im.getAttribute('src') !== src) im.src = src;
            });
            var c = g.querySelector('.gallery-count'); if (c) c.textContent = (cur + 1) + ' / ' + n;
          };
          var slide = function (d) { cur = (cur + d + n) % n; paint(); };
          tiles.forEach(function (tile, i) {
            tile.classList.add('is-zoom');
            tile.addEventListener('click', function () { openViewer(imgs, (cur + i) % n, title); });
          });
          if (n > 1) {
            var big = tiles[0];
            big.insertAdjacentHTML('beforeend',
              '<button type="button" class="gallery-nav gallery-prev" aria-label="Previous photo">&#8249;</button>' +
              '<button type="button" class="gallery-nav gallery-next" aria-label="Next photo">&#8250;</button>' +
              '<span class="gallery-count" aria-live="polite">1 / ' + n + '</span>');
            big.querySelector('.gallery-prev').addEventListener('click', function (e) { e.stopPropagation(); slide(-1); });
            big.querySelector('.gallery-next').addEventListener('click', function (e) { e.stopPropagation(); slide(1); });
            var gx = null, swiped = false;
            big.addEventListener('touchstart', function (e) { gx = e.touches[0].clientX; swiped = false; }, { passive: true });
            big.addEventListener('touchend', function (e) {
              if (gx == null) return;
              var dx = e.changedTouches[0].clientX - gx; gx = null;
              if (Math.abs(dx) > 40) { swiped = true; slide(dx < 0 ? 1 : -1); }
            });
            // a swipe must not also count as a tap that opens the viewer
            big.addEventListener('click', function (e) { if (swiped) { e.stopImmediatePropagation(); swiped = false; } }, true);
          }
          g.insertAdjacentHTML('beforeend', '<button type="button" class="gallery-all">View all ' + n + ' photo' + (n > 1 ? 's' : '') + '</button>');
          g.querySelector('.gallery-all').addEventListener('click', function () { openViewer(imgs, cur, title); });
        }
      }
      // key details
      setHTML('d-details', [
        ['Looking to', l.search_type],
        ['Property type', l.sub_category],
        ['Locality', l.locality], ['City', l.city],
        l.search_type === 'Buy' ? ['Expected possession', l.possession_date] : ['Available from', l.available_from],
        ['Down payment', l.down_payment ? inr(l.down_payment) : ''],
        ['Status', (l.status || '').replace('_', ' ')],
      ].filter(function (r) { return r[1] != null && r[1] !== ''; }).map(function (r) {
        return '<div class="kv"><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>';
      }).join(''));
      initBrochure(l);
      // enquire link carries the property id; WhatsApp carries a brief
      var enq = document.getElementById('d-enquire');
      if (enq) enq.href = 'contact.html?property_id=' + l.id;
      var wa = document.getElementById('d-wa');
      if (wa) wa.href = 'https://wa.me/919108598918?text=' + encodeURIComponent('Hi Vipra Realty, I am interested in: ' + title + (place ? ' (' + place + ')' : '') + ' — ' + location.href);
      // EMI calculator: only for sale (Buy) listings, prefilled with this property
      var emiWrap = document.getElementById('emi-detail');
      if (emiWrap) {
        if (l.search_type === 'Buy' && Number(l.sale_price) > 0) {
          emiWrap.hidden = false;
          var pvEl = document.getElementById('emi-pv');
          var dpEl = document.getElementById('emi-dp');
          if (pvEl) pvEl.value = Number(l.sale_price).toLocaleString('en-IN');
          if (dpEl) dpEl.value = Number(l.down_payment || 0).toLocaleString('en-IN');
          if (pvEl) pvEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          emiWrap.hidden = true;
        }
      }
      // similar: same sub-category first, then same category
      var st = document.getElementById('d-similar-title');
      if (st && l.sub_category) st.textContent = 'Other ' + l.sub_category.toLowerCase() + ' you may like';
      getListings({ category: l.category }).then(function (sd) {
        var others = (sd.listings || []).filter(function (x) { return x.id != l.id; });
        var same = others.filter(function (x) { return x.sub_category === l.sub_category; });
        var sim = same.concat(others.filter(function (x) { return x.sub_category !== l.sub_category; })).slice(0, 3);
        var sg = document.getElementById('d-similar');
        if (sg) sg.innerHTML = sim.map(cardHTML).join('') || '<p class="empty">No similar listings yet.</p>';
      });
    });
    // Fill a label/value list and reveal its section; an empty list keeps the section hidden.
    function kvSection(id, items) {
      var box = document.getElementById(id), sec = document.getElementById(id + '-sec');
      if (!box || !sec) return;
      box.innerHTML = items.map(function (r) {
        return '<div class="kv"><span>' + esc(r.label) + '</span><span>' + esc(r.value) + '</span></div>';
      }).join('');
      sec.hidden = !items.length;
    }
    function set(id, t) { var el = document.getElementById(id); if (el) el.textContent = String(t == null ? '' : t).trim(); }
    function setHTML(id, h) { var el = document.getElementById(id); if (el) el.innerHTML = h; }
  }

  // ---------------- Project brochure flipbook (detail page) ----------------
  // "View Project Brochure" swaps the photo gallery for a page-flip book of the
  // listing's PDF (PDF.js draws the pages, StPageFlip turns them), with arrows,
  // a slideshow, full screen and an X to close. The brochure is for viewing
  // only: the server sends it scrambled (see /api/brochure/:id), pages are
  // drawn on canvases, and right-click, drag, save and print are blocked here.
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement('script');
      s.src = src; s.onload = function () { ok(); }; s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  function initBrochure(l) {
    var btn = document.getElementById('d-brochure'), book = document.getElementById('d-book');
    if (!btn || !book || !l.has_brochure) return;
    btn.hidden = false;
    var gallery = document.getElementById('d-gallery'), stage = document.getElementById('bk-stage');
    var msg = document.getElementById('bk-msg'), count = document.getElementById('bk-count');
    var prev = document.getElementById('bk-prev'), next = document.getElementById('bk-next');
    var play = document.getElementById('bk-play'), full = document.getElementById('bk-full');
    var pdfDoc = null, flip = null, timer = null, openId = 0;

    function say(t) { msg.textContent = t || ''; msg.hidden = !t; }
    function getPdf() {
      if (pdfDoc) return Promise.resolve(pdfDoc);
      return Promise.all([loadScript('vendor/pdf.min.js'), loadScript('vendor/page-flip.browser.js')])
        .then(function () {
          return fetch('/api/brochure/' + l.id, { headers: { 'X-Brochure-View': '1' }, cache: 'no-store' });
        })
        .then(function (r) {
          if (!r.ok) throw new Error('fetch');
          var hex = r.headers.get('X-Brochure-Key') || '', key = new Uint8Array(32);
          for (var i = 0; i < 32; i++) key[i] = parseInt(hex.substr(i * 2, 2), 16);
          return r.arrayBuffer().then(function (b) {
            var d = new Uint8Array(b);
            for (var j = 0; j < d.length; j++) d[j] ^= key[j & 31];
            var lib = window.pdfjsLib;
            lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
            return lib.getDocument({ data: d, isEvalSupported: false }).promise;
          });
        })
        .then(function (doc) { pdfDoc = doc; return doc; });
    }
    function stopShow() {
      clearInterval(timer); timer = null;
      play.setAttribute('aria-pressed', 'false'); play.setAttribute('aria-label', 'Play slideshow');
    }
    function startShow() {
      if (!flip) return;
      play.setAttribute('aria-pressed', 'true'); play.setAttribute('aria-label', 'Pause slideshow');
      timer = setInterval(function () {
        if (!flip) return stopShow();
        if (flip.getCurrentPageIndex() >= flip.getPageCount() - (flip.getOrientation() === 'landscape' ? 2 : 1)) flip.flip(0);
        else flip.flipNext();
      }, 3500);
    }
    function updateCount() {
      if (!flip) { count.textContent = ''; return; }
      var n = flip.getPageCount(), i = flip.getCurrentPageIndex();
      var two = flip.getOrientation() === 'landscape' && i > 0 && i < n - 1;
      count.textContent = (two ? (i + 1) + '–' + (i + 2) : (i + 1)) + ' of ' + n;
      prev.disabled = i <= 0;
      next.disabled = i + (two ? 2 : 1) >= n;
    }
    var pages = [], ratio = 0.7;
    function teardown() {
      if (flip) { try { flip.destroy(); } catch (_) { /* ignore */ } flip = null; }
      Array.prototype.forEach.call(stage.querySelectorAll('.book-flip'), function (el) { el.remove(); });
    }
    // Build the book to fit the stage: two pages side by side when there is
    // room, one page at a time on narrow screens. Rebuilt on resize.
    function build(at) {
      teardown();
      if (!pages.length) return;
      var W = stage.clientWidth, H = stage.clientHeight;
      var spread = W >= 2 * H * ratio * 0.75;
      var bw = Math.floor(Math.min(W, (spread ? 2 : 1) * H * ratio));
      var holder = document.createElement('div'), root = document.createElement('div');
      holder.className = 'book-flip';
      holder.style.width = bw + 'px'; // StPageFlip sets its own root to 100% wide
      holder.appendChild(root);
      stage.appendChild(holder);
      pages.forEach(function (pg) { root.appendChild(pg); });
      var pw = spread ? Math.floor(bw / 2) : bw;
      flip = new window.St.PageFlip(root, {
        width: pw, height: Math.floor(pw / ratio), size: 'stretch',
        minWidth: spread ? 50 : Math.ceil(bw / 2) + 1, maxWidth: 3000, minHeight: 50, maxHeight: 4000,
        showCover: true, usePortrait: true, autoSize: true,
        maxShadowOpacity: 0.45, flippingTime: 900, mobileScrollSupport: false, startPage: at || 0,
      });
      flip.loadFromHTML(pages);
      flip.on('flip', updateCount);
      flip.on('changeOrientation', updateCount);
      flip.on('changeState', function (e) { if (e.data === 'user_fold' || e.data === 'fold_corner') stopShow(); });
      updateCount();
    }
    var resizeT = null;
    window.addEventListener('resize', function () {
      if (book.hidden || !flip) return;
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { if (flip) build(flip.getCurrentPageIndex()); }, 200);
    });
    function render(doc, id) {
      return doc.getPage(1).then(function (p1) {
        if (id !== openId) return;
        var vp = p1.getViewport({ scale: 1 });
        ratio = vp.width / vp.height;
        pages = [];
        for (var n = 1; n <= doc.numPages; n++) {
          var pg = document.createElement('div');
          pg.className = 'book-page';
          if (n === 1 || n === doc.numPages) pg.setAttribute('data-density', 'hard');
          pg.appendChild(document.createElement('canvas'));
          pages.push(pg);
        }
        // draw each page once, sharp enough for full screen, first pages first
        var px = Math.min(1600, Math.max(800, Math.round(Math.max(screen.width, screen.height) / 2 * (window.devicePixelRatio || 1))));
        function draw(i) {
          return doc.getPage(i + 1).then(function (page) {
            if (id !== openId) return;
            var v0 = page.getViewport({ scale: 1 }), v = page.getViewport({ scale: px / v0.width });
            var c = pages[i].querySelector('canvas');
            c.width = Math.round(v.width); c.height = Math.round(v.height);
            return page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
          }).catch(function () { /* a page that fails stays blank */ });
        }
        function drawFrom(i) {
          if (id !== openId || i >= pages.length) return;
          draw(i).then(function () { drawFrom(i + 1); });
        }
        // show the book once the first pages are ready; the rest follow in the background
        var first = Math.min(3, pages.length), ready = [];
        for (var k = 0; k < first; k++) ready.push(draw(k));
        return Promise.all(ready).then(function () {
          if (id !== openId) return;
          say(''); build(0);
          drawFrom(first);
        });
      });
    }
    function open() {
      var id = ++openId;
      stopShow(); teardown();
      gallery.hidden = true; book.hidden = false; say('Opening brochure…'); count.textContent = '';
      prev.disabled = next.disabled = true;
      var hd = document.querySelector('header'), off = (hd && getComputedStyle(hd).position !== 'static' ? hd.offsetHeight : 0) + 12;
      document.body.classList.add('book-open');
      var top = book.getBoundingClientRect().top + window.pageYOffset - off;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      getPdf().then(function (doc) { if (id === openId) return render(doc, id); })
        .catch(function () { if (id === openId) say('Sorry, the brochure could not be opened. Please try again.'); });
    }
    function close() {
      openId++;
      if (document.fullscreenElement === book) document.exitFullscreen().catch(function () {});
      stopShow(); teardown(); pages = [];
      book.hidden = true; gallery.hidden = false; document.body.classList.remove('book-open'); btn.focus({ preventScroll: true });
    }
    btn.addEventListener('click', open);
    document.getElementById('bk-close').addEventListener('click', close);
    prev.addEventListener('click', function () { stopShow(); if (flip) flip.flipPrev(); });
    next.addEventListener('click', function () { stopShow(); if (flip) flip.flipNext(); });
    play.addEventListener('click', function () { if (timer) stopShow(); else startShow(); });
    full.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else if (book.requestFullscreen) book.requestFullscreen().catch(function () {});
    });
    if (!book.requestFullscreen) full.hidden = true;
    // viewing only: no right-click / long-press menu, no dragging pages out
    ['contextmenu', 'dragstart', 'copy'].forEach(function (t) {
      book.addEventListener(t, function (e) { e.preventDefault(); });
    });
    document.addEventListener('keydown', function (e) {
      if (book.hidden) return;
      var k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) { e.preventDefault(); return; }
      if (k === 'escape' && !document.fullscreenElement) close();
      else if (k === 'arrowleft' && flip) { stopShow(); flip.flipPrev(); }
      else if (k === 'arrowright' && flip) { stopShow(); flip.flipNext(); }
    });
  }

  // ---------------- Contact / enquiry + OTP ----------------
  function initContact() {
    var form = document.getElementById('enquiry-form');
    if (!form) return;
    var propertyId = new URLSearchParams(location.search).get('property_id') || '';
    var state = { enquiryId: null, mobile: null };
    var msg = document.getElementById('enq-msg');
    var otpBox = document.getElementById('otp-box');
    function show(el) { if (el) el.hidden = false; }
    function note(text, ok) { if (msg) { msg.textContent = text; msg.style.color = ok ? '#246a1f' : '#A2302F'; } }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (document.getElementById('enq-name') || {}).value || '';
      var mobile = ((document.getElementById('enq-mobile') || {}).value || '').replace(/[^0-9]/g, '');
      var req = (document.getElementById('enq-req') || {}).value || '';
      if (!name.trim() || mobile.length !== 10) { note('Enter your name and a 10-digit mobile number.'); return; }
      note('Sending OTP…', true);
      fetch('/api/enquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: name, mobile: mobile, requirement: req, property_id: propertyId }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { note(res.j.error || 'Could not submit. Try again.'); return; }
          state.enquiryId = res.j.enquiry_id; state.mobile = mobile;
          show(otpBox); note('We sent a 4-digit code to your mobile. Enter it below.', true);
          var first = document.querySelector('.otp-digit'); if (first) first.focus();
        }).catch(function () { note('Network error. Try again.'); });
    });

    var verify = document.getElementById('otp-verify');
    if (verify) verify.addEventListener('click', function () {
      var otp = Array.prototype.map.call(document.querySelectorAll('.otp-digit'), function (i) { return i.value; }).join('');
      if (otp.length !== 4) { note('Enter the 4-digit code.'); return; }
      fetch('/api/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ mobile: state.mobile, otp: otp, enquiry_id: state.enquiryId }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { note(res.j.error || 'Invalid code.'); return; }
          form.reset(); if (otpBox) otpBox.hidden = true;
          note('Thank you for your enquiry — we will get in touch with you.', true);
        }).catch(function () { note('Network error. Try again.'); });
    });
    // auto-advance OTP boxes
    document.querySelectorAll('.otp-digit').forEach(function (inp, i, all) {
      inp.addEventListener('input', function () { if (inp.value && all[i + 1]) all[i + 1].focus(); });
    });
  }

  // ---------------- EMI calculator (home) ----------------
  function initEMI() {
    var pv = document.getElementById('emi-pv');
    if (!pv) return;
    var dp = document.getElementById('emi-dp');
    var loan = document.getElementById('emi-loan');
    var rate = document.getElementById('emi-rate');
    var tenure = document.getElementById('emi-tenure');
    var yrsBtn = document.getElementById('emi-yrs');
    var mosBtn = document.getElementById('emi-mos');
    var out = document.getElementById('emi-out');
    var unit = 'yrs';
    function numOf(el) { return parseFloat(String(el.value).replace(/[^0-9.]/g, '')) || 0; }
    function inr0(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
    function setUnit(u) {
      unit = u;
      yrsBtn.setAttribute('aria-pressed', u === 'yrs' ? 'true' : 'false');
      mosBtn.setAttribute('aria-pressed', u === 'mos' ? 'true' : 'false');
    }
    function calc() {
      var P = Math.max(0, numOf(pv) - numOf(dp));
      loan.value = P.toLocaleString('en-IN');
      var n = numOf(tenure) * (unit === 'yrs' ? 12 : 1);
      var r = numOf(rate) / 12 / 100;
      var emi = 0;
      if (P > 0 && n > 0) emi = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      out.textContent = inr0(emi);
    }
    [pv, dp, rate, tenure].forEach(function (el) { el.addEventListener('input', calc); });
    yrsBtn.addEventListener('click', function () { setUnit('yrs'); calc(); });
    mosBtn.addEventListener('click', function () { setUnit('mos'); calc(); });
    setUnit('yrs'); calc();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHome(); initProperties(); initDetail(); initContact(); initEMI();
  });
})();
