// auth-header.js
// Dùng chung cho tất cả các trang: tự động đổi khu vực "Đăng nhập / Đăng ký"
// thành icon + tên người dùng đã đăng nhập (lấy real-time từ localStorage).
// Bấm vào tên sẽ xổ ra dropdown nhỏ: Hồ sơ / Đăng xuất.
// Chỉ cần thêm 1 dòng <script src="json/auth-header.js"></script> vào mỗi trang.
// Hàm updateAuthUI() được để global vì cart.html/cart.js đã có sẵn hook gọi tới nó.

// CƠ CHẾ: IIFE (hàm tự chạy ngay) để KHÔNG làm ô nhiễm biến toàn cục (global scope) -
// mọi biến/hàm bên trong chỉ tồn tại cục bộ trong file này, trừ updateAuthUI được cố tình
// gán ra window ở cuối file để cart.js có thể gọi lại khi cần.
(function () {
    // Style cho dropdown - chỉ chèn 1 lần dù updateAuthUI() chạy nhiều lần
    // Chèn 1 thẻ <style> chứa CSS cho dropdown vào <head>, chỉ chèn ĐÚNG 1 LẦN (kiểm tra bằng id)
    // dù hàm updateAuthUI() có thể được gọi lại nhiều lần trong lúc dùng trang.
    function injectAuthDropdownStyle() {
        if (document.getElementById('auth-dropdown-style')) return;
        const style = document.createElement('style');
        style.id = 'auth-dropdown-style';
        style.textContent = `
            .auth-user-wrap { position: relative; display: inline-block; }
            .auth-user-btn {
                background: none; border: none; cursor: pointer;
                color: #aaa; font-size: 14px; display: inline-flex;
                align-items: center; gap: 6px; padding: 0;
                font-family: inherit;
            }
            .auth-user-btn:hover { color: #fff; }
            .auth-dropdown-menu {
                display: none; position: absolute; top: 100%; right: 0;
                margin-top: 8px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.15);
                border-radius: 8px; min-width: 160px; box-shadow: 0 8px 20px rgba(0,0,0,0.5);
                z-index: 1000; overflow: hidden;
            }
            .auth-dropdown-menu.show { display: block; }
            .auth-dropdown-menu a {
                display: block; padding: 10px 16px; color: #ddd; text-decoration: none;
                font-size: 14px; text-align: left;
            }
            .auth-dropdown-menu a:hover { background: rgba(220,38,38,0.2); color: #fff; }
            .auth-dropdown-menu .divider { height: 1px; background: rgba(255,255,255,0.1); }
        `;
        document.head.appendChild(style);
    }

    /**
     * Hàm quan trọng nhất file: tự động thay khu vực 'Đăng nhập / Đăng ký' trên header
     * bằng tên người dùng + menu thả xuống, NẾU người dùng đã đăng nhập.
     * CƠ CHẾ:
     *  - Đọc currentUser từ localStorage để biết ai đang đăng nhập (real-time, mọi trang đọc chung 1 nguồn).
     *  - Tìm đúng vùng HTML chứa link 'Đăng nhập' trên trang hiện tại (hỗ trợ 2 kiểu cấu trúc HTML
     *    khác nhau đang tồn tại giữa các trang, xem comment bên trong).
     *  - Nếu đã đăng nhập: ghi đè innerHTML của vùng đó bằng nút tên người dùng + dropdown,
     *    rồi gắn thêm sự kiện click để mở dropdown và xử lý đăng xuất.
     *  - Hàm này được gọi lại ở CUỐI file (DOMContentLoaded) và có thể được gọi lại thủ công
     *    từ file khác (vd sau khi đăng nhập/đăng xuất) để cập nhật giao diện ngay lập tức.
     */
    function updateAuthUI() {
        injectAuthDropdownStyle();

        const currentUser = JSON.parse(localStorage.getItem('currentUser'));

        // Tìm khu vực auth trên header. Hỗ trợ cả 2 kiểu cấu trúc đang có trong project:
        // 1) <li class="auth"> chứa 2 link Đăng nhập/Đăng ký
        // 2) <a href="signin.html">Đăng nhập</a> nằm rời trong top-bar
        let authContainer = document.querySelector('.top-bar .auth');

        if (!authContainer) {
            const loginLink = Array.from(document.querySelectorAll('.top-bar a'))
                .find(a => a.textContent.trim() === 'Đăng nhập');
            if (loginLink) authContainer = loginLink.parentElement;
        }

        if (!authContainer) return; // Trang không có khu vực đăng nhập (ví dụ checkout.html)

        if (!currentUser) return; // Chưa đăng nhập: giữ nguyên "Đăng nhập / Đăng ký" có sẵn trong HTML

        const displayName = currentUser.name || currentUser.username || currentUser.email;

        authContainer.innerHTML = `
            <div class="auth-user-wrap">
                <button type="button" class="auth-user-btn" id="authUserBtn">
                    ${displayName}
                </button>
                <div class="auth-dropdown-menu" id="authDropdownMenu">
                    <a href="profile.html" id="authProfileLink">Hồ sơ</a>
                    <div class="divider"></div>
                    <a href="#" id="authLogoutBtn">Đăng xuất</a>
                </div>
            </div>
        `;

        const userBtn = document.getElementById('authUserBtn');
        const dropdown = document.getElementById('authDropdownMenu');

        userBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Bấm ra ngoài thì đóng dropdown
        document.addEventListener('click', function () {
            dropdown.classList.remove('show');
        });

        // Admin bấm "Hồ sơ" thì vào admin.html thay vì profile.html
        if (currentUser.role === 'admin') {
            document.getElementById('authProfileLink').setAttribute('href', '../admin/dashboard.html');
        }

        document.getElementById('authLogoutBtn').addEventListener('click', function (e) {
            e.preventDefault();
            // QUAN TRỌNG: phải gọi auth.signOut() để kết thúc phiên đăng nhập THẬT trên
            // Firebase. Trước đây chỉ xoá localStorage['currentUser'] mà KHÔNG đăng xuất
            // Firebase, nên phiên đăng nhập vẫn còn tồn tại phía Firebase -> lần tải trang
            // kế tiếp, auth-service.js (onAuthStateChanged) phát hiện vẫn đang đăng nhập và
            // tự ghi lại currentUser vào localStorage, gây ra hiện tượng "tự đăng nhập lại".
            auth.signOut().then(function () {
                localStorage.removeItem('cart_guest');
                window.location.href = 'index.html';
            });
        });
    }

    // Chạy updateAuthUI() ngay khi toàn bộ HTML của trang đã được trình duyệt dựng xong (DOM ready).
    document.addEventListener('DOMContentLoaded', updateAuthUI);
    window.updateAuthUI = updateAuthUI; // giữ global cho cart.html/cart.js gọi qua hook có sẵn
})();