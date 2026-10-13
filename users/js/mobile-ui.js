/* ============================================================
   mobile-ui.js — Nâng cấp giao diện cho trang DANH SÁCH sản phẩm
   (products-anime / car / gundam / tools / search)
   1) Skeleton loading: khung xám nhấp nháy trong lúc chờ tải sản phẩm
   2) Bộ lọc dạng "bottom sheet" trên màn <= 900px (nút [Bộ lọc])
   3) Chip lọc nhanh (giá + nhóm lọc đầu tiên) ngay dưới tiêu đề
   File này KHÔNG đổi logic lọc trong products.js: chip chỉ thao tác
   trên chính các ô checkbox / ô giá có sẵn rồi gọi lại bộ lọc cũ.
   ============================================================ */
(function () {
    'use strict';

    var MOBILE_MAX = 900;
    var FILTER_ICON = '<svg class="icon"><use href="images/icons/lucide.svg#sliders-horizontal"/></svg>';
    var grid = document.getElementById('product-grid');
    var isCategoryPage = !!(grid && grid.getAttribute('data-category'));

    // ---------- 1) SKELETON ----------
    if (isCategoryPage && grid.innerHTML.trim() === '') {
        var sk = '';
        for (var i = 0; i < 8; i++) {
            sk += '<div class="product skeleton" aria-hidden="true">' +
                '<div class="sk-img"></div><div class="sk-line"></div>' +
                '<div class="sk-line short"></div></div>';
        }
        grid.innerHTML = sk;
        grid.setAttribute('aria-busy', 'true');
        // Quá 12 giây vẫn chưa có dữ liệu (mạng lỗi) -> báo thay vì để khung xám mãi
        setTimeout(function () {
            if (grid.querySelector('.skeleton')) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px 16px;color:#999;">' +
                    'Không tải được sản phẩm. Vui lòng kiểm tra mạng và tải lại trang.</div>';
            }
        }, 12000);
    }

    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    var filterBox = sidebar.querySelector('.filter-box');
    var header = document.querySelector('.products-header');

    // ---------- 2) BOTTOM SHEET ----------
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'filter-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = FILTER_ICON + '<span class="ft-label">Bộ lọc</span>';

    var sort = header && header.querySelector('.sort-select');
    if (header && sort && sort.parentNode === header) {
        header.insertBefore(toggle, sort);
    } else if (sidebar.parentNode) {
        sidebar.parentNode.insertBefore(toggle, sidebar);
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'filter-close';
    closeBtn.setAttribute('aria-label', 'Đóng bộ lọc');
    closeBtn.innerHTML = '<svg class="icon"><use href="images/icons/lucide.svg#x"/></svg>';
    if (filterBox) filterBox.insertBefore(closeBtn, filterBox.firstChild);

    function openSheet() {
        sidebar.classList.add('is-open');
        document.body.classList.add('no-scroll');
        toggle.setAttribute('aria-expanded', 'true');
    }
    function closeSheet() {
        sidebar.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
        toggle.setAttribute('aria-expanded', 'false');
    }
    function updateCount() {
        var n = sidebar.querySelectorAll('input[type="checkbox"]:checked').length;
        toggle.querySelector('.ft-label').textContent = 'Bộ lọc' + (n ? ' (' + n + ')' : '');
    }

    toggle.addEventListener('click', openSheet);
    closeBtn.addEventListener('click', closeSheet);
    sidebar.addEventListener('click', function (e) { if (e.target === sidebar) closeSheet(); });
    var applyBtn = sidebar.querySelector('.filter-btn');
    if (applyBtn) applyBtn.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    window.addEventListener('resize', function () { if (window.innerWidth > MOBILE_MAX) closeSheet(); });

    // ---------- 3) CHIP LỌC NHANH (chỉ trang danh mục) ----------
    var chipBar = null;
    var chips = []; // { el, kind: 'all'|'price'|'tag', ... }

    function refilter() {
        if (typeof window.executeFilterAndSort === 'function') window.executeFilterAndSort();
    }

    function buildChips() {
        if (!isCategoryPage || !header) return;

        var priceFrom = document.getElementById('priceFrom');
        var priceTo = document.getElementById('priceTo');
        var boxes = Array.prototype.slice.call(sidebar.querySelectorAll('input[type="checkbox"]'));

        chipBar = document.createElement('div');
        chipBar.className = 'quick-chips';
        chipBar.setAttribute('role', 'group');
        chipBar.setAttribute('aria-label', 'Lọc nhanh');

        function addChip(label, kind, data) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            b.textContent = label;
            chipBar.appendChild(b);
            var c = { el: b, kind: kind, data: data || {} };
            chips.push(c);
            b.addEventListener('click', function () { onChip(c); });
            return c;
        }

        addChip('Tất cả', 'all');

        if (priceFrom && priceTo) {
            [[0, 500000, 'Dưới 500k'], [500000, 2000000, '500k – 2tr'],
             [2000000, 5000000, '2tr – 5tr'], [5000000, 0, 'Trên 5tr']].forEach(function (r) {
                addChip(r[2], 'price', { from: r[0], to: r[1] });
            });
        }

        // Nhóm lọc đầu tiên (vd: Hãng / Tỉ lệ) -> mỗi giá trị một chip
        if (boxes.length) {
            var firstName = boxes[0].name;
            boxes.filter(function (cb) { return cb.name === firstName; }).slice(0, 8).forEach(function (cb) {
                var lbl = cb.closest('label');
                var text = lbl ? lbl.textContent.trim() : cb.value;
                addChip(text, 'tag', { cb: cb });
            });
        }

        header.parentNode.insertBefore(chipBar, header.nextSibling);

        function onChip(c) {
            if (c.kind === 'all') {
                boxes.forEach(function (cb) { cb.checked = false; });
                if (priceFrom) priceFrom.value = '';
                if (priceTo) priceTo.value = '';
            } else if (c.kind === 'price') {
                var active = c.el.classList.contains('active');
                priceFrom.value = active || !c.data.from ? '' : c.data.from;
                priceTo.value = active || !c.data.to ? '' : c.data.to;
            } else if (c.kind === 'tag') {
                c.data.cb.checked = !c.data.cb.checked;
                c.data.cb.dispatchEvent(new Event('change', { bubbles: true }));
                syncChips();
                return; // products.js đã tự lọc qua sự kiện change
            }
            refilter();
            syncChips();
        }
    }

    function syncChips() {
        if (!chipBar) return;
        var priceFrom = document.getElementById('priceFrom');
        var priceTo = document.getElementById('priceTo');
        var f = priceFrom && priceFrom.value !== '' ? Number(priceFrom.value) : 0;
        var t = priceTo && priceTo.value !== '' ? Number(priceTo.value) : 0;
        var anyTag = false;
        chips.forEach(function (c) {
            if (c.kind === 'tag') {
                c.el.classList.toggle('active', c.data.cb.checked);
                if (c.data.cb.checked) anyTag = true;
            } else if (c.kind === 'price') {
                c.el.classList.toggle('active', f === c.data.from && t === c.data.to && (f || t));
            }
        });
        var anyPrice = chips.some(function (c) { return c.kind === 'price' && c.el.classList.contains('active'); });
        chips[0].el.classList.toggle('active', !anyTag && !anyPrice && !f && !t);
    }

    sidebar.addEventListener('change', function () { updateCount(); syncChips(); });
    ['priceFrom', 'priceTo'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', syncChips);
    });
    if (applyBtn) applyBtn.addEventListener('click', function () { setTimeout(syncChips, 0); });

    buildChips();
    syncChips();
    updateCount();
})();
