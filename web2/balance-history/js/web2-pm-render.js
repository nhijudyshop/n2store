// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM render — render 1 pending item HTML + render modal body (wire
// event listeners cho choices / picker / chat / FB observer). MOVE-only
// split của web2-pending-match.js.
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    function renderItem(item) {
        const escapeHtml = W2PM.escapeHtml;
        const fmtVnd = W2PM.fmtVnd;
        const fmtTime = W2PM.fmtTime;
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
            <div class="w2pm-item" data-pending-id="${escapeHtml(String(item.id))}">
                <div class="w2pm-item-head">
                    <span class="w2pm-item-amount">+${fmtVnd(item.transfer_amount)}</span>
                    <span class="w2pm-item-headright">
                        <button type="button" class="w2pm-chat-btn" data-w2pm-chat="${escapeHtml(item.extracted_phone || '')}" title="Mở đoạn hội thoại Facebook (tìm theo đuôi SĐT của giao dịch)">💬 Hội thoại</button>
                        <span class="w2pm-item-time">${escapeHtml(fmtTime(item.transaction_date))} · ${escapeHtml(item.sepay_id || '')}</span>
                    </span>
                </div>
                <div class="w2pm-item-content">${escapeHtml(item.content || '')}</div>
                <div class="w2pm-choices">
                    ${choices
                        .map(
                            (c) => `
                        <div class="w2pm-choice">
                            <span class="w2pm-choice-phone">${escapeHtml(c.phone)}</span>
                            <span class="w2pm-choice-name">${escapeHtml(c.name || '(không tên)')}</span>
                            <span class="w2pm-choice-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
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
                <div class="w2pm-fb" data-w2pm-fb-tail="${escapeHtml(item.extracted_phone || '')}" data-w2pm-fb-id="${escapeHtml(String(item.id))}">
                    <div class="w2pm-fb-head">📘 Khách từ hội thoại Facebook (khớp đuôi SĐT) — bấm để gán:</div>
                    <div class="w2pm-fb-rows"><div class="w2pm-fb-loading">…</div></div>
                </div>
                <div class="w2pm-custom" data-w2pm-custom="${escapeHtml(String(item.id))}">
                    <div class="w2pm-custom-label">
                        <span>Không có KH đúng? Tự chọn KH khác:</span>
                    </div>
                    <div class="w2pm-custom-row">
                        <div class="w2pm-custom-search-wrap">
                            <input type="search"
                                class="w2pm-custom-search"
                                data-w2pm-search="${escapeHtml(String(item.id))}"
                                placeholder="Gõ 5-10 số đuôi SĐT / tên KH…"
                                autocomplete="off" />
                            <div class="w2pm-custom-dropdown" data-w2pm-dropdown="${escapeHtml(String(item.id))}" hidden></div>
                        </div>
                        <input type="text"
                            class="w2pm-custom-name"
                            data-w2pm-custom-name="${escapeHtml(String(item.id))}"
                            placeholder="Tên (tuỳ chọn)" />
                        <button class="w2pm-custom-btn" type="button"
                            data-w2pm-custom-resolve="${escapeHtml(String(item.id))}">
                            Chọn KH này
                        </button>
                    </div>
                    <div class="w2pm-custom-hint">
                        Gõ 5-10 số đuôi SĐT để hiện danh sách KH khớp, hoặc gõ đủ 9-10 số rồi bấm <strong>Chọn KH này</strong>.
                    </div>
                </div>
            </div>
        `;
    }

    function renderModalBody() {
        const escapeHtml = W2PM.escapeHtml;
        const body = document.getElementById('web2PendingBody');
        if (!body) return;
        const countEl = document.getElementById('web2PendingSearchCount');
        if (!W2PM._pendingList.length) {
            body.innerHTML = '<div class="w2pm-empty">Không có giao dịch nào chờ chọn KH 🎉</div>';
            if (countEl) countEl.textContent = '';
            return;
        }
        const filtered = W2PM._filterPendingList();
        if (countEl) {
            countEl.textContent = W2PM._searchQuery
                ? `${filtered.length}/${W2PM._pendingList.length}`
                : `${W2PM._pendingList.length}`;
        }
        if (!filtered.length) {
            const q = escapeHtml(W2PM._searchQuery);
            body.innerHTML = `<div class="w2pm-empty">Không tìm thấy giao dịch nào khớp "${q}".</div>`;
            return;
        }
        body.innerHTML = filtered.map(renderItem).join('');
        body.querySelectorAll('[data-w2pm-resolve]').forEach((btn) => {
            btn.addEventListener('click', W2PM.onResolveClick);
        });
        body.querySelectorAll('[data-w2pm-search]').forEach((input) => {
            input.addEventListener('input', W2PM.onCustomSearchInput);
            input.addEventListener('focus', W2PM.onCustomSearchInput);
            input.addEventListener('blur', () => {
                const id = input.dataset.w2pmSearch;
                setTimeout(() => {
                    const dd = body.querySelector(`[data-w2pm-dropdown="${CSS.escape(id)}"]`);
                    if (dd) dd.hidden = true;
                }, 150);
            });
        });
        body.querySelectorAll('[data-w2pm-custom-resolve]').forEach((btn) => {
            btn.addEventListener('click', W2PM.onCustomResolveClick);
        });
        // Nút 💬 Hội thoại mỗi giao dịch → mở chat read-only (tìm theo đuôi SĐT).
        // Mỗi hội thoại có nút "Gán KH này" → resolve pending bằng SĐT+tên từ chat.
        body.querySelectorAll('[data-w2pm-chat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const q = btn.getAttribute('data-w2pm-chat') || '';
                const card = btn.closest('.w2pm-item');
                const pendingId = card && card.getAttribute('data-pending-id');
                if (!window.Web2CustomerChat?.open) {
                    W2PM.notify('Module hội thoại chưa load', 'warning');
                    return;
                }
                window.Web2CustomerChat.open({
                    layout: 'modal',
                    readonly: true,
                    query: q,
                    onPick: pendingId
                        ? (cust) => W2PM._resolveFromChat(pendingId, cust.phone, cust.name)
                        : undefined,
                });
            });
        });
        // Số dư ví cho các SĐT ứng viên (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(body);
        // Lazy-load list KH từ hội thoại FB cho từng card khi cuộn tới (tránh
        // 200 card × search Pancake cùng lúc).
        W2PM._setupFbObserver(body);
    }

    W2PM.renderItem = renderItem;
    W2PM.renderModalBody = renderModalBody;
})(window);
