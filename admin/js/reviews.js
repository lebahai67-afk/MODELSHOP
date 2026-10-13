// admin/js/reviews.js - Quản lý đánh giá sản phẩm: xem toàn bộ (kể cả đã ẩn), ẩn/hiện lại,
// hoặc xoá vĩnh viễn. Toàn bộ đọc/ghi đi qua ShopCore.watchAllReviews/setReviewHidden/deleteReview
// (users/js/shop-core.js), collection Firestore "reviews".

let allReviews = [];
let productNameCache = {}; // productId -> tên sản phẩm, tra 1 lần rồi dùng lại
let currentFilter = 'all';

function timeVN(iso) {
    try { return new Date(iso).toLocaleString('vi-VN'); } catch (e) { return '-'; }
}

function applyFilters() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    let list = allReviews;

    if (currentFilter === 'visible') list = list.filter(r => !r.hidden);
    else if (currentFilter === 'hidden') list = list.filter(r => r.hidden);

    if (q) {
        list = list.filter(r =>
            (productNameCache[r.productId] || r.productId || '').toLowerCase().includes(q) ||
            (r.username || '').toLowerCase().includes(q) ||
            (r.comment || '').toLowerCase().includes(q)
        );
    }
    renderTable(list);
}

function renderTable(list) {
    const tbody = document.getElementById('reviewTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Không có đánh giá nào</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(r => `
        <tr>
            <td>${productNameCache[r.productId] || r.productId}</td>
            <td>${r.username || 'Ẩn danh'}</td>
            <td>${ShopCore.renderStars(r.rating)}</td>
            <td style="max-width:280px; white-space:normal;">${(r.comment || '').replace(/</g, '&lt;')}</td>
            <td>${timeVN(r.createdAt)}</td>
            <td><span class="badge ${r.hidden ? 'badge-cancelled' : 'badge-done'}">${r.hidden ? 'Đã ẩn' : 'Đang hiển thị'}</span></td>
            <td class="row-actions">
                <button type="button" class="btn btn-edit" onclick="toggleHidden('${r.id}', ${!r.hidden})">
                    ${r.hidden ? 'Hiện lại' : 'Ẩn'}
                </button>
                <button type="button" class="btn btn-del" onclick="doDeleteReview('${r.id}')">Xoá</button>
            </td>
        </tr>
    `).join('');
}

function toggleHidden(reviewId, hidden) {
    ShopCore.setReviewHidden(reviewId, hidden).then(() => {
        ShopCore.toast(hidden ? 'Đã ẩn đánh giá' : 'Đã hiện lại đánh giá');
    });
}

function doDeleteReview(reviewId) {
    if (!confirm('Xoá vĩnh viễn đánh giá này? Không thể hoàn tác.')) return;
    ShopCore.deleteReview(reviewId).then(() => {
        ShopCore.toast('Đã xoá đánh giá');
    });
}

// Đảm bảo có sẵn tên sản phẩm để hiển thị/tìm kiếm (không đợi từng review 1 - tải cả danh sách 1 lần).
function ensureProductNames() {
    return ShopCore.loadProducts().then(products => {
        products.forEach(p => { productNameCache[p.id] = p.name; });
    });
}

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

document.getElementById('searchBox').addEventListener('input', applyFilters);

document.getElementById('reviewTabs').addEventListener('click', function (e) {
    const btn = e.target.closest('.order-tab');
    if (!btn) return;
    document.querySelectorAll('#reviewTabs .order-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    applyFilters();
});

ensureProductNames().then(() => {
    ShopCore.watchAllReviews(function (list) {
        allReviews = list;
        applyFilters();
    });
});
