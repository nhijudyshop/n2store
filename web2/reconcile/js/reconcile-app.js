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
        renderList();
        const target = document.getElementById('rcScannerTarget');
        target.textContent = `PBH: ${number}`;
        target.classList.add('is-active');
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}`);
            STATE.currentPbh = res.pbh;
            renderDetail();
            focusScanner();
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
                        ${p.lines.map(renderLine).join('')}
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
        `;

        // 2026-06-04: bỏ manual pick input — workflow scanner-only (quét barcode SP → +1).

        // Bind action buttons
        const b = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        b('rcBtnReset', resetPick);
        b('rcBtnPack', packOrder);
        b('rcBtnShip', shipOrder);
        b('rcBtnDeliver', deliverOrder);
        b('rcBtnReturnFailed', returnFailedOrder);

        if (window.lucide) window.lucide.createIcons();
    }

    // 2026-06-04: scanner-only — bỏ input chỉnh SL. Quét barcode SP → +1 (server).
    // Hiển thị got/need read-only + ✓ khi đủ. KHÔNG cho sửa tay.
    function renderLine(l) {
        const need = l.quantity;
        const got = l.picked_qty || 0;
        const pct = need ? Math.min(100, Math.round((got / need) * 100)) : 0;
        const done = got >= need;
        const cls = done ? 'is-complete' : got > 0 ? 'is-partial' : '';
        const img = l.imageUrl
            ? `<img class="rc-line-img" src="${escapeHtml(l.imageUrl)}" alt="" loading="lazy"
                   onerror="this.style.visibility='hidden'" />`
            : `<span class="rc-line-img rc-line-img-empty"><i data-lucide="image"></i></span>`;
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
                <td class="rc-line-code"><strong>${escapeHtml(l.productCode || '')}</strong></td>
                <td class="rc-line-qty">${need}</td>
                <td class="rc-line-picked">
                    <span class="rc-picked-count ${done ? 'is-done' : got > 0 ? 'is-partial' : ''}">${got}/${need}</span>
                    ${done ? '<i data-lucide="check" class="rc-picked-check"></i>' : ''}
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
    async function onManualPickChange(e) {
        const productCode = e.target.dataset.pcode;
        const pickedQty = parseInt(e.target.value, 10) || 0;
        const number = STATE.currentPbh?.number;
        if (!number) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(number)}/manual-pick`, {
                productCode,
                pickedQty,
            });
            STATE.currentPbh = res.pbh;
            renderDetail();
        } catch (err) {
            notify(err.message, 'error');
            renderDetail(); // revert
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

    async function shipOrder() {
        if (!STATE.currentPbh) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(STATE.currentPbh.number)}/ship`);
            STATE.currentPbh = res.pbh;
            renderDetail();
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
            const res = await api('POST', `/${encodeURIComponent(STATE.selectedNumber)}/scan`, {
                productCode: value,
            });
            STATE.currentPbh = res.pbh;
            renderDetail();
            const t = res.pbh?.totals || {};
            if (t.isComplete) {
                // Đủ hết SP trong đơn → server tự set fulfillment_state='picked' → ĐÃ CHECK XONG.
                feedback(
                    `✓✓ ĐỦ HÀNG — ĐÃ CHECK XONG ${STATE.selectedNumber}. Quét bill kế tiếp →`,
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
    }

    async function init() {
        bindUi();
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
