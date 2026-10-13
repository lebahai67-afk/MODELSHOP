// admin/js/vouchers.js - Tạo/sửa/xoá mã giảm giá + bật tắt kích hoạt.
// Toàn bộ đọc/ghi đi qua ShopCore.*Voucher* (users/js/shop-core.js), collection Firestore "vouchers".

let allVouchers = [];
let editingCode = null; // code đang sửa (null = đang tạo mới)

const modal = document.getElementById('voucherModal');

function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }

function formatValue(v) {
    return v.type === 'amount' ? money(v.value) : v.value + '%';
}

function isExpired(v) {
    return v.expiresAt && new Date(v.expiresAt) < new Date();
}

function applyFilters() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    const list = q ? allVouchers.filter(v => v.code.toLowerCase().includes(q)) : allVouchers;
    renderTable(list);
}

function renderTable(list) {
    const tbody = document.getElementById('voucherTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Chưa có mã giảm giá nào</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(v => {
        const expired = isExpired(v);
        const statusBadge = !v.active
            ? '<span class="badge badge-cancelled">Đã tắt</span>'
            : expired
                ? '<span class="badge badge-cancelled">Hết hạn</span>'
                : '<span class="badge badge-done">Đang hoạt động</span>';
        const usageText = v.usageLimit ? `${v.usedCount || 0} / ${v.usageLimit}` : `${v.usedCount || 0} / Không giới hạn`;
        return `<tr>
            <td><b>${v.code}</b></td>
            <td>${v.type === 'amount' ? 'Số tiền cố định' : 'Phần trăm'}</td>
            <td>${formatValue(v)}</td>
            <td>${v.expiresAt || 'Không giới hạn'}</td>
            <td>${usageText}</td>
            <td>${statusBadge}</td>
            <td class="row-actions">
                <button type="button" class="btn btn-edit" onclick="openEdit('${v.code}')">Sửa</button>
                <button type="button" class="btn btn-edit" onclick="toggleActive('${v.code}', ${!v.active})">
                    ${v.active ? 'Tắt' : 'Bật'}
                </button>
                <button type="button" class="btn btn-del" onclick="doDeleteVoucher('${v.code}')">Xoá</button>
            </td>
        </tr>`;
    }).join('');
}

function openCreate() {
    editingCode = null;
    document.getElementById('modalTitle').textContent = 'Tạo mã giảm giá mới';
    document.getElementById('voucherForm').reset();
    document.getElementById('f_code').disabled = false;
    modal.classList.add('show');
}

function openEdit(code) {
    const v = allVouchers.find(x => x.code === code);
    if (!v) return;
    editingCode = code;
    document.getElementById('modalTitle').textContent = 'Sửa mã giảm giá "' + code + '"';
    document.getElementById('f_code').value = v.code;
    document.getElementById('f_code').disabled = true; // không cho đổi mã (là ID document)
    document.getElementById('f_type').value = v.type;
    document.getElementById('f_value').value = v.value;
    document.getElementById('f_expiresAt').value = v.expiresAt || '';
    document.getElementById('f_usageLimit').value = v.usageLimit || '';
    modal.classList.add('show');
}

function closeModal() {
    modal.classList.remove('show');
    editingCode = null;
}

function toggleActive(code, active) {
    ShopCore.updateVoucher(code, { active }).then(() => {
        ShopCore.toast(active ? 'Đã bật mã ' + code : 'Đã tắt mã ' + code);
    });
}

function doDeleteVoucher(code) {
    if (!confirm('Xoá vĩnh viễn mã "' + code + '"? Không thể hoàn tác.')) return;
    ShopCore.deleteVoucher(code).then(() => {
        ShopCore.toast('Đã xoá mã ' + code);
    });
}

document.getElementById('addVoucherBtn').addEventListener('click', openCreate);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
modal.addEventListener('click', function (e) { if (e.target === this) closeModal(); });

document.getElementById('voucherForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const data = {
        type: document.getElementById('f_type').value,
        value: Number(document.getElementById('f_value').value),
        expiresAt: document.getElementById('f_expiresAt').value || '',
        usageLimit: Number(document.getElementById('f_usageLimit').value) || 0
    };

    if (editingCode) {
        ShopCore.updateVoucher(editingCode, data).then(() => {
            closeModal();
            ShopCore.toast('Đã cập nhật mã ' + editingCode);
        });
    } else {
        data.code = document.getElementById('f_code').value.trim().toUpperCase();
        ShopCore.addVoucher(data).then(() => {
            closeModal();
            ShopCore.toast('Đã tạo mã ' + data.code);
        }).catch(err => {
            alert('' + err.message);
        });
    }
});

document.getElementById('searchBox').addEventListener('input', applyFilters);

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

ShopCore.watchAllVouchers(function (list) {
    allVouchers = list;
    applyFilters();
});
