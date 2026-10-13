/* ============================================================
   pwa.js — Biến website thành "app": đăng ký service worker,
   gợi ý cài lên màn hình chính, báo online/offline, kéo để làm mới
   (chỉ khi đã cài app), tự bật cập nhật khi có bản mới.
   ============================================================ */
(function () {
    'use strict';

    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    var DISMISS_KEY = 'pwaInstallDismissedAt';
    var DAY = 24 * 3600 * 1000;

    // ----- 1) Service worker -----
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function () { /* không hỗ trợ -> bỏ qua */ });
        });
    }

    function toast(msg) {
        var t = document.createElement('div');
        t.className = 'pwa-toast';
        t.setAttribute('role', 'status');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('hide'); setTimeout(function () { t.remove(); }, 400); }, 2800);
    }

    // ----- 2) Báo mất / có mạng -----
    window.addEventListener('offline', function () { toast('Bạn đang offline - một số chức năng sẽ tạm không dùng được'); });
    window.addEventListener('online', function () { toast('Đã có mạng trở lại'); });

    // ----- 3) Gợi ý cài ứng dụng -----
    var deferred = null;
    function dismissedRecently() {
        var t = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return Date.now() - t < 7 * DAY;
    }
    function showBanner(text, onInstall) {
        if (isStandalone || dismissedRecently() || document.querySelector('.pwa-banner')) return;
        var b = document.createElement('div');
        b.className = 'pwa-banner';
        b.setAttribute('role', 'dialog');
        b.setAttribute('aria-label', 'Cài ứng dụng MODEL SHOP');
        b.innerHTML = '<img src="images/icons/icon-192.png" alt="" width="40" height="40"><span class="pwa-text"></span>' +
            (onInstall ? '<button type="button" class="pwa-install">Cài</button>' : '') +
            '<button type="button" class="pwa-close" aria-label="Đóng"><svg class="icon"><use href="images/icons/lucide.svg#x"/></svg></button>';
        b.querySelector('.pwa-text').textContent = text;
        document.body.appendChild(b);
        function close() { localStorage.setItem(DISMISS_KEY, String(Date.now())); b.remove(); }
        b.querySelector('.pwa-close').addEventListener('click', close);
        if (onInstall) b.querySelector('.pwa-install').addEventListener('click', function () { onInstall(); b.remove(); });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferred = e;
        // đợi khách xem trang ~8 giây rồi mới gợi ý, tránh làm phiền
        setTimeout(function () {
            if (!deferred) return;
            showBanner('Cài MODEL SHOP lên màn hình chính để mua sắm nhanh hơn', function () {
                deferred.prompt();
                deferred.userChoice.finally(function () { deferred = null; });
            });
        }, 8000);
    });
    window.addEventListener('appinstalled', function () { deferred = null; toast('Đã cài MODEL SHOP'); });

    // iOS Safari không có beforeinstallprompt -> hướng dẫn thủ công
    var ua = navigator.userAgent;
    var isIOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    if (isIOS && !isStandalone) {
        setTimeout(function () { showBanner('Để cài app: bấm nút Chia sẻ rồi chọn "Thêm vào MH chính"'); }, 10000);
    }

    // ----- 4) Kéo để làm mới (chỉ trong app đã cài, vì trình duyệt thường đã có sẵn) -----
    if (isStandalone && 'ontouchstart' in window) {
        var startY = 0, pulling = false, dist = 0, ind = null;
        var THRESHOLD = 80;
        document.addEventListener('touchstart', function (e) {
            if (window.scrollY > 0 || document.body.classList.contains('no-scroll')) { pulling = false; return; }
            startY = e.touches[0].clientY; pulling = true; dist = 0;
        }, { passive: true });
        document.addEventListener('touchmove', function (e) {
            if (!pulling) return;
            dist = e.touches[0].clientY - startY;
            if (dist <= 10) return;
            if (!ind) { ind = document.createElement('div'); ind.className = 'ptr-indicator'; ind.innerHTML = '<svg class="icon"><use href="images/icons/lucide.svg#chevron-down"/></svg>'; document.body.appendChild(ind); }
            var d = Math.min(dist, 120);
            ind.style.transform = 'translate(-50%,' + (d - 40) + 'px) rotate(' + (d * 3) + 'deg)';
            ind.classList.toggle('ready', d >= THRESHOLD);
        }, { passive: true });
        document.addEventListener('touchend', function () {
            if (!pulling) return;
            pulling = false;
            if (ind) {
                var ready = dist >= THRESHOLD;
                ind.remove(); ind = null;
                if (ready) { toast('Đang làm mới...'); setTimeout(function () { location.reload(); }, 250); }
            }
        });
    }
})();
