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
 * Render invoices section with shipping costs as column
 */
function renderInvoicesSection(shipment) {
    const invoices = shipment.hoaDon || [];
    const costs = shipment.chiPhiHangVe || [];
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');

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
    const totalCost = costs.reduce((sum, c) => sum + (c.soTien || 0), 0);

    // Build cost cells - distribute across invoice rows
    const costCells = canViewCost ? buildCostCells(costs, invoices.length) : [];

    return `
        <div class="shipment-section shipment-table-section">
            <div class="table-container">
                <table class="invoice-table invoice-table-bordered">
                    <thead>
                        <tr>
                            <th class="col-ncc">NCC</th>
                            <th class="col-products">Chi Tiết Sản Phẩm</th>
                            <th class="col-amount text-right">Tiền HĐ</th>
                            <th class="col-total text-center">Tổng Món</th>
                            <th class="col-shortage text-center">Thiếu</th>
                            ${canViewCost ? '<th class="col-cost text-right">Chi Phí Hàng Về</th>' : ''}
                            <th class="col-note">Ghi Chú</th>
                            <th class="col-image text-center">Ảnh</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map((hd, idx) => renderInvoiceRowNew(hd, shipment.id, idx, costCells[idx], canViewCost)).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="2" class="text-right"><strong>TỔNG:</strong></td>
                            <td class="text-right"><strong>${formatNumber(totalAmount)}</strong></td>
                            <td class="text-center"><strong>${formatNumber(totalItems)}</strong></td>
                            <td class="text-center"><strong>${totalShortage > 0 ? formatNumber(totalShortage) : '-'}</strong></td>
                            ${canViewCost ? `<td class="text-right cost-total-cell"><strong>${formatNumber(totalCost)}</strong></td>` : ''}
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Build cost cells to distribute across invoice rows
 */
function buildCostCells(costs, rowCount) {
    const cells = [];
    for (let i = 0; i < rowCount; i++) {
        if (i < costs.length) {
            cells.push({
                loai: costs[i].loai,
                soTien: costs[i].soTien
            });
        } else {
            cells.push(null);
        }
    }
    return cells;
}

/**
 * Render single invoice row (new format)
 */
function renderInvoiceRowNew(invoice, shipmentId, rowIndex, costCell, canViewCost) {
    const products = invoice.sanPham || [];
    const imageCount = invoice.anhHoaDon?.length || 0;
    const rowClass = rowIndex % 2 === 0 ? 'row-even' : 'row-odd';

    // Render all products
    const productListHtml = products.map(p =>
        `<div class="product-line">${p.rawText || `MA ${p.maSP} ${p.soMau} MAU ${p.soLuong}X${p.giaDonVi}`}</div>`
    ).join('');

    return `
        <tr class="${rowClass}">
            <td class="col-ncc"><strong>${invoice.sttNCC}</strong></td>
            <td class="col-products">
                <div class="product-list-full">
                    ${productListHtml || '<span class="text-muted">-</span>'}
                </div>
            </td>
            <td class="col-amount text-right">${formatNumber(invoice.tongTienHD)}</td>
            <td class="col-total text-center">${formatNumber(invoice.tongMon)}</td>
            <td class="col-shortage text-center">${invoice.soMonThieu > 0 ? formatNumber(invoice.soMonThieu) : '-'}</td>
            ${canViewCost ? `
                <td class="col-cost text-right cost-cell">
                    ${costCell ? `
                        <div class="cost-item-inline">
                            <span class="cost-label">${costCell.loai}</span>
                            <span class="cost-value">${formatNumber(costCell.soTien)}</span>
                        </div>
                    ` : ''}
                </td>
            ` : ''}
            <td class="col-note">
                <span class="note-text">${invoice.ghiChuThieu || ''}</span>
            </td>
            <td class="col-image text-center">
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
