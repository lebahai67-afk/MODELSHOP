// profile.js
// Cần nạp SAU firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js,
// firebase-config.js, auth-service.js.

// Bảo vệ trang: chưa đăng nhập thì đẩy về signin.html.
// Dùng AuthService.ready (thay vì đọc thẳng localStorage) để CHẮC CHẮN Firebase đã kiểm tra
// xong phiên đăng nhập thật trước khi quyết định đá người dùng ra hay không - tránh trường hợp
// vừa F5 trang, Firebase chưa kịp khôi phục phiên, đã tưởng nhầm là "chưa đăng nhập".
AuthService.ready.then(function (currentUser) {
    if (!currentUser) {
        window.location.href = 'signin.html';
        return;
    }

    document.getElementById('profileUsername').textContent = currentUser.username || currentUser.name || '-';
    document.getElementById('profileEmail').textContent = currentUser.email || '-';
    document.getElementById('profileRole').textContent = currentUser.role === 'admin' ? 'Quản trị viên' : 'Khách hàng';

    // Điểm thưởng: chỉ hiện cho tài khoản khách hàng (admin không tích điểm).
    if (currentUser.role !== 'admin') {
        Promise.all([ShopCore.getUserPoints(currentUser.username), ShopCore.getLoyaltyConfig()]).then(([points, cfg]) => {
            document.getElementById('profilePointsRow').style.display = 'flex';
            document.getElementById('profilePoints').textContent = points;
            const hint = document.getElementById('profilePointsHint');
            hint.style.display = 'block';
            hint.textContent = `Cứ chi tiêu ${cfg.earnPerAmount.toLocaleString('vi-VN')}đ được +1 điểm. `
                + `1 điểm giảm ${cfg.redeemValue.toLocaleString('vi-VN')}đ khi thanh toán.`;
        });
    }
});

// Đăng xuất: gọi auth.signOut() để kết thúc phiên đăng nhập THẬT trên Firebase
// (auth-service.js sẽ tự xoá localStorage['currentUser'] khi onAuthStateChanged báo null).
document.getElementById('profileLogoutBtn').addEventListener('click', function (e) {
    e.preventDefault();
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = 'index.html';
    });
});
