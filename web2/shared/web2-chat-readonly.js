// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — modal xem hội thoại FB read-only + panel tìm KH (reuse Web2Chat).
// =====================================================================
// Web2ChatReadonly — popup CHỈ XEM hội thoại Facebook của KH, 2 pane:
//   • Trái: ô tìm KH (tên / SĐT / nội dung) → list hội thoại (mọi page).
//   • Phải: thread tin nhắn read-only của hội thoại đang chọn.
// Dùng chung Web2Chat client. KHÔNG có ô gửi tin (gửi ở Đơn web / Inbox).
//   Web2ChatReadonly.open({ pageId, psid, name })  — mở sẵn 1 thread.
//   Web2ChatReadonly.openSearch({ query })          — mở chế độ tìm (linh hoạt).
// =====================================================================
(function (global) {
    const Web2ChatReadonly = {};
    let _el = null;
    let _searchTimer = null;
    let _searchSeq = 0;
    // Chế độ "pick": callback nhận {phone, name} khi user bấm "Gán KH này" trên
    // 1 hội thoại (dùng cho pending-match — chọn KH từ list FB khớp đuôi SĐT).
    let _onPick = null;
    let _lastQueryDigits = '';
    // State thread đang xem — để scroll-lên tải thêm tin cũ (pagination).
    let _thread = null;

    // Mốc thời gian 1 tin nhắn (sort cũ→mới).
    function _msgTs(m) {
        const t = m && (m.inserted_at || m.created_time || m.timestamp);
        const n = t ? Date.parse(t) : 0;
        return isNaN(n) ? 0 : n;
    }
    // Render dãy bubble (grouping avatar theo nhóm tin KH). startPrevOut: trạng
    // thái "tin trước là outgoing" để nhóm avatar đúng ở ranh giới prepend.
    function _renderBubbles(msgs, pageId, custAv, startPrevOut) {
        let prevOut = startPrevOut !== false;
        return msgs
            .map((m) => {
                const isOut = (m.from && m.from.id === pageId) || m.from_admin || m.is_admin;
                const showAv = !isOut && prevOut;
                prevOut = isOut;
                return renderBubble(m, pageId, showAv ? custAv : '');
            })
            .filter(Boolean)
            .join('');
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Worker proxy avatar FB (token xử lý server-side — an toàn, KHÔNG lộ token
    // ra client). Giống native-orders /api/fb-avatar?id=<psid>&page=<pageId>.
    function workerUrl() {
        return (
            (global.Web2Chat &&
                global.Web2Chat._internal &&
                global.Web2Chat._internal.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function avatarUrl(psid, pageId) {
        if (!psid) return '';
        return `${workerUrl()}/api/fb-avatar?id=${encodeURIComponent(psid)}${pageId ? '&page=' + encodeURIComponent(pageId) : ''}`;
    }
    // div tròn chữ-cái + <img> avatar phủ lên; lỗi tải → img tự remove → còn chữ.
    function avatarHtml(name, psid, pageId, cls) {
        const initial = esc(
            (
                String(name || '?')
                    .trim()
                    .charAt(0) || '?'
            ).toUpperCase()
        );
        const url = avatarUrl(psid, pageId);
        const img = url
            ? `<img class="w2cro-av-img" src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()" />`
            : '';
        return `<div class="${cls}"><span class="w2cro-av-ini">${initial}</span>${img}</div>`;
    }

    // Pancake message text đến dạng HTML một phần (<div>...</div>, <br>). Strip
    // tag → plain text, giữ xuống dòng. Trả PLAIN; caller esc() trước khi nhúng.
    function msgPlain(raw) {
        if (!raw) return '';
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/[\u2028\u2029]/g, '\n')
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function injectCss() {
        if (document.getElementById('w2cro-css')) return;
        const s = document.createElement('style');
        s.id = 'w2cro-css';
        s.textContent = `
        .w2cro-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(15,23,42,.5);
            display: flex; align-items: center; justify-content: center; padding: 16px; }
        .w2cro-overlay[hidden] { display: none; }
        .w2cro-modal { background: #fff; border-radius: 12px; width: min(940px, 96vw);
            height: min(760px, 90vh); display: flex; flex-direction: column; overflow: hidden;
            box-shadow: 0 24px 80px rgba(15,23,42,.32); }
        .w2cro-head { display: flex; align-items: center; justify-content: space-between;
            padding: 11px 16px; background: #fff; border-bottom: 1px solid #e5e7eb; flex: 0 0 auto; }
        .w2cro-title { font-weight: 700; font-size: 15px; color: #0f172a; }
        .w2cro-close { border: none; background: transparent; font-size: 24px; line-height: 1;
            color: #6b7280; cursor: pointer; padding: 0 4px; }
        .w2cro-close:hover { color: #b91c1c; }
        .w2cro-grid { flex: 1; display: grid; grid-template-columns: 300px 1fr; min-height: 0; }
        .w2cro-side { border-right: 1px solid #e5e7eb; display: flex; flex-direction: column;
            min-height: 0; background: #f8fafc; }
        .w2cro-search { padding: 10px; flex: 0 0 auto; border-bottom: 1px solid #e5e7eb; }
        .w2cro-search input { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db;
            border-radius: 8px; padding: 8px 11px; font-size: 13px; outline: none; }
        .w2cro-search input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .w2cro-list { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
        .w2cro-conv { display: flex; gap: 9px; padding: 9px 11px; cursor: pointer;
            border-bottom: 1px solid #eef2f7; align-items: flex-start; }
        .w2cro-conv:hover { background: #eef2ff; }
        .w2cro-conv.is-active { background: #dbeafe; }
        .w2cro-pick-btn { flex: 0 0 auto; align-self: center; border: none; background: #16a34a;
            color: #fff; font-size: 11px; font-weight: 700; padding: 5px 9px; border-radius: 6px;
            cursor: pointer; white-space: nowrap; }
        .w2cro-pick-btn:hover { background: #15803d; }
        .w2cro-conv-av { width: 34px; height: 34px; flex: 0 0 auto; }
        /* avatar: nền chữ-cái + img phủ lên (img lỗi → tự remove → còn chữ) */
        .w2cro-conv-av, .w2cro-bub-av { position: relative; border-radius: 50%; overflow: hidden;
            background: #c7d2fe; cursor: zoom-in; transition: transform .12s ease; }
        .w2cro-conv-av:hover, .w2cro-bub-av:hover { transform: scale(1.12); z-index: 2; }
        .w2cro-av-zoom { position: fixed; z-index: 10060; width: 220px; height: 220px;
            border-radius: 12px; overflow: hidden; border: 3px solid #fff; background: #f0f2f5;
            box-shadow: 0 16px 50px rgba(0,0,0,.45); pointer-events: none; }
        .w2cro-av-zoom[hidden] { display: none; }
        .w2cro-av-zoom img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .w2cro-av-ini { position: absolute; inset: 0; display: flex; align-items: center;
            justify-content: center; color: #3730a3; font-weight: 700; font-size: 13px; }
        .w2cro-av-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .w2cro-conv-main { min-width: 0; flex: 1; }
        .w2cro-conv-name { font-weight: 600; font-size: 13px; color: #0f172a;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .w2cro-conv-sub { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; }
        .w2cro-side-hint, .w2cro-side-empty { padding: 18px 12px; text-align: center;
            color: #94a3b8; font-size: 12px; }
        .w2cro-main { display: flex; flex-direction: column; min-height: 0; background: #f0f2f5; }
        .w2cro-body { flex: 1; overflow-y: auto; padding: 14px 14px 4px; display: flex;
            flex-direction: column; gap: 2px; overscroll-behavior: contain; }
        .w2cro-foot { padding: 7px 16px; background: #fff; border-top: 1px solid #e5e7eb;
            text-align: center; flex: 0 0 auto; }
        .w2cro-readonly-tag { font-size: 11px; color: #6b7280; }
        .w2cro-loading, .w2cro-empty { text-align: center; color: #6b7280; font-size: 13px;
            padding: 32px 12px; }
        .w2cro-row { display: flex; flex-direction: column; margin: 2px 0; max-width: 78%; }
        .w2cro-row.is-in { align-items: flex-start; align-self: flex-start; }
        .w2cro-row.is-out { align-items: flex-end; align-self: flex-end; }
        .w2cro-bubble { padding: 7px 11px; border-radius: 14px; font-size: 13px; line-height: 1.4;
            word-break: break-word; }
        .w2cro-row.is-in .w2cro-bubble { background: #fff; color: #0f172a; border-bottom-left-radius: 4px;
            box-shadow: 0 1px 1px rgba(0,0,0,.06); }
        .w2cro-row.is-out .w2cro-bubble { background: #dcf8c6; color: #0f172a; border-bottom-right-radius: 4px; }
        .w2cro-in-line { display: flex; align-items: flex-end; gap: 6px; }
        .w2cro-bub-av { width: 26px; height: 26px; flex: 0 0 auto; }
        .w2cro-bub-av .w2cro-av-ini { font-size: 11px; }
        .w2cro-bub-spacer { background: transparent; }
        .w2cro-row.is-in .w2cro-time { margin-left: 32px; }
        .w2cro-txt { white-space: pre-wrap; }
        .w2cro-img { max-width: 220px; max-height: 280px; border-radius: 10px; display: block; margin-top: 3px; }
        .w2cro-file { display: inline-block; margin-top: 4px; font-size: 12px; color: #1d4ed8; }
        .w2cro-time { font-size: 10px; color: #9ca3af; margin: 1px 4px 4px; }
        @media (max-width: 680px) {
            .w2cro-grid { grid-template-columns: 1fr; }
            .w2cro-side { display: none; }
            .w2cro-modal.is-search .w2cro-side { display: flex; }
            .w2cro-modal.is-search .w2cro-main { display: none; }
        }
        `;
        document.head.appendChild(s);
    }

    function ensureEl() {
        if (_el) return _el;
        injectCss();
        const ov = document.createElement('div');
        ov.className = 'w2cro-overlay';
        ov.hidden = true;
        ov.innerHTML = `
            <div class="w2cro-modal" role="dialog" aria-modal="true">
                <header class="w2cro-head">
                    <span class="w2cro-title" id="w2croTitle">Hội thoại khách hàng</span>
                    <button type="button" class="w2cro-close" data-close aria-label="Đóng">&times;</button>
                </header>
                <div class="w2cro-grid">
                    <aside class="w2cro-side">
                        <div class="w2cro-search">
                            <input id="w2croSearch" type="search" placeholder="Tìm KH: tên / SĐT / nội dung…" autocomplete="off" />
                        </div>
                        <div class="w2cro-list" id="w2croList">
                            <div class="w2cro-side-hint">Gõ ≥ 2 ký tự để tìm hội thoại.</div>
                        </div>
                    </aside>
                    <section class="w2cro-main">
                        <div class="w2cro-body" id="w2croBody"><div class="w2cro-empty">Chọn 1 hội thoại bên trái để xem.</div></div>
                        <div class="w2cro-foot"><span class="w2cro-readonly-tag">🔒 Chỉ xem — gửi tin ở trang Đơn web / Inbox</span></div>
                    </section>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.closest('[data-close]')) return close();
            // Nút "Gán KH này" (pick mode) — chọn KH từ hội thoại để gán pending.
            const pick = e.target.closest('[data-w2cro-pick]');
            if (pick && _onPick) {
                const cb = _onPick;
                close();
                cb({
                    phone: pick.getAttribute('data-phone'),
                    name: pick.getAttribute('data-name'),
                });
                return;
            }
            const conv = e.target.closest('.w2cro-conv');
            if (conv) {
                ov.querySelectorAll('.w2cro-conv').forEach((c) => c.classList.remove('is-active'));
                conv.classList.add('is-active');
                loadThread({
                    pageId: conv.getAttribute('data-page'),
                    convId: conv.getAttribute('data-conv'),
                    customerUuid: conv.getAttribute('data-cust') || null,
                    name: conv.getAttribute('data-name') || '',
                    psid: conv.getAttribute('data-psid') || '',
                });
            }
        });
        // Hover avatar → phóng to ảnh (popup). Bỏ qua nếu avatar chỉ có chữ.
        ov.addEventListener('mouseover', (e) => {
            const av = e.target.closest('.w2cro-conv-av, .w2cro-bub-av');
            if (av) showZoom(av);
        });
        ov.addEventListener('mouseout', (e) => {
            const av = e.target.closest('.w2cro-conv-av, .w2cro-bub-av');
            if (av && !av.contains(e.relatedTarget)) hideZoom();
        });
        const inp = ov.querySelector('#w2croSearch');
        inp.addEventListener('input', () => {
            clearTimeout(_searchTimer);
            const q = inp.value.trim();
            _searchTimer = setTimeout(() => doSearch(q), 350);
        });
        // Scroll gần đỉnh thread → tải thêm tin cũ (infinite scroll lên).
        const bodyEl = ov.querySelector('#w2croBody');
        bodyEl.addEventListener(
            'scroll',
            () => {
                if (bodyEl.scrollTop < 60) _loadOlder();
            },
            { passive: true }
        );
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _el && !_el.hidden) close();
        });
        _el = ov;
        return ov;
    }

    function close() {
        if (_el) _el.hidden = true;
        hideZoom();
    }

    // ---- Hover zoom avatar ----
    let _zoom = null;
    function ensureZoom() {
        if (_zoom) return _zoom;
        _zoom = document.createElement('div');
        _zoom.className = 'w2cro-av-zoom';
        _zoom.hidden = true;
        _zoom.innerHTML = '<img alt="" />';
        document.body.appendChild(_zoom);
        return _zoom;
    }
    function showZoom(avEl) {
        const img = avEl.querySelector('.w2cro-av-img');
        const src = img && img.getAttribute('src');
        if (!src) return; // avatar chỉ có chữ → không zoom
        const z = ensureZoom();
        z.querySelector('img').src = src;
        const r = avEl.getBoundingClientRect();
        const SIZE = 220;
        const GAP = 12;
        // Mặc định bên phải avatar; nếu tràn phải → bên trái.
        let left = r.right + GAP;
        if (left + SIZE > window.innerWidth - 8) left = r.left - GAP - SIZE;
        if (left < 8) left = 8;
        let top = r.top + r.height / 2 - SIZE / 2;
        top = Math.max(8, Math.min(top, window.innerHeight - SIZE - 8));
        z.style.left = left + 'px';
        z.style.top = top + 'px';
        z.hidden = false;
    }
    function hideZoom() {
        if (_zoom) _zoom.hidden = true;
    }

    function setBody(html) {
        const b = _el && _el.querySelector('#w2croBody');
        if (b) b.innerHTML = html;
    }
    function setList(html) {
        const l = _el && _el.querySelector('#w2croList');
        if (l) l.innerHTML = html;
    }

    function pagesAvailable() {
        const Web2Chat = global.Web2Chat;
        const map =
            (Web2Chat && Web2Chat.getAllPageAccessTokens && Web2Chat.getAllPageAccessTokens()) ||
            {};
        return Object.keys(map);
    }

    async function ensureTokens() {
        const Web2Chat = global.Web2Chat;
        try {
            if (Web2Chat && Web2Chat.syncFromRenderDB)
                await Web2Chat.syncFromRenderDB().catch(() => {});
        } catch (_) {}
    }

    // ---- Tìm hội thoại (mọi page) theo query ----
    async function doSearch(query) {
        const seq = ++_searchSeq;
        _lastQueryDigits = String(query || '').replace(/\D/g, '');
        if (!query || query.length < 2) {
            setList('<div class="w2cro-side-hint">Gõ ≥ 2 ký tự để tìm hội thoại.</div>');
            return;
        }
        const Web2Chat = global.Web2Chat;
        if (!Web2Chat || !Web2Chat.searchConversations) {
            setList('<div class="w2cro-side-empty">⚠ Web2Chat chưa load.</div>');
            return;
        }
        setList('<div class="w2cro-side-hint">Đang tìm…</div>');
        await ensureTokens();
        const pages = pagesAvailable();
        if (!pages.length) {
            setList(
                '<div class="w2cro-side-empty">⚠ Chưa đăng nhập Pancake (không có page token).</div>'
            );
            return;
        }
        const seen = new Set();
        const all = [];
        await Promise.all(
            pages.map(async (pg) => {
                try {
                    const r = await Web2Chat.searchConversations(pg, query);
                    if (r && r.ok && Array.isArray(r.conversations)) {
                        for (const c of r.conversations) {
                            const key = c.id || (c.from && c.from.id);
                            if (!key || seen.has(key)) continue;
                            seen.add(key);
                            all.push({ pageId: pg, conv: c });
                        }
                    }
                } catch (_) {}
            })
        );
        if (seq !== _searchSeq) return; // query đổi → bỏ kết quả cũ
        if (!all.length) {
            setList(
                `<div class="w2cro-side-empty">Không tìm thấy hội thoại khớp "${esc(query)}".</div>`
            );
            return;
        }
        // Đẩy hội thoại HOẠT ĐỘNG MỚI NHẤT lên đầu (updated_at desc).
        all.sort((a, b) => _convTs(b.conv) - _convTs(a.conv));
        setList(all.map(convRowHtml).join(''));
    }

    // Mốc thời gian hoạt động gần nhất của 1 hội thoại (để sort mới→cũ).
    function _convTs(c) {
        if (!c) return 0;
        const t =
            c.updated_at ||
            c.last_customer_interactive_at ||
            (c.last_message && (c.last_message.inserted_at || c.last_message.created_time)) ||
            c.inserted_at;
        const n = t ? Date.parse(t) : 0;
        return isNaN(n) ? 0 : n;
    }

    function convRowHtml({ pageId, conv }) {
        const cust = (conv.customers && conv.customers[0]) || {};
        const name = cust.name || cust.display_name || conv.name || '(không tên)';
        // SĐT từ recent_phone_numbers (KH tự gõ trong chat) — ưu tiên số khớp query.
        const phones = (conv.recent_phone_numbers || [])
            .map((x) => x && x.phone_number)
            .filter(Boolean);
        const phone =
            phones.find(
                (p) => _lastQueryDigits && String(p).replace(/\D/g, '').includes(_lastQueryDigits)
            ) ||
            phones[0] ||
            cust.phone ||
            cust.phone_number ||
            '';
        const snippet = msgPlain(
            conv.snippet ||
                (conv.last_message && (conv.last_message.message || conv.last_message.text)) ||
                ''
        ).slice(0, 48);
        const sub = phone ? `${esc(phone)}${snippet ? ' · ' + esc(snippet) : ''}` : esc(snippet);
        const psid = cust.fb_id || (conv.from && conv.from.id) || conv.from_psid || '';
        const pickBtn =
            _onPick && phone
                ? `<button type="button" class="w2cro-pick-btn" data-w2cro-pick="1" data-phone="${esc(phone)}" data-name="${esc(name)}">Gán KH này</button>`
                : '';
        return `<div class="w2cro-conv" data-page="${esc(pageId)}" data-conv="${esc(conv.id || '')}" data-cust="${esc(cust.id || '')}" data-name="${esc(name)}" data-psid="${esc(psid)}" data-phone="${esc(phone)}">
            ${avatarHtml(name, psid, pageId, 'w2cro-conv-av')}
            <div class="w2cro-conv-main">
                <div class="w2cro-conv-name">${esc(name)}</div>
                <div class="w2cro-conv-sub">${sub || '&nbsp;'}</div>
            </div>
            ${pickBtn}
        </div>`;
    }

    function renderBubble(m, pageId, inAvatar) {
        const isOut = (m.from && m.from.id === pageId) || m.from_admin || m.is_admin;
        const txt = msgPlain(m.message || m.text || m.content || '');
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const media = atts
            .map((a) => {
                const type = (a.type || '').toLowerCase();
                if (['replied_message', 'reaction'].includes(type)) return '';
                const url =
                    a.url ||
                    a.file_url ||
                    a.preview_url ||
                    (a.payload && a.payload.url) ||
                    a.src ||
                    '';
                const isImg =
                    type === 'photo' ||
                    type === 'image' ||
                    type === 'sticker' ||
                    type === 'animated_image_url' ||
                    !!a.sticker_id ||
                    (a.mime_type || '').startsWith('image/');
                if (url && isImg)
                    return `<img class="w2cro-img" src="${esc(url)}" loading="lazy" />`;
                if (url && (type === 'video' || (a.mime_type || '').startsWith('video/')))
                    return `<video class="w2cro-img" src="${esc(url)}" controls></video>`;
                if (type === 'like' || type === 'thumbsup')
                    return `<div style="font-size:30px;">👍</div>`;
                if (url)
                    return `<a class="w2cro-file" href="${esc(url)}" target="_blank" rel="noopener">📎 Tệp đính kèm</a>`;
                return '';
            })
            .filter(Boolean)
            .join('');
        if (m.is_removed) {
            return `<div class="w2cro-row ${isOut ? 'is-out' : 'is-in'}"><div class="w2cro-bubble" style="font-style:italic;opacity:.7;">🗑 Tin đã thu hồi</div></div>`;
        }
        const body = txt ? `<div class="w2cro-txt">${esc(txt)}</div>` : '';
        if (!body && !media) return '';
        const time = m.inserted_at || m.created_time || m.timestamp;
        let t = '';
        if (time) {
            const d = new Date(time);
            if (!isNaN(d))
                t = d.toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                });
        }
        if (isOut) {
            return `<div class="w2cro-row is-out"><div class="w2cro-bubble">${body}${media}</div><div class="w2cro-time">${esc(t)}</div></div>`;
        }
        // Incoming (KH): avatar trái + bubble. inAvatar='' (không phải đầu nhóm)
        // → spacer giữ canh lề. is_removed cũng đi nhánh này.
        const av = inAvatar || '<div class="w2cro-bub-av w2cro-bub-spacer"></div>';
        return `<div class="w2cro-row is-in"><div class="w2cro-in-line">${av}<div class="w2cro-bubble">${body}${media}</div></div><div class="w2cro-time">${esc(t)}</div></div>`;
    }

    // ---- Tải + render thread 1 hội thoại ----
    async function loadThread({ pageId, convId, customerUuid, name, psid }) {
        if (_el) _el.querySelector('.w2cro-modal')?.classList.remove('is-search');
        const title = _el && _el.querySelector('#w2croTitle');
        if (title) title.textContent = name ? `Hội thoại — ${name}` : 'Hội thoại khách hàng';
        setBody('<div class="w2cro-loading">Đang tải hội thoại…</div>');
        const Web2Chat = global.Web2Chat;
        if (!Web2Chat || !Web2Chat.fetchMessages || !pageId || !convId) {
            setBody('<div class="w2cro-empty">Thiếu thông tin hội thoại.</div>');
            return;
        }
        let msgs = [];
        try {
            const mr = await Web2Chat.fetchMessages(pageId, convId, customerUuid);
            if (mr && mr.ok) msgs = mr.messages || [];
        } catch (_) {}
        if (!msgs.length) {
            _thread = null;
            setBody('<div class="w2cro-empty">Hội thoại trống.</div>');
            return;
        }
        // Avatar KH (incoming) — render 1 lần ở đầu mỗi nhóm tin đến cho gọn.
        const custAv = avatarHtml(name, psid, pageId, 'w2cro-bub-av');
        // Sort cũ→mới theo timestamp → tin mới nhất ở ĐÁY (chat chuẩn).
        const ordered = msgs.slice().sort((a, b) => _msgTs(a) - _msgTs(b));
        // Lưu state để scroll-lên tải tin cũ. cursor = số tin đã tải (currentCount).
        _thread = {
            pageId,
            convId,
            customerUuid: customerUuid || null,
            custAv,
            msgIds: new Set(ordered.map((m) => m.id).filter(Boolean)),
            cursor: msgs.length,
            loadingOlder: false,
            hasMore: true, // chưa biết → cho thử, loadOlder trả 0 fresh sẽ tắt
        };
        const olderInd =
            '<div class="w2cro-load-older" data-w2cro-older>↑ Cuộn lên để xem tin cũ hơn</div>';
        const html = _renderBubbles(ordered, pageId, custAv, true);
        setBody(olderInd + (html || '<div class="w2cro-empty">Hội thoại trống.</div>'));
        const b = _el.querySelector('#w2croBody');
        if (b) b.scrollTop = b.scrollHeight;
    }

    // Scroll lên đầu thread → tải thêm tin cũ (prepend, giữ nguyên vị trí xem).
    async function _loadOlder() {
        if (!_thread || _thread.loadingOlder || !_thread.hasMore) return;
        const Web2Chat = global.Web2Chat;
        const body = _el && _el.querySelector('#w2croBody');
        if (!Web2Chat || !Web2Chat.fetchMessages || !body) return;
        _thread.loadingOlder = true;
        const ind = body.querySelector('[data-w2cro-older]');
        if (ind) ind.textContent = '⏳ Đang tải tin cũ…';
        const oldH = body.scrollHeight;
        try {
            const r = await Web2Chat.fetchMessages(
                _thread.pageId,
                _thread.convId,
                _thread.customerUuid,
                { currentCount: _thread.cursor }
            );
            const incoming = (r && r.ok && r.messages) || [];
            const fresh = incoming.filter((m) => m.id && !_thread.msgIds.has(m.id));
            if (!fresh.length) {
                _thread.hasMore = false;
                if (ind) ind.remove();
                return;
            }
            for (const m of fresh) _thread.msgIds.add(m.id);
            _thread.cursor += fresh.length;
            const sorted = fresh.slice().sort((a, b) => _msgTs(a) - _msgTs(b));
            const html = _renderBubbles(sorted, _thread.pageId, _thread.custAv, true);
            if (ind) ind.insertAdjacentHTML('afterend', html);
            else body.insertAdjacentHTML('afterbegin', html);
            // Giữ nguyên vị trí xem (không nhảy) sau khi prepend.
            body.scrollTop += body.scrollHeight - oldH;
            if (ind) ind.textContent = '↑ Cuộn lên để xem tin cũ hơn';
        } catch (e) {
            if (ind) ind.textContent = '↑ Cuộn lên để xem tin cũ hơn';
        } finally {
            _thread.loadingOlder = false;
        }
    }

    // ---- Mở modal: preload 1 thread theo (pageId, psid) ----
    async function open(opts) {
        opts = opts || {};
        _onPick = null;
        _thread = null;
        const ov = ensureEl();
        ov.hidden = false;
        ov.querySelector('.w2cro-modal')?.classList.remove('is-search');
        const Web2Chat = global.Web2Chat;
        if (!Web2Chat || !Web2Chat.fetchConversations) {
            setBody('<div class="w2cro-empty">⚠ Web2Chat chưa load trên trang này.</div>');
            return;
        }
        const title = ov.querySelector('#w2croTitle');
        if (title)
            title.textContent = opts.name ? `Hội thoại — ${opts.name}` : 'Hội thoại khách hàng';
        if (!opts.psid) {
            setBody(
                '<div class="w2cro-empty">KH chưa có ID Facebook. Dùng ô tìm bên trái để chọn hội thoại.</div>'
            );
            return;
        }
        setBody('<div class="w2cro-loading">Đang tải hội thoại…</div>');
        await ensureTokens();
        const pages = opts.pageId ? [opts.pageId] : pagesAvailable();
        if (!pages.length) {
            setBody(
                '<div class="w2cro-empty">⚠ Chưa đăng nhập Pancake. Vào trang Inbox/Đơn web để đăng nhập trước.</div>'
            );
            return;
        }
        let conv = null,
            usedPage = null,
            custUuid = null;
        for (const pg of pages) {
            try {
                const r = await Web2Chat.fetchConversations(pg, opts.psid);
                if (r && r.ok && r.conversations && r.conversations.length) {
                    conv =
                        r.conversations.find((c) => (c.type || '').toUpperCase() === 'INBOX') ||
                        r.conversations[0];
                    usedPage = pg;
                    custUuid = r.customerUuid;
                    break;
                }
            } catch (_) {}
        }
        if (!conv) {
            setBody(
                '<div class="w2cro-empty">Không tìm thấy hội thoại FB cho KH này. Dùng ô tìm bên trái.</div>'
            );
            return;
        }
        await loadThread({
            pageId: usedPage,
            convId: conv.id,
            customerUuid: custUuid,
            name: opts.name,
            psid: opts.psid,
        });
    }

    // ---- Mở modal ở chế độ TÌM (linh hoạt, không preselect) ----
    function openSearch(opts) {
        opts = opts || {};
        _onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
        _thread = null;
        const ov = ensureEl();
        ov.hidden = false;
        ov.querySelector('.w2cro-modal')?.classList.add('is-search');
        ov.querySelector('.w2cro-modal')?.classList.toggle('has-pick', !!_onPick);
        const title = ov.querySelector('#w2croTitle');
        if (title)
            title.textContent = _onPick ? 'Chọn KH từ hội thoại' : 'Tìm hội thoại khách hàng';
        setBody('<div class="w2cro-empty">Tìm KH bên trái rồi chọn hội thoại để xem.</div>');
        const inp = ov.querySelector('#w2croSearch');
        const q = String(opts.query || '').trim();
        inp.value = q;
        inp.focus();
        if (q.length >= 2) doSearch(q);
        else setList('<div class="w2cro-side-hint">Gõ ≥ 2 ký tự để tìm hội thoại.</div>');
    }

    Web2ChatReadonly.open = open;
    Web2ChatReadonly.openSearch = openSearch;
    Web2ChatReadonly.close = close;
    global.Web2ChatReadonly = Web2ChatReadonly;
})(window);
