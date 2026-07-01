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

    // Cách hàng về (semantics 2026-07-01): khach_gui = khách TỚI SHOP trả trực tiếp →
    // +kho thật ngay; shipper_gui = shipper hoàn HOẶC khách gửi BƯU ĐIỆN → +kho thu về,
    // chờ duyệt. (Nhãn "khách gửi" cũ gây nhầm: gửi bưu điện phải chờ duyệt, không tức thì.)
    const METHOD_LABEL = { khach_gui: 'Khách tới shop', shipper_gui: 'Shipper/Bưu điện' };
    const REASON_LABEL = {
        khach_boom: 'Khách boom',
        khong_lien_lac: 'Không liên lạc được',
        sai_dia_chi: 'Sai địa chỉ',
        doi_y: 'Đổi ý',
        hang_loi: 'Hàng lỗi',
        giao_sai: 'Giao sai SP',
        hu_van_chuyen: 'Hư khi vận chuyển',
        khac: 'Khác',
        tinh_sai_ship: 'Tính sai ship',
        tru_cong_no_khach: 'Trừ công nợ khách',
        giam_gia_le_tien: 'Giảm giá/Lẻ tiền',
        khach_nhan_1_phan: 'Khách nhận 1 phần',
        tra_hang_don_cu: 'Trả hàng đơn cũ',
    };
    const STOCK_LABEL = { applied: 'Đã vào kho thật', pending: 'Chờ duyệt', approved: 'Đã duyệt' };
    const DISPO_LABEL = {
        nhap_ban: 'Nhập lại bán được',
        giu_rieng: 'Hàng lỗi — giữ riêng (không +kho)',
        huy: 'Huỷ / bỏ (không +kho)',
    };
    const REFUND_LABEL = {
        vi: 'Cộng ví khách',
        cong_no: 'Trừ công nợ khách',
        tien_mat: 'Tiền mặt (ghi nhận)',
        ck: 'Chuyển khoản (ghi nhận)',
    };
    // Lý do "Vấn đề khách" theo cách hàng về.
    const KHACH_REASONS_FULL = ['khach_boom', 'khong_lien_lac', 'sai_dia_chi', 'doi_y', 'khac'];
    const KHACH_REASONS_KHACHGUI = ['doi_y', 'khac']; // KH chủ động gửi → chỉ đổi ý/khác

    // ============ KỊCH BẢN (scenario-first) ============
    // 1 kịch bản = 1 nghiệp vụ thật, tự set method/issue/subType + cờ hiển thị field.
    // Thay bộ ba radio method×issue×subType (dễ nhầm) bằng danh sách phẳng.
    const SCENARIOS = {
        boom_ca_don: {
            label: 'Boom / không nhận cả đơn',
            desc: 'Khách bom, từ chối nhận — hoàn cả đơn',
            icon: 'package-x',
            method: 'shipper_gui',
            issue: 'van_de_khach',
            subType: 'khong_nhan_hang',
            reasons: ['khach_boom', 'khong_lien_lac', 'sai_dia_chi', 'khac'],
            needsSourceOrder: true,
            allowMethodToggle: true,
            showShipFee: true,
            defaultFeeBearer: 'khach',
        },
        nhan_thieu: {
            label: 'Nhận thiếu (thu 1 phần)',
            desc: 'Khách chỉ lấy 1 phần, trả lại vài món',
            icon: 'package-minus',
            method: 'shipper_gui',
            issue: 'van_de_khach',
            subType: 'thu_ve_1_phan',
            reasons: ['doi_y', 'khong_lien_lac', 'khac'],
            needsSourceOrder: true,
            needsItemPick: true,
            allowMethodToggle: true,
            showRefundMethod: true,
        },
        doi_hang: {
            label: 'Đổi hàng / đổi size',
            desc: 'Trả món cũ + lấy món khác, bù chênh lệch',
            icon: 'repeat',
            method: 'khach_gui',
            issue: 'van_de_khach',
            subType: 'thu_ve_1_phan',
            isExchange: true,
            reasons: ['doi_y', 'khac'],
            needsSourceOrder: true,
            needsItemPick: true,
            needsReplacement: true,
            allowMethodToggle: true,
        },
        hang_loi: {
            label: 'Hàng lỗi / giao sai / hư',
            desc: 'Hàng lỗi — KHÔNG nhập lại kho bán',
            icon: 'alert-octagon',
            method: 'khach_gui',
            issue: 'van_de_khach',
            subType: 'thu_ve_1_phan',
            reasons: ['hang_loi', 'giao_sai', 'hu_van_chuyen'],
            needsSourceOrder: true,
            needsItemPick: true,
            allowMethodToggle: true,
            defaultDisposition: 'giu_rieng',
            showDisposition: true,
            showRefundMethod: true,
            showShipFee: true,
            defaultFeeBearer: 'shop',
        },
        khong_don_goc: {
            label: 'Thu về không đơn gốc',
            desc: 'Kiện về không truy được đơn — chỉ +kho',
            icon: 'help-circle',
            method: 'khach_gui',
            issue: 'van_de_khach',
            subType: 'thu_ve_1_phan',
            reasons: ['doi_y', 'hang_loi', 'khac'],
            needsSourceOrder: false,
            needsManualItems: true,
            showDisposition: true,
        },
        sua_cod: {
            label: 'Sửa COD (shipper)',
            desc: 'Shipper gọi điều chỉnh COD',
            icon: 'wallet',
            method: 'shipper_gui',
            issue: 'van_de_shipper',
            subType: 'cod_shipper',
            needsSourceOrder: true,
            isCod: true,
        },
    };

    const STATE = {
        tab: 'create',
        customer: null, // {phone, name, customerId}
        scenario: 'boom_ca_don',
        method: 'shipper_gui',
        issue: 'van_de_khach',
        subType: 'khong_nhan_hang',
        reason: 'khach_boom',
        reasonShip: 'tinh_sai_ship',
        disposition: 'nhap_ban',
        refundMethod: 'vi',
        customerBear: 0,
        shipFee: 0,
        feeBearer: null,
        replacements: [], // [{productCode,productName,price,qty}] SP đổi lấy (đổi hàng)
        sourceOrder: null, // {code,type,totalAmount,items,walletDeducted,cod,ship}
        lines: [], // [{productCode,productName,price,maxQty,qty,checked}] cho thu_ve_1_phan/cả đơn
        codReduction: 0,
        walletBalance: 0,
        list: [],
        pending: [],
        listFilter: { chip: 'all', from: '', to: '' },
        _custTimer: null,
        _repTimer: null,
        _orphanTimer: null,
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
        DISPO_LABEL,
        REFUND_LABEL,
        KHACH_REASONS_FULL,
        KHACH_REASONS_KHACHGUI,
        SCENARIOS,
        STATE,
    };
})();
