// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — in-app create/edit modal + history modal + import +
 * supplier dropdown + product-code suggest + variant pickers (Màu × Size).
 * (KHÁC web2-product-detail.js — file đó là DRAWER chi tiết bấm vào row.)
 * [SPLIT 2026-06-18] tách từ web2-products-app.js. Namespace nội bộ
 * window.Web2ProductsCore (W). Cross-module call qua W.foo(...).
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});
    const STATE = W.STATE;
    const $ = W.$;
    const modal = W.modal;
    const escapeHtml = W.escapeHtml;
    const notify = W.notify;
    const collectExistingSuppliers = W.collectExistingSuppliers;
    const getColorShortMap = W.getColorShortMap;
    const loadSuppliersFromSoOrder = W.loadSuppliersFromSoOrder;
    const PROXY_BASE = W.PROXY_BASE;

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
            onDone: () => W.load(),
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
        W._setVariantPickers('');
        W._setSelectedCategory?.('');
        if (window.Web2NumberInput) {
            Web2NumberInput.setValue($('#pmPriceBuy'), 0);
            Web2NumberInput.setValue($('#pmPriceSell'), 0);
        } else {
            $('#pmPriceBuy').value = 0;
            $('#pmPriceSell').value = 0;
        }
        $('#pmStock').value = 0;
        $('#pmImage').value = '';
        $('#pmNote').value = '';
        $('#pmIsActive').value = 'true';
        updateImagePreview('');
        // populateSupplierDropdown async (await load tabs từ Firestore) → set KHO
        // SAU khi rebuild xong, nếu set trước thì option KHO chưa tồn tại → value rớt "".
        // Audit (2026-06-20): chỉ ép lại 'KHO' nếu user CHƯA đổi select trong lúc
        // dropdown đang populate (tránh đè lựa chọn của user — race sync vs .then()).
        populateSupplierDropdown().then(() => {
            const sel = $('#pmSupplier');
            if (sel && (sel.value === 'KHO' || sel.value === '')) sel.value = 'KHO';
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
        W._setVariantPickers(p.variant || '');
        W._setSelectedCategory?.(p.category || '');
        if (window.Web2NumberInput) {
            Web2NumberInput.setValue($('#pmPriceBuy'), p.originalPrice || 0);
            Web2NumberInput.setValue($('#pmPriceSell'), p.price || 0);
        } else {
            $('#pmPriceBuy').value = p.originalPrice || 0;
            $('#pmPriceSell').value = p.price || 0;
        }
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
            // Audit (2026-06-20): gắn x-web2-token cho consistency với mọi API khác
            // (phòng WEB2_AUTH_ENFORCE mở rộng sang GET → tránh 401 im lặng).
            const authH =
                window.Web2Auth && window.Web2Auth.authHeaders
                    ? window.Web2Auth.authHeaders({ Accept: 'application/json' })
                    : { Accept: 'application/json' };
            const r = await fetch(
                `${PROXY_BASE}/api/web2-products/${encodeURIComponent(code)}/history?limit=100`,
                { headers: authH }
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

    // Guard chống double-click Save (audit HIGH 2026-06-20): wrapper re-entrancy +
    // disable nút trong lúc xử lý. finally bao MỌI nhánh return (validate/optimistic/
    // legacy/bulk) → không kẹt _busy. Optimistic đã closeModal() nên nhả ngay là an toàn.
    async function saveModal() {
        if (saveModal._busy) return;
        saveModal._busy = true;
        const _saveBtn = document.getElementById('btnSaveProduct');
        if (_saveBtn) _saveBtn.disabled = true;
        try {
            return await _saveModalImpl();
        } finally {
            saveModal._busy = false;
            if (_saveBtn) _saveBtn.disabled = false;
        }
    }

    async function _saveModalImpl() {
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const supplierInput = ($('#pmSupplier')?.value || '').trim();
        const fields = {
            code: $('#pmCode').value.trim(),
            name: $('#pmName').value.trim(),
            supplier: supplierInput || null,
            variant: W._combinedVariant() || null,
            // Loại SP (Áo/Quần…) — chọn nhiều = bộ "Áo + Quần". Web2ProductTypesCache.
            category: (W._getSelectedCategory && W._getSelectedCategory()) || null,
            price:
                (window.Web2NumberInput
                    ? Web2NumberInput.getValue($('#pmPriceSell'))
                    : Number($('#pmPriceSell').value)) || 0,
            originalPrice:
                (window.Web2NumberInput
                    ? Web2NumberInput.getValue($('#pmPriceBuy'))
                    : Number($('#pmPriceBuy').value)) || 0,
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
                return W._bulkCreateVariants(fields, combos);
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

        // expectedStock = tồn ĐÃ ĐỌC lúc mở form (bản gốc trong STATE). Backend so
        // với stock vừa lock FOR UPDATE → khác = có write đồng thời → 409 stale_stock
        // (mirror web2-product-detail.js _saveEdit). Chỉ gửi khi UPDATE + biết bản gốc.
        const _origForExpected =
            STATE.editingCode != null
                ? STATE.products.find((p) => p.code === STATE.editingCode)
                : null;
        const updatePayload = {
            name: fields.name,
            supplier: fields.supplier,
            variant: fields.variant,
            category: fields.category,
            price: fields.price,
            originalPrice: fields.originalPrice,
            stock: fields.stock,
            ...(_origForExpected ? { expectedStock: Number(_origForExpected.stock) || 0 } : {}),
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
                        const ok = W._updateRowInPlace(editCode, merged);
                        if (!ok) W.renderRows();
                    },
                    run: async () => {
                        return await window.Web2ProductsApi.update(editCode, updatePayload);
                    },
                    onSuccess: (resp) => {
                        if (resp?.product) {
                            const ok = W._updateRowInPlace(editCode, resp.product);
                            if (!ok) W.renderRows();
                        }
                    },
                    rollback: (prev) => {
                        const i = STATE.products.findIndex((p) => p.code === editCode);
                        if (i !== -1 && prev) STATE.products[i] = prev;
                        const ok = W._updateRowInPlace(editCode, prev);
                        if (!ok) W.renderRows();
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
                    const ok = W._updateRowInPlace(editCode, resp.product);
                    if (!ok) W.renderRows();
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
                    W.renderRows();
                    W.renderPagination();
                    W.renderCounters();
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
                    W.load();
                },
                rollback: (snap) => {
                    if (snap) {
                        STATE.products = snap.products;
                        STATE.total = snap.total;
                        W.renderRows();
                        W.renderPagination();
                        W.renderCounters();
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
            W.load(); // reload to include new item at top
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // Export to shared namespace.
    // (Variant picker functions sống ở web2-products-variant-picker.js — load SAU file này.)
    W.populateSupplierDropdown = populateSupplierDropdown;
    W.suggestProductCode = suggestProductCode;
    W._productImportConfig = _productImportConfig;
    W._commitProductImport = _commitProductImport;
    W.openCreate = openCreate;
    W.openEdit = openEdit;
    W.openHistory = openHistory;
    W.renderHistEntry = renderHistEntry;
    W.closeModal = closeModal;
    W.updateImagePreview = updateImagePreview;
    W.saveModal = saveModal;
})();
