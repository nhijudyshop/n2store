// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM modal — DOM creation + CSS injection + open/close lifecycle +
// main search/filter. MOVE-only split của web2-pending-match.js.
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    function ensureModalDom() {
        if (W2PM._modal) return W2PM._modal;
        const div = document.createElement('div');
        div.id = 'web2PendingModal';
        div.className = 'w2pm-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2pm-backdrop"></div>
            <div class="w2pm-panel">
                <header class="w2pm-head">
                    <h3>Chọn khách hàng cho giao dịch (Web 2.0)</h3>
                    <button type="button" class="w2pm-close" aria-label="Đóng">&times;</button>
                </header>
                <p class="w2pm-info">SePay match đa SĐT cùng đuôi — chọn đúng KH để cộng tiền vào ví Web 2.0.</p>
                <div class="w2pm-search-wrap">
                    <input
                        type="search"
                        id="web2PendingSearch"
                        class="w2pm-search"
                        placeholder="Tìm SĐT / tên KH / nội dung CK / số tiền…"
                        autocomplete="off"
                    />
                    <span class="w2pm-search-count" id="web2PendingSearchCount"></span>
                </div>
                <div class="w2pm-body" id="web2PendingBody"></div>
                <footer class="w2pm-foot">
                    <button type="button" class="w2pm-refresh">Tải lại</button>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelector('.w2pm-backdrop').addEventListener('click', closeModal);
        div.querySelector('.w2pm-close').addEventListener('click', closeModal);
        div.querySelector('.w2pm-refresh').addEventListener('click', () => W2PM.refreshModal());
        const searchInput = div.querySelector('#web2PendingSearch');
        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchInput.value) {
                e.preventDefault();
                e.stopPropagation();
                searchInput.value = '';
                W2PM._searchQuery = '';
                W2PM.renderModalBody();
            }
        });
        W2PM._modal = div;
        ensureStyles();
        return div;
    }

    function onSearchInput(e) {
        const raw = e.currentTarget.value || '';
        if (W2PM._searchDebounceTimer) clearTimeout(W2PM._searchDebounceTimer);
        W2PM._searchDebounceTimer = setTimeout(() => {
            W2PM._searchQuery = raw;
            W2PM.renderModalBody();
        }, 120);
    }

    function _filterPendingList() {
        const q = W2PM._normalize(W2PM._searchQuery);
        if (!q) return W2PM._pendingList;
        // Multi-token AND: tokens cách nhau space, mỗi token đều phải match.
        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.length) return W2PM._pendingList;
        return W2PM._pendingList.filter((item) => {
            const choiceText = (Array.isArray(item.matched_customers) ? item.matched_customers : [])
                .flatMap((m) =>
                    (m.customers || []).map((c) => `${m.phone || c.phone || ''} ${c.name || ''}`)
                )
                .join(' ');
            const amountText = String(item.transfer_amount || '');
            const haystack = W2PM._normalize(
                [item.content || '', item.sepay_id || '', amountText, choiceText].join(' ')
            );
            return tokens.every((t) => haystack.includes(t));
        });
    }

    function ensureStyles() {
        if (document.getElementById('web2PendingMatchStyles')) return;
        const s = document.createElement('style');
        s.id = 'web2PendingMatchStyles';
        s.textContent = `
            .w2pm-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }
            .w2pm-modal[hidden] { display: none; }
            .w2pm-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2pm-panel { position: relative; background: #fff; border-radius: 10px; width: min(760px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(15,23,42,.32); overflow: hidden; }
            .w2pm-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
            .w2pm-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2pm-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; line-height: 1; padding: 4px 8px; }
            .w2pm-info { margin: 10px 18px 0; font-size: 12px; color: #475569; padding: 8px 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; }
            .w2pm-search-wrap { padding: 10px 18px 0; display: flex; align-items: center; gap: 10px; }
            .w2pm-search { flex: 1; height: 36px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; font: 400 14px Inter, sans-serif; color: #0f172a; outline: none; transition: border-color .12s, box-shadow .12s; }
            .w2pm-search::-webkit-search-cancel-button { cursor: pointer; }
            .w2pm-search:focus { border-color: #0891b2; box-shadow: 0 0 0 3px rgba(8,145,178,.15); }
            .w2pm-search-count { font-size: 12px; color: #64748b; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
            .w2pm-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
            .w2pm-foot { padding: 10px 18px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px; background: #f9fafb; }
            .w2pm-refresh { background: #fff; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .w2pm-refresh:hover { background: #f3f4f6; }
            .w2pm-empty { text-align: center; padding: 32px; color: #94a3b8; font-style: italic; }
            .w2pm-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; background: #fff; }
            .w2pm-item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .w2pm-item-amount { font-size: 16px; font-weight: 700; color: #0891b2; }
            .w2pm-item-time { font-size: 11px; color: #94a3b8; }
            .w2pm-item-headright { display: inline-flex; align-items: center; gap: 10px; }
            .w2pm-chat-btn { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
            .w2pm-chat-btn:hover { background: #dbeafe; border-color: #93c5fd; }
            .w2pm-fb { margin: 8px 0; border: 1px solid #dbeafe; border-radius: 8px; background: #f5f9ff; padding: 7px 9px; }
            .w2pm-fb-head { font-size: 11px; font-weight: 600; color: #1d4ed8; margin-bottom: 5px; }
            .w2pm-fb-rows { display: flex; flex-direction: column; gap: 4px; }
            .w2pm-fb-loading, .w2pm-fb-empty { font-size: 12px; color: #94a3b8; font-style: italic; padding: 3px 2px; }
            .w2pm-fb-row { display: flex; align-items: center; gap: 9px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 8px; }
            .w2pm-fb-av { position: relative; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; overflow: hidden; background: #c7d2fe; }
            .w2pm-fb-av .w2pm-fb-ini { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #3730a3; font-weight: 700; font-size: 12px; }
            .w2pm-fb-av img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
            .w2pm-fb-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
            .w2pm-fb-name { font-weight: 600; font-size: 13px; color: #0f172a; }
            .w2pm-fb-phone { font-size: 11px; color: #2563eb; }
            .w2pm-fb-bal { font-size: 11px; }
            .w2pm-fb-pick { flex: 0 0 auto; border: none; background: #16a34a; color: #fff; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
            .w2pm-fb-pick:hover { background: #15803d; }
            .w2pm-custom-divider { font-size: 11px; font-weight: 600; color: #1d4ed8; padding: 6px 10px 3px; border-top: 1px dashed #dbeafe; margin-top: 3px; }
            .w2pm-custom-item.is-fb:hover { background: #eff6ff; }
            .w2pm-fb-tag { font-size: 9px; font-weight: 700; color: #fff; background: #2563eb; border-radius: 3px; padding: 1px 4px; letter-spacing: .03em; }
            .w2pm-item-content { font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; max-height: 60px; overflow: auto; }
            .w2pm-choices { display: flex; flex-direction: column; gap: 5px; }
            .w2pm-choice { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #f1f5f9; border-radius: 5px; cursor: pointer; transition: all .12s; }
            .w2pm-choice:hover { background: #dbeafe; }
            .w2pm-choice-phone { font-weight: 600; color: #1d4ed8; min-width: 110px; }
            .w2pm-choice-name { flex: 1; color: #0f172a; font-size: 13px; }
            .w2pm-choice-btn { background: #0891b2; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
            .w2pm-custom { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
            .w2pm-custom-label { font-size: 12px; color: #475569; margin-bottom: 6px; font-weight: 600; }
            .w2pm-custom-row { display: flex; gap: 6px; align-items: center; }
            .w2pm-custom-search-wrap { position: relative; flex: 1; min-width: 0; }
            .w2pm-custom-search, .w2pm-custom-name { height: 32px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font: 400 13px Inter, sans-serif; color: #0f172a; outline: none; }
            .w2pm-custom-search { width: 100%; box-sizing: border-box; }
            .w2pm-custom-name { width: 140px; flex-shrink: 0; }
            .w2pm-custom-search:focus, .w2pm-custom-name:focus { border-color: #0891b2; box-shadow: 0 0 0 2px rgba(8,145,178,.18); }
            .w2pm-custom-btn { background: #047857; color: #fff; border: none; padding: 0 14px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; flex-shrink: 0; }
            .w2pm-custom-btn:hover { background: #065f46; }
            .w2pm-custom-btn:disabled { background: #94a3b8; cursor: not-allowed; }
            .w2pm-custom-hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }
            .w2pm-custom-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; margin-top: 2px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 10px 24px rgba(15,23,42,.14); max-height: 220px; overflow-y: auto; padding: 4px; min-width: 220px; }
            .w2pm-custom-item { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: none; background: transparent; border-radius: 4px; text-align: left; cursor: pointer; width: 100%; font-size: 12px; }
            .w2pm-custom-item:hover { background: #ecfdf5; }
            .w2pm-custom-item-phone { font-weight: 600; color: #047857; min-width: 110px; }
            .w2pm-custom-item-name { flex: 1; color: #0f172a; }
            .w2pm-custom-loading { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; font-style: italic; }
            .w2pm-badge-trigger { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 999px; font-size: 12px; cursor: pointer; font-weight: 600; border: 1px solid #fde68a; }
            .w2pm-badge-trigger:hover { background: #fde68a; }
            .w2pm-badge-trigger[hidden] { display: none !important; }
        `;
        document.head.appendChild(s);
    }

    async function refreshModal() {
        try {
            W2PM._pendingList = await W2PM.listPending();
        } catch (e) {
            W2PM.notify('Lỗi tải pending: ' + e.message, 'error');
            return;
        }
        W2PM.renderModalBody();
        W2PM.updateBadge();
    }

    // openModal(seedSearch?) — nếu truyền seed (vd sepay_id từ row "Trùng SĐT")
    // thì set sẵn ô tìm để lọc đúng giao dịch đó.
    function openModal(seedSearch) {
        ensureModalDom();
        W2PM._modal.hidden = false;
        const seed = typeof seedSearch === 'string' ? seedSearch.trim() : '';
        W2PM._searchQuery = seed;
        W2PM.renderModalBody();
        refreshModal();
        setTimeout(() => {
            const search = document.getElementById('web2PendingSearch');
            if (search) {
                search.value = seed;
                search.focus();
            }
        }, 60);
    }

    function closeModal() {
        if (W2PM._modal) W2PM._modal.hidden = true;
    }

    W2PM.ensureModalDom = ensureModalDom;
    W2PM.onSearchInput = onSearchInput;
    W2PM._filterPendingList = _filterPendingList;
    W2PM.ensureStyles = ensureStyles;
    W2PM.refreshModal = refreshModal;
    W2PM.openModal = openModal;
    W2PM.closeModal = closeModal;
})(window);
