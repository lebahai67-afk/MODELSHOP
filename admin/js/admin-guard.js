// admin-guard.js
// ============================================================================
// KIỂM TRA QUYỀN TRUY CẬP TRANG ADMIN.
//
// File này giờ được nạp ở CUỐI trang (sau firebase-config.js và auth-service.js),
// KHÔNG còn đặt trong <head> như trước, vì cần chờ Firebase xác nhận xong phiên đăng
// nhập THẬT (việc này là bất đồng bộ - không thể biết ngay lập tức như khi chỉ đọc
// localStorage đồng bộ).
//
// Để KHÔNG bị "chớp" (flash) nội dung trang admin ra màn hình trước khi kiểm tra xong,
// mỗi trang admin/*.html có sẵn 1 dòng CSS trong <head> ẩn nội dung admin và hiện 1
// overlay ở giữa màn hình (`#authOverlay`). File này có nhiệm vụ:
//   - Nếu đúng là admin đã đăng nhập -> ẩn overlay, hiện nội dung admin (body.auth-ok).
//   - Nếu CHƯA đăng nhập -> hiển thị thông báo "Bạn cần đăng nhập" + nút bấm.
//   - Nếu đã đăng nhập nhưng KHÔNG phải admin -> hiển thị "Tài khoản không có quyền".
// Trong 2 trường hợp cuối, sau 5 giây sẽ tự chuyển sang trang đăng nhập (người dùng
// cũng có thể bấm nút để đi ngay).
// ============================================================================

(function () {
    // Thời gian (ms) chờ trước khi tự động chuyển hướng sang trang đăng nhập khi
    // không đủ quyền. Đủ lâu để người dùng kịp đọc thông báo + bấm nút nếu muốn.
    var AUTO_REDIRECT_MS = 5000;

    // Cập nhật nội dung overlay với icon + thông báo + nút bấm (nếu cần).
    function showOverlayMessage(icon, message, showActions) {
        var overlay = document.getElementById('authOverlay');
        var msg = document.getElementById('authMsg');
        var actions = document.getElementById('authActions');
        var spinner = overlay && overlay.querySelector('.spinner');
        if (!overlay || !msg) return;

        msg.innerHTML = icon + ' ' + message;
        if (spinner) spinner.style.display = 'none';
        if (actions) actions.style.display = showActions ? 'flex' : 'none';
    }

    // Khi xác nhận xong là admin hợp lệ: thêm class .auth-ok để CSS ẩn overlay và
    // hiện lại nội dung admin (.admin-topbar, .admin-wrap).
    function showAdminContent() {
        document.body.classList.add('auth-ok');
    }

    // Hẹn giờ rồi chuyển sang trang đăng nhập.
    function scheduleRedirect() {
        setTimeout(function () {
            window.location.href = '../users/signin.html';
        }, AUTO_REDIRECT_MS);
    }

    // Đợi AuthService.ready (Promise do auth-service.js tạo, chỉ resolve 1 lần duy
    // nhất sau lần kiểm tra đăng nhập đầu tiên của Firebase). Nếu vì lý do gì đó
    // AuthService chưa tồn tại (lỗi load file) thì vẫn hiện thông báo lỗi thay vì
    // treo trang trắng.
    if (typeof AuthService === 'undefined' || !AuthService.ready) {
        showOverlayMessage(
            '<svg class="icon icon-lg" aria-hidden="true"><use href="../users/images/icons/lucide.svg#triangle-alert"/></svg>',
            'Không tải được dịch vụ xác thực. Vui lòng tải lại trang hoặc kiểm tra kết nối mạng.',
            true
        );
        scheduleRedirect();
        return;
    }

    AuthService.ready.then(function (currentUser) {
        // Trường hợp 1: chưa đăng nhập
        if (!currentUser) {
            showOverlayMessage(
                '<svg class="icon icon-lg" aria-hidden="true"><use href="../users/images/icons/lucide.svg#lock"/></svg>',
                'Bạn cần <strong>đăng nhập bằng tài khoản admin</strong> để truy cập trang quản trị.',
                true
            );
            scheduleRedirect();
            return;
        }

        // Trường hợp 2: đã đăng nhập nhưng không phải admin
        if (currentUser.role !== 'admin') {
            var label = currentUser.username || currentUser.email || 'hiện tại';
            showOverlayMessage(
                '<svg class="icon icon-lg" aria-hidden="true"><use href="../users/images/icons/lucide.svg#shield-x"/></svg>',
                'Tài khoản <strong>"' + label + '"</strong> không có quyền truy cập trang quản trị. ' +
                'Chỉ tài khoản admin mới được phép vào khu vực này.',
                true
            );
            scheduleRedirect();
            return;
        }

        // Trường hợp 3: hợp lệ -> hiện nội dung admin
        showAdminContent();
    });
})();
