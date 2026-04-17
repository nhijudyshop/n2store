// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL VARIANT CREATOR - INVENTORY TRACKING
// Creates product variants from color/size attributes
// =====================================================

const VARIANT_COLORS = [
    'Trắng', 'Đen', 'Xám', 'Xanh', 'Xanh dương', 'Xanh lá',
    'Vàng', 'Hồng', 'Cam', 'Tím', 'Đỏ', 'Nâu', 'Be', 'Kem'
];

const VARIANT_SIZE_NUM = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'
];

const VARIANT_SIZE_CHAR = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Freesize'];

let _variantCurrentCell = null;
let _variantSelections = { color: new Map(), sizeNum: new Map(), sizeChar: new Map() };

/**
 * Open variant modal for a colors cell
 */
function openVariantModal(td) {
    _variantCurrentCell = td;

    // Parse existing mauSac from td (check data or fallback to parsing text)
    const invoiceId = td.dataset.invoiceId;
    const productIdx = parseInt(td.dataset.productIdx);

    // Find current product to pre-populate selections
    let existingMauSac = [];
    if (invoiceId && !isNaN(productIdx)) {
        for (const ncc of globalState.nccList) {
            const dot = (ncc.dotHang || []).find(d => d.id === invoiceId);
            if (dot?.sanPham?.[productIdx]?.mauSac) {
                existingMauSac = dot.sanPham[productIdx].mauSac;
                break;
            }
        }
    }

    // Reset selections
    _variantSelections = { color: new Map(), sizeNum: new Map(), sizeChar: new Map() };

    // Pre-populate from existing
    for (const item of existingMauSac) {
        const val = item.mau;
        const qty = item.soLuong || 0;
        if (VARIANT_COLORS.includes(val)) _variantSelections.color.set(val, qty);
        else if (VARIANT_SIZE_NUM.includes(val)) _variantSelections.sizeNum.set(val, qty);
        else if (VARIANT_SIZE_CHAR.includes(val)) _variantSelections.sizeChar.set(val, qty);
        else _variantSelections.color.set(val, qty); // custom value → treat as color
    }

    // Render all three lists
    _renderVariantOptions('variantColorList', VARIANT_COLORS, _variantSelections.color);
    _renderVariantOptions('variantSizeNumList', VARIANT_SIZE_NUM, _variantSelections.sizeNum);
    _renderVariantOptions('variantSizeCharList', VARIANT_SIZE_CHAR, _variantSelections.sizeChar);
    _renderVariantPreview();

    // Setup search listeners
    document.querySelectorAll('.variant-search').forEach(input => {
        input.oninput = (e) => _filterVariantOptions(e.target.dataset.target, e.target.value);
    });

    // Setup create button
    document.getElementById('btnCreateVariants').onclick = _saveVariants;

    openModal('modalVariant');
    if (window.lucide) lucide.createIcons();
}

function _renderVariantOptions(containerId, items, selectedMap) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = items.map(item => {
        const checked = selectedMap.has(item);
        return `
            <label class="variant-option" data-value="${_escAttr(item)}">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._toggleVariant('${containerId}', '${_escAttr(item)}', this.checked)">
                <span>${item}</span>
            </label>
        `;
    }).join('');
}

function _filterVariantOptions(containerId, query) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.variant-option').forEach(el => {
        const val = el.dataset.value.toLowerCase();
        el.style.display = (!q || val.includes(q)) ? '' : 'none';
    });
}

function _toggleVariant(containerId, value, checked) {
    const map = containerId === 'variantColorList' ? _variantSelections.color
        : containerId === 'variantSizeNumList' ? _variantSelections.sizeNum
        : _variantSelections.sizeChar;

    if (checked) {
        if (!map.has(value)) map.set(value, 1);
    } else {
        map.delete(value);
    }
    _renderVariantPreview();
}

function _renderVariantPreview() {
    const preview = document.getElementById('variantPreview');
    const btnLabel = document.getElementById('btnCreateVariantsLabel');
    if (!preview) return;

    // All selected items from all 3 groups
    const all = [
        ..._variantSelections.color.entries(),
        ..._variantSelections.sizeNum.entries(),
        ..._variantSelections.sizeChar.entries()
    ];

    if (all.length === 0) {
        preview.innerHTML = '<div class="variant-preview-empty">Chọn thuộc tính để xem biến thể</div>';
        if (btnLabel) btnLabel.textContent = 'Tạo biến thể';
        return;
    }

    preview.innerHTML = all.map(([name, qty]) => {
        const group = _variantSelections.color.has(name) ? 'color'
            : _variantSelections.sizeNum.has(name) ? 'sizeNum'
            : 'sizeChar';
        return `
            <div class="variant-preview-item">
                <span class="variant-preview-name">${name}</span>
                <input type="number" class="variant-qty-input" min="0" value="${qty}" data-name="${_escAttr(name)}" data-group="${group}" oninput="window._updateVariantQty('${group}', '${_escAttr(name)}', this.value)">
                <button type="button" class="variant-remove-btn" onclick="window._toggleVariant('${group === 'color' ? 'variantColorList' : group === 'sizeNum' ? 'variantSizeNumList' : 'variantSizeCharList'}', '${_escAttr(name)}', false); document.querySelector('.variant-option[data-value=\\'${_escAttr(name)}\\'] input').checked = false;">&times;</button>
            </div>
        `;
    }).join('');

    if (btnLabel) btnLabel.textContent = `Tạo ${all.length} biến thể`;
}

function _updateVariantQty(group, name, value) {
    const qty = parseInt(value, 10) || 0;
    const map = group === 'color' ? _variantSelections.color
        : group === 'sizeNum' ? _variantSelections.sizeNum
        : _variantSelections.sizeChar;
    if (map.has(name)) map.set(name, qty);
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

    // Build mauSac array from selections
    const mauSac = [
        ..._variantSelections.color.entries(),
        ..._variantSelections.sizeNum.entries(),
        ..._variantSelections.sizeChar.entries()
    ].map(([mau, soLuong]) => ({ mau, soLuong: parseInt(soLuong) || 0 }));

    // Find dotHang
    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find(d => d.id === invoiceId);
        if (dot) { targetDot = dot; break; }
    }
    if (!targetDot?.sanPham?.[productIdx]) {
        window.notificationManager?.error('Không tìm thấy sản phẩm');
        return;
    }

    try {
        const product = targetDot.sanPham[productIdx];
        product.mauSac = mauSac;
        // Recalculate tongSoLuong as sum of all variant quantities
        product.tongSoLuong = mauSac.reduce((sum, v) => sum + v.soLuong, 0);
        product.soMau = mauSac.length;
        product.thanhTien = (product.tongSoLuong || 0) * (product.giaDonVi || 0);

        // Recalculate invoice totals
        targetDot.tongMon = targetDot.sanPham.reduce((s, p) => s + (p.tongSoLuong || p.soLuong || 0), 0);
        targetDot.tongTienHD = targetDot.sanPham.reduce((s, p) => s + (p.thanhTien || 0), 0);

        await shipmentsApi.update(invoiceId, {
            sanPham: targetDot.sanPham,
            tongMon: targetDot.tongMon,
            tongTienHD: targetDot.tongTienHD
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
window._updateVariantQty = _updateVariantQty;

console.log('[MODAL] Variant modal initialized');
