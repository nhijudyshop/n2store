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
        // Merges: gộp nhiều ngày liên tiếp thành 1 báo cáo (per group).
        merges: new Map(), // id → mergeObj
        mergesFetched: new Map(), // rangeKey → timestamp
        // Selection mode: user check rows để gộp. Set<dateStr> cho activeTab.
        selectedDates: new Set(),
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

    // ── Merges API: gộp ngày liên tiếp ──
    async function loadMergesRange(from, to) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl || !from || !to) return;
        const key = rangeKey(from, to);
        const last = state.mergesFetched.get(key);
        if (last && Date.now() - last < 60000) return;
        try {
            const url = `${renderUrl}/api/v2/delivery-assignments/merges?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const j = await resp.json();
            const list = j.data?.merges || [];
            // Replace merges trong range — giữ merges ngoài range
            for (const [id, m] of [...state.merges]) {
                if (m.fromDate <= to && m.toDate >= from) state.merges.delete(id);
            }
            for (const m of list) state.merges.set(m.id, m);
            state.mergesFetched.set(key, Date.now());
        } catch (e) {
            console.warn('[report] loadMergesRange failed:', e?.message);
        }
    }

    function findMergeForDate(date, group) {
        // Return merge nếu date ∈ [fromDate..toDate] của bất kỳ merge nào cho group
        for (const m of state.merges.values()) {
            if (m.groupName !== group) continue;
            if (date >= m.fromDate && date <= m.toDate) return m;
        }
        return null;
    }

    async function createMerge(groupName, fromDate, toDate) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) throw new Error('Render URL not available');
        const resp = await fetch(`${renderUrl}/api/v2/delivery-assignments/merges`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupName, fromDate, toDate }),
        });
        const j = await resp.json();
        if (!resp.ok || !j.success) {
            throw new Error(j.error || `HTTP ${resp.status}`);
        }
        const m = j.data?.merge;
        if (m) state.merges.set(m.id, m);
        // Bust cache for affected range
        for (const [k] of state.mergesFetched) {
            const [f, t] = k.split('__');
            if (fromDate <= t && toDate >= f) state.mergesFetched.delete(k);
        }
        return m;
    }

    async function updateMerge(id, patch) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        const cur = state.merges.get(id);
        if (!cur) return;
        const merged = { ...cur, ...patch };
        // Optimistic update
        state.merges.set(id, merged);
        try {
            const resp = await fetch(`${renderUrl}/api/v2/delivery-assignments/merges/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slShip: merged.slShip,
                    thuVe: merged.thuVe,
                    boCK: merged.boCK,
                    atruongCK: merged.atruongCK,
                    ckTruoc: merged.ckTruoc,
                    note: merged.note,
                    approved: merged.approved,
                    expanded: merged.expanded,
                }),
            });
            const j = await resp.json();
            if (j.success && j.data?.merge) state.merges.set(id, j.data.merge);
        } catch (e) {
            console.warn('[report] updateMerge failed:', e?.message);
        }
    }

    async function deleteMerge(id) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        state.merges.delete(id);
        try {
            await fetch(`${renderUrl}/api/v2/delivery-assignments/merges/${id}`, {
                method: 'DELETE',
            });
        } catch (e) {
            console.warn('[report] deleteMerge failed:', e?.message);
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
            <div class="dr-report-sticky-top" id="drReportStickyTop">
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
                  <th class="dr-report-th-approve" title="Đánh dấu đã duyệt — TỔNG CÒN LẠI về 0đ, dòng mờ đi">DUYỆT</th>
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

        // Sticky-top: cập nhật CSS var --dr-sticky-top-height = height của
        // sticky header (title + filter + tabs) → thead's `top` được CSS dùng
        // để dán xuống dưới sticky header chính xác, không cần magic number.
        const stickyEl = document.getElementById('drReportStickyTop');
        const modalEl = document.getElementById('drReportModal');
        if (stickyEl && modalEl) {
            const updateStickyHeight = () => {
                const h = stickyEl.offsetHeight || 0;
                modalEl.style.setProperty('--dr-sticky-top-height', h + 'px');
            };
            updateStickyHeight();
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(updateStickyHeight).observe(stickyEl);
            }
            window.addEventListener('resize', updateStickyHeight, { passive: true });
        }

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
                state.selectedDates.clear(); // selection theo group, đổi tab → reset
                render();
            });
            tabsEl.appendChild(b);
        });

        // Selection bar: floating bar dưới modal, hiện khi có ngày được chọn
        const selBar = document.createElement('div');
        selBar.id = 'drReportSelectionBar';
        selBar.className = 'dr-selection-bar';
        selBar.innerHTML = `
            <span class="dr-selection-count" id="drSelCount">0 ngày được chọn</span>
            <span class="dr-selection-hint" id="drSelHint"></span>
            <button class="dr-selection-btn dr-selection-btn-primary" id="drSelMergeBtn" disabled>Gộp</button>
            <button class="dr-selection-btn" id="drSelClearBtn">Hủy chọn</button>
        `;
        // Mount selection bar BÊN TRONG sticky-top → bar dán theo header lên đầu
        // bảng, không bị che bởi rows scroll qua. User thao tác "Gộp" dễ hơn.
        document.getElementById('drReportStickyTop').appendChild(selBar);
        document.getElementById('drSelMergeBtn').addEventListener('click', onMergeClick);
        document.getElementById('drSelClearBtn').addEventListener('click', () => {
            state.selectedDates.clear();
            scheduleRender();
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
                '<tr><td colspan="13" class="dr-report-empty">Chọn khoảng ngày để xem báo cáo</td></tr>';
            document.getElementById('drReportTfoot').innerHTML = '';
            return;
        }

        // Image flags + overrides + merges fire-and-forget (sẽ tự re-paint khi xong)
        Promise.all([
            loadImageFlags(realFrom, realTo),
            loadOverridesRange(realFrom, realTo),
            loadMergesRange(realFrom, realTo),
        ]).then(() => {
            // Repaint nếu range vẫn match (tránh flicker stale data)
            const curRealFrom = entryToReal(state.fromDate);
            const curRealTo = entryToReal(state.toDate);
            if (
                rangeKey(curRealFrom, curRealTo) === rangeKey(realFrom, realTo) &&
                document.getElementById('drReportTbody')?.children.length > 0
            ) {
                paintTable(eachDay(curRealFrom, curRealTo));
            }
        });

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
            '<tr><td colspan="13" class="dr-report-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu DB…</td></tr>';
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

        function computeDayAuto(d) {
            const sys = map[d] || { sysCount: 0, money: 0 };
            const slDon = sys.sysCount;
            const money = sys.money;
            const shipFee = slDon * SHIP_FEE_PER_ORDER;
            return { slDon, money, shipFee };
        }

        function renderSingleRow(d, isChild) {
            const { slDon, money, shipFee } = computeDayAuto(d);
            const ov = getOverride(d, state.activeTab);
            const slShip = Number(ov.slShip) || 0;
            const thuVe = Number(ov.thuVe) || 0;
            const totalAll = money - shipFee - slShip * SHIP_FEE_PER_ORDER + thuVe;
            const boCK = Number(ov.boCK) || 0;
            const atruongCK = Number(ov.atruongCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const approved = !!ov.approved;
            const totalLeftRaw = totalAll - boCK - atruongCK - ckTruoc;
            const totalLeftDisplay = approved ? 0 : totalLeftRaw;
            const note = ov.note || '';
            if (!isChild) {
                // Child rows skip cộng totals — đã cộng vào merge row parent
                totals.slDon += slDon;
                totals.money += money;
                totals.shipFee += shipFee;
                totals.slShip += slShip;
                totals.thuVe += thuVe;
                totals.totalAll += totalAll;
                totals.boCK += boCK;
                totals.atruongCK += atruongCK;
                totals.ckTruoc += ckTruoc;
                totals.totalLeft += approved ? 0 : totalLeftRaw;
            }
            const hasImg = hasImageFlag(d, state.activeTab);
            const selected = state.selectedDates.has(d);
            const cls = [
                approved ? 'is-approved' : '',
                selected ? 'is-selected' : '',
                isChild ? 'dr-merge-child' : '',
            ]
                .filter(Boolean)
                .join(' ');
            const disabled = isChild ? 'disabled' : '';
            const selectCell = isChild
                ? '<span class="dr-merge-child-indicator" title="Thuộc nhóm gộp">└</span>'
                : `<input type="checkbox" class="dr-row-select" data-action="select-day" ${selected ? 'checked' : ''} title="Chọn để gộp" />`;
            return `<tr data-date="${d}" class="${cls}">
                <td class="date clickable" data-action="toggle-expand" title="Bấm để xem danh sách ${slDon} đơn (ngày thật: ${formatDDMMYYYY(d)})">${selectCell}<i class="fas fa-chevron-right dr-expand-chevron"></i> ${formatDDMMYYYY(realToEntry(d))}</td>
                <td class="num strong clickable" data-action="toggle-expand" title="Bấm để xem chi tiết ${slDon} đơn">${formatNumber(slDon)}</td>
                <td class="num clickable money-cell ${hasImg ? 'has-img' : 'no-img'}" data-action="open-img" title="${hasImg ? 'Bấm để xem/sửa ảnh' : 'Bấm để thêm ảnh chứng từ'}">
                    <span class="money-val">${formatMoney(money)}</span>
                    <span class="money-ico">${hasImg ? '<i class="fas fa-image"></i>' : '<i class="far fa-image"></i>'}</span>
                </td>
                <td class="num muted">${formatMoney(shipFee)}</td>
                <td class="num"><input type="number" min="0" data-field="slShip" value="${slShip || ''}" placeholder="0" ${disabled} /></td>
                <td class="num"><input type="text" data-field="thuVe" value="${thuVe ? formatMoney(thuVe) : ''}" placeholder="0" ${disabled} /></td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num"><input type="text" data-field="boCK" value="${boCK ? formatMoney(boCK) : ''}" placeholder="0" ${disabled} /></td>
                <td class="num"><input type="text" data-field="atruongCK" value="${atruongCK ? formatMoney(atruongCK) : ''}" placeholder="0" ${disabled} /></td>
                <td class="num"><input type="text" data-field="ckTruoc" value="${ckTruoc ? formatMoney(ckTruoc) : ''}" placeholder="0" ${disabled} /></td>
                <td class="num strong ${totalLeftDisplay < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeftDisplay)}</td>
                <td class="note-cell"><textarea data-field="note" rows="1" placeholder="Ghi chú…" title="${note ? escapeHtml(note) : 'Ghi chú cho ngày này'}" ${disabled}>${escapeHtml(note)}</textarea></td>
                <td class="dr-report-td-approve"><label class="dr-approve-toggle"><input type="checkbox" data-field="approved" ${approved ? 'checked' : ''} ${disabled} /><span></span></label></td>
            </tr>`;
        }

        function renderMergeRow(merge, childDates) {
            // Sum tự động từ overrides của children — để cell gộp phản ánh dữ liệu user đã
            // nhập trong từng ngày con (slShip/thuVe/boCK/atruongCK/ckTruoc/note).
            // Nếu user nhập trực tiếp vào ô gộp (merge.field !== null/''), giá trị đó OVERRIDE
            // sum. Để trống ô gộp = "lấy sum của children" (placeholder hiển thị sum).
            let sumSlDon = 0,
                sumMoney = 0,
                sumShipFee = 0,
                sumSlShip = 0,
                sumThuVe = 0,
                sumBoCK = 0,
                sumAtruongCK = 0,
                sumCkTruoc = 0;
            const childNotes = [];
            for (const cd of childDates) {
                const da = computeDayAuto(cd);
                sumSlDon += da.slDon;
                sumMoney += da.money;
                sumShipFee += da.shipFee;
                const ovChild = getOverride(cd, state.activeTab);
                sumSlShip += Number(ovChild.slShip) || 0;
                sumThuVe += Number(ovChild.thuVe) || 0;
                sumBoCK += Number(ovChild.boCK) || 0;
                sumAtruongCK += Number(ovChild.atruongCK) || 0;
                sumCkTruoc += Number(ovChild.ckTruoc) || 0;
                if (ovChild.note && String(ovChild.note).trim()) {
                    childNotes.push(
                        `${formatDDMMYYYY(realToEntry(cd))}: ${String(ovChild.note).trim()}`
                    );
                }
            }
            // Helper: lấy giá trị effective — merge.field nếu được set, không thì lấy sum
            const useMerge = (mv) => mv != null && mv !== '' && Number(mv) !== 0;
            const slShip = useMerge(merge.slShip) ? Number(merge.slShip) : sumSlShip;
            const thuVe = useMerge(merge.thuVe) ? Number(merge.thuVe) : sumThuVe;
            const totalAll = sumMoney - sumShipFee - slShip * SHIP_FEE_PER_ORDER + thuVe;
            const boCK = useMerge(merge.boCK) ? Number(merge.boCK) : sumBoCK;
            const atruongCK = useMerge(merge.atruongCK) ? Number(merge.atruongCK) : sumAtruongCK;
            const ckTruoc = useMerge(merge.ckTruoc) ? Number(merge.ckTruoc) : sumCkTruoc;
            const approved = !!merge.approved;
            const expanded = !!merge.expanded;
            const totalLeftRaw = totalAll - boCK - atruongCK - ckTruoc;
            const totalLeftDisplay = approved ? 0 : totalLeftRaw;
            totals.slDon += sumSlDon;
            totals.money += sumMoney;
            totals.shipFee += sumShipFee;
            totals.slShip += slShip;
            totals.thuVe += thuVe;
            totals.totalAll += totalAll;
            totals.boCK += boCK;
            totals.atruongCK += atruongCK;
            totals.ckTruoc += ckTruoc;
            totals.totalLeft += approved ? 0 : totalLeftRaw;
            const rangeLabel = `${formatDDMMYYYY(realToEntry(merge.fromDate))} → ${formatDDMMYYYY(realToEntry(merge.toDate))}`;
            const daysInRange = childDates.length;
            const totalDays =
                Math.round(
                    (new Date(merge.toDate + 'T00:00:00') -
                        new Date(merge.fromDate + 'T00:00:00')) /
                        86400000
                ) + 1;
            const partial = daysInRange < totalDays;
            const cls = [
                'dr-merge-row',
                approved ? 'is-approved' : '',
                expanded ? 'is-expanded' : '',
            ]
                .filter(Boolean)
                .join(' ');
            const chevIcon = expanded ? 'down' : 'right';
            return `<tr data-merge-id="${merge.id}" class="${cls}">
                <td class="date">
                    <button class="dr-merge-chev" data-action="toggle-merge" title="${expanded ? 'Thu gọn' : 'Mở rộng các ngày con'}"><i class="fas fa-chevron-${chevIcon}"></i></button>
                    <span class="dr-merge-range">${rangeLabel}</span>
                    <span class="dr-merge-count" title="${partial ? 'Chỉ tính ' + daysInRange + '/' + totalDays + ' ngày trong khoảng filter' : daysInRange + ' ngày gộp'}">${daysInRange}${partial ? '/' + totalDays : ''} ngày</span>
                    <button class="dr-merge-unmerge" data-action="unmerge" title="Bỏ gộp">×</button>
                </td>
                <td class="num strong">${formatNumber(sumSlDon)}</td>
                <td class="num">${formatMoney(sumMoney)}</td>
                <td class="num muted">${formatMoney(sumShipFee)}</td>
                <td class="num"><input type="number" min="0" data-field="slShip" value="${useMerge(merge.slShip) ? merge.slShip : ''}" placeholder="${sumSlShip || 0}" title="${useMerge(merge.slShip) ? 'Giá trị nhập tay (override sum=' + sumSlShip + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num"><input type="text" data-field="thuVe" value="${useMerge(merge.thuVe) ? formatMoney(merge.thuVe) : ''}" placeholder="${sumThuVe ? formatMoney(sumThuVe) : '0'}" title="${useMerge(merge.thuVe) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumThuVe) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num"><input type="text" data-field="boCK" value="${useMerge(merge.boCK) ? formatMoney(merge.boCK) : ''}" placeholder="${sumBoCK ? formatMoney(sumBoCK) : '0'}" title="${useMerge(merge.boCK) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumBoCK) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num"><input type="text" data-field="atruongCK" value="${useMerge(merge.atruongCK) ? formatMoney(merge.atruongCK) : ''}" placeholder="${sumAtruongCK ? formatMoney(sumAtruongCK) : '0'}" title="${useMerge(merge.atruongCK) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumAtruongCK) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num"><input type="text" data-field="ckTruoc" value="${useMerge(merge.ckTruoc) ? formatMoney(merge.ckTruoc) : ''}" placeholder="${sumCkTruoc ? formatMoney(sumCkTruoc) : '0'}" title="${useMerge(merge.ckTruoc) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumCkTruoc) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num strong ${totalLeftDisplay < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeftDisplay)}</td>
                <td class="note-cell"><textarea data-field="note" rows="1" placeholder="${escapeHtml(childNotes.length ? childNotes.join(' | ') : 'Ghi chú…')}" title="${escapeHtml([merge.note ? `Ghi chú gộp: ${merge.note}` : '', childNotes.length ? `Ghi chú từ children:\n${childNotes.join('\n')}` : ''].filter(Boolean).join('\n\n') || 'Ghi chú cho dòng gộp')}">${escapeHtml(merge.note || '')}</textarea></td>
                <td class="dr-report-td-approve"><label class="dr-approve-toggle"><input type="checkbox" data-field="approved" ${approved ? 'checked' : ''} /><span></span></label></td>
            </tr>`;
        }

        const rendered = new Set();
        const rowsHtml = [];
        for (const d of dates) {
            if (rendered.has(d)) continue;
            const merge = findMergeForDate(d, state.activeTab);
            if (merge) {
                const childDates = dates.filter((cd) => cd >= merge.fromDate && cd <= merge.toDate);
                for (const cd of childDates) rendered.add(cd);
                rowsHtml.push(renderMergeRow(merge, childDates));
                if (merge.expanded) {
                    for (const cd of childDates) rowsHtml.push(renderSingleRow(cd, true));
                }
            } else {
                rowsHtml.push(renderSingleRow(d, false));
                rendered.add(d);
            }
        }

        document.getElementById('drReportTbody').innerHTML = rowsHtml.join('');
        updateSelectionBar();

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
            <th></th>
        </tr>`;

        // Delegation set up once in ensureModal() — no per-cell binding here.
    }

    // Update selection bar based on state.selectedDates
    function updateSelectionBar() {
        const bar = document.getElementById('drReportSelectionBar');
        if (!bar) return;
        const count = state.selectedDates.size;
        const countEl = document.getElementById('drSelCount');
        const hintEl = document.getElementById('drSelHint');
        const btn = document.getElementById('drSelMergeBtn');
        if (count === 0) {
            bar.classList.remove('open');
            if (countEl) countEl.textContent = '0 ngày được chọn';
            if (hintEl) hintEl.textContent = '';
            if (btn) btn.disabled = true;
            return;
        }
        bar.classList.add('open');
        if (countEl) countEl.textContent = `${count} ngày được chọn`;
        // Validate consecutive — dùng shiftDay (local TZ) thay vì toISOString().
        // Bug cũ: VN UTC+7 → `new Date('2026-05-17T00:00:00').toISOString()` ra
        // '2026-05-16T17:00:00Z' → slice(0,10)='2026-05-16' → off-by-1 → check
        // sai mọi ngày liên tiếp.
        const sorted = [...state.selectedDates].sort();
        let consecutive = true;
        for (let i = 1; i < sorted.length; i++) {
            if (shiftDay(sorted[i - 1], 1) !== sorted[i]) {
                consecutive = false;
                break;
            }
        }
        // Validate không trùng merge nào sẵn có
        let overlapsMerge = false;
        for (const d of sorted) {
            if (findMergeForDate(d, state.activeTab)) {
                overlapsMerge = true;
                break;
            }
        }
        const canMerge = count >= 2 && consecutive && !overlapsMerge;
        if (btn) btn.disabled = !canMerge;
        if (hintEl) {
            if (overlapsMerge) hintEl.textContent = '⚠ Có ngày đã thuộc nhóm gộp khác';
            else if (count < 2) hintEl.textContent = 'Chọn ≥ 2 ngày liên tiếp';
            else if (!consecutive) hintEl.textContent = '⚠ Các ngày không liên tiếp';
            else
                hintEl.textContent = `${formatDDMMYYYY(realToEntry(sorted[0]))} → ${formatDDMMYYYY(realToEntry(sorted[sorted.length - 1]))}`;
        }
    }

    async function onMergeClick() {
        const sorted = [...state.selectedDates].sort();
        if (sorted.length < 2) return;
        const fromDate = sorted[0];
        const toDate = sorted[sorted.length - 1];
        const btn = document.getElementById('drSelMergeBtn');
        if (btn) btn.disabled = true;
        try {
            await createMerge(state.activeTab, fromDate, toDate);
            state.selectedDates.clear();
            scheduleRender();
        } catch (e) {
            alert('Gộp thất bại: ' + (e?.message || e));
            if (btn) btn.disabled = false;
        }
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
            // Checkbox (approved) là field non-numeric — change handler đã xử lý riêng.
            // Nếu không skip ở đây, parseMoney(cb.value="on")=0 sẽ ghi đè approved=true vừa set.
            if (el.type === 'checkbox') return;
            const field = el.dataset.field;
            let value;
            if (field === 'slShip') {
                value = el.value === '' ? '' : Math.max(0, Number(el.value) || 0);
            } else if (field === 'note') {
                value = el.value.trim();
            } else {
                value = parseMoney(el.value);
            }
            const mergeRow = el.closest('tr[data-merge-id]');
            if (mergeRow) {
                const id = Number(mergeRow.dataset.mergeId);
                const m = state.merges.get(id);
                if (!m) return;
                const prev = m[field];
                const prevNorm = prev == null || prev === '' ? '' : prev;
                const nextNorm = value == null || value === '' ? '' : value;
                if (String(prevNorm) === String(nextNorm)) return;
                updateMerge(id, { [field]: value });
                if (field !== 'note') scheduleRender();
                return;
            }
            const row = el.closest('tr[data-date]');
            if (!row) return;
            // Child rows trong merge: input disabled, skip (defensive)
            if (row.classList.contains('dr-merge-child')) return;
            const ov = getOverride(row.dataset.date, state.activeTab);
            const prev = ov[field];
            const prevNorm = prev == null || prev === '' ? '' : prev;
            const nextNorm = value == null || value === '' ? '' : value;
            if (String(prevNorm) === String(nextNorm)) return;
            setOverride(row.dataset.date, state.activeTab, { [field]: value });
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

        // Checkbox approved + select-day — listen 'change' (focusout không reliable cho checkbox)
        tbody.addEventListener('change', (e) => {
            const el = e.target;
            if (!el || el.type !== 'checkbox') return;
            // Select-day checkbox: toggle state.selectedDates
            if (el.dataset.action === 'select-day') {
                const row = el.closest('tr[data-date]');
                if (!row) return;
                const d = row.dataset.date;
                if (el.checked) state.selectedDates.add(d);
                else state.selectedDates.delete(d);
                row.classList.toggle('is-selected', el.checked);
                updateSelectionBar();
                return;
            }
            // Approved checkbox
            if (el.dataset.field === 'approved') {
                const mergeRow = el.closest('tr[data-merge-id]');
                if (mergeRow) {
                    const id = Number(mergeRow.dataset.mergeId);
                    const m = state.merges.get(id);
                    if (!m) return;
                    const next = !!el.checked;
                    if (!!m.approved === next) return;
                    updateMerge(id, { approved: next });
                    scheduleRender();
                    return;
                }
                const row = el.closest('tr[data-date]');
                if (!row || row.classList.contains('dr-merge-child')) return;
                const ov = getOverride(row.dataset.date, state.activeTab);
                const next = !!el.checked;
                if (!!ov.approved === next) return;
                setOverride(row.dataset.date, state.activeTab, { approved: next });
                scheduleRender();
            }
        });

        tbody.addEventListener('click', (e) => {
            // Toggle merge expanded
            const chev = e.target.closest && e.target.closest('button[data-action="toggle-merge"]');
            if (chev) {
                const tr = chev.closest('tr[data-merge-id]');
                if (!tr) return;
                const id = Number(tr.dataset.mergeId);
                const m = state.merges.get(id);
                if (!m) return;
                updateMerge(id, { expanded: !m.expanded });
                scheduleRender();
                return;
            }
            // Unmerge — no confirm, instant action (user feedback request)
            const unmerge = e.target.closest && e.target.closest('button[data-action="unmerge"]');
            if (unmerge) {
                const tr = unmerge.closest('tr[data-merge-id]');
                if (!tr) return;
                const id = Number(tr.dataset.mergeId);
                deleteMerge(id).finally(() => scheduleRender());
                return;
            }
            const reset = e.target.closest && e.target.closest('.dr-report-reset');
            if (reset) {
                setOverride(reset.dataset.date, state.activeTab, { [reset.dataset.field]: '' });
                scheduleRender();
                return;
            }
            const imgCell = e.target.closest && e.target.closest('td[data-action="open-img"]');
            if (imgCell) {
                const row = imgCell.closest('tr[data-date]');
                if (row && !row.classList.contains('dr-merge-row')) {
                    openImageModal(row.dataset.date);
                }
                return;
            }
            const expandCell =
                e.target.closest && e.target.closest('td[data-action="toggle-expand"]');
            if (expandCell) {
                // Bỏ qua nếu click trúng checkbox select-day (đã có change handler riêng)
                if (e.target.closest && e.target.closest('[data-action="select-day"]')) return;
                const row = expandCell.closest('tr[data-date]');
                if (row && !row.classList.contains('dr-merge-row')) toggleExpandRow(row);
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
        const colCount = 13; // số cột table — đồng bộ với colspan empty/loading state

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
        // Default range = "Tháng này" (ngày 1 → hôm nay) khi user mở modal lần đầu trong session.
        // Báo cáo workflow thường review cả tháng nên Tháng này hợp lý hơn Hôm nay từ main filter.
        // Nếu user đã đổi range trong session (state.fromDate/state.toDate đã set) → giữ nguyên.
        const reportFrom = document.getElementById('drReportFrom');
        const reportTo = document.getElementById('drReportTo');
        if (!state.fromDate || !state.toDate) {
            const today = new Date();
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            const fmt = (d) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            state.fromDate = fmt(first);
            state.toDate = fmt(today);
        }
        if (reportFrom) reportFrom.value = state.fromDate;
        if (reportTo) reportTo.value = state.toDate;
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
