/* ============================================================
   recently-viewed.js — "Sản phẩm bạn vừa xem" + "Gợi ý cho bạn"
   - Trang chi tiết: ghi nhớ sản phẩm đang xem (localStorage 'recentlyViewed', tối đa 12)
     và hiện các sản phẩm đã xem trước đó.
   - Trang chủ: hiện danh sách đã xem + gợi ý dựa trên danh mục/hãng khách hay xem.
   Dữ liệu chỉ nằm trên thiết bị của khách, không gửi đi đâu.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'recentlyViewed';
    var MAX = 12;
    var MS = window.MS;
    if (!MS) return;

    function load() { try { var a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); } catch (e) { /* đầy bộ nhớ -> bỏ qua */ } }

    function record(p) {
        var slim = { id: p.id, name: p.name, image: p.image && p.image.indexOf('data:') === 0 ? '' : p.image, price: p.price,
            salePrice: p.salePrice || null, category: p.category, brand: p.brand || '' };
        var list = load().filter(function (x) { return x.id !== p.id; });
        list.unshift(slim);
        save(list);
    }

    function cardHTML(p) {
        var imgHtml = p.image
            ? '<img src="' + MS.esc(p.image) + '" ' + MS.srcsetAttrs(p.image, '150px') + ' alt="" loading="lazy" decoding="async">'
            : '<div class="rv-noimg" aria-hidden="true"></div>';
        return '<a class="rv-card" href="products-detail.html?id=' + encodeURIComponent(p.id) + '">' + imgHtml +
            '<div class="rv-name">' + MS.esc(p.name) + '</div><div class="rv-price">' + MS.money(MS.effectivePrice(p)) + '</div></a>';
    }

    function section(title, items, cls) {
        var s = document.createElement('section');
        s.className = 'rv-section ' + (cls || '');
        s.setAttribute('aria-label', title);
        s.innerHTML = '<h2 class="rv-title">' + title + '</h2><div class="rv-row">' + items.map(cardHTML).join('') + '</div>';
        return s;
    }

    // ---------- TRANG CHI TIẾT ----------
    var titleEl = document.getElementById('productTitle');
    if (titleEl) {
        var done = false;
        var apply = function () {
            var p = (typeof currentProduct !== 'undefined') ? currentProduct : null;
            if (!p || done) return;
            done = true;
            var before = load().filter(function (x) { return x.id !== p.id; });
            record(p);
            if (!before.length) return;
            var anchor = document.querySelector('.product-details-section') || document.querySelector('.product-detail');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section('Sản phẩm bạn vừa xem', before.slice(0, 8)), anchor.nextSibling);
        };
        if (window.MutationObserver) new MutationObserver(apply).observe(titleEl, { childList: true, characterData: true, subtree: true });
        var n = 0, t = setInterval(function () { apply(); if (done || ++n > 120) clearInterval(t); }, 200);
        return;
    }

    // ---------- TRANG CHỦ ----------
    var host = document.querySelector('.container');
    if (!host || !/index\.html$|\/$/.test(location.pathname)) return;
    var recent = load();
    if (!recent.length) return;

    host.insertBefore(section('Sản phẩm bạn vừa xem', recent.slice(0, 8)), host.firstChild);

    if (typeof ShopCore === 'undefined' || !ShopCore.loadProducts) return;
    ShopCore.loadProducts().then(function (all) {
        var seen = {}; recent.forEach(function (r) { seen[r.id] = true; });
        var catW = {}, brandW = {};
        recent.forEach(function (r, i) {
            var w = MAX - i; // xem gần đây có trọng số cao hơn
            catW[r.category] = (catW[r.category] || 0) + w;
            if (r.brand) brandW[r.brand] = (brandW[r.brand] || 0) + w;
        });
        var scored = all.filter(function (p) { return !seen[p.id]; }).map(function (p) {
            return { p: p, score: (catW[p.category] || 0) * 1 + (brandW[p.brand] || 0) * 2 + Math.min(5, (p.sold || 0) / 50) };
        }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
        if (scored.length) {
            var el = section('Gợi ý cho bạn', scored.map(function (x) { return x.p; }), 'rv-suggest');
            var first = host.querySelector('.rv-section');
            host.insertBefore(el, first ? first.nextSibling : host.firstChild);
        }
    }).catch(function () { /* không có dữ liệu -> thôi */ });
})();
