// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Chấm công: API client.
// =====================================================================
// Fetch wrapper (x-web2-token) cho /api/web2-attendance + lấy NV web2_users.
// Base-URL từ WEB2_CONFIG (nguồn duy nhất). KHÔNG hardcode literal khác.
// =====================================================================

(function (global) {
    'use strict';

    const cfg = global.WEB2_CONFIG || {};
    const WORKER =
        cfg.WORKER_URL ||
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER + '/api/web2-attendance';
    const USERS_BASE = WORKER + '/api/web2-users';

    function AUTHH(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    async function call(base, path, opts = {}) {
        const res = await fetch(base + path, {
            method: opts.method || 'GET',
            headers: AUTHH(opts.body ? { 'Content-Type': 'application/json' } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const j = await res.json().catch(() => ({ success: false, error: 'Phản hồi lỗi' }));
        if (!res.ok || !j.success) throw new Error(j.error || 'HTTP ' + res.status);
        return j;
    }
    const api = (path, opts) => call(BASE, path, opts);

    global.ChamCongApi = {
        BASE,
        // Device users (NV máy)
        listDeviceUsers: () => api('/device-users'),
        patchDeviceUser: (id, body) =>
            api('/device-users/' + encodeURIComponent(id), { method: 'PATCH', body }),
        createDeviceUser: (body) => api('/device-users', { method: 'POST', body }),
        deleteDeviceUser: (id) =>
            api('/device-users/' + encodeURIComponent(id), { method: 'DELETE' }),
        // NV web 2.0 (để gán vào PIN)
        listEmployees: () =>
            call(USERS_BASE, '/list?limit=500&includeInactive=0')
                .then((j) => j)
                .catch(() => ({ users: [] })),
        // Records
        listRecords: (start, end) =>
            api(`/records?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
        addRecord: (body) => api('/records', { method: 'POST', body }),
        deleteRecord: (id) => api('/records/' + encodeURIComponent(id), { method: 'DELETE' }),
        // Payroll
        getPayroll: (monthKey) => api('/payroll?monthKey=' + encodeURIComponent(monthKey)),
        putPayroll: (id, body) =>
            api('/payroll/' + encodeURIComponent(id), { method: 'PUT', body }),
        // Day notes (ghi chú theo ngày)
        listDayNotes: (start, end) =>
            api(`/day-notes?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
        putDayNote: (id, note) =>
            api('/day-notes/' + encodeURIComponent(id), { method: 'PUT', body: { note } }),
        // Fullday / holidays
        listFullday: () => api('/fullday'),
        addFullday: (empId, dateKey) =>
            api('/fullday', { method: 'POST', body: { empId, dateKey } }),
        delFullday: (id) => api('/fullday/' + encodeURIComponent(id), { method: 'DELETE' }),
        listHolidays: () => api('/holidays'),
        addHoliday: (dateKey, note) =>
            api('/holidays', { method: 'POST', body: { dateKey, note } }),
        delHoliday: (dateKey) =>
            api('/holidays/' + encodeURIComponent(dateKey), { method: 'DELETE' }),
        // Sync status (chỉ đọc — hiển thị dải trạng thái máy)
        getSyncStatus: () => api('/sync-status'),
    };
})(window);
