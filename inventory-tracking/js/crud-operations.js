// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// CRUD OPERATIONS - INVENTORY TRACKING
// Migrated from Firestore SDK to REST API (api-client.js)
// =====================================================

/**
 * Create new shipment (dotHang entries for multiple NCCs)
 */
async function createShipment(data) {
    console.log('[CRUD] Creating shipment...', data);

    try {
        const ngayDiHang = data.ngayDiHang;

        // Process each invoice (hoaDon) and save via API
        // kienHang only on FIRST invoice to avoid duplication when grouped by date
        let isFirstInvoice = true;
        for (const invoice of (data.hoaDon || [])) {
            const sttNCC = parseInt(invoice.sttNCC, 10);
            if (!sttNCC) continue;

            const newDotHang = {
                id: generateId('dot'),
                sttNCC: sttNCC,
                ngayDiHang: ngayDiHang,
                tenNCC: invoice.tenNCC || '',
                kienHang: isFirstInvoice ? (data.kienHang || []) : [],
                tongKien: isFirstInvoice ? (data.tongKien || 0) : 0,
                tongKg: isFirstInvoice ? (data.tongKg || 0) : 0,
                sanPham: invoice.sanPham || [],
                tongTienHD: invoice.tongTienHD || 0,
                tongMon: invoice.tongMon || 0,
                soMonThieu: invoice.soMonThieu || 0,
                ghiChuThieu: invoice.ghiChuThieu || '',
                anhHoaDon: invoice.anhHoaDon || [],
                ghiChu: invoice.ghiChu || '',
                chiPhiHangVe: data.chiPhiHangVe || [],
                tongChiPhi: data.tongChiPhi || 0,
                ghiChuAdmin: data.ghiChuAdmin || ''
            };

            // Save via API
            const saved = await shipmentsApi.create(newDotHang);

            // Update local state
            const ncc = getNCCById(sttNCC) || await getOrCreateNCC(sttNCC);
            if (ncc) {
                if (!ncc.dotHang) ncc.dotHang = [];
                ncc.dotHang.push(pgToShipment(saved));
            }

            isFirstInvoice = false;
            console.log(`[CRUD] Created dotHang for NCC ${sttNCC}:`, newDotHang.id);
        }

        // Log edit history
        await logEditHistory('create', 'shipment', ngayDiHang, null, data);

        // Refresh flattened data
        flattenNCCData();

        window.notificationManager?.success('Đã tạo đợt hàng mới');
        return data;

    } catch (error) {
        console.error('[CRUD] Error creating shipment:', error);
        window.notificationManager?.error('Không thể tạo đợt hàng');
        throw error;
    }
}

/**
 * Update existing shipment/dotHang via API
 */
async function updateShipment(id, data) {
    console.log('[CRUD] Updating shipment...', id, data);

    try {
        const existingShipment = globalState.shipments.find(s => s.id === id);
        if (!existingShipment) {
            throw new Error('Shipment not found');
        }

        // kienHang only on first invoice to avoid duplication
        let isFirstUpdate = true;
        for (const invoice of (data.hoaDon || [])) {
            const sttNCC = parseInt(invoice.sttNCC, 10);
            if (!sttNCC) continue;

            const updateData = {
                ngayDiHang: data.ngayDiHang,
                tenNCC: invoice.tenNCC,
                kienHang: isFirstUpdate ? data.kienHang : [],
                tongKien: isFirstUpdate ? data.tongKien : 0,
                tongKg: isFirstUpdate ? data.tongKg : 0,
                sanPham: invoice.sanPham,
                tongTienHD: invoice.tongTienHD,
                tongMon: invoice.tongMon,
                soMonThieu: invoice.soMonThieu,
                ghiChuThieu: invoice.ghiChuThieu,
                anhHoaDon: invoice.anhHoaDon,
                ghiChu: invoice.ghiChu,
                chiPhiHangVe: data.chiPhiHangVe,
                tongChiPhi: data.tongChiPhi,
                ghiChuAdmin: data.ghiChuAdmin
            };

            const saved = await shipmentsApi.update(invoice.id, updateData);

            // Update local state
            const ncc = getNCCById(sttNCC);
            if (ncc) {
                const idx = (ncc.dotHang || []).findIndex(d => d.id === invoice.id);
                if (idx !== -1) {
                    ncc.dotHang[idx] = pgToShipment(saved);
                }
            }

            isFirstUpdate = false;
            console.log(`[CRUD] Updated dotHang for NCC ${sttNCC}:`, invoice.id);
        }

        await logEditHistory('update', 'shipment', id, existingShipment, data);
        flattenNCCData();

        window.notificationManager?.success('Đã cập nhật đợt hàng');
        return data;

    } catch (error) {
        console.error('[CRUD] Error updating shipment:', error);
        window.notificationManager?.error('Không thể cập nhật đợt hàng');
        throw error;
    }
}

/**
 * Delete shipment - removes all dotHang entries for the given date
 */
async function deleteShipment(id) {
    if (!confirm('Bạn có chắc muốn xóa đợt hàng này?')) {
        return false;
    }

    console.log('[CRUD] Deleting shipment...', id);

    try {
        const existingShipment = globalState.shipments.find(s => s.id === id);
        if (!existingShipment) {
            throw new Error('Shipment not found');
        }

        const dotHangIds = (existingShipment.hoaDon || []).map(hd => hd.id);

        // Delete each dotHang via API
        for (const dotId of dotHangIds) {
            await shipmentsApi.delete(dotId);

            // Remove from local state
            for (const ncc of globalState.nccList) {
                const idx = (ncc.dotHang || []).findIndex(d => d.id === dotId);
                if (idx !== -1) {
                    ncc.dotHang.splice(idx, 1);
                }
            }
        }

        await logEditHistory('delete', 'shipment', id, existingShipment, null);
        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();

        window.notificationManager?.success('Đã xóa đợt hàng');
        return true;

    } catch (error) {
        console.error('[CRUD] Error deleting shipment:', error);
        window.notificationManager?.error('Không thể xóa đợt hàng');
        throw error;
    }
}

/**
 * Delete a single invoice (dotHang) from shipment via API
 */
async function deleteInvoiceFromShipment(sttNCC, dotHangId) {
    try {
        await shipmentsApi.delete(dotHangId);

        // Update local state
        const ncc = getNCCById(sttNCC);
        if (ncc) {
            ncc.dotHang = (ncc.dotHang || []).filter(d => d.id !== dotHangId);
        }

        flattenNCCData();
        return true;

    } catch (error) {
        console.error('[CRUD] Error deleting invoice:', error);
        throw error;
    }
}

/**
 * Update shortage information for a dotHang via API
 */
async function updateDotHangShortage(sttNCC, dotHangId, shortageData) {
    try {
        const saved = await shipmentsApi.updateShortage(
            dotHangId,
            shortageData.soMonThieu || 0,
            shortageData.ghiChuThieu || ''
        );

        // Update local state
        const ncc = getNCCById(sttNCC);
        if (ncc) {
            const idx = (ncc.dotHang || []).findIndex(d => d.id === dotHangId);
            if (idx !== -1) {
                ncc.dotHang[idx] = pgToShipment(saved);
            }
        }

        flattenNCCData();
        return true;

    } catch (error) {
        console.error('[CRUD] Error updating shortage:', error);
        throw error;
    }
}

/**
 * Edit shipment (open modal)
 */
function editShipment(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        window.notificationManager?.error('Không tìm thấy đợt hàng');
        return;
    }

    if (typeof openShipmentModal === 'function') {
        openShipmentModal(shipment);
    }
}

/**
 * Update shortage (open modal)
 */
function updateShortage(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        window.notificationManager?.error('Không tìm thấy đợt hàng');
        return;
    }

    if (typeof openShortageModal === 'function') {
        openShortageModal(shipment);
    }
}

/**
 * Log edit history via API
 */
async function logEditHistory(action, type, id, oldData, newData) {
    try {
        await editHistoryApi.log(action, type, id || '', null, {
            oldData: oldData || null,
            newData: newData || null
        });
    } catch (error) {
        console.error('[CRUD] Error logging edit history:', error);
        // Don't throw - history logging should not break main operations
    }
}

/**
 * Delete a single product (STT) from an invoice
 */
async function deleteProductRow(invoiceId, productIdx) {
    // Find the dotHang in nccList
    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find(d => d.id === invoiceId);
        if (dot) { targetDot = dot; break; }
    }

    if (!targetDot) {
        window.notificationManager?.error('Không tìm thấy hóa đơn');
        return;
    }

    const products = targetDot.sanPham || [];
    if (productIdx < 0 || productIdx >= products.length) return;

    const product = products[productIdx];
    if (!confirm(`Xóa STT ${productIdx + 1} (${product.maSP || ''})? `)) return;

    try {
        // Remove product from array
        const newProducts = products.filter((_, i) => i !== productIdx);
        const newTongMon = newProducts.reduce((sum, p) => sum + (p.tongSoLuong || p.soLuong || 0), 0);
        const newTongTien = newProducts.reduce((sum, p) => sum + (p.thanhTien || 0), 0);

        await shipmentsApi.update(invoiceId, {
            sanPham: newProducts,
            tongMon: newTongMon,
            tongTienHD: newTongTien
        });

        // Update local state
        targetDot.sanPham = newProducts;
        targetDot.tongMon = newTongMon;
        targetDot.tongTienHD = newTongTien;

        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();

        window.notificationManager?.success(`Đã xóa STT ${productIdx + 1}`);
    } catch (error) {
        console.error('[CRUD] Error deleting product row:', error);
        window.notificationManager?.error('Không thể xóa: ' + error.message);
    }
}

/**
 * Delete an entire NCC invoice (dotHang)
 */
async function deleteNccInvoice(invoiceId) {
    // Find the dotHang
    let targetNcc = null;
    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find(d => d.id === invoiceId);
        if (dot) { targetNcc = ncc; targetDot = dot; break; }
    }

    if (!targetDot) {
        window.notificationManager?.error('Không tìm thấy hóa đơn');
        return;
    }

    if (!confirm(`Xóa toàn bộ NCC ${targetDot.sttNCC}?`)) return;

    try {
        await shipmentsApi.delete(invoiceId);

        // Remove from local state
        const idx = targetNcc.dotHang.findIndex(d => d.id === invoiceId);
        if (idx !== -1) targetNcc.dotHang.splice(idx, 1);

        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();

        window.notificationManager?.success(`Đã xóa NCC ${targetDot.sttNCC}`);
    } catch (error) {
        console.error('[CRUD] Error deleting NCC invoice:', error);
        window.notificationManager?.error('Không thể xóa: ' + error.message);
    }
}

// Expose functions globally for inline onclick handlers
window.deleteNccInvoice = deleteNccInvoice;
window.deleteProductRow = deleteProductRow;

console.log('[CRUD] CRUD operations initialized (API mode)');
