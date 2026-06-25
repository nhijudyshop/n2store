// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-render — render stats / chips / table (rows) / pagination.
// Đọc state + dom + utils từ window.W2BH. Event handlers gọi
// W2BH.* (load / openLinkPrompt / autoMatchSingle / openReassignModal /
// openChatForPhone) — resolve tại call-time, không phụ thuộc load order.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { STATUS_FILTERS, state, dom, fmtVnd, fmtTime, escapeHtml, notify } = W2BH;

    // ----- Render -----
    function renderStats() {
        const s = state.stats || {};
        if (dom.statTotal) dom.statTotal.textContent = fmtVnd(s.total);
        if (dom.statAuto) dom.statAuto.textContent = fmtVnd(s.auto_approved);
        if (dom.statPending) dom.statPending.textContent = fmtVnd(s.pending_match);
        if (dom.statNoPhone) dom.statNoPhone.textContent = fmtVnd(s.no_phone);
        if (dom.statSumIn) dom.statSumIn.textContent = fmtVnd(s.total_in) + '₫';
    }

    function renderChips() {
        dom.chips.innerHTML = STATUS_FILTERS.map(
            (f) =>
                `<button type="button" class="w2bh-chip ${f.cls || ''} ${f.key === state.status ? 'is-active' : ''}" data-status="${f.key}">${f.label}</button>`
        ).join('');
        dom.chips.querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', () => {
                state.status = b.getAttribute('data-status');
                state.page = 1;
                W2BH.load();
            });
        });
    }

    function renderTable() {
        if (state.loading) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.rows(dom.tbody, { rows: 8, cols: 5 });
            } else {
                dom.tbody.innerHTML = `<tr><td colspan="5" class="w2bh-loading">Đang tải…</td></tr>`;
            }
            return;
        }
        if (!state.rows.length) {
            dom.tbody.innerHTML = `<tr><td colspan="5"><div class="w2bh-empty-state"><i data-lucide="search-x"></i><p>Không có giao dịch phù hợp</p><small>Thử mở rộng khoảng ngày hoặc xoá bộ lọc đang áp dụng.</small></div></td></tr>`;
            if (window.lucide) window.lucide.createIcons({ nodes: [dom.tbody] });
            return;
        }
        dom.tbody.innerHTML = state.rows.map(renderRow).join('');
        // Click tên KH → modal chi tiết (kho KH dùng chung)
        dom.tbody.querySelectorAll('[data-action="customer-detail"]').forEach((el) => {
            el.addEventListener('click', () => {
                if (window.Web2CustomerDetailModal?.open) {
                    window.Web2CustomerDetailModal.open(
                        el.getAttribute('data-phone'),
                        el.getAttribute('data-name')
                    );
                }
            });
        });
        dom.tbody.querySelectorAll('[data-action="link"]').forEach((btn) => {
            btn.addEventListener('click', () => W2BH.openLinkPrompt(btn.getAttribute('data-id')));
        });
        dom.tbody.querySelectorAll('[data-action="auto-match"]').forEach((btn) => {
            btn.addEventListener('click', () => W2BH.autoMatchSingle(btn.getAttribute('data-id')));
        });
        dom.tbody.querySelectorAll('[data-action="reassign"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                W2BH.openReassignModal(
                    btn.getAttribute('data-id'),
                    btn.getAttribute('data-old-phone'),
                    Number(btn.getAttribute('data-amount')) || 0
                )
            );
        });
        dom.tbody.querySelectorAll('[data-action="chat"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                W2BH.openChatForPhone(btn.getAttribute('data-phone'), btn.getAttribute('data-name'))
            );
        });
        // Lịch sử thao tác per-record (Web2AuditLog, auto-load qua sidebar).
        dom.tbody.querySelectorAll('[data-action="history"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                window.Web2AuditLog?.openRecord?.({
                    entity: 'balance-transaction',
                    entityId: id,
                    title: 'Lịch sử giao dịch: ' + id,
                });
            });
        });
        // Row trùng SĐT (pending_match) → mở modal chọn KH, lọc đúng giao dịch này.
        dom.tbody.querySelectorAll('[data-action="dup-phone"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const seed = btn.getAttribute('data-sepay') || '';
                if (window.Web2PendingMatch?.openModal) window.Web2PendingMatch.openModal(seed);
                else notify('Module trùng SĐT chưa load', 'warning');
            });
        });
        // Số dư ví KH cho các row có SĐT (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(dom.tbody);
    }

    function _extractUserFromRow(r) {
        // Prefer verified_by (new column for manual_link/resolve/reassign).
        // Fallback: parse raw_data JSONB cho manual_deposit/withdraw (userName).
        if (r.verified_by) return String(r.verified_by);
        const raw = r.raw_data || r.body;
        if (raw && typeof raw === 'object') {
            if (raw.userName) return String(raw.userName);
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.userName) return String(parsed.userName);
            } catch {}
        }
        return null;
    }

    function renderRow(r) {
        const amount = Number(r.transfer_amount) || 0;
        const isIn = r.transfer_type === 'in';
        const cls = isIn ? 'in' : 'out';
        const sign = isIn ? '+' : '-';
        const phone = r.linked_customer_phone || '';
        const name = r.display_name || '';
        const method = r.match_method || '';
        const isManual = method === 'manual_deposit' || method === 'manual_withdraw';
        const isManualByUser =
            method === 'manual_deposit' ||
            method === 'manual_withdraw' ||
            method === 'manual_link' ||
            method === 'manual_resolve' ||
            method === 'manual_reassign';
        const assignedBy = _extractUserFromRow(r);
        const ACTION_LABELS = {
            manual_deposit: 'Nạp tay',
            manual_withdraw: 'Rút tay',
            manual_link: 'Gán KH',
            manual_resolve: 'Chọn KH (multi)',
            manual_reassign: 'Đổi KH',
        };
        const actionLabel = ACTION_LABELS[method] || '';
        const verifiedAtText = r.verified_at ? fmtTime(r.verified_at) : '';
        const userBadge =
            isManualByUser && assignedBy
                ? `<span class="w2bh-user-badge" title="${escapeHtml(actionLabel)}${verifiedAtText ? ' lúc ' + verifiedAtText : ''}">
                       <i data-lucide="user-check" style="width:10px;height:10px"></i>
                       ${actionLabel ? `<b class="w2bh-user-action">${escapeHtml(actionLabel)}</b>` : ''}
                       ${escapeHtml(assignedBy)}
                   </span>`
                : isManualByUser
                  ? `<span class="w2bh-user-badge w2bh-user-badge-unknown" title="${escapeHtml(actionLabel)} — không xác định user">
                       <i data-lucide="user" style="width:10px;height:10px"></i>
                       ${actionLabel ? `<b class="w2bh-user-action">${escapeHtml(actionLabel)}</b>` : ''}
                       (—)
                   </span>`
                  : '';
        // Manual NCC: có display_name nhưng KHÔNG có phone (Firestore-based).
        //   Không show "+ Gán KH" / "Không có thông tin" như rows webhook unmatched.
        const isManualNcc = isManual && !phone && name;
        // Badge logic — Web 2.0 = 100% tự động. Chỉ 3 trạng thái:
        //   AUTO_APPROVED hoặc debt_added=true → "Tự động" (xanh, đã cộng ví)
        //   pending_match / pending_low_confidence → "Chờ chọn" (vàng, multi-match cần user)
        //   chưa xử lý → "Đang xử lý…" (xám, auto-reprocess sẽ chạy)
        //   no phone + đã reprocess không ra → "Chưa gán" (đỏ, cần user gán hoặc bỏ qua)
        const verifBadge = (() => {
            if (method === 'pending_match') {
                // Nút "Trùng SĐT" trong ô KH đã thể hiện trạng thái → bỏ pill.
                return '';
            }
            if (method === 'pending_low_confidence') {
                return '<span class="w2bh-pill pending">Chờ xác minh</span>';
            }
            if (r.debt_added === true) {
                return '<span class="w2bh-pill auto" title="Đã cộng ví Web 2.0 tự động">Tự động</span>';
            }
            if (phone) {
                // Có phone nhưng wallet chưa process → đang chờ auto-reprocess
                return '<span class="w2bh-pill processing" title="Đang chờ Web 2.0 matcher cộng ví. Bấm ⚡ để chạy ngay.">Đang xử lý…</span>';
            }
            return '<span class="w2bh-pill nophone">Chưa gán</span>';
        })();
        // Extraction preview cho row chưa gán (KHÔNG áp cho manual deposit)
        let extractionBadge = '';
        if (!phone && !isManual && r.extraction_preview) {
            const ext = r.extraction_preview;
            if (ext.type !== 'none' && ext.value) {
                const icon =
                    ext.type === 'qr_code'
                        ? 'qr-code'
                        : ext.type === 'exact_phone'
                          ? 'phone'
                          : 'hash';
                const label =
                    ext.type === 'qr_code'
                        ? 'QR'
                        : ext.type === 'exact_phone'
                          ? 'SĐT đủ'
                          : 'Đuôi SĐT';
                extractionBadge = `
                    <div class="w2bh-extract-hint" title="Extracted: ${escapeHtml(ext.type)} = ${escapeHtml(ext.value)}">
                        <i data-lucide="${icon}" style="width:11px;height:11px"></i>
                        <span>${label}: ${escapeHtml(ext.value)}</span>
                    </div>
                `;
            } else {
                extractionBadge = `<div class="w2bh-extract-hint w2bh-extract-empty" title="Không extract được phone từ content">
                    <i data-lucide="alert-circle" style="width:11px;height:11px"></i>
                    <span>Không có thông tin</span>
                </div>`;
            }
        }
        // Web 2.0 = 100% auto. Không có nút ⚡ thủ công. Auto-reprocess background
        // (init + SSE) sẽ tự cộng ví cho mọi row eligible. Chỉ giữ nút "Gán KH" cho
        // edge case: extract không ra phone → user nhập tay (rare).
        return `
            <tr data-id="${r.id}" data-transaction-id="${r.id}" data-customer-phone="${escapeHtml(phone)}">
                <td class="w2bh-cell-time">${escapeHtml(fmtTime(r.transaction_date))}</td>
                <td class="w2bh-cell-amount ${cls}">${sign}${fmtVnd(amount)}₫</td>
                <td class="w2bh-cell-content">${escapeHtml(r.content || '')}</td>
                <td class="w2bh-cell-customer" data-web2-customer-cell="1">
                    ${
                        phone
                            ? `<div class="w2bh-customer">
                                  <span class="w2bh-customer-name w2bh-customer-name-link" data-action="customer-detail" data-phone="${escapeHtml(phone)}" data-name="${escapeHtml(name || '')}" title="Xem chi tiết khách hàng">${escapeHtml(name || '(không tên)')}</span>
                                  <span class="w2bh-customer-phone">${escapeHtml(phone)}</span>
                                  <span class="w2bh-wallet-pill" data-w2wallet-phone="${escapeHtml(phone)}"></span>
                               </div>`
                            : isManualNcc
                              ? `<div class="w2bh-customer">
                                    <span class="w2bh-customer-name">${escapeHtml(name)}</span>
                                    <span class="w2bh-customer-phone w2bh-ncc-tag">NCC</span>
                                 </div>`
                              : extractionBadge +
                                (method === 'pending_match'
                                    ? `<button type="button" class="w2bh-dup-btn" data-action="dup-phone" data-sepay="${escapeHtml(String(r.sepay_id || ''))}" title="Trùng SĐT nhiều KH cùng đuôi — bấm để chọn đúng KH">⚠ Trùng SĐT</button>`
                                    : `<button type="button" class="w2bh-link-btn" data-action="link" data-id="${r.id}">+ Gán KH</button>`)
                    }
                    ${verifBadge}
                    ${userBadge}
                </td>
                <td class="w2bh-cell-actions">
                    ${
                        phone
                            ? `<button type="button" class="w2bh-icon-btn w2bh-icon-chat" data-action="chat" data-phone="${escapeHtml(phone)}" data-name="${escapeHtml(name || '')}" title="Mở hội thoại Facebook của khách">
                                <i data-lucide="message-circle" style="width:14px;height:14px;"></i>
                            </button>`
                            : !isManualNcc
                              ? `<button type="button" class="w2bh-icon-btn w2bh-icon-chat" data-action="chat" data-phone="" data-name="" title="Mở & tìm hội thoại Facebook">
                                <i data-lucide="message-circle" style="width:14px;height:14px;"></i>
                            </button>`
                              : ''
                    }
                    <button type="button" class="w2bh-icon-btn w2bh-icon-history" data-action="history" data-id="${r.id}" title="Lịch sử giao dịch">
                        <i data-lucide="history" style="width:14px;height:14px;"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    function renderPagination() {
        const total = state.total;
        const size = state.pageSize;
        const pages = Math.max(1, Math.ceil(total / size));
        const page = Math.min(Math.max(1, state.page), pages);
        const start = total === 0 ? 0 : (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        dom.pageInfo.textContent = `${fmtVnd(start)}–${fmtVnd(end)} / ${fmtVnd(total)}`;

        const btns = [];
        const pushBtn = (label, target, opts) => {
            const disabled = opts && opts.disabled ? 'disabled' : '';
            const active = opts && opts.active ? 'is-active' : '';
            btns.push(
                `<button type="button" class="${active}" data-page="${target}" ${disabled}>${label}</button>`
            );
        };
        pushBtn('«', 1, { disabled: page <= 1 });
        pushBtn('‹', page - 1, { disabled: page <= 1 });
        const win = 5;
        let from = Math.max(1, page - 2);
        let to = Math.min(pages, from + win - 1);
        from = Math.max(1, to - win + 1);
        for (let i = from; i <= to; i++) pushBtn(String(i), i, { active: i === page });
        pushBtn('›', page + 1, { disabled: page >= pages });
        pushBtn('»', pages, { disabled: page >= pages });
        dom.pageButtons.innerHTML = btns.join('');
        dom.pageButtons.querySelectorAll('button[data-page]').forEach((b) => {
            b.addEventListener('click', () => {
                if (b.disabled) return;
                state.page = Math.max(1, Number(b.getAttribute('data-page')) || 1);
                W2BH.load();
            });
        });
    }

    // Expose to namespace
    W2BH.renderStats = renderStats;
    W2BH.renderChips = renderChips;
    W2BH.renderTable = renderTable;
    W2BH.renderRow = renderRow;
    W2BH.renderPagination = renderPagination;
    W2BH._extractUserFromRow = _extractUserFromRow;
})(window);
