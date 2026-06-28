// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — central namespace + shared mutable state. Tất cả module so-order-*.js
// gắn function/biến chung vào window.SoOrder (alias `SO`). Refactor MOVE-only từ
// so-order-app.js (5931 dòng) — KHÔNG đổi hành vi runtime.
//
// Mọi state có thể bị GÁN LẠI (state, editingRowId, modalRows, …) sống TRỰC TIẾP
// trên window.SoOrder để mọi module thấy cùng 1 giá trị (closure cũ dùng `let`
// module-scope; tách file thì phải dùng object chung). Constant/object cố định
// cũng đặt trên namespace để chia sẻ.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // ---------- shared constants ----------
    SO.COLUMNS = [
        { key: 'supplier', label: 'NCC' },
        { key: 'stt', label: 'STT' },
        { key: 'productName', label: 'Tên SP' },
        { key: 'variant', label: 'Biến Thể' },
        { key: 'qty', label: 'SL' },
        { key: 'sellPrice', label: 'Giá Bán' },
        { key: 'costPrice', label: 'Giá Nhập' },
        { key: 'productImage', label: 'Ảnh SP' },
        { key: 'invoiceImage', label: 'Ảnh Hóa Đơn' },
        { key: 'note', label: 'Ghi Chú' },
        // 2026-06-28: BỎ cột "Ghi Chú CP" (costNote per-SP) — thay bằng feature
        // "Chi phí đợt" (expenses, mỗi dòng có amount + note riêng) trong modal Sửa
        // lô. Data costNote cũ giữ nguyên trên row (không xoá) nhưng không render.
        { key: 'status', label: 'Trạng Thái' },
        // Cột "Thao Tác" (sửa/xoá per-row) đã bỏ 2026-06-16 — trùng chức năng với
        // các nút trên header lô (✏️ sửa lô / 🗑️ xoá lô / ➕ thêm dòng) + sửa ô
        // inline (double-click). Sửa/xoá 1 dòng lẻ: dùng modal "Sửa lô".
    ];

    // 2026-06-16: status KHÔNG cho đổi tay nữa — chỉ auto-flow draft → (partial_received
    // | received) qua nút "Nhận hàng". 'ordered' (Đã Đặt) đã KHAI TỬ (nợ NCC phát sinh
    // khi NHẬN HÀNG, không phải lúc đặt). Legacy row 'ordered' → normalize về 'draft'.
    SO.STATUS_LABELS = {
        draft: 'Nháp',
        partial_received: 'Nhận 1 phần',
        received: 'Đã Nhận',
        cancelled: 'Đã Hủy',
    };

    // ---------- shared mutable state ----------
    SO.state = null;
    SO.editingRowId = null;
    SO.editingShipmentId = null;
    SO.editingTabId = null;
    // 2026-06-16: invoiceGroupId của ĐƠN đang sửa — để populate + lưu giảm giá/ship
    // per-đơn. null khi tạo mới (chưa có group).
    SO.editingInvoiceGroupId = null;
    // Inline cell edit state (per-cell dblclick mode) — track ô đang edit
    // để 2 lần dblclick nhanh không clobber input đang gõ.
    SO.inlineCellEditingKey = null; // `${rowId}|${field}`

    // Whole-table edit toggle. Khi BẬT, mọi ô editable render thành input/select
    // sẵn để gõ nhanh nhiều ô liên tục. Khi TẮT vẫn double-click ô để sửa lẻ.
    // Per-device preference → tách khỏi state đồng bộ Firestore.
    SO.EDIT_TABLE_MODE_KEY = 'soOrder_editTableMode_v1';
    SO.editTableMode = (() => {
        try {
            return localStorage.getItem(SO.EDIT_TABLE_MODE_KEY) === 'true';
        } catch {
            return false;
        }
    })();

    // Inline image modal state — track row đang sửa ảnh nào.
    SO.inlineImageCtx = null; // { rowId, shipmentId, field, currentUrl }
    // Multi-row modal state. Each entry is { uid, productName, variant, qty,
    // costPrice, sellPrice, productImage, invoiceImage, matchedCode }.
    // `matchedCode` is set when the user picks a suggestion or the typed
    // name exactly matches an existing kho SP.
    SO.modalRows = [];
    SO.modalRowCounter = 0;
    // 2026-06-16: Ảnh hóa đơn là của CẢ ĐƠN (không phải từng SP) → 1 ô ở header
    // modal thay vì cột per-row. Giá trị này được "đổ" xuống MỌI row khi lưu (các
    // row cùng đơn share invoiceGroupId → cell merged rowspan ở bảng chính).
    SO.modalInvoiceImage = '';
    SO.modalMode = 'create'; // 'create' (multi-row) | 'edit' (single-row)
    // NCC mặc định cho SP MỚI thêm khi đang sửa lô (edit-shipment). Set =
    // NCC phổ biến nhất của lô lúc mở modal. Per-row vẫn override được.
    SO._editShipDefaultSupplier = '';
    SO.activeSuggestUid = null;

    // Web 2.0 auth header helper — token qua header x-web2-token (không cần cookie).
    SO._w2Auth = function _w2Auth(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    };
})();
