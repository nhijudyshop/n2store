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

        if (count) count.textContent = `${items.length} PBH`; // #32: null-guard như ul/empty

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
                const stateLabel = STATE_LABELS[fState] || fState;
                // #4: <li> tương tác → role=button + tabindex + aria-label để chọn được
                // bằng bàn phím (trước đây chỉ click chuột) + công bố vai trò cho SR.
                const aria = `PBH ${it.number}, ${it.partner.name || ''}, đã pick ${it.totals.picked} trên ${it.totals.quantity}, ${stateLabel}`;
                return `
                <li class="rc-pbh-item ${sel}" data-number="${escapeHtml(it.number)}"
                    role="button" tabindex="0" aria-current="${sel ? 'true' : 'false'}"
                    aria-label="${escapeHtml(aria)}">
                    <div class="rc-pbh-row1">
                        <span class="rc-pbh-number">${escapeHtml(it.number)}</span>
                        <span class="rc-pbh-stt">#${escapeHtml(fmtSttDisplay(it))}</span>
                    </div>
                    <div class="rc-pbh-customer">${escapeHtml(it.partner.name || '—')}</div>
                    <div class="rc-pbh-row1">
                        <span class="rc-pbh-phone">${escapeHtml(it.partner.phone || '')}</span>
                        <span class="rc-state-badge rc-state-${fState}">${stateLabel}</span>
                    </div>
                    <div class="rc-pbh-progress">
                        <div class="rc-progress-bar" role="progressbar" aria-valuenow="${pickedPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Tiến độ pick"><div class="rc-progress-fill" style="width:${pickedPct}%"></div></div>
                        <span class="rc-progress-text">${it.totals.picked}/${it.totals.quantity}</span>
                    </div>
                </li>`;
            })
            .join('');

        // Bind clicks + keyboard (#4: Enter/Space chọn PBH).
        ul.querySelectorAll('.rc-pbh-item').forEach((li) => {
            const open = () => RC.selectPbh(li.dataset.number);
            li.addEventListener('click', open);
            li.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
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
        // #21: 'returned' (đã trả về kho) cũng KHÓA — ẩn ô tích tay/nút sửa pick.
        const isLocked = ['packed', 'shipped', 'delivered', 'returned'].includes(fState);

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
                    Đã đối soát <strong>${p.totals.picked}/${p.totals.quantity}</strong>
                    ${
                        isComplete
                            ? ' · Đủ hàng'
                            : STATE.sessionActive
                              ? ' · <span class="rc-session-warn">phiên tạm — đủ mới lưu</span>'
                              : ''
                    }
                </span>
                ${renderActionButtons(fState, isComplete, isLocked)}
            </div>

            <!-- Ảnh bằng chứng tích-tay (chỉ PBH đã đóng gói) — admin soi lại. -->
            <div class="rc-snapshots" id="rcSnapshots" hidden></div>

            <div class="rc-history-wrap">
                <div class="rc-history-bar">
                    <button class="rc-history-toggle ${STATE.historyOpen ? 'is-open' : ''}" id="rcHistToggle" type="button">
                        <i data-lucide="history"></i>
                        <span>Lịch sử đối soát</span>
                        <i data-lucide="chevron-down" class="rc-history-chev"></i>
                    </button>
                    <button class="rc-history-all" id="rcHistAll" type="button" title="Toàn bộ thao tác PBH (tạo / sửa / đối soát / giao hàng)">
                        <i data-lucide="clock"></i><span>Toàn bộ thao tác</span>
                    </button>
                </div>
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

        // #16: nút −1 → giảm pick 1 đơn vị (quét dư/nhầm) qua RC.decrementPick.
        contentEl.querySelectorAll('.rc-minus-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const code = btn.dataset.pcode;
                const got = parseInt(btn.dataset.got, 10) || 0;
                RC.decrementPick(code, got);
            });
        });

        // #22: click ảnh SP → mở Web2ImageLightbox (touch + không che bảng).
        contentEl.querySelectorAll('.rc-line-img[data-zoom]').forEach((im) => {
            im.addEventListener('click', () => {
                if (window.Web2ImageLightbox?.open) window.Web2ImageLightbox.open(im.dataset.zoom);
            });
        });

        // Bind action buttons
        const b = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        b('rcBtnReset', RC.resetPick);
        b('rcBtnFinalize', RC.finalize);
        b('rcBtnCancelPack', RC.cancelPack);
        b('rcBtnDeliver', RC.deliverOrder);
        b('rcBtnReturnFailed', RC.returnFailedOrder);
        // Toàn bộ thao tác PBH = module chung Web2AuditLog (gộp 'pbh' tạo/sửa/huỷ +
        // 'reconcile' đối soát/giao hàng cho cùng số PBH — KHÔNG lọc entity).
        b('rcHistAll', () => {
            const num = STATE.currentPbh?.number;
            if (!num) return;
            if (window.Web2AuditLog?.openRecord) {
                window.Web2AuditLog.openRecord({
                    entityId: num,
                    title: 'Toàn bộ thao tác PBH ' + num,
                });
            } else {
                window.notificationManager?.show?.('Module lịch sử chưa sẵn sàng', 'warning');
            }
        });

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
        const pname = escapeHtml(l.productName || '');
        // #22: ảnh dùng data-zoom → click mở Web2ImageLightbox (touch-friendly), thay
        // hover scale(4) vô dụng trên điện thoại + che bảng. alt = tên SP cho SR.
        const img = l.imageUrl
            ? `<img class="rc-line-img" src="${escapeHtml(l.imageUrl)}" alt="${pname}" loading="lazy"
                   data-zoom="${escapeHtml(l.imageUrl)}" onerror="this.style.visibility='hidden'" />`
            : `<span class="rc-line-img rc-line-img-empty"><i data-lucide="image"></i></span>`;
        const code = escapeHtml(l.productCode || '');
        // Ô tích tay: checked = đã đủ. Click → manual-pick (đủ ↔ 0). Ẩn khi locked.
        // #3: aria-label trên chính input (title trên label KHÔNG map thành accessible name).
        const tick = isLocked
            ? done
                ? '<i data-lucide="check" class="rc-picked-check"></i>'
                : ''
            : `<label class="rc-manual-tick" title="Tích tay (đánh dấu đã pick đủ)">
                   <input type="checkbox" data-pcode="${code}" data-need="${need}" ${done ? 'checked' : ''}
                          aria-label="Tích tay đã pick đủ ${need} — ${pname}" />
                   <span class="rc-manual-tick-box"><i data-lucide="check"></i></span>
               </label>`;
        // #16: nút −1 — bớt 1 khi quét dư/nhầm (không phải Reset CẢ đơn). Chỉ khi got>0 & chưa khoá.
        const minus =
            !isLocked && got > 0
                ? `<button type="button" class="rc-minus-btn" data-pcode="${code}" data-got="${got}"
                       title="Bớt 1 (quét dư/nhầm)" aria-label="Bớt 1 ${pname}">−1</button>`
                : '';
        return `
            <tr class="rc-line-row ${cls}">
                <td class="rc-line-product">
                    <div class="rc-line-product-cell">
                        ${img}
                        <div class="rc-line-product-info">
                            ${pname}
                            <div class="rc-line-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="rc-line-bar-fill" style="width:${pct}%"></div></div>
                        </div>
                    </div>
                </td>
                <td class="rc-line-code"><strong>${code}</strong></td>
                <td class="rc-line-qty">${need}</td>
                <td class="rc-line-picked">
                    <div class="rc-picked-cell">
                        ${minus}
                        <span class="rc-picked-count ${done ? 'is-done' : got > 0 ? 'is-partial' : ''}">${got}/${need}</span>
                        ${tick}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderActionButtons(fState, isComplete, isLocked) {
        const buttons = [];
        // 2026-07-01 session model: phiên đối soát (client-side). Đủ 100% → TỰ chốt
        // (finalize). Nút chỉ có: Xoá phiên + (đang lưu / thử lưu lại / chốt thủ công).
        if (STATE.sessionActive && !isLocked) {
            buttons.push(
                `<button class="btn btn-secondary btn-sm" id="rcBtnReset"><i data-lucide="rotate-ccw"></i> Xoá phiên</button>`
            );
            if (STATE.finalizing) {
                buttons.push(
                    `<button class="btn btn-primary" disabled><i data-lucide="loader"></i> Đang lưu + chụp…</button>`
                );
            } else if (STATE.finalizeError) {
                buttons.push(
                    `<button class="btn btn-warn" id="rcBtnFinalize"><i data-lucide="upload-cloud"></i> Thử lưu lại</button>`
                );
            } else if (isComplete) {
                buttons.push(
                    `<button class="btn btn-primary" id="rcBtnFinalize"><i data-lucide="package-check"></i> Chốt + đóng gói</button>`
                );
            }
            return buttons.join('');
        }
        if (fState === 'packed') {
            // 2026-07-01: bỏ nút "Giao shipper" ở reconcile (giao chuyển sang nơi khác).
            buttons.push(
                `<button class="btn btn-secondary btn-sm" id="rcBtnCancelPack"><i data-lucide="package-open"></i> Hủy đóng gói</button>`
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
