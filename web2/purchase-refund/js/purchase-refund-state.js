// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-state.js — namespace + constants + shared mutable state + utils.
// Trả hàng NCC. Nguồn shared state DUY NHẤT: window.PurchaseRefund (PR).
// CRUD generic qua /api/web2/purchase-refund/* + state machine qua
// /api/purchase-refund/:code/{approve|cancel-approve|refunded|reject}.
// SSE topic 'web2:purchase-refund' tự reload list khi server change state.

(function () {
    'use strict';

    // Internal coordination namespace (KHÔNG phải public API — chỉ để các module
    // <script> rời nhau tham chiếu state + helper dùng chung). Page KHÔNG expose
    // global nào khác; events đều wire qua addEventListener.
    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const GENERIC_API = `${WORKER}/api/web2/purchase-refund`;
    const SM_API = `${WORKER}/api/purchase-refund`; // state-machine endpoints

    const STATUS_LABEL = {
        draft: 'Nháp',
        sent: 'Đã gửi NCC',
        approved: 'NCC duyệt',
        refunded: 'NCC đã hoàn tiền',
        rejected: 'NCC từ chối',
        cancelled: 'Hủy',
    };
    const REASON_LABEL = {
        defect: 'Hàng lỗi / hỏng',
        wrong_item: 'Sai mã / sai SP',
        excess: 'Dư hàng',
        quality: 'Chất lượng kém',
        other: 'Khác',
    };
    const REFUND_METHOD_LABEL = {
        cash: 'Tiền mặt',
        bank: 'Chuyển khoản',
        debt_offset: 'Trừ công nợ',
        replace: 'Đổi hàng mới',
    };

    const HISTORY_ACTION_LABEL = {
        create: '📝 Tạo phiếu',
        approve: '✓ Duyệt + trừ kho',
        'cancel-approve': '↩ Hủy duyệt (trả tồn về)',
        refunded: '💰 NCC đã hoàn tiền',
        reject: '✗ NCC từ chối',
        update: '✎ Cập nhật',
    };

    // ---------- Shared mutable state (1 nguồn duy nhất) ----------
    const STATE = {
        items: [],
        selected: null,
        filterStatus: '',
        search: '',
        sseUnsub: null,
    };

    // Picker: chọn SP đã nhận hàng từ so-order
    const PICKER_STATE = {
        items: [], // (supplier, code) aggregates from so-order ∩ web2_products
        selectedCodes: new Set(),
        qtyOverrides: new Map(), // code → qty user nhập
        supplierFilter: '',
        search: '',
        onlyStock: true,
    };

    // Section A: hàng nhận từ Sổ Order
    const SOURCE_STATE = {
        items: [],
        groups: [], // [[item,...], ...] — gom theo ĐƠN (NCC+shipment), rebuild mỗi render
        search: '',
        supplierFilter: '',
        loaded: false,
    };

    // Quick Refund Modal
    const QUICK_STATE = {
        item: null, // current source item being refunded
    };

    // Bulk Refund Modal (trả cả đơn 1 lần)
    const BULK_STATE = {
        group: null, // array of source items (1 đơn)
    };

    const $ = (id) => document.getElementById(id);

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            console.log(`[${type || 'info'}] ${msg}`);
        }
    }
    function fmtMoney(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return Number(n || 0).toLocaleString('vi-VN') + '₫';
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('vi-VN');
        } catch {
            return iso;
        }
    }
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

    // Chỉ cho phép scheme ảnh an toàn (chặn javascript:/data:text/html…).
    function safeImageUrl(s) {
        s = String(s || '').trim();
        return /^(https:\/\/|http:\/\/|\/|data:image\/)/i.test(s) ? s : '';
    }
    // Thumbnail SP (ảnh từ Kho SP) — fallback icon khi thiếu/lỗi ảnh.
    // Ảnh thật click được → mở xem FULL (lightbox), data-full giữ URL gốc.
    function thumbHtml(imageUrl) {
        const src = safeImageUrl(imageUrl);
        if (src) {
            const e = escapeHtml(src);
            return `<img class="pr-thumb pr-thumb-zoom" src="${e}" data-full="${e}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="pr-thumb pr-thumb-ph" style="display:none;"><i data-lucide="image"></i></span>`;
        }
        return `<span class="pr-thumb pr-thumb-ph"><i data-lucide="image"></i></span>`;
    }

    // Lightbox xem ảnh SP full-size — DÙNG CHUNG Web2ImageLightbox (1 nguồn).
    // Fallback overlay cũ nếu module chưa load.
    function openImageLightbox(src) {
        if (!src) return;
        if (window.Web2ImageLightbox) {
            window.Web2ImageLightbox.open([src]);
            return;
        }
        let ov = document.getElementById('prImgOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'prImgOverlay';
            ov.className = 'pr-img-overlay';
            ov.hidden = true;
            ov.innerHTML = `<img alt="Ảnh sản phẩm"><button type="button" class="pr-img-close" aria-label="Đóng">×</button>`;
            ov.addEventListener('click', () => {
                ov.hidden = true;
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !ov.hidden) ov.hidden = true;
            });
            document.body.appendChild(ov);
        }
        ov.querySelector('img').src = src;
        ov.hidden = false;
    }

    // 2026-06-07: 1 "đơn" = 1 shipment/đợt trong Sổ Order. Group Section A +
    // picker theo (NCC + shipment) để SP tạo ở đợt khác nhau tách nhóm riêng,
    // kể cả cùng NCC. Header hiển thị NCC + đợt/ngày cho dễ phân biệt.
    function _orderGroupKey(it) {
        if (window.Web2SoOrderUtils) return window.Web2SoOrderUtils.orderGroupKey(it);
        return `${it.supplier}::${it.shipmentId || ''}`;
    }
    function _orderGroupLabel(it) {
        const parts = [];
        if (it.shipBatch) parts.push('Đợt ' + it.shipBatch);
        if (it.shipDate) parts.push(fmtDate(it.shipDate));
        return parts.join(' · ') || 'Đơn (chưa rõ đợt)';
    }

    /**
     * Lấy user hiện tại — delegate sang shared Web2UserInfo.
     * P1 2026-05-30: shared module thay cho per-page inline helper. Fallback
     * inline nếu Web2UserInfo chưa load (race condition).
     */
    function _currentUserInfo() {
        if (window.Web2UserInfo?.get) {
            return window.Web2UserInfo.get('purchase-refund');
        }
        // Fallback inline (rare race condition)
        let user = null;
        try {
            user = window.Web2Auth?.getStored?.()?.user || null;
        } catch {}
        if (!user) {
            try {
                user = window.AuthManager?.getCurrentUser?.() || null;
            } catch {}
        }
        if (!user) return { userId: null, userName: '(ẩn danh)', sourcePage: 'purchase-refund' };
        return {
            userId: user.id || user.uid || user.username || user.email || null,
            userName: user.displayName || user.username || user.email || '(ẩn danh)',
            sourcePage: 'purchase-refund',
        };
    }

    function fmtDateTime(ts) {
        if (!ts) return '—';
        try {
            return new Date(ts).toLocaleString('vi-VN');
        } catch {
            return String(ts);
        }
    }

    // Parse products từ JSON array hoặc multi-line text "code | name | qty | price"
    function parseProducts(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[')) {
                try {
                    const arr = JSON.parse(trimmed);
                    return Array.isArray(arr) ? arr : [];
                } catch {
                    return [];
                }
            }
            // Pipe-separated lines
            return trimmed
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const parts = line.split('|').map((s) => s.trim());
                    return {
                        code: parts[0] || '',
                        name: parts[1] || '',
                        qty: Number(parts[2] || 0),
                        price: Number(parts[3] || 0),
                    };
                })
                .filter((p) => p.code);
        }
        return [];
    }

    // ---------- Export vào namespace dùng chung ----------
    PR.const = {
        WORKER,
        GENERIC_API,
        SM_API,
        STATUS_LABEL,
        REASON_LABEL,
        REFUND_METHOD_LABEL,
        HISTORY_ACTION_LABEL,
    };
    PR.state = { STATE, PICKER_STATE, SOURCE_STATE, QUICK_STATE, BULK_STATE };
    PR.util = {
        $,
        notify,
        fmtMoney,
        fmtDate,
        fmtDateTime,
        escapeHtml,
        safeImageUrl,
        thumbHtml,
        openImageLightbox,
        _orderGroupKey,
        _orderGroupLabel,
        _currentUserInfo,
        parseProducts,
    };
})();
