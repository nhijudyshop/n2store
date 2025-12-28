// =====================================================
// ORDER BOOKING RENDERER - INVENTORY TRACKING
// Render order bookings grouped by date
// =====================================================

/**
 * Render order bookings list grouped by date
 */
function renderOrderBookings(bookings) {
    const container = document.getElementById('orderBookingsContainer');
    const loadingState = document.getElementById('bookingLoadingState');
    const emptyState = document.getElementById('bookingEmptyState');

    if (!container) return;

    // Hide loading
    if (loadingState) loadingState.classList.add('hidden');

    // Clear previous content (except loading/empty states)
    const cards = container.querySelectorAll('.booking-card');
    cards.forEach(card => card.remove());

    // Show empty state if no data
    if (!bookings || bookings.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        updateBookingCount(0);
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Group bookings by ngayDatHang
    const groupedByDate = groupBookingsByDate(bookings);

    // Render each date group
    Object.keys(groupedByDate)
        .sort((a, b) => new Date(b) - new Date(a)) // Sort by date descending
        .forEach(date => {
            const card = createBookingDateCard(date, groupedByDate[date]);
            container.appendChild(card);
        });

    // Update count
    updateBookingCount(bookings.length);

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Group bookings by date
 */
function groupBookingsByDate(bookings) {
    const grouped = {};
    bookings.forEach(booking => {
        const date = booking.ngayDatHang || 'unknown';
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(booking);
    });
    return grouped;
}

/**
 * Create booking date card element
 */
function createBookingDateCard(date, bookings) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    card.dataset.date = date;

    // Count statuses
    const statusCounts = {
        pending: 0,
        received: 0,
        cancelled: 0
    };
    bookings.forEach(b => {
        const status = b.trangThai || 'pending';
        if (statusCounts[status] !== undefined) {
            statusCounts[status]++;
        }
    });

    // Build status summary
    const statusSummary = [];
    if (statusCounts.pending > 0) {
        statusSummary.push(`<span class="status-count status-pending-count">${statusCounts.pending} chờ giao</span>`);
    }
    if (statusCounts.received > 0) {
        statusSummary.push(`<span class="status-count status-received-count">${statusCounts.received} đã nhận</span>`);
    }
    if (statusCounts.cancelled > 0) {
        statusSummary.push(`<span class="status-count status-cancelled-count">${statusCounts.cancelled} đã hủy</span>`);
    }

    card.innerHTML = `
        <div class="booking-header">
            <div class="shipment-date-packages">
                <i data-lucide="calendar"></i>
                <span class="shipment-date-text">Ngày đặt: ${formatDateDisplay(date)}</span>
                <span class="shipment-separator">-</span>
                <span class="booking-count-badge">
                    <i data-lucide="shopping-cart"></i>
                    ${bookings.length} đơn đặt hàng
                </span>
                <div class="status-summary">
                    ${statusSummary.join('')}
                </div>
            </div>
        </div>
        <div class="booking-body">
            ${renderBookingInvoicesTable(bookings)}
        </div>
    `;

    return card;
}

/**
 * Render booking invoices table (similar to shipment but without cost columns)
 */
function renderBookingInvoicesTable(bookings) {
    if (bookings.length === 0) {
        return `
            <div class="shipment-section">
                <p style="color: var(--gray-500);">Chưa có đơn đặt hàng</p>
            </div>
        `;
    }

    const canEdit = permissionHelper?.can('edit_orderBooking');
    const canDelete = permissionHelper?.can('delete_orderBooking');
    const canUpdateStatus = permissionHelper?.can('update_orderBookingStatus');

    // Calculate totals
    const totalAmount = bookings.reduce((sum, b) => sum + (b.tongTienHD || 0), 0);
    const totalItems = bookings.reduce((sum, b) => {
        if (b.tongMon) return sum + b.tongMon;
        const products = b.sanPham || [];
        return sum + products.reduce((pSum, p) => pSum + (p.soLuong || 0), 0);
    }, 0);

    // Build rows
    const rows = bookings.map((booking, idx) => renderBookingRow(booking, idx, canEdit, canDelete, canUpdateStatus)).join('');

    return `
        <div class="shipment-section shipment-table-section">
            <div class="table-container">
                <table class="invoice-table invoice-table-bordered booking-table">
                    <thead>
                        <tr>
                            <th class="col-ncc">NCC</th>
                            <th class="col-products">Chi Tiết Sản Phẩm</th>
                            <th class="col-amount text-right">Tiền HĐ</th>
                            <th class="col-total text-center">Tổng Món</th>
                            <th class="col-image text-center">Ảnh</th>
                            <th class="col-note">Ghi Chú</th>
                            <th class="col-status text-center">Trạng Thái</th>
                            <th class="col-actions text-center">Thao Tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td class="text-right"><strong>TỔNG:</strong></td>
                            <td></td>
                            <td class="text-right"><strong class="total-amount">${formatNumber(totalAmount)}</strong></td>
                            <td class="text-center"><strong class="total-items">${formatNumber(totalItems)}</strong></td>
                            <td colspan="4"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render a single booking row
 */
function renderBookingRow(booking, idx, canEdit, canDelete, canUpdateStatus) {
    const products = booking.sanPham || [];
    const imageCount = booking.anhHoaDon?.length || 0;
    const status = booking.trangThai || 'pending';
    const statusConfig = ORDER_BOOKING_STATUS_CONFIG[status] || ORDER_BOOKING_STATUS_CONFIG.pending;

    // Check if this booking has comparison differences
    const hasDifference = booking.linkedShipmentId && booking.hasDifference;
    const rowClass = hasDifference ? 'has-difference' : '';
    const nccClass = hasDifference ? 'ncc-has-difference' : '';

    // Build product lines preview
    const isVietnamese = globalState.langMode === 'vi';
    let productPreview = '-';
    if (products.length > 0) {
        const firstProduct = products[0];
        if (isVietnamese) {
            productPreview = firstProduct.rawText_vi || translateToVietnamese(firstProduct.rawText || '') ||
                `${firstProduct.maSP || ''} ${translateToVietnamese(firstProduct.soMau || '')}`;
        } else {
            productPreview = firstProduct.rawText || `${firstProduct.maSP || ''} ${firstProduct.soMau || ''}`;
        }
        if (products.length > 1) {
            productPreview += ` <span class="more-products">+${products.length - 1} sản phẩm khác</span>`;
        }
    }

    // Calculate tongMon
    const tongMon = booking.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
    const tongTienHD = booking.tongTienHD || 0;

    // Status dropdown or badge
    const statusHtml = canUpdateStatus ? `
        <select class="status-select ${statusConfig.badgeClass}" onchange="updateBookingStatus('${booking.id}', this.value)">
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Đang chờ giao</option>
            <option value="received" ${status === 'received' ? 'selected' : ''}>Đã nhận hàng</option>
            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Đã hủy</option>
        </select>
    ` : `
        <span class="status-badge ${statusConfig.badgeClass}">
            <i data-lucide="${statusConfig.icon}"></i>
            ${statusConfig.label}
        </span>
    `;

    // NCC click handler for comparison
    const nccClickable = booking.linkedShipmentId;
    const nccClickHandler = nccClickable ? `onclick="showBookingComparison('${booking.id}')" style="cursor: pointer;" title="Click để xem so sánh"` : '';

    return `
        <tr class="${rowClass}" data-booking-id="${booking.id}">
            <td class="col-ncc ${nccClass}" ${nccClickHandler}>
                <strong>${booking.sttNCC || '-'}</strong>
                ${hasDifference ? '<span class="difference-indicator" title="Có chênh lệch">⚠️</span>' : ''}
                ${nccClickable && !hasDifference ? '<span class="linked-indicator" title="Đã liên kết">🔗</span>' : ''}
            </td>
            <td class="col-products">
                <span class="product-text">${productPreview}</span>
            </td>
            <td class="col-amount text-right">
                <strong class="amount-value">${formatNumber(tongTienHD)}</strong>
            </td>
            <td class="col-total text-center">
                <strong class="total-value">${formatNumber(tongMon)}</strong>
            </td>
            <td class="col-image text-center">
                ${imageCount > 0 ? `
                    <span class="image-count" onclick="viewBookingImages('${booking.id}')">
                        <i data-lucide="image"></i>
                        ${imageCount}
                    </span>
                ` : '-'}
            </td>
            <td class="col-note">
                ${booking.ghiChu ? `<span class="invoice-note-text">${booking.ghiChu}</span>` : ''}
            </td>
            <td class="col-status text-center">
                ${statusHtml}
            </td>
            <td class="col-actions text-center">
                <div class="action-buttons">
                    ${canEdit ? `
                        <button class="btn btn-sm btn-outline" onclick="editOrderBooking('${booking.id}')" title="Sửa">
                            <i data-lucide="edit"></i>
                        </button>
                    ` : ''}
                    ${canDelete ? `
                        <button class="btn btn-sm btn-outline btn-danger-outline" onclick="deleteOrderBooking('${booking.id}')" title="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

/**
 * View booking images
 */
function viewBookingImages(bookingId) {
    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking || !booking.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn');
        return;
    }

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = booking.anhHoaDon.map((url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn đặt hàng" onclick="window.open('${url}', '_blank')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteBookingImage('${bookingId}', ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `).join('');
    }

    if (modal) {
        modal.classList.add('active');
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Delete booking image
 */
async function deleteBookingImage(bookingId, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) return;

    try {
        const booking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!booking || !booking.anhHoaDon) return;

        // Remove image from array
        const updatedImages = [...booking.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update in Firestore
        await orderBookingsRef.doc(bookingId).update({
            anhHoaDon: updatedImages,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        booking.anhHoaDon = updatedImages;

        // Re-render image viewer
        viewBookingImages(bookingId);

        toast.success('Đã xóa ảnh');
    } catch (error) {
        console.error('Error deleting booking image:', error);
        toast.error('Lỗi khi xóa ảnh');
    }
}

/**
 * Update booking count display
 */
function updateBookingCount(count) {
    const countEl = document.getElementById('filterBookingCount');
    if (countEl) {
        countEl.textContent = `${count} đơn đặt hàng`;
    }
}

/**
 * Update booking status
 */
async function updateBookingStatus(bookingId, newStatus) {
    try {
        const booking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!booking) return;

        const oldStatus = booking.trangThai || 'pending';

        // If changing to "received", show link shipment modal
        if (newStatus === 'received' && oldStatus !== 'received') {
            showLinkShipmentModal(bookingId);
            return;
        }

        // Update in Firestore
        await orderBookingsRef.doc(bookingId).update({
            trangThai: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        booking.trangThai = newStatus;

        // Re-render
        renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);

        toast.success('Đã cập nhật trạng thái');
    } catch (error) {
        console.error('Error updating booking status:', error);
        toast.error('Lỗi khi cập nhật trạng thái');

        // Revert select value
        renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);
    }
}

/**
 * Show link shipment modal
 */
function showLinkShipmentModal(bookingId) {
    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) return;

    const modal = document.getElementById('modalLinkShipment');
    const body = document.getElementById('modalLinkShipmentBody');

    if (!modal || !body) return;

    // Find matching shipments (same NCC, similar date range)
    const matchingShipments = findMatchingShipments(booking);

    body.innerHTML = `
        <div class="link-shipment-content">
            <p class="link-info">
                <strong>Đơn đặt hàng:</strong> NCC ${booking.sttNCC} - Ngày ${formatDateDisplay(booking.ngayDatHang)}
            </p>
            <div class="form-group">
                <label>Chọn đợt hàng thực nhận để liên kết:</label>
                <select id="selectLinkShipment" class="form-input">
                    <option value="">-- Không liên kết --</option>
                    ${matchingShipments.map(s => `
                        <option value="${s.shipmentId}|${s.invoiceIdx}">
                            ${formatDateDisplay(s.ngayDiHang)} - NCC ${s.sttNCC} - ${formatNumber(s.tongTienHD)}đ
                        </option>
                    `).join('')}
                </select>
            </div>
            <p class="link-note">
                <i data-lucide="info"></i>
                Liên kết giúp so sánh số lượng/giá đặt vs thực nhận
            </p>
        </div>
    `;

    // Store booking id for confirmation
    modal.dataset.bookingId = bookingId;

    modal.classList.add('active');

    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Find matching shipments for linking
 */
function findMatchingShipments(booking) {
    const matches = [];

    globalState.shipments.forEach(shipment => {
        (shipment.hoaDon || []).forEach((invoice, idx) => {
            // Match by NCC number
            if (invoice.sttNCC === booking.sttNCC ||
                String(invoice.sttNCC) === String(booking.sttNCC)) {
                matches.push({
                    shipmentId: shipment.id,
                    invoiceIdx: idx,
                    ngayDiHang: shipment.ngayDiHang,
                    sttNCC: invoice.sttNCC,
                    tongTienHD: invoice.tongTienHD || invoice.tongTien || 0,
                    tongMon: invoice.tongMon || 0
                });
            }
        });
    });

    // Sort by date descending
    matches.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));

    return matches;
}

/**
 * Confirm link shipment
 */
async function confirmLinkShipment() {
    const modal = document.getElementById('modalLinkShipment');
    const select = document.getElementById('selectLinkShipment');

    if (!modal || !select) return;

    const bookingId = modal.dataset.bookingId;
    const selectedValue = select.value;

    try {
        const booking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!booking) return;

        let linkedShipmentId = null;
        let linkedInvoiceIdx = null;

        if (selectedValue) {
            const [shipmentId, invoiceIdx] = selectedValue.split('|');
            linkedShipmentId = shipmentId;
            linkedInvoiceIdx = parseInt(invoiceIdx, 10);
        }

        // Update in Firestore
        await orderBookingsRef.doc(bookingId).update({
            trangThai: 'received',
            linkedShipmentId: linkedShipmentId,
            linkedInvoiceIdx: linkedInvoiceIdx,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        booking.trangThai = 'received';
        booking.linkedShipmentId = linkedShipmentId;
        booking.linkedInvoiceIdx = linkedInvoiceIdx;

        // Check for differences if linked
        if (linkedShipmentId) {
            booking.hasDifference = checkBookingDifference(booking);
        }

        // Close modal
        modal.classList.remove('active');

        // Re-render
        renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);

        toast.success('Đã cập nhật trạng thái và liên kết');
    } catch (error) {
        console.error('Error linking shipment:', error);
        toast.error('Lỗi khi liên kết đợt hàng');
    }
}

/**
 * Check if booking has differences with linked shipment
 */
function checkBookingDifference(booking) {
    if (!booking.linkedShipmentId) return false;

    const shipment = globalState.shipments.find(s => s.id === booking.linkedShipmentId);
    if (!shipment || !shipment.hoaDon) return false;

    const invoice = shipment.hoaDon[booking.linkedInvoiceIdx];
    if (!invoice) return false;

    // Compare totals
    const bookingTotal = booking.tongTienHD || 0;
    const invoiceTotal = invoice.tongTienHD || invoice.tongTien || 0;
    if (bookingTotal !== invoiceTotal) return true;

    const bookingMon = booking.tongMon || 0;
    const invoiceMon = invoice.tongMon || 0;
    if (bookingMon !== invoiceMon) return true;

    // TODO: Compare product details
    return false;
}

/**
 * Show booking comparison modal
 */
function showBookingComparison(bookingId) {
    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking || !booking.linkedShipmentId) {
        toast.info('Đơn đặt hàng chưa được liên kết');
        return;
    }

    const shipment = globalState.shipments.find(s => s.id === booking.linkedShipmentId);
    if (!shipment) {
        toast.info('Không tìm thấy đợt hàng liên kết');
        return;
    }

    const invoice = shipment.hoaDon?.[booking.linkedInvoiceIdx];
    if (!invoice) {
        toast.info('Không tìm thấy hóa đơn liên kết');
        return;
    }

    // Show comparison modal
    if (window.showCompareModal) {
        showCompareModal(booking, invoice, shipment);
    }
}

// Initialize link shipment modal events
document.addEventListener('DOMContentLoaded', function() {
    // Close modal
    const btnCloseLinkShipment = document.getElementById('btnCloseLinkShipmentModal');
    const btnCancelLinkShipment = document.getElementById('btnCancelLinkShipment');
    const btnConfirmLinkShipment = document.getElementById('btnConfirmLinkShipment');
    const modal = document.getElementById('modalLinkShipment');

    if (btnCloseLinkShipment) {
        btnCloseLinkShipment.addEventListener('click', () => {
            modal?.classList.remove('active');
            // Revert status select if cancelled
            renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);
        });
    }

    if (btnCancelLinkShipment) {
        btnCancelLinkShipment.addEventListener('click', () => {
            modal?.classList.remove('active');
            // Revert status select if cancelled
            renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);
        });
    }

    if (btnConfirmLinkShipment) {
        btnConfirmLinkShipment.addEventListener('click', confirmLinkShipment);
    }

    // Close on overlay click
    const overlay = modal?.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            modal?.classList.remove('active');
            renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);
        });
    }
});

console.log('[ORDER-BOOKING-RENDERER] Loaded successfully');
