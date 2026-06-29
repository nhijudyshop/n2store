// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — render layer: rows/pagination/counters + usage badge +
 * bulk selection + in-place row update + data load().
 * [SPLIT 2026-06-18] tách từ web2-products-app.js. Dùng namespace nội bộ
 * window.Web2ProductsCore (W). Cross-module call qua W.foo(...).
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});
    const STATE = W.STATE;
    // Local aliases — đọc-thuần helpers (không reassign), an toàn capture verbatim.
    const escapeHtml = W.escapeHtml;
    const escJs = W.escJs;
    const safeImageUrl = W.safeImageUrl;
    const fmtPrice = W.fmtPrice;
    const originPriceHover = W.originPriceHover;
    const notify = W.notify;
    const cssEscape = W.cssEscape;
    const $ = W.$;
    const tbody = W.tbody;
    const counter = W.counter;
    const searchCount = W.searchCount;
    const pag = W.pag;

    // ---------- Render ----------
    //
    // Badge trạng thái (CHỜ HÀNG / MUA 1 PHẦN / Đang bán / Tạm dừng) — 1 nguồn,
    // dùng chung dòng thường + bảng con biến thể.
    function _statusBadgeHtml(p) {
        if (p.status === 'CHO_MUA') {
            const pendingTxt = Number(p.pendingQty) > 0 ? ` (×${p.pendingQty})` : '';
            return `<span class="active-badge active-pending" title="Chờ Mua hàng từ NCC${p.supplier ? ' ' + p.supplier : ''}"><i data-lucide="clock"></i>CHỜ HÀNG${pendingTxt}</span>`;
        }
        if (p.status === 'MUA_1_PHAN') {
            const stock = Number(p.stock || 0);
            const pend = Number(p.pendingQty || 0);
            return `<span class="active-badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;" title="Đã nhận ${stock} cái, còn ${pend} cái chờ mua tiếp từ NCC ${p.supplier || '?'}"><i data-lucide="package-2"></i>MUA 1 PHẦN <span style="opacity:0.85;font-weight:500;margin-left:4px;">(${stock} đã nhận · ${pend} chờ)</span></span>`;
        }
        // HẾT HÀNG (logic mới 2026-06-28): đã bán hết tồn → mất hiệu lực, tự ẩn khỏi
        // Kho SP (filter mặc định) + bảng live; còn ở gợi ý Số Order để nhập lại.
        if (p.status === 'HET_HANG') {
            return `<span class="active-badge" style="background:#f3f4f6;color:#6b7280;border-color:#d1d5db;" title="Đã bán hết — nhập lại từ Số Order để bán tiếp"><i data-lucide="archive"></i>HẾT HÀNG</span>`;
        }
        return p.isActive
            ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>`
            : `<span class="active-badge active-no"><i data-lucide="pause"></i>Tạm dừng</span>`;
    }
    // Cụm nút thao tác 1 SP (sửa/in/tạm dừng/lịch sử/xóa) — dùng chung.
    function _rowActionsHtml(p) {
        const c = escapeHtml(escJs(p.code));
        return (
            `<button class="btn-action act-edit" title="Sửa" onclick="Web2ProductsApp.openEdit('${c}')"><i data-lucide="pencil"></i></button>` +
            `<button class="btn-action act-print" title="${Number(p.printCount) > 0 ? `Tem mã vạch đã in ${Number(p.printCount)} lần — tránh in trùng` : 'In tem mã vạch'}" aria-label="In tem mã vạch" onclick="Web2ProductsApp.printBarcode('${c}')"><i data-lucide="printer"></i>${Number(p.printCount) > 0 ? `<span class="print-count-num">${Number(p.printCount)}</span>` : ''}</button>` +
            `<button class="btn-action act-confirm" title="${p.isActive ? 'Tạm dừng' : 'Bán lại'}" onclick="Web2ProductsApp.toggleActive('${c}', ${!p.isActive})"><i data-lucide="${p.isActive ? 'pause' : 'play'}"></i></button>` +
            `<button class="btn-action act-history" title="Lịch sử chỉnh sửa" onclick="Web2ProductsApp.openHistory('${c}')"><i data-lucide="history"></i></button>` +
            `<button class="btn-action act-delete" title="Xóa" onclick="Web2ProductsApp.remove('${c}')"><i data-lucide="trash-2"></i></button>`
        );
    }

    // _rowHtml(p, n) — render 1 <tr> cho 1 product với index n.
    // Tách thành helper để dùng được cho cả full renderRows() và in-place
    // update (tránh giật bảng khi SSE event update).
    function _rowHtml(p, n, opts) {
        opts = opts || {};
        const isChild = !!opts.child; // dòng CON dưới 1 SP cha (thụt lề + ↳)
        const imgSrc = safeImageUrl(p.imageUrl);
        const imgHtml = imgSrc
            ? `<img class="product-image" src="${escapeHtml(imgSrc)}" alt="" loading="lazy"
                       onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','inline-flex');">` +
              `<span class="product-image-placeholder" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="product-image-placeholder"><i data-lucide="image"></i></span>`;
        const stockClass = p.stock === 0 ? 'zero' : p.stock < 5 ? 'low' : '';
        const priceBuy = Number(p.originalPrice) || 0;
        const priceSell = Number(p.price) || 0;
        // Hover hiện giá gốc ngoại tệ (vd CNY) cho SP nhập từ tab so-order ≠ VND.
        const oBuy = originPriceHover(priceBuy, p);
        const oSell = originPriceHover(priceSell, p);
        const oStyle =
            ' style="cursor:help;text-decoration:underline dotted #94a3b8 2px;text-underline-offset:3px;"';
        const buyAttr = oBuy.hasOrigin ? ` title="${escapeHtml(oBuy.title)}"${oStyle}` : '';
        const sellAttr = oSell.hasOrigin ? ` title="${escapeHtml(oSell.title)}"${oStyle}` : '';
        const variantText = (p.variant || '').trim();
        const checked = STATE.selectedCodes.has(p.code) ? ' checked' : '';
        const rowSelectedClass = STATE.selectedCodes.has(p.code) ? ' is-selected' : '';
        const trClass = (
            rowSelectedClass +
            (isChild ? ' is-child' : '') +
            (opts.childFirst ? ' is-child-first' : '') +
            (opts.childLast ? ' is-child-last' : '')
        ).trim();
        const nameCell = isChild
            ? `<td><div class="w2p-child-name" style="font-weight:500;"><span class="w2p-child-arrow">↳</span>${escapeHtml(p.name)}</div></td>`
            : `<td><div style="font-weight:600;">${escapeHtml(p.name)}</div></td>`;
        return `
                <tr data-code="${escapeHtml(p.code)}" class="${trClass}">
                    <td class="select-cell"><input type="checkbox" class="w2p-checkbox" data-select-code="${escapeHtml(p.code)}"${checked} /></td>
                    <td>${n}</td>
                    <td>${imgHtml}</td>
                    <td><span class="code-badge code-product" onclick="Web2ProductsApp.copyCode('${escapeHtml(escJs(p.code))}')"><i data-lucide="tag"></i>${escapeHtml(p.code)}</span></td>
                    ${nameCell}
                    <td class="variant-cell">
                        <div class="variant-stack">${
                            variantText
                                ? `<span class="variant-pill">${escapeHtml(variantText)}</span>`
                                : '<span class="variant-empty">—</span>'
                        }<span class="stock-badge ${stockClass}" title="Tồn kho"><i data-lucide="package"></i>Tồn: ${p.stock ?? 0}</span>${
                            Number(p.returnQty) > 0
                                ? `<span class="stock-badge" title="Có ${Number(p.returnQty)} tồn kho THU VỀ đang chờ duyệt (Shipper gửi). Vào trang Thu về để duyệt → cộng vào tồn thật." style="background:#e8f2ff;color:#0058da;border-color:#dbeafe;"><i data-lucide="undo-2"></i>Thu về: ${Number(p.returnQty)}</span>`
                                : ''
                        }</div>
                    </td>
                    <td class="price-cell price-buy"${buyAttr}>${fmtPrice(priceBuy)}</td>
                    <td class="price-cell price-sell"${sellAttr}>${fmtPrice(priceSell)}</td>
                    <td class="region-cell">${p.region ? `<span class="w2p-region-badge">${escapeHtml(p.region)}</span>` : '<span class="w2p-region-empty">—</span>'}</td>
                    <td class="note-cell" title="${escapeHtml(p.note || '')}"><div class="web2-note-cell">${escapeHtml(p.note || '—')}</div></td>
                    <td>${_statusBadgeHtml(p)}</td>
                    <td>
                        <div class="row-actions">${_rowActionsHtml(p)}</div>
                    </td>
                </tr>`;
    }

    // Dòng CHA (P4 cha-con): gom SP cùng cha/cùng tên nhiều biến thể → 1 dòng tổng,
    // expand xem các CON. Cột Biến Thể liệt kê mọi biến thể + tổng tồn; Trạng thái
    // tính gộp. Checkbox chọn CHA = chọn tất cả CON. Hành động sửa/in nằm ở dòng CON.
    // Mã CHA hiển thị → dùng module CHUNG Web2ProductGroup.parentCode (parent_code
    // thật / tiền tố chung mã con). Fallback rỗng nếu module chưa load.
    function _parentDisplayCode(g) {
        return (window.Web2ProductGroup && window.Web2ProductGroup.parentCode(g.variants)) || '';
    }

    function _parentRowHtml(g, n, expanded) {
        const imgSrc = safeImageUrl(g.imageUrl);
        const imgHtml = imgSrc
            ? `<img class="product-image" src="${escapeHtml(imgSrc)}" alt="" loading="lazy"
                       onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','inline-flex');">` +
              `<span class="product-image-placeholder" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="product-image-placeholder"><i data-lucide="image"></i></span>`;
        const childCodes = g.variants.map((v) => v.code).filter(Boolean);
        const totalStock = Number(g.totalStock) || 0;
        const totalPending = Number(g.totalPending) || 0;
        const stockClass = totalStock === 0 ? 'zero' : totalStock < 5 ? 'low' : '';
        const pills = g.variants
            .map(
                (v) =>
                    `<span class="variant-pill">${escapeHtml((v.variant || '').trim() || '—')}</span>`
            )
            .join('');
        const rep = (g.variants[0] && g.variants[0].orig) || {};
        const statusHtml =
            totalStock > 0
                ? totalPending > 0
                    ? `<span class="active-badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;" title="Tổng: đã nhận ${totalStock}, còn ${totalPending} chờ mua"><i data-lucide="package-2"></i>MUA 1 PHẦN</span>`
                    : `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>`
                : totalPending > 0
                  ? `<span class="active-badge active-pending" title="Tổng còn chờ hàng các biến thể"><i data-lucide="clock"></i>CHỜ HÀNG (×${totalPending})</span>`
                  : // totalStock=0 && totalPending=0 → tất cả biến thể đã bán hết →
                    // HẾT HÀNG (khớp _recomputeParent backend; logic mới 2026-06-28).
                    `<span class="active-badge" style="background:#f3f4f6;color:#6b7280;border-color:#d1d5db;" title="Tất cả biến thể đã bán hết — nhập lại từ Số Order"><i data-lucide="archive"></i>HẾT HÀNG</span>`;
        const allSel = childCodes.length && childCodes.every((c) => STATE.selectedCodes.has(c));
        const someSel = childCodes.some((c) => STATE.selectedCodes.has(c));
        const gkey = escapeHtml(g.key);
        const parentCode = _parentDisplayCode(g);
        // MÃ SP: mã CHA (nếu có) hiện ra cột như SP thường + nhãn "N biến thể" nhỏ dưới.
        const codeCell = parentCode
            ? `<span class="code-badge code-product code-parent" title="Mã sản phẩm cha" onclick="Web2ProductsApp.copyCode('${escapeHtml(escJs(parentCode))}')"><i data-lucide="tag"></i>${escapeHtml(parentCode)}</span><span class="w2p-group-badge w2p-group-badge-sub" title="${g.variantCount} biến thể con"><i data-lucide="layers"></i>${g.variantCount} biến thể</span>`
            : `<span class="w2p-group-badge" title="Sản phẩm cha — ${g.variantCount} biến thể"><i data-lucide="layers"></i>${g.variantCount} biến thể</span>`;
        return `
                <tr class="is-parent${expanded ? ' is-expanded' : ''}${allSel ? ' is-selected' : ''}" data-group-key="${gkey}">
                    <td class="select-cell"><input type="checkbox" class="w2p-checkbox w2p-checkbox-parent" data-select-codes="${escapeHtml(childCodes.join(','))}"${allSel ? ' checked' : ''} aria-label="Chọn cả nhóm" /></td>
                    <td>${n}</td>
                    <td>${imgHtml}</td>
                    <td><div class="w2p-parent-code">${codeCell}</div></td>
                    <td><div class="w2p-parent-name" style="font-weight:700;display:flex;align-items:center;gap:6px;">
                        <button class="w2p-expand-toggle${expanded ? ' is-open' : ''}" data-group-key="${gkey}" title="${expanded ? 'Thu gọn' : 'Xem các biến thể'}" aria-expanded="${expanded ? 'true' : 'false'}"><i data-lucide="chevron-right"></i></button>
                        ${escapeHtml(g.name)}</div></td>
                    <td class="variant-cell">
                        <div class="variant-stack">${pills}<span class="stock-badge ${stockClass}" title="Tổng tồn các biến thể"><i data-lucide="package"></i>Tồn: ${totalStock}</span></div>
                    </td>
                    <td class="price-cell price-buy">${fmtPrice(Number(rep.originalPrice) || 0)}</td>
                    <td class="price-cell price-sell">${fmtPrice(Number(rep.price) || 0)}</td>
                    <td class="region-cell">${g.region ? `<span class="w2p-region-badge">${escapeHtml(g.region)}</span>` : '<span class="w2p-region-empty">—</span>'}</td>
                    <td class="note-cell"><div class="web2-note-cell">—</div></td>
                    <td>${statusHtml}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action w2p-expand-toggle${expanded ? ' is-open' : ''}" data-group-key="${gkey}" title="${expanded ? 'Thu gọn' : 'Xem các biến thể'}"><i data-lucide="chevron-down"></i></button>
                        </div>
                    </td>
                </tr>`;
    }

    // Bảng CON (khi expand): render các biến thể con thành 1 BẢNG RIÊNG nhúng (drawer)
    // qua module CHUNG Web2ProductGroup.childPanelHtml — khung & style đồng nhất với
    // các trang SP khác. Trang chỉ cấp CỘT riêng (colHeaders) + nội dung dòng con.
    // Mỗi con vẫn đủ nút Sửa/In/Tạm dừng/Lịch sử/Xóa + checkbox chọn.
    const _CHILD_COLS = [
        '',
        'Ảnh',
        'Mã SP',
        'Biến thể / Tồn',
        'Giá mua',
        'Giá bán',
        'Địa danh',
        'Trạng thái',
        'Thao tác',
    ];
    function _childRowHtml(p) {
        const code = escapeHtml(p.code);
        const imgSrc = safeImageUrl(p.imageUrl);
        const img = imgSrc
            ? `<img class="w2pg-img" src="${escapeHtml(imgSrc)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
            : `<span class="w2pg-img w2pg-noimg"><i data-lucide="image"></i></span>`;
        const variantText = (p.variant || '').trim();
        const stock = p.stock ?? 0;
        const stockClass = stock === 0 ? 'zero' : stock < 5 ? 'low' : '';
        const checked = STATE.selectedCodes.has(p.code) ? ' checked' : '';
        const selClass = STATE.selectedCodes.has(p.code) ? ' is-selected' : '';
        return `<tr class="w2pg-row${selClass}" data-code="${code}">
            <td class="w2pg-sel"><input type="checkbox" class="w2p-checkbox" data-select-code="${code}"${checked} /></td>
            <td class="w2pg-imgcell">${img}</td>
            <td><span class="code-badge code-product" onclick="Web2ProductsApp.copyCode('${escapeHtml(escJs(p.code))}')"><i data-lucide="tag"></i>${code}</span></td>
            <td><div class="variant-stack">${
                variantText
                    ? `<span class="variant-pill">${escapeHtml(variantText)}</span>`
                    : '<span class="variant-empty">—</span>'
            }<span class="stock-badge ${stockClass}" title="Tồn kho"><i data-lucide="package"></i>Tồn: ${stock}</span></div></td>
            <td class="price-cell price-buy">${fmtPrice(Number(p.originalPrice) || 0)}</td>
            <td class="price-cell price-sell">${fmtPrice(Number(p.price) || 0)}</td>
            <td>${p.region ? `<span class="w2p-region-badge">${escapeHtml(p.region)}</span>` : '<span class="w2p-region-empty">—</span>'}</td>
            <td>${_statusBadgeHtml(p)}</td>
            <td><div class="row-actions">${_rowActionsHtml(p)}</div></td>
        </tr>`;
    }
    function _childPanelHtml(g) {
        const PG = window.Web2ProductGroup;
        const rowsHtml = g.variants.map((v) => _childRowHtml(v.orig || {})).join('');
        if (PG && PG.childPanelHtml) {
            return PG.childPanelHtml({
                key: g.key,
                name: g.name,
                count: g.variantCount,
                colspan: 12,
                colHeaders: _CHILD_COLS,
                rowsHtml,
            });
        }
        // Fallback (module chưa load) — render thô để không vỡ.
        return `<tr class="w2pg-drawer"><td colspan="12"><table class="w2pg-table"><tbody>${rowsHtml}</tbody></table></td></tr>`;
    }

    function renderRows() {
        const items = STATE.products;
        if (!items.length) {
            tbody().innerHTML = `<tr><td colspan="12" class="empty-row">
                Chưa có sản phẩm — bấm "Thêm SP" để tạo
            </td></tr>`;
            _updateSelectAllState();
            _updateBulkBar();
            return;
        }
        const baseN = (STATE.page - 1) * STATE.limit;
        const VG = window.Web2VariantGroup;
        if (VG && VG.group) {
            // Gom CHA-CON: parent_code khi có (Migration 070), fallback name+supplier+
            // region (SP phẳng cùng tên cùng nguồn). Giữ THỨ TỰ gốc của bảng (theo vị
            // trí xuất hiện đầu tiên trong STATE.products) — KHÔNG sort lại theo tên.
            const orderIdx = new Map(items.map((p, i) => [p.code, i]));
            const firstIdx = (g) =>
                Math.min(...g.variants.map((v) => orderIdx.get(v.code) ?? Number.MAX_SAFE_INTEGER));
            const groups = VG.group(items, { by: 'parent' }).sort(
                (a, b) => firstIdx(a) - firstIdx(b)
            );
            let n = baseN;
            const html = [];
            for (const g of groups) {
                if (g.variantCount <= 1) {
                    n += 1;
                    html.push(_rowHtml((g.variants[0] && g.variants[0].orig) || {}, n));
                } else {
                    // CHA hiển thị BÌNH THƯỜNG như SP khác; chỉ khi EXPAND mới tách
                    // các CON ra cho dễ nhìn (style ở .is-child).
                    n += 1;
                    const expanded = STATE.expandedParents.has(g.key);
                    html.push(_parentRowHtml(g, n, expanded));
                    if (expanded) html.push(_childPanelHtml(g)); // bảng con riêng (drawer)
                }
            }
            tbody().innerHTML = html.join('');
        } else {
            tbody().innerHTML = items.map((p, idx) => _rowHtml(p, baseN + idx + 1)).join('');
        }
        if (window.lucide) lucide.createIcons();
        _updateSelectAllState();
        _updateBulkBar();
    }

    // ---------- Bulk selection (P1 2026-05-30) ----------
    //
    // Selection persist qua paginate/filter — STATE.selectedCodes là Set<code>.
    // Khi user filter/đổi trang, các code chọn ở trang khác vẫn được giữ.
    // Bulk bar fixed-bottom, chỉ hiện khi size > 0. Print dùng Web2ProductsCache
    // để lookup product objects (vì SP có thể ở trang khác, không có trong
    // STATE.products hiện tại).

    function _toggleSelect(code, checked) {
        if (!code) return;
        if (checked) STATE.selectedCodes.add(code);
        else STATE.selectedCodes.delete(code);
        const tr = tbody().querySelector(`tr[data-code="${cssEscape(code)}"]`);
        if (tr) tr.classList.toggle('is-selected', checked);
        _updateSelectAllState();
        _updateBulkBar();
    }

    function _updateBulkBar() {
        const bar = $('#w2pBulkBar');
        if (!bar) return;
        const n = STATE.selectedCodes.size;
        if (n === 0) {
            bar.hidden = true;
            return;
        }
        bar.hidden = false;
        const countEl = $('#w2pBulkCount');
        const printCountEl = $('#w2pBulkPrintCount');
        if (countEl) countEl.textContent = String(n);
        if (printCountEl) printCountEl.textContent = String(n);
    }

    function _updateSelectAllState() {
        const head = $('#selectAllProducts');
        if (!head) return;
        const visible = STATE.products.map((p) => p.code);
        if (!visible.length) {
            head.checked = false;
            head.indeterminate = false;
            return;
        }
        const sel = visible.filter((c) => STATE.selectedCodes.has(c)).length;
        head.checked = sel === visible.length;
        head.indeterminate = sel > 0 && sel < visible.length;
    }

    function _selectAllVisible(checked) {
        for (const p of STATE.products) {
            if (checked) STATE.selectedCodes.add(p.code);
            else STATE.selectedCodes.delete(p.code);
        }
        // Repaint checkboxes + row classes
        for (const inp of tbody().querySelectorAll('input[data-select-code]')) {
            inp.checked = checked;
            const tr = inp.closest('tr');
            if (tr) tr.classList.toggle('is-selected', checked);
        }
        _updateBulkBar();
    }

    function _clearSelection() {
        STATE.selectedCodes.clear();
        for (const inp of tbody().querySelectorAll('input[data-select-code]')) {
            inp.checked = false;
            const tr = inp.closest('tr');
            if (tr) tr.classList.remove('is-selected');
        }
        _updateSelectAllState();
        _updateBulkBar();
    }

    // PER-UNIT (2026-06-29): Kho SP in tem theo SL — gọi /ensure (server đọc SL
    // stock+pending → TOP-UP mint SP-001..SP-SL nếu thiếu) rồi gắn units. Tự tạo mã
    // cho SP chưa có unit (tạo trước feature / SL vừa tăng). SP không có SL → giữ
    // hành vi cũ (lặp mã SP). 1 call batch. Mutate BẢN CLONE caller truyền (đừng bẩn cache).
    async function _attachUnitsForPrint(products) {
        const base =
            window.API_CONFIG?.WORKER_URL ||
            window.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        let token = '';
        try {
            token = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token || '';
        } catch (_) {
            /* no token */
        }
        const list = (products || []).filter((p) => p.code);
        if (!list.length) return products;
        try {
            const r = await fetch(base + '/api/web2-product-units/ensure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'x-web2-token': token } : {}),
                },
                body: JSON.stringify({ productCodes: [...new Set(list.map((p) => p.code))] }),
            });
            const d = await r.json().catch(() => ({}));
            const byCode = d.byCode || {};
            for (const p of list) {
                const units = (byCode[p.code] || []).map((u) => ({
                    unitCode: u.unitCode,
                    qrUrl: location.origin + '/web2/unit-scan/?u=' + u.id,
                }));
                if (units.length) {
                    p.units = units;
                    p.quantity = units.length;
                }
            }
        } catch (_) {
            /* lỗi → in theo hành vi cũ (lặp mã SP) */
        }
        return products;
    }

    async function _bulkPrint() {
        if (!STATE.selectedCodes.size) {
            notify('Chưa chọn SP nào để in', 'warning');
            return;
        }
        if (!window.Web2ProductsPrint?.open) {
            notify('Print module chưa load, refresh trang', 'error');
            return;
        }
        // Gather products — selectedCodes có thể ở trang khác nên fallback qua
        // Web2ProductsCache trước, rồi STATE.products. CLONE để gắn units không bẩn cache.
        const cache = window.Web2ProductsCache;
        const collected = [];
        const missing = [];
        for (const code of STATE.selectedCodes) {
            const p = cache?.findByCode?.(code) || STATE.products.find((x) => x.code === code);
            if (p) collected.push({ ...p });
            else missing.push(code);
        }
        if (!collected.length) {
            notify('Không tìm thấy SP đã chọn (cache có thể chưa load)', 'error');
            return;
        }
        if (missing.length) {
            console.warn('[web2-products] bulk print missing codes:', missing);
        }
        // Gắn mã đơn vị + QR đã mint → in LẠI đúng tem từng món (quét ra đúng đơn/STT).
        await _attachUnitsForPrint(collected);
        window.Web2ProductsPrint.open(collected);
    }

    // In-place update — replace ONE row's HTML, GIỮ position trong bảng + KHÔNG
    // re-sort. Tránh giật bảng + sản phẩm vừa edit nhảy lên đầu.
    //   - Update STATE.products[idx] với data mới (giữ idx hiện tại)
    //   - querySelector tr[data-code=X] → replace với row HTML mới
    //   - Re-render lucide icons trong row đó
    function _updateRowInPlace(code, newProduct) {
        const idx = STATE.products.findIndex((p) => p.code === code);
        if (idx === -1) return false; // not on current page → caller should full-reload
        // AUDIT 2026-06-20 #LOW28: chống SSE self-echo đè bản mới hơn bằng bản cũ.
        // Bỏ qua nếu row hiện tại có updatedAt MỚI HƠN payload (echo trễ của chính tab).
        const cur = STATE.products[idx];
        const curTs = Number(cur?.updatedAt) || 0;
        const newTs = Number(newProduct?.updatedAt) || 0;
        if (curTs && newTs && newTs < curTs) return true; // đã hiển thị bản mới hơn
        STATE.products[idx] = newProduct;
        const tr = tbody().querySelector(`tr[data-code="${cssEscape(code)}"]`);
        if (!tr) return false;
        // SP là biến thể CON đang hiện trong bảng-con (drawer expand) → KHÔNG swap kiểu
        // dòng-chính (vỡ layout bảng con). Trả false để caller full reload (render lại
        // panel đúng + cập nhật tổng ở dòng cha).
        if (tr.closest('.w2pg-drawer')) return false;
        const stt = (STATE.page - 1) * STATE.limit + idx + 1;
        // Parse new row HTML into a DOM node, then swap.
        const tmp = document.createElement('tbody');
        tmp.innerHTML = _rowHtml(newProduct, stt).trim();
        const newTr = tmp.firstElementChild;
        if (!newTr) return false;
        tr.replaceWith(newTr);
        if (window.lucide) lucide.createIcons();
        return true;
    }

    // Patch NHIỀU row tại chỗ sau bulk op (confirm-purchase-partial, adjust-stock…).
    // Chỉ fetch + swap các code đang hiển thị trên page hiện tại → KHÔNG full reload,
    // KHÔNG giật bảng, giữ scroll + selection. Trả {handled, anyOnPage}:
    //   - handled=true  → đã patch xong (hoặc không có code nào on-page) → KHÔNG cần reload
    //   - handled=false → fetch lỗi → caller fallback full reload
    async function _updateRowsBatch(codes) {
        const onPage = (codes || []).filter((c) => STATE.products.some((p) => p.code === c));
        if (!onPage.length) return { handled: true, anyOnPage: false };
        let products = [];
        try {
            if (window.Web2ProductsApi.getBatch) {
                const r = await window.Web2ProductsApi.getBatch(onPage);
                products = r?.products || [];
            } else {
                const settled = await Promise.allSettled(
                    onPage.map((c) => window.Web2ProductsApi.get(c))
                );
                products = settled
                    .filter((s) => s.status === 'fulfilled' && s.value?.product)
                    .map((s) => s.value.product);
            }
        } catch (e) {
            console.warn('[Web2Products] batch fetch failed:', e?.message || e);
            return { handled: false, anyOnPage: true };
        }
        if (!products.length) return { handled: false, anyOnPage: true };
        products.forEach((p) => _updateRowInPlace(p.code, p));
        return { handled: true, anyOnPage: true };
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        const cur = STATE.page;
        const html = [];
        html.push(
            `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="Web2ProductsApp.goPage(${cur - 1})">‹</button>`
        );
        const start = Math.max(1, cur - 2);
        const end = Math.min(totalPages, start + 4);
        if (start > 1) {
            html.push(`<button class="page-btn" onclick="Web2ProductsApp.goPage(1)">1</button>`);
            if (start > 2) html.push(`<span class="page-info">…</span>`);
        }
        for (let p = start; p <= end; p++) {
            html.push(
                `<button class="page-btn ${p === cur ? 'active' : ''}" onclick="Web2ProductsApp.goPage(${p})">${p}</button>`
            );
        }
        if (end < totalPages) {
            if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
            html.push(
                `<button class="page-btn" onclick="Web2ProductsApp.goPage(${totalPages})">${totalPages}</button>`
            );
        }
        html.push(
            `<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} onclick="Web2ProductsApp.goPage(${cur + 1})">›</button>`
        );
        html.push(
            `<span class="page-info">${STATE.total.toLocaleString('vi-VN')} SP — trang ${cur}/${totalPages}</span>`
        );
        pag().innerHTML = html.join('');
    }

    function renderCounters() {
        const t = STATE.total.toLocaleString('vi-VN');
        const c = counter();
        if (c) c.textContent = `${t} sản phẩm`;
        const sc = searchCount();
        if (sc) sc.textContent = t;
    }

    // ---------- Usage badge (đơn nào đang chứa SP này) ----------
    //
    // Render placeholder badge ngay khi table render. Background fetch
    // `/api/web2-products/usage?codes=...` cho TOÀN BỘ code trên page hiện tại
    // → khi data về, update từng cell bằng innerHTML (KHÔNG re-render cả bảng
    // để giữ scroll + tránh nháy).

    function renderUsageBadge(code) {
        const entries = STATE.usage[code];
        if (!entries) {
            // Chưa load — placeholder
            return `<span class="usage-badge usage-loading" data-code="${escapeHtml(code)}"><span class="usage-dot"></span>...</span>`;
        }
        if (!entries.length) {
            return `<span class="usage-badge usage-empty" data-code="${escapeHtml(code)}">0 đơn</span>`;
        }
        const totalQty = entries.reduce((s, e) => s + (e.qty || 0), 0);
        return `<button class="usage-badge usage-has" data-code="${escapeHtml(code)}" onclick="Web2ProductsApp.openUsagePopover('${escapeHtml(escJs(code))}', event)" title="${entries.length} đơn × ${totalQty} cái — bấm xem chi tiết"><i data-lucide="link"></i><strong>${entries.length}</strong> đơn · ${totalQty} cái</button>`;
    }

    async function _loadUsageForCurrentPage() {
        const codes = STATE.products.map((p) => p.code).filter(Boolean);
        if (!codes.length) return;
        try {
            const r = await window.Web2ProductsApi.usage(codes);
            if (!r?.success) return;
            // Merge into STATE.usage (don't wipe — keep previously-loaded codes)
            for (const code of codes) {
                STATE.usage[code] = r.usage?.[code] || [];
            }
            // Replace each usage cell in-place
            for (const code of codes) {
                const row = tbody().querySelector(`tr[data-code="${cssEscape(code)}"]`);
                if (!row) continue;
                const cell = row.querySelector('.usage-cell');
                if (cell) cell.innerHTML = renderUsageBadge(code);
            }
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.warn('[Web2Products] usage load failed:', e?.message || e);
        }
    }

    function openUsagePopover(code, ev) {
        ev?.stopPropagation?.();
        const entries = STATE.usage[code] || [];
        // Remove any existing popover
        document.querySelectorAll('.usage-popover').forEach((el) => el.remove());
        if (!entries.length) {
            notify('Sản phẩm này chưa được dùng trong đơn nào', 'info');
            return;
        }

        const pop = document.createElement('div');
        pop.className = 'usage-popover';
        const productName = STATE.products.find((p) => p.code === code)?.name || code;

        // Group by campaign (fbPostId or campaignId)
        const groups = new Map(); // key = campaign signature
        for (const e of entries) {
            const k = e.campaignId || e.fbPostId || '__no_campaign__';
            if (!groups.has(k)) {
                groups.set(k, {
                    campaignId: e.campaignId,
                    campaignName: e.campaignName,
                    fbPostId: e.fbPostId,
                    items: [],
                });
            }
            groups.get(k).items.push(e);
        }

        const statusColors = {
            draft: '#64748b',
            confirmed: '#0ea5e9',
            sent: '#16a34a',
        };

        let html = `
            <div class="usage-popover-header">
                <strong>${escapeHtml(productName)}</strong>
                <span class="usage-popover-sub">${escapeHtml(code)} · ${entries.length} đơn</span>
                <button class="usage-popover-close" onclick="this.closest('.usage-popover').remove()">×</button>
            </div>
            <div class="usage-popover-body">`;

        for (const [_, g] of groups) {
            const campTitle = g.campaignName || g.fbPostId || '(không có chiến dịch)';
            html += `<div class="usage-camp-group">
                <div class="usage-camp-title"><i data-lucide="megaphone"></i>${escapeHtml(campTitle)}</div>`;
            for (const item of g.items) {
                const stt =
                    item.mergedDisplayStt && item.mergedDisplayStt.length
                        ? item.mergedDisplayStt.join('+')
                        : item.displayStt || '?';
                const statusColor = statusColors[item.status] || '#64748b';
                const statusLabel =
                    item.status === 'draft'
                        ? 'Giỏ hàng'
                        : item.status === 'confirmed'
                          ? 'Đơn hàng'
                          : item.status === 'sent'
                            ? 'Đã gửi'
                            : item.status;
                html += `<a class="usage-order-row" href="../../native-orders/index.html?search=${encodeURIComponent(item.orderCode)}" target="_blank" rel="noopener" title="Mở đơn ${escapeHtml(item.orderCode)}">
                    <span class="usage-stt">STT ${escapeHtml(String(stt))}</span>
                    <span class="usage-cust"><strong>${escapeHtml(item.customerName || '?')}</strong>${item.phone ? ` · ${escapeHtml(item.phone)}` : ''}</span>
                    <span class="usage-qty">×${item.qty}</span>
                    <span class="usage-status" style="background:${statusColor}20;color:${statusColor};">${escapeHtml(statusLabel)}</span>
                </a>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        pop.innerHTML = html;

        // Position popover relative to clicked button
        const target = ev?.currentTarget || ev?.target;
        const rect = target?.getBoundingClientRect?.();
        if (rect) {
            pop.style.left = Math.max(8, Math.min(window.innerWidth - 480, rect.left)) + 'px';
            pop.style.top = rect.bottom + window.scrollY + 6 + 'px';
        } else {
            pop.style.left = '50%';
            pop.style.top = '50%';
            pop.style.transform = 'translate(-50%,-50%)';
        }
        document.body.appendChild(pop);
        if (window.lucide) lucide.createIcons();

        // Click outside → close
        setTimeout(() => {
            const onDocClick = (e) => {
                if (!pop.contains(e.target)) {
                    pop.remove();
                    document.removeEventListener('click', onDocClick);
                }
            };
            document.addEventListener('click', onDocClick);
        }, 50);
    }

    // ---------- Data load ----------
    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        // Anti-flash: nếu bảng ĐÃ có dòng (reload do create/delete/fallback) → làm mờ
        // thay vì xoá trắng → không nháy. Chỉ hiện spinner cho lần tải đầu / bảng rỗng.
        const tb = tbody();
        const hadRows = tb.children.length && !tb.querySelector('.empty-row, .loading-row');
        if (hadRows) {
            tb.style.opacity = '0.55';
            tb.style.pointerEvents = 'none';
        } else if (window.Web2Skeleton) {
            // GitHub-style skeleton rows thay spinner trơ (cảm giác load nhanh + mượt).
            window.Web2Skeleton.rows(tb, { rows: 9, cols: 12 });
        } else {
            tb.innerHTML = `<tr><td colspan="12" class="loading-row">
                <div class="spinner"></div>Đang tải dữ liệu...
            </td></tr>`;
        }
        try {
            const resp = await window.Web2ProductsApi.list({
                search: STATE.search || undefined,
                activeOnly: STATE.activeOnly,
                status: STATE.statusFilter || undefined, // 'HET_HANG' khi filter "Hết hàng"
                page: STATE.page,
                limit: STATE.limit,
            });
            STATE.products = resp.products || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderPagination();
            renderCounters();
            // Sau khi render bảng → fetch usage (background, non-blocking).
            // Badge "ĐANG DÙNG" sẽ tự update khi data về.
            _loadUsageForCurrentPage();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="12" class="empty-row" style="color:#ef4444;">
                Lỗi tải: ${escapeHtml(e.message)}
                <button class="btn btn-sm" style="margin-left:10px" onclick="Web2ProductsApp.load()">
                    <i data-lucide="refresh-cw"></i> Thử lại
                </button>
            </td></tr>`;
            if (window.lucide) lucide.createIcons();
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
            const t = tbody();
            t.style.opacity = '';
            t.style.pointerEvents = '';
        }
    }

    // Export to shared namespace.
    W._rowHtml = _rowHtml;
    W.renderRows = renderRows;
    W._toggleSelect = _toggleSelect;
    W._updateBulkBar = _updateBulkBar;
    W._updateSelectAllState = _updateSelectAllState;
    W._selectAllVisible = _selectAllVisible;
    W._clearSelection = _clearSelection;
    W._bulkPrint = _bulkPrint;
    W._attachUnitsForPrint = _attachUnitsForPrint; // dùng chung cho printBarcode per-row
    W._updateRowInPlace = _updateRowInPlace;
    W._updateRowsBatch = _updateRowsBatch;
    W.renderPagination = renderPagination;
    W.renderCounters = renderCounters;
    W.renderUsageBadge = renderUsageBadge;
    W._loadUsageForCurrentPage = _loadUsageForCurrentPage;
    W.openUsagePopover = openUsagePopover;
    W.load = load;
})();
