/* ============================================================
   bottom-nav.js — Thanh điều hướng dưới đáy (chỉ hiện trên điện thoại)
   Trang chủ | Danh mục | Giỏ hàng | Đơn hàng | Tài khoản
   Số lượng giỏ hàng được sao chép từ badge #global-cart-count của header
   (shop-core.js vẫn là nơi duy nhất cập nhật số này).
   ============================================================ */
(function () {
    'use strict';

    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    var user = null;
    try { user = JSON.parse(localStorage.getItem('currentUser')); } catch (e) { /* bỏ qua */ }
    var accountHref = user ? 'profile.html' : 'signin.html';

    function isActive(key) {
        switch (key) {
            case 'home': return page === 'index.html' || page === '';
            case 'cat': return page.indexOf('products-') === 0;
            case 'cart': return page === 'cart.html';
            case 'orders': return page === 'orders.html';
            case 'me': return page === 'profile.html' || page === 'signin.html' || page === 'signup.html';
        }
        return false;
    }

    var items = [
        { key: 'home', icon: 'house', label: 'Trang chủ', href: 'index.html' },
        { key: 'cat', icon: 'layout-grid', label: 'Danh mục', href: '#' },
        { key: 'cart', icon: 'shopping-cart', label: 'Giỏ hàng', href: 'cart.html', badge: true },
        { key: 'orders', icon: 'package', label: 'Đơn hàng', href: 'orders.html' },
        { key: 'me', icon: 'user', label: user ? 'Tài khoản' : 'Đăng nhập', href: accountHref }
    ];

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Điều hướng chính');
    nav.innerHTML = items.map(function (it) {
        return '<a class="bn-item' + (isActive(it.key) ? ' active' : '') + '" data-key="' + it.key +
            '" href="' + it.href + '"' + (isActive(it.key) ? ' aria-current="page"' : '') + '>' +
            '<span class="bn-icon" aria-hidden="true"><svg class="icon"><use href="images/icons/lucide.svg#' + it.icon + '"/></svg>' +
            (it.badge ? '<span class="bn-badge" id="bn-cart-badge" hidden>0</span>' : '') +
            '</span><span class="bn-label">' + it.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('has-bottom-nav');

    // ----- Sao chép số lượng giỏ hàng từ header -----
    var badge = document.getElementById('bn-cart-badge');
    function syncBadge() {
        var src = document.getElementById('global-cart-count');
        var n = src ? parseInt(src.textContent, 10) || 0 : 0;
        badge.textContent = n > 99 ? '99+' : n;
        badge.hidden = n <= 0;
    }
    var srcEl = document.getElementById('global-cart-count');
    if (srcEl && window.MutationObserver) {
        new MutationObserver(syncBadge).observe(srcEl, { childList: true, characterData: true, subtree: true });
    }
    syncBadge();
    window.addEventListener('storage', syncBadge);
    setTimeout(syncBadge, 600);

    // ----- Bảng chọn danh mục -----
    var cats = [
        { href: 'products-anime.html', name: 'Mô hình Anime' },
        { href: 'products-gundam.html', name: 'Gundam' },
        { href: 'products-car.html', name: 'Siêu xe' },
        { href: 'products-tools.html', name: 'Dụng cụ' }
    ];
    var sheet = document.createElement('div');
    sheet.className = 'nav-sheet';
    sheet.hidden = true;
    sheet.innerHTML = '<div class="nav-sheet-box" role="dialog" aria-label="Danh mục sản phẩm">' +
        '<div class="nav-sheet-head"><strong>Danh mục sản phẩm</strong>' +
        '<button type="button" class="nav-sheet-close" aria-label="Đóng"><svg class="icon"><use href="images/icons/lucide.svg#x"/></svg></button></div>' +
        '<div class="nav-sheet-grid">' + cats.map(function (c) {
            return '<a href="' + c.href + '"' + (page === c.href ? ' class="current"' : '') + '>' +
                c.name + '</a>';
        }).join('') + '</div></div>';
    document.body.appendChild(sheet);

    function openSheet() { sheet.hidden = false; document.body.classList.add('no-scroll'); }
    function closeSheet() { sheet.hidden = true; document.body.classList.remove('no-scroll'); }

    nav.querySelector('[data-key="cat"]').addEventListener('click', function (e) {
        e.preventDefault();
        sheet.hidden ? openSheet() : closeSheet();
    });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    sheet.querySelector('.nav-sheet-close').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
})();
