// admin/js/chats.js - Trả lời hỏi đáp real-time với khách hàng.
// Danh sách cuộc hội thoại: ShopCore.watchAllChatThreads (onSnapshot, giống cơ chế đơn hàng).
// Khung chat: ShopCore.watchChatMessages(username).

let threads = [];
let activeUser = null;
let unsubMessages = null;

function esc(s) { return String(s || '').replace(/</g, '&lt;'); }

function renderThreads() {
    const box = document.getElementById('threadList');
    if (threads.length === 0) {
        box.innerHTML = '<div class="empty" style="padding:16px;">Chưa có cuộc hội thoại nào</div>';
        return;
    }
    box.innerHTML = threads.map(t => `
        <div class="thread-item ${t.username === activeUser ? 'active' : ''}" data-user="${esc(t.username)}">
            <div class="name">
                <span>${esc(t.username)}</span>
                ${t.unreadForAdmin ? '<span class="unread-dot">Mới</span>' : ''}
            </div>
            <div class="last">${esc(t.lastMessage)}</div>
        </div>
    `).join('');
}

function renderMessages(list) {
    const body = document.getElementById('chatBody');
    if (list.length === 0) {
        body.innerHTML = '<div class="chat-empty">Chưa có tin nhắn</div>';
        return;
    }
    body.innerHTML = list.map(m => `
        <div class="bubble ${m.sender}">
            ${esc(m.text)}
            <span class="t">${new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `).join('');
    body.scrollTop = body.scrollHeight;
}

function openThread(username) {
    activeUser = username;
    document.getElementById('chatHead').textContent = '' + username;
    document.getElementById('chatForm').style.display = 'flex';
    if (unsubMessages) unsubMessages();
    unsubMessages = ShopCore.watchChatMessages(username, list => {
        renderMessages(list);
        // Đang mở khung chat này mà có tin mới của khách -> coi như đã đọc luôn.
        ShopCore.markChatRead(username, 'admin');
    });
    renderThreads();
}

document.getElementById('threadList').addEventListener('click', function (e) {
    const item = e.target.closest('.thread-item');
    if (item) openThread(item.getAttribute('data-user'));
});

document.getElementById('chatForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const input = document.getElementById('chatText');
    const text = input.value.trim();
    if (!text || !activeUser) return;
    input.value = '';
    ShopCore.sendChatMessage(activeUser, 'admin', text);
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    auth.signOut().then(function () {
        localStorage.removeItem('cart_guest');
        window.location.href = '../users/signin.html';
    });
});

ShopCore.watchAllChatThreads(function (list) {
    threads = list;
    renderThreads();
});
