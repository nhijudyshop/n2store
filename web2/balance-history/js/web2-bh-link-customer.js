// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-link-customer — manual link KH cho 1 giao dịch.
// openLinkPrompt (mở Web2LinkCustomerModal, fallback Popup.prompt) +
// linkManual (PATCH /link + cộng ví). ⚠ MONEY surface — giữ verbatim.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { state, withFallback, notify, _currentUser } = W2BH;

    // ----- Manual link via smart customer search modal -----
    // Dùng Web2LinkCustomerModal (tìm KH qua kho KH Web 2.0 —
    // Web2CustomerStore / /api/web2/customers — fast search).
    // Fallback prompt nếu modal chưa load.
    async function openLinkPrompt(id) {
        // Seed search bằng extraction_preview (NGUỒN CANONICAL backend — web2-
        // content-extractor.extractIdentifier: chỉ đuôi SĐT 5–10 số, bỏ dãy >10
        // như FT/GD bank ref). KHÔNG grab raw \d{5,} vì vớ phải bank ref dài
        // (vd 'FT26155100277410' → 26155100277410 = 14 số → search vô nghĩa).
        // Không có đuôi hợp lệ → để trống, user tự gõ.
        const row = state.rows.find((x) => String(x.id) === String(id));
        let defaultSearch = '';
        const ev = row?.extraction_preview;
        if (ev && ev.value && ev.type && ev.type !== 'none') {
            const digits = String(ev.value).replace(/\D/g, '');
            if (digits.length >= 5 && digits.length <= 10) defaultSearch = digits;
        }
        if (window.Web2LinkCustomerModal?.openModal) {
            window.Web2LinkCustomerModal.openModal(id, defaultSearch);
            return;
        }
        // Fallback (modal chưa load)
        const phone = await window.Popup.prompt('Nhập SĐT KH (10 chữ số):');
        if (!phone || !/^\d{9,11}$/.test(phone.trim())) {
            if (phone) notify('SĐT không hợp lệ', 'warning');
            return;
        }
        const name = (await window.Popup.prompt('Tên KH (tuỳ chọn):')) || '';
        linkManual(id, phone.trim(), name.trim());
    }

    async function linkManual(id, phone, name) {
        try {
            await withFallback(`/${encodeURIComponent(id)}/link`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    name: name || null,
                    verifiedBy: _currentUser(),
                }),
            });
            notify(`Đã gán ${name || phone} + cộng ví Web 2.0`, 'success');
            await W2BH.load();
        } catch (e) {
            notify('Lỗi gán: ' + e.message, 'error');
        }
    }

    // Expose to namespace
    W2BH.openLinkPrompt = openLinkPrompt;
    W2BH.linkManual = linkManual;
})(window);
