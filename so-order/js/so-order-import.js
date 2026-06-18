// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — CSV/JSON import (Web2Import config + commit gom lô). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // ───────────────────────────────────────────────────────────────────
    // Import dữ liệu (CSV/JSON qua Web2Import) — gom dòng theo NCC + ngày +
    // đợt thành các LÔ MỚI trong tab đang mở. Reuse syncRowsToKho như submit.
    // ───────────────────────────────────────────────────────────────────
    SO._normImportDate = function _normImportDate(s) {
        s = String(s || '').trim();
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return '';
    };

    SO._soImportConfig = function _soImportConfig() {
        // 2026-06-16: 'ordered'/'Đã đặt' khai tử — import map về 'draft' (chặn tái
        // nhập trạng thái đã bỏ qua Excel). Chỉ "Nhận hàng" tạo received/partial.
        const STATUS_MAP = {
            nhap: 'draft',
            draft: 'draft',
            dadat: 'draft',
            ordered: 'draft',
            danhan: 'received',
            received: 'received',
            dahuy: 'cancelled',
            huy: 'cancelled',
            cancelled: 'cancelled',
        };
        const today = new Date().toISOString().slice(0, 10);
        return {
            title: 'Nhập Sổ Order',
            entityLabel: 'dòng order',
            fileBaseName: 'mau-so-order',
            columns: [
                {
                    key: 'supplier',
                    label: 'NCC',
                    type: 'string',
                    aliases: ['nha cung cap', 'ncc', 'supplier'],
                    hint: 'Nhà cung cấp — gom lô + sinh mã Kho',
                },
                {
                    key: 'date',
                    label: 'Ngày',
                    type: 'string',
                    aliases: ['ngay', 'date', 'ngay tao'],
                    hint: 'YYYY-MM-DD (trống = hôm nay)',
                },
                {
                    key: 'batch',
                    label: 'Đợt',
                    type: 'string',
                    aliases: ['dot', 'batch', 'lo'],
                    hint: 'VD: 1, 2A',
                },
                {
                    key: 'productName',
                    label: 'Tên sản phẩm',
                    required: true,
                    type: 'string',
                    aliases: ['ten san pham', 'ten', 'san pham', 'product', 'productname'],
                    hint: 'Bắt buộc',
                },
                {
                    key: 'variant',
                    label: 'Biến thể',
                    type: 'string',
                    aliases: ['bien the', 'variant'],
                    hint: 'VD: Trắng - M',
                },
                {
                    key: 'qty',
                    label: 'SL',
                    type: 'number',
                    aliases: ['so luong', 'sl', 'qty', 'quantity'],
                    hint: 'Số lượng',
                },
                {
                    key: 'costPrice',
                    label: 'Giá nhập',
                    type: 'number',
                    aliases: ['gia nhap', 'gia mua', 'cost', 'costprice'],
                    hint: 'Theo tiền tệ của tab',
                },
                {
                    key: 'sellPrice',
                    label: 'Giá bán',
                    type: 'number',
                    aliases: ['gia ban', 'sell', 'sellprice'],
                    hint: 'Theo tiền tệ của tab',
                },
                {
                    key: 'note',
                    label: 'Ghi chú',
                    type: 'string',
                    aliases: ['ghi chu', 'note'],
                },
                {
                    key: 'costNote',
                    label: 'Ghi chú CP',
                    type: 'string',
                    aliases: ['ghi chu cp', 'costnote', 'ghi chu chi phi'],
                },
                {
                    key: 'status',
                    label: 'Trạng thái',
                    type: 'enum',
                    aliases: ['trang thai', 'status'],
                    enumMap: STATUS_MAP,
                    enumValues: ['Nháp', 'Đã nhận', 'Đã hủy'],
                    hint: 'Mặc định Nháp',
                },
            ],
            sampleRows: [
                {
                    supplier: 'XƯỞNG A',
                    date: today,
                    batch: '1',
                    productName: 'ÁO SƠ MI',
                    variant: 'Trắng - M',
                    qty: 10,
                    costPrice: 45000,
                    sellPrice: 120000,
                    note: '',
                    costNote: '',
                    status: 'Nháp',
                },
                {
                    supplier: 'XƯỞNG A',
                    date: today,
                    batch: '1',
                    productName: 'CHÂN VÁY CHỮ A',
                    variant: 'Đen - S',
                    qty: 6,
                    costPrice: 60000,
                    sellPrice: 150000,
                    note: 'Hàng đẹp',
                    costNote: '',
                    status: 'Nháp',
                },
            ],
            onCommit: SO._commitSoImport,
        };
    };

    SO._commitSoImport = async function _commitSoImport(rows) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (!tab) {
            return {
                ok: 0,
                fail: rows.length,
                errors: [{ row: '', error: 'Không có tab đang mở' }],
            };
        }
        const today = new Date().toISOString().slice(0, 10);
        // Gom theo NCC + ngày + đợt → mỗi nhóm là 1 LÔ mới.
        const groups = new Map();
        for (const r of rows) {
            const supplier = (r.supplier || '').trim();
            const date = SO._normImportDate(r.date) || today;
            const batch = (r.batch || '').trim();
            const key = `${supplier}||${date}||${batch}`;
            if (!groups.has(key)) groups.set(key, { supplier, date, batch, items: [] });
            groups.get(key).items.push(r);
        }

        let ok = 0;
        let fail = 0;
        const errors = [];
        const suppliersSeen = new Set();
        for (const g of groups.values()) {
            try {
                const sh = window.SoOrderStorage.addShipment(SO.state, tab.id, {
                    date: g.date,
                    batch: g.batch,
                    caseCount: 0,
                    weightKg: 0,
                    contractAmount: 0,
                    contractCurrency: tab.currency || 'VND',
                });
                if (!sh) throw new Error('Không tạo được lô');
                const invoiceGroupId = `inv-imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
                const khoRows = [];
                for (const r of g.items) {
                    const productName = (r.productName || '').trim();
                    const variant = (r.variant || '').trim();
                    window.SoOrderStorage.addRow(SO.state, tab.id, sh.id, {
                        supplier: g.supplier,
                        productName,
                        variant,
                        qty: Number(r.qty) || 0,
                        sellPrice: Number(r.sellPrice) || 0,
                        costPrice: Number(r.costPrice) || 0,
                        note: (r.note || '').trim(),
                        costNote: (r.costNote || '').trim(),
                        status: r.status || 'draft',
                        invoiceGroupId,
                    });
                    khoRows.push({
                        productName,
                        variant,
                        qty: Number(r.qty) || 0,
                        sellPrice: Number(r.sellPrice) || 0,
                        costPrice: Number(r.costPrice) || 0,
                        supplier: g.supplier,
                        productImage: '',
                    });
                    ok++;
                }
                if (g.supplier && !suppliersSeen.has(g.supplier)) {
                    suppliersSeen.add(g.supplier);
                    SO._ensureSupplierAsync(g.supplier);
                }
                // Đối chiếu / tạo SP trong Kho (fire-and-forget, như submit thường).
                SO.syncRowsToKho(khoRows, tab, g.supplier).catch(() => {});
            } catch (e) {
                fail += g.items.length;
                errors.push({
                    row: '',
                    error: `Lô ${g.supplier || '(không NCC)'} ${g.date}: ${e.message}`,
                });
            }
        }
        SO.pushSync();
        SO.renderAll();
        return { ok, fail, errors };
    };
})();
