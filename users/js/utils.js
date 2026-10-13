/* ============================================================
   utils.js — Hàm tiện ích dùng chung (nạp TRƯỚC products.js / products-detail.js)
   Gom về một chỗ để các trang không phải viết lại: escape HTML, định dạng tiền,
   ảnh thu nhỏ (thumbnail WebP) kèm srcset.
   ============================================================ */
(function (global) {
    'use strict';

    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    // Chống chèn HTML/JS độc hại khi in dữ liệu người dùng (tên, bình luận...) ra innerHTML
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
    }

    function money(n) {
        return Number(n || 0).toLocaleString('vi-VN') + 'đ';
    }

    // images/abc.jpg -> images/thumbs/abc.webp ('' nếu không phải ảnh trong thư mục images/)
    function thumbOf(src) {
        var m = /^images\/([^\/]+)\.[a-z0-9]+$/i.exec(src || '');
        return m ? 'images/thumbs/' + m[1] + '.webp' : '';
    }

    // Thuộc tính srcset + onerror (nếu thiếu thumbnail thì tự quay về ảnh gốc, không bao giờ mất ảnh)
    function srcsetAttrs(src, sizes) {
        var t = thumbOf(src);
        if (!t) return '';
        return 'srcset="' + t + ' 480w, ' + src + ' 1000w" sizes="' + (sizes || '(max-width: 768px) 46vw, 280px') + '" ' +
            'onerror="this.onerror=null;this.removeAttribute(\'srcset\');this.removeAttribute(\'sizes\');this.src=\'' + src + '\'"';
    }

    // Giá đang bán (ưu tiên giá khuyến mãi nếu có và thấp hơn giá gốc)
    function effectivePrice(p) {
        return p && p.salePrice && p.salePrice < p.price ? p.salePrice : (p ? p.price : 0);
    }

    global.MS = { esc: esc, money: money, thumbOf: thumbOf, srcsetAttrs: srcsetAttrs, effectivePrice: effectivePrice };
})(window);
