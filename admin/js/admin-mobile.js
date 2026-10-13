/* admin-mobile.js — bọc mọi <table> trong khung cuộn ngang (để bảng không làm tràn trang
   trên điện thoại) và khoá cuộn nền khi mở popup. Không đổi logic nghiệp vụ. */
(function () {
    'use strict';

    function wrapTables() {
        document.querySelectorAll('table').forEach(function (t) {
            if (t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
            var w = document.createElement('div');
            w.className = 'table-scroll';
            t.parentNode.insertBefore(w, t);
            w.appendChild(t);
        });
    }

    // Khoá cuộn trang nền khi có popup đang mở (.modal-overlay.show)
    function watchModals() {
        var mods = document.querySelectorAll('.modal-overlay');
        if (!mods.length || !window.MutationObserver) return;
        function sync() {
            var open = document.querySelector('.modal-overlay.show');
            document.body.style.overflow = open ? 'hidden' : '';
        }
        mods.forEach(function (m) {
            new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class'] });
        });
    }

    function init() { wrapTables(); watchModals(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
