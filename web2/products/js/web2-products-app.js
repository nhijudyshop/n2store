// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Products — main app: render bảng + CRUD qua modal.
 */

(function () {
    'use strict';

    // Proxy domain cho các fetch trực tiếp (history endpoint chưa có trong
    // Web2ProductsApi). Đưa vào hằng số để tránh hardcode rải rác.
    const PROXY_BASE =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    const STATE = {
        products: [],
        total: 0,
        page: 1,
        limit: 200,
        search: '',
        activeOnly: false, // 'all' (false) vs 'true' (active only)
        loading: false,
        editingCode: null, // null = creating, string = editing
        usage: {}, // productCode → array of order entries (from /usage endpoint)
        selectedCodes: new Set(), // P1 2026-05-30: multi-select cho bulk in tem
    };

    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#productsTbody');
    const counter = () => $('#totalCounter');
    const searchCount = () => $('#searchResultCount');
    const pag = () => $('#pagination');
    const modal = () => $('#productModal');

    // S6 fix 2026-06-11: escape đủ 5 ký tự (DOM textContent→innerHTML KHÔNG
    // escape quote → attribute-injection khi nhúng vào title="..."/src="...").
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // Escape cho giá trị nhúng vào JS string literal trong inline handler
    // (onclick="fn('${...}')"): browser decode HTML entity TRƯỚC khi JS parse,
    // nên escapeHtml một mình không đủ — phải backslash-escape trước rồi mới
    // escapeHtml bọc ngoài: escapeHtml(escJs(v)).
    function escJs(s) {
        if (s == null) return '';
        return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    }
    // Chỉ render <img src> với scheme an toàn — chặn javascript:, vbscript:,
    // data:text/html… từ imageUrl do server/user nhập.
    function safeImageUrl(u) {
        const s = String(u || '').trim();
        return /^(https:\/\/|http:\/\/|\/|data:image\/)/i.test(s) ? s : '';
    }
    function fmtPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    // 2026-06-16: Kho SP lưu giá VND canonical. SP nhập từ tab ngoại tệ (so-order
    // CNY/USD…) có origin_currency + origin_rate → suy ngược giá GỐC = VND/rate
    // cho tooltip hover. Trả {title, hasOrigin}; SP nhập VND (origin null/VND) → ''.
    function originPriceHover(vnd, p) {
        const cur = p && p.originCurrency ? String(p.originCurrency).toUpperCase() : '';
        const rate = Number(p && p.originRate) || 0;
        if (!cur || cur === 'VND' || rate <= 0) return { title: '', hasOrigin: false };
        const v = (Number(vnd) || 0) / rate;
        const dec = cur === 'JPY' || cur === 'KRW' ? 0 : 2;
        const amt = v.toLocaleString('vi-VN', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
        });
        return {
            title: `Giá gốc: ${amt} ${cur} (nhập @ ${rate.toLocaleString('vi-VN')}₫/${cur})`,
            hasOrigin: true,
        };
    }
    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    // ---------- Render ----------
    //
    // _rowHtml(p, n) — render 1 <tr> cho 1 product với index n.
    // Tách thành helper để dùng được cho cả full renderRows() và in-place
    // update (tránh giật bảng khi SSE event update).
    function _rowHtml(p, n) {
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
        return `
                <tr data-code="${escapeHtml(p.code)}" class="${rowSelectedClass.trim()}">
                    <td class="select-cell"><input type="checkbox" class="w2p-checkbox" data-select-code="${escapeHtml(p.code)}"${checked} /></td>
                    <td>${n}</td>
                    <td>${imgHtml}</td>
                    <td><span class="code-badge code-product" onclick="Web2ProductsApp.copyCode('${escapeHtml(escJs(p.code))}')"><i data-lucide="tag"></i>${escapeHtml(p.code)}</span></td>
                    <td><div style="font-weight:600;">${escapeHtml(p.name)}</div></td>
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
                    <td class="note-cell" title="${escapeHtml(p.note || '')}">${escapeHtml(p.note || '—')}</td>
                    <td>
                        ${(() => {
                            // Status ưu tiên hơn isActive:
                            // - CHO_MUA → "CHỜ HÀNG" (chưa Mua hàng, stock=0).
                            // - MUA_1_PHAN → "MUA 1 PHẦN" (P1 2026-05-29: nhận được 1 phần,
                            //   còn pending). Hiển thị stock đang có + pending còn chờ.
                            // - DANG_BAN + isActive → "Đang bán".
                            // - !isActive → "Tạm dừng".
                            if (p.status === 'CHO_MUA') {
                                const pendingTxt =
                                    Number(p.pendingQty) > 0 ? ` (×${p.pendingQty})` : '';
                                return `<span class="active-badge active-pending" title="Chờ Mua hàng từ NCC${p.supplier ? ' ' + p.supplier : ''}"><i data-lucide="clock"></i>CHỜ HÀNG${pendingTxt}</span>`;
                            }
                            if (p.status === 'MUA_1_PHAN') {
                                const stock = Number(p.stock || 0);
                                const pend = Number(p.pendingQty || 0);
                                return `<span class="active-badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;" title="Đã nhận ${stock} cái, còn ${pend} cái chờ mua tiếp từ NCC ${p.supplier || '?'}"><i data-lucide="package-2"></i>MUA 1 PHẦN <span style="opacity:0.85;font-weight:500;margin-left:4px;">(${stock} đã nhận · ${pend} chờ)</span></span>`;
                            }
                            return p.isActive
                                ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>`
                                : `<span class="active-badge active-no"><i data-lucide="pause"></i>Tạm dừng</span>`;
                        })()}
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="Web2ProductsApp.openEdit('${escapeHtml(escJs(p.code))}')"><i data-lucide="pencil"></i></button>
                            <button class="btn-action act-print" title="${Number(p.printCount) > 0 ? `Tem mã vạch đã in ${Number(p.printCount)} lần — tránh in trùng` : 'In tem mã vạch'}" aria-label="In tem mã vạch" onclick="Web2ProductsApp.printBarcode('${escapeHtml(escJs(p.code))}')"><i data-lucide="printer"></i>${
                                Number(p.printCount) > 0
                                    ? `<span class="print-count-num">${Number(p.printCount)}</span>`
                                    : ''
                            }</button>
                            <button class="btn-action act-confirm" title="${p.isActive ? 'Tạm dừng' : 'Bán lại'}" onclick="Web2ProductsApp.toggleActive('${escapeHtml(escJs(p.code))}', ${!p.isActive})"><i data-lucide="${p.isActive ? 'pause' : 'play'}"></i></button>
                            <button class="btn-action act-history" title="Lịch sử chỉnh sửa" onclick="Web2ProductsApp.openHistory('${escapeHtml(escJs(p.code))}')"><i data-lucide="history"></i></button>
                            <button class="btn-action act-delete" title="Xóa" onclick="Web2ProductsApp.remove('${escapeHtml(escJs(p.code))}')"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
    }

    function renderRows() {
        const items = STATE.products;
        if (!items.length) {
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row">
                Chưa có sản phẩm — bấm "Thêm SP" để tạo
            </td></tr>`;
            _updateSelectAllState();
            _updateBulkBar();
            return;
        }
        tbody().innerHTML = items
            .map((p, idx) => _rowHtml(p, (STATE.page - 1) * STATE.limit + idx + 1))
            .join('');
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

    function _bulkPrint() {
        if (!STATE.selectedCodes.size) {
            notify('Chưa chọn SP nào để in', 'warning');
            return;
        }
        if (!window.Web2ProductsPrint?.open) {
            notify('Print module chưa load, refresh trang', 'error');
            return;
        }
        // Gather products — selectedCodes có thể ở trang khác nên fallback qua
        // Web2ProductsCache trước, rồi STATE.products.
        const cache = window.Web2ProductsCache;
        const collected = [];
        const missing = [];
        for (const code of STATE.selectedCodes) {
            const fromCache = cache?.findByCode?.(code);
            const fromState = STATE.products.find((p) => p.code === code);
            const p = fromCache || fromState;
            if (p) collected.push(p);
            else missing.push(code);
        }
        if (!collected.length) {
            notify('Không tìm thấy SP đã chọn (cache có thể chưa load)', 'error');
            return;
        }
        if (missing.length) {
            console.warn('[web2-products] bulk print missing codes:', missing);
        }
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
        STATE.products[idx] = newProduct;
        const tr = tbody().querySelector(`tr[data-code="${cssEscape(code)}"]`);
        if (!tr) return false;
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

    function cssEscape(s) {
        if (window.CSS?.escape) return window.CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);
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
                        ? 'Nháp'
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
        } else {
            tb.innerHTML = `<tr><td colspan="11" class="loading-row">
                <div class="spinner"></div>Đang tải dữ liệu...
            </td></tr>`;
        }
        try {
            const resp = await window.Web2ProductsApi.list({
                search: STATE.search || undefined,
                activeOnly: STATE.activeOnly,
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
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row" style="color:#ef4444;">
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

    // ---------- Filter ----------
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.activeOnly = $('#filterActive').value === 'true';
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterActive').value = 'all';
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.activeOnly = false;
        STATE.limit = 200;
        STATE.page = 1;
        load();
    }

    // ---------- Supplier dropdown — NGUỒN CHUNG: Ví NCC (supplier-wallet) ----------
    // 2026-06-16: chuyển nguồn NCC từ "tab Sổ Order" sang NGUỒN DUY NHẤT
    // `Web2SuppliersCache` → GET /api/web2-supplier-wallet/suppliers (bảng
    // web2_supplier_meta = trang Ví NCC). Mọi trang Web 2.0 cần NCC dùng chung
    // cache này (so-order, supplier-debt, purchase-refund). NCC name vẫn drive
    // prefix mã SP qua Web2ProductCode.buildPrefixMap (HÀ NỘI→HN, A1→A1…).
    let _suppliersFromSoOrder = null; // (giữ tên var — đổi sẽ phải sửa nhiều call site)
    let _suppliersLoadPromise = null;

    async function loadSuppliersFromSoOrder(force) {
        if (!force && Array.isArray(_suppliersFromSoOrder)) return _suppliersFromSoOrder;
        if (_suppliersLoadPromise && !force) return _suppliersLoadPromise;
        _suppliersLoadPromise = (async () => {
            try {
                const cache = window.Web2SuppliersCache;
                if (!cache?.init) {
                    console.warn('[products] Web2SuppliersCache chưa load — empty supplier list');
                    return [];
                }
                await cache.init();
                if (force && cache.refresh) await cache.refresh();
                _suppliersFromSoOrder = cache.getNames();
                return _suppliersFromSoOrder;
            } catch (e) {
                console.warn('[products] load suppliers (Ví NCC) fail:', e.message);
                return [];
            }
        })();
        return _suppliersLoadPromise;
    }

    // Synchronous accessor — sau khi loadSuppliersFromSoOrder() đã chạy
    function collectExistingSuppliers() {
        return Array.isArray(_suppliersFromSoOrder) ? _suppliersFromSoOrder.slice() : [];
    }

    async function populateSupplierDropdown() {
        const sel = $('#pmSupplier');
        if (!sel) return;
        const currentVal = sel.value;
        const suppliers = await loadSuppliersFromSoOrder();
        const opts = ['<option value="">— Chọn NCC —</option>'];
        // SP tạo TRỰC TIẾP tại Kho (không chọn NCC) → prefix mã = "KHO".
        opts.push(
            `<option value="KHO"${currentVal === 'KHO' ? ' selected' : ''}>KHO (tạo trực tiếp tại Kho)</option>`
        );
        // SP đang edit có NCC không nằm trong list Ví NCC (legacy) → prepend giữ giá trị.
        if (currentVal && currentVal !== 'KHO' && !suppliers.includes(currentVal)) {
            opts.push(
                `<option value="${escapeHtml(currentVal)}" selected>${escapeHtml(currentVal)} (legacy — không có trong Ví NCC)</option>`
            );
        }
        // NCC từ Ví NCC (supplier-wallet) → prefix mã theo tên (HÀ NỘI→HN, A1→A1…).
        for (const s of suppliers) {
            opts.push(
                `<option value="${escapeHtml(s)}"${s === currentVal ? ' selected' : ''}>${escapeHtml(s)}</option>`
            );
        }
        if (!suppliers.length) {
            opts.push(
                '<option value="" disabled>(Chưa có NCC nào — tạo trong trang Ví NCC trước)</option>'
            );
        }
        sel.innerHTML = opts.join('');
    }

    // Cache color shortmap — đọc TRỰC TIẾP từ variant.shortCode (locked tại DB)
    // Không compute client-side nữa → ổn định, không shift khi thêm biến thể mới.
    let _colorShortMapCache = null;
    function getColorShortMap() {
        // NGUỒN CHUNG (P5 2026-06-15): Web2VariantsCache.getColorShortMap (memoize +
        // tự invalidate khi variant đổi). Fallback inline nếu cache cũ chưa có method.
        const cache = window.Web2VariantsCache;
        if (cache?.getColorShortMap) return cache.getColorShortMap();
        if (_colorShortMapCache) return _colorShortMapCache;
        if (!cache?.getAll) return {};
        const map = {};
        for (const v of cache.getAll()) {
            if (!/màu/i.test(v.groupName || '')) continue;
            if (!v.shortCode) continue; // chỉ dùng locked shortcodes
            const stripped = String(v.value || '')
                .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                .trim();
            const key = window.Web2ProductCode.toAsciiUpper(stripped);
            if (key) map[key] = v.shortCode;
        }
        _colorShortMapCache = map;
        return _colorShortMapCache;
    }
    // Reset cache fallback khi kho biến thể đổi (path không có getColorShortMap).
    if (window.Web2VariantsCache?.subscribe) {
        window.Web2VariantsCache.subscribe(() => {
            _colorShortMapCache = null;
        });
    }

    // Auto-sinh mã SP từ NCC + Tên SP + variants. KHÔNG phải "gợi ý" —
    // mã được generate trực tiếp từ các phần đã có (NCC tab, tên SP keyword,
    // màu short_code từ variants, size). NCC bắt buộc chọn từ dropdown so-order.
    //
    // @param {boolean} silent — true = chạy auto-trigger (không notify warning
    //                          khi field thiếu); false = user click button (full notify).
    function suggestProductCode(silent) {
        if (!window.Web2ProductCode) {
            if (!silent) notify('Module sinh mã chưa load', 'error');
            return;
        }
        const supplierName = ($('#pmSupplier')?.value || '').trim();
        const productName = ($('#pmName')?.value || '').trim();
        if (!productName) {
            if (!silent) notify('Cần điền Tên sản phẩm trước', 'warning');
            return;
        }
        // Lookup shortCode TỪ CẢ 2 ô Màu + Size → override color + size cùng lúc.
        // Mã SP gồm cả 2 phần (vd KHOAODEN + màu ĐO + size L).
        let overrideColorShort = null;
        let overrideSizeShort = null;
        const cacheV = window.Web2VariantsCache;
        if (cacheV?.findByValueExact) {
            const colorText = ($('#pmVariantColor')?.value || '').trim();
            const sizeText = ($('#pmVariantSize')?.value || '').trim();
            if (colorText) {
                const cv = cacheV.findByValueExact(colorText);
                if (cv?.shortCode) overrideColorShort = cv.shortCode.toUpperCase();
            }
            if (sizeText) {
                const sv = cacheV.findByValueExact(sizeText);
                if (sv?.shortCode) overrideSizeShort = sv.shortCode.toUpperCase();
            }
        }
        if (!supplierName) {
            if (!silent) {
                notify('Cần chọn NCC (từ Ví NCC) — hoặc KHO (tạo tại Kho)', 'warning');
                $('#pmSupplier')?.focus();
            }
            return;
        }
        const suppliers = collectExistingSuppliers();
        const prefixMap = window.Web2ProductCode.buildPrefixMap(
            suppliers.includes(supplierName) ? suppliers : [...suppliers, supplierName]
        );
        // NCC "KHO" (SP tạo trực tiếp) → ép prefix literal "KHO" (vd KHOAODEN),
        // không rút gọn 2 chữ thành "KH".
        prefixMap['KHO'] = 'KHO';
        // existingCodes: lấy từ cache FULL (~20k mã, mọi trang) để tránh sinh
        // trùng mã xuyên bảng. STATE.products chỉ là trang hiện tại (~50-200).
        // Defensive: cache chưa sẵn → fallback STATE.products.
        let existingCodes;
        const _cacheAll = window.Web2ProductsCache?.getAll?.();
        if (Array.isArray(_cacheAll) && _cacheAll.length) {
            existingCodes = _cacheAll.map((p) => p.code).filter(Boolean);
        } else {
            existingCodes = STATE.products.map((p) => p.code).filter(Boolean);
        }
        let result;
        try {
            result = window.Web2ProductCode.suggest({
                supplierName,
                productName,
                existingCodes,
                supplierPrefixMap: prefixMap,
                colorShortMap: getColorShortMap(),
                overrideColorShort,
                overrideSizeShort,
            });
        } catch (e) {
            if (!silent) notify('Không sinh được mã: ' + e.message, 'error');
            return;
        }
        $('#pmCode').value = result.code;
        const hint = $('#pmCodeHint');
        if (hint) {
            const parts = result.parts;
            const detail = [
                `prefix=${parts.prefix}`,
                parts.type ? `loại=${parts.type}${parts.counter}` : null,
                parts.colorShort ? `màu=${parts.colorShort}` : null,
                parts.sizeShort ? `size=${parts.sizeShort}` : null,
            ]
                .filter(Boolean)
                .join(' · ');
            hint.textContent = `✨ ${detail}  (${result.code.length} ký tự)`;
        }
    }

    // ---------- Import dữ liệu (CSV/JSON qua Web2Import) ----------
    // Schema cột Kho SP. `code` để trống → tự sinh theo NCC + tên (Web2ProductCode).
    function _productImportConfig() {
        return {
            title: 'Nhập Kho Sản Phẩm',
            entityLabel: 'sản phẩm',
            fileBaseName: 'mau-kho-san-pham',
            columns: [
                {
                    key: 'name',
                    label: 'Tên sản phẩm',
                    required: true,
                    type: 'string',
                    aliases: ['ten san pham', 'ten', 'product', 'name', 'ten sp'],
                    hint: 'Bắt buộc',
                },
                {
                    key: 'code',
                    label: 'Mã SP',
                    type: 'string',
                    aliases: ['ma sp', 'ma', 'code', 'sku'],
                    hint: 'Để trống sẽ tự sinh theo NCC + tên',
                },
                {
                    key: 'variant',
                    label: 'Biến thể',
                    type: 'string',
                    aliases: ['bien the', 'variant', 'mau size', 'mau-size'],
                    hint: 'VD: Đỏ - L',
                },
                {
                    key: 'supplier',
                    label: 'NCC',
                    type: 'string',
                    aliases: ['nha cung cap', 'ncc', 'supplier', 'tab'],
                    hint: 'Dùng sinh mã (HÀ NỘI / HƯƠNG CHÂU / KHO)',
                },
                {
                    key: 'originalPrice',
                    label: 'Giá mua',
                    type: 'number',
                    aliases: ['gia mua', 'gia nhap', 'cost', 'originalprice'],
                    hint: 'Số, mặc định 0',
                },
                {
                    key: 'price',
                    label: 'Giá bán',
                    type: 'number',
                    aliases: ['gia ban', 'price', 'sell', 'sellprice'],
                    hint: 'Số, mặc định 0',
                },
                {
                    key: 'stock',
                    label: 'Tồn kho',
                    type: 'number',
                    aliases: ['ton kho', 'stock', 'sl ton', 'quantity', 'sl'],
                    hint: 'Số, mặc định 0',
                },
                {
                    key: 'note',
                    label: 'Ghi chú',
                    type: 'string',
                    aliases: ['ghi chu', 'note', 'tag'],
                },
                {
                    key: 'imageUrl',
                    label: 'Ảnh (URL)',
                    type: 'string',
                    aliases: ['anh', 'image', 'imageurl', 'hinh', 'hinh anh'],
                },
                {
                    key: 'isActive',
                    label: 'Trạng thái',
                    type: 'bool',
                    aliases: ['trang thai', 'status', 'active'],
                    enumValues: ['Đang bán', 'Tạm dừng'],
                    hint: 'Đang bán / Tạm dừng (mặc định Đang bán)',
                },
            ],
            sampleRows: [
                {
                    name: 'ÁO THUN BASIC',
                    code: '',
                    variant: 'Đỏ - L',
                    supplier: 'HÀ NỘI',
                    originalPrice: 85000,
                    price: 150000,
                    stock: 12,
                    note: 'HÀNG MỚI',
                    imageUrl: '',
                    isActive: 'Đang bán',
                },
                {
                    name: 'QUẦN JEAN ỐNG SUÔNG',
                    code: '',
                    variant: 'Xanh - 30',
                    supplier: 'HƯƠNG CHÂU',
                    originalPrice: 120000,
                    price: 250000,
                    stock: 5,
                    note: '',
                    imageUrl: '',
                    isActive: 'Đang bán',
                },
            ],
            onDone: () => load(),
            onCommit: _commitProductImport,
        };
    }

    async function _commitProductImport(rows, { onProgress } = {}) {
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const histMeta = {
            userId: user.uid || user.email || null,
            userName: user.displayName || user.email || null,
            sourcePage: 'products-import',
        };
        // existingCodes từ cache full để auto-gen không trùng xuyên bảng.
        let existingCodes = [];
        const _cacheAll = window.Web2ProductsCache?.getAll?.();
        if (Array.isArray(_cacheAll) && _cacheAll.length)
            existingCodes = _cacheAll.map((p) => p.code).filter(Boolean);
        else existingCodes = STATE.products.map((p) => p.code).filter(Boolean);
        existingCodes = existingCodes.slice();

        const suppliers = collectExistingSuppliers();
        const colorShortMap = getColorShortMap();

        let ok = 0;
        let fail = 0;
        const errors = [];
        const total = rows.length;
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const rowNo = i + 2; // +2: dòng 1 là header trong file
            try {
                const name = (r.name || '').trim();
                const variant = (r.variant || '').trim();
                const supplier = (r.supplier || '').trim();
                let code = (r.code || '').trim();
                // Auto-sinh mã nếu để trống.
                if (!code && window.Web2ProductCode) {
                    const supName = supplier || 'KHO';
                    const prefixMap = window.Web2ProductCode.buildPrefixMap(
                        suppliers.includes(supName) ? suppliers : [...suppliers, supName]
                    );
                    prefixMap['KHO'] = 'KHO';
                    try {
                        const res = window.Web2ProductCode.suggest({
                            supplierName: supName,
                            productName: variant ? `${name} ${variant}` : name,
                            existingCodes,
                            supplierPrefixMap: prefixMap,
                            colorShortMap,
                        });
                        code = res?.code || '';
                    } catch (_) {
                        /* suggest lỗi → fallback dưới */
                    }
                }
                if (!code) {
                    // Fallback: ASCII-upper từ tên + số thứ tự, tránh mã rác rỗng.
                    const base = (window.Web2ProductCode?.toAsciiUpper?.(name) || 'SP')
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 10);
                    let cand = base || 'SP';
                    let n = 1;
                    while (existingCodes.includes(cand)) cand = `${base}${++n}`;
                    code = cand;
                }
                existingCodes.push(code);

                const payload = {
                    code,
                    name,
                    supplier: supplier || null,
                    variant: variant || null,
                    price: Number(r.price) || 0,
                    originalPrice: Number(r.originalPrice) || 0,
                    stock: Number(r.stock) || 0,
                    imageUrl: (r.imageUrl || '').trim() || null,
                    note: (r.note || '').trim() || null,
                    isActive: r.isActive === undefined ? true : r.isActive !== false,
                    createdBy: user.uid || user.email || null,
                    ...histMeta,
                };
                await window.Web2ProductsApi.create(payload);
                ok++;
            } catch (e) {
                fail++;
                errors.push({ row: rowNo, error: e?.message || 'Lỗi không xác định' });
            }
            if (onProgress) onProgress({ done: i + 1, total });
        }
        // Đồng bộ cache + reload list.
        window.Web2ProductsCache?.pushTickle?.({ action: 'import', count: ok });
        return { ok, fail, errors };
    }

    // ---------- Modal ----------
    function openCreate() {
        STATE.editingCode = null;
        $('#productModalTitle').innerHTML = `<i data-lucide="plus"></i><span>Thêm sản phẩm</span>`;
        $('#pmCode').value = '';
        $('#pmCode').disabled = false;
        // Mặc định NCC = "KHO" cho SP tạo trực tiếp tại Kho (set sau populate).
        if ($('#pmSupplier')) $('#pmSupplier').value = 'KHO';
        if ($('#pmCodeHint')) $('#pmCodeHint').textContent = '';
        $('#pmName').value = '';
        _setVariantPickers('');
        $('#pmPriceBuy').value = 0;
        $('#pmPriceSell').value = 0;
        $('#pmStock').value = 0;
        $('#pmImage').value = '';
        $('#pmNote').value = '';
        $('#pmIsActive').value = 'true';
        updateImagePreview('');
        // populateSupplierDropdown async (await load tabs từ Firestore) → set KHO
        // SAU khi rebuild xong, nếu set trước thì option KHO chưa tồn tại → value rớt "".
        populateSupplierDropdown().then(() => {
            if ($('#pmSupplier')) $('#pmSupplier').value = 'KHO';
        });
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        // Focus ô Tên SP (field user nhập tay đầu) thay vì NCC (auto-fill 'KHO').
        setTimeout(() => ($('#pmName') || $('#pmSupplier'))?.focus(), 50);
    }
    function openEdit(code) {
        const p = STATE.products.find((x) => x.code === code);
        if (!p) return;
        STATE.editingCode = code;
        $('#productModalTitle').innerHTML =
            `<i data-lucide="pencil"></i><span>Sửa sản phẩm ${escapeHtml(code)}</span>`;
        $('#pmCode').value = p.code;
        $('#pmCode').disabled = true;
        if ($('#pmSupplier')) $('#pmSupplier').value = p.supplier || '';
        if ($('#pmCodeHint')) $('#pmCodeHint').textContent = '';
        $('#pmName').value = p.name || '';
        _setVariantPickers(p.variant || '');
        $('#pmPriceBuy').value = p.originalPrice || 0;
        $('#pmPriceSell').value = p.price || 0;
        $('#pmStock').value = p.stock ?? 0;
        $('#pmImage').value = p.imageUrl || '';
        $('#pmNote').value = p.note || '';
        $('#pmIsActive').value = p.isActive ? 'true' : 'false';
        updateImagePreview(p.imageUrl || '');
        populateSupplierDropdown();
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
    // ─── History modal ───────────────────────────────────────────
    //
    // Mở modal "Lịch sử chỉnh sửa SP {code}" — list timeline mọi mutation
    // (create/update/delete/stock-adjust) với who/when/source/diff.
    async function openHistory(code) {
        document.querySelectorAll('.w2p-history-modal').forEach((el) => el.remove());
        const productName = STATE.products.find((p) => p.code === code)?.name || code;

        const m = document.createElement('div');
        m.className = 'w2p-history-modal';
        m.innerHTML = `
            <div class="w2p-history-box">
                <div class="w2p-history-head">
                    <i data-lucide="history" style="width:18px;height:18px;"></i>
                    <div style="flex:1;min-width:0;">
                        <strong style="display:block;font-size:14px;">${escapeHtml(productName)}</strong>
                        <span style="font-size:11px;opacity:.85;">${escapeHtml(code)} · Lịch sử chỉnh sửa</span>
                    </div>
                    <button class="w2p-history-close">×</button>
                </div>
                <div class="w2p-history-body" id="w2pHistList">
                    <div class="w2p-history-loading"><div class="spinner"></div>Đang tải lịch sử...</div>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('.w2p-history-close').onclick = () => m.remove();
        m.addEventListener('click', (e) => {
            if (e.target === m) m.remove();
        });
        if (window.lucide) lucide.createIcons();

        try {
            const r = await fetch(
                `${PROXY_BASE}/api/web2-products/${encodeURIComponent(code)}/history?limit=100`
            );
            const data = await r.json();
            const list = data?.history || [];
            const listEl = m.querySelector('#w2pHistList');
            if (!list.length) {
                listEl.innerHTML = `<div class="w2p-history-empty">Chưa có lịch sử nào.</div>`;
                return;
            }
            listEl.innerHTML = list.map(renderHistEntry).join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            m.querySelector('#w2pHistList').innerHTML =
                `<div class="w2p-history-empty" style="color:#dc2626;">Lỗi tải: ${escapeHtml(e.message)}</div>`;
        }
    }

    function renderHistEntry(h) {
        const time = new Date(h.createdAt).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh', // quy tắc 10 GMT+7
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        const actionMeta = {
            create: { label: 'Tạo mới', color: '#16a34a', icon: 'plus-circle' },
            update: { label: 'Cập nhật', color: '#3b82f6', icon: 'pencil' },
            delete: { label: 'Xoá', color: '#dc2626', icon: 'trash-2' },
            'stock-adjust': { label: 'Điều chỉnh tồn', color: '#f59e0b', icon: 'package' },
            'toggle-active': { label: 'Đổi trạng thái', color: '#2a96ff', icon: 'toggle-left' },
            'confirm-purchase': { label: 'Mua hàng', color: '#0ea5e9', icon: 'shopping-cart' },
            'upsert-pending': { label: 'Đặt nháp', color: '#94a3b8', icon: 'clock' },
        };
        const am = actionMeta[h.action] || { label: h.action, color: '#64748b', icon: 'circle' };

        let changesHtml = '';
        if (h.action === 'create' || h.action === 'delete') {
            const snap = h.changes?.snapshot || h.changes || {};
            const keys = ['code', 'name', 'variant', 'price', 'originalPrice', 'stock', 'note'];
            changesHtml = keys
                .filter((k) => snap[k] != null && snap[k] !== '' && snap[k] !== 0)
                .map(
                    (k) =>
                        `<div class="w2p-hist-field"><span class="w2p-hist-field-name">${k}</span>: <span class="w2p-hist-after">${escapeHtml(String(snap[k]).slice(0, 60))}</span></div>`
                )
                .join('');
        } else {
            // update — diff format {field: {before, after}}
            changesHtml = Object.entries(h.changes || {})
                .map(([field, diff]) => {
                    if (!diff || typeof diff !== 'object' || !('before' in diff)) return '';
                    const fmt = (v) => {
                        if (v == null || v === '') return '<em>(rỗng)</em>';
                        const s = String(v);
                        if (s.startsWith('data:image')) return '<em>(ảnh base64)</em>';
                        return escapeHtml(s.slice(0, 80));
                    };
                    return `<div class="w2p-hist-field">
                        <span class="w2p-hist-field-name">${escapeHtml(field)}</span>:
                        <span class="w2p-hist-before">${fmt(diff.before)}</span>
                        <i data-lucide="arrow-right" style="width:11px;height:11px;color:#94a3b8;"></i>
                        <span class="w2p-hist-after">${fmt(diff.after)}</span>
                    </div>`;
                })
                .join('');
            if (!changesHtml)
                changesHtml =
                    '<div class="w2p-hist-field" style="color:#94a3b8;font-style:italic;">(không có thay đổi field)</div>';
        }

        // 3H15 FIX (2026-06-12): userName/userId do client tự khai (body/header
        // x-user-name, lưu web2_product_history) — render thô vào innerHTML là
        // stored XSS. Escape; fallback HTML tĩnh giữ riêng.
        const user =
            h.userName || h.userId ? escapeHtml(h.userName || h.userId) : '<em>không rõ</em>';
        const sourceBadge = h.sourcePage
            ? `<span class="w2p-hist-source" title="Trang chỉnh sửa">${escapeHtml(h.sourcePage)}</span>`
            : '';
        return `<div class="w2p-hist-entry">
            <div class="w2p-hist-marker" style="background:${am.color}20;color:${am.color};">
                <i data-lucide="${am.icon}" style="width:14px;height:14px;"></i>
            </div>
            <div class="w2p-hist-content">
                <div class="w2p-hist-meta">
                    <strong style="color:${am.color};">${am.label}</strong>
                    <span class="w2p-hist-user"><i data-lucide="user" style="width:10px;height:10px;"></i>${user}</span>
                    ${sourceBadge}
                    <span class="w2p-hist-time">${time}</span>
                </div>
                <div class="w2p-hist-changes">${changesHtml}</div>
            </div>
        </div>`;
    }

    function closeModal() {
        STATE.editingCode = null;
        modal().classList.remove('active');
    }
    function updateImagePreview(url) {
        const box = $('#pmImagePreview');
        const img = $('#pmImagePreviewImg');
        if (url) {
            img.src = url;
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
            img.src = '';
        }
    }

    async function saveModal() {
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const supplierInput = ($('#pmSupplier')?.value || '').trim();
        const fields = {
            code: $('#pmCode').value.trim(),
            name: $('#pmName').value.trim(),
            supplier: supplierInput || null,
            variant: _combinedVariant() || null,
            price: Number($('#pmPriceSell').value) || 0,
            originalPrice: Number($('#pmPriceBuy').value) || 0,
            stock: Number($('#pmStock').value) || 0,
            imageUrl: $('#pmImage').value.trim() || null,
            note: $('#pmNote').value.trim() || null,
            isActive: $('#pmIsActive').value === 'true',
        };
        // Nhập nhiều biến thể (TẠO MỚI): Màu "Đen / Đỏ" × Size "S / M" → N SP.
        // Tách trước validate đơn lẻ + check mã (bulk tự sinh mã + validate token).
        if (!STATE.editingCode) {
            const combos = window.Web2VariantMulti?.cartesian?.(
                $('#pmVariantColor')?.value,
                $('#pmVariantSize')?.value,
                ', '
            );
            if (combos && combos.length > 1) {
                if (!fields.name) return notify('Thiếu tên SP', 'error');
                return _bulkCreateVariants(fields, combos);
            }
        }
        if (!fields.code) return notify('Thiếu mã SP', 'error');
        if (!fields.name) return notify('Thiếu tên SP', 'error');
        // Validate variant: nếu user đã gõ thì phải tồn tại trong kho biến thể.
        if (fields.variant) {
            const cache = window.Web2VariantsCache;
            if (cache && !cache.findByValueExact(fields.variant)) {
                return notify(
                    `Biến thể "${fields.variant}" chưa có trong Kho Biến Thể — vui lòng thêm trước rồi chọn lại.`,
                    'error'
                );
            }
        }

        // History audit info — user + source page (cho backend log).
        const histMeta = {
            userId: user.uid || user.email || null,
            userName: user.displayName || user.email || null,
            sourcePage: 'products',
        };

        const updatePayload = {
            name: fields.name,
            supplier: fields.supplier,
            variant: fields.variant,
            price: fields.price,
            originalPrice: fields.originalPrice,
            stock: fields.stock,
            imageUrl: fields.imageUrl,
            note: fields.note,
            isActive: fields.isActive,
            ...histMeta,
        };

        // ─── UPDATE branch ──────────────────────────────────────────
        if (STATE.editingCode) {
            const editCode = STATE.editingCode;
            const idx = STATE.products.findIndex((p) => p.code === editCode);
            const prevProduct = idx !== -1 ? { ...STATE.products[idx] } : null;
            if (window.Web2Optimistic?.run && prevProduct) {
                closeModal();
                Web2Optimistic.run({
                    snapshot: () => prevProduct,
                    apply: () => {
                        // Optimistic merge: gộp fields vào row hiện tại + render
                        // tại chỗ (giữ vị trí, không nhảy lên đầu).
                        const merged = { ...prevProduct, ...fields };
                        const ok = _updateRowInPlace(editCode, merged);
                        if (!ok) renderRows();
                    },
                    run: async () => {
                        return await window.Web2ProductsApi.update(editCode, updatePayload);
                    },
                    onSuccess: (resp) => {
                        if (resp?.product) {
                            const ok = _updateRowInPlace(editCode, resp.product);
                            if (!ok) renderRows();
                        }
                    },
                    rollback: (prev) => {
                        const i = STATE.products.findIndex((p) => p.code === editCode);
                        if (i !== -1 && prev) STATE.products[i] = prev;
                        const ok = _updateRowInPlace(editCode, prev);
                        if (!ok) renderRows();
                    },
                    successMsg: 'Đã lưu',
                    errLabel: `lưu SP ${editCode}`,
                });
                return;
            }
            // Legacy await path (helper/snapshot chưa sẵn).
            try {
                const resp = await window.Web2ProductsApi.update(editCode, updatePayload);
                // In-place update — KHÔNG re-render bảng để tránh giật + SP
                // vừa sửa không nhảy lên đầu (vì backend sort by updated_at DESC).
                // KHÔNG gọi pushTickle: nó internal trigger _loadList() → emit
                // 'refresh' → app subscriber gọi full load() → SP nhảy lên đầu.
                if (resp.product) {
                    const ok = _updateRowInPlace(editCode, resp.product);
                    if (!ok) renderRows();
                }
                notify('Đã lưu', 'success');
                closeModal();
            } catch (e) {
                notify('Lỗi: ' + e.message, 'error');
            }
            return;
        }

        // ─── CREATE branch ──────────────────────────────────────────
        const createPayload = {
            ...fields,
            createdBy: user.uid || user.email || null,
            ...histMeta,
        };
        if (window.Web2Optimistic?.run) {
            const snapshot = {
                products: STATE.products.slice(),
                total: STATE.total,
            };
            const optimisticRow = { ...fields, printCount: 0 };
            closeModal();
            Web2Optimistic.run({
                snapshot: () => snapshot,
                apply: () => {
                    // Optimistic: chèn SP mới lên đầu danh sách (backend sort
                    // updated_at DESC → SP mới nằm đầu sau reload).
                    STATE.products = [optimisticRow, ...STATE.products];
                    STATE.total = STATE.total + 1;
                    renderRows();
                    renderPagination();
                    renderCounters();
                },
                run: async () => {
                    return await window.Web2ProductsApi.create(createPayload);
                },
                onSuccess: () => {
                    window.Web2ProductsCache?.pushTickle?.({
                        action: 'create',
                        code: fields.code,
                    });
                    // Reload để lấy data authoritative (id, server-side fields).
                    load();
                },
                rollback: (snap) => {
                    if (snap) {
                        STATE.products = snap.products;
                        STATE.total = snap.total;
                        renderRows();
                        renderPagination();
                        renderCounters();
                    }
                },
                successMsg: `Đã tạo SP ${fields.code}`,
                errLabel: `tạo SP ${fields.code}`,
            });
            return;
        }
        // Legacy await path.
        try {
            await window.Web2ProductsApi.create(createPayload);
            notify(`Đã tạo SP ${fields.code}`, 'success');
            window.Web2ProductsCache?.pushTickle?.({ action: 'create', code: fields.code });
            load(); // reload to include new item at top
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // UI-first: badge toggle NGAY, PATCH background. Lỗi → rollback isActive.
    function toggleActive(code, newState) {
        const product = STATE.products.find((p) => p.code === code);
        const prevState = product?.isActive;
        const u = window.AuthManager?.getCurrentUser?.() || {};
        if (window.Web2Optimistic?.run && product) {
            Web2Optimistic.run({
                snapshot: () => prevState,
                apply: () => {
                    product.isActive = newState;
                    const ok = _updateRowInPlace(code, product);
                    if (!ok) renderRows();
                },
                run: async () => {
                    return await window.Web2ProductsApi.update(code, {
                        isActive: newState,
                        userId: u.uid || u.email || null,
                        userName: u.displayName || u.email || null,
                        sourcePage: 'products',
                    });
                },
                onSuccess: (resp) => {
                    if (resp.product) {
                        Object.assign(product, resp.product);
                        const ok = _updateRowInPlace(code, resp.product);
                        if (!ok) renderRows();
                    }
                },
                rollback: (prev) => {
                    if (product) product.isActive = prev;
                    const ok = _updateRowInPlace(code, product);
                    if (!ok) renderRows();
                },
                successMsg: newState ? 'Đã bật bán' : 'Đã tạm dừng',
                errLabel: `toggle ${code}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.Web2ProductsApi.update(code, {
                        isActive: newState,
                        userId: u.uid || u.email || null,
                        userName: u.displayName || u.email || null,
                        sourcePage: 'products',
                    });
                    if (resp.product) {
                        const ok = _updateRowInPlace(code, resp.product);
                        if (!ok) renderRows();
                    }
                    notify(newState ? 'Đã bật bán' : 'Đã tạm dừng', 'success');
                } catch (e) {
                    notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    }

    async function remove(code) {
        const ok = window.Popup
            ? await window.Popup.confirm(`Không thể hoàn tác.`, {
                  title: `Xoá SP ${code}?`,
                  okText: 'Xoá sản phẩm',
                  cancelText: 'Đóng',
                  type: 'error',
              })
            : confirm(`Xóa SP ${code}? Không thể hoàn tác.`);
        if (!ok) return;
        await _doRemove(code, false);
    }

    async function _doRemove(code, force) {
        try {
            await window.Web2ProductsApi.remove(code, { force });
            STATE.products = STATE.products.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderPagination();
            renderCounters();
            notify(`Đã xóa ${code}`, 'success');
            window.Web2ProductsCache?.pushTickle?.({ action: 'delete', code });
        } catch (e) {
            // 409 = SP còn pending_qty > 0, cảnh báo user trước khi force.
            if (e.status === 409 && e.body) {
                const b = e.body;
                const msg = `${b.message || ''}\n\nVẫn muốn xóa SP "${b.name}" (${b.code})?`;
                const confirmForce = window.Popup
                    ? await window.Popup.confirm(msg, {
                          title: `SP còn ${b.pendingQty} cái CHỜ HÀNG`,
                          okText: 'Vẫn xóa',
                          cancelText: 'Hủy',
                          type: 'warning',
                      })
                    : confirm(msg);
                if (confirmForce) await _doRemove(code, true);
                return;
            }
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => notify(`Đã copy ${code}`, 'success'));
        }
    }

    function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        STATE.page = Math.min(Math.max(1, p), totalPages);
        load();
    }

    // ─── Variant picker: 2 ô Màu + Size cùng lúc ─────────────────────────
    // Mỗi ô khoá free-text (phải pick từ Kho Biến Thể). Lưu DB dạng "Màu, Size".
    function _isSizeGroup(groupName) {
        const g = (groupName || '').toLowerCase();
        return g.includes('size') || g.includes('cỡ') || g.includes('co');
    }
    // Phân loại 1 giá trị biến thể → 'color' | 'size' | null (theo nhóm trong kho).
    function _variantKind(value) {
        const v = window.Web2VariantsCache?.findByValueExact?.((value || '').trim());
        if (!v) return null;
        return _isSizeGroup(v.groupName) ? 'size' : 'color';
    }
    // Ghép 2 ô thành chuỗi variant lưu DB ("Đỏ, L").
    function _combinedVariant() {
        const c = ($('#pmVariantColor')?.value || '').trim();
        const s = ($('#pmVariantSize')?.value || '').trim();
        return [c, s].filter(Boolean).join(', ');
    }
    // Đổ chuỗi variant đã lưu vào 2 ô (split ',' + phân loại theo nhóm; phần
    // không rõ nhóm → ưu tiên ô Màu rồi ô Size).
    function _setVariantPickers(variantStr) {
        const colorEl = $('#pmVariantColor');
        const sizeEl = $('#pmVariantSize');
        if (colorEl) colorEl.value = '';
        if (sizeEl) sizeEl.value = '';
        // Đóng cả 2 dropdown khi mở modal — tránh "tự mở" do state cũ.
        const cd = $('#pmVariantColorSuggest');
        const sd = $('#pmVariantSizeSuggest');
        if (cd) cd.hidden = true;
        if (sd) sd.hidden = true;
        if (!variantStr) return;
        const parts = String(variantStr)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        for (const part of parts) {
            const kind = _variantKind(part);
            if (kind === 'size' && sizeEl && !sizeEl.value) sizeEl.value = part;
            else if (colorEl && !colorEl.value) colorEl.value = part;
            else if (sizeEl && !sizeEl.value) sizeEl.value = part;
        }
    }
    // Hint chung: cả 2 ô phải pick từ kho mới hợp lệ.
    function _renderCombinedHint() {
        const hint = $('#pmVariantHint');
        if (!hint) return;
        const cache = window.Web2VariantsCache;
        const c = ($('#pmVariantColor')?.value || '').trim();
        const s = ($('#pmVariantSize')?.value || '').trim();
        if (!c && !s) {
            hint.className = 'variant-picker-hint';
            hint.textContent = 'Bỏ trống nếu SP không có biến thể. Chọn được CẢ Màu lẫn Size.';
            return;
        }
        const bad = [];
        if (c && !cache?.findByValueExact?.(c)) bad.push('Màu');
        if (s && !cache?.findByValueExact?.(s)) bad.push('Size');
        if (bad.length) {
            hint.className = 'variant-picker-hint is-error';
            hint.innerHTML = `${bad.join(' + ')} chưa có trong kho — <a href="../variants/index.html" target="_blank">thêm tại Kho Biến Thể</a> trước.`;
        } else {
            hint.className = 'variant-picker-hint is-ok';
            hint.textContent =
                '✓ ' + [c && `Màu: ${c}`, s && `Size: ${s}`].filter(Boolean).join(' · ');
        }
    }
    // Wire 1 ô (kind='color'|'size') — dropdown CHỈ show biến thể đúng nhóm.
    function _wireVariantPickerFor(inputId, dropdownId, kind) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;
        function _show(query) {
            const cache = window.Web2VariantsCache;
            if (!cache) {
                dropdown.hidden = true;
                return;
            }
            // Nhập nhiều ("Đen / Đỏ"): gợi ý theo token CUỐI sau dấu "/".
            const q = String(query || '')
                .split('/')
                .pop()
                .trim()
                .toLowerCase();
            const wantSize = kind === 'size';
            const items = cache
                .getAll()
                .filter((v) => _isSizeGroup(v.groupName) === wantSize)
                .filter((v) => !q || (v.value || '').toLowerCase().includes(q))
                .slice(0, 12);
            if (!items.length) {
                dropdown.innerHTML = `<div class="variant-suggest-empty">Không có biến thể ${wantSize ? 'Size' : 'Màu'} nào. <a href="../variants/index.html" target="_blank">Thêm ở Kho Biến Thể →</a></div>`;
                dropdown.hidden = false;
                return;
            }
            dropdown.innerHTML = items
                .map(
                    (v) =>
                        `<button type="button" class="variant-suggest-item" data-val="${escapeHtml(v.value)}"><span class="variant-suggest-value">${escapeHtml(v.value)}</span>${v.groupName ? `<span class="variant-suggest-group">${escapeHtml(v.groupName)}</span>` : ''}</button>`
                )
                .join('');
            dropdown.hidden = false;
            dropdown.querySelectorAll('.variant-suggest-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    // Append vào token CUỐI (giữ list "Đen / Đỏ" khi đang build nhiều).
                    const segs = input.value.split('/');
                    segs[segs.length - 1] = btn.dataset.val;
                    input.value = segs.map((s) => s.trim()).join(' / ');
                    dropdown.hidden = true;
                    input.blur();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    _renderCombinedHint();
                    _renderVariantMultiPreview();
                });
            });
        }
        input.addEventListener('focus', () => _show(input.value));
        input.addEventListener('input', () => {
            _show(input.value);
            _renderCombinedHint();
            _renderVariantMultiPreview();
        });
        input.addEventListener('blur', () => setTimeout(() => (dropdown.hidden = true), 180));
    }

    // Preview "nhập nhiều biến thể": Màu "Đen / Đỏ" × Size "S / M" → N SP cartesian.
    // Chỉ hiện khi TẠO MỚI (edit 1 SP không bulk) + ra >1 combo.
    function _renderVariantMultiPreview() {
        const el = $('#pmVariantMultiPreview');
        if (!el) return;
        const combos =
            window.Web2VariantMulti?.cartesian?.(
                $('#pmVariantColor')?.value,
                $('#pmVariantSize')?.value,
                ' / '
            ) || [];
        if (STATE.editingCode || combos.length <= 1) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        el.innerHTML =
            `<div class="vm-head"><i data-lucide="layers"></i> Tạo ${combos.length} SP biến thể cùng lúc:</div>` +
            `<div class="vm-chips">${combos.map((c) => `<span class="vm-chip">${escapeHtml(c)}</span>`).join('')}</div>`;
        el.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Bulk-create N SP từ list biến thể (Màu × Size). Validate từng token có trong
    // Kho Biến Thể; sinh mã RIÊNG mỗi combo (unique trong batch); create await-loop
    // (không optimistic vì N item) → reload + tổng kết. baseFields = fields chung.
    async function _bulkCreateVariants(baseFields, combosComma) {
        const cache = window.Web2VariantsCache;
        const PC = window.Web2ProductCode;
        if (!PC) return notify('Module sinh mã chưa load', 'error');
        const split = (x) =>
            String(x || '')
                .split('/')
                .map((s) => s.trim())
                .filter(Boolean);
        const colors = split($('#pmVariantColor')?.value);
        const sizes = split($('#pmVariantSize')?.value);
        // Validate TỪNG token (không validate chuỗi gộp).
        const bad = [...colors, ...sizes].filter((v) => cache && !cache.findByValueExact(v));
        if (bad.length)
            return notify(
                `Biến thể chưa có trong Kho: ${bad.join(', ')} — thêm tại Kho Biến Thể rồi thử lại.`,
                'error'
            );
        const supplierName = baseFields.supplier || 'KHO';
        const suppliers = collectExistingSuppliers();
        const prefixMap = PC.buildPrefixMap(
            suppliers.includes(supplierName) ? suppliers : [...suppliers, supplierName]
        );
        prefixMap['KHO'] = 'KHO';
        let existing = (window.Web2ProductsCache?.getAll?.() || STATE.products)
            .map((p) => p.code)
            .filter(Boolean);
        const payloads = [];
        for (const combo of combosComma) {
            const [cPart, sPart] = combo.split(',').map((s) => s.trim());
            let oc = null;
            let os = null;
            if (cPart) {
                const cv = cache.findByValueExact(cPart);
                if (cv?.shortCode) oc = cv.shortCode.toUpperCase();
            }
            if (sPart) {
                const sv = cache.findByValueExact(sPart);
                if (sv?.shortCode) os = sv.shortCode.toUpperCase();
            }
            let code;
            try {
                code = PC.suggest({
                    supplierName,
                    productName: baseFields.name,
                    existingCodes: existing,
                    supplierPrefixMap: prefixMap,
                    colorShortMap: getColorShortMap(),
                    overrideColorShort: oc,
                    overrideSizeShort: os,
                }).code;
            } catch (e) {
                return notify('Không sinh được mã: ' + e.message, 'error');
            }
            existing = [...existing, code]; // tránh trùng trong cùng batch
            payloads.push({ ...baseFields, code, variant: combo });
        }
        closeModal();
        let ok = 0;
        let fail = 0;
        for (const p of payloads) {
            try {
                await window.Web2ProductsApi.create(p);
                ok++;
            } catch (e) {
                fail++;
                console.error('[products bulk-variant] create fail', p.code, e?.message);
            }
        }
        window.Web2ProductsCache?.pushTickle?.({ action: 'create' });
        load();
        notify(
            `Đã tạo ${ok} SP biến thể${fail ? ` (lỗi ${fail})` : ''}`,
            fail ? 'warning' : 'success'
        );
    }
    function _wireVariantPicker() {
        _wireVariantPickerFor('pmVariantColor', 'pmVariantColorSuggest', 'color');
        _wireVariantPickerFor('pmVariantSize', 'pmVariantSizeSuggest', 'size');
        _renderCombinedHint();
    }

    // ---------- Init ----------
    // SSE realtime — auto sync khi server thông báo mutation.
    // Subscribe 3 topic:
    //   - web2:products → CRUD trực tiếp (create/update/delete/stock adjust)
    //   - web2:fast-sale-orders → tạo PBH deduct stock + sync state
    //   - web2:native-orders → đổi status đơn → ảnh hưởng badge "ĐANG DÙNG"
    //
    // Strategy:
    //   - Event 'update' + code cụ thể có trong page hiện tại → fetch chỉ SP đó
    //     và update tại chỗ (KHÔNG full load → KHÔNG giật bảng + KHÔNG re-sort).
    //   - Event 'create' / 'delete' / không code → full load (cần ảnh hưởng total).
    //   - fast-sale-orders / native-orders → chỉ ảnh hưởng badge "ĐANG DÙNG" →
    //     gọi _loadUsageForCurrentPage() (cell-level update, không nháy bảng).
    // ⚠ Cần 2 timer RIÊNG biệt — KHÔNG share giữa fullLoad vs refreshUsageOnly.
    // Khi PBH tạo, server fire 3 topics liên tiếp:
    //   web2:native-orders status-bumped → muốn refreshUsageOnly
    //   web2:products pbh-stock-deduct  → muốn debouncedFullLoad (stock thay đổi)
    //   web2:fast-sale-orders from-native-order → muốn refreshUsageOnly
    // Nếu share timer → web2:fast-sale-orders event đến SAU sẽ clearTimeout của
    // debouncedFullLoad → stock cell không update, chỉ usage update.
    let _sseReloadTimer = null;
    let _sseUsageTimer = null;
    function _setupSse() {
        if (!window.Web2SSE?.subscribe) return;

        const debouncedFullLoad = () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(() => {
                _sseReloadTimer = null;
                load();
            }, 500);
        };

        window.Web2SSE.subscribe('web2:products', async (msg) => {
            const { action, code, codes } = msg.data || {};
            // affected = mọi code bị đổi (bulk op gửi codes[], CRUD đơn gửi code).
            const affected = codes && codes.length ? codes : code ? [code] : [];
            console.log(
                '[Web2Products-SSE] web2:products',
                action,
                affected.length ? affected.join(',') : '(no code)'
            );

            // create/delete đổi TỔNG số dòng / phân trang → buộc full reload.
            if (action === 'create' || action === 'delete') {
                if (action === 'delete' && code) STATE.selectedCodes.delete(code);
                debouncedFullLoad();
                return;
            }

            // Mọi action update-like (update / confirm-purchase / confirm-purchase-partial
            // / upsert-pending / adjust-stock / adjust-pending / mark-printed): patch
            // CHỈ các row bị đổi tại chỗ → KHÔNG full reload → KHÔNG giật bảng.
            if (affected.length) {
                try {
                    const res = await _updateRowsBatch(affected);
                    if (res.handled) return; // đã patch (hoặc không có code nào on-page)
                } catch (e) {
                    console.warn('[Web2Products-SSE] batch in-place failed, fallback:', e?.message);
                }
            }
            // Không xác định được code (vd backfill-supplier codes=null) → full reload an toàn.
            debouncedFullLoad();
        });

        // Topic fast-sale-orders / native-orders → chỉ ảnh hưởng cell "ĐANG DÙNG"
        // → refresh usage map mà không re-render bảng (cell-level update in-place).
        // Dùng _sseUsageTimer RIÊNG, KHÔNG share với _sseReloadTimer của fullLoad.
        const refreshUsageOnly = () => {
            if (_sseUsageTimer) clearTimeout(_sseUsageTimer);
            _sseUsageTimer = setTimeout(() => {
                _sseUsageTimer = null;
                _loadUsageForCurrentPage();
            }, 600);
        };
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => {
            console.log('[Web2Products-SSE] fast-sale-orders → refresh usage');
            refreshUsageOnly();
        });
        window.Web2SSE.subscribe('web2:native-orders', () => {
            console.log('[Web2Products-SSE] native-orders → refresh usage');
            refreshUsageOnly();
        });
    }

    // Deep-link handler: ?code=<khocode> — pre-filter, scroll, flash, open edit.
    // Called after the initial load() resolves so STATE.products is populated.
    function _handleDeeplink() {
        const _dlCode = window.Web2Deeplink?.param('code');
        if (!_dlCode) return;

        // Pre-filter so the row is visible in STATE.products.
        const searchEl = $('#filterSearch');
        if (searchEl) searchEl.value = _dlCode;
        STATE.search = _dlCode;
        STATE.page = 1;

        // Reload with the filter, then act on the result.
        load().then(() => {
            const row = tbody()?.querySelector(`tr[data-code="${cssEscape(_dlCode)}"]`);
            if (!row) {
                window.notificationManager?.show('Không tìm thấy SP mã: ' + _dlCode, 'warning');
                return;
            }
            // Scroll + highlight flash.
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('w2-deeplink-flash');
            setTimeout(() => row.classList.remove('w2-deeplink-flash'), 2400);
            // Open edit modal (openEdit guards via STATE.products find).
            openEdit(_dlCode);
        });
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnCreateProduct')?.addEventListener('click', openCreate);
        // Import dữ liệu CSV/JSON + tải file mẫu (NGUỒN CHUNG Web2Import).
        $('#btnImportProducts')?.addEventListener('click', () => {
            if (!window.Web2Import) return notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.open(_productImportConfig());
        });
        $('#btnSampleProducts')?.addEventListener('click', () => {
            if (!window.Web2Import) return notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.downloadSample(_productImportConfig());
        });
        _setupSse();

        // Bulk selection wiring (P1 2026-05-30)
        // - Delegate change event trên tbody cho mọi checkbox SP
        // - Select-all header checkbox toggle visible rows
        // - Bulk bar buttons (clear + print)
        tbody()?.addEventListener('change', (e) => {
            const inp = e.target.closest('input[data-select-code]');
            if (!inp) return;
            _toggleSelect(inp.dataset.selectCode, inp.checked);
        });
        $('#selectAllProducts')?.addEventListener('change', (e) => {
            _selectAllVisible(e.target.checked);
        });
        $('#w2pBulkClear')?.addEventListener('click', _clearSelection);
        $('#w2pBulkPrint')?.addEventListener('click', _bulkPrint);

        // Upload + Ctrl+V paste + drag-drop cho field ảnh trong modal.
        // Khi nhận ảnh → ghi base64 vào input #pmImage + cập nhật preview.
        if (window.Web2Effects?.attachImageDropTarget) {
            // Click picker đã bỏ — chỉ dùng Ctrl+V / kéo thả + hover-to-focus.
            // Image tự động compress về JPEG ~500KB, max 1200×1200, hard limit 10MB.
            window.Web2Effects.attachImageDropTarget('#pmImageDrop', {
                onResult(url) {
                    const inp = $('#pmImage');
                    if (inp) inp.value = url;
                    updateImagePreview(url);
                },
                notify,
            });
        }

        // Variant picker — pick từ Kho Biến Thể, block free-text mới.
        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init().then(() => {
                _wireVariantPicker();
                // Re-render hint khi kho biến thể cập nhật
                window.Web2VariantsCache.subscribe(() => _renderCombinedHint());
            });
        }

        // NCC dropdown — nguồn chung Ví NCC. Init + refresh dropdown realtime khi
        // NCC đổi (tạo ở so-order / supplier-debt / Ví NCC → SSE web2:supplier-wallet).
        if (window.Web2SuppliersCache) {
            window.Web2SuppliersCache.init()
                .then(() => {
                    window.Web2SuppliersCache.subscribe(() => {
                        // Cache đã tự refresh names → rebuild dropdown (vô hại khi modal ẩn).
                        loadSuppliersFromSoOrder(true).then(() => {
                            if ($('#pmSupplier')) populateSupplierDropdown();
                        });
                    });
                })
                .catch(() => {});
        }
        $('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#filterSearchClear')?.addEventListener('click', () => {
            const el = $('#filterSearch');
            if (el) {
                el.value = '';
                STATE.search = '';
                STATE.page = 1;
                load();
            }
        });
        // Live filter — chips change áp dụng ngay, search input cũng auto khi Enter.
        $('#filterActive')?.addEventListener('change', applyFilters);
        $('#filterLimit')?.addEventListener('change', applyFilters);

        // Modal
        $('#btnCloseProductModal')?.addEventListener('click', closeModal);
        $('#btnCancelProduct')?.addEventListener('click', closeModal);
        $('#btnSaveProduct')?.addEventListener('click', saveModal);
        $('#pmSuggestCode')?.addEventListener('click', suggestProductCode);
        // Auto-regenerate mã KHI: NCC / Tên / Biến thể thay đổi (mode tạo mới).
        // Mode edit: pmCode disabled → KHÔNG đổi mã (mã là khóa chính, không sửa).
        // Debounce 300ms để không gen liên tục mỗi keystroke
        let _autoRegenTimer = null;
        const autoRegen = () => {
            if (STATE.editingCode) return; // edit: mã đã lock, không regenerate
            clearTimeout(_autoRegenTimer);
            _autoRegenTimer = setTimeout(() => suggestProductCode(true), 300);
        };
        $('#pmSupplier')?.addEventListener('change', autoRegen);
        $('#pmName')?.addEventListener('input', autoRegen);
        $('#pmVariantColor')?.addEventListener('input', autoRegen);
        $('#pmVariantColor')?.addEventListener('change', autoRegen);
        $('#pmVariantSize')?.addEventListener('input', autoRegen);
        $('#pmVariantSize')?.addEventListener('change', autoRegen);
        // Intentionally NOT closing on overlay click — protect in-progress data.
        // Only X button / Hủy button / ESC close the modal.
        document.addEventListener('keydown', (e) => {
            if (!modal()?.classList.contains('active')) return;
            if (e.key === 'Escape') return closeModal();
            // Enter để lưu nhanh (trừ khi đang gõ textarea hoặc đang chọn dropdown).
            if (e.key === 'Enter' && !e.isComposing) {
                const tag = document.activeElement?.tagName;
                if (tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') {
                    e.preventDefault();
                    saveModal();
                }
            }
        });

        // Image preview on input
        $('#pmImage')?.addEventListener('input', (e) => updateImagePreview(e.target.value.trim()));

        // Task 6: lightweight real-time required-field feedback on blur.
        // Toggle .field-error border class — no full validation framework needed.
        const _requiredBlur = (id) => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('blur', () => {
                el.classList.toggle('field-error', el.value.trim() === '');
            });
            el.addEventListener('input', () => {
                if (el.value.trim()) el.classList.remove('field-error');
            });
        };
        _requiredBlur('#pmName');
        _requiredBlur('#pmCode');

        load().then(_handleDeeplink);

        // Realtime cross-machine sync — SSE handler đã set up ở _setupSse() và
        // làm in-place update cho 'update' event, full load cho 'create/delete'.
        // Cache subscriber chỉ giữ cho legacy Firestore tickler ('tickle' reason).
        // KHÔNG nên gọi load() trên 'refresh' vì pushTickle/loadList nội bộ
        // cũng emit 'refresh' → tạo loop full-reload sau mỗi mutation local.
        if (window.Web2ProductsCache) {
            window.Web2ProductsCache.init().then(() => {
                window.Web2ProductsCache.subscribe((reason) => {
                    if (reason === 'tickle') load();
                });
            });
        }
    }

    // Open print barcode dialog for a single product (by code).
    // Uses dedicated Web2ProductsPrint module — no WEB2 API, pure local render.
    function printBarcode(code) {
        if (!window.Web2ProductsPrint?.open) {
            notify('Print module chưa load, refresh trang', 'error');
            return;
        }
        const p = STATE.products.find((x) => x.code === code);
        if (!p) {
            notify('Không tìm thấy sản phẩm', 'error');
            return;
        }
        window.Web2ProductsPrint.open([p]);
    }

    window.Web2ProductsApp = {
        load,
        openEdit,
        toggleActive,
        remove,
        copyCode,
        goPage,
        openUsagePopover,
        openHistory,
        printBarcode,
        // Accessors cho drawer chi tiết (web2-product-detail.js — feature riêng).
        getProduct: (code) => STATE.products.find((p) => p.code === code) || null,
        getUsage: (code) => STATE.usage[code] || null,
        PROXY_BASE,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
