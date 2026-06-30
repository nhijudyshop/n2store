// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-reassign-modal — modal "Sửa khách hàng — Chuyển công nợ" (admin).
// DOM + styles + customer search dropdown + open + submit (POST /reassign).
// ⚠ MONEY surface — trừ ví KH cũ + cộng ví KH mới. Giữ verbatim.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const {
        state,
        withFallback,
        notify,
        fmtVnd,
        escapeHtml,
        _currentUser,
        _normalizePhoneInput,
        CUSTOMER_SEARCH_BASE,
        CUSTOMER_SEARCH_FALLBACK,
    } = W2BH;

    async function searchCustomers(q) {
        const query = String(q || '').trim();
        if (query.length < 2) return [];
        const url = (base) =>
            `${base}?search=${encodeURIComponent(query)}&limit=8&sort=last_order_date&order=desc`;
        const parse = async (base) => {
            // /customers/search nay gate requireWeb2AuthSoft → gửi x-web2-token (ENFORCE prod).
            const r = await fetch(url(base), {
                headers: W2BH.authHeaders ? W2BH.authHeaders() : {},
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const arr = Array.isArray(data?.customers)
                ? data.customers
                : Array.isArray(data?.data)
                  ? data.data
                  : [];
            return arr
                .map((c) => ({
                    phone: c.phone || '',
                    name: c.name || c.full_name || '',
                }))
                .filter((c) => c.phone);
        };
        try {
            return await parse(CUSTOMER_SEARCH_BASE);
        } catch {
            try {
                return await parse(CUSTOMER_SEARCH_FALLBACK);
            } catch (e) {
                console.warn('[balance-history] customer search fail:', e.message);
                return [];
            }
        }
    }

    function ensureReassignModalDom() {
        if (document.getElementById('w2bhReassignModal')) return;
        const div = document.createElement('div');
        div.id = 'w2bhReassignModal';
        div.className = 'w2bh-reassign-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2bh-reassign-backdrop" data-close></div>
            <div class="w2bh-reassign-panel">
                <header class="w2bh-reassign-head">
                    <h3>Sửa khách hàng — Chuyển công nợ</h3>
                    <button type="button" class="w2bh-reassign-close" data-close aria-label="Đóng">&times;</button>
                </header>
                <div class="w2bh-reassign-body">
                    <div class="w2bh-reassign-info" id="w2bhReassignInfo"></div>
                    <p class="w2bh-reassign-warn" id="w2bhReassignWarn">
                        ⚠️ Hành động này sẽ <strong>trừ ví KH cũ</strong> và <strong>cộng vào ví KH mới</strong>.
                        Audit log đầy đủ.
                    </p>
                    <label class="w2bh-reassign-field">
                        <span>Tìm KH mới (SĐT / tên):</span>
                        <div class="w2bh-reassign-search-wrap">
                            <input type="search" id="w2bhReassignSearch"
                                placeholder="Gõ SĐT hoặc tên KH (tối thiểu 2 ký tự)…"
                                autocomplete="off" />
                            <div class="w2bh-reassign-dropdown" id="w2bhReassignDropdown" hidden></div>
                        </div>
                    </label>
                    <label class="w2bh-reassign-field">
                        <span>Tên KH (tự nhập):</span>
                        <input type="text" id="w2bhReassignName" placeholder="Tên (tuỳ chọn)" />
                    </label>
                    <label class="w2bh-reassign-field">
                        <span>Lý do (tuỳ chọn):</span>
                        <input type="text" id="w2bhReassignReason" placeholder="VD: gán nhầm, KH báo CK hộ…" />
                    </label>
                </div>
                <footer class="w2bh-reassign-foot">
                    <button type="button" class="btn-secondary" data-close>Huỷ</button>
                    <button type="button" class="btn-primary" id="w2bhReassignSubmit">Xác nhận chuyển</button>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelectorAll('[data-close]').forEach((el) =>
            el.addEventListener('click', () => (div.hidden = true))
        );
        const search = div.querySelector('#w2bhReassignSearch');
        const dd = div.querySelector('#w2bhReassignDropdown');
        const nameInput = div.querySelector('#w2bhReassignName');
        let debounceT = null;
        search.addEventListener('input', () => {
            if (debounceT) clearTimeout(debounceT);
            const q = search.value || '';
            debounceT = setTimeout(async () => {
                if (q.trim().length < 2) {
                    dd.hidden = true;
                    dd.innerHTML = '';
                    return;
                }
                dd.innerHTML = '<div class="w2bh-reassign-loading">Đang tìm…</div>';
                dd.hidden = false;
                const results = await searchCustomers(q);
                if (!results.length) {
                    dd.innerHTML =
                        '<div class="w2bh-reassign-loading">Không tìm thấy. Có thể gõ thẳng SĐT rồi bấm Xác nhận.</div>';
                    return;
                }
                dd.innerHTML = results
                    .map(
                        (c) => `<button type="button" class="w2bh-reassign-item"
                            data-phone="${escapeHtml(c.phone)}"
                            data-name="${escapeHtml(c.name || '')}">
                            <span class="w2bh-reassign-item-phone">${escapeHtml(c.phone)}</span>
                            <span class="w2bh-reassign-item-name">${escapeHtml(c.name || '(không tên)')}</span>
                            <span class="w2bh-reassign-item-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
                        </button>`
                    )
                    .join('');
                window.Web2WalletBalance?.attachBalances?.(dd);
                dd.querySelectorAll('.w2bh-reassign-item').forEach((b) => {
                    b.addEventListener('mousedown', (e) => e.preventDefault());
                    b.addEventListener('click', () => {
                        search.value = b.dataset.phone;
                        nameInput.value = b.dataset.name || '';
                        dd.hidden = true;
                    });
                });
            }, 220);
        });
        search.addEventListener('blur', () => {
            setTimeout(() => (dd.hidden = true), 150);
        });
        div.querySelector('#w2bhReassignSubmit').addEventListener('click', submitReassign);
        ensureReassignStyles();
    }

    function ensureReassignStyles() {
        if (document.getElementById('w2bhReassignStyles')) return;
        const s = document.createElement('style');
        s.id = 'w2bhReassignStyles';
        s.textContent = `
            .w2bh-reassign-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
            .w2bh-reassign-modal[hidden] { display: none; }
            .w2bh-reassign-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2bh-reassign-panel { position: relative; background: #fff; border-radius: 12px; width: min(560px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,0.25); overflow: hidden; }
            .w2bh-reassign-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
            .w2bh-reassign-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2bh-reassign-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; padding: 4px 8px; }
            .w2bh-reassign-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
            .w2bh-reassign-info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; color: #1e3a8a; }
            .w2bh-reassign-info b { color: #0c4a6e; }
            .w2bh-reassign-warn { margin: 0 0 14px; padding: 10px 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; color: #78350f; font-size: 13px; line-height: 1.5; }
            .w2bh-reassign-field { display: block; margin-bottom: 12px; }
            .w2bh-reassign-field > span { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; }
            .w2bh-reassign-field input[type="text"], .w2bh-reassign-field input[type="search"] { width: 100%; height: 36px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; font: 400 14px Inter, sans-serif; color: #0f172a; outline: none; box-sizing: border-box; }
            .w2bh-reassign-field input:focus { border-color: #0891b2; box-shadow: 0 0 0 2px rgba(8,145,178,.2); }
            .w2bh-reassign-search-wrap { position: relative; }
            .w2bh-reassign-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 4px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 10px 24px rgba(15,23,42,.14); max-height: 220px; overflow-y: auto; padding: 4px; }
            .w2bh-reassign-item { display: flex; gap: 10px; padding: 6px 10px; border: none; background: transparent; border-radius: 4px; text-align: left; cursor: pointer; width: 100%; font-size: 12px; }
            .w2bh-reassign-item:hover { background: #ecfdf5; }
            .w2bh-reassign-item-phone { font-weight: 600; color: #047857; min-width: 110px; }
            .w2bh-reassign-item-name { flex: 1; color: #0f172a; }
            .w2bh-reassign-loading { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; font-style: italic; }
            .w2bh-reassign-foot { padding: 12px 18px; border-top: 1px solid #e5e7eb; background: #f9fafb; display: flex; justify-content: flex-end; gap: 8px; }
            .w2bh-reassign-foot .btn-primary { background: #0891b2; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
            .w2bh-reassign-foot .btn-primary:hover { background: #0e7490; }
            .w2bh-reassign-foot .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
            .w2bh-reassign-foot .btn-secondary { background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
            .w2bh-icon-reassign { color: #b45309; }
            .w2bh-icon-reassign:hover { color: #92400e; background: #fef3c7; }
            .w2bh-user-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; background: #f1f5f9; color: #475569; border-radius: 999px; font-size: 11px; font-weight: 500; margin-left: 4px; }
        `;
        document.head.appendChild(s);
    }

    let _reassignCtx = null;

    function openReassignModal(id, oldPhone, amount) {
        ensureReassignModalDom();
        _reassignCtx = { id, oldPhone, amount };
        const row = state.rows.find((x) => String(x.id) === String(id));
        const rawName = row?.display_name || '';
        const isUnnamed = !rawName.trim();
        const oldName = rawName || '(không tên)';
        document.getElementById('w2bhReassignInfo').innerHTML = `
            <div>GD: <b>+${fmtVnd(amount)}₫</b> · ${escapeHtml(row?.reference_code || row?.sepay_id || '')}</div>
            <div>KH hiện tại: <b>${escapeHtml(oldName)}</b> — ${escapeHtml(oldPhone)}</div>
        `;
        const warn = document.getElementById('w2bhReassignWarn');
        if (warn) {
            warn.innerHTML = isUnnamed
                ? `💡 KH hiện tại chưa có tên. Nhập <strong>"Tên KH"</strong> bên dưới + giữ nguyên SĐT để <strong>cập nhật tên</strong> (không đổi ví). Hoặc đổi SĐT để chuyển công nợ sang KH khác.`
                : `⚠️ Hành động này sẽ <strong>trừ ví KH cũ</strong> và <strong>cộng vào ví KH mới</strong>. Audit log đầy đủ.`;
        }
        document.getElementById('w2bhReassignSearch').value = isUnnamed ? oldPhone || '' : '';
        document.getElementById('w2bhReassignName').value = '';
        document.getElementById('w2bhReassignReason').value = '';
        const submit = document.getElementById('w2bhReassignSubmit');
        submit.disabled = false;
        submit.textContent = 'Xác nhận chuyển';
        document.getElementById('w2bhReassignModal').hidden = false;
        setTimeout(() => {
            const target = isUnnamed
                ? document.getElementById('w2bhReassignName')
                : document.getElementById('w2bhReassignSearch');
            target?.focus();
        }, 60);
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    async function submitReassign() {
        if (!_reassignCtx) return;
        const { id, oldPhone, amount } = _reassignCtx;
        const rawPhone = document.getElementById('w2bhReassignSearch').value || '';
        const name = (document.getElementById('w2bhReassignName').value || '').trim();
        const reason = (document.getElementById('w2bhReassignReason').value || '').trim();
        const phone = _normalizePhoneInput(rawPhone);
        if (!phone || phone.length < 9 || phone.length > 11) {
            notify('SĐT mới phải có 9-11 số', 'warning');
            return;
        }
        const samePhone = phone === _normalizePhoneInput(oldPhone);
        if (samePhone && !name) {
            notify(
                'SĐT trùng SĐT cũ — nhập "Tên KH" để cập nhật tên, hoặc đổi SĐT để chuyển công nợ',
                'warning'
            );
            return;
        }
        const submit = document.getElementById('w2bhReassignSubmit');
        submit.disabled = true;
        submit.textContent = samePhone ? 'Đang cập nhật tên…' : 'Đang xử lý…';
        try {
            const r = await withFallback(`/${encodeURIComponent(id)}/reassign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    name: name || null,
                    verifiedBy: _currentUser(),
                    reason: reason || null,
                }),
            });
            const d = r?.data || {};
            if (d.sameCustomer) {
                notify(`✅ Đã cập nhật tên KH cho SĐT ${phone}: ${name}`, 'success');
            } else {
                notify(
                    `✅ Đã chuyển ${fmtVnd(amount)}₫ từ ${d.oldPhone || oldPhone} → ${d.newPhone || phone}`,
                    'success'
                );
            }
            document.getElementById('w2bhReassignModal').hidden = true;
            _reassignCtx = null;
            await W2BH.load();
        } catch (e) {
            notify('Lỗi reassign: ' + e.message, 'error');
            submit.disabled = false;
            submit.textContent = 'Xác nhận chuyển';
        }
    }

    // Expose to namespace
    W2BH.searchCustomers = searchCustomers;
    W2BH.ensureReassignModalDom = ensureReassignModalDom;
    W2BH.ensureReassignStyles = ensureReassignStyles;
    W2BH.openReassignModal = openReassignModal;
    W2BH.submitReassign = submitReassign;
})(window);
