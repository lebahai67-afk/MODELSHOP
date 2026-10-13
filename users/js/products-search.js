// Logic riêng cho trang tìm kiếm toàn site.
        // Tái sử dụng renderList() / applySort() / goToDetail() đã có sẵn trong products.js,
        // chỉ viết thêm phần: đọc ?q=, so khớp không phân biệt dấu, lọc theo Danh mục đã chọn.
        let allProducts = [];
        const searchParams = new URLSearchParams(window.location.search);
        const query = (searchParams.get('q') || '').trim();

        // Bỏ dấu tiếng Việt để so khớp linh hoạt (gõ có dấu hay không dấu đều tìm ra)
        /**
         * Bỏ dấu tiếng Việt để so khớp linh hoạt (gõ 'gundam' hay 'Gundam' hay có dấu đều tìm ra).
         * CƠ CHẾ: .normalize('NFD') tách ký tự có dấu thành 2 phần (chữ cái + dấu riêng biệt),
         * rồi regex /[\u0300-\u036f]/g xoá hết các ký tự 'dấu' đó (thuộc khối Unicode Combining
         * Diacritical Marks). Riêng chữ 'đ' phải thay tay vì nó không tách được theo cách NFD.
         */
        function normalizeVN(str) {
            return (str || '').toString()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd').replace(/Đ/g, 'D')
                .toLowerCase();
        }

        // Ghép tên + thương hiệu + danh mục + tags của sản phẩm thành 1 chuỗi lớn (haystack),
        // bỏ dấu, rồi kiểm tra chuỗi tìm kiếm (q) có nằm trong đó không (includes = tìm chuỗi con).
        function textMatches(product, q) {
            const haystack = normalizeVN(
                [product.name, product.brand, product.category, ...(product.tags || [])].join(' ')
            );
            return haystack.includes(normalizeVN(q));
        }

        // Lấy danh sách các danh mục (checkbox name='cat') đang được tick trong bộ lọc trang tìm kiếm.
        function getCheckedCats() {
            return Array.from(document.querySelectorAll('input[name="cat"]:checked')).map(cb => cb.value);
        }

        // Giống getPriceRange() trong products.js: đọc khoảng giá lọc, trả null nếu để trống.
        function getSearchPriceRange() {
            const fromEl = document.getElementById('priceFrom');
            const toEl = document.getElementById('priceTo');
            return {
                from: fromEl && fromEl.value !== '' ? Number(fromEl.value) : null,
                to: toEl && toEl.value !== '' ? Number(toEl.value) : null
            };
        }

        /**
         * Hàm chính của trang tìm kiếm: chạy toàn bộ pipeline tìm kiếm + lọc + sắp xếp + vẽ kết quả.
         * CƠ CHẾ: bắt đầu từ allProducts (toàn bộ sản phẩm), lọc theo từ khoá (textMatches),
         * lọc tiếp theo danh mục đã tick, lọc theo khoảng giá, rồi TÁI SỬ DỤNG applySort() và
         * renderList() đã viết sẵn trong products.js (2 file này nạp chung 1 trang nên dùng chung hàm được).
         */
        function runSearch() {
            const grid = document.getElementById('search-grid');
            const titleEl = document.getElementById('searchTitle');

            if (!query) {
                titleEl.textContent = 'Kết quả tìm kiếm';
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:#888; font-size:15px;">
                    Nhập từ khoá vào ô tìm kiếm phía trên để bắt đầu tìm sản phẩm nhé
                </div>`;
                return;
            }

            let result = allProducts.filter(p => textMatches(p, query));

            const cats = getCheckedCats();
            if (cats.length) result = result.filter(p => cats.includes(p.category));

            const { from, to } = getSearchPriceRange();
            if (from !== null) result = result.filter(p => p.price >= from);
            if (to !== null) result = result.filter(p => p.price <= to);

            const sortEl = document.querySelector('.sort-select');
            if (sortEl) result = applySort(result, sortEl.value);

            renderList(result, grid);
            titleEl.textContent = `Kết quả tìm kiếm cho "${query}" (${result.length})`;
        }

        const headerInput = document.getElementById('siteSearchInput');
        if (headerInput) headerInput.value = query;

        ShopCore.loadProducts()
            .then(data => {
                allProducts = data;
                runSearch();
            })
            .catch(err => console.error('Lỗi nạp dữ liệu sản phẩm: ', err));

        document.querySelectorAll('input[name="cat"]').forEach(cb => cb.addEventListener('change', runSearch));
        document.querySelector('.filter-btn')?.addEventListener('click', runSearch);
        document.querySelector('.sort-select')?.addEventListener('change', runSearch);
        ['priceFrom', 'priceTo'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => {
                if (e.key === 'Enter') runSearch();
            });
        });
