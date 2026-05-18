// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 KPI STATS STRIP — Hiển thị KPI realtime theo Chiến Dịch
   đang chọn. Mỗi nhân viên = 1 card. Top-1 có nền xanh + ngôi
   sao vàng. Card sort theo totalKPI giảm dần.

   Toast notifications (diff snapshot mỗi lần refresh):
   - "X bán thêm N món" khi soMon của user tăng
   - "🎉 CHÚC MỪNG X ĐỨNG TOP SALE!" khi user vượt mặt leader cũ

   Mỗi browser tự diff → "cho mọi người thấy" tự nhiên vì cùng
   data nguồn (Render PostgreSQL via Cloudflare worker). Không
   cần broadcast layer.

   Data source: /api/realtime/kpi-statistics (REUSE — endpoint
   đã có sẵn ở tab "KPI - HOA HỒNG", không tạo mới).

   Filter: order.campaignName === window.campaignManager.activeCampaign.name

   Refresh triggers:
   - Khi tab1 init + active campaign sẵn sàng (lần đầu, không toast).
   - Khi user đổi Chiến Dịch (reset snapshot, không toast).
   - Khi SSE 'kpi_statistics' bắn update/created/deleted → debounce 1.5s
     rồi refresh (toast). Backend Render đã add notifyClients() vào tất cả
     write endpoints kpi-statistics (PUT/PATCH/DELETE/recalculate).
   - Cũng listen 'kpi_base' để bắt new order BASE write (sự kiện hiếm hơn).

   KHÔNG polling — chỉ SSE.

   Cache busting: fetch dùng cache:'no-store' để Cloudflare không serve từ
   browser cache cũ → mỗi refresh thực sự fetch tươi.
   ===================================================== */
(function () {
    'use strict';

    const HOST_ID = 'kpiStatsStrip';
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    // Subscribe 2 channels: kpi_statistics (mọi PATCH tick KPI) + kpi_base (new order BASE)
    const SSE_URL = `${API_BASE}/sse?keys=${encodeURIComponent('kpi_statistics,kpi_base')}`;
    const SSE_DEBOUNCE_MS = 1500;
    const READY_POLL_MS = 500;
    const READY_MAX_TRIES = 30;
    const CAMPAIGN_WATCH_MS = 2000;
    const TOAST_SALE_DURATION_MS = 4000;
    const TOAST_TOP_DURATION_MS = 8000;

    /**
     * @typedef {Object} EmployeeStat
     * @property {string} userId
     * @property {string} userName
     * @property {number} soMon
     * @property {number} soTien
     */

    function formatSoMon(n) {
        if (!Number.isFinite(n) || n <= 0) return '0m';
        return `${Math.round(n)}m`;
    }

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

    function getActiveCampaignName() {
        const cm = window.campaignManager;
        return cm && cm.activeCampaign && cm.activeCampaign.name ? cm.activeCampaign.name : null;
    }

    function getActiveCampaignId() {
        const cm = window.campaignManager;
        return cm && cm.activeCampaignId ? cm.activeCampaignId : null;
    }

    /**
     * @param {string} campaignName
     * @returns {Promise<EmployeeStat[]>}
     */
    async function fetchAndAggregate(campaignName) {
        const res = await fetch(`${API_BASE}/kpi-statistics`, { cache: 'no-store' });
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

    // ─── Toast state ────────────────────────────────────
    /** @type {Map<string, { userName: string, soMon: number, soTien: number }>} */
    const prevSnapshot = new Map();
    let prevTopUserId = null;
    let isFirstRefreshForCampaign = true;
    let lastSeenCampaignId = null;

    function getToaster() {
        return window.notificationManager || null;
    }

    /**
     * @param {EmployeeStat[]} stats
     */
    function diffAndToast(stats) {
        const toaster = getToaster();
        if (!toaster) return;

        // Per-user delta toasts — chỉ fire khi soMon tăng so với snapshot.
        for (const s of stats) {
            const old = prevSnapshot.get(s.userId);
            if (!old) continue;
            const deltaMon = s.soMon - old.soMon;
            if (deltaMon > 0) {
                const message = `${escapeHtml(s.userName)} bán thêm <b>${deltaMon}</b> món`;
                try {
                    toaster.success(message, TOAST_SALE_DURATION_MS);
                } catch (err) {
                    console.error('[KPIStatsStrip] toast sale failed:', err);
                }
            }
        }

        // TOP SALE toast — fire khi user vượt mặt leader cũ.
        const newTop = stats[0];
        const newTopId = newTop ? newTop.userId : null;
        const newTopHasKPI = newTop && (newTop.soTien > 0 || newTop.soMon > 0);
        const overtook =
            newTopId &&
            prevTopUserId &&
            newTopId !== prevTopUserId &&
            newTopHasKPI &&
            stats.length >= 2;

        if (overtook) {
            const name = String(newTop.userName || '').toUpperCase();
            const message = `🎉 CHÚC MỪNG <b>${escapeHtml(name)}</b> ĐỨNG TOP SALE!`;
            try {
                toaster.success(message, TOAST_TOP_DURATION_MS, 'TOP SALE');
            } catch (err) {
                console.error('[KPIStatsStrip] toast top sale failed:', err);
            }
        }
    }

    /**
     * @param {EmployeeStat[]} stats
     */
    function updateSnapshot(stats) {
        prevSnapshot.clear();
        for (const s of stats) {
            prevSnapshot.set(s.userId, {
                userName: s.userName,
                soMon: s.soMon,
                soTien: s.soTien,
            });
        }
        prevTopUserId = stats[0] ? stats[0].userId : null;
    }

    function resetSnapshot() {
        prevSnapshot.clear();
        prevTopUserId = null;
        isFirstRefreshForCampaign = true;
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
            if (!isFirstRefreshForCampaign) {
                diffAndToast(stats);
            }
            updateSnapshot(stats);
            isFirstRefreshForCampaign = false;
        } catch (err) {
            console.error('[KPIStatsStrip] refresh failed:', err);
            host.innerHTML = '';
        }
    }

    function watchCampaignChange() {
        lastSeenCampaignId = getActiveCampaignId();
        setInterval(() => {
            const currentId = getActiveCampaignId();
            if (currentId !== lastSeenCampaignId) {
                lastSeenCampaignId = currentId;
                resetSnapshot();
                refresh();
            }
        }, CAMPAIGN_WATCH_MS);
    }

    // SSE realtime subscription — Render đã add notifyClients() vào tất cả
    // write endpoints kpi-statistics (PUT/PATCH/DELETE/recalc) → push instant
    // mỗi khi backend ghi → debounce 1.5s gộp burst → refresh.
    // EventSource tự động reconnect khi mạng chập chờn.
    let sseSource = null;
    let sseDebounceTimer = null;

    function debouncedRefresh() {
        if (!getActiveCampaignName()) return;
        clearTimeout(sseDebounceTimer);
        sseDebounceTimer = setTimeout(() => {
            sseDebounceTimer = null;
            refresh();
        }, SSE_DEBOUNCE_MS);
    }

    function subscribeRealtime() {
        if (typeof EventSource === 'undefined') return;
        try {
            sseSource = new EventSource(SSE_URL);
            sseSource.addEventListener('update', debouncedRefresh);
            sseSource.addEventListener('created', debouncedRefresh);
            sseSource.addEventListener('deleted', debouncedRefresh);
        } catch (err) {
            console.warn('[KPIStatsStrip] SSE setup failed:', err && err.message);
        }
    }

    async function waitForActiveCampaignThenRefresh() {
        for (let i = 0; i < READY_MAX_TRIES; i++) {
            if (getActiveCampaignName()) {
                await refresh();
                return;
            }
            await new Promise((r) => setTimeout(r, READY_POLL_MS));
        }
    }

    let started = false;
    async function init() {
        if (started) return;
        if (!getHost()) return;
        started = true;
        await waitForActiveCampaignThenRefresh();
        watchCampaignChange();
        subscribeRealtime();
    }

    window.KPIStatsStrip = {
        init,
        refresh,
        _resetSnapshot: resetSnapshot,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
