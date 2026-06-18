// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — config + status/KPI metadata + tiny DOM helpers ($/esc/notify/icons).
(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/web2-jt-tracking`;
    const LOTTIE_DIR = 'lottie';
    const DEFAULT_CELL = '8674';
    const APPROVE_TTL_DAYS = 7;

    // status → nhãn/màu/icon/lottie (đồng bộ với CSS tokens)
    const STATUS = {
        delivered: {
            label: 'Đã giao',
            icon: 'package-check',
            cls: 'delivered',
            hero: '#16a34a',
            lottie: 'success',
        },
        delivering: {
            label: 'Đang giao',
            icon: 'truck',
            cls: 'delivering',
            hero: '#2563eb',
            lottie: 'truck',
        },
        transit: {
            label: 'Trung chuyển',
            icon: 'route',
            cls: 'transit',
            hero: '#6366f1',
            lottie: 'truck',
        },
        returned: {
            label: 'Đã hoàn',
            icon: 'undo-2',
            cls: 'returned',
            hero: '#ea580c',
            lottie: null,
        },
        problem: {
            label: 'Vấn đề',
            icon: 'alert-triangle',
            cls: 'problem',
            hero: '#dc2626',
            lottie: null,
        },
        pending: {
            label: 'Chưa tra',
            icon: 'clock',
            cls: 'pending',
            hero: '#64748b',
            lottie: null,
        },
        not_found: {
            label: 'Không thấy',
            icon: 'search-x',
            cls: 'notfound',
            hero: '#b45309',
            lottie: null,
        },
    };
    const ST = (s) => STATUS[s] || STATUS.pending;

    const KPI_ORDER = [
        'total',
        'delivering',
        'transit',
        'returned',
        'problem',
        'delivered',
        'pending',
        'not_found',
        'approved',
    ];
    const KPI_META = {
        total: { label: 'Tất cả', accent: 'var(--jt-primary)' },
        delivering: { label: 'Đang giao', accent: 'var(--st-delivering)' },
        transit: { label: 'Trung chuyển', accent: 'var(--st-transit)' },
        returned: { label: 'Đã hoàn', accent: 'var(--st-returned)' },
        problem: { label: 'Vấn đề', accent: 'var(--st-problem)' },
        delivered: { label: 'Đã giao', accent: 'var(--st-delivered)' },
        pending: { label: 'Chưa tra', accent: 'var(--st-pending)' },
        not_found: { label: 'Không thấy', accent: 'var(--st-notfound)' },
        approved: { label: 'Đã duyệt', accent: '#0d9488' },
    };

    const $ = (id) => document.getElementById(id);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const notify = (m, t) => window.notificationManager?.show?.(m, t || 'info');
    const icons = () => window.lucide && lucide.createIcons();

    window.JtTrackingConst = {
        WORKER,
        API,
        LOTTIE_DIR,
        DEFAULT_CELL,
        APPROVE_TTL_DAYS,
        STATUS,
        ST,
        KPI_ORDER,
        KPI_META,
        $,
        esc,
        notify,
        icons,
    };
})();
