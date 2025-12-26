// =====================================================
// EXPORT - INVENTORY TRACKING
// Phase 6: Export data to Excel based on permissions
// =====================================================

/**
 * Export shipments to Excel
 */
async function exportToExcel() {
    if (!hasPermission('export_data')) {
        toast.error('Ban khong co quyen xuat file');
        return;
    }

    try {
        toast.loading('Dang tao file Excel...');

        const { filteredShipments } = globalState;
        const canExportFinance = hasPermission('tab_congNo');

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Sheet 1: Shipments
        const shipmentsData = buildShipmentsExportData(filteredShipments, canExportFinance);
        const ws1 = XLSX.utils.aoa_to_array(shipmentsData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Theo Doi Nhap Hang');

        // Sheet 2: Finance (if has permission)
        if (canExportFinance) {
            const financeData = buildFinanceExportData();
            const ws2 = XLSX.utils.aoa_to_array(financeData);
            XLSX.utils.book_append_sheet(wb, ws2, 'Cong No');
        }

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `inventory_tracking_${dateStr}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);

        toast.success('Da xuat file Excel');

    } catch (error) {
        console.error('[EXPORT] Error:', error);
        toast.error('Khong the xuat file');
    }
}

/**
 * Build shipments export data
 */
function buildShipmentsExportData(shipments, includeFinance) {
    const headers = [
        'Ngay Di Hang',
        'So Kien',
        'Tong Ky',
        'STT NCC',
        'Ma SP',
        'So Mau',
        'So Luong',
        'Don Gia',
        'Thanh Tien',
        'Tong Mon',
        'So Mon Thieu',
    ];

    if (includeFinance) {
        headers.push('Chi Phi Hang Ve', 'Ghi Chu');
    }

    const rows = [headers];

    shipments.forEach(shipment => {
        const packages = shipment.kien || [];
        const totalWeight = packages.reduce((sum, k) => sum + (k.soKy || 0), 0);

        (shipment.hoaDon || []).forEach((hd, hdIndex) => {
            (hd.sanPham || []).forEach((sp, spIndex) => {
                const row = [
                    hdIndex === 0 && spIndex === 0 ? formatDateDisplay(shipment.ngayDiHang) : '',
                    hdIndex === 0 && spIndex === 0 ? packages.length : '',
                    hdIndex === 0 && spIndex === 0 ? totalWeight : '',
                    spIndex === 0 ? hd.sttNCC : '',
                    sp.maSP || sp.rawText || '',
                    sp.soMau || '',
                    sp.soLuong || '',
                    sp.giaDonVi || '',
                    sp.thanhTien || '',
                    spIndex === 0 ? hd.tongMon : '',
                    spIndex === 0 ? (hd.soMonThieu || '') : '',
                ];

                if (includeFinance) {
                    row.push(
                        hdIndex === 0 && spIndex === 0 ? (shipment.chiPhiHangVe || '') : '',
                        hdIndex === 0 && spIndex === 0 ? (shipment.ghiChu || '') : ''
                    );
                }

                rows.push(row);
            });
        });
    });

    return rows;
}

/**
 * Build finance export data
 */
function buildFinanceExportData() {
    const headers = [
        'Ngay',
        'Loai',
        'Mo Ta',
        'Thu (+)',
        'Chi (-)',
        'Ghi Chu'
    ];

    const rows = [headers];
    const transactions = buildTransactionsList();

    transactions.forEach(tx => {
        rows.push([
            formatDateDisplay(tx.ngay),
            getTransactionTypeLabel(tx.type),
            tx.moTa || '',
            tx.isPositive ? tx.soTien : '',
            !tx.isPositive ? tx.soTien : '',
            tx.ghiChu || ''
        ]);
    });

    // Add summary row
    const balance = calculateBalance();
    rows.push([]);
    rows.push(['', '', 'TONG CONG', balance.tongThu, balance.tongChi, '']);
    rows.push(['', '', 'CON LAI', '', '', balance.conLai]);

    return rows;
}

/**
 * Get transaction type label
 */
function getTransactionTypeLabel(type) {
    const labels = {
        [TRANSACTION_TYPES.PREPAYMENT]: 'Thanh toan truoc',
        [TRANSACTION_TYPES.INVOICE]: 'Tien hoa don',
        [TRANSACTION_TYPES.SHIPPING_COST]: 'Chi phi hang ve',
        [TRANSACTION_TYPES.OTHER_EXPENSE]: 'Chi phi khac'
    };
    return labels[type] || type;
}

/**
 * Export single shipment details
 */
function exportShipmentDetail(shipmentId) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        toast.error('Khong tim thay dot hang');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // Build detail data
        const data = buildShipmentDetailData(shipment);
        const ws = XLSX.utils.aoa_to_array(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiet');

        const filename = `shipment_${shipment.ngayDiHang}_${shipmentId}.xlsx`;
        XLSX.writeFile(wb, filename);

        toast.success('Da xuat chi tiet');

    } catch (error) {
        console.error('[EXPORT] Error:', error);
        toast.error('Khong the xuat file');
    }
}

/**
 * Build single shipment detail data
 */
function buildShipmentDetailData(shipment) {
    const rows = [];

    // Header info
    rows.push(['THONG TIN DOT HANG']);
    rows.push(['Ngay di hang:', formatDateDisplay(shipment.ngayDiHang)]);
    rows.push([]);

    // Packages
    rows.push(['DANH SACH KIEN']);
    rows.push(['STT', 'So Ky']);
    (shipment.kien || []).forEach((k, i) => {
        rows.push([i + 1, k.soKy]);
    });
    rows.push([]);

    // Invoices
    rows.push(['DANH SACH HOA DON']);
    (shipment.hoaDon || []).forEach(hd => {
        rows.push([`NCC ${hd.sttNCC}`, '', `Tong: ${hd.tongTienHD}`, `${hd.tongMon} mon`]);
        rows.push(['Ma SP', 'So Mau', 'SL', 'Don Gia', 'Thanh Tien']);
        (hd.sanPham || []).forEach(sp => {
            rows.push([sp.maSP || sp.rawText, sp.soMau, sp.soLuong, sp.giaDonVi, sp.thanhTien]);
        });
        rows.push([]);
    });

    return rows;
}

console.log('[EXPORT] Export initialized');
