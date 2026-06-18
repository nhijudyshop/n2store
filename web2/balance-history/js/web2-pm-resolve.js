// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM resolve — ⚠ MONEY resolve paths: pre-matched choice, custom
// picked KH, FB-chat picked KH. Cộng tiền vào ví Web 2.0 (await giữ
// nguyên). MOVE-only split của web2-pending-match.js.
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    async function onCustomResolveClick(e) {
        const btn = e.currentTarget;
        const id = btn.dataset.w2pmCustomResolve;
        const root = document.querySelector(`[data-w2pm-custom="${CSS.escape(id)}"]`);
        const sInput = root?.querySelector(`[data-w2pm-search="${CSS.escape(id)}"]`);
        const nInput = root?.querySelector(`[data-w2pm-custom-name="${CSS.escape(id)}"]`);
        const rawPhone = sInput?.value || '';
        const phone = W2PM._normalizePhoneInput(rawPhone);
        const name = (nInput?.value || '').trim();
        if (!phone || phone.length < 9 || phone.length > 11) {
            W2PM.notify('SĐT phải có 9-11 số. Vui lòng kiểm tra lại.', 'warning');
            sInput?.focus();
            return;
        }
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = 'Đang xử lý…';
        try {
            const result = await W2PM.resolvePending(id, phone, name, W2PM.getCurrentUserName());
            const amt = result?.data?.amount || 0;
            W2PM.notify(
                `✅ Đã cộng ${W2PM.fmtVnd(amt)} vào ví Web 2.0 của ${name || phone}`,
                'success'
            );
            W2PM._pendingList = W2PM._pendingList.filter((it) => String(it.id) !== String(id));
            W2PM.renderModalBody();
            W2PM.updateBadge();
            if (!W2PM._pendingList.length) {
                setTimeout(W2PM.closeModal, 1500);
            }
        } catch (err) {
            W2PM.notify('Lỗi: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }

    async function onResolveClick(e) {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-w2pm-resolve');
        const phone = btn.getAttribute('data-phone');
        const name = btn.getAttribute('data-name') || '';
        btn.disabled = true;
        btn.textContent = 'Đang xử lý…';
        try {
            const result = await W2PM.resolvePending(id, phone, name, W2PM.getCurrentUserName());
            const amt = result?.data?.amount || 0;
            W2PM.notify(
                `✅ Đã cộng ${W2PM.fmtVnd(amt)} vào ví Web 2.0 của ${name || phone}`,
                'success'
            );
            // Remove this item from list and re-render
            W2PM._pendingList = W2PM._pendingList.filter((it) => String(it.id) !== String(id));
            W2PM.renderModalBody();
            W2PM.updateBadge();
            if (!W2PM._pendingList.length) {
                setTimeout(W2PM.closeModal, 1500);
            }
        } catch (e) {
            W2PM.notify('Lỗi: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Chọn';
        }
    }

    // Resolve pending bằng KH chọn từ list hội thoại FB (nút "Gán KH này").
    async function _resolveFromChat(id, phone, name) {
        const p = W2PM._normalizePhoneInput(phone);
        if (!p || p.length < 9) {
            W2PM.notify('SĐT từ hội thoại không hợp lệ', 'warning');
            return;
        }
        try {
            const result = await W2PM.resolvePending(id, p, name || '', W2PM.getCurrentUserName());
            const amt = result?.data?.amount || 0;
            W2PM.notify(
                `✅ Đã cộng ${W2PM.fmtVnd(amt)} vào ví Web 2.0 của ${name || p}`,
                'success'
            );
            W2PM._pendingList = W2PM._pendingList.filter((it) => String(it.id) !== String(id));
            W2PM.renderModalBody();
            W2PM.updateBadge();
            if (!W2PM._pendingList.length) setTimeout(W2PM.closeModal, 1200);
        } catch (e) {
            W2PM.notify('Lỗi: ' + e.message, 'error');
        }
    }

    W2PM.onCustomResolveClick = onCustomResolveClick;
    W2PM.onResolveClick = onResolveClick;
    W2PM._resolveFromChat = _resolveFromChat;
})(window);
