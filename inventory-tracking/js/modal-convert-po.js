// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL CONVERT TO PURCHASE ORDER - INVENTORY TRACKING
// Chuyển 1 hóa đơn NCC trong đợt hàng sang Purchase Order (status=DRAFT)
// -----------------------------------------------------
// Flow:
//   1. User nhấn nút "Chuyển qua đặt hàng" trên NCC header → openConvertToPurchaseOrderModal(invoiceId)
//   2. Tìm hoaDon + parentShipment trong globalState.nccList
//   3. Explode mauSac[] thành items riêng (mỗi biến thể = 1 dòng)
//   4. Render modal cho phép chỉnh sửa items + supplier + invoiceAmount + notes
//   5. User nhấn "Chuyển qua đặt hàng" → POST https://n2store-fallback.onrender.com/api/v2/purchase-orders
// =====================================================

const PO_API_URL = 'https://n2store-fallback.onrender.com/api/v2/purchase-orders';

// State
let _convertCurrentInvoice = null;   // hoaDon object
let _convertCurrentShipment = null;  // parent shipment (for ngayDiHang, dotSo)
let _convertNccImages = [];          // productImages URLs cho NCC này
let _convertItems = [];              // working items array

/**
 * Entry point — mở modal convert
 * @param {string} invoiceId - id của hoaDon (NCC)
 */
function openConvertToPurchaseOrderModal(invoiceId) {
    if (!invoiceId) {
        window.notificationManager?.error('Thiếu invoiceId');
        return;
    }

    // Tìm hoaDon trong globalState
    let foundInvoice = null;
    let foundShipment = null;
    outer: for (const ncc of (globalState.nccList || [])) {
        for (const dot of (ncc.dotHang || [])) {
            const hd = (dot.hoaDon || []).find(h => String(h.id) === String(invoiceId));
            if (hd) {
                foundInvoice = hd;
                foundShipment = dot;
                break outer;
            }
        }
    }

    if (!foundInvoice) {
        window.notificationManager?.error('Không tìm thấy hóa đơn NCC');
        return;
    }

    _convertCurrentInvoice = foundInvoice;
    _convertCurrentShipment = foundShipment;

    // Lấy productImages của NCC (chung cho tất cả items)
    _convertNccImages = typeof getProductImagesForNcc === 'function'
        ? getProductImagesForNcc(foundInvoice.sttNCC, foundShipment.ngayDiHang, foundShipment.dotSo)
        : [];

    // Explode sanPham + mauSac thành items candidate
    _convertItems = _explodeSanPhamToItems(foundInvoice.sanPham || []);

    _renderConvertModal();
    openModal('modalConvertPO');
    if (window.lucide) lucide.createIcons();
}

/**
 * Explode sanPham[] (mỗi product có mauSac[]) thành items phẳng
 */
function _explodeSanPhamToItems(sanPhamArr) {
    const items = [];
    let counter = 0;
    for (const p of sanPhamArr) {
        const baseName = (p.moTa && p.moTa !== '-') ? p.moTa : (p.maSP || '');
        const mauSac = Array.isArray(p.mauSac) ? p.mauSac : [];

        if (mauSac.length > 0) {
            for (const mv of mauSac) {
                items.push({
                    _key: `it_${counter++}`,
                    _included: true,
                    productCode: p.maSP || '',
                    productName: baseName,
                    variant: mv.mau || '',
                    quantity: parseInt(mv.soLuong) || 0,
                    purchasePrice: parseFloat(p.giaDonVi) || 0,
                    sellingPrice: ''
                });
            }
        } else {
            items.push({
                _key: `it_${counter++}`,
                _included: true,
                productCode: p.maSP || '',
                productName: baseName,
                variant: '',
                quantity: parseInt(p.tongSoLuong || p.soLuong) || 0,
                purchasePrice: parseFloat(p.giaDonVi) || 0,
                sellingPrice: ''
            });
        }
    }
    return items;
}

/**
 * Render nội dung modal
 */
function _renderConvertModal() {
    const body = document.getElementById('modalConvertPOBody');
    if (!body) return;

    const inv = _convertCurrentInvoice;
    const todayIso = new Date().toISOString().split('T')[0];
    const invoiceAmt = parseFloat(inv.tongTienHD || inv.tongTien) || 0;
    const nccName = inv.tenNCC || String(inv.sttNCC || '');

    body.innerHTML = `
        <div class="convert-po-form">
            <div class="convert-po-grid">
                <div class="form-group">
                    <label>Nhà cung cấp <span style="color:#ef4444">*</span></label>
                    <input type="text" id="convertSupplier" class="form-input" value="${_escConvAttr(nccName)}" placeholder="Tên NCC">
                </div>
                <div class="form-group">
                    <label>Ngày đặt hàng</label>
                    <input type="date" id="convertOrderDate" class="form-input" value="${todayIso}">
                </div>
                <div class="form-group">
                    <label>Tiền hóa đơn</label>
                    <input type="number" id="convertInvoiceAmount" class="form-input" value="${invoiceAmt}" min="0">
                </div>
            </div>

            <div class="form-group">
                <label>Ghi chú</label>
                <textarea id="convertNotes" class="form-input" rows="2" placeholder="Ghi chú cho đơn đặt hàng...">${_escText(inv.ghiChu || '')}</textarea>
            </div>

            ${_convertNccImages.length > 0 ? `
                <div class="form-group">
                    <label>Ảnh sản phẩm của NCC (${_convertNccImages.length}) — sẽ được gán cho tất cả items</label>
                    <div class="convert-po-img-preview">
                        ${_convertNccImages.slice(0, 8).map(url => `<img src="${url}" alt="">`).join('')}
                        ${_convertNccImages.length > 8 ? `<span class="convert-po-img-more">+${_convertNccImages.length - 8}</span>` : ''}
                    </div>
                </div>
            ` : ''}

            <div class="convert-po-items-header">
                <strong>Danh sách sản phẩm (${_convertItems.length} dòng)</strong>
                <span class="convert-po-hint">Giá bán để trống — điền sau ở màn Nháp</span>
            </div>

            <div class="convert-po-items-wrap">
                <table class="convert-po-items-table">
                    <thead>
                        <tr>
                            <th style="width:36px"><input type="checkbox" id="convertCheckAll" checked></th>
                            <th>Mã SP</th>
                            <th>Tên SP</th>
                            <th>Biến thể</th>
                            <th style="width:80px">SL</th>
                            <th style="width:110px">Giá mua</th>
                        </tr>
                    </thead>
                    <tbody id="convertItemsBody">
                        ${_convertItems.map(it => _renderItemRow(it)).join('')}
                    </tbody>
                </table>
            </div>

            <div class="convert-po-totals">
                <span>Tổng dòng: <strong id="convertTotalRows">${_convertItems.filter(i => i._included).length}</strong></span>
                <span>Tổng SL: <strong id="convertTotalQty">${_sumIncluded('quantity')}</strong></span>
                <span>Tổng tiền mua: <strong id="convertTotalAmount">${_formatConvertNum(_computeTotalAmount())}</strong></span>
            </div>
        </div>
    `;

    // Bind events
    _bindConvertEvents();
}

function _renderItemRow(it) {
    return `
        <tr data-key="${it._key}">
            <td><input type="checkbox" class="convert-it-check" ${it._included ? 'checked' : ''}></td>
            <td><input type="text" class="convert-it-input" data-field="productCode" value="${_escConvAttr(it.productCode)}"></td>
            <td><input type="text" class="convert-it-input" data-field="productName" value="${_escConvAttr(it.productName)}"></td>
            <td><input type="text" class="convert-it-input" data-field="variant" value="${_escConvAttr(it.variant)}"></td>
            <td><input type="number" class="convert-it-input" data-field="quantity" value="${it.quantity}" min="0"></td>
            <td><input type="number" class="convert-it-input" data-field="purchasePrice" value="${it.purchasePrice}" min="0"></td>
        </tr>
    `;
}

function _bindConvertEvents() {
    const tbody = document.getElementById('convertItemsBody');
    if (!tbody) return;

    // Check all
    const checkAll = document.getElementById('convertCheckAll');
    if (checkAll) {
        checkAll.onchange = (e) => {
            const checked = e.target.checked;
            _convertItems.forEach(it => { it._included = checked; });
            tbody.querySelectorAll('.convert-it-check').forEach(c => { c.checked = checked; });
            _updateConvertTotals();
        };
    }

    // Per-row check
    tbody.querySelectorAll('tr').forEach(tr => {
        const key = tr.dataset.key;
        const item = _convertItems.find(i => i._key === key);
        if (!item) return;

        const cb = tr.querySelector('.convert-it-check');
        if (cb) {
            cb.onchange = (e) => {
                item._included = e.target.checked;
                _updateConvertTotals();
            };
        }

        tr.querySelectorAll('.convert-it-input').forEach(input => {
            input.oninput = (e) => {
                const field = e.target.dataset.field;
                if (!field) return;
                const val = e.target.value;
                if (field === 'quantity' || field === 'purchasePrice') {
                    item[field] = parseFloat(val) || 0;
                } else {
                    item[field] = val;
                }
                if (field === 'quantity' || field === 'purchasePrice') {
                    _updateConvertTotals();
                }
            };
        });
    });

    // Button confirm
    const btnConfirm = document.getElementById('btnConfirmConvertPO');
    if (btnConfirm) {
        btnConfirm.onclick = _confirmConvertToPO;
    }
}

function _updateConvertTotals() {
    const rowsEl = document.getElementById('convertTotalRows');
    const qtyEl = document.getElementById('convertTotalQty');
    const amtEl = document.getElementById('convertTotalAmount');
    if (rowsEl) rowsEl.textContent = _convertItems.filter(i => i._included).length;
    if (qtyEl) qtyEl.textContent = _sumIncluded('quantity');
    if (amtEl) amtEl.textContent = _formatConvertNum(_computeTotalAmount());
}

function _sumIncluded(field) {
    return _convertItems
        .filter(i => i._included)
        .reduce((s, i) => s + (parseFloat(i[field]) || 0), 0);
}

function _computeTotalAmount() {
    return _convertItems
        .filter(i => i._included)
        .reduce((s, i) => s + (parseFloat(i.purchasePrice) || 0) * (parseInt(i.quantity) || 0), 0);
}

function _formatConvertNum(n) {
    return (typeof formatNumber === 'function') ? formatNumber(n) : String(n);
}

/**
 * Confirm — build orderData + POST lên purchase-orders API
 */
async function _confirmConvertToPO() {
    const supplierEl = document.getElementById('convertSupplier');
    const orderDateEl = document.getElementById('convertOrderDate');
    const invoiceAmtEl = document.getElementById('convertInvoiceAmount');
    const notesEl = document.getElementById('convertNotes');

    const supplierName = (supplierEl?.value || '').trim();
    if (!supplierName) {
        window.notificationManager?.warning('Vui lòng nhập tên nhà cung cấp');
        supplierEl?.focus();
        return;
    }

    const includedItems = _convertItems.filter(i => i._included);
    if (includedItems.length === 0) {
        const ok = await _confirmEmptyItems();
        if (!ok) return;
    }

    const orderDateStr = orderDateEl?.value || new Date().toISOString().split('T')[0];
    const orderDate = new Date(orderDateStr);

    const totalAmount = _computeTotalAmount();

    const orderData = {
        status: 'DRAFT',
        orderType: window.ShopConfig?.getConfig?.()?.label || 'NJD SHOP',
        supplier: {
            name: supplierName,
            code: supplierName.substring(0, 3).toUpperCase()
        },
        orderDate: orderDate,
        invoiceAmount: parseFloat(invoiceAmtEl?.value) || 0,
        invoiceImages: Array.isArray(_convertCurrentInvoice?.anhHoaDon) ? [..._convertCurrentInvoice.anhHoaDon] : [],
        notes: (notesEl?.value || '').trim(),
        discountAmount: 0,
        shippingFee: 0,
        totalAmount,
        finalAmount: totalAmount,
        items: includedItems.map((it, idx) => {
            const qty = parseInt(it.quantity) || 1;
            const price = parseFloat(it.purchasePrice) || 0;
            return {
                id: `item_${Date.now()}_${idx}`,
                productName: (it.productName || it.productCode || '').trim(),
                productCode: (it.productCode || '').trim(),
                variant: (it.variant || '').trim(),
                quantity: qty,
                purchasePrice: price,
                sellingPrice: '',
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
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang tạo...';
    }

    try {
        await _createPurchaseOrderDraft(orderData);
        window.notificationManager?.success(`Đã tạo đơn Nháp với ${orderData.items.length} sản phẩm`);
        closeModal('modalConvertPO');
    } catch (err) {
        console.error('[CONVERT-PO] Create failed:', err);
        window.notificationManager?.error('Không thể tạo đơn Nháp: ' + (err.message || 'Lỗi không xác định'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Gọi POST /api/v2/purchase-orders với X-Auth-Data header
 * (format raw JSON như purchase-orders/js/service.js)
 */
async function _createPurchaseOrderDraft(orderData) {
    const headers = { 'Content-Type': 'application/json' };

    // Build auth header — purchase-orders service expects raw JSON (không base64)
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

function _confirmEmptyItems() {
    return new Promise((resolve) => {
        const ok = window.confirm('Chưa có sản phẩm nào được chọn. Vẫn tạo đơn Nháp trống?');
        resolve(ok);
    });
}

// Helpers (prefix _escConv để tránh conflict với _escAttr ở table-renderer.js)
function _escConvAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escText(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Expose
window.openConvertToPurchaseOrderModal = openConvertToPurchaseOrderModal;
window._confirmConvertToPO = _confirmConvertToPO;

console.log('[MODAL] Convert-to-PO modal initialized');
