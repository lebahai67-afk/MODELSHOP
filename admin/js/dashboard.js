// dashboard.js - trang tổng quan admin

/**
 * Vẽ bảng danh sách tài khoản đã đăng ký ra trang dashboard.
 * CƠ CHẾ: đọc collection Firestore "users" (do signup.js tạo lúc có người đăng ký bằng
 * email/mật khẩu hoặc Google - đây là nguồn 'sự thật' DUY NHẤT bây giờ, thay cho mảng
 * "users" trong localStorage trước đây), sắp xếp theo ngày tạo mới nhất lên trước, rồi
 * dùng .map() biến MỖI document thành 1 chuỗi HTML <tr>...</tr>, nối lại bằng join('')
 * và gán thẳng vào tbody.innerHTML.
 * Lưu ý: tài khoản admin cố định KHÔNG nằm trong Firestore (được nhận diện riêng bằng
 * email cố định ADMIN_EMAIL) nên sẽ không xuất hiện trong bảng này, giống hành vi cũ.
 */
function renderUsers() {
    db.collection('users').orderBy('createdAt', 'desc').get()
        .then(function (snapshot) {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            document.getElementById('totalUsers').textContent = users.length;

            const tbody = document.getElementById('userTableBody');

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có tài khoản nào đăng ký</td></tr>';
                return;
            }

            tbody.innerHTML = users.map((u, i) => {
                const date = u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toLocaleString('vi-VN') : '-';
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${u.username || '-'}</td>
                    <td>${u.email || '-'}</td>
                    <td>${date}</td>
                    <td><button class="btn btn-del" onclick="deleteUser('${u.id}')">Xoá</button></td>
                </tr>`;
            }).join('');
        })
        .catch(function (err) {
            console.error('[dashboard] Lỗi tải danh sách user:', err);
        });
}

// Xoá 1 tài khoản: đây CHỈ xoá hồ sơ (document) trong Firestore collection "users",
// KHÔNG xoá được chính tài khoản đăng nhập trong Firebase Authentication (việc đó cần
// Admin SDK chạy phía server/Cloud Functions, không thể làm trực tiếp từ trình duyệt vì
// lý do bảo mật). Nghĩa là sau khi "Xoá" ở đây, người dùng đó vẫn đăng nhập được, nhưng
// hồ sơ (username, vai trò...) sẽ không còn -> nên coi đây là ẩn khỏi danh sách quản lý.
function deleteUser(userId) {
    if (!confirm('Xoá hồ sơ tài khoản này? (Lưu ý: chỉ xoá hồ sơ hiển thị, không xoá được tài khoản đăng nhập Firebase từ trình duyệt)')) return;
    db.collection('users').doc(userId).delete()
        .then(renderUsers)
        .catch(function (err) {
            console.error('[dashboard] Lỗi xoá user:', err);
            alert('Có lỗi xảy ra, vui lòng thử lại!');
        });
}

// Đếm tổng số sản phẩm + số sản phẩm hết hàng, hiển thị lên 2 ô số liệu trên dashboard.
// ShopCore.loadProducts() trả về 1 Promise (vì có thể phải fetch từ file JSON),
// nên phải dùng .then() để lấy dữ liệu SAU KHI tải xong, không thể lấy ngay lập tức.
// Dùng ShopCore.isOutOfStock() (dựa trên số lượng tồn kho thật "stock") thay vì field
// "inStock" cũ, để khớp với trang Kho hàng và trang mua sắm.
function renderProductStats() {
    ShopCore.loadProducts().then(products => {
        document.getElementById('totalProducts').textContent = products.length;
        document.getElementById('outOfStockCount').textContent =
            products.filter(p => ShopCore.isOutOfStock(p)).length;
    });
}

// Đếm tổng số đơn hàng hiện có. ShopCore.getAllOrders() giờ đọc từ Firestore nên trả về 1 Promise,
// phải dùng .then() để lấy dữ liệu sau khi tải xong (khác với trước đây đọc thẳng từ localStorage).
function renderOrderStats() {
    ShopCore.getAllOrders().then(orders => {
        document.getElementById('totalOrders').textContent = orders.length;
    });
}

// ---------- Biểu đồ doanh thu nhanh (7 ngày gần nhất) ----------
// Chỉ tính các đơn KHÔNG bị hủy vào doanh thu (giống logic ở trang Thống kê đầy đủ).
// Dùng Chart.js (nạp qua CDN trong dashboard.html) để vẽ 1 line chart nhỏ, gọn.
let miniRevenueChart = null;
function renderMiniRevenueChart(orders) {
    const canvas = document.getElementById('miniRevenueChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const days = [];
    const totals = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days.push(d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
        const dayTotal = orders
            .filter(o => o.status !== 'Đã hủy' && o.createdAt && String(o.createdAt).slice(0, 10) === key)
            .reduce((s, o) => s + (o.total || 0), 0);
        totals.push(dayTotal);
    }

    if (miniRevenueChart) {
        miniRevenueChart.data.labels = days;
        miniRevenueChart.data.datasets[0].data = totals;
        miniRevenueChart.update();
        return;
    }

    miniRevenueChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Doanh thu',
                data: totals,
                borderColor: '#ff5555',
                backgroundColor: 'rgba(220,38,38,0.18)',
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#ff5555'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#bbb' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                y: {
                    ticks: {
                        color: '#bbb',
                        callback: v => (v >= 1000000 ? (v / 1000000) + 'tr' : v)
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        }
    });
}

// Đăng xuất admin: kết thúc phiên đăng nhập THẬT trên Firebase rồi đưa về trang đăng nhập.
document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

renderProductStats();
renderOrderStats();

// Real-time: users, products và orders giờ đều nằm trên Firestore, nên dùng luôn cơ chế
// real-time (onSnapshot) để bảng/số liệu tự cập nhật ngay khi có thay đổi, kể cả từ
// máy/tab/người dùng khác, mà không cần bấm F5. onSnapshot() tự gọi renderUsers() ngay
// lần đầu (không cần gọi renderUsers() riêng ở đây nữa).
db.collection('users').onSnapshot(renderUsers);
ShopCore.onProductsChanged(renderProductStats);
ShopCore.watchAllOrders(function (orders) {
    document.getElementById('totalOrders').textContent = orders.length;
    renderMiniRevenueChart(orders);
});
