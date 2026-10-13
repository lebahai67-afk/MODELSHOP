// checkout.js
// Đọc sản phẩm cần thanh toán thật (từ giỏ hàng hoặc "Mua ngay"), hiển thị tóm tắt đơn hàng,
// và khi bấm "Đặt hàng" sẽ tạo đơn hàng thật + bắn thông báo qua ShopCore.
// Cần nạp SAU shop-core.js.

let checkoutItems = []; // [{id, name, image, price, quantity}]
let addressData = null; // { provinces: [...], supportedCities: [...], wardsByCity: {...} } - đọc từ data/vietnam-address.json

// ---- Mã giảm giá & điểm thưởng (state dùng chung cho renderOrderSummary) ----
let appliedVoucher = null;   // { code, discount } sau khi kiểm tra hợp lệ thành công
let loyaltyConfig = null;    // { earnPerAmount, redeemValue } tải 1 lần từ ShopCore.getLoyaltyConfig()
let userPointsAvailable = 0; // số điểm khách đang có

function money(n) { return n.toLocaleString('vi-VN') + 'đ'; }

// ---------------- TỈNH/THÀNH PHỐ & XÃ/PHƯỜNG (2 tầng, chọn tỉnh xong mới hiện xã/phường) ----------------
// Dữ liệu lấy từ data/vietnam-address.json: đầy đủ 34 tỉnh/thành phố hiện hành, nhưng chỉ 6 thành phố lớn
// (Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng, Cần Thơ, Huế) có sẵn danh sách xã/phường chi tiết để đặt hàng.
// Tải file data/vietnam-address.json (danh sách tỉnh/thành + xã/phường) rồi đổ vào ô <select> Tỉnh/Thành.
// fetch() trả về Promise -> .then().then() nối chuỗi xử lý bất đồng bộ theo từng bước.
function loadAddressData() {
    return fetch('data/vietnam-address.json')
        .then(res => res.json())
        .then(data => {
            addressData = data;
            const citySelect = document.getElementById('city');
            citySelect.innerHTML = '<option value="">-- Chọn --</option>' +
                data.provinces.map(p => `<option value="${p}">${p}</option>`).join('');
        });
}

// Khi người dùng đổi Tỉnh/Thành phố -> đổ lại danh sách Xã/Phường tương ứng (hoặc báo chưa hỗ trợ)
/**
 * Đổ lại danh sách Xã/Phường mỗi khi người dùng đổi Tỉnh/Thành phố (dropdown 2 tầng phụ thuộc nhau).
 * CƠ CHẾ: chỉ 6 thành phố lớn có sẵn dữ liệu xã/phường chi tiết (addressData.supportedCities).
 * Nếu chọn tỉnh KHÔNG nằm trong danh sách đó -> khoá ô Xã/Phường + hiện thông báo, chặn đặt hàng
 * ngay từ bước giao diện (còn checkoutForm submit sẽ kiểm tra lại lần nữa cho chắc).
 */
function renderWardOptions() {
    const cityName = document.getElementById('city').value;
    const districtSelect = document.getElementById('district');
    const notice = document.getElementById('unsupportedNotice');

    const isSupported = cityName && addressData.supportedCities.includes(cityName);

    if (!cityName) {
        districtSelect.innerHTML = '<option value="">-- Chọn Tỉnh/Thành phố trước --</option>';
        districtSelect.disabled = true;
        notice.style.display = 'none';
        return;
    }

    if (isSupported) {
        const wards = addressData.wardsByCity[cityName];
        districtSelect.innerHTML = '<option value="">-- Chọn --</option>' +
            wards.map(w => `<option value="${w}">${w}</option>`).join('');
        districtSelect.disabled = false;
        notice.style.display = 'none';
    } else {
        // Tỉnh/thành này chưa có dữ liệu xã/phường -> khoá ô chọn + hiện thông báo, không cho đặt hàng
        districtSelect.innerHTML = '<option value="">-- Chưa hỗ trợ --</option>';
        districtSelect.disabled = true;
        notice.style.display = 'block';
    }
}

document.getElementById('city').addEventListener('change', renderWardOptions);

// Lấy danh sách sản phẩm cần thanh toán:
// Ưu tiên "checkoutItems" (được set từ cart.html khi chọn 1 phần, hoặc từ "Mua ngay"),
// nếu không có thì fallback dùng toàn bộ giỏ hàng.
/**
 * Xác định DANH SÁCH SẢN PHẨM cần thanh toán khi vừa vào trang checkout.
 * CƠ CHẾ ƯU TIÊN: đọc key 'checkoutItems' trong localStorage trước (được cart.js hoặc
 * products-detail.js ghi vào khi bấm 'Thanh toán' / 'Mua ngay'); nếu KHÔNG có (vd người dùng
 * gõ thẳng URL checkout.html) thì lấy fallback là TOÀN BỘ giỏ hàng hiện tại.
 * Sau đó 'join' từng {id, quantity} với dữ liệu sản phẩm thật (tên, ảnh, giá, tồn kho)
 * để có đủ thông tin hiển thị và kiểm tra tồn kho.
 */
function loadCheckoutSelection() {
    let selection = null;
    try { selection = JSON.parse(localStorage.getItem('checkoutItems')); } catch (e) { }

    return ShopCore.loadProducts().then(products => {
        let raw;
        if (selection && selection.length) {
            raw = selection;
        } else {
            raw = ShopCore.getCart();
        }
        checkoutItems = raw
            .map(i => {
                const p = ShopCore.getProductById(i.id, products);
                if (!p) return null;
                return {
                    id: p.id, name: p.name, image: p.image, price: p.price, quantity: i.quantity,
                    stock: ShopCore.getStock(p) // dùng để kiểm tra lại tồn kho trước khi đặt hàng
                };
            })
            .filter(Boolean);
        renderOrderSummary();
    });
}

/**
 * Vẽ khung tóm tắt đơn hàng bên phải: từng sản phẩm, tạm tính, phí ship, tổng cộng.
 * CƠ CHẾ TÍNH SHIP: miễn phí nếu tạm tính >= 500.000đ, ngược lại tính 30.000đ.
 * Nếu giỏ trống thì khoá luôn nút 'Đặt hàng' (disabled + đổi giao diện mờ) để tránh đặt đơn rỗng.
 */
function renderOrderSummary() {
    const box = document.getElementById('orderItemsBox');
    const placeBtn = document.getElementById('placeOrderBtn');

    if (checkoutItems.length === 0) {
        box.innerHTML = `<div style="padding:20px 0; color:#999; font-size:14px; text-align:center;">
            Không có sản phẩm nào để thanh toán. <a href="cart.html" style="color:#ff2a2a;">Quay lại giỏ hàng</a>
        </div>`;
        placeBtn.disabled = true;
        placeBtn.style.opacity = '0.5';
        placeBtn.style.cursor = 'not-allowed';
    } else {
        box.innerHTML = checkoutItems.map(item => `
            <div class="order-item">
                <img src="${item.image}" alt="${item.name}" class="order-item-img">
                <div class="order-item-info">
                    <div class="order-item-name">${item.name}</div>
                    <div class="order-item-qty">Số lượng: ${item.quantity}</div>
                </div>
                <div class="order-item-price">${money(item.price * item.quantity)}</div>
            </div>
        `).join('');
        placeBtn.disabled = false;
        placeBtn.style.opacity = '';
        placeBtn.style.cursor = '';
    }

    const subtotal = checkoutItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const shipping = checkoutItems.length === 0 ? 0 : (subtotal >= 500000 ? 0 : 30000);

    document.getElementById('sumSubtotal').textContent = money(subtotal);
    const shipEl = document.getElementById('sumShipping');
    if (shipping === 0) {
        shipEl.textContent = 'Miễn phí';
        shipEl.classList.add('text-success');
    } else {
        shipEl.textContent = money(shipping);
        shipEl.classList.remove('text-success');
    }

    // Giảm giá theo mã voucher (nếu đã áp dụng hợp lệ) - không vượt quá tạm tính.
    const voucherDiscount = appliedVoucher ? Math.min(appliedVoucher.discount, subtotal) : 0;
    const discountRow = document.getElementById('discountRow');
    if (voucherDiscount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('sumDiscount').textContent = '-' + money(voucherDiscount);
    } else {
        discountRow.style.display = 'none';
    }

    // Giảm giá theo điểm thưởng (nếu có nhập số điểm > 0), không vượt quá phần còn lại sau voucher.
    const pointsInput = document.getElementById('pointsInput');
    let pointsUsed = Math.max(0, Math.floor(Number(pointsInput.value) || 0));
    pointsUsed = Math.min(pointsUsed, userPointsAvailable);
    const remainAfterVoucher = Math.max(0, subtotal + shipping - voucherDiscount);
    const redeemValue = loyaltyConfig ? loyaltyConfig.redeemValue : 500;
    let pointsDiscount = Math.min(pointsUsed * redeemValue, remainAfterVoucher);
    // Nếu số điểm nhập vào tạo ra giảm giá vượt mức cho phép, kéo ngược lại số điểm thực dùng.
    pointsUsed = redeemValue > 0 ? Math.floor(pointsDiscount / redeemValue) : 0;
    if (pointsInput.value != pointsUsed) pointsInput.value = pointsUsed;

    const pointsRow = document.getElementById('pointsDiscountRow');
    if (pointsDiscount > 0) {
        pointsRow.style.display = 'flex';
        document.getElementById('sumPointsDiscount').textContent = '-' + money(pointsDiscount);
    } else {
        pointsRow.style.display = 'none';
    }

    window._checkoutVoucherDiscount = voucherDiscount;
    window._checkoutPointsUsed = pointsUsed;
    window._checkoutPointsDiscount = pointsDiscount;

    const total = Math.max(0, subtotal + shipping - voucherDiscount - pointsDiscount);
    document.getElementById('sumTotal').textContent = money(total);
}

// ---------------- Mã giảm giá ----------------
function applyVoucherCode() {
    const input = document.getElementById('voucherInput');
    const msg = document.getElementById('voucherMsg');
    const code = input.value.trim().toUpperCase();
    if (!code) { msg.textContent = ''; return; }

    const subtotal = checkoutItems.reduce((s, i) => s + i.price * i.quantity, 0);
    msg.style.color = '#999';
    msg.textContent = 'Đang kiểm tra mã...';

    ShopCore.validateVoucher(code, subtotal).then(result => {
        if (!result.valid) {
            appliedVoucher = null;
            msg.style.color = '#ff5555';
            msg.textContent = '' + result.reason;
        } else {
            appliedVoucher = { code, discount: result.discount };
            msg.style.color = '#3ddc84';
            msg.textContent = `Áp dụng thành công! Giảm ${money(result.discount)}.`;
        }
        renderOrderSummary();
    });
}

// ---------------- Điểm thưởng ----------------
function loadLoyaltyInfo() {
    const user = ShopCore.getCurrentUser();
    if (!user) return;
    Promise.all([ShopCore.getLoyaltyConfig(), ShopCore.getUserPoints(user.username)]).then(([cfg, points]) => {
        loyaltyConfig = cfg;
        userPointsAvailable = points;
        const wrap = document.getElementById('pointsWrap');
        if (points > 0) {
            wrap.style.display = 'block';
            document.getElementById('pointsAvailable').textContent = points;
            document.getElementById('pointsMsg').textContent =
                `Cứ 1 điểm giảm ${money(cfg.redeemValue)}. Tối đa dùng được ${points} điểm cho đơn này.`;
        }
        renderOrderSummary();
    });
}

document.getElementById('applyVoucherBtn').addEventListener('click', applyVoucherCode);
document.getElementById('pointsInput').addEventListener('input', renderOrderSummary);
document.getElementById('useMaxPointsBtn').addEventListener('click', function () {
    document.getElementById('pointsInput').value = userPointsAvailable;
    renderOrderSummary();
});

// Xử lý form checkout
/**
 * Xử lý khi bấm 'Đặt hàng' - đây là bước QUAN TRỌNG NHẤT của cả luồng mua hàng.
 * CƠ CHẾ, theo đúng thứ tự kiểm tra trong code bên dưới:
 *  1. Chặn reload trang + kiểm tra còn sản phẩm để đặt không.
 *  2. Bắt buộc phải đăng nhập (không cho khách vãng lai đặt hàng).
 *  3. Đọc toàn bộ dữ liệu từ form (người nhận, địa chỉ, thanh toán...).
 *  4. Validate đầy đủ + kiểm tra lại thành phố có được hỗ trợ giao hàng không (kiểm tra 2 lớp:
 *     vừa khoá <select> trên giao diện, vừa check lại ở đây phòng người dùng chỉnh sửa DevTools).
 *  5. Kiểm tra lại TỒN KHO lần cuối (double-check) trước khi tạo đơn thật.
 *  6. Gọi ShopCore.createOrder() để tạo đơn hàng thật (lưu vào collection "orders" trên Firestore).
 *  7. Xoá các sản phẩm vừa đặt khỏi giỏ hàng + dọn dẹp checkoutItems tạm.
 *  8. Báo thành công rồi chuyển sang trang orders.html để xem đơn vừa tạo.
 */
document.getElementById('checkoutForm').addEventListener('submit', function (e) {
    e.preventDefault();

    if (checkoutItems.length === 0) {
        alert('Không có sản phẩm nào để đặt hàng!');
        return;
    }

    const currentUser = ShopCore.getCurrentUser();
    if (!currentUser) {
        alert('Vui lòng đăng nhập để đặt hàng!');
        window.location.href = 'signin.html';
        return;
    }

    // Lấy thông tin form
    const fullname = document.getElementById('fullname').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const address = document.getElementById('address').value.trim();
    const city = document.getElementById('city').value;
    const district = document.getElementById('district').value;
    const note = document.getElementById('note').value.trim();
    const payment = document.querySelector('input[name="payment"]:checked').value;

    // Kiểm tra thông tin
    if (!fullname || !phone || !address || !city || !district) {
        alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        return;
    }

    // Chặn đặt hàng nếu tỉnh/thành phố chọn KHÔNG nằm trong danh sách được hỗ trợ đầy đủ xã/phường.
    // Kiểm tra lại ở đây (không chỉ dựa vào việc khoá ô <select> trên giao diện) để phòng trường hợp
    // ai đó cố tình sửa tay HTML/DevTools để bỏ qua thuộc tính disabled.
    if (!addressData.supportedCities.includes(city)) {
        alert('Xin lỗi, shop hiện chưa hỗ trợ giao hàng chi tiết đến khu vực bạn chọn. Vui lòng chọn 1 trong 6 thành phố: Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng, Cần Thơ, Huế.');
        return;
    }

    // Kiểm tra lại TỒN KHO lần cuối trước khi tạo đơn (phòng trường hợp sản phẩm hết hàng
    // trong lúc người dùng đang điền form, hoặc dữ liệu giỏ hàng cũ trên trình duyệt)
    const outOfStockItem = checkoutItems.find(item => item.quantity > item.stock);
    if (outOfStockItem) {
        alert(`Sản phẩm "${outOfStockItem.name}" chỉ còn ${outOfStockItem.stock} trong kho, vượt quá số lượng bạn chọn. Vui lòng quay lại giỏ hàng để điều chỉnh.`);
        return;
    }

    // Tạo đơn hàng thật (ghi lên Firestore) + thông báo đặt hàng thành công.
    // ShopCore.createOrder() giờ trả về 1 Promise -> mọi việc làm SAU KHI có order.id (xoá giỏ
    // hàng, alert, chuyển trang) phải nằm trong .then(), nếu không order sẽ là "undefined".
    ShopCore.createOrder({
        username: currentUser.username,
        items: checkoutItems,
        customer: { fullname, phone, email, address, city, district, note },
        payment,
        voucherCode: appliedVoucher ? appliedVoucher.code : '',
        discount: window._checkoutVoucherDiscount || 0,
        pointsUsed: window._checkoutPointsUsed || 0,
        pointsDiscount: window._checkoutPointsDiscount || 0
    }).then(order => {
        // Gỡ các sản phẩm vừa đặt khỏi giỏ hàng chung
        ShopCore.removeManyFromCart(checkoutItems.map(i => i.id));
        localStorage.removeItem('checkoutItems');

        alert('Đặt hàng thành công! Mã đơn hàng: #' + order.id);

        setTimeout(() => {
            window.location.href = 'orders.html';
        }, 600);
    }).catch(err => {
        console.error('[checkout] Lỗi tạo đơn hàng:', err);
        alert('Có lỗi xảy ra khi đặt hàng, vui lòng thử lại!');
    });
});

loadAddressData();
// Mã giảm giá khách đã nhập sẵn ở trang giỏ hàng -> tự áp dụng khi sang trang thanh toán
function applyPendingVoucher() {
    const code = sessionStorage.getItem('pendingVoucher');
    if (!code) return;
    sessionStorage.removeItem('pendingVoucher');
    document.getElementById('voucherInput').value = code;
    applyVoucherCode();
}

Promise.resolve(loadCheckoutSelection()).then(applyPendingVoucher);
AuthService.ready.then(loadLoyaltyInfo);
