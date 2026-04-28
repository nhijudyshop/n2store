// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Mock data loader: fetch JSON từ resident/data/<key>.json
 * Cache trong memory, expose qua window.RData.
 */
(function () {
    const cache = new Map();

    // Mock data files (resident/data/*.json) chứa PII khách hàng nên gitignored.
    // Trên GitHub Pages production → 404 27 lần khi load các key. Skip toàn bộ fetch
    // nếu phát hiện không có catalog → trả null, không spam console + browser.
    // Single in-flight promise — concurrent calls await cùng probe, không fire 27 lần.
    let _probePromise = null;

    function _probeMockData() {
        if (_probePromise) return _probePromise;
        _probePromise = (async () => {
            try {
                const r = await fetch('data/_catalog.json', { method: 'HEAD' });
                if (!r.ok) {
                    console.info('[resident-data] mock data files chưa deploy — skip tất cả fetch');
                    return false;
                }
                return true;
            } catch {
                console.info('[resident-data] mock data files chưa deploy — skip tất cả fetch');
                return false;
            }
        })();
        return _probePromise;
    }

    async function load(key) {
        if (cache.has(key)) return cache.get(key);
        // Probe 1 lần — nếu mock data không sẵn → return null không fetch nữa
        if (!(await _probeMockData())) {
            cache.set(key, null);
            return null;
        }
        const url = 'data/' + key + '.json';
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const json = await r.json();
            cache.set(key, json);
            return json;
        } catch (e) {
            cache.set(key, null);
            console.warn('[data] miss', key, e.message);
            return null;
        }
    }

    // Helper: unwrap envelope { statusCode, status, data, message, errors }
    function unwrap(json) {
        return json && json.data !== undefined ? json.data : json;
    }

    // Convenience getters mapped to crawled endpoints
    const RData = {
        load,
        unwrap,
        userMe: () => load('get-v1-user-me').then(unwrap),
        permission: () => load('get-v1-permission').then(unwrap),
        userConfig: () => load('get-v1-user-configuration').then(unwrap),

        // Dashboard
        realEstateReport: () => load('get-v1-dashboard-real-estate-report').then(unwrap),
        realEstateRoomReport: () => load('get-v1-dashboard-real-estate-room-report').then(unwrap),
        realEstateBedReport: () => load('get-v1-dashboard-real-estate-bed-report').then(unwrap),
        contractOverview: () => load('get-v1-dashboard-contract-overview').then(unwrap),
        invoiceOverview: () => load('get-v1-dashboard-invoice-overview').then(unwrap),
        leadOverview: () => load('get-v1-dashboard-lead-overview').then(unwrap),
        reservationOverview: () => load('get-v1-dashboard-reservation-overview').then(unwrap),
        taskOverview: () => load('get-v1-dashboard-task-overview').then(unwrap),
        taskTopValues: () => load('get-v1-dashboard-task-top-values').then(unwrap),
        customerRating: () => load('get-v1-dashboard-customer-rating').then(unwrap),
        incomeExpenseLineChart: () =>
            load('get-v1-dashboard-income-expense-line-chart').then(unwrap),

        // Lists (pagination envelope: { items: [], total })
        notifications: () => load('get-v1-notification').then(unwrap),
        countNotif: () => load('get-v1-system-notification-count-unread').then(unwrap),
        myTasks: () => load('get-v1-task-total-my-tasks').then(unwrap),
        tasksAll: () => load('get-v2-task').then(unwrap),
        taskAnalytics: () => load('get-v1-task-analytics-all').then(unwrap),
        taskGroups: () => load('get-v1-task-total-tasks-by-group').then(unwrap),

        apartments: () => load('get-v2-apartment').then(unwrap),
        apartmentsAll: () => load('get-v1-apartment').then(unwrap),
        apartmentAnalytics: () => load('get-v1-apartment-analytics').then(unwrap),
        apartmentLayout: () => load('get-v1-apartment-layout').then(unwrap),

        rooms: () => load('get-v2-room').then(unwrap),
        roomAnalytics: () => load('get-v1-room-analytics').then(unwrap),
        beds: () => load('get-v2-bed').then(unwrap),
        bedAnalytics: () => load('get-v1-bed-analytics').then(unwrap),

        leads: () => load('get-v1-lead').then(unwrap),
        leadAnalytics: () => load('get-v1-lead-analytics').then(unwrap),
        reservations: () => load('get-v1-reservation').then(unwrap),
        reservationAnalytics: () => load('get-v1-reservation-analytics').then(unwrap),
        contracts: () => load('get-v1-contract').then(unwrap),
        contractAnalytics: () => load('get-v1-contract-analytics').then(unwrap),
        tenants: () => load('get-v2-tenant-living').then(unwrap),
        tenantAnalytics: () => load('get-v2-tenant-living-analytics').then(unwrap),
        vehicles: () => load('get-v1-vehicle').then(unwrap),

        invoices: () => load('get-v1-invoice').then(unwrap),
        invoiceAnalytics: () => load('get-v1-invoice-analytics').then(unwrap),
        incomeExpenses: () => load('get-v1-income-expense').then(unwrap),
        incomeExpenseAnalytics: () => load('get-v1-income-expense-analytics').then(unwrap),
        cashbook: () => load('get-v1-cashbook-select').then(unwrap),
        fees: () => load('get-v1-fee').then(unwrap),
        meterLogs: () => load('get-v1-meter-log').then(unwrap),
        meterLogAnalytics: () => load('get-v1-meter-log-analytics').then(unwrap),

        assets: () => load('get-v1-asset').then(unwrap),
        assetAnalytics: () => load('get-v1-asset-analytics').then(unwrap),
        locations: () => load('get-v1-location').then(unwrap),
        locationsSelect: () => load('get-v1-location-select').then(unwrap),

        catalog: () => load('_catalog'),
    };

    window.RData = RData;
})();
