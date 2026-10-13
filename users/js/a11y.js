/* ============================================================
   a11y.js — Bổ sung trợ năng (đọc màn hình, bàn phím) cho toàn bộ trang
   - Liên kết "Bỏ qua tới nội dung chính"
   - aria-label cho nút chỉ có biểu tượng (tìm kiếm, +, −, đóng ...)
   - Phần tử bấm được nhưng không phải <a>/<button> -> role="button", Tab + Enter/Space dùng được
   - Popup: role="dialog" aria-modal; thông báo (toast): role="status"
   Chạy lại tự động cho nội dung được JS vẽ thêm sau đó.
   ============================================================ */
(function () {
    'use strict';

    var ICON_LABELS = {
        '+': 'Tăng số lượng', '-': 'Giảm số lượng', '−': 'Giảm số lượng', 'x': 'Đóng', '×': 'Đóng'
    };

    function mainTarget() {
        var sel = ['main', '.main-content', '.cart-container', '.checkout-container', '.checkout-wrapper', '.orders-wrap',
            '.profile-wrap', '.main-container', '.product-detail', '.banner-section', '.container'];
        for (var i = 0; i < sel.length; i++) { var el = document.querySelector(sel[i]); if (el) return el; }
        return null;
    }

    function addSkipLink() {
        if (document.querySelector('.skip-link')) return;
        var t = mainTarget();
        if (!t) return;
        if (!t.id) t.id = 'main-content';
        t.setAttribute('tabindex', '-1');
        var a = document.createElement('a');
        a.className = 'skip-link';
        a.href = '#' + t.id;
        a.textContent = 'Bỏ qua tới nội dung chính';
        document.body.insertBefore(a, document.body.firstChild);
    }

    function enhance(root) {
        root = root || document;

        // nút chỉ có biểu tượng
        root.querySelectorAll('button:not([aria-label]), [role="button"]:not([aria-label])').forEach(function (b) {
            var txt = (b.textContent || '').trim();
            if (ICON_LABELS[txt]) b.setAttribute('aria-label', ICON_LABELS[txt]);
            else if (!txt && b.title) b.setAttribute('aria-label', b.title);
        });

        // ô tìm kiếm và các input không nhãn
        root.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([id])').forEach(function (i) {
            if (!i.closest('label') && i.placeholder) i.setAttribute('aria-label', i.placeholder);
        });
        root.querySelectorAll('input[id]:not([aria-label])').forEach(function (i) {
            if (!i.closest('label') && !document.querySelector('label[for="' + i.id + '"]') && i.placeholder) i.setAttribute('aria-label', i.placeholder);
        });

        // phần tử bấm được nhưng không focus được
        root.querySelectorAll('[onclick]:not(a):not(button):not(input):not(select):not(textarea):not(label):not([role])').forEach(function (el) {
            el.setAttribute('role', 'button');
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        });
        root.querySelectorAll('.chat-box:not([role])').forEach(function (el) {
            el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Mở khung trò chuyện');
        });

        // popup + thông báo
        root.querySelectorAll('.modal-overlay:not([role]), .rt-overlay:not([role])').forEach(function (m) {
            m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
        });
        root.querySelectorAll('[class*="toast"]:not([role])').forEach(function (t) { t.setAttribute('role', 'status'); });

        // ảnh thiếu alt -> coi là trang trí để trình đọc màn hình bỏ qua
        root.querySelectorAll('img:not([alt])').forEach(function (img) { img.setAttribute('alt', ''); });
    }

    // Enter / Space kích hoạt phần tử role="button" không phải <button>
    document.addEventListener('keydown', function (e) {
        var el = e.target;
        if (!el || el.getAttribute('role') !== 'button' || /^(BUTTON|A|INPUT)$/.test(el.tagName)) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });

    function init() {
        addSkipLink();
        enhance(document);
        if (window.MutationObserver) {
            var pending = false;
            new MutationObserver(function () {
                if (pending) return;
                pending = true;
                setTimeout(function () { pending = false; enhance(document); }, 250);
            }).observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
