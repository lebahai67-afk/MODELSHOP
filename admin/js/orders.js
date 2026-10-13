// admin/js/orders.js - Quản lý đơn hàng thủ công (không có định vị/shipper thật nên admin tự
// cập nhật trạng thái). Luồng trạng thái đầy đủ nằm trong shop-core.js (adminShipOrder/adminApproveReturn).

let allOrders = [];
let currentStatusFilter = 'all';
let currentOrderId = null; // đơn đang mở trong modal chi tiết

const modal = document.getElementById('orderModal');

const PAYMENT_LABELS = {
    cod: 'Thanh toán khi nhận hàng (COD)',
    bank: 'Chuyển khoản ngân hàng',
    momo: 'Ví MoMo',
    zalopay: 'ZaloPay'
};
function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }

function statusClass(status) {
    switch (status) {
        case 'Chờ xác nhận': return 'badge-pending';
        case 'Đang giao': return 'badge-shipping';
        case 'Hoàn thành': return 'badge-done';
        case 'Yêu cầu trả hàng': return 'badge-returning';
        case 'Đã trả hàng': return 'badge-returned';
        case 'Đã hủy': return 'badge-cancelled';
        default: return 'badge-pending';
    }
}

// Áp bộ lọc hiện tại lên danh sách đơn mới nhất (allOrders) rồi vẽ lại bảng.
// allOrders giờ được nạp REAL-TIME bởi ShopCore.watchAllOrders() ở cuối file (không cần gọi tay nữa).
function loadAndRender() {
    applyFilters();
}

// Lọc danh sách đơn theo tab trạng thái đang chọn + từ khoá tìm kiếm (theo mã đơn hoặc tên khách).
function applyFilters() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    let list = currentStatusFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === currentStatusFilter);

    if (q) {
        list = list.filter(o =>
            o.id.toLowerCase().includes(q) ||
            (o.customer && o.customer.fullname && o.customer.fullname.toLowerCase().includes(q))
        );
    }
    renderTable(list);
}

const ALL_STATUSES = ['Chờ xác nhận', 'Đang giao', 'Hoàn thành', 'Yêu cầu trả hàng', 'Đã trả hàng', 'Đã hủy'];

// Dựng sẵn danh sách <option> cho ô <select> trạng thái, tự động chọn (selected) đúng trạng thái hiện tại.
function statusOptionsHTML(current) {
    return ALL_STATUSES.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
}

// Vẽ bảng danh sách đơn hàng: mỗi dòng có 1 ô <select> trạng thái để admin đổi nhanh ngay tại bảng,
// và nút 'Chi tiết' để mở modal xem đầy đủ thông tin đơn.
function renderTable(list) {
    const tbody = document.getElementById('orderTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Không có đơn hàng nào</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(o => {
        const qty = o.items.reduce((s, i) => s + i.quantity, 0);
        const date = o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '-';
        return `<tr>
            <td>#${o.id}</td>
            <td>${o.customer ? o.customer.fullname : '-'}</td>
            <td>${qty}</td>
            <td>${money(o.total)}</td>
            <td>
                <select class="row-status-select" data-id="${o.id}" style="padding:6px 8px; border-radius:6px;
                    border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:#fff; font-size:12.5px;">
                    ${statusOptionsHTML(o.status)}
                </select>
            </td>
            <td>${date}</td>
            <td><button type="button" class="btn btn-edit" onclick="openDetail('${o.id}')">Chi tiết</button></td>
        </tr>`;
    }).join('');
}

// Sửa đường dẫn ảnh: ảnh trong products.json tính từ thư mục users/, nhưng trang admin nằm
// trong thư mục admin/ nên phải thêm '../users/' phía trước mới trỏ đúng file ảnh.
function resolveImageSrc(src) {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('../')) {
        return src;
    }
    return '../users/' + src;
}

/**
 * Mở modal xem chi tiết 1 đơn hàng: thông tin khách, danh sách sản phẩm, tổng tiền, và
 * ô chọn trạng thái để admin cập nhật thủ công.
 * CƠ CHẾ CẬP NHẬT: admin toàn quyền chọn BẤT KỲ trạng thái nào rồi bấm nút hành động ->
 * gọi ShopCore.adminSetOrderStatus() để lưu, khác với luồng trạng thái có ràng buộc chặt
 * hơn ở phía khách hàng (users/js/orders.js).
 */
function openDetail(orderId) {
    const o = allOrders.find(x => x.id === orderId);
    if (!o) return;
    currentOrderId = orderId;

    document.getElementById('modalOrderId').textContent = 'Đơn hàng #' + o.id;

    const badge = document.getElementById('modalStatusBadge');
    badge.textContent = o.status;
    badge.className = 'badge ' + statusClass(o.status);

    const c = o.customer || {};
    document.getElementById('modalCustomerInfo').innerHTML =
        `${c.fullname || '-'}<br>${c.phone || ''}${c.email ? ' · ' + c.email : ''}<br>` +
        `${c.address || ''}${c.district ? ', ' + c.district : ''}${c.city ? ', ' + c.city : ''}` +
        (c.note ? `<br><i>Ghi chú: ${c.note}</i>` : '');

    document.getElementById('modalItemsList').innerHTML = o.items.map(item => `
        <div class="order-item-row">
            <img src="${resolveImageSrc(item.image)}" alt="">
            <span class="oi-name">${item.name}</span>
            <span class="oi-qty">x${item.quantity}</span>
            <span>${money(item.price * item.quantity)}</span>
        </div>
    `).join('');

    document.getElementById('modalSubtotal').textContent = money(o.subtotal);
    document.getElementById('modalShipping').textContent = o.shipping === 0 ? 'Miễn phí' : money(o.shipping);
    document.getElementById('modalTotal').textContent = money(o.total);
    document.getElementById('modalPayment').textContent = PAYMENT_LABELS[o.payment] || o.payment || '-';

    const returnWrap = document.getElementById('modalReturnReasonWrap');
    if (o.status === 'Yêu cầu trả hàng' || o.status === 'Đã trả hàng') {
        returnWrap.style.display = 'block';
        document.getElementById('modalReturnReason').textContent = o.returnReason || '(không ghi lý do)';
        const imgBox = document.getElementById('modalReturnImages');
        const imgs = o.returnImages || [];
        imgBox.innerHTML = imgs.length
            ? imgs.map(src => '<img src="' + src + '" alt="Ảnh minh chứng" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid #444;cursor:zoom-in;" onclick="zoomReturnImage(this.src)">').join('')
            : '<span style="color:#888;font-size:13px;">(khách không đính kèm ảnh)</span>';
    } else {
        returnWrap.style.display = 'none';
    }

    // Ô chọn trạng thái: mặc định chọn đúng trạng thái hiện tại của đơn
    document.getElementById('modalStatusSelect').value = o.status;

    // Admin toàn quyền chọn bất kỳ trạng thái nào rồi bấm "Cập nhật trạng thái" để lưu.
    const actionBtn = document.getElementById('modalActionBtn');
    actionBtn.onclick = function () {
        const newStatus = document.getElementById('modalStatusSelect').value;
        if (newStatus === o.status) { closeModal(); return; }
        // ShopCore.adminSetOrderStatus() giờ trả về 1 Promise (ghi lên Firestore) - chờ ghi xong
        // rồi mới đóng modal + báo thành công. Bảng sẽ tự vẽ lại nhờ watchAllOrders() bên dưới,
        // không cần gọi loadAndRender() thủ công nữa.
        ShopCore.adminSetOrderStatus(o.id, newStatus).then(() => {
            closeModal();
            ShopCore.toast('Đã cập nhật đơn #' + o.id + ' sang "' + newStatus + '"');
        });
    };

    modal.classList.add('show');
}

// Đóng modal chi tiết đơn hàng và xoá id đơn đang được chọn.
function closeModal() {
    modal.classList.remove('show');
    currentOrderId = null;
}

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modal.addEventListener('click', function (e) { if (e.target === this) closeModal(); });

document.getElementById('orderTableBody').addEventListener('change', function (e) {
    const sel = e.target.closest('.row-status-select');
    if (!sel) return;
    const orderId = sel.getAttribute('data-id');
    const newStatus = sel.value;
    ShopCore.adminSetOrderStatus(orderId, newStatus).then(() => {
        ShopCore.toast('Đã cập nhật đơn #' + orderId + ' sang "' + newStatus + '"');
    });
});

document.getElementById('searchBox').addEventListener('input', applyFilters);

document.getElementById('orderTabs').addEventListener('click', function (e) {
    const btn = e.target.closest('.order-tab');
    if (!btn) return;
    document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentStatusFilter = btn.getAttribute('data-status');
    applyFilters();
});

// Real-time: lắng nghe THẲNG từ Firestore - bảng tự cập nhật ngay khi có đơn mới, hoặc khi
// khách/admin đổi trạng thái đơn ở BẤT KỲ máy/tab nào khác (không còn giới hạn "cùng trình duyệt"
// như cơ chế 'storage' event cũ, vì giờ dữ liệu nằm trên Firestore chứ không phải localStorage).
ShopCore.watchAllOrders(function (list) {
    allOrders = list;
    applyFilters();
});


// Phóng to ảnh minh chứng trả hàng khi bấm vào ảnh thu nhỏ.
function zoomReturnImage(src) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:3000;cursor:zoom-out;';
    ov.innerHTML = '<img src="' + src + '" style="max-width:92vw;max-height:92vh;border-radius:8px;">';
    ov.addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
}
