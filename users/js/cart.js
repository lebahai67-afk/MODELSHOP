// ============================================================
// cart.js — LOGIC TRANG GIỎ HÀNG (cart.html)
// ============================================================
// Cách hoạt động chung:
// - Giỏ hàng THẬT được lưu ở localStorage (key "cart_<username>", riêng từng tài khoản), do shop-core.js quản lý.
//   -> vì vậy file này PHẢI được nạp SAU shop-core.js trong file HTML.
// - Ở đây ta chỉ lo phần HIỂN THỊ: vẽ bảng sản phẩm, xử lý tăng/giảm số lượng,
//   xoá sản phẩm, tính tổng tiền, và chuyển sang trang thanh toán.
// - Biến cartItems là "bản sao trong bộ nhớ" của giỏ hàng, đã được ShopCore
//   ghép (join) thêm thông tin thật của sản phẩm (tên, ảnh, giá, tồn kho...)
//   lấy từ data/products.json, để không phải tự fetch lại ở đây.

let cartItems = [];

// Định dạng số tiền kiểu Việt Nam, ví dụ 150000 -> "150.000đ"
function money(n) {
    return n.toLocaleString('vi-VN') + 'đ';
}

// Vẽ lại toàn bộ bảng giỏ hàng dựa trên dữ liệu mới nhất trong localStorage.
// Được gọi lại mỗi khi giỏ hàng thay đổi (thêm/xoá/sửa số lượng) để giao diện luôn khớp dữ liệu.
function renderCart() {
    ShopCore.getCartDetailed().then(items => {
        cartItems = items;
        const tbody = document.getElementById('cartTbody');
        const emptyBox = document.getElementById('cartEmpty');
        const wrapper = document.querySelector('.cart-table-wrapper');

        // Giỏ hàng trống -> ẩn bảng, hiện thông báo trống
        if (items.length === 0) {
            tbody.innerHTML = '';
            wrapper.style.display = 'none';
            emptyBox.style.display = 'block';
            updateGrandTotal();
            return;
        }

        wrapper.style.display = '';
        emptyBox.style.display = 'none';

        // Dựng từng dòng <tr> cho mỗi sản phẩm trong giỏ
        tbody.innerHTML = items.map(item => {
            // Nút [+] sẽ bị khoá nếu số lượng hiện tại đã chạm giới hạn tồn kho (item.stock)
            const reachedMax = item.quantity >= item.stock;
            return `
            <tr data-id="${item.id}">
                <td style="text-align: center;">
                    <input type="checkbox" class="product-checkbox item-checkbox" data-id="${item.id}"
                        checked onchange="updateSelection()">
                </td>
                <td colspan="2">
                    <div class="product-info">
                        <img src="${item.image}" alt="${item.name}" class="product-img">
                        <div class="product-details">
                            <h3>${item.name}</h3>
                            <div class="product-stock" onclick="removeItem('${item.id}')">Xóa</div>
                        </div>
                    </div>
                </td>
                <td class="product-price">${money(item.price)}</td>
                <td>
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="decreaseQty('${item.id}')">-</button>
                        <input type="number" class="qty-input" value="${item.quantity}" id="qty-${item.id}" readonly>
                        <button class="qty-btn" onclick="increaseQty('${item.id}')" ${reachedMax ? 'disabled title="Đã đạt số lượng tồn kho"' : ''}>+</button>
                    </div>
                </td>
                <td class="product-total" id="total-${item.id}">${money(item.price * item.quantity)}</td>
            </tr>
        `;
        }).join('');

        document.getElementById('selectAll').checked = true;
        updateGrandTotal();
    });
}

// Bấm chọn/bỏ chọn TẤT CẢ sản phẩm (checkbox ở đầu bảng)
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = selectAll.checked);
    updateGrandTotal();
}

// Khi tick/bỏ tick 1 sản phẩm -> tự cập nhật lại trạng thái checkbox "Chọn tất cả"
function updateSelection() {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    const selectAll = document.getElementById('selectAll');
    selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
    updateGrandTotal();
}

// Chỉ cộng tổng tiền của những sản phẩm ĐANG ĐƯỢC TICK CHỌN (không phải toàn bộ giỏ)
function updateGrandTotal() {
    let grand = 0;
    let totalItems = 0;

    document.querySelectorAll('.item-checkbox').forEach(cb => {
        const item = cartItems.find(i => i.id === cb.dataset.id);
        if (!item) return;
        if (cb.checked) {
            totalItems += item.quantity;
            grand += item.price * item.quantity;
        }
    });

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('grandTotal').textContent = money(grand);
}

// Tăng số lượng 1 sản phẩm trong giỏ — có kiểm tra không cho vượt quá tồn kho (item.stock)
function increaseQty(id) {
    const item = cartItems.find(i => i.id === id);
    if (!item) return;

    if (item.quantity >= item.stock) {
        ShopCore.toast(`Chỉ còn ${item.stock} sản phẩm trong kho!`);
        return;
    }

    item.quantity += 1;
    ShopCore.updateCartQty(id, item.quantity);
    document.getElementById(`qty-${id}`).value = item.quantity;
    document.getElementById(`total-${id}`).textContent = money(item.price * item.quantity);
    updateGrandTotal();

    // Nếu vừa chạm mức tối đa thì vẽ lại cả bảng để khoá nút [+] (hiện disabled)
    if (item.quantity >= item.stock) renderCart();
}

// Giảm số lượng, tối thiểu là 1 (muốn bỏ hẳn sản phẩm thì bấm "Xóa")
function decreaseQty(id) {
    const item = cartItems.find(i => i.id === id);
    if (!item || item.quantity <= 1) return;
    item.quantity -= 1;
    ShopCore.updateCartQty(id, item.quantity);
    document.getElementById(`qty-${id}`).value = item.quantity;
    document.getElementById(`total-${id}`).textContent = money(item.price * item.quantity);
    updateGrandTotal();
    renderCart(); // vẽ lại để mở khoá nút [+] nếu trước đó đang bị disabled
}

// Xoá hẳn 1 sản phẩm khỏi giỏ hàng (có xác nhận trước khi xoá)
function removeItem(id) {
    if (!confirm('Xóa sản phẩm này khỏi giỏ hàng?')) return;
    ShopCore.removeFromCart(id);
    ShopCore.toast('Đã xóa sản phẩm khỏi giỏ hàng');
    renderCart();
}

// Bấm "Thanh toán": chỉ mang những sản phẩm ĐANG ĐƯỢC TICK sang trang checkout,
// lưu tạm vào localStorage "checkoutItems" để checkout.js đọc lại.
// CƠ CHẾ: chỉ lấy những sản phẩm ĐANG ĐƯỢC TICK CHECKBOX (giống Shopee/Lazada - không bắt
// buộc phải thanh toán toàn bộ giỏ hàng cùng lúc). Lưu tạm mảng đã chọn vào localStorage
// key 'checkoutItems' để checkout.js đọc lại - đây là cách 'truyền dữ liệu giữa 2 trang'
// khi không có router/state quản lý chung (kiểu Redux/Context của React).
function checkout() {
    const selectedIds = Array.from(document.querySelectorAll('.item-checkbox:checked')).map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
        alert('Vui lòng chọn ít nhất một sản phẩm để thanh toán!');
        return;
    }

    const selectedItems = cartItems
        .filter(i => selectedIds.includes(i.id))
        .map(i => ({ id: i.id, quantity: i.quantity }));

    localStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
    window.location.href = 'checkout.html';
}

// Vẽ giỏ hàng ngay khi trang tải xong.
// Đợi AuthService.ready trước, để chắc chắn Firebase đã xác nhận xong phiên đăng nhập
// (giỏ hàng được lưu theo key 'cart_<username>' - nếu đọc quá sớm lúc Firebase chưa kịp
// khôi phục phiên, sẽ nhầm sang giỏ hàng khách vãng lai).
window.addEventListener('load', () => {
    AuthService.ready.then(() => {
        renderCart();
        if (typeof updateAuthUI === 'function') updateAuthUI();
    });
});
