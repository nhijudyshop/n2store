// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse render (list/pagination/cards). warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — RENDER: bảng list, FB badges,
// phân trang, card kết quả Pancake fallback. Đọc state/utils từ
// window.__wcApp (customers-state.js load TRƯỚC).
// =====================================================================

(function () {
    'use strict';

    const NS = (window.__wcApp = window.__wcApp || {});
    const { STATUS, state, $, esc, fmtMoney, normPhone } = NS;

    function fbBadges(r) {
        const b = [];
        if (r.globalId)
            b.push(`<span class="wc-fb wc-fb-gid" title="Global ID (gửi tin)">GID</span>`);
        if (r.fbId)
            b.push(`<span class="wc-fb wc-fb-psid" title="PSID ${esc(r.fbId)}">PSID</span>`);
        if (r.fbPageId)
            b.push(`<span class="wc-fb wc-fb-page" title="Page ${esc(r.fbPageId)}">Page</span>`);
        const acc = Array.isArray(r.aliases) ? r.aliases.length : 0;
        if (acc > 0)
            b.push(`<span class="wc-fb wc-fb-acc" title="Nhiều tài khoản FB">+${acc} acc</span>`);
        return b.length ? b.join('') : '<span class="wc-muted">—</span>';
    }

    function renderTable() {
        const body = $('#wcTableBody');
        if (!state.rows.length) {
            body.innerHTML = `<tr><td colspan="8"><div class="wc-empty">Chưa có khách hàng nào</div></td></tr>`;
            return;
        }
        body.innerHTML = state.rows
            .map((r) => {
                const st = STATUS[r.status] || STATUS.Normal;
                const checked = state.selected.has(r.id) ? 'checked' : '';
                const src = r.source
                    ? `<span class="wc-src" title="Nguồn">${esc(r.source)}</span>`
                    : '';
                return `
                <tr data-id="${r.id}" data-phone="${esc(r.phone)}">
                    <td class="wc-col-check"><input type="checkbox" class="wc-row-check" ${checked} /></td>
                    <td class="wc-col-name">
                        <div class="wc-name">${esc(r.name) || '<span class="wc-muted">(không tên)</span>'} ${src}</div>
                        ${r.note ? `<div class="wc-note" title="${esc(r.note)}">${esc(r.note)}</div>` : ''}
                    </td>
                    <td class="wc-col-phone">
                        ${r.phone ? `<span class="wc-phone">${esc(r.phone)}</span><span class="wc-wallet" data-w2wallet-phone="${esc(r.phone)}" data-w2wallet-name="${esc(r.name)}"></span>` : '<span class="wc-muted">—</span>'}
                        ${Array.isArray(r.altPhones) && r.altPhones.length ? `<span class="wc-altphone-tag" title="SĐT phụ: ${esc(r.altPhones.join(', '))}">+${r.altPhones.length} SĐT</span>` : ''}
                    </td>
                    <td class="wc-col-fb">${fbBadges(r)}</td>
                    <td class="wc-col-address">${esc(r.address) || '<span class="wc-muted">—</span>'}${Array.isArray(r.altAddresses) && r.altAddresses.length ? ` <span class="wc-altaddr-tag" title="Địa chỉ phụ:&#10;${esc(r.altAddresses.join('\n'))}">+${r.altAddresses.length} địa chỉ</span>` : ''}</td>
                    <td class="wc-col-status"><span class="wc-badge wc-badge-${st.cls}">${st.label}</span></td>
                    <td class="wc-col-stats">
                        <span title="Số đơn">${r.totalOrders || 0} đơn</span>
                        ${r.totalSpent ? `<span class="wc-spent">${fmtMoney(r.totalSpent)}</span>` : ''}
                        ${r.bomCount ? `<span class="wc-bom" title="Bom">⚠${r.bomCount}</span>` : ''}
                    </td>
                    <td class="wc-col-actions">
                        <button class="wc-act" data-act="detail" title="Chi tiết / chat / đơn"><i data-lucide="eye"></i></button>
                        <button class="wc-act" data-act="qr" title="QR chuyển khoản"><i data-lucide="qr-code"></i></button>
                        <button class="wc-act" data-act="edit" title="Sửa"><i data-lucide="pencil"></i></button>
                        <button class="wc-act" data-act="history" title="Lịch sử thao tác"><i data-lucide="history"></i></button>
                        <button class="wc-act wc-act-danger" data-act="delete" title="Xóa"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`;
            })
            .join('');
        if (window.lucide) window.lucide.createIcons();
        // Pill số dư ví (shared) — quét row vừa render.
        window.Web2WalletBalance?.attachBalances?.(body);
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
        const from = state.total ? (state.page - 1) * state.limit + 1 : 0;
        const to = Math.min(state.page * state.limit, state.total);
        $('#wcPaginationInfo').textContent =
            `${from}–${to} / ${state.total.toLocaleString('vi-VN')}`;
        const btns = [];
        const mk = (p, label, disabled, active) =>
            `<button class="wc-page-btn ${active ? 'is-active' : ''}" ${disabled ? 'disabled' : ''} data-page="${p}">${label}</button>`;
        btns.push(mk(state.page - 1, '‹', state.page <= 1, false));
        const win = 2;
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || (p >= state.page - win && p <= state.page + win)) {
                btns.push(mk(p, p, false, p === state.page));
            } else if (p === state.page - win - 1 || p === state.page + win + 1) {
                btns.push('<span class="wc-page-ellipsis">…</span>');
            }
        }
        btns.push(mk(state.page + 1, '›', state.page >= totalPages, false));
        $('#wcPaginationButtons').innerHTML = btns.join('');
    }

    function renderPancakeCards() {
        const list = $('#wcPancakeList');
        if (!list) return;
        if (!NS._pancakeRows.length) {
            list.innerHTML = '<div class="wc-pancake-empty">Không tìm thấy trên Pancake.</div>';
            return;
        }
        list.innerHTML = NS._pancakeRows
            .map((c, i) => {
                const ph = c.phone ? normPhone(c.phone) || esc(c.phone) : '';
                return `
                <div class="wc-pancake-card" data-idx="${i}">
                    <div class="wc-pancake-avatar">${
                        c.avatarUrl
                            ? `<img src="${esc(c.avatarUrl)}" alt="" loading="lazy" />`
                            : '<i data-lucide="user"></i>'
                    }</div>
                    <div class="wc-pancake-meta">
                        <div class="wc-pancake-name">${esc(c.name) || '(không tên)'}</div>
                        <div class="wc-pancake-sub">
                            ${ph ? `<span class="wc-phone">${ph}</span>` : '<span class="wc-muted">chưa có SĐT</span>'}
                            ${c.isInbox ? '<span class="wc-pancake-badge">💬 Nhắn được</span>' : ''}
                            <span class="wc-pancake-page" title="Page ${esc(c.pageId)}">page …${esc(String(c.pageId).slice(-5))}</span>
                        </div>
                    </div>
                    <button type="button" class="wc-btn wc-btn-primary wc-pancake-add" data-idx="${i}">
                        <i data-lucide="user-plus"></i> Thêm vào kho
                    </button>
                </div>`;
            })
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    NS.fbBadges = fbBadges;
    NS.renderTable = renderTable;
    NS.renderPagination = renderPagination;
    NS.renderPancakeCards = renderPancakeCards;
})();
