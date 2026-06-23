// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Chấm công: app core (state + bảng công + import + sync).
// =====================================================================
// Điều phối trang Chấm công. Tabs: Bảng công | Bảng lương | Nhân viên.
// State dùng chung qua window.ChamCong cho cham-cong-payroll.js + employees.js.
// SSE web2:attendance → reload. Múi giờ GMT+7.
// =====================================================================

(function (global) {
    'use strict';

    const Api = global.ChamCongApi;
    const S = global.ChamCongSalary;
    const VN_TZ = 'Asia/Ho_Chi_Minh';

    function toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[cham-cong]', type || 'info', msg);
    }
    async function confirmBox(msg) {
        if (global.Popup?.confirm) return await global.Popup.confirm(msg);
        return global.confirm(msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function curMonthKey() {
        const p = new Intl.DateTimeFormat('en-CA', {
            timeZone: VN_TZ,
            year: 'numeric',
            month: '2-digit',
        }).format(new Date());
        return p.slice(0, 7); // 'YYYY-MM'
    }

    const state = {
        monthKey: curMonthKey(),
        tab: 'timesheet',
        deviceUsers: [],
        employees: [],
        recordsByUserDate: {}, // { deviceUserId: { dateKey: [rec] } }
        fulldaySet: new Set(), // '{empId}_{dateKey}'
        holidaySet: new Set(), // 'dateKey'
        payrollById: {}, // '{empId}_{monthKey}' → row
        sync: null,
        loading: false,
    };

    // ── Helpers chia sẻ ────────────────────────────────────────────────────
    function cfgFor(du) {
        return {
            dailyRate: Number(du.daily_rate) || 0,
            workStart: du.work_start || '08:00',
            workEnd: du.work_end || '20:00',
            latePenaltyPerMin: Number(du.late_penalty_per_min) || 0,
            otMultiplier: Number(du.ot_multiplier) || 1,
        };
    }
    function empName(du) {
        if (du.display_name) return du.display_name;
        if (du.employee_id) {
            const e = state.employees.find((x) => String(x.id) === String(du.employee_id));
            if (e) return e.displayName || e.username;
        }
        return du.name || du.device_user_id;
    }
    function recordsFor(deviceUserId) {
        return state.recordsByUserDate[deviceUserId] || {};
    }
    function isFulldaySet(empId, dateKey) {
        return state.fulldaySet.has(`${empId}_${dateKey}`) || state.holidaySet.has(dateKey);
    }
    function payrollFor(empId) {
        return state.payrollById[`${empId}_${state.monthKey}`] || null;
    }
    function monthRange() {
        const days = S.daysOfMonth(state.monthKey);
        return { start: days[0], end: days[days.length - 1], days };
    }

    // ── Data load ──────────────────────────────────────────────────────────
    async function loadAll() {
        state.loading = true;
        renderActive();
        const { start, end } = monthRange();
        try {
            const [du, emp, rec, fd, hol, pay, sync] = await Promise.all([
                Api.listDeviceUsers().catch(() => ({ items: [] })),
                Api.listEmployees().catch(() => ({ users: [] })),
                Api.listRecords(start, end).catch(() => ({ items: [] })),
                Api.listFullday().catch(() => ({ items: [] })),
                Api.listHolidays().catch(() => ({ items: [] })),
                Api.getPayroll(state.monthKey).catch(() => ({ items: [] })),
                Api.getSyncStatus().catch(() => ({ status: null })),
            ]);
            state.deviceUsers = du.items || [];
            state.employees = emp.users || [];
            // group records
            const byUD = {};
            for (const r of rec.items || []) {
                byUD[r.device_user_id] = byUD[r.device_user_id] || {};
                (byUD[r.device_user_id][r.date_key] =
                    byUD[r.device_user_id][r.date_key] || []).push(r);
            }
            state.recordsByUserDate = byUD;
            state.fulldaySet = new Set((fd.items || []).map((x) => x.id));
            state.holidaySet = new Set((hol.items || []).map((x) => x.date_key));
            const pById = {};
            for (const p of pay.items || []) pById[p.id] = p;
            state.payrollById = pById;
            state.sync = sync.status || null;
        } catch (e) {
            toast('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
        state.loading = false;
        renderActive();
        renderSyncStrip();
    }

    // ── Tab switching ────────────────────────────────────────────────────────
    function setTab(tab) {
        state.tab = tab;
        document.querySelectorAll('.cc-tab').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        renderActive();
    }
    function renderActive() {
        if (state.tab === 'timesheet') renderTimesheet();
        else if (state.tab === 'payroll' && global.ChamCongPayroll) global.ChamCongPayroll.render();
        else if (state.tab === 'employees' && global.ChamCongEmployees)
            global.ChamCongEmployees.render();
    }

    // ── Sync strip ───────────────────────────────────────────────────────────
    function renderSyncStrip() {
        const el = document.getElementById('ccSync');
        if (!el) return;
        const s = state.sync;
        const connected = s && s.connected;
        const last = s && s.last_sync_time ? new Date(s.last_sync_time) : null;
        const lastTxt = last
            ? new Intl.DateTimeFormat('vi-VN', {
                  timeZone: VN_TZ,
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
              }).format(last)
            : '—';
        el.className = 'cc-sync ' + (connected ? 'ok' : 'off');
        el.innerHTML = `
            <span class="cc-sync-dot"></span>
            <span>Máy chấm công: <b>${connected ? 'Đang kết nối' : 'Chưa kết nối'}</b></span>
            <span class="cc-sync-sep">·</span>
            <span>Đồng bộ gần nhất: <b>${esc(lastTxt)}</b></span>
            ${s && s.last_error ? `<span class="cc-sync-err" title="${esc(s.last_error)}">⚠ lỗi</span>` : ''}
        `;
    }

    // ── Timesheet (bảng công) ─────────────────────────────────────────────────
    function weekdayShort(dateKey) {
        const d = new Date(`${dateKey}T12:00:00+07:00`);
        return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    }
    function renderTimesheet() {
        const el = document.getElementById('ccBody');
        if (!el) return;
        if (state.loading) {
            el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            return;
        }
        const dus = state.deviceUsers.filter((d) => d.active !== false);
        if (!dus.length) {
            el.innerHTML = `<div class="cc-empty">
                <p>Chưa có nhân viên nào từ máy chấm công.</p>
                <p class="cc-empty-hint">Bật agent đồng bộ máy DG-600, dùng ADMS push, hoặc bấm <b>Nhập Excel/TXT</b> để nạp dữ liệu.</p>
            </div>`;
            return;
        }
        const { days } = monthRange();
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());

        let head = `<th class="cc-th-name">Nhân viên</th>`;
        for (const dk of days) {
            const dnum = dk.slice(8);
            const wd = weekdayShort(dk);
            const isSun = wd === 'CN';
            const isToday = dk === today;
            head += `<th class="cc-th-day${isSun ? ' sun' : ''}${isToday ? ' today' : ''}">
                <span class="cc-d-num">${dnum}</span><span class="cc-d-wd">${wd}</span></th>`;
        }
        head += `<th class="cc-th-sum">Công</th>`;

        let rows = '';
        for (const du of dus) {
            const cfg = cfgFor(du);
            const recs = recordsFor(du.device_user_id);
            const month = S.calcMonth(
                state.monthKey,
                recs,
                cfg,
                payrollFor(du.device_user_id),
                new Set(
                    [...state.fulldaySet]
                        .filter((k) => k.startsWith(du.device_user_id + '_'))
                        .map((k) => k.slice(du.device_user_id.length + 1))
                ),
                state.holidaySet
            );
            let cells = `<td class="cc-name" title="${esc(du.device_user_id)}">${esc(empName(du))}</td>`;
            for (const dk of days) {
                const r = month.dayResults[dk] || {};
                const dd = r.dayData || {};
                const isFull = isFulldaySet(du.device_user_id, dk);
                let cls = 'cc-cell';
                let inner = '';
                if (isFull && (!dd || dd.status === 'absent')) {
                    cls += ' full';
                    inner = '<span class="cc-full">Đủ</span>';
                } else if (dd.status === 'present' || dd.status === 'incomplete') {
                    cls += dd.status === 'incomplete' ? ' incomplete' : ' present';
                    if (r.lateMinutes) cls += ' late';
                    if (r.otPay) cls += ' ot';
                    inner = `<span class="cc-io">${S.fmtHM(dd.checkIn)}${dd.checkOut && dd.count > 1 ? '<br>' + S.fmtHM(dd.checkOut) : ''}</span>`;
                    if (r.lateMinutes)
                        inner += `<span class="cc-badge late">−${r.lateMinutes}'</span>`;
                    if (r.otPay)
                        inner += `<span class="cc-badge ot">OT${Math.round(r.otMinutes / 6) / 10}h</span>`;
                }
                const wd = weekdayShort(dk);
                cells += `<td class="${cls}${wd === 'CN' ? ' sun' : ''}" data-uid="${esc(du.device_user_id)}" data-dk="${dk}" title="Bấm xem/sửa">${inner}</td>`;
            }
            cells += `<td class="cc-sum">${month.workedDays}</td>`;
            rows += `<tr>${cells}</tr>`;
        }

        el.innerHTML = `
            <div class="cc-grid-wrap">
              <table class="cc-grid">
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="cc-legend">
              <span><i class="lg present"></i> Có công</span>
              <span><i class="lg late"></i> Đi muộn</span>
              <span><i class="lg ot"></i> Tăng ca</span>
              <span><i class="lg incomplete"></i> Thiếu giờ ra</span>
              <span><i class="lg full"></i> Công đủ (override)</span>
            </div>`;

        el.querySelectorAll('.cc-cell').forEach((c) => {
            c.addEventListener('click', () => openDay(c.dataset.uid, c.dataset.dk));
        });
    }

    // ── Day detail popup (xem punch + công đủ + thêm/xoá tay) ─────────────────
    function openDay(deviceUserId, dateKey) {
        const du = state.deviceUsers.find((d) => d.device_user_id === deviceUserId);
        if (!du) return;
        const recs = (recordsFor(deviceUserId)[dateKey] || [])
            .slice()
            .sort((a, b) => new Date(a.check_time) - new Date(b.check_time));
        const isFull = state.fulldaySet.has(`${deviceUserId}_${dateKey}`);
        const isHoliday = state.holidaySet.has(dateKey);
        const mount = document.getElementById('ccModalMount');
        const rowsHtml = recs.length
            ? recs
                  .map(
                      (r) => `<div class="cc-prow">
                        <span class="cc-ptime">${S.fmtHM(new Date(r.check_time))}</span>
                        <span class="cc-ptype">${r.type === 1 ? 'Ra' : r.type === 0 ? 'Vào' : 'T' + r.type}</span>
                        <span class="cc-psrc">${esc(r.source || '')}</span>
                        <button class="cc-pdel" data-id="${esc(r.id)}" title="Xoá punch">✕</button>
                      </div>`
                  )
                  .join('')
            : '<div class="cc-empty-sm">Chưa có punch ngày này.</div>';
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccDayBackdrop">
            <div class="cc-modal">
              <div class="cc-modal-head">
                <div><b>${esc(empName(du))}</b> · ${esc(dateKey)} ${isHoliday ? '<span class="cc-pill hol">Shop nghỉ</span>' : ''}</div>
                <button class="cc-x" id="ccDayClose">✕</button>
              </div>
              <div class="cc-modal-body">
                <div class="cc-prows">${rowsHtml}</div>
                <div class="cc-add-punch">
                  <input type="time" id="ccPunchTime" value="08:00">
                  <select id="ccPunchType"><option value="0">Vào</option><option value="1">Ra</option></select>
                  <button class="cc-btn cc-btn-ghost" id="ccPunchAdd">+ Thêm punch tay</button>
                </div>
                <label class="cc-check"><input type="checkbox" id="ccFullday" ${isFull ? 'checked' : ''}> Đánh dấu <b>công đủ</b> ngày này (override máy)</label>
              </div>
            </div>
          </div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ccDayClose').onclick = close;
        document.getElementById('ccDayBackdrop').onclick = (e) => {
            if (e.target.id === 'ccDayBackdrop') close();
        };
        mount.querySelectorAll('.cc-pdel').forEach((b) => {
            b.onclick = async () => {
                if (!(await confirmBox('Xoá punch này?'))) return;
                try {
                    await Api.deleteRecord(b.dataset.id);
                    await loadAll();
                    openDay(deviceUserId, dateKey);
                } catch (e) {
                    toast(e.message, 'error');
                }
            };
        });
        document.getElementById('ccPunchAdd').onclick = async () => {
            const t = document.getElementById('ccPunchTime').value;
            const type = Number(document.getElementById('ccPunchType').value);
            if (!t) return;
            try {
                await Api.addRecord({
                    device_user_id: deviceUserId,
                    check_time: `${dateKey} ${t}:00`,
                    type,
                });
                await loadAll();
                openDay(deviceUserId, dateKey);
            } catch (e) {
                toast(e.message, 'error');
            }
        };
        document.getElementById('ccFullday').onchange = async (e) => {
            try {
                if (e.target.checked) await Api.addFullday(deviceUserId, dateKey);
                else await Api.delFullday(`${deviceUserId}_${dateKey}`);
                await loadAll();
            } catch (err) {
                toast(err.message, 'error');
            }
        };
    }

    // ── Import Excel/TXT ──────────────────────────────────────────────────────
    function lazyXlsx() {
        return new Promise((resolve, reject) => {
            if (global.XLSX) return resolve(global.XLSX);
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = () => resolve(global.XLSX);
            s.onerror = () => reject(new Error('Không tải được thư viện Excel'));
            document.head.appendChild(s);
        });
    }
    // Map 1 hàng (mảng cell) → punch. Tự dò cột PIN / thời gian / loại.
    function rowToPunch(cells) {
        if (!cells || !cells.length) return null;
        // Tìm cột thời gian (có dạng ngày-giờ).
        let pin = null;
        let time = null;
        let type = 0;
        for (const c of cells) {
            const s = String(c == null ? '' : c).trim();
            if (!s) continue;
            if (time == null && /\d{4}[-/]\d{1,2}[-/]\d{1,2}.*\d{1,2}:\d{2}/.test(s)) {
                time = s.replace(/\//g, '-');
                continue;
            }
            if (pin == null && /^\d{1,8}$/.test(s)) {
                pin = s;
                continue;
            }
        }
        if (!pin || !time) return null;
        return { device_user_id: pin, check_time: time, type };
    }
    async function importFile(file) {
        try {
            const name = (file.name || '').toLowerCase();
            let rows = [];
            if (name.endsWith('.txt') || name.endsWith('.dat') || name.endsWith('.csv')) {
                const text = await file.text();
                rows = text
                    .split(/\r?\n/)
                    .filter((l) => l.trim())
                    .map((l) => rowToPunch(l.split(/\t|,|;/)))
                    .filter(Boolean);
            } else {
                const XLSX = await lazyXlsx();
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
                rows = aoa.map(rowToPunch).filter(Boolean);
            }
            if (!rows.length) {
                toast('Không tìm thấy dòng chấm công hợp lệ (cần cột PIN + thời gian).', 'warning');
                return;
            }
            const r = await Api.importRecords(rows);
            toast(`Đã nhập ${r.inserted}/${r.total} punch.`, 'success');
            await loadAll();
        } catch (e) {
            toast('Lỗi nhập file: ' + e.message, 'error');
        }
    }

    // ── Month nav ────────────────────────────────────────────────────────────
    function shiftMonth(delta) {
        const [y, m] = state.monthKey.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        state.monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const inp = document.getElementById('ccMonth');
        if (inp) inp.value = state.monthKey;
        loadAll();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        if (global.Web2Sidebar?.mount)
            global.Web2Sidebar.mount('#web2Aside', { activeUrl: global.location.href });

        // Admin guard — server cũng chặn (requireWeb2Admin) nhưng hiện thông báo
        // gọn cho NV vào nhầm URL (guardPage đã redirect nếu chưa đăng nhập).
        const stored = global.Web2Auth?.getStored?.();
        if (stored?.user && String(stored.user.role || '').toLowerCase() !== 'admin') {
            const body = document.getElementById('ccBody');
            if (body)
                body.innerHTML = `<div class="cc-empty"><p>Trang <b>Chấm công</b> chỉ dành cho <b>Quản trị viên</b>.</p></div>`;
            document.querySelector('.cc-tabs')?.style.setProperty('display', 'none');
            document.querySelector('.cc-head-actions')?.style.setProperty('display', 'none');
            document.querySelector('.cc-sync')?.style.setProperty('display', 'none');
            if (global.lucide) global.lucide.createIcons();
            return;
        }

        document.querySelectorAll('.cc-tab').forEach((b) => {
            b.addEventListener('click', () => setTab(b.dataset.tab));
        });
        const monthInp = document.getElementById('ccMonth');
        if (monthInp) {
            monthInp.value = state.monthKey;
            monthInp.addEventListener('change', () => {
                if (/^\d{4}-\d{2}$/.test(monthInp.value)) {
                    state.monthKey = monthInp.value;
                    loadAll();
                }
            });
        }
        document.getElementById('ccPrev')?.addEventListener('click', () => shiftMonth(-1));
        document.getElementById('ccNext')?.addEventListener('click', () => shiftMonth(1));
        document.getElementById('ccReload')?.addEventListener('click', loadAll);
        document.getElementById('ccSyncBtn')?.addEventListener('click', async () => {
            try {
                await Api.queueCommand('sync_now');
                toast('Đã gửi lệnh đồng bộ tới máy. Đợi agent xử lý…', 'info');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
        const fileInp = document.getElementById('ccFile');
        document.getElementById('ccImport')?.addEventListener('click', () => fileInp?.click());
        fileInp?.addEventListener('change', () => {
            if (fileInp.files[0]) importFile(fileInp.files[0]);
            fileInp.value = '';
        });

        if (global.lucide) global.lucide.createIcons();

        loadAll();
        if (global.Web2SSE?.subscribe) {
            let t = null;
            global.Web2SSE.subscribe('web2:attendance', () => {
                clearTimeout(t);
                t = setTimeout(loadAll, 600);
            });
        }
    }

    // Export state + helpers cho payroll.js + employees.js.
    global.ChamCong = {
        state,
        cfgFor,
        empName,
        recordsFor,
        payrollFor,
        monthRange,
        loadAll,
        toast,
        confirmBox,
        esc,
        Api,
        S,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
