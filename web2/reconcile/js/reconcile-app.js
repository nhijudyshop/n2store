// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web 2.0 — Đối soát đóng gói PBH (Reconcile / Fulfillment).
// Stock đã trừ lúc tạo PBH → trang này CHỈ verify pick + state machine + audit log.

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/reconcile`;

    const STATE_LABELS = {
        pending: 'Chờ pick',
        picking: 'Đang pick',
        picked: 'Đã pick đủ',
        packed: 'Đã đóng gói',
        shipped: 'Đã giao shipper',
        delivered: 'Đã giao',
        cancelled: 'Huỷ',
    };

    const STATE = {
        items: [],
        filterState: 'active',
        search: '',
        selectedNumber: null,
        currentPbh: null,
    };

    // ---------- helpers ----------
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtMoney(n) {
        return Number(n || 0).toLocaleString('vi-VN') + '₫';
    }
    function fmtTs(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function fmtDateInvoice(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    function fmtSttDisplay(item) {
        if (Array.isArray(item.mergedDisplayStt) && item.mergedDisplayStt.length > 1) {
            return item.mergedDisplayStt.join(' + ');
        }
        return item.displayStt != null ? String(item.displayStt) : '—';
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function feedback(msg, isError, isComplete) {
        const div = document.createElement('div');
        div.className =
            'rc-scan-feedback ' +
            (isError ? 'is-error' : isComplete ? 'is-complete' : 'is-success');
        div.textContent = msg;
        document.body.appendChild(div);
        // Complete (đã check xong) giữ lâu hơn cho dễ thấy.
        const hold = isComplete ? 2600 : 1500;
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transition = 'opacity 200ms';
            setTimeout(() => div.remove(), 200);
        }, hold);
    }
    async function api(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(`${API}${path}`, opts);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    // ---------- load list ----------
    async function loadList() {
        try {
            const q = new URLSearchParams({ state: STATE.filterState });
            if (STATE.search) q.set('search', STATE.search);
            const res = await api('GET', `/list?${q.toString()}`);
            STATE.items = res.items || [];
            renderList();
        } catch (e) {
            notify('Lỗi tải DS PBH: ' + e.message, 'error');
        }
    }

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
                selectPbh(n);
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // ---------- select PBH ----------
    async function selectPbh(number) {
        STATE.selectedNumber = number;
        STATE.historyHtml = null; // reset để không nháy lịch sử PBH cũ
        renderList();
        const target = document.getElementById('rcScannerTarget');
        target.textContent = `PBH: ${number}`;
        target.classList.add('is-active');
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}`);
            STATE.currentPbh = res.pbh;
            renderDetail();
            focusScanner();
            loadHistory(number);
        } catch (e) {
            notify('Lỗi tải PBH: ' + e.message, 'error');
        }
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

            <div class="rc-history-section" id="rcHistory">
                ${STATE.historyHtml || '<div class="rc-history-loading">Đang tải lịch sử…</div>'}
            </div>
        `;

        // 2026-06-06: bind ô tích tay (manual) — toggle đủ ↔ 0 qua manual-pick.
        contentEl.querySelectorAll('.rc-manual-tick input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const code = cb.dataset.pcode;
                const need = parseInt(cb.dataset.need, 10) || 0;
                toggleManualPick(code, cb.checked, need);
            });
        });

        // Bind action buttons
        const b = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        b('rcBtnReset', resetPick);
        b('rcBtnPack', packOrder);
        b('rcBtnCancelPack', cancelPack);
        b('rcBtnShip', shipOrder);
        b('rcBtnDeliver', deliverOrder);
        b('rcBtnReturnFailed', returnFailedOrder);

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

    // ---------- actions ----------
    // 2026-06-06: tích tay 1 line — checked = pick đủ (qty), unchecked = 0.
    // Lưu NGAY mỗi lần tích (không cần quét đủ cả đơn). Dùng cho SP barcode không quét được.
    // User 06/06: BẮT BUỘC confirm + ghi lịch sử "đối chiếu camera" — vì tích tay KHÔNG
    // quét barcode → cần xác nhận + lưu vết để soi lại camera khi đối chứng.
    const MANUAL_CAMERA_NOTE = 'Tích tay (không quét) — đối chiếu camera';
    async function toggleManualPick(productCode, checked, need) {
        const number = STATE.currentPbh?.number;
        if (!number) return;

        // Confirm trước khi áp dụng. Hủy → revert checkbox về trạng thái server.
        const ok = checked
            ? confirm(
                  `✋ TÍCH TAY (không quét barcode) cho "${productCode}"?\n\n` +
                      `→ Đánh dấu đã pick đủ ${need} mà không quét mã.\n` +
                      `→ Thao tác được LƯU LỊCH SỬ (kèm người + ngày giờ) để ĐỐI CHIẾU CAMERA khi cần.\n\n` +
                      `Xác nhận?`
              )
            : confirm(`Bỏ tích tay "${productCode}" (đưa về 0)?`);
        if (!ok) {
            renderDetail(); // checkbox đã toggle visually → vẽ lại theo state server
            return;
        }

        const pickedQty = checked ? need : 0;
        const body = { productCode, pickedQty };
        if (checked) body.note = MANUAL_CAMERA_NOTE; // server log payload.note (sau khi deploy)
        if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(body);
        try {
            const res = await api('POST', `/${encodeURIComponent(number)}/manual-pick`, body);
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(number);
            const t = res.pbh?.totals || {};
            if (checked) {
                notify(`✋ Đã tích tay ${productCode} — lưu lịch sử để đối chiếu camera`, 'info');
            }
            if (t.isComplete) {
                feedback(`✓✓ ĐỦ HÀNG ${number} — bấm "Đóng gói" để hoàn tất`, false, true);
                loadList();
            } else {
                feedback(checked ? `✓ Tích tay ${productCode}` : `↩ Bỏ tích ${productCode}`);
            }
        } catch (err) {
            notify(err.message, 'error');
            renderDetail(); // revert về trạng thái server
        }
    }

    async function resetPick() {
        if (!STATE.currentPbh) return;
        if (!confirm('Reset toàn bộ pick về 0?')) return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/reset-pick`
            );
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            notify('Đã reset pick', 'info');
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function packOrder() {
        if (!STATE.currentPbh) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(STATE.currentPbh.number)}/pack`);
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            notify('Đã đóng gói ✓', 'success');
            // Refresh list để PBH chuyển tab
            loadList();
        } catch (e) {
            if (e.message && e.message.includes('Chưa đủ hàng')) {
                notify('Không thể đóng gói: chưa đủ hàng', 'error');
            } else {
                notify(e.message, 'error');
            }
        }
    }

    async function cancelPack() {
        if (!STATE.currentPbh) return;
        if (!confirm(`Hủy đóng gói PBH ${STATE.currentPbh.number}? (đưa về trạng thái pick)`))
            return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/cancel-pack`
            );
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            notify('Đã hủy đóng gói', 'info');
            loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function shipOrder() {
        if (!STATE.currentPbh) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(STATE.currentPbh.number)}/ship`);
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            notify('Đã giao shipper ✓', 'success');
            loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function deliverOrder() {
        if (!STATE.currentPbh) return;
        if (!confirm('Xác nhận đã giao thành công cho khách?')) return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/deliver`
            );
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            notify('Đã giao thành công ✓', 'success');
            loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function returnFailedOrder() {
        if (!STATE.currentPbh) return;
        const reason = prompt('Lý do giao thất bại / trả về kho (optional):', 'Khách từ chối nhận');
        if (reason === null) return; // user cancelled
        if (
            !confirm(
                `Đánh dấu PBH ${STATE.currentPbh.number} GIAO THẤT BẠI?\n\n` +
                    `→ Trả tồn về kho web2_products\n` +
                    `→ Hủy PBH (state='cancel')\n\n` +
                    `Hành động idempotent — chỉ trả tồn 1 lần.`
            )
        ) {
            return;
        }
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/return-failed`,
                { reason: reason || null }
            );
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.currentPbh?.number);
            const restored = res.restock?.restored || 0;
            notify(
                `✓ Đã trả về kho ${restored} dòng SP. PBH ${STATE.currentPbh.number} đã hủy.`,
                'success'
            );
            loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    // ---------- scanner ----------
    // PBH number pattern (2026-06-04 đổi HD→NJ, hợp nhất 1 mã/đơn): NJ-YYYYMMDD-NNNN
    // hoặc NJ-YYYYMMDD-NNNN-N (tách đơn). Quét barcode bill → switch PBH đó.
    // Vẫn nhận HD-... cũ cho data legacy.
    const PBH_NUMBER_RE = /^(NJ|HD)-\d{8}-\d{3,5}(-\d+)?$/;

    async function onScannerSubmit(value) {
        value = (value || '').trim();
        if (!value) return;

        // Quét barcode bill → switch PBH
        if (PBH_NUMBER_RE.test(value)) {
            try {
                await selectPbh(value);
                feedback(`📦 Mở PBH ${value}`);
            } catch (e) {
                feedback('✗ ' + e.message, true);
            }
            return;
        }

        // Mọi giá trị khác = product code → +1 picked_qty
        if (!STATE.selectedNumber) {
            feedback('Quét barcode trên bill trước, hoặc chọn 1 PBH', true);
            return;
        }
        try {
            const scanBody = { productCode: value };
            if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(scanBody);
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.selectedNumber)}/scan`,
                scanBody
            );
            STATE.currentPbh = res.pbh;
            renderDetail();
            loadHistory(STATE.selectedNumber);
            const t = res.pbh?.totals || {};
            if (t.isComplete) {
                // Đủ hết SP → server tự set 'packed' (đã đối soát + đóng gói luôn,
                // không cần bấm nút Đóng gói).
                feedback(
                    `✓✓ ĐỦ HÀNG — ĐÃ ĐỐI SOÁT XONG ${STATE.selectedNumber} (tự đóng gói). Quét bill kế tiếp →`,
                    false,
                    true
                );
                loadList();
            } else {
                feedback(`✓ ${value} (${t.picked}/${t.quantity})`);
            }
        } catch (e) {
            feedback('✗ ' + e.message, true);
        }
    }

    function focusScanner() {
        const inp = document.getElementById('rcScannerInput');
        if (inp) inp.focus();
    }

    // ---------- history (audit log) ----------
    // 2026-06-06: hiển thị lịch sử đối soát chi tiết (ngày giờ + user + thao tác).
    // Mỗi lần quét / tích tay / đóng gói / giao đều ghi log server (pbh_fulfillment_logs)
    // → fetch /:number/logs và render qua Web2HistoryTimeline (timestamp vi-VN có giây).
    const RC_HISTORY_LABELS = {
        scan: '🔫 Quét mã',
        'manual-pick': '✋ Tích tay',
        'reset-pick': '↺ Reset pick',
        pack: '📦 Đóng gói',
        ship: '🚚 Giao shipper',
        deliver: '✅ Đã giao',
        'return-failed': '↩ Trả về kho',
    };
    function historyNote(l) {
        const p = l.payload || {};
        const parts = [];
        if (p.productCode) parts.push(p.productCode);
        if (p.pickedQty != null) parts.push(`SL ${p.pickedQty}`);
        if (l.stateBefore && l.stateAfter && l.stateBefore !== l.stateAfter) {
            const a = STATE_LABELS[l.stateBefore] || l.stateBefore;
            const b = STATE_LABELS[l.stateAfter] || l.stateAfter;
            parts.push(`${a} → ${b}`);
        }
        // Tích tay (manual-pick) → luôn gắn cờ đối chiếu camera (suy ra từ action type,
        // bền vững kể cả log cũ chưa có payload.note). pickedQty=0 = bỏ tích, không gắn.
        if (l.action === 'manual-pick' && (p.pickedQty == null || p.pickedQty > 0)) {
            parts.push('📹 đối chiếu camera');
        }
        // p.note/reason khác (tránh lặp với cờ camera đã thêm ở trên)
        const extra = p.note || p.reason;
        if (extra && extra !== MANUAL_CAMERA_NOTE) parts.push(extra);
        return parts.join(' · ');
    }
    async function loadHistory(number) {
        if (!number) return;
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}/logs`);
            const items = (res.logs || []).map((l) => ({
                action: l.action,
                ts: l.createdAt,
                userName: l.userName,
                userId: l.userId,
                note: historyNote(l),
            }));
            // Logs về newest-first sẵn (ORDER BY created_at DESC) → giữ nguyên (newestFirst:false).
            STATE.historyHtml = window.Web2HistoryTimeline
                ? window.Web2HistoryTimeline.render(items, {
                      titleText: 'Lịch sử đối soát',
                      newestFirst: false,
                  })
                : '';
            // Chỉ inject nếu vẫn đang mở đúng PBH này.
            if (STATE.currentPbh?.number === number) {
                const el = document.getElementById('rcHistory');
                if (el) el.innerHTML = STATE.historyHtml;
            }
        } catch {
            /* lỗi tải lịch sử — không chặn flow chính */
        }
    }

    // ---------- audit modal (lịch sử toàn bộ — đối chiếu camera) ----------
    // 2026-06-06: user cần filter chi tiết (chủ yếu tích tay theo thời gian) để soi camera.
    const AUDIT = { action: 'manual-pick', from: null, to: null, search: '' };
    let _auditSearchTimer = null;
    let _bodyLockY = 0;

    function pad2(n) {
        return String(n).padStart(2, '0');
    }
    function fmtTsFull(ts) {
        const d = new Date(Number(ts));
        return (
            `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ` +
            `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
        );
    }
    // ms → 'YYYY-MM-DDTHH:MM' (giá trị input datetime-local, theo local time)
    function tsToInput(ts) {
        if (!ts) return '';
        const d = new Date(Number(ts));
        return (
            `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
            `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
        );
    }
    function inputToTs(val) {
        if (!val) return null;
        const t = new Date(val).getTime();
        return Number.isFinite(t) ? t : null;
    }
    function lockBody() {
        _bodyLockY = window.scrollY || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${_bodyLockY}px`;
        document.body.style.width = '100%';
    }
    function unlockBody() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, _bodyLockY);
    }

    function openAuditModal() {
        const overlay = document.getElementById('rcAuditOverlay');
        if (!overlay) return;
        // Mặc định: tích tay + hôm nay (00:00 → giờ hiện tại).
        if (AUDIT.from == null && AUDIT.to == null) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            AUDIT.from = start.getTime();
            AUDIT.to = now.getTime();
        }
        syncAuditInputs();
        overlay.hidden = false;
        lockBody();
        if (window.lucide) window.lucide.createIcons();
        fetchAudit();
    }
    function closeAuditModal() {
        const overlay = document.getElementById('rcAuditOverlay');
        if (!overlay) return;
        overlay.hidden = true;
        unlockBody();
    }
    function syncAuditInputs() {
        const fEl = document.getElementById('rcAuditFrom');
        const tEl = document.getElementById('rcAuditTo');
        const sEl = document.getElementById('rcAuditSearch');
        if (fEl) fEl.value = tsToInput(AUDIT.from);
        if (tEl) tEl.value = tsToInput(AUDIT.to);
        if (sEl) sEl.value = AUDIT.search;
        document.querySelectorAll('#rcAuditChips .rc-achip').forEach((c) => {
            c.classList.toggle('is-active', (c.dataset.action || '') === AUDIT.action);
        });
    }
    async function fetchAudit() {
        const box = document.getElementById('rcAuditResults');
        const countEl = document.getElementById('rcAuditCount');
        if (box) box.innerHTML = '<div class="rc-audit-loading">Đang tải…</div>';
        try {
            const q = new URLSearchParams();
            if (AUDIT.action) q.set('action', AUDIT.action);
            if (AUDIT.from) q.set('from', String(AUDIT.from));
            if (AUDIT.to) q.set('to', String(AUDIT.to));
            if (AUDIT.search) q.set('search', AUDIT.search);
            q.set('limit', '500');
            const res = await api('GET', `/logs?${q.toString()}`);
            renderAuditResults(res.logs || []);
            if (countEl) countEl.textContent = `${(res.logs || []).length} kết quả`;
        } catch (e) {
            if (box)
                box.innerHTML = `<div class="rc-audit-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
            if (countEl) countEl.textContent = '—';
        }
    }
    function renderAuditResults(logs) {
        const box = document.getElementById('rcAuditResults');
        if (!box) return;
        if (!logs.length) {
            box.innerHTML = '<div class="rc-audit-empty">Không có lịch sử khớp bộ lọc</div>';
            return;
        }
        const rows = logs
            .map((l) => {
                const p = l.payload || {};
                const label = RC_HISTORY_LABELS[l.action] || l.action;
                const isManual =
                    l.action === 'manual-pick' && (p.pickedQty == null || p.pickedQty > 0);
                const cam = isManual ? '<span class="rc-audit-cam">📹 camera</span>' : '';
                const trans =
                    l.stateBefore && l.stateAfter && l.stateBefore !== l.stateAfter
                        ? `${STATE_LABELS[l.stateBefore] || l.stateBefore} → ${STATE_LABELS[l.stateAfter] || l.stateAfter}`
                        : '';
                return `
                <tr class="rc-audit-rowitem cv-auto ${isManual ? 'is-manual' : ''}">
                    <td class="rc-audit-ts">${fmtTsFull(l.createdAt)}</td>
                    <td class="rc-audit-pbh"><button type="button" class="rc-audit-open" data-number="${escapeHtml(l.pbhNumber)}">${escapeHtml(l.pbhNumber)}</button></td>
                    <td class="rc-audit-act">${escapeHtml(label)} ${cam}</td>
                    <td class="rc-audit-sp">${escapeHtml(p.productCode || '')}${p.pickedQty != null ? ` · SL ${escapeHtml(String(p.pickedQty))}` : ''}<div class="rc-audit-trans">${escapeHtml(trans)}</div></td>
                    <td class="rc-audit-user">${escapeHtml(l.userName || l.userId || '(ẩn danh)')}</td>
                </tr>`;
            })
            .join('');
        box.innerHTML = `
            <table class="rc-audit-table">
                <thead><tr>
                    <th>Thời gian</th><th>PBH</th><th>Thao tác</th><th>Sản phẩm</th><th>Người</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        // PBH clickable → mở chi tiết + đóng modal
        box.querySelectorAll('.rc-audit-open').forEach((btn) => {
            btn.addEventListener('click', () => {
                const n = btn.dataset.number;
                closeAuditModal();
                selectPbh(n); // load chi tiết bất kể tab đang lọc gì
            });
        });
    }
    function bindAuditUi() {
        const btn = document.getElementById('rcAuditBtn');
        if (btn) btn.addEventListener('click', openAuditModal);
        const close = document.getElementById('rcAuditClose');
        if (close) close.addEventListener('click', closeAuditModal);
        const overlay = document.getElementById('rcAuditOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeAuditModal(); // click nền ngoài → đóng
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) closeAuditModal();
        });
        const chips = document.getElementById('rcAuditChips');
        if (chips) {
            chips.addEventListener('click', (e) => {
                const c = e.target.closest('.rc-achip');
                if (!c) return;
                AUDIT.action = c.dataset.action || '';
                syncAuditInputs();
                fetchAudit();
            });
        }
        document.querySelectorAll('.rc-audit-quick').forEach((q) => {
            q.addEventListener('click', () => {
                const now = new Date();
                let from;
                if (q.dataset.range === '2h') from = now.getTime() - 2 * 3600 * 1000;
                else if (q.dataset.range === '7d') from = now.getTime() - 7 * 86400 * 1000;
                else {
                    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    from = s.getTime();
                }
                AUDIT.from = from;
                AUDIT.to = now.getTime();
                syncAuditInputs();
                fetchAudit();
            });
        });
        const apply = document.getElementById('rcAuditApply');
        if (apply) {
            apply.addEventListener('click', () => {
                AUDIT.from = inputToTs(document.getElementById('rcAuditFrom')?.value);
                AUDIT.to = inputToTs(document.getElementById('rcAuditTo')?.value);
                AUDIT.search = document.getElementById('rcAuditSearch')?.value.trim() || '';
                fetchAudit();
            });
        }
        const search = document.getElementById('rcAuditSearch');
        if (search) {
            search.addEventListener('input', (e) => {
                AUDIT.search = e.target.value.trim();
                clearTimeout(_auditSearchTimer);
                _auditSearchTimer = setTimeout(fetchAudit, 300);
            });
        }
    }

    // ---------- SSE ----------
    function setupSse() {
        if (!window.Web2SSE) return;
        // Topic riêng: web2:reconcile
        window.Web2SSE.subscribe('web2:reconcile', (msg) => {
            const data = msg?.data || msg;
            if (!data) return;
            // Refresh list
            loadList();
            // Nếu là PBH đang mở → refresh detail
            if (data.number && STATE.selectedNumber === data.number) {
                api('GET', `/${encodeURIComponent(data.number)}`)
                    .then((res) => {
                        STATE.currentPbh = res.pbh;
                        renderDetail();
                        loadHistory(data.number);
                    })
                    .catch(() => {});
            }
        });
        // Cross: PBH thay đổi (vd PBH mới được confirm) → refresh list
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => {
            loadList();
        });
    }

    // ---------- init ----------
    function bindUi() {
        const refresh = document.getElementById('rcRefreshBtn');
        if (refresh) refresh.addEventListener('click', loadList);

        const search = document.getElementById('rcSearch');
        let searchTimer = null;
        if (search) {
            search.addEventListener('input', (e) => {
                STATE.search = e.target.value;
                clearTimeout(searchTimer);
                searchTimer = setTimeout(loadList, 250);
            });
        }

        const tabs = document.getElementById('rcStateTabs');
        if (tabs) {
            tabs.addEventListener('click', (e) => {
                const t = e.target.closest('.rc-tab');
                if (!t) return;
                tabs.querySelectorAll('.rc-tab').forEach((x) => x.classList.remove('is-active'));
                t.classList.add('is-active');
                STATE.filterState = t.dataset.state;
                loadList();
            });
        }

        const scanner = document.getElementById('rcScannerInput');
        if (scanner) {
            scanner.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = scanner.value;
                    scanner.value = '';
                    onScannerSubmit(val);
                }
            });
            // Auto refocus after blur (1s grace for clicking buttons)
            scanner.addEventListener('blur', () => {
                setTimeout(() => {
                    if (
                        document.activeElement?.tagName !== 'INPUT' &&
                        document.activeElement?.tagName !== 'BUTTON'
                    ) {
                        focusScanner();
                    }
                }, 1000);
            });
        }

        // 2026-06-06: click bất kỳ đâu trên hộp quét → focus input (không cần click trúng ô).
        const scannerBox = document.querySelector('.rc-scanner-box');
        if (scannerBox) {
            scannerBox.addEventListener('click', focusScanner);
        }

        // 2026-06-06: router phím toàn cục — máy quét = bàn phím; nếu đang không gõ vào
        // ô nhập nào khác (search/checkbox/button) thì TỰ ĐƯA ký tự vào ô quét.
        // → quét nhận ngay, KHÔNG cần bấm chuột vào ô trước. Inject ký tự để không
        // mất ký tự đầu khi focus đang ở chỗ khác (focus giữa keydown hay rớt char đầu).
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (!scanner) return;
                const ae = document.activeElement;
                if (ae === scanner) return; // đã focus đúng ô → handler riêng của ô lo
                const tag = ae?.tagName;
                const typingElsewhere =
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    ae?.isContentEditable;
                if (typingElsewhere) return; // user đang gõ ô khác (search…) — đừng cướp focus
                if (e.key === 'Enter') {
                    e.preventDefault();
                    scanner.focus();
                    const v = scanner.value;
                    scanner.value = '';
                    if (v) onScannerSubmit(v);
                } else if (e.key.length === 1) {
                    // ký tự đơn của mã SP/barcode → focus + chèn để không rớt
                    e.preventDefault();
                    scanner.focus();
                    scanner.value += e.key;
                }
            },
            true
        );
    }

    async function init() {
        // Bổ sung nhãn VN cho các action đối soát vào timeline dùng chung.
        if (window.Web2HistoryTimeline?.ACTION_LABEL) {
            Object.assign(window.Web2HistoryTimeline.ACTION_LABEL, RC_HISTORY_LABELS);
        }
        bindUi();
        bindAuditUi();
        await loadList();
        setupSse();
        focusScanner();
        if (window.lucide) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
