// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// DELIVERY REPORT MODAL — Báo cáo TOMATO / NAP / TP theo ngày
// Triggered by triple-clicking the "Đang lọc: ..." hint in main filter section.
// Editable cells (SL ĐƠN, BO NHẬN CK, ATRƯỜNG NHẬN CK, CK TRƯỚC) persisted in
// localStorage keyed by date+group. Compute fields: PHÍ SHIP, TỔNG TẤT CẢ,
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

    function formatMoney(n) {
        const v = Math.round(Number(n) || 0);
        return new Intl.NumberFormat('vi-VN').format(v);
    }

    function parseMoney(s) {
        const cleaned = String(s || '').replace(/[^\d-]/g, '');
        return Number(cleaned) || 0;
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

    // Fallback group inference used when main controller helper isn't exposed.
    function inferGroup(item) {
        const carrier = String(item.CarrierName || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toUpperCase();
        const note = String(item.DeliveryNote || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toUpperCase();
        if (note.includes('THU VE')) return 'return';
        if (carrier.includes('THANH PHO')) return 'city';
        if (carrier.includes('BAN HANG SHOP')) return 'shop';
        const groups = (window.DeliveryReportState || {}).provinceGroups || {};
        return groups[item.Number] || 'nap';
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
                  <th class="num">TỔNG TẤT CẢ</th>
                  <th class="num input-col">BO NHẬN CK</th>
                  <th class="num input-col">ATRƯỜNG NHẬN CK</th>
                  <th class="num input-col">CK TRƯỚC</th>
                  <th class="num">TỔNG CÒN LẠI</th>
                </tr></thead>
                <tbody id="drReportTbody"></tbody>
                <tfoot id="drReportTfoot"></tfoot>
              </table>
            </div>
          </div>
        </div>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tpl.trim();
        document.body.appendChild(wrapper.firstChild);

        // Wire close
        document.getElementById('drReportClose').addEventListener('click', close);
        document.getElementById('drReportModal').addEventListener('click', (e) => {
            if (e.target.id === 'drReportModal') close();
        });
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
                state.activeTab = t.key;
                render();
            });
            tabsEl.appendChild(b);
        });
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

    async function render() {
        // Tab visual state
        document.querySelectorAll('#drReportTabs button').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === state.activeTab);
        });

        const dates = eachDay(state.fromDate, state.toDate);
        const subtitle = dates.length
            ? `${formatDDMMYYYY(state.fromDate)}${
                  state.fromDate === state.toDate ? '' : ` → ${formatDDMMYYYY(state.toDate)}`
              }`
            : 'Chọn khoảng ngày';
        document.getElementById('drReportRangeLabel').textContent = subtitle;

        if (dates.length === 0) {
            document.getElementById('drReportTbody').innerHTML =
                '<tr><td colspan="9" class="dr-report-empty">Chọn khoảng ngày để xem báo cáo</td></tr>';
            document.getElementById('drReportTfoot').innerHTML = '';
            return;
        }

        // Fetch from Render DB (aggregated by date+group, scanned-only)
        const key = rangeKey(state.fromDate, state.toDate);
        const cached = state.fetchCache[key];
        if (!cached || Date.now() - cached.fetchedAt >= 60000) {
            document.getElementById('drReportTbody').innerHTML =
                '<tr><td colspan="9" class="dr-report-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu DB…</td></tr>';
            document.getElementById('drReportTfoot').innerHTML = '';
        }
        const { byDateGroup } = await fetchRange(state.fromDate, state.toDate);
        // Stale guard
        if (rangeKey(state.fromDate, state.toDate) !== key) return;
        state.currentByDateGroup = byDateGroup;

        const map = aggregateByDay(state.activeTab, dates);
        let totals = {
            slDon: 0,
            money: 0,
            shipFee: 0,
            totalAll: 0,
            boCK: 0,
            atruongCK: 0,
            ckTruoc: 0,
            totalLeft: 0,
        };

        const rows = dates.map((d) => {
            const sys = map[d] || { sysCount: 0, money: 0 };
            const ov = getOverride(d, state.activeTab);
            const slDon = ov.slDon != null && ov.slDon !== '' ? Number(ov.slDon) : sys.sysCount;
            const money = sys.money;
            const shipFee = slDon * SHIP_FEE_PER_ORDER;
            const totalAll = money - shipFee;
            const boCK = Number(ov.boCK) || 0;
            const atruongCK = Number(ov.atruongCK) || 0;
            const ckTruoc = Number(ov.ckTruoc) || 0;
            const totalLeft = totalAll - boCK - atruongCK - ckTruoc;

            totals.slDon += slDon;
            totals.money += money;
            totals.shipFee += shipFee;
            totals.totalAll += totalAll;
            totals.boCK += boCK;
            totals.atruongCK += atruongCK;
            totals.ckTruoc += ckTruoc;
            totals.totalLeft += totalLeft;

            const reset =
                ov.slDon != null && ov.slDon !== ''
                    ? `<button class="dr-report-reset" data-date="${d}" data-field="slDon" title="Reset về tự động (${sys.sysCount})">↺</button>`
                    : '';
            const hasImg = !!ov.billImage;
            return `<tr data-date="${d}">
                <td class="date">${formatDDMMYYYY(d)}</td>
                <td class="num"><input type="number" min="0" data-field="slDon" value="${slDon}" />${reset}</td>
                <td class="num clickable money-cell ${hasImg ? 'has-img' : 'no-img'}" data-action="open-img" title="${hasImg ? 'Bấm để xem/sửa ảnh' : 'Bấm để thêm ảnh chứng từ'}">
                    <span class="money-val">${formatMoney(money)}</span>
                    <span class="money-ico">${hasImg ? '<i class="fas fa-image"></i>' : '<i class="far fa-image"></i>'}</span>
                </td>
                <td class="num muted">${formatMoney(shipFee)}</td>
                <td class="num strong">${formatMoney(totalAll)}</td>
                <td class="num"><input type="text" data-field="boCK" value="${boCK ? formatMoney(boCK) : ''}" placeholder="0" /></td>
                <td class="num"><input type="text" data-field="atruongCK" value="${atruongCK ? formatMoney(atruongCK) : ''}" placeholder="0" /></td>
                <td class="num"><input type="text" data-field="ckTruoc" value="${ckTruoc ? formatMoney(ckTruoc) : ''}" placeholder="0" /></td>
                <td class="num strong ${totalLeft < 0 ? 'negative' : 'positive'}">${formatMoney(totalLeft)}</td>
            </tr>`;
        });

        document.getElementById('drReportTbody').innerHTML = rows.join('');

        document.getElementById('drReportTfoot').innerHTML = `<tr class="total-row">
            <th>TỔNG (${dates.length} ngày)</th>
            <th class="num">${formatMoney(totals.slDon)}</th>
            <th class="num">${formatMoney(totals.money)}</th>
            <th class="num muted">${formatMoney(totals.shipFee)}</th>
            <th class="num strong">${formatMoney(totals.totalAll)}</th>
            <th class="num">${formatMoney(totals.boCK)}</th>
            <th class="num">${formatMoney(totals.atruongCK)}</th>
            <th class="num">${formatMoney(totals.ckTruoc)}</th>
            <th class="num strong ${totals.totalLeft < 0 ? 'negative' : 'positive'}">${formatMoney(totals.totalLeft)}</th>
        </tr>`;

        wireRowInputs();
    }

    function wireRowInputs() {
        const tbody = document.getElementById('drReportTbody');
        // Click on TIỀN cell to open image viewer/editor
        tbody.querySelectorAll('td[data-action="open-img"]').forEach((cell) => {
            cell.addEventListener('click', () => {
                const row = cell.closest('tr');
                openImageModal(row.dataset.date);
            });
        });
        tbody.querySelectorAll('input[data-field]').forEach((input) => {
            input.addEventListener('blur', () => {
                const row = input.closest('tr');
                const date = row.dataset.date;
                const field = input.dataset.field;
                const value =
                    field === 'slDon'
                        ? input.value === ''
                            ? ''
                            : Math.max(0, Number(input.value) || 0)
                        : parseMoney(input.value);
                const patch = {};
                patch[field] = value;
                setOverride(date, state.activeTab, patch);
                render();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
            });
        });
        tbody.querySelectorAll('.dr-report-reset').forEach((btn) => {
            btn.addEventListener('click', () => {
                const date = btn.dataset.date;
                const field = btn.dataset.field;
                const patch = {};
                patch[field] = '';
                setOverride(date, state.activeTab, patch);
                render();
            });
        });
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
        subtitle.textContent = `${formatDDMMYYYY(date)} — ${tabLabel}`;

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
        // Seed dates from main filter
        const mainFrom = document.getElementById('drFilterFromDate')?.value;
        const mainTo = document.getElementById('drFilterToDate')?.value;
        const reportFrom = document.getElementById('drReportFrom');
        const reportTo = document.getElementById('drReportTo');
        // Only re-seed if user hasn't yet picked report-specific dates this session
        if (mainFrom && mainTo && (!state.fromDate || !state.toDate)) {
            state.fromDate = mainFrom;
            state.toDate = mainTo;
        }
        if (reportFrom) reportFrom.value = state.fromDate || mainFrom || '';
        if (reportTo) reportTo.value = state.toDate || mainTo || '';
        document.getElementById('drReportModal').classList.add('open');
        document.body.style.overflow = 'hidden';
        render();
    }

    function close() {
        const el = document.getElementById('drReportModal');
        if (el) el.classList.remove('open');
        document.body.style.overflow = '';
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
