// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL CONVERT NCC → PURCHASE ORDER DRAFT
// Layout & UX mirror purchase-orders/js/form-modal.js (Tạo đơn đặt hàng)
// Scope:
//   - Supplier + Ngày đặt hàng + Số tiền hóa đơn (VND) + Ảnh hóa đơn
//   - Danh sách sản phẩm bảng: STT | Tên SP | Biến thể | Mã SP | SL | Giá mua | Giá bán | Thành tiền | Thao tác
//   - Nested modal "Tạo biến thể từ thuộc tính" (4 cột: Màu / Size Số / Size Chữ / Danh sách Biến Thể)
//   - Footer: Tổng SL | Tổng tiền | Giảm giá | Tiền ship | THÀNH TIỀN | Hủy | Tạo đơn hàng
// POST → https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/purchase-orders với X-Auth-Data header
// =====================================================

const PO_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/purchase-orders';
const UPLOAD_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/upload/image';

// -------- State --------
let _convertCurrentInvoice = null; // dotHang entry (flat)
let _convertNccImages = []; // productImages URLs cho NCC
let _convertItems = []; // items working array
let _convertDiscount = 0;
let _convertShipping = 0;
let _convertItemCounter = 0;
let _selectedInvoiceImgs = new Set(); // URLs đã chọn làm ảnh hóa đơn (từ ảnh NCC)
let _convertCurrentTiGia = 0; // tỉ giá CNY→VND của shipment cha

// Nested variant modal state
let _poVariantItemKey = null; // item._key đang mở variant modal
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
    for (const ncc of globalState.nccList || []) {
        const dot = (ncc.dotHang || []).find((d) => String(d.id) === String(invoiceId));
        if (dot) {
            found = dot;
            break;
        }
    }
    if (!found) {
        console.warn('[CONVERT-PO] Invoice not found. invoiceId=', invoiceId);
        window.notificationManager?.error('Không tìm thấy hóa đơn NCC');
        return;
    }

    _convertCurrentInvoice = found;
    _convertNccImages =
        typeof getProductImagesForNcc === 'function'
            ? getProductImagesForNcc(found.sttNCC, found.ngayDiHang, found.dotSo)
            : [];
    // Resolve tỉ giá (CNY → VND) from the parent shipment so giaDonVi (Trung)
    // can be converted to full VND for the purchase-order draft.
    const parentShipment = (globalState.shipments || []).find((s) =>
        (s.hoaDon || []).some((hd) => String(hd.id) === String(invoiceId))
    );
    const tiGia = parseFloat(parentShipment?.tiGia) || 0;
    _convertItems = _explodeSanPhamToItems(found.sanPham || [], tiGia);
    _convertCurrentTiGia = tiGia;
    _convertDiscount = 0;
    _convertShipping = 0;
    _selectedInvoiceImgs = new Set();

    _renderConvertModal();
    openModal('modalConvertPO');
    if (window.lucide) lucide.createIcons();
}

function _explodeSanPhamToItems(sanPhamArr, tiGia = 0) {
    const items = [];
    _convertItemCounter = 0;
    // Inventory-tracking stores prices in tiền Trung (CNY).
    // Purchase-orders stores full VND. Multiply by `tiGia` (CNY→VND) at load time.
    // Fallback ×1000 only when tỉ giá chưa được nhập, để giữ hành vi cũ.
    const tg = parseFloat(tiGia) || 0;
    const INV_TO_VND = tg > 0 ? tg : 1000;
    for (const p of sanPhamArr) {
        const baseName = p.moTa && p.moTa !== '-' ? p.moTa : p.maSP || '';
        const mauSac = Array.isArray(p.mauSac) ? p.mauSac : [];
        const priceVnd = Math.round((parseFloat(p.giaDonVi) || 0) * INV_TO_VND);
        if (mauSac.length > 0) {
            for (const mv of mauSac) {
                items.push(
                    _mkItem({
                        productCode: '', // User tự sinh qua nút refresh hoặc nhập tay
                        productName: baseName,
                        variant: mv.mau || '',
                        quantity: parseInt(mv.soLuong) || 0,
                        purchasePrice: priceVnd,
                    })
                );
            }
        } else {
            items.push(
                _mkItem({
                    productCode: '', // User tự sinh qua nút refresh hoặc nhập tay
                    productName: baseName,
                    variant: '',
                    quantity: parseInt(p.tongSoLuong || p.soLuong) || 0,
                    purchasePrice: priceVnd,
                })
            );
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
        sellingPrice: data.sellingPrice ?? '',
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
    // Inventory stores tongTienHD in tiền Trung (CNY) — convert to full VND via tỉ giá.
    // Fallback ×1000 if tỉ giá missing (legacy behavior).
    const tg = parseFloat(_convertCurrentTiGia) || 0;
    const invToVnd = tg > 0 ? tg : 1000;
    const invoiceAmt = Math.round(
        (parseFloat(inv.tongTienHD || inv.tongTien) || 0) * invToVnd
    );
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
                    <div class="po-invoice-img-box" id="poInvoiceImgBox">
                        ${_renderInvoiceImgSlot()}
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

            ${
                _convertNccImages.length > 0
                    ? `
                <div class="po-ncc-img-row">
                    <span class="po-ncc-img-label" title="Click vào ảnh để đưa lên Ảnh hóa đơn">Ảnh sản phẩm NCC (${_convertNccImages.length}) <span class="po-ncc-img-hint">— click để chọn làm ảnh hóa đơn</span></span>
                    <div class="po-ncc-img-preview" id="poNccImgPreview">
                        ${_renderNccThumbnails()}
                    </div>
                </div>
            `
                    : ''
            }

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
                <button type="button" id="poBtnGenAllCodes" class="po-btn-outline po-btn-gen-all" title="Tự tạo mã SP cho mọi dòng còn thiếu">
                    <i data-lucide="refresh-cw"></i> Tạo mã tất cả
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

/**
 * Render "Ảnh hóa đơn" slot — includes anhHoaDon (existing) + user-selected NCC images
 */
function _renderInvoiceImgSlot() {
    const anhHoaDon = Array.isArray(_convertCurrentInvoice?.anhHoaDon)
        ? _convertCurrentInvoice.anhHoaDon
        : [];
    const selected = [..._selectedInvoiceImgs];
    const all = [...anhHoaDon, ...selected];
    if (all.length === 0) return `<span class="po-img-empty">—</span>`;
    const firstThumb = `<img src="${all[0]}" class="po-invoice-thumb" alt="invoice">`;
    const more = all.length > 1 ? `<span class="po-img-count">+${all.length - 1}</span>` : '';
    return firstThumb + more;
}

/**
 * Render NCC thumbnail row (click to toggle selection for invoice slot)
 */
function _renderNccThumbnails() {
    return (
        _convertNccImages
            .slice(0, 10)
            .map((u) => {
                const selected = _selectedInvoiceImgs.has(u);
                return `<img src="${u}" alt="" class="po-ncc-thumb ${selected ? 'po-ncc-thumb--selected' : ''}" data-url="${_esc(u)}">`;
            })
            .join('') +
        (_convertNccImages.length > 10
            ? `<span class="po-img-count">+${_convertNccImages.length - 10}</span>`
            : '')
    );
}

function _toggleNccImgSelection(url) {
    if (_selectedInvoiceImgs.has(url)) _selectedInvoiceImgs.delete(url);
    else _selectedInvoiceImgs.add(url);
    // Re-render both slots
    const box = document.getElementById('poInvoiceImgBox');
    const preview = document.getElementById('poNccImgPreview');
    if (box) box.innerHTML = _renderInvoiceImgSlot();
    if (preview) preview.innerHTML = _renderNccThumbnails();
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
                <div class="po-code-wrap">
                    <input type="text" class="po-it-input" data-field="productCode" value="${_esc(it.productCode)}" placeholder="Mã SP">
                    <button type="button" class="po-btn-gen-code" data-key="${it._key}" title="Tự tạo mã SP theo tên">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
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
    if (discInput)
        discInput.addEventListener('input', (e) => {
            _convertDiscount = _parseVND(e.target.value);
            _recalcAll();
        });
    if (shipInput)
        shipInput.addEventListener('input', (e) => {
            _convertShipping = _parseVND(e.target.value);
            _recalcAll();
        });

    // Add item
    const addBtn1 = document.getElementById('poBtnAddItem');
    const addBtn2 = document.getElementById('poBtnAddItem2');
    [addBtn1, addBtn2].forEach((btn) => {
        if (btn) btn.onclick = () => _addBlankItem();
    });

    // Generate codes for all items
    const genAllBtn = document.getElementById('poBtnGenAllCodes');
    if (genAllBtn) genAllBtn.onclick = () => _generateCodesForAll(genAllBtn);

    // NCC thumbnail click → toggle selection
    const nccPreview = document.getElementById('poNccImgPreview');
    if (nccPreview) {
        nccPreview.addEventListener('click', (e) => {
            const thumb = e.target.closest('.po-ncc-thumb');
            if (!thumb) return;
            const url = thumb.dataset.url;
            if (url) _toggleNccImgSelection(url);
        });
    }

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
    const item = _convertItems.find((i) => i._key === key);
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
    const genBtn = e.target.closest('.po-btn-gen-code');
    if (delBtn) {
        const key = delBtn.dataset.key;
        _convertItems = _convertItems.filter((i) => i._key !== key);
        _rerenderItemsTable();
        _recalcAll();
        return;
    }
    if (varBtn) {
        const key = varBtn.dataset.key;
        _openVariantModal(key);
        return;
    }
    if (genBtn) {
        const key = genBtn.dataset.key;
        _generateCodeForItem(key, genBtn);
    }
}

/**
 * Gọi ProductCodeGenerator sinh mã SP cho 1 item dựa trên productName.
 * - Nếu tên SP trống → báo user.
 * - Dùng generateProductCodeFromMax (async: check form items + Firestore + TPOS)
 * - Firebase không load trong inventory → check DB trả 0 (OK, fallback an toàn).
 */
/**
 * Sinh mã SP cho TẤT CẢ items còn thiếu (productName có nhưng productCode rỗng).
 * Sequential (không parallel) — mỗi item sinh xong update vào form để iter kế tiếp
 * lấy max đúng (tránh trùng mã khi nhiều item cùng prefix).
 */
async function _generateCodesForAll(btn) {
    const gen = window.ProductCodeGenerator;
    if (!gen) {
        window.notificationManager?.error('ProductCodeGenerator chưa load');
        return;
    }

    const targets = _convertItems.filter(
        (i) => (i.productName || '').trim() && !(i.productCode || '').trim()
    );
    if (targets.length === 0) {
        window.notificationManager?.info('Tất cả sản phẩm đã có mã');
        return;
    }

    const originalHTML = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
    }

    let success = 0;
    let failed = 0;
    try {
        for (let i = 0; i < targets.length; i++) {
            const item = targets[i];
            if (btn)
                btn.innerHTML = `<i data-lucide="loader"></i> Đang tạo... ${i + 1}/${targets.length}`;
            if (window.lucide) lucide.createIcons();

            try {
                const existing = _convertItems
                    .filter((x) => x._key !== item._key)
                    .map((x) => ({ productCode: x.productCode || '' }));
                const code = await gen.generateProductCodeFromMax(item.productName, existing, 30);
                if (code) {
                    item.productCode = code;
                    const row = document.querySelector(`tr[data-key="${item._key}"]`);
                    const input = row?.querySelector('input[data-field="productCode"]');
                    if (input) input.value = code;
                    success++;
                } else {
                    failed++;
                }
            } catch (err) {
                console.error('[CONVERT-PO] Gen code failed for item:', item, err);
                failed++;
            }
        }

        if (success > 0 && failed === 0) {
            window.notificationManager?.success(`Đã tạo mã cho ${success} sản phẩm`);
        } else if (success > 0 && failed > 0) {
            window.notificationManager?.warning(
                `Tạo được ${success}/${targets.length} mã (${failed} lỗi)`
            );
        } else {
            window.notificationManager?.error('Không tạo được mã nào');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    }
}

async function _generateCodeForItem(itemKey, btn) {
    const item = _convertItems.find((i) => i._key === itemKey);
    if (!item) return;

    const name = (item.productName || '').trim();
    if (!name) {
        window.notificationManager?.warning('Nhập tên sản phẩm trước khi tạo mã');
        return;
    }

    const gen = window.ProductCodeGenerator;
    if (!gen) {
        window.notificationManager?.error('ProductCodeGenerator chưa load');
        return;
    }

    // Build existingItems list ở format generator expects
    const existingItems = _convertItems
        .filter((i) => i._key !== itemKey)
        .map((i) => ({ productCode: i.productCode || '' }));

    // Lock button
    const originalIcon = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i>';
        if (window.lucide) lucide.createIcons();
    }

    try {
        const code = await gen.generateProductCodeFromMax(name, existingItems, 30);
        if (!code) {
            window.notificationManager?.warning('Không thể sinh mã tự động');
            return;
        }
        item.productCode = code;
        // Update input value in-place (không re-render cả bảng để giữ focus)
        const row = document.querySelector(`tr[data-key="${itemKey}"]`);
        const input = row?.querySelector('input[data-field="productCode"]');
        if (input) input.value = code;
        window.notificationManager?.success(`Đã tạo mã: ${code}`);
    } catch (err) {
        console.error('[CONVERT-PO] Generate code failed:', err);
        window.notificationManager?.error('Lỗi tạo mã: ' + (err.message || ''));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalIcon;
            if (window.lucide) lucide.createIcons();
        }
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
    const item = _convertItems.find((i) => i._key === key);
    if (!item) return;
    const sub = (parseInt(item.quantity) || 0) * (_parseVND(item.purchasePrice) || 0);
    const el = document.querySelector(`.po-it-subtotal[data-key="${key}"]`);
    if (el) el.textContent = _fmtVND(sub) + ' đ';
}

function _recalcAll() {
    const totalQty = _convertItems.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
    const totalAmt = _convertItems.reduce(
        (s, i) => s + (parseInt(i.quantity) || 0) * (_parseVND(i.purchasePrice) || 0),
        0
    );
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
    const item = _convertItems.find((i) => i._key === itemKey);
    if (item && item.variant) {
        const parts = item.variant
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
        const COLORS = typeof VARIANT_COLORS !== 'undefined' ? VARIANT_COLORS : [];
        const SNUM = typeof VARIANT_SIZE_NUM !== 'undefined' ? VARIANT_SIZE_NUM : [];
        const SCHAR = typeof VARIANT_SIZE_CHAR !== 'undefined' ? VARIANT_SIZE_CHAR : [];
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

    const COLORS = typeof VARIANT_COLORS !== 'undefined' ? VARIANT_COLORS : [];
    const SNUM = typeof VARIANT_SIZE_NUM !== 'undefined' ? VARIANT_SIZE_NUM : [];
    const SCHAR = typeof VARIANT_SIZE_CHAR !== 'undefined' ? VARIANT_SIZE_CHAR : [];

    body.innerHTML = `
        <div class="pov-summary" id="povSummary"></div>
        <div class="pov-grid">
            <div class="pov-col">
                <div class="pov-col-title">Màu</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povColorList">
                <div class="pov-options" id="povColorList">${_poRenderVariantOptions(COLORS, _poVariantSel.color)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Size Số</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povSizeNumList">
                <div class="pov-options" id="povSizeNumList">${_poRenderVariantOptions(SNUM, _poVariantSel.sizeNum)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Size Chữ</div>
                <input type="text" class="pov-search" placeholder="Tìm kiếm..." data-target="povSizeCharList">
                <div class="pov-options" id="povSizeCharList">${_poRenderVariantOptions(SCHAR, _poVariantSel.sizeChar)}</div>
            </div>
            <div class="pov-col">
                <div class="pov-col-title">Danh sách Biến Thể</div>
                <div class="pov-combos" id="povCombos"></div>
            </div>
        </div>
    `;

    // Bind column search
    body.querySelectorAll('.pov-search').forEach((inp) => {
        inp.oninput = (e) => _poFilterVariantOptions(e.target.dataset.target, e.target.value);
    });
    // Bind option checkboxes (delegate)
    body.querySelectorAll('.pov-options').forEach((col) => {
        col.addEventListener('change', (e) => {
            const cb = e.target.closest('input[type="checkbox"]');
            if (!cb) return;
            const bucket =
                col.id === 'povColorList'
                    ? 'color'
                    : col.id === 'povSizeNumList'
                      ? 'sizeNum'
                      : 'sizeChar';
            const val = cb.value;
            const set = _poVariantSel[bucket];
            if (cb.checked) {
                set.add(val);
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

function _poRenderVariantOptions(items, selectedSet) {
    if (!items || items.length === 0) return '<div class="pov-empty">Đang tải...</div>';
    return items
        .map(
            (v) => `
        <label class="pov-opt" data-value="${_esc(v)}">
            <input type="checkbox" value="${_esc(v)}" ${selectedSet.has(v) ? 'checked' : ''}>
            <span>${_esc(v)}</span>
        </label>
    `
        )
        .join('');
}

function _rerenderOption(containerId, items, selectedSet) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = _poRenderVariantOptions(items, selectedSet);
}

function _poFilterVariantOptions(containerId, query) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.pov-opt').forEach((el) => {
        const val = (el.dataset.value || '').toLowerCase();
        el.style.display = !q || val.includes(q) ? '' : 'none';
    });
}

function _generateVariantCombos() {
    const colors = [..._poVariantSel.color];
    const sizeNums = [..._poVariantSel.sizeNum];
    const sizeChars = [..._poVariantSel.sizeChar];
    // Independent rows: mỗi giá trị thuộc tính đã chọn → 1 dòng biến thể riêng
    // (không cartesian Màu×Size để khớp format "1 giá trị / dòng" bên purchase-orders)
    return [...colors, ...sizeChars, ...sizeNums];
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
        el.innerHTML = combos.map((c) => `<div class="pov-combo-item">${_esc(c)}</div>`).join('');
    }
    // Update footer button label
    const label = document.getElementById('btnApplyConvertVariantLabel');
    if (label)
        label.textContent = combos.length > 0 ? `Tạo ${combos.length} biến thể` : 'Tạo 0 biến thể';
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
    const sourceItem = _convertItems.find((i) => i._key === _poVariantItemKey);
    if (!sourceItem) return;

    if (combos.length === 1) {
        sourceItem.variant = combos[0];
    } else {
        const idx = _convertItems.indexOf(sourceItem);
        sourceItem.variant = combos[0];
        for (let i = 1; i < combos.length; i++) {
            _convertItems.splice(
                idx + i,
                0,
                _mkItem({
                    productCode: sourceItem.productCode,
                    productName: sourceItem.productName,
                    variant: combos[i],
                    quantity: sourceItem.quantity,
                    purchasePrice: sourceItem.purchasePrice,
                    sellingPrice: sourceItem.sellingPrice,
                })
            );
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
    const validItems = _convertItems.filter(
        (i) => (i.productName || '').trim() || (i.productCode || '').trim()
    );

    // Tất cả items (có tên SP) BẮT BUỘC có productCode — ép user bấm nút refresh sinh mã
    const missingCodeItems = validItems.filter((i) => !(i.productCode || '').trim());
    if (missingCodeItems.length > 0) {
        const stts = missingCodeItems.map((i) => _convertItems.indexOf(i) + 1).join(', ');
        window.notificationManager?.warning(
            `Sản phẩm STT ${stts} chưa có Mã SP. Hãy bấm nút 🔄 cạnh ô Mã SP để tự tạo mã, hoặc nhập tay.`
        );
        // Highlight input để user dễ nhìn
        missingCodeItems.forEach((it) => {
            const row = document.querySelector(`tr[data-key="${it._key}"]`);
            const input = row?.querySelector('input[data-field="productCode"]');
            if (input) {
                input.focus();
                input.style.borderColor = '#ef4444';
                input.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.2)';
                setTimeout(() => {
                    input.style.borderColor = '';
                    input.style.boxShadow = '';
                }, 3000);
            }
        });
        return;
    }

    const orderDateStr =
        document.getElementById('poOrderDate')?.value || new Date().toISOString().split('T')[0];
    const invoiceAmount = _parseVND(document.getElementById('poInvoiceAmount')?.value || 0);
    const notes = (document.getElementById('poNotes')?.value || '').trim();

    const totalAmount = validItems.reduce(
        (s, i) => s + (parseInt(i.quantity) || 0) * (_parseVND(i.purchasePrice) || 0),
        0
    );
    const finalAmount = totalAmount - (_convertDiscount || 0) + (_convertShipping || 0);

    const btn = document.getElementById('btnConfirmConvertPO');
    const originalText = btn?.innerHTML;

    // Build image URLs — inventory stores images as base64 data URLs.
    // Backend rejects data: URLs (see render.com/routes/v2/purchase-orders.js:515).
    // → Upload base64 URLs to Firebase Storage first to get https URLs.
    const anhHoaDonRaw = Array.isArray(_convertCurrentInvoice?.anhHoaDon)
        ? _convertCurrentInvoice.anhHoaDon
        : [];
    const productImgsRaw = Array.isArray(_convertNccImages) ? _convertNccImages : [];

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang tải ảnh...';
    }

    // Chỉ upload ảnh hóa đơn (invoiceImages). Không upload product images per-item —
    // user yêu cầu tiết kiệm bandwidth: PO chỉ cần ảnh hóa đơn, không cần ảnh SP.
    //   - anhHoaDon: ảnh hóa đơn có sẵn của dotHang (thường rỗng)
    //   - selectedFromNcc: ảnh user click chọn trong thumbnails NCC preview
    const selectedFromNcc = productImgsRaw.filter((u) => _selectedInvoiceImgs.has(u));

    let anhHoaDon = [];
    let selectedUploaded = [];
    try {
        [anhHoaDon, selectedUploaded] = await Promise.all([
            _normalizeImageUrls(anhHoaDonRaw, 'purchase-orders/invoices', (c, t) => {
                if (btn && t > 0) btn.innerHTML = `Đang tải ảnh HĐ... ${c}/${t}`;
            }),
            _normalizeImageUrls(selectedFromNcc, 'purchase-orders/invoices', (c, t) => {
                if (btn && t > 0) btn.innerHTML = `Đang tải ảnh đã chọn... ${c}/${t}`;
            }),
        ]);
    } catch (err) {
        console.error('[CONVERT-PO] Image upload failed:', err);
    }

    // invoiceImages = anhHoaDon + ảnh NCC đã chọn (dedupe). productImages per-item bỏ trống.
    const mergedInvoiceImgs = [...new Set([...anhHoaDon, ...selectedUploaded])];

    const orderData = {
        status: 'DRAFT',
        orderType: window.ShopConfig?.getConfig?.()?.label || 'NJD SHOP',
        supplier: { name: supplier, code: supplier.substring(0, 3).toUpperCase() },
        orderDate: new Date(orderDateStr),
        invoiceAmount,
        invoiceImages: mergedInvoiceImgs,
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
                productImages: [],
                priceImages: [],
                selectedAttributeValueIds: [],
                tposProductId: '',
                tposProductTmplId: '',
                tposSynced: false,
                tposImageUrl: '',
            };
        }),
    };

    console.log('[CONVERT-PO] Submit payload:', {
        supplier,
        invoiceAmount,
        totalAmount,
        finalAmount,
        invoiceImages: orderData.invoiceImages,
        itemCount: orderData.items.length,
        selectedFromNcc: selectedFromNcc.length,
        rawAnhHoaDon: anhHoaDonRaw.length,
    });

    if (btn) btn.innerHTML = 'Đang tạo đơn...';

    try {
        await _createPurchaseOrderDraft(orderData);
        window.notificationManager?.success(
            `Đã tạo đơn Nháp với ${orderData.items.length} sản phẩm`
        );
        closeModal('modalConvertPO');
    } catch (err) {
        console.error('[CONVERT-PO] Create failed:', err);
        window.notificationManager?.error(
            'Không thể tạo đơn Nháp: ' + (err.message || 'Lỗi không xác định')
        );
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Upload a single base64 data URL → Firebase Storage, return https URL
 * @param {string} dataUrl - "data:image/jpeg;base64,..."
 * @param {string} folder - folder path on storage (e.g. "purchase-orders/invoices")
 * @returns {Promise<string>} Firebase Storage URL
 */
async function _uploadBase64Image(dataUrl, folder = 'purchase-orders/invoices') {
    // Extract mime type from data URL header
    const mimeMatch = /^data:(image\/[a-zA-Z0-9+]+);base64,/.exec(dataUrl);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const fileName = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const response = await fetch(UPLOAD_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, fileName, folderPath: folder, mimeType }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false || !data.url) {
        throw new Error(data.error || `Upload failed: ${response.status}`);
    }
    return data.url;
}

/**
 * Convert array with mix of http URLs and data: URLs → all https URLs.
 * Uploads base64 entries in parallel and logs progress.
 */
async function _normalizeImageUrls(urls, folder, onProgress) {
    if (!Array.isArray(urls) || urls.length === 0) return [];
    const isHttp = (u) =>
        typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'));
    const isData = (u) => typeof u === 'string' && u.startsWith('data:');

    let uploadedCount = 0;
    const total = urls.filter(isData).length;
    if (total > 0 && typeof onProgress === 'function') onProgress(0, total);

    const results = await Promise.all(
        urls.map(async (u) => {
            if (isHttp(u)) return u;
            if (isData(u)) {
                try {
                    const url = await _uploadBase64Image(u, folder);
                    uploadedCount++;
                    if (typeof onProgress === 'function') onProgress(uploadedCount, total);
                    return url;
                } catch (err) {
                    console.warn('[CONVERT-PO] Upload failed, skipping image:', err.message);
                    return null;
                }
            }
            return null;
        })
    );
    return results.filter(Boolean);
}

async function _createPurchaseOrderDraft(orderData) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const userInfo = window.authManager?.getUserInfo?.();
        if (userInfo) {
            headers['X-Auth-Data'] = JSON.stringify({
                userId: userInfo.uid || userInfo.username || 'anonymous',
                userName: userInfo.displayName || userInfo.username || 'User',
                email: userInfo.email || '',
            });
        }
    } catch (_) {
        /* ignore */
    }

    const response = await fetch(PO_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
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
