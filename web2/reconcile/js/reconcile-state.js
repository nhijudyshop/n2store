// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web 2.0 — Đối soát đóng gói PBH (Reconcile / Fulfillment).
// Stock đã trừ lúc tạo PBH → trang này CHỈ verify pick + state machine + audit log.
//
// reconcile-state.js — namespace nội bộ + state + constants + helpers + api().
// Tách module (MOVE-only) từ reconcile-app.js gốc; logic giữ nguyên byte-for-byte.
// Namespace RC là NỘI BỘ (không phải public API) — chỉ để các module <script> rời
// chia sẻ STATE + hàm với nhau (không có bundler). KHÔNG có window.* public nào.

(function () {
    'use strict';

    // Namespace nội bộ dùng chung giữa các module reconcile-*.js.
    const RC = (window.RC = window.RC || {});

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/reconcile`;
    RC.API = API;

    const STATE_LABELS = {
        pending: 'Chờ pick',
        picking: 'Đang pick',
        picked: 'Đã pick đủ',
        packed: 'Đã đóng gói',
        shipped: 'Đã giao shipper',
        delivered: 'Đã giao',
        cancelled: 'Huỷ',
    };
    RC.STATE_LABELS = STATE_LABELS;

    const STATE = {
        items: [],
        filterState: 'active',
        search: '',
        selectedNumber: null,
        currentPbh: null,
        historyHtml: null,
        historyOpen: false, // lịch sử ẩn mặc định, mở khi user bấm
    };
    RC.STATE = STATE;

    // PBH number pattern (2026-06-04 đổi HD→NJ, hợp nhất 1 mã/đơn): NJ-YYYYMMDD-NNNN
    // hoặc NJ-YYYYMMDD-NNNN-N (tách đơn). Quét barcode bill → switch PBH đó.
    // Vẫn nhận HD-... cũ cho data legacy.
    const PBH_NUMBER_RE = /^(NJ|HD)-\d{8}-\d{3,5}(-\d+)?$/;
    RC.PBH_NUMBER_RE = PBH_NUMBER_RE;

    // 2026-06-06: tích tay 1 line — checked = pick đủ (qty), unchecked = 0.
    // Lưu NGAY mỗi lần tích (không cần quét đủ cả đơn). Dùng cho SP barcode không quét được.
    // User 06/06: BẮT BUỘC confirm + ghi lịch sử "đối chiếu camera" — vì tích tay KHÔNG
    // quét barcode → cần xác nhận + lưu vết để soi lại camera khi đối chứng.
    const MANUAL_CAMERA_NOTE = 'Tích tay (không quét) — đối chiếu camera';
    RC.MANUAL_CAMERA_NOTE = MANUAL_CAMERA_NOTE;

    // 2026-06-06: hiển thị lịch sử đối soát chi tiết (ngày giờ + user + thao tác).
    // Mỗi lần quét / tích tay / đóng gói / giao đều ghi log server (pbh_fulfillment_logs)
    // → fetch /:number/logs và render qua Web2HistoryTimeline (timestamp vi-VN có giây).
    const RC_HISTORY_LABELS = {
        scan: '🔫 Quét mã',
        'manual-pick': '✋ Tích tay',
        'reset-pick': '↺ Reset pick',
        pack: '📦 Đóng gói',
        ship: '🚚 Giao shipper',
        deliver: '✅ Đã giao',
        'return-failed': '↩ Trả về kho',
    };
    RC.RC_HISTORY_LABELS = RC_HISTORY_LABELS;

    // ---------- helpers ----------
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s); // 1 nguồn
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtMoney(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return Number(n || 0).toLocaleString('vi-VN') + '₫';
    }
    function fmtTs(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function fmtDateInvoice(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    function fmtSttDisplay(item) {
        if (Array.isArray(item.mergedDisplayStt) && item.mergedDisplayStt.length > 1) {
            return item.mergedDisplayStt.join(' + ');
        }
        return item.displayStt != null ? String(item.displayStt) : '—';
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function feedback(msg, isError, isComplete) {
        const div = document.createElement('div');
        div.className =
            'rc-scan-feedback ' +
            (isError ? 'is-error' : isComplete ? 'is-complete' : 'is-success');
        div.textContent = msg;
        document.body.appendChild(div);
        // Complete (đã check xong) giữ lâu hơn cho dễ thấy.
        const hold = isComplete ? 2600 : 1500;
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transition = 'opacity 200ms';
            setTimeout(() => div.remove(), 200);
        }, hold);
    }
    function focusScanner() {
        const inp = document.getElementById('rcScannerInput');
        if (inp) inp.focus();
    }
    async function api(method, path, body) {
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                // AUTH (2026-06-20): /api/reconcile đã gate requireWeb2AuthSoft →
                // BẮT BUỘC x-web2-token, nếu không sẽ 401 "thiếu/sai token".
                ...((window.Web2Auth && window.Web2Auth.authHeaders()) || {}),
            },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(`${API}${path}`, opts);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    RC.escapeHtml = escapeHtml;
    RC.fmtMoney = fmtMoney;
    RC.fmtTs = fmtTs;
    RC.fmtDateInvoice = fmtDateInvoice;
    RC.fmtSttDisplay = fmtSttDisplay;
    RC.notify = notify;
    RC.feedback = feedback;
    RC.focusScanner = focusScanner;
    RC.api = api;
})();
