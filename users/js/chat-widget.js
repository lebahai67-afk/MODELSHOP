// users/js/chat-widget.js - Widget chat góc màn hình, gồm 2 tab:
//   Trợ lý AI   : hỏi đáp / xin gợi ý sản phẩm, trả lời bằng Groq AI (ai-assistant.js),
//                    có thể hiện kèm 1-3 thẻ sản phẩm nhỏ ngay trong khung chat, bấm vào sẽ
//                    chuyển tới trang chi tiết sản phẩm đó.
//   Nhân viên    : hỏi đáp trực tiếp với admin, real-time qua Firestore (giữ nguyên như trước).
// Nạp SAU shop-core.js và ai-assistant.js.

(function () {
    const css = `
    .cw-panel { position: fixed; bottom: 92px; right: 20px; width: 400px; max-width: calc(100vw - 32px);
        height: 600px; max-height: calc(100vh - 110px); background: #1c1c1c; color: #eee; border: 1px solid #333;
        border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.45); display: none; flex-direction: column;
        z-index: 1001; overflow: hidden; font-family: inherit; }
    .cw-panel.show { display: flex; }
    .cw-head { background: #d32f2f; color: #fff; padding: 12px 14px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .cw-head button { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
    .cw-tabs { display: flex; border-bottom: 1px solid #333; flex-shrink: 0; }
    .cw-tab { flex: 1; text-align: center; padding: 10px 6px; background: #161616; color: #999; border: none;
        cursor: pointer; font-size: 13.5px; font-weight: 600; border-bottom: 2px solid transparent; }
    .cw-tab.active { color: #fff; background: #1c1c1c; border-bottom-color: #d32f2f; }
    .cw-pane { flex: 1; display: none; flex-direction: column; min-height: 0; }
    .cw-pane.active { display: flex; }
    .cw-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .cw-msg { max-width: 82%; padding: 8px 12px; border-radius: 12px; font-size: 14px; word-break: break-word; white-space: pre-wrap; }
    .cw-msg.user { align-self: flex-end; background: #d32f2f; color: #fff; }
    .cw-msg.admin, .cw-msg.assistant { align-self: flex-start; background: #2c2c2c; }
    .cw-msg.typing { align-self: flex-start; background: #2c2c2c; color: #999; font-style: italic; }
    .cw-hint { margin: auto; text-align: center; color: #888; font-size: 13.5px; padding: 0 12px; }
    .cw-hint a { color: #ff6a6a; }
    .cw-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #333; flex-shrink: 0; }
    .cw-form input { flex: 1; background: #2a2a2a; border: 1px solid #3a3a3a; color: #fff; border-radius: 8px; padding: 9px 10px; font-size: 14px; outline: none; }
    .cw-form button { background: #d32f2f; color: #fff; border: none; border-radius: 8px; padding: 0 14px; cursor: pointer; font-weight: 600; }
    .cw-form button:disabled { opacity: .5; cursor: wait; }
    .cw-badge { position: absolute; top: -4px; right: -4px; background: #ffb300; color: #000; border-radius: 10px;
        font-size: 11px; font-weight: 700; padding: 1px 6px; display: none; }
    .cw-products { display: flex; flex-direction: column; gap: 6px; max-width: 86%; align-self: flex-start; }
    .cw-pcard { display: flex; gap: 8px; align-items: center; background: #242424; border: 1px solid #3a3a3a;
        border-radius: 10px; padding: 6px; cursor: pointer; text-align: left; transition: border-color .15s; }
    .cw-pcard:hover { border-color: #d32f2f; }
    .cw-pcard img { width: 46px; height: 46px; object-fit: cover; border-radius: 6px; flex-shrink: 0; background: #111; }
    .cw-pcard .info { min-width: 0; }
    .cw-pcard .name { font-size: 13px; font-weight: 600; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cw-pcard .price { font-size: 12.5px; color: #ff8a65; font-weight: 700; margin-top: 2px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    function esc(s) { return String(s || '').replace(/</g, '&lt;'); }
    function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }

    function goToProduct(id) {
        localStorage.setItem('clickProductId', id);
        window.location.href = 'products-detail.html?id=' + encodeURIComponent(id);
    }

    function productCardsHTML(products) {
        if (!products || products.length === 0) return '';
        return '<div class="cw-products">' + products.map(p => `
            <button type="button" class="cw-pcard" data-pid="${esc(p.id)}">
                <img src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.style.visibility='hidden'">
                <div class="info">
                    <div class="name">${esc(p.name)}</div>
                    <div class="price">${money(p.price)}</div>
                </div>
            </button>
        `).join('') + '</div>';
    }

    function init() {
        let btn = document.querySelector('.chat-box');
        if (!btn) {
            btn = document.createElement('div');
            btn.className = 'chat-box';
            document.body.appendChild(btn);
        }
        btn.style.position = 'fixed';
        const badge = document.createElement('span');
        badge.className = 'cw-badge';
        badge.textContent = 'Mới';
        btn.appendChild(badge);

        const panel = document.createElement('div');
        panel.className = 'cw-panel';
        panel.innerHTML = `
            <div class="cw-head"><span>Hỗ trợ khách hàng</span><button type="button" aria-label="Đóng"><svg class="icon" aria-hidden="true"><use href="images/icons/lucide.svg#x"/></svg></button></div>
            <div class="cw-tabs">
                <button type="button" class="cw-tab active" data-tab="ai">Trợ lý AI</button>
                <button type="button" class="cw-tab" data-tab="human">Nhân viên</button>
            </div>
            <div class="cw-pane active" data-pane="ai">
                <div class="cw-body" id="cwAiBody"></div>
                <form class="cw-form" id="cwAiForm">
                    <input type="text" id="cwAiInput" placeholder="Hỏi về sản phẩm, xin gợi ý theo ngân sách..." autocomplete="off">
                    <button type="submit">Gửi</button>
                </form>
            </div>
            <div class="cw-pane" data-pane="human">
                <div class="cw-body" id="cwHumanBody"></div>
                <form class="cw-form" id="cwHumanForm">
                    <input type="text" id="cwHumanInput" placeholder="Nhập câu hỏi của bạn..." autocomplete="off">
                    <button type="submit">Gửi</button>
                </form>
            </div>`;
        document.body.appendChild(panel);

        // ---------------- Chuyển tab ----------------
        panel.querySelectorAll('.cw-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                panel.querySelectorAll('.cw-tab').forEach(t => t.classList.remove('active'));
                panel.querySelectorAll('.cw-pane').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                panel.querySelector('.cw-pane[data-pane="' + this.getAttribute('data-tab') + '"]').classList.add('active');
            });
        });

        // ---------------- Mở / đóng panel ----------------
        let isOpen = false;
        let currentUser = null;
        btn.addEventListener('click', function (e) {
            if (e.target.closest('.cw-panel')) return;
            isOpen = !panel.classList.contains('show');
            panel.classList.toggle('show', isOpen);
            if (isOpen) {
                badge.style.display = 'none';
                if (currentUser) ShopCore.markChatRead(currentUser.username, 'user');
                setTimeout(() => document.getElementById('cwAiInput').focus(), 50);
            }
        });
        panel.querySelector('.cw-head button').addEventListener('click', function () {
            isOpen = false;
            panel.classList.remove('show');
        });

        // ============================================================
        // TAB 1: TRỢ LÝ AI (Groq) - không cần đăng nhập vẫn hỏi được
        // ============================================================
        const aiBody = document.getElementById('cwAiBody');
        const aiForm = document.getElementById('cwAiForm');
        const aiInput = document.getElementById('cwAiInput');
        let aiHistory = []; // [{role, content}] - ngữ cảnh ngắn hạn gửi kèm mỗi câu hỏi mới

        function aiWelcome() {
            aiBody.innerHTML = '<div class="cw-hint">Xin chào! Mình là trợ lý AI của MODEL SHOP. Hỏi mình về sản phẩm, hoặc cho mình biết ngân sách để được gợi ý nhé!</div>';
        }
        aiWelcome();

        function appendAiBubble(role, text, products) {
            const row = document.createElement('div');
            row.style.display = 'contents';
            const bubble = document.createElement('div');
            bubble.className = 'cw-msg ' + (role === 'user' ? 'user' : 'assistant');
            bubble.textContent = text;
            aiBody.appendChild(bubble);
            if (products && products.length) {
                const wrap = document.createElement('div');
                wrap.innerHTML = productCardsHTML(products);
                aiBody.appendChild(wrap.firstChild);
            }
            aiBody.scrollTop = aiBody.scrollHeight;
        }

        aiBody.addEventListener('click', function (e) {
            const card = e.target.closest('.cw-pcard');
            if (card) goToProduct(card.getAttribute('data-pid'));
        });

        aiForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = aiInput.value.trim();
            if (!text) return;
            if (aiBody.querySelector('.cw-hint')) aiBody.innerHTML = '';
            aiInput.value = '';
            appendAiBubble('user', text);

            const typing = document.createElement('div');
            typing.className = 'cw-msg typing';
            typing.textContent = 'Đang soạn trả lời...';
            aiBody.appendChild(typing);
            aiBody.scrollTop = aiBody.scrollHeight;
            aiInput.disabled = true;

            AIAssistant.ask(text, aiHistory).then(({ reply, products }) => {
                typing.remove();
                appendAiBubble('assistant', reply, products);
                aiHistory.push({ role: 'user', content: text });
                aiHistory.push({ role: 'assistant', content: reply });
            }).catch(err => {
                console.error('[AIAssistant]', err);
                typing.remove();
                appendAiBubble('assistant', 'Xin lỗi, trợ lý AI đang gặp sự cố kết nối. Bạn thử lại sau hoặc chuyển qua tab Nhân viên nhé.');
            }).finally(() => {
                aiInput.disabled = false;
                aiInput.focus();
            });
        });

        // ============================================================
        // TAB 2: NHÂN VIÊN (real-time qua Firestore, giữ nguyên cơ chế cũ)
        // ============================================================
        const humanBody = document.getElementById('cwHumanBody');
        const humanForm = document.getElementById('cwHumanForm');
        const humanInput = document.getElementById('cwHumanInput');

        function showHumanHint(html) {
            humanBody.innerHTML = '<div class="cw-hint">' + html + '</div>';
            humanForm.style.display = 'none';
        }

        function startHumanChat(user) {
            if (!user) {
                showHumanHint('Vui lòng <a href="signin.html">đăng nhập</a> để chat trực tiếp với nhân viên.');
                return;
            }
            if (user.role === 'admin') {
                showHumanHint('Bạn đang đăng nhập bằng tài khoản quản trị. Hãy trả lời khách tại trang <b>Hỏi đáp</b> trong khu vực admin.');
                return;
            }
            currentUser = user;
            humanForm.style.display = 'flex';
            humanBody.innerHTML = '<div class="cw-hint">Xin chào! Hãy nhập câu hỏi, cửa hàng sẽ phản hồi sớm nhất có thể </div>';

            ShopCore.watchChatMessages(user.username, function (list) {
                if (list.length === 0) return;
                humanBody.innerHTML = list.map(m =>
                    '<div class="cw-msg ' + m.sender + '">' + esc(m.text) + '</div>').join('');
                humanBody.scrollTop = humanBody.scrollHeight;
                if (isOpen) ShopCore.markChatRead(user.username, 'user');
            });

            // Theo dõi cờ "unreadForUser" để hiện chấm "Mới" khi admin trả lời lúc panel đang đóng.
            db.collection('chats').doc(user.username).onSnapshot(function (doc) {
                const unread = doc.exists && doc.data().unreadForUser;
                badge.style.display = (unread && !isOpen) ? 'block' : 'none';
            });
        }

        humanForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = humanInput.value.trim();
            if (!text || !currentUser) return;
            humanInput.value = '';
            ShopCore.sendChatMessage(currentUser.username, 'user', text);
        });

        // Đợi Firebase khôi phục phiên đăng nhập xong mới biết là ai đang chat với nhân viên.
        if (window.AuthService && AuthService.ready) {
            AuthService.ready.then(startHumanChat);
        } else {
            startHumanChat(ShopCore.getCurrentUser());
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
