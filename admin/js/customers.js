// admin/js/customers.js - Danh sách khách hàng + xem/điều chỉnh điểm thưởng của từng người,
// và cấu hình tỷ lệ tích/đổi điểm chung cho toàn shop.

let allCustomers = [];
let editingUsername = null;

const pointsModal = document.getElementById('pointsModal');

function loadCustomers() {
    ShopCore.getAllCustomers().then(list => {
        allCustomers = list;
        applyFilters();
    });
}

function applyFilters() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    const list = q
        ? allCustomers.filter(u =>
            (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
        : allCustomers;
    renderTable(list);
}

function renderTable(list) {
    const tbody = document.getElementById('customerTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Không có khách hàng nào</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(u => {
        const created = u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toLocaleDateString('vi-VN')
            : (u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '-');
        return `<tr>
            <td>${u.username || '-'}</td>
            <td>${u.email || '-'}</td>
            <td>${created}</td>
            <td><b>${u.points || 0}</b></td>
            <td class="row-actions">
                <button type="button" class="btn btn-edit" onclick="openAdjust('${u.username}')">Điều chỉnh điểm</button>
            </td>
        </tr>`;
    }).join('');
}

function openAdjust(username) {
    editingUsername = username;
    document.getElementById('modalTitle').textContent = 'Điều chỉnh điểm - ' + username;
    document.getElementById('f_delta').value = '';
    pointsModal.classList.add('show');
}

function closePointsModal() {
    pointsModal.classList.remove('show');
    editingUsername = null;
}

document.getElementById('pointsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const delta = Number(document.getElementById('f_delta').value);
    if (!delta) { closePointsModal(); return; }
    ShopCore.adminAdjustPoints(editingUsername, delta).then(() => {
        closePointsModal();
        ShopCore.toast('Đã cập nhật điểm cho ' + editingUsername);
        loadCustomers();
    }).catch(err => alert('' + err.message));
});

document.getElementById('modalCancelBtn').addEventListener('click', closePointsModal);
pointsModal.addEventListener('click', function (e) { if (e.target === this) closePointsModal(); });

document.getElementById('searchBox').addEventListener('input', applyFilters);
document.getElementById('refreshBtn').addEventListener('click', loadCustomers);

// ---- Cấu hình tỷ lệ tích điểm ----
ShopCore.getLoyaltyConfig().then(cfg => {
    document.getElementById('cfg_earnPerAmount').value = cfg.earnPerAmount;
    document.getElementById('cfg_redeemValue').value = cfg.redeemValue;
});

document.getElementById('configForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const earnPerAmount = Number(document.getElementById('cfg_earnPerAmount').value);
    const redeemValue = Number(document.getElementById('cfg_redeemValue').value);
    ShopCore.updateLoyaltyConfig({ earnPerAmount, redeemValue }).then(() => {
        ShopCore.toast('Đã lưu cấu hình điểm thưởng');
    });
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

loadCustomers();
