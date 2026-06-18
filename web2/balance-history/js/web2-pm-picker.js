// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM picker — custom KH picker dropdown (render item + search input
// handler + select). MOVE-only split của web2-pending-match.js.
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    function _renderCustomItem(c, id, isFb) {
        const escapeHtml = W2PM.escapeHtml;
        return `<button type="button" class="w2pm-custom-item${isFb ? ' is-fb' : ''}"
                        data-w2pm-pick-phone="${escapeHtml(c.phone)}"
                        data-w2pm-pick-name="${escapeHtml(c.name || '')}"
                        data-w2pm-pick-id="${escapeHtml(String(id))}">
                        ${isFb ? '<span class="w2pm-fb-tag">FB</span>' : ''}
                        <span class="w2pm-custom-item-phone">${escapeHtml(c.phone)}</span>
                        <span class="w2pm-custom-item-name">${escapeHtml(c.name || '(không tên)')}</span>
                        <span class="w2pm-custom-item-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
                    </button>`;
    }

    function onCustomSearchInput(e) {
        const input = e.currentTarget;
        const id = input.dataset.w2pmSearch;
        const q = input.value || '';
        const prev = W2PM._customSearchDebounceTimers.get(id);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(async () => {
            const dd = document.querySelector(`[data-w2pm-dropdown="${CSS.escape(id)}"]`);
            if (!dd) return;
            if (q.trim().length < 2) {
                dd.hidden = true;
                dd.innerHTML = '';
                return;
            }
            dd.innerHTML = '<div class="w2pm-custom-loading">Đang tìm…</div>';
            dd.hidden = false;
            // WEB2/kho KH + Pancake song song. Pancake = gợi ý tên KH theo SĐT
            // tìm trong hội thoại (ask user 2026-06-05).
            const [results, fb] = await Promise.all([
                W2PM._searchCustomers(q),
                W2PM._searchPancakeByPhone(q),
            ]);
            if (!results.length && !fb.length) {
                dd.innerHTML =
                    '<div class="w2pm-custom-loading">Không tìm thấy KH. Có thể gõ thẳng SĐT rồi bấm "Chọn KH này".</div>';
                return;
            }
            let html = results.map((c) => _renderCustomItem(c, id, false)).join('');
            if (fb.length) {
                html += '<div class="w2pm-custom-divider">📘 Từ hội thoại Facebook</div>';
                html += fb.map((c) => _renderCustomItem(c, id, true)).join('');
            }
            dd.innerHTML = html;
            window.Web2WalletBalance?.attachBalances?.(dd);
            dd.querySelectorAll('.w2pm-custom-item').forEach((btn) => {
                btn.addEventListener('mousedown', (ev) => ev.preventDefault());
                btn.addEventListener('click', () => {
                    const pid = btn.dataset.w2pmPickId;
                    const phone = btn.dataset.w2pmPickPhone;
                    const name = btn.dataset.w2pmPickName || '';
                    const root = document.querySelector(`[data-w2pm-custom="${CSS.escape(pid)}"]`);
                    if (root) {
                        const sInput = root.querySelector(
                            `[data-w2pm-search="${CSS.escape(pid)}"]`
                        );
                        const nInput = root.querySelector(
                            `[data-w2pm-custom-name="${CSS.escape(pid)}"]`
                        );
                        if (sInput) sInput.value = phone;
                        if (nInput) nInput.value = name;
                    }
                    dd.hidden = true;
                });
            });
        }, 240);
        W2PM._customSearchDebounceTimers.set(id, timer);
    }

    W2PM._renderCustomItem = _renderCustomItem;
    W2PM.onCustomSearchInput = onCustomSearchInput;
})(window);
