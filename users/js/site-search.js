// site-search.js
// Thanh tìm kiếm: gõ tới đâu tìm/gợi ý ngay tới đó (live search), có debounce nhẹ
// để không load liên tục quá đà. Enter hoặc bấm nút vẫn chuyển sang trang kết quả đầy đủ.

document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('siteSearchInput');
    const btn = document.getElementById('siteSearchBtn');
    if (!input || !btn) return;

    const searchBar = input.closest('.search-bar') || input.parentElement;
    searchBar.style.position = searchBar.style.position || 'relative';

    // ---- Tạo khung dropdown gợi ý ----
    injectLiveSearchStyle();
    const dropdown = document.createElement('div');
    dropdown.className = 'live-search-dropdown';
    dropdown.id = 'liveSearchDropdown';
    searchBar.appendChild(dropdown);

    let products = null;
    let debounceTimer = null;
    let activeIndex = -1;

    // Chỉ tải products.json ĐÚNG 1 LẦN (cache vào biến 'products'), những lần gõ tìm kiếm sau
    // tái sử dụng luôn dữ liệu đã có sẵn trong bộ nhớ, không tải lại nhiều lần gây chậm.
    function ensureProducts() {
        if (products) return Promise.resolve(products);
        return ShopCore.loadProducts()
            .then(data => { products = data; return data; })
            .catch(() => { products = []; return []; });
    }

    function normalize(str) {
        return (str || '').toString().toLowerCase();
    }

    // Tìm tối đa 7 sản phẩm có tên hoặc thương hiệu chứa từ khoá (không phân biệt hoa/thường).
    function search(query) {
        const q = normalize(query).trim();
        if (!q) return [];
        return products
            .filter(p => normalize(p.name).includes(q) || normalize(p.brand).includes(q))
            .slice(0, 7);
    }

    // Vẽ danh sách gợi ý xổ xuống bên dưới ô tìm kiếm, kèm bôi vàng (highlight) phần chữ khớp.
    function renderDropdown(results, query) {
        activeIndex = -1;
        if (!query) {
            dropdown.classList.remove('show');
            dropdown.innerHTML = '';
            return;
        }
        if (results.length === 0) {
            dropdown.innerHTML = `<div class="ls-empty">Không tìm thấy sản phẩm nào khớp với "${escapeHtml(query)}"</div>`;
            dropdown.classList.add('show');
            return;
        }
        dropdown.innerHTML = results.map((p, i) => `
            <div class="ls-item" data-id="${p.id}" data-index="${i}">
                <img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy">
                <div class="ls-info">
                    <div class="ls-name">${highlightMatch(p.name, query)}</div>
                    <div class="ls-price">${p.price.toLocaleString('vi-VN')}đ</div>
                </div>
            </div>
        `).join('') + `<div class="ls-viewall" id="lsViewAll">Xem tất cả kết quả cho "${escapeHtml(query)}"</div>`;
        dropdown.classList.add('show');

        dropdown.querySelectorAll('.ls-item').forEach(el => {
            el.addEventListener('click', () => {
                localStorage.setItem('clickProductId', el.dataset.id);
                window.location.href = 'products-detail.html?id=' + encodeURIComponent(el.dataset.id);
            });
        });
        const viewAll = document.getElementById('lsViewAll');
        if (viewAll) viewAll.addEventListener('click', () => goSearch());
    }

    /**
     * Chống lỗi hiển thị / chống XSS đơn giản: biến ký tự đặc biệt (<, >, &...) thành dạng an toàn
     * để chèn vào HTML mà không bị trình duyệt hiểu nhầm thành thẻ HTML thật.
     * MẸO: gán text vào .textContent của 1 <div> tạm rồi đọc lại .innerHTML - trình duyệt sẽ tự
     * encode giúp mình, không cần tự viết regex thay thế từng ký tự.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Bọc thẻ <mark> quanh đúng đoạn tên sản phẩm khớp với từ khoá, để bôi vàng nổi bật trong dropdown.
    function highlightMatch(name, query) {
        const safe = escapeHtml(name);
        const idx = normalize(name).indexOf(normalize(query));
        if (idx === -1) return safe;
        const before = escapeHtml(name.slice(0, idx));
        const match = escapeHtml(name.slice(idx, idx + query.length));
        const after = escapeHtml(name.slice(idx + query.length));
        return `${before}<mark>${match}</mark>${after}`;
    }

    /**
     * Chạy mỗi khi người dùng gõ vào ô tìm kiếm.
     * CƠ CHẾ DEBOUNCE: nếu gọi tìm kiếm ngay mỗi lần gõ 1 ký tự sẽ rất tốn hiệu năng khi gõ nhanh.
     * Debounce = huỷ bộ đếm giờ (clearTimeout) mỗi lần có ký tự mới, chỉ THỰC SỰ tìm kiếm sau khi
     * người dùng NGỪNG gõ được 150ms - giảm số lần xử lý mà người dùng vẫn thấy 'mượt'.
     */
    function handleInput() {
        const query = input.value;
        clearTimeout(debounceTimer);
        if (!query.trim()) {
            renderDropdown([], '');
            return;
        }
        // Debounce ngắn (150ms) - vẫn cảm giác "gõ tới đâu ra tới đó" nhưng đỡ giật khi gõ nhanh
        debounceTimer = setTimeout(() => {
            ensureProducts().then(() => {
                renderDropdown(search(query), query);
            });
        }, 150);
    }

    // Di chuyển mục đang được chọn (bằng phím mũi tên lên/xuống) trong danh sách gợi ý.
    // Dùng phép chia lấy dư (%) để 'quay vòng': ở cuối danh sách bấm xuống sẽ quay về đầu.
    function moveActive(delta) {
        const items = Array.from(dropdown.querySelectorAll('.ls-item'));
        if (items.length === 0) return;
        items[activeIndex]?.classList.remove('active');
        activeIndex = (activeIndex + delta + items.length) % items.length;
        items[activeIndex].classList.add('active');
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    // Chuyển sang trang kết quả tìm kiếm đầy đủ (products-search.html), truyền từ khoá qua URL
    // dạng query string (?q=...). encodeURIComponent() để tránh lỗi khi từ khoá có ký tự đặc biệt.
    function goSearch() {
        const q = input.value.trim();
        if (!q) return;
        dropdown.classList.remove('show');
        window.location.href = 'products-search.html?q=' + encodeURIComponent(q);
    }

    input.addEventListener('input', handleInput);
    input.addEventListener('focus', () => { if (input.value.trim()) handleInput(); });
    input.addEventListener('keydown', function (e) {
        const items = dropdown.querySelectorAll('.ls-item');
        if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); moveActive(1); }
        else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); moveActive(-1); }
        else if (e.key === 'Enter') {
            if (activeIndex > -1 && items[activeIndex]) {
                items[activeIndex].click();
            } else {
                goSearch();
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    });
    btn.addEventListener('click', goSearch);

    document.addEventListener('click', function (e) {
        if (!searchBar.contains(e.target)) dropdown.classList.remove('show');
    });

    // Chèn CSS cho khung dropdown gợi ý vào <head>, chỉ chèn 1 lần dù hàm này gọi nhiều lần.
    function injectLiveSearchStyle() {
        if (document.getElementById('live-search-style')) return;
        const style = document.createElement('style');
        style.id = 'live-search-style';
        style.textContent = `
            .live-search-dropdown {
                display: none; position: absolute; top: 100%; left: 0; right: 0; margin-top: 8px;
                background: #14100f; border: 1px solid rgba(255,42,42,0.4); border-radius: 10px;
                box-shadow: 0 12px 28px rgba(0,0,0,0.55); z-index: 3000; overflow: hidden;
                max-height: 420px; overflow-y: auto; text-align: left;
            }
            .live-search-dropdown.show { display: block; }
            .ls-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; }
            .ls-item:hover, .ls-item.active { background: rgba(255,42,42,0.12); }
            .ls-item img { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; flex-shrink: 0; background:#222; }
            .ls-info { min-width: 0; }
            .ls-name { font-size: 13.5px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ls-name mark { background: rgba(255,42,42,0.5); color: #fff; border-radius: 2px; }
            .ls-price { font-size: 12.5px; color: #ff8080; margin-top: 2px; }
            .ls-empty { padding: 16px; text-align: center; color: #999; font-size: 13px; }
            .ls-viewall { padding: 10px 14px; text-align: center; font-size: 13px; color: #ff8080; cursor: pointer; border-top: 1px solid rgba(255,255,255,0.08); }
            .ls-viewall:hover { background: rgba(255,42,42,0.12); }
        `;
        document.head.appendChild(style);
    }
});