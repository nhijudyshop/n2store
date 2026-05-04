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

        // Nickname (biệt danh) + Do-not-call toggle — persist localStorage +
        // Firebase RTDB (sync đa máy). Stored per-phone, không touch Pancake/TPOS.
        const phone = c.phone || '';
        const currentNick = window.CustomerPrefs?.getNickname?.(phone) || '';
        const dnc = !!window.CustomerPrefs?.isDoNotCall?.(phone);
        const safePhone = escapeHtml(phone);
        const prefsHtml = phone
            ? `<div class="cip-prefs-section">
                <div class="cip-pref-row">
                    <label class="cip-pref-label"><i class="fas fa-id-badge"></i> Biệt danh</label>
                    <div class="cip-pref-control">
                        <input type="text" id="cip-nickname-input" placeholder="Đặt biệt danh cho khách..." value="${escapeHtml(currentNick)}" />
                        <button class="cip-pref-save" onclick="window._cipSaveNickname('${safePhone}')" title="Lưu biệt danh"><i class="fas fa-check"></i></button>
                    </div>
                </div>
                <div class="cip-pref-row cip-pref-toggle-row ${dnc ? 'cip-pref-active-danger' : ''}">
                    <label class="cip-pref-label"><i class="fas fa-phone-slash"></i> Không gọi</label>
                    <label class="cip-pref-toggle">
                        <input type="checkbox" id="cip-dnc-toggle" ${dnc ? 'checked' : ''} onchange="window._cipToggleDoNotCall('${safePhone}', this.checked)" />
                        <span class="cip-pref-slider"></span>
                    </label>
                </div>
                ${dnc ? '<div class="cip-pref-hint cip-text-danger"><i class="fas fa-exclamation-circle"></i> Số này đã bật chặn gọi — nút gọi sẽ disable</div>' : ''}
            </div>`
            : '';

        container.innerHTML = `
            <div class="cip-info">${rows.join('')}</div>
            ${prefsHtml}
            ${notesHtml}
            ${addNoteHtml}
        `;
    }

    // ===== Save nickname / toggle do-not-call =====

    window._cipSaveNickname = async function (phone) {
        const input = document.getElementById('cip-nickname-input');
        if (!input || !window.CustomerPrefs) return;
        const saveBtn = document.querySelector('.cip-pref-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        const newNick = input.value.trim();
        window.CustomerPrefs.setNickname(phone, newNick);

        // Sync TPOS: build name = "<originalName> - <nickname>" và PUT cho mọi
        // SaleOnline_Order match phone trong allData. Idempotent: strip suffix
        // " - X" nếu đã có để tránh double-append (Original-X-Y).
        // SAFETY: skip nếu window.__tpos_nickname_dryrun = true (để test không
        // động vào prod data — set trong console để verify flow).
        let tposResult = { ok: 0, fail: 0, dryRun: false };
        if (window.__tpos_nickname_dryrun) {
            tposResult.dryRun = true;
            console.log(
                '[CustomerInfo] DRYRUN — không PUT TPOS. Phone:',
                phone,
                'nickname:',
                newNick
            );
        } else {
            try {
                tposResult = await _syncNicknameToTPOS(phone, newNick);
            } catch (e) {
                console.warn('[CustomerInfo] TPOS sync failed (non-blocking):', e?.message);
            }
        }

        if (window.notificationManager?.success) {
            let tposMsg = '';
            if (tposResult.dryRun) tposMsg = ' · [DRYRUN]';
            else if (tposResult.ok)
                tposMsg = ` · Đồng bộ TPOS: ${tposResult.ok} đơn${tposResult.fail ? ` (${tposResult.fail} fail)` : ''}`;
            window.notificationManager.success(
                (newNick ? `Đã đặt biệt danh: ${newNick}` : 'Đã xóa biệt danh') + tposMsg,
                3000
            );
        }
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-check"></i>';
        }
        // Re-render row name in table (surgical)
        _refreshCustomerNameInTable(phone, newNick);
    };

    /**
     * Strip nickname suffix khỏi tên (idempotent). Match pattern " - <nick>"
     * tail khi nick = nickname hiện tại HOẶC bất kỳ suffix sau " - " cuối.
     * Trả về tên gốc.
     */
    function _stripNicknameSuffix(fullName) {
        if (!fullName) return '';
        // Strip trailing " - X" (X is anything to end of string)
        return (
            String(fullName)
                .replace(/\s*-\s*[^-]+$/, '')
                .trim() || fullName
        );
    }

    /**
     * Tìm tất cả orders match phone trong allData → PUT SaleOnline_Order với
     * Name field mới = "<original> - <nickname>" (hoặc "<original>" khi nick rỗng).
     */
    async function _syncNicknameToTPOS(phone, nickname) {
        const norm = window.CustomerPrefs?._normalizePhone?.(phone);
        if (!norm) return { ok: 0, fail: 0 };
        const allData = (typeof window.allData !== 'undefined' && window.allData) || [];
        const orders = allData.filter(
            (o) => window.CustomerPrefs._normalizePhone(o.Telephone) === norm
        );
        if (orders.length === 0) return { ok: 0, fail: 0 };
        if (!window.tokenManager?.getAuthHeader || !window.API_CONFIG?.smartFetch) {
            return { ok: 0, fail: 0 };
        }

        const headers = await window.tokenManager.getAuthHeader();
        const TPOS_ODATA = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
        let ok = 0;
        let fail = 0;

        // Concurrency cap 3 để tránh flood
        const queue = [...orders];
        const workers = [];
        for (let i = 0; i < Math.min(3, queue.length); i++) {
            workers.push(
                (async () => {
                    while (queue.length > 0) {
                        const order = queue.shift();
                        try {
                            // Fetch full order
                            const res = await window.API_CONFIG.smartFetch(
                                `${TPOS_ODATA}/SaleOnline_Order(${order.Id})?$expand=Details,Partner,User,CRMTeam`,
                                {
                                    headers: {
                                        ...headers,
                                        'Content-Type': 'application/json',
                                        Accept: 'application/json',
                                    },
                                }
                            );
                            if (!res.ok) throw new Error(`fetch ${res.status}`);
                            const fullOrder = await res.json();

                            // Build new name idempotent
                            const original = _stripNicknameSuffix(fullOrder.Name || '');
                            const newName = nickname ? `${original} - ${nickname}` : original;
                            if (newName === fullOrder.Name) {
                                ok++; // Skip — already correct
                                continue;
                            }

                            // Snapshot vào OrderEditHistory (cho restore)
                            if (window.OrderEditHistory) {
                                window.OrderEditHistory.captureSnapshot(
                                    fullOrder.Id,
                                    fullOrder.Code,
                                    fullOrder.Details || []
                                );
                                window.OrderEditHistory.logChange(fullOrder.Id, 'name', {
                                    orderCode: fullOrder.Code,
                                    oldName: fullOrder.Name || '',
                                    newName,
                                    nickname: nickname || '',
                                    source: 'customer_info_popup',
                                });
                            }

                            // Build payload
                            let payload;
                            if (typeof window.prepareOrderPayload === 'function') {
                                const mock = { ...fullOrder, Name: newName };
                                const prev = window.currentEditOrderData;
                                try {
                                    window.currentEditOrderData = mock;
                                    payload = window.prepareOrderPayload(mock);
                                } finally {
                                    window.currentEditOrderData = prev;
                                }
                            } else {
                                payload = { ...fullOrder, Name: newName };
                            }

                            const putRes = await window.API_CONFIG.smartFetch(
                                `${TPOS_ODATA}/SaleOnline_Order(${order.Id})`,
                                {
                                    method: 'PUT',
                                    headers: {
                                        ...headers,
                                        'Content-Type': 'application/json',
                                        Accept: 'application/json',
                                    },
                                    body: JSON.stringify(payload),
                                }
                            );
                            if (!putRes.ok) throw new Error(`put ${putRes.status}`);

                            // Update local
                            if (window.OrderStore?.update) {
                                window.OrderStore.update(order.Id, { Name: newName });
                            }
                            if (typeof window.invalidateEditOrderCache === 'function') {
                                window.invalidateEditOrderCache(order.Id);
                            }
                            // Update allData entry directly
                            order.Name = newName;
                            ok++;
                        } catch (e) {
                            console.warn(
                                `[CustomerInfo] PUT TPOS failed for order ${order.Code || order.Id}:`,
                                e?.message
                            );
                            fail++;
                        }
                    }
                })()
            );
        }
        await Promise.all(workers);
        return { ok, fail };
    }

    window._cipToggleDoNotCall = function (phone, checked) {
        if (!window.CustomerPrefs) return;
        window.CustomerPrefs.setDoNotCall(phone, checked);
        if (window.notificationManager?.success) {
            window.notificationManager.success(
                checked ? '🚫 Đã bật chặn gọi' : '☎ Đã tắt chặn gọi',
                2000
            );
        }
        // Re-render call buttons trong bảng cho phone này
        _refreshCallButtonsInTable(phone);
        // Re-render popup hint
        const popup = document.getElementById('customerInfoPopup');
        const row = popup?.querySelector('.cip-pref-toggle-row');
        if (row) row.classList.toggle('cip-pref-active-danger', checked);
        const hint = popup?.querySelector('.cip-pref-hint');
        if (checked && !hint) {
            row?.insertAdjacentHTML(
                'afterend',
                '<div class="cip-pref-hint cip-text-danger"><i class="fas fa-exclamation-circle"></i> Số này đã bật chặn gọi — nút gọi sẽ disable</div>'
            );
        } else if (!checked && hint) {
            hint.remove();
        }
    };

    // ===== Helpers to re-render table rows when prefs change =====

    function _refreshCustomerNameInTable(phone, newNick) {
        // Tìm rows có Telephone match phone → update span tên (giữ wallet badge)
        const norm = window.CustomerPrefs?._normalizePhone?.(phone);
        if (!norm) return;
        const allData = (typeof window.allData !== 'undefined' && window.allData) || [];
        const orderIds = allData
            .filter((o) => window.CustomerPrefs._normalizePhone(o.Telephone) === norm)
            .map((o) => o.Id);
        for (const orderId of orderIds) {
            const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
            if (!row) continue;
            const nameSpan = row.querySelector('.customer-name > span:first-of-type');
            if (!nameSpan) continue;
            const order = allData.find((o) => o.Id === orderId);
            const display = newNick || order?.Name || '';
            // Preserve highlight wrapper nếu có search
            if (typeof window.highlight === 'function') {
                nameSpan.innerHTML = window.highlight(display);
            } else {
                nameSpan.textContent = display;
            }
        }
    }

    function _refreshCallButtonsInTable(phone) {
        const norm = window.CustomerPrefs?._normalizePhone?.(phone);
        if (!norm) return;
        const dnc = window.CustomerPrefs.isDoNotCall(phone);
        document.querySelectorAll('.call-phone-btn').forEach((btn) => {
            const onclick = btn.getAttribute('onclick') || '';
            const m = onclick.match(/initiateCall\('([^']+)'/);
            if (!m) return;
            const btnPhone = window.CustomerPrefs._normalizePhone(m[1]);
            if (btnPhone !== norm) return;
            btn.classList.toggle('do-not-call', dnc);
            btn.title = dnc ? 'Số này đã bật chặn gọi' : 'Gọi điện';
        });
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
