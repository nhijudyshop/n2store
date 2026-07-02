// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — receive shipment inline panel (partial-purchase, lookup, confirm). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // ---------- Nhận hàng modal (partial-purchase support) — P1 2026-05-29 ----------
    // Click "Nhận hàng" button trên shipment header → modal liệt kê tất cả rows
    // trong shipment. Default qty_received = qty_ordered (mới) hoặc qty còn chờ
    // (sau partial-purchase). Submit → upsertPending → confirm-purchase-partial.
    //
    // PERF FIX 2026-05-29 (user feedback "modal bị lag"):
    //   - Modal mở NGAY với qty=qtyOrdered, không await API
    //   - Lookup product state CHẠY NGẦM sau khi modal render
    //   - Khi lookup xong → patch DOM rows có "đã nhận N · còn M chờ"
    //   - Cache 5s tránh re-fetch khi user mở/đóng modal liên tục
    SO._receiveItems = []; // [{key, rowId, shipmentId, name, variant, supplier, qty, alreadyReceived, remainingPending, ...}]
    SO._receiveLookupCache = new Map(); // shId → { stateByKey, fetchedAt }
    SO.RECEIVE_LOOKUP_TTL_MS = 5000;

    // Background lookup — return Map(rowId → {code, stock, pendingQty, status}).
    // P1 2026-05-30: dùng Web2ProductsCache thay N×HTTP fetch. Instant lookup
    // O(1) per row sau khi build HashMap key = normalize(name|variant) một lần.
    SO._lookupProductStateForRows = async function _lookupProductStateForRows(rows) {
        const stateByKey = new Map();
        const eligibleForLookup = rows.filter((r) => (r.productName || '').trim());
        if (!eligibleForLookup.length) return stateByKey;
        const cache = window.Web2ProductsCache;
        if (!cache) return stateByKey;
        try {
            await cache.init();
            const all = cache.getAll();
            const norm = cache._normalize;
            // Index toàn bộ SP (kể cả stock=0) — receive panel cần biết cả
            // pending của SP đang chờ mua, không lọc stock như _checkRowsHaveStock.
            // audit r7: 2 index — chính xác theo NCC (name|variant|supplier) + fallback
            // name|variant. Trước đây CHỈ key name|variant "first match wins" → 2 SP
            // CÙNG tên+biến thể KHÁC NCC (server coi là 2 SP riêng) cùng map về SP đầu
            // → nhận hàng NCC B cộng tồn nhầm SP của NCC A. Khớp NCC trước, miss mới
            // fallback name|variant (giữ tương thích SP cũ không gắn NCC).
            const idxBySup = new Map();
            const idxByNV = new Map();
            for (const p of all) {
                const nv = norm(p.name) + '|' + norm(p.variant || '');
                if (!idxByNV.has(nv)) idxByNV.set(nv, p); // fallback first match wins
                const sk = nv + '|' + norm(p.supplier || '');
                if (!idxBySup.has(sk)) idxBySup.set(sk, p);
            }
            for (const r of eligibleForLookup) {
                const nv = norm(r.productName) + '|' + norm(r.variant || '');
                const sk = nv + '|' + norm(r.supplier || '');
                const match = idxBySup.get(sk) || idxByNV.get(nv);
                if (match) {
                    stateByKey.set(r.id, {
                        code: match.code,
                        stock: Number(match.stock) || 0,
                        pendingQty: Number(match.pendingQty) || 0,
                        // Hàng THU VỀ chờ duyệt (shipper_gui) — sắp cộng vào kho, để NV
                        // nhận hàng biết KHÔNG cần đặt dư NCC (audit gap so-order↔returns).
                        returnQty: Number(match.return_qty ?? match.returnQty) || 0,
                        status: match.status,
                    });
                }
            }
        } catch (e) {
            console.warn('[so-order] lookupProductState cache fail:', e.message);
        }
        return stateByKey;
    };

    // Patch 1 row trong modal khi lookup data về (sau khi modal đã render).
    // Update: "Đã nhận: N · Còn chờ: M" + input default + max + badge fully-received.
    SO._patchReceiveRowFromLookup = function _patchReceiveRowFromLookup(item, ps) {
        const rowEl = document.querySelector(`[data-receive-row="${CSS.escape(item.key)}"]`);
        if (!rowEl) return;
        const inp = rowEl.querySelector('input[data-receive-qty]');
        const qtyInfoEl = rowEl.querySelector('[data-receive-qtyinfo]');
        const badgeEl = rowEl.querySelector('[data-receive-status]');
        if (!inp || !qtyInfoEl || !badgeEl) return;
        const qtyOrdered = item.qty;
        const remainingPending = ps.pendingQty;
        const alreadyReceived = Math.max(0, qtyOrdered - remainingPending);
        const fullyReceived = remainingPending === 0;
        // Update item state (used by confirmReceiveFromModal)
        item.code = ps.code;
        item.alreadyReceived = alreadyReceived;
        item.remainingPending = remainingPending;
        item.currentStock = ps.stock;
        // Hàng thu về chờ duyệt (sắp về kho) → nhắc NV không đặt dư.
        const retQty = Number(ps.returnQty) || 0;
        const retBadge =
            retQty > 0
                ? `<span style="color:#7c3aed;">Thu về chờ duyệt: <strong>${retQty}</strong></span>`
                : '';
        // Patch qty info display
        if (alreadyReceived > 0 || retBadge) {
            qtyInfoEl.innerHTML =
                `<span>Đã đặt: <strong>${qtyOrdered}</strong></span>` +
                (alreadyReceived > 0
                    ? `<span style="color:#16a34a;">Đã nhận: <strong>${alreadyReceived}</strong></span>
                <span style="color:#f59e0b;">Còn chờ: <strong>${remainingPending}</strong></span>`
                    : '') +
                retBadge;
            qtyInfoEl.style.cssText =
                'font-size:11px;color:#64748b;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;line-height:1.3;';
        }
        // Patch input
        inp.dataset.receiveQtyAlready = alreadyReceived;
        inp.dataset.receiveQtyMax = remainingPending;
        inp.max = remainingPending;
        if (fullyReceived) {
            inp.value = 0;
            inp.disabled = true;
            inp.style.background = '#f1f5f9';
            inp.style.color = '#94a3b8';
            inp.style.cursor = 'not-allowed';
            rowEl.classList.add('is-fully');
            badgeEl.textContent = 'ĐÃ NHẬN ĐỦ';
            badgeEl.style.background = '#dbeafe';
            badgeEl.style.color = '#1e40af';
        } else {
            inp.value = remainingPending;
        }
        SO._updateReceiveSummary();
    };

    // P1 2026-05-29: Khi panel Nhận hàng mở, ẩn các shipments khác để focus
    // vào shipment đang nhận. Walk tbody children, track active state qua
    // .so-shipment-head rows. Mọi row nằm trong shipment khác → add class
    // .so-receive-hidden (CSS display: none).
    SO._hideOtherShipments = function _hideOtherShipments(activeShId) {
        const tbody = document.getElementById('soTableBody');
        if (!tbody) return;
        let activeMode = false;
        for (const child of tbody.children) {
            if (child.classList.contains('so-shipment-head')) {
                activeMode = child.dataset.shipmentId === activeShId;
                if (!activeMode) child.classList.add('so-receive-hidden');
                continue;
            }
            if (child.classList.contains('so-receive-panel-row')) {
                // Panel row đã chèn cho active shipment → giữ visible
                continue;
            }
            if (!activeMode) {
                child.classList.add('so-receive-hidden');
            }
        }
    };
    SO._showAllShipments = function _showAllShipments() {
        document.querySelectorAll('.so-receive-hidden').forEach((el) => {
            el.classList.remove('so-receive-hidden');
        });
    };

    SO.openReceiveShipmentModal = function openReceiveShipmentModal(shId, opts = {}) {
        if (!window.Web2ProductsApi) {
            SO.notify('Web2ProductsApi chưa load', 'error');
            return;
        }
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab?.shipments.find((s) => s.id === shId);
        if (!sh) {
            SO.notify('Không tìm thấy shipment', 'error');
            return;
        }
        const rate = Number(tab.rate) || 1;
        const ccy = tab.currency || 'VND';
        const tabLabel = (tab.label || '').trim();

        // Filter theo 1 NCC (khi bấm nút "Nhận hàng" ở ô NCC) — chỉ list SP của
        // NCC đó trong lô. Không truyền → nhận cả lô (nút cấp lô).
        const onlySupplier = (opts.supplier || '').trim();
        // Fix 2026-06-03: nút "Nhận hàng" ở ô NCC giờ scope theo ĐÚNG đơn
        // (supplier + invoiceGroup) khớp với cell render, không nhận lẫn đơn
        // khác cùng NCC. Fallback theo id giữ behavior cũ cho rows chưa có
        // invoiceGroupId. Không truyền → nhận cả lô (nút cấp lô).
        const onlyGroupId = (opts.invoiceGroupId || '').trim();
        const matchSupplier = (r) => {
            if (onlySupplier && (r.supplier || '').trim() !== onlySupplier) return false;
            if (onlyGroupId && String(r.invoiceGroupId || r.id) !== onlyGroupId) return false;
            return true;
        };

        // P1 2026-05-30: Loại bỏ rows đã nhận đủ (status='received') khỏi panel.
        // User feedback: "Nhận hàng đủ với SL sản phẩm -> không cho nhận hàng
        // sản phẩm đó nữa". Trước đây vẫn show row với input disabled "ĐÃ NHẬN
        // ĐỦ" gây nhiễu. Giờ ẩn hoàn toàn.
        const eligibleRows = (sh.rows || []).filter(
            (r) =>
                (r.productName || '').trim() &&
                Number(r.qty) > 0 &&
                (r.supplier || '').trim() &&
                matchSupplier(r) &&
                r.status !== 'received'
        );

        // Nếu shipment không còn row nào chưa nhận → báo notify + thoát.
        const totalRows = (sh.rows || []).filter(
            (r) =>
                (r.productName || '').trim() &&
                Number(r.qty) > 0 &&
                (r.supplier || '').trim() &&
                matchSupplier(r)
        ).length;
        if (totalRows > 0 && eligibleRows.length === 0) {
            SO.notify('Tất cả SP trong lô này đã nhận đủ', 'info');
            return;
        }

        // PERF: dùng cache nếu có (TTL 5s) — tránh re-fetch khi user open/close
        // liên tục. Cache expires → background re-lookup.
        const cached = SO._receiveLookupCache.get(shId);
        const stateByKey =
            cached && Date.now() - cached.fetchedAt < SO.RECEIVE_LOOKUP_TTL_MS
                ? cached.stateByKey
                : new Map();

        SO._receiveItems = eligibleRows.map((r) => {
            const qtyOrdered = Number(r.qty) || 0;
            const ps = stateByKey.get(r.id);
            // Nếu cache hit → dùng pendingQty thực. Cache miss → assume qtyOrdered
            // (modal hiển thị ngay, lookup background sẽ patch sau).
            const remainingPending = ps ? ps.pendingQty : qtyOrdered;
            const alreadyReceived = Math.max(0, qtyOrdered - remainingPending);
            return {
                key: r.id,
                rowId: r.id,
                shipmentId: sh.id,
                code: ps?.code || null,
                name: (r.productName || '').trim(),
                variant: (r.variant || '').trim() || null,
                qty: qtyOrdered, // qty đặt gốc (từ so-order row)
                alreadyReceived,
                remainingPending,
                currentStock: ps?.stock || 0,
                supplier: (r.supplier || '').trim(),
                costPriceRaw: Number(r.costPrice) || 0,
                sellPriceRaw: Number(r.sellPrice) || 0,
                costPriceVnd: Math.round((Number(r.costPrice) || 0) * rate),
                sellPriceVnd: Math.round((Number(r.sellPrice) || 0) * rate),
                imageUrl: r.productImage || null,
                note: tabLabel || null,
                // 2026-06-16: tiền tệ gốc lúc nhập (cho kho hover giá gốc).
                originCurrency: ccy,
                originRate: rate,
            };
        });

        // PERF 2026-05-29: Replace modal with INLINE EXPANSION trong tbody.
        // User báo "scroll modal lag không mượt" — modal có overlay + fixed
        // position + GPU layer + nested scroll → composite work nặng.
        // Inline panel chèn vào table flow → native page scroll, nhẹ + mượt nhất.
        // Remove old modal nếu còn từ version cũ
        const oldModal = document.getElementById('soReceiveModal');
        if (oldModal) oldModal.remove();

        // Close other open panels (chỉ 1 shipment receiving cùng lúc) + show
        // back các shipments đã ẩn trước đó.
        document.querySelectorAll('.so-receive-panel-row').forEach((row) => row.remove());
        SO._showAllShipments();

        // Tìm shipment header row để insert panel sau
        const shipHeaderRow = document.querySelector(
            `tr.so-shipment-head[data-shipment-id="${CSS.escape(shId)}"]`
        );
        if (!shipHeaderRow) {
            SO.notify('Không tìm thấy shipment row để gắn panel', 'error');
            return;
        }
        const colSpan = shipHeaderRow.querySelector('td')?.getAttribute('colspan') || 12;

        const shipLabel = sh.batch
            ? `Đợt ${sh.batch} · ${SO.formatDateVN(sh.date)}`
            : SO.formatDateVN(sh.date);

        // Tạo panel row + chèn vào tbody sau header
        const panelRow = document.createElement('tr');
        panelRow.className = 'so-receive-panel-row';
        panelRow.dataset.receivePanelFor = shId;
        panelRow.innerHTML = `
            <td colspan="${colSpan}" style="padding:0;">
                <div class="so-receive-panel">
                    <header class="so-receive-panel-head">
                        <div class="so-receive-panel-title">
                            <i data-lucide="truck" style="width:18px;height:18px;color:#16a34a;"></i>
                            <strong>Nhận hàng — ${SO.escapeHtml(shipLabel)}${onlySupplier ? ' · NCC ' + SO.escapeHtml(onlySupplier) : ''}</strong>
                            <span style="font-size:11px;font-weight:500;color:#64748b;background:#fef3c7;padding:2px 8px;border-radius:4px;margin-left:8px;">
                                <i data-lucide="eye-off" style="width:11px;height:11px;vertical-align:-1px;"></i>
                                Các đợt khác tạm ẩn
                            </span>
                        </div>
                        <button type="button" class="so-receive-panel-close" data-so-receive-close title="Đóng (Esc)">
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-receive-panel-hint">
                        <strong>Hướng dẫn:</strong> Default qty nhận = số <strong>còn chờ</strong>.
                        Sửa qty nhận để chỉ nhận 1 phần. SP đã đủ tự disable.
                    </div>
                    <div class="so-receive-panel-toolbar">
                        <button type="button" class="btn btn-secondary btn-sm" id="soReceiveAllFull">
                            <i data-lucide="check-check" style="width:14px;height:14px;"></i> Tất cả mua đủ
                        </button>
                        <span class="so-receive-panel-summary" id="soReceiveSummary"></span>
                    </div>
                    <div class="so-receive-list" id="soReceiveList"></div>
                    <footer class="so-receive-panel-foot">
                        <button class="btn btn-secondary" type="button" data-so-receive-close>Hủy</button>
                        <button class="btn btn-secondary" type="button" id="soReceivePrintBtn" title="In tem QR theo SL (nhập / đã nhận / đặt) — không cần nhận lại">
                            <i data-lucide="printer"></i> In tem
                        </button>
                        <button class="btn btn-primary" type="button" id="soReceiveConfirmBtn">
                            <i data-lucide="check"></i> Xác nhận nhận hàng
                        </button>
                    </footer>
                </div>
            </td>`;
        shipHeaderRow.insertAdjacentElement('afterend', panelRow);

        // Ẩn các shipments khác để focus vào shipment đang nhận
        SO._hideOtherShipments(shId);

        // Wire close handlers — đóng panel + show lại các shipments khác
        // Gỡ escHandler trong closePanel (mọi đường đóng: nút X / Esc / confirm) →
        // tránh listener treo trên document, mở lại panel sau bấm Esc gọi closePanel cũ
        // trên panelRow đã remove + _showAllShipments thừa.
        const closePanel = () => {
            document.removeEventListener('keydown', escHandler);
            panelRow.remove();
            SO._showAllShipments();
        };
        panelRow.querySelectorAll('[data-so-receive-close]').forEach((el) => {
            el.addEventListener('click', closePanel);
        });
        // Esc closes panel
        const escHandler = (e) => {
            if (e.key === 'Escape') closePanel();
        };
        document.addEventListener('keydown', escHandler);

        // Confirm button
        panelRow
            .querySelector('#soReceiveConfirmBtn')
            .addEventListener('click', SO.confirmReceiveFromModal);

        // In tem button — in/in lại tem QR theo SL kể cả khi đã nhận đủ.
        panelRow
            .querySelector('#soReceivePrintBtn')
            ?.addEventListener('click', SO.printLabelsFromReceivePanel);

        // Tất cả mua đủ button
        panelRow.querySelector('#soReceiveAllFull').addEventListener('click', () => {
            panelRow.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
                inp.value = Number(inp.dataset.receiveQtyMax) || 0;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        const listEl = panelRow.querySelector('#soReceiveList');
        if (!SO._receiveItems.length) {
            listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;">Shipment không có SP nào hợp lệ (cần NCC + tên SP + qty>0).</div>`;
        } else {
            // Group by supplier
            const bySupplier = new Map();
            for (const it of SO._receiveItems) {
                if (!bySupplier.has(it.supplier)) bySupplier.set(it.supplier, []);
                bySupplier.get(it.supplier).push(it);
            }
            const html = [];
            for (const [supplier, items] of bySupplier) {
                const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);
                const totalVnd = items.reduce(
                    (s, it) => s + (it.qty || 0) * (it.costPriceVnd || 0),
                    0
                );
                html.push(
                    `<div class="so-receive-group-head">
                        <span style="display:flex;align-items:center;gap:8px;color:#0c4a6e;">
                            <i data-lucide="store" style="width:16px;height:16px;color:#0284c7;"></i>
                            ${SO.escapeHtml(supplier)}
                            <span style="font-size:11px;font-weight:600;padding:2px 8px;background:#0284c7;color:#fff;border-radius:10px;">${items.length} SP</span>
                        </span>
                        <span style="font-size:12px;color:#64748b;font-weight:500;">${totalQty} cái · <strong style="color:#16a34a;">${totalVnd.toLocaleString('vi-VN')}₫</strong></span>
                    </div>`
                );
                for (const it of items) {
                    const hasPartial = it.alreadyReceived > 0;
                    const remaining = it.remainingPending;
                    const fullyReceived = remaining === 0;
                    const lineCostVnd = it.qty * it.costPriceVnd;
                    const qtyInfo = hasPartial
                        ? `<div data-receive-qtyinfo="${SO.escapeHtml(it.key)}" style="font-size:12px;color:#64748b;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;line-height:1.4;">
                            <span>Đã đặt: <strong style="color:#0f172a;">${it.qty}</strong></span>
                            <span style="color:#16a34a;">Đã nhận: <strong>${it.alreadyReceived}</strong></span>
                            <span style="color:#f59e0b;">Còn chờ: <strong>${remaining}</strong></span>
                          </div>`
                        : `<div data-receive-qtyinfo="${SO.escapeHtml(it.key)}" style="font-size:13px;color:#64748b;white-space:nowrap;">Đã đặt: <strong style="color:#0f172a;font-size:15px;">${it.qty}</strong></div>`;
                    const defaultStatus = fullyReceived
                        ? `<span data-receive-status="${SO.escapeHtml(it.key)}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;background:#dbeafe;color:#1e40af;white-space:nowrap;">ĐÃ NHẬN ĐỦ</span>`
                        : `<span data-receive-status="${SO.escapeHtml(it.key)}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;background:#dcfce7;color:#166534;white-space:nowrap;">MUA ĐỦ</span>`;
                    const inputAttrs = fullyReceived
                        ? `disabled value="0"`
                        : `value="${remaining}"`;
                    html.push(`<div class="so-receive-row${fullyReceived ? ' is-fully' : ''}" data-receive-row="${SO.escapeHtml(it.key)}">
                        ${it.imageUrl ? `<img src="${SO.escapeHtml(it.imageUrl)}" loading="lazy" decoding="async" alt="">` : '<div class="so-receive-img-fallback">no img</div>'}
                        <div style="min-width:0;">
                            <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;">${SO.escapeHtml(it.name)}</div>
                            ${it.variant ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${SO.escapeHtml(it.variant)}</div>` : ''}
                        </div>
                        <div style="font-size:11px;color:#64748b;white-space:nowrap;text-align:right;">
                            <div>Giá: <strong style="color:#0f172a;">${it.costPriceVnd.toLocaleString('vi-VN')}₫</strong></div>
                            <div style="margin-top:2px;">Tổng: <strong style="color:#16a34a;">${lineCostVnd.toLocaleString('vi-VN')}₫</strong></div>
                        </div>
                        ${qtyInfo}
                        <div style="display:flex;align-items:center;gap:6px;">
                            <label style="font-size:12px;color:#0f172a;font-weight:600;">Nhận:</label>
                            <input type="number" min="0" max="${remaining}" ${inputAttrs} data-receive-qty="${SO.escapeHtml(it.key)}" data-receive-qty-max="${remaining}" data-receive-qty-ordered="${it.qty}" data-receive-qty-already="${it.alreadyReceived}" style="width:80px;padding:8px 10px;border:2px solid #cbd5e1;border-radius:6px;text-align:center;font-weight:700;font-size:15px;${fullyReceived ? 'background:#f1f5f9;color:#94a3b8;cursor:not-allowed;' : 'background:#fff;'}" />
                        </div>
                        ${defaultStatus}
                    </div>`);
                }
            }
            listEl.innerHTML = html.join('');
            // Wire qty inputs → update status badge + summary
            listEl.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
                inp.addEventListener('input', () => SO._updateReceiveRowStatus(inp));
            });
        }
        SO._updateReceiveSummary();
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Smooth scroll panel into view (native scroll, không lag)
        panelRow.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // PERF: fire-and-forget background lookup (no await). Khi xong → patch
        // DOM rows có "đã nhận / còn chờ" từ web2_products thực tế. Panel đã
        // hiển thị ngay nên user không thấy lag. Cache hit (5s) → skip lookup.
        const hasCache = cached && Date.now() - cached.fetchedAt < SO.RECEIVE_LOOKUP_TTL_MS;
        if (!hasCache && eligibleRows.length > 0) {
            const summaryEl = panelRow.querySelector('#soReceiveSummary');
            if (summaryEl) {
                const prevText = summaryEl.textContent;
                summaryEl.textContent = '⏳ Đang kiểm tra tình trạng đã nhận... · ' + prevText;
            }
            SO._lookupProductStateForRows(eligibleRows)
                .then((stateByKeyFresh) => {
                    SO._receiveLookupCache.set(shId, {
                        stateByKey: stateByKeyFresh,
                        fetchedAt: Date.now(),
                    });
                    // Panel còn trong DOM? Patch rows.
                    if (!document.body.contains(panelRow)) return;
                    let patched = 0;
                    for (const item of SO._receiveItems) {
                        const ps = stateByKeyFresh.get(item.rowId);
                        if (!ps) continue;
                        if (ps.pendingQty === item.remainingPending && ps.code === item.code) {
                            continue;
                        }
                        SO._patchReceiveRowFromLookup(item, ps);
                        patched++;
                    }
                    if (patched > 0 && window.lucide?.createIcons) {
                        window.lucide.createIcons();
                    }
                    SO._updateReceiveSummary();
                })
                .catch((e) => {
                    console.warn(
                        '[so-order] receive lookup fail (panel vẫn dùng được):',
                        e?.message
                    );
                    SO._updateReceiveSummary();
                });
        }
    };

    SO._updateReceiveRowStatus = function _updateReceiveRowStatus(input) {
        if (input.disabled) return;
        const key = input.dataset.receiveQty;
        // max = remainingPending (số còn chờ thực tế).
        // qtyOrdered + qtyAlready = số gốc đặt + số đã nhận từ trước.
        const max = Number(input.dataset.receiveQtyMax) || 0;
        const qtyOrdered = Number(input.dataset.receiveQtyOrdered) || 0;
        const qtyAlready = Number(input.dataset.receiveQtyAlready) || 0;
        const val = Math.min(Math.max(0, Number(input.value) || 0), max);
        if (val !== Number(input.value)) input.value = val;
        const totalReceivedAfter = qtyAlready + val;
        const badge = document.querySelector(`[data-receive-status="${CSS.escape(key)}"]`);
        if (badge) {
            if (val === 0 && qtyAlready === 0) {
                badge.textContent = 'CHƯA NHẬN';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#475569';
            } else if (totalReceivedAfter >= qtyOrdered) {
                badge.textContent = `MUA ĐỦ${qtyAlready > 0 ? ` (${qtyAlready}+${val}=${totalReceivedAfter}/${qtyOrdered})` : ''}`;
                badge.style.background = '#dcfce7';
                badge.style.color = '#166534';
            } else {
                badge.textContent = `MUA 1 PHẦN (${totalReceivedAfter}/${qtyOrdered})`;
                badge.style.background = '#fef3c7';
                badge.style.color = '#92400e';
            }
        }
        SO._updateReceiveSummary();
    };

    SO._updateReceiveSummary = function _updateReceiveSummary() {
        // Scoped to active panel (inline expansion 2026-05-29)
        const panelRow = document.querySelector('.so-receive-panel-row');
        if (!panelRow) return;
        const inputs = panelRow.querySelectorAll('input[data-receive-qty]');
        let totalReceiving = 0,
            totalRemaining = 0,
            totalAlready = 0,
            partial = 0,
            full = 0,
            none = 0,
            alreadyFull = 0;
        inputs.forEach((inp) => {
            const max = Number(inp.dataset.receiveQtyMax) || 0;
            const qtyAlready = Number(inp.dataset.receiveQtyAlready) || 0;
            const qtyOrdered = Number(inp.dataset.receiveQtyOrdered) || 0;
            const val = inp.disabled ? 0 : Number(inp.value) || 0;
            totalRemaining += max;
            totalReceiving += val;
            totalAlready += qtyAlready;
            if (inp.disabled) alreadyFull++;
            else if (val === 0 && qtyAlready === 0) none++;
            else if (qtyAlready + val >= qtyOrdered) full++;
            else partial++;
        });
        const el = panelRow.querySelector('#soReceiveSummary');
        if (el) {
            const parts = [
                `Đang nhận: ${totalReceiving}/${totalRemaining} còn chờ`,
                totalAlready > 0 ? `đã nhận trước: ${totalAlready}` : null,
                `${full} mua đủ · ${partial} mua 1 phần · ${none} chưa nhận`,
                alreadyFull > 0 ? `${alreadyFull} đã đủ trước` : null,
            ].filter(Boolean);
            el.textContent = parts.join(' · ');
        }
    };

    // UI-first NOTE: GIỮ await + loading state (button spinner) — đây là NGOẠI
    // LỆ được ghi trong docs/web2/UI-FIRST.md: flow nhiều bước với validation
    // server-side strict (upsertPending lấy code → confirm-purchase-partial đổi
    // tồn thật nhiều SP → in tem barcode). Optimistic rollback ở đây quá rủi ro
    // (đã mutate tồn nhiều SP + đã in tem). User cần thấy spinner tới khi xong.
    SO.confirmReceiveFromModal = async function confirmReceiveFromModal() {
        // Panel = inline expansion (replace modal 2026-05-29 for scroll perf)
        const panelRow = document.querySelector('.so-receive-panel-row');
        const btn = panelRow?.querySelector('#soReceiveConfirmBtn');
        if (!btn || btn.disabled) return;
        const inputs = panelRow.querySelectorAll('input[data-receive-qty]');
        if (!inputs.length) {
            SO.notify('Không có SP nào', 'warning');
            return;
        }
        const receivedMap = new Map();
        inputs.forEach((inp) => {
            const key = inp.dataset.receiveQty;
            const val = Math.min(
                Math.max(0, Number(inp.value) || 0),
                Number(inp.dataset.receiveQtyMax) || 0
            );
            if (val > 0) receivedMap.set(key, val);
        });
        if (!receivedMap.size) {
            SO.notify('Tất cả qty nhận đều = 0 → không có gì để xác nhận', 'warning');
            return;
        }
        const itemsToProcess = SO._receiveItems.filter((it) => receivedMap.has(it.key));
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            // 1. Upsert pending để có code DB (tạo SP nếu chưa có).
            // FIX H15 (2026-06-11): KHÔNG upsert mù qty đặt gốc — server cộng
            // pending VÔ ĐIỀU KIỆN, mà pending có thể ĐÃ được đẩy trước đó qua
            // Lưu Nháp (syncRowsToKho) hoặc đợt nhận trước → cộng LẶP = pending
            // ảo trong Kho SP. Đọc pending TƯƠI từ Kho ngay trước upsert:
            //   - SP đã có trong Kho → chỉ upsert phần CÒN THIẾU để
            //     confirm-partial trừ được: max(0, qtyNhận − pending hiện tại).
            //     Pending đã đủ → skip upsert, đi thẳng confirm-partial.
            //   - SP chưa có → upsert qty đặt gốc (tạo CHO_MUA, phần chưa nhận
            //     tiếp tục chờ — giữ behavior cũ).
            let freshState = new Map();
            try {
                if (window.Web2ProductsCache?.refresh) await window.Web2ProductsCache.refresh();
                freshState = await SO._lookupProductStateForRows(
                    itemsToProcess.map((it) => ({
                        id: it.key,
                        productName: it.name,
                        variant: it.variant,
                        // FIX audit #1: PHẢI truyền supplier → lookup dùng index
                        // (name|variant|supplier), tránh khớp nhầm SP cùng tên+biến thể
                        // khác NCC (A1AODO ≠ B1AODO) → cộng tồn/upsert sai mã.
                        supplier: it.supplier,
                    }))
                );
            } catch (lkErr) {
                // Lookup fail → fallback behavior cũ (upsert qty gốc) bên dưới.
                console.warn('[so-order] fresh pending lookup fail:', lkErr?.message);
            }
            const upsertPayload = [];
            const upsertOwners = []; // song song payload — item chủ của từng dòng gửi đi
            for (const it of itemsToProcess) {
                const ps = freshState.get(it.key);
                if (ps?.code) it.code = ps.code; // code tươi (seed codeByKey bên dưới)
                // FIX audit #8: lookup fail → KHÔNG upsert nguyên it.qty (double-count
                // pending khi dòng đã nhận 1 phần). Dùng remainingPending (pending biết
                // lúc mở modal) làm sàn → chỉ top-up phần còn thiếu.
                const knownPending = ps
                    ? Number(ps.pendingQty) || 0
                    : Number(it.remainingPending ?? it.qty) || 0;
                const upsertQty = Math.max(0, (receivedMap.get(it.key) || 0) - knownPending);
                if (upsertQty <= 0) continue; // pending trong Kho đã đủ → không upsert
                upsertPayload.push({
                    name: it.name,
                    variant: it.variant,
                    qty: upsertQty,
                    costPrice: it.costPriceVnd,
                    sellPrice: it.sellPriceVnd,
                    supplier: it.supplier,
                    imageUrl: it.imageUrl,
                    note: it.note,
                    originCurrency: it.originCurrency,
                    originRate: it.originRate,
                });
                upsertOwners.push(it);
            }
            let upsertItems = [];
            if (upsertPayload.length) {
                // Mã SP theo rule cho SP mới (giống Lưu Nháp) — tránh KHO-rnd.
                SO._assignKhoCodes(upsertPayload);
                const upsertRes = await window.Web2ProductsApi.upsertPending(upsertPayload);
                upsertItems = (upsertRes && upsertRes.items) || [];
            }
            // FIX 1D (2026-06-11): ghép kết quả upsert theo VỊ TRÍ payload —
            // server trả result 1:1 đúng thứ tự payload (chỉ skip khi
            // !name||qty<=0, mà payload client đã loại các case đó) nên
            // upsertItems[i] ↔ upsertOwners[i] kể cả khi có row action='error'
            // chen giữa (row error GIỮ vị trí nhưng KHÔNG được map — vd Code
            // collision: code đó thuộc SP KHÁC). Lệch độ dài (server đổi
            // behavior) → fallback match name, an toàn hơn map mù theo index.
            const codeByKey = new Map();
            for (const it of itemsToProcess) {
                if (it.code) codeByKey.set(it.key, it.code);
            }
            // SP lỗi upsert (action:'error', vd mã trùng SP khác) → KHÔNG có code →
            // bị loại khỏi confirm-purchase-partial → tồn KHÔNG được cập nhật. Báo
            // user (đừng nuốt im) — họ tưởng đã nhận đủ hàng vào kho.
            const erroredUpsert = upsertItems.filter((ui) => ui && ui.action === 'error');
            if (erroredUpsert.length) {
                const names = erroredUpsert.map((ui) => ui.name || ui.code || '?').join(', ');
                console.warn(
                    '[so-order-receive] upsert lỗi, bỏ qua khỏi nhận hàng:',
                    erroredUpsert
                );
                SO.notify(
                    `${erroredUpsert.length} SP không tạo được mã (mã trùng?) — CHƯA cập nhật tồn: ${names}`,
                    'warning'
                );
            }
            if (upsertItems.length === upsertOwners.length) {
                upsertItems.forEach((ui, i) => {
                    if (!ui.code || ui.action === 'error') return;
                    codeByKey.set(upsertOwners[i].key, ui.code);
                });
            } else {
                const normName = (s) =>
                    String(s || '')
                        .trim()
                        .toLowerCase();
                for (const ui of upsertItems) {
                    if (!ui.code || ui.action === 'error') continue;
                    const owner = upsertOwners.find(
                        (it) => !codeByKey.has(it.key) && normName(it.name) === normName(ui.name)
                    );
                    if (owner) codeByKey.set(owner.key, ui.code);
                }
            }
            // 2. Confirm-purchase-partial với qtyReceived per code.
            const partialItems = itemsToProcess
                .filter((it) => codeByKey.has(it.key))
                .map((it) => ({
                    code: codeByKey.get(it.key),
                    qtyReceived: receivedMap.get(it.key),
                }));
            if (!partialItems.length) throw new Error('Không có code nào để confirm partial');
            const res = await fetch(
                (window.API_CONFIG?.WORKER_URL ||
                    window.WEB2_CONFIG?.WORKER_URL ||
                    'https://chatomni-proxy.nhijudyshop.workers.dev') +
                    '/api/web2-products/confirm-purchase-partial',
                {
                    method: 'POST',
                    headers: SO._w2Auth({ 'Content-Type': 'application/json' }),
                    credentials: 'omit',
                    body: JSON.stringify({ items: partialItems }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            if (window.Web2ProductsCache) {
                window.Web2ProductsCache.pushTickle({ action: 'so-order-partial-receive' });
            }
            // 3. Update so-order row status. P1 2026-05-29: tính total đã nhận
            // (lần này + đã nhận trước đó) so với qty đặt gốc.
            //   - total >= qtyOrdered → 'received' (mua đủ qua N lần)
            //   - 0 < total < qtyOrdered → 'partial_received'
            //   - total == 0 → giữ status cũ
            const tab = window.SoOrderStorage.getActiveTab(SO.state);
            for (const it of itemsToProcess) {
                const receivedThisTime = receivedMap.get(it.key) || 0;
                // FIX MEDIUM (audit): KHÔNG dùng it.alreadyReceived (gán lúc MỞ
                // modal — cache-miss = 0, hoặc lookup nền chưa kịp patch khi user
                // bấm Xác nhận sớm) → undercount cumulative + lật status sai
                // (partial thay vì received). Lấy alreadyReceived từ freshState
                // (lookup TƯƠI đã await ở trên cùng handler): pending tươi →
                // alreadyReceived = qtyĐặt − pendingTươi. Miss freshState (lookup
                // lỗi) → fallback giá trị modal-open như cũ.
                const psFresh = freshState.get(it.key);
                const alreadyReceived = psFresh
                    ? Math.max(0, (Number(it.qty) || 0) - (Number(psFresh.pendingQty) || 0))
                    : it.alreadyReceived || 0;
                const totalReceived = alreadyReceived + receivedThisTime;
                let newStatus;
                if (totalReceived >= it.qty) newStatus = 'received';
                else if (totalReceived > 0) newStatus = 'partial_received';
                else continue;
                // 2026-06-16: GHI qtyReceived (luỹ kế) lên row → công nợ NCC bill
                // ĐÚNG phần đã nhận khi 'partial_received' (user chốt 2026-06-16).
                // 'received' bill full qty đặt; partial bill min(qtyReceived, qty).
                window.SoOrderStorage.updateRow(SO.state, tab.id, it.shipmentId, it.rowId, {
                    status: newStatus,
                    qtyReceived: totalReceived,
                });
            }
            SO.pushSync();
            SO.renderAll();
            const fullCount = (data.items || []).filter((r) => r.status === 'DANG_BAN').length;
            const partialCount = (data.items || []).filter((r) => r.status === 'MUA_1_PHAN').length;
            SO.notify(
                `✅ Đã xử lý ${data.processed} SP — ${fullCount} mua đủ, ${partialCount} mua 1 phần`,
                'success'
            );
            panelRow.remove();
            // P1 2026-05-29: in barcode cho SP đã nhận (mua đủ hoặc mua 1 phần).
            // Merge variant + qty thực nhận từ itemsToProcess (server response
            // không trả variant). Skip SP qtyReceived=0.
            try {
                const printableItems = itemsToProcess
                    .filter((it) => receivedMap.has(it.key))
                    .map((it) => {
                        const code = codeByKey.get(it.key);
                        const serverRow = (data.items || []).find((r) => r.code === code);
                        if (!serverRow) return null;
                        // FIX 2026-06-28: confirm-purchase-partial response KHÔNG trả
                        // price/sellPrice → tem in ra giá 0. Nguồn giá bán (VND) ưu tiên:
                        // (1) giá bán dòng so-order (it.sellPriceVnd), (2) giá Kho SP
                        // (cache theo code — đúng khi SP đã có sẵn giá trong Kho mà dòng
                        // order để trống giá bán), (3) 0.
                        const khoPrice = window.Web2ProductsCache?.findByCode?.(code)?.price;
                        const temPrice =
                            Number(it.sellPriceVnd) ||
                            Number(khoPrice) ||
                            Number(serverRow.price) ||
                            0;
                        return {
                            ...serverRow,
                            variant: it.variant,
                            qtyReceived: receivedMap.get(it.key),
                            // PER-UNIT (2026-06-28): mang shipmentId/supplier/quantity để
                            // _attachUnitCodes mint mã đơn vị + QR idempotent theo
                            // (code, shipmentId) — KHỚP path "In tem" (không nhân đôi serial).
                            shipmentId: it.shipmentId,
                            supplier: it.supplier,
                            quantity: receivedMap.get(it.key),
                            price: temPrice,
                            sellPriceVnd: temPrice,
                        };
                    })
                    .filter(Boolean);
                if (printableItems.length > 0) {
                    const uniqSuppliers = Array.from(
                        new Set(itemsToProcess.map((it) => it.supplier))
                    );
                    const supplierLabel =
                        uniqSuppliers.length === 1
                            ? uniqSuppliers[0]
                            : `${uniqSuppliers.length} NCC`;
                    // Mint mã đơn vị + QR cho tem in TỰ ĐỘNG (trước đây path này bỏ qua
                    // _attachUnitCodes → tem không có QR per-unit; chỉ nút "In tem" phụ mới
                    // mint). Best-effort: lỗi mint không chặn in (đã bọc try/catch ngoài).
                    await SO._attachUnitCodes(printableItems);
                    SO.openBarcodePrintModal(printableItems, supplierLabel);
                }
            } catch (printErr) {
                console.warn('[so-order] barcode print skip:', printErr.message);
            }
        } catch (e) {
            console.warn('[so-order] confirmReceive fail:', e);
            SO.notify('Lỗi nhận hàng: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    };
})();
