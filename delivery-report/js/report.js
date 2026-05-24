// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// DELIVERY REPORT MODAL — Báo cáo TOMATO / NAP / TP theo ngày
// Triggered by triple-clicking the "Đang lọc: ..." hint in main filter section.
// Editable cells (SL ĐƠN SHIP, BO NHẬN CK, ATRƯỜNG NHẬN CK, CK TRƯỚC, GHI CHÚ)
// persisted in localStorage keyed by date+group. Compute fields: PHÍ SHIP,
// TỔNG TẤT CẢ (= TIỀN − PHÍ SHIP + SL ĐƠN SHIP × 23k), TỔNG CÒN LẠI auto-derived.
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
        overrides: loadOverrides(),
        // Per-range fetch cache: { rangeKey: { byDateGroup: Map, fetchedAt } }
        fetchCache: {},
        currentByDateGroup: new Map(), // Map<`${date}__${groupName}`, {count, money}>
    };

    function loadOverrides() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch {
            return {};
        }
    }

    function saveOverrides() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));
        } catch (e) {
            console.warn('[report] localStorage save failed:', e?.message);
        }
    }

    function overrideKey(date, group) {
        return `${date}__${group}`;
    }

    function getOverride(date, group) {
        return state.overrides[overrideKey(date, group)] || {};
    }

    function setOverride(date, group, patch) {
        const k = overrideKey(date, group);
        const next = { ...(state.overrides[k] || {}), ...patch };
        // Drop empty overrides to keep storage clean
        const isEmpty = Object.values(next).every((v) => v == null || v === '' || v === 0);
        if (isEmpty) {
            delete state.overrides[k];
        } else {
            state.overrides[k] = next;
        }
        saveOverrides();
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
                  <th class="num input-col" title="Số đơn ship riêng, cộng thêm vào TỔNG TẤT CẢ × 23.000">SL ĐƠN SHIP</th>
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
                '<tr><td colspan="11" class="dr-report-empty">Chọn khoảng ngày để xem báo cáo</td></tr>';
            document.getElementById('drReportTfoot').innerHTML = '';
            return;
        }

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
            '<tr><td colspan="11" class="dr-report-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu DB…</td></tr>';
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
            // TỔNG TẤT CẢ = TIỀN − PHÍ SHIP + (SL ĐƠN SHIP × 23k)
            const totalAll = money - shipFee + slShip * SHIP_FEE_PER_ORDER;
            const boCK = Number(ov.boCK) || 0;
            const atruongCK = Number(ov.atruongCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const totalLeft = totalAll - boCK - atruongCK - ckTruoc;
            const note = ov.note || '';

            totals.slDon += slDon;
            totals.money += money;
            totals.shipFee += shipFee;
            totals.slShip += slShip;
            totals.totalAll += totalAll;
            totals.boCK += boCK;
            totals.atruongCK += atruongCK;
            totals.ckTruoc += ckTruoc;
            totals.totalLeft += totalLeft;

            const hasImg = !!ov.billImage;
            return `<tr data-date="${d}">
                <td class="date" title="Ngày thật: ${formatDDMMYYYY(d)}">${formatDDMMYYYY(realToEntry(d))}</td>
                <td class="num strong">${formatNumber(slDon)}</td>
                <td class="num clickable money-cell ${hasImg ? 'has-img' : 'no-img'}" data-action="open-img" title="${hasImg ? 'Bấm để xem/sửa ảnh' : 'Bấm để thêm ảnh chứng từ'}">
                    <span class="money-val">${formatMoney(money)}</span>
                    <span class="money-ico">${hasImg ? '<i class="fas fa-image"></i>' : '<i class="far fa-image"></i>'}</span>
                </td>
                <td class="num muted">${formatMoney(shipFee)}</td>
                <td class="num"><input type="number" min="0" data-field="slShip" value="${slShip || ''}" placeholder="0" title="Số đơn ship riêng — cộng SL × 23.000 vào TỔNG TẤT CẢ" /></td>
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
            const ov = getOverride(row.dataset.date, state.activeTab);
            if (!ov.billImage) return;
            showHoverPreview(cell, ov.billImage);
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
        document.getElementById('drReportImgDelete').addEventListener('click', () => {
            if (!confirm('Xóa ảnh hiện tại?')) return;
            const ctx = state._imgCtx;
            if (!ctx) return;
            setOverride(ctx.date, state.activeTab, { billImage: '' });
            closeImageModal();
            render();
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

    function saveCurrentImage() {
        const ctx = state._imgCtx;
        if (!ctx || !state._pendingImage) return;
        try {
            setOverride(ctx.date, state.activeTab, { billImage: state._pendingImage });
            closeImageModal();
            render();
        } catch (e) {
            if (String(e).match(/quota/i)) {
                alert('LocalStorage đầy — xóa bớt ảnh cũ rồi thử lại.');
            } else {
                alert('Lưu ảnh thất bại: ' + e.message);
            }
        }
    }

    function openImageModal(date) {
        ensureImageModal();
        state._imgCtx = { date };
        state._pendingImage = null;

        const ov = getOverride(date, state.activeTab);
        const preview = document.getElementById('drReportImgPreview');
        const paste = document.getElementById('drReportImgPaste');
        const subtitle = document.getElementById('drReportImgSubtitle');
        const deleteBtn = document.getElementById('drReportImgDelete');
        const info = document.getElementById('drReportImgInfo');
        const tabLabel = TABS.find((t) => t.key === state.activeTab)?.label || '';
        // `date` is the REAL date stored on the row; the column shows entry = real + 1
        subtitle.textContent = `${formatDDMMYYYY(realToEntry(date))} (thật ${formatDDMMYYYY(date)}) — ${tabLabel}`;

        if (ov.billImage) {
            preview.src = ov.billImage;
            preview.style.display = 'block';
            paste.style.display = 'none';
            deleteBtn.style.display = '';
            const sizeKB = Math.round((ov.billImage.length * 0.75) / 1024);
            info.textContent = `~${sizeKB} KB (đã lưu)`;
        } else {
            preview.src = '';
            preview.style.display = 'none';
            paste.style.display = '';
            deleteBtn.style.display = 'none';
            info.textContent = '';
        }
        document.getElementById('drReportImgSave').disabled = !ov.billImage; // enable when new image pasted
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
