// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — pending match modal.
// =====================================================================
// Web2PendingMatch — fetch + resolve multi-match transactions từ
// /api/web2/balance-history (Web 2.0 path)
// =====================================================================
// Tách hoàn toàn khỏi Web 1.0 pending modal cũ (refreshPendingMatchList +
// resolvePendingMatch ở balance-table.js). Web 2.0 polling endpoint riêng
// + auto credit ngay khi user chọn (không cần kế toán duyệt).
//
// Flow:
//   1. GET /api/web2/balance-history/pending → list pending matches Web 2.0
//   2. Hiện badge "Cần chọn KH (N)" + popup modal liệt kê
//   3. User click 1 KH → POST .../pending/:id/resolve {phone, name}
//      → backend credit ví Web 2.0 + đóng pending
//   4. Refresh list
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2/balance-history';

    async function jsonFetch(url, options) {
        const r = await fetch(url, options);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`);
            throw new Error(msg);
        }
        return body;
    }

    async function withFallback(path, options) {
        try {
            return await jsonFetch(`${BASE}${path}`, options);
        } catch (e) {
            return await jsonFetch(`${DIRECT_BASE}${path}`, options);
        }
    }

    async function listPending() {
        const r = await withFallback('/pending');
        return Array.isArray(r?.data) ? r.data : [];
    }

    async function resolvePending(id, phone, name, resolvedBy) {
        return await withFallback(`/pending/${encodeURIComponent(id)}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, resolvedBy }),
        });
    }

    async function linkManual(txId, phone, name) {
        return await withFallback(`/${encodeURIComponent(txId)}/link`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name }),
        });
    }

    function escapeHtml(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }

    function fmtTime(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (
                d.toLocaleDateString('vi-VN') +
                ' ' +
                d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            );
        } catch {
            return iso;
        }
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
        console.log(`[Web2Pending:${type || 'info'}]`, msg);
    }

    let _modal = null;
    let _pendingList = [];

    function ensureModalDom() {
        if (_modal) return _modal;
        const div = document.createElement('div');
        div.id = 'web2PendingModal';
        div.className = 'w2pm-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2pm-backdrop"></div>
            <div class="w2pm-panel">
                <header class="w2pm-head">
                    <h3>Chọn khách hàng cho giao dịch (Web 2.0)</h3>
                    <button type="button" class="w2pm-close" aria-label="Đóng">&times;</button>
                </header>
                <p class="w2pm-info">SePay match đa SĐT cùng đuôi — chọn đúng KH để cộng tiền vào ví Web 2.0.</p>
                <div class="w2pm-body" id="web2PendingBody"></div>
                <footer class="w2pm-foot">
                    <button type="button" class="w2pm-refresh">Tải lại</button>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelector('.w2pm-backdrop').addEventListener('click', closeModal);
        div.querySelector('.w2pm-close').addEventListener('click', closeModal);
        div.querySelector('.w2pm-refresh').addEventListener('click', refreshModal);
        _modal = div;
        ensureStyles();
        return div;
    }

    function ensureStyles() {
        if (document.getElementById('web2PendingMatchStyles')) return;
        const s = document.createElement('style');
        s.id = 'web2PendingMatchStyles';
        s.textContent = `
            .w2pm-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }
            .w2pm-modal[hidden] { display: none; }
            .w2pm-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2pm-panel { position: relative; background: #fff; border-radius: 10px; width: min(760px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(15,23,42,.32); overflow: hidden; }
            .w2pm-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
            .w2pm-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2pm-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; line-height: 1; padding: 4px 8px; }
            .w2pm-info { margin: 10px 18px 0; font-size: 12px; color: #475569; padding: 8px 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; }
            .w2pm-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
            .w2pm-foot { padding: 10px 18px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px; background: #f9fafb; }
            .w2pm-refresh { background: #fff; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .w2pm-refresh:hover { background: #f3f4f6; }
            .w2pm-empty { text-align: center; padding: 32px; color: #94a3b8; font-style: italic; }
            .w2pm-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; background: #fff; }
            .w2pm-item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .w2pm-item-amount { font-size: 16px; font-weight: 700; color: #0891b2; }
            .w2pm-item-time { font-size: 11px; color: #94a3b8; }
            .w2pm-item-content { font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; max-height: 60px; overflow: auto; }
            .w2pm-choices { display: flex; flex-direction: column; gap: 5px; }
            .w2pm-choice { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #f1f5f9; border-radius: 5px; cursor: pointer; transition: all .12s; }
            .w2pm-choice:hover { background: #dbeafe; }
            .w2pm-choice-phone { font-weight: 600; color: #1d4ed8; min-width: 110px; }
            .w2pm-choice-name { flex: 1; color: #0f172a; font-size: 13px; }
            .w2pm-choice-btn { background: #0891b2; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
            .w2pm-badge-trigger { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 999px; font-size: 12px; cursor: pointer; font-weight: 600; border: 1px solid #fde68a; }
            .w2pm-badge-trigger:hover { background: #fde68a; }
            .w2pm-badge-trigger[hidden] { display: none !important; }
        `;
        document.head.appendChild(s);
    }

    function renderModalBody() {
        const body = document.getElementById('web2PendingBody');
        if (!body) return;
        if (!_pendingList.length) {
            body.innerHTML = '<div class="w2pm-empty">Không có giao dịch nào chờ chọn KH 🎉</div>';
            return;
        }
        body.innerHTML = _pendingList.map(renderItem).join('');
        body.querySelectorAll('[data-w2pm-resolve]').forEach((btn) => {
            btn.addEventListener('click', onResolveClick);
        });
    }

    function renderItem(item) {
        const matched = Array.isArray(item.matched_customers) ? item.matched_customers : [];
        const choices = matched
            .flatMap((m) =>
                (m.customers || []).map((c) => ({
                    pending_id: item.id,
                    phone: m.phone || c.phone,
                    name: c.name || '',
                }))
            )
            .filter((c) => c.phone);
        return `
            <div class="w2pm-item">
                <div class="w2pm-item-head">
                    <span class="w2pm-item-amount">+${fmtVnd(item.transfer_amount)}</span>
                    <span class="w2pm-item-time">${escapeHtml(fmtTime(item.transaction_date))} · ${escapeHtml(item.sepay_id || '')}</span>
                </div>
                <div class="w2pm-item-content">${escapeHtml(item.content || '')}</div>
                <div class="w2pm-choices">
                    ${choices
                        .map(
                            (c) => `
                        <div class="w2pm-choice">
                            <span class="w2pm-choice-phone">${escapeHtml(c.phone)}</span>
                            <span class="w2pm-choice-name">${escapeHtml(c.name || '(không tên)')}</span>
                            <button class="w2pm-choice-btn" type="button"
                                data-w2pm-resolve="${item.id}"
                                data-phone="${escapeHtml(c.phone)}"
                                data-name="${escapeHtml(c.name || '')}">
                                Chọn
                            </button>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        `;
    }

    async function onResolveClick(e) {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-w2pm-resolve');
        const phone = btn.getAttribute('data-phone');
        const name = btn.getAttribute('data-name') || '';
        btn.disabled = true;
        btn.textContent = 'Đang xử lý…';
        try {
            const result = await resolvePending(id, phone, name, 'web2-balance-history-ui');
            const amt = result?.data?.amount || 0;
            notify(`✅ Đã cộng ${fmtVnd(amt)} vào ví Web 2.0 của ${name || phone}`, 'success');
            // Remove this item from list and re-render
            _pendingList = _pendingList.filter((it) => String(it.id) !== String(id));
            renderModalBody();
            updateBadge();
            if (!_pendingList.length) {
                setTimeout(closeModal, 1500);
            }
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Chọn';
        }
    }

    async function refreshModal() {
        try {
            _pendingList = await listPending();
        } catch (e) {
            notify('Lỗi tải pending: ' + e.message, 'error');
            return;
        }
        renderModalBody();
        updateBadge();
    }

    function openModal() {
        ensureModalDom();
        _modal.hidden = false;
        renderModalBody();
        refreshModal();
    }

    function closeModal() {
        if (_modal) _modal.hidden = true;
    }

    // Floating badge — show count of pending matches in toolbar
    let _badge = null;
    function ensureBadge() {
        if (_badge) return _badge;
        ensureStyles();
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'web2PendingBadge';
        b.className = 'w2pm-badge-trigger';
        b.hidden = true;
        b.innerHTML = `🔍 Cần chọn KH (Web 2.0): <span id="web2PendingBadgeCount">0</span>`;
        b.addEventListener('click', openModal);
        // Insert at top of body or near filters
        const filtersTop = document.querySelector('.verification-filters');
        if (filtersTop && filtersTop.parentNode) {
            filtersTop.parentNode.insertBefore(b, filtersTop);
        } else {
            document.body.appendChild(b);
        }
        b.style.position = 'fixed';
        b.style.top = '12px';
        b.style.right = '16px';
        b.style.zIndex = '9000';
        _badge = b;
        return b;
    }

    function updateBadge() {
        ensureBadge();
        const count = _pendingList.length;
        const cnt = document.getElementById('web2PendingBadgeCount');
        if (cnt) cnt.textContent = count;
        _badge.hidden = count === 0;
    }

    async function refresh() {
        try {
            _pendingList = await listPending();
            updateBadge();
        } catch (e) {
            console.warn('[Web2PendingMatch] refresh fail:', e.message);
        }
    }

    function init() {
        ensureBadge();
        refresh();
        // Auto refresh every 30s
        setInterval(refresh, 30000);
        // Subscribe SSE for realtime new pending matches
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:wallet:*', () => {
                // Web 2.0 wallet update = có thể có pending mới hoặc resolved → refresh
                setTimeout(refresh, 500);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2PendingMatch = {
        refresh,
        openModal,
        closeModal,
        listPending,
        resolvePending,
        linkManual,
    };
})(window);
