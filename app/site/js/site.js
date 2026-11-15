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

  function priceText(l) {
    if (l.search_type === 'Buy') return l.sale_price ? inrShort(l.sale_price) : 'Price on request';
    return l.monthly_rent ? inr(l.monthly_rent) + '<small>/mo</small>' : 'Rent on request';
  }
  function badge(l) {
    if (l.status === 'sold_out') return ['Sold out', ''];
    if (l.status === 'rented_out') return ['Rented out', ''];
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
    var media = l.images && l.images.length
      ? '<img src="' + esc(imgSrc(l.images[0])) + '" alt="" loading="lazy">'
      : PLACEHOLDER;
    var sp = specs(l);
    return '' +
      '<article class="card' + (closed ? ' is-closed' : '') + '"><a href="property-detail.html?id=' + l.id + '">' +
      '<div class="media">' + media + '<span class="pill' + (closed ? ' pill-dark' : '') + '">' + b[0] + '</span></div>' +
      '<div class="row"><h3>' + esc(title) + '</h3><span class="price">' + priceText(l) + '</span></div>' +
      '<p class="loc">' + esc([l.locality, l.city].filter(Boolean).join(', ')) + '</p>' +
      (sp.length ? '<p class="specs">' + sp.map(esc).join(' · ') + (l.sub_category ? ' · ' + esc(l.sub_category) : '') + '</p>' : '') +
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
      var b = badge(l);
      setHTML('d-badges', '<span class="badge badge-ink">' + b[0] + '</span>' +
        (l.category ? '<span class="badge">' + esc(l.category + (l.sub_category ? ' · ' + l.sub_category : '')) + '</span>' : '') +
        (l.city ? '<span class="badge">' + esc(l.city) + '</span>' : ''));
      var hl = highlights(l);
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
        else g.innerHTML = imgs.slice(0, 3).map(function (src, i) {
          var more = (i === 2 && imgs.length > 3) ? '<span class="more">+' + (imgs.length - 3) + ' photos</span>' : '';
          return '<div><img src="' + esc(imgSrc(src)) + '" alt="" loading="lazy">' + more + '</div>';
        }).join('');
      }
      // key details
      setHTML('d-details', [
        ['Looking to', l.search_type],
        ['Property type', l.sub_category],
        ['Locality', l.locality], ['City', l.city],
        ['Possession', l.possession_date],
        ['Deposit', l.deposit_amount ? inr(l.deposit_amount) : ''],
        ['Down payment', l.down_payment ? inr(l.down_payment) : ''],
        ['Total floors', l.total_floors],
        ['Status', (l.status || '').replace('_', ' ')],
      ].filter(function (r) { return r[1] != null && r[1] !== ''; }).map(function (r) {
        return '<div class="kv"><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>';
      }).join(''));
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
    function set(id, t) { var el = document.getElementById(id); if (el) el.textContent = String(t == null ? '' : t).trim(); }
    function setHTML(id, h) { var el = document.getElementById(id); if (el) el.innerHTML = h; }
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
