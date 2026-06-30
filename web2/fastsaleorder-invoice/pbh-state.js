// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH state + constants + tiny utils (money/date/escape/notify/popup helpers).
// Central mutable state lives here (window.PbhState.STATE) — single source of truth.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const KPI_API = `${WORKER}/api/web2/kpi`;

    const STATE = {
        orders: [],
        total: 0,
        page: 1,
        limit: 200,
        state: '',
        search: '',
        // Phase 14: scope list to a single Customer 360 record (parsed from URL on init)
        customerId: null,
    };

    const $ = (s) => document.querySelector(s);
    const tbody = () => $('#pbhTbody');

    function fmtMoney(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtDate(s) {
        if (!s) return '';
        const d = new Date(s);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type || 'info');
        else if (type === 'error') window.Popup.error(msg);
        else console.log('[pbh]', msg);
    }
    // Promise-based confirm/alert/prompt helpers (shared Web 2.0 Popup module).
    function w2pConfirm(msg, opts) {
        return window.Popup.confirm(msg, opts);
    }
    function w2pAlert(msg, opts) {
        return window.Popup.alert(msg, opts);
    }
    function w2pPrompt(msg, opts) {
        return window.Popup.prompt(msg, opts);
    }

    // Model 2-state đơn giản: 'done' (Hoàn thành) + 'cancel' (Đã hủy).
    // Legacy 'draft'/'confirmed' từ row cũ vẫn render label cùng style với 'done'
    // để bảng không vỡ trong khi data migrate. Tab filter chỉ còn 2 option.
    const STATE_META = {
        draft: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        confirmed: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        done: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        cancel: { label: 'Đã hủy', cls: 'status-cancelled', icon: 'x' },
    };

    function stateBadge(s) {
        const m = STATE_META[s] || { label: s || '—', cls: '', icon: 'help-circle' };
        return `<span class="status-badge ${m.cls}"><i data-lucide="${m.icon}"></i>${m.label}</span>`;
    }

    window.PbhState = {
        WORKER,
        KPI_API,
        STATE,
        STATE_META,
        $,
        tbody,
        fmtMoney,
        fmtDate,
        escapeHtml,
        notify,
        w2pConfirm,
        w2pAlert,
        w2pPrompt,
        stateBadge,
    };
})();
