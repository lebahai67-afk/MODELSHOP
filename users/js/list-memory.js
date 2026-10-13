/* ============================================================
   list-memory.js — Nhớ bộ lọc, cách sắp xếp và vị trí cuộn của trang DANH MỤC
   Khi khách bấm vào một sản phẩm rồi bấm "Quay lại" (hoặc tải lại trang), danh sách
   hiện đúng như lúc rời đi thay vì trở về đầu trang với bộ lọc bị xoá.
   Chỉ khôi phục khi quay lại / tải lại, KHÔNG khôi phục khi khách chủ động bấm menu
   vào danh mục (để vào danh mục luôn thấy đầy đủ sản phẩm).
   ============================================================ */
(function () {
    'use strict';
    var grid = document.getElementById('product-grid');
    if (!grid || !grid.getAttribute('data-category')) return;

    var KEY = 'listState:' + location.pathname;
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
    var shouldRestore = nav.type === 'back_forward' || nav.type === 'reload';

    function $(id) { return document.getElementById(id); }
    function boxes() { return Array.prototype.slice.call(document.querySelectorAll('.sidebar input[type="checkbox"]')); }
    function key(cb) { return cb.name + '|' + cb.value; }

    function snapshot() {
        var sort = document.querySelector('.sort-select');
        return {
            checked: boxes().filter(function (c) { return c.checked; }).map(key),
            from: $('priceFrom') ? $('priceFrom').value : '',
            to: $('priceTo') ? $('priceTo').value : '',
            sort: sort ? sort.value : '',
            y: Math.round(window.scrollY)
        };
    }
    var lastWrite = 0, timer = null;
    function persist() {
        var now = Date.now();
        if (now - lastWrite < 300) { clearTimeout(timer); timer = setTimeout(persist, 320); return; }
        lastWrite = now;
        try { sessionStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* bỏ qua */ }
    }

    ['change', 'input'].forEach(function (ev) { document.addEventListener(ev, persist, true); });
    window.addEventListener('scroll', persist, { passive: true });
    window.addEventListener('pagehide', function () { lastWrite = 0; persist(); });

    function restore(state) {
        var sort = document.querySelector('.sort-select');
        boxes().forEach(function (c) { c.checked = state.checked.indexOf(key(c)) !== -1; });
        if ($('priceFrom')) $('priceFrom').value = state.from || '';
        if ($('priceTo')) $('priceTo').value = state.to || '';
        if (sort && state.sort) sort.value = state.sort;
        if (typeof window.executeFilterAndSort === 'function') window.executeFilterAndSort();
        var sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.dispatchEvent(new Event('change', { bubbles: true })); // cập nhật chip + số bộ lọc
        requestAnimationFrame(function () { window.scrollTo(0, state.y || 0); });
    }

    if (!shouldRestore) { try { sessionStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ } return; }
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* bỏ qua */ }
    if (!saved) return;

    // Đợi sản phẩm thật được vẽ ra (không phải khung skeleton) rồi mới khôi phục
    var restored = false;
    function tryRestore() {
        if (restored) return;
        if (grid.querySelector('.product:not(.skeleton)')) { restored = true; obs.disconnect(); restore(saved); }
    }
    var obs = new MutationObserver(tryRestore);
    obs.observe(grid, { childList: true });
    tryRestore();
    setTimeout(function () { obs.disconnect(); }, 15000);
})();
