// users/js/ai-assistant.js - Trợ lý AI bán hàng, dùng Groq (API tương thích OpenAI) để trả lời
// câu hỏi của khách và gợi ý sản phẩm phù hợp (vd theo ngân sách khách đưa ra).
//
// LƯU Ý BẢO MẬT: API key dưới đây nằm trong code CHẠY Ở TRÌNH DUYỆT (client-side), nên bất kỳ
// ai mở DevTools / xem "View source" đều lấy được key này. Điều này CHẤP NHẬN ĐƯỢC cho mục đích
// demo/đồ án, nhưng với 1 sản phẩm thật sự đưa lên production, nên chuyển lời gọi Groq này sang
// 1 Cloud Function / server riêng (giữ key ở backend) rồi cho trang web gọi vào server đó thay vì
// gọi thẳng api.groq.com như hiện tại.
const AIAssistant = (function () {
    // API key KHÔNG nằm trong code (tránh lộ khi đưa lên GitHub). Lần đầu dùng, trình duyệt sẽ hỏi
    // key và lưu trong localStorage của máy này. Muốn đổi key: gọi AIAssistant.resetKey() ở Console.
    const KEY_STORAGE = 'groq_api_key';
    function getApiKey() {
        let k = '';
        try { k = localStorage.getItem(KEY_STORAGE) || ''; } catch (e) {}
        if (!k) {
            k = (window.prompt('Nhập Groq API key để bật trợ lý AI (chỉ lưu trên trình duyệt này):') || '').trim();
            if (k) { try { localStorage.setItem(KEY_STORAGE, k); } catch (e) {} }
        }
        return k;
    }
    function resetKey() { try { localStorage.removeItem(KEY_STORAGE); } catch (e) {} }
    const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
    // Danh sách "đoán" ban đầu - CHỈ dùng khi không hỏi được danh sách model thật từ Groq (vd lỗi mạng).
    // Thứ tự ưu tiên khi lọc model thật trả về từ GROQ_MODELS_URL (ưu tiên model nhanh/rẻ, bỏ qua
    // các model audio/whisper/guard/vision không trả lời chat text được).
    const PREFERRED_MODEL_HINTS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama', 'gpt-oss', 'qwen', 'gemma'];
    const SKIP_MODEL_HINTS = ['whisper', 'guard', 'tts', 'vision', 'scout', 'embed'];

    let _modelListPromise = null; // cache: Promise<string[]> danh sách model THẬT mà key này gọi được

    // Hỏi Groq xem API key này thật sự dùng được những model nào (thay vì đoán tên cứng, vì Groq
    // hay đổi/gỡ model, và mỗi loại key/gói có thể chỉ được cấp quyền 1 số model nhất định).
    function fetchAvailableModels() {
        if (_modelListPromise) return _modelListPromise;
        _modelListPromise = fetch(GROQ_MODELS_URL, {
            headers: { 'Authorization': 'Bearer ' + getApiKey() }
        }).then(res => {
            if (!res.ok) return res.text().then(t => {
                const err = new Error('Không lấy được danh sách model Groq (HTTP ' + res.status + '): ' + t);
                err.status = res.status;
                throw err;
            });
            return res.json();
        }).then(data => {
            const ids = (data.data || []).map(m => m.id).filter(id =>
                !SKIP_MODEL_HINTS.some(bad => id.toLowerCase().indexOf(bad) !== -1)
            );
            // Sắp theo độ ưu tiên trong PREFERRED_MODEL_HINTS (model nào khớp hint đứng trước hint có index nhỏ hơn thì lên đầu).
            ids.sort((a, b) => {
                const ia = PREFERRED_MODEL_HINTS.findIndex(h => a.toLowerCase().indexOf(h) !== -1);
                const ib = PREFERRED_MODEL_HINTS.findIndex(h => b.toLowerCase().indexOf(h) !== -1);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
            console.log('[AIAssistant] Model Groq khả dụng với key này:', ids);
            if (ids.length === 0) throw new Error('Tài khoản Groq này không có model chat nào khả dụng.');
            return ids;
        }).catch(err => { _modelListPromise = null; throw err; }); // lỗi thì KHÔNG cache, lần sau thử lại
        return _modelListPromise;
    }

    let _products = null; // cache danh sách sản phẩm (tải 1 lần, dùng lại cho mọi câu hỏi)

    function getProducts() {
        if (_products) return Promise.resolve(_products);
        return ShopCore.loadProducts().then(list => { _products = list; return list; });
    }

    // Rút gọn danh mục sản phẩm thành dạng text ngắn gọn để nhét vào system prompt
    // (id|tên|giá|danh mục|thương hiệu) - đủ để AI gợi ý đúng theo ngân sách/nhu cầu khách.
    function buildCatalogText(products) {
        return products.map(p =>
            `${p.id}|${p.name}|${Math.round(p.price)}đ|${p.category || ''}|${p.brand || ''}`
        ).join('\n');
    }

    function buildSystemPrompt(catalogText) {
        return `Bạn là trợ lý bán hàng AI thân thiện của MODEL SHOP - cửa hàng chuyên mô hình (anime, Gundam, xe, dụng cụ chế tác...).
Trả lời ngắn gọn, nhiệt tình, bằng tiếng Việt.

Danh sách TOÀN BỘ sản phẩm đang bán (mỗi dòng: id|tên|giá|danh mục|thương hiệu):
${catalogText}

QUY TẮC BẮT BUỘC:
- Khi khách hỏi gợi ý sản phẩm, hỏi theo tầm giá/ngân sách, hỏi có sản phẩm nào đó không, hoặc hỏi so sánh: hãy chọn TỐI ĐA 3 sản phẩm phù hợp nhất từ danh sách trên, điền ĐÚNG id (cột đầu tiên) vào mảng "product_ids".
- TUYỆT ĐỐI không bịa id không có trong danh sách, không tự bịa giá - luôn dùng đúng giá đã cho.
- Nếu khách đưa ra ngân sách cụ thể (vd "có 5 triệu", "tầm 10tr đổ lại"), chỉ gợi ý sản phẩm có giá PHÙ HỢP với ngân sách đó.
- Nếu không có sản phẩm nào phù hợp hoặc câu hỏi không liên quan đến sản phẩm, để "product_ids" là mảng rỗng [].
- Nếu khách hỏi ngoài chủ đề cửa hàng, trả lời ngắn gọn, thân thiện rồi khéo léo hướng về sản phẩm của shop.
- CHỈ trả lời bằng ĐÚNG 1 object JSON duy nhất, không thêm bất kỳ chữ nào trước/sau, đúng định dạng:
{"reply": "<câu trả lời của bạn>", "product_ids": ["id1", "id2"]}`;
    }

    // Gọi Groq với 1 model cụ thể, có timeout 20s (tránh treo UI mãi mãi nếu mạng/CORS có vấn đề).
    function callGroqOnce(messages, model) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        return fetch(GROQ_CHAT_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getApiKey()
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.5,
                max_tokens: 500,
                response_format: { type: 'json_object' }
            })
        }).then(res => {
            clearTimeout(timeoutId);
            if (!res.ok) return res.text().then(t => {
                const err = new Error('Groq API lỗi ' + res.status + ': ' + t);
                err.status = res.status;
                err.isModelNotFound = t.indexOf('model_not_found') !== -1 || t.indexOf('model_decommissioned') !== -1;
                throw err;
            });
            return res.json();
        }).catch(err => {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error('[AIAssistant] Model "' + model + '" không phản hồi sau 20s (mạng chặn, CORS, hoặc server quá tải).');
                throw new Error('Quá thời gian chờ phản hồi từ AI (20s)');
            }
            throw err;
        });
    }

    // Thử LẦN LƯỢT từng model trong danh sách "models" (lấy từ fetchAvailableModels, đã sắp theo ưu
    // tiên) - hễ model nào báo lỗi "model_not_found/decommissioned" thì tự động thử model tiếp theo;
    // các lỗi khác (sai key, hết quota...) thì dừng ngay vì thử model khác cũng không giải quyết được.
    function callGroqWithFallback(messages, models, i) {
        i = i || 0;
        if (i >= models.length) return Promise.reject(new Error('Không có model Groq nào khả dụng.'));
        const model = models[i];
        return callGroqOnce(messages, model).catch(err => {
            console.error('[AIAssistant] Lỗi gọi Groq API (model "' + model + '"):', err);
            if (err.isModelNotFound && i + 1 < models.length) {
                console.warn('[AIAssistant] Model "' + model + '" không còn khả dụng, thử model "' + models[i + 1] + '"...');
                return callGroqWithFallback(messages, models, i + 1);
            }
            throw err;
        });
    }

    /**
     * Gửi câu hỏi của khách tới Groq, trả về Promise<{ reply: string, products: Product[] }>.
     * `history` (tuỳ chọn): mảng các lượt chat trước đó [{role:'user'|'assistant', content}] để AI
     * nhớ ngữ cảnh ngắn hạn trong cùng phiên chat.
     */
    function ask(userText, history) {
        return getProducts().then(products => {
            const systemPrompt = buildSystemPrompt(buildCatalogText(products));
            const messages = [{ role: 'system', content: systemPrompt }]
                .concat((history || []).slice(-8))
                .concat([{ role: 'user', content: userText }]);

            return fetchAvailableModels()
                .catch(err => {
                    console.error('[AIAssistant] Không lấy được danh sách model thật từ Groq, dùng danh sách đoán tạm:', err);
                    return PREFERRED_MODEL_HINTS.filter(h => h.indexOf('-') !== -1 || h === 'llama'); // fallback thô sơ
                })
                .then(models => callGroqWithFallback(messages, models))
                .then(data => {
                    const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
                    let parsed;
                    try {
                        parsed = JSON.parse(raw);
                    } catch (e) {
                        // Phòng khi model lỡ trả thêm chữ thừa quanh JSON - cố gắng bắt phần {...} đầu tiên.
                        const m = raw.match(/\{[\s\S]*\}/);
                        parsed = m ? JSON.parse(m[0]) : { reply: raw || 'Xin lỗi, mình chưa hiểu ý bạn lắm ', product_ids: [] };
                    }
                    const validIds = new Set(products.map(p => String(p.id)));
                    const ids = Array.isArray(parsed.product_ids) ? parsed.product_ids.filter(id => validIds.has(String(id))).slice(0, 3) : [];
                    const suggested = ids.map(id => products.find(p => String(p.id) === String(id))).filter(Boolean);
                    return { reply: parsed.reply || '...', products: suggested };
                });
        });
    }

    return { ask, resetKey };
})();