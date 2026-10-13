let currentProduct = null; // sản phẩm đang xem, dùng cho addToCart/buyNow
let allProductsData = []; // toàn bộ danh sách sản phẩm, dùng để gợi ý "Sản phẩm liên quan"

        // Tên hiển thị cho từng category, dùng cho breadcrumb
        const categoryNames = {
            gundam: 'Gundam',
            anime: 'Mô hình Anime',
            car: 'Siêu xe',
            tools: 'Dụng cụ'
        };
        const categoryLinks = {
            gundam: 'products-gundam.html',
            anime: 'products-anime.html',
            car: 'products-car.html',
            tools: 'products-tools.html'
        };

        // 1. Tải dữ liệu sản phẩm thật theo id đã lưu khi bấm "Xem chi tiết"
        /**
         * Tải thông tin chi tiết của sản phẩm vừa được bấm vào.
         * CƠ CHẾ: vì không dùng router (kiểu /product/:id), trang danh sách (products.js -> goToDetail)
         * lưu tạm id sản phẩm vào localStorage TRƯỚC KHI chuyển trang; ở đây ta đọc lại đúng id đó,
         * rồi tìm trong toàn bộ danh sách sản phẩm (ShopCore.loadProducts) sản phẩm có id trùng khớp.
         */
        function loadProductDetail() {
            // Ưu tiên ?id=... trên địa chỉ (link chia sẻ được), không có thì dùng id lưu tạm như trước
            const productId = new URLSearchParams(location.search).get('id') || localStorage.getItem('clickProductId');

            ShopCore.loadProducts()
                .then(data => {
                    allProductsData = data; // lưu lại toàn bộ danh sách để render "Sản phẩm liên quan"
                    const product = data.find(p => p.id === productId);
                    if (!product) {
                        // Không tìm thấy sản phẩm (vd: vào trực tiếp products-detail.html không qua click)
                        document.querySelector('.product-detail').innerHTML =
                            '<div style="padding:60px; text-align:center; width:100%;">Không tìm thấy sản phẩm. <a href="index.html" style="color:#ff2a2a;">Về trang chủ</a></div>';
                        return;
                    }
                    currentProduct = product;
                    renderProduct(product);
                })
                .catch(err => console.error('Lỗi tải sản phẩm:', err));
        }

        // 2. Đổ dữ liệu sản phẩm thật ra toàn bộ trang
        /**
         * Đổ toàn bộ dữ liệu của 1 sản phẩm ra khắp các phần của trang chi tiết: breadcrumb, ảnh,
         * tên, giá, tags, mô tả, thông số kỹ thuật, và trạng thái tồn kho (khoá nút mua nếu hết hàng).
         * Đây là 1 hàm 'render' điển hình: KHÔNG tính toán gì phức tạp, chỉ lấy field trong object
         * product rồi gán vào .textContent / .src / .innerHTML của từng phần tử HTML tương ứng.
         */
        function renderProduct(product) {
            document.title = product.name + ' - MODEL SHOP';

            // Breadcrumb
            document.getElementById('breadcrumbName').textContent = product.name;
            const catLink = document.getElementById('breadcrumbCategory');
            catLink.textContent = categoryNames[product.category] || product.category;
            catLink.href = categoryLinks[product.category] || 'index.html';

            // Ảnh sản phẩm - dùng đúng 1 ảnh duy nhất, giống hệt ảnh đã hiện ở trang danh sách
            document.getElementById('mainImage').src = product.image;
            document.getElementById('mainImage').alt = product.name;

            // Tiêu đề + giá
            document.getElementById('productTitle').textContent = product.name;
            document.title = product.name + ' - MODEL SHOP';
            document.getElementById('productPrice').textContent = product.price.toLocaleString('vi-VN') + 'đ';

            // Tags - hiện dạng thẻ nhỏ, đồng thời chính là dữ liệu dùng để lọc/tìm kiếm
            const tagsEl = document.getElementById('productTags');
            tagsEl.innerHTML = (product.tags || []).map(t => `<span class="tag-badge">${t}</span>`).join('');

            // Mô tả
            document.getElementById('descTitle').textContent = product.name;
            document.getElementById('descText').textContent = product.description;

            // Thông số kỹ thuật
            document.getElementById('specName').textContent = product.name;
            document.getElementById('specBrand').textContent = product.brand;
            document.getElementById('specDetail').textContent = product.spec;

            // ---- TỒN KHO: hiện "Còn hàng (x)" hoặc "Hết hàng", khoá nút mua nếu hết ----
            const stock = ShopCore.getStock(product);
            const statusEl = document.querySelector('.product-status');
            const qtyInput = document.getElementById('qtyInput');
            const addBtn = document.querySelector('.btn-primary');
            const buyBtn = document.querySelector('.btn-secondary');

            if (stock <= 0) {
                statusEl.textContent = 'Hết hàng';
                statusEl.style.color = '#999';
                qtyInput.disabled = true;
                addBtn.disabled = true;
                buyBtn.disabled = true;
                addBtn.style.opacity = buyBtn.style.opacity = 0.5;
                addBtn.style.cursor = buyBtn.style.cursor = 'not-allowed';
            } else {
                if (stock <= 5) {
                    statusEl.textContent = `Chỉ còn ${stock} sản phẩm - sắp hết hàng!`;
                    statusEl.style.color = '#ff9800';
                } else {
                    statusEl.textContent = `Còn hàng (${stock} sản phẩm)`;
                }
                qtyInput.max = stock; // giới hạn ô nhập số lượng theo tồn kho
            }

            // ---- ĐÁNH GIÁ: tải review từ Firestore rồi mới vẽ điểm trung bình + danh sách ----
            // (loadReviews đọc Firestore và đổ vào cache; renderReviews đọc cache đó, giữ nguyên
            // như code cũ - chỉ thêm bước tải trước vì dữ liệu giờ nằm trên Firestore).
            ShopCore.loadReviews(product.id).then(() => renderReviews(product.id));

            // ---- SẢN PHẨM LIÊN QUAN & ĐỀ XUẤT ----
            renderRelatedProducts(product);
            renderSuggestedProducts(product);
        }

        // 3b. SẢN PHẨM LIÊN QUAN / ĐỀ XUẤT
        // Dựng HTML cho 1 thẻ sản phẩm gợi ý - dùng chung cho cả khối "liên quan" và "đề xuất".
        function buildRelatedCardHTML(p) {
            const outOfStock = window.ShopCore ? window.ShopCore.isOutOfStock(p) : false;
            return `
                <a class="related-product" href="javascript:void(0)" onclick="goToRelatedProduct('${p.id}')">
                    ${outOfStock ? '<span class="related-out-badge">Hết hàng</span>' : ''}
                    <img src="${p.image}" alt="${p.name}" loading="lazy" style="${outOfStock ? 'opacity:.5' : ''}">
                    <h4>${p.name}</h4>
                    <div class="related-price">${p.price.toLocaleString('vi-VN')}đ</div>
                </a>
            `;
        }

        // Xáo trộn ngẫu nhiên 1 mảng (dùng cho khối "Sản phẩm đề xuất")
        function shuffleArray(arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        /**
         * "Sản phẩm liên quan": chỉ tính là liên quan nếu sản phẩm khác trùng ÍT NHẤT 1 tag
         * CHỦ ĐỀ CỤ THỂ (vd: onepiece, dragonball, jjk, rg, hg...) - KHÔNG tính tag danh mục
         * lớn (anime/gundam/car/tools), để tránh việc "cùng là mô hình anime" đã bị coi là liên quan.
         * Nếu sản phẩm không có tag chủ đề riêng nào khớp, khối này sẽ tự ẩn đi.
         */
        function renderRelatedProducts(product) {
            const wrap = document.getElementById('relatedProducts');
            const grid = document.getElementById('relatedProductsGrid');
            if (!wrap || !grid) return;

            const MAX_RELATED = 4;
            const specificTags = (product.tags || []).filter(t => t !== product.category);

            let related = [];
            if (specificTags.length > 0) {
                related = allProductsData.filter(p =>
                    p.id !== product.id &&
                    (p.tags || []).some(t => specificTags.includes(t))
                );
            }
            related = related.slice(0, MAX_RELATED);

            if (related.length === 0) {
                wrap.style.display = 'none';
                return;
            }
            wrap.style.display = '';
            grid.innerHTML = related.map(buildRelatedCardHTML).join('');
        }

        /**
         * "Sản phẩm đề xuất": KHÔNG quan tâm danh mục hay chủ đề, sản phẩm nào cũng có thể
         * được gợi ý - chỉ loại trừ đúng sản phẩm đang xem, chọn ngẫu nhiên trong toàn shop.
         */
        function renderSuggestedProducts(product) {
            const wrap = document.getElementById('suggestedProducts');
            const grid = document.getElementById('suggestedProductsGrid');
            if (!wrap || !grid) return;

            const MAX_SUGGESTED = 4;
            const pool = allProductsData.filter(p => p.id !== product.id);
            const suggested = shuffleArray(pool).slice(0, MAX_SUGGESTED);

            if (suggested.length === 0) {
                wrap.style.display = 'none';
                return;
            }
            wrap.style.display = '';
            grid.innerHTML = suggested.map(buildRelatedCardHTML).join('');
        }

        // Chuyển sang xem chi tiết 1 sản phẩm gợi ý: lưu lại id rồi tải lại đúng trang này
        // (giống cơ chế goToDetail() ở products.js), để load lại toàn bộ dữ liệu cho sản phẩm mới.
        function goToRelatedProduct(id) {
            localStorage.setItem('clickProductId', id);
            window.location.href = 'products-detail.html?id=' + encodeURIComponent(id);
        }

        // Tăng giảm số lượng, không vượt quá tồn kho hiện có
        // Tăng/giảm số lượng muốn mua (nút - / +), giới hạn trong khoảng [1, số lượng còn trong kho].
        function changeQty(delta) {
            const input = document.getElementById('qtyInput');
            const maxStock = currentProduct ? ShopCore.getStock(currentProduct) : 999;
            let val = parseInt(input.value) + delta;
            if (val < 1) val = 1;
            if (val > maxStock) val = maxStock; // không cho chọn quá số lượng còn trong kho
            input.value = val;
        }

        // 4. Thêm vào giỏ hàng thật - lưu qua ShopCore (cùng cấu trúc với products.js)
        /**
         * Thêm sản phẩm đang xem vào giỏ hàng thật.
         * CƠ CHẾ: kiểm tra getRemainingStock() (tồn kho trừ đi phần ĐÃ CÓ SẴN trong giỏ) trước khi
         * cho thêm, để không vượt quá số lượng thực tế còn trong kho dù thêm nhiều lần.
         * Có kèm đoạn 'fallback' phòng trường hợp shop-core.js lỡ chưa kịp nạp xong (hiếm khi xảy ra),
         * tự viết lại logic thêm giỏ hàng tối giản ngay tại đây.
         */
        function addToCart() {
            if (!currentProduct) return;
            const qty = parseInt(document.getElementById('qtyInput').value) || 1;

            if (typeof ShopCore !== 'undefined') {
                // Kiểm tra số lượng muốn thêm có vượt quá tồn kho còn lại không
                // (tính luôn cả những gì đã có sẵn trong giỏ, xem hàm getRemainingStock trong shop-core.js)
                const remaining = ShopCore.getRemainingStock(currentProduct);
                if (qty > remaining) {
                    ShopCore.toast(`Chỉ còn ${remaining} sản phẩm trong kho, không thể thêm ${qty}!`);
                    return;
                }
                ShopCore.addToCart(currentProduct.id, qty);
                ShopCore.toast('Đã thêm "' + currentProduct.name + '" vào giỏ hàng!');
            } else {
                // fallback nếu shop-core.js chưa kịp nạp
                // (giỏ hàng vẫn phải lưu riêng theo từng tài khoản, không dùng chung key "cart")
                let currentUser = null;
                try { currentUser = JSON.parse(localStorage.getItem('currentUser')); } catch (e) { }
                const cartKey = currentUser && currentUser.username ? 'cart_' + currentUser.username : 'cart_guest';
                let cart = JSON.parse(localStorage.getItem(cartKey)) || [];
                const existingItem = cart.find(i => i.id === currentProduct.id);
                if (existingItem) existingItem.quantity += qty;
                else cart.push({ id: currentProduct.id, quantity: qty });
                localStorage.setItem(cartKey, JSON.stringify(cart));
                alert('Đã thêm "' + currentProduct.name + '" vào giỏ hàng!');
            }

            if (typeof syncCartCount === 'function') syncCartCount();
        }

        // 5. Mua ngay - thêm vào giỏ, chỉ chọn đúng sản phẩm này để thanh toán ngay
        // 'Mua ngay': KHÔNG đụng đến giỏ hàng đã lưu, chỉ lưu tạm đúng 1 sản phẩm này vào 'checkoutItems'
        // rồi chuyển thẳng sang trang checkout - khác với addToCart() là phải thêm vào giỏ trước.
        function buyNow() {
            if (!currentProduct) return;
            const qty = parseInt(document.getElementById('qtyInput').value) || 1;

            if (typeof ShopCore !== 'undefined') {
                const remaining = ShopCore.getRemainingStock(currentProduct);
                if (qty > remaining) {
                    ShopCore.toast(`Chỉ còn ${remaining} sản phẩm trong kho, không thể mua ${qty}!`);
                    return;
                }
            }
            // "Mua ngay" chỉ chuyển thẳng sang thanh toán với đúng 1 sản phẩm này,
            // KHÔNG được thêm vào giỏ hàng đã lưu (giỏ chỉ thay đổi khi bấm "Thêm vào giỏ").
            localStorage.setItem('checkoutItems', JSON.stringify([{ id: currentProduct.id, quantity: qty }]));
            window.location.href = 'checkout.html';
        }

        // 6. Chuyển tab
        // Chuyển tab (Mô tả / Thông số / Đánh giá): xoá class 'active' của MỌI tab và nội dung,
        // rồi chỉ thêm lại 'active' cho đúng tab vừa bấm và nội dung tương ứng (kiểu tab UI cổ điển).
        function switchTab(event, tabId) {
            var tabs = document.querySelectorAll('.tab-btn');
            for (var i = 0; i < tabs.length; i++) {
                tabs[i].classList.remove('active');
            }

            var contents = document.querySelectorAll('.tab-content');
            for (var i = 0; i < contents.length; i++) {
                contents[i].classList.remove('active');
            }

            event.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        // 7. ĐÁNH GIÁ & XẾP HẠNG SAO
        // Vẽ lại toàn bộ tab "Đánh giá": điểm trung bình, danh sách bình luận, và form gửi đánh giá mới.
        /**
         * Vẽ lại toàn bộ tab 'Đánh giá': điểm trung bình + sao, danh sách bình luận, và form gửi đánh giá.
         * CƠ CHẾ QUYỀN ĐÁNH GIÁ (giống các sàn TMĐT thật): form chỉ hiện ra khi (1) đã đăng nhập VÀ
         * (2) ShopCore.hasPurchased() xác nhận user đã có đơn 'Hoàn thành' chứa đúng sản phẩm này.
         * Nếu thiếu 1 trong 2 điều kiện, hiển thị thông báo hướng dẫn thay vì form.
         */
        function renderReviews(productId) {
            const summary = ShopCore.getRatingSummary(productId);
            const reviews = ShopCore.getReviews(productId);
            const user = ShopCore.getCurrentUser();

            // -- Phần tóm tắt điểm trung bình --
            document.getElementById('reviewSummary').innerHTML = `
                <div class="review-average">${summary.average || '0.0'}<span>/5</span></div>
                <div class="review-average-stars">${ShopCore.renderStars(summary.average)}</div>
                <div class="review-count">${summary.count} lượt đánh giá</div>
            `;

            // -- Phần danh sách từng đánh giá --
            const listEl = document.getElementById('reviewList');
            if (reviews.length === 0) {
                listEl.innerHTML = '<p style="color:#999;">Chưa có đánh giá nào cho sản phẩm này. Hãy là người đầu tiên!</p>';
            } else {
                listEl.innerHTML = reviews.map(r => `
                    <div class="review-item">
                        <div class="review-item-head">
                            <strong>${MS.esc(r.username)}</strong>
                            <span class="review-item-stars">${ShopCore.renderStars(r.rating)}</span>
                            <span class="review-item-date">${ShopCore.timeAgo(r.createdAt)}</span>
                        </div>
                        ${r.comment ? `<p class="review-item-comment">${MS.esc(r.comment)}</p>` : ''}
                        ${(r.images && r.images.length) ? `<div class="review-photos">${r.images.map(src => `<img src="${MS.esc(src)}" alt="Ảnh khách hàng chụp" loading="lazy" onclick="zoomReviewPhoto(this.src)">`).join('')}</div>` : ''}
                    </div>
                `).join('');
            }

            // -- Phần form gửi đánh giá --
            // Chỉ cho gửi khi: (1) đã đăng nhập, VÀ (2) đã có đơn hàng "Hoàn thành" chứa sản phẩm này.
            // Đây là quy tắc giống các sàn TMĐT thật: phải mua và nhận hàng mới được đánh giá.
            const formWrap = document.getElementById('reviewFormWrap');
            if (!user) {
                formWrap.innerHTML = '<p style="color:#999;">Vui lòng <a href="signin.html" style="color:#dc2626;">đăng nhập</a> để gửi đánh giá.</p>';
                return;
            }
            // ShopCore.hasPurchased() giờ hỏi Firestore nên trả về 1 Promise<boolean>
            // (trước đây trả thẳng true/false vì đơn hàng nằm sẵn trong localStorage).
            formWrap.innerHTML = '<p style="color:#999;">Đang kiểm tra quyền đánh giá...</p>';
            ShopCore.hasPurchased(user.username, productId).then(purchased => {
                if (!purchased) {
                    formWrap.innerHTML = '<p style="color:#999;">Bạn cần mua và <a href="orders.html" style="color:#dc2626;">xác nhận đã nhận</a> sản phẩm này thì mới có thể đánh giá.</p>';
                    return;
                }
                formWrap.innerHTML = `
                    <h4>Viết đánh giá của bạn</h4>
                    <select id="reviewRatingInput" class="review-select">
                        <option value="5">5 sao - Tuyệt vời</option>
                        <option value="4">4 sao - Tốt</option>
                        <option value="3">3 sao - Bình thường</option>
                        <option value="2">2 sao - Không hài lòng</option>
                        <option value="1">1 sao - Tệ</option>
                    </select>
                    <textarea id="reviewCommentInput" class="review-textarea" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."></textarea>
                    <div class="review-photo-row">
                        <label class="review-photo-btn"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#camera"/></svg> Thêm ảnh thực tế (tối đa 3)
                            <input type="file" id="reviewPhotoInput" accept="image/*" multiple hidden>
                        </label>
                        <div id="reviewPhotoPreviews" class="review-photo-previews"></div>
                    </div>
                    <button class="btn-primary" onclick="submitReview('${productId}')">Gửi đánh giá</button>
                `;
            });
        }

        // Xử lý khi bấm nút "Gửi đánh giá"
        // Gửi đánh giá mới. ShopCore.addReview() tự kiểm tra LẠI điều kiện 'đã mua & nhận hàng'
        // (không chỉ tin vào việc form có đang hiện ra hay không, phòng người dùng sửa tay HTML/DevTools).
        function submitReview(productId) {
            const user = ShopCore.getCurrentUser();
            if (!user) return; // phòng hờ, form đã ẩn nếu chưa đăng nhập

            const rating = document.getElementById('reviewRatingInput').value;
            const comment = document.getElementById('reviewCommentInput').value;

            // addReview() sẽ tự kiểm tra lại điều kiện "đã mua & nhận hàng" 1 lần nữa ở shop-core.js
            // (không chỉ tin vào việc form có hiện ra hay không, phòng trường hợp user sửa tay HTML).
            // Giờ hasPurchased() hỏi Firestore nên addReview() cũng trả về 1 Promise -> dùng .then().
            ShopCore.addReview(productId, {
                username: user.username || user.name || 'Ẩn danh',
                rating: rating,
                comment: comment,
                images: reviewPhotos
            }).then(result => {
                if (!result.success) {
                    ShopCore.toast('Bạn cần mua và nhận hàng sản phẩm này trước khi đánh giá!');
                    return;
                }
                ShopCore.toast('Cảm ơn bạn đã đánh giá sản phẩm!');
                reviewPhotos = [];
                renderReviews(productId); // vẽ lại để thấy ngay đánh giá vừa gửi
            });
        }

        // ---- Ảnh trong đánh giá: nén còn 800px rồi lưu base64 (tối đa 3 ảnh) ----
        let reviewPhotos = [];

        function compressReviewPhoto(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = reject;
                reader.onload = () => {
                    const img = new Image();
                    img.onerror = reject;
                    img.onload = () => {
                        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
                        const c = document.createElement('canvas');
                        c.width = Math.round(img.width * scale);
                        c.height = Math.round(img.height * scale);
                        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                        resolve(c.toDataURL('image/jpeg', 0.7));
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
            });
        }

        function renderReviewPhotoPreviews() {
            const box = document.getElementById('reviewPhotoPreviews');
            if (!box) return;
            box.innerHTML = reviewPhotos.map((src, i) => `
                <div class="pv"><img src="${src}" alt="Ảnh ${i + 1}"><button type="button" aria-label="Xoá ảnh ${i + 1}" onclick="removeReviewPhoto(${i})"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#x"/></svg></button></div>
            `).join('');
        }

        function removeReviewPhoto(i) {
            reviewPhotos.splice(i, 1);
            renderReviewPhotoPreviews();
        }

        document.addEventListener('change', function (e) {
            if (!e.target || e.target.id !== 'reviewPhotoInput') return;
            const files = Array.from(e.target.files).slice(0, 3 - reviewPhotos.length);
            Promise.all(files.map(compressReviewPhoto)).then(list => {
                reviewPhotos = reviewPhotos.concat(list).slice(0, 3);
                renderReviewPhotoPreviews();
            }).catch(() => ShopCore.toast('Không đọc được ảnh đã chọn'));
            e.target.value = '';
        });

        // Phóng to ảnh của khách: dùng lại khung xem ảnh toàn màn hình (.g-lightbox)
        function zoomReviewPhoto(src) {
            const box = document.createElement('div');
            box.className = 'g-lightbox';
            box.innerHTML = '<button type="button" class="g-lb-close" aria-label="Đóng"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#x"/></svg></button><div class="g-lb-scroll"><img alt=""></div>';
            box.querySelector('img').src = src;
            box.addEventListener('click', () => box.remove());
            document.body.appendChild(box);
        }

        loadProductDetail();
