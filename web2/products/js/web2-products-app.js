// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Products — main app: render bảng + CRUD qua modal.
 */

(function () {
    'use strict';

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
    };

    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#productsTbody');
    const counter = () => $('#totalCounter');
    const searchCount = () => $('#searchResultCount');
    const pag = () => $('#pagination');
    const modal = () => $('#productModal');

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function fmtPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
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
        const imgHtml = p.imageUrl
            ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy"
                       onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','inline-flex');">` +
              `<span class="product-image-placeholder" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="product-image-placeholder"><i data-lucide="image"></i></span>`;
        const stockClass = p.stock === 0 ? 'zero' : p.stock < 5 ? 'low' : '';
        const priceBuy = Number(p.originalPrice) || 0;
        const priceSell = Number(p.price) || 0;
        const variantText = (p.variant || '').trim();
        return `
                <tr data-code="${escapeHtml(p.code)}">
                    <td>${n}</td>
                    <td>${imgHtml}</td>
                    <td><span class="code-badge code-product" onclick="Web2ProductsApp.copyCode('${escapeHtml(p.code)}')"><i data-lucide="tag"></i>${escapeHtml(p.code)}</span></td>
                    <td><div style="font-weight:600;">${escapeHtml(p.name)}</div></td>
                    <td class="variant-cell">${
                        variantText
                            ? `<span class="variant-pill">${escapeHtml(variantText)}</span>`
                            : '<span class="variant-empty">—</span>'
                    }</td>
                    <td class="price-cell price-buy">${fmtPrice(priceBuy)}</td>
                    <td class="price-cell price-sell">${fmtPrice(priceSell)}</td>
                    <td class="stock-cell ${stockClass}">${p.stock ?? 0}</td>
                    <td class="usage-cell">${renderUsageBadge(p.code)}</td>
                    <td class="note-cell" title="${escapeHtml(p.note || '')}">${escapeHtml(p.note || '—')}</td>
                    <td>
                        ${(() => {
                            // Status ưu tiên hơn isActive:
                            // - CHO_MUA → "CHỜ HÀNG" (chưa Mua hàng xong, chưa nhập kho).
                            // - DANG_BAN + isActive → "Đang bán".
                            // - !isActive → "Tạm dừng".
                            if (p.status === 'CHO_MUA') {
                                const pendingTxt =
                                    Number(p.pendingQty) > 0 ? ` (×${p.pendingQty})` : '';
                                return `<span class="active-badge active-pending" title="Chờ Mua hàng từ NCC${p.supplier ? ' ' + p.supplier : ''}"><i data-lucide="clock"></i>CHỜ HÀNG${pendingTxt}</span>`;
                            }
                            return p.isActive
                                ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>`
                                : `<span class="active-badge active-no"><i data-lucide="pause"></i>Tạm dừng</span>`;
                        })()}
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="Web2ProductsApp.openEdit('${escapeHtml(p.code)}')"><i data-lucide="pencil"></i></button>
                            <button class="btn-action act-confirm" title="${p.isActive ? 'Tạm dừng' : 'Bán lại'}" onclick="Web2ProductsApp.toggleActive('${escapeHtml(p.code)}', ${!p.isActive})"><i data-lucide="${p.isActive ? 'pause' : 'play'}"></i></button>
                            <button class="btn-action act-history" title="Lịch sử chỉnh sửa" onclick="Web2ProductsApp.openHistory('${escapeHtml(p.code)}')"><i data-lucide="history"></i></button>
                            <button class="btn-action act-delete" title="Xóa" onclick="Web2ProductsApp.remove('${escapeHtml(p.code)}')"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
    }

    function renderRows() {
        const items = STATE.products;
        if (!items.length) {
            tbody().innerHTML = `<tr><td colspan="12" class="empty-row">
                Chưa có sản phẩm — bấm "Thêm SP" để tạo
            </td></tr>`;
            return;
        }
        tbody().innerHTML = items
            .map((p, idx) => _rowHtml(p, (STATE.page - 1) * STATE.limit + idx + 1))
            .join('');
        if (window.lucide) lucide.createIcons();
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
        return `<button class="usage-badge usage-has" data-code="${escapeHtml(code)}" onclick="Web2ProductsApp.openUsagePopover('${escapeHtml(code)}', event)" title="${entries.length} đơn × ${totalQty} cái — bấm xem chi tiết"><i data-lucide="link"></i><strong>${entries.length}</strong> đơn · ${totalQty} cái</button>`;
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
        tbody().innerHTML = `<tr><td colspan="12" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
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
            tbody().innerHTML = `<tr><td colspan="12" class="empty-row" style="color:#ef4444;">
                Lỗi tải: ${escapeHtml(e.message)}
            </td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
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

    // ---------- Supplier dropdown — nguồn DUY NHẤT là tabs trong Sổ Order ----------
    // Cache list NCC từ Firestore so_order_v2/main. Load lazy + reload khi mở modal.
    let _suppliersFromSoOrder = null;
    let _suppliersLoadPromise = null;

    async function loadSuppliersFromSoOrder(force) {
        if (!force && Array.isArray(_suppliersFromSoOrder)) return _suppliersFromSoOrder;
        if (_suppliersLoadPromise && !force) return _suppliersLoadPromise;
        _suppliersLoadPromise = (async () => {
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) {
                    console.warn('[products] Firebase chưa load — fallback empty supplier list');
                    return [];
                }
                const snap = await firebase.firestore().collection('so_order_v2').doc('main').get();
                if (!snap.exists) return [];
                const data = snap.data()?.data || {};
                const set = new Set();
                // Tabs[*].shipments[*].rows[*].supplier
                for (const tab of data.tabs || []) {
                    for (const sh of tab.shipments || []) {
                        for (const r of sh.rows || []) {
                            const s = (r.supplier || '').trim();
                            if (s) set.add(s);
                        }
                    }
                }
                // Tabs[*].label nếu là tên NCC (vd "HÀ NỘI" có thể là label tab)
                for (const tab of data.tabs || []) {
                    const lbl = (tab.label || tab.name || '').trim();
                    if (lbl) set.add(lbl);
                }
                _suppliersFromSoOrder = Array.from(set).sort();
                return _suppliersFromSoOrder;
            } catch (e) {
                console.warn('[products] load suppliers từ so_order_v2 fail:', e.message);
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
        const opts = ['<option value="">— Chọn NCC từ Sổ Order —</option>'];
        // Nếu SP đang edit có supplier không nằm trong list so-order (legacy) →
        // prepend làm option riêng để tránh mất giá trị khi save lại.
        if (currentVal && !suppliers.includes(currentVal)) {
            opts.push(
                `<option value="${escapeHtml(currentVal)}" selected>${escapeHtml(currentVal)} (legacy — không có trong Sổ Order)</option>`
            );
        }
        for (const s of suppliers) {
            opts.push(
                `<option value="${escapeHtml(s)}"${s === currentVal ? ' selected' : ''}>${escapeHtml(s)}</option>`
            );
        }
        if (!suppliers.length) {
            opts.push(
                '<option value="" disabled>(Sổ Order chưa có NCC nào — thêm tab + dòng trong so-order trước)</option>'
            );
        }
        sel.innerHTML = opts.join('');
    }

    // Cache color shortmap — đọc TRỰC TIẾP từ variant.shortCode (locked tại DB)
    // Không compute client-side nữa → ổn định, không shift khi thêm biến thể mới.
    let _colorShortMapCache = null;
    function getColorShortMap() {
        if (_colorShortMapCache) return _colorShortMapCache;
        const cache = window.Web2VariantsCache;
        if (!cache?.getAll) return {};
        const map = {};
        for (const v of cache.getAll()) {
            if (!/màu/i.test(v.groupName || '')) continue;
            if (!v.shortCode) continue; // chỉ dùng locked shortcodes
            // Strip "Màu " prefix + normalize key
            const stripped = String(v.value || '')
                .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                .trim();
            const key = window.Web2ProductCode.toAsciiUpper(stripped);
            if (key) map[key] = v.shortCode;
        }
        _colorShortMapCache = map;
        return _colorShortMapCache;
    }
    // Reset cache khi kho biến thể đổi
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
        const variantText = ($('#pmVariant')?.value || '').trim();
        if (!productName) {
            if (!silent) notify('Cần điền Tên sản phẩm trước', 'warning');
            return;
        }
        // Lookup variant shortCode từ Kho Biến Thể.
        // Biến thể group "Màu" → override color; group "Size/Cỡ" → override size.
        // Priority cao hơn extract từ tên SP (vd "QUẦN ĐEN" + variant "Màu Beo" → QUAN + BEO).
        let overrideColorShort = null;
        let overrideSizeShort = null;
        if (variantText && window.Web2VariantsCache?.findByValueExact) {
            const v = window.Web2VariantsCache.findByValueExact(variantText);
            if (v && v.shortCode) {
                const grp = (v.groupName || '').toLowerCase();
                if (grp.includes('size') || grp.includes('cỡ') || grp.includes('co')) {
                    overrideSizeShort = v.shortCode.toUpperCase();
                } else {
                    // Default: treat as màu (Màu, Color, hoặc group khác)
                    overrideColorShort = v.shortCode.toUpperCase();
                }
            }
        }
        if (!supplierName) {
            if (!silent) {
                notify('Cần chọn NCC từ dropdown (lấy từ tabs Sổ Order)', 'warning');
                $('#pmSupplier')?.focus();
            }
            return;
        }
        const suppliers = collectExistingSuppliers();
        const prefixMap = window.Web2ProductCode.buildPrefixMap(
            suppliers.includes(supplierName) ? suppliers : [...suppliers, supplierName]
        );
        const existingCodes = STATE.products.map((p) => p.code).filter(Boolean);
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

    // ---------- Modal ----------
    function openCreate() {
        STATE.editingCode = null;
        $('#productModalTitle').innerHTML = `<i data-lucide="plus"></i><span>Thêm sản phẩm</span>`;
        $('#pmCode').value = '';
        $('#pmCode').disabled = false;
        if ($('#pmSupplier')) $('#pmSupplier').value = '';
        if ($('#pmCodeHint')) $('#pmCodeHint').textContent = '';
        $('#pmName').value = '';
        $('#pmVariant').value = '';
        $('#pmPriceBuy').value = 0;
        $('#pmPriceSell').value = 0;
        $('#pmStock').value = 0;
        $('#pmImage').value = '';
        $('#pmNote').value = '';
        $('#pmIsActive').value = 'true';
        updateImagePreview('');
        populateSupplierDropdown();
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => $('#pmSupplier')?.focus(), 50);
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
        $('#pmVariant').value = p.variant || '';
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
                `https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-products/${encodeURIComponent(code)}/history?limit=100`
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
            'toggle-active': { label: 'Đổi trạng thái', color: '#8b5cf6', icon: 'toggle-left' },
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

        const user = h.userName || h.userId || '<em>không rõ</em>';
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
            variant: $('#pmVariant').value.trim() || null,
            price: Number($('#pmPriceSell').value) || 0,
            originalPrice: Number($('#pmPriceBuy').value) || 0,
            stock: Number($('#pmStock').value) || 0,
            imageUrl: $('#pmImage').value.trim() || null,
            note: $('#pmNote').value.trim() || null,
            isActive: $('#pmIsActive').value === 'true',
        };
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
        try {
            if (STATE.editingCode) {
                const resp = await window.Web2ProductsApi.update(STATE.editingCode, {
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
                });
                // In-place update — KHÔNG re-render bảng để tránh giật + SP
                // vừa sửa không nhảy lên đầu (vì backend sort by updated_at DESC).
                //
                // KHÔNG gọi pushTickle: nó internal trigger _loadList() → emit
                // 'refresh' → app subscriber gọi full load() → SP nhảy lên đầu.
                // SSE notify ('web2:products' với by!=clientId) đã handle cross-tab
                // qua handler riêng (_setupSse), gọi _updateRowInPlace trên client khác.
                if (resp.product) {
                    const ok = _updateRowInPlace(STATE.editingCode, resp.product);
                    if (!ok) renderRows(); // fallback nếu row không có trên page hiện tại
                }
                notify('Đã lưu', 'success');
            } else {
                await window.Web2ProductsApi.create({
                    ...fields,
                    createdBy: user.uid || user.email || null,
                    ...histMeta,
                });
                notify(`Đã tạo SP ${fields.code}`, 'success');
                window.Web2ProductsCache?.pushTickle?.({ action: 'create', code: fields.code });
                load(); // reload to include new item at top
                closeModal();
                return;
            }
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function toggleActive(code, newState) {
        try {
            const u = window.AuthManager?.getCurrentUser?.() || {};
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
            // KHÔNG pushTickle — tránh _scheduleRefresh → emit 'refresh' → full load.
            // SSE notify cross-tab đã tự handle in-place qua _setupSse handler.
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
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

    // Variant picker: dropdown từ Web2VariantsCache. Khóa free-text — phải
    // pick từ kho, muốn thêm phải vào trang Kho Biến Thể.
    function _wireVariantPicker() {
        const input = $('#pmVariant');
        const dropdown = $('#pmVariantSuggest');
        const hint = $('#pmVariantHint');
        if (!input || !dropdown) return;

        function _renderHintFor(value) {
            if (!hint) return;
            const cache = window.Web2VariantsCache;
            const trimmed = (value || '').trim();
            if (!trimmed) {
                hint.className = 'variant-picker-hint';
                hint.textContent = 'Bỏ trống nếu SP không có biến thể.';
                return;
            }
            if (cache?.findByValueExact?.(trimmed)) {
                hint.className = 'variant-picker-hint is-ok';
                hint.textContent = '✓ Đã chọn từ Kho Biến Thể';
            } else {
                hint.className = 'variant-picker-hint is-error';
                hint.innerHTML =
                    'Giá trị này chưa có trong kho — bạn cần ' +
                    '<a href="../variants/index.html" target="_blank">thêm tại Kho Biến Thể</a> trước.';
            }
        }

        function _showDropdown(query) {
            const cache = window.Web2VariantsCache;
            if (!cache) {
                dropdown.hidden = true;
                dropdown.style.display = 'none';
                return;
            }
            dropdown.style.display = ''; // reset (clear hard-force từ click handler)
            const items = cache.findByValue(query || '', 10);
            if (!items.length) {
                dropdown.innerHTML = `<div class="variant-suggest-empty">
                    Không tìm thấy biến thể nào.
                    <a href="../variants/index.html" target="_blank">Thêm mới ở Kho Biến Thể →</a>
                </div>`;
                dropdown.hidden = false;
                return;
            }
            dropdown.innerHTML = items
                .map((v) => {
                    const grp = v.groupName
                        ? `<span class="variant-suggest-group">${escapeHtml(v.groupName)}</span>`
                        : '';
                    return `<button type="button" class="variant-suggest-item" data-val="${escapeHtml(v.value)}">
                        <span class="variant-suggest-value">${escapeHtml(v.value)}</span>
                        ${grp}
                    </button>`;
                })
                .join('');
            dropdown.hidden = false;
            dropdown.querySelectorAll('.variant-suggest-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    input.value = btn.dataset.val;
                    _renderHintFor(input.value);
                    dropdown.hidden = true;
                    dropdown.style.display = 'none'; // hard force
                    input.blur(); // bỏ focus khỏi input
                    // Fire 'change' để autoRegen mã (programmatic value set không tự fire)
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
        }

        input.addEventListener('focus', () => _showDropdown(input.value));
        input.addEventListener('input', () => {
            _renderHintFor(input.value);
            _showDropdown(input.value);
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.hidden = true;
            }, 180);
        });
        _renderHintFor('');
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
    let _sseReloadTimer = null;
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
            const { action, code } = msg.data || {};
            console.log('[Web2Products-SSE] web2:products', action, code || '');
            // Single-product UPDATE: refresh just that row, keep position.
            if (action === 'update' && code) {
                const onPage = STATE.products.some((p) => p.code === code);
                if (onPage) {
                    try {
                        const r = await window.Web2ProductsApi.get(code);
                        if (r?.product) _updateRowInPlace(code, r.product);
                        return;
                    } catch (e) {
                        console.warn('[Web2Products-SSE] in-place fetch failed:', e?.message);
                        // fall through to full load
                    }
                }
            }
            // create/delete/bulk-stock → full load (total changes)
            debouncedFullLoad();
        });

        // Topic fast-sale-orders / native-orders → chỉ ảnh hưởng cell "ĐANG DÙNG"
        // → refresh usage map mà không re-render bảng (cell-level update in-place).
        const refreshUsageOnly = () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(() => {
                _sseReloadTimer = null;
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

    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnCreateProduct')?.addEventListener('click', openCreate);
        _setupSse();

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
                // Re-render hint khi cache cập nhật từ Kho Biến Thể
                window.Web2VariantsCache.subscribe(() => {
                    const inp = $('#pmVariant');
                    if (inp) {
                        const ev = new Event('input', { bubbles: true });
                        inp.dispatchEvent(ev);
                    }
                });
            });
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
        $('#pmVariant')?.addEventListener('input', autoRegen);
        $('#pmVariant')?.addEventListener('change', autoRegen);
        // Intentionally NOT closing on overlay click — protect in-progress data.
        // Only X button / Hủy button / ESC close the modal.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal()?.classList.contains('active')) closeModal();
        });

        // Image preview on input
        $('#pmImage')?.addEventListener('input', (e) => updateImagePreview(e.target.value.trim()));

        load();

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

    window.Web2ProductsApp = {
        openEdit,
        toggleActive,
        remove,
        copyCode,
        goPage,
        openUsagePopover,
        openHistory,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
