// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * INBOX CUSTOMER LOOKUP MODULE
 * =====================================================
 * Standalone customer lookup modal — tra cứu khách hàng
 * không cần mở conversation.
 *
 * Search by: tên, SĐT, FB ID
 * Data sources: Pancake API + Render DB
 * =====================================================
 */

(function () {
    'use strict';

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // ===== Modal Management =====

    function openCustomerLookupModal() {
        const modal = document.getElementById('customerLookupModal');
        if (!modal) return;
        modal.style.display = 'flex';
        const input = document.getElementById('clm-search-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        document.getElementById('clm-results')?.replaceChildren();
        document.getElementById('clm-detail')?.replaceChildren();
        document.getElementById('clm-detail-panel').style.display = 'none';
        document.getElementById('clm-results-panel').style.display = 'block';
    }

    function closeCustomerLookupModal() {
        const modal = document.getElementById('customerLookupModal');
        if (modal) modal.style.display = 'none';
    }

    // ===== Search Logic =====

    let searchTimeout = null;

    async function doSearch(query) {
        if (!query || query.trim().length < 2) return;
        query = query.trim();

        const resultsEl = document.getElementById('clm-results');
        const statusEl = document.getElementById('clm-search-status');
        if (!resultsEl) return;

        statusEl.textContent = 'Đang tìm...';
        statusEl.style.display = 'block';
        resultsEl.replaceChildren();

        const results = [];

        // 1. Search Render DB first (fast)
        try {
            const isPhone = /^0\d{9,10}$/.test(query);
            const isFbId = /^\d{15,}$/.test(query);

            if (isPhone) {
                const resp = await fetch(`${WORKER_URL}/api/v2/customers/by-phone/${query}`);
                const data = await resp.json();
                if (data.success && data.data) {
                    results.push({ ...data.data, _source: 'db' });
                }
            } else if (isFbId) {
                const resp = await fetch(`${WORKER_URL}/api/v2/customers/by-fb-id/${query}`);
                const data = await resp.json();
                if (data.success && data.data) {
                    results.push({ ...data.data, _source: 'db' });
                }
            } else {
                // Search by name in DB
                const resp = await fetch(`${WORKER_URL}/api/v2/customers/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, limit: 10 }),
                });
                const data = await resp.json();
                if (data.success && data.data?.length) {
                    for (const c of data.data) {
                        results.push({ ...c, _source: 'db' });
                    }
                }
            }
        } catch (e) {
            console.warn('[CustomerLookup] DB search failed:', e.message);
        }

        // 2. Search Pancake API (for conversations)
        try {
            if (window.inboxApi) {
                const isFbId = /^\d{15,}$/.test(query);
                let pancakeResults;

                if (isFbId) {
                    pancakeResults = await window.inboxApi.searchByCustomerId(query);
                } else {
                    pancakeResults = await window.inboxApi.searchConversations(query);
                }

                if (pancakeResults?.conversations?.length) {
                    for (const conv of pancakeResults.conversations) {
                        const cust = conv.customers?.[0];
                        if (!cust) continue;
                        // Avoid duplicates (same fb_id already in DB results)
                        const isDupe = results.some(
                            (r) =>
                                r.fb_id === cust.fb_id ||
                                r.phone === conv.recent_phone_numbers?.[0]?.phone_number
                        );
                        if (!isDupe) {
                            results.push({
                                name: cust.name || conv.from?.name,
                                fb_id: cust.fb_id,
                                pancake_id: cust.id,
                                phone: conv.recent_phone_numbers?.[0]?.phone_number || '',
                                has_phone: conv.has_phone,
                                page_id: conv.page_id,
                                conv_id: conv.id,
                                conv_type: conv.type,
                                snippet: conv.snippet,
                                updated_at: conv.updated_at,
                                tags: conv.tags,
                                _source: 'pancake',
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CustomerLookup] Pancake search failed:', e.message);
        }

        // Render results
        statusEl.style.display = 'none';
        if (results.length === 0) {
            statusEl.textContent = 'Không tìm thấy khách hàng';
            statusEl.style.display = 'block';
            return;
        }

        statusEl.textContent = `${results.length} kết quả`;
        statusEl.style.display = 'block';

        for (const r of results) {
            const item = document.createElement('div');
            item.className = 'clm-result-item';
            item.onclick = () => showCustomerDetail(r);

            const sourceBadge =
                r._source === 'db'
                    ? '<span class="clm-badge clm-badge-db">DB</span>'
                    : '<span class="clm-badge clm-badge-pancake">Pancake</span>';

            const phone = r.phone
                ? `<span class="clm-result-phone">${escapeHtml(r.phone)}</span>`
                : '';
            const tags = (r.tags || [])
                .map(
                    (t) =>
                        `<span class="clm-tag" style="background:${t.color || '#666'}">${escapeHtml(t.text || '')}</span>`
                )
                .join('');

            item.innerHTML = `
                <div class="clm-result-main">
                    <div class="clm-result-name">${escapeHtml(r.name || 'N/A')} ${sourceBadge}</div>
                    <div class="clm-result-meta">${phone} ${tags}</div>
                </div>
                <div class="clm-result-arrow"><i data-lucide="chevron-right"></i></div>
            `;
            resultsEl.appendChild(item);
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Customer Detail View =====

    async function showCustomerDetail(customer) {
        const detailEl = document.getElementById('clm-detail');
        const detailPanel = document.getElementById('clm-detail-panel');
        const resultsPanel = document.getElementById('clm-results-panel');
        if (!detailEl) return;

        resultsPanel.style.display = 'none';
        detailPanel.style.display = 'block';

        detailEl.innerHTML = '<div class="clm-loading">Đang tải thông tin...</div>';

        let fullData = null;

        // Try to get full 360° data from Render DB
        try {
            const lookupKey = customer.phone || customer.fb_id || customer.id;
            if (lookupKey) {
                const resp = await fetch(`${WORKER_URL}/api/v2/customers/${lookupKey}`);
                const data = await resp.json();
                if (data.success && data.data) {
                    fullData = data.data;
                }
            }
        } catch (e) {
            console.warn('[CustomerLookup] DB detail fetch failed:', e.message);
        }

        // If from Pancake and no DB record, try to load messages for richer data
        let pancakeData = null;
        if (customer._source === 'pancake' && customer.conv_id && window.inboxApi) {
            try {
                const pageId = customer.page_id;
                const convId = customer.conv_id;
                const custId = customer.pancake_id;
                pancakeData = await window.inboxApi.fetchMessages(pageId, convId, custId);
            } catch (e) {
                console.warn('[CustomerLookup] Pancake messages fetch failed:', e.message);
            }
        }

        renderDetailView(detailEl, customer, fullData, pancakeData);
    }

    function renderDetailView(container, customer, dbData, pancakeData) {
        const c = dbData?.customer || customer;
        const wallet = dbData?.wallet;
        const notes = dbData?.notes || [];
        const pancakeNotes = c.pancake_notes || [];
        const activities = dbData?.recentActivities || [];
        const walletTx = dbData?.recentWalletTransactions || [];

        // Pancake enrichment
        const pcust = pancakeData?.customers?.[0];
        const phone =
            c.phone || customer.phone || pcust?.recent_phone_numbers?.[0]?.phone_number || '';
        const name = c.name || customer.name || pcust?.name || 'N/A';
        const fbId = c.fb_id || customer.fb_id || pcust?.fb_id || '';
        const globalId = c.global_id || pancakeData?.global_id || '';
        const gender = c.gender || pcust?.personal_info?.gender || '';
        const birthday = c.birthday || pcust?.personal_info?.birthday || '';
        const livesIn = c.lives_in || pcust?.personal_info?.lives_in || '';
        const canInbox = c.can_inbox !== false;
        const isBanned = pancakeData?.is_banned || false;
        const orderOk = c.order_success_count || 0;
        const orderFail = c.order_fail_count || 0;
        const totalOrders = orderOk + orderFail;
        const returnRate = totalOrders > 0 ? Math.round((orderFail / totalOrders) * 100) : 0;

        const rows = [];

        // Info rows
        if (phone) rows.push(infoRow('phone', 'SĐT', phone, true));
        if (fbId) rows.push(infoRow('fingerprint', 'FB ID', fbId, true, 'ci-mono'));
        if (globalId) rows.push(infoRow('globe', 'Global ID', globalId, true, 'ci-mono'));
        if (gender) rows.push(infoRow('user', 'Giới tính', gender));
        if (birthday) rows.push(infoRow('cake', 'Sinh nhật', birthday));
        if (livesIn) rows.push(infoRow('map-pin', 'Nơi sống', livesIn));

        // Order stats
        rows.push(`<div class="ci-row">
            <span class="ci-label"><i data-lucide="package" class="ci-icon"></i>Đơn hàng</span>
            <span class="ci-value">
                <span class="ci-stat ci-stat-success">${orderOk} OK</span>
                <span class="ci-stat ci-stat-fail">${orderFail} hoàn</span>
                ${returnRate > 30 ? `<span class="ci-stat ci-stat-warn">${returnRate}%</span>` : ''}
            </span>
        </div>`);

        // Wallet
        if (wallet) {
            const total = (wallet.balance || 0) + (wallet.virtualBalance || 0);
            rows.push(`<div class="ci-row">
                <span class="ci-label"><i data-lucide="wallet" class="ci-icon"></i>Ví</span>
                <span class="ci-value">${formatMoney(total)}</span>
            </div>`);
        }

        // Status & tier
        if (c.status && c.status !== 'Bình thường') {
            const statusClass =
                c.status === 'Bom hàng' || c.status === 'Nguy hiểm' ? 'ci-text-danger' : '';
            rows.push(`<div class="ci-row${statusClass ? ' ci-row-warn' : ''}">
                <span class="ci-label"><i data-lucide="shield-alert" class="ci-icon"></i>Trạng thái</span>
                <span class="ci-value ${statusClass}">${escapeHtml(c.status)}</span>
            </div>`);
        }

        if (!canInbox) {
            rows.push(`<div class="ci-row ci-row-warn">
                <span class="ci-label"><i data-lucide="message-circle-off" class="ci-icon"></i>Inbox</span>
                <span class="ci-value ci-text-danger">Không thể gửi tin nhắn</span>
            </div>`);
        }

        if (isBanned) {
            rows.push(`<div class="ci-row ci-row-warn">
                <span class="ci-label"><i data-lucide="ban" class="ci-icon"></i>Trạng thái</span>
                <span class="ci-value ci-text-danger">Đã bị chặn</span>
            </div>`);
        }

        // Notes section
        const allNotes = [
            ...notes,
            ...pancakeNotes.map((n) => ({
                content: n.message || n.content || JSON.stringify(n),
                created_by: n.created_by?.fb_name || 'Pancake',
                created_at: n.created_at
                    ? new Date(
                          typeof n.created_at === 'number' ? n.created_at : n.created_at
                      ).toLocaleString('vi-VN')
                    : '',
                _source: 'pancake',
            })),
        ];

        let notesHtml = '';
        if (allNotes.length > 0) {
            notesHtml = `<div class="clm-section">
                <div class="clm-section-title"><i data-lucide="sticky-note"></i> Ghi chú (${allNotes.length})</div>
                ${allNotes
                    .map(
                        (n) => `
                    <div class="clm-note ${n._source === 'pancake' ? 'clm-note-pancake' : ''}">
                        <div class="clm-note-content">${escapeHtml(typeof n.content === 'string' ? n.content : JSON.stringify(n.content))}</div>
                        <div class="clm-note-meta">${escapeHtml(n.created_by || '')} ${n.created_at ? '· ' + n.created_at : ''}</div>
                    </div>
                `
                    )
                    .join('')}
            </div>`;
        }

        // Activities section
        let activitiesHtml = '';
        if (activities.length > 0) {
            activitiesHtml = `<div class="clm-section">
                <div class="clm-section-title"><i data-lucide="activity"></i> Hoạt động gần đây</div>
                ${activities
                    .slice(0, 10)
                    .map(
                        (a) => `
                    <div class="clm-activity">
                        <div class="clm-activity-title">${escapeHtml(a.title || '')}</div>
                        <div class="clm-activity-meta">${a.created_by || ''} · ${a.created_at ? new Date(a.created_at).toLocaleString('vi-VN') : ''}</div>
                    </div>
                `
                    )
                    .join('')}
            </div>`;
        }

        // Add note form
        const addNoteHtml = phone
            ? `<div class="clm-section">
            <div class="clm-section-title"><i data-lucide="plus-circle"></i> Thêm ghi chú</div>
            <div class="clm-add-note">
                <input type="text" id="clm-note-input" class="clm-note-input" placeholder="Nhập ghi chú..." />
                <button class="clm-btn-add-note" onclick="window._clmAddNote('${escapeHtml(phone)}')">
                    <i data-lucide="send"></i>
                </button>
            </div>
        </div>`
            : '';

        container.innerHTML = `
            <div class="ci-header">
                <div class="ci-name">${escapeHtml(name)}</div>
                ${c.tier ? `<div class="ci-type">${escapeHtml(c.tier)}</div>` : ''}
            </div>
            <div class="ci-body">${rows.join('')}</div>
            ${notesHtml}
            ${addNoteHtml}
            ${activitiesHtml}
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Add Note =====

    window._clmAddNote = async function (phone) {
        const input = document.getElementById('clm-note-input');
        if (!input || !input.value.trim()) return;

        const content = input.value.trim();
        input.value = '';

        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${phone}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, created_by: 'inbox-lookup' }),
            });
            const data = await resp.json();
            if (data.success) {
                showToast?.('Đã thêm ghi chú', 'success');
            }
        } catch (e) {
            showToast?.('Lỗi thêm ghi chú', 'error');
        }
    };

    // ===== Helpers =====

    function infoRow(icon, label, value, copyable = false, extraClass = '') {
        const copyAttr = copyable
            ? `onclick="navigator.clipboard.writeText('${escapeHtml(value)}');showToast?.('Đã copy','success')" title="Click copy"`
            : '';
        const copyClass = copyable ? 'ci-copyable' : '';
        return `<div class="ci-row">
            <span class="ci-label"><i data-lucide="${icon}" class="ci-icon"></i>${escapeHtml(label)}</span>
            <span class="ci-value ${copyClass} ${extraClass}" ${copyAttr}>${escapeHtml(value)}</span>
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

    function showBackToResults() {
        document.getElementById('clm-results-panel').style.display = 'block';
        document.getElementById('clm-detail-panel').style.display = 'none';
    }

    // ===== Event Binding =====

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('clm-search-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(searchTimeout);
                    doSearch(input.value);
                }
            });
            input.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => doSearch(input.value), 800);
            });
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCustomerLookupModal();
    });

    // Expose
    window.openCustomerLookupModal = openCustomerLookupModal;
    window.closeCustomerLookupModal = closeCustomerLookupModal;
    window._clmBackToResults = showBackToResults;
})();
