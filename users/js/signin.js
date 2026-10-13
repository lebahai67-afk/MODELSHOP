// signin.js
// Cần nạp SAU firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js,
// firebase-config.js (dùng biến toàn cục `auth`, `db`, `ADMIN_EMAIL`).

// Đổi ô mật khẩu giữa 2 kiểu hiển thị: 'password' (hiện dấu chấm ẩn) và 'text' (hiện chữ thật),
// dựa theo checkbox 'Hiện mật khẩu' có đang được tick hay không.
function togglePassword() {
    const pass = document.getElementById('password');
    const checkbox = document.getElementById('showPass');
    pass.type = checkbox.checked ? 'text' : 'password';
}

const messageDiv = document.getElementById('message');
const loginForm = document.getElementById('loginForm');
const submitBtn = loginForm.querySelector('button[type="submit"]');

function showError(msg) {
    messageDiv.textContent = '' + msg;
    messageDiv.className = 'message error';
    messageDiv.style.display = 'block';
    setTimeout(() => { messageDiv.style.display = 'none'; }, 3000);
}

function showSuccess(msg) {
    messageDiv.textContent = '' + msg;
    messageDiv.className = 'message success';
    messageDiv.style.display = 'block';
}

// Dịch mã lỗi của Firebase Authentication sang tiếng Việt dễ hiểu.
function translateAuthError(error) {
    switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Username/Email hoặc mật khẩu không đúng!';
        case 'auth/invalid-email': return 'Username/Email hoặc mật khẩu không đúng!';
        case 'auth/too-many-requests': return 'Bạn đã thử sai quá nhiều lần, vui lòng thử lại sau!';
        case 'auth/network-request-failed': return 'Lỗi kết nối mạng, vui lòng thử lại!';
        default: return 'Đăng nhập thất bại: ' + error.message;
    }
}

/**
 * Firebase Authentication chỉ đăng nhập bằng EMAIL, không hỗ trợ "username".
 * Nếu người dùng gõ email (có ký tự '@') -> dùng thẳng.
 * Nếu gõ username -> phải tra ngược ra email tương ứng:
 *   - 'admin' -> ADMIN_EMAIL (tài khoản cố định).
 *   - username khác -> tìm trong Firestore collection "users" (field usernameLower,
 *     được signup.js lưu lúc đăng ký) để lấy đúng email đã đăng ký.
 */
function resolveLoginEmail(usernameOrEmail) {
    if (usernameOrEmail.includes('@')) {
        return Promise.resolve(usernameOrEmail);
    }

    if (usernameOrEmail.toLowerCase() === 'admin') {
        return Promise.resolve(ADMIN_EMAIL);
    }

    return db.collection('users')
        .where('usernameLower', '==', usernameOrEmail.toLowerCase())
        .limit(1)
        .get()
        .then(function (snapshot) {
            if (snapshot.empty) {
                // Không tìm thấy username -> trả về nguyên input để Firebase báo lỗi
                // 'invalid-email' hoặc 'user-not-found', được dịch thành thông báo chung ở trên.
                return usernameOrEmail;
            }
            return snapshot.docs[0].data().email;
        });
}

/**
 * Xử lý khi bấm nút Đăng nhập (submit form).
 * CƠ CHẾ ĐĂNG NHẬP (đã nâng cấp dùng Firebase Authentication THẬT):
 *  1. Chặn hành vi mặc định của <form>.
 *  2. Validate định dạng cơ bản phía client (độ dài) như cũ.
 *  3. Quy đổi input (username hoặc email) về đúng EMAIL để gọi Firebase.
 *  4. Gọi auth.signInWithEmailAndPassword() - Firebase tự kiểm tra mật khẩu (đã mã hoá,
 *     không so sánh chuỗi thô như bản localStorage cũ).
 *  5. Đăng nhập thành công -> auth-service.js (đang lắng nghe onAuthStateChanged) sẽ TỰ ĐỘNG
 *     ghi currentUser vào localStorage; ở đây chỉ cần đợi 1 nhịp rồi điều hướng theo vai trò.
 */
loginForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const username = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (username.length < 6 || username.length > 50) {
        return showError('Tài khoản/Email không hợp lệ!');
    }

    if (password.length < 6 || password.length > 18) {
        return showError('Mật khẩu phải có từ 6 đến 18 ký tự!');
    }

    submitBtn.disabled = true;

    resolveLoginEmail(username)
        .then(function (email) {
            return auth.signInWithEmailAndPassword(email, password);
        })
        .then(function () {
            showSuccess('Đăng nhập thành công!');
            // Tính lại hồ sơ (role admin/user) NGAY LẬP TỨC rồi mới điều hướng, để tránh
            // trường hợp qua trang mới mà localStorage['currentUser'] chưa kịp ghi.
            return AuthService.refresh();
        })
        .then(function (currentUser) {
            setTimeout(() => {
                if (currentUser && currentUser.role === 'admin') {
                    window.location.href = '../admin/dashboard.html';
                } else {
                    window.location.href = 'index.html';
                }
            }, 1000);
        })
        .catch(function (error) {
            submitBtn.disabled = false;
            console.error('[signin] Lỗi đăng nhập:', error);
            showError(translateAuthError(error));
        });
});

// ---------------- Đăng nhập nhanh bằng Google (Firebase Authentication) ----------------
// Cần bật "Google" trong Firebase Console > Authentication > Sign-in method.
document.querySelector('.gg-btn').addEventListener('click', function () {
    const provider = new firebase.auth.GoogleAuthProvider();

    auth.signInWithPopup(provider)
        .then(function (result) {
            const user = result.user;
            // Lần đầu đăng nhập Google -> tự tạo hồ sơ Firestore (giống luồng đăng ký thường).
            return db.collection('users').doc(user.uid).get().then(function (doc) {
                if (doc.exists) return;
                const usernameFromGoogle = (user.displayName || user.email.split('@')[0]).slice(0, 18);
                return db.collection('users').doc(user.uid).set({
                    username: usernameFromGoogle,
                    usernameLower: usernameFromGoogle.toLowerCase(),
                    email: user.email,
                    role: 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        })
        .then(() => AuthService.refresh())
        .then(function () {
            showSuccess('Đăng nhập Google thành công!');
            setTimeout(() => { window.location.href = 'index.html'; }, 800);
        })
        .catch(function (error) {
            if (error.code === 'auth/popup-closed-by-user') return;
            console.error('[signin] Lỗi đăng nhập Google:', error);
            showError('Đăng nhập Google thất bại, vui lòng thử lại!');
        });
});
