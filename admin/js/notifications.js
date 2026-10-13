// admin/js/notifications.js - Soạn và gửi thông báo hàng loạt tới toàn bộ khách hàng.
// Dùng ShopCore.broadcastNotification() (users/js/shop-core.js): ghi 1 document "notifications"
// cho từng khách trong 1 batch, chuông 🔔 phía khách tự cập nhật real-time qua onSnapshot.

const sentHistory = [];

function renderHistory() {
    const box = document.getElementById('historyList');
    if (sentHistory.length === 0) {
        box.textContent = 'Chưa gửi thông báo nào.';
        return;
    }
    box.innerHTML = sentHistory.map(h => `
        <div style="padding:10px 0; border-bottom:1px solid #333;">
            <b>${h.title.replace(/</g, '&lt;')}</b>
            <span style="color:#999;"> — gửi tới ${h.count} khách lúc ${h.time}</span>
            <div style="color:#aaa; margin-top:4px;">${h.message.replace(/</g, '&lt;')}</div>
        </div>
    `).join('');
}

document.getElementById('broadcastForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const title = document.getElementById('f_title').value.trim();
    const message = document.getElementById('f_message').value.trim();
    const link = document.getElementById('f_link').value.trim();
    if (!title || !message) return;

    if (!confirm('Gửi thông báo này tới TẤT CẢ khách hàng?')) return;

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi...';

    ShopCore.broadcastNotification({ title, message, link }).then(count => {
        sentHistory.unshift({ title, message, count, time: new Date().toLocaleTimeString('vi-VN') });
        renderHistory();
        document.getElementById('broadcastForm').reset();
        ShopCore.toast(`Đã gửi thông báo tới ${count} khách hàng`);
    }).catch(err => {
        console.error(err);
        alert('Gửi thất bại: ' + err.message);
    }).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Gửi thông báo tới tất cả khách hàng';
    });
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});
