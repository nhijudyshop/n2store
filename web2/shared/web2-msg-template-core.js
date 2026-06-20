// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal · CORE
// =====================================================
//
// Phần lõi tách từ web2-msg-template.js (MOVE-only): constants, shared state,
// utils, persistence localStorage, template CRUD qua Postgres (Hướng D).
// Expose dưới `window.W2MT` để các module ui/send tham chiếu chung 1 nguồn state.
//
// Template store: Postgres `web2_msg_templates` (web2Db) qua /api/web2-msg-templates
// — Hướng D 2026-06-14, migrate khỏi Firestore `web2_message_templates` (dọn nốt
// firebase Web 2.0). Server seed 4 default khi rỗng. Web 1.0 (orders-report
// message-template-manager.js, collection `message_templates`) KHÔNG đụng.
// schema: {id, name, content, order, active}. Placeholders:
//   {partner.name}     → order.customerName
//   {partner.address}  → order.address
//   {order.code}       → order.code
//   {order.details}    → lines summary (auto-fetched if missing)

(function () {
    'use strict';

    const W2MT = (window.W2MT = window.W2MT || {});

    const TEMPLATES_KEY = 'web2_message_templates_cache';
    const SENT_KEY = 'web2_sent_message_orders';
    const TTL_24H = 24 * 60 * 60 * 1000;

    // Server-side job API (chạy nền ở Render, refresh-safe). Qua CF worker proxy.
    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    // Mount dưới /api/web2/msg-send (CF worker forward /api/web2/* về Render).
    const API_BASE = WORKER_URL + '/api/web2/msg-send';
    // Hướng D (2026-06-14): template CRUD chuyển Firestore → Postgres (web2Db).
    // Route /api/web2-msg-templates trả {id,name,content,order,active}; client map
    // name→Name, content→Content để giữ nguyên modal code (dùng t.Name/t.Content).
    const TPL_API = WORKER_URL + '/api/web2-msg-templates';

    W2MT.TEMPLATES_KEY = TEMPLATES_KEY;
    W2MT.SENT_KEY = SENT_KEY;
    W2MT.TTL_24H = TTL_24H;
    W2MT.WORKER_URL = WORKER_URL;
    W2MT.API_BASE = API_BASE;
    W2MT.TPL_API = TPL_API;

    function _authHeaders(extra) {
        try {
            return window.Web2Auth?.authHeaders
                ? window.Web2Auth.authHeaders(extra)
                : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    W2MT._authHeaders = _authHeaders;

    // ─── Shared mutable state (1 nguồn cho mọi module) ────────────
    W2MT.state = {
        templates: [],
        filtered: [],
        selectedTemplateId: null,
        modalOrders: [],
        sentOrders: new Map(), // orderCode → { ts }

        // ─── Active server job watch state (độc lập modal — refresh-safe) ──
        activeJobId: null,
        sseUnsub: null,
        pollTimer: null,
        draining: false,
        drainStop: false,
        watching: false,
        isSending: false,
    };

    // ─── Persistence ─────────────────────────────────────────────
    function _loadSent() {
        try {
            const raw = localStorage.getItem(SENT_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            const now = Date.now();
            arr.forEach((item) => {
                if (now - item.ts < TTL_24H) W2MT.state.sentOrders.set(item.code, { ts: item.ts });
            });
        } catch (_) {
            /* ignore */
        }
    }
    function _saveSent() {
        try {
            const arr = [];
            W2MT.state.sentOrders.forEach((v, code) => arr.push({ code, ts: v.ts }));
            localStorage.setItem(SENT_KEY, JSON.stringify(arr));
        } catch (_) {
            /* ignore */
        }
    }
    function _markSent(code) {
        W2MT.state.sentOrders.set(code, { ts: Date.now() });
        _saveSent();
    }
    // AUDIT 2026-06-20 #27: gỡ mark cho đơn GỬI LỖI sau khi job xong → cho phép gửi
    // lại (blanket mark lúc tạo job chống re-queue khi đang chạy; lỗi thì nhả ra).
    function _unmarkSent(code) {
        if (!code) return;
        if (W2MT.state.sentOrders.delete(code)) _saveSent();
    }
    function _isSent(code) {
        if (!code) return false;
        const e = W2MT.state.sentOrders.get(code);
        if (!e) return false;
        if (Date.now() - e.ts >= TTL_24H) {
            W2MT.state.sentOrders.delete(code);
            return false;
        }
        return true;
    }
    W2MT._loadSent = _loadSent;
    W2MT._saveSent = _saveSent;
    W2MT._markSent = _markSent;
    W2MT._unmarkSent = _unmarkSent;
    W2MT._isSent = _isSent;

    // ─── Postgres: load templates (Hướng D, thay Firestore) ───────
    // Map server {name,content} → {Name,Content} để modal dùng nguyên t.Name/t.Content.
    function _mapIn(it) {
        return {
            id: it.id,
            Name: it.name || '',
            Content: it.content || '',
            order: Number(it.order) || 0,
            active: it.active !== false,
        };
    }

    async function _loadTemplates() {
        // Try cache first (hiển thị ngay, revalidate sau).
        try {
            const cached = localStorage.getItem(TEMPLATES_KEY);
            if (cached) W2MT.state.templates = JSON.parse(cached);
        } catch (_) {
            /* ignore */
        }
        try {
            const r = await fetch(TPL_API, { headers: _authHeaders() });
            const d = await r.json().catch(() => null);
            if (r.ok && d?.success && Array.isArray(d.items)) {
                W2MT.state.templates = d.items.map(_mapIn);
                try {
                    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(W2MT.state.templates));
                } catch (_) {
                    /* quota */
                }
            }
        } catch (e) {
            console.warn('[Web2MsgTemplate] loadTemplates failed:', e?.message || e);
        }
        return W2MT.state.templates;
    }

    async function _saveTemplate(data) {
        const payload = {
            id: data.id || undefined,
            Name: data.Name || data.name || '',
            Content: data.Content || data.content || '',
            active: data.active !== false,
        };
        if (typeof data.order === 'number') payload.order = data.order;
        const r = await fetch(TPL_API, {
            method: 'POST',
            headers: _authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
        if (d.item?.id) data.id = d.item.id;
        await _loadTemplates();
        return data;
    }

    async function _deleteTemplate(id) {
        if (!id) return;
        const r = await fetch(TPL_API + '/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: _authHeaders(),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
        await _loadTemplates();
    }
    W2MT._mapIn = _mapIn;
    W2MT._loadTemplates = _loadTemplates;
    W2MT._saveTemplate = _saveTemplate;
    W2MT._deleteTemplate = _deleteTemplate;

    // ─── Placeholder fill ─────────────────────────────────────────
    function _fillTemplate(text, order) {
        if (!text) return '';
        const total = _formatVnd(order.total);
        const phone = order.phone || '';
        return (
            text
                .replace(/\{partner\.name\}/g, order.customerName || order.fbUserName || 'bạn')
                .replace(/\{partner\.address\}/g, order.address || '')
                // phone: hỗ trợ cả {partner.phone} (cũ) lẫn {order.phone} (UI hint).
                .replace(/\{partner\.phone\}/g, phone)
                .replace(/\{order\.phone\}/g, phone)
                .replace(/\{order\.code\}/g, order.code || '')
                // total: hỗ trợ cả {order.total} lẫn {order.totalAmount} (UI hint).
                .replace(/\{order\.total\}/g, total)
                .replace(/\{order\.totalAmount\}/g, total)
                .replace(
                    /\{order\.details\}/g,
                    order._detailsText || _formatLines(order.lines || [])
                )
        );
    }

    function _formatVnd(n) {
        if (!n || !Number(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + 'đ';
    }

    function _formatLines(lines) {
        if (!Array.isArray(lines) || !lines.length) return '(không có sản phẩm)';
        return lines
            .map((l) => {
                const name = l.productName || l.name || l.productCode || '?';
                const qty = l.qty || l.quantity || 1;
                const price = _formatVnd(l.price || l.unitPrice || 0);
                return `• ${name} × ${qty} (${price})`;
            })
            .join('\n');
    }
    W2MT._fillTemplate = _fillTemplate;
    W2MT._formatVnd = _formatVnd;
    W2MT._formatLines = _formatLines;

    // ─── Misc shared utils ────────────────────────────────────────
    function _toast(msg, type) {
        if (window.notificationManager?.show) {
            window.notificationManager.show(msg, type || 'info');
        } else {
            console.log('[Web2MsgTemplate]', type, msg);
        }
    }

    function _refreshIcons() {
        if (window.lucide?.createIcons) {
            try {
                window.lucide.createIcons();
            } catch (_) {
                /* */
            }
        }
    }

    function _sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    W2MT._toast = _toast;
    W2MT._refreshIcons = _refreshIcons;
    W2MT._sleep = _sleep;
})();
