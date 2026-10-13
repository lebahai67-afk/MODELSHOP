// users/js/wishlist.js - Nút ❤️ "Sản phẩm yêu thích" trên thẻ sản phẩm và trang chi tiết.
// Dữ liệu lưu Firestore theo username (ShopCore.toggleWishlist / watchWishlist).
// Nạp SAU shop-core.js và auth-service.js. Các nút có thuộc tính data-wish="<id sản phẩm>"
// (riêng trang chi tiết dùng data-wish="__current__" = sản phẩm đang xem).

(function () {
    const style = document.createElement('style');
    style.textContent = `
    .product { position: relative; }
    .wish-btn { position: absolute; top: 8px; right: 8px; z-index: 5; width: 34px; height: 34px; border-radius: 50%;
        border: none; background: rgba(0,0,0,.55); color: #fff; font-size: 17px; cursor: pointer; line-height: 1;
        display: flex; align-items: center; justify-content: center; transition: transform .15s; }
    .wish-btn:hover { transform: scale(1.15); }
    .wish-btn.on { background: rgba(211,47,47,.9); }
    `;
    document.head.appendChild(style);

    let wishSet = new Set();
    let wishUser = null;

    function resolveId(btn) {
        const id = btn.getAttribute('data-wish');
        if (id === '__current__') return (typeof currentProduct !== 'undefined' && currentProduct) ? currentProduct.id : null;
        return id;
    }

    // Đồng bộ trạng thái ❤️/🤍 của mọi nút đang có trên trang theo danh sách yêu thích hiện tại.
    function syncButtons() {
        document.querySelectorAll('[data-wish]').forEach(btn => {
            const id = resolveId(btn);
            const on = id && wishSet.has(id);
            btn.classList.toggle('on', !!on);
            // Chỉ ghi khi nội dung thật sự đổi - tránh kích hoạt lại MutationObserver vô hạn.
            // Trái tim Lucide: viền khi chưa thích, tô đầy (class .on) khi đã thích.
            const label = btn.classList.contains('wish-btn') ? '' : (on ? 'Đã yêu thích' : 'Yêu thích');
            if (!btn.querySelector('svg')) {
                btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#heart"/></svg>' + (label ? '<span class="wish-label">' + label + '</span>' : '');
            } else {
                const lab = btn.querySelector('.wish-label');
                if (lab && lab.textContent !== label) lab.textContent = label;
            }
            if (btn.classList.contains('wish-btn')) {
                const t = on ? 'Bỏ yêu thích' : 'Thêm vào yêu thích';
                if (btn.title !== t) btn.title = t;
            }
        });
    }

    // Hàm toàn cục cho onclick trong HTML.
    window.toggleWish = function (id, btn, ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (btn && id === '__current__') id = resolveId(btn);
        if (!id) return;
        if (!wishUser) {
            ShopCore.toast('Vui lòng đăng nhập để dùng sản phẩm yêu thích');
            return;
        }
        ShopCore.toggleWishlist(wishUser.username, id).then(now => {
            ShopCore.toast(now ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích');
        }).catch(err => console.error(err));
    };

    // Lưới sản phẩm & trang chi tiết render bất đồng bộ -> quan sát DOM để gắn trạng thái cho nút mới.
    let timer = null;
    new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(syncButtons, 30);
    }).observe(document.documentElement, { childList: true, subtree: true });

    AuthService.ready.then(function (user) {
        if (!user || user.role === 'admin') { syncButtons(); return; }
        wishUser = user;
        ShopCore.watchWishlist(user.username, function (ids) {
            wishSet = new Set(ids);
            syncButtons();
        });
    });
})();
