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
        // Ưu tiên CAO NHẤT: NV được GÁN (employee_id) — "gán NV thì hiện tên NV gán".
        // display_name do agent tự điền = tên máy, KHÔNG được che tên NV đã gán.
        if (du.employee_id) {
            const e = state.employees.find((x) => String(x.id) === String(du.employee_id));
            if (e) return e.displayName || e.username;
        }
        if (du.display_name) return du.display_name;
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

    // ── Smart cache (IndexedDB) — stale-while-revalidate ─────────────────────
    // Render NGAY từ cache (load tức thì), rồi revalidate ngầm từ server + SSE.
    // Cache theo tháng. Cùng pattern Web2*Cache của Web 2.0.
    const cacheStore =
        global.Web2IdbStore && global.Web2IdbStore.open
            ? global.Web2IdbStore.open('cham_cong_cache')
            : null;

    // Dựng state từ 1 bộ kết quả thô (dùng cho cả cache-hydrate lẫn fetch mới).
    function applyResults(r) {
        state.deviceUsers = r.deviceUsers || [];
        state.employees = r.employees || [];
        const byUD = {};
        for (const rec of r.records || []) {
            byUD[rec.device_user_id] = byUD[rec.device_user_id] || {};
            (byUD[rec.device_user_id][rec.date_key] =
                byUD[rec.device_user_id][rec.date_key] || []).push(rec);
        }
        state.recordsByUserDate = byUD;
        state.fulldaySet = new Set((r.fullday || []).map((x) => x.id));
        state.holidaySet = new Set((r.holidays || []).map((x) => x.date_key));
        const pById = {};
        for (const p of r.payroll || []) pById[p.id] = p;
        state.payrollById = pById;
        state.sync = r.sync || null;
    }

    async function loadAll() {
        const mk = state.monthKey;
        // Chỉ hydrate cache khi load LẠNH / đổi tháng (tháng này CHƯA có trong RAM).
        // Reload nóng (sau mutation/SSE) → KHÔNG hydrate (tránh cache cũ đè thay đổi
        // local vừa sửa, vd vừa gán NV); chỉ revalidate ngầm.
        const sameMonthInMemory = state._loadedMonth === mk;
        let hydrated = false;
        if (cacheStore && !sameMonthInMemory) {
            try {
                const c = await cacheStore.get('m_' + mk);
                if (c && state.monthKey === mk) {
                    applyResults(c);
                    state.loading = false;
                    renderActive();
                    renderSyncStrip();
                    hydrated = true;
                }
            } catch {
                /* ignore cache lỗi */
            }
        }
        if (!hydrated && !sameMonthInMemory) {
            state.loading = true;
            renderActive();
        }
        // 2) Revalidate ngầm từ server.
        const { start, end } = monthRange();
        try {
            const [du, emp, rec, fd, hol, pay, sync] = await Promise.all([
                Api.listDeviceUsers().catch(() => ({ items: [] })),
                Api.listEmployees().catch(() => ({ users: [] })),
                Api.listRecords(start, end).catch(() => ({ items: [] })),
                Api.listFullday().catch(() => ({ items: [] })),
                Api.listHolidays().catch(() => ({ items: [] })),
                Api.getPayroll(mk).catch(() => ({ items: [] })),
                Api.getSyncStatus().catch(() => ({ status: null })),
            ]);
            if (state.monthKey !== mk) return; // user đã đổi tháng giữa chừng
            const results = {
                deviceUsers: du.items || [],
                employees: emp.users || [],
                records: rec.items || [],
                fullday: fd.items || [],
                holidays: hol.items || [],
                payroll: pay.items || [],
                sync: sync.status || null,
            };
            applyResults(results);
            state._loadedMonth = mk;
            if (cacheStore) cacheStore.set('m_' + mk, results).catch(() => {});
        } catch (e) {
            if (!hydrated) toast('Lỗi tải dữ liệu: ' + e.message, 'error');
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
    const SYNC_FRESH_MS = 15 * 60 * 1000; // > 15' không đồng bộ → coi như PC tắt
    function renderSyncStrip() {
        const el = document.getElementById('ccSync');
        if (!el) return;
        const s = state.sync;
        const last = s && s.last_sync_time ? new Date(s.last_sync_time) : null;
        // "Đang kết nối" = agent báo connected VÀ vừa đồng bộ gần đây (tránh stale
        // khi PC chết đột ngột, sync-status còn connected=true cũ).
        const fresh = last && Date.now() - last.getTime() < SYNC_FRESH_MS;
        const active = !!(s && s.connected && fresh);
        const lastTxt = last
            ? new Intl.DateTimeFormat('vi-VN', {
                  timeZone: VN_TZ,
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
              }).format(last)
            : '—';
        el.className = 'cc-sync ' + (active ? 'ok' : 'off');
        el.innerHTML = `
            <span class="cc-sync-dot"></span>
            <span>Máy chấm công: <b>${active ? 'Đang đồng bộ' : 'Chưa đồng bộ'}</b></span>
            <span class="cc-sync-sep">·</span>
            <span>Lần cuối: <b>${esc(lastTxt)}</b></span>
            ${s && s.last_error ? `<span class="cc-sync-err" title="${esc(s.last_error)}">⚠ lỗi</span>` : ''}
            ${
                active
                    ? ''
                    : `<span class="cc-sync-backup">· 🔌 PC đồng bộ đang tắt? Tới shop (cùng wifi) bấm <b>lay-du-lieu.bat</b> để lấy ngay.</span>`
            }
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
        // Chỉ hiện PIN máy ĐÃ gán nhân viên (employee_id) + đang bật. PIN "— Chưa gán —"
        // ở tab Nhân viên sẽ KHÔNG xuất hiện trên Bảng công (tránh rác PIN chưa gán).
        const dus = state.deviceUsers.filter((d) => d.active !== false && d.employee_id);
        if (!dus.length) {
            const hasUnassigned = state.deviceUsers.some(
                (d) => d.active !== false && !d.employee_id
            );
            el.innerHTML = `<div class="cc-empty">
                <p>${hasUnassigned ? 'Chưa có PIN máy nào được gán nhân viên.' : 'Chưa có nhân viên nào từ máy chấm công.'}</p>
                <p class="cc-empty-hint">${
                    hasUnassigned
                        ? 'Vào tab <b>Nhân viên</b> để gán mỗi PIN máy vào 1 nhân viên Web 2.0 — sau khi gán sẽ hiện ở đây.'
                        : 'Chạy agent đồng bộ ở máy shop (<b>install-windows.bat</b> / <b>lay-du-lieu.bat</b>) để nạp dữ liệu từ máy DG-600. Danh sách PIN sẽ tự xuất hiện.'
                }</p>
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
                <span class="cc-d-wd">${wd}</span><span class="cc-d-num">${dnum}</span></th>`;
        }

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
            // Tên + số ngày công (badge) — như mẫu "CÒI 15".
            let cells = `<td class="cc-name" title="PIN ${esc(du.device_user_id)}">
                <span class="cc-name-txt">${esc(empName(du))}</span>
                <span class="cc-name-days" title="Số ngày công">${month.workedDays}</span></td>`;
            for (const dk of days) {
                const r = month.dayResults[dk] || {};
                const isFull = isFulldaySet(du.device_user_id, dk);
                const st = S.dayStatus(r, isFull); // ontime|lateearly|missing|absent
                const wd = weekdayShort(dk);
                cells += `<td class="cc-cell${wd === 'CN' ? ' sun' : ''}" data-uid="${esc(du.device_user_id)}" data-dk="${dk}" title="${S.STATUS_LABEL[st]} — bấm xem chi tiết"><span class="cc-dot cc-dot-${st}"></span></td>`;
            }
            rows += `<tr>${cells}</tr>`;
        }

        el.innerHTML = `
            <div class="cc-grid-wrap">
              <table class="cc-grid cc-grid-dots">
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="cc-legend">
              <span><i class="cc-dot cc-dot-ontime"></i> Đúng giờ</span>
              <span><i class="cc-dot cc-dot-lateearly"></i> Đi muộn / Về sớm</span>
              <span><i class="cc-dot cc-dot-missing"></i> Chấm công thiếu</span>
              <span><i class="cc-dot cc-dot-absent"></i> Nghỉ làm</span>
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
        const cfg = cfgFor(du);
        // Tính kết quả ngày (status + giờ + OT + về sớm).
        const dayData = S.processDay(recordsFor(deviceUserId)[dateKey] || []);
        const day = S.calcDay(dateKey, dayData, cfg, isFull || isHoliday);
        const st = S.dayStatus({ ...day, dayData }, isFull || isHoliday);
        const checkIn = recs[0] || null;
        const checkOut = recs.length > 1 ? recs[recs.length - 1] : null;
        const inHM = checkIn ? S.fmtHM(new Date(checkIn.check_time)) : '';
        const outHM = checkOut ? S.fmtHM(new Date(checkOut.check_time)) : '';
        const otH = Math.floor((day.otMinutes || 0) / 60);
        const otM = (day.otMinutes || 0) % 60;
        const earlyH = Math.floor((day.earlyMinutes || 0) / 60);
        const earlyM = (day.earlyMinutes || 0) % 60;
        const nvCode = 'NV' + String(deviceUserId).padStart(6, '0');
        const leaveMode = isFull ? 'paid' : dayData.status === 'absent' ? 'absent' : 'work';

        const histHtml = recs.length
            ? recs
                  .map(
                      (r) => `<div class="cc-prow">
                        <span class="cc-ptime">${S.fmtHM(new Date(r.check_time))}</span>
                        <span class="cc-ptype">${r.type === 1 ? 'Ra' : r.type === 0 ? 'Vào' : 'T' + r.type}</span>
                        <span class="cc-psrc">${esc(r.source || '')}</span>
                        <button class="cc-pdel" data-id="${esc(r.id)}" title="Xoá lượt chấm">✕</button>
                      </div>`
                  )
                  .join('') +
              `<div class="cc-add-punch">
                  <input type="time" id="ccPunchTime" value="08:00">
                  <select id="ccPunchType"><option value="0">Vào</option><option value="1">Ra</option></select>
                  <button class="cc-btn cc-btn-ghost" id="ccPunchAdd">+ Thêm lượt</button>
                </div>`
            : `<div class="cc-empty-sm">Chưa có lượt chấm công ngày này.</div>
               <div class="cc-add-punch">
                  <input type="time" id="ccPunchTime" value="08:00">
                  <select id="ccPunchType"><option value="0">Vào</option><option value="1">Ra</option></select>
                  <button class="cc-btn cc-btn-ghost" id="ccPunchAdd">+ Thêm lượt</button>
               </div>`;

        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccDayBackdrop">
            <div class="cc-modal cc-modal-detail">
              <div class="cc-modal-head">
                <div class="cc-dh-title">Chấm công</div>
                <button class="cc-x" id="ccDayClose">✕</button>
              </div>
              <div class="cc-modal-body">
                <div class="cc-dh-emp">
                  <b>${esc(empName(du))}</b> <span class="cc-dh-nv">${nvCode}</span>
                  <span class="cc-status-badge cc-sb-${st}">${S.STATUS_LABEL[st]}</span>
                </div>
                <div class="cc-dh-meta">
                  <div><span class="cc-dh-lbl">Thời gian</span><div>${fmtDayHeader(dateKey)}${isHoliday ? ' <span class="cc-pill hol">Shop nghỉ</span>' : ''}</div></div>
                  <div><span class="cc-dh-lbl">Ca làm việc</span><div>CA BÌNH THƯỜNG (${esc(cfg.workStart)} - ${esc(cfg.workEnd)})</div></div>
                </div>

                <div class="cc-detail-tabs">
                  <button class="cc-dt-tab active" data-dt="cc">Chấm công</button>
                  <button class="cc-dt-tab" data-dt="hist">Lịch sử chấm công</button>
                </div>

                <div class="cc-dt-pane" data-pane="cc">
                  <div class="cc-leave-row">
                    <span class="cc-dh-lbl">Chấm công</span>
                    <label class="cc-radio"><input type="radio" name="ccLeave" value="work" ${leaveMode === 'work' ? 'checked' : ''}> Đi làm</label>
                    <label class="cc-radio"><input type="radio" name="ccLeave" value="paid" ${leaveMode === 'paid' ? 'checked' : ''}> Nghỉ có phép</label>
                    <label class="cc-radio"><input type="radio" name="ccLeave" value="absent" ${leaveMode === 'absent' ? 'checked' : ''}> Nghỉ không phép</label>
                  </div>
                  <div class="cc-io-grid" id="ccIoGrid">
                    <label class="cc-io-line"><input type="checkbox" id="ccInChk" ${checkIn ? 'checked' : ''}> Vào
                      <input type="time" id="ccInTime" value="${inHM || '08:00'}"></label>
                    <div class="cc-io-calc">Làm thêm <b>${otH}</b> giờ <b>${otM}</b> phút</div>
                    <label class="cc-io-line"><input type="checkbox" id="ccOutChk" ${checkOut ? 'checked' : ''}> Ra
                      <input type="time" id="ccOutTime" value="${outHM || '20:00'}"></label>
                    <div class="cc-io-calc">Về sớm <b>${earlyH}</b> giờ <b>${earlyM}</b> phút</div>
                  </div>
                </div>

                <div class="cc-dt-pane" data-pane="hist" style="display:none">
                  <div class="cc-prows">${histHtml}</div>
                </div>
              </div>
              <div class="cc-modal-foot">
                <button class="cc-btn cc-btn-danger-link" id="ccDayDelete">🗑 Xoá ngày</button>
                <span class="cc-foot-spacer"></span>
                <button class="cc-btn cc-btn-ghost" id="ccDayCancel">Bỏ qua</button>
                <button class="cc-btn cc-btn-primary" id="ccDaySave">Lưu</button>
              </div>
            </div>
          </div>`;

        const close = () => (mount.innerHTML = '');
        document.getElementById('ccDayClose').onclick = close;
        document.getElementById('ccDayCancel').onclick = close;
        document.getElementById('ccDayBackdrop').onclick = (e) => {
            if (e.target.id === 'ccDayBackdrop') close();
        };
        // tab switch
        mount.querySelectorAll('.cc-dt-tab').forEach((b) => {
            b.onclick = () => {
                mount
                    .querySelectorAll('.cc-dt-tab')
                    .forEach((x) => x.classList.toggle('active', x === b));
                mount.querySelectorAll('.cc-dt-pane').forEach((p) => {
                    p.style.display = p.dataset.pane === b.dataset.dt ? '' : 'none';
                });
            };
        });
        // history: delete + add punch
        mount.querySelectorAll('.cc-pdel').forEach((b) => {
            b.onclick = async () => {
                if (!(await confirmBox('Xoá lượt chấm này?'))) return;
                try {
                    await Api.deleteRecord(b.dataset.id);
                    await loadAll();
                    openDay(deviceUserId, dateKey);
                } catch (e) {
                    toast(e.message, 'error');
                }
            };
        });
        const addBtn = document.getElementById('ccPunchAdd');
        if (addBtn)
            addBtn.onclick = async () => {
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
        // Xoá cả ngày (mọi lượt chấm)
        document.getElementById('ccDayDelete').onclick = async () => {
            if (!recs.length) return toast('Ngày này không có lượt chấm.', 'info');
            if (!(await confirmBox('Xoá TẤT CẢ lượt chấm ngày này?'))) return;
            try {
                for (const r of recs) await Api.deleteRecord(r.id);
                await loadAll();
                close();
            } catch (e) {
                toast(e.message, 'error');
            }
        };
        // Lưu: áp dụng nghỉ phép + chỉnh giờ Vào/Ra
        document.getElementById('ccDaySave').onclick = () =>
            saveDayDetail(deviceUserId, dateKey, { checkIn, checkOut, inHM, outHM, isFull, close });
    }

    // Định dạng "Thứ tư, 10/06/2026" theo GMT+7.
    function fmtDayHeader(dk) {
        const d = new Date(`${dk}T12:00:00+07:00`);
        const wd = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][
            d.getDay()
        ];
        const [y, m, dd] = dk.split('-');
        return `${wd}, ${dd}/${m}/${y}`;
    }

    // Lưu chi tiết 1 ngày: nghỉ phép (fullday) + chỉnh giờ Vào/Ra (xoá punch cũ + thêm mới).
    async function saveDayDetail(deviceUserId, dateKey, ctx) {
        const mount = document.getElementById('ccModalMount');
        const leave = (mount.querySelector('input[name="ccLeave"]:checked') || {}).value || 'work';
        const inChk = document.getElementById('ccInChk')?.checked;
        const outChk = document.getElementById('ccOutChk')?.checked;
        const inTime = document.getElementById('ccInTime')?.value;
        const outTime = document.getElementById('ccOutTime')?.value;
        try {
            // 1) Nghỉ có phép = công đủ override; ngược lại bỏ override.
            if (leave === 'paid') await Api.addFullday(deviceUserId, dateKey);
            else if (ctx.isFull) await Api.delFullday(`${deviceUserId}_${dateKey}`);

            // 2) Nghỉ không phép → xoá hết lượt chấm (coi như vắng).
            if (leave === 'absent') {
                const recs = recordsFor(deviceUserId)[dateKey] || [];
                for (const r of recs) await Api.deleteRecord(r.id);
            } else {
                // 3) Chỉnh giờ Vào (đi làm / nghỉ có phép vẫn cho sửa nếu cần).
                if (inChk && inTime && inTime !== ctx.inHM) {
                    if (ctx.checkIn) await Api.deleteRecord(ctx.checkIn.id);
                    await Api.addRecord({
                        device_user_id: deviceUserId,
                        check_time: `${dateKey} ${inTime}:00`,
                        type: 0,
                    });
                } else if (!inChk && ctx.checkIn) {
                    await Api.deleteRecord(ctx.checkIn.id);
                }
                // 4) Chỉnh giờ Ra.
                if (outChk && outTime && outTime !== ctx.outHM) {
                    if (ctx.checkOut) await Api.deleteRecord(ctx.checkOut.id);
                    await Api.addRecord({
                        device_user_id: deviceUserId,
                        check_time: `${dateKey} ${outTime}:00`,
                        type: 1,
                    });
                } else if (!outChk && ctx.checkOut) {
                    await Api.deleteRecord(ctx.checkOut.id);
                }
            }
            toast('Đã lưu chấm công ngày.', 'success');
            ctx.close();
            await loadAll();
        } catch (e) {
            toast(e.message, 'error');
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
