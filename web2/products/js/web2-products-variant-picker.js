// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — variant picker (2 ô Màu + Size) + multi-variant cartesian
 * preview + bulk-create N SP biến thể. Tách khỏi modal.js để giữ <800 dòng.
 * [SPLIT 2026-06-18] Namespace nội bộ window.Web2ProductsCore (W).
 * Cross-module call qua W.foo(...). Load SAU modal (modal export closeModal…).
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});
    const STATE = W.STATE;
    const $ = W.$;
    const escapeHtml = W.escapeHtml;
    const notify = W.notify;
    const collectExistingSuppliers = W.collectExistingSuppliers;
    const getColorShortMap = W.getColorShortMap;

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
            // Khớp KHÔNG dấu qua cache._normalize → "den"→Đen, "do"→Đỏ.
            const norm = cache._normalize || ((s) => String(s || '').toLowerCase());
            const q = norm(
                String(query || '')
                    .split('/')
                    .pop()
                    .trim()
            );
            const wantSize = kind === 'size';
            const items = cache
                .getAll()
                .filter((v) => _isSizeGroup(v.groupName) === wantSize)
                .filter((v) => !q || norm(v.value).includes(q))
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
                    _maybeAutofillName();
                });
            });
        }
        input.addEventListener('focus', () => _show(input.value));
        input.addEventListener('input', () => {
            _show(input.value);
            _renderCombinedHint();
            _renderVariantMultiPreview();
            _maybeAutofillName();
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
        W.closeModal();
        let ok = 0;
        const failed = []; // {code, variant, err} — gom để báo rõ item nào lỗi
        for (const p of payloads) {
            try {
                await window.Web2ProductsApi.create(p);
                ok++;
            } catch (e) {
                const err = e?.message || 'Lỗi không xác định';
                failed.push({ code: p.code, variant: p.variant, err });
                console.error('[products bulk-variant] create fail', p.code, err);
            }
        }
        window.Web2ProductsCache?.pushTickle?.({ action: 'create' });
        W.load();
        if (failed.length) {
            // Liệt kê item fail (biến thể + mã + lý do, cắt gọn) thay vì chỉ đếm.
            const list = failed
                .map((f) => `${f.variant || f.code} (${String(f.err).slice(0, 40)})`)
                .join('; ');
            notify(`Đã tạo ${ok} SP, ${failed.length} lỗi: ${list}`, 'warning');
        } else {
            notify(`Đã tạo ${ok} SP biến thể`, 'success');
        }
    }
    // ─── Loại sản phẩm (category) — chip multi-select từ Web2ProductTypesCache ──
    // Chọn 1 loại = SP đơn (Áo); chọn nhiều = bộ (Áo + Quần). Lưu vào product.category
    // ngăn ' + '. KHÔNG đụng mã SP (vẫn sinh từ Màu/Size shortCode như cũ).
    const _selectedTypes = new Set();

    // ─── Tự tạo TÊN SP từ loại + Màu/Size (có thể sửa) ──────────────────────
    // VD: loại Áo + Màu Trắng + Size M → "ÁO TRẮNG M". Điền vào #pmName, GUARD:
    // chỉ điền khi tên trống hoặc bằng tên auto trước (user gõ tay → không đụng).
    // BỎ QUA khi Màu/Size có "/" (cartesian nhiều SP) — tên auto chỉ cho 1 SP.
    let _lastAutoName = '';
    function _genNameFromSelection() {
        const c = ($('#pmVariantColor')?.value || '').trim();
        const s = ($('#pmVariantSize')?.value || '').trim();
        if (c.includes('/') || s.includes('/')) return null; // cartesian → bỏ qua
        const parts = [..._selectedTypes, c, s].filter(Boolean);
        if (!parts.length) return null;
        return parts.join(' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('vi-VN');
    }
    function _maybeAutofillName() {
        const el = $('#pmName');
        if (!el) return;
        const cur = el.value.trim();
        if (cur !== '' && cur !== _lastAutoName) return; // user gõ tay → giữ nguyên
        const gen = _genNameFromSelection();
        if (gen == null || el.value === gen) return;
        el.value = gen;
        _lastAutoName = gen;
        // → autoRegen (mã SP) chạy lại theo tên mới (debounce, đọc DOM lúc fire).
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function _renderTypeChips() {
        const box = $('#pmTypeChips');
        if (!box) return;
        const cache = window.Web2ProductTypesCache;
        const all = cache?.getAll?.() || [];
        if (!all.length) {
            box.innerHTML = `<span class="pm-type-empty">Chưa có loại — <a href="../product-types/index.html" target="_blank">thêm ở Cấu hình →</a></span>`;
            return;
        }
        box.innerHTML = all
            .map(
                (t) =>
                    `<button type="button" class="pm-type-chip${_selectedTypes.has(t.name) ? ' is-on' : ''}" data-type="${escapeHtml(t.name)}">${escapeHtml(t.name)}</button>`
            )
            .join('');
        box.querySelectorAll('.pm-type-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const n = btn.dataset.type;
                if (_selectedTypes.has(n)) _selectedTypes.delete(n);
                else _selectedTypes.add(n);
                btn.classList.toggle('is-on');
                _maybeAutofillName();
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function _getSelectedCategory() {
        return [..._selectedTypes].join(' + ');
    }
    function _setSelectedCategory(catStr) {
        _selectedTypes.clear();
        String(catStr || '')
            .split('+')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((t) => _selectedTypes.add(t));
        _lastAutoName = ''; // reset mỗi lần mở modal (create: tên trống → auto; edit: tên thật → guard giữ)
        _renderTypeChips();
    }

    function _wireVariantPicker() {
        _wireVariantPickerFor('pmVariantColor', 'pmVariantColorSuggest', 'color');
        _wireVariantPickerFor('pmVariantSize', 'pmVariantSizeSuggest', 'size');
        _renderCombinedHint();
        if (window.Web2ProductTypesCache) {
            window.Web2ProductTypesCache.init?.()
                .then(() => _renderTypeChips())
                .catch(() => {});
        }
        _renderTypeChips();
    }

    // Export to shared namespace.
    W._combinedVariant = _combinedVariant;
    W._getSelectedCategory = _getSelectedCategory;
    W._setSelectedCategory = _setSelectedCategory;
    W._renderTypeChips = _renderTypeChips;
    W._setVariantPickers = _setVariantPickers;
    W._renderCombinedHint = _renderCombinedHint;
    W._renderVariantMultiPreview = _renderVariantMultiPreview;
    W._bulkCreateVariants = _bulkCreateVariants;
    W._wireVariantPicker = _wireVariantPicker;
})();
