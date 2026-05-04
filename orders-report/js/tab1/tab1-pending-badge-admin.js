// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TAB1 — PENDING BADGE ADMIN MODAL
// Mở từ Cài đặt Admin (parent main.html postMessage type=OPEN_PENDING_BADGE_ADMIN)
// View + manage tất cả pending customers (badge tin nhắn mới):
//   - List: customer name, psid, page, count, snippet, last time
//   - Per-row Clear (clearPendingForCustomer)
//   - Bulk: Clear All Local + Wipe Server (qua /api/realtime/wipe-all)
//   - Refresh (re-fetch /api/realtime/pending-customers)
// =====================================================

(function () {
    'use strict';
    if (window.__pendingBadgeAdminLoaded) return;
    window.__pendingBadgeAdminLoaded = true;

    const MODAL_ID = 'pendingBadgeAdminModal';
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    const FALLBACK_BASE = 'https://n2store-fallback.onrender.com/api/realtime';

    // -----------------------------------------------------------------
    // Modal markup — inject 1 lần lúc init
    // -----------------------------------------------------------------
    function _buildModal() {
        if (document.getElementById(MODAL_ID)) return document.getElementById(MODAL_ID);
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'pba-modal';
        modal.innerHTML = `
            <div class="pba-overlay"></div>
            <div class="pba-content">
                <div class="pba-header">
                    <h3>🔔 Quản lý badge tin nhắn</h3>
                    <button class="pba-close" title="Đóng (Esc)">×</button>
                </div>
                <div class="pba-toolbar">
                    <input type="search" class="pba-search" placeholder="Tìm tên khách / PSID..." />
                    <button class="pba-btn pba-btn-secondary" data-act="refresh">🔄 Tải lại</button>
                    <button class="pba-btn pba-btn-danger" data-act="clear-local">Xóa local</button>
                    <button class="pba-btn pba-btn-danger" data-act="wipe-server">⚠ Xóa toàn bộ server</button>
                </div>
                <div class="pba-confirm" style="display:none">
                    <span class="pba-confirm-msg"></span>
                    <button class="pba-btn pba-btn-secondary" data-confirm="cancel">Hủy</button>
                    <button class="pba-btn pba-btn-danger" data-confirm="ok">Xác nhận</button>
                </div>
                <div class="pba-stats">
                    <span><strong class="pba-count-local">0</strong> local · <strong class="pba-count-server">?</strong> server</span>
                </div>
                <div class="pba-table-wrap">
                    <table class="pba-table">
                        <thead>
                            <tr>
                                <th style="width:40px">#</th>
                                <th>Khách hàng</th>
                                <th>PSID</th>
                                <th>Page</th>
                                <th>Count</th>
                                <th>Snippet</th>
                                <th>Last time</th>
                                <th style="width:100px">Action</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="pba-empty" style="display:none">Không có khách hàng pending nào.</div>
            </div>
        `;
        document.body.appendChild(modal);

        // Stop click propagation từ content để overlay click không bubble lên
        modal.querySelector('.pba-content').addEventListener('click', (e) => e.stopPropagation());
        modal.querySelector('.pba-overlay').addEventListener('click', close);
        modal.querySelector('.pba-close').addEventListener('click', close);
        modal.querySelector('.pba-search').addEventListener('input', _renderList);
        modal.querySelector('[data-act="refresh"]').addEventListener('click', _refreshFromServer);
        modal
            .querySelector('[data-act="clear-local"]')
            .addEventListener('click', _clearLocalConfirm);
        modal
            .querySelector('[data-act="wipe-server"]')
            .addEventListener('click', _wipeServerConfirm);

        // Inline confirm bar handlers
        const confirmBar = modal.querySelector('.pba-confirm');
        confirmBar.querySelector('[data-confirm="cancel"]').addEventListener('click', () => {
            confirmBar.style.display = 'none';
            confirmBar._action = null;
        });
        confirmBar.querySelector('[data-confirm="ok"]').addEventListener('click', () => {
            const fn = confirmBar._action;
            confirmBar.style.display = 'none';
            confirmBar._action = null;
            if (typeof fn === 'function') fn();
        });

        modal.querySelector('tbody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-clear-psid]');
            if (!btn) return;
            const psid = btn.getAttribute('data-clear-psid');
            if (psid && window.newMessagesNotifier?.clearPendingForCustomer) {
                window.newMessagesNotifier.clearPendingForCustomer(psid);
                _renderList();
            }
        });

        // ESC: nếu đang hiện inline confirm → cancel confirm trước; nếu không → close modal
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !modal.classList.contains('show')) return;
            if (confirmBar.style.display !== 'none') {
                confirmBar.style.display = 'none';
                confirmBar._action = null;
            } else {
                close();
            }
        });

        return modal;
    }

    // -----------------------------------------------------------------
    // Inline confirm helper — replace browser confirm() (gây giật popup)
    // -----------------------------------------------------------------
    function _showConfirm(message, onOk) {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        const bar = modal.querySelector('.pba-confirm');
        bar.querySelector('.pba-confirm-msg').textContent = message;
        bar._action = onOk;
        bar.style.display = 'flex';
    }

    // -----------------------------------------------------------------
    // Render list từ _pendingCustomers (local) + apply search filter
    // -----------------------------------------------------------------
    function _renderList() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        const tbody = modal.querySelector('tbody');
        const empty = modal.querySelector('.pba-empty');
        const search = modal.querySelector('.pba-search').value.trim().toLowerCase();
        const data = window.newMessagesNotifier?.getPendingCustomers?.() || [];

        const filtered = data.filter((pc) => {
            if (!search) return true;
            const q = search;
            return (
                String(pc.psid || '')
                    .toLowerCase()
                    .includes(q) ||
                String(pc.snippet || '')
                    .toLowerCase()
                    .includes(q)
            );
        });

        // Sort: count desc, then timestamp desc
        filtered.sort((a, b) => {
            const ac = a.inboxCount || 0;
            const bc = b.inboxCount || 0;
            if (bc !== ac) return bc - ac;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        modal.querySelector('.pba-count-local').textContent = data.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            empty.textContent =
                data.length === 0 ? 'Không có khách hàng pending nào.' : 'Không khớp tìm kiếm.';
            return;
        }

        empty.style.display = 'none';
        const html = filtered
            .map((pc, i) => {
                const psid = String(pc.psid || pc.from_psid || '');
                const pageId = String(pc.pageId || pc.page_id || '');
                const count = pc.inboxCount || pc.unread_count || 0;
                const snippet = (pc.snippet || pc.lastMessage || '').slice(0, 60);
                const ts = pc.timestamp || pc.updated_at;
                const tsStr = ts ? new Date(ts).toLocaleString('vi-VN') : '—';
                // Ưu tiên: 1) data từ server/WS event 2) allData (full ~1500 orders đã load,
                // match Facebook_ASUserId === psid) 3) DOM row visible 4) fallback "(không rõ)"
                let customerName = pc.customerName || pc.customer_name || '';
                if (!customerName) {
                    const orderMatch =
                        typeof allData !== 'undefined' &&
                        allData.find((o) => String(o.Facebook_ASUserId || '') === psid);
                    if (orderMatch?.Name) customerName = orderMatch.Name;
                }
                if (!customerName) {
                    const row = document.querySelector(
                        `tr[data-psid="${psid}"] .customer-name span`
                    );
                    customerName = row?.textContent?.trim() || '';
                }
                if (!customerName) customerName = '(không rõ)';

                return `
                    <tr>
                        <td>${i + 1}</td>
                        <td title="${_escape(customerName)}">${_escape(customerName.slice(0, 30))}</td>
                        <td><code style="font-size:11px">${_escape(psid.slice(0, 16))}…</code></td>
                        <td><code style="font-size:11px">${_escape(pageId.slice(-8))}</code></td>
                        <td><strong style="color:#ef4444">${count}</strong></td>
                        <td title="${_escape(snippet)}">${_escape(snippet)}</td>
                        <td style="font-size:11px;color:#6b7280">${tsStr}</td>
                        <td>
                            <button class="pba-btn pba-btn-sm pba-btn-danger" data-clear-psid="${psid}">Xóa</button>
                        </td>
                    </tr>
                `;
            })
            .join('');
        tbody.innerHTML = html;
    }

    // -----------------------------------------------------------------
    // Refresh từ server (GET /pending-customers)
    // -----------------------------------------------------------------
    async function _refreshFromServer() {
        const modal = document.getElementById(MODAL_ID);
        const stat = modal?.querySelector('.pba-count-server');
        if (stat) stat.textContent = '...';
        try {
            const resp = await fetch(`${API_BASE}/pending-customers?limit=2000`, {
                cache: 'no-store',
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (stat) stat.textContent = data.count || 0;
            // Re-trigger setPendingCustomers để sync local state với server
            const pending = (data.customers || [])
                .filter((c) => c.type !== 'COMMENT')
                .map((c) => ({
                    psid: c.psid,
                    pageId: c.page_id,
                    inboxCount: c.message_count || 1,
                    snippet: c.last_message_snippet || '',
                    timestamp: c.last_message_time
                        ? new Date(c.last_message_time).getTime()
                        : Date.now(),
                }));
            // Group by psid
            const grouped = new Map();
            pending.forEach((p) => {
                const ex = grouped.get(p.psid);
                if (ex) {
                    ex.inboxCount += p.inboxCount;
                    if (p.timestamp > ex.timestamp) {
                        ex.snippet = p.snippet;
                        ex.timestamp = p.timestamp;
                    }
                } else grouped.set(p.psid, { ...p });
            });
            window.newMessagesNotifier?.setPendingCustomers?.([...grouped.values()]);
            _renderList();
        } catch (e) {
            console.error('[PBA] Refresh failed:', e);
            if (stat) stat.textContent = 'lỗi';
        }
    }

    // -----------------------------------------------------------------
    // Bulk actions
    // -----------------------------------------------------------------
    function _clearLocalConfirm() {
        const data = window.newMessagesNotifier?.getPendingCustomers?.() || [];
        _showConfirm(
            `Xóa ${data.length} pending badges trên máy này (local + localStorage)?`,
            () => {
                if (window.newMessagesNotifier?.clearAll) {
                    window.newMessagesNotifier.clearAll();
                    _renderList();
                }
            }
        );
    }

    function _wipeServerConfirm() {
        _showConfirm(
            '⚠ XÓA TOÀN BỘ pending_customers + realtime_updates trên server cho MỌI USER. Tiếp tục?',
            async () => {
                try {
                    let resp;
                    try {
                        resp = await fetch(`${API_BASE}/wipe-all`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                        });
                        if (!resp.ok) throw new Error('proxy failed');
                    } catch {
                        resp = await fetch(`${FALLBACK_BASE}/wipe-all`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }
                    const data = await resp.json();
                    if (data.success) {
                        _showStatus(
                            `✓ Đã xóa server: pending=${data.wiped?.pending_customers || 0}, updates=${data.wiped?.realtime_updates || 0}`,
                            'success'
                        );
                        if (window.newMessagesNotifier?.clearAll)
                            window.newMessagesNotifier.clearAll();
                        await _refreshFromServer();
                    } else {
                        _showStatus('Lỗi: ' + (data.error || 'unknown'), 'error');
                    }
                } catch (e) {
                    _showStatus('Wipe failed: ' + e.message, 'error');
                }
            }
        );
    }

    // -----------------------------------------------------------------
    // Inline status toast (thay alert()) — auto-dismiss 4s
    // -----------------------------------------------------------------
    function _showStatus(message, kind) {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        let bar = modal.querySelector('.pba-status');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'pba-status';
            modal.querySelector('.pba-content').appendChild(bar);
        }
        bar.textContent = message;
        bar.className = 'pba-status pba-status-' + (kind || 'info');
        bar.style.display = 'block';
        clearTimeout(bar._t);
        bar._t = setTimeout(() => (bar.style.display = 'none'), 4000);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------
    function _escape(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function open() {
        const modal = _buildModal();
        modal.classList.add('show');
        _renderList();
        _refreshFromServer();
    }

    function close() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.classList.remove('show');
    }

    // -----------------------------------------------------------------
    // CSS — inject 1 lần
    // -----------------------------------------------------------------
    if (!document.getElementById('pba-styles')) {
        const style = document.createElement('style');
        style.id = 'pba-styles';
        style.textContent = `
            .pba-modal { position: fixed; inset: 0; z-index: 99999; display: none; }
            .pba-modal.show { display: block; }
            .pba-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
            .pba-content {
                position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
                width: 90vw; max-width: 1100px; max-height: 90vh; background: #fff;
                border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.25);
                display: flex; flex-direction: column; overflow: hidden;
            }
            .pba-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff;
            }
            .pba-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
            .pba-close { background: none; border: 0; color: #fff; font-size: 24px; cursor: pointer; line-height: 1; padding: 4px 12px; border-radius: 6px; }
            .pba-close:hover { background: rgba(255,255,255,0.15); }
            .pba-toolbar { display: flex; gap: 8px; padding: 12px 20px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #e5e7eb; }
            .pba-search { flex: 1; min-width: 200px; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
            .pba-btn { padding: 6px 12px; border: 0; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
            .pba-btn:hover { opacity: 0.85; }
            .pba-btn-sm { padding: 4px 10px; font-size: 11px; }
            .pba-btn-secondary { background: #6b7280; color: #fff; }
            .pba-btn-danger { background: #ef4444; color: #fff; }
            .pba-stats { padding: 8px 20px; font-size: 12px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
            .pba-table-wrap { flex: 1; overflow: auto; padding: 0; }
            .pba-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .pba-table thead { position: sticky; top: 0; background: #f9fafb; z-index: 1; }
            .pba-table th { padding: 8px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
            .pba-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
            .pba-table tbody tr:hover { background: #f9fafb; }
            .pba-empty { padding: 40px; text-align: center; color: #6b7280; font-size: 14px; }
            .pba-confirm {
                display: flex; align-items: center; gap: 10px; padding: 10px 20px;
                background: #fef3c7; border-bottom: 2px solid #fbbf24;
                font-size: 13px; color: #78350f;
            }
            .pba-confirm-msg { flex: 1; font-weight: 500; }
            .pba-status {
                position: absolute; left: 50%; transform: translateX(-50%);
                bottom: 16px; padding: 10px 16px; border-radius: 8px;
                font-size: 13px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10;
            }
            .pba-status-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
            .pba-status-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
            .pba-status-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
        `;
        document.head.appendChild(style);
    }

    // -----------------------------------------------------------------
    // Listen postMessage from parent main.html admin panel
    // -----------------------------------------------------------------
    window.addEventListener('message', (e) => {
        if (e?.data?.type === 'OPEN_PENDING_BADGE_ADMIN') {
            open();
        }
    });

    // Expose API
    window.openPendingBadgeAdmin = open;
    window.closePendingBadgeAdmin = close;
})();
