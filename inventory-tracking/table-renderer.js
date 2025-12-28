// =====================================================
// TABLE RENDERER - INVENTORY TRACKING
// Phase 3: Will be fully implemented
// =====================================================

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// =====================================================

const CHINESE_TO_VIETNAMESE = {
    // Colors - Màu sắc
    '黑': 'Đen',
    '白': 'Trắng',
    '红': 'Đỏ',
    '蓝': 'Xanh dương',
    '绿': 'Xanh lá',
    '黄': 'Vàng',
    '紫': 'Tím',
    '粉': 'Hồng',
    '灰': 'Xám',
    '棕': 'Nâu',
    '咖': 'Cà phê',
    '米': 'Kem',
    '杏': 'Mơ',
    '橙': 'Cam',
    '酱': 'Nâu đậm',
    '卡其': 'Kaki',
    '驼': 'Lạc đà',
    '藏青': 'Xanh đen',
    '酒红': 'Đỏ rượu',
    '墨绿': 'Xanh rêu',
    '浅': 'Nhạt',
    '深': 'Đậm',

    // Patterns - Họa tiết
    '条': 'Sọc',
    '纹': 'Vân',
    '格': 'Caro',
    '花': 'Hoa',
    '点': 'Chấm',
    '印': 'In',

    // Materials/Style - Chất liệu/Kiểu
    '棉': 'Cotton',
    '麻': 'Lanh',
    '丝': 'Lụa',
    '绒': 'Nhung',
    '毛': 'Len',
    '皮': 'Da',

    // Common terms
    '色': '',
    '款': 'Kiểu',
    '上衣': 'Áo',
    '裤': 'Quần',
    '裙': 'Váy',
    '外套': 'Áo khoác',
    '衬衫': 'Sơ mi',
    '领': 'Cổ',
    '交叉': 'Chéo',
    '斜角': 'Xéo góc',
    '苏': 'Tô'
};

/**
 * Translate Chinese text to Vietnamese
 */
function translateToVietnamese(text) {
    if (!text) return text;

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE).sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

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

    // Support both tongTienHD (new) and tongTien (old) field names
    const totalAmount = invoices.reduce((sum, hd) => sum + (hd.tongTienHD || hd.tongTien || 0), 0);
    // Calculate tongMon from products if not available
    const totalItems = invoices.reduce((sum, hd) => {
        if (hd.tongMon) return sum + hd.tongMon;
        // Fallback: calculate from products
        const products = hd.sanPham || [];
        return sum + products.reduce((pSum, p) => pSum + (p.soLuong || 0), 0);
    }, 0);
    const totalShortage = invoices.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
    const totalCost = costs.reduce((sum, c) => sum + (c.soTien || 0), 0);

    // Build invoice rows with product lines
    // Costs are for the entire shipment, listed sequentially by absolute row index
    let allRows = [];
    let absoluteRowIdx = 0; // Track row index across all invoices for cost assignment

    invoices.forEach((hd, invoiceIdx) => {
        const products = hd.sanPham || [];
        const imageCount = hd.anhHoaDon?.length || 0;
        const invoiceClass = invoiceIdx % 2 === 0 ? 'invoice-even' : 'invoice-odd';

        // Calculate tongMon for this invoice (fallback from products if not set)
        const invoiceTongMon = hd.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
        const invoiceTongTienHD = hd.tongTienHD || hd.tongTien || 0;

        // Check if invoice has subInvoice
        const hasSubInvoice = !!hd.subInvoice;

        if (products.length === 0) {
            // No products - single row
            const costItem = canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
            allRows.push(renderProductRow({
                invoiceIdx,
                invoiceClass,
                sttNCC: hd.sttNCC,
                productIdx: 0,
                product: null,
                isFirstRow: true,
                isLastRow: true,
                rowSpan: 1,
                tongTienHD: invoiceTongTienHD,
                tongMon: invoiceTongMon,
                soMonThieu: hd.soMonThieu,
                imageCount,
                ghiChu: hd.ghiChu,
                shipmentId: shipment.id,
                invoiceId: hd.id || invoiceIdx,  // Fallback to index if no id
                costItem,
                canViewCost,
                hasSubInvoice,
                subInvoice: hd.subInvoice
            }));
            absoluteRowIdx++;
        } else {
            // Multiple products - cost assigned by absolute row index
            products.forEach((product, productIdx) => {
                const costItem = canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
                allRows.push(renderProductRow({
                    invoiceIdx,
                    invoiceClass,
                    sttNCC: hd.sttNCC,
                    productIdx,
                    product,
                    isFirstRow: productIdx === 0,
                    isLastRow: productIdx === products.length - 1,
                    rowSpan: products.length,
                    tongTienHD: invoiceTongTienHD,
                    tongMon: invoiceTongMon,
                    soMonThieu: hd.soMonThieu,
                    imageCount,
                    ghiChu: hd.ghiChu,
                    shipmentId: shipment.id,
                    invoiceId: hd.id || invoiceIdx,  // Fallback to index if no id
                    costItem,
                    canViewCost,
                    hasSubInvoice,
                    subInvoice: hd.subInvoice
                }));
                absoluteRowIdx++;
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
                            <th class="col-invoice-note">Ghi Chú</th>
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
        tongTienHD, tongMon, soMonThieu, imageCount, ghiChu,
        shipmentId, invoiceId, costItem, canViewCost,
        hasSubInvoice, subInvoice
    } = opts;

    const rowClass = `${invoiceClass} ${isLastRow ? 'invoice-last-row' : ''}`;
    // Use Vietnamese or Chinese based on langMode setting
    const isVietnamese = globalState.langMode === 'vi';
    let productText = '-';
    if (product) {
        if (isVietnamese) {
            // Try rawText_vi first, then translate rawText, then build from fields
            if (product.rawText_vi) {
                productText = product.rawText_vi;
            } else if (product.rawText) {
                productText = translateToVietnamese(product.rawText);
            } else {
                const tenSP = product.tenSP_vi || translateToVietnamese(product.tenSP || '');
                const soMau = product.soMau_vi || translateToVietnamese(product.soMau || '');
                productText = `MA ${product.maSP || ''} ${tenSP} MAU ${soMau} SL ${product.soLuong || 0}`;
            }
        } else {
            // Chinese mode - use original text
            productText = product.rawText || `MA ${product.maSP || ''} ${product.tenSP || ''} MAU ${product.soMau || ''} SL ${product.soLuong || 0}`;
        }
    }
    // For rowspanned cells (rendered on first row), always apply invoice-border since their
    // bottom border appears at the end of their rowspan (which is the last row of invoice)
    // For non-rowspanned cells (STT, Products), only apply on last row
    const rowspanBorderClass = 'invoice-border';
    const borderClass = isLastRow ? 'invoice-border' : '';

    // Sub-invoice indicator and click handler
    const subInvoiceIndicator = hasSubInvoice && isFirstRow ? `<span class="sub-invoice-indicator" title="Có hóa đơn phụ - Click để xem">▼</span>` : '';
    const nccClickHandler = hasSubInvoice && isFirstRow ? `onclick="showSubInvoice('${shipmentId}', ${invoiceIdx}); event.stopPropagation();" style="cursor: pointer;"` : '';
    const nccClass = hasSubInvoice ? 'has-sub-invoice' : '';

    // Debug log
    if (hasSubInvoice && isFirstRow) {
        console.log('[TABLE] NCC with subInvoice:', sttNCC, 'shipmentId:', shipmentId, 'invoiceIdx:', invoiceIdx);
    }

    return `
        <tr class="${rowClass}">
            ${isFirstRow ? `<td class="col-ncc ${rowspanBorderClass} ${nccClass}" rowspan="${rowSpan}" ${nccClickHandler}><strong>${sttNCC}</strong>${subInvoiceIndicator}</td>` : ''}
            <td class="col-stt ${borderClass}">${product ? productIdx + 1 : '-'}</td>
            <td class="col-products ${borderClass}">
                <span class="product-text">${productText}</span>
            </td>
            ${isFirstRow ? `
                <td class="col-amount text-right ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="amount-value">${formatNumber(tongTienHD)}</strong>
                </td>
                <td class="col-total text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="total-value">${formatNumber(tongMon)}</strong>
                </td>
                <td class="col-shortage text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="shortage-value">${soMonThieu > 0 ? formatNumber(soMonThieu) : '-'}</strong>
                </td>
                <td class="col-image text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    ${imageCount > 0 ? `
                        <span class="image-count" onclick="viewInvoiceImages('${shipmentId}', '${invoiceId}')">
                            <i data-lucide="image"></i>
                            ${imageCount}
                        </span>
                    ` : '-'}
                </td>
                <td class="col-invoice-note ${rowspanBorderClass}" rowspan="${rowSpan}">
                    ${ghiChu ? `<span class="invoice-note-text">${ghiChu}</span>` : ''}
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
function viewInvoiceImages(shipmentId, invoiceIdentifier) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    // Find invoice by id, sttNCC, or index
    let invoiceIdx = -1;

    // Check if invoiceIdentifier is a number or numeric string (index)
    const numericId = typeof invoiceIdentifier === 'number' ? invoiceIdentifier : parseInt(invoiceIdentifier, 10);
    if (!isNaN(numericId) && numericId >= 0 && numericId < (shipment.hoaDon?.length || 0)) {
        // It's a valid index
        invoiceIdx = numericId;
    } else if (typeof invoiceIdentifier === 'string') {
        // Try to find by id or sttNCC
        invoiceIdx = shipment.hoaDon?.findIndex(hd =>
            hd.id === invoiceIdentifier || String(hd.sttNCC) === invoiceIdentifier
        ) ?? -1;
    }

    if (invoiceIdx === -1 || !shipment.hoaDon?.[invoiceIdx]) {
        toast.info('Không tìm thấy hóa đơn');
        return;
    }

    const invoice = shipment.hoaDon[invoiceIdx];
    if (!invoice.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn');
        return;
    }

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = invoice.anhHoaDon.map((url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn" onclick="window.open('${url}', '_blank')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `).join('');
    }

    // Store current invoice index for re-render after delete
    modal.dataset.currentInvoiceIdx = invoiceIdx;
    openModal('modalImageViewer');
}

/**
 * Delete an image from invoice
 */
async function deleteInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find(s => s.id === shipmentId);
        if (!shipment) {
            toast.error('Không tìm thấy shipment');
            return;
        }

        if (invoiceIdx < 0 || invoiceIdx >= (shipment.hoaDon?.length || 0)) {
            toast.error('Không tìm thấy hóa đơn');
            return;
        }

        const invoice = shipment.hoaDon[invoiceIdx];
        if (!invoice.anhHoaDon || imageIndex >= invoice.anhHoaDon.length) {
            toast.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...invoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update hoaDon array
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...invoice,
            anhHoaDon: updatedImages
        };

        // Update Firestore
        await db.collection('inventory_tracking').doc(shipmentId).update({
            hoaDon: updatedHoaDon,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        toast.success('Đã xóa ảnh');
        console.log('[RENDERER] Image deleted from invoice');

    } catch (error) {
        console.error('[RENDERER] Delete image error:', error);
        toast.error('Lỗi xóa ảnh: ' + error.message);
    }
}

/**
 * Show sub-invoice modal
 * Displays the sub-invoice (invoice 2) in a modal table
 */
function showSubInvoice(shipmentId, invoiceIdx) {
    console.log('[MODAL] showSubInvoice called:', shipmentId, invoiceIdx);

    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        console.error('[MODAL] Shipment not found:', shipmentId);
        toast.info('Không tìm thấy shipment');
        return;
    }

    console.log('[MODAL] Found shipment, hoaDon count:', shipment.hoaDon?.length);

    if (invoiceIdx < 0 || invoiceIdx >= (shipment.hoaDon?.length || 0)) {
        console.error('[MODAL] Invalid invoiceIdx:', invoiceIdx);
        toast.info('Không tìm thấy hóa đơn');
        return;
    }

    const invoice = shipment.hoaDon[invoiceIdx];
    console.log('[MODAL] Invoice:', invoice.sttNCC, 'hasSubInvoice:', !!invoice.subInvoice);

    if (!invoice.subInvoice) {
        toast.info('Không có hóa đơn phụ');
        return;
    }

    const subInvoice = invoice.subInvoice;
    const products = subInvoice.sanPham || [];
    const isVietnamese = globalState.langMode === 'vi';

    // Build product rows
    const productRows = products.map((product, idx) => {
        let productText = '-';
        if (product) {
            if (isVietnamese) {
                if (product.rawText_vi) {
                    productText = product.rawText_vi;
                } else if (product.rawText) {
                    productText = translateToVietnamese(product.rawText);
                } else {
                    const tenSP = product.tenSP_vi || translateToVietnamese(product.tenSP || '');
                    const soMau = product.soMau_vi || translateToVietnamese(product.soMau || '');
                    productText = `MA ${product.maSP || ''} ${tenSP} MAU ${soMau} SL ${product.soLuong || 0}`;
                }
            } else {
                productText = product.rawText || `MA ${product.maSP || ''} ${product.tenSP || ''} MAU ${product.soMau || ''} SL ${product.soLuong || 0}`;
            }
        }
        return `
            <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${productText}</td>
            </tr>
        `;
    }).join('');

    // Calculate tongMon from products if not set
    const tongMon = subInvoice.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
    const tongTienHD = subInvoice.tongTienHD || 0;
    const imageCount = subInvoice.anhHoaDon?.length || 0;

    // Build modal HTML
    const modalHtml = `
        <div id="subInvoiceModal" class="modal-overlay" onclick="if(event.target===this)closeSubInvoiceModal()">
            <div class="modal-container" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Hóa Đơn Phụ - NCC ${invoice.sttNCC}</h2>
                    <button class="modal-close" onclick="closeSubInvoiceModal()">×</button>
                </div>
                <div class="modal-content" style="padding: 20px;">
                    <div class="sub-invoice-info" style="margin-bottom: 15px; padding: 10px; background: var(--gray-50); border-radius: 8px;">
                        <p><strong>Tiền HĐ:</strong> ${formatNumber(tongTienHD)} ¥</p>
                        <p><strong>Tổng món:</strong> ${formatNumber(tongMon)}</p>
                        ${subInvoice.ghiChu ? `<p><strong>Ghi chú:</strong> ${subInvoice.ghiChu}</p>` : ''}
                        ${imageCount > 0 ? `
                            <p>
                                <strong>Ảnh:</strong>
                                <span class="image-count" onclick="viewSubInvoiceImages('${shipmentId}', ${invoiceIdx})" style="cursor: pointer; color: var(--primary); margin-left: 5px;">
                                    📷 ${imageCount} ảnh
                                </span>
                            </p>
                        ` : ''}
                    </div>
                    <table class="invoice-table invoice-table-bordered" style="width: 100%;">
                        <thead>
                            <tr>
                                <th class="text-center" style="width: 60px;">STT</th>
                                <th>Chi Tiết Sản Phẩm</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productRows.length > 0 ? productRows : '<tr><td colspan="2" class="text-center">Không có sản phẩm</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr class="total-row">
                                <td class="text-right"><strong>TỔNG:</strong></td>
                                <td><strong>${formatNumber(tongMon)} món - ${formatNumber(tongTienHD)} ¥</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('subInvoiceModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

/**
 * Close sub-invoice modal
 */
function closeSubInvoiceModal() {
    const modal = document.getElementById('subInvoiceModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

/**
 * View sub-invoice images
 */
function viewSubInvoiceImages(shipmentId, invoiceIdx) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice?.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn phụ');
        return;
    }

    const images = shipment.hoaDon[invoiceIdx].subInvoice.anhHoaDon;

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = images.map((url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn phụ" onclick="window.open('${url}', '_blank')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteSubInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `).join('');
    }

    openModal('modalImageViewer');
}

/**
 * Delete sub-invoice image
 */
async function deleteSubInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find(s => s.id === shipmentId);
        if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice) {
            toast.error('Không tìm thấy hóa đơn phụ');
            return;
        }

        const subInvoice = shipment.hoaDon[invoiceIdx].subInvoice;
        if (!subInvoice.anhHoaDon || imageIndex >= subInvoice.anhHoaDon.length) {
            toast.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...subInvoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update subInvoice
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...shipment.hoaDon[invoiceIdx],
            subInvoice: {
                ...subInvoice,
                anhHoaDon: updatedImages
            }
        };

        // Update Firestore
        await db.collection('inventory_tracking').doc(shipmentId).update({
            hoaDon: updatedHoaDon,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewSubInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        toast.success('Đã xóa ảnh');
    } catch (error) {
        console.error('[RENDERER] Delete sub-invoice image error:', error);
        toast.error('Lỗi xóa ảnh: ' + error.message);
    }
}

console.log('[RENDERER] Table renderer initialized');
