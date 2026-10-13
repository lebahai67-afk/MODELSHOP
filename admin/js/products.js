// admin/js/products.js - Quản lý sản phẩm (thêm / sửa / xoá / giá khuyến mãi / tồn kho)
// Toàn bộ đọc-ghi đi qua ShopCore (users/js/shop-core.js) để đồng bộ với trang mua sắm.

let allProducts = [];
let editingId = null; // null = đang thêm mới, có giá trị = đang sửa sản phẩm này
let uploadedImageData = null; // ảnh vừa chọn, dạng base64 (chưa lưu cho tới khi bấm "Lưu sản phẩm")
let extraImages = null; // ảnh phụ: null = không đổi, [] = xoá hết, [...] = thay bằng danh sách mới (base64)
const MAX_EXTRA = 4;

const categoryLabels = { anime: 'Mô hình Anime', gundam: 'Gundam', car: 'Siêu xe', tools: 'Dụng cụ' };
function categoryLabel(c) { return categoryLabels[c] || c; }

// Ảnh trong data/products.json là đường dẫn tương đối tính từ thư mục users/ (vd "images/xxx.jpg").
// Trang admin lại nằm trong thư mục admin/, nên phải thêm "../users/" phía trước mới trỏ đúng.
// Ảnh admin tự upload thì đã là base64 (data:...) hoặc link http tuyệt đối, giữ nguyên không đổi.
function resolveImageSrc(src) {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('../')) {
        return src;
    }
    return '../users/' + src;
}

const modal = document.getElementById('productModal');
const form = document.getElementById('productForm');

// Tải toàn bộ sản phẩm (qua ShopCore, đã ưu tiên đọc bản admin đã chỉnh sửa trong localStorage
// nếu có) rồi vẽ bảng theo bộ lọc tìm kiếm hiện tại.
function loadAndRender() {
    ShopCore.loadProducts().then(list => {
        allProducts = list;
        applySearchFilter();
    });
}

// Lọc sản phẩm theo tên (không phân biệt hoa/thường) dựa vào ô tìm kiếm phía trên bảng.
function applySearchFilter() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    const list = q ? allProducts.filter(p => p.name.toLowerCase().includes(q)) : allProducts;
    renderTable(list);
}

// Vẽ bảng quản lý sản phẩm: ảnh, tên, danh mục, giá (kèm giá khuyến mãi nếu có), tồn kho,
// tình trạng còn/hết hàng, số đã bán, và 2 nút Sửa/Xoá cho từng dòng.
function renderTable(list) {
    const tbody = document.getElementById('productTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">Không có sản phẩm nào</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(p => {
        const hasSale = p.salePrice && p.salePrice < p.price;
        const priceHTML = hasSale
            ? `<span class="price-old">${ShopCore.formatPrice(p.price)}</span><br><span class="price-sale">${ShopCore.formatPrice(p.salePrice)}</span>`
            : `<span class="price-now">${ShopCore.formatPrice(p.price)}</span>`;
        const stock = ShopCore.getStock(p);
        const outOfStock = ShopCore.isOutOfStock(p);
        const stockHTML = outOfStock
            ? `<span class="stock-zero">${stock}</span>`
            : (stock <= 5 ? `<span class="stock-low">${stock}</span>` : stock);
        const stockBadge = outOfStock
            ? '<span class="badge badge-out">Hết hàng</span>'
            : '<span class="badge badge-in">Còn hàng</span>';
        return `<tr>
            <td><img src="${resolveImageSrc(p.image)}" alt=""></td>
            <td>${p.name}<br><span style="color:#888;font-size:11.5px;">${p.brand || ''}</span></td>
            <td>${categoryLabel(p.category)}</td>
            <td>${priceHTML}</td>
            <td>${stockHTML}</td>
            <td>${stockBadge}${hasSale ? ' <span class="badge badge-sale">KM</span>' : ''}</td>
            <td>${p.sold ?? 0}</td>
            <td>
                <div class="row-actions">
                    <button type="button" class="btn btn-edit" onclick="openEdit('${p.id}')">Sửa</button>
                    <button type="button" class="btn btn-del" onclick="removeProduct('${p.id}')">Xoá</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---------- Mở modal thêm / sửa ----------
// Mở modal ở chế độ THÊM MỚI: reset sạch form về trạng thái trống, editingId = null để
// hàm submit bên dưới biết đây là thêm mới (không phải sửa).
function openAdd() {
    editingId = null;
    uploadedImageData = null;
    extraImages = null;
    form.reset();
    renderExtraPreview([]);
    document.getElementById('modalTitle').textContent = 'Thêm sản phẩm mới';
    document.getElementById('stockFieldWrap').style.display = 'none';
    const preview = document.getElementById('imgPreview');
    preview.src = '';
    preview.style.display = 'none';
    modal.classList.add('show');
}

// Mở modal ở chế độ SỬA: tìm đúng sản phẩm theo id, đổ toàn bộ dữ liệu hiện có vào từng ô
// input của form để admin chỉnh sửa tiếp, editingId lưu lại id đang sửa.
function openEdit(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    uploadedImageData = null;
    extraImages = null;
    renderExtraPreview(p.images || []);

    document.getElementById('modalTitle').textContent = 'Sửa sản phẩm';
    document.getElementById('f_name').value = p.name;
    document.getElementById('f_category').value = p.category;
    document.getElementById('f_brand').value = p.brand || '';
    document.getElementById('f_price').value = p.price;
    document.getElementById('f_salePrice').value = p.salePrice || '';
    document.getElementById('f_tags').value = (p.tags || []).join(', ');
    document.getElementById('f_description').value = p.description || '';
    document.getElementById('f_spec').value = p.spec || '';

    // Tồn kho: chỉ HIỂN THỊ (ô bị khoá), việc chỉnh số lượng thật sự phải qua trang Kho hàng
    // (ShopCore.adjustStock) để còn lưu lại lịch sử nhập/xuất - không cho sửa tay ở đây.
    document.getElementById('stockFieldWrap').style.display = 'block';
    document.getElementById('f_stock').value = ShopCore.getStock(p);

    const preview = document.getElementById('imgPreview');
    preview.src = resolveImageSrc(p.image);
    preview.style.display = 'block';

    modal.classList.add('show');
}

// Đóng modal thêm/sửa sản phẩm.
function closeModal() {
    modal.classList.remove('show');
}

/**
 * Xử lý khi admin chọn 1 file ảnh từ máy tính.
 * CƠ CHẾ: vì không có server để upload file lên, ta dùng FileReader.readAsDataURL() để đọc
 * ảnh và chuyển thành chuỗi Base64 (dạng 'data:image/png;base64,...') - chuỗi này CHÍNH LÀ
 * ảnh, có thể lưu thẳng vào localStorage và gán vào thuộc tính src của thẻ <img> để hiện ra.
 */
document.getElementById('f_image').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        uploadedImageData = ev.target.result;
        const preview = document.getElementById('imgPreview');
        preview.src = uploadedImageData;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
});

/**
 * Xử lý khi bấm 'Lưu sản phẩm' (dùng chung cho cả THÊM MỚI và SỬA, phân biệt bằng editingId).
 * CƠ CHẾ:
 *  1. Gom dữ liệu từ toàn bộ ô input trong form thành 1 object 'data'.
 *  2. Validate: bắt buộc có ảnh khi thêm mới, đủ tên/danh mục/giá, giá khuyến mãi phải nhỏ hơn giá gốc.
 *  3. Nếu editingId có giá trị -> gọi ShopCore.updateProduct(), ngược lại gọi ShopCore.addProduct().
 *  4. Cả 2 hàm đều trả về Promise -> .then() để đóng modal, vẽ lại bảng, và báo thành công
 *     SAU KHI đã lưu xong (đảm bảo đúng thứ tự, không vẽ bảng trước khi dữ liệu kịp lưu).
 */
// ---------- Ảnh phụ (thư viện ảnh trang chi tiết) ----------
// Thu nhỏ ảnh về tối đa 900px (JPEG 0.78) bằng canvas để mỗi ảnh chỉ ~60-150KB,
// tránh vượt giới hạn 1MB / tài liệu của Firestore.
function shrinkImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function (ev) {
            const img = new Image();
            img.onerror = reject;
            img.onload = function () {
                const r = Math.min(1, maxSide / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * r);
                c.height = Math.round(img.height * r);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.78));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderExtraPreview(list) {
    const box = document.getElementById('extraPreview');
    box.innerHTML = list.map(function (src) {
        return '<img src="' + resolveImageSrc(src) + '" alt="">';
    }).join('');
    document.getElementById('clearExtraBtn').style.display = list.length ? 'inline-block' : 'none';
}

document.getElementById('f_images').addEventListener('change', function (e) {
    const files = Array.prototype.slice.call(e.target.files, 0, MAX_EXTRA);
    if (!files.length) return;
    if (e.target.files.length > MAX_EXTRA) alert('Chỉ nhận tối đa ' + MAX_EXTRA + ' ảnh phụ, các ảnh dư đã bị bỏ qua.');
    Promise.all(files.map(function (f) { return shrinkImage(f, 900); })).then(function (list) {
        extraImages = list;
        renderExtraPreview(list);
    }).catch(function () { alert('Không đọc được một trong các ảnh đã chọn.'); });
});

document.getElementById('clearExtraBtn').addEventListener('click', function () {
    extraImages = [];
    document.getElementById('f_images').value = '';
    renderExtraPreview([]);
});

form.addEventListener('submit', function (e) {
    e.preventDefault();

    const tags = document.getElementById('f_tags').value
        .split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const salePriceRaw = document.getElementById('f_salePrice').value;

    const data = {
        name: document.getElementById('f_name').value.trim(),
        category: document.getElementById('f_category').value,
        brand: document.getElementById('f_brand').value.trim(),
        price: Number(document.getElementById('f_price').value),
        salePrice: salePriceRaw ? Number(salePriceRaw) : null,
        tags: tags,
        description: document.getElementById('f_description').value.trim(),
        spec: document.getElementById('f_spec').value.trim()
    };

    if (uploadedImageData) {
        data.image = uploadedImageData;
    } else if (!editingId) {
        alert('Vui lòng chọn ảnh cho sản phẩm!');
        return;
    }

    if (extraImages !== null) {
        data.images = extraImages;
        // Firestore giới hạn 1MB / tài liệu -> chặn sớm kèm thông báo rõ ràng
        if (JSON.stringify(data).length > 900000) {
            alert('Tổng dung lượng ảnh quá lớn (giới hạn ~900KB). Hãy bớt ảnh phụ hoặc dùng ảnh nhẹ hơn.');
            return;
        }
    }

    if (!data.name || !data.category || !data.price) {
        alert('Vui lòng điền đủ Tên, Danh mục và Giá!');
        return;
    }
    if (data.salePrice && data.salePrice >= data.price) {
        alert('Giá khuyến mãi phải nhỏ hơn giá gốc!');
        return;
    }

    const action = editingId
        ? ShopCore.updateProduct(editingId, data)
        : ShopCore.addProduct(data);

    action.then(() => {
        closeModal();
        loadAndRender();
        ShopCore.toast(editingId ? 'Đã lưu thay đổi' : 'Đã thêm sản phẩm mới');
    });
});

// Xoá sản phẩm sau khi xác nhận (confirm) - hành động không thể hoàn tác vì không có 'thùng rác'.
function removeProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Xoá sản phẩm "${p.name}"? Không thể hoàn tác.`)) return;
    ShopCore.deleteProduct(id).then(() => {
        loadAndRender();
        ShopCore.toast('Đã xoá sản phẩm "' + p.name + '"');
    });
}

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});
document.getElementById('addProductBtn').addEventListener('click', openAdd);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
document.getElementById('productModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});
document.getElementById('searchBox').addEventListener('input', applySearchFilter);

loadAndRender();

// Real-time: phòng khi admin mở 2 tab admin/products.html cùng lúc (VD trên 2 màn hình)
ShopCore.onProductsChanged(loadAndRender);
