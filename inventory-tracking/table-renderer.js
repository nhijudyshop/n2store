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

    // Build invoice rows with product lines
    let allRows = [];
    invoices.forEach((hd, invoiceIdx) => {
        const products = hd.sanPham || [];
        const imageCount = hd.anhHoaDon?.length || 0;
        const invoiceClass = invoiceIdx % 2 === 0 ? 'invoice-even' : 'invoice-odd';

        // Get cost for this invoice row (only first product row shows cost)
        const costItem = canViewCost && invoiceIdx < costs.length ? costs[invoiceIdx] : null;

        if (products.length === 0) {
            // No products - single row
            allRows.push(renderProductRow({
                invoiceIdx,
                invoiceClass,
                sttNCC: hd.sttNCC,
                productIdx: 0,
                product: null,
                isFirstRow: true,
                isLastRow: true,
                rowSpan: 1,
                tongTienHD: hd.tongTienHD,
                tongMon: hd.tongMon,
                soMonThieu: hd.soMonThieu,
                imageCount,
                shipmentId: shipment.id,
                invoiceId: hd.id,
                costItem,
                canViewCost
            }));
        } else {
            // Multiple products
            products.forEach((product, productIdx) => {
                allRows.push(renderProductRow({
                    invoiceIdx,
                    invoiceClass,
                    sttNCC: hd.sttNCC,
                    productIdx,
                    product,
                    isFirstRow: productIdx === 0,
                    isLastRow: productIdx === products.length - 1,
                    rowSpan: products.length,
                    tongTienHD: hd.tongTienHD,
                    tongMon: hd.tongMon,
                    soMonThieu: hd.soMonThieu,
                    imageCount,
                    shipmentId: shipment.id,
                    invoiceId: hd.id,
                    costItem: productIdx === 0 ? costItem : null, // Only first row shows cost
                    canViewCost
                }));
            });
        }
    });

    return `
        <div class="shipment-section shipment-table-section">
            <div class="table-container">
                <table class="invoice-table invoice-table-bordered">
                    <thead>
                        <tr>
                            <th class="col-ncc">NCC</th>
                            <th class="col-stt">STT</th>
                            <th class="col-products">Chi Tiết Sản Phẩm</th>
                            <th class="col-amount text-right">Tiền HĐ</th>
                            <th class="col-total text-center">Tổng Món</th>
                            <th class="col-shortage text-center">Thiếu</th>
                            <th class="col-image text-center">Ảnh</th>
                            ${canViewCost ? '<th class="col-cost text-right">Chi Phí</th>' : ''}
                            ${canViewCost ? '<th class="col-cost-note">Ghi Chú CP</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${allRows.join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="3" class="text-right"><strong>TỔNG:</strong></td>
                            <td class="text-right"><strong class="total-amount">${formatNumber(totalAmount)}</strong></td>
                            <td class="text-center"><strong class="total-items">${formatNumber(totalItems)}</strong></td>
                            <td class="text-center"><strong>${totalShortage > 0 ? formatNumber(totalShortage) : '-'}</strong></td>
                            <td></td>
                            ${canViewCost ? `<td class="text-right cost-total-cell"><strong class="total-cost">${formatNumber(totalCost)}</strong></td>` : ''}
                            ${canViewCost ? '<td class="cost-note-cell"></td>' : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render a single product row
 */
function renderProductRow(opts) {
    const {
        invoiceIdx, invoiceClass, sttNCC, productIdx, product,
        isFirstRow, isLastRow, rowSpan,
        tongTienHD, tongMon, soMonThieu, imageCount,
        shipmentId, invoiceId, costItem, canViewCost
    } = opts;

    const rowClass = `${invoiceClass} ${isLastRow ? 'invoice-last-row' : ''}`;
    const productText = product ? (product.rawText || `MA ${product.maSP} ${product.soMau} MAU ${product.soLuong}X${product.giaDonVi}`) : '-';

    return `
        <tr class="${rowClass}">
            ${isFirstRow ? `<td class="col-ncc" rowspan="${rowSpan}"><strong>${sttNCC}</strong></td>` : ''}
            <td class="col-stt">${product ? productIdx + 1 : '-'}</td>
            <td class="col-products">
                <span class="product-text">${productText}</span>
            </td>
            ${isFirstRow ? `
                <td class="col-amount text-right" rowspan="${rowSpan}">
                    <strong class="amount-value">${formatNumber(tongTienHD)}</strong>
                </td>
                <td class="col-total text-center" rowspan="${rowSpan}">
                    <strong class="total-value">${formatNumber(tongMon)}</strong>
                </td>
                <td class="col-shortage text-center" rowspan="${rowSpan}">
                    <strong class="shortage-value">${soMonThieu > 0 ? formatNumber(soMonThieu) : '-'}</strong>
                </td>
                <td class="col-image text-center" rowspan="${rowSpan}">
                    ${imageCount > 0 ? `
                        <span class="image-count" onclick="viewInvoiceImages('${shipmentId}', '${invoiceId}')">
                            <i data-lucide="image"></i>
                            ${imageCount}
                        </span>
                    ` : '-'}
                </td>
            ` : ''}
            ${canViewCost ? `
                <td class="col-cost text-right cost-cell">
                    ${costItem ? `<strong class="cost-value">${formatNumber(costItem.soTien)}</strong>` : ''}
                </td>
                <td class="col-cost-note cost-note-cell">
                    ${costItem ? `<span class="cost-label">${costItem.loai}</span>` : ''}
                </td>
            ` : ''}
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
