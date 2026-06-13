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

    // Phí ship per đơn theo từng nhóm (user chỉnh được qua nút Cài đặt ⚙).
    // Default: tomato/nap = 23k, city = 20k. Persist localStorage per machine.
    const SHIP_FEE_DEFAULTS = { tomato: 23000, nap: 23000, city: 20000 };
    const SHIP_FEE_STORAGE_KEY = 'dr-report-ship-fees-v1';
    const _shipFees = (() => {
        try {
            const raw = localStorage.getItem(SHIP_FEE_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...SHIP_FEE_DEFAULTS, ...parsed };
            }
        } catch (_) {}
        return { ...SHIP_FEE_DEFAULTS };
    })();
    function getShipFee(tab) {
        const v = Number(_shipFees[tab]);
        return Number.isFinite(v) && v >= 0 ? v : SHIP_FEE_DEFAULTS[tab] || 0;
    }
    function setShipFee(tab, value) {
        _shipFees[tab] = Math.max(0, Number(value) || 0);
        try {
            localStorage.setItem(SHIP_FEE_STORAGE_KEY, JSON.stringify(_shipFees));
        } catch (_) {}
    }

    // Date shift (per (realDate, group)) — cho phép chỉnh "ngày ảo" hiển thị.
    // VD: 29/04 → 02/05, 30/04 → 02/05 thì 2 ngày con đều dồn vào 02/05 (aggregate).
    //
    // 2026-05-26: MIGRATED localStorage → Postgres + SSE.
    // Server table `delivery_assignment_date_shifts` là source of truth. Client
    // giữ in-memory cache `_dateShifts` đồng bộ với server qua `loadDateShifts
    // Range()` + SSE topic 'delivery_assignments'. localStorage chỉ dùng cho
    // 1-time migration (cũ → DB) rồi purge.
    //
    // Lý do: trước đây mỗi máy có localStorage riêng → admin shift trên máy A,
    // boss mở máy B không thấy (vì localStorage tách biệt).
    const DATE_SHIFTS_KEY = 'dr-date-shifts-v1'; // legacy localStorage key (kept for migration)
    const DATE_SHIFTS_MIGRATED_KEY = 'dr-date-shifts-migrated-v1';
    const _dateShifts = {}; // in-memory cache, populated by loadDateShiftsRange
    const _dateShiftsFetched = new Map(); // rangeKey → timestamp (TTL 60s)
    const _shiftKey = (date, group) => `${date}__${group}`;
    function getDisplayDate(realDate, group) {
        return _dateShifts[_shiftKey(realDate, group)] || realDate;
    }
    function isDateShifted(realDate, group) {
        const v = _dateShifts[_shiftKey(realDate, group)];
        return !!v && v !== realDate;
    }
    // setDateShift: write-through cache. Optimistic update local, PUT server.
    // Async nhưng caller không cần await — UI repaint ngay, SSE sẽ correct nếu
    // server reject. Trả về Promise để admin flow có thể await nếu cần.
    function setDateShift(realDate, group, displayDate) {
        const k = _shiftKey(realDate, group);
        if (!displayDate || displayDate === realDate) {
            delete _dateShifts[k];
        } else {
            _dateShifts[k] = displayDate;
        }
        return persistDateShift(realDate, group, displayDate).catch((e) =>
            console.warn(`[report] persist date-shift ${k} failed:`, e?.message)
        );
    }

    async function persistDateShift(realDate, group, displayDate) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        const url = `${renderUrl}/api/v2/delivery-assignments/date-shifts/${encodeURIComponent(realDate)}/${encodeURIComponent(group)}`;
        const resp = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayDate: displayDate || null }),
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${txt}`);
        }
    }

    // Load shifts overlapping [from, to] (either real_date or display_date in range).
    // Bust cache + re-fetch khi user paint mới (rangeKey-based, TTL 60s).
    async function loadDateShiftsRange(from, to) {
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl || !from || !to) return;
        const key = `${from}__${to}`;
        const last = _dateShiftsFetched.get(key);
        if (last && Date.now() - last < 60000) return;
        try {
            const url = `${renderUrl}/api/v2/delivery-assignments/date-shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const j = await resp.json();
            const fresh = j.data?.shifts || {};
            // Replace entries có real_date HOẶC display_date trong range.
            const inRange = new Set();
            const start = new Date(from + 'T00:00:00');
            const end = new Date(to + 'T00:00:00');
            for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
                const y = cur.getFullYear();
                const m = String(cur.getMonth() + 1).padStart(2, '0');
                const d = String(cur.getDate()).padStart(2, '0');
                inRange.add(`${y}-${m}-${d}`);
            }
            for (const k of Object.keys(_dateShifts)) {
                const [realDate] = k.split('__');
                const target = _dateShifts[k];
                if (inRange.has(realDate) || inRange.has(target)) delete _dateShifts[k];
            }
            for (const k in fresh) _dateShifts[k] = fresh[k];
            _dateShiftsFetched.set(key, Date.now());
        } catch (e) {
            console.warn('[report] loadDateShiftsRange failed:', e?.message);
        }
    }

    // One-time migration: scan localStorage → upload all shifts → mark migrated.
    async function migrateLocalStorageDateShiftsOnce() {
        if (localStorage.getItem(DATE_SHIFTS_MIGRATED_KEY) === '1') return;
        const renderUrl = window.DeliveryReport?._renderUrl;
        if (!renderUrl) return;
        let legacy = {};
        try {
            legacy = JSON.parse(localStorage.getItem(DATE_SHIFTS_KEY) || '{}');
        } catch (_) {}
        const entries = Object.entries(legacy).filter(([k, v]) => {
            if (!k || !v) return false;
            const m = /^(\d{4}-\d{2}-\d{2})__(.+)$/.exec(k);
            return !!m && /^\d{4}-\d{2}-\d{2}$/.test(v) && m[1] !== v;
        });
        if (entries.length === 0) {
            localStorage.setItem(DATE_SHIFTS_MIGRATED_KEY, '1');
            localStorage.removeItem(DATE_SHIFTS_KEY);
            return;
        }
        console.log(`[report] migrating ${entries.length} date-shifts localStorage → DB…`);
        let ok = 0;
        for (const [k, displayDate] of entries) {
            const m = /^(\d{4}-\d{2}-\d{2})__(.+)$/.exec(k);
            if (!m) continue;
            const [, realDate, group] = m;
            try {
                await persistDateShift(realDate, group, displayDate);
                ok++;
            } catch (e) {
                console.warn(`[report] migrate date-shift fail ${k}:`, e?.message);
            }
        }
        localStorage.setItem(DATE_SHIFTS_MIGRATED_KEY, '1');
        localStorage.removeItem(DATE_SHIFTS_KEY);
        console.log(`[report] migrated ${ok}/${entries.length} date-shifts → DB`);
    }

    // Admin gating: chỉ tag Admin mới thấy + bấm được DUYỆT. Non-admin xem báo
    // cáo bình thường (treat approved=false → thấy đầy đủ outstanding amount).
    //
    // Canonical source: sessionStorage/localStorage 'loginindex_auth' (cùng key
    // với shared/js/permissions-helper.js → PermissionHelper.isAdmin()). Auth
    // object có dạng { isAdmin:true, roleTemplate:'admin', userType:'admin-*',
    // checkLogin:'admin'|0, ... }. Tag "Admin" UI ở account management map
    // sang `roleTemplate='admin'` hoặc `isAdmin=true` flag.
    function _isAdmin() {
        try {
            // 1. Canonical: loginindex_auth (PermissionHelper source of truth)
            //    Nếu canonical hiện diện → STRICT, không fallback legacy
            //    (tránh legacy localStorage.userType cũ override quyết định).
            const raw =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth');
            if (raw) {
                const auth = JSON.parse(raw);
                if (auth?.isAdmin === true) return true;
                if (auth?.roleTemplate === 'admin') return true;
                const at = String(auth?.userType || '').toLowerCase();
                if (at.startsWith('admin')) return true;
                if (auth?.checkLogin === 'admin' || auth?.checkLogin === 0) return true;
                return false; // Canonical nói KHÔNG admin → dừng, không fallback
            }
            // Canonical absent (rare) → thử fallback
            const am = window.authManager?.getAuthData?.();
            if (am?.isAdmin === true || am?.roleTemplate === 'admin') return true;
            if (window.PermissionHelper?.isAdmin?.()) return true;
            const ut = (localStorage.getItem('userType') || '').toLowerCase();
            if (ut.startsWith('admin')) return true;
            return false;
        } catch {
            return false;
        }
    }
    // Note: KHÔNG còn dùng effectiveApproved() — đã đơn giản hoá:
    // - Approved rows: admin thấy mờ (dòng opacity 0.45). TỔNG CÒN LẠI GIỮ NGUYÊN
    //   giá trị (KHÔNG về 0 nữa — đổi 2026-05-31); non-admin bị ẩn HẲN render loop
    // - Tab totals + TỔNG chân bảng: VẪN cộng dòng đã duyệt (khớp giá trị ô hiển thị)
    // - Approve cell HTML: dùng _isAdmin() trực tiếp (checkbox vs lock placeholder)
    // Debug helper — gõ vào DevTools: window.__DR_authDebug() để xem chi tiết
    // lý do bị/không bị detect là Admin.
    window.__DR_authDebug = function () {
        const raw =
            sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth');
        let auth = null;
        try {
            auth = raw ? JSON.parse(raw) : null;
        } catch {}
        return {
            isAdminResult: _isAdmin(),
            authPresent: !!auth,
            isAdminFlag: auth?.isAdmin,
            roleTemplate: auth?.roleTemplate,
            authUserType: auth?.userType,
            checkLogin: auth?.checkLogin,
            legacyUserTypeLS: localStorage.getItem('userType'),
            hasAuthManager: !!window.authManager,
            authManagerIsAdmin:
                window.authManager?.getAuthData?.()?.isAdmin === true ||
                window.authManager?.getAuthData?.()?.roleTemplate === 'admin',
            hasPermissionHelper: !!window.PermissionHelper,
        };
    };

    function toggleShipFeeSettings(anchorBtn) {
        const existing = document.getElementById('drShipFeePopover');
        if (existing) {
            existing.remove();
            return;
        }
        const pop = document.createElement('div');
        pop.id = 'drShipFeePopover';
        pop.className = 'dr-ship-fee-popover';
        pop.innerHTML = `
            <div class="dr-ship-fee-header"><i class="fas fa-truck"></i> Phí ship per đơn</div>
            ${TABS.map(
                (t) => `
                <label class="dr-ship-fee-row" style="--tab-color:${t.color}">
                    <span class="dr-ship-fee-label">${t.label}</span>
                    <input type="number" min="0" step="500" data-tab="${t.key}" value="${getShipFee(t.key)}" />
                    <span class="dr-ship-fee-unit">đ/đơn</span>
                </label>
            `
            ).join('')}
            <div class="dr-ship-fee-actions">
                <button type="button" data-action="reset" title="Khôi phục mặc định (TOMATO/NAP=23k, THÀNH PHỐ=20k)">Mặc định</button>
                <button type="button" data-action="save" class="primary">Lưu</button>
            </div>
        `;
        document.body.appendChild(pop);
        const rect = anchorBtn.getBoundingClientRect();
        pop.style.top = `${rect.bottom + 8}px`;
        pop.style.left = `${Math.max(8, rect.left)}px`;
        // Save
        pop.querySelector('[data-action="save"]').addEventListener('click', () => {
            pop.querySelectorAll('input[data-tab]').forEach((inp) => {
                setShipFee(inp.dataset.tab, inp.value);
            });
            pop.remove();
            scheduleRender();
        });
        // Reset to defaults
        pop.querySelector('[data-action="reset"]').addEventListener('click', () => {
            Object.entries(SHIP_FEE_DEFAULTS).forEach(([k, v]) => setShipFee(k, v));
            pop.remove();
            scheduleRender();
        });
        // Click outside closes
        setTimeout(() => {
            const onOutside = (e) => {
                if (
                    !pop.contains(e.target) &&
                    e.target !== anchorBtn &&
                    !anchorBtn.contains(e.target)
                ) {
                    pop.remove();
                    document.removeEventListener('click', onOutside, true);
                }
            };
            document.addEventListener('click', onOutside, true);
        }, 0);
    }
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

    // Enumerate tất cả ngày (YYYY-MM-DD) trong khoảng merge.fromDate..merge.toDate (inclusive)
    function getMergeChildDates(merge) {
        const out = [];
        const start = new Date(merge.fromDate + 'T00:00:00');
        const end = new Date(merge.toDate + 'T00:00:00');
        for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            out.push(`${y}-${m}-${d}`);
        }
        return out;
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

    // shiftDay vẫn giữ (dùng cho consecutive merge validation, eachDay loop).
    // ENTRY date = REAL date — 2026-05-26 align với main page (user pick ngày
    // 29/04 thì lookup data ship-date 29/04, không shift -1 nữa).
    // Trước đây: entryToReal = real - 1, realToEntry = real + 1 → off-by-one
    // với main page (treat input là real ship date). Đã fix.
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
    const entryToReal = (iso) => iso || '';
    const realToEntry = (iso) => iso || '';

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
                <div class="dr-report-tabs-totals" id="drReportTabsTotals" title="Tổng còn lại từng nhóm trong khoảng ngày đang chọn"></div>
              </div>
            </div>

            <div class="dr-report-table-wrap">
              <table class="dr-report-table" id="drReportTable">
                <thead><tr id="drReportHeadRow"></tr></thead>
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

        // Settings button (gear) — mở popover cài phí ship per tab
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'dr-report-settings-btn';
        settingsBtn.type = 'button';
        settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        settingsBtn.title = 'Cài đặt phí ship per đơn theo từng nhóm';
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleShipFeeSettings(settingsBtn);
        });
        tabsEl.appendChild(settingsBtn);

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

    // ── Cấu hình cột động theo tab (2026-05-31) ──
    // ATRƯỜNG NHẬN CK: XÓA HẲN ở mọi tab (không render, không tính vào tổng).
    // CK TRƯỚC: chỉ hiện ở TOMATO/NAP; XÓA HẲN ở THÀNH PHỐ (city).
    // Không dùng CSS ẩn — cell không tồn tại trong DOM với tab tương ứng.
    function showCkTruocFor(tab) {
        return tab !== 'city';
    }
    // Số cột hiện tại (dùng cho colspan của expand/empty/loading rows).
    // Base 13 − 1 (ATRƯỜNG luôn bỏ) − (1 nếu city bỏ CK TRƯỚC).
    function currentColCount() {
        return showCkTruocFor(state.activeTab) ? 12 : 11;
    }

    // Build header động theo tab — ATRƯỜNG NHẬN CK luôn bỏ, CK TRƯỚC bỏ ở city.
    function paintThead() {
        const row = document.getElementById('drReportHeadRow');
        if (!row) return;
        const showCk = showCkTruocFor(state.activeTab);
        row.innerHTML =
            '<th>NGÀY</th>' +
            '<th class="num">SL ĐƠN</th>' +
            '<th class="num">TIỀN</th>' +
            '<th class="num">PHÍ SHIP</th>' +
            '<th class="num input-col" title="Số đơn ship riêng, trừ khỏi TỔNG TẤT CẢ (SL × 23.000)">SL ĐƠN SHIP</th>' +
            '<th class="num input-col" title="Tiền thu về, cộng thêm vào TỔNG TẤT CẢ">THU VỀ</th>' +
            '<th class="num">TỔNG TẤT CẢ</th>' +
            '<th class="num input-col">BO NHẬN CK</th>' +
            (showCk ? '<th class="num input-col">CK TRƯỚC</th>' : '') +
            '<th class="num">TỔNG CÒN LẠI</th>' +
            '<th>GHI CHÚ</th>' +
            '<th class="dr-report-th-approve" title="Đánh dấu đã duyệt — dòng mờ đi, TỔNG CÒN LẠI vẫn giữ nguyên giá trị">DUYỆT</th>';
    }

    function render() {
        // Cheap, sync UI updates first — never await for these
        updateTabClasses();
        paintThead(); // header động theo tab (bỏ ATRƯỜNG, bỏ CK TRƯỚC ở city)
        // state.fromDate / state.toDate are ENTRY dates (what the user picks
        // and what the NGÀY column shows). Data fetched/aggregated by REAL
        // dates = entry − 1. Storage and overrides are unchanged.
        const realFrom = entryToReal(state.fromDate);
        const realTo = entryToReal(state.toDate);
        const dates = eachDay(realFrom, realTo); // iterate real dates
        // Extended fetch range: include shift sources có target ∈ filter.
        // VD filter [02/05, 02/05] với shift {29/04→02/05, 30/04→02/05} →
        // fetch [29/04, 02/05] để aggregate row tại 02/05 có data.
        const filterSet = new Set(dates);
        let extFrom = realFrom;
        let extTo = realTo;
        for (const k of Object.keys(_dateShifts)) {
            if (!k.endsWith(`__${state.activeTab}`)) continue;
            const realDate = k.split('__')[0];
            const target = _dateShifts[k];
            if (filterSet.has(target)) {
                if (realDate < extFrom) extFrom = realDate;
                if (realDate > extTo) extTo = realDate;
            }
        }
        const subtitle = dates.length
            ? `${formatDDMMYYYY(state.fromDate)}${
                  state.fromDate === state.toDate ? '' : ` → ${formatDDMMYYYY(state.toDate)}`
              }`
            : 'Chọn khoảng ngày';
        document.getElementById('drReportRangeLabel').textContent = subtitle;

        if (dates.length === 0) {
            document.getElementById('drReportTbody').innerHTML =
                `<tr><td colspan="${currentColCount()}" class="dr-report-empty">Chọn khoảng ngày để xem báo cáo</td></tr>`;
            document.getElementById('drReportTfoot').innerHTML = '';
            return;
        }

        // Image flags + overrides + merges + date-shifts fire-and-forget (sẽ tự
        // re-paint khi xong). Dùng extended range để bao gồm shift sources.
        Promise.all([
            loadImageFlags(extFrom, extTo),
            loadOverridesRange(extFrom, extTo),
            loadMergesRange(extFrom, extTo),
            loadDateShiftsRange(extFrom, extTo),
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
        const key = rangeKey(extFrom, extTo);
        const cached = state.fetchCache[key];
        if (cached && Date.now() - cached.fetchedAt < 60000) {
            state.currentByDateGroup = cached.byDateGroup;
            paintTable(dates);
            paintTabTotals(dates);
            return;
        }

        // Cold cache → show loading + async fetch (extended range)
        document.getElementById('drReportTbody').innerHTML =
            `<tr><td colspan="${currentColCount()}" class="dr-report-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu DB…</td></tr>`;
        document.getElementById('drReportTfoot').innerHTML = '';
        fetchRange(extFrom, extTo).then(({ byDateGroup }) => {
            const curRealFrom = entryToReal(state.fromDate);
            const curRealTo = entryToReal(state.toDate);
            if (rangeKey(curRealFrom, curRealTo) !== rangeKey(realFrom, realTo)) return; // stale
            state.currentByDateGroup = byDateGroup;
            const filterDates = eachDay(curRealFrom, curRealTo);
            paintTable(filterDates);
            paintTabTotals(filterDates);
        });
    }

    // Compute tổng còn lại (totalLeft) cho 1 tab trong range hiện tại.
    // Logic phải đồng bộ paintTable: child + merge (sum from children, override).
    // Duyệt KHÔNG zero totalLeft (giữ giá trị, vẫn cộng). ATRƯỜNG NHẬN CK bỏ hẳn;
    // CK TRƯỚC bỏ ở city. Duplicated nhẹ để tránh refactor lớn paintTable; gọi 3
    // lần (1/tab) để hiển thị dưới mỗi tab button.
    function computeTotalLeftForTab(tab, dates) {
        // Logic phải match paintTable:
        // - Aggregate target ∈ filter: sum tất cả sources (kể cả nguồn ngoài filter)
        // - Source shift-out-of-filter: contribute 0 (data đã dời đi)
        // - Bình thường: tính normal
        const filterSet = new Set(dates);
        // Build shift maps cho tab này
        const aggregateSources = new Map();
        const sourceShiftedToFilter = new Set();
        const sourceShiftedOutOfFilter = new Set();
        for (const k of Object.keys(_dateShifts)) {
            const m = k.match(/^(\d{4}-\d{2}-\d{2})__(.+)$/);
            if (!m || m[2] !== tab) continue;
            const realDate = m[1];
            const target = _dateShifts[k];
            if (filterSet.has(target)) {
                if (!aggregateSources.has(target)) aggregateSources.set(target, []);
                aggregateSources.get(target).push(realDate);
                sourceShiftedToFilter.add(realDate);
            } else if (filterSet.has(realDate)) {
                sourceShiftedOutOfFilter.add(realDate);
            }
        }
        for (const target of aggregateSources.keys()) {
            if (!_dateShifts[`${target}__${tab}`]) {
                aggregateSources.get(target).push(target);
            }
        }
        // Build extended date list (cho aggregateByDay lookup) — include shift sources
        const extDates = new Set(dates);
        for (const sources of aggregateSources.values()) {
            for (const s of sources) extDates.add(s);
        }
        const map = aggregateByDay(tab, [...extDates]);
        const rendered = new Set();
        let total = 0;
        // ATRƯỜNG NHẬN CK đã xóa hẳn (mọi tab) → không trừ. CK TRƯỚC chỉ trừ ở
        // TOMATO/NAP; THÀNH PHỐ (city) đã xóa cột nên không trừ.
        const showCk = showCkTruocFor(tab);
        const useMerge = (mv) => mv != null && mv !== '' && Number(mv) !== 0;
        for (const d of dates) {
            if (rendered.has(d)) continue;
            // Aggregate target
            if (aggregateSources.has(d)) {
                const sources = aggregateSources.get(d);
                for (const s of sources) rendered.add(s);
                rendered.add(d);
                let sumMoney = 0,
                    sumShipFee = 0;
                let sumSlShip = 0,
                    sumThuVe = 0,
                    sumBoCK = 0,
                    sumCkTruoc = 0;
                let anyApproved = false;
                for (const s of sources) {
                    const sys = map[s] || { sysCount: 0, money: 0 };
                    sumMoney += sys.money;
                    sumShipFee += sys.sysCount * getShipFee(tab);
                    const ov = getOverride(s, tab);
                    sumSlShip += Number(ov.slShip) || 0;
                    sumThuVe += Number(ov.thuVe) || 0;
                    sumBoCK += Number(ov.boCK) || 0;
                    sumCkTruoc += Number(ov.ckTruoc) || 0;
                    if (ov.approved) anyApproved = true;
                }
                const totalAll = sumMoney - sumShipFee - sumSlShip * getShipFee(tab) + sumThuVe;
                const totalLeftRaw = totalAll - sumBoCK - (showCk ? sumCkTruoc : 0);
                // Duyệt vẫn cộng vào tổng (2026-05-31) — khớp giá trị ô đang hiển thị
                total += totalLeftRaw;
                continue;
            }
            // Shifted out of filter → 0 contribution
            if (sourceShiftedOutOfFilter.has(d)) {
                rendered.add(d);
                continue;
            }
            // Manual merge or single — exclude shifted children
            const merge = findMergeForDate(d, tab);
            if (merge) {
                const childDates = dates.filter(
                    (cd) =>
                        cd >= merge.fromDate &&
                        cd <= merge.toDate &&
                        !sourceShiftedToFilter.has(cd) &&
                        !sourceShiftedOutOfFilter.has(cd)
                );
                for (const cd of dates.filter((cd) => cd >= merge.fromDate && cd <= merge.toDate)) {
                    rendered.add(cd);
                }
                if (childDates.length === 0) continue;
                let sumMoney = 0,
                    sumShipFee = 0;
                let sumSlShip = 0,
                    sumThuVe = 0,
                    sumBoCK = 0,
                    sumCkTruoc = 0;
                for (const cd of childDates) {
                    const sys = map[cd] || { sysCount: 0, money: 0 };
                    sumMoney += sys.money;
                    sumShipFee += sys.sysCount * getShipFee(tab);
                    const ovc = getOverride(cd, tab);
                    sumSlShip += Number(ovc.slShip) || 0;
                    sumThuVe += Number(ovc.thuVe) || 0;
                    sumBoCK += Number(ovc.boCK) || 0;
                    sumCkTruoc += Number(ovc.ckTruoc) || 0;
                }
                const slShip = useMerge(merge.slShip) ? Number(merge.slShip) : sumSlShip;
                const thuVe = useMerge(merge.thuVe) ? Number(merge.thuVe) : sumThuVe;
                const boCK = useMerge(merge.boCK) ? Number(merge.boCK) : sumBoCK;
                const ckTruoc = useMerge(merge.ckTruoc) ? Number(merge.ckTruoc) : sumCkTruoc;
                const totalAll = sumMoney - sumShipFee - slShip * getShipFee(tab) + thuVe;
                const totalLeftRaw = totalAll - boCK - (showCk ? ckTruoc : 0);
                total += totalLeftRaw;
                continue;
            }
            // Single row
            rendered.add(d);
            const sys = map[d] || { sysCount: 0, money: 0 };
            const shipFee = sys.sysCount * getShipFee(tab);
            const ov = getOverride(d, tab);
            const slShip = Number(ov.slShip) || 0;
            const thuVe = Number(ov.thuVe) || 0;
            const boCK = Number(ov.boCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const totalAll = sys.money - shipFee - slShip * getShipFee(tab) + thuVe;
            const totalLeftRaw = totalAll - boCK - (showCk ? ckTruoc : 0);
            total += totalLeftRaw;
        }
        return total;
    }

    function paintTabTotals(dates) {
        const el = document.getElementById('drReportTabsTotals');
        if (!el) return;
        const totals = TABS.map((t) => ({
            key: t.key,
            label: t.label,
            color: t.color,
            value: computeTotalLeftForTab(t.key, dates),
        }));
        const grand = totals.reduce((s, t) => s + t.value, 0);
        const cls = (v) => (v < 0 ? 'negative' : v > 0 ? 'positive' : 'zero');
        el.innerHTML =
            totals
                .map(
                    (t) =>
                        `<div class="dr-tab-total ${cls(t.value)}" data-tab="${t.key}" style="--tab-color:${t.color}" title="Tổng còn lại ${t.label}"><span class="dr-tab-total-val">${formatMoney(t.value)}</span></div>`
                )
                .join('') +
            `<div class="dr-tab-total dr-tab-total-grand ${cls(grand)}" title="TỔNG = TOMATO + NAP + THÀNH PHỐ"><span class="dr-tab-total-label">TỔNG</span><span class="dr-tab-total-val">${formatMoney(grand)}</span></div>`;
    }

    function paintTable(dates) {
        // aggregateByDay phải include shift sources (ngoài filter) để aggregate
        // row có data từ real 29/04, 30/04 khi filter chỉ là [02/05, 02/05].
        const _filterSet = new Set(dates);
        const _extDates = new Set(dates);
        for (const k of Object.keys(_dateShifts)) {
            const m = k.match(/^(\d{4}-\d{2}-\d{2})__(.+)$/);
            if (!m || m[2] !== state.activeTab) continue;
            const target = _dateShifts[k];
            if (_filterSet.has(target)) _extDates.add(m[1]);
        }
        const map = aggregateByDay(state.activeTab, [..._extDates]);
        // ATRƯỜNG NHẬN CK xóa hẳn (mọi tab); CK TRƯỚC xóa ở THÀNH PHỐ (city).
        const showCk = showCkTruocFor(state.activeTab);
        let totals = {
            slDon: 0,
            money: 0,
            shipFee: 0,
            slShip: 0,
            thuVe: 0,
            totalAll: 0,
            boCK: 0,
            ckTruoc: 0,
            totalLeft: 0,
        };

        function computeDayAuto(d) {
            const sys = map[d] || { sysCount: 0, money: 0 };
            const slDon = sys.sysCount;
            const money = sys.money;
            const shipFee = slDon * getShipFee(state.activeTab);
            return { slDon, money, shipFee };
        }

        function renderSingleRow(d, isChild) {
            const { slDon, money, shipFee } = computeDayAuto(d);
            const ov = getOverride(d, state.activeTab);
            const slShip = Number(ov.slShip) || 0;
            const thuVe = Number(ov.thuVe) || 0;
            const totalAll = money - shipFee - slShip * getShipFee(state.activeTab) + thuVe;
            const boCK = Number(ov.boCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const approved = !!ov.approved;
            // ATRƯỜNG NHẬN CK xóa hẳn → không trừ. CK TRƯỚC chỉ trừ khi cột còn (showCk).
            const totalLeftRaw = totalAll - boCK - (showCk ? ckTruoc : 0);
            // Duyệt KHÔNG zero TỔNG CÒN LẠI nữa (2026-05-31) — giữ nguyên giá trị,
            // dòng chỉ mờ đi qua class .is-approved. Totals cũng cộng bình thường.
            const totalLeftDisplay = totalLeftRaw;
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
                totals.ckTruoc += ckTruoc;
                totals.totalLeft += totalLeftRaw;
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
            const shifted = isDateShifted(d, state.activeTab);
            // Expand + chỉnh ngày hiển thị: cho TẤT CẢ account dùng (chỉ DUYỆT mới admin-only).
            const editBtn = !isChild
                ? `<button class="dr-shift-edit" data-action="shift-edit" data-real="${d}" title="Chỉnh ngày hiển thị (dời sang ngày khác)"><i class="fas fa-pen-to-square"></i></button>`
                : '';
            const shiftBadge = shifted
                ? `<span class="dr-shift-badge" title="Ngày thật: ${formatDDMMYYYY(realToEntry(d))} → hiển thị tại: ${formatDDMMYYYY(realToEntry(getDisplayDate(d, state.activeTab)))}"><i class="fas fa-clock-rotate-left"></i></span>`
                : '';
            return `<tr data-date="${d}" class="${cls}${shifted ? ' is-shifted' : ''}">
                <td class="date clickable" data-action="toggle-expand" title="Bấm để xem danh sách ${slDon} đơn (ngày thật: ${formatDDMMYYYY(d)})">${selectCell}<i class="fas fa-chevron-right dr-expand-chevron"></i> ${formatDDMMYYYY(realToEntry(d))}${shiftBadge}${editBtn}</td>
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
                ${showCk ? `<td class="num"><input type="text" data-field="ckTruoc" value="${ckTruoc ? formatMoney(ckTruoc) : ''}" placeholder="0" ${disabled} /></td>` : ''}
                <td class="num strong ${totalLeftDisplay < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeftDisplay)}</td>
                <td class="note-cell" data-tooltip="${note ? escapeHtml(note) : ''}"><textarea data-field="note" rows="1" placeholder="Ghi chú…" ${disabled}>${escapeHtml(note)}</textarea></td>
                <td class="dr-report-td-approve">${_isAdmin() ? `<label class="dr-approve-toggle"><input type="checkbox" data-field="approved" ${approved ? 'checked' : ''} ${disabled} /><span></span></label>` : '<span class="dr-approve-locked" title="Chỉ tài khoản Admin mới được duyệt"></span>'}</td>
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
            const totalAll = sumMoney - sumShipFee - slShip * getShipFee(state.activeTab) + thuVe;
            const boCK = useMerge(merge.boCK) ? Number(merge.boCK) : sumBoCK;
            const ckTruoc = useMerge(merge.ckTruoc) ? Number(merge.ckTruoc) : sumCkTruoc;
            const approved = !!merge.approved;
            const expanded = !!merge.expanded;
            // ATRƯỜNG NHẬN CK xóa hẳn → không trừ. CK TRƯỚC chỉ trừ khi cột còn (showCk).
            const totalLeftRaw = totalAll - boCK - (showCk ? ckTruoc : 0);
            // Duyệt KHÔNG zero TỔNG CÒN LẠI nữa (2026-05-31) — giữ nguyên giá trị,
            // dòng chỉ mờ đi qua class .is-approved. Totals cũng cộng bình thường.
            const totalLeftDisplay = totalLeftRaw;
            totals.slDon += sumSlDon;
            totals.money += sumMoney;
            totals.shipFee += sumShipFee;
            totals.slShip += slShip;
            totals.thuVe += thuVe;
            totals.totalAll += totalAll;
            totals.boCK += boCK;
            totals.ckTruoc += ckTruoc;
            totals.totalLeft += totalLeftRaw;
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
            // Image status cho ô TIỀN gộp: count children có ảnh.
            // - all → icon filled (xanh), tooltip "N/N ngày có ảnh"
            // - partial → icon multiple (vàng) + badge "X/N"
            // - none → icon outline (chỉ hiển thị placeholder, không clickable)
            const childImgInfo = childDates.map((d) => ({
                date: d,
                hasImg: hasImageFlag(d, state.activeTab),
            }));
            const imgCount = childImgInfo.filter((c) => c.hasImg).length;
            const imgTotal = childImgInfo.length;
            const imgState = imgCount === 0 ? 'none' : imgCount === imgTotal ? 'all' : 'partial';
            const imgIcon =
                imgState === 'all'
                    ? '<i class="fas fa-images"></i>'
                    : imgState === 'partial'
                      ? '<i class="fas fa-images"></i>'
                      : '<i class="far fa-image"></i>';
            const imgTitle =
                imgState === 'all'
                    ? `Cả ${imgTotal}/${imgTotal} ngày con đều có ảnh — rê chuột xem preview, click để mở rộng chỉnh từng ngày`
                    : imgState === 'partial'
                      ? `${imgCount}/${imgTotal} ngày con có ảnh (${childImgInfo
                            .filter((c) => c.hasImg)
                            .map((c) => formatDDMMYYYY(realToEntry(c.date)))
                            .join(', ')}) — click để mở rộng chỉnh ngày còn thiếu`
                      : `Chưa có ảnh — click để mở rộng + thêm cho từng ngày con`;
            const imgBadge =
                imgState === 'partial'
                    ? `<span class="dr-merge-img-badge">${imgCount}/${imgTotal}</span>`
                    : '';
            return `<tr data-merge-id="${merge.id}" class="${cls}">
                <td class="date">
                    <button class="dr-merge-chev" data-action="toggle-merge" title="${expanded ? 'Thu gọn' : 'Mở rộng các ngày con'}"><i class="fas fa-chevron-${chevIcon}"></i></button>
                    <span class="dr-merge-range">${rangeLabel}</span>
                    <span class="dr-merge-count" title="${partial ? 'Chỉ tính ' + daysInRange + '/' + totalDays + ' ngày trong khoảng filter' : daysInRange + ' ngày gộp'}">${daysInRange}${partial ? '/' + totalDays : ''} ngày</span>
                    <button class="dr-merge-unmerge" data-action="unmerge" title="Bỏ gộp">×</button>
                </td>
                <td class="num strong">${formatNumber(sumSlDon)}</td>
                <td class="num money-cell-merge img-${imgState}" data-action="merge-img" title="${imgTitle}">
                    <span class="money-val">${formatMoney(sumMoney)}</span>
                    <span class="money-ico">${imgIcon}</span>
                    ${imgBadge}
                </td>
                <td class="num muted">${formatMoney(sumShipFee)}</td>
                <td class="num"><input type="number" min="0" data-field="slShip" value="${useMerge(merge.slShip) ? merge.slShip : ''}" placeholder="${sumSlShip || 0}" title="${useMerge(merge.slShip) ? 'Giá trị nhập tay (override sum=' + sumSlShip + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num"><input type="text" data-field="thuVe" value="${useMerge(merge.thuVe) ? formatMoney(merge.thuVe) : ''}" placeholder="${sumThuVe ? formatMoney(sumThuVe) : '0'}" title="${useMerge(merge.thuVe) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumThuVe) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num"><input type="text" data-field="boCK" value="${useMerge(merge.boCK) ? formatMoney(merge.boCK) : ''}" placeholder="${sumBoCK ? formatMoney(sumBoCK) : '0'}" title="${useMerge(merge.boCK) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumBoCK) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>
                ${showCk ? `<td class="num"><input type="text" data-field="ckTruoc" value="${useMerge(merge.ckTruoc) ? formatMoney(merge.ckTruoc) : ''}" placeholder="${sumCkTruoc ? formatMoney(sumCkTruoc) : '0'}" title="${useMerge(merge.ckTruoc) ? 'Giá trị nhập tay (override sum=' + formatMoney(sumCkTruoc) + ')' : 'Tổng từ ' + childDates.length + ' ngày con (để trống = dùng sum)'}" /></td>` : ''}
                <td class="num strong ${totalLeftDisplay < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeftDisplay)}</td>
                <td class="note-cell" data-tooltip="${escapeHtml([merge.note ? `Ghi chú gộp:\n${merge.note}` : '', childNotes.length ? `Ghi chú các ngày:\n${childNotes.join('\n')}` : ''].filter(Boolean).join('\n\n'))}"><textarea data-field="note" rows="1" placeholder="${escapeHtml(childNotes.length ? childNotes.join(' | ') : 'Ghi chú…')}">${escapeHtml(merge.note || '')}</textarea></td>
                <td class="dr-report-td-approve">${_isAdmin() ? `<label class="dr-approve-toggle"><input type="checkbox" data-field="approved" ${approved ? 'checked' : ''} /><span></span></label>` : '<span class="dr-approve-locked" title="Chỉ tài khoản Admin mới được duyệt"></span>'}</td>
            </tr>`;
        }

        // Shifted-out row: ngày thật d đã dời data sang displayDate KHÔNG nằm trong
        // filter hiện tại → render row rỗng (tất cả 0) + badge giải thích.
        function renderShiftedOutRow(d) {
            const target = getDisplayDate(d, tab);
            const editBtn = `<button class="dr-shift-edit" data-action="shift-edit" data-real="${d}" title="Chỉnh ngày hiển thị (dời sang ngày khác)"><i class="fas fa-pen-to-square"></i></button>`;
            const movedBadge = `<span class="dr-shift-moved-badge" title="Dữ liệu ngày này đã dời sang ${formatDDMMYYYY(realToEntry(target))} (không nằm trong filter hiện tại)"><i class="fas fa-arrow-right-from-bracket"></i> dời → ${formatDDMMYYYY(realToEntry(target))}</span>`;
            // Cột: NGÀY, SL ĐƠN, TIỀN, PHÍ SHIP, SL ĐƠN SHIP, THU VỀ, TỔNG TẤT CẢ,
            // BO NHẬN CK, [CK TRƯỚC nếu showCk], TỔNG CÒN LẠI, GHI CHÚ, DUYỆT.
            // ATRƯỜNG NHẬN CK đã xóa hẳn.
            return `<tr data-date="${d}" class="is-shifted-out">
                <td class="date" title="Ngày thật: ${formatDDMMYYYY(d)}">${formatDDMMYYYY(realToEntry(d))}${movedBadge}${editBtn}</td>
                <td class="num strong muted">0</td>
                <td class="num muted">$ 0</td>
                <td class="num muted">$ 0</td>
                <td class="num muted">0</td>
                <td class="num muted">$ 0</td>
                <td class="num muted">$ 0</td>
                <td class="num muted">$ 0</td>
                ${showCk ? '<td class="num muted">$ 0</td>' : ''}
                <td class="num muted">$ 0</td>
                <td class="note-cell"></td>
                <td class="dr-report-td-approve"></td>
            </tr>`;
        }

        // Virtual aggregate row: 1+ real dates dời tới displayDate. Sum auto-computed
        // fields từ tất cả sources, sum overrides từ sources (read-only display để
        // tránh ambiguity "input vào source nào"). Badge ✏️ + tooltip ngày thật.
        function renderShiftAggregateRow(displayDate, sourceDates) {
            let sumSlDon = 0,
                sumMoney = 0,
                sumShipFee = 0;
            let sumSlShip = 0,
                sumThuVe = 0,
                sumBoCK = 0,
                sumCkTruoc = 0;
            const sourceNotes = [];
            let anyApproved = false;
            let allApproved = true;
            for (const cd of sourceDates) {
                const sys = map[cd] || { sysCount: 0, money: 0 };
                sumSlDon += sys.sysCount;
                sumMoney += sys.money;
                sumShipFee += sys.sysCount * getShipFee(tab);
                const ov = getOverride(cd, tab);
                sumSlShip += Number(ov.slShip) || 0;
                sumThuVe += Number(ov.thuVe) || 0;
                sumBoCK += Number(ov.boCK) || 0;
                sumCkTruoc += Number(ov.ckTruoc) || 0;
                if (ov.note && String(ov.note).trim()) {
                    sourceNotes.push(
                        `${formatDDMMYYYY(realToEntry(cd))}: ${String(ov.note).trim()}`
                    );
                }
                if (ov.approved) anyApproved = true;
                else allApproved = false;
            }
            const totalAll = sumMoney - sumShipFee - sumSlShip * getShipFee(tab) + sumThuVe;
            // ATRƯỜNG NHẬN CK xóa hẳn → không trừ. CK TRƯỚC chỉ trừ khi cột còn (showCk).
            const totalLeftRaw = totalAll - sumBoCK - (showCk ? sumCkTruoc : 0);
            // Duyệt KHÔNG zero TỔNG CÒN LẠI nữa (2026-05-31) — giữ nguyên giá trị,
            // dòng chỉ mờ đi qua class .is-approved. Totals cũng cộng bình thường.
            const totalLeftDisplay = totalLeftRaw;
            // Tổng row tally
            totals.slDon += sumSlDon;
            totals.money += sumMoney;
            totals.shipFee += sumShipFee;
            totals.slShip += sumSlShip;
            totals.thuVe += sumThuVe;
            totals.totalAll += totalAll;
            totals.boCK += sumBoCK;
            totals.ckTruoc += sumCkTruoc;
            totals.totalLeft += totalLeftRaw;
            const sourceLabels = sourceDates.map((s) => formatDDMMYYYY(realToEntry(s))).join(', ');
            const sourceTitle = `Dồn từ ${sourceDates.length} ngày: ${sourceLabels} → hiển thị tại ${formatDDMMYYYY(realToEntry(displayDate))}`;
            const cls = ['dr-shift-agg-row', anyApproved ? 'is-approved' : '']
                .filter(Boolean)
                .join(' ');
            // Approve checkbox: checked khi TẤT CẢ source đã approved. Toggle → fan-out
            // approved sang tất cả source overrides. Partial state (some approved)
            // hiển thị unchecked + class 'is-partial' để admin biết.
            const approveCellHtml = _isAdmin()
                ? `<label class="dr-approve-toggle${anyApproved && !allApproved ? ' is-partial' : ''}" title="${anyApproved && !allApproved ? `Đã duyệt ${sourceDates.filter((s) => getOverride(s, tab).approved).length}/${sourceDates.length} ngày con — bấm để duyệt tất cả` : 'Duyệt tất cả ngày con'}"><input type="checkbox" data-field="approved-agg" ${allApproved ? 'checked' : ''} /><span></span></label>`
                : '<span class="dr-approve-locked" title="Chỉ tài khoản Admin mới được duyệt"></span>';
            // Image indicator: lọc các ngày con có ảnh. Click → mở modal ngày đầu
            // tiên có ảnh. Hover title liệt kê tất cả ngày con có ảnh để user biết.
            // Multi-image cycling out-of-scope — start simple, user iterate sau.
            const childImgDates = sourceDates.filter((s) => hasImageFlag(s, tab));
            const hasAnyImg = childImgDates.length > 0;
            const imgCellTitle = hasAnyImg
                ? `Có ảnh ở ${childImgDates.length}/${sourceDates.length} ngày con: ${childImgDates.map((s) => formatDDMMYYYY(realToEntry(s))).join(', ')} — bấm để xem`
                : 'Chưa có ảnh chứng từ ở ngày con nào (bỏ dời để thêm)';
            const imgCellAttrs = hasAnyImg
                ? `class="num clickable money-cell has-img" data-action="open-agg-img" title="${imgCellTitle}"`
                : `class="num money-cell no-img" title="${imgCellTitle}"`;
            const imgIcon = hasAnyImg
                ? `<i class="fas fa-image"></i>${childImgDates.length > 1 ? `<span class="dr-img-count">${childImgDates.length}</span>` : ''}`
                : '<i class="far fa-image"></i>';
            return `<tr class="${cls}" data-shift-display="${displayDate}" data-shift-sources="${sourceDates.join(',')}">
                <td class="date">
                    <span class="dr-shift-agg-badge" title="${sourceTitle}"><i class="fas fa-arrows-to-dot"></i> ${sourceDates.length} ngày</span>
                    <span class="dr-shift-agg-date">${formatDDMMYYYY(realToEntry(displayDate))}</span>
                    <button class="dr-shift-unshift" data-action="unshift-all" data-display="${displayDate}" title="Bỏ dời tất cả ngày con">×</button>
                </td>
                <td class="num strong">${formatNumber(sumSlDon)}</td>
                <td ${imgCellAttrs}>
                    <span class="money-val">${formatMoney(sumMoney)}</span>
                    <span class="money-ico">${imgIcon}</span>
                </td>
                <td class="num muted">${formatMoney(sumShipFee)}</td>
                <td class="num">${formatNumber(sumSlShip)}</td>
                <td class="num">${formatMoney(sumThuVe)}</td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num">${formatMoney(sumBoCK)}</td>
                ${showCk ? `<td class="num">${formatMoney(sumCkTruoc)}</td>` : ''}
                <td class="num strong ${totalLeftDisplay < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeftDisplay)}</td>
                <td class="note-cell" data-tooltip="${escapeHtml(sourceNotes.join('\n') || 'Không có ghi chú từ các ngày con')}">${sourceNotes.length ? '<i class="fas fa-comment-dots" title="Có ghi chú — hover xem"></i>' : ''}</td>
                <td class="dr-report-td-approve">${approveCellHtml}</td>
            </tr>`;
        }

        // Non-admin: ẩn HẲN các hàng đã duyệt khỏi bảng (cả merge lẫn single).
        // Date shift logic (refactor 2026-05-26):
        //   - Aggregate render CHỈ khi displayDate ∈ filter range
        //   - Source dates ∈ filter có target ∉ filter → render EMPTY row (data đã dời)
        //   - Fetch range đã được extend ở render() để include shift sources
        const isAdminView = _isAdmin();
        const tab = state.activeTab;
        const filterSet = new Set(dates);

        // Scan ALL shifts cho tab này (kể cả nguồn nằm ngoài filter)
        const aggregateSources = new Map(); // displayDate (in filter) → [realDates...]
        const sourceShiftedToFilter = new Set(); // realDates đã shift đến target ∈ filter
        const sourceShiftedOutOfFilter = new Set(); // realDates ∈ filter, target ∉ filter
        for (const k of Object.keys(_dateShifts)) {
            const m = k.match(/^(\d{4}-\d{2}-\d{2})__(.+)$/);
            if (!m || m[2] !== tab) continue;
            const realDate = m[1];
            const target = _dateShifts[k];
            if (filterSet.has(target)) {
                if (!aggregateSources.has(target)) aggregateSources.set(target, []);
                aggregateSources.get(target).push(realDate);
                sourceShiftedToFilter.add(realDate);
            } else if (filterSet.has(realDate)) {
                sourceShiftedOutOfFilter.add(realDate);
            }
        }
        // Add target's own data into aggregate sources nếu target chưa được shift đi
        for (const target of aggregateSources.keys()) {
            const targetShiftedAway = _dateShifts[`${target}__${tab}`];
            if (!targetShiftedAway) {
                aggregateSources.get(target).push(target);
            }
        }

        const rendered = new Set();
        const rowsHtml = [];

        for (const d of dates) {
            if (rendered.has(d)) continue;

            // 1) d là aggregate target (có ≥1 nguồn shift về đây)
            if (aggregateSources.has(d)) {
                const sources = aggregateSources.get(d);
                for (const s of sources) rendered.add(s);
                rendered.add(d);
                // Non-admin: ẩn nếu MỌI source đều approved
                if (!isAdminView) {
                    const allApproved = sources.every((s) => {
                        const ov = getOverride(s, tab);
                        return !!ov.approved;
                    });
                    if (allApproved) continue;
                }
                rowsHtml.push(renderShiftAggregateRow(d, sources));
                continue;
            }

            // 2) d là source dời SANG target ∈ filter → đã consumed bởi aggregate, skip
            if (sourceShiftedToFilter.has(d)) {
                rendered.add(d);
                continue;
            }

            // 3) d là source bị dời sang target nằm ngoài filter → render EMPTY row
            if (sourceShiftedOutOfFilter.has(d)) {
                rendered.add(d);
                rowsHtml.push(renderShiftedOutRow(d));
                continue;
            }

            // 3) Manual merge (loại trừ source dates bị shift)
            const merge = findMergeForDate(d, tab);
            if (merge) {
                const childDates = dates.filter(
                    (cd) =>
                        cd >= merge.fromDate &&
                        cd <= merge.toDate &&
                        !sourceShiftedToFilter.has(cd) &&
                        !sourceShiftedOutOfFilter.has(cd)
                );
                for (const cd of dates.filter((cd) => cd >= merge.fromDate && cd <= merge.toDate)) {
                    rendered.add(cd);
                }
                if (childDates.length === 0) continue;
                if (!isAdminView && merge.approved) continue;
                rowsHtml.push(renderMergeRow(merge, childDates));
                if (merge.expanded) {
                    for (const cd of childDates) rowsHtml.push(renderSingleRow(cd, true));
                }
                continue;
            }

            // 4) Single row, không shift
            rendered.add(d);
            if (!isAdminView) {
                const ov = getOverride(d, tab);
                if (ov.approved) continue;
            }
            rowsHtml.push(renderSingleRow(d, false));
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
            ${showCk ? `<th class="num">${formatMoney(totals.ckTruoc)}</th>` : ''}
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
            // Approved checkbox — single row hoặc merge row.
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
                return;
            }
            // Approved checkbox — aggregate row (date-shift dồn): fan-out sang TẤT
            // CẢ source dates. data-shift-sources="2026-04-29,2026-04-30,2026-05-02".
            if (el.dataset.field === 'approved-agg') {
                const aggRow = el.closest('tr.dr-shift-agg-row');
                if (!aggRow) return;
                const sources = String(aggRow.dataset.shiftSources || '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                if (sources.length === 0) return;
                const next = !!el.checked;
                for (const sd of sources) {
                    const ov = getOverride(sd, state.activeTab);
                    if (!!ov.approved === next) continue;
                    setOverride(sd, state.activeTab, { approved: next });
                }
                scheduleRender();
            }
        });

        tbody.addEventListener('click', (e) => {
            // Date shift — chỉnh ngày hiển thị (dời sang ngày khác). Cho tất cả account.
            const shiftEditBtn =
                e.target.closest && e.target.closest('button[data-action="shift-edit"]');
            if (shiftEditBtn) {
                e.stopPropagation();
                const realDate = shiftEditBtn.dataset.real;
                const currentDisplay = getDisplayDate(realDate, state.activeTab);
                openDateShiftModal({ realDate, currentDisplay }).then((result) => {
                    if (result === null) return; // cancel
                    // '' (reset) hoặc 'YYYY-MM-DD' đều xử lý qua setDateShift.
                    // Empty/equal realDate → setDateShift sẽ DELETE row trên server.
                    setDateShift(realDate, state.activeTab, result || null);
                    scheduleRender();
                });
                return;
            }
            // Unshift all — bỏ tất cả dời ngày của một virtual aggregate. Cho tất cả account.
            const unshiftBtn = e.target.closest && e.target.closest('[data-action="unshift-all"]');
            if (unshiftBtn) {
                e.stopPropagation();
                const displayDate = unshiftBtn.dataset.display;
                // Find all real dates currently shifted to this displayDate
                const tab2 = state.activeTab;
                Object.keys(_dateShifts)
                    .filter((k) => k.endsWith(`__${tab2}`) && _dateShifts[k] === displayDate)
                    .forEach((k) => {
                        const realDate = k.split('__')[0];
                        setDateShift(realDate, tab2, null);
                    });
                scheduleRender();
                return;
            }
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
            // Aggregate row (date-shift dồn) — mở image modal cho ngày con đầu
            // tiên có ảnh. Title cell đã liệt kê tất cả ngày có ảnh để user biết
            // chọn ngày nào — out-of-scope cycle UI, user mở từng ngày con nếu cần.
            const aggImgCell =
                e.target.closest && e.target.closest('td[data-action="open-agg-img"]');
            if (aggImgCell) {
                const aggRow = aggImgCell.closest('tr.dr-shift-agg-row');
                if (!aggRow) return;
                const sources = String(aggRow.dataset.shiftSources || '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                const firstImg = sources.find((s) => hasImageFlag(s, state.activeTab));
                if (firstImg) openImageModal(firstImg);
                return;
            }
            // Click ô TIỀN gộp (có image indicator) → force expand merge để user thao tác
            // từng ngày con (xem/thêm/sửa ảnh per-date qua child row's money cell).
            const mergeImgCell =
                e.target.closest && e.target.closest('td[data-action="merge-img"]');
            if (mergeImgCell) {
                const tr = mergeImgCell.closest('tr[data-merge-id]');
                if (tr) {
                    const id = Number(tr.dataset.mergeId);
                    const m = state.merges.get(id);
                    if (m && !m.expanded) {
                        updateMerge(id, { expanded: true });
                        scheduleRender();
                    }
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
            // Child row money cell (single image)
            const cellChild = e.target.closest && e.target.closest('td.money-cell.has-img');
            if (cellChild) {
                if (hoverPreview.currentCell === cellChild) return;
                const row = cellChild.closest('tr[data-date]');
                if (!row) return;
                const src = imageUrl(row.dataset.date, state.activeTab);
                if (!src) return;
                showHoverPreview(cellChild, src);
                return;
            }
            // Merge row money cell (stacked children images) — chỉ show nếu ≥1 child có ảnh
            const cellMerge =
                e.target.closest && e.target.closest('td.money-cell-merge:not(.img-none)');
            if (cellMerge) {
                if (hoverPreview.currentCell === cellMerge) return;
                const tr = cellMerge.closest('tr[data-merge-id]');
                if (!tr) return;
                const id = Number(tr.dataset.mergeId);
                const m = state.merges.get(id);
                if (!m) return;
                const dates = getMergeChildDates(m);
                const list = dates
                    .filter((d) => hasImageFlag(d, state.activeTab))
                    .map((d) => ({ date: d, src: imageUrl(d, state.activeTab) }));
                if (list.length === 0) return;
                showHoverPreview(cellMerge, list);
            }
        });
        tbody.addEventListener('mouseout', (e) => {
            const cell =
                e.target.closest &&
                (e.target.closest('td.money-cell.has-img') ||
                    e.target.closest('td.money-cell-merge'));
            if (!cell) return;
            // Mouse moved within the same cell — still inside, keep preview.
            const next = e.relatedTarget;
            if (next && cell.contains(next)) return;
            hideHoverPreview();
        });

        // Note hover tooltip — textarea rows=1 truncate visible content. Custom
        // popup show full ghi chú (multi-line, preserve \n). data-tooltip on
        // <td.note-cell> chứa raw text (đã escape khi render).
        tbody.addEventListener('mouseover', (e) => {
            const cell = e.target.closest && e.target.closest('td.note-cell[data-tooltip]');
            if (!cell) return;
            const text = cell.dataset.tooltip;
            if (!text) return;
            if (noteTooltip.currentCell === cell) return;
            showNoteTooltip(cell, text);
        });
        tbody.addEventListener('mouseout', (e) => {
            const cell = e.target.closest && e.target.closest('td.note-cell[data-tooltip]');
            if (!cell) return;
            const next = e.relatedTarget;
            if (next && cell.contains(next)) return;
            hideNoteTooltip();
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
        const colCount = currentColCount(); // số cột động theo tab (bỏ ATRƯỜNG; bỏ CK TRƯỚC ở city)

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
        document.body.appendChild(el);
    }

    // showHoverPreview accepts:
    //   - string `src` → single image (child cell hover)
    //   - Array<{date, src}> → multi image stacked (merge cell hover) với label ngày
    function showHoverPreview(cell, srcOrList) {
        ensureHoverPreview();
        const el = document.getElementById('drReportImgHover');
        if (Array.isArray(srcOrList)) {
            const items = srcOrList.filter((it) => it && it.src);
            el.classList.add('multi');
            el.innerHTML = items
                .map(
                    (it) =>
                        `<figure><img alt="Ảnh ${formatDDMMYYYY(realToEntry(it.date))}" src="${it.src}" /><figcaption>${formatDDMMYYYY(realToEntry(it.date))}</figcaption></figure>`
                )
                .join('');
        } else {
            el.classList.remove('multi');
            el.innerHTML = `<img alt="Ảnh chứng từ (preview)" src="${srcOrList}" />`;
        }
        hoverPreview.currentCell = cell;
        el.classList.add('open');
        positionHoverPreview(cell);
        // Re-position sau khi ảnh load xong (kích thước natural mới biết)
        const imgs = el.querySelectorAll('img');
        imgs.forEach((img) => {
            if (!img.complete) {
                img.onload = () => {
                    if (hoverPreview.currentCell === cell) positionHoverPreview(cell);
                };
            }
        });
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

    // ── Note tooltip (hover note cell hiển thị full text multi-line) ──
    const noteTooltip = { currentCell: null };

    function ensureNoteTooltip() {
        if (document.getElementById('drReportNoteTooltip')) return;
        const el = document.createElement('div');
        el.id = 'drReportNoteTooltip';
        el.className = 'dr-note-tooltip';
        document.body.appendChild(el);
    }

    function showNoteTooltip(cell, text) {
        ensureNoteTooltip();
        const el = document.getElementById('drReportNoteTooltip');
        // textContent giữ \n + auto-escape HTML — kết hợp với white-space:pre-line
        // trong CSS để render multi-line đúng.
        el.textContent = text;
        noteTooltip.currentCell = cell;
        el.classList.add('open');
        positionNoteTooltip(cell);
    }

    function positionNoteTooltip(cell) {
        const el = document.getElementById('drReportNoteTooltip');
        if (!el) return;
        const rect = cell.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // Default: above the cell, horizontally centered
        let left = rect.left + rect.width / 2 - w / 2;
        let top = rect.top - h - 8;
        // Fallback below if no room above
        if (top < 8) top = rect.bottom + 8;
        // Clamp to viewport
        if (left + w + 8 > vw) left = vw - w - 8;
        if (left < 8) left = 8;
        if (top + h + 8 > vh) top = vh - h - 8;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    function hideNoteTooltip() {
        const el = document.getElementById('drReportNoteTooltip');
        if (el) el.classList.remove('open');
        noteTooltip.currentCell = null;
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

    // ── Date shift modal (custom UI, thay window.prompt) ──
    // Trả Promise resolve một trong:
    //   - 'YYYY-MM-DD' → user chọn ngày mới
    //   - ''           → user bấm "Khôi phục ngày gốc"
    //   - null         → user cancel
    function ensureDateShiftModal() {
        if (document.getElementById('drReportShiftModal')) return;
        const tpl = `
        <div class="dr-shift-overlay" id="drReportShiftModal" role="dialog" aria-modal="true" aria-labelledby="drShiftTitle">
          <div class="dr-shift-window">
            <div class="dr-shift-header">
              <div class="dr-shift-title" id="drShiftTitle">
                <i class="fas fa-calendar-alt"></i> Chỉnh ngày hiển thị
              </div>
              <button class="dr-report-close" id="drShiftClose" title="Đóng (ESC)">&times;</button>
            </div>
            <div class="dr-shift-body">
              <div class="dr-shift-row">
                <label class="dr-shift-label">Ngày thật</label>
                <div class="dr-shift-real" id="drShiftRealDate">—</div>
              </div>
              <div class="dr-shift-row">
                <label class="dr-shift-label" for="drShiftNewDate">Ngày hiển thị mới</label>
                <input type="date" id="drShiftNewDate" class="dr-shift-input" />
              </div>
              <div class="dr-shift-hint">
                Dữ liệu ngày thật sẽ dồn vào ngày hiển thị này. Bấm
                <strong>Khôi phục ngày gốc</strong> để bỏ dời.
              </div>
            </div>
            <div class="dr-shift-footer">
              <button class="dr-btn dr-btn-danger" id="drShiftReset">
                <i class="fas fa-undo"></i> Khôi phục ngày gốc
              </button>
              <div class="dr-shift-actions-right">
                <button class="dr-btn" id="drShiftCancel">Hủy</button>
                <button class="dr-btn dr-btn-primary" id="drShiftOk">
                  <i class="fas fa-check"></i> Áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = tpl.trim();
        document.body.appendChild(wrap.firstChild);
    }

    function openDateShiftModal({ realDate, currentDisplay }) {
        ensureDateShiftModal();
        const modal = document.getElementById('drReportShiftModal');
        const realLabel = document.getElementById('drShiftRealDate');
        const input = document.getElementById('drShiftNewDate');
        const btnOk = document.getElementById('drShiftOk');
        const btnCancel = document.getElementById('drShiftCancel');
        const btnReset = document.getElementById('drShiftReset');
        const btnClose = document.getElementById('drShiftClose');

        realLabel.textContent = formatDDMMYYYY(realToEntry(realDate));
        input.value = currentDisplay || realDate;
        // Reset button chỉ enable khi đang có shift (currentDisplay khác realDate)
        const hasShift = currentDisplay && currentDisplay !== realDate;
        btnReset.style.visibility = hasShift ? 'visible' : 'hidden';

        modal.classList.add('open');
        setTimeout(() => input.focus(), 50);

        return new Promise((resolve) => {
            const cleanup = () => {
                modal.classList.remove('open');
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                btnReset.removeEventListener('click', onReset);
                btnClose.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdrop);
                input.removeEventListener('keydown', onKey);
                document.removeEventListener('keydown', onEsc);
            };
            const onOk = () => {
                const v = String(input.value || '').trim();
                if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                    input.focus();
                    return;
                }
                cleanup();
                resolve(v || '');
            };
            const onCancel = () => {
                cleanup();
                resolve(null);
            };
            const onReset = () => {
                cleanup();
                resolve('');
            };
            const onBackdrop = (e) => {
                if (e.target.id === 'drReportShiftModal') onCancel();
            };
            const onKey = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onOk();
                }
            };
            const onEsc = (e) => {
                if (e.key === 'Escape' && modal.classList.contains('open')) onCancel();
            };
            btnOk.addEventListener('click', onOk);
            btnCancel.addEventListener('click', onCancel);
            btnReset.addEventListener('click', onReset);
            btnClose.addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdrop);
            input.addEventListener('keydown', onKey);
            document.addEventListener('keydown', onEsc);
        });
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
        // 2026-05-26: migrate date shifts localStorage → DB (per-machine → shared)
        migrateLocalStorageDateShiftsOnce()
            .then(() => {
                _dateShiftsFetched.clear();
                if (state.fromDate && state.toDate) {
                    loadDateShiftsRange(
                        entryToReal(state.fromDate),
                        entryToReal(state.toDate)
                    ).then(() => scheduleRender());
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

    // Auto-điền SL ĐƠN SHIP + THU VỀ cho nhóm THÀNH PHỐ (city) từ nút "Ảnh Thành Phố".
    // SL ĐƠN SHIP ← số đơn thu về; THU VỀ ← tổng giá trị thu về (VND).
    // CHỈ điền khi ô đang trống — KHÔNG ghi đè giá trị user đã sửa tay (mỗi field độc lập).
    //   isoDate: 'YYYY-MM-DD' (ngày thật, từ filter fromDate)
    async function autofillCityReturns(isoDate, returnCount, returnValue) {
        if (!isoDate) return;
        const slShip = Math.max(0, Math.round(Number(returnCount) || 0));
        const thuVe = Math.max(0, Math.round(Number(returnValue) || 0));
        if (!slShip && !thuVe) return; // không có thu về → không điền

        // Load override ngày này từ server trước, để biết ô đang trống hay đã có giá trị tay
        try {
            await loadOverridesRange(isoDate, isoDate);
        } catch (_) {}

        const cur = getOverride(isoDate, 'city');
        const patch = {};
        if (slShip && !(Number(cur.slShip) > 0)) patch.slShip = slShip;
        if (thuVe && !(Number(cur.thuVe) > 0)) patch.thuVe = thuVe;
        if (!Object.keys(patch).length) return; // đã có giá trị → giữ nguyên, không đụng

        setOverride(isoDate, 'city', patch);

        // Modal báo cáo đang mở → repaint để thấy ngay
        const modal = document.getElementById('drReportModal');
        if (modal && modal.classList.contains('open')) {
            try {
                scheduleRender();
            } catch (_) {}
        }
        return patch;
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
    window.DeliveryReportReport = { open, close, autofillCityReturns };
})();
