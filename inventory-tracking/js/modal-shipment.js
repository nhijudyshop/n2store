// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL SHIPMENT - INVENTORY TRACKING
// Phase 3: Modal for add/edit shipment
// =====================================================

let currentShipmentData = null;

/**
 * Check if a (date, dotSo) tuple already has kienHang in existing shipments
 */
function _dateHasPackagesForDot(dateStr, dotSo) {
    if (!dateStr || !globalState?.shipments) return false;
    const shipment = globalState.shipments.find(s => s.ngayDiHang === dateStr && (s.dotSo || 1) === dotSo);
    return shipment && shipment.kienHang && shipment.kienHang.length > 0;
}

/**
 * Open shipment modal
 */
function openShipmentModal(shipment = null) {
    currentShipmentData = shipment;

    const modal = document.getElementById('modalShipment');
    const title = document.getElementById('modalShipmentTitle');
    const body = document.getElementById('modalShipmentBody');

    if (title) {
        title.textContent = shipment ? 'Sửa Đợt Hàng' : 'Thêm Đợt Hàng Mới';
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
 * Compute default dotSo for the modal:
 * - Edit: use shipment.dotSo
 * - Add: current MAX dotSo for that date (not +1) so user defaults to merging
 *   into latest đợt. User manually types +1 if they want a new đợt.
 *   Fallback 1 if no shipment on that date.
 */
function _computeDefaultDotSo(shipment, date) {
    if (shipment?.dotSo) return shipment.dotSo;
    const sameDate = (globalState?.shipments || []).filter(s => s.ngayDiHang === date);
    if (sameDate.length === 0) return 1;
    return Math.max(...sameDate.map(s => s.dotSo || 1));
}

/**
 * Render shipment form
 */
function renderShipmentForm(shipment) {
    const isEdit = !!shipment;
    const cachedDate = localStorage.getItem('lastShipmentDate');
    const date = shipment?.ngayDiHang || cachedDate || todayVN();
    const packages = shipment?.kienHang || [];
    const dotSo = _computeDefaultDotSo(shipment, date);

    // Check if this date already has kienHang from another shipment (same đợt only)
    const dateHasExistingPackages = !isEdit && _dateHasPackagesForDot(date, dotSo);
    const invoices = shipment?.hoaDon || [];
    const costs = shipment?.chiPhiHangVe || [];

    // Convert packages array to string (e.g., "10 20 50 88")
    const packagesString = packages.map(p => p.soKg).filter(kg => kg > 0).join(' ');

    const canEditCost = permissionHelper?.can('edit_chiPhiHangVe');
    const canEditNote = permissionHelper?.can('edit_ghiChuAdmin');

    return `
        <div class="form-row" style="display:flex;gap:12px">
            <div class="form-group" style="flex:2">
                <label>Ngày Đi Hàng</label>
                <input type="date" id="shipmentDate" class="form-input" value="${date}">
            </div>
            <div class="form-group" style="flex:1">
                <label>Đợt</label>
                <input type="number" id="shipmentDotSo" class="form-input" value="${dotSo}" min="1" title="Số thứ tự đợt trong ngày (vd: 1, 2, 3...)">
            </div>
        </div>

        ${dateHasExistingPackages ? `
            <div class="form-section" style="padding:12px 16px;background:var(--gray-50)">
                <div style="color:var(--gray-500);font-size:13px">
                    <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle"></i>
                    Kiện hàng đã được nhập cho ngày này. Bấm chỉnh sửa đợt hàng để thay đổi.
                </div>
            </div>
        ` : `
            <div class="form-section form-section-collapsible">
                <h4 class="section-toggle" onclick="this.parentElement.classList.toggle('collapsed')">
                    <i data-lucide="box"></i> Kiện Hàng
                    <i data-lucide="chevron-down" class="toggle-arrow"></i>
                </h4>
                <div class="section-body">
                    <div class="form-group">
                        <label>Nhập số kg các kiện (cách nhau bởi dấu cách hoặc dấu phẩy)</label>
                        <input type="text" id="packagesInput" class="form-input" value="${packagesString}" placeholder="VD: 10 20 50 88 hoặc 10, 20, 50, 88">
                        <div class="packages-hint">Ví dụ: "10 20 50 88" = 4 kiện (10kg, 20kg, 50kg, 88kg)</div>
                    </div>
                    <div class="packages-total">Tổng: <span id="totalPackages">0</span> kiện, <span id="totalKg">0</span> kg</div>
                </div>
            </div>
        `}

        <div class="form-section">
            <h4><i data-lucide="receipt"></i> Hóa Đơn Nhà Cung Cấp</h4>
            <div id="invoicesContainer">
                ${invoices.length > 0 ? invoices.map((inv, i) => renderInvoiceForm(inv, i)).join('') : renderInvoiceForm(null, 0)}
            </div>
            <div class="invoice-buttons">
                <button type="button" class="btn btn-sm btn-outline" id="btnAddInvoice">
                    <i data-lucide="plus"></i> Thêm hóa đơn NCC mới
                </button>
                <button type="button" class="btn btn-sm btn-primary" id="btnAddInvoiceAI">
                    <i data-lucide="sparkles"></i> Tạo hóa đơn từ ảnh bằng AI
                </button>
            </div>
        </div>

        ${canEditCost ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Chi Phí Hàng Về (Admin)</h4>
                <div id="costsContainer">
                    ${costs.length > 0 ? costs.map((c, i) => `
                        <div class="cost-row" data-index="${i}">
                            <input type="text" class="form-input cost-type" value="${c.loai || ''}" placeholder="Loại chi phí">
                            <input type="number" class="form-input cost-amount" value="${c.soTien || ''}" placeholder="Số tiền">
                            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    `).join('') : ''}
                </div>
                <button type="button" class="btn btn-sm btn-outline" id="btnAddCost">
                    <i data-lucide="plus"></i> Thêm chi phí
                </button>
                <div class="cost-total">Tổng chi phí: <span id="totalCost">0</span></div>
            </div>
        ` : ''}

        ${canEditNote ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Ghi Chú Admin</h4>
                <textarea id="adminNote" class="form-textarea" placeholder="Ghi chú...">${shipment?.ghiChuAdmin || ''}</textarea>
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

    // Pre-populate existing images when editing
    const existingImages = invoice?.anhHoaDon || [];
    const existingUrlsJson = JSON.stringify(existingImages);
    const existingPreviewsHtml = existingImages.map(url =>
        `<div class="image-preview-item" data-url="${url}">
            <img src="${url}" alt="Preview">
            <button type="button" class="btn-remove-image" data-url="${url}">
                <i data-lucide="x"></i>
            </button>
        </div>`
    ).join('');

    return `
        <div class="invoice-form" data-index="${index}">
            <div class="invoice-header">
                <label>NCC</label>
                <input type="text" class="form-input invoice-ten-ncc" value="${invoice?.tenNCC || ''}" placeholder="Tên NCC (bắt buộc)" style="flex: 1;" required>
                <button type="button" class="btn btn-sm btn-outline btn-remove-invoice" title="Xóa hóa đơn">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="form-group">
                <label>Sản phẩm (Format: MA [mã] [số màu] MÀU [SL]X[giá] hoặc [SL]*[giá])</label>
                <textarea class="form-textarea invoice-products" rows="4" placeholder="MA 721 2 MAU 10X54&#10;ma 720 2 mau 10*57">${productLines}</textarea>
            </div>
            <div class="invoice-preview">
                <div class="preview-label">Xem trước:</div>
                <div class="preview-content"></div>
            </div>
            <div class="invoice-totals">
                <span>Tổng tiền: <strong class="invoice-total-amount">0</strong></span>
                <span>Tổng món: <strong class="invoice-total-items">0</strong></span>
            </div>
            <div class="form-group">
                <label>Ảnh hóa đơn</label>
                <div class="image-upload-area" data-invoice="${index}" data-urls='${existingUrlsJson}' tabindex="0">
                    <input type="file" class="image-input" multiple accept="image/*" style="display: none;">
                    <div class="upload-actions">
                        <button type="button" class="btn btn-sm btn-outline btn-upload">
                            <i data-lucide="upload"></i> Chọn file
                        </button>
                        <span class="paste-hint">hoặc Ctrl+V để dán ảnh</span>
                    </div>
                    <div class="image-preview-list">${existingPreviewsHtml}</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup form event listeners
 */
function setupShipmentFormListeners() {
    // Add invoice
    document.getElementById('btnAddInvoice')?.addEventListener('click', addInvoiceForm);

    // Add invoice with AI
    document.getElementById('btnAddInvoiceAI')?.addEventListener('click', openAIImageUploader);

    // Add cost
    document.getElementById('btnAddCost')?.addEventListener('click', addCostRow);

    // Packages input listener
    document.getElementById('packagesInput')?.addEventListener('input', updatePackageTotals);

    // Date change → update default đợt from API + re-check kienHang visibility (add mode only)
    document.getElementById('shipmentDate')?.addEventListener('change', async (e) => {
        if (currentShipmentData) return; // Skip if editing
        const newDate = e.target.value;
        localStorage.setItem('lastShipmentDate', newDate);

        // Refresh đợt số via API (authoritative) — fallback to local compute on failure
        const dotInput = document.getElementById('shipmentDotSo');
        if (dotInput) {
            try {
                const next = await shipmentsApi.getNextDotSo(newDate);
                dotInput.value = next || _computeDefaultDotSo(null, newDate);
            } catch (err) {
                dotInput.value = _computeDefaultDotSo(null, newDate);
            }
        }
    });

    // Remove buttons delegation
    document.getElementById('modalShipmentBody')?.addEventListener('click', (e) => {
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
        if (e.target.closest('.btn-remove-preview-image')) {
            const item = e.target.closest('.image-preview-item');
            const area = item?.closest('.image-upload-area');
            item?.remove();
            syncUploadAreaUrls(area);
        }
    });

    // File input change handler (delegation)
    document.getElementById('modalShipmentBody')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('image-input')) {
            const area = e.target.closest('.image-upload-area');
            if (area && e.target.files?.length > 0) {
                handleInvoiceImageFiles(area, Array.from(e.target.files));
                e.target.value = '';
            }
        }
    });

    // Track hovered upload area so paste works on hover (no click needed)
    let _hoveredUploadArea = null;
    const modalBody = document.getElementById('modalShipmentBody');
    modalBody?.addEventListener('mouseover', (e) => {
        const area = e.target.closest('.image-upload-area');
        if (area) _hoveredUploadArea = area;
    });
    modalBody?.addEventListener('mouseout', (e) => {
        const area = e.target.closest('.image-upload-area');
        if (area && area === _hoveredUploadArea) _hoveredUploadArea = null;
    });

    // Paste handler for images — works on hover OR focus
    document.addEventListener('paste', (e) => {
        // Only handle when modal is open
        if (!modalBody || modalBody.closest('.modal[style*="display: none"]')) return;
        if (!modalBody.closest('.modal')?.classList.contains('show') && !modalBody.offsetParent) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length === 0) return;

        // Prefer hovered area, then focused area, then last invoice form
        const focused = document.activeElement;
        const invoiceForm = focused?.closest('.invoice-form');
        const area = _hoveredUploadArea
            || invoiceForm?.querySelector('.image-upload-area')
            || modalBody.querySelector('.invoice-form:last-child .image-upload-area');

        if (area) {
            e.preventDefault();
            handleInvoiceImageFiles(area, imageFiles);
        }
    });

    // Input delegation
    document.getElementById('modalShipmentBody')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('invoice-products')) {
            updateInvoicePreview(e.target.closest('.invoice-form'));
        }
        if (e.target.classList.contains('cost-amount')) {
            updateCostTotal();
        }
    });

    // Note: Removed auto-fill tenNCC — user enters manually

    // Save button
    document.getElementById('btnSaveShipment')?.addEventListener('click', saveShipment);

    // Initial calculations
    updatePackageTotals();
    updateCostTotal();
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
            <input type="text" class="form-input cost-type" placeholder="Loại chi phí">
            <input type="number" class="form-input cost-amount" placeholder="Số tiền">
            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
}

/**
 * Parse packages from input string
 * Accepts: "10 20 50 88" or "10, 20, 50, 88" or "10,20,50,88"
 */
function parsePackagesInput(inputString) {
    if (!inputString || !inputString.trim()) return [];

    // Replace commas with spaces, then split by whitespace
    const normalized = inputString.replace(/,/g, ' ').trim();
    const parts = normalized.split(/\s+/).filter(p => p.length > 0);

    const packages = [];
    parts.forEach((part, index) => {
        const kg = parseFloat(part);
        if (!isNaN(kg) && kg > 0) {
            packages.push({
                stt: index + 1,
                soKg: kg
            });
        }
    });

    return packages;
}

function updatePackageTotals() {
    const input = document.getElementById('packagesInput');
    const packages = parsePackagesInput(input?.value || '');

    const totalKg = packages.reduce((sum, p) => sum + p.soKg, 0);

    const totalPackagesEl = document.getElementById('totalPackages');
    const totalKgEl = document.getElementById('totalKg');

    if (totalPackagesEl) totalPackagesEl.textContent = packages.length;
    if (totalKgEl) totalKgEl.textContent = formatNumber(totalKg);
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
        previewContent.innerHTML = '<span class="preview-empty">Nhập sản phẩm để xem trước</span>';
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
                        <th>Mã SP</th>
                        <th>Màu</th>
                        <th>SL</th>
                        <th>Giá</th>
                        <th>Thành tiền</th>
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
                    <strong>Lỗi parse:</strong>
                    ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
                </div>
            ` : ''}
        `;
    } else {
        previewContent.innerHTML = `
            <div class="preview-errors">
                <strong>Không parse được sản phẩm nào</strong>
                ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
            </div>
        `;
    }

    // Update totals
    if (totalAmount) totalAmount.textContent = formatNumber(totals.tongTienHD);
    if (totalItems) totalItems.textContent = formatNumber(totals.tongMon);
}

// =====================================================
// IMAGE UPLOAD & PASTE HELPERS
// =====================================================

/**
 * Handle image files for an invoice upload area (from file input or paste)
 */
async function handleInvoiceImageFiles(uploadArea, files) {
    const previewList = uploadArea.querySelector('.image-preview-list');
    if (!previewList) return;

    const validFiles = [];
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            window.notificationManager?.warning(`Bỏ qua "${file.name}" — không phải ảnh`);
            continue;
        }
        if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
            window.notificationManager?.warning(`Bỏ qua "${file.name}" — vượt quá 5MB`);
            continue;
        }
        validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Show local previews immediately (before upload)
    const placeholders = validFiles.map(file => {
        const localUrl = URL.createObjectURL(file);
        const item = document.createElement('div');
        item.className = 'image-preview-item uploading';
        item.innerHTML = `
            <img src="${localUrl}" alt="Preview">
            <div class="upload-spinner"></div>
        `;
        previewList.appendChild(item);
        return { file, element: item, localUrl };
    });

    window.notificationManager?.info(`Đang tải ${validFiles.length} ảnh lên...`);

    let successCount = 0;
    for (const ph of placeholders) {
        try {
            const url = await uploadImage(ph.file, 'invoices');
            ph.element.classList.remove('uploading');
            ph.element.innerHTML = `
                <img src="${url}" alt="Invoice">
                <button type="button" class="btn-remove-preview-image" title="Xóa ảnh">
                    <i data-lucide="x"></i>
                </button>
            `;
            ph.element.dataset.url = url;
            successCount++;
        } catch (err) {
            console.error('[UPLOAD] Failed:', ph.file.name, err);
            ph.element.classList.remove('uploading');
            ph.element.classList.add('upload-failed');
            ph.element.innerHTML = `
                <div class="upload-error">
                    <i data-lucide="alert-circle"></i>
                    <span>Lỗi</span>
                </div>
                <button type="button" class="btn-remove-preview-image" title="Xóa">
                    <i data-lucide="x"></i>
                </button>
            `;
        }
        URL.revokeObjectURL(ph.localUrl);
    }

    // Sync data-urls attribute
    syncUploadAreaUrls(uploadArea);

    if (window.lucide) lucide.createIcons();

    if (successCount > 0) {
        window.notificationManager?.success(`Đã tải ${successCount}/${validFiles.length} ảnh`);
    } else {
        window.notificationManager?.error('Không tải được ảnh nào');
    }
}

/**
 * Sync the data-urls attribute from preview items
 */
function syncUploadAreaUrls(uploadArea) {
    if (!uploadArea) return;
    const items = uploadArea.querySelectorAll('.image-preview-item[data-url]');
    const urls = Array.from(items).map(el => el.dataset.url).filter(Boolean);
    uploadArea.dataset.urls = JSON.stringify(urls);
}

/**
 * Get uploaded image URLs from an invoice form
 */
function getInvoiceImageUrls(invoiceForm) {
    const area = invoiceForm?.querySelector('.image-upload-area');
    if (!area) return [];
    try {
        return JSON.parse(area.dataset.urls || '[]');
    } catch (_) {
        return [];
    }
}

async function saveShipment() {
    try {
        // Validate date
        const dateInput = document.getElementById('shipmentDate');
        const ngayDiHang = dateInput?.value;
        if (!ngayDiHang) {
            window.notificationManager?.warning('Vui lòng chọn ngày đi hàng');
            return;
        }

        // Collect đợt số (batch number within the date)
        const dotSoInput = document.getElementById('shipmentDotSo');
        const dotSo = parseInt(dotSoInput?.value, 10) || 1;

        // Cache date for next time
        localStorage.setItem('lastShipmentDate', ngayDiHang);

        // Collect packages from single input
        const packagesInput = document.getElementById('packagesInput');
        const kienHang = parsePackagesInput(packagesInput?.value || '');

        // Collect invoices
        const invoiceForms = document.querySelectorAll('.invoice-form');
        const hoaDon = [];
        let invoiceIndex = 0;

        let autoSttNCC = 0;
        for (const form of invoiceForms) {
            const rawNCC = form.querySelector('.invoice-ten-ncc')?.value?.trim() || '';
            const productText = form.querySelector('.invoice-products')?.value?.trim();

            if (!rawNCC) {
                window.notificationManager?.warning('Vui lòng nhập tên NCC');
                form.querySelector('.invoice-ten-ncc')?.focus();
                return;
            }

            // Parse optional leading number: "1 LẤY THÊM" → sttNCC=1, tenNCC="LẤY THÊM"
            // "LẤY THÊM" → sttNCC=auto (900+), tenNCC="LẤY THÊM"
            // sttNCC >= 900 means "name-only NCC" — won't map productImages
            const nccMatch = rawNCC.match(/^(\d+)\s+(.+)$/);
            let sttNCC, tenNCC;
            if (nccMatch) {
                sttNCC = parseInt(nccMatch[1], 10);
                tenNCC = nccMatch[2].trim();
            } else {
                // Auto-assign high number (900+) so server accepts it but won't collide with real NCCs
                autoSttNCC++;
                sttNCC = 900 + autoSttNCC;
                tenNCC = rawNCC;
            }

            // Parse products
            const products = productText ? parseMultipleProducts(productText) : [];
            const validProducts = products.filter(p => p.isValid);

            // Calculate totals
            const totals = calculateProductTotals(validProducts);

            // Get existing invoice data if editing
            const existingInvoice = currentShipmentData?.hoaDon?.[invoiceIndex];

            // Get all image URLs from upload area (includes existing + newly uploaded)
            const anhHoaDon = getInvoiceImageUrls(form);

            hoaDon.push({
                id: existingInvoice?.id || generateId('hd'),
                sttNCC: sttNCC,
                tenNCC: tenNCC,
                sanPham: validProducts,
                tongTienHD: totals.tongTienHD,
                tongMon: totals.tongMon,
                soMonThieu: existingInvoice?.soMonThieu || 0,
                ghiChuThieu: existingInvoice?.ghiChuThieu || '',
                anhHoaDon: anhHoaDon
            });

            invoiceIndex++;
        }

        // Validate at least one invoice
        if (hoaDon.length === 0) {
            window.notificationManager?.warning('Vui lòng nhập ít nhất 1 hóa đơn NCC');
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
            dotSo,
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
        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        if (currentShipmentData) {
            // Update existing
            await updateShipment(currentShipmentData.id, shipmentData);
        } else {
            // Create new
            await createShipment(shipmentData);
        }

        window.notificationManager?.remove(loadingToast);
        closeModal('modalShipment');

        // Reload data
        await loadShipmentsData();

    } catch (error) {
        console.error('[MODAL] Error saving shipment:', error);
        window.notificationManager?.error('Không thể lưu đợt hàng');
    }
}

// =====================================================
// AI IMAGE UPLOAD FUNCTIONS
// =====================================================

/**
 * Open file picker for AI image upload
 */
function openAIImageUploader() {
    console.log('[MODAL] Opening AI image uploader');

    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';

    input.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleAIImageUpload(files);
        }
    });

    input.click();
}

/**
 * Handle AI image upload
 * @param {FileList} files - Selected image files
 */
async function handleAIImageUpload(files) {
    console.log(`[MODAL] Handling ${files.length} images for AI processing`);

    // Validate files
    for (const file of files) {
        if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
            window.notificationManager?.error(`File ${file.name} không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG, GIF, WebP.`);
            return;
        }
        if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
            window.notificationManager?.error(`File ${file.name} quá lớn. Kích thước tối đa 5MB.`);
            return;
        }
    }

    window.notificationManager?.info(`Đang xử lý ${files.length} ảnh bằng AI...`);

    // Setup queue callbacks
    aiQueueManager.onProgress = (current, total, status) => {
        console.log(`[AI] Processing image ${current}/${total} - ${status}`);
    };

    aiQueueManager.onComplete = (index, result) => {
        console.log(`[AI] Image ${index} processed:`, result.success ? 'SUCCESS' : 'FAILED');

        // Show first preview immediately
        if (index === 1) {
            openAIPreviewModal(result, index, files.length);
        }
    };

    aiQueueManager.onAllComplete = (results) => {
        console.log('[AI] All images processed:', results.size);
    };

    // Start processing
    await aiQueueManager.addBatch(files);
}

/**
 * Add AI invoice to form (NEW: handles productsData structure)
 * @param {Object} data - AI extracted data
 * @param {number} data.sttNCC - NCC number
 * @param {string} data.tenNCC - NCC name
 * @param {Array} data.productsData - Structured product array with mauSac
 * @param {string} data.imageUrl - Uploaded image URL
 * @param {string} data.notes - Notes
 */
async function addAIInvoiceToForm(data) {
    console.log('[MODAL] Adding AI invoice to form with productsData:', data);

    // Add new invoice form
    addInvoiceForm();

    // Wait for DOM update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the last (newest) invoice form
    const forms = document.querySelectorAll('.invoice-form');
    const lastForm = forms[forms.length - 1];

    if (!lastForm) {
        console.error('[MODAL] Could not find invoice form');
        return;
    }

    // Populate NCC name field
    const nccNameInput = lastForm.querySelector('.invoice-ten-ncc');
    if (nccNameInput) nccNameInput.value = data.tenNCC || '';

    // NEW: Convert productsData to textarea format for compatibility
    // The existing preview system still uses text parsing
    const productText = (data.productsData || [])
        .map(p => p.rawText || `MA ${p.maSP} ${p.soMau} MÀU ${p.tongSoLuong || p.soLuong}X${p.giaDonVi}`)
        .join('\n');

    const productsTextarea = lastForm.querySelector('.invoice-products');
    if (productsTextarea) {
        productsTextarea.value = productText;
        // Trigger preview update
        updateInvoicePreview(lastForm);
    }

    // Store the full structured data in a custom property for later use
    lastForm._aiProductsData = data.productsData;

    // Add invoice image
    if (data.imageUrl) {
        const imageContainer = lastForm.querySelector('.invoice-images-container');
        if (imageContainer) {
            const imageCard = document.createElement('div');
            imageCard.className = 'image-preview-item';
            imageCard.innerHTML = `
                <img src="${data.imageUrl}" alt="Invoice">
                <button type="button" class="btn-remove-image" onclick="removeInvoiceImage(this, '${data.imageUrl}')">
                    <i data-lucide="x"></i>
                </button>
            `;
            imageContainer.appendChild(imageCard);

            if (window.lucide) {
                lucide.createIcons();
            }
        }

        // Store image URL in hidden field
        const imagesInput = lastForm.querySelector('.invoice-images-data');
        if (imagesInput) {
            const existingImages = JSON.parse(imagesInput.value || '[]');
            existingImages.push(data.imageUrl);
            imagesInput.value = JSON.stringify(existingImages);
        }
    }

    console.log('[MODAL] AI invoice added successfully');
}

console.log('[MODAL] Shipment modal initialized with AI support');
