// auth-service.js
// ============================================================================
// CẦU NỐI giữa Firebase Authentication (đăng nhập THẬT) và phần còn lại của
// project (vốn được viết dựa trên localStorage['currentUser']).
//
// Phải nạp SAU firebase-config.js (cần biến `auth`, `db`, `ADMIN_EMAIL`) và
// TRƯỚC mọi file khác có đọc currentUser (shop-core.js, auth-header.js,
// admin-guard.js, profile.js, cart.js, orders.js...).
//
// CƠ CHẾ:
//  - firebase.auth().onAuthStateChanged() tự động được Firebase gọi mỗi khi
//    trạng thái đăng nhập thay đổi: (1) ngay khi trang vừa tải xong (Firebase
//    tự khôi phục phiên đăng nhập cũ từ IndexedDB nếu có), (2) sau khi đăng
//    nhập/đăng ký/đăng xuất thành công, (3) nếu phiên bị thu hồi.
//  - Mỗi lần có thay đổi, ta tính lại hồ sơ người dùng (buildProfile) rồi ghi
//    đè vào localStorage['currentUser'] - GIỮ NGUYÊN định dạng cũ mà toàn bộ
//    code có sẵn (ShopCore.getCurrentUser, auth-header.js...) đang mong đợi,
//    nên KHÔNG cần viết lại các file đó thành bất đồng bộ (async).
//  - `AuthService.ready` là 1 Promise chỉ hoàn tất (resolve) SAU LẦN kiểm tra
//    ĐẦU TIÊN. Các đoạn code cần biết CHẮC CHẮN "đã đăng nhập hay chưa" ngay
//    lúc trang vừa mở (admin-guard.js, profile.js, cart.js, orders.js) nên
//    dùng `AuthService.ready.then(user => ...)` thay vì đọc thẳng localStorage,
//    để tránh đọc nhầm lúc Firebase CHƯA KỊP xác nhận xong phiên đăng nhập.
// ============================================================================

(function () {
    // Lấy hồ sơ (username, name, role) tương ứng với 1 tài khoản Firebase Auth vừa đăng nhập.
    function buildProfile(user) {
        // Admin: nhận diện theo email cố định, không cần đọc Firestore.
        if (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            return Promise.resolve({
                uid: user.uid,
                username: 'admin',
                email: user.email,
                name: 'Administrator',
                role: 'admin'
            });
        }

        // User thường: đọc hồ sơ trong collection Firestore "users" (được signup.js tạo
        // lúc đăng ký). Nếu vì lý do gì đó chưa có doc (vd tài khoản tạo tay trên Console),
        // vẫn dựng tạm 1 hồ sơ hợp lệ từ chính thông tin của Firebase Auth để không bị lỗi.
        return db.collection('users').doc(user.uid).get().then(function (doc) {
            const data = doc.exists ? doc.data() : {};
            const fallbackName = user.email ? user.email.split('@')[0] : user.uid;
            return {
                uid: user.uid,
                username: data.username || user.displayName || fallbackName,
                email: user.email || data.email || '',
                name: data.username || user.displayName || fallbackName,
                role: 'user'
            };
        }).catch(function (err) {
            console.error('[auth-service] Không đọc được hồ sơ user:', err);
            const fallbackName = user.email ? user.email.split('@')[0] : user.uid;
            return { uid: user.uid, username: fallbackName, email: user.email || '', name: fallbackName, role: 'user' };
        });
    }

    var resolveReady;
    var firstCheckDone = false;

    window.AuthService = {
        ADMIN_EMAIL: ADMIN_EMAIL,
        // Promise<currentUser|null> - hoàn tất DUY NHẤT 1 LẦN, ngay sau lần kiểm tra đăng
        // nhập đầu tiên lúc trang vừa tải (dùng để biết "đã đăng nhập sẵn hay chưa" khi mới
        // vào trang - admin-guard.js, profile.js, cart.js, orders.js...).
        ready: new Promise(function (resolve) { resolveReady = resolve; }),

        // refresh(): tính lại NGAY LẬP TỨC hồ sơ của auth.currentUser (nếu có) và ghi vào
        // localStorage. Dùng ngay sau khi vừa signInWithEmailAndPassword()/signInWithPopup()
        // thành công, vì lúc đó Promise `ready` ở trên đã resolve từ trước (lúc trang mới mở,
        // khi CHƯA đăng nhập) nên không thể dùng lại để biết trạng thái MỚI NHẤT.
        refresh: function () {
            const user = auth.currentUser;
            if (!user) {
                localStorage.removeItem('currentUser');
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                return Promise.resolve(null);
            }
            return buildProfile(user).then(function (profile) {
                localStorage.setItem('currentUser', JSON.stringify(profile));
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                return profile;
            });
        }
    };

    auth.onAuthStateChanged(function (user) {
        if (!user) {
            localStorage.removeItem('currentUser');
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            if (!firstCheckDone) { firstCheckDone = true; resolveReady(null); }
            return;
        }

        buildProfile(user).then(function (profile) {
            localStorage.setItem('currentUser', JSON.stringify(profile));
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            if (!firstCheckDone) { firstCheckDone = true; resolveReady(profile); }
        });
    });
})();
