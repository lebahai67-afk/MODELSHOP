/* ============================================================
   gallery.js — Trang CHI TIẾT sản phẩm
   1) Trạng thái tải (skeleton) cho ảnh/tiêu đề/giá trong lúc chờ dữ liệu
   2) Phóng to ảnh: chạm vào ảnh để xem toàn màn hình (chạm lần nữa để đóng/zoom)
   3) Thư viện ảnh vuốt ngang: tự bật khi sản phẩm có mảng "images" (>= 2 ảnh)
      trong dữ liệu; sản phẩm chỉ có 1 ảnh "image" thì giữ nguyên như cũ.
   Không sửa products-detail.js: file này chỉ quan sát kết quả render.
   ============================================================ */
(function () {
    'use strict';

    var detail = document.querySelector('.product-detail');
    var box = document.querySelector('.main-image');
    var main = document.getElementById('mainImage');
    var title = document.getElementById('productTitle');
    if (!detail || !box || !main || !title) return;

    detail.classList.add('is-loading');
    var built = false;

    function listImages(p) {
        var arr = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
        if (p.image && arr.indexOf(p.image) === -1) arr.unshift(p.image);
        return arr.length ? arr : [p.image];
    }

    function build() {
        var p = (typeof currentProduct !== 'undefined') ? currentProduct : null;
        if (!p || built) return;
        built = true;
        detail.classList.remove('is-loading');

        var imgs = listImages(p);
        allSrc = imgs.slice();
        if (imgs.length > 1) buildCarousel(imgs, p);
        bindZoom();
    }

    function buildCarousel(imgs, p) {
        var track = document.createElement('div');
        track.className = 'g-track';
        imgs.forEach(function (src, i) {
            var im = i === 0 ? main : document.createElement('img');
            im.src = src;
            im.alt = p.name + ' (' + (i + 1) + '/' + imgs.length + ')';
            if (i > 0) im.loading = 'lazy';
            track.appendChild(im);
        });
        box.appendChild(track);

        var dots = document.createElement('div');
        dots.className = 'g-dots';
        imgs.forEach(function (_, i) {
            var d = document.createElement('button');
            d.type = 'button';
            d.setAttribute('aria-label', 'Ảnh ' + (i + 1));
            d.addEventListener('click', function () { go(i); });
            dots.appendChild(d);
        });
        box.parentNode.insertBefore(dots, box.nextSibling);

        var thumbs = document.createElement('div');
        thumbs.className = 'g-thumbs';
        imgs.forEach(function (src, i) {
            var t = document.createElement('button');
            t.type = 'button';
            t.setAttribute('aria-label', 'Xem ảnh ' + (i + 1));
            t.innerHTML = '<img src="' + src + '" alt="" loading="lazy">';
            t.addEventListener('click', function () { go(i); });
            thumbs.appendChild(t);
        });
        box.parentNode.insertBefore(thumbs, dots.nextSibling);

        function go(i) { track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }); }
        function sync() {
            var i = Math.round(track.scrollLeft / (track.clientWidth || 1));
            Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('active', k === i); });
            Array.prototype.forEach.call(thumbs.children, function (d, k) { d.classList.toggle('active', k === i); });
        }
        track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
        sync();
        box.classList.add('has-gallery');
    }

    // ----- Xem ảnh toàn màn hình (vuốt trái/phải hoặc phím ← → để chuyển ảnh) -----
    var allSrc = [];
    var lightbox = null, lbIndex = 0;

    function bindZoom() {
        box.addEventListener('click', function (e) {
            var im = e.target.closest('img');
            if (!im || !box.contains(im)) return;
            var i = allSrc.indexOf(im.getAttribute('src'));
            openLightbox(i < 0 ? 0 : i, i < 0 ? [im.currentSrc || im.src] : null);
        });
        box.style.cursor = 'zoom-in';
    }

    function openLightbox(index, override) {
        if (lightbox) return;
        var list = override || allSrc;
        if (!list.length) return;
        lbIndex = index;
        lightbox = document.createElement('div');
        lightbox.className = 'g-lightbox';
        lightbox.setAttribute('role', 'dialog');
        lightbox.setAttribute('aria-modal', 'true');
        lightbox.innerHTML = '<button type="button" class="g-lb-close" aria-label="Đóng"><svg class="icon"><use href="images/icons/lucide.svg#x"/></svg></button>' +
            (list.length > 1 ? '<button type="button" class="g-lb-nav prev" aria-label="Ảnh trước"><svg class="icon"><use href="images/icons/lucide.svg#chevron-left"/></svg></button>' +
                '<button type="button" class="g-lb-nav next" aria-label="Ảnh sau"><svg class="icon"><use href="images/icons/lucide.svg#chevron-right"/></svg></button><div class="g-lb-count"></div>' : '') +
            '<div class="g-lb-scroll"><img alt=""></div>';
        var im = lightbox.querySelector('img');
        var counter = lightbox.querySelector('.g-lb-count');

        function show(i) {
            lbIndex = (i + list.length) % list.length;
            im.src = list[lbIndex];
            lightbox.classList.remove('zoomed');
            if (counter) counter.textContent = (lbIndex + 1) + ' / ' + list.length;
        }
        lightbox._show = show;
        lightbox._len = list.length;
        show(index);

        im.addEventListener('click', function (e) { e.stopPropagation(); lightbox.classList.toggle('zoomed'); });
        lightbox.addEventListener('click', function (e) {
            if (e.target.closest('.g-lb-nav')) { show(lbIndex + (e.target.closest('.g-lb-nav').classList.contains('next') ? 1 : -1)); e.stopPropagation(); return; }
            closeLightbox();
        });

        var x0 = null;
        lightbox.addEventListener('touchstart', function (e) { x0 = lightbox.classList.contains('zoomed') ? null : e.touches[0].clientX; }, { passive: true });
        lightbox.addEventListener('touchend', function (e) {
            if (x0 === null || list.length < 2) return;
            var dx = e.changedTouches[0].clientX - x0;
            if (Math.abs(dx) > 50) { show(lbIndex + (dx < 0 ? 1 : -1)); }
            x0 = null;
        });

        document.body.appendChild(lightbox);
        document.body.classList.add('no-scroll');
        lightbox.querySelector('.g-lb-close').focus();
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.remove(); lightbox = null;
        document.body.classList.remove('no-scroll');
    }
    document.addEventListener('keydown', function (e) {
        if (!lightbox) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowRight' && lightbox._len > 1) lightbox._show(lbIndex + 1);
        else if (e.key === 'ArrowLeft' && lightbox._len > 1) lightbox._show(lbIndex - 1);
    });

    // renderProduct() gán tiêu đề thật -> đó là lúc dữ liệu đã sẵn sàng
    if (window.MutationObserver) {
        new MutationObserver(build).observe(title, { childList: true, characterData: true, subtree: true });
    }
    var tries = 0;
    // Dừng trạng thái "đang tải" khi: đã dựng xong, trang báo "không tìm thấy" (tiêu đề bị thay),
    // hoặc quá ~18 giây vẫn chưa có dữ liệu.
    var timer = setInterval(function () {
        build();
        if (built || !document.body.contains(title) || ++tries > 120) {
            detail.classList.remove('is-loading');
            clearInterval(timer);
        }
    }, 150);
})();
