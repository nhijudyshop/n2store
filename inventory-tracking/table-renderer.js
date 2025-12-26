// =====================================================
// TABLE RENDERER - INVENTORY TRACKING
// Phase 3: Will be fully implemented
// =====================================================

/**
 * Render shipments list
 */
function renderShipments(shipments) {
    const container = document.getElementById('shipmentsContainer');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    if (!container) return;

    // Hide loading
    if (loadingState) loadingState.classList.add('hidden');

    // Clear previous content (except loading/empty states)
    const cards = container.querySelectorAll('.shipment-card');
    cards.forEach(card => card.remove());

    // Show empty state if no data
    if (!shipments || shipments.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render each shipment
    shipments.forEach(shipment => {
        const card = createShipmentCard(shipment);
        container.appendChild(card);
    });

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Create shipment card element
 */
function createShipmentCard(shipment) {
    const card = document.createElement('div');
    card.className = 'shipment-card';
    card.dataset.id = shipment.id;

    const canEdit = permissionHelper?.can('edit_shipment');
    const canDelete = permissionHelper?.can('delete_shipment');
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');
    const canViewNote = permissionHelper?.can('view_ghiChuAdmin');

    card.innerHTML = `
        <div class="shipment-header">
            <div class="shipment-date">
                <i data-lucide="calendar"></i>
                <span>${formatDateDisplay(shipment.ngayDiHang)}</span>
            </div>
            <div class="shipment-actions">
                ${canEdit ? `
                    <button class="btn btn-sm btn-outline" onclick="editShipment('${shipment.id}')" title="Sửa">
                        <i data-lucide="edit"></i>
                    </button>
                ` : ''}
                ${canDelete ? `
                    <button class="btn btn-sm btn-outline" onclick="deleteShipment('${shipment.id}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-outline" onclick="updateShortage('${shipment.id}')" title="Cập nhật thiếu">
                    <i data-lucide="clipboard-check"></i>
                </button>
            </div>
        </div>
        <div class="shipment-body">
            ${renderPackagesSection(shipment)}
            ${renderInvoicesSection(shipment)}
            ${canViewCost ? renderShippingCostSection(shipment) : ''}
            ${canViewNote && shipment.ghiChuAdmin ? renderAdminNoteSection(shipment) : ''}
        </div>
    `;

    return card;
}

/**
 * Render packages section
 */
function renderPackagesSection(shipment) {
    const packages = shipment.kienHang || [];
    const totalKg = packages.reduce((sum, p) => sum + (p.soKg || 0), 0);

    return `
        <div class="shipment-section">
            <div class="section-title">
                <i data-lucide="box"></i>
                <span>KIỆN HÀNG: ${packages.length} kiện | Tổng: ${formatNumber(totalKg)} kg</span>
            </div>
            <div class="packages-grid">
                ${packages.map(p => `
                    <span class="package-badge">
                        <i data-lucide="package"></i>
                        Kiện ${p.stt}: ${p.soKg} kg
                    </span>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Render invoices section
 */
function renderInvoicesSection(shipment) {
    const invoices = shipment.hoaDon || [];

    if (invoices.length === 0) {
        return `
            <div class="shipment-section">
                <div class="section-title">
                    <i data-lucide="receipt"></i>
                    <span>HÓA ĐƠN NHÀ CUNG CẤP</span>
                </div>
                <p style="color: var(--gray-500);">Chưa có hóa đơn</p>
            </div>
        `;
    }

    const totalAmount = invoices.reduce((sum, hd) => sum + (hd.tongTienHD || 0), 0);
    const totalItems = invoices.reduce((sum, hd) => sum + (hd.tongMon || 0), 0);
    const totalShortage = invoices.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);

    return `
        <div class="shipment-section">
            <div class="section-title">
                <i data-lucide="receipt"></i>
                <span>HÓA ĐƠN NHÀ CUNG CẤP</span>
            </div>
            <div class="table-container">
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th style="width: 60px;">NCC</th>
                            <th>Chi tiết sản phẩm</th>
                            <th class="text-right" style="width: 100px;">Tiền HĐ</th>
                            <th class="text-center" style="width: 70px;">Tổng món</th>
                            <th class="text-center" style="width: 70px;">Thiếu</th>
                            <th class="text-center" style="width: 60px;">Ảnh</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(hd => renderInvoiceRow(hd, shipment.id)).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: var(--gray-50); font-weight: 600;">
                            <td colspan="2" class="text-right">TỔNG:</td>
                            <td class="text-right">${formatNumber(totalAmount)}</td>
                            <td class="text-center">${formatNumber(totalItems)}</td>
                            <td class="text-center">${totalShortage > 0 ? formatNumber(totalShortage) : '-'}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render single invoice row
 */
function renderInvoiceRow(invoice, shipmentId) {
    const products = invoice.sanPham || [];
    const imageCount = invoice.anhHoaDon?.length || 0;

    const productListHtml = products.slice(0, 3).map(p =>
        `<div class="product-item">${p.rawText || `MA ${p.maSP} ${p.soMau} MAU ${p.soLuong}X${p.giaDonVi}`}</div>`
    ).join('');

    const moreCount = products.length - 3;

    return `
        <tr>
            <td><strong>${invoice.sttNCC}</strong></td>
            <td>
                <div class="product-list">
                    ${productListHtml}
                    ${moreCount > 0 ? `<span class="show-more">(+${moreCount} dòng)</span>` : ''}
                </div>
            </td>
            <td class="text-right">${formatNumber(invoice.tongTienHD)}</td>
            <td class="text-center">${formatNumber(invoice.tongMon)}</td>
            <td class="text-center">${invoice.soMonThieu > 0 ? formatNumber(invoice.soMonThieu) : '-'}</td>
            <td class="text-center">
                ${imageCount > 0 ? `
                    <span class="image-count" onclick="viewInvoiceImages('${shipmentId}', '${invoice.id}')">
                        <i data-lucide="image"></i>
                        ${imageCount}
                    </span>
                ` : '-'}
            </td>
        </tr>
    `;
}

/**
 * Render shipping cost section (Admin only)
 */
function renderShippingCostSection(shipment) {
    const costs = shipment.chiPhiHangVe || [];
    if (costs.length === 0) return '';

    const totalCost = costs.reduce((sum, c) => sum + (c.soTien || 0), 0);

    return `
        <div class="shipping-cost-section">
            <div class="shipping-cost-header">
                <i data-lucide="lock"></i>
                <span>CHI PHÍ HÀNG VỀ</span>
            </div>
            <div class="shipping-cost-items">
                ${costs.map(c => `
                    <span class="cost-item">
                        <span class="cost-label">${c.loai}:</span>
                        <span class="cost-value">${formatNumber(c.soTien)}</span>
                    </span>
                `).join('')}
                <span class="cost-total">= ${formatNumber(totalCost)}</span>
            </div>
        </div>
    `;
}

/**
 * Render admin note section
 */
function renderAdminNoteSection(shipment) {
    if (!shipment.ghiChuAdmin) return '';

    return `
        <div class="admin-note-section">
            <div class="admin-note-label">
                <i data-lucide="lock"></i> Ghi Chú Admin:
            </div>
            <div class="admin-note-content">${shipment.ghiChuAdmin}</div>
        </div>
    `;
}

/**
 * View invoice images
 */
function viewInvoiceImages(shipmentId, invoiceId) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    const invoice = shipment.hoaDon?.find(hd => hd.id === invoiceId);
    if (!invoice || !invoice.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn');
        return;
    }

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = invoice.anhHoaDon.map(url => `
            <div class="image-item">
                <img src="${url}" alt="Hóa đơn" onclick="window.open('${url}', '_blank')">
            </div>
        `).join('');
    }

    openModal('modalImageViewer');
}

console.log('[RENDERER] Table renderer initialized');
