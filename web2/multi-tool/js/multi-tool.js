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
        // KHÔNG dùng Math.random nếu cấm? Đây là trang browser bình thường → OK.
        const n = 5 + Math.floor(Math.random() * 5);
        let s = '';
        for (let i = 0; i < n; i++) s += _CH.charAt(Math.floor(Math.random() * _CH.length));
        return s;
    }

    let _convs = []; // conversations COMMENT của page đang chọn
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
        sel.onchange = () => loadConvs();
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    async function loadConvs() {
        const pageId = $('boostPage').value;
        const csel = $('boostConv');
        _convs = [];
        if (!pageId) {
            csel.innerHTML = '<option value="">Chọn page trước…</option>';
            return;
        }
        csel.innerHTML = '<option value="">Đang tải hội thoại…</option>';
        const W = await waitWeb2Chat();
        const r = await W.fetchConversationsByPage(pageId, {});
        if (!r.ok) {
            csel.innerHTML = `<option value="">Lỗi tải: ${esc(r.reason || '')}</option>`;
            return;
        }
        // CHỈ hội thoại COMMENT (live). reply_comment cần comment thread.
        _convs = (r.conversations || []).filter(
            (c) => String(c.type || '').toUpperCase() === 'COMMENT'
        );
        if (!_convs.length) {
            csel.innerHTML =
                '<option value="">Không có hội thoại COMMENT (mở 1 bài live có người comment)</option>';
            return;
        }
        csel.innerHTML = _convs
            .map((c, i) => {
                const nm =
                    (c.customers && c.customers[0] && c.customers[0].name) || c.from?.name || 'KH';
                const snip = (c.snippet || '').slice(0, 22);
                return `<option value="${i}">${esc(nm)} — ${esc(snip)}</option>`;
            })
            .join('');
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
            notify('Chọn page + hội thoại comment trước', 'warning');
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
        logLine(`▶ Bắt đầu: ${total} comment, giãn ${delay}ms, hội thoại ${conv.id}`);

        for (let i = 0; i < total; i++) {
            if (_stop) {
                logLine('⏹ Đã dừng.');
                break;
            }
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
