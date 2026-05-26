// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// DELIVERY REPORT MODAL — Báo cáo TOMATO / NAP / TP theo ngày
// Triggered by triple-clicking the "Đang lọc: ..." hint in main filter section.
// Editable cells (SL ĐƠN SHIP, THU VỀ, BO NHẬN CK, ATRƯỜNG NHẬN CK, CK TRƯỚC,
// GHI CHÚ) persisted in localStorage keyed by date+group. Compute fields:
// PHÍ SHIP, TỔNG TẤT CẢ (= TIỀN − PHÍ SHIP − SL ĐƠN SHIP × 23k + THU VỀ),
// TỔNG CÒN LẠI auto-derived.
// =====================================================

(function () {
    'use strict';

    const SHIP_FEE_PER_ORDER = 23000; // 23k đồng / đơn
    const STORAGE_KEY = 'dr-report-overrides-v1';

    const TABS = [
        { key: 'tomato', label: 'TOMATO', color: '#dc2626', bg: '#fee2e2' },
        { key: 'nap', label: 'NAP', color: '#1e40af', bg: '#dbeafe' },
        { key: 'city', label: 'THÀNH PHỐ', color: '#b45309', bg: '#fef3c7' },
    ];

    // Image config: compress paste/uploaded images to keep localStorage under control
    const IMG_MAX_DIM = 1400; // px, longest edge
    const IMG_QUALITY = 0.82; // JPEG quality

    const state = {
        activeTab: 'tomato',
        fromDate: '',
        toDate: '',
        // overrides: in-memory cache loaded from server. Migrate 2026-05-25 từ
        // localStorage → Postgres. `loadLegacyOverrides()` chỉ dùng cho migration
        // 1 lần để upload data cũ lên server.
        overrides: {},
        overridesFetched: new Map(), // rangeKey → timestamp (TTL 60s)
        // Per-range fetch cache: { rangeKey: { byDateGroup: Map, fetchedAt } }
        fetchCache: {},
        currentByDateGroup: new Map(), // Map<`${date}__${groupName}`, {count, money}>
    };

    // Legacy localStorage reader — chỉ dùng cho one-time migration.
    function loadLegacyOverrides() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch {
            return {};
        }
    }

    function overrideKey(date, group) {
        return `${date}__${group}`;
    }

    function getOverride(date, group) {
        return state.overrides[overrideKey(date, group)] || {};
    }

    // setOverride: update local cache + fire-and-forget PUT lên server.
    // Empty → server DELETE row tự động (PUT endpoint xử lý).
    function setOverride(date, group, patch) {
        const k = overrideKey(date, group);
        const next = { ...(state.overrides[k] || {}), ...patch };
        // Strip empty values to keep cache clean
        const isEmpty = Object.values(next).every((v) => v == null || v === '' || v === 0);
        if (isEmpty) {
            delete state.overrides[k];
        } else {
            state.overrides[k] = next;
        }
        // Persist async to DB
        persistOverride(date, group, isEmpty ? null : next).catch((e) =>
            console.warn(`[report] persist override ${k} failed:`, e?.message)
        );
    }

    async function persistOverride(date, group, ov) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        const url = `${renderUrl}/api/v2/delivery-assignments/overrides/${encodeURIComponent(date)}/${encodeURIComponent(group)}`;
        const resp = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ov || {}),
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${txt}`);
        }
    }

    async function loadOverridesRange(from, to) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl || !from || !to) return;
        const key = rangeKey(from, to);
        const last = state.overridesFetched.get(key);
        if (last && Date.now() - last < 60000) return;
        try {
            const url = `${renderUrl}/api/v2/delivery-assignments/overrides?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const j = await resp.json();
            const fresh = j.data?.overrides || {};
            // Replace overrides cho các (date) trong range (giữ entries ngoài range)
            const dates = eachDay(from, to);
            const inRange = new Set(dates);
            for (const k in state.overrides) {
                const [d] = k.split('__');
                if (inRange.has(d)) delete state.overrides[k];
            }
            for (const k in fresh) {
                state.overrides[k] = fresh[k];
            }
            state.overridesFetched.set(key, Date.now());
        } catch (e) {
            console.warn('[report] loadOverridesRange failed:', e?.message);
        }
    }

    // One-time migration: scan localStorage → upload all overrides + billImage → clear localStorage.
    async function migrateLocalStorageOverridesOnce() {
        const MARK_KEY = 'dr-report-overrides-migrated-v1';
        if (localStorage.getItem(MARK_KEY) === '1') return;
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        const legacy = loadLegacyOverrides();
        const entries = Object.entries(legacy);
        if (entries.length === 0) {
            localStorage.setItem(MARK_KEY, '1');
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        console.log(`[report] migrating ${entries.length} overrides localStorage → DB…`);
        let ok = 0;
        for (const [k, ov] of entries) {
            const [date, group] = k.split('__');
            if (!date || !group || !ov) continue;
            // Skip billImage (đã có migration riêng — chỉ migrate scalar fields).
            const scalarOv = {
                slShip: Number(ov.slShip) || 0,
                thuVe: Number(ov.thuVe) || 0,
                boCK: Number(ov.boCK) || 0,
                atruongCK: Number(ov.atruongCK) || 0,
                ckTruoc: Number(ov.ckTruoc) || 0,
                note: String(ov.note || '').trim(),
            };
            const isEmpty = Object.values(scalarOv).every((v) => v == null || v === '' || v === 0);
            if (isEmpty) continue;
            try {
                await persistOverride(date, group, scalarOv);
                ok++;
            } catch (e) {
                console.warn(`[report] migrate fail ${k}:`, e?.message);
            }
        }
        // Migration done — purge localStorage (image migration runs separately)
        localStorage.setItem(MARK_KEY, '1');
        localStorage.removeItem(STORAGE_KEY);
        console.log(`[report] migrated ${ok}/${entries.length} overrides → DB`);
    }

    // ── Date helpers ──
    function parseISO(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
        return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
    }

    function formatDDMMYYYY(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    }

    // Entry date (ngày nhập liệu) = real date + 1 day. UI inputs and the NGÀY
    // column display entry dates; data fetch/storage/overrides keep real dates.
    function shiftDay(iso, delta) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return '';
        d.setDate(d.getDate() + delta);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }
    const entryToReal = (iso) => shiftDay(iso, -1);
    const realToEntry = (iso) => shiftDay(iso, 1);

    function eachDay(fromISO, toISO) {
        const dates = [];
        if (!fromISO || !toISO) return dates;
        const start = new Date(fromISO + 'T00:00:00');
        const end = new Date(toISO + 'T00:00:00');
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return dates;
        if (end < start) return dates;
        const cur = new Date(start);
        while (cur <= end) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    // Cached formatter — re-using saves ~1ms × hundreds of cells per render
    const moneyFormatter = new Intl.NumberFormat('vi-VN');
    function formatNumber(n) {
        return moneyFormatter.format(Math.round(Number(n) || 0));
    }
    // Money values prefix with $ for quick visual identification of currency cells
    function formatMoney(n) {
        return `$ ${formatNumber(n)}`;
    }

    function parseMoney(s) {
        const cleaned = String(s || '').replace(/[^\d-]/g, '');
        return Number(cleaned) || 0;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Fetch from Render DB (delivery_assignments table) ──
    // Render DB is the source of truth for "đã quét" + COD per assignment.
    // No TPOS round-trip needed.
    function rangeKey(from, to) {
        return `${from}__${to}`;
    }

    // ── Images storage: Postgres BYTEA via /api/v2/delivery-assignments/image/ ──
    // Trước đây lưu trong localStorage `dr-report-overrides-v1.billImage`. Migrate
    // 2026-05-25 sang DB để persist cross-device. localStorage giờ chỉ giữ các
    // override khác (slShip, thuVe, boCK, atruongCK, ckTruoc, note).
    state.imageFlags = state.imageFlags || new Set(); // `${date}__${group}` của các ô có ảnh trong range hiện tại
    state.imageFlagsFetched = state.imageFlagsFetched || new Map(); // rangeKey → timestamp (TTL 60s)

    function imageUrl(date, group, cacheBust) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl || !date || !group) return '';
        const bust = cacheBust ? `?t=${cacheBust}` : '';
        return `${renderUrl}/api/v2/delivery-assignments/image/${encodeURIComponent(date)}/${encodeURIComponent(group)}${bust}`;
    }

    async function loadImageFlags(from, to) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl || !from || !to) return;
        const key = rangeKey(from, to);
        const last = state.imageFlagsFetched.get(key);
        if (last && Date.now() - last < 60000) return;
        try {
            const url = `${renderUrl}/api/v2/delivery-assignments/image-flags?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const j = await resp.json();
            const flags = j.data?.flags || [];
            // Refresh chỉ flags trong range này — đảm bảo set không mang flag stale
            // từ range cũ với date không có trong range mới.
            const dates = eachDay(from, to);
            const inRange = new Set(dates);
            for (const f of [...state.imageFlags]) {
                const [d] = String(f).split('__');
                if (inRange.has(d)) state.imageFlags.delete(f);
            }
            for (const f of flags) state.imageFlags.add(f);
            state.imageFlagsFetched.set(key, Date.now());
        } catch (e) {
            console.warn('[report] loadImageFlags failed:', e?.message);
        }
    }

    function hasImageFlag(date, group) {
        return state.imageFlags.has(`${date}__${group}`);
    }

    async function uploadImage(date, group, dataUrl) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) throw new Error('Render URL not available');
        const resp = await fetch(
            `${renderUrl}/api/v2/delivery-assignments/image/${encodeURIComponent(date)}/${encodeURIComponent(group)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl }),
            }
        );
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${txt}`);
        }
        state.imageFlags.add(`${date}__${group}`);
    }

    async function deleteImage(date, group) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) throw new Error('Render URL not available');
        const resp = await fetch(
            `${renderUrl}/api/v2/delivery-assignments/image/${encodeURIComponent(date)}/${encodeURIComponent(group)}`,
            { method: 'DELETE' }
        );
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        state.imageFlags.delete(`${date}__${group}`);
    }

    // One-time migration: scan localStorage `billImage` entries → upload to DB
    // → clear `billImage` field. Marker `dr-report-images-migrated-v1` ngăn chạy lại.
    async function migrateLocalStorageImagesOnce() {
        const MARK_KEY = 'dr-report-images-migrated-v1';
        if (localStorage.getItem(MARK_KEY) === '1') return;
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        const candidates = [];
        for (const k in state.overrides) {
            const ov = state.overrides[k];
            if (!ov || !ov.billImage) continue;
            const [date, group] = k.split('__');
            if (!date || !group) continue;
            candidates.push({ key: k, date, group, dataUrl: ov.billImage });
        }
        if (candidates.length === 0) {
            localStorage.setItem(MARK_KEY, '1');
            return;
        }
        console.log(`[report] migrating ${candidates.length} images localStorage → DB…`);
        let ok = 0;
        for (const c of candidates) {
            try {
                await uploadImage(c.date, c.group, c.dataUrl);
                // Clear billImage but keep other override fields
                const ov = { ...(state.overrides[c.key] || {}) };
                delete ov.billImage;
                const empty = Object.values(ov).every((v) => v == null || v === '' || v === 0);
                if (empty) delete state.overrides[c.key];
                else state.overrides[c.key] = ov;
                ok++;
            } catch (e) {
                console.warn(`[report] migrate fail ${c.key}:`, e?.message);
            }
        }
        saveOverrides();
        localStorage.setItem(MARK_KEY, '1');
        console.log(`[report] migrated ${ok}/${candidates.length} images → DB`);
    }

    async function fetchRange(from, to) {
        if (!from || !to) return { byDateGroup: new Map() };
        const key = rangeKey(from, to);
        const cached = state.fetchCache[key];
        if (cached && Date.now() - cached.fetchedAt < 60000) {
            return { byDateGroup: cached.byDateGroup };
        }
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) {
            console.warn('[report] Render URL not available');
            return { byDateGroup: new Map() };
        }
        const url =
            `${renderUrl}/api/v2/delivery-assignments/by-date-group` +
            `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&scanned_only=1`;
        let rows = [];
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success) rows = result.rows || [];
            else throw new Error(result.error || 'API returned success=false');
        } catch (e) {
            console.error('[report] fetch /by-date-group failed:', e?.message);
            return { byDateGroup: new Map() };
        }

        // Index by `${date}__${groupName}` for quick aggregation
        const map = new Map();
        rows.forEach((r) => {
            map.set(`${r.date}__${r.groupName}`, {
                count: r.scannedCount,
                money: r.scannedCod,
            });
        });
        state.fetchCache[key] = { byDateGroup: map, fetchedAt: Date.now() };
        return { byDateGroup: map };
    }

    // ── Data aggregation (reads from Render-pre-aggregated map) ──
    function aggregateByDay(group, dates) {
        const m = state.currentByDateGroup || new Map();
        const out = {};
        dates.forEach((d) => {
            const v = m.get(`${d}__${group}`) || { count: 0, money: 0 };
            out[d] = { sysCount: v.count, money: v.money };
        });
        return out;
    }

    // ── Render ──
    function ensureModal() {
        if (document.getElementById('drReportModal')) return;
        const tpl = `
        <div class="dr-report-overlay" id="drReportModal" role="dialog" aria-modal="true">
          <div class="dr-report-window">
            <div class="dr-report-header">
              <div class="dr-report-title">
                <i class="fas fa-chart-bar"></i> Báo cáo
                <span class="dr-report-subtitle" id="drReportRangeLabel"></span>
                <span class="dr-report-hint" title="SL ĐƠN và TIỀN chỉ tính các đơn đã quét xác nhận giao thành công">
                  <i class="fas fa-info-circle"></i> chỉ tính đơn đã quét
                </span>
              </div>
              <button class="dr-report-close" id="drReportClose" title="Đóng (ESC)">&times;</button>
            </div>

            <div class="dr-report-toolbar">
              <div class="dr-report-range">
                <label>Từ <input type="date" id="drReportFrom" /></label>
                <span>→</span>
                <label>Đến <input type="date" id="drReportTo" /></label>
                <div class="dr-report-presets">
                  <button data-preset="today">Hôm nay</button>
                  <button data-preset="yesterday">Hôm qua</button>
                  <button data-preset="last7">7 ngày</button>
                  <button data-preset="thisMonth">Tháng này</button>
                  <button data-preset="lastMonth">Tháng trước</button>
                </div>
              </div>
              <div class="dr-report-tabs" id="drReportTabs"></div>
            </div>

            <div class="dr-report-table-wrap">
              <table class="dr-report-table" id="drReportTable">
                <thead><tr>
                  <th>NGÀY</th>
                  <th class="num">SL ĐƠN</th>
                  <th class="num">TIỀN</th>
                  <th class="num">PHÍ SHIP</th>
                  <th class="num input-col" title="Số đơn ship riêng, trừ khỏi TỔNG TẤT CẢ (SL × 23.000)">SL ĐƠN SHIP</th>
                  <th class="num input-col" title="Tiền thu về, cộng thêm vào TỔNG TẤT CẢ">THU VỀ</th>
                  <th class="num">TỔNG TẤT CẢ</th>
                  <th class="num input-col">BO NHẬN CK</th>
                  <th class="num input-col">ATRƯỜNG NHẬN CK</th>
                  <th class="num input-col">CK TRƯỚC</th>
                  <th class="num">TỔNG CÒN LẠI</th>
                  <th>GHI CHÚ</th>
                </tr></thead>
                <tbody id="drReportTbody"></tbody>
                <tfoot id="drReportTfoot"></tfoot>
              </table>
            </div>
          </div>
        </div>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tpl.trim();
        // Inject inside the main container so layout flows naturally (no overlay)
        const host = document.querySelector('.delivery-report-container') || document.body;
        host.appendChild(wrapper.firstChild);

        // Wire close (no overlay backdrop click — view-swap mode, ESC still works)
        document.getElementById('drReportClose').addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const imgModal = document.getElementById('drReportImgModal');
            if (imgModal && imgModal.classList.contains('open')) {
                closeImageModal();
                return;
            }
            if (isOpen()) close();
        });

        // Wire date inputs
        document.getElementById('drReportFrom').addEventListener('change', onDateChange);
        document.getElementById('drReportTo').addEventListener('change', onDateChange);
        // Presets
        document.querySelectorAll('.dr-report-presets button').forEach((btn) => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        // Build tabs
        const tabsEl = document.getElementById('drReportTabs');
        TABS.forEach((t) => {
            const b = document.createElement('button');
            b.dataset.tab = t.key;
            b.textContent = t.label;
            b.style.setProperty('--tab-color', t.color);
            b.style.setProperty('--tab-bg', t.bg);
            b.addEventListener('click', () => {
                if (state.activeTab === t.key) return;
                state.activeTab = t.key;
                render();
            });
            tabsEl.appendChild(b);
        });

        // One-time event delegation on tbody
        bindTbodyDelegation();
    }

    function isOpen() {
        const el = document.getElementById('drReportModal');
        return el && el.classList.contains('open');
    }

    function applyPreset(name) {
        const today = new Date();
        const fmt = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        };
        let from, to;
        if (name === 'today') {
            from = to = fmt(today);
        } else if (name === 'yesterday') {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            from = to = fmt(y);
        } else if (name === 'last7') {
            to = fmt(today);
            const f = new Date(today);
            f.setDate(f.getDate() - 6);
            from = fmt(f);
        } else if (name === 'thisMonth') {
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            from = fmt(first);
            to = fmt(today);
        } else if (name === 'lastMonth') {
            const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const last = new Date(today.getFullYear(), today.getMonth(), 0);
            from = fmt(first);
            to = fmt(last);
        }
        if (from && to) {
            document.getElementById('drReportFrom').value = from;
            document.getElementById('drReportTo').value = to;
            state.fromDate = from;
            state.toDate = to;
            render();
        }
    }

    function onDateChange() {
        state.fromDate = document.getElementById('drReportFrom').value;
        state.toDate = document.getElementById('drReportTo').value;
        render();
    }

    // Coalesce multiple render() calls within the same frame (e.g. tab switch
    // triggering both tab UI update + data refresh would render twice).
    let renderRaf = 0;
    function scheduleRender() {
        if (renderRaf) return;
        renderRaf = requestAnimationFrame(() => {
            renderRaf = 0;
            render();
        });
    }

    function updateTabClasses() {
        const tabs = document.querySelectorAll('#drReportTabs button');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].dataset.tab === state.activeTab);
        }
    }

    function render() {
        // Cheap, sync UI updates first — never await for these
        updateTabClasses();
        // state.fromDate / state.toDate are ENTRY dates (what the user picks
        // and what the NGÀY column shows). Data fetched/aggregated by REAL
        // dates = entry − 1. Storage and overrides are unchanged.
        const realFrom = entryToReal(state.fromDate);
        const realTo = entryToReal(state.toDate);
        const dates = eachDay(realFrom, realTo); // iterate real dates
        const subtitle = dates.length
            ? `${formatDDMMYYYY(state.fromDate)}${
                  state.fromDate === state.toDate ? '' : ` → ${formatDDMMYYYY(state.toDate)}`
              }`
            : 'Chọn khoảng ngày';
        document.getElementById('drReportRangeLabel').textContent = subtitle;

        if (dates.length === 0) {
            document.getElementById('drReportTbody').innerHTML =
                '<tr><td colspan="12" class="dr-report-empty">Chọn khoảng ngày để xem báo cáo</td></tr>';
            document.getElementById('drReportTfoot').innerHTML = '';
            return;
        }

        // Image flags + overrides fire-and-forget (sẽ tự re-paint khi xong)
        Promise.all([loadImageFlags(realFrom, realTo), loadOverridesRange(realFrom, realTo)]).then(
            () => {
                // Repaint nếu range vẫn match (tránh flicker stale data)
                const curRealFrom = entryToReal(state.fromDate);
                const curRealTo = entryToReal(state.toDate);
                if (
                    rangeKey(curRealFrom, curRealTo) === rangeKey(realFrom, realTo) &&
                    document.getElementById('drReportTbody')?.children.length > 0
                ) {
                    paintTable(eachDay(curRealFrom, curRealTo));
                }
            }
        );

        // Hot cache → sync path: paint immediately, no await, no loading flash.
        const key = rangeKey(realFrom, realTo);
        const cached = state.fetchCache[key];
        if (cached && Date.now() - cached.fetchedAt < 60000) {
            state.currentByDateGroup = cached.byDateGroup;
            paintTable(dates);
            return;
        }

        // Cold cache → show loading + async fetch
        document.getElementById('drReportTbody').innerHTML =
            '<tr><td colspan="12" class="dr-report-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu DB…</td></tr>';
        document.getElementById('drReportTfoot').innerHTML = '';
        fetchRange(realFrom, realTo).then(({ byDateGroup }) => {
            const curRealFrom = entryToReal(state.fromDate);
            const curRealTo = entryToReal(state.toDate);
            if (rangeKey(curRealFrom, curRealTo) !== key) return; // stale
            state.currentByDateGroup = byDateGroup;
            paintTable(eachDay(curRealFrom, curRealTo));
        });
    }

    function paintTable(dates) {
        const map = aggregateByDay(state.activeTab, dates);
        let totals = {
            slDon: 0,
            money: 0,
            shipFee: 0,
            slShip: 0,
            thuVe: 0,
            totalAll: 0,
            boCK: 0,
            atruongCK: 0,
            ckTruoc: 0,
            totalLeft: 0,
        };

        const rows = dates.map((d) => {
            const sys = map[d] || { sysCount: 0, money: 0 };
            const ov = getOverride(d, state.activeTab);
            const slDon = sys.sysCount;
            const money = sys.money;
            const shipFee = slDon * SHIP_FEE_PER_ORDER;
            const slShip = Number(ov.slShip) || 0;
            const thuVe = Number(ov.thuVe) || 0;
            // TỔNG TẤT CẢ = TIỀN − PHÍ SHIP − (SL ĐƠN SHIP × 23k) + THU VỀ
            const totalAll = money - shipFee - slShip * SHIP_FEE_PER_ORDER + thuVe;
            const boCK = Number(ov.boCK) || 0;
            const atruongCK = Number(ov.atruongCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const totalLeft = totalAll - boCK - atruongCK - ckTruoc;
            const note = ov.note || '';

            totals.slDon += slDon;
            totals.money += money;
            totals.shipFee += shipFee;
            totals.slShip += slShip;
            totals.thuVe += thuVe;
            totals.totalAll += totalAll;
            totals.boCK += boCK;
            totals.atruongCK += atruongCK;
            totals.ckTruoc += ckTruoc;
            totals.totalLeft += totalLeft;

            const hasImg = hasImageFlag(d, state.activeTab);
            return `<tr data-date="${d}">
                <td class="date clickable" data-action="toggle-expand" title="Bấm để xem danh sách ${slDon} đơn (ngày thật: ${formatDDMMYYYY(d)})"><i class="fas fa-chevron-right dr-expand-chevron"></i> ${formatDDMMYYYY(realToEntry(d))}</td>
                <td class="num strong clickable" data-action="toggle-expand" title="Bấm để xem chi tiết ${slDon} đơn">${formatNumber(slDon)}</td>
                <td class="num clickable money-cell ${hasImg ? 'has-img' : 'no-img'}" data-action="open-img" title="${hasImg ? 'Bấm để xem/sửa ảnh' : 'Bấm để thêm ảnh chứng từ'}">
                    <span class="money-val">${formatMoney(money)}</span>
                    <span class="money-ico">${hasImg ? '<i class="fas fa-image"></i>' : '<i class="far fa-image"></i>'}</span>
                </td>
                <td class="num muted">${formatMoney(shipFee)}</td>
                <td class="num"><input type="number" min="0" data-field="slShip" value="${slShip || ''}" placeholder="0" title="Số đơn ship riêng — trừ SL × 23.000 khỏi TỔNG TẤT CẢ" /></td>
                <td class="num"><input type="text" data-field="thuVe" value="${thuVe ? formatMoney(thuVe) : ''}" placeholder="0" title="Tiền thu về — cộng thêm vào TỔNG TẤT CẢ" /></td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num"><input type="text" data-field="boCK" value="${boCK ? formatMoney(boCK) : ''}" placeholder="0" /></td>
                <td class="num"><input type="text" data-field="atruongCK" value="${atruongCK ? formatMoney(atruongCK) : ''}" placeholder="0" /></td>
                <td class="num"><input type="text" data-field="ckTruoc" value="${ckTruoc ? formatMoney(ckTruoc) : ''}" placeholder="0" /></td>
                <td class="num strong ${totalLeft < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeft)}</td>
                <td class="note-cell"><textarea data-field="note" rows="1" placeholder="Ghi chú…">${escapeHtml(note)}</textarea></td>
            </tr>`;
        });

        document.getElementById('drReportTbody').innerHTML = rows.join('');

        document.getElementById('drReportTfoot').innerHTML = `<tr class="total-row">
            <th>TỔNG (${dates.length} ngày)</th>
            <th class="num">${formatNumber(totals.slDon)}</th>
            <th class="num">${formatMoney(totals.money)}</th>
            <th class="num muted">${formatMoney(totals.shipFee)}</th>
            <th class="num">${formatNumber(totals.slShip)}</th>
            <th class="num">${formatMoney(totals.thuVe)}</th>
            <th class="num strong">${formatMoney(totals.totalAll)}</th>
            <th class="num">${formatMoney(totals.boCK)}</th>
            <th class="num">${formatMoney(totals.atruongCK)}</th>
            <th class="num">${formatMoney(totals.ckTruoc)}</th>
            <th class="num strong ${totals.totalLeft < 0 ? 'negative' : 'positive'}">${formatMoney(totals.totalLeft)}</th>
            <th></th>
        </tr>`;

        // Delegation set up once in ensureModal() — no per-cell binding here.
    }

    // Single delegated listener set wired in ensureModal(). Avoids attaching
    // O(rows × fields) handlers per render — major perf win when range is large.
    function bindTbodyDelegation() {
        const tbody = document.getElementById('drReportTbody');
        if (!tbody || tbody.dataset.delegationBound === '1') return;
        tbody.dataset.delegationBound = '1';

        tbody.addEventListener('focusout', (e) => {
            const el = e.target.closest && e.target.closest('[data-field]');
            if (!el || !tbody.contains(el)) return;
            const row = el.closest('tr[data-date]');
            if (!row) return;
            const field = el.dataset.field;
            let value;
            if (field === 'slShip') {
                value = el.value === '' ? '' : Math.max(0, Number(el.value) || 0);
            } else if (field === 'note') {
                value = el.value.trim();
            } else {
                value = parseMoney(el.value);
            }
            // Only persist + re-render if value actually changed
            const ov = getOverride(row.dataset.date, state.activeTab);
            const prev = ov[field];
            const prevNorm = prev == null || prev === '' ? '' : prev;
            const nextNorm = value == null || value === '' ? '' : value;
            if (String(prevNorm) === String(nextNorm)) return;
            setOverride(row.dataset.date, state.activeTab, { [field]: value });
            // Note field doesn't affect totals → skip full re-render
            if (field !== 'note') scheduleRender();
        });

        tbody.addEventListener('keydown', (e) => {
            if (
                e.key === 'Enter' &&
                e.target &&
                e.target.matches('input[data-field]') &&
                e.target.dataset.field !== 'note'
            ) {
                e.target.blur();
            }
        });

        tbody.addEventListener('click', (e) => {
            const reset = e.target.closest && e.target.closest('.dr-report-reset');
            if (reset) {
                setOverride(reset.dataset.date, state.activeTab, { [reset.dataset.field]: '' });
                scheduleRender();
                return;
            }
            const imgCell = e.target.closest && e.target.closest('td[data-action="open-img"]');
            if (imgCell) {
                const row = imgCell.closest('tr[data-date]');
                if (row) openImageModal(row.dataset.date);
                return;
            }
            const expandCell =
                e.target.closest && e.target.closest('td[data-action="toggle-expand"]');
            if (expandCell) {
                const row = expandCell.closest('tr[data-date]');
                if (row) toggleExpandRow(row);
            }
        });

        // Hover preview: zoom ảnh chứng từ khi rê chuột lên ô TIỀN có ảnh.
        // mouseover/mouseout bubble (mouseenter/leave do not); the currentCell
        // guard avoids re-render flicker while moving inside the same cell.
        tbody.addEventListener('mouseover', (e) => {
            const cell = e.target.closest && e.target.closest('td.money-cell.has-img');
            if (!cell) return;
            if (hoverPreview.currentCell === cell) return;
            const row = cell.closest('tr[data-date]');
            if (!row) return;
            // Image URL từ server — browser cache theo ETag (60s) tránh re-download
            const src = imageUrl(row.dataset.date, state.activeTab);
            if (!src) return;
            showHoverPreview(cell, src);
        });
        tbody.addEventListener('mouseout', (e) => {
            const cell = e.target.closest && e.target.closest('td.money-cell.has-img');
            if (!cell) return;
            // Mouse moved within the same cell — still inside, keep preview.
            const next = e.relatedTarget;
            if (next && cell.contains(next)) return;
            hideHoverPreview();
        });
    }

    // ── Expand row: hiển thị danh sách đơn từng (date, group) ──
    // state.expandCache: { `${date}__${group}`: [{ Number, partner, cod, scanned, carrier, dateInvoice }] }
    state.expandCache = state.expandCache || {};

    async function toggleExpandRow(row) {
        if (!row) return;
        const next = row.nextElementSibling;
        if (next && next.classList.contains('dr-expand-row')) {
            next.remove();
            row.dataset.expanded = '0';
            const chev = row.querySelector('.dr-expand-chevron');
            if (chev) chev.classList.remove('open');
            return;
        }
        row.dataset.expanded = '1';
        const chev = row.querySelector('.dr-expand-chevron');
        if (chev) chev.classList.add('open');

        const date = row.dataset.date;
        const group = state.activeTab;
        const colCount = 12; // số cột table — đồng bộ với colspan empty/loading state

        const loadingTr = document.createElement('tr');
        loadingTr.className = 'dr-expand-row';
        loadingTr.innerHTML = `<td colspan="${colCount}" class="dr-expand-loading"><i class="fas fa-spinner fa-spin"></i> Đang tải danh sách đơn…</td>`;
        row.parentNode.insertBefore(loadingTr, row.nextSibling);

        try {
            const items = await fetchExpandData(date, group);
            loadingTr.innerHTML = `<td colspan="${colCount}" class="dr-expand-content">${renderExpandHtml(items, date, group)}</td>`;
        } catch (e) {
            loadingTr.innerHTML = `<td colspan="${colCount}" class="dr-expand-error">Lỗi tải dữ liệu: ${escapeHtml(e?.message || 'unknown')}</td>`;
        }
    }

    async function fetchExpandData(date, group) {
        const cacheKey = `${date}__${group}`;
        const cached = state.expandCache[cacheKey];
        if (cached && Date.now() - cached.fetchedAt < 60000) return cached.items;

        const renderUrl = window.DeliveryReport?._renderUrl;
        const workerUrl = window.DeliveryReport?._workerUrl;
        const getToken = window.DeliveryReport?._getToken;
        if (!renderUrl) throw new Error('Render URL not available');

        // 1. Get DB Numbers for date + group (chỉ đơn đã quét)
        const dbResp = await fetch(
            `${renderUrl}/api/v2/delivery-assignments/?date=${encodeURIComponent(date)}`
        );
        if (!dbResp.ok) throw new Error(`DB HTTP ${dbResp.status}`);
        const dbJson = await dbResp.json();
        const assignments = dbJson.data?.assignments || {};
        const scannedSet = new Set(dbJson.data?.scannedNumbers || []);
        const targetNumbers = [];
        for (const num in assignments) {
            if (assignments[num] === group && scannedSet.has(num)) {
                targetNumbers.push(num);
            }
        }
        if (targetNumbers.length === 0) {
            state.expandCache[cacheKey] = { items: [], fetchedAt: Date.now() };
            return [];
        }

        // 2. Fetch TPOS live for the date (cùng pattern main page dùng: filter
        // theo DateInvoice, không filter Number — tránh URL quá dài / Number filter
        // encoding issue với "/" trong NJD/2026/XXX). Sau đó intersect Numbers
        // client-side qua targetSet.
        const targetSet = new Set(targetNumbers);
        const liveMap = new Map();
        if (workerUrl && getToken) {
            try {
                const token = await getToken();
                if (token) {
                    const fromIso = new Date(date + 'T00:00:00').toISOString();
                    const toEnd = new Date(date + 'T00:00:00');
                    toEnd.setHours(23, 59, 59, 999);
                    const toIso = toEnd.toISOString();
                    const params = new URLSearchParams({
                        FromDate: fromIso,
                        ToDate: toIso,
                        $top: '10000',
                    });
                    const url = `${workerUrl}/api/odata/Report/DeliveryReport?${params.toString()}`;
                    const resp = await fetch(url, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json',
                            tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                        },
                    });
                    if (resp.ok) {
                        const j = await resp.json();
                        for (const it of j.value || []) {
                            if (targetSet.has(it.Number)) liveMap.set(it.Number, it);
                        }
                    } else {
                        console.warn(
                            `[report] TPOS live fetch HTTP ${resp.status} for expand ${date}`
                        );
                    }
                }
            } catch (e) {
                console.warn('[report] TPOS live fetch for expand failed:', e?.message);
            }
        }

        const items = targetNumbers.map((num) => {
            const live = liveMap.get(num);
            return {
                Number: num,
                partner: live?.PartnerDisplayName || live?.PartnerName || '',
                phone: live?.Telephone || live?.PartnerPhone || '',
                cod: Number(live?.CashOnDelivery) || 0,
                amountTotal: Number(live?.AmountTotal) || 0,
                carrier: live?.CarrierName || '',
                dateInvoice: live?.DateInvoice || '',
                ghost: !live, // không tồn tại trong TPOS live → ghost row
                scanned: true,
            };
        });
        // Sort: ghosts cuối, các đơn còn lại theo DateInvoice desc
        items.sort((a, b) => {
            if (a.ghost !== b.ghost) return a.ghost ? 1 : -1;
            return (b.dateInvoice || '').localeCompare(a.dateInvoice || '');
        });

        state.expandCache[cacheKey] = { items, fetchedAt: Date.now() };
        return items;
    }

    function renderExpandHtml(items, date, group) {
        if (!items || items.length === 0) {
            return `<div class="dr-expand-empty">Không có đơn nào.</div>`;
        }
        const liveCount = items.filter((x) => !x.ghost).length;
        const ghostCount = items.length - liveCount;
        const tposBase = 'https://tomato.tpos.vn/#/app/saleonline-order';
        const head = `
            <div class="dr-expand-head">
                <span class="dr-expand-summary">
                    <strong>${items.length}</strong> đơn — ${liveCount} live${ghostCount ? ` <span class="dr-expand-ghost-count" title="Đơn đã quét nhưng không còn trên TPOS live cùng ngày">${ghostCount} ghost</span>` : ''}
                </span>
            </div>`;
        const rows = items
            .map((it, i) => {
                const codFmt = it.ghost ? '<span class="muted">—</span>' : formatMoney(it.cod);
                const timeFmt = it.dateInvoice
                    ? new Date(it.dateInvoice).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                      })
                    : '';
                const zeroBadge =
                    !it.ghost && it.cod === 0 ? '<span class="dr-expand-zero-badge">0đ</span>' : '';
                const ghostBadge = it.ghost
                    ? '<span class="dr-expand-ghost-badge" title="Không còn trên TPOS live cùng ngày">ghost</span>'
                    : '';
                return `
                    <tr class="dr-expand-item ${it.ghost ? 'is-ghost' : ''} ${!it.ghost && it.cod === 0 ? 'is-zero' : ''}">
                        <td class="dr-expand-idx">${i + 1}</td>
                        <td class="dr-expand-num"><a href="${tposBase}?id=${encodeURIComponent(it.Number)}" target="_blank" rel="noopener">${escapeHtml(it.Number)}</a></td>
                        <td class="dr-expand-partner">${escapeHtml(it.partner || '—')}</td>
                        <td class="dr-expand-time">${timeFmt}</td>
                        <td class="dr-expand-cod num">${codFmt} ${zeroBadge}${ghostBadge}</td>
                    </tr>`;
            })
            .join('');
        return `${head}
            <table class="dr-expand-table">
                <thead><tr>
                    <th>#</th><th>Số đơn</th><th>Khách</th><th>Giờ</th><th class="num">COD</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // ── Hover preview (zoom on rê chuột) ──
    const hoverPreview = { currentCell: null };

    function ensureHoverPreview() {
        if (document.getElementById('drReportImgHover')) return;
        const el = document.createElement('div');
        el.id = 'drReportImgHover';
        el.className = 'dr-report-img-hover';
        el.innerHTML = '<img alt="Ảnh chứng từ (preview)" />';
        document.body.appendChild(el);
    }

    function showHoverPreview(cell, src) {
        ensureHoverPreview();
        const el = document.getElementById('drReportImgHover');
        const img = el.querySelector('img');
        if (img.getAttribute('src') !== src) img.src = src;
        hoverPreview.currentCell = cell;
        el.classList.add('open');
        positionHoverPreview(cell);
        // Re-position after the image natural size resolves (first paint may be 0)
        if (!img.complete) {
            img.onload = () => {
                if (hoverPreview.currentCell === cell) positionHoverPreview(cell);
            };
        }
    }

    function positionHoverPreview(cell) {
        const el = document.getElementById('drReportImgHover');
        if (!el) return;
        const rect = cell.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = rect.right + 12;
        if (left + w + 8 > vw) left = Math.max(8, rect.left - w - 12);
        let top = rect.top + rect.height / 2 - h / 2;
        if (top + h + 8 > vh) top = vh - h - 8;
        if (top < 8) top = 8;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    function hideHoverPreview() {
        const el = document.getElementById('drReportImgHover');
        if (el) el.classList.remove('open');
        hoverPreview.currentCell = null;
    }

    // ── Image modal ──
    function ensureImageModal() {
        if (document.getElementById('drReportImgModal')) return;
        const tpl = `
        <div class="dr-report-img-overlay" id="drReportImgModal" role="dialog" aria-modal="true">
          <div class="dr-report-img-window">
            <div class="dr-report-img-header">
              <div class="dr-report-img-title">
                <i class="fas fa-image"></i> Ảnh chứng từ
                <span class="dr-report-img-subtitle" id="drReportImgSubtitle"></span>
              </div>
              <button class="dr-report-close" id="drReportImgClose">&times;</button>
            </div>
            <div class="dr-report-img-body" id="drReportImgBody">
              <div class="dr-report-img-paste" id="drReportImgPaste" tabindex="0">
                <i class="fas fa-paste"></i>
                <p>Dán ảnh (Ctrl+V / Cmd+V) hoặc chọn file để thêm</p>
                <input type="file" accept="image/*" id="drReportImgFile" />
              </div>
              <img class="dr-report-img-preview" id="drReportImgPreview" alt="" style="display:none" />
            </div>
            <div class="dr-report-img-footer">
              <span class="dr-report-img-info" id="drReportImgInfo"></span>
              <div class="dr-report-img-actions">
                <button class="dr-btn dr-btn-danger" id="drReportImgDelete" style="display:none">
                  <i class="fas fa-trash"></i> Xóa
                </button>
                <button class="dr-btn" id="drReportImgCancel">Hủy</button>
                <button class="dr-btn dr-btn-primary" id="drReportImgSave" disabled>
                  <i class="fas fa-save"></i> Lưu
                </button>
              </div>
            </div>
          </div>
        </div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = tpl.trim();
        document.body.appendChild(wrap.firstChild);

        // Wire close + cancel
        document.getElementById('drReportImgClose').addEventListener('click', closeImageModal);
        document.getElementById('drReportImgCancel').addEventListener('click', closeImageModal);
        document.getElementById('drReportImgModal').addEventListener('click', (e) => {
            if (e.target.id === 'drReportImgModal') closeImageModal();
        });

        // File upload
        document.getElementById('drReportImgFile').addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
        });

        // Paste handler scoped to modal
        const pasteZone = document.getElementById('drReportImgPaste');
        const onPaste = async (e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        await handleImageFile(file);
                        return;
                    }
                }
            }
        };
        pasteZone.addEventListener('paste', onPaste);
        document.addEventListener('paste', (e) => {
            const modal = document.getElementById('drReportImgModal');
            if (modal && modal.classList.contains('open')) onPaste(e);
        });

        document.getElementById('drReportImgSave').addEventListener('click', saveCurrentImage);
        document.getElementById('drReportImgDelete').addEventListener('click', async () => {
            if (!confirm('Xóa ảnh hiện tại?')) return;
            const ctx = state._imgCtx;
            if (!ctx) return;
            try {
                await deleteImage(ctx.date, state.activeTab);
                closeImageModal();
                render();
            } catch (e) {
                alert('Xóa ảnh thất bại: ' + (e?.message || e));
            }
        });
    }

    async function handleImageFile(file) {
        try {
            const dataUrl = await compressImage(file);
            const preview = document.getElementById('drReportImgPreview');
            const paste = document.getElementById('drReportImgPaste');
            preview.src = dataUrl;
            preview.style.display = 'block';
            paste.style.display = 'none';
            document.getElementById('drReportImgSave').disabled = false;
            const sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
            document.getElementById('drReportImgInfo').textContent = `~${sizeKB} KB`;
            state._pendingImage = dataUrl;
        } catch (e) {
            alert('Lỗi xử lý ảnh: ' + e.message);
        }
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width;
                    let h = img.height;
                    const scale = Math.min(1, IMG_MAX_DIM / Math.max(w, h));
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY));
                };
                img.onerror = () => reject(new Error('Cannot read image'));
                img.src = reader.result;
            };
            reader.onerror = () => reject(new Error('Cannot read file'));
            reader.readAsDataURL(file);
        });
    }

    async function saveCurrentImage() {
        const ctx = state._imgCtx;
        if (!ctx || !state._pendingImage) return;
        const saveBtn = document.getElementById('drReportImgSave');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu…';
        }
        try {
            await uploadImage(ctx.date, state.activeTab, state._pendingImage);
            closeImageModal();
            render();
        } catch (e) {
            alert('Lưu ảnh thất bại: ' + (e?.message || e));
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu';
            }
        }
    }

    function openImageModal(date) {
        ensureImageModal();
        state._imgCtx = { date };
        state._pendingImage = null;

        const has = hasImageFlag(date, state.activeTab);
        const preview = document.getElementById('drReportImgPreview');
        const paste = document.getElementById('drReportImgPaste');
        const subtitle = document.getElementById('drReportImgSubtitle');
        const deleteBtn = document.getElementById('drReportImgDelete');
        const info = document.getElementById('drReportImgInfo');
        const saveBtn = document.getElementById('drReportImgSave');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu';
        const tabLabel = TABS.find((t) => t.key === state.activeTab)?.label || '';
        // `date` is the REAL date stored on the row; the column shows entry = real + 1
        subtitle.textContent = `${formatDDMMYYYY(realToEntry(date))} (thật ${formatDDMMYYYY(date)}) — ${tabLabel}`;

        if (has) {
            preview.src = imageUrl(date, state.activeTab, Date.now());
            preview.style.display = 'block';
            paste.style.display = 'none';
            deleteBtn.style.display = '';
            info.textContent = 'Đã lưu trên server';
        } else {
            preview.src = '';
            preview.style.display = 'none';
            paste.style.display = '';
            deleteBtn.style.display = 'none';
            info.textContent = '';
        }
        if (saveBtn) saveBtn.disabled = true; // enable khi paste/upload ảnh mới
        document.getElementById('drReportImgFile').value = '';
        document.getElementById('drReportImgModal').classList.add('open');
        // Focus paste zone for immediate Ctrl+V
        document.getElementById('drReportImgPaste').focus();
    }

    function closeImageModal() {
        const el = document.getElementById('drReportImgModal');
        if (el) el.classList.remove('open');
        state._pendingImage = null;
        state._imgCtx = null;
    }

    function open() {
        ensureModal();
        // Seed dates from main filter. Main filter uses REAL dates (delivery
        // date); the report inputs are ENTRY dates (= real + 1), so shift +1
        // when seeding to keep the same underlying data visible.
        const mainFrom = document.getElementById('drFilterFromDate')?.value;
        const mainTo = document.getElementById('drFilterToDate')?.value;
        const seedFrom = realToEntry(mainFrom);
        const seedTo = realToEntry(mainTo);
        const reportFrom = document.getElementById('drReportFrom');
        const reportTo = document.getElementById('drReportTo');
        // Only re-seed if user hasn't yet picked report-specific dates this session
        if (seedFrom && seedTo && (!state.fromDate || !state.toDate)) {
            state.fromDate = seedFrom;
            state.toDate = seedTo;
        }
        if (reportFrom) reportFrom.value = state.fromDate || seedFrom || '';
        if (reportTo) reportTo.value = state.toDate || seedTo || '';
        // View swap: hide main page sections via body class, show báo cáo block in-flow
        document.body.classList.add('dr-mode-report');
        document.getElementById('drReportModal').classList.add('open');
        // Scroll to top so user sees báo cáo header
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Migrate localStorage → DB (one-time, markers ngăn chạy lại):
        //   - billImage → Postgres BYTEA
        //   - slShip/thuVe/boCK/atruongCK/ckTruoc/note → delivery_assignment_overrides
        // Fire-and-forget — render() ngay không đợi.
        migrateLocalStorageImagesOnce().catch(() => {});
        migrateLocalStorageOverridesOnce()
            .then(() => {
                // Sau migrate, refetch range để cache nhận data từ DB
                state.overridesFetched.clear();
                if (state.fromDate && state.toDate) {
                    loadOverridesRange(entryToReal(state.fromDate), entryToReal(state.toDate)).then(
                        () => scheduleRender()
                    );
                }
            })
            .catch(() => {});
        render();
    }

    function close() {
        const el = document.getElementById('drReportModal');
        if (el) el.classList.remove('open');
        document.body.classList.remove('dr-mode-report');
    }

    function setupTripleClick() {
        const hint = document.getElementById('drPresetHint');
        if (!hint || hint.dataset.reportBound === '1') return;
        hint.dataset.reportBound = '1';
        hint.style.cursor = 'pointer';
        let clicks = 0;
        let timer = null;
        hint.addEventListener('click', () => {
            clicks++;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                clicks = 0;
            }, 600);
            if (clicks >= 3) {
                clicks = 0;
                if (timer) clearTimeout(timer);
                open();
            }
        });
    }

    // Init when DOM ready and DeliveryReport namespace exists
    document.addEventListener('DOMContentLoaded', () => {
        setupTripleClick();
    });

    // Expose for debug / programmatic open
    window.DeliveryReportReport = { open, close };
})();
