// =====================================================
// MODAL SHIPMENT - INVENTORY TRACKING
// Phase 3: Modal for add/edit shipment
// =====================================================

let currentShipmentData = null;

/**
 * Open shipment modal
 */
function openShipmentModal(shipment = null) {
    currentShipmentData = shipment;

    const modal = document.getElementById('modalShipment');
    const title = document.getElementById('modalShipmentTitle');
    const body = document.getElementById('modalShipmentBody');

    if (title) {
        title.textContent = shipment ? 'Sua Dot Hang' : 'Them Dot Hang Moi';
    }

    if (body) {
        body.innerHTML = renderShipmentForm(shipment);
    }

    // Setup form event listeners
    setupShipmentFormListeners();

    openModal('modalShipment');

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render shipment form
 */
function renderShipmentForm(shipment) {
    const isEdit = !!shipment;
    const date = shipment?.ngayDiHang || new Date().toISOString().split('T')[0];
    const packages = shipment?.kienHang || [{ stt: 1, soKg: '' }];
    const invoices = shipment?.hoaDon || [];
    const costs = shipment?.chiPhiHangVe || [];

    const canEditCost = permissionHelper?.can('edit_chiPhiHangVe');
    const canEditNote = permissionHelper?.can('edit_ghiChuAdmin');

    return `
        <div class="form-group">
            <label>Ngay di hang</label>
            <input type="date" id="shipmentDate" class="form-input" value="${date}">
        </div>

        <div class="form-section">
            <h4><i data-lucide="box"></i> Kien Hang</h4>
            <div id="packagesContainer">
                ${packages.map((p, i) => `
                    <div class="package-row" data-index="${i}">
                        <span class="package-label">Kien ${p.stt || i + 1}</span>
                        <input type="number" class="form-input package-kg" value="${p.soKg || ''}" placeholder="So kg">
                        <button type="button" class="btn btn-sm btn-outline btn-remove-package" ${packages.length <= 1 ? 'disabled' : ''}>
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-sm btn-outline" id="btnAddPackage">
                <i data-lucide="plus"></i> Them kien
            </button>
            <div class="packages-total">Tong: <span id="totalPackages">${packages.length}</span> kien, <span id="totalKg">0</span> kg</div>
        </div>

        <div class="form-section">
            <h4><i data-lucide="receipt"></i> Hoa Don Nha Cung Cap</h4>
            <div id="invoicesContainer">
                ${invoices.length > 0 ? invoices.map((inv, i) => renderInvoiceForm(inv, i)).join('') : renderInvoiceForm(null, 0)}
            </div>
            <button type="button" class="btn btn-sm btn-outline" id="btnAddInvoice">
                <i data-lucide="plus"></i> Them hoa don NCC moi
            </button>
        </div>

        ${canEditCost ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Chi Phi Hang Ve (Admin)</h4>
                <div id="costsContainer">
                    ${costs.length > 0 ? costs.map((c, i) => `
                        <div class="cost-row" data-index="${i}">
                            <input type="text" class="form-input cost-type" value="${c.loai || ''}" placeholder="Loai chi phi">
                            <input type="number" class="form-input cost-amount" value="${c.soTien || ''}" placeholder="So tien">
                            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    `).join('') : ''}
                </div>
                <button type="button" class="btn btn-sm btn-outline" id="btnAddCost">
                    <i data-lucide="plus"></i> Them chi phi
                </button>
                <div class="cost-total">Tong chi phi: <span id="totalCost">0</span></div>
            </div>
        ` : ''}

        ${canEditNote ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Ghi Chu Admin</h4>
                <textarea id="adminNote" class="form-textarea" placeholder="Ghi chu...">${shipment?.ghiChuAdmin || ''}</textarea>
            </div>
        ` : ''}
    `;
}

/**
 * Render invoice form
 */
function renderInvoiceForm(invoice, index) {
    const products = invoice?.sanPham || [];
    const productLines = products.map(p => p.rawText || `MA ${p.maSP} ${p.soMau} MAU ${p.soLuong}X${p.giaDonVi}`).join('\n');

    return `
        <div class="invoice-form" data-index="${index}">
            <div class="invoice-header">
                <label>NCC #</label>
                <input type="number" class="form-input invoice-ncc" value="${invoice?.sttNCC || ''}" placeholder="STT NCC" style="width: 80px;">
                <button type="button" class="btn btn-sm btn-outline btn-remove-invoice" title="Xoa hoa don">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="form-group">
                <label>San pham (Format: MA [ma] [so mau] MAU [SL]X[gia])</label>
                <textarea class="form-textarea invoice-products" rows="4" placeholder="MA 721 2 MAU 10X54&#10;MA 720 2 MAU 10X57">${productLines}</textarea>
            </div>
            <div class="invoice-preview">
                <div class="preview-label">Preview:</div>
                <div class="preview-content"></div>
            </div>
            <div class="invoice-totals">
                <span>Tong tien: <strong class="invoice-total-amount">0</strong></span>
                <span>Tong mon: <strong class="invoice-total-items">0</strong></span>
            </div>
            <div class="form-group">
                <label>Anh hoa don</label>
                <div class="image-upload-area" data-invoice="${index}">
                    <input type="file" class="image-input" multiple accept="image/*" style="display: none;">
                    <button type="button" class="btn btn-sm btn-outline btn-upload">
                        <i data-lucide="upload"></i> Chon file
                    </button>
                    <div class="image-preview-list"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup form event listeners
 */
function setupShipmentFormListeners() {
    // Add package
    document.getElementById('btnAddPackage')?.addEventListener('click', addPackageRow);

    // Add invoice
    document.getElementById('btnAddInvoice')?.addEventListener('click', addInvoiceForm);

    // Add cost
    document.getElementById('btnAddCost')?.addEventListener('click', addCostRow);

    // Remove buttons delegation
    document.getElementById('modalShipmentBody')?.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-package')) {
            e.target.closest('.package-row')?.remove();
            updatePackageTotals();
        }
        if (e.target.closest('.btn-remove-invoice')) {
            e.target.closest('.invoice-form')?.remove();
        }
        if (e.target.closest('.btn-remove-cost')) {
            e.target.closest('.cost-row')?.remove();
            updateCostTotal();
        }
        if (e.target.closest('.btn-upload')) {
            e.target.closest('.image-upload-area')?.querySelector('.image-input')?.click();
        }
    });

    // Package kg input
    document.getElementById('modalShipmentBody')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('package-kg')) {
            updatePackageTotals();
        }
        if (e.target.classList.contains('invoice-products')) {
            updateInvoicePreview(e.target.closest('.invoice-form'));
        }
        if (e.target.classList.contains('cost-amount')) {
            updateCostTotal();
        }
    });

    // Save button
    document.getElementById('btnSaveShipment')?.addEventListener('click', saveShipment);

    // Initial calculations
    updatePackageTotals();
    updateCostTotal();
}

function addPackageRow() {
    const container = document.getElementById('packagesContainer');
    const count = container.querySelectorAll('.package-row').length;
    const html = `
        <div class="package-row" data-index="${count}">
            <span class="package-label">Kien ${count + 1}</span>
            <input type="number" class="form-input package-kg" placeholder="So kg">
            <button type="button" class="btn btn-sm btn-outline btn-remove-package">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
    updatePackageTotals();
}

function addInvoiceForm() {
    const container = document.getElementById('invoicesContainer');
    const count = container.querySelectorAll('.invoice-form').length;
    container.insertAdjacentHTML('beforeend', renderInvoiceForm(null, count));
    if (window.lucide) lucide.createIcons();
}

function addCostRow() {
    const container = document.getElementById('costsContainer');
    const count = container.querySelectorAll('.cost-row').length;
    const html = `
        <div class="cost-row" data-index="${count}">
            <input type="text" class="form-input cost-type" placeholder="Loai chi phi">
            <input type="number" class="form-input cost-amount" placeholder="So tien">
            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
}

function updatePackageTotals() {
    const packages = document.querySelectorAll('.package-row');
    let totalKg = 0;
    packages.forEach(row => {
        const kg = parseFloat(row.querySelector('.package-kg')?.value) || 0;
        totalKg += kg;
    });
    document.getElementById('totalPackages').textContent = packages.length;
    document.getElementById('totalKg').textContent = formatNumber(totalKg);
}

function updateCostTotal() {
    const costs = document.querySelectorAll('.cost-row');
    let total = 0;
    costs.forEach(row => {
        const amount = parseFloat(row.querySelector('.cost-amount')?.value) || 0;
        total += amount;
    });
    const totalEl = document.getElementById('totalCost');
    if (totalEl) totalEl.textContent = formatNumber(total);
}

function updateInvoicePreview(invoiceForm) {
    if (!invoiceForm) return;

    const textarea = invoiceForm.querySelector('.invoice-products');
    const previewContent = invoiceForm.querySelector('.preview-content');
    const totalAmount = invoiceForm.querySelector('.invoice-total-amount');
    const totalItems = invoiceForm.querySelector('.invoice-total-items');

    if (!textarea || !previewContent) return;

    const text = textarea.value.trim();
    if (!text) {
        previewContent.innerHTML = '<span class="preview-empty">Nhap san pham de xem preview</span>';
        if (totalAmount) totalAmount.textContent = '0';
        if (totalItems) totalItems.textContent = '0';
        return;
    }

    // Parse products
    const products = parseMultipleProducts(text);
    const validProducts = products.filter(p => p.isValid);
    const invalidProducts = products.filter(p => !p.isValid);

    // Calculate totals
    const totals = calculateProductTotals(validProducts);

    // Render preview table
    if (validProducts.length > 0) {
        previewContent.innerHTML = `
            <table class="preview-table">
                <thead>
                    <tr>
                        <th>Ma SP</th>
                        <th>Mau</th>
                        <th>SL</th>
                        <th>Gia</th>
                        <th>Thanh tien</th>
                    </tr>
                </thead>
                <tbody>
                    ${validProducts.map(p => `
                        <tr>
                            <td>${p.maSP}</td>
                            <td>${p.soMau}</td>
                            <td>${p.soLuong}</td>
                            <td>${formatNumber(p.giaDonVi)}</td>
                            <td>${formatNumber(p.thanhTien)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${invalidProducts.length > 0 ? `
                <div class="preview-errors">
                    <strong>Loi parse:</strong>
                    ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
                </div>
            ` : ''}
        `;
    } else {
        previewContent.innerHTML = `
            <div class="preview-errors">
                <strong>Khong parse duoc san pham nao</strong>
                ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
            </div>
        `;
    }

    // Update totals
    if (totalAmount) totalAmount.textContent = formatNumber(totals.tongTienHD);
    if (totalItems) totalItems.textContent = formatNumber(totals.tongMon);
}

async function saveShipment() {
    try {
        // Validate date
        const dateInput = document.getElementById('shipmentDate');
        const ngayDiHang = dateInput?.value;
        if (!ngayDiHang) {
            toast.warning('Vui long chon ngay di hang');
            return;
        }

        // Collect packages
        const packageRows = document.querySelectorAll('.package-row');
        const kienHang = [];
        packageRows.forEach((row, index) => {
            const soKg = parseFloat(row.querySelector('.package-kg')?.value) || 0;
            if (soKg > 0) {
                kienHang.push({
                    stt: index + 1,
                    soKg: soKg
                });
            }
        });

        // Collect invoices
        const invoiceForms = document.querySelectorAll('.invoice-form');
        const hoaDon = [];
        let invoiceIndex = 0;

        for (const form of invoiceForms) {
            const sttNCC = parseInt(form.querySelector('.invoice-ncc')?.value);
            const productText = form.querySelector('.invoice-products')?.value?.trim();

            if (!sttNCC) continue;

            // Parse products
            const products = productText ? parseMultipleProducts(productText) : [];
            const validProducts = products.filter(p => p.isValid);

            // Calculate totals
            const totals = calculateProductTotals(validProducts);

            // Get existing invoice data if editing
            const existingInvoice = currentShipmentData?.hoaDon?.[invoiceIndex];

            hoaDon.push({
                id: existingInvoice?.id || generateId('hd'),
                sttNCC: sttNCC,
                sanPham: validProducts,
                tongTienHD: totals.tongTienHD,
                tongMon: totals.tongMon,
                soMonThieu: existingInvoice?.soMonThieu || 0,
                ghiChuThieu: existingInvoice?.ghiChuThieu || '',
                anhHoaDon: existingInvoice?.anhHoaDon || []
            });

            invoiceIndex++;
        }

        // Validate at least one invoice
        if (hoaDon.length === 0) {
            toast.warning('Vui long nhap it nhat 1 hoa don NCC');
            return;
        }

        // Collect shipping costs (admin only)
        const costRows = document.querySelectorAll('.cost-row');
        const chiPhiHangVe = [];
        costRows.forEach((row, index) => {
            const loai = row.querySelector('.cost-type')?.value?.trim();
            const soTien = parseFloat(row.querySelector('.cost-amount')?.value) || 0;
            if (loai && soTien > 0) {
                chiPhiHangVe.push({
                    id: generateId('cp'),
                    loai: loai,
                    soTien: soTien
                });
            }
        });

        // Admin note
        const ghiChuAdmin = document.getElementById('adminNote')?.value?.trim() || '';

        // Calculate totals
        const tongKien = kienHang.length;
        const tongKg = kienHang.reduce((sum, k) => sum + k.soKg, 0);
        const tongTienHoaDon = hoaDon.reduce((sum, hd) => sum + hd.tongTienHD, 0);
        const tongSoMon = hoaDon.reduce((sum, hd) => sum + hd.tongMon, 0);
        const tongMonThieu = hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
        const tongChiPhi = chiPhiHangVe.reduce((sum, c) => sum + c.soTien, 0);

        // Prepare data
        const shipmentData = {
            ngayDiHang,
            kienHang,
            tongKien,
            tongKg,
            hoaDon,
            tongTienHoaDon,
            tongSoMon,
            tongMonThieu,
            chiPhiHangVe,
            tongChiPhi,
            ghiChuAdmin
        };

        // Show loading
        const loadingToast = toast.loading('Dang luu...');

        if (currentShipmentData) {
            // Update existing
            await updateShipment(currentShipmentData.id, shipmentData);
        } else {
            // Create new
            await createShipment(shipmentData);
        }

        toast.remove(loadingToast);
        closeModal('modalShipment');

        // Reload data
        await loadShipmentsData();

    } catch (error) {
        console.error('[MODAL] Error saving shipment:', error);
        toast.error('Khong the luu dot hang');
    }
}

console.log('[MODAL] Shipment modal initialized');
