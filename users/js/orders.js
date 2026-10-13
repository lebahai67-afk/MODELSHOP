let allOrders = [];
        let currentFilter = 'all';

        // Hàm tiện ích định dạng tiền kiểu VN, dùng lặp lại nhiều nơi trong file này.
        function money(n) { return n.toLocaleString('vi-VN') + 'đ'; }

        // Map từ TÊN trạng thái (tiếng Việt, lưu trong dữ liệu đơn hàng) sang TÊN class CSS tương ứng
        // (để tô màu badge khác nhau cho mỗi trạng thái) - switch...case là cách viết map đơn giản, dễ đọc.
        function statusClass(status) {
            switch (status) {
                case 'Chờ xác nhận': return 'status-pending';
                case 'Đã xác nhận': return 'status-confirmed';
                case 'Đang giao': return 'status-shipping';
                case 'Hoàn thành': return 'status-done';
                case 'Yêu cầu trả hàng': return 'status-returning';
                case 'Đã trả hàng': return 'status-returned';
                case 'Đã hủy': return 'status-cancelled';
                default: return 'status-pending';
            }
        }

        /**
         * Vẽ toàn bộ danh sách đơn hàng của người dùng đang đăng nhập.
         * CƠ CHẾ: nếu chưa đăng nhập -> hiện thông báo mời đăng nhập, dừng luôn.
         * Nếu đã đăng nhập -> lấy TẤT CẢ đơn của user này (ShopCore.getOrdersForUser), lọc tiếp theo
         * tab đang chọn (currentFilter: 'all' hoặc 1 trạng thái cụ thể), rồi build HTML cho từng đơn.
         * Mỗi đơn hiển thị: mã đơn, trạng thái, danh sách sản phẩm, địa chỉ giao (ẩn/hiện được),
         * tổng tiền, và các nút hành động phù hợp (xem renderOrderActions bên dưới).
         */
        // Vẽ danh sách đơn từ mảng allOrders ĐANG CÓ SẴN trong bộ nhớ (được nạp real-time bởi
        // ShopCore.watchOrdersForUser() ở dưới cùng file này) - hàm này KHÔNG tự đi hỏi Firestore nữa.
        // Tiến trình đơn hàng: Chờ xác nhận -> Đã xác nhận -> Đang giao -> Hoàn thành (+ Trả hàng)
        function renderTimeline(order) {
            const st = order.status;
            if (st === 'Đã hủy') return '<div class="order-timeline cancelled" role="status">Đơn hàng đã được huỷ</div>';
            const steps = ['Chờ xác nhận', 'Đã xác nhận', 'Đang giao', 'Hoàn thành'];
            const returning = st === 'Yêu cầu trả hàng' || st === 'Đã trả hàng';
            if (returning) steps.push(st === 'Đã trả hàng' ? 'Đã trả hàng' : 'Yêu cầu trả hàng');
            const current = returning ? steps.length - 1 : Math.max(0, steps.indexOf(st));
            return `<ol class="order-timeline" aria-label="Tiến trình đơn hàng">` + steps.map((label, i) => {
                const cls = i < current ? 'done' : (i === current ? 'current' : '');
                return `<li class="${cls}"${i === current ? ' aria-current="step"' : ''}><span class="tl-dot">${i < current ? '<svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#check"/></svg>' : (i + 1)}</span><span class="tl-label">${label}</span></li>`;
            }).join('') + '</ol>';
        }

        function renderOrders() {
            const list = document.getElementById('ordersList');
            const user = ShopCore.getCurrentUser();

            if (!user) {
                list.innerHTML = `<div class="orders-guest">
                    Bạn cần <a href="signin.html">đăng nhập</a> để xem lịch sử đơn hàng của mình.
                </div>`;
                return;
            }

            const filtered = currentFilter === 'all'
                ? allOrders
                : allOrders.filter(o => o.status === currentFilter);

            if (filtered.length === 0) {
                list.innerHTML = `<div class="orders-empty">
                    ${allOrders.length === 0
                        ? 'Bạn chưa có đơn hàng nào. <a href="index.html">Khám phá sản phẩm ngay</a>!'
                        : 'Không có đơn hàng nào ở trạng thái này.'}
                </div>`;
                return;
            }

            list.innerHTML = filtered.map(order => `
                <div class="order-card" data-order-id="${order.id}">
                    <div class="order-card-head">
                        <div>
                            <div class="order-code">Đơn hàng #${order.id}</div>
                            <div class="order-date">${new Date(order.createdAt).toLocaleString('vi-VN')}</div>
                        </div>
                        <span class="order-status ${statusClass(order.status)}">${order.status}</span>
                    </div>
                    ${renderTimeline(order)}
                    <div class="order-card-body">
                        ${order.items.map(item => `
                            <div class="order-line">
                                <img src="${item.image}" alt="${item.name}">
                                <div class="order-line-info">
                                    <div class="order-line-name">${item.name}</div>
                                    <div class="order-line-qty">Số lượng: ${item.quantity}</div>
                                </div>
                                <div class="order-line-price">${money(item.price * item.quantity)}</div>
                            </div>
                        `).join('')}
                        ${order.returnReason ? `<div class="order-return-reason">Lý do trả hàng: ${order.returnReason}${(order.returnImages && order.returnImages.length) ? `<div class="order-return-imgs">${order.returnImages.map(src => `<img src="${src}" alt="Ảnh minh chứng" onclick="zoomReturnImage(this.src)">`).join('')}</div>` : ''}</div>` : ''}
                        <span class="toggle-details" onclick="toggleAddress('${order.id}')">Xem địa chỉ giao hàng &amp; ghi chú</span>
                    </div>
                    <div class="order-address-box" id="addr-${order.id}">
                        <strong>${order.customer.fullname}</strong> — ${order.customer.phone}<br>
                        ${order.customer.address}, Quận/Huyện ${order.customer.district}, ${order.customer.city}<br>
                        ${order.customer.note ? 'Ghi chú: ' + order.customer.note + '<br>' : ''}
                        Thanh toán: ${paymentLabel(order.payment)}
                    </div>
                    <div class="order-card-foot">
                        <div class="order-total-line">Tổng cộng: <strong>${money(order.total)}</strong></div>
                        <div class="order-actions-row">
                            ${renderOrderActions(order)}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Đổi mã thanh toán ('cod', 'bank'...) thành tên hiển thị tiếng Việt dễ hiểu.
        function paymentLabel(p) {
            return { cod: 'Thanh toán khi nhận hàng (COD)', bank: 'Chuyển khoản ngân hàng', momo: 'Ví MoMo', zalopay: 'ZaloPay' }[p] || p;
        }

        // Quyết định hiện nút nào tùy theo trạng thái hiện tại của đơn.
        // Đây là chỗ thể hiện rõ luồng: mỗi trạng thái chỉ cho phép 1-2 hành động hợp lý,
        // KHÔNG cho khách nhảy cóc (ví dụ không thể "nhận hàng" khi đơn còn "Chờ xác nhận").
        function renderOrderActions(order) {
            switch (order.status) {
                case 'Chờ xác nhận':
                    // Đơn vừa đặt, admin chưa xác nhận & giao -> khách chỉ có thể hủy
                    return `<button class="order-btn danger" onclick="doCancelOrder('${order.id}')">Hủy đơn</button>`;

                case 'Đang giao':
                    // Admin đã xác nhận và đang giao -> khách mới được xác nhận nhận hàng hoặc từ chối/trả hàng
                    return `
                        <button class="order-btn primary" onclick="doCompleteOrder('${order.id}')">Đã nhận được hàng</button>
                        <button class="order-btn warning" onclick="doRequestReturn('${order.id}')">Trả hàng</button>`;

                case 'Hoàn thành':
                    // Đã nhận hàng, nhưng phát hiện lỗi hoặc không còn nhu cầu -> vẫn có thể yêu cầu trả
                    return `<button class="order-btn warning" onclick="doRequestReturn('${order.id}')">Yêu cầu trả hàng</button>`;

                case 'Yêu cầu trả hàng':
                    // Đang chờ admin duyệt, khách không cần làm gì thêm
                    return `<span class="order-note">⏳ Đang chờ admin xử lý yêu cầu trả hàng...</span>`;

                default:
                    // Đã hủy / Đã trả hàng -> không còn hành động nào nữa
                    return '';
            }
        }

        // Ẩn/hiện khối địa chỉ giao hàng của 1 đơn cụ thể khi bấm vào dòng 'Xem địa chỉ giao hàng'.
        function toggleAddress(orderId) {
            document.getElementById('addr-' + orderId).classList.toggle('show');
        }

        function doCancelOrder(orderId) {
            if (!confirm('Bạn chắc chắn muốn hủy đơn hàng này?')) return;
            const user = ShopCore.getCurrentUser();
            // ShopCore.cancelOrder() giờ ghi lên Firestore -> trả về Promise. Không cần gọi
            // renderOrders() thủ công sau khi xong, vì watchOrdersForUser() sẽ tự bắn dữ liệu
            // mới về ngay khi Firestore xác nhận đã ghi xong.
            ShopCore.cancelOrder(orderId, user.username).then(() => {
                ShopCore.toast('Đã hủy đơn hàng #' + orderId);
            });
        }

        // Khách tự xác nhận đã nhận được hàng ngoài đời thực -> đơn chuyển "Hoàn thành".
        // Chỉ áp dụng được khi đơn đang ở trạng thái "Đang giao" (do admin đã xác nhận & giao trước đó) —
        // xem điều kiện chặn thật sự nằm trong ShopCore.completeOrder() ở shop-core.js.
        function doCompleteOrder(orderId) {
            if (!confirm('Xác nhận bạn đã nhận được hàng của đơn này?')) return;
            const user = ShopCore.getCurrentUser();
            ShopCore.completeOrder(orderId, user.username).then(() => {
                ShopCore.toast('Cảm ơn bạn! Giờ bạn có thể đánh giá sản phẩm trong đơn này.');
            });
        }

        // Khách yêu cầu trả hàng: dùng khi đang giao mà muốn từ chối nhận,
        // hoặc đã nhận hàng ("Hoàn thành") nhưng phát hiện lỗi / không còn nhu cầu.
        // Đơn sẽ chuyển sang "Yêu cầu trả hàng" và chờ admin duyệt (ShopCore.adminApproveReturn).
        function doRequestReturn(orderId) {
            returnOrderId = orderId;
            returnImages = [];
            document.getElementById('returnOrderCode').textContent = 'Đơn hàng #' + orderId;
            document.getElementById('returnReasonInput').value = '';
            document.getElementById('returnFiles').value = '';
            renderReturnPreviews();
            document.getElementById('returnModal').classList.add('show');
        }

        // ---- Form trả hàng: nén ảnh bằng canvas (tối đa 800px, JPEG 0.6) để nằm gọn trong giới hạn 1MB/document của Firestore ----
        let returnOrderId = null;
        let returnImages = []; // mảng data URL đã nén

        function compressImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = reject;
                reader.onload = () => {
                    const img = new Image();
                    img.onerror = reject;
                    img.onload = () => {
                        const MAX = 800;
                        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', 0.6));
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
            });
        }

        function renderReturnPreviews() {
            document.getElementById('returnPreviews').innerHTML = returnImages.map((src, i) => `
                <div class="pv"><img src="${src}" alt="Ảnh ${i + 1}"><button type="button" onclick="removeReturnImage(${i})" aria-label="Xoá ảnh ${i + 1}"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#x"/></svg></button></div>
            `).join('');
        }

        function removeReturnImage(i) {
            returnImages.splice(i, 1);
            renderReturnPreviews();
        }

        function closeReturnModal() {
            document.getElementById('returnModal').classList.remove('show');
            returnOrderId = null;
        }

        document.getElementById('returnFiles').addEventListener('change', function () {
            const files = Array.from(this.files).slice(0, 3 - returnImages.length);
            Promise.all(files.map(compressImage)).then(list => {
                returnImages = returnImages.concat(list).slice(0, 3);
                renderReturnPreviews();
                this.value = '';
            }).catch(() => ShopCore.toast('Không đọc được ảnh, vui lòng thử ảnh khác'));
        });

        document.getElementById('returnCancelBtn').addEventListener('click', closeReturnModal);
        document.getElementById('returnModal').addEventListener('click', function (e) { if (e.target === this) closeReturnModal(); });

        document.getElementById('returnSubmitBtn').addEventListener('click', function () {
            const reason = document.getElementById('returnReasonInput').value.trim();
            if (!reason) { alert('Vui lòng nhập lý do trả hàng.'); return; }
            const user = ShopCore.getCurrentUser();
            const btn = this;
            btn.disabled = true;
            ShopCore.requestReturn(returnOrderId, user.username, reason, returnImages).then(() => {
                closeReturnModal();
                ShopCore.toast('Đã gửi yêu cầu trả hàng, vui lòng chờ admin xử lý.');
            }).catch(err => {
                console.error(err);
                alert('Gửi thất bại (ảnh có thể quá nặng), vui lòng thử ảnh nhỏ hơn.');
            }).finally(() => { btn.disabled = false; });
        });

        // Phóng to ảnh minh chứng khi bấm vào ảnh thu nhỏ.
        function zoomReturnImage(src) {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:3000;cursor:zoom-out;';
            ov.innerHTML = '<img src="' + src + '" style="max-width:92vw;max-height:92vh;border-radius:8px;">';
            ov.addEventListener('click', () => ov.remove());
            document.body.appendChild(ov);
        }

        /**
         * Xử lý bấm đổi tab lọc trạng thái đơn hàng (Tất cả / Chờ xác nhận / Đang giao...).
         * CƠ CHẾ 'EVENT DELEGATION': thay vì gắn 1 sự kiện click cho TỪNG nút tab riêng lẻ, ta gắn
         * DUY NHẤT 1 sự kiện click lên phần tử cha (#ordersTabs), rồi dùng e.target.closest('.orders-tab')
         * để xác định người dùng bấm ĐÚNG vào nút tab nào. Cách này hiệu quả hơn khi có nhiều phần tử con.
         */
        document.getElementById('ordersTabs').addEventListener('click', function (e) {
            const btn = e.target.closest('.orders-tab');
            if (!btn) return;
            document.querySelectorAll('.orders-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderOrders();
        });

        // Khởi động: nếu đã đăng nhập, lắng nghe REAL-TIME đơn hàng của user này từ Firestore
        // (tự vẽ lại renderOrders() mỗi khi có thay đổi, kể cả do admin xử lý ở tab/máy khác).
        // Nếu chưa đăng nhập, chỉ cần gọi renderOrders() 1 lần để hiện thông báo mời đăng nhập.
        window.addEventListener('load', function () {
            // Đợi AuthService.ready để chắc chắn Firebase đã xác nhận xong phiên đăng nhập
            // trước khi quyết định "đã đăng nhập hay chưa" (tránh nhầm là khách vãng lai
            // lúc Firebase chưa kịp khôi phục phiên).
            AuthService.ready.then(function (user) {
                if (!user) { renderOrders(); return; }
                ShopCore.watchOrdersForUser(user.username, function (list) {
                    allOrders = list;
                    renderOrders();
                });
            });
        });
