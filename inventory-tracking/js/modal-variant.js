// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL VARIANT CREATOR - INVENTORY TRACKING
// Creates product variants from color/size attributes
// =====================================================

// Màu / Size lists now come from the SERVER (one shared source for ALL machines):
//   GET /api/v2/inventory-tracking/product-attributes  (server caches TPOS values)
// Trước đây mỗi máy tự fetch TPOS + cache riêng trong localStorage → máy A thấy 80
// màu, máy B thấy 10 màu (fallback) → "biến thể load không đúng dữ liệu ở các máy".
// localStorage giờ CHỈ là cache để vẽ nhanh (tránh modal trống lúc mới mở); server
// mới là nguồn sự thật, nên các máy hội tụ về cùng 1 danh sách.
const TPOS_ATTR_CACHE_KEY = 'tpos_attribute_values_cache';
const TPOS_ATTR_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Fallback defaults (shown while TPOS loads, or if TPOS fails)
let VARIANT_COLORS = ['Trắng', 'Đen', 'Xám', 'Xanh', 'Vàng', 'Hồng', 'Cam', 'Tím', 'Đỏ', 'Nâu'];
let VARIANT_SIZE_NUM = [
    '27',
    '28',
    '29',
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '39',
    '40',
];
let VARIANT_SIZE_CHAR = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/**
 * Load the shared Màu/Size lists from the server (same for every machine).
 * localStorage is used only as a fast-paint cache so the modal isn't empty on
 * first open; the server endpoint is the source of truth.
 */
async function _loadTposAttributes(forceRefresh = false) {
    // 1. Fast-paint from localStorage so the modal renders instantly. We still
    //    revalidate against the server below unless the cache is fresh.
    let cacheFresh = false;
    if (!forceRefresh) {
        try {
            const cached = JSON.parse(localStorage.getItem(TPOS_ATTR_CACHE_KEY) || 'null');
            if (cached) {
                if (cached.colors) VARIANT_COLORS = cached.colors;
                if (cached.sizeNum) VARIANT_SIZE_NUM = cached.sizeNum;
                if (cached.sizeChar) VARIANT_SIZE_CHAR = cached.sizeChar;
                cacheFresh =
                    cached.timestamp && Date.now() - cached.timestamp < TPOS_ATTR_CACHE_TTL;
            }
        } catch (_) {
            /* ignore */
        }
        if (cacheFresh) return; // server list changes rarely → skip network
    }

    // 2. Fetch the SHARED list from the server. All machines get the same data,
    //    so the variant modal can no longer diverge across computers.
    try {
        if (typeof productAttributesApi === 'undefined') return;
        const data = await productAttributesApi.get({ refresh: forceRefresh });
        if (!data) return;

        if (Array.isArray(data.colors) && data.colors.length) VARIANT_COLORS = data.colors;
        if (Array.isArray(data.sizeNum) && data.sizeNum.length) VARIANT_SIZE_NUM = data.sizeNum;
        if (Array.isArray(data.sizeChar) && data.sizeChar.length) VARIANT_SIZE_CHAR = data.sizeChar;

        localStorage.setItem(
            TPOS_ATTR_CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                colors: VARIANT_COLORS,
                sizeNum: VARIANT_SIZE_NUM,
                sizeChar: VARIANT_SIZE_CHAR,
            })
        );
        console.log(
            '[VARIANT] Loaded shared attributes:',
            VARIANT_COLORS.length,
            'colors,',
            VARIANT_SIZE_NUM.length,
            'size nums,',
            VARIANT_SIZE_CHAR.length,
            'size chars'
        );
    } catch (err) {
        console.warn(
            '[VARIANT] Failed to load shared attributes, using cache/defaults:',
            err.message
        );
    }
}

// Preload cache on init (non-blocking)
_loadTposAttributes();

let _variantCurrentCell = null;
// Selections: Sets of selected attribute value names
let _variantSelections = { color: new Set(), sizeNum: new Set(), sizeChar: new Set() };
// Quantities per combination: Map<combinationKey, number>
let _variantQuantities = new Map();
// Unchecked combinations: Set<combinationKey>
let _variantUnchecked = new Set();

/**
 * Open variant modal for a colors cell
 */
async function openVariantModal(td) {
    _variantCurrentCell = td;

    // Refresh TPOS attributes in background (uses cache if fresh)
    _loadTposAttributes().then(() => {
        // Re-render lists if modal is still open
        const modal = document.getElementById('modalVariant');
        if (modal?.classList.contains('active')) {
            _renderVariantOptions('variantColorList', VARIANT_COLORS, _variantSelections.color);
            _renderVariantOptions(
                'variantSizeNumList',
                VARIANT_SIZE_NUM,
                _variantSelections.sizeNum
            );
            _renderVariantOptions(
                'variantSizeCharList',
                VARIANT_SIZE_CHAR,
                _variantSelections.sizeChar
            );
        }
    });

    // Parse existing mauSac from td (check data or fallback to parsing text)
    const invoiceId = td.dataset.invoiceId;
    const productIdx = parseInt(td.dataset.productIdx);

    // Find current product to pre-populate selections
    let existingMauSac = [];
    if (invoiceId && !isNaN(productIdx)) {
        for (const ncc of globalState.nccList) {
            const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
            if (dot?.sanPham?.[productIdx]?.mauSac) {
                existingMauSac = dot.sanPham[productIdx].mauSac;
                break;
            }
        }
    }

    // Reset selections
    _variantSelections = { color: new Set(), sizeNum: new Set(), sizeChar: new Set() };
    _variantQuantities = new Map();
    _variantUnchecked = new Set();

    // Pre-populate from existing (combination strings like "Trắng / 4 / S").
    // Combos are always generated as "Màu / Size" (color first, size last), so we
    // bucket by list membership first, then fall back to SHAPE + POSITION for any
    // value not in the current list (discontinued/legacy). This stops a size value
    // from being dumped into the Màu column ("2 cái đè lên lẫn nhau").
    for (const item of existingMauSac) {
        const comboKey = item.mau || '';
        const qty = item.soLuong || 0;
        _variantQuantities.set(comboKey, qty);
        const parts = comboKey
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
        parts.forEach((part, idx) => {
            if (VARIANT_COLORS.includes(part)) _variantSelections.color.add(part);
            else if (VARIANT_SIZE_NUM.includes(part)) _variantSelections.sizeNum.add(part);
            else if (VARIANT_SIZE_CHAR.includes(part)) _variantSelections.sizeChar.add(part);
            else if (/^\d+$/.test(part))
                _variantSelections.sizeNum.add(part); // numeric → Size Số
            else if (parts.length >= 2 && idx > 0)
                _variantSelections.sizeChar.add(part); // part sau dấu "/" của "Màu / Size" → Size Chữ
            else _variantSelections.color.add(part); // còn lại → Màu
        });
    }

    // Render all three lists. _renderVariantOptions tự thêm các giá trị đã chọn
    // mà không có trong list (giá trị cũ/đã ngừng) vào BẢN SAO khi vẽ — nên biến
    // thể đã lưu luôn hiển thị & được tick đúng cột, KHÔNG mutate list dùng chung
    // (tránh giá trị của SP này lẫn sang SP khác).
    _renderVariantOptions('variantColorList', VARIANT_COLORS, _variantSelections.color);
    _renderVariantOptions('variantSizeNumList', VARIANT_SIZE_NUM, _variantSelections.sizeNum);
    _renderVariantOptions('variantSizeCharList', VARIANT_SIZE_CHAR, _variantSelections.sizeChar);
    _updateSizeGroupLock();
    _renderVariantPreview();
    _updateSummary();

    // Setup search listeners
    document.querySelectorAll('.variant-search').forEach((input) => {
        input.oninput = (e) => _filterVariantOptions(e.target.dataset.target, e.target.value);
    });

    // Setup create button
    document.getElementById('btnCreateVariants').onclick = _saveVariants;

    // Setup TPOS refresh button
    const refreshBtn = document.getElementById('btnRefreshTposAttrs');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            window.notificationManager?.info('Đang tải từ TPOS...');
            await _loadTposAttributes(true);
            _renderVariantOptions('variantColorList', VARIANT_COLORS, _variantSelections.color);
            _renderVariantOptions(
                'variantSizeNumList',
                VARIANT_SIZE_NUM,
                _variantSelections.sizeNum
            );
            _renderVariantOptions(
                'variantSizeCharList',
                VARIANT_SIZE_CHAR,
                _variantSelections.sizeChar
            );
            refreshBtn.disabled = false;
            window.notificationManager?.success('Đã cập nhật thuộc tính');
        };
    }

    openModal('modalVariant');
    if (window.lucide) lucide.createIcons();
}

function _renderVariantOptions(containerId, items, selectedSet) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Vẽ trên BẢN SAO: thêm mọi giá trị đã chọn nhưng không có trong `items`
    // (giá trị cũ/đã ngừng từ data đã lưu) để chúng luôn hiển thị & được tick.
    // KHÔNG mutate `items` (mảng dùng chung VARIANT_*) → tránh lẫn giữa các SP.
    const list = Array.isArray(items) ? items.slice() : [];
    if (selectedSet) {
        selectedSet.forEach((v) => {
            if (!list.includes(v)) list.push(v);
        });
    }

    container.innerHTML = list
        .map((item) => {
            const checked = selectedSet.has(item);
            return `
            <label class="variant-option" data-value="${_escAttr(item)}">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._toggleVariant('${containerId}', '${_escAttr(item)}', this.checked)">
                <span>${item}</span>
            </label>
        `;
        })
        .join('');
}

function _filterVariantOptions(containerId, query) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.variant-option').forEach((el) => {
        const val = el.dataset.value.toLowerCase();
        el.style.display = !q || val.includes(q) ? '' : 'none';
    });
}

function _toggleVariant(containerId, value, checked) {
    const set =
        containerId === 'variantColorList'
            ? _variantSelections.color
            : containerId === 'variantSizeNumList'
              ? _variantSelections.sizeNum
              : _variantSelections.sizeChar;

    if (checked) {
        set.add(value);
        // Mutually exclusive: SizeChữ and SizeSố can't both be selected
        if (containerId === 'variantSizeNumList' && _variantSelections.sizeChar.size > 0) {
            _variantSelections.sizeChar.clear();
            _renderVariantOptions(
                'variantSizeCharList',
                VARIANT_SIZE_CHAR,
                _variantSelections.sizeChar
            );
        } else if (containerId === 'variantSizeCharList' && _variantSelections.sizeNum.size > 0) {
            _variantSelections.sizeNum.clear();
            _renderVariantOptions(
                'variantSizeNumList',
                VARIANT_SIZE_NUM,
                _variantSelections.sizeNum
            );
        }
    } else {
        set.delete(value);
    }

    // Sync checkbox UI state (used by remove button)
    const option = document.querySelector(
        `#${containerId} .variant-option[data-value="${_escAttr(value)}"] input`
    );
    if (option) option.checked = checked;

    // Disable the "other" size group when one is selected
    _updateSizeGroupLock();

    _renderVariantPreview();
    _updateSummary();
}

/**
 * Lock/unlock SizeSố and SizeChữ groups based on which is selected
 */
function _updateSizeGroupLock() {
    const sizeNumLocked = _variantSelections.sizeChar.size > 0;
    const sizeCharLocked = _variantSelections.sizeNum.size > 0;

    const sizeNumGroup = document.getElementById('variantSizeNumList')?.closest('.variant-group');
    const sizeCharGroup = document.getElementById('variantSizeCharList')?.closest('.variant-group');

    if (sizeNumGroup) sizeNumGroup.classList.toggle('variant-group-locked', sizeNumLocked);
    if (sizeCharGroup) sizeCharGroup.classList.toggle('variant-group-locked', sizeCharLocked);
}

/**
 * Generate valid variant combinations. Rules:
 *   - Màu alone → "Đen"
 *   - Màu + SizeChữ → "Đen / S"
 *   - Màu + SizeSố → "Đen / 4"
 *   - SizeChữ + SizeSố is NOT valid (skipped)
 *   - SizeChữ alone → "S"
 *   - SizeSố alone → "4"
 *
 * If all 3 groups selected: output both "Màu × SizeChữ" and "Màu × SizeSố" sets (union).
 */
function _generateCombinations() {
    const colors = [..._variantSelections.color];
    const sizeNums = [..._variantSelections.sizeNum];
    const sizeChars = [..._variantSelections.sizeChar];

    const combos = [];

    if (colors.length > 0 && sizeChars.length > 0) {
        // Màu × SizeChữ
        for (const c of colors) for (const sc of sizeChars) combos.push(`${c} / ${sc}`);
    }
    if (colors.length > 0 && sizeNums.length > 0) {
        // Màu × SizeSố
        for (const c of colors) for (const sn of sizeNums) combos.push(`${c} / ${sn}`);
    }
    if (colors.length > 0 && sizeChars.length === 0 && sizeNums.length === 0) {
        // Màu only
        combos.push(...colors);
    }
    if (colors.length === 0 && sizeChars.length > 0) {
        // SizeChữ only (no color)
        combos.push(...sizeChars);
    }
    if (colors.length === 0 && sizeNums.length > 0) {
        // SizeSố only (no color)
        combos.push(...sizeNums);
    }

    return combos;
}

function _renderVariantPreview() {
    const preview = document.getElementById('variantPreview');
    const btnLabel = document.getElementById('btnCreateVariantsLabel');
    if (!preview) return;

    const combos = _generateCombinations();

    if (combos.length === 0) {
        preview.innerHTML =
            '<div class="variant-preview-empty">Chọn thuộc tính để xem biến thể</div>';
        if (btnLabel) btnLabel.textContent = 'Tạo biến thể';
        return;
    }

    preview.innerHTML = combos
        .map((combo) => {
            const key = _escAttr(combo);
            const qty = _variantQuantities.get(combo) ?? 0;
            const isChecked = !_variantUnchecked.has(combo);
            return `
            <div class="variant-preview-item ${isChecked ? '' : 'unchecked'}">
                <input type="checkbox" class="variant-combo-check" ${isChecked ? 'checked' : ''} onchange="window._toggleVariantCombo('${key}', this.checked)">
                <span class="variant-preview-name">${combo}</span>
                <input type="number" class="variant-qty-input" min="0" value="${qty}" oninput="window._updateVariantQty('${key}', this.value)">
            </div>
        `;
        })
        .join('');

    const activeCount = combos.filter((c) => !_variantUnchecked.has(c)).length;
    if (btnLabel) btnLabel.textContent = `Tạo ${activeCount}/${combos.length} biến thể`;
}

function _toggleVariantCombo(comboKey, checked) {
    if (checked) _variantUnchecked.delete(comboKey);
    else _variantUnchecked.add(comboKey);
    _renderVariantPreview();
}

function _updateVariantQty(comboKey, value) {
    const qty = parseInt(value, 10) || 0;
    _variantQuantities.set(comboKey, qty);
}

function _updateSummary() {
    const el = document.getElementById('variantSummary');
    if (!el) return;
    const parts = [];
    if (_variantSelections.color.size) parts.push([..._variantSelections.color].join(', '));
    if (_variantSelections.sizeNum.size) parts.push([..._variantSelections.sizeNum].join(', '));
    if (_variantSelections.sizeChar.size) parts.push([..._variantSelections.sizeChar].join(', '));
    el.textContent = parts.join(' | ');
}

async function _saveVariants() {
    const cell = _variantCurrentCell;
    if (!cell) return;

    const invoiceId = cell.dataset.invoiceId;
    const productIdx = parseInt(cell.dataset.productIdx);
    if (!invoiceId || isNaN(productIdx)) {
        window.notificationManager?.error('Không tìm thấy sản phẩm');
        return;
    }

    // Build mauSac array from active combinations
    const combos = _generateCombinations();
    const mauSac = combos
        .filter((c) => !_variantUnchecked.has(c))
        .map((c) => ({ mau: c, soLuong: _variantQuantities.get(c) || 0 }));

    // Find dotHang
    const _findTargetDot = () => {
        for (const ncc of globalState.nccList) {
            const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
            if (dot) return dot;
        }
        return null;
    };
    let targetDot = _findTargetDot();
    // ④ Nếu đang có reload (globalState.isLoading) thì dotHang có thể tạm rỗng →
    //    chờ load xong thử lại 1 lần thay vì báo "Không tìm thấy sản phẩm" oan.
    if (!targetDot?.sanPham?.[productIdx] && globalState.isLoading) {
        await new Promise((r) => setTimeout(r, 600));
        targetDot = _findTargetDot();
    }
    if (!targetDot?.sanPham?.[productIdx]) {
        window.notificationManager?.error('Không tìm thấy sản phẩm');
        return;
    }

    try {
        const product = targetDot.sanPham[productIdx];

        // Sanity-check the variant total against the existing Tổng SL the user
        // (or AI extractor) typed in for this product. Mismatch usually means
        // the user fat-fingered a variant qty or forgot to add one — show
        // confirm. On accept we DO NOT overwrite tongSoLuong: the row stays
        // mismatched (rendered red in the table) so the user can spot the
        // discrepancy later and fix one side or the other.
        const sumVariants = mauSac.reduce((sum, v) => sum + (parseInt(v.soLuong) || 0), 0);
        const existingTotal = parseInt(product.tongSoLuong || product.soLuong || 0, 10) || 0;
        let mismatchAccepted = false;
        if (existingTotal > 0 && sumVariants !== existingTotal) {
            const ok = await window.notificationManager.confirm(
                `Tổng số lượng biến thể (${sumVariants}) khác với Tổng SL (${existingTotal}).\n\n` +
                    `Bấm "Đồng ý" để LƯU (Tổng SL giữ nguyên ${existingTotal}, hàng sẽ ` +
                    `được tô đỏ trong bảng để nhắc), hoặc "Hủy" để quay lại chỉnh sửa.`,
                'Tổng biến thể không khớp'
            );
            if (!ok) return;
            mismatchAccepted = true;
        }

        product.mauSac = mauSac;
        // Only auto-set tongSoLuong when there's no mismatch (or no prior
        // Tổng SL). When mismatched, keep the user's Tổng SL untouched so
        // the row keeps signalling the discrepancy.
        if (!mismatchAccepted) {
            product.tongSoLuong = sumVariants;
        }
        product.soMau = mauSac.length;
        product.thanhTien = (product.tongSoLuong || 0) * (product.giaDonVi || 0);

        // Recalculate invoice totals
        targetDot.tongMon = targetDot.sanPham.reduce(
            (s, p) => s + (p.tongSoLuong || p.soLuong || 0),
            0
        );
        targetDot.tongTienHD = targetDot.sanPham.reduce((s, p) => s + (p.thanhTien || 0), 0);

        await shipmentsApi.update(invoiceId, {
            sanPham: targetDot.sanPham,
            tongMon: targetDot.tongMon,
            tongTienHD: targetDot.tongTienHD,
        });

        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        closeModal('modalVariant');
        window.notificationManager?.success(`Đã tạo ${mauSac.length} biến thể`);
    } catch (err) {
        console.error('[VARIANT] Save error:', err);
        window.notificationManager?.error('Không thể lưu biến thể');
    }
}

// Expose to window
window.openVariantModal = openVariantModal;
window._toggleVariant = _toggleVariant;
window._toggleVariantCombo = _toggleVariantCombo;
window._updateVariantQty = _updateVariantQty;

console.log('[MODAL] Variant modal initialized');
