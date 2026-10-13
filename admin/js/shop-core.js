// shop-core.js
// ============================================================================
// LÕI DÙNG CHUNG: Giỏ hàng thật (localStorage) + Đơn hàng + Thông báo
// Mọi trang có mua/bán (index, products-*, products-detail, cart, checkout,
// orders) chỉ cần include file này (sau auth-header.js) là dùng được.
//
// Cấu trúc lưu trữ (localStorage):
//   products        : [{ id, name, ... }]    (danh sách sản phẩm, đè lên data/products.json
//                                              sau khi admin thêm/sửa/xoá — dùng CHUNG cho mọi tài khoản)
//   cart_<username> : [{ id, quantity }]     (giỏ hàng RIÊNG cho từng tài khoản)
//   cart_guest      : [{ id, quantity }]     (giỏ hàng tạm khi CHƯA đăng nhập)
//   orders          : [{ id, username, items:[{id,name,image,price,quantity}],
//                         customer:{fullname,phone,email,address,city,district,note},
//                         payment, subtotal, shipping, total, status, createdAt }]
//   notifications   : { [username]: [{ id, title, message, link, read, createdAt }] }
// ============================================================================

// CƠ CHẾ TOÀN FILE: đây là 'Module Pattern' kinh điển trong JS thuần (trước khi có import/export).
// (function(){ ... })() là 1 IIFE chạy ngay, TRẢ VỀ 1 object (xem 'return {...}' ở cuối file)
// chứa các hàm muốn công khai. Mọi biến/hàm khai báo bên trong KHÔNG lộ ra ngoài (private),
// CHỈ những gì có trong object return mới dùng được từ bên ngoài qua tên 'ShopCore.tenHam(...)'.
// Đây chính là cách JS thuần mô phỏng khái niệm 'class' có thuộc tính private/public.
const ShopCore = (function () {

    // ---------------- SẢN PHẨM (Firestore) ----------------
    // Nguồn sự thật DUY NHẤT bây giờ là collection Firestore "products" (thay cho localStorage).
    // data/products.json chỉ còn vai trò DỮ LIỆU MỒI (seed): lần đầu tiên site chạy, nếu collection
    // "products" trên Firestore đang RỖNG (project mới, chưa có ai thêm gì), ta tự động đọc file JSON
    // và ghi hết vào Firestore đúng 1 lần - từ đó về sau mọi thao tác đọc/ghi đều qua Firestore.
    const PRODUCTS_COL = 'products';
    let _productsCache = null; // cache trong bộ nhớ, tránh gọi lại Firestore nhiều lần trong 1 lượt tải trang

    const PRODUCTS_JSON_CANDIDATES = [
        'data/products.json',
        '../users/data/products.json',
        'users/data/products.json',
        '/users/data/products.json',
        '../data/products.json'
    ];
    function fetchProductsJson(paths) {
        if (paths.length === 0) return Promise.reject(new Error('products.json not found'));
        return fetch(paths[0])
            .then(r => { if (!r.ok) throw new Error('not ok'); return r.json(); })
            .catch(() => fetchProductsJson(paths.slice(1)));
    }
    // Ghi 1 loạt sản phẩm mồi (từ products.json) vào Firestore bằng batch write (gộp nhiều lệnh ghi
    // thành 1 giao dịch duy nhất, nhanh hơn nhiều so với gọi .set() từng sản phẩm một).
    // Dùng chính field "id" có sẵn của mỗi sản phẩm làm ID của document trên Firestore.
    function seedProductsToFirestore() {
        return fetchProductsJson(PRODUCTS_JSON_CANDIDATES).then(list => {
            const batch = db.batch();
            list.forEach(p => batch.set(db.collection(PRODUCTS_COL).doc(String(p.id)), p));
            return batch.commit().then(() => list);
        }).catch(() => []);
    }
    /**
     * Hàm TẢI DANH SÁCH SẢN PHẨM - được hầu hết mọi trang gọi tới.
     * THỨ TỰ:
     *  1. _productsCache (biến trong bộ nhớ) - nếu đã tải rồi thì dùng lại luôn.
     *  2. Đọc collection "products" trên Firestore (db.collection('products').get()).
     *  3. Nếu Firestore đang RỖNG (project mới tạo) -> tự seed dữ liệu mẫu từ data/products.json
     *     vào Firestore đúng 1 lần, rồi trả về luôn dữ liệu đó.
     * Luôn trả về 1 Promise để mọi nơi gọi hàm này dùng chung cú pháp .then(data => ...).
     */
    function loadProducts() {
        if (_productsCache) return Promise.resolve(_productsCache);
        return db.collection(PRODUCTS_COL).get().then(snap => {
            if (!snap.empty) {
                _productsCache = snap.docs.map(d => d.data());
                return _productsCache;
            }
            // Firestore chưa có sản phẩm nào -> nạp dữ liệu mồi từ products.json
            return seedProductsToFirestore().then(list => { _productsCache = list; return list; });
        }).catch(err => {
            console.error('[ShopCore] Không đọc được collection "products" trên Firestore:', err);
            _productsCache = [];
            return [];
        });
    }
    // Tìm 1 sản phẩm theo id trong mảng truyền vào, hoặc trong cache nếu không truyền mảng.
    function getProductById(id, products) {
        return (products || _productsCache || []).find(p => p.id === id) || null;
    }
    // Sinh id mới duy nhất theo danh mục, dạng "category-172xxxxxx" - dùng luôn làm ID document Firestore.
    function generateProductId(category) {
        return (category || 'sp') + '-' + Date.now().toString(36);
    }
    // Thêm sản phẩm mới vào Firestore (doc ID = id tự sinh), rồi cập nhật lại cache trong bộ nhớ.
    function addProduct(data) {
        const newProduct = Object.assign({ id: generateProductId(data.category), sold: 0, stock: 999 }, data);
        return db.collection(PRODUCTS_COL).doc(String(newProduct.id)).set(newProduct).then(() => {
            if (_productsCache) _productsCache.push(newProduct);
            return newProduct;
        });
    }
    // Cập nhật 1 phần dữ liệu sản phẩm trên Firestore (merge: chỉ ghi đè field có trong 'data',
    // field nào không truyền vẫn giữ nguyên giá trị cũ - tương đương Object.assign trước đây).
    function updateProduct(id, data) {
        return db.collection(PRODUCTS_COL).doc(String(id)).set(data, { merge: true }).then(() => {
            if (_productsCache) {
                const idx = _productsCache.findIndex(p => p.id === id);
                if (idx !== -1) _productsCache[idx] = Object.assign({}, _productsCache[idx], data);
            }
            return getProductById(id);
        });
    }
    // Xoá sản phẩm khỏi Firestore, đồng thời loại khỏi cache trong bộ nhớ.
    function deleteProduct(id) {
        return db.collection(PRODUCTS_COL).doc(String(id)).delete().then(() => {
            if (_productsCache) _productsCache = _productsCache.filter(p => p.id !== id);
            return true;
        });
    }
    // Lắng nghe THAY ĐỔI REAL-TIME của collection "products" trên Firestore (onSnapshot) - tự động
    // chạy callback mỗi khi CÓ BẤT KỲ AI (admin ở tab/máy khác) thêm/sửa/xoá sản phẩm, không cần F5.
    // Đây là nâng cấp so với cơ chế cũ (chỉ đồng bộ được giữa các TAB CÙNG 1 trình duyệt qua sự kiện
    // 'storage') - giờ đồng bộ được thật sự giữa NHIỀU máy/nhiều trình duyệt khác nhau.
    function onProductsChanged(callback) {
        db.collection(PRODUCTS_COL).onSnapshot(function (snap) {
            // metadata.hasPendingWrites: bỏ qua lần bắn đầu tiên do CHÍNH tab này vừa ghi (đã tự
            // cập nhật cache ở addProduct/updateProduct/deleteProduct rồi, không cần tải lại).
            if (snap.metadata.hasPendingWrites) return;
            _productsCache = snap.docs.map(d => d.data());
            callback();
        });
    }
    // Định dạng tiền VNĐ, đồng bộ với cách hiển thị ở cart.js/checkout.js/products.js
    // Định dạng số thành chuỗi tiền VNĐ, vd 1500000 -> '1.500.000đ'.
    function formatPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }

    // ---------------- TỒN KHO (stock) ----------------
    // Mỗi sản phẩm trong data/products.json có field "stock" = số lượng còn trong kho.
    // Vì trang này không có backend/database thật nên KHÔNG thể trừ kho vĩnh viễn
    // sau khi đặt hàng (products.json là file tĩnh, JS không ghi lại được).
    // => Ta chỉ dùng "stock" để CHẶN NGƯỜI DÙNG chọn số lượng vượt quá hàng có sẵn,
    // giống như 1 lớp kiểm tra hợp lệ (validation) khi thêm giỏ / đặt hàng.
    // Lấy số lượng tồn kho của sản phẩm. Nếu sản phẩm cũ chưa có field 'stock' (dữ liệu thiếu),
    // coi như còn RẤT NHIỀU hàng (999) để tránh vô tình khoá nhầm nút mua của sản phẩm hợp lệ.
    function getStock(product) {
        // Nếu sản phẩm cũ chưa có field stock thì coi như còn hàng (999) để không bị lỗi.
        if (!product) return 0;
        return typeof product.stock === 'number' ? product.stock : 999;
    }

    // Hết hàng khi tồn kho <= 0.
    function isOutOfStock(product) {
        return getStock(product) <= 0;
    }

    // Số lượng tối đa còn có thể thêm vào giỏ = tồn kho - số lượng đang có sẵn trong giỏ.
    // (Tránh trường hợp thêm 2 lần, mỗi lần dưới giới hạn nhưng cộng lại thì vượt kho)
    // Số lượng CÒN CÓ THỂ thêm vào giỏ = tồn kho - số lượng ĐÃ CÓ SẴN trong giỏ của sản phẩm này.
    // Quan trọng để chặn trường hợp: thêm 3 cái (còn 5 trong kho, hợp lệ), rồi thêm tiếp 3 cái nữa
    // (nếu không kiểm tra kiểu này sẽ thành 6 > 5, vượt tồn kho dù mỗi lần thêm đều 'hợp lệ').
    function getRemainingStock(product) {
        const stock = getStock(product);
        const inCart = getCart().find(i => i.id === product.id);
        const already = inCart ? inCart.quantity : 0;
        return Math.max(0, stock - already);
    }

    // ---------------- NHẬP KHO / XUẤT KHO (inventory_logs) ----------------
    // Mỗi lần admin nhập thêm hàng hoặc xuất bớt hàng khỏi kho, ta:
    //  1. Cộng/trừ trực tiếp vào field "stock" của sản phẩm trên Firestore (qua updateProduct),
    //     đồng thời đồng bộ luôn field "inStock" (còn > 0 hay không) cho khớp với "stock",
    //     vì trước đây 2 field này được set riêng lẻ (admin/js/products.js) nên có thể lệch nhau.
    //  2. Ghi lại 1 dòng LỊCH SỬ vào collection "inventory_logs" để admin xem lại đã nhập/xuất
    //     bao nhiêu, lúc nào, ai làm, lý do gì - collection riêng, KHÔNG đụng tới "products".
    const INVENTORY_COL = 'inventory_logs';

    // Sinh mã phiếu kho dạng 'PK' + ngày tháng năm + 4 số ngẫu nhiên, giống cách sinh mã đơn hàng.
    function genInventoryLogId() {
        const now = new Date();
        const stamp = now.getFullYear().toString().slice(2) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `PK${stamp}${rand}`;
    }

    /**
     * Nhập kho hoặc xuất kho 1 sản phẩm.
     * @param productId  id sản phẩm
     * @param quantity   số lượng nhập/xuất - LUÔN LÀ SỐ DƯƠNG (vd 10), dấu +/- do tham số "type" quyết định
     * @param type       'in' (nhập kho, cộng vào tồn) hoặc 'out' (xuất kho, trừ khỏi tồn)
     * @param note       ghi chú lý do (vd "Nhập hàng từ NCC", "Xuất bù hàng lỗi"...)
     * @param by         tên/email admin thực hiện (hiển thị trong lịch sử)
     * Trả về Promise<{ product, log }>. Nếu xuất kho vượt quá tồn hiện có -> reject với lỗi rõ ràng,
     * KHÔNG cho tồn kho bị âm.
     */
    function adjustStock(productId, quantity, type, note, by) {
        quantity = Math.abs(Number(quantity) || 0);
        if (quantity <= 0) return Promise.reject(new Error('Số lượng phải lớn hơn 0'));

        return loadProducts().then(products => {
            const product = getProductById(productId, products);
            if (!product) return Promise.reject(new Error('Không tìm thấy sản phẩm'));

            const current = getStock(product);
            const delta = type === 'out' ? -quantity : quantity;
            const newStock = current + delta;

            if (newStock < 0) {
                return Promise.reject(new Error(`Không đủ tồn kho để xuất (hiện còn ${current}, muốn xuất ${quantity})`));
            }

            const log = {
                id: genInventoryLogId(),
                productId: product.id,
                productName: product.name,
                productImage: product.image,
                type: type === 'out' ? 'out' : 'in',
                quantity,
                stockBefore: current,
                stockAfter: newStock,
                note: (note || '').trim(),
                by: by || '-',
                createdAt: new Date().toISOString()
            };

            return updateProduct(product.id, { stock: newStock, inStock: newStock > 0 })
                .then(updatedProduct => db.collection(INVENTORY_COL).doc(log.id).set(log)
                    .then(() => ({ product: updatedProduct, log })));
        });
    }

    // Đọc toàn bộ lịch sử nhập/xuất kho (1 lần), mới nhất lên trước.
    function getInventoryLogs() {
        return db.collection(INVENTORY_COL).orderBy('createdAt', 'desc').get().then(snap =>
            snap.docs.map(d => d.data())
        ).catch(err => {
            console.error('[ShopCore] Lỗi tải lịch sử kho:', err);
            return [];
        });
    }

    // Lắng nghe real-time lịch sử nhập/xuất kho - dùng cho trang admin/inventory.html.
    function watchInventoryLogs(callback) {
        return db.collection(INVENTORY_COL).orderBy('createdAt', 'desc').onSnapshot(function (snap) {
            callback(snap.docs.map(d => d.data()));
        }, err => console.error('[ShopCore] Lỗi lắng nghe lịch sử kho:', err));
    }


    // Đọc người dùng đang đăng nhập từ localStorage - nguồn 'sự thật' DUY NHẤT mọi file khác dựa vào.
    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('currentUser')); }
        catch (e) { return null; }
    }

    // ---------------- GIỎ HÀNG ----------------
    // Giỏ hàng lưu RIÊNG cho từng tài khoản (key "cart_<username>").
    // Chưa đăng nhập thì dùng giỏ tạm "cart_guest" (không dùng chung với bất kỳ ai đã đăng nhập).
    // Xác định TÊN KEY localStorage sẽ dùng để lưu giỏ hàng: 'cart_<username>' nếu đã đăng nhập,
    // hoặc 'cart_guest' nếu chưa - đây là cách mô phỏng 'mỗi tài khoản có giỏ hàng riêng' khi
    // không có database thật (mỗi user là 1 KEY khác nhau trong cùng localStorage của trình duyệt).
    function getCartKey() {
        const user = getCurrentUser();
        return user && user.username ? 'cart_' + user.username : 'cart_guest';
    }

    // Đọc giỏ hàng THÔ (chỉ có {id, quantity}, CHƯA có tên/ảnh/giá) của tài khoản hiện tại.
    function getCart() {
        try { return JSON.parse(localStorage.getItem(getCartKey())) || []; }
        catch (e) { return []; }
    }

    // Ghi đè giỏ hàng vào localStorage, đồng thời cập nhật luôn số hiển thị trên icon giỏ hàng
    // (syncCartBadge) để giao diện luôn khớp dữ liệu ngay sau khi thay đổi.
    function saveCart(cart) {
        localStorage.setItem(getCartKey(), JSON.stringify(cart));
        syncCartBadge();
    }

    // Thêm sản phẩm vào giỏ: nếu ĐÃ CÓ trong giỏ thì CỘNG DỒN số lượng, nếu chưa có thì thêm dòng mới.
    function addToCart(id, quantity) {
        quantity = quantity || 1;
        const cart = getCart();
        const existing = cart.find(i => i.id === id);
        if (existing) existing.quantity += quantity;
        else cart.push({ id, quantity });
        saveCart(cart);
        return cart;
    }

    // Sửa số lượng của 1 sản phẩm đã có trong giỏ, không cho xuống dưới 1 (Math.max(1, quantity)).
    function updateCartQty(id, quantity) {
        const cart = getCart();
        const item = cart.find(i => i.id === id);
        if (!item) return cart;
        item.quantity = Math.max(1, quantity);
        saveCart(cart);
        return cart;
    }

    // Xoá hẳn 1 sản phẩm khỏi giỏ hàng.
    function removeFromCart(id) {
        const cart = getCart().filter(i => i.id !== id);
        saveCart(cart);
        return cart;
    }

    // Xoá NHIỀU sản phẩm cùng lúc (dùng sau khi đặt hàng thành công, gỡ hết các món vừa đặt khỏi giỏ).
    // Dùng Set thay vì mảng thường để kiểm tra 'có nằm trong danh sách cần xoá không' (idSet.has)
    // nhanh hơn mảng.includes() khi danh sách lớn.
    function removeManyFromCart(ids) {
        const idSet = new Set(ids);
        const cart = getCart().filter(i => !idSet.has(i.id));
        saveCart(cart);
        return cart;
    }

    // Tổng số LƯỢNG sản phẩm trong giỏ (không phải số DÒNG) - dùng reduce() để cộng dồn quantity.
    function getCartCount() {
        return getCart().reduce((sum, i) => sum + i.quantity, 0);
    }

    // Trả về giỏ hàng đã "join" với dữ liệu sản phẩm thật (ảnh, tên, giá...)
    /**
     * Trả về giỏ hàng đã 'JOIN' với dữ liệu sản phẩm thật (tên, ảnh, giá, tồn kho...) -
     * giống hệt khái niệm JOIN 2 bảng trong SQL, chỉ khác là làm thủ công bằng .map() + .find().
     * Giỏ hàng gốc (getCart) chỉ có {id, quantity} - rất gọn để lưu, nhưng không đủ để HIỂN THỊ,
     * nên hàm này là cầu nối bắt buộc trước khi vẽ giao diện trang giỏ hàng.
     */
    function getCartDetailed() {
        return loadProducts().then(products => {
            const cart = getCart();
            return cart
                .map(i => {
                    const p = getProductById(i.id, products);
                    if (!p) return null;
                    return {
                        id: p.id, name: p.name, image: p.image, price: p.price,
                        brand: p.brand, quantity: i.quantity,
                        stock: getStock(p) // dùng để giới hạn nút [+] trong trang giỏ hàng
                    };
                })
                .filter(Boolean);
        });
    }

    // Cập nhật số trên icon giỏ hàng ở MỌI nơi nó xuất hiện trên trang (querySelectorAll thay vì
    // getElementById vì có thể có nhiều phần tử cùng hiển thị số này, vd cả header desktop & mobile).
    function syncCartBadge() {
        const count = getCartCount();
        document.querySelectorAll('#global-cart-count, .cart-count-badge').forEach(el => {
            el.textContent = count;
        });
    }

    // ---------------- ĐƠN HÀNG (Firestore) ----------------
    // Nguồn sự thật DUY NHẤT bây giờ là collection Firestore "orders" (thay cho localStorage key 'orders').
    // Mọi hàm bên dưới giờ đều thao tác với Firestore nên LUÔN trả về 1 Promise (kể cả các hàm trước đây
    // trả thẳng giá trị đồng bộ như getAllOrders/cancelOrder...) - nơi gọi phải dùng .then()/await.
    const ORDERS_COL = 'orders';

    // Đọc TOÀN BỘ đơn hàng của MỌI người dùng 1 LẦN (không real-time) - dùng cho những nơi chỉ
    // cần số liệu tức thời (vd đếm tổng đơn ở dashboard). Muốn tự động cập nhật khi có đơn mới,
    // dùng watchAllOrders() bên dưới thay vì gọi lặp lại hàm này.
    function getAllOrders() {
        return db.collection(ORDERS_COL).get().then(snap => {
            const list = snap.docs.map(d => d.data());
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return list;
        }).catch(err => { console.error('[ShopCore] Lỗi đọc orders:', err); return []; });
    }

    // Lọc ra đơn của riêng 1 user - dùng query where('username', '==', username) của Firestore
    // thay vì tải hết rồi filter() thủ công như trước, đỡ tốn băng thông khi dữ liệu lớn dần.
    function getOrdersForUser(username) {
        return db.collection(ORDERS_COL).where('username', '==', username).get().then(snap => {
            const list = snap.docs.map(d => d.data());
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return list;
        }).catch(err => { console.error('[ShopCore] Lỗi đọc orders của user:', err); return []; });
    }

    // ---- REAL-TIME: lắng nghe thay đổi đơn hàng ----
    // watchAllOrders(cb): dùng cho trang admin/orders.html + dashboard - cb(list) tự chạy lại
    // MỖI KHI có đơn mới / đổi trạng thái, dù thao tác đó đến từ máy/tab nào.
    // Trả về hàm unsubscribe() để có thể ngừng lắng nghe khi rời trang nếu cần.
    function watchAllOrders(callback) {
        return db.collection(ORDERS_COL).onSnapshot(function (snap) {
            const list = snap.docs.map(d => d.data());
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            callback(list);
        }, err => console.error('[ShopCore] Lỗi lắng nghe orders:', err));
    }

    // watchOrdersForUser(username, cb): dùng cho trang users/orders.html - tự cập nhật ngay khi
    // admin xác nhận/giao đơn, không cần khách F5 lại trang mới thấy trạng thái mới.
    function watchOrdersForUser(username, callback) {
        return db.collection(ORDERS_COL).where('username', '==', username).onSnapshot(function (snap) {
            const list = snap.docs.map(d => d.data());
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            callback(list);
        }, err => console.error('[ShopCore] Lỗi lắng nghe orders của user:', err));
    }

    // Sinh mã đơn hàng dạng 'DH' + ngày tháng năm (2 số cuối mỗi phần) + 4 số ngẫu nhiên,
    // vd DH2607254821 - dùng LUÔN làm ID của document trên Firestore (dễ tra cứu, đọc hiểu được).
    function genOrderId() {
        const now = new Date();
        const stamp = now.getFullYear().toString().slice(2) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `DH${stamp}${rand}`;
    }

    // items: [{id, name, image, price, quantity}]
    /**
     * TẠO ĐƠN HÀNG THẬT - hàm quan trọng bậc nhất, được checkout.js gọi khi bấm 'Đặt hàng'.
     * CƠ CHẾ:
     *  1. Tính subtotal (tổng tiền hàng) bằng reduce() cộng dồn price*quantity của từng sản phẩm.
     *  2. Tính phí ship: 0đ nếu subtotal >= 500.000đ (hoặc giỏ trống), ngược lại 30.000đ.
     *  3. Gộp mọi thông tin thành 1 object 'order' hoàn chỉnh, trạng thái khởi tạo LUÔN LÀ
     *     'Chờ xác nhận' (điểm bắt đầu của luồng trạng thái, xem sơ đồ bên dưới).
     *  4. Ghi document mới vào Firestore (doc ID = order.id) bằng .set().
     *  5. Gửi kèm 1 thông báo (notification) cho user biết đơn đã được tiếp nhận.
     * Trả về 1 Promise<order> - nơi gọi (checkout.js) PHẢI dùng .then(order => ...) để lấy order.id.
     */
    function createOrder({ username, items, customer, payment }) {
        const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const shipping = subtotal >= 500000 || subtotal === 0 ? 0 : 30000;
        const order = {
            id: genOrderId(),
            username,
            items,
            customer,
            payment,
            subtotal,
            shipping,
            total: subtotal + shipping,
            status: 'Chờ xác nhận',
            createdAt: new Date().toISOString()
        };
        return db.collection(ORDERS_COL).doc(order.id).set(order).then(() => {
            addNotification(username, {
                title: 'Đặt hàng thành công',
                message: `Đơn hàng #${order.id} (${items.length} sản phẩm, ${order.total.toLocaleString('vi-VN')}đ) đã được tiếp nhận và đang chờ xác nhận.`,
                link: 'orders.html'
            });
            return order;
        });
    }

    // Đọc 1 đơn theo id (dùng nội bộ cho các hàm đổi trạng thái bên dưới, để kiểm tra điều kiện
    // trước khi cho phép cập nhật - tương đương .find() trên mảng cũ nhưng phải hỏi Firestore).
    function getOrderById(orderId) {
        return db.collection(ORDERS_COL).doc(orderId).get().then(doc => doc.exists ? doc.data() : null);
    }

    // Huỷ đơn - CHỈ cho phép khi đơn còn đang 'Chờ xác nhận' (chưa được admin xử lý gì).
    // Nếu đơn đã ở trạng thái khác, hàm trả về nguyên trạng đơn mà KHÔNG đổi gì (chặn ngầm).
    function cancelOrder(orderId, username) {
        return getOrderById(orderId).then(order => {
            if (!order || order.username !== username) return null;
            if (order.status !== 'Chờ xác nhận') return order; // chỉ hủy được khi chưa xử lý
            return db.collection(ORDERS_COL).doc(orderId).update({ status: 'Đã hủy' }).then(() => {
                addNotification(username, {
                    title: 'Đơn hàng đã hủy',
                    message: `Đơn hàng #${orderId} đã được hủy theo yêu cầu của bạn.`,
                    link: 'orders.html'
                });
                return Object.assign({}, order, { status: 'Đã hủy' });
            });
        });
    }

    // ---- LUỒNG TRẠNG THÁI ĐƠN HÀNG ----
    // Chờ xác nhận --(admin xác nhận & giao)--> Đang giao --(khách nhận)--> Hoàn thành
    //                                              |                           |
    //                                    (khách từ chối/lỗi)          (khách phát hiện lỗi)
    //                                              v                           v
    //                                        Yêu cầu trả hàng --(admin duyệt)--> Đã trả hàng
    // Khách chỉ được bấm "Đã nhận hàng" / "Trả hàng" SAU KHI admin đã chuyển đơn
    // sang "Đang giao" — không thể tự nhận hàng khi đơn còn đang chờ xác nhận.

    // ---- HÀNH ĐỘNG CỦA ADMIN ----
    // [ADMIN] Xác nhận đơn và bắt đầu giao: 'Chờ xác nhận' -> 'Đang giao'.
    function adminShipOrder(orderId) {
        return getOrderById(orderId).then(order => {
            if (!order || order.status !== 'Chờ xác nhận') return null;
            return db.collection(ORDERS_COL).doc(orderId).update({ status: 'Đang giao' }).then(() => {
                addNotification(order.username, {
                    title: 'Đơn hàng đang được giao',
                    message: `Đơn hàng #${orderId} đã được xác nhận và đang trên đường giao đến bạn.`,
                    link: 'orders.html'
                });
                return Object.assign({}, order, { status: 'Đang giao' });
            });
        });
    }

    // [ADMIN] Duyệt yêu cầu trả hàng: 'Yêu cầu trả hàng' -> 'Đã trả hàng'.
    function adminApproveReturn(orderId) {
        return getOrderById(orderId).then(order => {
            if (!order || order.status !== 'Yêu cầu trả hàng') return null;
            return db.collection(ORDERS_COL).doc(orderId).update({ status: 'Đã trả hàng' }).then(() => {
                addNotification(order.username, {
                    title: 'Yêu cầu trả hàng đã được duyệt',
                    message: `Đơn hàng #${orderId} đã hoàn tất trả hàng.`,
                    link: 'orders.html'
                });
                return Object.assign({}, order, { status: 'Đã trả hàng' });
            });
        });
    }

    // [ADMIN] Đổi trạng thái đơn sang BẤT KỲ giá trị nào (không bị ràng buộc theo luồng cố định
    // như các hàm adminShipOrder/adminApproveReturn) - dùng cho ô <select> tự do trong trang quản lý.
    function adminSetOrderStatus(orderId, newStatus) {
        return getOrderById(orderId).then(order => {
            if (!order) return null;
            return db.collection(ORDERS_COL).doc(orderId).update({ status: newStatus }).then(() => {
                addNotification(order.username, {
                    title: 'Trạng thái đơn hàng đã được cập nhật',
                    message: `Đơn hàng #${orderId} hiện đang ở trạng thái "${newStatus}".`,
                    link: 'orders.html'
                });
                return Object.assign({}, order, { status: newStatus });
            });
        });
    }

    // ---- HÀNH ĐỘNG CỦA KHÁCH HÀNG ----
    // [KHÁCH] Xác nhận đã nhận hàng - CHỈ hợp lệ khi đơn đang 'Đang giao'. Đây là bước MỞ KHOÁ
    // quyền viết đánh giá sản phẩm (xem hasPurchased) - nên không thể bỏ qua bước 'Đang giao'.
    function completeOrder(orderId, username) {
        return getOrderById(orderId).then(order => {
            if (!order || order.username !== username) return null;
            if (order.status !== 'Đang giao') return order; // phải đang được giao mới nhận được
            return db.collection(ORDERS_COL).doc(orderId).update({ status: 'Hoàn thành' }).then(() => {
                addNotification(username, {
                    title: 'Đã xác nhận nhận hàng',
                    message: `Đơn hàng #${orderId} đã hoàn thành. Bạn có thể đánh giá sản phẩm trong đơn này.`,
                    link: 'orders.html'
                });
                return Object.assign({}, order, { status: 'Hoàn thành' });
            });
        });
    }

    // [KHÁCH] Yêu cầu trả hàng - hợp lệ khi đơn đang 'Đang giao' (từ chối nhận) HOẶC 'Hoàn thành'
    // (đã nhận nhưng phát hiện lỗi). Lưu lại lý do (returnReason) để admin xem trong modal chi tiết.
    function requestReturn(orderId, username, reason) {
        return getOrderById(orderId).then(order => {
            if (!order || order.username !== username) return null;
            if (order.status !== 'Đang giao' && order.status !== 'Hoàn thành') return order;
            const returnReason = (reason || '').trim();
            return db.collection(ORDERS_COL).doc(orderId)
                .update({ status: 'Yêu cầu trả hàng', returnReason }).then(() => {
                    addNotification(username, {
                        title: 'Đã gửi yêu cầu trả hàng',
                        message: `Yêu cầu trả hàng cho đơn #${orderId} đã được gửi, đang chờ admin xử lý.`,
                        link: 'orders.html'
                    });
                    return Object.assign({}, order, { status: 'Yêu cầu trả hàng', returnReason });
                });
        });
    }

    // Kiểm tra xem 1 user đã mua VÀ nhận thành công 1 sản phẩm cụ thể chưa
    // -> điều kiện bắt buộc để được viết đánh giá cho sản phẩm đó.
    // Trả về Promise<boolean> (trước đây là giá trị đồng bộ) vì giờ phải hỏi Firestore.
    function hasPurchased(username, productId) {
        if (!username) return Promise.resolve(false);
        return getOrdersForUser(username).then(orders =>
            orders.some(o =>
                o.status === 'Hoàn thành' &&
                o.items.some(item => item.id === productId)
            )
        );
    }


    // Đọc object thông báo của MỌI user, dạng { username: [thông báo, ...] } - 1 object dùng
    // chung cho tất cả tài khoản, khác với giỏ hàng (mỗi user có 1 KEY riêng trong localStorage).
    function getAllNotifications() {
        try { return JSON.parse(localStorage.getItem('notifications')) || {}; }
        catch (e) { return {}; }
    }

    // Ghi đè toàn bộ object thông báo vào localStorage.
    function saveAllNotifications(map) {
        localStorage.setItem('notifications', JSON.stringify(map));
    }

    // Lấy danh sách thông báo của 1 user, mới nhất lên đầu.
    function getNotifications(username) {
        if (!username) return [];
        const map = getAllNotifications();
        return (map[username] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Thêm 1 thông báo mới cho user (được gọi tự động từ bên trong các hàm tạo/đổi trạng thái đơn).
     * unshift() thêm vào ĐẦU mảng (mới nhất lên đầu), rồi .slice(0, 50) CẮT BỚT chỉ giữ 50 thông
     * báo gần nhất để tránh localStorage phình to vô hạn theo thời gian.
     * Cuối cùng gọi refreshNotificationBell() để chuông thông báo cập nhật số ngay lập tức.
     */
    function addNotification(username, { title, message, link }) {
        if (!username) return;
        const map = getAllNotifications();
        if (!map[username]) map[username] = [];
        map[username].unshift({
            id: 'ntf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            title, message, link: link || null,
            read: false,
            createdAt: new Date().toISOString()
        });
        // Giới hạn 50 thông báo gần nhất / user
        map[username] = map[username].slice(0, 50);
        saveAllNotifications(map);
        refreshNotificationBell();
    }

    // Đánh dấu MỌI thông báo của user là đã đọc (khi họ mở panel chuông thông báo ra xem).
    function markAllNotificationsRead(username) {
        if (!username) return;
        const map = getAllNotifications();
        (map[username] || []).forEach(n => n.read = true);
        saveAllNotifications(map);
        refreshNotificationBell();
    }

    // Đếm số thông báo CHƯA đọc - dùng để hiện số đỏ (badge) trên icon chuông.
    function unreadNotificationCount(username) {
        if (!username) return 0;
        return getNotifications(username).filter(n => !n.read).length;
    }

    // Đổi thời gian ISO (vd '2026-07-25T10:00:00') thành dạng tương đối dễ hiểu ('5 phút trước',
    // '3 giờ trước'...) - tính bằng cách lấy hiệu số mili-giây rồi chia dần ra phút/giờ/ngày.
    function timeAgo(iso) {
        const diffMs = Date.now() - new Date(iso).getTime();
        const min = Math.floor(diffMs / 60000);
        if (min < 1) return 'Vừa xong';
        if (min < 60) return `${min} phút trước`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} giờ trước`;
        const day = Math.floor(hr / 24);
        return `${day} ngày trước`;
    }

    // ---------------- ĐÁNH GIÁ & XẾP HẠNG SAO (reviews) ----------------
    // Cấu trúc lưu trong localStorage, key "reviews":
    // { "anime-01": [ {id, username, rating, comment, createdAt}, ... ], "gundam-02": [...] }
    // Mỗi sản phẩm (theo id) có 1 mảng các đánh giá của người dùng.

    // Dữ liệu đánh giá MẪU có sẵn cho từng sản phẩm, để trang không bị trống khi demo.
    // Chỉ được dùng làm giá trị KHỞI TẠO LẦN ĐẦU (xem hàm getAllReviews bên dưới) —
    // sau đó mọi thay đổi (thêm đánh giá thật) đều được lưu tiếp vào localStorage như bình thường.
    const SEED_REVIEWS = {
        "anime-01": [
            {
                "id": "rv_seed_001",
                "username": "minh_hobby",
                "rating": 5,
                "comment": "Chất lượng resin mịn, các chi tiết nhỏ được làm tỉ mỉ, rất ưng ý.",
                "createdAt": "2026-07-01T10:00:00"
            },
            {
                "id": "rv_seed_002",
                "username": "ha_anime99",
                "rating": 4,
                "comment": "Chi tiết Kaido vs Luffy rất sắc nét, tay nghề sơn đẹp, đóng gói chắc chắn không sứt mẻ.",
                "createdAt": "2026-07-10T10:00:00"
            }
        ],
        "anime-02": [
            {
                "id": "rv_seed_003",
                "username": "phat_collector",
                "rating": 5,
                "comment": "Chất lượng resin mịn, các chi tiết nhỏ được làm tỉ mỉ, rất ưng ý.",
                "createdAt": "2026-07-14T10:00:00"
            },
            {
                "id": "rv_seed_004",
                "username": "minh_hobby",
                "rating": 4,
                "comment": "Chi tiết Son Goku SSJ vs Frieza 1/4 rất sắc nét, tay nghề sơn đẹp, đóng gói chắc chắn không sứt mẻ.",
                "createdAt": "2026-07-03T10:00:00"
            }
        ],
        "anime-03": [
            {
                "id": "rv_seed_005",
                "username": "quynh_figure",
                "rating": 4,
                "comment": "Chi tiết Fushiguro Toji rất sắc nét, tay nghề sơn đẹp, đóng gói chắc chắn không sứt mẻ.",
                "createdAt": "2026-06-12T10:00:00"
            },
            {
                "id": "rv_seed_006",
                "username": "hieu_toolbox",
                "rating": 4,
                "comment": "Chất lượng resin mịn, các chi tiết nhỏ được làm tỉ mỉ, rất ưng ý.",
                "createdAt": "2026-06-18T10:00:00"
            }
        ],
        "anime-04": [
            {
                "id": "rv_seed_007",
                "username": "minh_hobby",
                "rating": 4,
                "comment": "Chất lượng resin mịn, các chi tiết nhỏ được làm tỉ mỉ, rất ưng ý.",
                "createdAt": "2026-06-19T10:00:00"
            },
            {
                "id": "rv_seed_008",
                "username": "linh_tran",
                "rating": 5,
                "comment": "Diorama đẹp hơn cả kỳ vọng, màu sắc lên chuẩn như ảnh, đáng tiền.",
                "createdAt": "2026-07-07T10:00:00"
            }
        ],
        "gundam-01": [
            {
                "id": "rv_seed_009",
                "username": "thanh_model",
                "rating": 4,
                "comment": "Khớp RG 1/144 RX-78-2 Gundam Ver. 2.0 chuyển động mượt, khuôn nhựa sắc nét, không bị hở khe khi ráp.",
                "createdAt": "2026-06-22T10:00:00"
            },
            {
                "id": "rv_seed_010",
                "username": "thanh_model",
                "rating": 5,
                "comment": "Hàng chuẩn chính hãng, hộp nguyên seal, lắp ráp không bị lệch màu.",
                "createdAt": "2026-06-24T10:00:00"
            }
        ],
        "gundam-02": [
            {
                "id": "rv_seed_011",
                "username": "minh_hobby",
                "rating": 5,
                "comment": "Chi tiết rất đẹp, chỉ hơi khó với người mới bắt đầu chơi gunpla.",
                "createdAt": "2026-06-12T10:00:00"
            },
            {
                "id": "rv_seed_012",
                "username": "thanh_model",
                "rating": 5,
                "comment": "Hàng chuẩn chính hãng, hộp nguyên seal, lắp ráp không bị lệch màu.",
                "createdAt": "2026-07-11T10:00:00"
            }
        ],
        "gundam-03": [
            {
                "id": "rv_seed_013",
                "username": "tuan_diorama",
                "rating": 5,
                "comment": "Chi tiết rất đẹp, chỉ hơi khó với người mới bắt đầu chơi gunpla.",
                "createdAt": "2026-06-23T10:00:00"
            },
            {
                "id": "rv_seed_014",
                "username": "phat_collector",
                "rating": 4,
                "comment": "Hàng chuẩn chính hãng, hộp nguyên seal, lắp ráp không bị lệch màu.",
                "createdAt": "2026-07-12T10:00:00"
            }
        ],
        "gundam-04": [
            {
                "id": "rv_seed_015",
                "username": "duc_carfan",
                "rating": 4,
                "comment": "Khớp PG 1/60 Gundam Astray Red Frame chuyển động mượt, khuôn nhựa sắc nét, không bị hở khe khi ráp.",
                "createdAt": "2026-07-02T10:00:00"
            },
            {
                "id": "rv_seed_016",
                "username": "thanh_model",
                "rating": 5,
                "comment": "Chi tiết rất đẹp, chỉ hơi khó với người mới bắt đầu chơi gunpla.",
                "createdAt": "2026-06-29T10:00:00"
            }
        ],
        "car-01": [
            {
                "id": "rv_seed_017",
                "username": "khoa_gunpla",
                "rating": 5,
                "comment": "Xe đẹp, nặng tay, cảm giác chắc chắn, đóng gói cẩn thận khi giao.",
                "createdAt": "2026-06-24T10:00:00"
            },
            {
                "id": "rv_seed_018",
                "username": "ha_anime99",
                "rating": 5,
                "comment": "Chi tiết ngoại thất sắc sảo, xứng đáng với mức giá bỏ ra.",
                "createdAt": "2026-07-12T10:00:00"
            }
        ],
        "car-02": [
            {
                "id": "rv_seed_019",
                "username": "quynh_figure",
                "rating": 4,
                "comment": "Chi tiết ngoại thất sắc sảo, xứng đáng với mức giá bỏ ra.",
                "createdAt": "2026-07-06T10:00:00"
            },
            {
                "id": "rv_seed_020",
                "username": "nam_modeler",
                "rating": 5,
                "comment": "Mô hình Ferrari F8 Tributo 1:18 tỉ lệ chuẩn, nội thất làm rất kỹ, sơn bóng đều màu.",
                "createdAt": "2026-06-29T10:00:00"
            }
        ],
        "car-03": [
            {
                "id": "rv_seed_021",
                "username": "tuan_diorama",
                "rating": 5,
                "comment": "Chi tiết ngoại thất sắc sảo, xứng đáng với mức giá bỏ ra.",
                "createdAt": "2026-07-13T10:00:00"
            },
            {
                "id": "rv_seed_022",
                "username": "ha_anime99",
                "rating": 4,
                "comment": "Mô hình BMW M8 Competition 1:18 tỉ lệ chuẩn, nội thất làm rất kỹ, sơn bóng đều màu.",
                "createdAt": "2026-06-26T10:00:00"
            }
        ],
        "car-04": [
            {
                "id": "rv_seed_023",
                "username": "thanh_model",
                "rating": 4,
                "comment": "Xe đẹp, nặng tay, cảm giác chắc chắn, đóng gói cẩn thận khi giao.",
                "createdAt": "2026-06-10T10:00:00"
            },
            {
                "id": "rv_seed_024",
                "username": "yen_otaku",
                "rating": 5,
                "comment": "Chi tiết ngoại thất sắc sảo, xứng đáng với mức giá bỏ ra.",
                "createdAt": "2026-07-03T10:00:00"
            }
        ],
        "tools-01": [
            {
                "id": "rv_seed_025",
                "username": "hieu_toolbox",
                "rating": 5,
                "comment": "Dùng để lắp mô hình rất tiện, độ bền tốt sau nhiều lần sử dụng.",
                "createdAt": "2026-07-07T10:00:00"
            },
            {
                "id": "rv_seed_026",
                "username": "duc_carfan",
                "rating": 4,
                "comment": "Chất lượng ổn so với giá, giao hàng nhanh, đóng gói cẩn thận.",
                "createdAt": "2026-07-01T10:00:00"
            }
        ],
        "tools-02": [
            {
                "id": "rv_seed_027",
                "username": "yen_otaku",
                "rating": 5,
                "comment": "Dùng để lắp mô hình rất tiện, độ bền tốt sau nhiều lần sử dụng.",
                "createdAt": "2026-06-19T10:00:00"
            },
            {
                "id": "rv_seed_028",
                "username": "phat_collector",
                "rating": 5,
                "comment": "Chất lượng ổn so với giá, giao hàng nhanh, đóng gói cẩn thận.",
                "createdAt": "2026-06-23T10:00:00"
            }
        ],
        "tools-03": [
            {
                "id": "rv_seed_029",
                "username": "quynh_figure",
                "rating": 5,
                "comment": "Dụng cụ cầm chắc tay, Dụng cụ dũa mông tay đánh bóng cắt gọn không để lại ba-via, dùng rất thích.",
                "createdAt": "2026-07-11T10:00:00"
            },
            {
                "id": "rv_seed_030",
                "username": "minh_hobby",
                "rating": 4,
                "comment": "Dùng để lắp mô hình rất tiện, độ bền tốt sau nhiều lần sử dụng.",
                "createdAt": "2026-07-07T10:00:00"
            }
        ],
        "tools-04": [
            {
                "id": "rv_seed_031",
                "username": "tuan_diorama",
                "rating": 5,
                "comment": "Dùng để lắp mô hình rất tiện, độ bền tốt sau nhiều lần sử dụng.",
                "createdAt": "2026-06-08T10:00:00"
            },
            {
                "id": "rv_seed_032",
                "username": "thanh_model",
                "rating": 5,
                "comment": "Dụng cụ cầm chắc tay, Dao gọt nhựa thừa (Bộ 13 lưỡi cắt gọn không để lại ba-via, dùng rất thích.",
                "createdAt": "2026-06-22T10:00:00"
            }
        ]
    };

    // Đọc object đánh giá của MỌI sản phẩm. LẦN ĐẦU TIÊN chạy (localStorage chưa có key 'reviews'),
    // tự động nạp sẵn SEED_REVIEWS (dữ liệu mẫu) vào để trang demo không bị trống trơn - đây là
    // kỹ thuật 'lazy seeding': chỉ tạo dữ liệu mẫu khi thực sự cần, không phải lúc nào cũng chạy.
    function getAllReviews() {
        try {
            const saved = localStorage.getItem('reviews');
            if (saved) return JSON.parse(saved);
            // Lần đầu tiên chưa có gì trong localStorage -> nạp sẵn dữ liệu mẫu rồi lưu lại
            saveAllReviews(SEED_REVIEWS);
            return SEED_REVIEWS;
        } catch (e) { return {}; }
    }

    // Ghi đè toàn bộ object đánh giá vào localStorage.
    function saveAllReviews(map) {
        localStorage.setItem('reviews', JSON.stringify(map));
    }

    // Lấy toàn bộ đánh giá của 1 sản phẩm, mới nhất lên đầu
    // Lấy toàn bộ đánh giá của 1 sản phẩm, mới nhất lên đầu.
    function getReviews(productId) {
        const map = getAllReviews();
        return (map[productId] || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Thêm 1 đánh giá mới cho sản phẩm
    // Bắt buộc: user phải có đơn hàng "Hoàn thành" chứa sản phẩm này thì mới được đánh giá
    // (tránh trường hợp chưa mua/chưa nhận hàng mà vẫn đánh giá được, không đúng thực tế)
    // Thêm đánh giá mới, nhưng LUÔN kiểm tra lại hasPurchased() trước (không tin tưởng dữ liệu
    // gửi lên từ giao diện) - nếu chưa đủ điều kiện, trả về {success:false} để nơi gọi xử lý báo lỗi.
    // Math.min(5, Math.max(1, ...)) ép số sao luôn nằm trong khoảng hợp lệ [1, 5] dù dữ liệu đầu vào sai.
    // hasPurchased() giờ hỏi Firestore (bất đồng bộ) nên addReview() cũng phải trả về 1 Promise
    // (trước đây trả thẳng {success} đồng bộ) - nơi gọi (products-detail.js) dùng .then(result => ...).
    function addReview(productId, { username, rating, comment }) {
        return hasPurchased(username, productId).then(purchased => {
            if (!purchased) {
                return { success: false, reason: 'not_purchased' };
            }
            const map = getAllReviews();
            if (!map[productId]) map[productId] = [];
            map[productId].unshift({
                id: 'rv_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                username: username || 'Ẩn danh',
                rating: Math.min(5, Math.max(1, Number(rating) || 5)), // ép về khoảng 1-5 sao
                comment: (comment || '').trim(),
                createdAt: new Date().toISOString()
            });
            saveAllReviews(map);
            return { success: true };
        });
    }

    // Tính điểm trung bình + số lượt đánh giá để hiển thị ở thẻ sản phẩm / trang chi tiết
    // Tính điểm trung bình (làm tròn 1 chữ số thập phân) + tổng số lượt đánh giá của 1 sản phẩm.
    function getRatingSummary(productId) {
        const list = getReviews(productId);
        if (list.length === 0) return { average: 0, count: 0 };
        const total = list.reduce((sum, r) => sum + r.rating, 0);
        return {
            average: Math.round((total / list.length) * 10) / 10, // làm tròn 1 chữ số thập phân
            count: list.length
        };
    }

    // Vẽ chuỗi sao ★★★★☆ từ điểm số (làm tròn đến 0.5 sao gần nhất) — dùng chung cho card & trang chi tiết
    // Vẽ chuỗi ký tự sao (★ đầy, ⯨ nửa, ☆ rỗng) từ điểm trung bình, làm tròn đến 0.5 sao gần nhất
    // (Math.round(average*2)/2, mẹo toán học để làm tròn về bội số của 0.5).
    function renderStars(average) {
        const rounded = Math.round(average * 2) / 2;
        let html = '';
        const star = (id, cls) => `<svg class="icon ${cls}" aria-hidden="true"><use href="../users/images/icons/lucide.svg#${id}"/></svg>`;
        for (let i = 1; i <= 5; i++) {
            if (rounded >= i) html += `<span class="star">${star('star', 'on')}</span>`;
            else if (rounded >= i - 0.5) html += `<span class="star">${star('star', 'off')}${star('star-half', 'on half')}</span>`;
            else html += `<span class="star">${star('star', 'off')}</span>`;
        }
        return `<span class="stars" role="img" aria-label="${rounded} trên 5 sao">${html}</span>`;
    }

    // ---------------- BELL UI (chèn vào link "Thông báo" có sẵn) ----------------
    function injectBellStyle() {
        if (document.getElementById('notif-bell-style')) return;
        const style = document.createElement('style');
        style.id = 'notif-bell-style';
        style.textContent = `
            .notif-wrap { position: relative; display: inline-block; }
            .notif-btn {
                background: none; border: none; cursor: pointer; padding: 0;
                font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px;
                position: relative;
            }
            .notif-badge {
                position: absolute; top: -8px; right: -12px;
                background: #ff2a2a; color: #fff; border-radius: 999px;
                font-size: 10px; font-weight: 700; padding: 1px 5px; line-height: 1.4;
                min-width: 15px; text-align: center;
            }
            .notif-panel {
                display: none; position: absolute; top: 100%; right: 0; margin-top: 10px;
                width: 340px; max-height: 420px; overflow-y: auto;
                background: #14100f; border: 1px solid rgba(255,42,42,0.4);
                border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,0.6);
                z-index: 2000; text-align: left;
            }
            .notif-panel.show { display: block; }
            .notif-panel-head {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .notif-panel-head span { font-weight: 700; color: #fff; font-size: 14px; }
            .notif-panel-head button {
                background: none; border: none; color: #ff8080; font-size: 12px; cursor: pointer;
            }
            .notif-item { display: block; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
                text-decoration: none; color: inherit; }
            .notif-item:hover { background: rgba(255,42,42,0.08); }
            .notif-item.unread { background: rgba(255,42,42,0.06); }
            .notif-item .n-title { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; }
            .notif-item .n-msg { font-size: 12.5px; color: #bbb; line-height: 1.5; margin-bottom: 4px; }
            .notif-item .n-time { font-size: 11px; color: #777; }
            .notif-empty { padding: 30px 16px; text-align: center; color: #888; font-size: 13px; }
        `;
        document.head.appendChild(style);
    }

    // Tìm đúng link 'Thông báo' có sẵn trong HTML của trang hiện tại để 'cắm' chuông vào đó.
    function findBellAnchor() {
        // Kiểu 1: <li><a href="#">Thông báo</a></li> trong .top-bar-items
        let link = Array.from(document.querySelectorAll('.top-bar a, .top-bar-items a'))
            .find(a => a.textContent.includes('Thông báo'));
        return link;
    }

    // Dựng HTML cho khung xổ xuống của chuông thông báo, tuỳ theo: chưa đăng nhập / không có
    // thông báo nào / có danh sách thông báo (thêm class 'unread' cho thông báo chưa đọc để tô màu khác).
    function buildPanelHTML(username) {
        const list = getNotifications(username);
        if (!username) {
            return `<div class="notif-empty">Đăng nhập để xem thông báo đơn hàng của bạn.</div>`;
        }
        if (list.length === 0) {
            return `<div class="notif-empty">Chưa có thông báo nào.</div>`;
        }
        return list.map(n => `
            <a class="notif-item ${n.read ? '' : 'unread'}" href="${n.link || '#'}" data-id="${n.id}">
                <div class="n-title">${n.title}</div>
                <div class="n-msg">${n.message}</div>
                <div class="n-time">${timeAgo(n.createdAt)}</div>
            </a>
        `).join('');
    }

    // Cập nhật lại số đỏ (badge) và nội dung panel của chuông - gọi mỗi khi có thông báo mới
    // hoặc khi đánh dấu đã đọc, để giao diện luôn khớp dữ liệu mới nhất.
    function refreshNotificationBell() {
        const badge = document.getElementById('notifBadge');
        const panel = document.getElementById('notifPanel');
        const user = getCurrentUser();
        if (badge) {
            const c = user ? unreadNotificationCount(user.username) : 0;
            badge.style.display = c > 0 ? 'inline-block' : 'none';
            badge.textContent = c > 9 ? '9+' : c;
        }
        if (panel) panel.innerHTML = buildPanelHTML(user ? user.username : null);
    }

    /**
     * Khởi tạo toàn bộ UI chuông thông báo: tìm chỗ gắn (findBellAnchor), THAY THẾ link 'Thông báo'
     * cũ bằng cụm nút + panel xổ xuống mới (anchor.replaceWith(wrap)), rồi gắn các sự kiện:
     * bấm vào chuông để mở/đóng panel (đồng thời tự đánh dấu đã đọc), bấm 'Đánh dấu đã đọc',
     * và bấm ra ngoài panel để tự đóng lại (event bubbling lên document).
     * Chỉ chạy 1 LẦN cho mỗi trang (kiểm tra document.getElementById('notifPanel') để tránh khởi tạo lặp).
     */
    function initNotificationBell() {
        const anchor = findBellAnchor();
        if (!anchor || document.getElementById('notifPanel')) return; // đã khởi tạo hoặc không có chỗ gắn
        injectBellStyle();

        const wrap = document.createElement('div');
        wrap.className = 'notif-wrap';
        wrap.innerHTML = `
            <button type="button" class="notif-btn" id="notifBtn">
                Thông báo
                <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
            </button>
            <div class="notif-panel" id="notifPanel">
                <div class="notif-panel-head">
                    <span>Thông báo</span>
                    <button type="button" id="notifMarkRead">Đánh dấu đã đọc</button>
                </div>
                <div id="notifList"></div>
            </div>
        `;

        anchor.replaceWith(wrap);

        const panel = wrap.querySelector('#notifPanel');
        const list = wrap.querySelector('#notifList');
        const btn = wrap.querySelector('#notifBtn');

        function render() {
            const user = getCurrentUser();
            list.innerHTML = buildPanelHTML(user ? user.username : null);
            const badge = wrap.querySelector('#notifBadge');
            const c = user ? unreadNotificationCount(user.username) : 0;
            badge.style.display = c > 0 ? 'inline-block' : 'none';
            badge.textContent = c > 9 ? '9+' : c;
        }
        // gán id trùng với refreshNotificationBell để dùng chung
        panel.id = 'notifPanel';
        wrap.querySelector('#notifBadge').id = 'notifBadge';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.classList.toggle('show');
            if (panel.classList.contains('show')) {
                const user = getCurrentUser();
                if (user) { markAllNotificationsRead(user.username); }
                render();
            }
        });
        wrap.querySelector('#notifMarkRead').addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            const user = getCurrentUser();
            if (user) { markAllNotificationsRead(user.username); render(); }
        });
        panel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => panel.classList.remove('show'));

        render();
    }

    // ---------------- TOAST (thông báo nổi nhỏ, ví dụ "Đã thêm vào giỏ") ----------------
    function injectToastStyle() {
        if (document.getElementById('toast-style')) return;
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            #toastStack { position: fixed; top: 20px; right: 20px; z-index: 5000; display: flex; flex-direction: column; gap: 10px; }
            .shop-toast {
                background: #14100f; border: 1px solid rgba(255,42,42,0.5); color: #fff;
                padding: 14px 18px; border-radius: 10px; font-size: 14px; min-width: 240px;
                box-shadow: 0 8px 20px rgba(0,0,0,0.5); opacity: 0; transform: translateX(20px);
                transition: all 0.3s;
            }
            .shop-toast.show { opacity: 1; transform: translateX(0); }
        `;
        document.head.appendChild(style);
    }

    /**
     * Hiện 1 thông báo nổi nhỏ góc màn hình (vd 'Đã thêm vào giỏ hàng'), tự biến mất sau ~2.6 giây.
     * CƠ CHẾ: tạo 1 thẻ <div> mới, thêm class 'show' bằng requestAnimationFrame (để trình duyệt
     * kịp áp CSS transition mượt thay vì hiện ra đột ngột), rồi dùng 2 lớp setTimeout: 1 để bỏ
     * class 'show' (bắt đầu hiệu ứng mờ dần), 1 để XOÁ HẲN phần tử khỏi DOM sau khi hiệu ứng xong.
     */
    function toast(message) {
        injectToastStyle();
        let stack = document.getElementById('toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            document.body.appendChild(stack);
        }
        const el = document.createElement('div');
        el.className = 'shop-toast';
        el.textContent = message;
        stack.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, 2600);
    }

    document.addEventListener('DOMContentLoaded', function () {
        syncCartBadge();
        initNotificationBell();
    });

    return {
        loadProducts, getProductById, addProduct, updateProduct, deleteProduct, onProductsChanged, formatPrice, getCurrentUser,
        getCart, saveCart, addToCart, updateCartQty, removeFromCart, removeManyFromCart,
        getCartCount, getCartDetailed, syncCartBadge,
        getStock, isOutOfStock, getRemainingStock,
        adjustStock, getInventoryLogs, watchInventoryLogs,
        getReviews, addReview, getRatingSummary, renderStars,
        getAllOrders, getOrdersForUser, watchAllOrders, watchOrdersForUser,
        createOrder, cancelOrder, completeOrder, hasPurchased,
        adminShipOrder, adminApproveReturn, adminSetOrderStatus, requestReturn,
        getNotifications, addNotification, markAllNotificationsRead, unreadNotificationCount,
        initNotificationBell, refreshNotificationBell, timeAgo, toast
    };
})();