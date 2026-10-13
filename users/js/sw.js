/* ============================================================
   sw.js — Service Worker của MODEL SHOP (chỉ phục vụ phần users/)
   Chiến lược (an toàn cho shop có dữ liệu thay đổi liên tục):
   - Trang HTML      : ưu tiên MẠNG, lỗi mạng mới dùng bản đã lưu, rồi tới offline.html
   - CSS / JS        : trả bản đã lưu ngay, đồng thời tải bản mới ngầm (stale-while-revalidate)
   - Ảnh             : ưu tiên bản đã lưu (giới hạn số lượng để không đầy bộ nhớ)
   - data/*.json     : ưu tiên MẠNG (giá/tồn kho phải mới)
   - Mọi yêu cầu tới domain khác (Firebase, Google...) và mọi yêu cầu không phải GET:
     KHÔNG can thiệp -> đơn hàng, đăng nhập, Firestore hoạt động y như cũ.
   Khi sửa file giao diện, tăng VERSION để khách nhận bản mới ngay.
   ============================================================ */
const VERSION = 'v2';
const C_STATIC = 'ms-static-' + VERSION;
const C_PAGES = 'ms-pages-' + VERSION;
const C_IMG = 'ms-img-' + VERSION;
const IMG_LIMIT = 120;
const PRECACHE = ['offline.html', 'manifest.json', 'images/icons/icon-192.png', 'images/icons/lucide.svg', 'css/global.css', 'css/responsive.css'];

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(C_STATIC).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('ms-') === 0 && [C_STATIC, C_PAGES, C_IMG].indexOf(k) === -1; })
            .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

function trim(cacheName, max) {
    caches.open(cacheName).then(function (c) {
        c.keys().then(function (keys) { if (keys.length > max) c.delete(keys[0]).then(function () { trim(cacheName, max); }); });
    });
}

function networkFirst(req, cacheName, fallbackUrl) {
    return fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(cacheName).then(function (c) { c.put(req, copy); }); }
        return res;
    }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || (fallbackUrl ? caches.match(fallbackUrl) : Response.error()); });
    });
}

function staleWhileRevalidate(req, cacheName) {
    return caches.open(cacheName).then(function (c) {
        return c.match(req).then(function (hit) {
            var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
            return hit || net;
        });
    });
}

function cacheFirst(req, cacheName, limit) {
    return caches.open(cacheName).then(function (c) {
        return c.match(req).then(function (hit) {
            if (hit) return hit;
            return fetch(req).then(function (res) {
                if (res && res.ok) { c.put(req, res.clone()); if (limit) trim(cacheName, limit); }
                return res;
            });
        });
    });
}

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, C_PAGES, 'offline.html')); return; }
    if (/\.json$/.test(url.pathname)) { e.respondWith(networkFirst(req, C_PAGES)); return; }
    if (/\.(css|js)$/.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req, C_STATIC)); return; }
    if (/\.(png|jpe?g|webp|gif|svg|ico)$/.test(url.pathname)) { e.respondWith(cacheFirst(req, C_IMG, IMG_LIMIT)); return; }
});
