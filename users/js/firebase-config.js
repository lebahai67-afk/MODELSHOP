// firebase-config.js
// ============================================================================
// KHỞI TẠO FIREBASE - dùng chung cho MỌI trang (users/ và admin/).
// Phải được include (bằng thẻ <script>) SAU 3 file SDK của Firebase
// (firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js)
// và TRƯỚC auth-service.js / shop-core.js, vì 2 file đó dùng biến toàn cục
// `auth` và `db` khai báo ở cuối file này.
//
// Dùng bản "compat" (không phải bản module hoá firebase v9+) vì toàn bộ site
// đang viết bằng JS thuần + thẻ <script src="..."> thông thường (không có
// build tool / bundler / type="module"), nên bản compat cho phép gọi thẳng
// qua biến toàn cục `firebase` giống hệt firebase v8, không cần import/export.
// ============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyBrBjjgCwmWtUD-RETMFMZOk8IPZhHIH64",
    authDomain: "modelshop-f7b6d.firebaseapp.com",
    projectId: "modelshop-f7b6d",
    storageBucket: "modelshop-f7b6d.firebasestorage.app",
    messagingSenderId: "477495036641",
    appId: "1:477495036641:web:978298971d893318fd45a0",
    measurementId: "G-27JNJ2VPEY"
};

firebase.initializeApp(firebaseConfig);

// `db` là biến TOÀN CỤC (global) - shop-core.js sẽ dùng trực tiếp db.collection(...)
// để đọc/ghi Firestore, giống hệt cách nó từng dùng localStorage.getItem/setItem trước đây.
const db = firebase.firestore();

// `auth` là biến TOÀN CỤC dùng cho ĐĂNG KÝ/ĐĂNG NHẬP thật qua Firebase Authentication
// (signin.js, signup.js, profile.js, auth-service.js đều dùng chung biến này).
const auth = firebase.auth();

// Email tài khoản ADMIN cố định của chủ shop. Firebase Authentication không có sẵn khái
// niệm "role/phân quyền" ở phía client, nên ta tự quy ước: đăng nhập bằng ĐÚNG email này
// (mật khẩu tạo thủ công trong Firebase Console) sẽ luôn được coi là admin.
// signup.js chặn không cho ai dùng email này để tự đăng ký tài khoản mới.
const ADMIN_EMAIL = "admin@modelshop.com";
