// admin/js/inventory.js - Trang "Kho hàng": nhập kho / xuất kho thủ công + xem lịch sử.
// Toàn bộ đọc-ghi đi qua ShopCore.adjustStock() / ShopCore.watchInventoryLogs() (users/js/shop-core.js).

const categoryLabels = { anime: 'Mô hình Anime', gundam: 'Gundam', car: 'Siêu xe', tools: 'Dụng cụ' };
function categoryLabel(c) { return categoryLabels[c] || c; }
function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }

let allProducts = [];
let currentStockType = 'in'; // 'in' = nhập kho, 'out' = xuất kho

// Ảnh trong data/products.json là đường dẫn tương đối tính từ thư mục users/, trang admin nằm
// trong thư mục admin/ nên phải thêm '../users/' phía trước mới trỏ đúng file ảnh.
function resolveImageSrc(src) {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('../')) {
        return src;
    }
    return '../users/' + src;
}

// ---------- Ô chọn sản phẩm trong form nhập/xuất ----------
function renderProductSelect() {
    const select = document.getElementById('s_product');
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Chọn sản phẩm --</option>' +
        allProducts.map(p => `<option value="${p.id}">${p.name} (còn ${ShopCore.getStock(p)})</option>`).join('');
    if (currentValue) select.value = currentValue;
}

// Khi chọn 1 sản phẩm trong form -> hiện luôn tồn kho hiện tại của nó ở ô bên cạnh (chỉ để xem).
document.getElementById('s_product').addEventListener('change', function () {
    const p = allProducts.find(x => x.id === this.value);
    document.getElementById('s_currentStock').value = p ? ShopCore.getStock(p) : '';
});

// ---------- Tab chọn Nhập kho / Xuất kho ----------
document.getElementById('stockTypeTabs').addEventListener('click', function (e) {
    const tab = e.target.closest('.stock-type-tab');
    if (!tab) return;
    currentStockType = tab.getAttribute('data-type');
    document.querySelectorAll('.stock-type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const btn = document.getElementById('stockSubmitBtn');
    btn.textContent = currentStockType === 'in' ? 'Nhập kho' : 'Xuất kho';
});

// ---------- Submit form nhập/xuất kho ----------
document.getElementById('stockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const productId = document.getElementById('s_product').value;
    const quantity = Number(document.getElementById('s_quantity').value);
    const note = document.getElementById('s_note').value.trim();

    if (!productId) { alert('Vui lòng chọn sản phẩm!'); return; }
    if (!quantity || quantity <= 0) { alert('Số lượng phải lớn hơn 0!'); return; }

    const user = ShopCore.getCurrentUser();
    const by = (user && (user.username || user.email)) || 'admin';

    const btn = document.getElementById('stockSubmitBtn');
    btn.disabled = true;

    ShopCore.adjustStock(productId, quantity, currentStockType, note, by)
        .then(({ product }) => {
            ShopCore.toast(
                (currentStockType === 'in' ? 'Đã nhập kho: ' : 'Đã xuất kho: ') +
                `${product.name} (còn ${ShopCore.getStock(product)})`
            );
            document.getElementById('stockForm').reset();
            document.getElementById('s_currentStock').value = '';
        })
        .catch(err => {
            alert('' + (err && err.message ? err.message : 'Có lỗi xảy ra, vui lòng thử lại!'));
        })
        .finally(() => { btn.disabled = false; });
});

// ---------- Bảng tồn kho toàn bộ sản phẩm ----------
function renderStockTable() {
    const q = document.getElementById('invSearchBox').value.trim().toLowerCase();
    const list = q ? allProducts.filter(p => p.name.toLowerCase().includes(q)) : allProducts;

    const tbody = document.getElementById('stockTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">Không có sản phẩm nào</td></tr>';
    } else {
        tbody.innerHTML = list.map(p => {
            const stock = ShopCore.getStock(p);
            const outOfStock = ShopCore.isOutOfStock(p);
            const stockHTML = outOfStock ? `<span class="stock-zero">${stock}</span>`
                : (stock <= 5 ? `<span class="stock-low">${stock}</span>` : stock);
            const badge = outOfStock
                ? '<span class="badge badge-out">Hết hàng</span>'
                : (stock <= 5 ? '<span class="badge" style="background:rgba(250,204,21,.18); color:#facc15;">Sắp hết</span>'
                    : '<span class="badge badge-in">Còn hàng</span>');
            return `<tr>
                <td><img src="${resolveImageSrc(p.image)}" alt=""></td>
                <td>${p.name}</td>
                <td>${categoryLabel(p.category)}</td>
                <td>${stockHTML}</td>
                <td>${badge}</td>
                <td><button type="button" class="btn btn-edit" onclick="quickFill('${p.id}')">Nhập/Xuất</button></td>
            </tr>`;
        }).join('');
    }

    // Ô số liệu tổng quan ở đầu trang
    document.getElementById('invTotalStock').textContent =
        allProducts.reduce((s, p) => s + ShopCore.getStock(p), 0);
    document.getElementById('invLowStockCount').textContent =
        allProducts.filter(p => !ShopCore.isOutOfStock(p) && ShopCore.getStock(p) <= 5).length;
    document.getElementById('invOutOfStockCount').textContent =
        allProducts.filter(p => ShopCore.isOutOfStock(p)).length;
}

// Bấm nút "Nhập/Xuất" ở 1 dòng sản phẩm -> tự chọn sẵn sản phẩm đó trong form phía trên,
// cuộn lên và focus vào ô số lượng để admin nhập nhanh.
function quickFill(productId) {
    const select = document.getElementById('s_product');
    select.value = productId;
    select.dispatchEvent(new Event('change'));
    document.getElementById('stockForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('s_quantity').focus();
}

// ---------- Bảng lịch sử nhập/xuất kho ----------
function renderLogTable(logs) {
    const tbody = document.getElementById('logTableBody');
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Chưa có lịch sử nhập/xuất kho nào</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map(l => {
        const typeBadge = l.type === 'in'
            ? '<span class="badge badge-stock-in">Nhập</span>'
            : '<span class="badge badge-stock-out">Xuất</span>';
        const date = l.createdAt ? new Date(l.createdAt).toLocaleString('vi-VN') : '-';
        return `<tr>
            <td>#${l.id}</td>
            <td>${l.productName || '(sản phẩm đã xoá)'}</td>
            <td>${typeBadge}</td>
            <td>${l.type === 'in' ? '+' : '-'}${l.quantity}</td>
            <td>${l.stockAfter}</td>
            <td>${l.note || '-'}</td>
            <td>${date}</td>
        </tr>`;
    }).join('');
}

document.getElementById('invSearchBox').addEventListener('input', renderStockTable);

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

// Tải danh sách sản phẩm + lắng nghe real-time (đồng bộ khi tồn kho đổi từ tab/máy khác),
// và lắng nghe real-time lịch sử nhập/xuất kho.
function loadAndRenderProducts() {
    ShopCore.loadProducts().then(products => {
        allProducts = products;
        renderProductSelect();
        renderStockTable();
    });
}
loadAndRenderProducts();
ShopCore.onProductsChanged(loadAndRenderProducts);
ShopCore.watchInventoryLogs(renderLogTable);
