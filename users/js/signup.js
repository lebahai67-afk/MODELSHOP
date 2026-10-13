// signup.js
// Cần nạp SAU firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js,
// firebase-config.js (dùng biến toàn cục `auth`, `db`, `ADMIN_EMAIL`).

// Hiện/ẩn ô mật khẩu chính khi tick checkbox tương ứng.
document.getElementById('showPass1').addEventListener('change', function () {
    document.getElementById('password').type = this.checked ? 'text' : 'password';
});

// Hiện/ẩn ô xác nhận mật khẩu khi tick checkbox tương ứng.
document.getElementById('showPass2').addEventListener('change', function () {
    document.getElementById('confirmPassword').type = this.checked ? 'text' : 'password';
});

const messageDiv = document.getElementById('message');
const submitBtn = document.querySelector('#signupForm button[type="submit"]');

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

// Dịch mã lỗi của Firebase Authentication (dạng "auth/...") sang tiếng Việt dễ hiểu,
// vì Firebase không trả sẵn message tiếng Việt.
function translateAuthError(error) {
    switch (error.code) {
        case 'auth/email-already-in-use': return 'Email này đã được đăng ký!';
        case 'auth/invalid-email': return 'Email không đúng định dạng!';
        case 'auth/weak-password': return 'Mật khẩu quá yếu (Firebase yêu cầu tối thiểu 6 ký tự)!';
        case 'auth/network-request-failed': return 'Lỗi kết nối mạng, vui lòng thử lại!';
        default: return 'Đăng ký thất bại: ' + error.message;
    }
}

/**
 * Tạo hồ sơ (profile) của user mới trong collection Firestore "users", doc ID = uid
 * do Firebase Authentication cấp. Hồ sơ này là nơi lưu username (Firebase Auth chỉ có
 * email, không có sẵn khái niệm "username"), dùng cho hiển thị + cho phép đăng nhập
 * bằng username thay vì email (xem signin.js).
 */
function createUserProfile(uid, username, email) {
    return db.collection('users').doc(uid).set({
        username: username,
        usernameLower: username.toLowerCase(),
        email: email,
        role: 'user',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Xử lý khi bấm nút Đăng ký (submit form).
 * CƠ CHẾ ĐĂNG KÝ (đã nâng cấp dùng Firebase Authentication THẬT):
 *  1. Chặn form reload trang.
 *  2. Validate phía client như cũ (độ dài username, định dạng email, độ dài mật khẩu,
 *     mật khẩu xác nhận khớp) - sai điều kiện nào thì dừng ngay tại đó.
 *  3. Kiểm tra trùng username trong Firestore (Firebase Auth chỉ tự kiểm tra trùng EMAIL,
 *     không biết gì về "username" cả, nên phần này ta phải tự làm).
 *  4. Gọi auth.createUserWithEmailAndPassword() để Firebase tạo tài khoản thật (mật khẩu
 *     được Firebase mã hoá & lưu trữ an toàn phía server, KHÔNG còn lưu dạng chữ thường
 *     (plain text) trong localStorage như trước).
 *  5. Tạo thêm 1 document hồ sơ trong Firestore (users/{uid}) để lưu username.
 *  6. Đăng xuất ngay sau khi tạo xong (Firebase tự đăng nhập luôn sau khi tạo tài khoản -
 *     ta không muốn vậy, muốn người dùng chủ động bấm Đăng nhập lại như hành vi cũ).
 *  7. Báo thành công rồi chuyển sang trang đăng nhập.
 */
document.getElementById('signupForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (name.length < 6 || name.length > 18) {
        return showError('Username phải có từ 6 đến 18 ký tự!');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showError('Email không đúng định dạng!');
    }

    if (password.length < 6 || password.length > 18) {
        return showError('Mật khẩu phải có từ 6 đến 18 ký tự!');
    }

    if (password !== confirmPassword) {
        return showError('Mật khẩu xác nhận không khớp!');
    }

    // Username/Email admin (cố định) không cho ai đăng ký trùng
    if (name.toLowerCase() === 'admin' || email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return showError('Tài khoản hoặc email này không thể sử dụng để đăng ký!');
    }

    submitBtn.disabled = true;

    // Kiểm tra trùng username trên Firestore TRƯỚC khi tạo tài khoản Firebase Auth
    // (usernameLower để so sánh không phân biệt hoa/thường, giống hành vi cũ).
    db.collection('users').where('usernameLower', '==', name.toLowerCase()).limit(1).get()
        .then(function (snapshot) {
            if (!snapshot.empty) {
                throw { handled: true, message: 'Tài khoản này đã được sử dụng!' };
            }
            // Firebase Authentication sẽ tự báo lỗi 'auth/email-already-in-use' nếu email trùng.
            return auth.createUserWithEmailAndPassword(email, password);
        })
        .then(function (credential) {
            return credential.user.updateProfile({ displayName: name })
                .then(() => createUserProfile(credential.user.uid, name, email))
                .then(() => auth.signOut());
        })
        .then(function () {
            showSuccess('Đăng ký thành công! Chuyển đến đăng nhập...');
            setTimeout(() => { window.location.href = 'signin.html'; }, 2000);
        })
        .catch(function (error) {
            submitBtn.disabled = false;
            if (error && error.handled) {
                showError(error.message);
            } else {
                console.error('[signup] Lỗi đăng ký:', error);
                showError(translateAuthError(error));
            }
        });
});

// ---------------- Đăng ký nhanh bằng Google (Firebase Authentication) ----------------
// Cần bật "Google" trong Firebase Console > Authentication > Sign-in method.
document.querySelector('.gg-btn').addEventListener('click', function () {
    const provider = new firebase.auth.GoogleAuthProvider();

    auth.signInWithPopup(provider)
        .then(function (result) {
            const user = result.user;
            // Nếu đây là lần đầu người này đăng nhập (tài khoản Google vừa được Firebase
            // tạo tự động) thì tạo thêm hồ sơ Firestore, giống hệt luồng đăng ký bằng email.
            return db.collection('users').doc(user.uid).get().then(function (doc) {
                if (doc.exists) return;
                const usernameFromGoogle = (user.displayName || user.email.split('@')[0]).slice(0, 18);
                return createUserProfile(user.uid, usernameFromGoogle, user.email);
            });
        })
        .then(function () {
            showSuccess('Đăng ký/Đăng nhập Google thành công! Đang chuyển trang...');
            setTimeout(() => { window.location.href = 'index.html'; }, 1200);
        })
        .catch(function (error) {
            if (error.code === 'auth/popup-closed-by-user') return;
            console.error('[signup] Lỗi đăng nhập Google:', error);
            showError('Đăng nhập Google thất bại, vui lòng thử lại!');
        });
});
