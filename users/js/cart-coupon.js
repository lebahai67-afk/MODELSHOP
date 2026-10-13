/* ============================================================
   cart-coupon.js — Nhập mã giảm giá ngay ở trang GIỎ HÀNG
   Xem trước số tiền được giảm (dùng đúng ShopCore.validateVoucher của trang
   thanh toán). Mã hợp lệ được nhớ trong sessionStorage('pendingVoucher') để
   trang thanh toán tự áp dụng — khách không phải nhập lại.
   ============================================================ */
(function () {
    'use strict';
    var input = document.getElementById('cartVoucher');
    var btn = document.getElementById('cartVoucherBtn');
    var msg = document.getElementById('cartVoucherMsg');
    if (!input || !btn || !msg) return;

    var KEY = 'pendingVoucher';
    var lastValid = false;

    function money(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }

    // Tạm tính của các sản phẩm đang được tích chọn trong giỏ
    function selectedSubtotal() {
        if (typeof cartItems !== 'undefined' && Array.isArray(cartItems)) {
            var sum = 0;
            document.querySelectorAll('.item-checkbox:checked').forEach(function (cb) {
                var it = cartItems.find(function (i) { return i.id === cb.dataset.id; });
                if (it) sum += it.price * it.quantity;
            });
            return sum;
        }
        var digits = (document.getElementById('grandTotal') || {}).textContent || '';
        return Number(digits.replace(/\D/g, '')) || 0;
    }

    function setMsg(text, color) { msg.textContent = text; msg.style.color = color || '#999'; }

    function check() {
        var code = input.value.trim().toUpperCase();
        input.value = code;
        if (!code) { sessionStorage.removeItem(KEY); lastValid = false; setMsg(''); return; }
        var sub = selectedSubtotal();
        if (sub <= 0) { setMsg('Hãy tích chọn sản phẩm cần mua rồi áp dụng mã nhé.', '#ffb347'); return; }
        if (typeof ShopCore === 'undefined' || !ShopCore.validateVoucher) { setMsg('Chưa kiểm tra được mã lúc này, bạn có thể nhập tiếp ở bước thanh toán.', '#ffb347'); return; }
        setMsg('Đang kiểm tra mã...');
        ShopCore.validateVoucher(code, sub).then(function (r) {
            if (!r.valid) {
                lastValid = false;
                sessionStorage.removeItem(KEY);
                setMsg('' + r.reason, '#ff5555');
            } else {
                lastValid = true;
                sessionStorage.setItem(KEY, code);
                setMsg('Giảm ' + money(r.discount) + ', tạm tính còn ' + money(Math.max(0, sub - r.discount)) + ' (chưa gồm phí giao hàng)', '#3ddc84');
            }
        });
    }

    btn.addEventListener('click', check);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });

    // Đổi sản phẩm được chọn / số lượng -> tính lại mức giảm nếu đã có mã hợp lệ
    var grand = document.getElementById('grandTotal');
    if (grand && window.MutationObserver) {
        var t = null;
        new MutationObserver(function () {
            if (!lastValid) return;
            clearTimeout(t); t = setTimeout(check, 400);
        }).observe(grand, { childList: true, characterData: true, subtree: true });
    }

    // Giỏ hàng trống thì ẩn ô mã giảm giá (không có gì để áp dụng)
    var coupon = input.closest('.cart-coupon');
    var empty = document.getElementById('cartEmpty');
    function syncVisibility() {
        if (!coupon || !empty) return;
        coupon.hidden = window.getComputedStyle(empty).display !== 'none';
    }
    if (empty && window.MutationObserver) new MutationObserver(syncVisibility).observe(empty, { attributes: true, attributeFilter: ['style'] });
    syncVisibility();

    // Quay lại giỏ hàng khi đã có mã nhớ sẵn
    var saved = sessionStorage.getItem(KEY);
    if (saved) { input.value = saved; setTimeout(check, 900); }
})();
