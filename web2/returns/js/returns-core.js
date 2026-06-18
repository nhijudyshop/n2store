// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — CORE: shared state + constants + tiny utils.
// Nguồn DUY NHẤT của STATE (shared mutable). Mọi module khác đọc/ghi qua
// window.ReturnsCore.STATE — KHÔNG duplicate state ở nơi khác.
// =====================================================================
(function () {
    'use strict';

    const api = window.Web2ReturnsApi;
    const fmt = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const $ = (id) => document.getElementById(id);
    const toast = (msg, type = 'success') => {
        try {
            window.notificationManager?.show?.(msg, type);
        } catch {}
    };

    const METHOD_LABEL = { khach_gui: 'Khách gửi', shipper_gui: 'Shipper gửi' };
    const REASON_LABEL = {
        khach_boom: 'Khách boom',
        khong_lien_lac: 'Không liên lạc được',
        sai_dia_chi: 'Sai địa chỉ',
        doi_y: 'Đổi ý',
        khac: 'Khác',
        tinh_sai_ship: 'Tính sai ship',
        tru_cong_no_khach: 'Trừ công nợ khách',
        giam_gia_le_tien: 'Giảm giá/Lẻ tiền',
        khach_nhan_1_phan: 'Khách nhận 1 phần',
        tra_hang_don_cu: 'Trả hàng đơn cũ',
    };
    const STOCK_LABEL = { applied: 'Đã vào kho thật', pending: 'Chờ duyệt', approved: 'Đã duyệt' };
    // Lý do "Vấn đề khách" theo cách hàng về.
    const KHACH_REASONS_FULL = ['khach_boom', 'khong_lien_lac', 'sai_dia_chi', 'doi_y', 'khac'];
    const KHACH_REASONS_KHACHGUI = ['doi_y', 'khac']; // KH chủ động gửi → chỉ đổi ý/khác

    const STATE = {
        tab: 'create',
        customer: null, // {phone, name, customerId}
        method: 'shipper_gui',
        issue: 'van_de_khach',
        subType: 'thu_ve_1_phan',
        reason: 'khach_boom',
        reasonShip: 'tinh_sai_ship',
        sourceOrder: null, // {code,type,totalAmount,items,walletDeducted,cod,ship}
        lines: [], // [{productCode,productName,price,maxQty,qty,checked}] cho thu_ve_1_phan/cả đơn
        codReduction: 0,
        walletBalance: 0,
        list: [],
        pending: [],
        _custTimer: null,
    };

    window.ReturnsCore = {
        api,
        fmt,
        esc,
        $,
        toast,
        METHOD_LABEL,
        REASON_LABEL,
        STOCK_LABEL,
        KHACH_REASONS_FULL,
        KHACH_REASONS_KHACHGUI,
        STATE,
    };
})();
