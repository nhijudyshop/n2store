// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
// =====================================================================
// Web2UnreadPanel — render danh sách tin nhắn chưa đọc (web2_unread_messages,
// web2Db, RIÊNG Web 1.0) vào 1 container. Tự fetch + render + SSE web2:unread.
//   Web2UnreadPanel.mount(rootEl)   → gắn vào container, load + subscribe.
//   Web2UnreadPanel.reload()        → tải lại thủ công.
// Danh sách TỰ xoá theo Pancake (đọc trên Pancake → unread=0 / shop trả lời →
// update_conversation → tracker xoá → SSE web2:unread → reload). KHÔNG nút "Đã đọc".
// =====================================================================
(function (global) {
    'use strict';
    if (typeof window === 'undefined') return;

    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const UNREAD_API = PROXY + '/api/web2/unread';

    let _root = null;
    let _items = [];
    let _debounce = null;
    let _subscribed = false;
    let _onCount = null;

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function fmtTime(ts) {
        if (global.Web2Format) return global.Web2Format.dateTime(ts);
        if (!ts) return '';
        const n = typeof ts === 'number' ? ts : Date.parse(ts);
        return Number.isNaN(n) ? '' : new Date(n).toLocaleString('vi-VN');
    }
    // Port keyword detector (highlight tin có thể là CK) — đồng bộ server.
    function normalize(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function looksLikePaymentMsg(rawText) {
        const t = normalize(rawText);
        if (!t) return false;
        if (/[?]/.test(rawText)) return false;
        return /(^|[^a-z])ck ?xong([^a-z]|$)/.test(t) || /(^|[^a-z])da ?ck([^a-z]|$)/.test(t);
    }

    function ensureStyles() {
        if (document.getElementById('w2up-styles')) return;
        const s = document.createElement('style');
        s.id = 'w2up-styles';
        s.textContent = `
            .w2up-list{display:grid;gap:8px;}
            .w2up-row{display:grid;grid-template-columns:1fr auto;gap:6px 16px;align-items:center;background:#fff;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(15,23,42,.05);}
            .w2up-row.hl{background:#fffbeb;border-left:3px solid #f59e0b;}
            .w2up-cust{font-weight:700;color:#1e293b;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
            .w2up-kw{background:#fef3c7;color:#b45309;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;}
            .w2up-msg{color:#475569;font-size:13px;margin-top:2px;}
            .w2up-meta{font-size:11px;color:#94a3b8;margin-top:3px;}
            .w2up-count{background:#ef4444;color:#fff;border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;white-space:nowrap;}
            .w2up-empty{text-align:center;color:#94a3b8;padding:40px 16px;font-size:14px;}
        `;
        document.head.appendChild(s);
    }

    async function fetchUnread() {
        const r = await fetch(UNREAD_API + '?limit=300', { credentials: 'include' });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Lỗi tải tin chưa đọc');
        return d.customers || [];
    }

    function render() {
        if (!_root) return;
        if (typeof _onCount === 'function') {
            try {
                _onCount(_items.length);
            } catch (e) {
                /* ignore */
            }
        }
        if (!_items.length) {
            _root.innerHTML = '<div class="w2up-empty">Không có tin nhắn chưa đọc.</div>';
            return;
        }
        _root.innerHTML =
            '<div class="w2up-list">' +
            _items
                .map((c) => {
                    const hl = looksLikePaymentMsg(c.last_message_snippet) ? ' hl' : '';
                    return `
                <div class="w2up-row${hl}">
                    <div>
                        <div class="w2up-cust">${esc(c.customer_name || c.psid || 'KH')}${hl ? ' <span class="w2up-kw">CÓ THỂ ĐÃ CK</span>' : ''}${
                            c.phone ? ` <span data-w2wallet-phone="${esc(c.phone)}"></span>` : ''
                        }</div>
                        <div class="w2up-msg">"${esc(c.last_message_snippet || '')}"</div>
                        <div class="w2up-meta">${esc(fmtTime(c.last_message_time))} · page ${esc(c.page_id || '')}</div>
                    </div>
                    <div><span class="w2up-count">${esc(c.message_count || 0)} mới</span></div>
                </div>`;
                })
                .join('') +
            '</div>';
        if (global.Web2WalletBalance?.attachBalances) {
            global.Web2WalletBalance.attachBalances(_root);
        }
    }

    async function reload() {
        if (!_root) return;
        _root.innerHTML = '<div class="w2up-empty">Đang tải…</div>';
        try {
            _items = await fetchUnread();
            render();
        } catch (e) {
            _root.innerHTML = '<div class="w2up-empty">' + esc(e.message) + '</div>';
        }
    }

    function _debouncedReload() {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(reload, 400);
    }

    function mount(rootEl, opts) {
        if (!rootEl) return;
        _root = rootEl;
        if (opts && typeof opts.onCount === 'function') _onCount = opts.onCount;
        ensureStyles();
        reload();
        if (!_subscribed && global.Web2SSE?.subscribe) {
            _subscribed = true;
            try {
                global.Web2SSE.subscribe('web2:unread', () => _debouncedReload());
            } catch (e) {
                /* ignore */
            }
        }
    }

    global.Web2UnreadPanel = { mount, reload };
})(window);
