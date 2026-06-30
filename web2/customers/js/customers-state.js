// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse state/constants/utils. warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — STATE + CONSTANTS + UTILS.
// Nguyên tắc: 1 SĐT (10 số) = 1 KH (phone UNIQUE). 1 KH có thể nhiều FB
// account (fb_id/global_id + aliases). Đọc/ghi /api/web2/customers/* —
// ĐỘC LẬP. Realtime SSE web2:customers. UI-first qua Web2Optimistic.
//
// Module này là NGUỒN DUY NHẤT của state mutable chia sẻ giữa các module
// con (render / detail / events / app). Tất cả module gắn vào namespace
// nội bộ window.__wcApp (KHÔNG phải public API — file gốc không expose
// global nào). app.js là module CUỐI điều phối init.
// =====================================================================

(function () {
    'use strict';

    const NS = (window.__wcApp = window.__wcApp || {});

    const STATUS = {
        Normal: { label: 'Bình thường', cls: 'normal' },
        Bom: { label: 'Bom hàng', cls: 'bomb' },
        Warning: { label: 'Cảnh báo', cls: 'warning' },
        Danger: { label: 'Nguy hiểm', cls: 'danger' },
        VIP: { label: 'VIP', cls: 'vip' },
    };

    const state = {
        rows: [],
        total: 0,
        page: 1,
        limit: 50,
        search: '',
        status: '',
        source: '',
        loading: false,
        selected: new Set(),
        editing: null, // row đang sửa, null = tạo mới
    };

    // ─── DOM helpers ────────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const esc = (s) =>
        window.Web2Escape // 1 nguồn
            ? window.Web2Escape.escapeHtml(s)
            : String(s == null ? '' : s).replace(
                  /[&<>"']/g,
                  (c) =>
                      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
              );
    const fmtMoney = (n) =>
        window.Web2Format && window.Web2Format.vnd
            ? window.Web2Format.vnd(n)
            : (Number(n) || 0).toLocaleString('vi-VN') + '₫';
    const notify = (msg, type) => window.notificationManager?.show?.(msg, type || 'info');

    // Chuẩn hoá SĐT → 10 số đuôi (0xxxxxxxxx). Trả '' nếu không hợp lệ.
    const normPhone = (p) => {
        let s = String(p == null ? '' : p).replace(/\D/g, '');
        if (s.length > 10) s = s.slice(-10);
        if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
        return s.length === 10 ? s : '';
    };

    // ── Shared mutable state (đặt 1 nơi — module khác đọc/ghi qua NS) ──
    // SĐT phụ đang chỉnh trong modal (1 KH nhiều SĐT). phone chính tách riêng.
    NS.modalAltPhones = [];
    NS.modalAltAddresses = [];
    // SSE / reload timers
    NS._sseUnsub = null;
    NS._reloadTimer = null;
    // Pancake fallback rows + sequence guard
    NS._pancakeRows = [];
    NS._pancakeSeq = 0;

    // Constants + state + utils
    NS.STATUS = STATUS;
    NS.state = state;
    NS.$ = $;
    NS.esc = esc;
    NS.fmtMoney = fmtMoney;
    NS.notify = notify;
    NS.normPhone = normPhone;
})();
