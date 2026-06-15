// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).
(function () {
    'use strict';

    function $(id) {
        return document.getElementById(id);
    }
    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
        else console.log('[notify]', type, msg);
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    // ---------- Tab framework ----------
    function wireTabs() {
        const tabs = document.querySelectorAll('#mtTabs .mt-tab');
        tabs.forEach((t) => {
            t.addEventListener('click', () => {
                const key = t.dataset.tab;
                tabs.forEach((x) => x.classList.toggle('on', x === t));
                document
                    .querySelectorAll('.mt-panel')
                    .forEach((p) => p.classList.toggle('on', p.id === 'panel-' + key));
            });
        });
    }

    // ---------- Tab: Tăng số lượng comment ----------
    // Chờ Web2Chat sẵn sàng (load token async). Retry tối đa ~6s.
    async function waitWeb2Chat(tries = 20) {
        for (let i = 0; i < tries; i++) {
            if (window.Web2Chat && typeof window.Web2Chat.listPages === 'function')
                return window.Web2Chat;
            await sleep(300);
        }
        return null;
    }

    // Sinh text random NGẮN (giống kiểu gõ random). Trộn chữ + số, 5-9 ký tự.
    const _CH = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    function randText() {
        const n = 5 + Math.floor(Math.random() * 5);
        let s = '';
        for (let i = 0; i < n; i++) s += _CH.charAt(Math.floor(Math.random() * _CH.length));
        return s;
    }

    function workerBase() {
        return (
            (window.Web2Chat &&
                window.Web2Chat._internal &&
                window.Web2Chat._internal.WORKER_URL) ||
            ''
        );
    }
    function authHeaders(extra) {
        return window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders(extra) : extra || {};
    }

    let _posts = []; // bài live của page đang chọn (gồm live đã xong)
    let _convs = []; // conversations COMMENT của BÀI LIVE đang chọn
    let _running = false;
    let _stop = false;

    async function loadPages() {
        const sel = $('boostPage');
        const W = await waitWeb2Chat();
        if (!W) {
            sel.innerHTML = '<option value="">Web2Chat chưa sẵn sàng — refresh</option>';
            return;
        }
        const r = await W.listPages();
        if (!r.ok || !Array.isArray(r.pages) || !r.pages.length) {
            sel.innerHTML = `<option value="">Lỗi/không có page (${r.reason || 'cấu hình token ở Cấu hình Pancake'})</option>`;
            return;
        }
        // Bỏ Instagram (igo_) — reply_comment chỉ FB.
        const pages = r.pages.filter((p) => !String(p.id).startsWith('igo_'));
        sel.innerHTML =
            '<option value="">— Chọn page —</option>' +
            pages
                .map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`)
                .join('');
        sel.onchange = () => loadPosts();
    }

    // Bài live của page (từ /page-posts — poller Pancake 14 ngày, GỒM cả live đã
    // livestream xong). Auto-chọn MỚI NHẤT → loadConvs.
    async function loadPosts() {
        const pageId = $('boostPage').value;
        const psel = $('boostPost');
        _posts = [];
        $('boostConv').innerHTML = '<option value="">Chọn bài live trước…</option>';
        _convs = [];
        if (!pageId) {
            psel.innerHTML = '<option value="">Chọn page trước…</option>';
            return;
        }
        psel.innerHTML = '<option value="">Đang tải bài live…</option>';
        try {
            const url = `${workerBase()}/api/web2-live-comments/page-posts`;
            const data = await fetch(url, { headers: authHeaders() }).then((r) => r.json());
            const all = Array.isArray(data?.data) ? data.data : [];
            _posts = all
                .filter((p) => String(p.pageId) === String(pageId))
                .sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0));
        } catch (e) {
            psel.innerHTML = `<option value="">Lỗi tải bài: ${esc(e.message)}</option>`;
            return;
        }
        if (!_posts.length) {
            psel.innerHTML = '<option value="">Page này không có bài live (14 ngày)</option>';
            return;
        }
        psel.innerHTML = _posts
            .map((p, i) => {
                const d = p.date ? new Date(p.date) : null;
                const dt = d
                    ? d.toLocaleString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                      })
                    : '';
                const ttl = (p.title || '(livestream)').slice(0, 50);
                return `<option value="${i}">${esc(dt)} — ${esc(ttl)}</option>`;
            })
            .join('');
        psel.value = '0'; // mặc định chọn MỚI NHẤT
        psel.onchange = () => loadConvs();
        loadConvs();
    }

    // Hội thoại COMMENT của BÀI LIVE đang chọn — fetch trực tiếp Pancake
    // (type=COMMENT&post_id) qua worker. fetchConversationsByPage hardcode INBOX nên
    // KHÔNG dùng được. Auto-chọn hội thoại MỚI NHẤT (updated_at desc).
    async function loadConvs() {
        const pageId = $('boostPage').value;
        const pidx = $('boostPost').value;
        const post = pidx !== '' ? _posts[Number(pidx)] : null;
        const csel = $('boostConv');
        _convs = [];
        if (!pageId || !post) {
            csel.innerHTML = '<option value="">Chọn bài live trước…</option>';
            return;
        }
        csel.innerHTML = '<option value="">Đang tải hội thoại…</option>';
        const W = await waitWeb2Chat();
        const jwt = W && W.getJwt && W.getJwt();
        if (!jwt) {
            csel.innerHTML = '<option value="">Thiếu token Pancake (Cấu hình Pancake)</option>';
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const qs = new URLSearchParams({
            access_token: jwt,
            page_id: pageId,
            type: 'COMMENT',
            post_id: String(post.postId),
            since: String(now - 30 * 86400),
            until: String(now),
        });
        const url = `${workerBase()}/api/pancake/pages/${encodeURIComponent(pageId)}/conversations?${qs}`;
        let convs = [];
        try {
            const data = await fetch(url).then((r) => r.json());
            convs = Array.isArray(data?.conversations) ? data.conversations : [];
        } catch (e) {
            csel.innerHTML = `<option value="">Lỗi tải hội thoại: ${esc(e.message)}</option>`;
            return;
        }
        _convs = convs
            .filter((c) => String(c.type || '').toUpperCase() === 'COMMENT')
            .sort(
                (a, b) =>
                    (Date.parse(b.updated_at || 0) || 0) - (Date.parse(a.updated_at || 0) || 0)
            );
        if (!_convs.length) {
            csel.innerHTML =
                '<option value="">Bài này chưa có hội thoại comment (cần có người đã comment)</option>';
            return;
        }
        csel.innerHTML = _convs
            .map((c, i) => {
                const nm =
                    (c.customers && c.customers[0] && c.customers[0].name) || c.from?.name || 'KH';
                const snip = (c.snippet || '').slice(0, 24);
                return `<option value="${i}">${esc(nm)} — ${esc(snip)}</option>`;
            })
            .join('');
        csel.value = '0'; // mặc định chọn MỚI NHẤT
    }

    // Báo backend các conversation đang "tăng comment" → ingest BỎ QUA (không lưu DB,
    // không SSE) → KHÔNG hiện ở live-chat / comments-mobile. TTL 20 phút, re-mark định kỳ.
    async function markBoost(convId) {
        if (!convId) return;
        try {
            await fetch(`${workerBase()}/api/web2-live-comments/boost-mark`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ convId: String(convId) }),
            });
        } catch (_) {
            /* best-effort — vẫn spam được, chỉ là live-chat có thể hiện tạm */
        }
    }

    function logLine(msg) {
        const el = $('boostLog');
        el.textContent += msg + '\n';
        el.scrollTop = el.scrollHeight;
    }

    async function run() {
        if (_running) return;
        const pageId = $('boostPage').value;
        const idx = $('boostConv').value;
        const conv = idx !== '' ? _convs[Number(idx)] : null;
        if (!pageId || !conv) {
            notify('Chọn page + bài live + hội thoại comment trước', 'warning');
            return;
        }
        const total = Math.max(1, Math.min(500, parseInt($('boostCount').value, 10) || 0));
        const delay = Math.max(500, parseInt($('boostDelay').value, 10) || 1500);
        const tpl = ($('boostText').value || '').trim();
        const W = await waitWeb2Chat();
        if (!W) return;
        const custId = (conv.customers && conv.customers[0] && conv.customers[0].id) || undefined;

        _running = true;
        _stop = false;
        $('boostRun').disabled = true;
        $('boostStop').disabled = false;
        $('boostProg').style.display = 'block';
        $('boostLog').textContent = '';
        $('boostTotal').textContent = `/ ${total}`;
        let ok = 0,
            err = 0;
        const setStat = () => {
            $('boostOk').textContent = ok;
            $('boostErr').textContent = err;
            $('boostBar').style.width = (((ok + err) / total) * 100).toFixed(1) + '%';
        };
        // Ẩn các comment này khỏi live-chat NGAY trước khi spam (+ re-mark mỗi 100 tin).
        await markBoost(conv.id);
        logLine(`▶ Bắt đầu: ${total} comment, giãn ${delay}ms, hội thoại ${conv.id}`);
        logLine('· Đã báo live-chat ẩn các comment này (không hiện cho khách).');

        for (let i = 0; i < total; i++) {
            if (_stop) {
                logLine('⏹ Đã dừng.');
                break;
            }
            if (i > 0 && i % 100 === 0) await markBoost(conv.id);
            const text = tpl || randText();
            try {
                const res = await W.sendMessage(pageId, conv.id, {
                    text,
                    action: 'reply_comment',
                    customerId: custId,
                });
                if (res && res.ok) {
                    ok++;
                    logLine(`✓ #${i + 1} "${text}"`);
                } else {
                    err++;
                    const reason = (res && res.reason) || 'unknown';
                    logLine(`✗ #${i + 1} ${reason}`);
                    // Rate-limit / policy FB → DỪNG ngay (tránh bị khoá page).
                    if (
                        res &&
                        (res.e_subcode === 3252001 ||
                            res.e_code === 368 ||
                            /rate|limit|spam|chặn|policy/i.test(reason))
                    ) {
                        logLine('⛔ FB giới hạn → dừng để an toàn.');
                        notify('FB giới hạn (rate-limit) → đã dừng', 'error');
                        break;
                    }
                }
            } catch (e) {
                err++;
                logLine(`✗ #${i + 1} ${e.message}`);
            }
            setStat();
            if (i < total - 1 && !_stop) await sleep(delay);
        }
        setStat();
        _running = false;
        $('boostRun').disabled = false;
        $('boostStop').disabled = true;
        logLine(`■ Xong: ${ok} gửi, ${err} lỗi.`);
        notify(`Tăng comment xong: ${ok} gửi, ${err} lỗi`, ok ? 'success' : 'warning');
    }

    function init() {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        wireTabs();
        $('boostReloadPost').addEventListener('click', loadPosts);
        $('boostReloadConv').addEventListener('click', loadConvs);
        $('boostRun').addEventListener('click', run);
        $('boostStop').addEventListener('click', () => {
            _stop = true;
            $('boostStop').disabled = true;
        });
        loadPages();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
