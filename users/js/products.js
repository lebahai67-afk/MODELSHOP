// products.js
// Engine dùng chung cho các trang danh mục (products-anime/gundam/car/tools.html)
// Đọc dữ liệu thật từ json/products.json, lọc theo tag (checkbox sidebar có sẵn),
// lọc theo khoảng giá, sắp xếp, và render thẻ sản phẩm luôn trỏ đúng ID khi bấm vào.

let loadedProducts = [];
const gridContainer = document.getElementById("product-grid");
// Nhận diện loại trang thông qua thuộc tính data-category trên HTML
const pageCategory = gridContainer ? gridContainer.getAttribute("data-category") : "";

// Chỉ tự nạp dữ liệu khi trang có lưới sản phẩm THEO DANH MỤC (product-grid + data-category).
// Trang tìm kiếm (products-search.html) dùng container riêng nên không bị đoạn này can thiệp.
if (gridContainer && pageCategory) {
    ShopCore.loadProducts()
        .then(data => {
            loadedProducts = data.filter(item => item.category === pageCategory);
            renderList(loadedProducts);
        })
        .catch(err => console.error("Lỗi nạp tệp JSON sản phẩm: ", err));
}

// (Hàm tạo ảnh thu nhỏ / srcset nằm trong utils.js -> MS.srcsetAttrs)

// Dựng HTML cho 1 thẻ sản phẩm - dùng chung cho trang danh mục lẫn trang tìm kiếm.
// Đúng 1 ảnh duy nhất, dùng lại cho cả thẻ ngoài lưới lẫn ảnh chính ở trang chi tiết.
/**
 * Dựng chuỗi HTML cho 1 thẻ sản phẩm (dùng chung cho trang danh mục & tìm kiếm).
 * CƠ CHẾ: đây là 'template string' (chuỗi trong dấu backtick ` `) - cho phép nhúng biến JS
 * trực tiếp vào giữa HTML bằng ${...}. Hàm trả về 1 chuỗi text thuần, CHƯA có trên màn hình -
 * phải gán vào .innerHTML của 1 phần tử DOM (xem renderList) thì trình duyệt mới vẽ ra.
 */
function buildCardHTML(item) {
    // ShopCore.getStock() trả field "stock" trong products.json (999 nếu thiếu, coi như còn hàng)
    const outOfStock = window.ShopCore ? window.ShopCore.isOutOfStock(item) : false;
    // Sắp hết hàng (còn 1-5) -> hiện nhãn thúc đẩy khách quyết định mua
    const stockLeft = window.ShopCore && window.ShopCore.getStock ? window.ShopCore.getStock(item) : 999;
    const lowStock = !outOfStock && stockLeft > 0 && stockLeft <= 5;
    // Điểm đánh giá trung bình lấy từ localStorage (người dùng đã đánh giá trước đó)
    const rating = window.ShopCore ? window.ShopCore.getRatingSummary(item.id) : { average: 0, count: 0 };
    const starsHTML = rating.count > 0
        ? `<div class="rating">${window.ShopCore.renderStars(rating.average)} <span>(${rating.count})</span></div>`
        : '';

    return `
        <a class="product" href="javascript:void(0)" onclick="goToDetail('${item.id}')">
            <button type="button" class="wish-btn" data-wish="${item.id}" onclick="toggleWish('${item.id}', this, event)" aria-label="Thêm vào yêu thích"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#heart"/></svg></button>
            <span class="brand">${item.brand}</span>
            ${outOfStock ? '<span class="out-of-stock-badge">Hết hàng</span>' : ''}
            ${lowStock ? `<span class="low-stock-badge">Chỉ còn ${stockLeft}</span>` : ''}
            <img src="${item.image}" ${MS.srcsetAttrs(item.image)} alt="${item.name}" loading="lazy" decoding="async" style="${outOfStock ? 'opacity:.5' : ''}">
            <h3>${item.name}</h3>
            ${starsHTML}
            <div class="product-info">
                <div class="price">${item.price.toLocaleString('vi-VN')}đ</div>
                <div class="sold">Đã bán: ${item.sold ?? 0}</div>
            </div>
        </a>
    `;
}

/**
 * Vẽ danh sách sản phẩm ra lưới (grid). Dùng chung cho trang danh mục lẫn trang tìm kiếm
 * (products-search.js gọi lại đúng hàm này với container khác).
 * CƠ CHẾ: products.map(buildCardHTML) chạy buildCardHTML() cho TỪNG sản phẩm, tạo ra 1 mảng
 * chuỗi HTML, rồi .join('') nối tất cả lại thành 1 chuỗi lớn duy nhất, gán 1 lần vào innerHTML
 * (hiệu quả hơn nhiều so với việc thêm từng thẻ <div> một bằng appendChild trong vòng lặp).
 */
function renderList(products, container) {
    const target = container || gridContainer;
    if (!target) return;

    updateResultCount(products.length);

    if (products.length === 0) {
        target.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:#888; font-size:15px; line-height:1.8;">
            <svg class="icon icon-xl" aria-hidden="true"><use href="images/icons/lucide.svg#search-x"/></svg><br>Không tìm thấy sản phẩm nào phù hợp với bộ lọc đã chọn.<br>Hãy thử bỏ bớt điều kiện lọc nhé!
        </div>`;
        return;
    }

    target.innerHTML = products.map(buildCardHTML).join('');
}

// Hiện số lượng kết quả ngay trên tiêu đề trang, để thấy rõ bộ lọc có tác dụng thật
// Ghi thêm số lượng kết quả vào cuối tiêu đề, vd 'Mô hình Gundam (12)'.
// dataset.base lưu lại tiêu đề GỐC (chỉ lưu 1 lần) để mỗi lần lọc lại không bị nối chồng số cũ.
function updateResultCount(count) {
    const titleEl = document.querySelector('.products-title');
    if (!titleEl) return;
    if (!titleEl.dataset.base) titleEl.dataset.base = titleEl.textContent.trim();
    titleEl.textContent = `${titleEl.dataset.base} (${count})`;
}

// Hàm điều hướng đến trang chi tiết chung - LUÔN lưu đúng ID sản phẩm vừa bấm
// Điều hướng sang trang chi tiết sản phẩm. Vì không dùng router/URL param (kiểu ?id=...),
// project chọn cách lưu tạm id vào localStorage rồi trang products-detail.html sẽ tự đọc lại.
function goToDetail(id) {
    localStorage.setItem("clickProductId", id);
    window.location.href = "products-detail.html?id=" + encodeURIComponent(id);
}

// ================== BỘ LỌC + SẮP XẾP (trang danh mục) ==================

// Gom các checkbox đang được tick trong sidebar, nhóm theo tên (brand/series/studio/scale/category...)
/**
 * Gom tất cả checkbox bộ lọc đang được tick trong sidebar, nhóm lại theo thuộc tính 'name'
 * của checkbox (vd tất cả checkbox name='brand' gom vào groups.brand = [...]).
 * Kết quả: { brand: ['Bandai','Kotobukiya'], scale: ['1/144'] } chẳng hạn.
 */
function getCheckedFiltersByGroup() {
    const groups = {};
    document.querySelectorAll('.sidebar input[type="checkbox"]:checked').forEach(cb => {
        if (!groups[cb.name]) groups[cb.name] = [];
        groups[cb.name].push(cb.value);
    });
    return groups;
}

// Sản phẩm phải khớp ít nhất 1 giá trị trong MỖI nhóm đang lọc (AND giữa các nhóm, OR trong 1 nhóm)
/**
 * Kiểm tra 1 sản phẩm có khớp bộ lọc hay không.
 * CƠ CHẾ LOGIC: dùng .every() để yêu cầu sản phẩm phải khớp ĐỦ MỌI NHÓM đang lọc (phép AND
 * giữa các nhóm khác nhau, vd phải vừa đúng brand VỪA đúng scale), nhưng bên trong 1 nhóm chỉ
 * cần khớp ÍT NHẤT 1 giá trị là đủ (.some() = phép OR, vd brand Bandai HOẶC Kotobukiya).
 */
function productMatchesGroups(product, groups) {
    return Object.values(groups).every(values =>
        values.some(v => product.tags && product.tags.includes(v))
    );
}

// Đọc giá trị 2 ô nhập 'Từ giá' / 'Đến giá', trả về null nếu người dùng để trống
// (để executeFilterAndSort() biết là KHÔNG áp điều kiện giá đó, thay vì hiểu nhầm là giá = 0).
function getPriceRange() {
    const fromEl = document.getElementById('priceFrom');
    const toEl = document.getElementById('priceTo');
    return {
        from: fromEl && fromEl.value !== '' ? Number(fromEl.value) : null,
        to: toEl && toEl.value !== '' ? Number(toEl.value) : null
    };
}

/**
 * Sắp xếp lại danh sách sản phẩm theo lựa chọn trong dropdown 'Sắp xếp'.
 * CƠ CHẾ: [...list] tạo ra 1 MẢNG SAO CHÉP trước khi sort, để KHÔNG làm thay đổi mảng gốc
 * loadedProducts (nếu sort thẳng trên mảng gốc, lọc theo tiêu chí khác sau đó có thể bị sai thứ tự).
 * switch...case chọn kiểu so sánh phù hợp: số (giá) dùng phép trừ a-b, chữ (tên) dùng localeCompare
 * để so sánh đúng theo bảng chữ cái tiếng Việt có dấu.
 */
function applySort(list, sortValue) {
    const arr = [...list];
    switch (sortValue) {
        case 'Giá: Thấp đến cao': arr.sort((a, b) => a.price - b.price); break;
        case 'Giá: Cao đến thấp': arr.sort((a, b) => b.price - a.price); break;
        case 'Tên: A-Z': arr.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
        case 'Tên: Z-A': arr.sort((a, b) => b.name.localeCompare(a.name, 'vi')); break;
        case 'Mới nhất': arr.reverse(); break;
        default: break; // "Sắp xếp: Mặc định"
    }
    return arr;
}

/**
 * Hàm điều phối chính: mỗi khi người dùng đổi bộ lọc/giá/sắp xếp, hàm này chạy lại TOÀN BỘ
 * pipeline: lọc theo tag -> lọc theo giá -> sắp xếp -> vẽ lại danh sách.
 * Luôn bắt đầu lại từ loadedProducts (danh sách GỐC chưa lọc) để các bộ lọc không bị cộng dồn sai.
 */
function executeFilterAndSort() {
    let result = [...loadedProducts];

    const groups = getCheckedFiltersByGroup();
    if (Object.keys(groups).length) {
        result = result.filter(p => productMatchesGroups(p, groups));
    }

    const { from, to } = getPriceRange();
    if (from !== null) result = result.filter(p => p.price >= from);
    if (to !== null) result = result.filter(p => p.price <= to);

    const sortEl = document.querySelector('.sort-select');
    if (sortEl) result = applySort(result, sortEl.value);

    renderList(result);
}

// Lắng nghe sự kiện: tick checkbox lọc ngay lập tức, giá + nút áp dụng, đổi sắp xếp
// (chỉ gắn trên trang danh mục thật - trang tìm kiếm tự xử lý riêng trong products-search.html)
if (gridContainer && pageCategory) {
    document.querySelectorAll('.sidebar input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', executeFilterAndSort);
    });
    document.querySelector('.filter-btn')?.addEventListener('click', executeFilterAndSort);
    document.querySelector('.sort-select')?.addEventListener('change', executeFilterAndSort);
    ['priceFrom', 'priceTo'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') executeFilterAndSort();
        });
    });
}