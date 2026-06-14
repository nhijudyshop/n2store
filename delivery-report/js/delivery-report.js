// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DELIVERY REPORT - Thống Kê Giao Hàng
// Main controller: API calls, filters, table rendering, pagination
// =====================================================

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // =====================================================
    // STATE
    // =====================================================
    const DeliveryReportState = {
        allData: [],
        totalCount: 0,
        currentPage: 1,
        pageSize: 1000,
        isLoading: false,

        // Tra soát mode
        traSoatMode: false,
        scannedNumbers: new Set(),
        hiddenNumbers: new Set(),
        activeTab: 'all', // 'city', 'province', 'shop', 'all', 'combo', 'zero', 'return'
        uiMode: 'lite', // 'full' (phuoc-authenticated) | 'lite' (others)
        liteExpanded: false, // in tra soát: triple-click title shows hidden tabs
        liteRevealed: false, // outside tra soát: triple-click title shows hidden table/cancel/status
        scanFilter: 'unscanned', // 'unscanned' | 'scanned'
        provinceGroups: {}, // { Number: 'tomato' | 'nap' }
        _provinceGroupsLoaded: false,
        dbAssignments: {}, // { Number: groupName } — loaded from PostgreSQL (source of truth)
        _dbAssignmentsLoaded: false,
        _dbLockedCount: 0,
        _dbNewCount: 0,
        lastScannedColumn: null, // 'tomato' | 'nap'
        _focusedGroup: null, // focused group in all-tab after scan
        _scannedListener: null,
        _groupsListener: null,

        // Filter values
        filters: {
            fromDate: '',
            toDate: '',
            keyword: '',
        },

        // Header filter: Công nợ < Tổng tiền (toggle khi click cột Công nợ)
        filter: {
            debtLessThanTotal: false,
        },

        // Column visibility (default: only key columns visible)
        columns: {
            index: true,
            customer: true,
            receiverInfo: false,
            dateInvoice: true,
            number: true,
            amountTotal: false,
            cashOnDelivery: true,
            carrierName: false,
            deliveryPrice: false,
            shipWeight: false,
            trackingRef: false,
            showShipStatus: false,
            forControlStatus: false,
        },
    };

    // =====================================================
    // PERMISSION HELPER
    // =====================================================
    // Whitelist tài khoản được phép dùng tra soát (ngoài admin).
    // Match cả username (lowercase) và displayName để khỏi phụ thuộc vào việc
    // user có set displayName hay không.
    const TRA_SOAT_ALLOWED_USERNAMES = new Set(['bobo']);
    const TRA_SOAT_ALLOWED_DISPLAY_NAMES = new Set(['Phước đẹp trai', 'bobo']);

    function canTraSoat() {
        if (!window.authManager) return false;
        if (window.authManager.isAdmin()) return true;
        const info = window.authManager.getUserInfo();
        if (!info) return false;
        const username = String(info.username || '').toLowerCase();
        if (TRA_SOAT_ALLOWED_USERNAMES.has(username)) return true;
        if (TRA_SOAT_ALLOWED_DISPLAY_NAMES.has(info.displayName)) return true;
        return false;
    }

    // userType === 'phuoc-authenticated' → 'full' (Interface 1 — all 5 groups)
    // anyone else (incl admin) → 'lite' (Interface 2 — only TOMATO + SHOP by default)
    function detectInterfaceMode() {
        try {
            const info = window.authManager?.getUserInfo?.();
            if (info?.userType === 'phuoc-authenticated') return 'full';
        } catch (_) {}
        // Fallback: read storage directly in case authManager not ready
        try {
            const raw =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth');
            if (raw) {
                const data = JSON.parse(raw);
                if (data?.userType === 'phuoc-authenticated') return 'full';
            }
        } catch (_) {}
        return 'lite';
    }

    // In lite-collapsed only [combo, zero] are visible.
    // Triple-click title flips liteExpanded → these become visible too.
    // 'all' tab in lite belongs to the expanded set (lite default has no "Tất cả").
    const LITE_HIDDEN_TABS = new Set(['city', 'province', 'shop', 'return', 'all']);

    function applyTabVisibility() {
        const state = DeliveryReportState;
        const bar = document.getElementById('drTraSoatBar');
        if (!bar) return;
        bar.querySelectorAll('.dr-trasoat-tab').forEach((btn) => {
            const tab = btn.dataset.tab;
            let show = true;
            if (state.uiMode === 'full') {
                // Hide lite-only combo tab
                show = tab !== 'combo';
            } else {
                // lite mode
                if (LITE_HIDDEN_TABS.has(tab)) {
                    show = state.liteExpanded;
                } else {
                    show = true;
                }
            }
            btn.style.display = show ? '' : 'none';
        });
    }

    // Elements that lite mode hides until user triple-clicks the title.
    // drFilterSection stays visible (auto-expanded). drStatsBar follows table — no point showing
    // numbers when the user can't see the underlying rows.
    const LITE_REVEAL_IDS = [
        'drStatsBar',
        'drTableWrapper',
        'drCancelSection',
        'drAssignmentStatus',
    ];

    function applyLiteRevealVisibility() {
        const state = DeliveryReportState;
        // Full mode or already revealed → no hiding. Tra soát mode owns table visibility separately.
        const shouldHide = state.uiMode === 'lite' && !state.liteRevealed && !state.traSoatMode;
        LITE_REVEAL_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (shouldHide) {
                el.dataset.liteHidden = '1';
                el.style.display = 'none';
            } else if (el.dataset.liteHidden === '1') {
                // Only restore the elements we hid; preserve other visibility logic
                el.dataset.liteHidden = '';
                el.style.display = '';
            }
        });
    }

    // Triple-click title to expand lite mode (no visual hint by design)
    function setupTitleTripleClick() {
        const el = document.getElementById('drMainTitle');
        if (!el || el.dataset.tripleClickBound === '1') return;
        el.dataset.tripleClickBound = '1';
        let clicks = 0;
        let timer = null;
        el.addEventListener('click', () => {
            clicks++;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                clicks = 0;
            }, 600);
            if (clicks >= 3) {
                clicks = 0;
                if (timer) clearTimeout(timer);
                // Nút "Gửi Kèm" ẩn mặc định — hiện sau 3 lần click tiêu đề (mọi chế độ)
                const saBtn = document.getElementById('drBtnSendAlong');
                if (saBtn) saBtn.style.display = '';
                const state = DeliveryReportState;
                if (state.uiMode !== 'lite') return;
                if (state.traSoatMode) {
                    // In tra soát: reveal hidden tabs
                    if (state.liteExpanded) return;
                    state.liteExpanded = true;
                    applyTabVisibility();
                } else {
                    // Outside tra soát: reveal hidden table/cancel/status
                    if (state.liteRevealed) return;
                    state.liteRevealed = true;
                    applyLiteRevealVisibility();
                }
            }
        });
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================
    function initDeliveryReport() {
        setDefaultDates();
        bindFilterEvents();
        bindColumnToggle();
        bindFilterableHeaders();
        applyColumnVisibility();
        loadFiltersFromStorage();

        // Detect interface mode + hide table/cancel/status if lite (until triple-click reveal)
        DeliveryReportState.uiMode = detectInterfaceMode();
        DeliveryReportState.liteRevealed = false;
        applyLiteRevealVisibility();

        // Ẩn nút tra soát nếu không có quyền
        if (!canTraSoat()) {
            const btn = document.getElementById('drBtnTraSoat');
            if (btn) btn.style.display = 'none';
        }

        OrderCheckStore.init();
        // Prefetch date shifts từ server (cross-machine sync) — fire-and-forget,
        // re-fetch sau khi xong để extended range tính đúng.
        prefetchDateShifts().then(() => {
            if (DeliveryReportState.allData.length > 0) {
                // Re-collect filters để extended range cập nhật theo shifts mới
                collectFilters();
                renderTable();
                renderStats();
            }
        });
        loadHiddenNumbers().finally(() => fetchData());

        HoverPreview.init();
        setupTitleTripleClick();

        // Background self-heal: tự sync DB ↔ TPOS 1 lần/ngày (per browser).
        // Catches case: admin edit DateInvoice trên TPOS → DB ghost không tự fix
        // vì auto-cleanup chỉ trigger khi user mở Tra Soát ngày đó. Self-heal
        // chạy nightly để dọn nền, không cần user thao tác.
        // Fire-and-forget — không block UI.
        setTimeout(() => {
            selfHealOnce().catch((e) => console.warn('[self-heal] failed:', e?.message || e));
        }, 5000);
    }

    // ── Background self-heal: sync DB date ↔ TPOS DateInvoice cho 30 ngày gần ──
    // Marker localStorage `dr-last-bulk-sync` (YYYY-MM-DD) → throttle 1 lần/ngày.
    // Chỉ chạy nếu user có quyền Tra Soát (admin/power user).
    async function selfHealOnce() {
        if (!canTraSoat()) return;
        const MARK_KEY = 'dr-last-bulk-sync';
        const today = todayLocalStr();
        if (localStorage.getItem(MARK_KEY) === today) return; // throttled

        const token = await getToken().catch(() => null);
        if (!token) return;

        console.log('[self-heal] starting daily sync (30 days)…');
        const t0 = Date.now();

        // 1. Build wide TPOS superset (last 45 days, weekly chunks ≤ 10k/chunk)
        const allLive = new Map();
        const now = new Date();
        const weekStarts = [];
        for (let w = 6; w >= 0; w--) {
            const d = new Date(now);
            d.setDate(d.getDate() - w * 7);
            weekStarts.push(d.toISOString().slice(0, 10));
        }
        for (const ws of weekStarts) {
            try {
                const s = new Date(ws + 'T00:00:00').toISOString();
                const e = new Date(ws + 'T00:00:00');
                e.setDate(e.getDate() + 6);
                e.setHours(23, 59, 59, 999);
                const url = `${WORKER_URL}/api/odata/Report/DeliveryReport?FromDate=${encodeURIComponent(s)}&ToDate=${encodeURIComponent(e.toISOString())}&%24top=10000`;
                const r = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                        tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                    },
                });
                if (!r.ok) continue;
                const j = await r.json();
                for (const it of j.value || []) {
                    if (!allLive.has(it.Number)) allLive.set(it.Number, it);
                }
            } catch (e) {
                console.warn(`[self-heal] week ${ws} fetch failed:`, e?.message);
            }
        }

        // 2. Iterate last 30 days, compute moves only. Hides bị skip — hide
        // tự động risky (đơn dời sang ngày ngoài 45-day window có thể bị nhầm
        // là truly deleted). Hide qua manual cleanup-ghosts với safeguard 50%.
        const updates = [];
        let candidateHides = 0;
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            try {
                const r = await fetch(`${RENDER_URL}/api/v2/delivery-assignments/?date=${dateStr}`);
                if (!r.ok) continue;
                const j = await r.json();
                const a = j.data?.assignments || {};
                for (const num in a) {
                    const live = allLive.get(num);
                    if (!live) {
                        candidateHides++; // log only — không auto-hide
                    } else {
                        const liveDate = (live.DateInvoice || '').slice(0, 10);
                        if (liveDate && liveDate !== dateStr) {
                            updates.push({ orderNumber: num, newDate: liveDate });
                        }
                    }
                }
            } catch (e) {
                console.warn(`[self-heal] day ${dateStr} fetch failed:`, e?.message);
            }
        }

        if (updates.length === 0) {
            console.log(
                `[self-heal] DB clean — no date-shifts needed (${candidateHides} candidate hides skipped)`
            );
            localStorage.setItem(MARK_KEY, today);
            return;
        }

        console.log(
            `[self-heal] applying ${updates.length} date-shifts (${candidateHides} candidate hides skipped — manual review)`
        );

        // 3. Apply updates in batches of 1500 (endpoint limit 2000)
        let totalUpdated = 0;
        for (let i = 0; i < updates.length; i += 1500) {
            const payload = { updates: updates.slice(i, i + 1500), hiddenNumbers: [] };
            try {
                const r = await fetch(`${RENDER_URL}/api/v2/delivery-assignments/sync-dates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!r.ok) continue;
                const j = await r.json();
                totalUpdated += j.data?.updatedCount || 0;
            } catch (e) {
                console.warn('[self-heal] sync chunk failed:', e?.message);
            }
        }

        const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[self-heal] done in ${elapsedSec}s — applied ${totalUpdated} date-shifts`);
        localStorage.setItem(MARK_KEY, today);
    }

    // =====================================================
    // ORDER CHECK STORE — đánh dấu đơn "đã kiểm tra"
    // Firestore: delivery_report/data/order_checks/{number}
    // Pattern theo CLAUDE.md DATA-SYNCHRONIZATION (Firebase as SoT + listener)
    // =====================================================
    const OrderCheckStore = (function () {
        const _data = new Map(); // number → { checkedBy, checkedAt }
        let _listener = null;
        let _initialized = false;

        function getDB() {
            if (typeof getFirestore === 'function') return getFirestore();
            if (typeof firebase !== 'undefined' && firebase.apps?.length)
                return firebase.firestore();
            return null;
        }

        function getCollection() {
            const db = getDB();
            if (!db) return null;
            return db.collection('delivery_report').doc('data').collection('order_checks');
        }

        // Firestore document IDs cannot contain '/'. Số HĐ "NJD/2026/67403" must be
        // encoded for storage; the original number is preserved inside the payload.
        function sanitizeDocId(number) {
            return String(number).replace(/\//g, '__');
        }

        function loadFromLocal() {
            try {
                const raw = localStorage.getItem('drOrderChecks_v1');
                if (!raw) return;
                const obj = JSON.parse(raw);
                Object.entries(obj || {}).forEach(([k, v]) => _data.set(k, v));
            } catch (e) {
                console.warn('[ORDER-CHECK] localStorage load failed:', e);
            }
        }

        function saveToLocal() {
            try {
                const obj = Object.fromEntries(_data);
                localStorage.setItem('drOrderChecks_v1', JSON.stringify(obj));
            } catch (e) {
                console.warn('[ORDER-CHECK] localStorage save failed:', e);
            }
        }

        function ingestSnapshot(snap) {
            const remoteKeys = new Set();
            snap.forEach((doc) => {
                const data = doc.data() || {};
                const key = data.number || doc.id;
                remoteKeys.add(key);
                _data.set(key, data);
            });
            return remoteKeys;
        }

        function setupListener() {
            const col = getCollection();
            if (!col) return;
            _listener = col.onSnapshot(
                (snap) => {
                    // Replace with Firestore state (SoT). Local writes that succeeded
                    // are echoed back through this listener so nothing is lost.
                    _data.clear();
                    ingestSnapshot(snap);
                    saveToLocal();
                    applyCheckedStylesToTable();
                },
                (err) => console.warn('[ORDER-CHECK] listener error:', err)
            );
        }

        async function init() {
            if (_initialized) return;
            _initialized = true;
            loadFromLocal();
            applyCheckedStylesToTable();
            const col = getCollection();
            if (!col) return;
            try {
                const snap = await col.get();
                // Snapshot of local-only entries BEFORE we accept the remote state,
                // so we can backfill anything that never reached Firestore (e.g.
                // older writes that hit the broken slash path).
                const localOnly = [];
                const remoteKeys = new Set();
                snap.forEach((doc) => {
                    const data = doc.data() || {};
                    const key = data.number || doc.id;
                    remoteKeys.add(key);
                });
                for (const [key, payload] of _data) {
                    if (!remoteKeys.has(key) && payload && payload.number) {
                        localOnly.push(payload);
                    }
                }
                _data.clear();
                ingestSnapshot(snap);
                // Backfill local-only entries with sanitized doc IDs.
                await Promise.all(
                    localOnly.map((payload) => {
                        _data.set(payload.number, payload);
                        return col
                            .doc(sanitizeDocId(payload.number))
                            .set(payload, { merge: true })
                            .catch((e) => console.warn('[ORDER-CHECK] backfill failed:', e));
                    })
                );
                saveToLocal();
                applyCheckedStylesToTable();
            } catch (e) {
                console.warn('[ORDER-CHECK] initial load failed, using cache:', e);
            }
            setupListener();
        }

        function isChecked(number) {
            return !!number && _data.has(number);
        }

        function getInfo(number) {
            return _data.get(number) || null;
        }

        function getAllSortedDesc() {
            return Array.from(_data.values())
                .filter((v) => v && v.number)
                .sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
        }

        async function markChecked(number, meta) {
            if (!number) return;
            const info = window.authManager?.getUserInfo?.() || {};
            const username = info.username || 'unknown';
            const displayName = info.displayName || info.fullName || '';
            const payload = {
                number,
                checkedBy: username,
                checkedByDisplayName: displayName,
                checkedAt: Date.now(),
                customerName: meta?.customerName || '',
                phone: meta?.phone || '',
                invoiceId: meta?.id || '',
                source: 'delivery-report',
            };
            _data.set(number, payload);
            saveToLocal();
            applyCheckedStylesToTable();
            const col = getCollection();
            if (!col) return;
            try {
                await col.doc(sanitizeDocId(number)).set(payload, { merge: true });
            } catch (e) {
                console.warn('[ORDER-CHECK] save failed:', e);
            }
        }

        return { init, isChecked, getInfo, getAllSortedDesc, markChecked };
    })();

    function applyCheckedStylesToTable() {
        const tbody = document.getElementById('drTableBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach((tr) => {
            const billCell = tr.querySelector('.dr-hover-bill');
            const number = billCell?.dataset.number || '';
            if (!number) return;
            if (OrderCheckStore.isChecked(number)) {
                tr.classList.add('dr-row-checked');
            } else {
                tr.classList.remove('dr-row-checked');
            }
        });
    }

    // =====================================================
    // CHECK-HISTORY MODAL — danh sách đơn đã bấm "Đã kiểm tra"
    // =====================================================
    let _checkHistoryEl = null;

    function ensureCheckHistoryModal() {
        if (_checkHistoryEl) return _checkHistoryEl;
        const el = document.createElement('div');
        el.id = 'dr-check-history-modal';
        el.style.cssText =
            'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10020;align-items:center;justify-content:center;padding:20px;';
        el.innerHTML = `
            <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:900px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;font-family:inherit;">
                <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <h3 style="margin:0;font-size:16px;font-weight:600;color:#111827;">
                        <i class="fas fa-clipboard-check" style="color:#10b981;"></i>
                        Lịch sử đã kiểm tra
                        <span id="dr-check-history-count" style="font-size:12px;font-weight:500;color:#6b7280;margin-left:6px;"></span>
                    </h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="text" id="dr-check-history-search"
                            placeholder="Tìm số đơn / khách / SĐT / người kiểm…"
                            style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;min-width:240px;" />
                        <button type="button" id="dr-check-history-close"
                            style="background:transparent;border:none;font-size:20px;color:#6b7280;cursor:pointer;padding:4px 10px;line-height:1;">&times;</button>
                    </div>
                </div>
                <div style="overflow:auto;flex:1;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead style="position:sticky;top:0;background:#f9fafb;z-index:1;">
                            <tr>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;width:40px;">#</th>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">Số đơn</th>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">Khách hàng</th>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">SĐT</th>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">Người kiểm</th>
                                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">Thời gian</th>
                            </tr>
                        </thead>
                        <tbody id="dr-check-history-body"></tbody>
                    </table>
                </div>
            </div>`;
        document.body.appendChild(el);

        const hide = () => {
            el.style.display = 'none';
        };
        el.querySelector('#dr-check-history-close').addEventListener('click', hide);
        el.addEventListener('click', (e) => {
            if (e.target === el) hide();
        });
        el.querySelector('#dr-check-history-search').addEventListener('input', () => {
            renderCheckHistoryBody();
        });

        _checkHistoryEl = el;
        return el;
    }

    function renderCheckHistoryBody() {
        const el = _checkHistoryEl;
        if (!el) return;
        const body = el.querySelector('#dr-check-history-body');
        const countEl = el.querySelector('#dr-check-history-count');
        const search = (el.querySelector('#dr-check-history-search')?.value || '')
            .trim()
            .toLowerCase();
        const all = OrderCheckStore.getAllSortedDesc();
        const filtered = !search
            ? all
            : all.filter((entry) => {
                  const blob = [entry.number, entry.customerName, entry.phone, entry.checkedBy]
                      .filter(Boolean)
                      .join(' ')
                      .toLowerCase();
                  return blob.includes(search);
              });

        countEl.textContent = search ? `(${filtered.length}/${all.length})` : `(${all.length} đơn)`;

        if (!filtered.length) {
            body.innerHTML = `
                <tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">
                    ${all.length === 0 ? 'Chưa có đơn nào được đánh dấu kiểm tra.' : 'Không có kết quả phù hợp.'}
                </td></tr>`;
            return;
        }

        body.innerHTML = filtered
            .map((entry, idx) => {
                const ts = entry.checkedAt ? new Date(entry.checkedAt).toLocaleString('vi-VN') : '';
                return `<tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:8px 10px;color:#6b7280;">${idx + 1}</td>
                    <td style="padding:8px 10px;font-weight:600;color:#111827;">${escapeHtml(entry.number || '')}</td>
                    <td style="padding:8px 10px;color:#374151;">${escapeHtml(entry.customerName || '')}</td>
                    <td style="padding:8px 10px;color:#374151;">${escapeHtml(entry.phone || '')}</td>
                    <td style="padding:8px 10px;color:#374151;">${escapeHtml(entry.checkedBy || '')}</td>
                    <td style="padding:8px 10px;color:#6b7280;white-space:nowrap;">${escapeHtml(ts)}</td>
                </tr>`;
            })
            .join('');
    }

    function openCheckHistory() {
        const el = ensureCheckHistoryModal();
        const searchInput = el.querySelector('#dr-check-history-search');
        if (searchInput) searchInput.value = '';
        renderCheckHistoryBody();
        el.style.display = 'flex';
    }

    function toLocalDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function setDefaultDates() {
        const todayStr = toLocalDateStr(new Date());

        const fromDateInput = document.getElementById('drFilterFromDate');
        const toDateInput = document.getElementById('drFilterToDate');

        if (fromDateInput && !fromDateInput.value) {
            fromDateInput.value = todayStr;
        }
        if (toDateInput && !toDateInput.value) {
            toDateInput.value = todayStr;
        }

        DeliveryReportState.filters.fromDate = `${fromDateInput.value}T00:00`;
        DeliveryReportState.filters.toDate = `${toDateInput.value}T23:59`;

        updatePresetHint();
    }

    // =====================================================
    // PRESET DATE RANGES
    // =====================================================
    const PRESET_LABELS = {
        today: 'Hôm nay',
        yesterday: 'Hôm qua',
        last7: '7 ngày qua',
        thisMonth: 'Tháng này',
        lastMonth: 'Tháng trước',
    };

    function applyPreset(preset) {
        const now = new Date();
        let from, to;

        switch (preset) {
            case 'today':
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'yesterday':
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                to = new Date(from);
                break;
            case 'last7':
                to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
                break;
            case 'thisMonth':
                from = new Date(now.getFullYear(), now.getMonth(), 1);
                to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'lastMonth': {
                from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                to = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
                break;
            }
            default:
                return;
        }

        const fromInput = document.getElementById('drFilterFromDate');
        const toInput = document.getElementById('drFilterToDate');
        if (fromInput) fromInput.value = toLocalDateStr(from);
        if (toInput) toInput.value = toLocalDateStr(to);

        // Mark active preset
        document.querySelectorAll('.dr-preset-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.preset === preset);
        });

        updatePresetHint();
        DeliveryReport.search();
    }

    function updatePresetHint() {
        const fromInput = document.getElementById('drFilterFromDate');
        const toInput = document.getElementById('drFilterToDate');
        const hint = document.getElementById('drPresetHint');
        if (!fromInput || !toInput || !hint) return;

        const fromStr = formatDDMM(fromInput.value);
        const toStr = formatDDMM(toInput.value);
        if (!fromStr || !toStr) {
            hint.textContent = '';
            return;
        }
        hint.textContent =
            fromInput.value === toInput.value
                ? `Đang lọc: ${fromStr}`
                : `Đang lọc: ${fromStr} → ${toStr}`;
    }

    function formatDDMM(yyyymmdd) {
        if (!yyyymmdd) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
        if (!m) return '';
        return `${m[3]}/${m[2]}/${m[1]}`;
    }

    function clearActivePreset() {
        document
            .querySelectorAll('.dr-preset-btn')
            .forEach((btn) => btn.classList.remove('active'));
    }

    // =====================================================
    // FILTER EVENTS
    // =====================================================
    function bindFilterEvents() {
        // Search button is handled by onclick="DeliveryReport.search()" in HTML

        // Preset buttons
        document.querySelectorAll('.dr-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        // Date inputs: clear preset selection on manual change + update hint
        ['drFilterFromDate', 'drFilterToDate'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                clearActivePreset();
                updatePresetHint();
            });
        });

        // Enter key on keyword
        const keywordInput = document.getElementById('drFilterKeyword');
        if (keywordInput) {
            keywordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Nếu đang ở chế độ Tra soát → xử lý như barcode scan
                    if (DeliveryReportState.traSoatMode) {
                        const scanned = keywordInput.value.trim().toUpperCase();
                        if (scanned) {
                            processScan(scanned);
                            keywordInput.value = '';
                        }
                        return;
                    }
                    DeliveryReport.search();
                }
            });
        }
    }

    // Date shifts (shared với báo cáo modal). Source of truth: server table
    // `delivery_assignment_date_shifts` qua endpoint `/api/v2/delivery-assignments/date-shifts`.
    // 2026-05-26: migrated từ localStorage → server cho cross-machine sync.
    // VD: user trong báo cáo dời 29/04, 30/04 → 02/05. Khi main page filter 02/05,
    // ta extend fetch range để include real 29/04+30/04, sau đó filter client-side
    // bằng displayDate (= shift target hoặc realDate).
    //
    // Cache strategy: in-memory `_dateShiftsCache` populated bởi `prefetchDateShifts()`
    // (gọi lúc init + trước mỗi search). Fallback localStorage chỉ để serve dữ liệu
    // cũ trong lúc chờ fetch lần đầu — sau migration sẽ rỗng.
    const _dateShiftsCache = { map: {}, fetchedAt: 0 };
    function _readDateShifts() {
        // Trả cache nếu đã fetch. Else fallback localStorage (1-time grace period).
        if (_dateShiftsCache.fetchedAt > 0) return _dateShiftsCache.map;
        try {
            return JSON.parse(localStorage.getItem('dr-date-shifts-v1') || '{}');
        } catch (_) {
            return {};
        }
    }
    async function prefetchDateShifts() {
        try {
            // Fetch khoảng rộng (12 tháng quanh hôm nay) để cover mọi filter user
            // có thể chọn mà không gọi server liên tục mỗi lần đổi filter.
            const today = new Date();
            const from = new Date(today);
            from.setMonth(from.getMonth() - 6);
            const to = new Date(today);
            to.setMonth(to.getMonth() + 6);
            const fmt = (d) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const url = `${RENDER_URL}/api/v2/delivery-assignments/date-shifts?from=${fmt(from)}&to=${fmt(to)}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const j = await resp.json();
            _dateShiftsCache.map = j.data?.shifts || {};
            _dateShiftsCache.fetchedAt = Date.now();
        } catch (e) {
            console.warn('[delivery-report] prefetchDateShifts failed:', e?.message);
        }
    }
    // Group-agnostic: nếu realDate có shift ở BẤT KỲ group nào → dùng shift đầu tiên tìm thấy
    function getEffectiveDisplayDate(realDate, shifts) {
        if (!realDate) return realDate;
        const map = shifts || _readDateShifts();
        for (const key in map) {
            if (key.startsWith(realDate + '__')) return map[key];
        }
        return realDate;
    }
    // Tính extended range cho fetch: thêm các real dates có shift vào displayDate trong [origFrom..origTo]
    function _computeExtendedRange(origFrom, origTo) {
        if (!origFrom || !origTo) return { from: origFrom, to: origTo };
        const shifts = _readDateShifts();
        let extFrom = origFrom;
        let extTo = origTo;
        for (const key of Object.keys(shifts)) {
            const displayDate = shifts[key];
            if (displayDate >= origFrom && displayDate <= origTo) {
                const realDate = key.split('__')[0];
                if (realDate && realDate < extFrom) extFrom = realDate;
                if (realDate && realDate > extTo) extTo = realDate;
            }
        }
        return { from: extFrom, to: extTo };
    }

    function collectFilters() {
        const f = DeliveryReportState.filters;
        const fromDate = document.getElementById('drFilterFromDate')?.value || '';
        const toDate = document.getElementById('drFilterToDate')?.value || '';

        // Auto-swap if from > to (common typo)
        let effFrom = fromDate;
        let effTo = toDate;
        if (effFrom && effTo && effFrom > effTo) {
            const swap = effFrom;
            effFrom = effTo;
            effTo = swap;
            const fromInput = document.getElementById('drFilterFromDate');
            const toInput = document.getElementById('drFilterToDate');
            if (fromInput) fromInput.value = effFrom;
            if (toInput) toInput.value = effTo;
        }

        // Original (user-typed) range — dùng để filter client-side sau khi fetch
        f._origFromDate = effFrom;
        f._origToDate = effTo;

        // Extended range — include real dates shifted vào range gốc
        const ext = _computeExtendedRange(effFrom, effTo);
        const fetchFrom = ext.from;
        const fetchTo = ext.to;

        // Time always pinned: 00:00 start of fromDate → 23:59 (end-of-minute pad
        // applied in buildApiUrl) of toDate. No manual time inputs.
        f.fromDate = fetchFrom ? `${fetchFrom}T00:00` : '';
        f.toDate = fetchTo ? `${fetchTo}T23:59` : '';
        f.keyword = document.getElementById('drFilterKeyword')?.value?.trim() || '';

        updatePresetHint();
    }

    function saveFiltersToStorage() {
        try {
            localStorage.setItem('dr_filters', JSON.stringify(DeliveryReportState.filters));
        } catch (e) {
            /* ignore quota errors */
        }
    }

    function loadFiltersFromStorage() {
        try {
            const saved = localStorage.getItem('dr_filters');
            if (saved) {
                const f = JSON.parse(saved);
                // Only restore keyword, not dates (dates always default to today)
                if (f.keyword) {
                    DeliveryReportState.filters.keyword = f.keyword;
                    document.getElementById('drFilterKeyword').value = f.keyword;
                }
            }
        } catch (e) {
            /* ignore */
        }
    }

    // =====================================================
    // COLUMN TOGGLE
    // =====================================================
    function bindColumnToggle() {
        const toggleBtn = document.getElementById('drColumnToggleBtn');
        const dropdown = document.getElementById('drColumnDropdown');
        if (!toggleBtn || !dropdown) return;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== toggleBtn) {
                dropdown.classList.remove('show');
            }
        });

        // Column checkboxes
        dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                DeliveryReportState.columns[cb.dataset.col] = cb.checked;
                applyColumnVisibility();
            });
        });
    }

    // =====================================================
    // CỘT CÔNG NỢ: click toggle partition "Công nợ < Tổng tiền" lên đầu
    // Giữ toàn bộ đơn, đơn đầu tiên của phần còn lại tô đỏ làm boundary.
    // =====================================================
    function bindFilterableHeaders() {
        const th = document.querySelector('.dr-table thead th[data-col="cashOnDelivery"]');
        if (!th) return;
        if (!th.querySelector('.sort-icon')) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-filter sort-icon';
            th.appendChild(document.createTextNode(' '));
            th.appendChild(icon);
        }
        th.addEventListener('click', () => {
            DeliveryReportState.filter.debtLessThanTotal =
                !DeliveryReportState.filter.debtLessThanTotal;
            DeliveryReportState.currentPage = 1;
            renderTable();
        });
        updateFilterIndicators();
    }

    function updateFilterIndicators() {
        const th = document.querySelector('.dr-table thead th[data-col="cashOnDelivery"]');
        if (!th) return;
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (DeliveryReportState.filter.debtLessThanTotal) {
            icon.style.color = '#4f46e5';
            th.title = 'Đơn Công nợ < Tổng tiền đang được đưa lên đầu (click để bỏ)';
        } else {
            icon.style.color = '';
            th.title = 'Click để đưa đơn Công nợ < Tổng tiền lên đầu';
        }
    }

    // Trả về { data: [...], boundaryIndex: index của đơn đầu tiên KHÔNG thoả điều kiện
    // trong mảng đã sắp xếp, hoặc -1 nếu không cần highlight }.
    function applyDebtSort(data) {
        if (!DeliveryReportState.filter.debtLessThanTotal) {
            return { data, boundaryIndex: -1 };
        }
        const matching = [];
        const rest = [];
        data.forEach((item) => {
            const cod = Number(item.CashOnDelivery) || 0;
            const total = Number(item.AmountTotal) || 0;
            if (cod < total) matching.push(item);
            else rest.push(item);
        });
        const combined = matching.concat(rest);
        // Không highlight nếu không có đơn nào match hoặc tất cả đều match
        const boundaryIndex = matching.length === 0 || rest.length === 0 ? -1 : matching.length;
        return { data: combined, boundaryIndex };
    }

    function applyColumnVisibility() {
        const cols = DeliveryReportState.columns;
        Object.keys(cols).forEach((colKey) => {
            const cells = document.querySelectorAll(`[data-col="${colKey}"]`);
            cells.forEach((cell) => {
                cell.style.display = cols[colKey] ? '' : 'none';
            });
        });
    }

    // =====================================================
    // API FETCH - Loads ALL data, client-side pagination
    // =====================================================
    function setSearchButtonLoading(isLoading) {
        const btn = document.getElementById('drBtnSearch');
        const text = document.getElementById('drBtnSearchText');
        if (!btn) return;
        btn.disabled = isLoading;
        btn.dataset.loading = isLoading ? 'true' : 'false';
        if (text) text.textContent = isLoading ? 'Đang tải...' : 'Tìm kiếm';
    }

    async function fetchData() {
        if (DeliveryReportState.isLoading) return;
        DeliveryReportState.isLoading = true;
        setSearchButtonLoading(true);
        showLoading();

        try {
            const token = await getToken();
            if (!token) {
                showError('Không thể lấy token xác thực. Vui lòng tải lại trang.');
                return;
            }

            const url = buildApiUrl();
            console.log('[DELIVERY-REPORT] Fetching:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                },
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const result = await response.json();
            const raw = result.value || [];
            // Filter client-side bằng displayDate (effective shift). Range fetch
            // mở rộng include shift sources; chỉ giữ order có displayDate ∈ origRange.
            const _f = DeliveryReportState.filters;
            const _origFrom = _f._origFromDate || '';
            const _origTo = _f._origToDate || '';
            const _shifts = _readDateShifts();
            DeliveryReportState.allData = raw.filter((i) => {
                if (DeliveryReportState.hiddenNumbers.has(i.Number)) return false;
                if (!_origFrom || !_origTo) return true;
                const realDate = (i.DateInvoice && extractTposDate(i.DateInvoice)) || '';
                if (!realDate) return true;
                const displayDate = getEffectiveDisplayDate(realDate, _shifts);
                return displayDate >= _origFrom && displayDate <= _origTo;
            });

            // Debug: check DeliveryNote field
            const withNote = DeliveryReportState.allData.filter((i) => i.DeliveryNote);
            console.log(
                '[DELIVERY-REPORT] Items with DeliveryNote:',
                withNote.length,
                withNote.map((i) => ({ Number: i.Number, DeliveryNote: i.DeliveryNote }))
            );
            const returnItems = DeliveryReportState.allData.filter((i) => isReturnItem(i));
            console.log(
                '[DELIVERY-REPORT] Return items (THU VE):',
                returnItems.length,
                returnItems.map((i) => ({ Number: i.Number, DeliveryNote: i.DeliveryNote }))
            );

            // Reset DB assignment cache on each fetch (date may have changed)
            DeliveryReportState._dbAssignmentsLoaded = false;
            DeliveryReportState._provinceGroupsLoaded = false;
            DeliveryReportState.dbAssignments = {};
            DeliveryReportState.provinceGroups = {};

            await ensureProvinceGroups();
            renderTable();
            renderStats();
            renderPagination();
            if (DeliveryReportState.traSoatMode) {
                updateScanCount();
            }
        } catch (error) {
            console.error('[DELIVERY-REPORT] Fetch error:', error);
            showError('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            DeliveryReportState.isLoading = false;
            setSearchButtonLoading(false);
        }
    }

    async function getToken() {
        // Try tokenManager (if loaded on this page)
        if (window.tokenManager && typeof window.tokenManager.getToken === 'function') {
            try {
                return await window.tokenManager.getToken();
            } catch (e) {
                console.warn('[DELIVERY-REPORT] tokenManager.getToken failed:', e);
            }
        }

        // Fallback: try localStorage
        try {
            const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
            const key = 'bearer_token_data_' + companyId;
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token) return data.access_token;
            }
        } catch (e) {
            /* ignore */
        }

        return null;
    }

    function buildApiUrl() {
        const f = DeliveryReportState.filters;
        const params = new URLSearchParams();

        // Date conversion: local datetime → UTC ISO
        // ToDate uses 23:59:59.999 (end of selected minute) so we don't drop
        // records whose DateInvoice falls in the last 60 seconds of the range.
        if (f.fromDate) {
            const d = new Date(f.fromDate);
            if (!isNaN(d.getTime())) {
                params.set('FromDate', d.toISOString());
            }
        }
        if (f.toDate) {
            const d = new Date(f.toDate);
            if (!isNaN(d.getTime())) {
                d.setSeconds(59, 999);
                params.set('ToDate', d.toISOString());
            }
        }

        // Phone-aware search: nếu keyword match Vietnamese phone pattern (10-11 digit
        // starting 0/3/5/7/8/9), KHÔNG gửi Q lên TPOS (Q chỉ search Number/TrackingRef,
        // không match Phone) → fetch full date range, lọc client-side theo Phone.
        // Loại trừ: barcode dài (>12 chars hoặc chứa ký tự không-digit-không-/-không-_).
        if (f.keyword && !isPhoneSearchKeyword(f.keyword)) {
            params.set('Q', f.keyword);
        }

        // Fetch all data (client-side pagination)
        params.set('$top', '10000');

        // Sort
        params.set('$orderby', 'DateInvoice desc,Number desc,Id desc');
        params.set('$count', 'true');

        return `${WORKER_URL}/api/odata/Report/DeliveryReport?${params.toString()}`;
    }

    // =====================================================
    // POPULATE CARRIER FILTER FROM DATA
    // =====================================================
    // Normalize carrier name: group all "THÀNH PHỐ (...)" into "THÀNH PHỐ"
    function normalizeCarrier(name) {
        if (!name) return '';
        if (name.toUpperCase().startsWith('THÀNH PHỐ')) return 'THÀNH PHỐ';
        return name;
    }

    // =====================================================
    // PHONE SEARCH HELPERS
    // =====================================================
    /**
     * Vietnamese phone pattern: chuỗi 9-11 chữ số, bắt đầu 0/3/5/7/8/9.
     * Loại trừ barcode (chứa ký tự không-digit, hoặc length quá dài/ngắn).
     */
    function isPhoneSearchKeyword(kw) {
        if (!kw) return false;
        const trimmed = String(kw).trim();
        // Pure digits, length 9-11
        if (!/^\d{9,11}$/.test(trimmed)) return false;
        // Vietnamese phone: bắt đầu 0 (10-11 digit) hoặc 3/5/7/8/9 (9-10 digit không có 0 prefix)
        return /^0/.test(trimmed) || /^[35789]/.test(trimmed);
    }

    /**
     * Normalize phone for comparison: bỏ hết khoảng trắng + leading 0/+84.
     * VD: "0905550610" / "905550610" / "+84905550610" → "905550610"
     */
    function normalizePhone(phone) {
        if (!phone) return '';
        let p = String(phone).replace(/[\s\-()+\.]/g, '');
        if (p.startsWith('84')) p = p.slice(2);
        if (p.startsWith('0')) p = p.slice(1);
        return p;
    }

    function matchesPhoneFilter(item, kw) {
        const target = normalizePhone(kw);
        if (!target) return true;
        const candidates = [item.Phone, item.Ship_Receiver_Phone, item.Telephone];
        for (const c of candidates) {
            if (c && normalizePhone(c).includes(target)) return true;
        }
        return false;
    }

    // =====================================================
    // CLIENT-SIDE FILTER (carrier + tra soát + phone)
    // =====================================================
    function getFilteredData() {
        const state = DeliveryReportState;
        const kw = state.filters?.keyword || '';
        const phoneFilter = isPhoneSearchKeyword(kw);

        if (state.traSoatMode) {
            // In tra soát mode: use tab filter + scan filter
            let data = getTabFilteredData();
            if (state.scanFilter === 'unscanned') {
                data = data.filter((item) => !state.scannedNumbers.has(item.Number));
            } else {
                data = data.filter((item) => state.scannedNumbers.has(item.Number));
            }
            // Phone filter applied trên cả tra soát mode
            if (phoneFilter) {
                data = data.filter((item) => matchesPhoneFilter(item, kw));
            }
            return data;
        }

        // Normal mode: phone filter nếu keyword là SĐT
        const all = state.allData || [];
        if (phoneFilter) {
            return all.filter((item) => matchesPhoneFilter(item, kw));
        }
        return all;
    }

    // =====================================================
    // RENDER TABLE
    // =====================================================
    function renderTable() {
        // Multi-column views in tra soát mode
        if (DeliveryReportState.traSoatMode && DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
            return;
        }
        if (
            DeliveryReportState.traSoatMode &&
            (DeliveryReportState.activeTab === 'all' || DeliveryReportState.activeTab === 'zero')
        ) {
            renderAllGroupsView();
            return;
        }

        // Ensure normal table is visible (unless lite-hide active outside Tra soát)
        const provinceView = document.getElementById('drProvinceView');
        const tableWrapper = document.getElementById('drTableWrapper');
        const grid = document.getElementById('drProvinceGrid');
        if (provinceView) provinceView.style.display = 'none';
        if (grid) grid.classList.remove('all-groups');
        if (tableWrapper) {
            const s = DeliveryReportState;
            const liteHide = s.uiMode === 'lite' && !s.liteRevealed && !s.traSoatMode;
            tableWrapper.style.display = liteHide ? 'none' : '';
        }

        const tbody = document.getElementById('drTableBody');
        const tfoot = document.getElementById('drTableFoot');
        if (!tbody) return;

        const { data: allData, boundaryIndex } = applyDebtSort(getFilteredData());
        DeliveryReportState.totalCount = allData.length;
        updateFilterIndicators();

        if (!allData || allData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-empty"><i class="fas fa-inbox"></i>Không có dữ liệu</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        // Client-side pagination: slice from allData
        const startIndex = (DeliveryReportState.currentPage - 1) * DeliveryReportState.pageSize;
        const endIndex = startIndex + DeliveryReportState.pageSize;
        const pageData = allData.slice(startIndex, endIndex);

        let html = '';
        let totalAmount = 0;
        let totalCOD = 0;
        let totalShipPrice = 0;

        pageData.forEach((item, i) => {
            totalAmount += item.AmountTotal || 0;
            totalCOD += item.CashOnDelivery || 0;
            totalShipPrice += item.DeliveryPrice || 0;

            const shipStatusClass = getShipStatusClass(item.ShipStatus);
            const forControlText = getForControlText(item);
            const rowClass = startIndex + i === boundaryIndex ? ' class="dr-debt-boundary"' : '';

            html += `<tr${rowClass}>
                <td data-col="index">${startIndex + i + 1}</td>
                <td data-col="number" class="dr-hover-bill" data-id="${escapeHtml(String(item.Id || ''))}" data-number="${escapeHtml(item.Number || '')}">${escapeHtml(item.Number || '')}</td>
                <td data-col="customer" class="dr-hover-customer" data-phone="${escapeHtml(item.Phone || '')}">
                    <div class="dr-customer-name">${escapeHtml(item.PartnerDisplayName || '')}</div>
                    <div class="dr-customer-phone">ĐT: ${escapeHtml(item.Phone || '')}</div>
                    <div class="dr-pancake-badge"></div>
                </td>
                <td data-col="receiverInfo">
                    <div class="dr-receiver-name">${escapeHtml(item.Ship_Receiver_Name || '')}</div>
                    <div class="dr-receiver-phone">Điện thoại: ${escapeHtml(item.Ship_Receiver_Phone || item.Phone || '')}</div>
                    <div class="dr-receiver-address">Địa chỉ: ${escapeHtml(item.FullAddress || item.Address || '')}</div>
                </td>
                <td data-col="dateInvoice">${formatDate(item.DateInvoice)}</td>
                <td data-col="amountTotal" class="dr-money">${formatMoney(item.AmountTotal)}</td>
                <td data-col="cashOnDelivery" class="dr-money">${formatMoney(item.CashOnDelivery)}</td>
                <td data-col="carrierName">${escapeHtml(item.CarrierName || '')}</td>
                <td data-col="deliveryPrice" class="dr-money">${formatMoney(item.DeliveryPrice)}</td>
                <td data-col="shipWeight" style="text-align:center">${item.ShipWeight || ''}</td>
                <td data-col="trackingRef">${escapeHtml(item.TrackingRef || '')}</td>
                <td data-col="showShipStatus"><span class="dr-ship-status ${shipStatusClass}">${escapeHtml(item.ShowShipStatus || '')}</span></td>
                <td data-col="forControlStatus">${forControlText}</td>
                ${DeliveryReportState.traSoatMode && DeliveryReportState.scanFilter === 'scanned' ? `<td class="dr-unscan-cell"><button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button></td>` : ''}
            </tr>`;
        });

        tbody.innerHTML = html;
        applyCheckedStylesToTable();

        // Pancake enrichment — async, non-blocking
        if (window.PancakeValidator) {
            const cells = tbody.querySelectorAll('td[data-col="customer"][data-phone]');
            const uniquePhones = [
                ...new Set([...cells].map((c) => c.dataset.phone).filter(Boolean)),
            ];
            uniquePhones.slice(0, 50).forEach((phone) => {
                window.PancakeValidator.quickLookup(phone).then((data) => {
                    if (!data) return;
                    cells.forEach((cell) => {
                        if (cell.dataset.phone !== phone) return;
                        const badge = cell.querySelector('.dr-pancake-badge');
                        if (badge)
                            badge.innerHTML = window.PancakeValidator.renderCustomerBadge(data);
                    });
                });
            });
        }

        // Footer totals (from ALL data, not just current page)
        let allTotalAmount = 0,
            allTotalCOD = 0,
            allTotalShipPrice = 0;
        allData.forEach((item) => {
            allTotalAmount += item.AmountTotal || 0;
            allTotalCOD += item.CashOnDelivery || 0;
            allTotalShipPrice += item.DeliveryPrice || 0;
        });

        if (tfoot) {
            tfoot.innerHTML = `<tr>
                <td data-col="index"></td>
                <td data-col="number"></td>
                <td data-col="customer"><strong>Tổng: ${formatNumber(DeliveryReportState.totalCount)}</strong></td>
                <td data-col="receiverInfo"></td>
                <td data-col="dateInvoice"></td>
                <td data-col="amountTotal" class="dr-money"><strong>${formatMoney(allTotalAmount)}</strong></td>
                <td data-col="cashOnDelivery" class="dr-money"><strong>${formatMoney(allTotalCOD)}</strong></td>
                <td data-col="carrierName"></td>
                <td data-col="deliveryPrice" class="dr-money"><strong>${formatMoney(allTotalShipPrice)}</strong></td>
                <td data-col="shipWeight"></td>
                <td data-col="trackingRef"></td>
                <td data-col="showShipStatus"></td>
                <td data-col="forControlStatus"></td>
            </tr>`;
        }

        applyColumnVisibility();
    }

    // =====================================================
    // RENDER STATS
    // =====================================================
    function renderStats() {
        const data = getFilteredData();
        const totalCount = data.length;

        let totalCOD = 0;
        let paidCount = 0;
        let paidAmount = 0;
        let returnCount = 0;
        let returnAmount = 0;
        let shippingCount = 0;
        let shippingAmount = 0;
        let failControlCount = 0;
        let failControlAmount = 0;

        // Stats from current view data (matches table after lite/tab/scan filters)
        data.forEach((item) => {
            totalCOD += item.CashOnDelivery || 0;
            if (item.ShipStatus === 'done') {
                paidCount++;
                paidAmount += item.CashOnDelivery || 0;
            } else if (item.ShipStatus === 'returned' || item.ShipStatus === 'cancel') {
                returnCount++;
                returnAmount += item.CashOnDelivery || 0;
            } else {
                shippingCount++;
                shippingAmount += item.CashOnDelivery || 0;
            }
            if (item.ShipPaymentStatus === 'fail') {
                failControlCount++;
                failControlAmount += item.CashOnDelivery || 0;
            }
        });

        // Update stat elements
        updateStatElement('drStatCODCount', `${formatNumber(totalCount)} Hóa đơn`);
        updateStatElement('drStatCODValue', formatMoney(totalCOD));

        updateStatElement('drStatPaidCount', `${formatNumber(paidCount)} Hóa đơn`);
        updateStatElement('drStatPaidValue', formatMoney(paidAmount));

        updateStatElement('drStatReturnCount', `${formatNumber(returnCount)} Hóa đơn`);
        updateStatElement('drStatReturnValue', formatMoney(returnAmount));

        updateStatElement('drStatShippingCount', `${formatNumber(shippingCount)} Hóa đơn`);
        updateStatElement('drStatShippingValue', formatMoney(shippingAmount));

        updateStatElement('drStatFailCount', `${formatNumber(failControlCount)} Hóa đơn`);
        updateStatElement('drStatFailValue', formatMoney(failControlAmount));
    }

    function updateStatElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // =====================================================
    // RENDER PAGINATION
    // =====================================================
    function renderPagination() {
        const container = document.getElementById('drPagination');
        if (!container) return;

        const totalPages = Math.ceil(DeliveryReportState.totalCount / DeliveryReportState.pageSize);
        const currentPage = DeliveryReportState.currentPage;
        const totalCount = DeliveryReportState.totalCount;
        const pageSize = DeliveryReportState.pageSize;

        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalCount);

        let pagesHtml = '';

        // First & Prev
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(1)" ${currentPage === 1 ? 'disabled' : ''} title="Trang đầu">&laquo;</button>`;
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} title="Trang trước">&lsaquo;</button>`;

        // Page numbers
        const range = getPageRange(currentPage, totalPages);
        range.forEach((p) => {
            if (p === '...') {
                pagesHtml += `<span style="padding: 0 6px; color: #9ca3af;">...</span>`;
            } else {
                pagesHtml += `<button class="dr-page-btn ${p === currentPage ? 'active' : ''}" onclick="DeliveryReport.goToPage(${p})">${p}</button>`;
            }
        });

        // Next & Last
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${currentPage + 1})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''} title="Trang sau">&rsaquo;</button>`;
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${totalPages})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''} title="Trang cuối">&raquo;</button>`;

        container.innerHTML = `
            <div class="dr-pagination-pages">${pagesHtml}</div>
            <div class="dr-page-size">
                <select id="drPageSizeSelect" onchange="DeliveryReport.changePageSize(this.value)">
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="200" ${pageSize === 200 ? 'selected' : ''}>200</option>
                    <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
                    <option value="1000" ${pageSize === 1000 ? 'selected' : ''}>1000</option>
                </select>
                <span>Số dòng trên trang</span>
            </div>
            <div class="dr-page-info">${totalCount > 0 ? `${formatNumber(startItem)} - ${formatNumber(endItem)} của ${formatNumber(totalCount)} dòng` : 'Không có dữ liệu'}</div>
        `;
    }

    function getPageRange(current, total) {
        if (total <= 10) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const pages = [];
        pages.push(1);

        let start = Math.max(2, current - 3);
        let end = Math.min(total - 1, current + 3);

        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < total - 1) pages.push('...');

        pages.push(total);
        return pages;
    }

    // =====================================================
    // UI HELPERS
    // =====================================================
    function showLoading() {
        const tbody = document.getElementById('drTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-loading"><div class="spinner"></div><div>Đang tải dữ liệu...</div></td></tr>`;
        }
        const tfoot = document.getElementById('drTableFoot');
        if (tfoot) tfoot.innerHTML = '';
    }

    function showError(message) {
        const tbody = document.getElementById('drTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>${escapeHtml(message)}</td></tr>`;
        }
    }

    function getShipStatusClass(status) {
        const map = {
            none: 'none',
            picking: 'picking',
            shipping: 'shipping',
            done: 'done',
            returned: 'returned',
            cancel: 'cancel',
        };
        return map[status] || 'none';
    }

    function getForControlText(item) {
        if (!item.ShipPaymentStatus && !item.CrossCheckTimes) return '';
        if (item.ShipPaymentStatus === 'done')
            return '<span style="color:#22c55e;font-weight:600;">Đã đối soát</span>';
        if (item.ShipPaymentStatus === 'fail')
            return '<span style="color:#ef4444;font-weight:600;">Không thành công</span>';
        return escapeHtml(item.ShipPaymentStatus || '');
    }

    // =====================================================
    // FORMAT HELPERS
    // =====================================================
    function formatMoney(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
    }

    function formatNumber(num) {
        if (!num && num !== 0) return '0';
        return new Intl.NumberFormat('vi-VN').format(num);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year}\n${hours}:${mins}`;
        } catch (e) {
            return dateStr;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =====================================================
    // EXCEL EXPORT
    // =====================================================
    // Tab name mapping for filenames and sheet names
    const TAB_LABELS = {
        city: { name: 'THANHPHO', sheet: 'Thành phố' },
        province: { name: 'TINH', sheet: 'Tỉnh' },
        shop: { name: 'SHOP', sheet: 'Bán hàng shop' },
        return: { name: 'THUVE', sheet: 'Thu về' },
        zero: { name: 'DON0D', sheet: 'ĐƠN 0đ' },
        all: { name: 'TATCA', sheet: 'Tất cả' },
        combo: { name: 'TOMATO_SHOP', sheet: 'TOMATO + SHOP' },
    };

    // Groups currently visible in the active view (Tra soát + mode + tab)
    function getActiveGroups() {
        const state = DeliveryReportState;
        if (!state.traSoatMode) return ['tomato', 'nap', 'city', 'shop', 'return'];
        const tab = state.activeTab;
        if (tab === 'province') return ['tomato', 'nap'];
        if (tab === 'city') return ['city'];
        if (tab === 'shop') return ['shop'];
        if (tab === 'return') return ['return'];
        // all/zero/combo → multi-group views
        if (state.uiMode === 'lite') return ['tomato', 'shop'];
        return ['tomato', 'nap', 'city', 'shop', 'return'];
    }

    function buildExcelRows(items) {
        const wsData = [['#', 'Số', 'Khách hàng', 'ĐT', 'Địa chỉ', 'Công nợ']];
        items.forEach((item, i) => {
            wsData.push([
                i + 1,
                item.Number || '',
                item.PartnerDisplayName || '',
                item.Phone || '',
                item.Address || '',
                item.CashOnDelivery || 0,
            ]);
        });
        const total = items.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        wsData.push(['', '', '', '', 'Tổng:', total]);
        return wsData;
    }

    // ── Thu về × CSKH ──────────────────────────────────────────────
    // Tab "Thu về" export: hỏi CSKH (customer_tickets) số lượng + giá trị món
    // thu về theo SĐT khách, đồng thời server đánh dấu ticket "đã bàn giao thu
    // về cho ship" gắn với Number đơn → re-export trả đúng dữ liệu cũ (idempotent).
    async function fetchReturnHandoverInfo(items) {
        const orders = items
            .map((it) => ({
                order_number: it.Number,
                // Phone RAW — server normalize (giữ số 0 đầu khớp customer_tickets.phone),
                // KHÔNG dùng normalizePhone local (strip số 0 đầu → lệch format).
                phone: it.Phone || it.Ship_Receiver_Phone || it.Telephone || '',
            }))
            .filter((o) => o.order_number);
        if (orders.length === 0) return {};

        const performedBy = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
        const resp = await fetch(`${RENDER_URL}/api/v2/tickets/handover-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orders,
                performed_by: performedBy,
                handover_date: todayLocalStr(),
            }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || 'handover-batch: invalid response');
        console.log(
            `[DELIVERY-REPORT] handover-batch: ${result.matched}/${result.total} đơn khớp ticket CSKH (${result.claimed} đánh dấu mới)`
        );
        return result.data || {};
    }

    // Như buildExcelRows nhưng thêm 2 cột "Số lượng" / "Giá trị" từ ticket CSKH.
    // Đơn không khớp ticket → 2 cột để trống.
    function buildExcelRowsReturn(items, handoverMap) {
        const wsData = [
            ['#', 'Số', 'Khách hàng', 'ĐT', 'Địa chỉ', 'Công nợ', 'Số lượng', 'Giá trị'],
        ];
        let qtyTotal = 0;
        let valueTotal = 0;
        items.forEach((item, i) => {
            const h = handoverMap[item.Number];
            if (h) {
                qtyTotal += h.quantity || 0;
                valueTotal += h.value || 0;
            }
            wsData.push([
                i + 1,
                item.Number || '',
                item.PartnerDisplayName || '',
                item.Phone || '',
                item.Address || '',
                item.CashOnDelivery || 0,
                h ? h.quantity : '',
                h ? h.value : '',
            ]);
        });
        const total = items.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        wsData.push(['', '', '', '', 'Tổng:', total, qtyTotal, valueTotal]);
        return wsData;
    }

    // ── Copy ảnh bàn giao TP cho shipper ───────────────────────────
    // Sinh ảnh PNG thay tờ giấy viết tay khi bàn giao đơn Thành phố.
    // Layout 2 CỘT (tối ưu xem Zalo điện thoại/PC): trái = GIAO (tổng đơn
    // TP − phí ship 20k/đơn = còn lại + bảng đơn 0đ), phải = THU VỀ (tổng −
    // phí ship như bên TP = còn lại + từng khách: tên + SL · giá trị + mã SP
    // từ ticket CSKH). Dòng Tổng cuối = còn lại TP + còn lại thu về.
    // Chỉ đơn ĐÃ QUÉT. Tiền đơn vị NGHÌN (110.298 = 110.298.000đ).
    const HANDOVER_SHIP_FEE = 20000; // phí ship shipper 20k/đơn (Thành phố + thu về)
    const HANDOVER_SHIP_FEE_PROVINCE = 23000; // phí ship 23k/đơn kênh tỉnh (TMT/NAP)
    function formatThousand(v) {
        return new Intl.NumberFormat('vi-VN').format(Math.round((v || 0) / 1000));
    }

    // Giá trị nhập ở nút Gửi Kèm theo đơn vị NGHÌN (nhập 300 = 300.000đ —
    // cùng quy ước giấy viết tay). Ai lỡ nhập full đồng (≥ 10.000) → quy về nghìn.
    function sendAlongThousand(v) {
        const n = Number(v) || 0;
        return n >= 10000 ? Math.round(n / 1000) : n;
    }

    function handoverDateLabel() {
        const f = DeliveryReportState.filters;
        const parse = (s) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
            return m ? `${Number(m[3])}/${Number(m[2])}` : null;
        };
        const from = parse(f.fromDate);
        const to = parse(f.toDate);
        if (from && to) return from === to ? from : `${from}–${to}`;
        const now = new Date();
        return `${now.getDate()}/${now.getMonth() + 1}`;
    }

    function buildHandoverCanvas({
        dateLabel,
        cityCount,
        cityTotal,
        zeroItems,
        returnItems,
        returnHandoverMap,
        extraItems,
    }) {
        const PAD = 24;
        const MID = 470; // vạch chia 2 cột: thu gọn cột trái, chừa chỗ cho bảng 3 cột THU VỀ
        const GAP = 28;
        const LEFT_R = MID - GAP / 2; // mép phải cột trái
        const RIGHT_L = MID + GAP / 2; // mép trái cột phải
        const ZROW_H = 32; // row bảng 0đ (compact)
        const RNAME_H = 26; // dòng tên KH thu về
        const RPROD_H = 22; // dòng sản phẩm thu về (mã SP | SL | giá trị)
        const feeK = HANDOVER_SHIP_FEE / 1000; // 20 (nghìn)

        const returnCount = returnItems.length;
        // Không có thu về → bỏ hẳn cột phải, ảnh thu lại 1 cột
        const hasReturn = returnCount > 0;
        const W = hasReturn ? 900 : MID;
        const returnTotal = returnItems.reduce((s, i) => s + (i.CashOnDelivery || 0), 0);
        const cityShip = cityCount * HANDOVER_SHIP_FEE;
        const cityNet = cityTotal - cityShip;
        const returnShip = returnCount * HANDOVER_SHIP_FEE;
        const returnNet = returnTotal - returnShip;

        // Đơn gửi riêng (nút Gửi Kèm) — giá trị/Thu đã ở đơn vị NGHÌN
        const extras = Array.isArray(extraItems) ? extraItems : [];
        const hasExtra = extras.length > 0;
        const extraCollectK = extras.reduce((s, o) => s + sendAlongThousand(o.collect), 0);
        const extraShipK = extras.length * (HANDOVER_SHIP_FEE / 1000);
        const extraNetK = extraCollectK - extraShipK;

        // Tổng cuối = Còn lại TP + Còn lại thu về + Còn lại gửi riêng
        const grandCount = cityCount + returnCount + extras.length;
        const grandTotal = cityNet + returnNet + extraNetK * 1000;

        // Mỗi đơn thu về = 1 dòng tên + N dòng sản phẩm (mã/SL/giá trị từ ticket).
        // Server cũ chỉ trả aggregate → fallback gộp 1 dòng. Không khớp ticket → "—".
        const returnBlocks = returnItems.map((item) => {
            const h = returnHandoverMap ? returnHandoverMap[item.Number] : null;
            let prods = Array.isArray(h?.products) ? h.products.slice() : [];
            if (prods.length === 0 && h) {
                prods = [
                    {
                        code: (h.product_codes || []).join(', '),
                        quantity: h.quantity,
                        value: h.value,
                    },
                ];
            }
            if (prods.length === 0) prods = [{ code: '', quantity: null, value: null }];
            return { item, prods };
        });
        const rightRowsH = returnBlocks.reduce(
            (s, b) => s + RNAME_H + b.prods.length * RPROD_H + 8,
            0
        );

        // Không có đơn 0đ → bỏ hẳn section (không ghi "Không có đơn 0đ")
        const hasZero = zeroItems.length > 0;

        const leftH =
            PAD +
            14 +
            30 +
            26 +
            26 +
            (hasZero ? 16 + 30 + 26 + zeroItems.length * ZROW_H : 0) +
            (hasExtra ? 16 + 30 + 24 + 26 + extras.length * ZROW_H : 0) +
            6;
        const rightH = PAD + 126 + 20 + rightRowsH + 4;
        const contentH = hasReturn ? Math.max(leftH, rightH) : leftH;
        const H = contentH + 16 + 24 + 18; // divider + dòng Tổng + đệm đáy
        const scale = 2;

        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const FONT = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        const truncate = (text, maxW) => {
            if (ctx.measureText(text).width <= maxW) return text;
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
                t = t.slice(0, -1);
            }
            return t + '…';
        };

        // ── CỘT TRÁI: GIAO ──
        let y = PAD + 14;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(`GIAO — TP (${dateLabel})`, PAD, y);

        y += 30;
        ctx.font = `bold 18px ${FONT}`;
        const cityLine = `${formatNumber(cityCount)} đơn:`;
        ctx.fillText(cityLine, PAD, y);
        ctx.fillStyle = '#b45309';
        ctx.fillText(` ${formatThousand(cityTotal)}`, PAD + ctx.measureText(cityLine).width, y);

        y += 26;
        ctx.font = `15px ${FONT}`;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(
            `Phí ship (${formatNumber(cityCount)} × ${feeK}): − ${formatThousand(cityShip)}`,
            PAD,
            y
        );

        y += 26;
        ctx.font = `bold 18px ${FONT}`;
        ctx.fillStyle = '#047857';
        ctx.fillText(`Còn lại: ${formatThousand(cityNet)}`, PAD, y);

        // Bảng ĐƠN 0đ (trong cột trái) — chỉ vẽ khi CÓ đơn 0đ
        if (hasZero) {
            // Sub-divider cột trái
            y += 16;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, y);
            ctx.lineTo(LEFT_R, y);
            ctx.stroke();

            y += 30;
            ctx.fillStyle = '#111827';
            ctx.font = `bold 17px ${FONT}`;
            ctx.fillText(`ĐƠN 0đ (${formatNumber(zeroItems.length)} đơn)`, PAD, y);

            // Cột Giá trị TRƯỚC, Thu SAU (user yêu cầu đổi vị trí 2026-06-12)
            const ZCOL = { idx: PAD, name: PAD + 26, value: LEFT_R - 64, thu: LEFT_R };
            y += 26;
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText('#', ZCOL.idx, y);
            ctx.fillText('Khách hàng — SĐT', ZCOL.name, y);
            ctx.textAlign = 'right';
            ctx.fillText('Giá trị', ZCOL.value, y);
            ctx.fillText('Thu', ZCOL.thu, y);

            zeroItems.forEach((item, i) => {
                y += ZROW_H;
                ctx.strokeStyle = '#f3f4f6';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, y - ZROW_H / 2);
                ctx.lineTo(LEFT_R, y - ZROW_H / 2);
                ctx.stroke();

                ctx.textAlign = 'left';
                ctx.font = `13px ${FONT}`;
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(String(i + 1), ZCOL.idx, y);

                ctx.font = `14px ${FONT}`;
                ctx.fillStyle = '#111827';
                const name = item.PartnerDisplayName || item.CustomerName || '';
                const phone = item.Phone || item.Ship_Receiver_Phone || '';
                ctx.fillText(
                    truncate(`${name}${phone ? ' — ' + phone : ''}`, ZCOL.value - ZCOL.name - 50),
                    ZCOL.name,
                    y
                );

                ctx.textAlign = 'right';
                ctx.fillStyle = '#b45309';
                ctx.fillText(formatThousand(item.AmountTotal), ZCOL.value, y);
                ctx.fillStyle = '#111827';
                ctx.fillText(formatThousand(item.CashOnDelivery), ZCOL.thu, y);
            });
        }

        // ── ĐƠN GỬI RIÊNG (nút Gửi Kèm) — dưới ĐƠN 0đ, chỉ vẽ khi có ──
        if (hasExtra) {
            y += 16;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, y);
            ctx.lineTo(LEFT_R, y);
            ctx.stroke();

            y += 30;
            ctx.textAlign = 'left';
            ctx.font = `bold 17px ${FONT}`;
            ctx.fillStyle = '#0369a1';
            const exTitle = `ĐƠN GỬI RIÊNG (${formatNumber(extras.length)} đơn):`;
            ctx.fillText(exTitle, PAD, y);
            ctx.fillStyle = '#b45309';
            ctx.fillText(
                ` ${formatNumber(extraCollectK)}`,
                PAD + ctx.measureText(exTitle).width,
                y
            );

            y += 24;
            ctx.font = `15px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            const exFee = `Phí ship (${formatNumber(extras.length)} × ${feeK}): − ${formatNumber(extraShipK)}`;
            ctx.fillText(exFee, PAD, y);
            ctx.font = `bold 15px ${FONT}`;
            ctx.fillStyle = '#047857';
            ctx.fillText(
                ` · Còn lại: ${formatNumber(extraNetK)}`,
                PAD + ctx.measureText(exFee).width + 4,
                y
            );

            const XCOL = { idx: PAD, name: PAD + 26, value: LEFT_R - 64, thu: LEFT_R };
            y += 26;
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText('#', XCOL.idx, y);
            ctx.fillText('Khách hàng — SĐT', XCOL.name, y);
            ctx.textAlign = 'right';
            ctx.fillText('Giá trị', XCOL.value, y);
            ctx.fillText('Thu', XCOL.thu, y);

            extras.forEach((o, i) => {
                y += ZROW_H;
                ctx.strokeStyle = '#f3f4f6';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, y - ZROW_H / 2);
                ctx.lineTo(LEFT_R, y - ZROW_H / 2);
                ctx.stroke();

                ctx.textAlign = 'left';
                ctx.font = `13px ${FONT}`;
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(String(i + 1), XCOL.idx, y);

                ctx.font = `14px ${FONT}`;
                ctx.fillStyle = '#111827';
                ctx.fillText(
                    truncate(
                        `${o.name}${o.phone ? ' — ' + o.phone : ''}`,
                        XCOL.value - XCOL.name - 50
                    ),
                    XCOL.name,
                    y
                );

                ctx.textAlign = 'right';
                ctx.fillStyle = '#b45309';
                ctx.fillText(formatNumber(sendAlongThousand(o.value)), XCOL.value, y);
                ctx.fillStyle = '#111827';
                ctx.font = `bold 14px ${FONT}`;
                ctx.fillText(formatNumber(sendAlongThousand(o.collect)), XCOL.thu, y);
            });
        }

        // ── CỘT PHẢI: THU VỀ — chỉ vẽ khi CÓ đơn thu về (0 đơn → ảnh 1 cột) ──
        if (hasReturn) {
            let ry = PAD + 14;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#7c3aed';
            ctx.font = `bold 20px ${FONT}`;
            ctx.fillText('THU VỀ', RIGHT_L, ry);

            ry += 30;
            ctx.font = `bold 18px ${FONT}`;
            ctx.fillStyle = '#111827';
            const retLine = `${formatNumber(returnCount)} đơn:`;
            ctx.fillText(retLine, RIGHT_L, ry);
            ctx.fillStyle = '#7c3aed';
            ctx.fillText(
                ` ${formatThousand(returnTotal)}`,
                RIGHT_L + ctx.measureText(retLine).width,
                ry
            );

            ry += 26;
            ctx.font = `15px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText(
                `Phí ship (${formatNumber(returnCount)} × ${feeK}): − ${formatThousand(returnShip)}`,
                RIGHT_L,
                ry
            );

            ry += 26;
            ctx.font = `bold 18px ${FONT}`;
            ctx.fillStyle = '#047857';
            ctx.fillText(`Còn lại: ${formatThousand(returnNet)}`, RIGHT_L, ry);

            // Sub-divider cột phải (đối xứng cột trái)
            ry += 16;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(RIGHT_L, ry);
            ctx.lineTo(W - PAD, ry);
            ctx.stroke();
            ry += 14;

            // Header 3 cột: Mã SP | SL | Giá trị (giá trị = đơn giá × SL từng món)
            const RCOL = { code: RIGHT_L + 16, sl: W - PAD - 80, value: W - PAD };
            ry += 20;
            ctx.textAlign = 'left';
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText('Mã SP', RCOL.code, ry);
            ctx.textAlign = 'right';
            ctx.fillText('SL', RCOL.sl, ry);
            ctx.fillText('Giá trị', RCOL.value, ry);

            returnBlocks.forEach((block, i) => {
                const name = block.item.PartnerDisplayName || block.item.CustomerName || '';
                const phone = block.item.Phone || block.item.Ship_Receiver_Phone || '';

                ry += RNAME_H;
                if (i > 0) {
                    ctx.strokeStyle = '#f3f4f6';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(RIGHT_L, ry - RNAME_H + 8);
                    ctx.lineTo(W - PAD, ry - RNAME_H + 8);
                    ctx.stroke();
                }
                ctx.textAlign = 'left';
                ctx.font = `bold 14px ${FONT}`;
                ctx.fillStyle = '#111827';
                ctx.fillText(
                    truncate(
                        `${i + 1}. ${name}${phone ? ' — ' + phone : ''}`,
                        W - PAD - RIGHT_L - 4
                    ),
                    RIGHT_L,
                    ry
                );

                block.prods.forEach((p) => {
                    ry += RPROD_H;
                    ctx.textAlign = 'left';
                    ctx.font = `bold 13px ${FONT}`;
                    ctx.fillStyle = '#374151';
                    ctx.fillText(truncate(p.code || '—', RCOL.sl - RCOL.code - 50), RCOL.code, ry);
                    ctx.textAlign = 'right';
                    ctx.font = `13px ${FONT}`;
                    ctx.fillStyle = '#111827';
                    ctx.fillText(p.quantity != null ? formatNumber(p.quantity) : '—', RCOL.sl, ry);
                    ctx.font = `bold 13px ${FONT}`;
                    ctx.fillStyle = '#b45309';
                    ctx.fillText(p.value != null ? formatThousand(p.value) : '—', RCOL.value, ry);
                });
                ry += 8;
            });

            // Vạch dọc chia 2 cột
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(MID, PAD);
            ctx.lineTo(MID, contentH);
            ctx.stroke();
        }

        // ── Footer: Tổng (TP + Thu về, đều đã trừ phí ship) + timestamp ──
        const fy = contentH + 16;
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(PAD, fy);
        ctx.lineTo(W - PAD, fy);
        ctx.stroke();

        const ty = fy + 24;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        ctx.font = `bold 19px ${FONT}`;
        const grandLabel = `Tổng — ${formatNumber(grandCount)} đơn:`;
        ctx.fillText(grandLabel, PAD, ty);
        ctx.fillStyle = '#047857';
        ctx.fillText(` ${formatThousand(grandTotal)}`, PAD + ctx.measureText(grandLabel).width, ty);

        ctx.textAlign = 'right';
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = '#9ca3af';
        const now = new Date();
        const ts = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        ctx.fillText(`Tạo lúc: ${ts}`, W - PAD, ty);

        return canvas;
    }

    async function canvasToBlob(canvas) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('canvas.toBlob trả về null');
        return blob;
    }

    // Copy blob PNG vào clipboard; browser chặn → fallback tải file.
    // Trả về true nếu copy clipboard thành công.
    async function copyBlobToClipboard(blob, fileName) {
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            return true;
        } catch (clipErr) {
            console.warn('[DELIVERY-REPORT] clipboard write failed:', clipErr);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            alert('Không copy được vào clipboard — đã tải ảnh PNG về máy thay thế.');
            return false;
        }
    }

    async function copyCanvasToClipboard(canvas, fileName) {
        return copyBlobToClipboard(await canvasToBlob(canvas), fileName);
    }

    // Gửi ảnh bàn giao vào nhóm Telegram qua bot RIÊNG của delivery-report
    // (Render route /api/delivery-report-telegram — gọi thẳng n2store-fallback,
    // không qua CF worker vì worker route theo path whitelist).
    const DELIVERY_REPORT_TELEGRAM_API =
        'https://n2store-fallback.onrender.com/api/delivery-report-telegram';

    async function sendHandoverImageToTelegram(blob, caption) {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Không đọc được ảnh PNG'));
            reader.readAsDataURL(blob);
        });
        const res = await fetch(`${DELIVERY_REPORT_TELEGRAM_API}/send-photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl, caption }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }
        return json;
    }

    // Ảnh bàn giao 1 CỘT cho nhóm Tỉnh (TMT/NAP) — giống cột trái ảnh TP,
    // 2 kênh này KHÔNG có thu về.
    function buildGroupHandoverCanvas({ label, dateLabel, count, total, zeroItems, extraItems }) {
        const W = 520;
        const PAD = 24;
        const ZROW_H = 32;
        const feeK = HANDOVER_SHIP_FEE_PROVINCE / 1000; // kênh tỉnh 23k/đơn
        const ship = count * HANDOVER_SHIP_FEE_PROVINCE;
        const net = total - ship;
        // Không có đơn 0đ → bỏ hẳn section (không ghi "Không có đơn 0đ")
        const hasZero = zeroItems.length > 0;

        // Đơn gửi riêng (nút Gửi Kèm, kênh TOMATO/NAP) — đơn vị NGHÌN
        const extras = Array.isArray(extraItems) ? extraItems : [];
        const hasExtra = extras.length > 0;
        const extraCollectK = extras.reduce((s, o) => s + sendAlongThousand(o.collect), 0);
        const extraShipK = extras.length * feeK;
        const extraNetK = extraCollectK - extraShipK;

        // Tổng cuối = Còn lại kênh + Còn lại gửi riêng
        const grandCount = count + extras.length;
        const grandNet = net + extraNetK * 1000;

        const H =
            PAD +
            14 +
            30 +
            26 +
            26 +
            (hasZero ? 16 + 30 + 26 + zeroItems.length * ZROW_H : 0) +
            (hasExtra ? 16 + 30 + 24 + 26 + extras.length * ZROW_H : 0) +
            6 +
            16 +
            24 +
            18;
        const scale = 2;

        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const FONT = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        const truncate = (text, maxW) => {
            if (ctx.measureText(text).width <= maxW) return text;
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
                t = t.slice(0, -1);
            }
            return t + '…';
        };

        // Header: tổng − phí ship = còn lại
        let y = PAD + 14;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(`GIAO — ${label} (${dateLabel})`, PAD, y);

        y += 30;
        ctx.font = `bold 18px ${FONT}`;
        const countLine = `${formatNumber(count)} đơn:`;
        ctx.fillText(countLine, PAD, y);
        ctx.fillStyle = '#b45309';
        ctx.fillText(` ${formatThousand(total)}`, PAD + ctx.measureText(countLine).width, y);

        y += 26;
        ctx.font = `15px ${FONT}`;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(
            `Phí ship (${formatNumber(count)} × ${feeK}): − ${formatThousand(ship)}`,
            PAD,
            y
        );

        y += 26;
        ctx.font = `bold 18px ${FONT}`;
        ctx.fillStyle = '#047857';
        ctx.fillText(`Còn lại: ${formatThousand(net)}`, PAD, y);

        // Bảng ĐƠN 0đ — chỉ vẽ khi CÓ đơn 0đ
        if (hasZero) {
            y += 16;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, y);
            ctx.lineTo(W - PAD, y);
            ctx.stroke();

            y += 30;
            ctx.fillStyle = '#111827';
            ctx.font = `bold 17px ${FONT}`;
            ctx.fillText(`ĐƠN 0đ (${formatNumber(zeroItems.length)} đơn)`, PAD, y);

            const ZCOL = { idx: PAD, name: PAD + 26, value: W - PAD - 64, thu: W - PAD };
            y += 26;
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText('#', ZCOL.idx, y);
            ctx.fillText('Khách hàng — SĐT', ZCOL.name, y);
            ctx.textAlign = 'right';
            ctx.fillText('Giá trị', ZCOL.value, y);
            ctx.fillText('Thu', ZCOL.thu, y);

            zeroItems.forEach((item, i) => {
                y += ZROW_H;
                ctx.strokeStyle = '#f3f4f6';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, y - ZROW_H / 2);
                ctx.lineTo(W - PAD, y - ZROW_H / 2);
                ctx.stroke();

                ctx.textAlign = 'left';
                ctx.font = `13px ${FONT}`;
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(String(i + 1), ZCOL.idx, y);

                ctx.font = `14px ${FONT}`;
                ctx.fillStyle = '#111827';
                const name = item.PartnerDisplayName || item.CustomerName || '';
                const phone = item.Phone || item.Ship_Receiver_Phone || '';
                ctx.fillText(
                    truncate(`${name}${phone ? ' — ' + phone : ''}`, ZCOL.value - ZCOL.name - 50),
                    ZCOL.name,
                    y
                );

                ctx.textAlign = 'right';
                ctx.fillStyle = '#b45309';
                ctx.fillText(formatThousand(item.AmountTotal), ZCOL.value, y);
                ctx.fillStyle = '#111827';
                ctx.fillText(formatThousand(item.CashOnDelivery), ZCOL.thu, y);
            });
        }

        // ── ĐƠN GỬI RIÊNG (nút Gửi Kèm, kênh TOMATO/NAP) — chỉ vẽ khi có ──
        if (hasExtra) {
            y += 16;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, y);
            ctx.lineTo(W - PAD, y);
            ctx.stroke();

            y += 30;
            ctx.textAlign = 'left';
            ctx.font = `bold 17px ${FONT}`;
            ctx.fillStyle = '#0369a1';
            const exTitle = `ĐƠN GỬI RIÊNG (${formatNumber(extras.length)} đơn):`;
            ctx.fillText(exTitle, PAD, y);
            ctx.fillStyle = '#b45309';
            ctx.fillText(
                ` ${formatNumber(extraCollectK)}`,
                PAD + ctx.measureText(exTitle).width,
                y
            );

            y += 24;
            ctx.font = `15px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            const exFee = `Phí ship (${formatNumber(extras.length)} × ${feeK}): − ${formatNumber(extraShipK)}`;
            ctx.fillText(exFee, PAD, y);
            ctx.font = `bold 15px ${FONT}`;
            ctx.fillStyle = '#047857';
            ctx.fillText(
                ` · Còn lại: ${formatNumber(extraNetK)}`,
                PAD + ctx.measureText(exFee).width + 4,
                y
            );

            const XCOL = { idx: PAD, name: PAD + 26, value: W - PAD - 64, thu: W - PAD };
            y += 26;
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText('#', XCOL.idx, y);
            ctx.fillText('Khách hàng — SĐT', XCOL.name, y);
            ctx.textAlign = 'right';
            ctx.fillText('Giá trị', XCOL.value, y);
            ctx.fillText('Thu', XCOL.thu, y);

            extras.forEach((o, i) => {
                y += ZROW_H;
                ctx.strokeStyle = '#f3f4f6';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, y - ZROW_H / 2);
                ctx.lineTo(W - PAD, y - ZROW_H / 2);
                ctx.stroke();

                ctx.textAlign = 'left';
                ctx.font = `13px ${FONT}`;
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(String(i + 1), XCOL.idx, y);

                ctx.font = `14px ${FONT}`;
                ctx.fillStyle = '#111827';
                ctx.fillText(
                    truncate(
                        `${o.name}${o.phone ? ' — ' + o.phone : ''}`,
                        XCOL.value - XCOL.name - 50
                    ),
                    XCOL.name,
                    y
                );

                ctx.textAlign = 'right';
                ctx.fillStyle = '#b45309';
                ctx.fillText(formatNumber(sendAlongThousand(o.value)), XCOL.value, y);
                ctx.fillStyle = '#111827';
                ctx.font = `bold 14px ${FONT}`;
                ctx.fillText(formatNumber(sendAlongThousand(o.collect)), XCOL.thu, y);
            });
        }

        // ── Footer: Tổng (kênh + gửi riêng, đã trừ ship) + timestamp ──
        const fy = y + 6 + 16;
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(PAD, fy);
        ctx.lineTo(W - PAD, fy);
        ctx.stroke();

        const ty = fy + 24;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        ctx.font = `bold 18px ${FONT}`;
        const grandLabel = `Tổng — ${formatNumber(grandCount)} đơn:`;
        ctx.fillText(grandLabel, PAD, ty);
        ctx.fillStyle = '#047857';
        ctx.fillText(` ${formatThousand(grandNet)}`, PAD + ctx.measureText(grandLabel).width, ty);

        ctx.textAlign = 'right';
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = '#9ca3af';
        const now = new Date();
        const ts = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        ctx.fillText(`Tạo lúc: ${ts}`, W - PAD, ty);

        return canvas;
    }

    // Nút "Ảnh TMT" / "Ảnh NAP" trên tab Tỉnh — group theo provinceGroups
    // (cùng cách chia với renderProvinceView + exportExcelProvince).
    async function copyGroupHandoverImage(group) {
        const state = DeliveryReportState;
        if (state.activeTab !== 'province' || !state.traSoatMode) return;

        const label = group === 'tomato' ? 'TMT' : 'NAP';
        const btnId = group === 'tomato' ? 'drBtnCopyHandoverTomato' : 'drBtnCopyHandoverNap';
        const btn = document.getElementById(btnId);
        const btnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
        }
        const resetBtn = (html) => {
            if (!btn) return;
            btn.disabled = false;
            btn.innerHTML = html || btnHtml;
        };

        try {
            const groups = state.provinceGroups;
            const groupItems = getTabFilteredData().filter((i) => groups[i.Number] === group);
            const scannedItems = groupItems.filter((i) => state.scannedNumbers.has(i.Number));
            const unscannedCount = groupItems.length - scannedItems.length;
            if (scannedItems.length === 0) {
                alert(`Chưa có đơn ${label} nào được quét — không có gì để bàn giao.`);
                resetBtn();
                return;
            }
            if (unscannedCount > 0) {
                const ok = confirm(
                    `Còn ${unscannedCount} đơn ${label} CHƯA quét.\n` +
                        `Vẫn tạo ảnh bàn giao với ${scannedItems.length} đơn đã quét?`
                );
                if (!ok) {
                    resetBtn();
                    return;
                }
            }

            const total = scannedItems.reduce((s, i) => s + (i.CashOnDelivery || 0), 0);
            const zeroItems = scannedItems.filter(isZeroCOD);

            // Đơn gửi riêng (nút Gửi Kèm) của kênh TOMATO/NAP — nếu có
            let extraItems = [];
            try {
                if (window.SendAlong?.getOrdersForChannel) {
                    extraItems = await window.SendAlong.getOrdersForChannel(
                        group === 'tomato' ? 'TOMATO' : 'NAP'
                    );
                }
            } catch (e) {
                console.warn('[DELIVERY-REPORT] đọc đơn gửi kèm lỗi:', e.message);
            }

            const canvas = buildGroupHandoverCanvas({
                label,
                dateLabel: handoverDateLabel(),
                count: scannedItems.length,
                total,
                zeroItems,
                extraItems,
            });
            const blob = await canvasToBlob(canvas);

            // Gửi ảnh vào nhóm Telegram (bot riêng delivery-report) — giống nút Ảnh Thành Phố.
            // Bỏ clipboard — gửi TG thành công thì refresh lại trang.
            try {
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Đang gửi Telegram...';
                }
                await sendHandoverImageToTelegram(
                    blob,
                    `📦 Bàn giao ${label} ${handoverDateLabel()} — ${scannedItems.length} đơn`
                );
                resetBtn('<i class="fas fa-check"></i> Đã gửi TG — đang tải lại...');
                // Gửi thành công → refresh lại trang
                setTimeout(() => window.location.reload(), 600);
            } catch (tgError) {
                console.error('[DELIVERY-REPORT] gửi Telegram lỗi:', tgError);
                alert('Gửi Telegram thất bại: ' + tgError.message);
                resetBtn();
                setTimeout(() => resetBtn(), 3000);
            }
        } catch (error) {
            console.error('[DELIVERY-REPORT] copyGroupHandoverImage error:', error);
            alert('Lỗi khi tạo ảnh bàn giao: ' + error.message);
            resetBtn();
        }
    }

    async function copyHandoverImage() {
        const state = DeliveryReportState;
        if (state.activeTab !== 'city' || !state.traSoatMode) return;

        const btn = document.getElementById('drBtnCopyHandover');
        const btnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
        }
        const resetBtn = (html) => {
            if (!btn) return;
            btn.disabled = false;
            btn.innerHTML = html || btnHtml;
        };

        try {
            const tabData = getTabFilteredData();
            const scannedItems = tabData.filter((i) => state.scannedNumbers.has(i.Number));
            const unscannedCount = tabData.length - scannedItems.length;
            if (scannedItems.length === 0) {
                alert('Chưa có đơn Thành phố nào được quét — không có gì để bàn giao.');
                resetBtn();
                return;
            }
            if (unscannedCount > 0) {
                const ok = confirm(
                    `Còn ${unscannedCount} đơn Thành phố CHƯA quét.\n` +
                        `Vẫn tạo ảnh bàn giao với ${scannedItems.length} đơn đã quét?`
                );
                if (!ok) {
                    resetBtn();
                    return;
                }
            }

            const cityTotal = scannedItems.reduce((s, i) => s + (i.CashOnDelivery || 0), 0);
            const zeroItems = scannedItems.filter(isZeroCOD);
            const returnScanned = (state.allData || []).filter(
                (i) => isReturnItem(i) && state.scannedNumbers.has(i.Number)
            );

            // SL + giá trị món thu về từ ticket CSKH (như cột excel Thu về).
            // API lỗi → vẫn tạo ảnh, 2 cột hiện "—".
            let returnHandoverMap = null;
            if (returnScanned.length > 0) {
                try {
                    returnHandoverMap = await fetchReturnHandoverInfo(returnScanned);
                } catch (e) {
                    console.warn(
                        '[DELIVERY-REPORT] handover-batch failed (ảnh bàn giao):',
                        e.message
                    );
                }
            }

            // Đơn gửi riêng (nút Gửi Kèm) của kênh Thành phố — nếu có
            let extraItems = [];
            try {
                if (window.SendAlong?.getOrdersForChannel) {
                    extraItems = await window.SendAlong.getOrdersForChannel('Thành phố');
                }
            } catch (e) {
                console.warn('[DELIVERY-REPORT] đọc đơn gửi kèm lỗi:', e.message);
            }

            const canvas = buildHandoverCanvas({
                dateLabel: handoverDateLabel(),
                cityCount: scannedItems.length,
                cityTotal,
                zeroItems,
                returnItems: returnScanned,
                returnHandoverMap,
                extraItems,
            });
            // Auto-điền SL ĐƠN SHIP + THU VỀ vào Báo cáo (nhóm THÀNH PHỐ) từ data thu về.
            // SL ĐƠN SHIP ← số đơn thu về đã quét; THU VỀ ← tổng giá trị thu về (gross COD,
            // khớp dòng "N đơn: X" trên ảnh). Chỉ điền khi ô trống — không đè giá trị sửa tay.
            try {
                if (window.DeliveryReportReport?.autofillCityReturns) {
                    const isoDate = String(state.filters?.fromDate || '').slice(0, 10);
                    const returnTotal = returnScanned.reduce(
                        (s, i) => s + (i.CashOnDelivery || 0),
                        0
                    );
                    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
                        window.DeliveryReportReport.autofillCityReturns(
                            isoDate,
                            returnScanned.length,
                            returnTotal
                        );
                    }
                }
            } catch (e) {
                console.warn('[DELIVERY-REPORT] auto-điền Báo cáo (thu về) lỗi:', e.message);
            }

            const blob = await canvasToBlob(canvas);

            // Gửi ảnh vào nhóm Telegram (bot riêng delivery-report).
            // Bỏ clipboard — gửi TG thành công thì refresh lại trang.
            try {
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Đang gửi Telegram...';
                }
                await sendHandoverImageToTelegram(
                    blob,
                    `📦 Bàn giao Thành phố ${handoverDateLabel()} — ${scannedItems.length} đơn` +
                        (returnScanned.length > 0 ? ` · ${returnScanned.length} thu về` : '')
                );
                resetBtn('<i class="fas fa-check"></i> Đã gửi TG — đang tải lại...');
                // Gửi thành công → refresh lại trang
                setTimeout(() => window.location.reload(), 600);
            } catch (tgError) {
                console.error('[DELIVERY-REPORT] gửi Telegram lỗi:', tgError);
                alert('Gửi Telegram thất bại: ' + tgError.message);
                resetBtn();
                setTimeout(() => resetBtn(), 3000);
            }
        } catch (error) {
            console.error('[DELIVERY-REPORT] copyHandoverImage error:', error);
            alert('Lỗi khi tạo ảnh bàn giao: ' + error.message);
            resetBtn();
        }
    }

    function autoFitColumns(ws, wsData) {
        const cols = wsData[0].map((_, colIdx) => {
            let maxLen = 0;
            for (const row of wsData) {
                const val = row[colIdx];
                const len = val != null ? String(val).length : 0;
                if (len > maxLen) maxLen = len;
            }
            return { wch: Math.max(maxLen + 2, 4) };
        });
        ws['!cols'] = cols;
    }

    function makeFileName(label) {
        // Pull the actual filter range so the filename reflects what's exported.
        // Single day → `LABEL_d_m.xlsx`, range → `LABEL_d1_m1_den_d2_m2.xlsx`.
        const f = DeliveryReportState.filters;
        const parseDate = (s) => {
            if (!s) return null;
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
            if (!m) return null;
            return { d: Number(m[3]), mo: Number(m[2]), y: Number(m[1]) };
        };
        const from = parseDate(f.fromDate);
        const to = parseDate(f.toDate);

        if (from && to) {
            const sameYear = from.y === to.y;
            const sameDay = from.d === to.d && from.mo === to.mo && sameYear;
            if (sameDay) {
                return `${label}_${from.d}_${from.mo}.xlsx`;
            }
            const fromStr = sameYear ? `${from.d}_${from.mo}` : `${from.d}_${from.mo}_${from.y}`;
            const toStr = sameYear ? `${to.d}_${to.mo}` : `${to.d}_${to.mo}_${to.y}`;
            return `${label}_${fromStr}_den_${toStr}.xlsx`;
        }

        const now = new Date();
        return `${label}_${now.getDate()}_${now.getMonth() + 1}.xlsx`;
    }

    async function exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const btn = document.getElementById('drBtnExport');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Đang xuất...';
        }

        try {
            const state = DeliveryReportState;
            const tab = state.traSoatMode ? state.activeTab : 'all';
            const tabInfo = TAB_LABELS[tab] || TAB_LABELS.all;

            if (tab === 'province' && state.traSoatMode) {
                // Tỉnh tab: export 2 sheets (TOMATO + NAP)
                exportExcelProvinceAll();
                return;
            }

            if ((tab === 'all' || tab === 'combo') && state.traSoatMode) {
                // Tất cả / Combo tab: export sheets for the active groups (lite=2, full=5)
                exportExcelAllGroups();
                return;
            }

            if (tab === 'zero' && state.traSoatMode) {
                // ĐƠN 0đ tab: export chỉ đơn 0đ, chia theo nhóm
                exportExcelZeroDong();
                return;
            }

            const items = state.traSoatMode ? getTabFilteredData() : state.allData || [];
            let wsData;
            if (tab === 'return' && state.traSoatMode) {
                // Tab Thu về: enrich 2 cột Số lượng/Giá trị từ ticket CSKH + đánh dấu
                // bàn giao ship. API lỗi → vẫn xuất file 6 cột như cũ.
                let handoverMap = null;
                try {
                    handoverMap = await fetchReturnHandoverInfo(items);
                } catch (e) {
                    console.warn('[DELIVERY-REPORT] handover-batch failed:', e.message);
                    alert(
                        'Không lấy được dữ liệu CSKH (Số lượng/Giá trị): ' +
                            e.message +
                            '\nVẫn xuất Excel nhưng KHÔNG có 2 cột này.'
                    );
                }
                wsData = handoverMap
                    ? buildExcelRowsReturn(items, handoverMap)
                    : buildExcelRows(items);
            } else {
                wsData = buildExcelRows(items);
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            autoFitColumns(ws, wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, tabInfo.sheet);
            XLSX.writeFile(wb, makeFileName(tabInfo.name));
        } catch (error) {
            console.error('[DELIVERY-REPORT] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-excel"></i> Xuất excel';
            }
        }
    }

    function exportExcelProvinceAll() {
        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const tomatoItems = provinceData.filter((item) => groups[item.Number] === 'tomato');
        const napItems = provinceData.filter((item) => groups[item.Number] === 'nap');

        const wb = XLSX.utils.book_new();
        const tomatoRows = buildExcelRows(tomatoItems);
        const tomatoWs = XLSX.utils.aoa_to_sheet(tomatoRows);
        autoFitColumns(tomatoWs, tomatoRows);
        const napRows = buildExcelRows(napItems);
        const napWs = XLSX.utils.aoa_to_sheet(napRows);
        autoFitColumns(napWs, napRows);
        XLSX.utils.book_append_sheet(wb, tomatoWs, 'TOMATO');
        XLSX.utils.book_append_sheet(wb, napWs, 'NAP');
        XLSX.writeFile(wb, makeFileName('TOMATO_NAP'));
    }

    function exportExcelProvince(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const items = provinceData.filter((item) => groups[item.Number] === group);
        const label = GROUP_LABELS[group] || group.toUpperCase();

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(GROUP_FILE_NAMES[group] || group.toUpperCase()));
    }

    function exportExcelAllGroups() {
        const state = DeliveryReportState;
        let allData = state.allData || [];
        // For 'combo' tab in lite, exclude 0đ (matches view filter)
        if (state.activeTab === 'combo') {
            allData = allData.filter((item) => !isZeroCOD(item));
        }
        const wb = XLSX.utils.book_new();
        const groupKeys = getActiveGroups();

        groupKeys.forEach((key) => {
            const items = allData.filter((item) => getItemGroup(item) === key);
            if (items.length === 0) return;
            const rows = buildExcelRows(items);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            autoFitColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, GROUP_LABELS[key]);
        });

        const fileName =
            state.activeTab === 'combo'
                ? 'TOMATO_SHOP'
                : state.uiMode === 'lite'
                  ? 'TATCA_TOMATO_SHOP'
                  : 'TATCA';
        XLSX.writeFile(wb, makeFileName(fileName));
    }

    function exportExcelGroup(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }
        const allData = DeliveryReportState.allData || [];
        let items = allData.filter((item) => getItemGroup(item) === group);
        // When on ĐƠN 0đ tab, scope export to 0đ items only — matches user expectation
        // that toolbar group buttons follow the active tab filter.
        const isZeroTab =
            DeliveryReportState.activeTab === 'zero' && DeliveryReportState.traSoatMode;
        if (isZeroTab) {
            items = items.filter((item) => isZeroCOD(item));
        }
        const label = GROUP_LABELS[group] || group.toUpperCase();
        const fileLabel = isZeroTab
            ? `DON0D_${GROUP_FILE_NAMES[group] || group.toUpperCase()}`
            : GROUP_FILE_NAMES[group] || group.toUpperCase();

        if (isZeroTab && items.length === 0) {
            alert(`Không có đơn 0đ trong nhóm ${label} để xuất.`);
            return;
        }

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(fileLabel));
    }

    function exportExcelZeroDong() {
        const allData = (DeliveryReportState.allData || []).filter((item) => isZeroCOD(item));
        const wb = XLSX.utils.book_new();
        // Limit to groups visible in current view (lite = TOMATO+SHOP, full = all 5).
        const groupKeys = getActiveGroups();
        let hasData = false;

        groupKeys.forEach((key) => {
            const items = allData.filter((item) => getItemGroup(item) === key);
            if (items.length === 0) return;
            hasData = true;
            const rows = buildExcelRows(items);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            autoFitColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, GROUP_LABELS[key]);
        });

        if (!hasData) {
            alert('Không có đơn 0đ trong các nhóm đang hiển thị để xuất.');
            return;
        }

        const fileName = DeliveryReportState.uiMode === 'lite' ? 'DON0D_TOMATO_SHOP' : 'DON0D';
        XLSX.writeFile(wb, makeFileName(fileName));
    }

    // =====================================================
    // TRA SOÁT - Barcode Scanner Mode
    // =====================================================
    let barcodeBuffer = '';
    let barcodeTimeout = null;
    const soundError = new Audio('sound/sai.mp3');
    const soundDuplicate = new Audio('sound/trung.mp3');
    const soundTomato = new Audio('sound/TOMATO.mp3');
    const soundCity = new Audio('sound/THANHPHO.mp3');
    const soundNap = new Audio('sound/NAP.mp3');

    // Map group key → group-name audio (chỉ 3 nhóm có sound: TOMATO / THÀNH PHỐ / TỈNH NAP)
    const GROUP_SOUNDS = {
        tomato: soundTomato,
        city: soundCity,
        nap: soundNap,
    };

    function playGroupSound(group) {
        const audio = GROUP_SOUNDS[group];
        if (!audio) return;
        try {
            audio.currentTime = 0;
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {
            /* fallback: no sound */
        }
    }

    // Sound riêng cho đơn 0đ — 2 beep ngắn tần số cao
    function playZeroDongSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.15].forEach((delay) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 1200;
                gain.gain.value = 0.3;
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.1);
            });
        } catch (e) {
            /* fallback: no sound */
        }
    }

    async function traSoat() {
        if (!canTraSoat()) {
            alert('Bạn không có quyền sử dụng chức năng tra soát.');
            return;
        }
        const state = DeliveryReportState;
        state.traSoatMode = !state.traSoatMode;

        const btn = document.getElementById('drBtnTraSoat');
        const bar = document.getElementById('drTraSoatBar');

        if (state.traSoatMode) {
            // Enter scan mode — detect interface mode each entry (reflects current login)
            state.uiMode = detectInterfaceMode();
            state.liteExpanded = false;

            if (btn) {
                btn.classList.add('dr-btn-active');
                btn.innerHTML = '<i class="fas fa-times"></i> Tắt tra soát';
            }
            if (bar) bar.style.display = '';
            // Default tab: full → 'all', lite → 'combo' (TOMATO + SHOP)
            state.activeTab = state.uiMode === 'full' ? 'all' : 'combo';
            state.scanFilter = 'unscanned';
            state.currentPage = 1;

            // Load scanned numbers + province groups from DB
            await loadScannedNumbers();
            await ensureProvinceGroups();

            applyTabVisibility();
            updateTabUI();
            updateProvinceExportButtons();
            document.addEventListener('keydown', onBarcodeKeydown);
            startSyncPolling();
            renderAllGroupsView();
            renderStats();
            updateScanCount();
        } else {
            // Exit scan mode
            if (btn) {
                btn.classList.remove('dr-btn-active');
                btn.innerHTML = '<i class="fas fa-clipboard-check"></i> Tra soát';
            }
            if (bar) bar.style.display = 'none';

            // Ẩn lại nút "Gửi Kèm" cùng tab Thành phố/Tỉnh khi tắt tra soát
            // (triple-click chỉ reveal trong phiên tra soát — thoát thì ẩn về mặc định)
            const saBtn = document.getElementById('drBtnSendAlong');
            if (saBtn) saBtn.style.display = 'none';

            // Hide province/all-groups view if active
            const provinceView = document.getElementById('drProvinceView');
            if (provinceView) provinceView.style.display = 'none';
            const grid = document.getElementById('drProvinceGrid');
            if (grid) grid.classList.remove('all-groups');

            stopSyncPolling();
            state.scannedNumbers = new Set();
            state.activeTab = 'all';
            state.scanFilter = 'unscanned';
            state.currentPage = 1;
            state.liteExpanded = false;
            document.removeEventListener('keydown', onBarcodeKeydown);
            updateProvinceExportButtons();
            renderTable();
            renderStats();
            renderPagination();
            // Restore lite hide-state for table/cancel/status (or show in full mode)
            applyLiteRevealVisibility();
        }
    }

    async function setTab(tab) {
        DeliveryReportState.activeTab = tab;
        DeliveryReportState.currentPage = 1;
        DeliveryReportState._focusedGroup = null;
        updateTabUI();
        updateProvinceExportButtons();

        if (tab === 'province' && DeliveryReportState.traSoatMode) {
            await ensureProvinceGroups();
            renderProvinceView();
        } else if (
            (tab === 'all' || tab === 'zero' || tab === 'combo') &&
            DeliveryReportState.traSoatMode
        ) {
            await ensureProvinceGroups();
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        renderStats();
        updateScanCount();
    }

    function updateProvinceExportButtons() {
        const state = DeliveryReportState;
        const tomatoBtn = document.getElementById('drBtnExportTomato');
        const napBtn = document.getElementById('drBtnExportNap');
        const isProvince = state.activeTab === 'province' && state.traSoatMode;
        if (tomatoBtn) tomatoBtn.style.display = isProvince ? '' : 'none';
        if (napBtn) napBtn.style.display = isProvince ? '' : 'none';

        // Ảnh bàn giao TMT/NAP: chỉ tab Tỉnh (chế độ tra soát)
        ['drBtnCopyHandoverTomato', 'drBtnCopyHandoverNap'].forEach((id) => {
            const b = document.getElementById(id);
            if (b) b.style.display = isProvince ? '' : 'none';
        });

        // Copy ảnh bàn giao: chỉ tab Thành phố (chế độ tra soát)
        const handoverBtn = document.getElementById('drBtnCopyHandover');
        if (handoverBtn) {
            handoverBtn.style.display =
                state.activeTab === 'city' && state.traSoatMode ? '' : 'none';
        }

        // All-groups (multi-column) export buttons: visible only for the groups
        // currently rendered in the view (matches column visibility).
        const isMulti =
            state.traSoatMode &&
            (state.activeTab === 'all' ||
                state.activeTab === 'zero' ||
                state.activeTab === 'combo');
        const activeGroups = new Set(isMulti ? getActiveGroups() : []);
        const btnGroupMap = {
            drBtnExportGrpTomato: 'tomato',
            drBtnExportGrpNap: 'nap',
            drBtnExportGrpCity: 'city',
            drBtnExportGrpShop: 'shop',
            drBtnExportGrpReturn: 'return',
        };
        Object.entries(btnGroupMap).forEach(([id, group]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.style.display = activeGroups.has(group) ? '' : 'none';
        });
    }

    function setScanFilter(filter) {
        DeliveryReportState.scanFilter = filter;
        DeliveryReportState.currentPage = 1;
        DeliveryReportState._focusedGroup = null;

        // Update scan filter tab UI
        document.querySelectorAll('.dr-scan-filter-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // Show/hide "Xóa tất cả" button
        const unscanAllBtn = document.getElementById('drBtnUnscanAll');
        if (unscanAllBtn) unscanAllBtn.style.display = filter === 'scanned' ? '' : 'none';

        if (DeliveryReportState.activeTab === 'province' && DeliveryReportState.traSoatMode) {
            renderProvinceView();
        } else if (
            (DeliveryReportState.activeTab === 'all' ||
                DeliveryReportState.activeTab === 'zero' ||
                DeliveryReportState.activeTab === 'combo') &&
            DeliveryReportState.traSoatMode
        ) {
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        renderStats();
        updateScanCount();
    }

    function updateTabUI() {
        const tabs = document.querySelectorAll('.dr-trasoat-tab');
        tabs.forEach((t) => {
            t.classList.toggle('active', t.dataset.tab === DeliveryReportState.activeTab);
        });
    }

    function updateScanCount() {
        const countEl = document.getElementById('drScanCount');
        const totalEl = document.getElementById('drScanTotal');
        const amountEl = document.getElementById('drScanTotalAmount');
        if (!countEl || !totalEl) return;

        const tabData = getTabFilteredData();
        const scannedItems = tabData.filter((item) =>
            DeliveryReportState.scannedNumbers.has(item.Number)
        );
        countEl.textContent = `Đã quét: ${formatNumber(scannedItems.length)}`;
        totalEl.textContent = formatNumber(tabData.length);

        // Show total amount for current view (scanned or unscanned)
        if (amountEl) {
            const showScanned = DeliveryReportState.scanFilter === 'scanned';
            const viewItems = showScanned
                ? scannedItems
                : tabData.filter((item) => !DeliveryReportState.scannedNumbers.has(item.Number));
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
            amountEl.textContent = `CN: ${formatMoney(totalCOD)}`;
        }
    }

    function removeTones(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function isReturnItem(item) {
        return removeTones(item.DeliveryNote || '')
            .toUpperCase()
            .includes('THU VE');
    }

    function isZeroCOD(item) {
        return !item.CashOnDelivery || item.CashOnDelivery === 0;
    }

    // Determine which group an item belongs to (for "all" tab 5-column view)
    // Priority: DB assignment (locked) > provinceGroups > carrier-based detection
    function getItemGroup(item) {
        // Check DB locked assignment first (source of truth)
        const dbGroup = DeliveryReportState.dbAssignments[item.Number];
        if (dbGroup) return dbGroup;

        // Fallback to carrier-based detection
        if (isReturnItem(item)) return 'return';
        const nc = normalizeCarrier(item.CarrierName);
        if (nc === 'THÀNH PHỐ') return 'city';
        if (nc === 'BÁN HÀNG SHOP') return 'shop';
        return DeliveryReportState.provinceGroups[item.Number] || 'nap';
    }

    const GROUP_COL_MAP = {
        tomato: 'drColTomato',
        nap: 'drColNap',
        city: 'drColCity',
        shop: 'drColShop',
        return: 'drColReturn',
    };

    const GROUP_LABELS = {
        tomato: 'TOMATO',
        nap: 'TỈNH NAP',
        city: 'THÀNH PHỐ',
        shop: 'BÁN HÀNG SHOP',
        return: 'THU VỀ',
    };

    const GROUP_FILE_NAMES = {
        tomato: 'TOMATO',
        nap: 'NAP',
        city: 'THANHPHO',
        shop: 'SHOP',
        return: 'THUVE',
    };

    const GROUP_HEADER_CLASS = {
        tomato: 'dr-province-header-tomato',
        nap: 'dr-province-header-nap',
        city: 'dr-province-header-city',
        shop: 'dr-province-header-shop',
        return: 'dr-province-header-return',
    };

    function getTabFilteredData() {
        const state = DeliveryReportState;
        let data = state.allData || [];
        // Apply tab filter
        const tab = state.activeTab;
        const isLite = state.uiMode === 'lite';
        // Lite mode hides NAP/CITY/RETURN groups → restrict tab data to visible groups
        const inLiteGroups = (item) => {
            const g = getItemGroup(item);
            return g === 'tomato' || g === 'shop';
        };

        if (tab === 'city') {
            data = data.filter(
                (item) => normalizeCarrier(item.CarrierName) === 'THÀNH PHỐ' && !isReturnItem(item)
            );
        } else if (tab === 'province') {
            data = data.filter((item) => {
                const nc = normalizeCarrier(item.CarrierName);
                return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP' && !isReturnItem(item);
            });
        } else if (tab === 'shop') {
            data = data.filter(
                (item) =>
                    normalizeCarrier(item.CarrierName) === 'BÁN HÀNG SHOP' && !isReturnItem(item)
            );
        } else if (tab === 'return') {
            data = data.filter((item) => isReturnItem(item));
        } else if (tab === 'zero') {
            data = isLite
                ? data.filter((item) => isZeroCOD(item) && inLiteGroups(item))
                : data.filter((item) => isZeroCOD(item));
        } else if (tab === 'combo') {
            // Lite-only: TOMATO+SHOP groups, exclude 0đ
            data = data.filter((item) => !isZeroCOD(item) && inLiteGroups(item));
        } else if (tab === 'all' && isLite) {
            // Lite expanded: TOMATO+SHOP groups, include 0đ
            data = data.filter(inLiteGroups);
        }
        // 'all' in full mode → no extra filter
        return data;
    }

    // =====================================================
    // PROVINCE GROUPS - TOMATO/NAP Split + Firebase Persistence
    // =====================================================
    function getProvinceData() {
        const data = DeliveryReportState.allData || [];
        // Province = everything NOT city, NOT shop, NOT return
        return data.filter((item) => {
            const nc = normalizeCarrier(item.CarrierName);
            return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP' && !isReturnItem(item);
        });
    }

    // Assign TOMATO/NAP: random pick, TOMATO ~20-22% of total AmountTotal (all items)
    // ĐƠN 0đ (CashOnDelivery === 0) KHÔNG BAO GIỜ vào TOMATO → luôn vào NAP
    function assignTomatoNap(unassignedItems, groups) {
        // Separate 0đ items — always go to NAP
        const zeroItems = unassignedItems.filter((i) => isZeroCOD(i));
        const nonZeroItems = unassignedItems.filter((i) => !isZeroCOD(i));

        zeroItems.forEach((item) => {
            groups[item.Number] = 'nap';
        });

        // Calculate based on ALL province items (assigned + unassigned)
        const allProvinceData = getProvinceData();
        const grandTotal = allProvinceData.reduce((sum, i) => sum + (i.AmountTotal || 0), 0);
        const targetAmount = grandTotal * 0.21;

        // Sum of existing TOMATO assignments
        const existingTomatoSum = allProvinceData
            .filter((i) => groups[i.Number] === 'tomato')
            .reduce((sum, i) => sum + (i.AmountTotal || 0), 0);

        // Remaining budget for new TOMATO assignments
        const remainingBudget = targetAmount - existingTomatoSum;

        // Shuffle randomly (only non-zero items eligible for TOMATO)
        const shuffled = [...nonZeroItems].sort(() => Math.random() - 0.5);
        let newTomatoSum = 0;

        shuffled.forEach((item) => {
            const amt = item.AmountTotal || 0;
            if (
                remainingBudget > 0 &&
                (newTomatoSum + amt <= remainingBudget ||
                    (newTomatoSum === 0 && existingTomatoSum === 0))
            ) {
                groups[item.Number] = 'tomato';
                newTomatoSum += amt;
            } else {
                groups[item.Number] = 'nap';
            }
        });
    }

    // =====================================================
    // DB ASSIGNMENTS — PostgreSQL as Source of Truth
    // =====================================================
    // TZ-safe: extract YYYY-MM-DD prefix from TPOS DateInvoice ISO (independent of browser TZ).
    // Used to set the assignment_date metadata when inserting new rows.
    function extractTposDate(iso) {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso || ''));
        return m ? m[1] : null;
    }

    // Today's local YYYY-MM-DD — used as last-resort fallback only.
    function todayLocalStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function getCurrentOrderNumbers() {
        return (DeliveryReportState.allData || []).map((i) => i && i.Number).filter(Boolean);
    }

    // Load DB assignments via lookup-batch — keyed by order_number alone, no date dependency.
    // ⚠ Backend /lookup-batch cắt slice(0,1000). Nếu view có >1000 đơn (dải nhiều ngày) mà
    // gửi 1 lần → các đơn ngoài top-1000 KHÔNG nạp lại được "chốt" nhóm → bị coi là chưa chia
    // → assignTomatoNap bốc nhóm random lại. Vì vậy PHẢI chia lô ≤1000 rồi gộp kết quả.
    const LOOKUP_BATCH_SIZE = 1000;
    async function loadAssignmentsFromDB() {
        const orderNumbers = getCurrentOrderNumbers();
        if (orderNumbers.length === 0) {
            DeliveryReportState.dbAssignments = {};
            DeliveryReportState._dbAssignmentsLoaded = true;
            DeliveryReportState._dbLockedCount = 0;
            DeliveryReportState.scannedNumbers = new Set();
            DeliveryReportState.hiddenNumbers = new Set();
            return {};
        }
        try {
            const chunks = [];
            for (let i = 0; i < orderNumbers.length; i += LOOKUP_BATCH_SIZE) {
                chunks.push(orderNumbers.slice(i, i + LOOKUP_BATCH_SIZE));
            }
            if (chunks.length > 1) {
                console.warn(
                    `[DELIVERY-REPORT] lookup-batch: ${orderNumbers.length} đơn > ${LOOKUP_BATCH_SIZE} → chia ${chunks.length} lô (tránh mất chốt nhóm)`
                );
            }
            const parts = await Promise.all(
                chunks.map(async (chunk) => {
                    const resp = await fetch(
                        `${RENDER_URL}/api/v2/delivery-assignments/lookup-batch`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderNumbers: chunk }),
                        }
                    );
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const result = await resp.json();
                    if (!result.success || !result.data) {
                        throw new Error('lookup-batch: invalid response');
                    }
                    return result.data;
                })
            );

            const assignments = {};
            const scanned = new Set();
            const hidden = new Set();
            let totalCount = 0;
            let scannedCount = 0;
            let hiddenCount = 0;
            for (const data of parts) {
                Object.assign(assignments, data.assignments || {});
                (data.scannedNumbers || []).forEach((n) => scanned.add(n));
                (data.hiddenNumbers || []).forEach((n) => hidden.add(n));
                totalCount += data.totalCount || 0;
                scannedCount += data.scannedCount || 0;
                hiddenCount += data.hiddenCount || 0;
            }

            DeliveryReportState.dbAssignments = assignments;
            DeliveryReportState._dbAssignmentsLoaded = true;
            DeliveryReportState._dbLockedCount = totalCount;
            DeliveryReportState.scannedNumbers = scanned;
            DeliveryReportState.hiddenNumbers = hidden;
            console.log(
                `[DELIVERY-REPORT] DB: ${totalCount} assignments, ${scannedCount} scanned, ${hiddenCount} hidden for ${orderNumbers.length} orders in view (${chunks.length} lô)`
            );
            return assignments;
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to load DB assignments:', e.message);
        }
        return {};
    }

    async function saveAssignmentsToDB(items, groups) {
        const assignments = items.map((item) => ({
            // assignment_date as metadata only (no longer part of key); use TPOS DateInvoice when available.
            date: (item.DateInvoice && extractTposDate(item.DateInvoice)) || todayLocalStr(),
            orderNumber: item.Number,
            groupName: groups[item.Number] || getItemGroup(item),
            amountTotal: item.AmountTotal || 0,
            cashOnDelivery: item.CashOnDelivery || 0,
            carrierName: item.CarrierName || '',
        }));

        if (assignments.length === 0) return { inserted: 0, skipped: 0 };

        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            const resp = await fetch(`${RENDER_URL}/api/v2/delivery-assignments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-data': btoa(
                        unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                    ),
                },
                body: JSON.stringify({ assignments }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success) {
                DeliveryReportState._dbNewCount = result.data.inserted || 0;
                const { inserted = 0, updated = 0, unchanged, skipped } = result.data;
                // Updated = đơn cũ bị thay đổi (date/carrier/COD đổi trên TPOS). Tự
                // động dọn ghost khi user mở Tra Soát ngày mới.
                const unchangedCount = unchanged != null ? unchanged : skipped;
                console.log(
                    `[DELIVERY-REPORT] DB: ${inserted} inserted, ${updated} updated (re-synced), ${unchangedCount} unchanged`
                );
                if (updated > 0) {
                    console.log(
                        '[DELIVERY-REPORT] Auto-cleaned ghost: re-synced metadata for',
                        result.data.updatedOrders || []
                    );
                }
                return result.data;
            }
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to save assignments to DB:', e.message);
        }
        return { inserted: 0, skipped: 0 };
    }

    // =====================================================
    // SCANNED / HIDDEN — PostgreSQL via Render API
    // =====================================================
    async function loadScannedNumbers() {
        // Scanned numbers are loaded together with assignments in loadAssignmentsFromDB()
        // This function is kept for backward compatibility with traSoat() flow
        if (DeliveryReportState._dbAssignmentsLoaded) return;
        await loadAssignmentsFromDB();
    }

    async function loadHiddenNumbers() {
        // Hidden numbers are loaded together with assignments in loadAssignmentsFromDB()
        if (DeliveryReportState._dbAssignmentsLoaded) return;
        await loadAssignmentsFromDB();
    }

    async function hideOrder(number) {
        if (!number) return;
        DeliveryReportState.hiddenNumbers.add(number);
        DeliveryReportState.scannedNumbers.delete(number);
        DeliveryReportState.allData = (DeliveryReportState.allData || []).filter(
            (i) => i.Number !== number
        );

        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/hide/${encodeURIComponent(number)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'x-auth-data': btoa(
                            unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                        ),
                    },
                }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to hide order in DB:', e.message);
        }

        renderTable();
        renderStats();
        renderPagination();
        if (DeliveryReportState.traSoatMode) updateScanCount();
    }

    async function saveScannedNumber(orderNumber) {
        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/scan/${encodeURIComponent(orderNumber)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'x-auth-data': btoa(
                            unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                        ),
                    },
                }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to save scan to DB:', e.message);
        }
    }

    async function unscanNumberInDB(orderNumber) {
        try {
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/unscan/${encodeURIComponent(orderNumber)}`,
                { method: 'PATCH' }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to unscan in DB:', e.message);
        }
    }

    async function unscanBulkInDB(orderNumbers) {
        try {
            await fetch(`${RENDER_URL}/api/v2/delivery-assignments/unscan-bulk`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumbers }),
            });
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to bulk unscan in DB:', e.message);
        }
    }

    async function unscanItem(number) {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        if (!confirm(`Chắc chắn đơn ${number} đã được đưa vào kho xử lý?`)) return;
        DeliveryReportState.scannedNumbers.delete(number);
        await unscanNumberInDB(number);
        refreshTraSoatView();
    }

    async function unscanAllTab() {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        const tabData = getTabFilteredData();
        const scannedInTab = tabData.filter((item) =>
            DeliveryReportState.scannedNumbers.has(item.Number)
        );
        if (scannedInTab.length === 0) return;
        if (
            !confirm(
                `⚠️ Xóa tất cả ${scannedInTab.length} đơn đã quét?\n\nHành động này KHÔNG THỂ hoàn tác!`
            )
        )
            return;
        const numbers = scannedInTab.map((item) => item.Number);
        numbers.forEach((n) => DeliveryReportState.scannedNumbers.delete(n));
        await unscanBulkInDB(numbers);
        refreshTraSoatView();
    }

    function unscanGroup(groupKey) {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        const allData = DeliveryReportState.allData || [];
        const scanned = DeliveryReportState.scannedNumbers;
        const items = allData.filter(
            (item) => getItemGroup(item) === groupKey && scanned.has(item.Number)
        );
        if (items.length === 0) return;
        if (
            !confirm(
                `Xóa tất cả ${items.length} đơn đã quét trong nhóm ${GROUP_LABELS[groupKey] || groupKey}?`
            )
        )
            return;
        const numbers = items.map((item) => item.Number);
        numbers.forEach((n) => scanned.delete(n));
        unscanBulkInDB(numbers);
        refreshTraSoatView();
    }

    // =====================================================
    // CROSS-MACHINE SYNC — Polling from PostgreSQL
    // =====================================================
    let _syncInterval = null;

    function startSyncPolling() {
        stopSyncPolling();
        // Poll every 5 seconds for changes from other machines
        _syncInterval = setInterval(async () => {
            if (!DeliveryReportState.traSoatMode) return;
            try {
                const orderNumbers = getCurrentOrderNumbers();
                if (orderNumbers.length === 0) return;
                const resp = await fetch(`${RENDER_URL}/api/v2/delivery-assignments/lookup-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderNumbers }),
                });
                if (!resp.ok) return;
                const result = await resp.json();
                if (!result.success) return;

                const newScanned = new Set(result.data.scannedNumbers || []);
                const oldScanned = DeliveryReportState.scannedNumbers;

                // Only refresh if scanned set changed
                if (
                    newScanned.size !== oldScanned.size ||
                    [...newScanned].some((n) => !oldScanned.has(n))
                ) {
                    DeliveryReportState.scannedNumbers = newScanned;
                    DeliveryReportState.hiddenNumbers = new Set(result.data.hiddenNumbers || []);
                    refreshTraSoatView();
                    console.log('[DELIVERY-REPORT] Sync: updated from DB');
                }
            } catch (_) {
                /* silent fail for polling */
            }
        }, 5000);
    }

    function stopSyncPolling() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    function refreshTraSoatView() {
        if (!DeliveryReportState.traSoatMode) return;
        if (DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
        } else if (
            DeliveryReportState.activeTab === 'all' ||
            DeliveryReportState.activeTab === 'zero'
        ) {
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
    }

    async function ensureProvinceGroups() {
        const state = DeliveryReportState;
        const allData = state.allData || [];
        const provinceData = getProvinceData();

        // Step 1: Load locked assignments from DB (source of truth)
        if (!state._dbAssignmentsLoaded) {
            const dbAssignments = await loadAssignmentsFromDB();
            for (const [orderNumber, groupName] of Object.entries(dbAssignments)) {
                if (groupName === 'tomato' || groupName === 'nap') {
                    state.provinceGroups[orderNumber] = groupName;
                }
            }
            state.dbAssignments = dbAssignments;
            state._dbAssignmentsLoaded = true;
            state._provinceGroupsLoaded = true;
        }

        // Step 2: Assign TOMATO/NAP for new province items not in DB
        const unassigned = provinceData.filter((item) => !state.provinceGroups[item.Number]);
        if (unassigned.length > 0) {
            assignTomatoNap(unassigned, state.provinceGroups);
        }

        // Step 3: Build full assignment list — gửi TẤT CẢ items (không filter
        // chỉ-new) để backend smart-upsert tự detect ghost: nếu Number đã có
        // nhưng date/group/carrier/COD đã đổi → UPDATE; nếu giống hệt → no-op.
        const itemsToSave = [];
        const allGroups = {};
        for (const item of allData) {
            const group = getItemGroup(item);
            allGroups[item.Number] = group;
            itemsToSave.push(item);
        }

        // Step 4: Smart upsert (ON CONFLICT DO UPDATE WHERE metadata changed)
        if (itemsToSave.length > 0) {
            const result = await saveAssignmentsToDB(itemsToSave, allGroups);
            for (const item of itemsToSave) {
                state.dbAssignments[item.Number] = allGroups[item.Number];
            }
            // Stats: inserted = new đơn lần đầu vào DB; updated = ghost cleanup
            // (đơn cũ bị đổi date/carrier trên TPOS, giờ re-sync)
            updateAssignmentStatus(
                Object.keys(state.dbAssignments).length,
                (result.inserted || 0) + (result.updated || 0)
            );
        } else {
            updateAssignmentStatus(Object.keys(state.dbAssignments).length, 0);
        }

        // Step 5: Auto-cleanup ghost — đơn trong DB cùng ngày nhưng KHÔNG còn
        // trong TPOS live → mark is_hidden=TRUE. Safeguards: chỉ chạy khi
        // filter là full-day (T00:00 → T23:59) VÀ không có keyword (Q),
        // để allData đảm bảo là full snapshot ngày đó trên TPOS.
        await autoCleanupGhosts(allData);
    }

    // Xác nhận candidate đơn nào THỰC SỰ chết trên TPOS (State='cancel' hoặc không tồn tại).
    // Trả Set mã chết. Đơn còn open/paid → KHÔNG vào set. Lỗi/không chắc → coi như còn sống
    // (KHÔNG ẩn) để KHÔNG BAO GIỜ ẩn nhầm đơn hợp lệ. Tái dùng pattern checkCrossCheckStatus.
    async function findDeadOnTpos(candidates, token) {
        const dead = new Set();
        if (!candidates || candidates.length === 0 || !token) return dead;
        const CONC = 10; // bound tải TPOS
        for (let i = 0; i < candidates.length; i += CONC) {
            const chunk = candidates.slice(i, i + CONC);
            await Promise.all(
                chunk.map(async (code) => {
                    try {
                        const url = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView?$top=5&$filter=${encodeURIComponent("contains(Number,'" + code + "')")}&$select=Number,State`;
                        const r = await fetch(url, {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json',
                                tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                            },
                        });
                        if (!r.ok) return; // không chắc → coi còn sống
                        const j = await r.json();
                        const row = (j.value || []).find((x) => x.Number === code);
                        if (!row)
                            dead.add(code); // không còn trên TPOS → chết
                        else if (row.State === 'cancel') dead.add(code); // đã huỷ → chết
                        // còn lại (open/paid/draft...) → còn sống, KHÔNG ẩn
                    } catch (e) {
                        /* lỗi → coi còn sống, không ẩn */
                    }
                })
            );
        }
        return dead;
    }

    async function autoCleanupGhosts(items) {
        const f = DeliveryReportState.filters;
        // Skip nếu có keyword filter → TPOS query đã bị thu hẹp, allData không phải full snapshot
        if (f.keyword && String(f.keyword).trim()) {
            console.log('[DELIVERY-REPORT] Skip ghost cleanup: keyword filter active');
            return;
        }
        // Skip nếu filter ngày không phải boundary chuẩn (T00:00 → T23:59) — tránh
        // partial-hour fetch xóa nhầm đơn không nằm trong slice.
        if (!/T00:00$/.test(String(f.fromDate || '')) || !/T23:59$/.test(String(f.toDate || ''))) {
            console.log('[DELIVERY-REPORT] Skip ghost cleanup: non-boundary date filter');
            return;
        }

        // Group items by extracted date (TPOS DateInvoice)
        const byDate = {};
        for (const item of items) {
            const date = (item.DateInvoice && extractTposDate(item.DateInvoice)) || todayLocalStr();
            (byDate[date] = byDate[date] || []).push(item.Number);
        }
        if (Object.keys(byDate).length === 0) {
            console.log('[DELIVERY-REPORT] Skip ghost cleanup: no items');
            return;
        }

        for (const date in byDate) {
            const validNumbers = byDate[date];
            // Extra safety: nếu chưa có đơn nào cho ngày này → skip (TPOS có thể trả empty bất thường)
            if (validNumbers.length === 0) continue;
            try {
                // 1. Lấy đơn DB (đang hiện, chưa ẩn) của ngày này
                const dbResp = await fetch(
                    `${RENDER_URL}/api/v2/delivery-assignments/?date=${encodeURIComponent(date)}`
                );
                if (!dbResp.ok) {
                    console.warn(
                        `[DELIVERY-REPORT] cleanup ${date}: load DB failed HTTP ${dbResp.status} → skip`
                    );
                    continue;
                }
                const dbJson = await dbResp.json();
                const dbCodes = Object.keys(dbJson.data?.assignments || {});
                if (dbCodes.length === 0) continue;

                // 2. Candidate = có trong DB nhưng VẮNG trong fetch TPOS live lần này
                const liveSet = new Set(validNumbers);
                const candidates = dbCodes.filter((c) => !liveSet.has(c));
                if (candidates.length === 0) continue;

                // 3. XÁC NHẬN trên TPOS — chỉ ẩn đơn THỰC SỰ huỷ/không tồn tại.
                //    Đơn còn open/paid (chỉ vắng trong fetch này) → GIỮ, KHÔNG ẩn.
                const token = await getToken();
                if (!token) {
                    console.warn(
                        `[DELIVERY-REPORT] cleanup ${date}: không có token để xác nhận TPOS → KHÔNG ẩn`
                    );
                    continue;
                }
                const dead = await findDeadOnTpos(candidates, token);
                if (dead.size === 0) {
                    console.log(
                        `[DELIVERY-REPORT] cleanup ${date}: ${candidates.length} đơn vắng nhưng đều CÒN SỐNG trên TPOS → KHÔNG ẩn`
                    );
                    continue;
                }

                // 4. Chỉ ẩn các đơn đã xác nhận chết: keep-set = dbCodes trừ dead
                const keepSet = dbCodes.filter((c) => !dead.has(c));
                const resp = await fetch(
                    `${RENDER_URL}/api/v2/delivery-assignments/cleanup-ghosts`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, validNumbers: keepSet, mode: 'hide' }),
                    }
                );
                if (!resp.ok) {
                    console.warn(
                        `[DELIVERY-REPORT] cleanup-ghosts ${date} failed: HTTP ${resp.status}`
                    );
                    continue;
                }
                const j = await resp.json();
                const hidden = j.data?.hiddenCount || 0;
                if (hidden > 0) {
                    console.log(
                        `[DELIVERY-REPORT] Auto-hide ${hidden} đơn đã xác nhận huỷ/mất cho ${date}:`,
                        j.data.hiddenOrders
                    );
                    // Cập nhật state để UI không hiển thị các Number vừa hide
                    if (Array.isArray(j.data.hiddenOrders)) {
                        for (const n of j.data.hiddenOrders) {
                            DeliveryReportState.hiddenNumbers.add(n);
                            delete DeliveryReportState.dbAssignments[n];
                        }
                    }
                }
            } catch (e) {
                console.warn(`[DELIVERY-REPORT] cleanup-ghosts ${date} error:`, e.message);
            }
        }
    }

    function updateAssignmentStatus(lockedCount, newCount) {
        const el = document.getElementById('drAssignmentStatus');
        if (!el) return;
        if (lockedCount > 0 || newCount > 0) {
            const parts = [];
            if (lockedCount > 0) parts.push(`<i class="fas fa-lock"></i> ${lockedCount} đã khóa`);
            if (newCount > 0) parts.push(`<i class="fas fa-plus-circle"></i> ${newCount} mới`);
            el.innerHTML = parts.join(' &middot; ');
            const s = DeliveryReportState;
            const liteHide = s.uiMode === 'lite' && !s.liteRevealed && !s.traSoatMode;
            el.style.display = liteHide ? 'none' : '';
            if (liteHide) el.dataset.liteHidden = '1';
        } else {
            el.style.display = 'none';
        }
    }

    // =====================================================
    // PROVINCE VIEW - 2-Column Layout (TOMATO / NAP)
    // =====================================================
    function renderProvinceView() {
        const view = document.getElementById('drProvinceView');
        const grid = document.getElementById('drProvinceGrid');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (!view) return;

        // Show province view (2-column), hide table + extra columns
        view.style.display = '';
        if (grid) grid.classList.remove('all-groups');
        if (tableWrapper) tableWrapper.style.display = 'none';
        // Ensure TOMATO + NAP columns are visible; hide others (only used in "all" tab)
        ['drColTomato', 'drColNap'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        ['drColCity', 'drColShop', 'drColReturn'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;

        // Auto-assign items without group (fallback if ensureProvinceGroups didn't run)
        const unassigned = provinceData.filter((item) => !groups[item.Number]);
        if (unassigned.length > 0) {
            assignTomatoNap(unassigned, groups);
            // Save to DB in background
            const allGroups = {};
            unassigned.forEach((item) => {
                allGroups[item.Number] = groups[item.Number];
            });
            saveAssignmentsToDB(unassigned, allGroups);
        }

        const allTomato = provinceData.filter((item) => groups[item.Number] === 'tomato');
        const allNap = provinceData.filter((item) => groups[item.Number] === 'nap');

        // Count scanned for display
        const tomatoScannedCount = allTomato.filter((i) => scanned.has(i.Number)).length;
        const napScannedCount = allNap.filter((i) => scanned.has(i.Number)).length;

        // Apply scan filter
        const showScanned = DeliveryReportState.scanFilter === 'scanned';
        const tomatoItems = allTomato.filter((item) =>
            showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
        );
        const napItems = allNap.filter((item) =>
            showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
        );

        // Calculate COD totals for current view (filtered by scan status)
        const tomatoCOD = tomatoItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        const napCOD = napItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

        // Render TOMATO column
        let tomatoHtml = `<div class="dr-province-header dr-province-header-tomato">
            <div>TOMATO <span class="dr-province-count">${tomatoScannedCount}/${allTomato.length}</span></div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="dr-province-total" style="margin:0;">${formatMoney(tomatoCOD)}</span>
                ${showScanned && tomatoItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('tomato')" title="Xóa tất cả TOMATO"><i class="fas fa-trash"></i> Xóa</button>` : ''}
            </div>
        </div>`;
        tomatoItems.forEach((item) => {
            const isScanned = scanned.has(item.Number);
            const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
            tomatoHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}${zeroClass}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
                    ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        });
        if (tomatoItems.length === 0) {
            tomatoHtml += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
        }

        // Render NAP column
        let napHtml = `<div class="dr-province-header dr-province-header-nap">
            <div>TỈNH NAP <span class="dr-province-count">${napScannedCount}/${allNap.length}</span></div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="dr-province-total" style="margin:0;">${formatMoney(napCOD)}</span>
                ${showScanned && napItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('nap')" title="Xóa tất cả TỈNH NAP"><i class="fas fa-trash"></i> Xóa</button>` : ''}
            </div>
        </div>`;
        napItems.forEach((item) => {
            const isScanned = scanned.has(item.Number);
            const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
            napHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}${zeroClass}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
                    ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        });
        if (napItems.length === 0) {
            napHtml += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
        }

        document.getElementById('drColTomato').innerHTML = tomatoHtml;
        document.getElementById('drColNap').innerHTML = napHtml;
    }

    // =====================================================
    // ALL GROUPS VIEW - 5-Column Layout (TOMATO/NAP/CITY/SHOP/RETURN)
    // =====================================================
    function renderAllGroupsView() {
        const state = DeliveryReportState;
        const view = document.getElementById('drProvinceView');
        const grid = document.getElementById('drProvinceGrid');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (!view) return;

        view.style.display = '';
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (grid) grid.classList.add('all-groups');

        // Mode + tab determine which groups to show and how to pre-filter items.
        // - full: 5 cols (TOMATO/NAP/CITY/SHOP/RETURN); 'zero' tab pre-filters to 0đ
        // - lite: 2 cols (TOMATO/SHOP); 'combo' excludes 0đ, 'zero' only 0đ, 'all' includes all
        const isLite = state.uiMode === 'lite';
        const groupKeys = isLite ? ['tomato', 'shop'] : ['tomato', 'nap', 'city', 'shop', 'return'];

        const liteItemFilter = (() => {
            if (!isLite) return null;
            if (state.activeTab === 'combo') return (item) => !isZeroCOD(item);
            if (state.activeTab === 'zero') return (item) => isZeroCOD(item);
            return null; // 'all'
        })();

        const isZeroTabFull = !isLite && state.activeTab === 'zero';
        let allData = state.allData || [];
        if (isZeroTabFull) {
            allData = allData.filter((item) => isZeroCOD(item));
        } else if (liteItemFilter) {
            allData = allData.filter(liteItemFilter);
        }

        const scanned = state.scannedNumbers;
        const showScanned = state.scanFilter === 'scanned';

        // Hide all province columns first; only the active groupKeys re-show below.
        Object.values(GROUP_COL_MAP).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Classify items into the active groups only
        const grouped = {};
        groupKeys.forEach((k) => {
            grouped[k] = [];
        });
        allData.forEach((item) => {
            const g = getItemGroup(item);
            if (grouped[g]) grouped[g].push(item);
        });

        // Render each column
        groupKeys.forEach((key) => {
            const colEl = document.getElementById(GROUP_COL_MAP[key]);
            if (!colEl) return;
            colEl.style.display = '';

            const allItems = grouped[key];
            const scannedItems = allItems.filter((i) => scanned.has(i.Number));
            const viewItems = allItems.filter((item) =>
                showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
            );
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

            let html = `<div class="dr-province-header ${GROUP_HEADER_CLASS[key]}">
                <div>${GROUP_LABELS[key]} <span class="dr-province-count">${scannedItems.length}/${allItems.length}</span></div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="dr-province-total" style="margin:0;">${formatMoney(totalCOD)}</span>
                    ${showScanned && viewItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('${key}')" title="Xóa tất cả nhóm ${GROUP_LABELS[key]}"><i class="fas fa-trash"></i> Xóa</button>` : ''}
                </div>
            </div>`;

            viewItems.forEach((item) => {
                const isItemScanned = scanned.has(item.Number);
                const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
                html += `<div class="dr-province-item ${isItemScanned ? 'scanned' : ''}${zeroClass}">
                    <div class="dr-province-left">
                        <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                        <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                        ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                    </div>
                    <div class="dr-province-right">
                        <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                        <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
                        ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                    </div>
                </div>`;
            });

            if (viewItems.length === 0) {
                html += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
            }

            colEl.innerHTML = html;
        });

        // Re-apply focused group (hide others) after re-render
        const focused = DeliveryReportState._focusedGroup;
        if (focused) {
            Object.entries(GROUP_COL_MAP).forEach(([g, id]) => {
                const el = document.getElementById(id);
                if (el) el.style.display = g === focused ? '' : 'none';
            });
            highlightProvinceColumn(focused);
        }
    }

    function showGroupColumn(group) {
        DeliveryReportState._focusedGroup = group;
        Object.entries(GROUP_COL_MAP).forEach(([g, id]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = g === group ? '' : 'none';
        });
        highlightProvinceColumn(group);
        // Scroll matched group to top
        const colEl = document.getElementById(GROUP_COL_MAP[group]);
        if (colEl) colEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showAllGroupColumns() {
        DeliveryReportState._focusedGroup = null;
        Object.values(GROUP_COL_MAP).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        document
            .querySelectorAll('.dr-province-col')
            .forEach((el) => el.classList.remove('active-scan'));
    }

    function hideAllGroupColumns() {
        Object.values(GROUP_COL_MAP).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function highlightProvinceColumn(column) {
        // Remove from all columns
        document
            .querySelectorAll('.dr-province-col')
            .forEach((el) => el.classList.remove('active-scan'));

        // Add persistent highlight to the scanned column
        const colId = GROUP_COL_MAP[column] || (column === 'tomato' ? 'drColTomato' : 'drColNap');
        const colEl = document.getElementById(colId);
        if (colEl) colEl.classList.add('active-scan');
    }

    function onBarcodeKeydown(e) {
        // Ignore if focus is on an input/select
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (barcodeBuffer.length > 0) {
                const scanned = barcodeBuffer.trim().toUpperCase();
                const kwInput = document.getElementById('drFilterKeyword');
                if (kwInput) kwInput.value = scanned;
                processScan(scanned);
                barcodeBuffer = '';
            }
            return;
        }

        // Only accept printable characters
        if (e.key.length === 1) {
            barcodeBuffer += e.key;
            clearTimeout(barcodeTimeout);
            barcodeTimeout = setTimeout(() => {
                barcodeBuffer = '';
            }, 500);
        }
    }

    async function checkCrossCheckStatus(orderNumber) {
        try {
            const token = await getToken();
            if (!token) return null;
            const url = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView?&$top=1&$filter=(Type+eq+'invoice'+and+contains(Number,'${orderNumber}'))&$select=Number,StateCode`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                },
            });
            if (!res.ok) return null;
            const data = await res.json();
            const item = (data.value || [])[0];
            return item?.StateCode || null;
        } catch (e) {
            console.warn('[DELIVERY-REPORT] checkCrossCheckStatus error:', e);
            return null;
        }
    }

    async function processScan(value) {
        console.log('[DELIVERY-REPORT] Scanned:', value);
        const state = DeliveryReportState;

        // Chỉ cho quét ở tab "Tất cả" hoặc "ĐƠN 0đ"
        if (state.activeTab !== 'all' && state.activeTab !== 'zero') {
            showScanFeedback(false, `Chuyển sang tab "Tất cả" hoặc "ĐƠN 0đ" để quét`, true);
            return;
        }

        const isProvinceTab = state.activeTab === 'province' && state.traSoatMode;
        const isAllTab =
            (state.activeTab === 'all' || state.activeTab === 'zero') && state.traSoatMode;
        const isMultiColView = isProvinceTab || isAllTab;

        // Find matching item by Number (case-insensitive)
        const upperValue = value.toUpperCase();
        const match = (state.allData || []).find(
            (item) => (item.Number || '').toUpperCase() === upperValue
        );
        if (!match) {
            if (isMultiColView) isAllTab ? hideAllGroupColumns() : hideProvinceColumns();
            soundError.currentTime = 0;
            soundError.play();
            showScanFeedback(false, `Không tìm thấy: ${value}`, true);
            return;
        }

        // Check if already scanned
        if (state.scannedNumbers.has(match.Number)) {
            if (isAllTab) {
                const group = getItemGroup(match);
                renderAllGroupsView();
                showGroupColumn(group);
            } else if (isProvinceTab) {
                const group = state.provinceGroups[match.Number];
                if (group) {
                    renderProvinceView();
                    showProvinceColumn(group);
                }
            }
            soundDuplicate.currentTime = 0;
            soundDuplicate.play();
            showScanFeedback(
                'warning',
                `Đã quét rồi: ${match.Number} - ${match.PartnerDisplayName || ''}`,
                true
            );
            return;
        }

        // Tab-aware scanning (skip tab check for "all" tab)
        if (!isAllTab) {
            const normalizedCarrier = normalizeCarrier(match.CarrierName);
            const matchIsReturn = isReturnItem(match);
            let belongsToTab = false;

            const isCity = normalizedCarrier === 'THÀNH PHỐ';
            const isShop = normalizedCarrier === 'BÁN HÀNG SHOP';
            const isProvince = normalizedCarrier && !isCity && !isShop;

            if (state.activeTab === 'return' && matchIsReturn) belongsToTab = true;
            else if (state.activeTab === 'city' && isCity && !matchIsReturn) belongsToTab = true;
            else if (state.activeTab === 'province' && isProvince && !matchIsReturn)
                belongsToTab = true;
            else if (state.activeTab === 'shop' && isShop && !matchIsReturn) belongsToTab = true;

            if (!belongsToTab) {
                let correctTab = 'khác';
                if (matchIsReturn) correctTab = 'Thu về';
                else if (isCity) correctTab = 'Thành phố';
                else if (isProvince) correctTab = 'Tỉnh';
                else if (isShop) correctTab = 'Bán hàng shop';

                if (isProvinceTab) hideProvinceColumns();
                soundError.currentTime = 0;
                soundError.play();
                showScanFeedback(
                    'wrong-tab',
                    `${match.Number} - ${match.PartnerDisplayName || ''} thuộc tab "${correctTab}"!`,
                    true
                );
                return;
            }
        }

        // Check CrossCheckComplete status from TPOS
        showScanFeedback('warning', `Đang kiểm tra đối soát: ${match.Number}...`, false);
        const stateCode = await checkCrossCheckStatus(match.Number);
        if (stateCode !== 'CrossCheckComplete') {
            if (isMultiColView) isAllTab ? hideAllGroupColumns() : hideProvinceColumns();
            soundError.currentTime = 0;
            soundError.play();
            showScanFeedback(
                false,
                `${match.Number} - ${match.PartnerDisplayName || ''} chưa đối soát (${stateCode || 'không rõ'})`,
                true
            );
            return;
        }

        // Mark as scanned
        state.scannedNumbers.add(match.Number);

        // Save to DB
        saveScannedNumber(match.Number);

        // Phát sound nhóm chính xác (TOMATO / THÀNH PHỐ / NAP) ngay khi quét thành công
        playGroupSound(getItemGroup(match));

        // Detect 0đ order → play distinct sound
        const isZero = isZeroCOD(match);
        if (isZero) {
            playZeroDongSound();
        }

        // Update view based on active tab
        const customerName = match.PartnerDisplayName || '';
        const zeroBadge = isZero ? ' [0đ]' : '';
        const feedbackType = isZero ? 'zero-dong' : true;

        if (isAllTab) {
            const group = getItemGroup(match);
            renderAllGroupsView();
            showGroupColumn(group);
            updateScanCount();
            showScanFeedback(
                feedbackType,
                `${match.Number} - ${customerName}${zeroBadge} → ${GROUP_LABELS[group]}`,
                false
            );
        } else if (isProvinceTab) {
            renderProvinceView();
            const group = state.provinceGroups[match.Number];
            if (group) {
                showProvinceColumn(group);
            }
            updateScanCount();
            showScanFeedback(
                feedbackType,
                `${match.Number} - ${customerName}${zeroBadge} → ${GROUP_LABELS[group] || (group || '').toUpperCase()}`,
                false
            );
        } else {
            renderTable();
            renderPagination();
            updateScanCount();
            showScanFeedback(feedbackType, `${match.Number} - ${customerName}${zeroBadge}`, false);
        }
    }

    function hideProvinceColumns() {
        const tomato = document.getElementById('drColTomato');
        const nap = document.getElementById('drColNap');
        if (tomato) tomato.style.display = 'none';
        if (nap) nap.style.display = 'none';
    }

    function showProvinceColumn(group) {
        const tomato = document.getElementById('drColTomato');
        const nap = document.getElementById('drColNap');
        if (group === 'tomato') {
            if (tomato) tomato.style.display = '';
            if (nap) nap.style.display = 'none';
        } else {
            if (tomato) tomato.style.display = 'none';
            if (nap) nap.style.display = '';
        }
        highlightProvinceColumn(group);
    }

    function showScanFeedback(type, value, persistent) {
        // type: true/'success' | false/'error' | 'warning' | 'wrong-tab'
        // persistent: if true, feedback stays until next successful scan
        const existing = document.getElementById('drScanFeedback');
        if (existing) existing.remove();

        let className = 'dr-scan-feedback ';
        if (type === true || type === 'success') className += 'success';
        else if (type === 'zero-dong') className += 'zero-dong';
        else if (type === 'warning') className += 'warning';
        else if (type === 'wrong-tab') className += 'wrong-tab';
        else className += 'error';

        const div = document.createElement('div');
        div.id = 'drScanFeedback';
        div.className = className;

        const textSpan = document.createElement('span');
        textSpan.textContent = value;
        div.appendChild(textSpan);

        const closeBtn = document.createElement('span');
        closeBtn.className = 'dr-scan-feedback-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => div.remove();
        div.appendChild(closeBtn);

        document.body.appendChild(div);

        if (!persistent) {
            setTimeout(() => div.remove(), 2000);
        }
    }

    // =====================================================
    // PRINT PREVIEW
    // =====================================================
    function buildPrintTitle() {
        const state = DeliveryReportState;
        let title = 'Thống Kê Giao Hàng';
        if (state.traSoatMode) {
            const tab = state.activeTab;
            const tabName = TAB_LABELS[tab]?.sheet || GROUP_LABELS[tab] || 'Tất cả';
            const scanLabel = state.scanFilter === 'scanned' ? 'Đã quét' : 'Chưa quét';
            title = `Tra Soát — ${tabName} (${scanLabel})`;
        }
        return title;
    }

    function buildPrintDate() {
        const from = document.getElementById('drFilterFromDate')?.value || '';
        const to = document.getElementById('drFilterToDate')?.value || '';
        return from && to ? `${from} → ${to}` : new Date().toLocaleDateString('vi-VN');
    }

    function buildPrintContent() {
        const state = DeliveryReportState;

        // Tra soát mode: multi-column groups
        if (
            state.traSoatMode &&
            (state.activeTab === 'all' ||
                state.activeTab === 'zero' ||
                state.activeTab === 'province' ||
                state.activeTab === 'combo')
        ) {
            return buildPrintGroups();
        }

        // Tra soát mode: single tab (city/shop/return)
        if (state.traSoatMode) {
            return buildPrintList(getFilteredData());
        }

        // Normal mode: table
        return buildPrintTable();
    }

    function buildPrintGroups() {
        const state = DeliveryReportState;
        const isLite = state.uiMode === 'lite';
        const isZeroTab = state.activeTab === 'zero';
        const isProvinceTab = state.activeTab === 'province';
        const isComboTab = state.activeTab === 'combo';
        let allData = state.allData || [];
        if (!isLite && isZeroTab) {
            allData = allData.filter((item) => isZeroCOD(item));
        } else if (isLite) {
            if (isComboTab) allData = allData.filter((item) => !isZeroCOD(item));
            else if (isZeroTab) allData = allData.filter((item) => isZeroCOD(item));
        }
        const showScanned = state.scanFilter === 'scanned';

        // Classify
        const grouped = { tomato: [], nap: [], city: [], shop: [], return: [] };
        allData.forEach((item) => {
            const g = getItemGroup(item);
            if (grouped[g]) grouped[g].push(item);
        });

        let groupKeys;
        if (isProvinceTab) groupKeys = ['tomato', 'nap'];
        else if (isLite) groupKeys = ['tomato', 'shop'];
        else groupKeys = ['tomato', 'nap', 'city', 'shop', 'return'];
        let html = '<div class="drp-grid">';

        groupKeys.forEach((key) => {
            const allItems = grouped[key];
            if (!allItems || allItems.length === 0) return;
            const scannedItems = allItems.filter((i) => state.scannedNumbers.has(i.Number));
            const viewItems = allItems.filter((item) =>
                showScanned
                    ? state.scannedNumbers.has(item.Number)
                    : !state.scannedNumbers.has(item.Number)
            );
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

            html += `<div class="drp-col">
                <div class="drp-col-header ${GROUP_HEADER_CLASS[key]}">
                    <span>${GROUP_LABELS[key]} <b>${scannedItems.length}/${allItems.length}</b></span>
                    <span>${formatMoney(totalCOD)}</span>
                </div>`;

            viewItems.forEach((item, i) => {
                const zeroClass = isZeroCOD(item) ? ' drp-zero' : '';
                html += `<div class="drp-row${zeroClass}">
                    <span class="drp-idx">${i + 1}</span>
                    <span class="drp-num">${escapeHtml(item.Number)}</span>
                    <span class="drp-name">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    <span class="drp-phone">${escapeHtml(item.Phone || '')}</span>
                    <span class="drp-addr">${escapeHtml(item.Address || '')}</span>
                    <span class="drp-amt">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="drp-zero-badge">0đ</span>' : ''}</span>
                </div>`;
            });

            if (viewItems.length === 0) {
                html +=
                    '<div class="drp-row" style="color:#999;text-align:center;">Không có dữ liệu</div>';
            }
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    function buildPrintList(items) {
        let html =
            '<table class="drp-table"><thead><tr><th>#</th><th>Số</th><th>Khách hàng</th><th>ĐT</th><th>Địa chỉ</th><th>Công nợ</th></tr></thead><tbody>';
        items.forEach((item, i) => {
            const zeroClass = isZeroCOD(item) ? ' class="drp-zero"' : '';
            html += `<tr${zeroClass}>
                <td>${i + 1}</td>
                <td>${escapeHtml(item.Number)}</td>
                <td>${escapeHtml(item.PartnerDisplayName || '')}</td>
                <td>${escapeHtml(item.Phone || '')}</td>
                <td>${escapeHtml(item.Address || '')}</td>
                <td style="text-align:right;">${formatMoney(item.CashOnDelivery || 0)}</td>
            </tr>`;
        });
        const total = items.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        html += `<tr style="font-weight:700;border-top:2px solid #333;"><td colspan="5" style="text-align:right;">Tổng:</td><td style="text-align:right;">${formatMoney(total)}</td></tr>`;
        html += '</tbody></table>';
        return html;
    }

    function buildPrintTable() {
        const items = DeliveryReportState.allData || [];
        return buildPrintList(items);
    }

    function printView() {
        // Build preview modal
        const existing = document.getElementById('drPrintPreviewModal');
        if (existing) existing.remove();

        const title = buildPrintTitle();
        const dateStr = buildPrintDate();
        const content = buildPrintContent();

        const modal = document.createElement('div');
        modal.id = 'drPrintPreviewModal';
        modal.className = 'drp-modal-overlay';
        modal.innerHTML = `
            <div class="drp-modal">
                <div class="drp-modal-toolbar">
                    <span style="font-weight:600;font-size:15px;">Xem trước khi in</span>
                    <div style="display:flex;gap:8px;">
                        <button class="drp-btn drp-btn-print" onclick="DeliveryReport.confirmPrint()"><i class="fas fa-print"></i> In</button>
                        <button class="drp-btn drp-btn-close" onclick="document.getElementById('drPrintPreviewModal').remove()"><i class="fas fa-times"></i> Đóng</button>
                    </div>
                </div>
                <div class="drp-paper" id="drPrintPaper">
                    <div class="drp-header">
                        <h2>${escapeHtml(title)}</h2>
                        <div class="drp-date">${escapeHtml(dateStr)}</div>
                    </div>
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    function confirmPrint() {
        const paper = document.getElementById('drPrintPaper');
        if (!paper) return;

        const printWin = window.open('', '_blank', 'width=900,height=700');
        printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>In</title>
        <style>${getPrintCSS()}</style>
        </head><body>${paper.innerHTML}</body></html>`);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
            printWin.print();
        }, 300);
    }

    function getPrintCSS() {
        return `
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:11px; color:#111; padding:16px; }
            .drp-header { text-align:center; margin-bottom:14px; padding-bottom:10px; border-bottom:2px solid #333; }
            .drp-header h2 { font-size:16px; margin-bottom:4px; }
            .drp-date { font-size:12px; color:#666; }
            .drp-grid { display:flex; gap:6px; }
            .drp-col { flex:1; border:1px solid #ccc; border-radius:4px; min-width:0; }
            .drp-col-header { display:flex; justify-content:space-between; padding:6px 8px; font-size:11px; font-weight:700; color:white; }
            .dr-province-header-tomato { background:#dc2626; }
            .dr-province-header-nap { background:#2563eb; }
            .dr-province-header-city { background:#d97706; }
            .dr-province-header-shop { background:#059669; }
            .dr-province-header-return { background:#7c3aed; }
            .drp-row { display:flex; align-items:center; gap:4px; padding:3px 6px; border-bottom:1px solid #f0f0f0; font-size:9px; }
            .drp-row.drp-zero { background:#fef9c3; border-left:2px solid #f59e0b; }
            .drp-idx { color:#999; min-width:16px; }
            .drp-num { font-weight:600; min-width:90px; }
            .drp-name { min-width:0; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .drp-phone { color:#666; min-width:75px; white-space:nowrap; }
            .drp-addr { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#555; }
            .drp-amt { text-align:right; white-space:nowrap; min-width:55px; font-weight:500; }
            .drp-zero-badge { background:#f59e0b; color:white; font-size:8px; font-weight:700; padding:1px 4px; border-radius:3px; }
            .drp-table { width:100%; border-collapse:collapse; }
            .drp-table th, .drp-table td { padding:4px 8px; border:1px solid #ddd; font-size:11px; }
            .drp-table th { background:#f3f4f6; font-weight:600; text-align:left; }
            .drp-table tr.drp-zero { background:#fef9c3; }
            @page { size:landscape; margin:10mm; }
        `;
    }

    // =====================================================
    // HOVER PREVIEW — Bill (TPOS) + Customer Wallet
    // =====================================================
    const HoverPreview = (() => {
        const HOVER_DELAY_MS = 350;
        const HIDE_DELAY_MS = 180;
        const billCache = new Map(); // id → html
        const customerCache = new Map(); // phone → data
        let popoverEl = null;
        let showTimer = null;
        let hideTimer = null;
        let activeKey = null;

        function ensurePopover() {
            if (popoverEl) return popoverEl;
            popoverEl = document.createElement('div');
            popoverEl.className = 'dr-hover-popover';
            popoverEl.style.display = 'none';
            popoverEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            popoverEl.addEventListener('mouseleave', scheduleHide);
            document.body.appendChild(popoverEl);
            return popoverEl;
        }

        function position(targetEl) {
            const pop = ensurePopover();
            // For customer cells, anchor to the phone line specifically so the
            // popover appears right next to the phone number — not at the far
            // right edge of the wide customer column.
            const anchorEl = targetEl.classList.contains('dr-hover-customer')
                ? targetEl.querySelector('.dr-customer-phone') || targetEl
                : targetEl;
            const rect = anchorEl.getBoundingClientRect();
            const margin = 8;
            // Show first to measure
            pop.style.visibility = 'hidden';
            pop.style.display = 'block';
            const pw = pop.offsetWidth;
            const ph = pop.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // Prefer right of anchor; fallback to left
            let left = rect.right + margin;
            if (left + pw > vw - 4) left = Math.max(4, rect.left - pw - margin);
            // Vertically center against the anchor line, then clamp to viewport
            let top = rect.top + rect.height / 2 - ph / 2;
            if (top < 4) top = 4;
            if (top + ph > vh - 4) top = Math.max(4, vh - ph - 4);
            pop.style.left = left + window.scrollX + 'px';
            pop.style.top = top + window.scrollY + 'px';
            pop.style.visibility = '';
        }

        function scheduleHide() {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (popoverEl) popoverEl.style.display = 'none';
                activeKey = null;
            }, HIDE_DELAY_MS);
        }

        function showLoading(targetEl, label) {
            const pop = ensurePopover();
            pop.innerHTML = `<div class="dr-hp-loading"><div class="dr-hp-spinner"></div><span>${label}</span></div>`;
            position(targetEl);
        }

        function showError(targetEl, msg) {
            const pop = ensurePopover();
            pop.innerHTML = `<div class="dr-hp-error">${escapeHtml(msg)}</div>`;
            position(targetEl);
        }

        async function fetchBillHtml(orderId) {
            if (billCache.has(orderId)) return billCache.get(orderId);
            const url = `${WORKER_URL}/api/fastsaleorder/print1?ids=${encodeURIComponent(orderId)}`;
            const headers = { accept: 'application/json, text/javascript, */*; q=0.01' };
            const token = await getToken().catch(() => null);
            if (token) headers.Authorization = `Bearer ${token}`;
            const resp = await fetch(url, { method: 'GET', headers });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            if (!json.html) throw new Error('Không có dữ liệu bill');
            billCache.set(orderId, json.html);
            return json.html;
        }

        // Fetch full FastSaleOrder details (with OrderLines, Partner, User) for the
        // shared custom bill template (`window.generateCustomBillHTML` from
        // orders-report/js/utils/bill-service.js). Falls back to TPOS print1 HTML
        // when bill-service.js / fetch fails.
        const orderDetailCache = new Map();
        async function fetchOrderDetail(orderId) {
            if (orderDetailCache.has(orderId)) return orderDetailCache.get(orderId);
            const url = `${WORKER_URL}/api/odata/FastSaleOrder(${encodeURIComponent(orderId)})?$expand=OrderLines,Partner,User`;
            const token = await getToken().catch(() => null);
            const headers = { accept: 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const resp = await fetch(url, { method: 'GET', headers });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            orderDetailCache.set(orderId, json);
            return json;
        }

        async function ensureBillService() {
            // bill-service.js exports window.generateCustomBillHTML; web-warehouse-cache
            // populates window.WebWarehouseCache.getSTT used by the template's product rows.
            await loadScriptOnce(
                '../shared/js/api-service.js',
                () => !!(window.ApiService || window.apiService)
            ).catch(() => {});
            await loadScriptOnce(
                '../orders-report/js/utils/web-warehouse-cache.js',
                () => !!window.WebWarehouseCache
            ).catch(() => {});
            await loadScriptOnce(
                '../orders-report/js/utils/bill-service.js',
                () => typeof window.generateCustomBillHTML === 'function'
            );
            // Trigger warehouse cache load (best-effort) so STT lookup populates.
            if (
                window.WebWarehouseCache &&
                typeof window.WebWarehouseCache.preload === 'function'
            ) {
                window.WebWarehouseCache.preload().catch(() => {});
            }
        }

        async function fetchCustomBillHtml(orderId) {
            await ensureBillService();
            if (typeof window.generateCustomBillHTML !== 'function') {
                throw new Error('generateCustomBillHTML không khả dụng');
            }
            const detail = await fetchOrderDetail(orderId);
            return window.generateCustomBillHTML(detail, {});
        }

        async function fetchCustomer(phone) {
            if (customerCache.has(phone)) return customerCache.get(phone);
            // limit=50: bill modal cột phải hiển thị đủ hoạt động (popover scroll OK).
            const resp = await fetch(
                `${RENDER_URL}/api/v2/customers/${encodeURIComponent(phone)}/quick-view?limit=50`
            );
            if (!resp.ok) {
                if (resp.status === 404) {
                    customerCache.set(phone, null);
                    return null;
                }
                throw new Error(`HTTP ${resp.status}`);
            }
            const json = await resp.json();
            const data = json.data || null;
            customerCache.set(phone, data);
            return data;
        }

        async function showBill(targetEl) {
            const id = targetEl.dataset.id;
            const number = targetEl.dataset.number || '';
            const key = `bill:${id}`;
            activeKey = key;
            if (!id) {
                showError(targetEl, 'Không có ID hóa đơn');
                return;
            }
            showLoading(targetEl, `Đang tải bill ${number}…`);
            try {
                const html = await fetchBillHtml(id);
                if (activeKey !== key) return;
                const pop = ensurePopover();
                // Sandbox bill HTML in iframe — TPOS print HTML ships its own <style>
                // (e.g. `html, body { width: 80mm }`) that would leak to the parent page.
                pop.innerHTML = `
                    <div class="dr-hp-header">
                        <span class="dr-hp-title"><i class="fas fa-receipt"></i> ${escapeHtml(number)}</span>
                    </div>`;
                const ifr = document.createElement('iframe');
                ifr.className = 'dr-hp-bill-frame';
                ifr.sandbox = 'allow-same-origin';
                // Set srcdoc via property (avoids attr-quote escaping pitfalls;
                // the project's escapeHtml is textContent-based and doesn't escape ").
                ifr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}img{max-width:100%;height:auto;}table{border-collapse:collapse;width:100%;}td,th{padding:2px 4px;}</style></head><body>${html}</body></html>`;
                pop.appendChild(ifr);
                position(targetEl);
            } catch (e) {
                if (activeKey !== key) return;
                showError(targetEl, `Không tải được bill: ${e.message}`);
            }
        }

        async function showCustomer(targetEl) {
            const phone = targetEl.dataset.phone;
            const key = `cust:${phone}`;
            activeKey = key;
            if (!phone) {
                showError(targetEl, 'Không có SĐT');
                return;
            }
            showLoading(targetEl, `Đang tải khách hàng ${phone}…`);
            try {
                const data = await fetchCustomer(phone);
                if (activeKey !== key) return;
                if (!data) {
                    showError(targetEl, 'Khách chưa có trong hệ thống');
                    return;
                }
                renderCustomer(data, phone);
                position(targetEl);
            } catch (e) {
                if (activeKey !== key) return;
                showError(targetEl, `Không tải được ví: ${e.message}`);
            }
        }

        function fmtMoney(n) {
            const v = parseFloat(n) || 0;
            return new Intl.NumberFormat('vi-VN').format(Math.round(v));
        }

        function fmtDateTime(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            if (isNaN(d)) return iso;
            return d.toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        }

        // Short HH:MM dd/MM (no year) — match balance-history's review modal.
        function fmtShortDateTime(iso) {
            if (!iso) return 'N/A';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return 'N/A';
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            return `${hh}:${mm} ${dd}/${mo}`;
        }

        function txConfig(tx) {
            const t = tx.type;
            const source = tx.source || '';
            const note = tx.note || '';
            const amount = parseFloat(tx.amount) || 0;
            const isCredit = amount >= 0;
            let label = 'Khác';
            switch (t) {
                case 'DEPOSIT':
                    // DEPOSIT từ ticket RETURN_GOODS (Hoàn tiền khi khách trả hàng) →
                    // "Khách Gửi" để đồng bộ với customer-hub wallet UI.
                    if (
                        source === 'RETURN_GOODS' ||
                        /Hoàn tiền từ ticket TV-|RETURN_CLIENT|Công Nợ Ảo Từ Khách Gửi/i.test(note)
                    ) {
                        label = 'Khách Gửi';
                    } else if (
                        source === 'ORDER_CANCEL_REFUND' ||
                        /ORDER_CANCEL_REFUND|hoàn hủy/i.test(source || note)
                    ) {
                        label = 'Hoàn Hủy Đơn';
                    } else {
                        label = 'Nạp tiền';
                    }
                    break;
                case 'WITHDRAW':
                    label = /thanh\s*toán/i.test(note) ? 'Thanh toán' : 'Rút tiền';
                    break;
                case 'VIRTUAL_CREDIT':
                    // VIRTUAL_CREDIT từ ticket RETURN_SHIPPER (Hoàn về cấp công nợ ảo) →
                    // "Thu Về". Các trường hợp khác giữ "Cộng nợ ảo".
                    label =
                        source === 'VIRTUAL_CREDIT_ISSUE' ||
                        /Công Nợ Ảo Từ Thu Về|RETURN_SHIPPER/i.test(note)
                            ? 'Thu Về'
                            : 'Cộng nợ ảo';
                    break;
                case 'VIRTUAL_DEBIT':
                    label = 'Trừ nợ ảo';
                    break;
                case 'VIRTUAL_EXPIRE':
                    label = 'Nợ hết hạn';
                    break;
                case 'VIRTUAL_CANCEL':
                    label = 'Thu hồi nợ';
                    break;
                case 'ADJUSTMENT':
                    label = 'Điều chỉnh';
                    break;
                case 'FIX_COD':
                    label = 'Sửa COD';
                    break;
                case 'COD_ADJUSTMENT':
                    label = 'Sửa COD';
                    break;
                case 'BOOM':
                    label = 'Boom hàng';
                    break;
                case 'RETURN_SHIPPER':
                    label = 'Thu Về';
                    break;
                case 'RETURN_CLIENT':
                    label = 'Khách Gửi';
                    break;
            }
            return { label, isCredit, amount };
        }

        // Format số dư kiểu "338K" / "1.2M" / "0K" — match customer-hub wallet UI.
        function fmtBalanceK(val) {
            const num = Math.abs(parseFloat(val) || 0);
            if (num === 0) return '0K';
            if (num >= 1_000_000) {
                const m = num / 1_000_000;
                return (Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')) + 'M';
            }
            const k = num / 1000;
            return (Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, '')) + 'K';
        }

        // Render pill số dư sau giao dịch ("→ 338K") — null nếu tx không có
        // balance_after (legacy data hoặc fallback API).
        function balanceAfterHtml(tx) {
            if (
                tx.balance_after === null ||
                tx.balance_after === undefined ||
                tx.balance_after === ''
            ) {
                return '';
            }
            const balAfter = parseFloat(tx.balance_after) || 0;
            const vBalAfter = parseFloat(tx.virtual_balance_after) || 0;
            const total = balAfter + vBalAfter;
            const balBefore = parseFloat(tx.balance_before) || 0;
            const vBalBefore = parseFloat(tx.virtual_balance_before) || 0;
            const totalBefore = balBefore + vBalBefore;
            const tip = `Số dư ví sau giao dịch: ${fmtMoney(total)}đ (trước: ${fmtMoney(totalBefore)}đ)`;
            return `<span class="dr-hp-tx-balance" title="${escapeHtml(tip)}">→ ${escapeHtml(fmtBalanceK(total))}</span>`;
        }

        // Build a small "view image" eye button for a tx with sepay_image_url (legacy signature)
        function eyeBtnHtml(imageUrl) {
            if (!imageUrl) return '';
            return `<button type="button" class="dr-hp-eye-btn" data-eye-kind="image" data-img="${escapeHtml(imageUrl)}" title="Xem ảnh duyệt CK"><i class="fas fa-eye"></i></button>`;
        }

        // Pick evidence for a recent_transactions row.
        // Priority: sepay/inline image → ticket reference (TV- > NJD-).
        // Returns {kind:'image'|'ticket'|'invoice', value} or null.
        // - image: tx có ảnh duyệt CK → mở lightbox
        // - ticket: tx ref đến TV-YYYY-NNNNN (issue-tracking ticket) → mở ticket history viewer
        // - invoice: tx ref đến NJD/YYYY/N+ (FastSaleOrder) → mở bill modal trực tiếp
        function pickTxEvidence(tx) {
            if (!tx) return null;
            const note = String(tx.note || '');
            const inlineMatch = note.match(/\[Ảnh GD:\s*(https?:\/\/[^\]]+)\]/);
            const imgUrl = tx.sepay_image_url || (inlineMatch ? inlineMatch[1] : null);
            if (imgUrl) return { kind: 'image', value: imgUrl };
            const fields = [tx.reference_id, tx.note, tx.source].filter(Boolean);
            for (const f of fields) {
                const m = String(f).match(/TV-\d{4}-\d+/);
                if (m) return { kind: 'ticket', value: m[0] };
            }
            for (const f of fields) {
                const m = String(f).match(/NJD\/\d{4}\/\d+/i);
                if (m) return { kind: 'invoice', value: m[0].toUpperCase() };
            }
            return null;
        }

        // Build eye button for any tx — chooses image lightbox / ticket viewer / invoice bill.
        function eyeBtnHtmlForTx(tx) {
            const ev = pickTxEvidence(tx);
            if (!ev) return '';
            let title, dataAttr;
            if (ev.kind === 'image') {
                title = 'Xem ảnh duyệt CK';
                dataAttr = `data-img="${escapeHtml(ev.value)}"`;
            } else if (ev.kind === 'ticket') {
                title = 'Xem chi tiết phiếu xử lý';
                dataAttr = `data-ticket="${escapeHtml(ev.value)}"`;
            } else {
                title = `Xem bill ${ev.value}`;
                dataAttr = `data-invoice="${escapeHtml(ev.value)}"`;
            }
            return `<button type="button" class="dr-hp-eye-btn" data-eye-kind="${ev.kind}" ${dataAttr} title="${title}"><i class="fas fa-eye"></i></button>`;
        }

        // Build a Duyệt button for a pending balance_history row
        function approveBtnHtml(pendingId, amount) {
            return `<button type="button" class="dr-hp-approve-btn" data-pending-id="${escapeHtml(String(pendingId))}" data-pending-amt="${escapeHtml(String(amount || 0))}" title="Duyệt giao dịch"><i class="fas fa-check"></i> Duyệt</button>`;
        }

        // Compute composite uid for a tx — bh:N (balance_history sepay) hoặc wt:N (wallet).
        function getTxUid(tx) {
            if (!tx) return '';
            if (tx.reference_type === 'balance_history' && tx.reference_id)
                return `bh:${tx.reference_id}`;
            if (tx.id) return `wt:${tx.id}`;
            return '';
        }

        // Build "Kiểm tra giao dịch" button cho tx đã duyệt (manager review).
        // Chỉ hiện cho tx có balance_history reference (sepay) hoặc wallet_transactions
        // chưa được kiểm tra. Khi đã kiểm tra, hiện badge "ĐÃ KT" thay button.
        function reviewBtnHtmlForTx(tx) {
            const uid = getTxUid(tx);
            if (!uid) return '';
            let reviewed = false;
            let reviewedBy = '';
            let reviewedAt = '';
            if (uid.startsWith('bh:')) {
                reviewed = !!tx.bh_manager_reviewed;
                reviewedBy = tx.bh_reviewed_by || '';
                reviewedAt = tx.bh_reviewed_at || '';
            } else {
                reviewed = !!tx.wt_manager_reviewed;
                reviewedBy = tx.wt_reviewed_by || '';
                reviewedAt = tx.wt_reviewed_at || '';
            }
            if (reviewed) {
                const t = reviewedAt ? new Date(reviewedAt).toLocaleString('vi-VN') : '';
                const tip = `Đã kiểm tra${reviewedBy ? ' bởi ' + reviewedBy : ''}${t ? ' lúc ' + t : ''}`;
                return `<span class="dr-hp-reviewed-badge" title="${escapeHtml(tip)}" style="display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;">✓ ĐÃ KT</span>`;
            }
            return `<button type="button" class="dr-hp-review-btn" data-uid="${escapeHtml(uid)}" title="Kiểm tra giao dịch" style="background:#fef3c7;color:#a16207;border:1px solid #fde68a;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;font-weight:600;line-height:1;display:inline-flex;align-items:center;gap:2px;"><i class="fas fa-clipboard-check"></i></button>`;
        }

        function renderCustomer(data, phone, targetEl) {
            const c = data.customer || {};
            const w = data.wallet || { balance: 0, virtual_balance: 0 };
            // recent_transactions: server đã giới hạn theo ?limit (50 cho modal,
            // 5 cho popover-mặc định). Không slice thêm ở client.
            // Ẩn cặp WITHDRAW + DEPOSIT(ORDER_CANCEL_REFUND) cùng order ref + cùng amount
            // để khớp UX với customer-hub "Hoạt động ví". Helper expect ASC, API trả DESC.
            const rawTxs = data.recent_transactions || [];
            const skipFn =
                (window.WalletPairUtils && window.WalletPairUtils.skipPairedCancelRefunds) ||
                ((arr) => arr);
            const txs = skipFn(rawTxs.slice().reverse()).reverse();
            const pendingTxs = (data.pending_transactions || []).slice(0, 5);
            const pend = data.pending_deposits || { count: 0, total: 0 };
            const status = c.status || '';
            const tier = c.tier || '';
            const totalOrders = c.total_orders || 0;
            const totalSpent = parseFloat(c.total_spent) || 0;

            // Pending block (Duyệt button per row)
            const pendingHtml =
                pendingTxs.length === 0
                    ? ''
                    : `<div class="dr-hp-section-title">Chờ duyệt</div>
                   <div class="dr-hp-tx-list">${pendingTxs
                       .map((p) => {
                           const amt = parseFloat(p.amount) || 0;
                           const content = (p.content || '').slice(0, 80);
                           const eye = eyeBtnHtml(p.sepay_image_url);
                           return `
                           <div class="dr-hp-tx pending">
                               <div class="dr-hp-tx-head">
                                   <span class="dr-hp-tx-amount">+${fmtMoney(amt)}đ</span>
                                   <span class="dr-hp-tx-label pending">CHỜ DUYỆT</span>
                                   <span class="dr-hp-tx-time">${escapeHtml(fmtDateTime(p.transaction_date))}</span>
                                   <span class="dr-hp-tx-actions">${eye}${approveBtnHtml(p.id, amt)}</span>
                               </div>
                               ${content ? `<div class="dr-hp-tx-note">${escapeHtml(content)}</div>` : ''}
                           </div>`;
                       })
                       .join('')}</div>`;

            // Rút gọn note cho giao dịch thanh toán đơn (WITHDRAW/VIRTUAL_DEBIT từ SALE_ORDER):
            // "Thanh toán công nợ qua COD đơn hàng #ORDER — Trả từ ví: Xđ (Đơn: …)"
            // → "TT #ORDER (Đơn: …)". Strip cả "— Trả từ ví: Xđ" để tránh trùng lặp.
            const shortenCodPaymentNote = (note) => {
                if (!note) return note;
                let result = note.replace(
                    /^(?:Thanh\s*toán\s*công\s*nợ\s*qua\s*COD\s*đơn\s*hàng|Thanh\s*Toán\s*Đơn\s*Hàng)\s*/i,
                    'TT '
                );
                result = result.replace(/\s*—\s*Trả\s*từ\s*ví:\s*[\d.,]+đ/gi, '');
                return result.trim();
            };

            // Rewrite note cho 3 nhóm tx từ ticket — đồng bộ wording 1:1 với customer-hub
            // wallet UI (customer-profile.js). Trả về { html, isHtml } — caller render html
            // trực tiếp (đã escape parts an toàn) thay vì escapeHtml(text) để giữ màu đỏ
            // cho "Hoàn bởi / Duyệt bởi / Tạo bởi" suffix.
            // - Khách Gửi: DEPOSIT từ RETURN_GOODS → "Hoàn Tiền Khách Gửi #ORDER (TV-…)"
            // - Thu Về: VIRTUAL_CREDIT từ RETURN_SHIPPER → "Hoàn Về Cấp Công Nợ Ảo #ORDER"
            // - Hoàn Hủy Đơn: DEPOSIT + ORDER_CANCEL_REFUND → "Hoàn Tiền Hủy Đơn Công Nợ #ORDER"
            // Fallback orderCode về tx.reference_id (giống customer-profile.js) — vì
            // tx kiểu này thường không có NJD trong note, chỉ có TV-… ở reference_id.
            const rewriteTicketNote = (note, tx) => {
                if (!note) return { html: '', isHtml: false };
                const source = tx.source || '';
                const orderMatch =
                    note.match(/#?(NJD\/\d{4}\/\d+)/i) ||
                    String(tx.reference_id || '').match(/(NJD\/\d{4}\/\d+)/i);
                const orderCode = orderMatch ? orderMatch[1] : tx.reference_id || '';
                const tvMatch = note.match(/TV-\d{4}-\d+/i);
                const tvCode = tvMatch ? tvMatch[0] : '';
                const createdBy = tx.created_by && tx.created_by !== 'system' ? tx.created_by : '';

                const isReturnClient =
                    tx.type === 'DEPOSIT' &&
                    (source === 'RETURN_GOODS' ||
                        /Hoàn tiền từ ticket TV-|RETURN_CLIENT|Công Nợ Ảo Từ Khách Gửi/i.test(
                            note
                        ));
                const isReturnShipper =
                    tx.type === 'VIRTUAL_CREDIT' &&
                    (source === 'VIRTUAL_CREDIT_ISSUE' ||
                        /Công Nợ Ảo Từ Thu Về|RETURN_SHIPPER/i.test(note));
                const isCancelRefund = tx.type === 'DEPOSIT' && source === 'ORDER_CANCEL_REFUND';

                if (!isReturnClient && !isReturnShipper && !isCancelRefund) {
                    return { html: '', isHtml: false };
                }

                let head = '';
                let operatorLabel = 'Bởi';
                if (isReturnClient) {
                    head = orderCode
                        ? `Hoàn Tiền Khách Gửi #${orderCode}${tvCode ? ` (${tvCode})` : ''}`
                        : tvCode
                          ? `Hoàn Tiền Khách Gửi (${tvCode})`
                          : 'Hoàn Tiền Khách Gửi';
                    operatorLabel = 'Hoàn bởi';
                } else if (isReturnShipper) {
                    const internalMatch = note.match(
                        /Công Nợ Ảo Từ Thu Về\s*\([^)]*\)\s*-\s*(.+)$/i
                    );
                    const internal = internalMatch ? internalMatch[1].trim() : '';
                    head = orderCode
                        ? `Hoàn Về Cấp Công Nợ Ảo #${orderCode}${tvCode ? ` (${tvCode})` : ''}`
                        : tvCode
                          ? `Hoàn Về Cấp Công Nợ Ảo (${tvCode})`
                          : 'Hoàn Về Cấp Công Nợ Ảo';
                    if (internal) head = `${head} - ${internal}`;
                    operatorLabel = 'Duyệt bởi';
                } else {
                    head = orderCode
                        ? `Hoàn Tiền Hủy Đơn Công Nợ #${orderCode}`
                        : 'Hoàn Tiền Hủy Đơn Công Nợ';
                    operatorLabel = 'Người Hủy';
                }

                const operatorHtml = createdBy
                    ? ` - <span style="color:#ef4444;font-weight:700;">${escapeHtml(operatorLabel)} ${escapeHtml(createdBy)}</span>`
                    : '';
                return { html: escapeHtml(head) + operatorHtml, isHtml: true };
            };

            // Recent (processed) transactions
            const buildTxRow = (tx) => {
                const { label, isCredit, amount } = txConfig(tx);
                const sign = isCredit ? '+' : '';
                const cls = isCredit ? 'credit' : 'debit';
                const noteRaw = tx.note || '';
                const noteCleanImg = noteRaw.replace(/\[Ảnh GD:[^\]]+\]/g, '').trim();
                const noteShortenedCod = shortenCodPaymentNote(noteCleanImg);
                const ticketRewrite = rewriteTicketNote(noteShortenedCod, tx);
                let noteHtml = '';
                if (ticketRewrite.isHtml) {
                    noteHtml = ticketRewrite.html;
                } else {
                    const txt =
                        noteShortenedCod.length > 90
                            ? noteShortenedCod.slice(0, 90) + '…'
                            : noteShortenedCod;
                    noteHtml = escapeHtml(txt);
                }
                const eye = eyeBtnHtmlForTx(tx);
                const review = reviewBtnHtmlForTx(tx);
                const actions = [eye, review].filter(Boolean).join('');
                const balanceHtml = balanceAfterHtml(tx);
                return `
                          <div class="dr-hp-tx ${cls}">
                              <div class="dr-hp-tx-head">
                                  <span class="dr-hp-tx-amount">${sign}${fmtMoney(amount)}đ</span>
                                  <span class="dr-hp-tx-label">${escapeHtml(label)}</span>
                                  <span class="dr-hp-tx-time">${escapeHtml(fmtDateTime(tx.created_at))}</span>
                                  ${balanceHtml}
                                  ${actions ? `<span class="dr-hp-tx-actions" style="display:inline-flex;gap:4px;align-items:center;">${actions}</span>` : ''}
                              </div>
                              ${noteHtml ? `<div class="dr-hp-tx-note">${noteHtml}</div>` : ''}
                          </div>`;
            };
            const buildTxListHtml = (list) =>
                list.length === 0
                    ? '<div class="dr-hp-empty">Chưa có giao dịch</div>'
                    : list.map(buildTxRow).join('');
            const txHtml = buildTxListHtml(txs);
            // "Xem toàn bộ": hiện thêm các cặp tạo+hoàn đã bị ẩn (toggle bằng nút con mắt
            // cạnh tiêu đề). Chỉ render khi thực sự có giao dịch bị ẩn.
            const hasHiddenTxs = rawTxs.length > txs.length;
            const txHtmlAll = hasHiddenTxs ? buildTxListHtml(rawTxs) : '';

            const target = targetEl || ensurePopover();
            // Stash tx data so the review modal can look up details by uid.
            // Dùng rawTxs để review buttons trong "all view" cũng resolve được.
            target.__reviewCtx = {
                customerName: c.name || '',
                phone,
                txByUid: new Map(rawTxs.map((tx) => [getTxUid(tx), tx]).filter(([k]) => k)),
            };
            target.innerHTML = `
                <div class="dr-hp-header">
                    <span class="dr-hp-title"><i class="fas fa-user"></i> ${escapeHtml(c.name || phone)}</span>
                    <span class="dr-hp-sub">${escapeHtml(phone)}${status ? ' · ' + escapeHtml(status) : ''}${tier && tier !== 'normal' ? ' · ' + escapeHtml(tier) : ''}</span>
                </div>
                <div class="dr-hp-wallet-grid">
                    <div class="dr-hp-stat">
                        <div class="dr-hp-stat-label">Số dư thật</div>
                        <div class="dr-hp-stat-value ${+w.balance > 0 ? 'pos' : ''}">${fmtMoney(w.balance)}đ</div>
                    </div>
                    <div class="dr-hp-stat">
                        <div class="dr-hp-stat-label">Công nợ ảo</div>
                        <div class="dr-hp-stat-value ${+w.virtual_balance > 0 ? 'pos' : ''}">${fmtMoney(w.virtual_balance)}đ</div>
                    </div>
                    <div class="dr-hp-stat">
                        <div class="dr-hp-stat-label">Đơn / Doanh thu</div>
                        <div class="dr-hp-stat-value">${totalOrders} · ${fmtMoney(totalSpent)}đ</div>
                    </div>
                </div>
                ${pend.count > 0 && pendingTxs.length === 0 ? `<div class="dr-hp-pending"><i class="fas fa-clock"></i> ${pend.count} nạp chờ duyệt · ${fmtMoney(pend.total)}đ</div>` : ''}
                ${pendingHtml}
                <div class="dr-hp-section-title" style="display:flex;align-items:center;gap:6px;">
                    <span>Hoạt động gần đây</span>
                    ${
                        hasHiddenTxs
                            ? `<button type="button" class="dr-hp-toggle-all" data-mode="filtered" title="Xem toàn bộ giao dịch (kể cả cặp tạo-hủy đơn)" style="background:none;border:none;cursor:pointer;color:#6b7280;padding:2px 4px;font-size:12px;line-height:1;display:inline-flex;align-items:center;"><i class="fas fa-eye"></i></button>`
                            : ''
                    }
                </div>
                <div class="dr-hp-tx-list" data-tx-mode="filtered">${txHtml}</div>
                ${hasHiddenTxs ? `<div class="dr-hp-tx-list" data-tx-mode="all" style="display:none;">${txHtmlAll}</div>` : ''}
            `;
            wirePopoverActions(phone, target);
        }

        // Open a compressed lightbox for an image URL via render image-proxy.
        // ImageCache (IndexedDB TTL 7d) cache cả URL proxy lẫn URL gốc fallback.
        function openLightbox(imageUrl) {
            const proxied = `${RENDER_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}&w=900&q=70`;
            const existing = document.getElementById('dr-hp-lightbox');
            if (existing) existing.remove();
            const box = document.createElement('div');
            box.id = 'dr-hp-lightbox';
            box.className = 'dr-hp-lightbox';
            box.innerHTML = `
                <div class="dr-hp-lightbox-inner">
                    <div class="dr-hp-lightbox-spinner"></div>
                    <img alt="Ảnh duyệt CK" loading="lazy" />
                </div>`;
            const img = box.querySelector('img');
            img.addEventListener('load', () => box.classList.add('loaded'));
            img.addEventListener('error', () => {
                // Proxy/resize failed → fallback to original URL once
                if (img.dataset.fallback !== '1') {
                    img.dataset.fallback = '1';
                    if (window.ImageCache?.setImgSrc) window.ImageCache.setImgSrc(img, imageUrl);
                    else img.src = imageUrl;
                } else {
                    box.classList.add('error');
                }
            });
            if (window.ImageCache?.setImgSrc) window.ImageCache.setImgSrc(img, proxied);
            else img.src = proxied;
            box.addEventListener('click', () => box.remove());
            document.addEventListener('keydown', function onEsc(e) {
                if (e.key === 'Escape') {
                    box.remove();
                    document.removeEventListener('keydown', onEsc);
                }
            });
            document.body.appendChild(box);
        }

        // Approve a pending balance_history row from the popover
        async function approvePending(pendingId, amount, btn) {
            if (!pendingId) return;
            const verifiedBy =
                window.authManager?.getUserInfo?.()?.username ||
                window.authManager?.currentUser?.displayName ||
                'admin';
            if (!confirm(`Duyệt giao dịch +${fmtMoney(amount)}đ?`)) return;
            const original = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
            try {
                const resp = await fetch(
                    `${RENDER_URL}/api/v2/balance-history/${encodeURIComponent(pendingId)}/approve`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ verified_by: verifiedBy }),
                    }
                );
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || json.success === false) {
                    throw new Error(json.error || `HTTP ${resp.status}`);
                }
                // Invalidate customer cache so next hover refetches
                if (btn) {
                    const popover = btn.closest('.dr-hover-popover');
                    const phone = popover?.dataset?.phone;
                    if (phone) customerCache.delete(phone);
                }
                if (btn) {
                    btn.classList.add('approved');
                    btn.innerHTML = '<i class="fas fa-check"></i> Đã duyệt';
                }
            } catch (e) {
                console.error('[DR HoverPreview] approve failed:', e);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = original;
                }
                alert(`Duyệt thất bại: ${e.message}`);
            }
        }

        // Lazy-load shared scripts on demand. Idempotent: dedupes parallel calls
        // and cached completed loads.
        const _lazyScriptPromises = new Map();
        function loadScriptOnce(src, predicate) {
            if (predicate && predicate()) return Promise.resolve();
            if (_lazyScriptPromises.has(src)) return _lazyScriptPromises.get(src);
            const p = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => resolve();
                s.onerror = () => reject(new Error(`Script load failed: ${src}`));
                document.head.appendChild(s);
            });
            _lazyScriptPromises.set(src, p);
            return p;
        }

        // Lazy-load shared ticket viewer (and its ApiService dependency) when eye → ticket clicked.
        async function ensureTicketViewer() {
            // ApiService is required by ticket-history-viewer for getTicket / searchTicketsServer.
            await loadScriptOnce(
                '../shared/js/api-service.js',
                () =>
                    !!(window.ApiService || window.apiService) &&
                    typeof (window.ApiService || window.apiService).getTicket === 'function'
            );
            await loadScriptOnce(
                '../shared/js/ticket-history-viewer.js',
                () => typeof window.showTicketHistoryViewer === 'function'
            );
        }
        async function openTicketDetail(code) {
            if (!code) return;
            try {
                await ensureTicketViewer();
                if (typeof window.showTicketHistoryViewer === 'function') {
                    window.showTicketHistoryViewer(code);
                } else {
                    alert('Không mở được chi tiết phiếu');
                }
            } catch (err) {
                console.error('[DR HoverPreview] ticket detail load failed:', err);
                alert(`Không mở được chi tiết phiếu: ${err.message}`);
            }
        }

        function wirePopoverActions(phone, targetEl) {
            const target = targetEl || ensurePopover();
            target.dataset.phone = phone;
            target.querySelectorAll('.dr-hp-eye-btn:not([data-bound])').forEach((btn) => {
                btn.dataset.bound = '1';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const kind = btn.getAttribute('data-eye-kind') || 'image';
                    if (kind === 'ticket') {
                        openTicketDetail(btn.getAttribute('data-ticket'));
                    } else if (kind === 'invoice') {
                        openInvoiceBillModal(btn.getAttribute('data-invoice'), phone);
                    } else {
                        const url = btn.getAttribute('data-img');
                        if (url) openLightbox(url);
                    }
                });
            });
            target.querySelectorAll('.dr-hp-approve-btn:not([data-bound])').forEach((btn) => {
                btn.dataset.bound = '1';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    approvePending(
                        btn.dataset.pendingId,
                        parseFloat(btn.dataset.pendingAmt) || 0,
                        btn
                    );
                });
            });
            target.querySelectorAll('.dr-hp-review-btn:not([data-bound])').forEach((btn) => {
                btn.dataset.bound = '1';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    reviewTransaction(btn.dataset.uid, btn);
                });
            });
            // Nút con mắt cạnh "Hoạt động gần đây": toggle hiện/ẩn cặp tạo+hoàn đơn đã bị filter.
            target.querySelectorAll('.dr-hp-toggle-all:not([data-bound])').forEach((btn) => {
                btn.dataset.bound = '1';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const filteredEl = target.querySelector(
                        '.dr-hp-tx-list[data-tx-mode="filtered"]'
                    );
                    const allEl = target.querySelector('.dr-hp-tx-list[data-tx-mode="all"]');
                    if (!filteredEl || !allEl) return;
                    const icon = btn.querySelector('i');
                    if (btn.dataset.mode === 'filtered') {
                        filteredEl.style.display = 'none';
                        allEl.style.display = '';
                        btn.dataset.mode = 'all';
                        btn.title = 'Ẩn cặp tạo-hủy đơn triệt tiêu';
                        if (icon) icon.className = 'fas fa-eye-slash';
                    } else {
                        filteredEl.style.display = '';
                        allEl.style.display = 'none';
                        btn.dataset.mode = 'filtered';
                        btn.title = 'Xem toàn bộ giao dịch (kể cả cặp tạo-hủy đơn)';
                        if (icon) icon.className = 'fas fa-eye';
                    }
                });
            });
        }

        // Manager review: open rich modal (giống balance-history) cho phép nhập
        // ghi chú + đính kèm ảnh (Ctrl+V hoặc kéo thả) trước khi xác nhận.
        function reviewTransaction(uid, btn) {
            if (!uid) return;
            // Walk up to find the host element with __reviewCtx (popover or modal column).
            let host = btn;
            while (host && !host.__reviewCtx) host = host.parentElement;
            const ctx = host?.__reviewCtx;
            const tx = ctx?.txByUid?.get(uid) || null;
            const customerName = ctx?.customerName || '';
            const phone = ctx?.phone || '';
            openReviewModal(uid, btn, tx, { customerName, phone });
        }

        // Lazy-create the manager-review modal (giống balance-history).
        let reviewModalEl = null;
        const reviewState = {
            uid: null,
            btn: null,
            phone: '',
            customerName: '',
            imageFile: null,
            imageUrl: null,
            isUploading: false,
        };

        function ensureReviewModal() {
            if (reviewModalEl) return reviewModalEl;
            reviewModalEl = document.createElement('div');
            reviewModalEl.id = 'dr-rev-modal';
            reviewModalEl.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;align-items:center;justify-content:center;padding:20px;';
            reviewModalEl.innerHTML = `
                <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:450px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;font-family:inherit;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
                        <h3 style="margin:0;font-size:16px;font-weight:600;color:#111827;">✓ Kiểm tra giao dịch</h3>
                        <button type="button" id="dr-rev-close" style="background:none;border:none;font-size:24px;color:#6b7280;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>
                    </div>
                    <div style="padding:16px 18px;overflow-y:auto;flex:1;">
                        <div id="dr-rev-summary" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;"></div>
                        <div id="dr-rev-existing-img-wrap" style="display:none;margin-bottom:14px;">
                            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Ảnh trong ghi chú giao dịch</label>
                            <div style="width:100%;max-width:240px;border-radius:6px;overflow:hidden;cursor:pointer;border:1px solid #e5e7eb;" id="dr-rev-existing-img-thumb">
                                <img id="dr-rev-existing-img" alt="Ảnh ghi chú" style="display:block;width:100%;height:auto;" />
                            </div>
                        </div>
                        <div style="margin-bottom:14px;">
                            <label for="dr-rev-note" style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Ghi chú kiểm tra (đơn hàng đã sử dụng)</label>
                            <textarea id="dr-rev-note" placeholder="VD: Đã dùng cho đơn hàng #12345, khách Nguyễn Văn A..." style="width:100%;min-height:72px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;"></textarea>
                        </div>
                        <div>
                            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Ảnh đính kèm (Ctrl+V để dán)</label>
                            <div id="dr-rev-dropzone" style="border:2px dashed #d1d5db;border-radius:8px;padding:24px 12px;text-align:center;color:#6b7280;font-size:13px;cursor:pointer;background:#fafafa;">
                                <div style="font-size:28px;margin-bottom:6px;">🖼️</div>
                                <div>Paste (Ctrl+V) hoặc kéo thả hình vào đây</div>
                            </div>
                            <div id="dr-rev-preview" style="display:none;position:relative;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
                                <img id="dr-rev-preview-img" alt="Preview" style="display:block;width:100%;height:auto;max-height:240px;object-fit:contain;background:#f3f4f6;" />
                                <div id="dr-rev-upload-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.5);color:white;font-size:13px;align-items:center;justify-content:center;">Đang tải lên...</div>
                                <button type="button" id="dr-rev-remove-img" title="Xóa ảnh" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;line-height:1;">×</button>
                                <span id="dr-rev-upload-status" style="position:absolute;bottom:6px;left:6px;font-size:11px;padding:2px 6px;border-radius:3px;"></span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #e5e7eb;background:#f8fafc;">
                        <button type="button" id="dr-rev-cancel" style="padding:8px 14px;border:1px solid #d1d5db;background:white;color:#374151;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Hủy</button>
                        <button type="button" id="dr-rev-confirm" style="padding:8px 14px;background:#10b981;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">✓ Xác nhận đã kiểm tra</button>
                    </div>
                </div>`;
            document.body.appendChild(reviewModalEl);

            // Wire close handlers
            const close = () => closeReviewModal();
            reviewModalEl.querySelector('#dr-rev-close').addEventListener('click', close);
            reviewModalEl.querySelector('#dr-rev-cancel').addEventListener('click', close);
            reviewModalEl.addEventListener('click', (e) => {
                if (e.target === reviewModalEl) close();
            });

            // Existing image — open lightbox on click
            reviewModalEl
                .querySelector('#dr-rev-existing-img-thumb')
                .addEventListener('click', () => {
                    const img = reviewModalEl.querySelector('#dr-rev-existing-img');
                    if (img && img.src) openLightbox(img.src);
                });

            // Confirm
            reviewModalEl.querySelector('#dr-rev-confirm').addEventListener('click', confirmReview);

            // Image paste
            reviewModalEl.addEventListener('paste', (e) => {
                if (reviewModalEl.style.display === 'none') return;
                const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        e.preventDefault();
                        handleReviewImageSelect(item.getAsFile());
                        break;
                    }
                }
            });

            // Drag-drop
            const dz = reviewModalEl.querySelector('#dr-rev-dropzone');
            dz.addEventListener('dragover', (e) => {
                e.preventDefault();
                dz.style.borderColor = '#10b981';
                dz.style.background = '#f0fdf4';
            });
            dz.addEventListener('dragleave', () => {
                dz.style.borderColor = '#d1d5db';
                dz.style.background = '#fafafa';
            });
            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                dz.style.borderColor = '#d1d5db';
                dz.style.background = '#fafafa';
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith('image/')) handleReviewImageSelect(f);
            });

            // Remove image
            reviewModalEl
                .querySelector('#dr-rev-remove-img')
                .addEventListener('click', clearReviewImage);

            // Esc to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && reviewModalEl.style.display !== 'none') close();
            });

            return reviewModalEl;
        }

        function openReviewModal(uid, btn, tx, customerCtx) {
            const modal = ensureReviewModal();
            reviewState.uid = uid;
            reviewState.btn = btn;
            reviewState.phone = customerCtx?.phone || '';
            reviewState.customerName = customerCtx?.customerName || '';
            clearReviewImage();
            modal.querySelector('#dr-rev-note').value = '';
            // Defensive: ensure confirm button isn't stuck in a previous "Đang xử lý..."
            // / disabled state (e.g. if a prior open was force-closed mid-request).
            resetReviewConfirmBtn();

            const amount = parseFloat(tx?.amount) || 0;
            const sign = amount >= 0 ? '+' : '−';
            const amtColor = amount >= 0 ? '#16a34a' : '#dc2626';
            // "Nội dung CK" + "Ngày GD" prefer raw bank fields (bh_content, bh_transaction_date)
            // — match balance-history's "Kiểm tra giao dịch" modal. Fallback to wallet_transactions
            // fields chỉ khi tx không liên kết balance_history.
            const noteRaw = (tx?.bh_content || tx?.note || '')
                .replace(/\[Ảnh GD:[^\]]+\]/g, '')
                .trim();
            const dateStr = fmtShortDateTime(tx?.bh_transaction_date || tx?.created_at);
            const customerLabel =
                [customerCtx?.customerName, customerCtx?.phone].filter(Boolean).join(' - ') || '—';

            modal.querySelector('#dr-rev-summary').innerHTML = `
                <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;">
                    <span style="color:#6b7280;">Số tiền:</span>
                    <span style="font-weight:700;color:${amtColor};">${sign}${fmtMoney(Math.abs(amount))}đ</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;">
                    <span style="color:#6b7280;">Khách hàng:</span>
                    <span style="font-weight:500;color:#111827;">${escapeHtml(customerLabel)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;">
                    <span style="color:#6b7280;flex-shrink:0;">Nội dung CK:</span>
                    <span style="color:#111827;text-align:right;word-break:break-word;">${escapeHtml(noteRaw || '—')}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;">
                    <span style="color:#6b7280;">Ngày GD:</span>
                    <span style="color:#111827;">${escapeHtml(dateStr)}</span>
                </div>`;

            // Existing note image preview
            const existingWrap = modal.querySelector('#dr-rev-existing-img-wrap');
            const existingImg = modal.querySelector('#dr-rev-existing-img');
            const evidence = pickTxEvidence(tx);
            if (evidence?.kind === 'image' && evidence.value) {
                existingImg.src = evidence.value;
                existingWrap.style.display = '';
            } else {
                existingImg.removeAttribute('src');
                existingWrap.style.display = 'none';
            }

            modal.style.display = 'flex';
            // Focus the note textarea so paste captures the modal first
            setTimeout(() => modal.querySelector('#dr-rev-note')?.focus(), 30);
        }

        const REVIEW_CONFIRM_DEFAULT_HTML = '✓ Xác nhận đã kiểm tra';

        function resetReviewConfirmBtn() {
            if (!reviewModalEl) return;
            const btn = reviewModalEl.querySelector('#dr-rev-confirm');
            if (!btn) return;
            btn.disabled = false;
            btn.innerHTML = REVIEW_CONFIRM_DEFAULT_HTML;
        }

        function closeReviewModal() {
            if (!reviewModalEl) return;
            reviewModalEl.style.display = 'none';
            reviewState.uid = null;
            reviewState.btn = null;
            clearReviewImage();
            // Bug fix: success path of confirmReview() chỉ gọi closeReviewModal(); nếu
            // không reset confirm button thì lần mở modal sau button vẫn dính
            // "Đang xử lý..." disabled → user thấy stuck.
            resetReviewConfirmBtn();
        }

        async function handleReviewImageSelect(file) {
            if (!file) return;
            const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowed.includes(file.type)) {
                alert('Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert('File quá lớn (tối đa 5MB)');
                return;
            }
            reviewState.imageFile = file;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const previewImg = reviewModalEl.querySelector('#dr-rev-preview-img');
                const previewWrap = reviewModalEl.querySelector('#dr-rev-preview');
                const dz = reviewModalEl.querySelector('#dr-rev-dropzone');
                previewImg.src = e.target.result;
                previewWrap.style.display = 'block';
                dz.style.display = 'none';
                await uploadReviewImage(file, e.target.result);
            };
            reader.readAsDataURL(file);
        }

        async function uploadReviewImage(file, base64Data) {
            if (reviewState.isUploading) return;
            reviewState.isUploading = true;
            const overlay = reviewModalEl.querySelector('#dr-rev-upload-overlay');
            const statusEl = reviewModalEl.querySelector('#dr-rev-upload-status');
            const confirmBtn = reviewModalEl.querySelector('#dr-rev-confirm');
            overlay.style.display = 'flex';
            statusEl.textContent = 'Đang tải lên...';
            statusEl.style.cssText += 'background:rgba(59,130,246,0.9);color:white;';
            confirmBtn.disabled = true;
            try {
                const ts = Date.now();
                const rand = Math.random().toString(36).substring(2, 8);
                const ext = file.name?.split('.').pop() || 'jpg';
                const filename = `review_${ts}_${rand}.${ext}`;
                const resp = await fetch(`${RENDER_URL}/api/upload/image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: base64Data,
                        fileName: filename,
                        folderPath: 'accountant-reviews',
                        mimeType: file.type,
                    }),
                });
                const result = await resp.json();
                if (!result.success) throw new Error(result.error || 'Upload failed');
                reviewState.imageUrl = result.url;
                overlay.style.display = 'none';
                statusEl.textContent = 'Đã tải lên';
                statusEl.style.cssText += 'background:rgba(16,185,129,0.9);color:white;';
                confirmBtn.disabled = false;
            } catch (err) {
                console.error('[DR REVIEW] upload failed:', err);
                overlay.style.display = 'none';
                statusEl.textContent = 'Lỗi tải lên';
                statusEl.style.cssText += 'background:rgba(220,38,38,0.9);color:white;';
                confirmBtn.disabled = false;
                alert(`Lỗi tải ảnh: ${err.message}`);
            } finally {
                reviewState.isUploading = false;
            }
        }

        function clearReviewImage() {
            reviewState.imageFile = null;
            reviewState.imageUrl = null;
            if (!reviewModalEl) return;
            const previewWrap = reviewModalEl.querySelector('#dr-rev-preview');
            const dz = reviewModalEl.querySelector('#dr-rev-dropzone');
            const previewImg = reviewModalEl.querySelector('#dr-rev-preview-img');
            const statusEl = reviewModalEl.querySelector('#dr-rev-upload-status');
            const overlay = reviewModalEl.querySelector('#dr-rev-upload-overlay');
            if (previewWrap) previewWrap.style.display = 'none';
            if (dz) dz.style.display = '';
            if (previewImg) previewImg.removeAttribute('src');
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.style.background = 'transparent';
            }
            if (overlay) overlay.style.display = 'none';
        }

        async function confirmReview() {
            const { uid, btn } = reviewState;
            if (!uid) return;
            if (reviewState.isUploading) {
                alert('Đang tải ảnh — vui lòng đợi.');
                return;
            }
            const reviewedBy = window.authManager?.getUserInfo?.()?.username || 'admin';
            const note = reviewModalEl.querySelector('#dr-rev-note').value.trim();
            const reviewImageUrl = reviewState.imageUrl || null;
            const confirmBtn = reviewModalEl.querySelector('#dr-rev-confirm');
            const originalConfirmHtml = confirmBtn.innerHTML;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            // 30s abort — surface hung fetch as a real error instead of perpetual spinner.
            const ctrl = new AbortController();
            const abortTimer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const url = `${RENDER_URL}/api/v2/balance-history/${encodeURIComponent(uid)}/manager-review`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        manager_review_note: note,
                        reviewed_by: reviewedBy,
                        review_image_url: reviewImageUrl,
                    }),
                    signal: ctrl.signal,
                });
                clearTimeout(abortTimer);
                const text = await resp.text();
                let result;
                try {
                    result = JSON.parse(text);
                } catch (_) {
                    throw new Error(
                        `Server trả response không phải JSON (HTTP ${resp.status}): ${text.slice(0, 120)}`
                    );
                }
                if (!resp.ok || !result.success) {
                    throw new Error(result.error || `HTTP ${resp.status}`);
                }
                // Server confirmed — guarantee modal closes even if post-effects throw.
                try {
                    if (btn && btn.parentNode) {
                        const t = new Date().toLocaleString('vi-VN');
                        const tip = `Đã kiểm tra bởi ${reviewedBy} lúc ${t}`;
                        const badge = document.createElement('span');
                        badge.className = 'dr-hp-reviewed-badge';
                        badge.title = tip;
                        badge.style.cssText =
                            'display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;';
                        badge.textContent = '✓ ĐÃ KT';
                        btn.replaceWith(badge);
                    }
                } catch (postErr) {
                    console.warn('[DR REVIEW] badge replace failed:', postErr);
                }
                // Audit log — đảm bảo verify từ delivery-report cũng xuất hiện ở balance-history "Lịch Sử"
                try {
                    if (window.AuditLogger) {
                        const phone = reviewState.phone;
                        const customerName = reviewState.customerName;
                        window.AuditLogger.logAction('transaction_verify', {
                            module: 'balance-history',
                            description:
                                'Kiểm tra giao dịch #' +
                                uid +
                                (phone
                                    ? ' (KH: ' + (customerName || '') + ' - ' + phone + ')'
                                    : ''),
                            oldData: { manager_reviewed: false },
                            newData: {
                                manager_reviewed: true,
                                review_note: note,
                                reviewed_by: reviewedBy,
                                review_image_url: reviewImageUrl || null,
                                txId: String(uid),
                            },
                            approverUserId: reviewedBy,
                            approverUserName: reviewedBy,
                            entityId: String(uid),
                            entityType: 'balance_history',
                        });
                    }
                } catch (_) {
                    /* ignore audit log errors */
                }
                try {
                    if (reviewState.phone) customerCache.delete(reviewState.phone);
                } catch (_) {
                    /* ignore cache invalidation errors */
                }
                closeReviewModal();
            } catch (err) {
                clearTimeout(abortTimer);
                console.error('[DR REVIEW]', uid, err);
                const msg =
                    err.name === 'AbortError'
                        ? 'Quá thời gian chờ (30s). Kiểm tra mạng hoặc thử lại.'
                        : err.message || String(err);
                alert('Lỗi kiểm tra giao dịch: ' + msg);
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalConfirmHtml;
            }
        }

        // =====================================================
        // ROW MODAL — bill (left) + customer activity (right)
        // Click vào ô số HĐ hoặc ô khách hàng để mở.
        // =====================================================
        let rowModalEl = null;
        let currentRowCtx = null; // { number, id, phone, customerName }
        let confirmEl = null;

        function ensureRowModal() {
            if (rowModalEl) return rowModalEl;
            rowModalEl = document.createElement('div');
            rowModalEl.id = 'dr-row-modal';
            rowModalEl.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;padding:20px;';
            rowModalEl.innerHTML = `
                <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:1200px;height:90vh;display:flex;flex-direction:column;overflow:hidden;font-family:inherit;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
                        <h3 id="dr-row-title" style="margin:0;font-size:15px;font-weight:600;color:#111827;">Chi tiết đơn hàng</h3>
                        <button type="button" id="dr-row-close" style="background:none;border:none;font-size:24px;color:#6b7280;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1;min-height:0;">
                        <div style="display:flex;flex-direction:column;border-right:1px solid #e5e7eb;background:#fafafa;min-height:0;">
                            <div style="padding:8px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;background:white;flex-shrink:0;">Bill</div>
                            <div id="dr-row-bill" style="flex:1;overflow:auto;min-height:0;"></div>
                        </div>
                        <div style="display:flex;flex-direction:column;min-height:0;">
                            <div style="padding:8px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;background:white;flex-shrink:0;">Hoạt động khách hàng</div>
                            <div id="dr-row-activity" style="flex:1;overflow:auto;min-height:0;padding:14px;font-size:13px;color:#1f2937;"></div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(rowModalEl);
            rowModalEl
                .querySelector('#dr-row-close')
                .addEventListener('click', requestCloseRowModal);
            rowModalEl.addEventListener('click', (e) => {
                if (e.target === rowModalEl) requestCloseRowModal();
            });
            return rowModalEl;
        }

        // Đóng dứt khoát (không hỏi) — dùng cho khi đã trả lời popup hoặc đơn đã kiểm tra rồi.
        function closeRowModal() {
            if (rowModalEl) rowModalEl.style.display = 'none';
            currentRowCtx = null;
        }

        // Quyền "canMarkOrderChecked" trên page delivery-report. Mirror pattern
        // PermissionHelper.hasPermission để khỏi thêm script tag mới.
        function canMarkOrderChecked() {
            try {
                const raw =
                    sessionStorage.getItem('loginindex_auth') ||
                    localStorage.getItem('loginindex_auth');
                if (!raw) return false;
                const auth = JSON.parse(raw);
                if (auth?.isAdmin === true || auth?.roleTemplate === 'admin') return true;
                return auth?.detailedPermissions?.['delivery-report']?.canMarkOrderChecked === true;
            } catch (e) {
                return false;
            }
        }

        // Yêu cầu đóng — nếu không có quyền / không có số phiếu / đã kiểm tra rồi
        // → đóng thẳng. Ngược lại show popup xác nhận.
        function requestCloseRowModal() {
            const ctx = currentRowCtx;
            if (
                !ctx ||
                !ctx.number ||
                !canMarkOrderChecked() ||
                OrderCheckStore.isChecked(ctx.number)
            ) {
                closeRowModal();
                return;
            }
            showCheckConfirm(ctx);
        }

        function ensureConfirmEl() {
            if (confirmEl) return confirmEl;
            confirmEl = document.createElement('div');
            confirmEl.id = 'dr-row-confirm';
            confirmEl.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10010;align-items:center;justify-content:center;padding:20px;';
            confirmEl.innerHTML = `
                <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;overflow:hidden;font-family:inherit;">
                    <div style="padding:16px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
                        <h3 style="margin:0;font-size:16px;font-weight:600;color:#111827;">Xác nhận kiểm tra đơn</h3>
                    </div>
                    <div style="padding:16px 18px;font-size:13px;color:#374151;line-height:1.55;">
                        <div>Đơn <strong id="dr-confirm-number" style="color:#111827;"></strong> đã được kiểm tra chưa?</div>
                        <div id="dr-confirm-customer" style="color:#6b7280;margin-top:4px;"></div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #e5e7eb;background:#f8fafc;">
                        <button type="button" id="dr-confirm-skip" style="padding:8px 14px;border:1px solid #d1d5db;background:white;color:#374151;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Chưa duyệt</button>
                        <button type="button" id="dr-confirm-yes" style="padding:8px 14px;background:#10b981;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">✓ Đã kiểm tra</button>
                    </div>
                </div>`;
            document.body.appendChild(confirmEl);

            const hide = () => {
                confirmEl.style.display = 'none';
            };
            confirmEl.querySelector('#dr-confirm-skip').addEventListener('click', () => {
                hide();
                closeRowModal();
            });
            confirmEl.querySelector('#dr-confirm-yes').addEventListener('click', async () => {
                const ctx = currentRowCtx;
                hide();
                closeRowModal();
                if (ctx?.number) {
                    await OrderCheckStore.markChecked(ctx.number, ctx);
                }
            });
            // Click backdrop = same as "Chưa duyệt" (skip without saving)
            confirmEl.addEventListener('click', (e) => {
                if (e.target === confirmEl) {
                    hide();
                    closeRowModal();
                }
            });
            return confirmEl;
        }

        function showCheckConfirm(ctx) {
            const el = ensureConfirmEl();
            el.querySelector('#dr-confirm-number').textContent = ctx.number || '';
            const customerLine = [ctx.customerName, ctx.phone].filter(Boolean).join(' · ');
            el.querySelector('#dr-confirm-customer').textContent = customerLine;
            el.style.display = 'flex';
        }

        async function openRowModal(cell) {
            const tr = cell.closest('tr');
            if (!tr) return;
            const billCell = tr.querySelector('.dr-hover-bill');
            const custCell = tr.querySelector('.dr-hover-customer');
            const id = billCell?.dataset.id || '';
            const number = billCell?.dataset.number || '';
            const phone = custCell?.dataset.phone || '';
            const customerName =
                custCell?.querySelector('.dr-customer-name')?.textContent?.trim() || '';
            return openRowModalByData({ id, number, phone, customerName });
        }

        // Find a FastSaleOrder Id from its Number (NJD/YYYY/N+) via TPOS OData. Mirrors
        // what TPOS does when the user types a Số HĐ into the invoice list filter.
        async function resolveInvoiceIdByNumber(number) {
            if (!number) return null;
            const fromState = (DeliveryReportState.allData || []).find((i) => i.Number === number);
            if (fromState?.Id) return fromState.Id;
            const token = await getToken().catch(() => null);
            const headers = { accept: 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const filter = `(Type eq 'invoice' and contains(Number,'${number}'))`;
            const url = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView?$top=1&$filter=${encodeURIComponent(filter)}&$select=Id,Number,DateInvoice`;
            const resp = await fetch(url, { headers });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const found = (json.value || [])[0] || null;
            return found?.Id || null;
        }

        // Open the bill+activity modal directly for a given NJD invoice number, e.g.
        // when the user clicks an eye on a "Thanh toán qua COD đơn hàng #NJD/..."
        // transaction in the customer activity column.
        async function openInvoiceBillModal(number, fallbackPhone) {
            if (!number) return;
            const modal = ensureRowModal();
            modal.style.display = 'flex';
            const titleEl = modal.querySelector('#dr-row-title');
            titleEl.textContent = `${number} · Đang tìm phiếu…`;
            const billCol = modal.querySelector('#dr-row-bill');
            billCol.innerHTML =
                '<div class="dr-hp-loading" style="padding:24px;display:flex;align-items:center;justify-content:center;gap:8px;color:#6b7280;"><div class="dr-hp-spinner"></div><span>Đang tìm số phiếu ' +
                escapeHtml(number) +
                '…</span></div>';
            try {
                const id = await resolveInvoiceIdByNumber(number);
                if (!id) {
                    billCol.innerHTML = `<div class="dr-hp-error" style="padding:20px;color:#dc2626;">Không tìm thấy phiếu ${escapeHtml(number)} trên TPOS.</div>`;
                    titleEl.textContent = `${number} · Không tìm thấy`;
                    return;
                }
                await openRowModalByData({
                    id,
                    number,
                    phone: fallbackPhone || '',
                    customerName: '',
                });
            } catch (e) {
                billCol.innerHTML = `<div class="dr-hp-error" style="padding:20px;color:#dc2626;">Lỗi tìm phiếu: ${escapeHtml(e.message)}</div>`;
                titleEl.textContent = `${number} · Lỗi`;
            }
        }

        async function openRowModalByData({ id, number, phone, customerName }) {
            const modal = ensureRowModal();
            currentRowCtx = { id, number, phone, customerName };
            modal.style.display = 'flex';
            modal.querySelector('#dr-row-title').textContent =
                `${number || 'Đơn hàng'}${customerName ? ' · ' + customerName : ''}${phone ? ' · ' + phone : ''}`;

            const billCol = modal.querySelector('#dr-row-bill');
            const actCol = modal.querySelector('#dr-row-activity');

            // Bill (left) — prefer the orders-report custom template (with STT and
            // shop-customised footer); fall back to the TPOS print1 HTML if the shared
            // bill-service or detail fetch fails.
            if (id) {
                billCol.innerHTML =
                    '<div class="dr-hp-loading" style="padding:24px;display:flex;align-items:center;justify-content:center;gap:8px;color:#6b7280;"><div class="dr-hp-spinner"></div><span>Đang tải bill ' +
                    escapeHtml(number) +
                    '…</span></div>';
                const renderBill = (html) => {
                    if (modal.style.display === 'none') return;
                    billCol.innerHTML = '';
                    const ifr = document.createElement('iframe');
                    ifr.style.cssText =
                        'width:100%;height:100%;border:0;background:white;display:block;';
                    ifr.sandbox = 'allow-same-origin';
                    ifr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}img{max-width:100%;height:auto;}table{border-collapse:collapse;width:100%;}td,th{padding:2px 4px;}</style></head><body>${html}</body></html>`;
                    billCol.appendChild(ifr);
                };
                fetchCustomBillHtml(id)
                    .then(renderBill)
                    .catch((customErr) => {
                        console.warn(
                            '[DELIVERY-REPORT] Custom bill failed, falling back to TPOS print1:',
                            customErr
                        );
                        return fetchBillHtml(id).then(renderBill);
                    })
                    .catch((e) => {
                        if (modal.style.display === 'none') return;
                        billCol.innerHTML = `<div class="dr-hp-error" style="padding:20px;color:#dc2626;">Không tải được bill: ${escapeHtml(e.message)}</div>`;
                    });
            } else {
                billCol.innerHTML =
                    '<div style="padding:20px;color:#6b7280;">Không có ID hóa đơn</div>';
            }

            // Activity (right) — async load
            if (phone) {
                actCol.innerHTML =
                    '<div class="dr-hp-loading" style="display:flex;align-items:center;justify-content:center;gap:8px;color:#6b7280;padding:24px;"><div class="dr-hp-spinner"></div><span>Đang tải khách hàng ' +
                    escapeHtml(phone) +
                    '…</span></div>';
                fetchCustomer(phone)
                    .then((data) => {
                        if (modal.style.display === 'none') return;
                        if (!data) {
                            actCol.innerHTML =
                                '<div class="dr-hp-error" style="padding:20px;color:#6b7280;">Khách chưa có trong hệ thống</div>';
                            return;
                        }
                        renderCustomer(data, phone, actCol);
                    })
                    .catch((e) => {
                        if (modal.style.display === 'none') return;
                        actCol.innerHTML = `<div class="dr-hp-error" style="padding:20px;color:#dc2626;">Không tải được ví: ${escapeHtml(e.message)}</div>`;
                    });
            } else {
                actCol.innerHTML = '<div style="padding:20px;color:#6b7280;">Không có SĐT</div>';
            }
        }

        function onCellClick(e) {
            // Skip clicks on actionable controls inside the row (e.g., unscan buttons, links).
            if (e.target.closest('button, a')) return;
            const cell = e.target.closest('.dr-hover-bill, .dr-hover-customer');
            if (!cell) return;
            e.preventDefault();
            openRowModal(cell);
        }

        function init() {
            const root = document.getElementById('drTableWrapper') || document.body;
            root.addEventListener('click', onCellClick);
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                // Confirm popup is on top — close that first if open.
                if (confirmEl && confirmEl.style.display !== 'none') {
                    confirmEl.style.display = 'none';
                    closeRowModal();
                    return;
                }
                if (rowModalEl && rowModalEl.style.display !== 'none') requestCloseRowModal();
                else if (popoverEl) popoverEl.style.display = 'none';
            });
        }

        return { init };
    })();

    // =====================================================
    // PUBLIC API
    // =====================================================
    window.DeliveryReport = {
        init: initDeliveryReport,
        search: () => {
            // Spam guard: ignore re-entry while in-flight
            if (DeliveryReportState.isLoading) return;

            const oldFromDate = DeliveryReportState.filters.fromDate;
            const oldToDate = DeliveryReportState.filters.toDate;
            const oldKeyword = DeliveryReportState.filters.keyword;

            DeliveryReportState.currentPage = 1;
            collectFilters();
            saveFiltersToStorage();

            // Only re-fetch from API if date/keyword changed
            const needRefetch =
                oldFromDate !== DeliveryReportState.filters.fromDate ||
                oldToDate !== DeliveryReportState.filters.toDate ||
                oldKeyword !== DeliveryReportState.filters.keyword;

            if (needRefetch || !DeliveryReportState.allData.length) {
                fetchData();
            } else {
                // Carrier filter is client-side, just re-render
                renderTable();
                renderStats();
                renderPagination();
            }
        },
        goToPage: (page) => {
            const totalPages = Math.ceil(
                DeliveryReportState.totalCount / DeliveryReportState.pageSize
            );
            if (page < 1 || page > totalPages) return;
            DeliveryReportState.currentPage = page;
            // Client-side pagination: just re-render, no API call
            renderTable();
            renderPagination();
            document
                .getElementById('drTableWrapper')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        changePageSize: (size) => {
            DeliveryReportState.pageSize = parseInt(size, 10) || 200;
            DeliveryReportState.currentPage = 1;
            renderTable();
            renderPagination();
        },
        exportExcel: exportExcel,
        exportExcelProvince: exportExcelProvince,
        exportExcelGroup: exportExcelGroup,
        // Internals exposed so report.js can reuse classification logic
        _getItemGroup: (item) => getItemGroup(item),
        _isReturnItem: (item) => isReturnItem(item),
        _getToken: getToken,
        _workerUrl: WORKER_URL,
        _renderUrl: RENDER_URL,
        traSoat: traSoat,
        setTab: setTab,
        setScanFilter: setScanFilter,
        unscanItem: unscanItem,
        unscanAllTab: unscanAllTab,
        unscanGroup: unscanGroup,
        hideOrder: hideOrder,
        printView: printView,
        confirmPrint: confirmPrint,
        copyHandoverImage: copyHandoverImage,
        copyGroupHandoverImage: copyGroupHandoverImage,
        openCheckHistory: openCheckHistory,
        getState: () => DeliveryReportState,
    };
})();
