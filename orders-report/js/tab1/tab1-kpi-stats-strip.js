// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 KPI STATS STRIP — Hiển thị KPI realtime theo Chiến Dịch
   đang chọn. Mỗi nhân viên = 1 card. Top-1 có nền xanh + ngôi
   sao vàng. Card sort theo totalKPI giảm dần.

   Data source: /api/realtime/kpi-statistics (REUSE — endpoint
   đã có sẵn ở tab "KPI - HOA HỒNG", không tạo mới).

   Filter: order.campaignName === window.campaignManager.activeCampaign.name
   Refresh: khi tab1 init lần đầu + khi user đổi Chiến Dịch.
   ===================================================== */
(function () {
    'use strict';

    const HOST_ID = 'kpiStatsStrip';
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    const READY_POLL_MS = 500;
    const READY_MAX_TRIES = 30;
    const CAMPAIGN_WATCH_MS = 2000;

    /**
     * @typedef {Object} EmployeeStat
     * @property {string} userId
     * @property {string} userName
     * @property {number} soMon   Sum netProducts qua tất cả orders match campaign
     * @property {number} soTien  Sum kpi (VNĐ) qua tất cả orders match campaign
     */

    /**
     * @param {number} n
     * @returns {string}
     */
    function formatSoMon(n) {
        if (!Number.isFinite(n) || n <= 0) return '0m';
        return `${Math.round(n)}m`;
    }

    /**
     * Compact VND: <1K → "500", <1M → "15K", ≥1M → "1.5M" (round 1 chữ số)
     * @param {number} n
     * @returns {string}
     */
    function formatSoTien(n) {
        if (!Number.isFinite(n) || n <= 0) return '0';
        if (n >= 1_000_000) {
            const m = n / 1_000_000;
            return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, '')}M`;
        }
        if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
        return String(Math.round(n));
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Get active campaign name from tab1 campaign manager.
     * @returns {string|null}
     */
    function getActiveCampaignName() {
        const cm = window.campaignManager;
        return cm && cm.activeCampaign && cm.activeCampaign.name ? cm.activeCampaign.name : null;
    }

    function getActiveCampaignId() {
        const cm = window.campaignManager;
        return cm && cm.activeCampaignId ? cm.activeCampaignId : null;
    }

    /**
     * Fetch + aggregate by employee filtered by active campaign.
     * @param {string} campaignName
     * @returns {Promise<EmployeeStat[]>}
     */
    async function fetchAndAggregate(campaignName) {
        const res = await fetch(`${API_BASE}/kpi-statistics`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = (data && data.statistics) || [];

        const userMap = new Map();
        for (const row of rows) {
            const orders = Array.isArray(row.orders) ? row.orders : [];
            for (const order of orders) {
                if (!order || order.campaignName !== campaignName) continue;
                const userId = row.userId;
                let u = userMap.get(userId);
                if (!u) {
                    u = {
                        userId,
                        userName: row.userName || userId,
                        soMon: 0,
                        soTien: 0,
                    };
                    userMap.set(userId, u);
                }
                u.soMon += Number(order.netProducts) || 0;
                u.soTien += Number(order.kpi) || 0;
            }
        }

        return [...userMap.values()]
            .filter((u) => u.soMon > 0 || u.soTien > 0)
            .sort((a, b) => b.soTien - a.soTien);
    }

    /**
     * @param {EmployeeStat[]} stats
     * @returns {string}
     */
    function buildHtml(stats) {
        if (!stats || stats.length === 0) return '';
        return stats
            .map((s, idx) => {
                const isTop = idx === 0;
                const cls = isTop ? 'kpi-stat-card kpi-stat-card--top' : 'kpi-stat-card';
                const rank = idx + 1;
                const name = escapeHtml(s.userName || s.userId);
                const titleAttr = escapeHtml(`${s.userName} · ${s.soMon} món · ${s.soTien}đ`);
                return (
                    `<span class="${cls}" title="${titleAttr}">` +
                    `<i class="fas fa-star kpi-stat-card__star" aria-hidden="true"></i>` +
                    `<span class="kpi-stat-card__rank">${rank}</span>` +
                    `<span class="kpi-stat-card__name">${name}</span>` +
                    `<span class="kpi-stat-card__sep">·</span>` +
                    `<span class="kpi-stat-card__mon">${formatSoMon(s.soMon)}</span>` +
                    `<span class="kpi-stat-card__sep">·</span>` +
                    `<span class="kpi-stat-card__tien">${formatSoTien(s.soTien)}</span>` +
                    `</span>`
                );
            })
            .join('');
    }

    function getHost() {
        return document.getElementById(HOST_ID);
    }

    function clearStrip() {
        const host = getHost();
        if (host) host.innerHTML = '';
    }

    async function refresh() {
        const host = getHost();
        if (!host) return;
        const campaignName = getActiveCampaignName();
        if (!campaignName) {
            host.innerHTML = '';
            return;
        }
        try {
            const stats = await fetchAndAggregate(campaignName);
            host.innerHTML = buildHtml(stats);
        } catch (err) {
            console.error('[KPIStatsStrip] refresh failed:', err);
            host.innerHTML = '';
        }
    }

    /**
     * Watch for campaign change. Lightweight polling (2s) — không
     * có hook nào exposed từ campaignManager để subscribe.
     */
    function watchCampaignChange() {
        let lastId = getActiveCampaignId();
        setInterval(() => {
            const currentId = getActiveCampaignId();
            if (currentId !== lastId) {
                lastId = currentId;
                refresh();
            }
        }, CAMPAIGN_WATCH_MS);
    }

    /**
     * Wait for campaignManager.activeCampaign to be populated, then
     * trigger first refresh. Returns even if timed out so we never
     * leave the strip in an indeterminate state.
     */
    async function waitForActiveCampaignThenRefresh() {
        for (let i = 0; i < READY_MAX_TRIES; i++) {
            if (getActiveCampaignName()) {
                await refresh();
                return;
            }
            await new Promise((r) => setTimeout(r, READY_POLL_MS));
        }
        // Timeout — strip stays empty, will populate later via watcher
        // when campaign gets selected.
    }

    let started = false;
    async function init() {
        if (started) return;
        if (!getHost()) return;
        started = true;
        await waitForActiveCampaignThenRefresh();
        watchCampaignChange();
    }

    // Public API
    window.KPIStatsStrip = {
        init,
        refresh,
    };

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
