// admin/js/statistics.js - Trang "Thống kê": vẽ toàn bộ biểu đồ từ dữ liệu đơn hàng + sản phẩm
// thật (Firestore, qua ShopCore), dùng Chart.js (nạp qua CDN trong statistics.html).
// Mọi đơn "Đã hủy" bị loại khỏi các tính toán doanh thu/số liệu (coi như chưa từng xảy ra).

const STATUS_COLORS = {
    'Chờ xác nhận': '#facc15',
    'Đang giao': '#60a5fa',
    'Hoàn thành': '#4ade80',
    'Yêu cầu trả hàng': '#fb923c',
    'Đã trả hàng': '#94a3b8',
    'Đã hủy': '#ff6b6b'
};
const CATEGORY_LABELS = { anime: 'Mô hình Anime', gundam: 'Gundam', car: 'Siêu xe', tools: 'Dụng cụ' };

function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }
function pad2(n) { return String(n).padStart(2, '0'); }
// Cộng/trừ n tháng vào 1 Date, luôn neo về ngày 1 để tránh lỗi lệch tháng (vd 31/1 - 1 tháng).
function addMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

let allOrders = [];
let allProducts = [];
let revenueRangeMode = 'd7';

let revenueChart = null, statusChart = null, categoryChart = null;

const chartDefaults = {
    plugins: { legend: { labels: { color: '#ddd' } } },
    scales: {
        x: { ticks: { color: '#bbb' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#bbb' }, grid: { color: 'rgba(255,255,255,0.06)' } }
    }
};

// ---------- Ô số liệu tổng quan ----------
function renderStatBoxes(validOrders, allOrdersList) {
    const revenue = validOrders.reduce((s, o) => s + (o.total || 0), 0);
    const doneCount = validOrders.filter(o => o.status === 'Hoàn thành').length;
    const itemsSold = validOrders.reduce((s, o) => s + (o.items || []).reduce((s2, i) => s2 + (i.quantity || 0), 0), 0);
    const cancelledCount = allOrdersList.filter(o => o.status === 'Đã hủy').length;
    const cancelRate = allOrdersList.length ? (cancelledCount / allOrdersList.length * 100) : 0;

    document.getElementById('statRevenue').textContent = money(revenue);
    document.getElementById('statOrderCount').textContent = validOrders.length;
    document.getElementById('statAvgOrder').textContent =
        money(validOrders.length ? Math.round(revenue / validOrders.length) : 0);
    document.getElementById('statDoneCount').textContent = doneCount;
    document.getElementById('statItemsSold').textContent = itemsSold.toLocaleString('vi-VN');
    document.getElementById('statCancelRate').textContent = cancelRate.toFixed(1).replace(/\.0$/, '') + '%';
}

// ---------- Tổng doanh thu trong khoảng [start, end) ----------
function revenueInRange(validOrders, start, end) {
    return validOrders
        .filter(o => o.createdAt && new Date(o.createdAt) >= start && new Date(o.createdAt) < end)
        .reduce((s, o) => s + (o.total || 0), 0);
}

// ---------- Hiển thị % tăng/giảm doanh thu so với kỳ liền trước (cùng độ dài) ----------
function renderRevenueDelta(validOrders, mode) {
    const el = document.getElementById('statRevenueDelta');
    if (!el) return;
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let curStart, prevStart;

    if (mode === 'd7' || mode === 'd30') {
        const days = mode === 'd7' ? 7 : 30;
        curStart = new Date(endOfToday); curStart.setDate(curStart.getDate() - days);
        prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
    } else if (mode === 'm12') {
        curStart = addMonths(endOfToday, -12);
        prevStart = addMonths(curStart, -12);
    } else if (mode === 'q8') {
        curStart = addMonths(endOfToday, -24);
        prevStart = addMonths(curStart, -24);
    } else { // y5
        curStart = new Date(now.getFullYear() - 5, 0, 1);
        prevStart = new Date(now.getFullYear() - 10, 0, 1);
    }

    const curRevenue = revenueInRange(validOrders, curStart, endOfToday);
    const prevRevenue = revenueInRange(validOrders, prevStart, curStart);

    if (prevRevenue === 0) {
        el.textContent = curRevenue > 0 ? '▲ Kỳ trước chưa có doanh thu' : '';
        el.className = 'stat-delta' + (curRevenue > 0 ? ' up' : '');
        return;
    }
    const pct = ((curRevenue - prevRevenue) / prevRevenue) * 100;
    const up = pct >= 0;
    el.textContent = (up ? '▲ +' : '▼ ') + pct.toFixed(1) + '% so với kỳ trước';
    el.className = 'stat-delta ' + (up ? 'up' : 'down');
}

// ---------- Gom nhóm doanh thu theo mốc thời gian đang chọn (ngày/tháng/quý/năm) ----------
function buildRevenueSeries(validOrders, mode) {
    const now = new Date();
    const labels = [];
    const buckets = []; // mỗi phần tử: hàm test(orderDate) => true/false

    if (mode === 'd7' || mode === 'd30') {
        const days = mode === 'd7' ? 7 : 30;
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            labels.push(d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
            buckets.push(o => String(o.createdAt).slice(0, 10) === key);
        }
    } else if (mode === 'm12') {
        for (let i = 11; i >= 0; i--) {
            const d = addMonths(now, -i);
            const key = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
            labels.push('Th' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2));
            buckets.push(o => String(o.createdAt).slice(0, 7) === key);
        }
    } else if (mode === 'q8') {
        const curQ = Math.floor(now.getMonth() / 3);
        const curTotalQ = now.getFullYear() * 4 + curQ;
        for (let i = 7; i >= 0; i--) {
            const totalQ = curTotalQ - i;
            const year = Math.floor(totalQ / 4);
            const q = ((totalQ % 4) + 4) % 4;
            labels.push('Q' + (q + 1) + '/' + String(year).slice(2));
            buckets.push(o => {
                const d = new Date(o.createdAt);
                return d.getFullYear() === year && Math.floor(d.getMonth() / 3) === q;
            });
        }
    } else { // y5
        for (let i = 4; i >= 0; i--) {
            const year = now.getFullYear() - i;
            labels.push(String(year));
            buckets.push(o => new Date(o.createdAt).getFullYear() === year);
        }
    }

    const data = buckets.map(test => validOrders.filter(o => o.createdAt && test(o)).reduce((s, o) => s + (o.total || 0), 0));
    return { labels, data };
}

// ---------- Biểu đồ doanh thu theo thời gian ----------
function renderRevenueChart(validOrders) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const { labels, data } = buildRevenueSeries(validOrders, revenueRangeMode);

    if (revenueChart) { revenueChart.destroy(); }
    revenueChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Doanh thu',
                data,
                borderColor: '#ff5555',
                backgroundColor: 'rgba(220,38,38,0.18)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#ff5555'
            }]
        },
        options: Object.assign({}, chartDefaults, {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => money(ctx.parsed.y) } }
            },
            scales: Object.assign({}, chartDefaults.scales, {
                y: Object.assign({}, chartDefaults.scales.y, {
                    ticks: { color: '#bbb', callback: v => (v >= 1000000 ? (v / 1000000) + 'tr' : v) }
                })
            })
        })
    });

    renderRevenueDelta(validOrders, revenueRangeMode);
}

// ---------- Biểu đồ trạng thái đơn hàng (doughnut, TÍNH CẢ đơn đã hủy để phản ánh đúng thực tế) ----------
function renderStatusChart(orders) {
    const canvas = document.getElementById('statusChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const counts = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    const labels = Object.keys(counts);
    const data = labels.map(l => counts[l]);
    const colors = labels.map(l => STATUS_COLORS[l] || '#999');

    if (statusChart) { statusChart.destroy(); }
    if (labels.length === 0) return;

    statusChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#17130f', borderWidth: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#ddd', boxWidth: 12, padding: 10 } } }
        }
    });
}

// ---------- Sản phẩm bán chạy nổi bật: thẻ có ảnh, xếp hạng, số lượng + doanh thu ----------
function renderTopProductsShowcase(validOrders, products) {
    const wrap = document.getElementById('topProductsShowcase');
    if (!wrap) return;

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    const statByProduct = {}; // id -> {qty, revenue}
    validOrders.forEach(o => {
        (o.items || []).forEach(item => {
            if (!statByProduct[item.id]) statByProduct[item.id] = { qty: 0, revenue: 0, name: item.name, image: item.image };
            statByProduct[item.id].qty += item.quantity || 0;
            statByProduct[item.id].revenue += (item.price || 0) * (item.quantity || 0);
        });
    });

    const top = Object.entries(statByProduct)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5);

    if (top.length === 0) {
        wrap.innerHTML = '<div class="empty">Chưa có dữ liệu bán hàng để xếp hạng.</div>';
        return;
    }

    const medals = ['1', '2', '3', '4', '5'];
    wrap.innerHTML = top.map(([id, s], idx) => {
        const p = productMap[id];
        const imgSrc = p ? ('../users/' + p.image) : (s.image ? '../users/' + s.image : '');
        const catLabel = p ? (CATEGORY_LABELS[p.category] || p.category) : '';
        return `
        <div class="tp-card ${idx === 0 ? 'tp-rank-1' : ''}">
            <div class="tp-rank">${medals[idx]}</div>
            <img class="tp-img" src="${imgSrc}" alt="${s.name}" onerror="this.style.visibility='hidden'">
            <div class="tp-body">
                <div class="tp-name" title="${s.name}">${s.name}</div>
                ${catLabel ? `<div class="tp-cat">${catLabel}</div>` : ''}
                <div class="tp-metrics">
                    <span>Đã bán: <strong>${s.qty}</strong></span>
                    <span><strong>${money(s.revenue)}</strong></span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ---------- Doanh thu theo danh mục sản phẩm ----------
function renderCategoryChart(validOrders, products) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    const revenueByCategory = {};
    validOrders.forEach(o => {
        (o.items || []).forEach(item => {
            const p = productMap[item.id];
            const cat = p ? (CATEGORY_LABELS[p.category] || p.category) : 'Khác';
            revenueByCategory[cat] = (revenueByCategory[cat] || 0) + item.price * item.quantity;
        });
    });

    const labels = Object.keys(revenueByCategory);
    const data = labels.map(l => revenueByCategory[l]);
    const palette = ['#dc2626', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];

    if (categoryChart) { categoryChart.destroy(); }
    if (labels.length === 0) return;

    categoryChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => palette[i % palette.length]), borderColor: '#17130f', borderWidth: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#ddd', boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${money(ctx.parsed)}` } }
            }
        }
    });
}

// ---------- Top 5 khách hàng chi tiêu nhiều nhất (gộp theo username, dùng tên/địa chỉ trong đơn gần nhất) ----------
function renderTopCustomers(validOrders) {
    const wrap = document.getElementById('topCustomersList');
    if (!wrap) return;

    const byUser = {}; // username -> {total, orderCount, fullname}
    validOrders.forEach(o => {
        const key = o.username || (o.customer && o.customer.fullname) || 'Khách vãng lai';
        if (!byUser[key]) byUser[key] = { total: 0, orderCount: 0, fullname: (o.customer && o.customer.fullname) || key };
        byUser[key].total += o.total || 0;
        byUser[key].orderCount += 1;
        byUser[key].fullname = (o.customer && o.customer.fullname) || byUser[key].fullname;
    });

    const top = Object.entries(byUser).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

    if (top.length === 0) {
        wrap.innerHTML = '<div class="empty">Chưa có dữ liệu khách hàng.</div>';
        return;
    }

    wrap.innerHTML = top.map(([username, s], idx) => `
        <div class="tc-row">
            <div class="tc-rank">${idx + 1}</div>
            <div class="tc-info">
                <div class="tc-name">${s.fullname}</div>
                <div class="tc-sub">@${username} · ${s.orderCount} đơn</div>
            </div>
            <div class="tc-total">${money(s.total)}</div>
        </div>
    `).join('');
}

// ---------- Xuất báo cáo CSV (toàn bộ đơn hợp lệ đang có) ----------
function exportCsv() {
    const validOrders = allOrders.filter(o => o.status !== 'Đã hủy');
    const rows = [['Mã đơn', 'Khách hàng', 'Ngày tạo', 'Trạng thái', 'Số SP', 'Tổng tiền']];
    validOrders.forEach(o => {
        const itemCount = (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        rows.push([
            o.id, (o.customer && o.customer.fullname) || o.username || '',
            o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '',
            o.status, itemCount, o.total || 0
        ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thong-ke-don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ---------- Vẽ lại toàn bộ trang thống kê từ dữ liệu hiện có ----------
function renderAll() {
    const validOrders = allOrders.filter(o => o.status !== 'Đã hủy');
    renderStatBoxes(validOrders, allOrders);
    renderRevenueChart(validOrders);
    renderStatusChart(allOrders);
    renderTopProductsShowcase(validOrders, allProducts);
    renderCategoryChart(validOrders, allProducts);
    renderTopCustomers(validOrders);
}

document.getElementById('revenueRangeTabs').addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    document.querySelectorAll('#revenueRangeTabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    revenueRangeMode = btn.getAttribute('data-range');
    renderRevenueChart(allOrders.filter(o => o.status !== 'Đã hủy'));
});

document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

// Tải sản phẩm 1 lần (đủ cho việc tra tên/danh mục), rồi lắng nghe đơn hàng REAL-TIME - mỗi
// khi có đơn mới hoặc đổi trạng thái, toàn bộ biểu đồ tự vẽ lại ngay, không cần F5.
ShopCore.loadProducts().then(products => {
    allProducts = products;
    ShopCore.watchAllOrders(function (orders) {
        allOrders = orders;
        renderAll();
    });
});

// ---- Sản phẩm được yêu thích nhiều nhất (wishlist) ----
function renderWishlistStats() {
    ShopCore.getWishlistCounts().then(function (counts) {
        const tbody = document.getElementById('wishlistTableBody');
        const rows = counts.slice(0, 10).map(function (c, i) {
            const p = allProducts.find(function (x) { return x.id === c.productId; });
            if (!p) return '';
            return '<tr><td>' + (i + 1) + '</td><td>' + p.name.replace(/</g, '&lt;') + '</td><td>' + (p.category || '-') +
                '</td><td>' + ShopCore.getStock(p) + '</td><td><b>' + c.count + '</b></td></tr>';
        }).filter(Boolean);
        tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="empty">Chưa có khách nào thêm sản phẩm yêu thích</td></tr>';
    });
}
ShopCore.loadProducts().then(renderWishlistStats); // đăng ký sau khối gán allProducts nên luôn chạy sau nó
