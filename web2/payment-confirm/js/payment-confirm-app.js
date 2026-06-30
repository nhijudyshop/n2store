// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module — Xác nhận CK.
// =====================================================
// Web 2.0 — Trang "Xác nhận Chuyển Khoản"
// =====================================================
//
// 2 tab (CẢ HAI đều data Web 2.0 thuần — web2Db, KHÔNG đọc Web 1.0):
//   • "KH báo đã CK" — web2_payment_signals qua /api/web2/payment-signals
//   • "Tin nhắn chưa đọc" — web2_unread_messages qua /api/web2/unread (bản RIÊNG
//     của Web 2.0, populate từ Pancake WS hook trong server.js — độc lập
//     pending_customers của Web 1.0).
//
// Realtime: Web2SSE.subscribe('web2:payment-signals') → debounce reload.
// Mutation: Web2Optimistic.run (UI-first + rollback).
// Ví KH: Web2WalletBalance.attachBalances (pill số dư).

(function () {
    'use strict';

    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = PROXY + '/api/web2/payment-signals';
    // Web 2.0 unread RIÊNG (web2_unread_messages, web2Db) — KHÔNG đọc Web 1.0
    // pending_customers nữa. Populate từ Pancake WS hook trong server.js.
    const UNREAD_API = PROXY + '/api/web2/unread';

    const state = {
        tab: 'signals', // signals | unread
        status: 'pending',
        signals: [],
        unread: [],
    };

    // ─── Helpers ──────────────────────────────────────────────────────
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function fmtMoney(n) {
        if (window.Web2Format) return window.Web2Format.num(n);
        return Number(n || 0).toLocaleString('vi-VN');
    }
    function fmtTime(ts) {
        if (window.Web2Format) return window.Web2Format.dateTime(ts);
        if (!ts) return '';
        const n = Number(ts);
        return new Date(n).toLocaleString('vi-VN');
    }
    function toast(msg, type) {
        if (window.notificationManager?.show) {
            window.notificationManager.show(msg, type || 'info');
        } else {
            console.log('[payment-confirm]', msg);
        }
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho mutation payment-signals
    // (confirm/dismiss/link-order — soft-gate → WEB2_AUTH_ENFORCE=1). Trang này
    // KHÔNG load web2-auth.js → fallback đọc thẳng localStorage 'web2_auth'.
    function authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    // Body kèm user info (cho history "ai xác nhận"). Web2UserInfo.attachToBody
    // thêm userId/userName; fallback đọc trực tiếp Web2UserInfo.get().
    function userBody(extra) {
        const body = { ...(extra || {}) };
        if (window.Web2UserInfo?.attachToBody) {
            return window.Web2UserInfo.attachToBody(body, 'web2-payment-confirm');
        }
        const u = window.Web2UserInfo?.get?.();
        if (u) {
            body.userId = u.userId || null;
            body.userName = u.userName || null;
        }
        return body;
    }

    // Port detector keyword (cho highlight tab unread) — đồng bộ với server.
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
        if (/\b(chua|khong|the nao|kieu gi|lam sao|o dau|bang gi)\b/.test(t)) return false;
        return /(^|[^a-z])ck ?xong([^a-z]|$)/.test(t) || /(^|[^a-z])da ?ck([^a-z]|$)/.test(t);
    }

    // ─── Fetch ────────────────────────────────────────────────────────
    async function fetchSignals() {
        const url = API + '?status=' + encodeURIComponent(state.status);
        const r = await fetch(url, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Lỗi tải signals');
        return d.data || [];
    }
    async function fetchUnread() {
        const r = await fetch(UNREAD_API + '?limit=300', { credentials: 'include' });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Lỗi tải tin chưa đọc');
        return d.customers || [];
    }

    // ─── Render: signals ──────────────────────────────────────────────
    function orderLink(sig) {
        if (!sig.orderCode) {
            return '<div class="pc-noorder">⚠ Chưa khớp đơn (gán thủ công nếu cần)</div>';
        }
        const isNative = sig.orderType === 'native';
        const page = isNative ? '../native-orders/index.html' : '../web2-pancake/index.html';
        const label = isNative ? 'Đơn Web' : 'PBH';
        const o = sig.order;
        const extra = o ? ` — ${esc(o.name || '')} · ${fmtMoney(o.total)}đ` : '';
        return `<div class="pc-order">${label}: <a href="${page}?code=${encodeURIComponent(sig.orderCode)}" target="_blank">${esc(sig.orderCode)}</a>${extra}</div>`;
    }

    // Lịch sử thao tác (ai detect / xác nhận / bỏ qua / gán đơn, lúc nào).
    const ACTION_VI = {
        detect: 'Hệ thống nhận',
        confirm: 'Xác nhận',
        dismiss: 'Bỏ qua',
        link: 'Gán đơn',
    };
    function historyHtml(sig) {
        const h = Array.isArray(sig.history) ? sig.history : [];
        if (!h.length) return '';
        // Ưu tiên module timeline chung; fallback list gọn.
        let inner;
        if (window.Web2HistoryTimeline?.render) {
            inner = window.Web2HistoryTimeline.render(h, { title: false });
        } else {
            inner = h
                .map(
                    (e) =>
                        `<div class="pc-hist-row"><b>${esc(ACTION_VI[e.action] || e.action)}</b> · ${esc(e.userName || '(ẩn danh)')} · ${esc(fmtTime(e.ts))}${e.note ? ' · ' + esc(e.note) : ''}</div>`
                )
                .join('');
        }
        return `<details class="pc-history"><summary>Lịch sử (${h.length})</summary>${inner}</details>`;
    }

    function renderSignals() {
        const root = document.getElementById('pcSignals');
        if (!state.signals.length) {
            root.innerHTML = '<div class="pc-empty">Chưa có tín hiệu nào.</div>';
            return;
        }
        root.innerHTML = state.signals
            .map((sig) => {
                const phoneAttr = sig.phone
                    ? ` <span class="pc-wallet-pill" data-w2wallet-phone="${esc(sig.phone)}"></span>`
                    : '';
                let actions;
                if (sig.status === 'pending') {
                    actions = `
                        <button class="pc-btn pc-btn-confirm" data-act="confirm" data-id="${sig.id}">✓ Xác nhận</button>
                        <button class="pc-btn pc-btn-link" data-act="link" data-id="${sig.id}">Gán đơn</button>
                        <button class="pc-btn pc-btn-dismiss" data-act="dismiss" data-id="${sig.id}">Bỏ qua</button>`;
                } else if (sig.status === 'confirmed') {
                    const byTxt = sig.confirmedBy ? ` · ${esc(sig.confirmedBy)}` : '';
                    actions = `<span class="pc-badge-done">✅ Đã xác nhận${byTxt}</span>
                        <button class="pc-btn pc-btn-dismiss" data-act="dismiss" data-id="${sig.id}">Hủy cờ</button>`;
                } else {
                    actions = `<span style="color:#94a3b8;font-size:12px">Đã bỏ qua</span>`;
                }
                return `
                <div class="pc-card status-${esc(sig.status)}">
                    <div>
                        <div class="pc-cust">${esc(sig.customerName || sig.psid || 'KH')}
                            <span class="pc-kw">${esc(sig.keyword || '')}</span>${phoneAttr}</div>
                        <div class="pc-msg">"${esc(sig.rawMessage || '')}"</div>
                        <div class="pc-meta">${esc(fmtTime(sig.createdAt))}${sig.phone ? ' · ' + esc(sig.phone) : ''}</div>
                        ${orderLink(sig)}
                        ${historyHtml(sig)}
                    </div>
                    <div class="pc-actions">${actions}</div>
                </div>`;
            })
            .join('');

        // Wallet pills + lucide
        if (window.Web2WalletBalance?.attachBalances) {
            window.Web2WalletBalance.attachBalances(root);
        }
        bindActions(root);
    }

    // ─── Render: unread ───────────────────────────────────────────────
    function renderUnread() {
        const root = document.getElementById('pcUnread');
        if (!state.unread.length) {
            root.innerHTML = '<div class="pc-empty">Không có tin nhắn chưa đọc.</div>';
            return;
        }
        root.innerHTML =
            '<div class="pc-list">' +
            state.unread
                .map((c) => {
                    const hl = looksLikePaymentMsg(c.last_message_snippet) ? ' hl' : '';
                    return `
                <div class="pc-unread-row${hl}">
                    <div>
                        <div class="pc-cust">${esc(c.customer_name || c.psid || 'KH')}${hl ? ' <span class="pc-kw">CÓ THỂ ĐÃ CK</span>' : ''}</div>
                        <div class="pc-msg">"${esc(c.last_message_snippet || '')}"</div>
                        <div class="pc-meta">${esc(fmtTime(c.last_message_time))} · page ${esc(c.page_id || '')}</div>
                    </div>
                    <div><span class="pc-unread-count">${esc(c.message_count || 0)} mới</span></div>
                </div>`;
                })
                .join('') +
            '</div>';
        // Không có nút "Đã đọc" — danh sách tự xoá theo Pancake (đọc trên Pancake
        // → unread=0 / shop trả lời → event update_conversation → tracker xoá →
        // SSE web2:unread → reload). Auto hoàn toàn.
    }

    // ─── Mutations (UI-first qua Web2Optimistic) ──────────────────────
    function bindActions(root) {
        root.querySelectorAll('[data-act]').forEach((btn) => {
            btn.onclick = () => doAction(btn.dataset.act, Number(btn.dataset.id));
        });
    }

    function doAction(act, id) {
        const sig = state.signals.find((s) => s.id === id);
        if (!sig) return;

        if (act === 'link') return linkOrder(sig);

        const newStatus = act === 'confirm' ? 'confirmed' : 'dismissed';
        const prev = sig.status;
        const apply = () => {
            sig.status = newStatus;
            renderSignals();
            updateCounts();
        };
        const rollback = () => {
            sig.status = prev;
            renderSignals();
            updateCounts();
        };
        const run = () =>
            fetch(API + '/' + id + '/' + act, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
                credentials: 'include',
                body: JSON.stringify(userBody()),
            }).then((r) => r.json());

        const opts = {
            snapshot: prev,
            apply,
            run,
            rollback,
            successMsg: act === 'confirm' ? 'Đã gắn cờ đơn ✅' : 'Đã bỏ qua',
            errLabel: 'Cập nhật tín hiệu',
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run(opts);
        } else {
            apply();
            run()
                .then((d) => {
                    if (!d.success) {
                        rollback();
                        toast('Lỗi: ' + (d.error || ''), 'error');
                    }
                })
                .catch(() => {
                    rollback();
                    toast('Lỗi mạng', 'error');
                });
        }
    }

    async function linkOrder(sig) {
        const orderType = await window.Popup.prompt(
            'Loại đơn? gõ "native" (Đơn Web) hoặc "fast_sale" (PBH):',
            { defaultValue: sig.orderType || 'native' }
        );
        if (!orderType || !['native', 'fast_sale'].includes(orderType.trim())) return;
        const orderCode = await window.Popup.prompt('Mã đơn:', {
            defaultValue: sig.orderCode || '',
        });
        if (!orderCode) return;
        fetch(API + '/' + sig.id + '/link-order', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
            credentials: 'include',
            body: JSON.stringify(
                userBody({ orderType: orderType.trim(), orderCode: orderCode.trim() })
            ),
        })
            .then((r) => r.json())
            .then((d) => {
                if (d.success) {
                    toast('Đã gán đơn', 'success');
                    reload();
                } else {
                    toast('Lỗi: ' + (d.error || ''), 'error');
                }
            })
            .catch(() => toast('Lỗi mạng', 'error'));
    }

    // ─── Counts + tab switching ───────────────────────────────────────
    function updateCounts() {
        const pending = state.signals.filter((s) => s.status === 'pending').length;
        const el = document.getElementById('pcSignalsCount');
        if (el) el.textContent = pending;
    }

    function switchTab(tab) {
        state.tab = tab;
        document.querySelectorAll('.pc-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.getElementById('pcSignalsPane').style.display = tab === 'signals' ? '' : 'none';
        document.getElementById('pcUnreadPane').style.display = tab === 'unread' ? '' : 'none';
        if (tab === 'unread') reloadUnread();
    }

    // ─── Reload ───────────────────────────────────────────────────────
    let _debounce = null;
    function reload() {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(reloadNow, 250);
    }
    async function reloadNow() {
        try {
            state.signals = await fetchSignals();
            renderSignals();
            updateCounts();
        } catch (e) {
            toast(e.message, 'error');
        }
    }
    async function reloadUnread() {
        const root = document.getElementById('pcUnread');
        root.innerHTML = '<div class="pc-empty">Đang tải…</div>';
        try {
            state.unread = await fetchUnread();
            renderUnread();
        } catch (e) {
            root.innerHTML = '<div class="pc-empty">' + esc(e.message) + '</div>';
        }
    }

    // ─── Init ─────────────────────────────────────────────────────────
    function init() {
        if (window.Web2Sidebar) {
            window.Web2Sidebar.mount('#web2Aside', { activeRoute: 'payment-confirm' });
        }
        document.querySelectorAll('.pc-tab').forEach((t) => {
            t.onclick = () => switchTab(t.dataset.tab);
        });
        const statusSel = document.getElementById('pcStatus');
        statusSel.onchange = () => {
            state.status = statusSel.value;
            reloadNow();
        };
        document.getElementById('pcRefresh').onclick = () => {
            if (state.tab === 'signals') reloadNow();
            else reloadUnread();
        };

        reloadNow();

        // SSE realtime — không cần refresh, đồng bộ mọi tab/máy.
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:payment-signals', () => {
                if (state.tab === 'signals') reload();
            });
            window.Web2SSE.subscribe('web2:unread', () => {
                if (state.tab === 'unread') reloadUnread();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
