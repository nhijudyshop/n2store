// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TAB1 CUSTOMER INFO — Pancake Integration
 * =====================================================
 * Shows customer profile popup when clicking customer name
 * in the orders table. Fetches from Render DB (Customer 360°).
 *
 * Data: phone, FB ID, global ID, gender, birthday, notes,
 *       order stats, wallet, can_inbox, pancake_notes
 * =====================================================
 */

(function () {
    'use strict';

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const cache = new Map(); // phone → { data, ts }
    const CACHE_TTL = 5 * 60 * 1000; // 5 min

    // ===== Open Customer Info Popup =====

    async function openCustomerInfoPopup(phone, name, anchorEl) {
        if (!phone) return;

        // Remove any existing popup
        closeCustomerInfoPopup();

        const popup = document.createElement('div');
        popup.id = 'customerInfoPopup';
        popup.className = 'cip-popup';

        // Position near the anchor element
        const rect = anchorEl?.getBoundingClientRect();
        if (rect) {
            popup.style.position = 'fixed';
            popup.style.top = Math.min(rect.bottom + 4, window.innerHeight - 420) + 'px';
            popup.style.left = Math.min(rect.left, window.innerWidth - 380) + 'px';
        }

        popup.innerHTML = `
            <div class="cip-header">
                <span class="cip-title">${escapeHtml(name || phone)}</span>
                <button class="cip-close" onclick="closeCustomerInfoPopup()">&times;</button>
            </div>
            <div class="cip-body"><div class="cip-loading">Đang tải...</div></div>
        `;

        document.body.appendChild(popup);

        // Fetch data
        const data = await fetchCustomerData(phone);
        const body = popup.querySelector('.cip-body');
        if (!body) return;

        if (!data) {
            body.innerHTML = '<div class="cip-loading">Không tìm thấy dữ liệu</div>';
            return;
        }

        renderPopupContent(body, data);
    }

    async function fetchCustomerData(phone) {
        // Check cache
        const cached = cache.get(phone);
        if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${phone}`);
            const json = await resp.json();
            if (json.success && json.data) {
                cache.set(phone, { data: json.data, ts: Date.now() });
                return json.data;
            }
        } catch (e) {
            console.warn('[CustomerInfo] Fetch failed:', e.message);
        }
        return null;
    }

    function renderPopupContent(container, data) {
        const c = data.customer || {};
        const wallet = data.wallet || {};
        const notes = data.notes || [];
        const pancakeNotes = c.pancake_notes || [];

        const rows = [];

        // Phone
        if (c.phone) {
            rows.push(row('fa-phone', 'SĐT', c.phone, true));
        }

        // FB ID
        if (c.fb_id) {
            rows.push(row('fa-fingerprint', 'FB ID', c.fb_id, true, 'cip-mono'));
        }

        // Global ID
        if (c.global_id) {
            rows.push(row('fa-globe', 'Global ID', c.global_id, true, 'cip-mono'));
        }

        // Gender, Birthday, Lives in
        if (c.gender) rows.push(row('fa-user', 'Giới tính', c.gender));
        if (c.birthday) rows.push(row('fa-cake-candles', 'Sinh nhật', c.birthday));
        if (c.lives_in) rows.push(row('fa-location-dot', 'Nơi sống', c.lives_in));

        // Order stats
        const ok = c.order_success_count || c.successful_orders || 0;
        const fail = c.order_fail_count || c.returned_orders || 0;
        const total = ok + fail;
        const rate = total > 0 ? Math.round((fail / total) * 100) : 0;
        rows.push(`<div class="cip-row">
            <span class="cip-label"><i class="fas fa-box"></i> Đơn hàng</span>
            <span class="cip-value">
                <span class="cip-badge cip-badge-ok">${ok} OK</span>
                <span class="cip-badge cip-badge-fail">${fail} hoàn</span>
                ${rate > 30 ? `<span class="cip-badge cip-badge-warn">${rate}%</span>` : ''}
            </span>
        </div>`);

        // Wallet
        const walletTotal = (wallet.balance || 0) + (wallet.virtualBalance || 0);
        if (walletTotal > 0) {
            rows.push(row('fa-wallet', 'Ví', formatMoney(walletTotal)));
        }

        // Status
        if (c.status && c.status !== 'Bình thường') {
            const isDanger = c.status === 'Bom hàng' || c.status === 'Nguy hiểm';
            rows.push(`<div class="cip-row ${isDanger ? 'cip-row-danger' : ''}">
                <span class="cip-label"><i class="fas fa-shield-halved"></i> Trạng thái</span>
                <span class="cip-value ${isDanger ? 'cip-text-danger' : ''}">${escapeHtml(c.status)}</span>
            </div>`);
        }

        // Can inbox
        if (c.can_inbox === false) {
            rows.push(`<div class="cip-row cip-row-danger">
                <span class="cip-label"><i class="fas fa-comment-slash"></i> Inbox</span>
                <span class="cip-value cip-text-danger">Không thể gửi tin nhắn</span>
            </div>`);
        }

        // Tier
        if (c.tier && c.tier !== 'normal') {
            rows.push(row('fa-crown', 'Hạng', c.tier.toUpperCase()));
        }

        // Pancake synced
        if (c.pancake_synced_at) {
            const synced = new Date(c.pancake_synced_at).toLocaleString('vi-VN');
            rows.push(row('fa-sync', 'Đồng bộ', synced));
        }

        // Notes
        const allNotes = [
            ...notes.map((n) => ({
                text: n.content,
                by: n.created_by,
                at: n.created_at,
                source: 'db',
            })),
            ...pancakeNotes.map((n) => ({
                text: n.message || n.content || JSON.stringify(n),
                by: n.created_by?.fb_name || 'Pancake',
                at: n.created_at
                    ? new Date(
                          typeof n.created_at === 'number' ? n.created_at : n.created_at
                      ).toLocaleString('vi-VN')
                    : '',
                source: 'pancake',
            })),
        ];

        let notesHtml = '';
        if (allNotes.length > 0) {
            notesHtml = `<div class="cip-notes-section">
                <div class="cip-notes-title"><i class="fas fa-sticky-note"></i> Ghi chú (${allNotes.length})</div>
                ${allNotes
                    .slice(0, 5)
                    .map(
                        (n) => `
                    <div class="cip-note ${n.source === 'pancake' ? 'cip-note-pancake' : ''}">
                        <div class="cip-note-text">${escapeHtml(typeof n.text === 'string' ? n.text : '')}</div>
                        <div class="cip-note-meta">${escapeHtml(n.by || '')} ${n.at ? '· ' + n.at : ''}</div>
                    </div>
                `
                    )
                    .join('')}
                ${allNotes.length > 5 ? `<div class="cip-note-more">+${allNotes.length - 5} ghi chú khác</div>` : ''}
            </div>`;
        }

        // Add note input
        const addNoteHtml = c.phone
            ? `<div class="cip-add-note">
            <input type="text" id="cip-note-input" placeholder="Thêm ghi chú..." />
            <button onclick="window._cipAddNote('${escapeHtml(c.phone)}')"><i class="fas fa-paper-plane"></i></button>
        </div>`
            : '';

        container.innerHTML = `
            <div class="cip-info">${rows.join('')}</div>
            ${notesHtml}
            ${addNoteHtml}
        `;
    }

    // ===== Add Note =====

    window._cipAddNote = async function (phone) {
        const input = document.getElementById('cip-note-input');
        if (!input || !input.value.trim()) return;

        const content = input.value.trim();
        input.value = '';

        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${phone}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, created_by: 'orders-report' }),
            });
            const data = await resp.json();
            if (data.success) {
                cache.delete(phone); // Invalidate cache
                showNotification?.('Đã thêm ghi chú', 'success');
            }
        } catch (e) {
            showNotification?.('Lỗi thêm ghi chú', 'error');
        }
    };

    // ===== Close Popup =====

    function closeCustomerInfoPopup() {
        const existing = document.getElementById('customerInfoPopup');
        if (existing) existing.remove();
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('customerInfoPopup');
        if (popup && !popup.contains(e.target) && !e.target.closest('.customer-name')) {
            closeCustomerInfoPopup();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCustomerInfoPopup();
    });

    // ===== Helpers =====

    function row(icon, label, value, copyable = false, extraClass = '') {
        const copyAttr = copyable
            ? ` onclick="navigator.clipboard.writeText('${escapeHtml(value)}');showNotification?.('Đã copy','success');event.stopPropagation()" title="Click copy" style="cursor:pointer"`
            : '';
        return `<div class="cip-row">
            <span class="cip-label"><i class="fas ${icon}"></i> ${escapeHtml(label)}</span>
            <span class="cip-value ${extraClass}"${copyAttr}>${escapeHtml(value)}</span>
        </div>`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMoney(n) {
        return new Intl.NumberFormat('vi-VN').format(n) + '₫';
    }

    // ===== Expose =====

    window.openCustomerInfoPopup = openCustomerInfoPopup;
    window.closeCustomerInfoPopup = closeCustomerInfoPopup;
})();
