// =====================================================
// MODAL DETAIL SHIPPING - INVENTORY TRACKING
// Phase 4: Modal for viewing shipping cost details by date
// =====================================================

/**
 * Open shipping cost detail modal for a specific date
 * Shows all packages and shipping costs from shipments on that date
 */
function openShippingDetailModal(ngay) {
    const modal = document.getElementById('modalShippingDetail');
    const title = document.getElementById('modalShippingDetailTitle');
    const body = document.getElementById('modalShippingDetailBody');

    if (title) {
        title.textContent = `Chi Tiet Chi Phi Hang Ve - ${formatDateDisplay(ngay)}`;
    }

    // Get all shipments for this date
    const shipments = globalState.shipments.filter(s => s.ngayDiHang === ngay);

    if (body) {
        body.innerHTML = renderShippingDetailTable(shipments, ngay);
    }

    openModal('modalShippingDetail');

    if (window.lucide) lucide.createIcons();
}

/**
 * Render shipping cost detail table
 */
function renderShippingDetailTable(shipments, ngay) {
    if (shipments.length === 0) {
        return '<p class="text-center">Khong co dot hang nao</p>';
    }

    let totalCost = 0;
    let totalPackages = 0;
    let totalWeight = 0;

    const rows = shipments.map(shipment => {
        const packages = shipment.kien || [];
        const cost = shipment.chiPhiHangVe || 0;
        const weight = packages.reduce((sum, k) => sum + (k.soKy || 0), 0);

        totalCost += cost;
        totalPackages += packages.length;
        totalWeight += weight;

        return `
            <tr>
                <td>${packages.length} kien</td>
                <td>
                    ${packages.map(k => `${k.soKy || 0}kg`).join(', ') || '-'}
                </td>
                <td class="text-right">${formatWeight(weight)}</td>
                <td class="text-right">${formatCurrency(cost)}</td>
                <td>${shipment.ghiChu || ''}</td>
                ${hasPermission('edit_shipping_from_finance') ? `
                    <td class="text-center">
                        <button class="btn-icon" onclick="editShippingFromDetail('${shipment.id}')">
                            <i data-lucide="pencil"></i>
                        </button>
                    </td>
                ` : ''}
            </tr>
        `;
    }).join('');

    return `
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>So kien</th>
                    <th>Chi tiet ky</th>
                    <th class="text-right">Tong ky</th>
                    <th class="text-right">Chi phi</th>
                    <th>Ghi chu</th>
                    ${hasPermission('edit_shipping_from_finance') ? '<th class="text-center">Sua</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
            <tfoot>
                <tr>
                    <td><strong>${totalPackages} kien</strong></td>
                    <td></td>
                    <td class="text-right"><strong>${formatWeight(totalWeight)}</strong></td>
                    <td class="text-right"><strong>${formatCurrency(totalCost)}</strong></td>
                    <td colspan="${hasPermission('edit_shipping_from_finance') ? '2' : '1'}"></td>
                </tr>
            </tfoot>
        </table>
    `;
}

/**
 * Format weight display
 */
function formatWeight(weight) {
    return weight ? `${weight.toFixed(1)} kg` : '0 kg';
}

/**
 * Edit shipping cost from detail modal
 */
function editShippingFromDetail(shipmentId) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        toast.error('Khong tim thay dot hang');
        return;
    }

    closeModal('modalShippingDetail');

    // Open edit shipment modal focusing on shipping cost
    if (typeof openShipmentModal === 'function') {
        openShipmentModal(shipment, 'shipping');
    }
}

console.log('[MODAL] Shipping detail modal initialized');
