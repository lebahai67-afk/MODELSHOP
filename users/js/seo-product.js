/* ============================================================
   seo-product.js — Trang CHI TIẾT: cập nhật tiêu đề tab, mô tả, thẻ Open Graph
   và dữ liệu có cấu trúc JSON-LD (Product) theo đúng sản phẩm đang xem,
   đồng thời gắn ?id=... lên địa chỉ để link chia sẻ mở đúng sản phẩm.
   Không sửa products-detail.js: chỉ quan sát kết quả render.
   ============================================================ */
(function () {
    'use strict';
    var title = document.getElementById('productTitle');
    if (!title) return;
    var done = false;

    function setMeta(attr, key, value) {
        var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute('content', value);
    }
    function abs(src) {
        try { return new URL(src, location.href).href; } catch (e) { return src; }
    }

    function apply() {
        var p = (typeof currentProduct !== 'undefined') ? currentProduct : null;
        if (!p || done) return;
        done = true;

        var name = p.name || 'Sản phẩm';
        var price = Number(p.salePrice && p.salePrice < p.price ? p.salePrice : p.price) || 0;
        var desc = ((p.description || '').replace(/\s+/g, ' ').trim() || (name + ' chính hãng tại MODEL SHOP')).slice(0, 160);
        var img = p.image && p.image.indexOf('data:') !== 0 ? abs(p.image) : '';

        document.title = name + ' - MODEL SHOP';
        setMeta('name', 'description', desc);
        setMeta('property', 'og:type', 'product');
        setMeta('property', 'og:title', name);
        setMeta('property', 'og:description', desc);
        if (img) setMeta('property', 'og:image', img);
        setMeta('property', 'og:url', location.origin + location.pathname + '?id=' + encodeURIComponent(p.id));
        setMeta('property', 'product:price:amount', String(price));
        setMeta('property', 'product:price:currency', 'VND');

        // Địa chỉ chia sẻ được: products-detail.html?id=...
        try {
            var u = new URL(location.href);
            if (u.searchParams.get('id') !== String(p.id)) {
                u.searchParams.set('id', p.id);
                history.replaceState(null, '', u.pathname + u.search + u.hash);
            }
        } catch (e) { /* bỏ qua */ }

        var stock = (typeof ShopCore !== 'undefined' && ShopCore.getStock) ? ShopCore.getStock(p) : (p.stock == null ? 1 : p.stock);
        var ld = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: name,
            description: desc,
            sku: String(p.id),
            category: p.category,
            offers: {
                '@type': 'Offer',
                priceCurrency: 'VND',
                price: price,
                availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                url: location.origin + location.pathname + '?id=' + encodeURIComponent(p.id)
            }
        };
        if (p.brand) ld.brand = { '@type': 'Brand', name: p.brand };
        if (img) ld.image = [img];
        var s = document.getElementById('ld-product');
        if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld-product'; document.head.appendChild(s); }
        s.textContent = JSON.stringify(ld);
    }

    if (window.MutationObserver) new MutationObserver(apply).observe(title, { childList: true, characterData: true, subtree: true });
    var n = 0, t = setInterval(function () { apply(); if (done || ++n > 120) clearInterval(t); }, 200);
})();
