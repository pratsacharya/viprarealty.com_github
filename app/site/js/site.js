/* Vipra Realty — public site ↔ API wiring (vanilla JS, no build step). */
(function () {
  'use strict';

  var PLACEHOLDER = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#B2BCC8" stroke-width="1.2" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function imgSrc(p) { return /^https?:/.test(p) ? p : ('/' + String(p).replace(/^\/+/, '')); }

  function priceText(l) {
    if (l.search_type === 'Buy') return l.sale_price ? inr(l.sale_price) : 'Price on request';
    return l.monthly_rent ? inr(l.monthly_rent) + '<span style="font-size:13px;font-weight:500;color:#8A93A1">/mo</span>' : 'Rent on request';
  }
  function badge(l) {
    if (l.status === 'sold_out') return ['SOLD OUT', '#6E7686'];
    if (l.status === 'rented_out') return ['RENTED OUT', '#6E7686'];
    return [l.search_type === 'Buy' ? 'FOR SALE' : 'FOR RENT', l.search_type === 'Buy' ? '#6B4BC9' : '#28B7AC'];
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
    var title = (l.project_title || '') + ' ' + (l.building_name || '');
    var media = l.images && l.images.length
      ? '<img src="' + esc(imgSrc(l.images[0])) + '" alt="" style="width:100%;height:100%;object-fit:cover">'
      : PLACEHOLDER;
    var dim = (l.status === 'sold_out' || l.status === 'rented_out');
    return '' +
      '<a class="card" href="property-detail.html?id=' + l.id + '" style="display:block;border:1px solid #ECEEF2;border-radius:16px;overflow:hidden;background:#fff;color:inherit;text-decoration:none">' +
      '<div style="height:190px;background:linear-gradient(135deg,#E7EBF1,#D7E2E1);position:relative;display:flex;align-items:center;justify-content:center;' + (dim ? 'filter:saturate(.6)' : '') + '">' + media +
      '<span style="position:absolute;top:12px;left:12px;background:' + b[1] + ';color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px">' + b[0] + '</span></div>' +
      '<div style="padding:18px">' +
      '<div style="font-size:11px;font-weight:600;color:#8A93A1;letter-spacing:.04em">' + esc((l.category || '').toUpperCase()) + (l.sub_category ? ' · ' + esc(l.sub_category.toUpperCase()) : '') + '</div>' +
      '<h3 style="font-size:17px;font-weight:600;margin:7px 0 3px;color:#151922">' + (esc(title.trim()) || 'Untitled') + '</h3>' +
      '<div style="font-size:13px;color:#5A6472;margin-bottom:12px">' + esc([l.locality, l.city].filter(Boolean).join(', ')) + '</div>' +
      '<div style="font-size:20px;font-weight:700;color:' + (dim ? '#8A93A1' : '#151922') + '">' + priceText(l) + '</div>' +
      '<div style="display:flex;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid #F0F2F5;font-size:12px;color:#5A6472">' +
      specs(l).map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' +
      '</div></a>';
  }

  function getListings(params) {
    var qs = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { if (params[k]) qs.set(k, params[k]); });
    return fetch('/api/listings' + (qs.toString() ? '?' + qs.toString() : ''))
      .then(function (r) { return r.json(); });
  }

  // ---------------- Home ----------------
  function initHome() {
    var grid = document.getElementById('featured-grid');
    if (!grid) return;
    getListings({}).then(function (d) {
      var ls = (d.listings || []).slice(0, 6);
      grid.innerHTML = ls.length ? ls.map(cardHTML).join('')
        : '<p style="color:#8A93A1;grid-column:1/-1">No listings yet — add some from the admin panel.</p>';
    }).catch(function () { grid.innerHTML = '<p style="color:#8A93A1;grid-column:1/-1">Could not load listings.</p>'; });

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
    var url = new URLSearchParams(location.search);
    // prefill controls from URL
    [['f-type', 'search_type'], ['f-cat', 'category'], ['f-sub', 'sub'], ['f-city', 'city'], ['f-listing', 'listing_type'], ['f-q', 'q']].forEach(function (m) {
      var el = document.getElementById(m[0]); if (el && url.get(m[1])) el.value = url.get(m[1]);
    });

    function run() {
      var params = {
        search_type: val('f-type'), category: val('f-cat'), sub: val('f-sub'),
        city: val('f-city'), listing_type: val('f-listing'), q: val('f-q'),
      };
      grid.innerHTML = '<p style="color:#8A93A1;grid-column:1/-1">Loading…</p>';
      getListings(params).then(function (d) {
        var ls = d.listings || [];
        var count = document.getElementById('results-count');
        if (count) count.textContent = ls.length;
        grid.innerHTML = ls.length ? ls.map(cardHTML).join('')
          : '<p style="color:#8A93A1;grid-column:1/-1">No properties match these filters.</p>';
      }).catch(function () { grid.innerHTML = '<p style="color:#8A93A1;grid-column:1/-1">Could not load listings.</p>'; });
    }
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    var apply = document.getElementById('apply-filters');
    if (apply) apply.addEventListener('click', function (e) { e.preventDefault(); run(); });
    document.querySelectorAll('[data-chip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = document.getElementById('f-type'); if (t) t.value = btn.getAttribute('data-chip');
        document.querySelectorAll('[data-chip]').forEach(function (b) { b.classList.toggle('chip-active', b === btn); });
        run();
      });
    });
    run();
  }

  // ---------------- Property detail ----------------
  function initDetail() {
    var root = document.getElementById('detail-root');
    if (!root) return;
    var id = new URLSearchParams(location.search).get('id');
    if (!id) { root.innerHTML = '<p style="color:#8A93A1">No property selected.</p>'; return; }
    getListings({ id: id }).then(function (d) {
      var l = (d.listings || [])[0];
      if (!l) { root.innerHTML = '<p style="color:#8A93A1">Property not found.</p>'; return; }
      set('d-title', (l.project_title || '') + ' ' + (l.building_name || ''));
      set('d-loc', [l.locality, l.city].filter(Boolean).join(', '));
      setHTML('d-price', priceText(l));
      var b = badge(l);
      var badges = '<span style="background:' + b[1] + ';color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:7px">' + b[0] + '</span>' +
        (l.category ? ' <span style="background:#EDE8FB;color:#6B4BC9;font-size:12px;font-weight:600;padding:6px 12px;border-radius:7px">' + esc((l.category + (l.sub_category ? ' · ' + l.sub_category : '')).toUpperCase()) + '</span>' : '') +
        (l.listing_type ? ' <span style="background:#F3F5F8;color:#43506A;font-size:12px;font-weight:600;padding:6px 12px;border-radius:7px">' + esc(l.listing_type.toUpperCase()) + '</span>' : '');
      setHTML('d-badges', badges);
      setHTML('d-highlights', specs(l).map(function (s) {
        return '<div style="border:1px solid #ECEEF2;border-radius:14px;padding:16px"><div style="font-size:18px;font-weight:700;color:#151922;font-family:Poppins,sans-serif">' + esc(s) + '</div></div>';
      }).join('') || '<p class="muted" style="color:#8A93A1">No highlights provided.</p>');
      set('d-desc', l.description || 'No description provided.');
      // gallery
      var g = document.getElementById('d-gallery');
      if (g) g.innerHTML = (l.images && l.images.length)
        ? l.images.slice(0, 5).map(function (src, i) {
          return '<div style="border-radius:14px;overflow:hidden;background:#E7EBF1;' + (i === 0 ? 'grid-row:span 2;min-height:320px' : 'min-height:150px') + '"><img src="' + esc(imgSrc(src)) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>';
        }).join('')
        : '<div style="border-radius:14px;min-height:320px;background:linear-gradient(135deg,#E7EBF1,#D7E2E1);display:flex;align-items:center;justify-content:center">' + PLACEHOLDER + '</div>';
      // key details
      setHTML('d-details', [
        ['Builder', l.builder_name], ['Project', l.project_title], ['Possession', l.possession_date],
        ['Deposit', l.deposit_amount ? inr(l.deposit_amount) : ''], ['Down payment', l.down_payment ? inr(l.down_payment) : ''],
        ['Status', (l.status || '').replace('_', ' ')],
      ].filter(function (r) { return r[1]; }).map(function (r) {
        return '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #F0F2F5;padding-bottom:10px"><span style="color:#8A93A1;font-size:14px">' + r[0] + '</span><span style="color:#151922;font-size:14px;font-weight:500">' + esc(r[1]) + '</span></div>';
      }).join(''));
      // enquire link carries the property id
      var enq = document.getElementById('d-enquire');
      if (enq) enq.href = 'contact.html?property_id=' + l.id;
      // similar
      getListings({ category: l.category }).then(function (sd) {
        var sim = (sd.listings || []).filter(function (x) { return x.id != l.id; }).slice(0, 3);
        var sg = document.getElementById('d-similar');
        if (sg) sg.innerHTML = sim.map(cardHTML).join('') || '<p style="color:#8A93A1;grid-column:1/-1">No similar listings yet.</p>';
      });
    });
    function set(id, t) { var el = document.getElementById(id); if (el) el.textContent = String(t).trim(); }
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
    function show(el) { if (el) el.style.display = ''; }
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
          form.reset(); if (otpBox) otpBox.style.display = 'none';
          note('Thank you for your enquiry — we will get in touch with you.', true);
        }).catch(function () { note('Network error. Try again.'); });
    });
    // auto-advance OTP boxes
    document.querySelectorAll('.otp-digit').forEach(function (inp, i, all) {
      inp.addEventListener('input', function () { if (inp.value && all[i + 1]) all[i + 1].focus(); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHome(); initProperties(); initDetail(); initContact();
  });
})();
