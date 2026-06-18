// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// reconcile-render.js — render danh sách PBH + chi tiết + dòng SP + nút thao tác.
// Tách module (MOVE-only) từ reconcile-app.js gốc; logic giữ nguyên byte-for-byte.

(function () {
    'use strict';

    const RC = (window.RC = window.RC || {});
    const STATE = RC.STATE;
    const STATE_LABELS = RC.STATE_LABELS;
    const escapeHtml = RC.escapeHtml;
    const fmtMoney = RC.fmtMoney;
    const fmtDateInvoice = RC.fmtDateInvoice;
    const fmtSttDisplay = RC.fmtSttDisplay;

    // ---------- render list ----------
    function renderList() {
        const ul = document.getElementById('rcPbhList');
        const empty = document.getElementById('rcEmpty');
        const count = document.getElementById('rcCount');
        const items = STATE.items;

        count.textContent = `${items.length} PBH`;

        if (!items.length) {
            ul.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        ul.innerHTML = items
            .map((it) => {
                const pickedPct = it.totals.quantity
                    ? Math.round((it.totals.picked / it.totals.quantity) * 100)
                    : 0;
                const sel = it.number === STATE.selectedNumber ? 'is-selected' : '';
                const fState = it.fulfillmentState || 'pending';
                return `
                <li class="rc-pbh-item ${sel}" data-number="${escapeHtml(it.number)}">
                    <div class="rc-pbh-row1">
                        <span class="rc-pbh-number">${escapeHtml(it.number)}</span>
                        <span class="rc-pbh-stt">#${escapeHtml(fmtSttDisplay(it))}</span>
                    </div>
                    <div class="rc-pbh-customer">${escapeHtml(it.partner.name || '—')}</div>
                    <div class="rc-pbh-row1">
                        <span class="rc-pbh-phone">${escapeHtml(it.partner.phone || '')}</span>
                        <span class="rc-state-badge rc-state-${fState}">${STATE_LABELS[fState] || fState}</span>
                    </div>
                    <div class="rc-pbh-progress">
                        <div class="rc-progress-bar"><div class="rc-progress-fill" style="width:${pickedPct}%"></div></div>
                        <span class="rc-progress-text">${it.totals.picked}/${it.totals.quantity}</span>
                    </div>
                </li>`;
            })
            .join('');

        // Bind clicks
        ul.querySelectorAll('.rc-pbh-item').forEach((li) => {
            li.addEventListener('click', () => {
                const n = li.dataset.number;
                RC.selectPbh(n);
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // ---------- render detail ----------
    function renderDetail() {
        const emptyEl = document.getElementById('rcDetailEmpty');
        const contentEl = document.getElementById('rcDetailContent');
        const p = STATE.currentPbh;
        if (!p) {
            emptyEl.hidden = false;
            contentEl.hidden = true;
            return;
        }
        emptyEl.hidden = true;
        contentEl.hidden = false;

        const fState = p.fulfillmentState || 'pending';
        const isComplete = p.totals.isComplete;
        const isLocked = ['packed', 'shipped', 'delivered'].includes(fState);

        contentEl.innerHTML = `
            <div class="rc-detail-head">
                <div class="rc-detail-head-row1">
                    <span class="rc-detail-number">${escapeHtml(p.number)} · STT #${escapeHtml(fmtSttDisplay(p))}</span>
                    <span class="rc-state-badge rc-state-${fState}">${STATE_LABELS[fState] || fState}</span>
                </div>
                <div class="rc-detail-info">
                    <span class="rc-detail-info-item">
                        <i data-lucide="user"></i> <strong>${escapeHtml(p.partner.name || '—')}</strong>
                    </span>
                    <span class="rc-detail-info-item">
                        <i data-lucide="phone"></i> ${escapeHtml(p.partner.phone || '—')}
                    </span>
                    <span class="rc-detail-info-item">
                        <i data-lucide="map-pin"></i> ${escapeHtml(p.partner.address || '—')}
                    </span>
                    <span class="rc-detail-info-item">
                        <i data-lucide="calendar"></i> ${fmtDateInvoice(p.dateInvoice)}
                    </span>
                    <span class="rc-detail-info-item">
                        <i data-lucide="banknote"></i> <strong>${fmtMoney(p.amountTotal)}</strong>
                    </span>
                </div>
            </div>

            <div class="rc-lines-wrap">
                <table class="rc-lines-table">
                    <thead>
                        <tr>
                            <th style="width:50%">Sản phẩm</th>
                            <th style="width:18%">Mã</th>
                            <th style="width:10%; text-align:center">SL cần</th>
                            <th style="width:22%; text-align:center">Đã pick</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${p.lines.map((l) => renderLine(l, isLocked)).join('')}
                    </tbody>
                </table>
            </div>

            <div class="rc-detail-actions">
                <span class="rc-detail-summary ${isComplete ? 'is-complete' : ''}">
                    Đã pick <strong>${p.totals.picked}/${p.totals.quantity}</strong>
                    ${isComplete ? ' · Đủ hàng' : ''}
                </span>
                ${renderActionButtons(fState, isComplete, isLocked)}
            </div>

            <div class="rc-history-wrap">
                <button class="rc-history-toggle ${STATE.historyOpen ? 'is-open' : ''}" id="rcHistToggle" type="button">
                    <i data-lucide="history"></i>
                    <span>Lịch sử đối soát</span>
                    <i data-lucide="chevron-down" class="rc-history-chev"></i>
                </button>
                <div class="rc-history-section" id="rcHistory" ${STATE.historyOpen ? '' : 'hidden'}>
                    ${STATE.historyHtml || '<div class="rc-history-loading">Đang tải lịch sử…</div>'}
                </div>
            </div>
        `;

        // 2026-06-06: lịch sử ẩn mặc định, click toggle mới mở (lazy-load lần đầu).
        const histToggle = document.getElementById('rcHistToggle');
        if (histToggle) {
            histToggle.addEventListener('click', () => {
                STATE.historyOpen = !STATE.historyOpen;
                const sec = document.getElementById('rcHistory');
                histToggle.classList.toggle('is-open', STATE.historyOpen);
                if (sec) sec.hidden = !STATE.historyOpen;
                if (STATE.historyOpen && STATE.historyHtml == null) {
                    RC.loadHistory(STATE.currentPbh?.number);
                }
            });
        }

        // 2026-06-06: bind ô tích tay (manual) — toggle đủ ↔ 0 qua manual-pick.
        contentEl.querySelectorAll('.rc-manual-tick input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const code = cb.dataset.pcode;
                const need = parseInt(cb.dataset.need, 10) || 0;
                RC.toggleManualPick(code, cb.checked, need);
            });
        });

        // Bind action buttons
        const b = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        b('rcBtnReset', RC.resetPick);
        b('rcBtnPack', RC.packOrder);
        b('rcBtnCancelPack', RC.cancelPack);
        b('rcBtnShip', RC.shipOrder);
        b('rcBtnDeliver', RC.deliverOrder);
        b('rcBtnReturnFailed', RC.returnFailedOrder);

        if (window.lucide) window.lucide.createIcons();
    }

    // 2026-06-04: scanner-driven — quét barcode SP → +1 (server).
    // 2026-06-06: thêm ô tích tay (manual) — đánh dấu đủ/0 khi barcode không quét được.
    //   isLocked (packed/shipped/delivered) → ẩn ô tích, chỉ hiển thị read-only.
    function renderLine(l, isLocked) {
        const need = l.quantity;
        const got = l.picked_qty || 0;
        const pct = need ? Math.min(100, Math.round((got / need) * 100)) : 0;
        const done = got >= need;
        const cls = done ? 'is-complete' : got > 0 ? 'is-partial' : '';
        const img = l.imageUrl
            ? `<img class="rc-line-img" src="${escapeHtml(l.imageUrl)}" alt="" loading="lazy"
                   onerror="this.style.visibility='hidden'" />`
            : `<span class="rc-line-img rc-line-img-empty"><i data-lucide="image"></i></span>`;
        const code = escapeHtml(l.productCode || '');
        // Ô tích tay: checked = đã đủ. Click → manual-pick (đủ ↔ 0). Ẩn khi locked.
        const tick = isLocked
            ? done
                ? '<i data-lucide="check" class="rc-picked-check"></i>'
                : ''
            : `<label class="rc-manual-tick" title="Tích tay (đánh dấu đã pick đủ)">
                   <input type="checkbox" data-pcode="${code}" data-need="${need}" ${done ? 'checked' : ''} />
                   <span class="rc-manual-tick-box"><i data-lucide="check"></i></span>
               </label>`;
        return `
            <tr class="rc-line-row ${cls}">
                <td class="rc-line-product">
                    <div class="rc-line-product-cell">
                        ${img}
                        <div class="rc-line-product-info">
                            ${escapeHtml(l.productName)}
                            <div class="rc-line-bar"><div class="rc-line-bar-fill" style="width:${pct}%"></div></div>
                        </div>
                    </div>
                </td>
                <td class="rc-line-code"><strong>${code}</strong></td>
                <td class="rc-line-qty">${need}</td>
                <td class="rc-line-picked">
                    <div class="rc-picked-cell">
                        <span class="rc-picked-count ${done ? 'is-done' : got > 0 ? 'is-partial' : ''}">${got}/${need}</span>
                        ${tick}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderActionButtons(fState, isComplete, isLocked) {
        const buttons = [];
        if (!isLocked && (fState === 'picking' || fState === 'picked' || fState === 'pending')) {
            buttons.push(
                `<button class="btn btn-secondary btn-sm" id="rcBtnReset"><i data-lucide="rotate-ccw"></i> Reset pick</button>`
            );
            buttons.push(
                `<button class="btn btn-primary" id="rcBtnPack" ${isComplete ? '' : 'disabled'}>
                    <i data-lucide="package"></i> Đóng gói
                </button>`
            );
        }
        if (fState === 'packed') {
            buttons.push(
                `<button class="btn btn-secondary btn-sm" id="rcBtnCancelPack"><i data-lucide="package-open"></i> Hủy đóng gói</button>`
            );
            buttons.push(
                `<button class="btn btn-warn" id="rcBtnShip"><i data-lucide="truck"></i> Giao shipper</button>`
            );
        }
        if (fState === 'shipped') {
            buttons.push(
                `<button class="btn btn-success" id="rcBtnDeliver"><i data-lucide="check-circle-2"></i> Đã giao</button>`
            );
        }
        // Trả về kho — bật khi shipped HOẶC delivered (KH nhận xong từ chối).
        // Auto restock + cancel PBH (web2/PBH bug "cancel không trả tồn về" đã fix).
        if (fState === 'shipped' || fState === 'delivered') {
            buttons.push(
                `<button class="btn btn-danger" id="rcBtnReturnFailed">
                    <i data-lucide="undo-2"></i> Giao thất bại / Trả về kho
                </button>`
            );
        }
        return buttons.join('');
    }

    RC.renderList = renderList;
    RC.renderDetail = renderDetail;
    RC.renderLine = renderLine;
    RC.renderActionButtons = renderActionButtons;
})();
