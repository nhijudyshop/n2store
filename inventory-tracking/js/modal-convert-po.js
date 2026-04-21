// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL CONVERT NCC → PURCHASE ORDER DRAFT
// Layout & UX mirror purchase-orders/js/form-modal.js (Tạo đơn đặt hàng)
// Scope:
//   - Supplier + Ngày đặt hàng + Số tiền hóa đơn (VND) + Ảnh hóa đơn
//   - Danh sách sản phẩm bảng: STT | Tên SP | Biến thể | Mã SP | SL | Giá mua | Giá bán | Thành tiền | Thao tác
//   - Nested modal "Tạo biến thể từ thuộc tính" (4 cột: Màu / Size Số / Size Chữ / Danh sách Biến Thể)
//   - Footer: Tổng SL | Tổng tiền | Giảm giá | Tiền ship | THÀNH TIỀN | Hủy | Tạo đơn hàng
// POST → https://n2store-fallback.onrender.com/api/v2/purchase-orders với X-Auth-Data header
// =====================================================

const PO_API_URL = 'https://n2store-fallback.onrender.com/api/v2/purchase-orders';

// -------- State --------
let _convertCurrentInvoice = null;      // dotHang entry (flat)
let _convertNccImages = [];             // productImages URLs cho NCC
let _convertItems = [];                 // items working array
let _convertDiscount = 0;
let _convertShipping = 0;
let _convertItemCounter = 0;

// Nested variant modal state
let _poVariantItemKey = null;           // item._key đang mở variant modal
let _poVariantSel = { color: new Set(), sizeNum: new Set(), sizeChar: new Set() };

// =====================================================
// ENTRY POINT
// =====================================================
function openConvertToPurchaseOrderModal(invoiceId) {
    if (!invoiceId) {
        window.notificationManager?.error('Thiếu invoiceId');
        return;
    }

    // Match d.id === invoiceId (dotHang entry in nccList)
    let found = null;
    for (const ncc of (globalState.nccList || [])) {
        const dot = (ncc.dotHang || []).find(d => String(d.id) === String(invoiceId));
        if (dot) { found = dot; break; }
    }
    if (!found) {
        console.warn('[CONVERT-PO] Invoice not found. invoiceId=', invoiceId);
        window.notificationManager?.error('Không tìm thấy hóa đơn NCC');
        return;
    }

    _convertCurrentInvoice = found;
    _convertNccImages = typeof getProductImagesForNcc === 'function'
        ? getProductImagesForNcc(found.sttNCC, found.ngayDiHang, found.dotSo)
        : [];
    _convertItems = _explodeSanPhamToItems(found.sanPham || []);
    _convertDiscount = 0;
    _convertShipping = 0;

    _renderConvertModal();
    openModal('modalConvertPO');
    if (window.lucide) lucide.createIcons();
}

function _explodeSanPhamToItems(sanPhamArr) {
    const items = [];
    _convertItemCounter = 0;
    for (const p of sanPhamArr) {
        const baseName = (p.moTa && p.moTa !== '-') ? p.moTa : (p.maSP || '');
        const mauSac = Array.isArray(p.mauSac) ? p.mauSac : [];
        if (mauSac.length > 0) {
            for (const mv of mauSac) {
                items.push(_mkItem({
                    productCode: p.maSP || '',
                    productName: baseName,
                    variant: mv.mau || '',
                    quantity: parseInt(mv.soLuong) || 0,
                    purchasePrice: parseFloat(p.giaDonVi) || 0
                }));
            }
        } else {
            items.push(_mkItem({
                productCode: p.maSP || '',
                productName: baseName,
                variant: '',
                quantity: parseInt(p.tongSoLuong || p.soLuong) || 0,
                purchasePrice: parseFloat(p.giaDonVi) || 0
            }));
        }
    }
    return items;
}

function _mkItem(data = {}) {
    return {
        _key: `it_${Date.now()}_${_convertItemCounter++}`,
        productCode: data.productCode || '',
        productName: data.productName || '',
        variant: data.variant || '',
        quantity: data.quantity ?? 1,
        purchasePrice: data.purchasePrice ?? 0,
        sellingPrice: data.sellingPrice ?? ''
    };
}

// =====================================================
// VND PRICE PARSER / FORMATTER
// Parse rules (match form-modal.js parsePrice):
//   - typeof number → return as-is
//   - contains ','  → decimal sep, ×1000: "1,5" → 1500
//   - contains '.'  → thousand sep: "100.000" → 100000
//   - plain number < 1000 → ×1000: "100" → 100000
//   - plain number >= 1000 → keep: "210000" → 210000
// =====================================================
function _parseVND(value) {
    if (typeof value === 'number') return value;
    const str = String(value || '').trim();
    if (!str) return 0;
    let num;
    if (str.includes(',')) {
        num = parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        if (num > 0) num = Math.round(num * 1000);
    } else if (str.includes('.')) {
        num = parseFloat(str.replace(/\./g, '')) || 0;
    } else {
        num = parseFloat(str) || 0;
        if (num > 0 && num < 1000) num = Math.round(num * 1000);
    }
    return num;
}

function _fmtVND(n) {
    if (!n && n !== 0) return '';
    return Number(n).toLocaleString('vi-VN');
}

// =====================================================
// RENDER MAIN MODAL
// =====================================================
function _renderConvertModal() {
    const body = document.getElementById('modalConvertPOBody');
    if (!body) return;

    const inv = _convertCurrentInvoice;
    const todayIso = new Date().toISOString().split('T')[0];
    const invoiceAmt = parseFloat(inv.tongTienHD || inv.tongTien) || 0;
    const nccName = inv.tenNCC || String(inv.sttNCC || '');
    const invImgs = Array.isArray(inv.anhHoaDon) ? inv.anhHoaDon : [];

    body.innerHTML = `
        <div class="po-form">
            <!-- Row 1: Supplier | Date | Invoice Amount | Invoice Images -->
            <div class="po-row po-row-head">
                <div class="po-field po-field-supplier">
                    <label>Nhà cung cấp <span class="po-req">*</span></label>
                    <input type="text" id="poSupplier" class="po-input" value="${_esc(nccName)}" placeholder="Nhập tên nhà cung cấp" autocomplete="off">
                </div>
                <div class="po-field po-field-date">
                    <label>Ngày đặt hàng</label>
                    <input type="date" id="poOrderDate" class="po-input" value="${todayIso}">
                </div>
                <div class="po-field po-field-amt">
                    <label>Số tiền hóa đơn (VND)</label>
                    <input type="text" id="poInvoiceAmount" class="po-input po-input-right" value="${_fmtVND(invoiceAmt)}" placeholder="0">
                    <div class="po-preview" id="poInvoiceAmountPreview"></div>
                </div>
                <div class="po-field po-field-img">
                    <label>Ảnh hóa đơn</label>
                    <div class="po-invoice-img-box">
                        ${invImgs.length > 0
                            ? `<img src="${invImgs[0]}" class="po-invoice-thumb" alt="invoice">${invImgs.length > 1 ? `<span class="po-img-count">+${invImgs.length - 1}</span>` : ''}`
                            : `<span class="po-img-empty">—</span>`}
                    </div>
                </div>
            </div>

            <!-- Row 2: Notes + Add Product -->
            <div class="po-row po-row-notes">
                <div class="po-field po-field-notes">
                    <label>Ghi chú</label>
                    <input type="text" id="poNotes" class="po-input" value="${_esc(inv.ghiChu || '')}" placeholder="Ghi chú thêm cho đơn hàng...">
                </div>
                <button type="button" id="poBtnAddItem" class="po-btn-icon" title="Thêm sản phẩm">
                    <i data-lucide="plus"></i>
                </button>
            </div>

            ${_convertNccImages.length > 0 ? `
                <div class="po-ncc-img-row">
                    <span class="po-ncc-img-label">Ảnh sản phẩm NCC (${_convertNccImages.length})</span>
                    <div class="po-ncc-img-preview">
                        ${_convertNccImages.slice(0, 10).map(u => `<img src="${u}" alt="">`).join('')}
                        ${_convertNccImages.length > 10 ? `<span class="po-img-count">+${_convertNccImages.length - 10}</span>` : ''}
                    </div>
                </div>
            ` : ''}

            <!-- Items Table -->
            <div class="po-items-wrap">
                <table class="po-items">
                    <thead>
                        <tr>
                            <th class="po-col-stt">STT</th>
                            <th class="po-col-name">Tên sản phẩm</th>
                            <th class="po-col-variant">Biến thể</th>
                            <th class="po-col-code">Mã sản phẩm</th>
                            <th class="po-col-qty">SL</th>
                            <th class="po-col-buy">Giá mua (VND)</th>
                            <th class="po-col-sell">Giá bán (VND)</th>
                            <th class="po-col-total">Thành tiền (VND)</th>
                            <th class="po-col-act">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="poItemsBody">
                        ${_convertItems.map((it, idx) => _renderItemRow(it, idx)).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Footer Totals -->
            <div class="po-footer-totals">
                <div class="po-tot-group">
                    <span class="po-tot-label">Tổng số lượng:</span>
                    <strong id="poTotalQty">0</strong>
                </div>
                <div class="po-tot-group">
                    <span class="po-tot-label">Tổng tiền:</span>
                    <strong id="poTotalAmount">0 đ</strong>
                </div>
                <div class="po-tot-group">
                    <span class="po-tot-label">Giảm giá:</span>
                    <input type="text" id="poDiscount" class="po-input po-input-small po-input-right" value="" placeholder="0">
                </div>
                <div class="po-tot-group">
                    <span class="po-tot-label">Tiền ship:</span>
                    <input type="text" id="poShipping" class="po-input po-input-small po-input-right" value="" placeholder="0">
                </div>
                <button type="button" id="poBtnAddItem2" class="po-btn-outline">
                    <i data-lucide="plus"></i> Thêm sản phẩm
                </button>
                <div class="po-tot-group po-tot-final">
                    <span class="po-tot-label">THÀNH TIỀN:</span>
                    <strong id="poFinalAmount">0 đ</strong>
                </div>
            </div>
        </div>
    `;

    _bindMainEvents();
    _recalcAll();
    if (window.lucide) lucide.createIcons();
}

function _renderItemRow(it, idx) {
    const subtotal = (parseInt(it.quantity) || 0) * (_parseVND(it.purchasePrice) || 0);
    const variantCell = it.variant
        ? `<button type="button" class="po-variant-chip" data-key="${it._key}" title="Sửa biến thể">${_esc(it.variant)}</button>`
        : `<button type="button" class="po-variant-btn" data-key="${it._key}"><i data-lucide="package"></i> Nhấn để tạo biến thể</button>`;
    return `
        <tr data-key="${it._key}">
            <td class="po-col-stt">${idx + 1}</td>
            <td class="po-col-name">
                <input type="text" class="po-it-input" data-field="productName" value="${_esc(it.productName)}" placeholder="VD: 2003 B5 SET ÁO DÀI">
            </td>
            <td class="po-col-variant">${variantCell}</td>
            <td class="po-col-code">
                <input type="text" class="po-it-input" data-field="productCode" value="${_esc(it.productCode)}" placeholder="Mã SP">
            </td>
            <td class="po-col-qty">
                <input type="number" class="po-it-input po-input-right" data-field="quantity" value="${it.quantity}" min="0">
            </td>
            <td class="po-col-buy">
                <input type="text" class="po-it-input po-input-right" data-field="purchasePrice" value="${_fmtVND(it.purchasePrice)}" placeholder="0">
            </td>
            <td class="po-col-sell">
                <input type="text" class="po-it-input po-input-right" data-field="sellingPrice" value="${it.sellingPrice !== '' ? _fmtVND(it.sellingPrice) : ''}" placeholder="0">
            </td>
            <td class="po-col-total">
                <span class="po-it-subtotal" data-key="${it._key}">${_fmtVND(subtotal)} đ</span>
            </td>
            <td class="po-col-act">
                <button type="button" class="po-btn-del" data-key="${it._key}" title="Xóa dòng">
                    <i data-lucide="x"></i>
                </button>
            </td>
        </tr>
    `;
}

// =====================================================
// EVENT BINDING
// =====================================================
function _bindMainEvents() {
    // Supplier / date / amount / notes — no binding needed (read on submit)
    const amtInput = document.getElementById('poInvoiceAmount');
    if (amtInput) {
        amtInput.addEventListener('input', (e) => {
            // Re-format with thousand separators
            const raw = _parseVND(e.target.value);
            const preview = document.getElementById('poInvoiceAmountPreview');
            if (preview) preview.textContent = raw > 0 ? `= ${_fmtVND(raw)} đ` : '';
        });
    }

    // Items body
    const tbody = document.getElementById('poItemsBody');
    if (tbody) {
        tbody.addEventListener('input', _onItemInput);
        tbody.addEventListener('click', _onItemClick);
    }

    // Discount + shipping
    const discInput = document.getElementById('poDiscount');
    const shipInput = document.getElementById('poShipping');
    if (discInput) discInput.addEventListener('input', (e) => {
        _convertDiscount = _parseVND(e.target.value);
        _recalcAll();
    });
    if (shipInput) shipInput.addEventListener('input', (e) => {
        _convertShipping = _parseVND(e.target.value);
        _recalcAll();
    });

    // Add item
    const addBtn1 = document.getElementById('poBtnAddItem');
    const addBtn2 = document.getElementById('poBtnAddItem2');
    [addBtn1, addBtn2].forEach(btn => {
        if (btn) btn.onclick = () => _addBlankItem();
    });

    // Confirm button in footer
    const btnConfirm = document.getElementById('btnConfirmConvertPO');
    if (btnConfirm) btnConfirm.onclick = _confirmConvertToPO;
}

function _onItemInput(e) {
    const input = e.target.closest('.po-it-input');
    if (!input) return;
    const tr = input.closest('tr[data-key]');
    if (!tr) return;
    const key = tr.dataset.key;
    const item = _convertItems.find(i => i._key === key);
    if (!item) return;
    const field = input.dataset.field;

    if (field === 'quantity') {
        item.quantity = parseInt(input.value) || 0;
        _updateRowSubtotal(key);
        _recalcAll();
    } else if (field === 'purchasePrice' || field === 'sellingPrice') {
        item[field] = _parseVND(input.value);
        if (field === 'purchasePrice') {
            _updateRowSubtotal(key);
            _recalcAll();
        }
    } else {
        item[field] = input.value;
    }
}

function _onItemClick(e) {
    const delBtn = e.target.closest('.po-btn-del');
    const varBtn = e.target.closest('.po-variant-btn, .po-variant-chip');
    if (delBtn) {
        const key = delBtn.dataset.key;
        _convertItems = _convertItems.filter(i => i._key !== key);
        _rerenderItemsTable();
        _recalcAll();
        return;
    }
    if (varBtn) {
        const key = varBtn.dataset.key;
        _openVariantModal(key);
    }
}

function _addBlankItem() {
    _convertItems.push(_mkItem({ quantity: 1 }));
    _rerenderItemsTable();
}

function _rerenderItemsTable() {
    const tbody = document.getElementById('poItemsBody');
    if (!tbody) return;
    tbody.innerHTML = _convertItems.map((it, idx) => _renderItemRow(it, idx)).join('');
    if (window.lucide) lucide.createIcons();
}

function _updateRowSubtotal(key) {
    const item = _convertItems.find(i => i._key === key);
    if (!item) return;
    const sub = (parseInt(item.quantity) || 0) * (_parseVND(item.purchasePrice) || 0);
    const el = document.querySelector(`.po-it-subtotal[data-key="${key}"]`);
    if (el) el.textContent = _fmtVND(sub) + ' đ';
}

function _recalcAll() {
    const totalQty = _convertItems.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
    const totalAmt = _convertItems.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (_parseVND(i.purchasePrice) || 0), 0);
    const final = totalAmt - (_convertDiscount || 0) + (_convertShipping || 0);

    const qEl = document.getElementById('poTotalQty');
    const aEl = document.getElementById('poTotalAmount');
    const fEl = document.getElementById('poFinalAmount');
    if (qEl) qEl.textContent = _fmtVND(totalQty);
    if (aEl) aEl.textContent = _fmtVND(totalAmt) + ' đ';
    if (fEl) fEl.textContent = _fmtVND(final) + ' đ';
}

// =====================================================
// NESTED VARIANT MODAL (4 columns: Màu / Size Số / Size Chữ / Danh sách Biến Thể)
// Reuse VARIANT_COLORS, VARIANT_SIZE_NUM, VARIANT_SIZE_CHAR từ modal-variant.js
// =====================================================
function _openVariantModal(itemKey) {
    _poVariantItemKey = itemKey;
    _poVariantSel = { color: new Set(), sizeNum: new Set(), sizeChar: new Set() };

    // Parse existing variant to pre-select
    const item = _convertItems.find(i => i._key === itemKey);
    if (item && item.variant) {
        const parts = item.variant.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
        const COLORS = (typeof VARIANT_COLORS !== 'undefined') ? VARIANT_COLORS : [];
        const SNUM = (typeof VARIANT_SIZE_NUM !== 'undefined') ? VARIANT_SIZE_NUM : [];
        const SCHAR = (typeof VARIANT_SIZE_CHAR !== 'undefined') ? VARIANT_SIZE_CHAR : [];
        for (const part of parts) {
            if (COLORS.includes(part)) _poVariantSel.color.add(part);
            else if (SNUM.includes(part)) _poVariantSel.sizeNum.add(part);
            else if (SCHAR.includes(part)) _poVariantSel.sizeChar.add(part);
            else _poVariantSel.color.add(part);
        }
    }

    _renderVariantModal();
    openModal('modalConvertVariant');
    if (window.lucide) lucide.createIcons();
}

function _renderVariantModal() {
    const body = document.getElementById('modalConvertVariantBody');
    if (!body) return;

    const COLORS = (typeof VARIANT_COLORS !== 'undefined') ? VARIANT_COLORS : [];
    const SNUM = (typeof VARIANT_SIZE_NUM !== 'undefined') ? VARIANT_SIZE_NUM : [];
    const SCHAR = (typeof VARIANT_SIZE_CHAR !== 'undefined') ? VARIANT_SIZE_CHAR : [];

    body.innerHTML = `
        <div class="pov-summary" id="povSummary"></div>
        <div class="pov-grid">
            <div class="pov-col">
                <div class="pov-col-title">Màu</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povColorList">
                <div class="pov-options" id="povColorList">${_renderVariantOptions(COLORS, _poVariantSel.color)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Size Số</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povSizeNumList">
                <div class="pov-options" id="povSizeNumList">${_renderVariantOptions(SNUM, _poVariantSel.sizeNum)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Size Chữ</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povSizeCharList">
                <div class="pov-options" id="povSizeCharList">${_renderVariantOptions(SCHAR, _poVariantSel.sizeChar)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Danh sách Biến Thể</div>
                <div class="pov-combos" id="povCombos"></div>
            </div>
        </div>
    `;

    // Bind column search
    body.querySelectorAll('.pov-search').forEach(inp => {
        inp.oninput = (e) => _filterVariantOptions(e.target.dataset.target, e.target.value);
    });
    // Bind option checkboxes (delegate)
    body.querySelectorAll('.pov-options').forEach(col => {
        col.addEventListener('change', (e) => {
            const cb = e.target.closest('input[type="checkbox"]');
            if (!cb) return;
            const bucket = col.id === 'povColorList' ? 'color'
                : col.id === 'povSizeNumList' ? 'sizeNum'
                : 'sizeChar';
            const val = cb.value;
            const set = _poVariantSel[bucket];
            if (cb.checked) {
                set.add(val);
                // SizeNum and SizeChar are mutually exclusive
                if (bucket === 'sizeNum' && _poVariantSel.sizeChar.size > 0) {
                    _poVariantSel.sizeChar.clear();
                    _rerenderOption('povSizeCharList', (typeof VARIANT_SIZE_CHAR !== 'undefined') ? VARIANT_SIZE_CHAR : [], _poVariantSel.sizeChar);
                } else if (bucket === 'sizeChar' && _poVariantSel.sizeNum.size > 0) {
                    _poVariantSel.sizeNum.clear();
                    _rerenderOption('povSizeNumList', (typeof VARIANT_SIZE_NUM !== 'undefined') ? VARIANT_SIZE_NUM : [], _poVariantSel.sizeNum);
                }
            } else {
                set.delete(val);
            }
            _updateVariantSummary();
            _updateVariantCombos();
        });
    });

    // Confirm button (footer)
    const btnApply = document.getElementById('btnApplyConvertVariant');
    if (btnApply) btnApply.onclick = _applyVariantToItem;

    _updateVariantSummary();
    _updateVariantCombos();
}

function _renderVariantOptions(items, selectedSet) {
    if (!items || items.length === 0) return '<div class="pov-empty">Đang tải...</div>';
    return items.map(v => `
        <label class="pov-opt" data-value="${_esc(v)}">
            <input type="checkbox" value="${_esc(v)}" ${selectedSet.has(v) ? 'checked' : ''}>
            <span>${_esc(v)}</span>
        </label>
    `).join('');
}

function _rerenderOption(containerId, items, selectedSet) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = _renderVariantOptions(items, selectedSet);
}

function _filterVariantOptions(containerId, query) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.pov-opt').forEach(el => {
        const val = (el.dataset.value || '').toLowerCase();
        el.style.display = (!q || val.includes(q)) ? '' : 'none';
    });
}

function _generateVariantCombos() {
    const colors = [..._poVariantSel.color];
    const sizeNums = [..._poVariantSel.sizeNum];
    const sizeChars = [..._poVariantSel.sizeChar];
    const combos = [];
    if (colors.length > 0 && sizeChars.length > 0) {
        for (const c of colors) for (const s of sizeChars) combos.push(`${c} / ${s}`);
    }
    if (colors.length > 0 && sizeNums.length > 0) {
        for (const c of colors) for (const s of sizeNums) combos.push(`${c} / ${s}`);
    }
    if (colors.length > 0 && sizeChars.length === 0 && sizeNums.length === 0) combos.push(...colors);
    if (colors.length === 0 && sizeChars.length > 0) combos.push(...sizeChars);
    if (colors.length === 0 && sizeNums.length > 0) combos.push(...sizeNums);
    return combos;
}

function _updateVariantSummary() {
    const el = document.getElementById('povSummary');
    if (!el) return;
    const parts = [];
    if (_poVariantSel.color.size) parts.push([..._poVariantSel.color].join(', '));
    if (_poVariantSel.sizeNum.size) parts.push([..._poVariantSel.sizeNum].join(', '));
    if (_poVariantSel.sizeChar.size) parts.push([..._poVariantSel.sizeChar].join(', '));
    el.textContent = parts.join(' | ') || 'Chưa chọn giá trị nào';
}

function _updateVariantCombos() {
    const el = document.getElementById('povCombos');
    if (!el) return;
    const combos = _generateVariantCombos();
    if (combos.length === 0) {
        el.innerHTML = '<div class="pov-empty">Chọn giá trị thuộc tính<br>để tạo biến thể</div>';
    } else {
        el.innerHTML = combos.map(c => `<div class="pov-combo-item">${_esc(c)}</div>`).join('');
    }
    // Update footer button label
    const label = document.getElementById('btnApplyConvertVariantLabel');
    if (label) label.textContent = combos.length > 0 ? `Tạo ${combos.length} biến thể` : 'Tạo 0 biến thể';
    const btn = document.getElementById('btnApplyConvertVariant');
    if (btn) btn.disabled = combos.length === 0;
}

/**
 * Apply: nếu combos.length === 1 → gán variant cho item gốc.
 *         nếu > 1 → nhân bản item gốc thành N items (copy name/code/qty/price), variant khác nhau.
 */
function _applyVariantToItem() {
    const combos = _generateVariantCombos();
    if (combos.length === 0) return;
    const sourceItem = _convertItems.find(i => i._key === _poVariantItemKey);
    if (!sourceItem) return;

    if (combos.length === 1) {
        sourceItem.variant = combos[0];
    } else {
        const idx = _convertItems.indexOf(sourceItem);
        sourceItem.variant = combos[0];
        for (let i = 1; i < combos.length; i++) {
            _convertItems.splice(idx + i, 0, _mkItem({
                productCode: sourceItem.productCode,
                productName: sourceItem.productName,
                variant: combos[i],
                quantity: sourceItem.quantity,
                purchasePrice: sourceItem.purchasePrice,
                sellingPrice: sourceItem.sellingPrice
            }));
        }
    }

    closeModal('modalConvertVariant');
    _rerenderItemsTable();
    _recalcAll();
    window.notificationManager?.success(`Đã áp ${combos.length} biến thể`);
}

// =====================================================
// SUBMIT — POST lên purchase-orders API
// =====================================================
async function _confirmConvertToPO() {
    const supplier = (document.getElementById('poSupplier')?.value || '').trim();
    if (!supplier) {
        window.notificationManager?.warning('Vui lòng nhập tên nhà cung cấp');
        document.getElementById('poSupplier')?.focus();
        return;
    }

    // Filter valid items (productName or productCode)
    const validItems = _convertItems.filter(i => (i.productName || '').trim() || (i.productCode || '').trim());

    const orderDateStr = document.getElementById('poOrderDate')?.value || new Date().toISOString().split('T')[0];
    const invoiceAmount = _parseVND(document.getElementById('poInvoiceAmount')?.value || 0);
    const notes = (document.getElementById('poNotes')?.value || '').trim();

    const totalAmount = validItems.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (_parseVND(i.purchasePrice) || 0), 0);
    const finalAmount = totalAmount - (_convertDiscount || 0) + (_convertShipping || 0);

    const orderData = {
        status: 'DRAFT',
        orderType: window.ShopConfig?.getConfig?.()?.label || 'NJD SHOP',
        supplier: { name: supplier, code: supplier.substring(0, 3).toUpperCase() },
        orderDate: new Date(orderDateStr),
        invoiceAmount,
        invoiceImages: Array.isArray(_convertCurrentInvoice?.anhHoaDon) ? [..._convertCurrentInvoice.anhHoaDon] : [],
        notes,
        discountAmount: _convertDiscount || 0,
        shippingFee: _convertShipping || 0,
        totalAmount,
        finalAmount,
        items: validItems.map((it, idx) => {
            const qty = parseInt(it.quantity) || 1;
            const price = _parseVND(it.purchasePrice);
            return {
                id: `item_${Date.now()}_${idx}`,
                productName: (it.productName || it.productCode || '').trim(),
                productCode: (it.productCode || '').trim(),
                variant: (it.variant || '').trim(),
                quantity: qty,
                purchasePrice: price,
                sellingPrice: it.sellingPrice === '' ? '' : _parseVND(it.sellingPrice),
                subtotal: price * qty,
                productImages: [..._convertNccImages],
                priceImages: [],
                selectedAttributeValueIds: [],
                tposProductId: '',
                tposProductTmplId: '',
                tposSynced: false,
                tposImageUrl: ''
            };
        })
    };

    const btn = document.getElementById('btnConfirmConvertPO');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Đang tạo...'; }

    try {
        await _createPurchaseOrderDraft(orderData);
        window.notificationManager?.success(`Đã tạo đơn Nháp với ${orderData.items.length} sản phẩm`);
        closeModal('modalConvertPO');
    } catch (err) {
        console.error('[CONVERT-PO] Create failed:', err);
        window.notificationManager?.error('Không thể tạo đơn Nháp: ' + (err.message || 'Lỗi không xác định'));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

async function _createPurchaseOrderDraft(orderData) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const userInfo = window.authManager?.getUserInfo?.();
        if (userInfo) {
            headers['X-Auth-Data'] = JSON.stringify({
                userId: userInfo.uid || userInfo.username || 'anonymous',
                userName: userInfo.displayName || userInfo.username || 'User',
                email: userInfo.email || ''
            });
        }
    } catch (_) { /* ignore */ }

    const response = await fetch(PO_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.error || `API error: ${response.status}`);
    }
    console.log('[CONVERT-PO] Created order:', data.id || data);
    return data;
}

// =====================================================
// HELPERS
// =====================================================
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Expose
window.openConvertToPurchaseOrderModal = openConvertToPurchaseOrderModal;

console.log('[MODAL] Convert-to-PO modal initialized');
