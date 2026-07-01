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
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
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
        dayNotes: {}, // '{deviceUserId}_{dateKey}' → note
        edits: {}, // '{deviceUserId}_{dateKey}' → { by, at } (audit chỉnh sửa tay)
        fulldaySet: new Set(), // '{empId}_{dateKey}'
        holidaySet: new Set(), // 'dateKey'
        payrollById: {}, // '{empId}_{monthKey}' → row
        sync: null,
        lock: null, // chốt lương kỳ: lock row của tháng hiện tại (null = chưa khoá)
        loading: false,
        empDirty: false, // tab Nhân viên đang sửa dở → KHÔNG cho reload nền đè (mất chỉnh sửa)
    };

    // ── Helpers chia sẻ ────────────────────────────────────────────────────
    function cfgFor(du) {
        return {
            dailyRate: Number(du.daily_rate) || 0,
            workStart: du.work_start || '08:00',
            workEnd: du.work_end || '20:00',
            latePenaltyPerMin: Number(du.late_penalty_per_min) || 0,
            otMultiplier: Number(du.ot_multiplier) || 1,
            salaryType: du.salary_type === 'monthly' ? 'monthly' : 'daily',
            graceMinutes: du.grace_minutes != null ? Number(du.grace_minutes) : 6,
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
    function isManualEmp(du) {
        return String(du.device_user_id || '').startsWith('MANUAL-');
    }
    // Hiện trên BẢNG LƯƠNG: NV đã gán (employee_id) HOẶC NV thủ công (admin tạo, lương
    // tháng — vẫn cần trả lương dù không chấm máy). PIN máy chưa gán = rác → ẩn.
    function isVisibleEmp(du) {
        return !!du.employee_id || isManualEmp(du);
    }
    // CẦN CHẤM CÔNG (Bảng công / Hôm nay / đối soát): CHỈ NV đã GÁN user (employee_id).
    // "Không gán user thì không cần chấm công" — NV thủ công lương tháng / PIN chưa gán
    // KHÔNG bấm máy → không hiện ở chấm công (vẫn ở tab Nhân viên để gán + ở Bảng lương).
    function needsAttendance(du) {
        return !!du.employee_id;
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
    // date_key MỚI NHẤT trong records đã tải (tháng đang xem). Dùng để phân biệt
    // "máy kết nối" (heartbeat) với "có chấm công MỚI" — máy có thể ping mà không đẩy data.
    function latestRecordDateKey() {
        let max = null;
        for (const uid in state.recordsByUserDate) {
            for (const dk in state.recordsByUserDate[uid]) if (!max || dk > max) max = dk;
        }
        return max;
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
        const notes = {};
        for (const n of r.dayNotes || [])
            notes[n.id || `${n.device_user_id}_${n.date_key}`] = n.note;
        state.dayNotes = notes;
        const edits = {};
        for (const e of r.edits || [])
            edits[e.id || `${e.device_user_id}_${e.date_key}`] = {
                by: e.edited_by || '',
                at: Number(e.edited_at) || 0,
            };
        state.edits = edits;
        state.fulldaySet = new Set((r.fullday || []).map((x) => x.id));
        state.holidaySet = new Set((r.holidays || []).map((x) => x.date_key));
        const pById = {};
        for (const p of r.payroll || []) pById[p.id] = p;
        state.payrollById = pById;
        state.sync = r.sync || null;
        state.lock = r.lock || null; // chốt lương kỳ (null = chưa khoá tháng này)
    }

    // Chỉ làm tươi dải trạng thái máy (KHÔNG reload bảng) — dùng cho heartbeat ADMS
    // (~10s) để giữ "Đang đồng bộ" mà không re-render bảng (tránh mất chỉnh sửa đang gõ).
    let _syncOnlyAt = 0;
    async function refreshSyncOnly() {
        const t = Date.now();
        if (t - _syncOnlyAt < 20000) return; // throttle: tối đa 1 lần/20s
        _syncOnlyAt = t;
        try {
            const s = await Api.getSyncStatus().catch(() => null);
            if (s && s.status) {
                state.sync = s.status;
                renderSyncStrip();
            }
        } catch {
            /* ignore */
        }
    }

    async function loadAll(force) {
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
                    renderActive(force);
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
            const [du, emp, rec, note, ed, fd, hol, pay, sync, lk] = await Promise.all([
                Api.listDeviceUsers().catch(() => ({ items: [] })),
                Api.listEmployees().catch(() => ({ users: [] })),
                Api.listRecords(start, end).catch(() => ({ items: [] })),
                Api.listDayNotes(start, end).catch(() => ({ items: [] })),
                Api.listEdits(start, end).catch(() => ({ items: [] })),
                Api.listFullday().catch(() => ({ items: [] })),
                Api.listHolidays().catch(() => ({ items: [] })),
                Api.getPayroll(mk).catch(() => ({ items: [] })),
                Api.getSyncStatus().catch(() => ({ status: null })),
                Api.getPeriodLock(mk).catch(() => ({ lock: null })),
            ]);
            if (state.monthKey !== mk) return; // user đã đổi tháng giữa chừng
            const results = {
                deviceUsers: du.items || [],
                employees: emp.users || [],
                records: rec.items || [],
                dayNotes: note.items || [],
                edits: ed.items || [],
                fullday: fd.items || [],
                holidays: hol.items || [],
                payroll: pay.items || [],
                sync: sync.status || null,
                lock: lk.lock || null,
            };
            applyResults(results);
            state._loadedMonth = mk;
            if (cacheStore) cacheStore.set('m_' + mk, results).catch(() => {});
        } catch (e) {
            if (!hydrated) toast('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
        state.loading = false;
        renderActive(force);
        renderSyncStrip();
    }

    // ── Tab switching ────────────────────────────────────────────────────────
    function setTab(tab) {
        state.tab = tab;
        state.empDirty = false; // chuyển tab = bỏ trạng thái sửa dở của tab Nhân viên
        document.querySelectorAll('.cc-tab').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        renderActive(true); // chuyển tab = render chủ động (fresh)
    }
    // force=true → render chủ động (chuyển tab / bấm Tải lại / đổi tháng): luôn dựng lại.
    // force=false → reload nền (SSE/mutation): tab Nhân viên đang sửa dở sẽ GIỮ nguyên.
    function renderActive(force) {
        if (state.tab === 'timesheet') renderTimesheet();
        else if (state.tab === 'payroll' && global.ChamCongPayroll) global.ChamCongPayroll.render();
        else if (state.tab === 'employees' && global.ChamCongEmployees)
            global.ChamCongEmployees.render({ force: !!force });
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
                  hour12: false,
                  day: '2-digit',
                  month: '2-digit',
              }).format(last)
            : '—';
        // ── DATA freshness (KHÁC connection freshness) ──────────────────────
        // "Lần cuối" = heartbeat máy (ping ADMS ~10s → connected=true dù KHÔNG có punch
        // mới). Tách riêng "Dữ liệu mới nhất" = date_key bản ghi mới nhất → bắt được case
        // máy ONLINE nhưng KHÔNG đẩy chấm công (vd thu dữ liệu chết giữa ngày).
        const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());
        const latestDk = latestRecordDateKey();
        const viewingCurMonth = state.monthKey === todayKey.slice(0, 7);
        const staleDays =
            viewingCurMonth && latestDk
                ? Math.round(
                      (new Date(todayKey + 'T00:00:00+07:00') -
                          new Date(latestDk + 'T00:00:00+07:00')) /
                          86400000
                  )
                : 0;
        const dataStale = staleDays >= 2; // ≥2 ngày không có chấm công mới → cảnh báo
        const latestTxt = latestDk ? `${latestDk.slice(8)}/${latestDk.slice(5, 7)}` : '—';
        el.className = 'cc-sync ' + (active && !dataStale ? 'ok' : 'off');
        el.innerHTML = `
            <span class="cc-sync-dot"></span>
            <span>Máy chấm công: <b>${active ? 'Đang kết nối' : 'Chưa kết nối'}</b></span>
            <span class="cc-sync-sep">·</span>
            <span>Lần cuối: <b>${esc(lastTxt)}</b></span>
            ${
                viewingCurMonth
                    ? `<span class="cc-sync-sep">·</span><span>Dữ liệu mới nhất: <b class="${dataStale ? 'cc-sync-stale' : ''}">${esc(latestTxt)}</b></span>`
                    : ''
            }
            ${s && s.last_error ? `<span class="cc-sync-err" title="${esc(s.last_error)}">⚠ lỗi</span>` : ''}
            ${
                dataStale
                    ? `<span class="cc-sync-backup">· ⚠ Máy <b>kết nối</b> nhưng KHÔNG có chấm công mới <b>${staleDays} ngày</b> (mới nhất ${esc(latestTxt)}). Kiểm tra: máy <b>DG-600</b> còn ghi nhận / đủ bộ nhớ + <b>agent Chấm công</b> trên máy POS còn chạy (cài lại ở <b>Cấu hình in → Cài máy chấm công DG-600</b>).</span>`
                    : active
                      ? ''
                      : `<span class="cc-sync-backup">· 🔌 PC đồng bộ đang tắt? Mở lại máy POS ở shop (agent Chấm công tự chạy nền), hoặc cài lại ở <b>Cấu hình in → Cài máy chấm công DG-600</b>.</span>`
            }
        `;
    }

    // ── Timesheet (bảng công) ─────────────────────────────────────────────────
    function weekdayShort(dateKey) {
        const d = new Date(`${dateKey}T12:00:00+07:00`);
        return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    }

    // Widget "Hôm nay" (chỉ khi xem THÁNG hiện tại): ai chưa vào / quên bấm ra / vắng.
    // Tính theo giờ GMT+7 hiện tại + cấu hình ca từng NV. Frontend thuần từ records.
    function renderTodayHtml() {
        const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());
        if (todayKey.slice(0, 7) !== state.monthKey) return ''; // không phải tháng hiện tại
        const nowHM = new Intl.DateTimeFormat('en-GB', {
            timeZone: VN_TZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date());
        const [nh, nm] = nowHM.split(':').map(Number);
        const nowMin = nh * 60 + nm;
        const dus = state.deviceUsers.filter((d) => d.active !== false && needsAttendance(d));
        const chuaVao = [];
        const quenRa = [];
        const vang = [];
        let dangLam = 0;
        let daDu = 0;
        for (const du of dus) {
            const cfg = cfgFor(du);
            const startMin = S.hmToMinutes(cfg.workStart);
            const endMin = S.hmToMinutes(cfg.workEnd);
            const grace = cfg.graceMinutes || 6;
            const recs = recordsFor(du.device_user_id)[todayKey] || [];
            const name = empName(du);
            if (isFulldaySet(du.device_user_id, todayKey)) {
                daDu++;
                continue; // nghỉ có phép / shop nghỉ → bỏ qua
            }
            if (recs.length === 0) {
                if (nowMin > endMin) vang.push(name);
                else if (nowMin > startMin + grace) chuaVao.push(name);
                // chưa tới giờ vào → bỏ qua
            } else if (recs.length === 1) {
                // 1 lượt: chỉ tính "quên bấm ra" SAU giờ tan ca + dung sai (vd 20:05).
                // Trước đó = đang làm (sẽ bấm ra cuối ca).
                if (nowMin > endMin + grace) quenRa.push(name);
                else dangLam++;
            } else {
                daDu++;
            }
        }
        const need = chuaVao.length + quenRa.length + vang.length;
        const chip = (n, label, color) =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${color}1a;color:${color}">${n} ${label}</span>`;
        const listLine = (arr, label, color) =>
            arr.length
                ? `<div style="font-size:12px;color:#475569;margin-top:3px"><b style="color:${color}">${label}:</b> ${arr.map(esc).join(', ')}</div>`
                : '';
        return `<div class="cc-today" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <b style="font-size:13px">📅 Hôm nay (${todayKey.slice(8)}/${todayKey.slice(5, 7)}, ${nowHM})</b>
              ${chip(daDu, 'đủ', '#16a34a')}
              ${chip(dangLam, 'đang làm', '#0068ff')}
              ${chip(chuaVao.length, 'chưa vào', '#d97706')}
              ${chip(quenRa.length, 'quên bấm ra', '#dc2626')}
              ${chip(vang.length, 'vắng', '#dc2626')}
              ${need === 0 ? '<span style="font-size:12px;color:#16a34a">✓ ổn</span>' : ''}
            </div>
            ${listLine(chuaVao, '⏰ Chưa vào', '#d97706')}
            ${listLine(quenRa, '🚪 Quên bấm ra', '#dc2626')}
            ${listLine(vang, '✗ Vắng', '#dc2626')}
          </div>`;
    }
    function renderTimesheet() {
        const el = document.getElementById('ccBody');
        if (!el) return;
        if (state.loading) {
            // First-load only (state.loading chỉ bật khi load lạnh / đổi tháng, KHÔNG bật
            // khi reload nền SSE/mutation) → skeleton không flash đè dữ liệu sẵn có.
            if (window.Web2Skeleton) {
                const dayCols = monthRange().days.length;
                window.Web2Skeleton.table(el, { rows: 8, cols: 1 + dayCols });
            } else {
                el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            }
            return;
        }
        // Hiện PIN ĐÃ gán NV hoặc NV thủ công + đang bật. PIN máy "— Chưa gán —"
        // KHÔNG xuất hiện trên Bảng công (tránh rác PIN chưa gán).
        const dus = state.deviceUsers.filter((d) => d.active !== false && needsAttendance(d));
        if (!dus.length) {
            const hasUnassigned = state.deviceUsers.some(
                (d) => d.active !== false && !needsAttendance(d)
            );
            el.innerHTML = `<div class="cc-empty">
                <p>${hasUnassigned ? 'Chưa có PIN máy nào được gán nhân viên.' : 'Chưa có nhân viên nào từ máy chấm công.'}</p>
                <p class="cc-empty-hint">${
                    hasUnassigned
                        ? 'Vào tab <b>Nhân viên</b> để gán mỗi PIN máy vào 1 nhân viên Web 2.0 — sau khi gán sẽ hiện ở đây.'
                        : 'Cài <b>agent Chấm công</b> 1 lần ở máy POS shop: vào <b>Cấu hình in → Cài máy chấm công DG-600</b> → bấm <b>Tải file cài Chấm công (.bat)</b> → chạy 1 lần (tự chạy nền). Máy DG-600 đẩy dữ liệu lên, danh sách PIN tự xuất hiện.'
                }</p>
            </div>`;
            return;
        }
        const { days } = monthRange();
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());
        // Phút trong ngày hiện tại (GMT+7) — để biết HÔM NAY đã qua giờ tan ca chưa.
        const nowP = new Intl.DateTimeFormat('en-GB', {
            timeZone: VN_TZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
            .format(new Date())
            .split(':')
            .map(Number);
        const nowMin = nowP[0] * 60 + nowP[1];

        let head = `<th class="cc-th-name">Nhân viên</th>`;
        for (const dk of days) {
            const dnum = dk.slice(8);
            const wd = weekdayShort(dk);
            const isSun = wd === 'CN';
            const isToday = dk === today;
            head += `<th class="cc-th-day${isSun ? ' sun' : ''}${isToday ? ' today' : ''}">
                <span class="cc-d-wd">${wd}</span><span class="cc-d-num">${dnum}</span></th>`;
        }

        // Glyph trong chấm (a11y WCAG 1.4.1 — KHÔNG chỉ phân biệt bằng màu).
        const GLYPH = { ontime: '✓', lateearly: '!', missing: '?', absent: '', inprogress: '•' };
        let rows = '';
        const needFix = []; // ngày chấm THIẾU (quên 1 lượt) cả tháng → hàng đợi đối soát.
        for (const du of dus) {
            const cfg = cfgFor(du);
            // Mốc "đã qua giờ tan ca" của NV = work_end + dung sai (vd 20:00 + 6' = 20:06).
            const todayCutoff =
                S.hmToMinutes(cfg.workEnd || '20:00') +
                (Number.isFinite(Number(cfg.graceMinutes)) ? Number(cfg.graceMinutes) : 6);
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
                let st = S.dayStatus(r, isFull); // ontime|lateearly|missing|absent
                // HÔM NAY chưa qua giờ tan ca + dung sai → 1 lượt vào = ĐANG LÀM (sẽ bấm ra
                // cuối ca), KHÔNG tính "chấm thiếu" / không vào đối soát. Chỉ sau giờ đó mới tính.
                if (st === 'missing' && dk === today && nowMin <= todayCutoff) st = 'inprogress';
                if (st === 'missing')
                    needFix.push({ uid: du.device_user_id, name: empName(du), dk });
                const wd = weekdayShort(dk);
                const note = state.dayNotes[`${du.device_user_id}_${dk}`];
                const noteCls = note ? ' has-note' : '';
                const noteTitle = note ? ` · 📝 ${esc(note)}` : '';
                const edit = state.edits[`${du.device_user_id}_${dk}`];
                const editCls = edit && edit.at ? ' cc-edited' : '';
                const editTitle =
                    edit && edit.at
                        ? ` · ✏️ Đã sửa ${esc(fmtEditTs(edit.at))}${edit.by ? ' bởi ' + esc(edit.by) : ''}`
                        : '';
                const stLabel = st === 'inprogress' ? 'Đang làm (chưa tan ca)' : S.STATUS_LABEL[st];
                cells += `<td class="cc-cell${wd === 'CN' ? ' sun' : ''}${noteCls}${editCls}" data-uid="${esc(du.device_user_id)}" data-dk="${dk}" title="${stLabel} — bấm xem chi tiết · chuột phải: chấm đúng giờ${noteTitle}${editTitle}"><span class="cc-dot cc-dot-${st}" role="img" aria-label="${stLabel}" data-g="${GLYPH[st] || ''}"></span></td>`;
            }
            rows += `<tr>${cells}</tr>`;
        }
        // Hàng đợi ĐỐI SOÁT cả tháng: ngày chấm THIẾU (quên bấm vào/ra) → hiện 0đ âm thầm.
        // Trước đây chỉ cảnh báo "hôm nay"; giờ gom toàn tháng để admin sửa, không sót lương.
        const fixHtml = needFix.length
            ? `<div class="cc-reconcile" role="region" aria-label="Cần đối soát chấm công thiếu">
                 <b>⚠ Cần đối soát (${needFix.length})</b>
                 <span class="cc-reconcile-hint">— ngày chấm THIẾU 1 lượt (đang tính 0đ). Bấm để sửa:</span>
                 <span class="cc-reconcile-list">${needFix
                     .map(
                         (x) =>
                             `<button class="cc-reconcile-chip" data-uid="${esc(x.uid)}" data-dk="${x.dk}" title="${esc(x.name)} — ${x.dk} · bấm để chấm bù">${esc(x.name)} · ${x.dk.slice(8)}/${x.dk.slice(5, 7)}</button>`
                     )
                     .join('')}</span>
               </div>`
            : '';

        el.innerHTML = `
            ${renderTodayHtml()}
            ${fixHtml}
            <div class="cc-grid-wrap">
              <table class="cc-grid cc-grid-dots">
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="cc-legend">
              <span><i class="cc-dot cc-dot-ontime" data-g="✓"></i> Đúng giờ</span>
              <span><i class="cc-dot cc-dot-lateearly" data-g="!"></i> Đi muộn / Về sớm</span>
              <span><i class="cc-dot cc-dot-missing" data-g="?"></i> Chấm công thiếu</span>
              <span><i class="cc-dot cc-dot-inprogress" data-g="•"></i> Đang làm (chưa tan ca)</span>
              <span><i class="cc-dot cc-dot-absent"></i> Nghỉ làm</span>
            </div>`;

        // Event delegation: 1 listener trên #ccBody (thay ~496 listener/ô) — bind 1 LẦN
        // (el tồn tại qua các lần render; innerHTML chỉ thay con). Ô lưới + chip đối soát
        // đều mở openDay theo data-uid/data-dk.
        if (!el.dataset.ccDelegated) {
            el.dataset.ccDelegated = '1';
            el.addEventListener('click', (e) => {
                const t = e.target.closest('.cc-cell, .cc-reconcile-chip');
                if (t && el.contains(t) && t.dataset.uid && t.dataset.dk)
                    openDay(t.dataset.uid, t.dataset.dk);
            });
            // Chuột phải 1 ô → tự chấm "đúng giờ" ca chuẩn (nhanh cho ngày nghỉ / chấm thiếu).
            el.addEventListener('contextmenu', (e) => {
                const t = e.target.closest('.cc-cell');
                if (t && el.contains(t) && t.dataset.uid && t.dataset.dk) {
                    e.preventDefault();
                    quickFillWork(t.dataset.uid, t.dataset.dk);
                }
            });
        }
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
        const dayNote = state.dayNotes[`${deviceUserId}_${dateKey}`] || '';
        const editMeta = state.edits[`${deviceUserId}_${dateKey}`];
        const editMetaHtml =
            editMeta && editMeta.at
                ? `<div class="cc-edit-meta" title="Lần chỉnh sửa tay gần nhất của ngày này">✏️ Đã chỉnh sửa: <b>${esc(fmtEditTs(editMeta.at))}</b>${editMeta.by ? ` · bởi <b>${esc(editMeta.by)}</b>` : ''}</div>`
                : '';

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
                  <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" class="cc-time24" id="ccPunchTime" value="08:00">
                  <select id="ccPunchType"><option value="0">Vào</option><option value="1">Ra</option></select>
                  <button class="cc-btn cc-btn-ghost" id="ccPunchAdd">+ Thêm lượt</button>
                </div>`
            : `<div class="cc-empty-sm">Chưa có lượt chấm công ngày này.</div>
               <div class="cc-add-punch">
                  <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" class="cc-time24" id="ccPunchTime" value="08:00">
                  <select id="ccPunchType"><option value="0">Vào</option><option value="1">Ra</option></select>
                  <button class="cc-btn cc-btn-ghost" id="ccPunchAdd">+ Thêm lượt</button>
               </div>`;

        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccDayBackdrop">
            <div class="cc-modal cc-modal-detail" role="dialog" aria-modal="true" aria-label="Chấm công chi tiết ngày">
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
                ${editMetaHtml}

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
                      <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" class="cc-time24" id="ccInTime" value="${inHM || '08:00'}"></label>
                    <div class="cc-io-calc">Làm thêm <b>${otH}</b> giờ <b>${otM}</b> phút</div>
                    <label class="cc-io-line"><input type="checkbox" id="ccOutChk" ${checkOut ? 'checked' : ''}> Ra
                      <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" class="cc-time24" id="ccOutTime" value="${outHM || '20:00'}"></label>
                    <div class="cc-io-calc">Về sớm <b>${earlyH}</b> giờ <b>${earlyM}</b> phút</div>
                  </div>
                  <label class="cc-day-note-lbl">📝 Ghi chú ngày này
                    <textarea id="ccDayNote" rows="2" placeholder="VD: tăng ca giao hàng, xin về sớm, nghỉ phép báo trước… (hiện ở Bảng lương → Chi tiết)">${esc(dayNote)}</textarea>
                  </label>
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
                if (state.lock) return toast('Tháng đã CHỐT lương — Mở khoá để sửa.', 'warning');
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
                if (state.lock) return toast('Tháng đã CHỐT lương — Mở khoá để sửa.', 'warning');
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
            if (state.lock) return toast('Tháng đã CHỐT lương — Mở khoá để sửa.', 'warning');
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
        // Radio theo checkbox Vào/Ra: có chấm vào/ra → "Đi làm"; bỏ tick cả 2 → mặc định "Nghỉ không phép".
        const syncLeaveFromIO = () => {
            const inChk = document.getElementById('ccInChk')?.checked;
            const outChk = document.getElementById('ccOutChk')?.checked;
            const val = inChk || outChk ? 'work' : 'absent';
            const radio = mount.querySelector(`input[name="ccLeave"][value="${val}"]`);
            if (radio) radio.checked = true;
        };
        document.getElementById('ccInChk')?.addEventListener('change', syncLeaveFromIO);
        document.getElementById('ccOutChk')?.addEventListener('change', syncLeaveFromIO);
        // Lưu: áp dụng nghỉ phép + chỉnh giờ Vào/Ra
        document.getElementById('ccDaySave').onclick = () =>
            saveDayDetail(deviceUserId, dateKey, { checkIn, checkOut, inHM, outHM, isFull, close });
    }

    // Định dạng dấu thời gian chỉnh sửa "HH:MM DD/MM/YYYY" theo GMT+7.
    function fmtEditTs(ms) {
        if (!ms) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: VN_TZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(new Date(ms));
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
        if (state.lock)
            return toast('Tháng đã CHỐT lương — Mở khoá ở Bảng lương để sửa.', 'warning');
        const mount = document.getElementById('ccModalMount');
        const leave = (mount.querySelector('input[name="ccLeave"]:checked') || {}).value || 'work';
        const inChk = document.getElementById('ccInChk')?.checked;
        const outChk = document.getElementById('ccOutChk')?.checked;
        const inTime = document.getElementById('ccInTime')?.value;
        const outTime = document.getElementById('ccOutTime')?.value;
        try {
            // 1) Nghỉ có phép = công đủ override; ngược lại bỏ override.
            // CHỈ gọi khi trạng thái THỰC SỰ đổi (ngày đã 'paid' mở lại + Lưu mà không
            // sửa gì → KHÔNG addFullday lại, tránh đóng dấu "đã chỉnh sửa" giả).
            if (leave === 'paid') {
                if (!ctx.isFull) await Api.addFullday(deviceUserId, dateKey);
            } else if (ctx.isFull) {
                await Api.delFullday(`${deviceUserId}_${dateKey}`);
            }

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
            // 5) Ghi chú ngày — upsert (rỗng = xoá). Chỉ ghi khi thay đổi.
            const noteEl = document.getElementById('ccDayNote');
            if (noteEl) {
                const newNote = noteEl.value.trim();
                const oldNote = (state.dayNotes[`${deviceUserId}_${dateKey}`] || '').trim();
                if (newNote !== oldNote)
                    await Api.putDayNote(`${deviceUserId}_${dateKey}`, newNote);
            }
            toast('Đã lưu chấm công ngày.', 'success');
            ctx.close();
            await loadAll();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    // Chuột phải 1 ô → chấm "đúng giờ" ca chuẩn cho ngày nghỉ / chấm thiếu.
    // Chỉ THÊM lượt còn thiếu (Vào = workStart, Ra = workEnd) — KHÔNG xoá/ghi đè giờ thật đã có.
    // Bỏ qua: tháng đã chốt, ngày lễ (shop nghỉ), ngày đã đủ Vào+Ra. Nghỉ có phép → gỡ override rồi chấm.
    async function quickFillWork(deviceUserId, dateKey) {
        if (state.lock)
            return toast('Tháng đã CHỐT lương — Mở khoá ở Bảng lương để sửa.', 'warning');
        const du = state.deviceUsers.find((d) => d.device_user_id === deviceUserId);
        if (!du) return;
        if (state.holidaySet.has(dateKey)) return toast('Ngày này shop nghỉ (lễ).', 'info');
        const recs = recordsFor(deviceUserId)[dateKey] || [];
        const isFull = state.fulldaySet.has(`${deviceUserId}_${dateKey}`);
        const hasIn = recs.some((r) => r.type === 0);
        const hasOut = recs.some((r) => r.type === 1);
        if (hasIn && hasOut && !isFull) return toast('Ngày này đã có đủ giờ Vào/Ra.', 'info');
        const cfg = cfgFor(du);
        try {
            if (isFull) await Api.delFullday(`${deviceUserId}_${dateKey}`);
            if (!hasIn)
                await Api.addRecord({
                    device_user_id: deviceUserId,
                    check_time: `${dateKey} ${cfg.workStart}:00`,
                    type: 0,
                });
            if (!hasOut)
                await Api.addRecord({
                    device_user_id: deviceUserId,
                    check_time: `${dateKey} ${cfg.workEnd}:00`,
                    type: 1,
                });
            toast(`Đã chấm đúng giờ ca (${cfg.workStart}–${cfg.workEnd}).`, 'success');
            await loadAll();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    // Chuẩn hoá text người dùng nhập → "HH:MM" 24h (clamp 0–23 : 0–59).
    // Có dấu ":" → tách H:M theo dấu; không có → theo độ dài số ("8"→08:00, "0830"→08:30).
    function normalizeHM24(s) {
        const raw = String(s || '').trim();
        if (!raw) return '';
        let hpart, mpart;
        if (raw.includes(':')) {
            const parts = raw.split(':');
            hpart = parts[0].replace(/\D/g, '');
            mpart = parts[1].replace(/\D/g, '');
        } else {
            const d = raw.replace(/\D/g, '').slice(0, 4);
            if (!d) return '';
            hpart = d.length <= 2 ? d : d.slice(0, d.length - 2);
            mpart = d.length <= 2 ? '0' : d.slice(-2);
        }
        const hh = Math.min(23, parseInt(hpart || '0', 10) || 0);
        const mm = Math.min(59, parseInt(mpart || '0', 10) || 0);
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    // ── Month nav ────────────────────────────────────────────────────────────
    function shiftMonth(delta) {
        const [y, m] = state.monthKey.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        state.monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        state.empDirty = false;
        const inp = document.getElementById('ccMonth');
        if (inp) inp.value = state.monthKey;
        loadAll(true);
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
        // A11y: Esc đóng modal đang mở. Mọi modal cham-cong (ngày / chi tiết / sửa lương)
        // mount vào #ccModalMount, đóng = clear innerHTML (giống nút ✕ / click backdrop).
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const mount = document.getElementById('ccModalMount');
            if (mount && mount.querySelector('.cc-modal-backdrop')) mount.innerHTML = '';
        });
        // Input giờ 24h (.cc-time24): thay <input type=time> vì nó hiển thị theo đồng hồ
        // máy (máy set 12h → hiện SA/CH). Chuẩn hoá về HH:MM 24h khi rời ô. Bind 1 lần.
        document.addEventListener('focusout', (e) => {
            const el = e.target;
            if (el && el.classList && el.classList.contains('cc-time24'))
                el.value = normalizeHM24(el.value);
        });
        const monthInp = document.getElementById('ccMonth');
        if (monthInp) {
            monthInp.value = state.monthKey;
            monthInp.addEventListener('change', () => {
                if (/^\d{4}-\d{2}$/.test(monthInp.value)) {
                    state.monthKey = monthInp.value;
                    state.empDirty = false;
                    loadAll(true);
                }
            });
        }
        document.getElementById('ccPrev')?.addEventListener('click', () => shiftMonth(-1));
        document.getElementById('ccNext')?.addEventListener('click', () => shiftMonth(1));
        // Bấm "Tải lại" = render chủ động (kể cả khi tab Nhân viên đang sửa dở).
        document.getElementById('ccReload')?.addEventListener('click', () => {
            state.empDirty = false;
            loadAll(true);
        });

        if (global.lucide) global.lucide.createIcons();

        loadAll(true);
        if (global.Web2SSE?.subscribe) {
            let t = null;
            global.Web2SSE.subscribe('web2:attendance', (evt) => {
                const action = evt && evt.data && evt.data.action;
                // Heartbeat (~10s) / sync = chỉ làm tươi dải trạng thái, KHÔNG reload bảng
                // → không re-render khi user đang gõ (gốc lỗi "bảng tự refresh mất chỉnh sửa").
                if (action === 'heartbeat' || action === 'sync') {
                    refreshSyncOnly();
                    return;
                }
                // Dữ liệu thật (records…) → reload nền (debounce). Tab Nhân viên đang sửa
                // dở sẽ được guard giữ nguyên (force=false).
                clearTimeout(t);
                t = setTimeout(() => loadAll(false), 600);
            });
        }
    }

    // Export state + helpers cho payroll.js + employees.js.
    global.ChamCong = {
        state,
        cfgFor,
        empName,
        isVisibleEmp,
        isManualEmp,
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
