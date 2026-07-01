// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Chấm công: tab Bảng lương + modal điều chỉnh.
// =====================================================================
// Render bảng lương tháng theo NV + modal sửa thưởng/giảm trừ/đã trả/phụ cấp/
// ghi chú + override. Dùng state + helpers từ window.ChamCong.
// =====================================================================

(function (global) {
    'use strict';

    function CC() {
        return global.ChamCong;
    }

    function fmt(n) {
        return global.ChamCongSalary.fmtVnd(n);
    }

    function computeRow(du) {
        const cc = CC();
        const cfg = cc.cfgFor(du);
        const recs = cc.recordsFor(du.device_user_id);
        const fullSet = new Set(
            [...cc.state.fulldaySet]
                .filter((k) => k.startsWith(du.device_user_id + '_'))
                .map((k) => k.slice(du.device_user_id.length + 1))
        );
        return global.ChamCongSalary.calcMonth(
            cc.state.monthKey,
            recs,
            cfg,
            cc.payrollFor(du.device_user_id),
            fullSet,
            cc.state.holidaySet
        );
    }

    // ── Chốt lương kỳ: nếu tháng đã KHOÁ → đọc snapshot (đóng băng) thay vì tính lại ──
    function lockObj() {
        return CC().state.lock;
    }
    function isLocked() {
        return !!lockObj();
    }
    function snapRows() {
        const l = lockObj();
        return l && l.snapshot && Array.isArray(l.snapshot.rows) ? l.snapshot.rows : null;
    }
    function snapRow(uid) {
        const rows = snapRows();
        return rows ? rows.find((r) => r.device_user_id === uid) : null;
    }
    // { du, name, salary_type, pr, m } cho 1 NV — snapshot nếu khoá, ngược lại tính live.
    function resolveRow(uid) {
        const cc = CC();
        const snap = snapRow(uid);
        if (snap)
            return {
                du: snap.du,
                name: snap.name,
                salary_type: snap.salary_type,
                pr: snap.pr || {},
                m: snap.m,
            };
        const du = cc.state.deviceUsers.find((d) => d.device_user_id === uid);
        if (!du) return null;
        return {
            du,
            name: cc.empName(du),
            salary_type: du.salary_type,
            pr: cc.payrollFor(uid) || {},
            m: computeRow(du),
        };
    }
    // Danh sách entries để render bảng: snapshot khi khoá, live khi chưa.
    function entriesForRender() {
        const cc = CC();
        const rows = snapRows();
        if (rows)
            return rows.map((r) => ({
                du: r.du,
                name: r.name,
                salary_type: r.salary_type,
                pr: r.pr || {},
                m: r.m,
                uid: r.device_user_id,
            }));
        return cc.state.deviceUsers
            .filter((d) => d.active !== false && cc.isVisibleEmp(d))
            .map((du) => ({
                du,
                name: cc.empName(du),
                salary_type: du.salary_type,
                pr: cc.payrollFor(du.device_user_id) || {},
                m: computeRow(du),
                uid: du.device_user_id,
            }));
    }
    function fmtLockTime(ms) {
        if (!ms) return '?';
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: CC().S.VN_TZ,
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(Number(ms)));
    }

    function render() {
        const cc = CC();
        const el = document.getElementById('ccBody');
        if (!el) return;
        if (cc.state.loading) {
            // First-load only (loading chỉ bật khi load lạnh / đổi tháng) → skeleton bảng
            // lương 11 cột; reload nền không bật loading nên không flash.
            if (global.Web2Skeleton) global.Web2Skeleton.table(el, { rows: 8, cols: 11 });
            else el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            return;
        }
        // Tháng đã KHOÁ → entries từ snapshot (đóng băng); chưa khoá → tính live.
        const locked = isLocked();
        const entries = entriesForRender();
        // NV chưa đủ công (ít ngày công) xuống đáy bảng; nhiều công lên trên (sort ổn định).
        entries.sort((a, b) => (b.m.workedDays || 0) - (a.m.workedDays || 0));
        if (!entries.length) {
            el.innerHTML = `<div class="cc-empty"><p>Chưa có PIN máy nào được gán nhân viên. Vào tab <b>Nhân viên</b> để gán.</p></div>`;
            return;
        }
        // B3: phát hiện 1 NV gán cho nhiều PIN → cảnh báo + kèm PIN để phân biệt 2 dòng.
        const empIdCount = {};
        for (const e of entries)
            if (e.du && e.du.employee_id)
                empIdCount[e.du.employee_id] = (empIdCount[e.du.employee_id] || 0) + 1;
        const dupEmpIds = new Set(Object.keys(empIdCount).filter((k) => empIdCount[k] > 1));

        let rows = '';
        let tot = { luong: 0, ot: 0, pc: 0, thuong: 0, giam: 0, tong: 0, datra: 0, con: 0 };
        // B3-fix (2026-06-26): 1 NV gán nhiều PIN → CHỈ cộng vào TỔNG 1 lần (PIN đầu),
        // các dòng trùng vẫn hiển thị nhưng đánh dấu "không tính tổng" → tổng không phồng.
        const countedEmpIds = new Set();
        for (const en of entries) {
            const m = en.m;
            const du = en.du || {};
            const empId = du.employee_id ? String(du.employee_id) : null;
            const isDup = empId && dupEmpIds.has(empId);
            const skipTotal = empId && countedEmpIds.has(empId); // dòng trùng thứ 2+ → bỏ khỏi tổng
            if (empId) countedEmpIds.add(empId);
            // B6: NV lương THÁNG chưa chấm công ngày nào → nhắc admin kiểm tra (vẫn trả full).
            const lowMonthly = en.salary_type === 'monthly' && m.workedDays === 0;
            const warnStyle = 'color:#dc2626;font-size:11px;font-weight:600;white-space:nowrap';
            const nameExtra =
                (isDup
                    ? ` <span style="${warnStyle}" title="Gán trùng NV${skipTotal ? ' — dòng này KHÔNG cộng vào tổng' : ' — chỉ cộng tổng 1 lần'}">⚠ PIN ${cc.esc(en.uid)}${skipTotal ? ' (∉ tổng)' : ''}</span>`
                    : '') +
                (lowMonthly
                    ? ` <span style="${warnStyle}" title="Lương tháng nhưng 0 ngày công — kiểm tra giảm trừ">⚠ 0 công</span>`
                    : '');
            if (!skipTotal) {
                tot.luong += m.luongChinh;
                tot.ot += m.lamThem;
                tot.pc += m.phuCap;
                tot.thuong += m.thuong;
                tot.giam += m.giamTru;
                tot.tong += m.tongLuong;
                tot.datra += m.daTra;
                tot.con += m.conCanTra;
            }
            rows += `<tr>
                <td class="cc-pl-name">
                  <span class="cc-pl-nm">${cc.esc(en.name)}</span>${nameExtra}
                  <button class="cc-pl-ico cc-pl-cal" data-uid="${cc.esc(en.uid)}" title="Chi tiết chấm công"><i data-lucide="calendar-days"></i></button>
                  <button class="cc-pl-ico cc-pl-print" data-uid="${cc.esc(en.uid)}" title="In phiếu lương"><i data-lucide="printer"></i></button>
                </td>
                <td class="num">${m.workedDays}</td>
                <td class="num">${fmt(m.luongChinh)}</td>
                ${otCell(en, locked)}
                ${moneyCell(en, 'allowance', locked)}
                ${moneyCell(en, 'thuong', locked)}
                ${moneyCell(en, 'giam', locked)}
                <td class="num tong">${fmt(m.tongLuong)}</td>
                ${moneyCell(en, 'datra', locked)}
                <td class="num con ${m.conCanTra > 0 ? 'pos' : ''}">${fmt(m.conCanTra)}</td>
                ${noteCell(en, locked)}
                <td class="cc-pl-acts">
                    ${locked ? '' : `<button class="cc-btn cc-btn-ghost cc-pl-edit" data-uid="${cc.esc(en.uid)}">Sửa</button>`}
                </td>
            </tr>`;
        }
        const dusLen = entries.length;
        const dupBanner = dupEmpIds.size
            ? `<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:12.5px;"><b>⚠ Có nhân viên được gán cho NHIỀU PIN máy</b> — lương người đó đang tính TRÙNG (cộng 2 lần vào TỔNG). Vào tab <b>Nhân viên</b> sửa lại để mỗi người chỉ 1 PIN.</div>`
            : '';
        const lockBanner = locked
            ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;color:#065f46;font-size:13px;">
                 <b>🔒 Đã chốt lương tháng ${cc.esc(cc.state.monthKey)}</b>
                 <span style="color:#047857">bởi ${cc.esc((lockObj() || {}).locked_by || '?')} · ${fmtLockTime((lockObj() || {}).locked_at)}</span>
                 <span style="font-size:12px;color:#059669">— số liệu ĐÓNG BĂNG (sửa chấm công/cấu hình sau đó KHÔNG đổi bảng này).</span>
                 <button class="cc-btn cc-btn-ghost" id="ccUnlock" style="margin-left:auto">🔓 Mở khoá</button>
               </div>`
            : '';
        el.innerHTML = `
          ${lockBanner}
          ${dupBanner}
          <div class="cc-grid-wrap">
            <table class="cc-payroll">
              <thead><tr>
                <th>Nhân viên</th><th>Công</th><th>Lương chính</th><th>Tăng ca</th>
                <th>Phụ cấp</th><th>Thưởng</th><th>Giảm trừ</th><th>Tổng lương</th>
                <th>Đã trả</th><th>Còn lại</th><th>Ghi chú</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr>
                <td>TỔNG (${dusLen} NV)</td><td></td>
                <td class="num">${fmt(tot.luong)}</td><td class="num ot">${fmt(tot.ot)}</td>
                <td class="num">${fmt(tot.pc)}</td><td class="num thuong">${fmt(tot.thuong)}</td>
                <td class="num giam">${fmt(tot.giam)}</td><td class="num tong">${fmt(tot.tong)}</td>
                <td class="num">${fmt(tot.datra)}</td><td class="num con">${fmt(tot.con)}</td><td></td><td></td>
              </tr></tfoot>
            </table>
          </div>
          <div class="cc-pl-actions">
            <button class="cc-btn cc-btn-ghost" id="ccExportPayroll"><i data-lucide="download"></i> Xuất Excel bảng lương</button>
            ${locked ? '' : `<button class="cc-btn cc-btn-primary" id="ccLockPeriod"><i data-lucide="lock"></i> Chốt lương tháng này</button>`}
          </div>`;
        el.querySelectorAll('.cc-pl-edit').forEach((b) => {
            b.addEventListener('click', () => openEdit(b.dataset.uid));
        });
        el.querySelectorAll('.cc-pl-cal').forEach((b) => {
            b.addEventListener('click', () => openAttendance(b.dataset.uid));
        });
        el.querySelectorAll('.cc-pl-print').forEach((b) => {
            b.addEventListener('click', () => printPayslip(b.dataset.uid));
        });
        el.querySelectorAll('.cc-pl-ot').forEach((inp) => {
            inp.addEventListener('change', () => saveInlineOt(inp));
        });
        el.querySelectorAll('.cc-pl-money').forEach((inp) => {
            inp.addEventListener('change', () => saveInlineMoney(inp));
        });
        el.querySelectorAll('.cc-pl-note').forEach((inp) => {
            inp.addEventListener('change', () => saveInlineNote(inp));
        });
        document.getElementById('ccExportPayroll')?.addEventListener('click', exportPayroll);
        document.getElementById('ccLockPeriod')?.addEventListener('click', doLock);
        document.getElementById('ccUnlock')?.addEventListener('click', doUnlock);
        if (global.lucide) global.lucide.createIcons();
    }

    // ── Chốt / mở khoá kỳ ────────────────────────────────────────────────────
    async function doLock() {
        const cc = CC();
        const mk = cc.state.monthKey;
        if (
            !(await cc.confirmBox(
                `Chốt lương tháng ${mk}?\nSố liệu hiện tại sẽ được ĐÓNG BĂNG (snapshot). Sau khi chốt, sửa chấm công / cấu hình / điều chỉnh sẽ KHÔNG làm đổi bảng đã chốt. Vẫn có thể "Mở khoá" để tính lại.`
            ))
        )
            return;
        const entries = entriesForRender(); // đang chưa khoá → live
        const tot = { luong: 0, ot: 0, pc: 0, thuong: 0, giam: 0, tong: 0, datra: 0, con: 0 };
        // 1 NV nhiều PIN → snapshot TỔNG chỉ cộng 1 lần (PIN đầu) — khớp tổng bảng render.
        const _countedLock = new Set();
        const rows = entries.map((en) => {
            const empId = en.du && en.du.employee_id ? String(en.du.employee_id) : null;
            if (!(empId && _countedLock.has(empId))) {
                if (empId) _countedLock.add(empId);
                tot.luong += en.m.luongChinh;
                tot.ot += en.m.lamThem;
                tot.pc += en.m.phuCap;
                tot.thuong += en.m.thuong;
                tot.giam += en.m.giamTru;
                tot.tong += en.m.tongLuong;
                tot.datra += en.m.daTra;
                tot.con += en.m.conCanTra;
            }
            return {
                device_user_id: en.uid,
                name: en.name,
                salary_type: en.salary_type,
                du: en.du,
                pr: en.pr,
                m: en.m,
            };
        });
        try {
            await cc.Api.lockPeriod(mk, { rows, total: tot, monthKey: mk });
            cc.toast(`Đã chốt lương tháng ${mk}.`, 'success');
            await cc.loadAll(true);
        } catch (e) {
            cc.toast('Chốt lương lỗi: ' + e.message, 'error');
        }
    }
    async function doUnlock() {
        const cc = CC();
        const mk = cc.state.monthKey;
        if (
            !(await cc.confirmBox(
                `Mở khoá tháng ${mk}?\nBảng lương sẽ tính LẠI từ dữ liệu hiện tại — có thể khác bản đã chốt nếu chấm công/cấu hình đã thay đổi.`
            ))
        )
            return;
        try {
            await cc.Api.unlockPeriod(mk);
            cc.toast(`Đã mở khoá tháng ${mk}.`, 'success');
            await cc.loadAll(true);
        } catch (e) {
            cc.toast('Mở khoá lỗi: ' + e.message, 'error');
        }
    }

    // ── Modal CHI TIẾT (read-only): giải thích vì sao có từng khoản ──────────
    function dmy(dk) {
        // 'YYYY-MM-DD' → 'DD/MM'
        const p = String(dk).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}` : dk;
    }
    function hm(mins) {
        const h = Math.floor((mins || 0) / 60);
        const m = (mins || 0) % 60;
        return h ? `${h}g${m ? ' ' + m + 'p' : ''}` : `${m}p`;
    }
    function itemLines(items, sign) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return '';
        return list
            .map(
                (it) =>
                    `<div class="cc-dl-line"><span>${CC().esc(it.label || '(không nhãn)')}</span><span class="num">${sign}${fmt(Math.abs(Number(it.amount) || 0))}</span></div>`
            )
            .join('');
    }

    // ── Inline sửa 1 cột tiền / ghi chú trong bảng (không mở popup) ───────────
    // Backend PUT /payroll là MERGE cho items nhưng override set THẲNG → gửi FULL body
    // (dựng lại từ pr hiện tại) + patch 1 field để KHÔNG xoá nhầm khoản khác. Giống openEdit.
    async function saveInline(uid, pr, patch) {
        const cc = CC();
        if (isLocked()) return cc.toast('Tháng đã chốt — mở khoá để sửa.', 'warning');
        const body = {
            thuongItems: pr.thuong_items || [],
            giamTruItems: pr.giam_tru_items || [],
            allowances: pr.allowances || [],
            daTraItems: pr.da_tra_items || [],
            ghiChu: pr.ghi_chu ?? '',
            salaryDaysOverride: pr.salary_days_override ?? null,
            otHoursOverride: pr.ot_hours_override ?? null,
            lamThemOverride: pr.lam_them_override ?? null,
            giamTruLateOverride: pr.giam_tru_late_override ?? null,
            ...patch,
        };
        try {
            await cc.Api.putPayroll(`${uid}_${cc.state.monthKey}`, body);
            cc.toast('Đã lưu.', 'success');
            await cc.loadAll();
        } catch (e) {
            cc.toast(e.message, 'error');
        }
    }
    const INLINE_LABEL = {
        allowances: 'Phụ cấp',
        thuongItems: 'Thưởng',
        giamTruItems: 'Giảm trừ',
        daTraItems: 'Đã trả',
    };
    const INLINE_SRC = {
        allowances: 'allowances',
        thuongItems: 'thuong_items',
        giamTruItems: 'giam_tru_items',
        daTraItems: 'da_tra_items',
    };
    function saveInlineMoney(inp) {
        const cc = CC();
        const uid = inp.dataset.uid;
        const field = inp.dataset.field;
        const amount = Number(String(inp.value).replace(/[^\d]/g, '')) || 0;
        const pr = cc.payrollFor(uid) || {};
        const existing = Array.isArray(pr[INLINE_SRC[field]]) ? pr[INLINE_SRC[field]] : [];
        const label = (existing[0] && existing[0].label) || INLINE_LABEL[field];
        const patch = { [field]: amount === 0 ? [] : [{ label, amount }] };
        // Giảm trừ: ô hiển thị TỔNG (phạt muộn auto + thủ công) → ép phạt muộn về 0
        // để tổng đúng bằng số vừa nhập.
        if (field === 'giamTruItems') patch.giamTruLateOverride = 0;
        return saveInline(uid, pr, patch);
    }
    function saveInlineNote(inp) {
        const cc = CC();
        return saveInline(inp.dataset.uid, cc.payrollFor(inp.dataset.uid) || {}, {
            ghiChu: inp.value,
        });
    }
    // Tăng ca: override tiền THẲNG. Rỗng → null (auto OT lại); có số → chốt số đó.
    function saveInlineOt(inp) {
        const cc = CC();
        const raw = String(inp.value).replace(/[^\d]/g, '');
        return saveInline(inp.dataset.uid, cc.payrollFor(inp.dataset.uid) || {}, {
            lamThemOverride: raw === '' ? null : Number(raw) || 0,
        });
    }
    function otCell(en, locked) {
        const cc = CC();
        const amt = en.m.lamThem || 0;
        if (locked) return `<td class="num ot">${amt ? '+' + fmt(amt) : '—'}</td>`;
        return `<td class="num ot"><input class="cc-pl-ot" type="text" inputmode="numeric" data-uid="${cc.esc(en.uid)}" value="${amt ? amt.toLocaleString('vi-VN') : ''}" placeholder="—"></td>`;
    }
    // 1 ô cột tiền: input sửa thẳng nếu ≤1 khoản (& Giảm trừ không có phạt muộn auto);
    // nhiều khoản / có phạt muộn / đã khoá → read-only tổng + gợi ý bấm "Sửa".
    function moneyCell(en, key, locked) {
        const cc = CC();
        const m = en.m;
        const pr = en.pr || {};
        const MAP = {
            allowance: { src: 'allowances', field: 'allowances', sign: '', cls: '', val: m.phuCap },
            thuong: {
                src: 'thuong_items',
                field: 'thuongItems',
                sign: '+',
                cls: 'thuong',
                val: m.thuong,
            },
            giam: {
                src: 'giam_tru_items',
                field: 'giamTruItems',
                sign: '−',
                cls: 'giam',
                val: m.giamTru,
            },
            datra: { src: 'da_tra_items', field: 'daTraItems', sign: '', cls: '', val: m.daTra },
        }[key];
        const items = Array.isArray(pr[MAP.src]) ? pr[MAP.src] : [];
        // Giảm trừ: input = TỔNG (phạt muộn auto + thủ công). Sửa → ép phạt muộn về 0
        // (saveInlineMoney) để số hiển thị đúng bằng số nhập.
        const editable = !locked && items.length <= 1;
        if (!editable) {
            return `<td class="num ${MAP.cls}" title="Nhiều khoản — bấm Sửa để chi tiết">${MAP.val ? MAP.sign + fmt(MAP.val) : '—'}</td>`;
        }
        const amt = MAP.val || 0;
        return `<td class="num ${MAP.cls}"><input class="cc-pl-money" type="text" inputmode="numeric" data-uid="${cc.esc(en.uid)}" data-field="${MAP.field}" value="${amt ? amt.toLocaleString('vi-VN') : ''}" placeholder="—"></td>`;
    }
    function noteCell(en, locked) {
        const cc = CC();
        const note = (en.pr && en.pr.ghi_chu) || '';
        if (locked) return `<td class="cc-pl-note-cell">${cc.esc(note)}</td>`;
        return `<td class="cc-pl-note-cell"><input class="cc-pl-note" type="text" data-uid="${cc.esc(en.uid)}" value="${String(note).replace(/"/g, '&quot;')}" placeholder="Ghi chú…"></td>`;
    }

    // ── Modal Chi tiết chấm công (lịch tháng 1 NV) — icon 📅 sau tên ──────────
    function openAttendance(uid) {
        const cc = CC();
        const S = cc.S;
        const R = resolveRow(uid);
        if (!R) return;
        const m = R.m || {};
        const dr = m.dayResults || {};
        const [y, mo] = cc.state.monthKey.split('-').map(Number);
        const days = S.daysOfMonth(cc.state.monthKey);
        const isFullDay = (dk) =>
            cc.state.fulldaySet.has(`${uid}_${dk}`) || cc.state.holidaySet.has(dk);
        let lateCnt = 0;
        let missCnt = 0;
        let absCnt = 0;
        for (const dk of days) {
            const st = S.dayStatus(dr[dk], isFullDay(dk));
            if (st === 'lateearly') lateCnt++;
            else if (st === 'missing') missCnt++;
            else if (st === 'absent') absCnt++;
        }
        const firstDow = new Date(y, mo - 1, 1).getDay(); // 0=CN
        let cells = '';
        for (let i = 0; i < firstDow; i++) cells += `<div class="cc-cal-cell empty"></div>`;
        for (const dk of days) {
            const d = Number(dk.slice(8));
            const r = dr[dk] || {};
            const dd = r.dayData || {};
            const st = S.dayStatus(r, isFullDay(dk));
            const late = r.lateMinutes || 0;
            const early = r.earlyMinutes || 0;
            let lbl = S.STATUS_LABEL[st] || '';
            if (st === 'lateearly')
                lbl = late > 0 ? `Muộn ${late}p` : early > 0 ? `Về sớm ${early}p` : 'Đúng giờ';
            const inHM = dd.checkIn ? S.fmtHM(dd.checkIn) : '';
            const outHM = dd.checkOut ? S.fmtHM(dd.checkOut) : '';
            const time = inHM || outHM ? `${inHM}${outHM ? ' - ' + outHM : ''}` : '';
            const sun = new Date(y, mo - 1, d).getDay() === 0 ? ' sun' : '';
            cells += `<div class="cc-cal-cell${sun}"><div class="cc-cal-d">${d}</div><div class="cc-cal-st"><span class="cc-dot cc-dot-${st}"></span>${lbl}</div>${time ? `<div class="cc-cal-t">${time}</div>` : ''}</div>`;
        }
        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccAtBackdrop">
            <div class="cc-modal cc-modal-lg" role="dialog" aria-modal="true" aria-label="Chi tiết chấm công">
              <div class="cc-modal-head">
                <div>Chi tiết chấm công · <b>${cc.esc(R.name)}</b> · ${cc.esc(cc.state.monthKey)}</div>
                <button class="cc-x" id="ccAtClose">✕</button>
              </div>
              <div class="cc-modal-body">
                <div class="cc-at-stats">
                  <span><b>${m.workedDays || 0}</b> ngày công</span>
                  <span><b>${lateCnt}</b> lần muộn</span>
                  <span><b>${missCnt}</b> thiếu</span>
                  <span><b>${absCnt}</b> nghỉ</span>
                  <span>Trừ muộn: <b class="giam">${m.lateDeduction ? '−' + fmt(m.lateDeduction) : '0đ'}</b></span>
                  <span>OT: <b class="ot">${m.lamThem ? '+' + fmt(m.lamThem) : '0đ'}</b></span>
                </div>
                <div class="cc-cal-wk"><span class="sun">CN</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span></div>
                <div class="cc-cal-grid">${cells}</div>
                <div class="cc-legend">
                  <span><i class="cc-dot cc-dot-ontime"></i> Đúng giờ</span>
                  <span><i class="cc-dot cc-dot-lateearly"></i> Đi muộn / Về sớm</span>
                  <span><i class="cc-dot cc-dot-missing"></i> Chấm công thiếu</span>
                  <span><i class="cc-dot cc-dot-absent"></i> Nghỉ làm</span>
                </div>
              </div>
              <div class="cc-modal-foot"><button class="cc-btn cc-btn-ghost" id="ccAtClose2">Đóng</button></div>
            </div>
          </div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ccAtClose').onclick = close;
        document.getElementById('ccAtClose2').onclick = close;
        document.getElementById('ccAtBackdrop').onclick = (e) => {
            if (e.target.id === 'ccAtBackdrop') close();
        };
    }

    function openDetail(deviceUserId) {
        const cc = CC();
        const R = resolveRow(deviceUserId); // snapshot nếu đã chốt, ngược lại live
        if (!R) return;
        const du = R.du;
        const cfg = cc.cfgFor(du);
        const m = R.m;
        const pr = R.pr;

        // Lương chính
        const dayRate = Number(cfg.dailyRate) || 0;
        const isMonthly = cfg.salaryType === 'monthly';
        let luongBlock;
        if (isMonthly) {
            luongBlock = `<div class="cc-dl-line"><span>Lương tháng cố định (đi làm ${m.workedDays} ngày)</span><span class="num">${fmt(m.luongChinh)}</span></div>
                <div class="cc-dl-sub">Lương tháng KHÔNG nhân số ngày công. Trừ ngày nghỉ qua mục "Giảm trừ" bên dưới.</div>`;
        } else {
            luongBlock = `<div class="cc-dl-line"><span>${m.workedDays} công × ${fmt(dayRate)}/ngày</span><span class="num">${fmt(m.luongChinh)}</span></div>`;
            if (pr.salary_days_override != null && pr.salary_days_override !== '')
                luongBlock += `<div class="cc-dl-sub">⚙ Override công thủ công: ${cc.esc(String(pr.salary_days_override))}</div>`;
        }

        // Tăng ca
        let otBlock = '';
        if (pr.ot_hours_override != null && pr.ot_hours_override !== '') {
            otBlock = `<div class="cc-dl-sub">⚙ Override OT thủ công: ${cc.esc(String(pr.ot_hours_override))} giờ</div>`;
        } else if (m.otDays && m.otDays.length) {
            otBlock = m.otDays
                .map(
                    (d) =>
                        `<div class="cc-dl-line"><span>${dmy(d.dateKey)} · tăng ca ${hm(d.minutes)}</span><span class="num ot">+${fmt(d.pay)}</span></div>`
                )
                .join('');
        } else {
            otBlock = `<div class="cc-dl-empty">Không có tăng ca.</div>`;
        }

        // Giảm trừ — phạt muộn (auto) + thủ công
        let lateBlock = '';
        if (pr.giam_tru_late_override != null && pr.giam_tru_late_override !== '') {
            lateBlock = `<div class="cc-dl-sub">⚙ Override phạt muộn thủ công: ${fmt(pr.giam_tru_late_override)}</div>`;
        } else if (m.lateDays && m.lateDays.length) {
            lateBlock = m.lateDays
                .map(
                    (d) =>
                        `<div class="cc-dl-line"><span>${dmy(d.dateKey)} · đi muộn ${hm(d.minutes)}</span><span class="num giam">−${fmt(d.amount)}</span></div>`
                )
                .join('');
        } else {
            lateBlock = `<div class="cc-dl-empty">Không bị phạt muộn.</div>`;
        }
        const manualGiam = itemLines(pr.giam_tru_items, '−');

        // Ghi chú theo ngày (từ state.dayNotes) cho NV + tháng này
        const prefix = `${deviceUserId}_${cc.state.monthKey}`;
        const noteEntries = Object.keys(cc.state.dayNotes || {})
            .filter((k) => k.startsWith(prefix))
            .map((k) => ({ dk: k.slice(deviceUserId.length + 1), note: cc.state.dayNotes[k] }))
            .filter((x) => x.note)
            .sort((a, b) => a.dk.localeCompare(b.dk));
        const notesBlock = noteEntries.length
            ? noteEntries
                  .map((n) => `<div class="cc-dl-note"><b>${dmy(n.dk)}</b> ${cc.esc(n.note)}</div>`)
                  .join('')
            : `<div class="cc-dl-empty">Chưa có ghi chú ngày nào. Thêm ở Bảng công → bấm 1 ngày → "Ghi chú ngày này".</div>`;

        const section = (title, body, totalLabel, totalVal, cls) =>
            `<div class="cc-dl-sec">
                <div class="cc-dl-h"><span>${title}</span>${totalLabel ? `<span class="cc-dl-tot ${cls || ''}">${totalLabel}</span>` : ''}</div>
                ${body || `<div class="cc-dl-empty">—</div>`}
            </div>`;

        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccDtBackdrop">
            <div class="cc-modal cc-modal-lg" role="dialog" aria-modal="true" aria-label="Chi tiết bảng lương nhân viên">
              <div class="cc-modal-head">
                <div>Chi tiết lương · <b>${cc.esc(R.name)}</b> · ${cc.state.monthKey}${isLocked() ? ' <span style="color:#059669;font-size:12px">🔒 đã chốt</span>' : ''}</div>
                <button class="cc-x" id="ccDtClose">✕</button>
              </div>
              <div class="cc-modal-body cc-detail-body">
                ${section('Lương chính', luongBlock, fmt(m.luongChinh))}
                ${section('Tăng ca (OT)', otBlock, m.lamThem ? '+' + fmt(m.lamThem) : '0đ', 'ot')}
                ${section('Phụ cấp', itemLines(pr.allowances, '+'), m.phuCap ? '+' + fmt(m.phuCap) : '0đ')}
                ${section('Thưởng', itemLines(pr.thuong_items, '+'), m.thuong ? '+' + fmt(m.thuong) : '0đ', 'thuong')}
                ${section('Giảm trừ', `<div class="cc-dl-subh">Phạt đi muộn</div>${lateBlock}${manualGiam ? `<div class="cc-dl-subh">Giảm trừ thủ công</div>${manualGiam}` : ''}`, m.giamTru ? '−' + fmt(m.giamTru) : '0đ', 'giam')}
                ${section('Đã trả', itemLines(pr.da_tra_items, ''), m.daTra ? fmt(m.daTra) : '0đ')}
                <div class="cc-dl-summary">
                  <div class="cc-dl-line tot"><span>Tổng lương</span><span class="num tong">${fmt(m.tongLuong)}</span></div>
                  <div class="cc-dl-line tot"><span>Còn lại phải trả</span><span class="num con ${m.conCanTra > 0 ? 'pos' : ''}">${fmt(m.conCanTra)}</span></div>
                </div>
                ${pr.ghi_chu ? `<div class="cc-dl-sec"><div class="cc-dl-h"><span>Ghi chú tháng</span></div><div class="cc-dl-monthnote">${cc.esc(pr.ghi_chu)}</div></div>` : ''}
                ${section('📝 Ghi chú theo ngày', notesBlock)}
              </div>
              <div class="cc-modal-foot">
                ${isLocked() ? '' : '<button class="cc-btn cc-btn-ghost" id="ccDtEdit">Sửa điều chỉnh</button>'}
                <button class="cc-btn cc-btn-ghost" id="ccDtPrint">🖨 In phiếu lương</button>
                <span class="cc-foot-spacer"></span>
                <button class="cc-btn cc-btn-primary" id="ccDtOk">Đóng</button>
              </div>
            </div>
          </div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ccDtClose').onclick = close;
        document.getElementById('ccDtOk').onclick = close;
        document.getElementById('ccDtBackdrop').onclick = (e) => {
            if (e.target.id === 'ccDtBackdrop') close();
        };
        const dtEdit = document.getElementById('ccDtEdit');
        if (dtEdit)
            dtEdit.onclick = () => {
                close();
                openEdit(deviceUserId);
            };
        document.getElementById('ccDtPrint').onclick = () => printPayslip(deviceUserId);
    }

    // ── In phiếu lương tháng (payslip A4) ────────────────────────────────────
    // Mở cửa sổ in với phiếu lương chi tiết 1 NV/tháng (lương chính, OT, phụ cấp,
    // thưởng, giảm trừ, đã trả, còn lại + ghi chú). KHÔNG phụ thuộc thư viện.
    const SHOP_NAME = 'NHI JUDY STORE';
    function printPayslip(deviceUserId) {
        const cc = CC();
        const R = resolveRow(deviceUserId); // snapshot nếu đã chốt, ngược lại live
        if (!R) return;
        const du = R.du;
        const cfg = cc.cfgFor(du);
        const m = R.m;
        const pr = R.pr;
        const monthKey = cc.state.monthKey;
        const [yy, mm] = monthKey.split('-');
        const isMonthly = cfg.salaryType === 'monthly';
        const nvCode = 'NV' + String(deviceUserId).padStart(6, '0');

        // Dòng lương chính
        const luongChinhDesc = isMonthly
            ? `Lương tháng cố định (đi làm ${m.workedDays} ngày)`
            : `${m.workedDays} công × ${fmt(cfg.dailyRate)}/ngày`;

        const itemRows = (items, sign, cls) =>
            (Array.isArray(items) ? items : [])
                .filter((it) => it && (it.label || it.amount))
                .map(
                    (it) =>
                        `<tr><td class="ps-sub">${cc.esc(it.label || '(không nhãn)')}</td><td class="ps-amt ${cls || ''}">${sign}${fmt(Math.abs(Number(it.amount) || 0))}</td></tr>`
                )
                .join('');

        // OT từng ngày
        const otRows =
            pr.ot_hours_override != null && pr.ot_hours_override !== ''
                ? `<tr><td class="ps-sub">Override OT thủ công: ${cc.esc(String(pr.ot_hours_override))} giờ</td><td class="ps-amt ot">+${fmt(m.lamThem)}</td></tr>`
                : (m.otDays || [])
                      .map(
                          (d) =>
                              `<tr><td class="ps-sub">${dmy(d.dateKey)} · tăng ca ${hm(d.minutes)}</td><td class="ps-amt ot">+${fmt(d.pay)}</td></tr>`
                      )
                      .join('');
        // Phạt muộn từng ngày
        const lateRows =
            pr.giam_tru_late_override != null && pr.giam_tru_late_override !== ''
                ? `<tr><td class="ps-sub">Override phạt muộn: </td><td class="ps-amt giam">−${fmt(pr.giam_tru_late_override)}</td></tr>`
                : (m.lateDays || [])
                      .map(
                          (d) =>
                              `<tr><td class="ps-sub">${dmy(d.dateKey)} · đi muộn ${hm(d.minutes)}</td><td class="ps-amt giam">−${fmt(d.amount)}</td></tr>`
                      )
                      .join('');

        // Ghi chú theo ngày
        const prefix = `${deviceUserId}_${monthKey}`;
        const noteEntries = Object.keys(cc.state.dayNotes || {})
            .filter((k) => k.startsWith(prefix))
            .map((k) => ({ dk: k.slice(deviceUserId.length + 1), note: cc.state.dayNotes[k] }))
            .filter((x) => x.note)
            .sort((a, b) => a.dk.localeCompare(b.dk));
        const notesHtml = noteEntries.length
            ? `<div class="ps-notes"><div class="ps-notes-h">Ghi chú theo ngày</div>${noteEntries
                  .map((n) => `<div class="ps-note"><b>${dmy(n.dk)}</b> ${cc.esc(n.note)}</div>`)
                  .join('')}</div>`
            : '';

        const sectionHead = (t, total, cls) =>
            `<tr class="ps-sec"><td>${t}</td><td class="ps-amt ${cls || ''}">${total}</td></tr>`;

        const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
        <title>Phiếu lương ${cc.esc(R.name)} ${mm}/${yy}</title>
        <style>
          *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;margin:0;padding:24px;font-size:13px}
          .ps-wrap{max-width:720px;margin:0 auto}
          .ps-top{text-align:center;border-bottom:2px solid #1e293b;padding-bottom:10px;margin-bottom:14px}
          .ps-shop{font-size:18px;font-weight:800;letter-spacing:.04em}
          .ps-title{font-size:15px;font-weight:700;margin-top:6px;text-transform:uppercase}
          .ps-period{color:#64748b;margin-top:2px}
          .ps-info{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:14px}
          .ps-info div{padding:3px 0;border-bottom:1px dashed #e2e8f0}
          .ps-info b{display:inline-block;min-width:120px;color:#475569;font-weight:600}
          table{width:100%;border-collapse:collapse}
          td{padding:5px 8px;vertical-align:top}
          .ps-sec td{font-weight:700;background:#f1f5f9;border-top:1px solid #cbd5e1}
          .ps-sub{padding-left:22px;color:#475569}
          .ps-amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
          .ot{color:#2563eb}.giam{color:#dc2626}.thuong{color:#16a34a}.tong{color:#0f172a;font-weight:800}
          .ps-totals{margin-top:10px;border-top:2px solid #1e293b}
          .ps-totals td{font-size:14px;font-weight:700;padding:8px}
          .ps-con td{font-size:16px;color:#dc2626;font-weight:800}
          .ps-notes{margin-top:14px;font-size:12px}
          .ps-notes-h{font-weight:700;margin-bottom:4px}
          .ps-note{padding:2px 0;color:#475569}
          .ps-sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:34px;text-align:center}
          .ps-sign div{font-size:12px}.ps-sign .ps-role{font-weight:700;margin-bottom:50px}
          .ps-foot{margin-top:20px;text-align:center;color:#94a3b8;font-size:11px}
          @media print{ body{padding:0} .ps-wrap{max-width:100%} button{display:none} }
        </style></head>
        <body><div class="ps-wrap">
          <div class="ps-top">
            <div class="ps-shop">${SHOP_NAME}</div>
            <div class="ps-title">Phiếu lương nhân viên</div>
            <div class="ps-period">Kỳ lương tháng ${mm}/${yy}</div>
          </div>
          <div class="ps-info">
            <div><b>Nhân viên:</b> ${cc.esc(R.name)}</div>
            <div><b>Mã NV:</b> ${nvCode}</div>
            <div><b>Loại lương:</b> ${isMonthly ? 'Theo tháng' : 'Theo ngày'}</div>
            <div><b>Ca làm việc:</b> ${cc.esc(cfg.workStart)}–${cc.esc(cfg.workEnd)}</div>
            <div><b>Số công:</b> ${m.workedDays} ngày</div>
            <div><b>Đơn giá:</b> ${fmt(cfg.dailyRate)}${isMonthly ? '/tháng' : '/ngày'}</div>
          </div>
          <table>
            ${sectionHead('Lương chính', fmt(m.luongChinh))}
            <tr><td class="ps-sub">${luongChinhDesc}</td><td class="ps-amt">${fmt(m.luongChinh)}</td></tr>
            ${sectionHead('Tăng ca (OT)', m.lamThem ? '+' + fmt(m.lamThem) : '0đ', 'ot')}
            ${otRows || '<tr><td class="ps-sub">Không có tăng ca.</td><td class="ps-amt">—</td></tr>'}
            ${sectionHead('Phụ cấp', m.phuCap ? '+' + fmt(m.phuCap) : '0đ')}
            ${itemRows(pr.allowances, '+') || '<tr><td class="ps-sub">—</td><td class="ps-amt">—</td></tr>'}
            ${sectionHead('Thưởng', m.thuong ? '+' + fmt(m.thuong) : '0đ', 'thuong')}
            ${itemRows(pr.thuong_items, '+', 'thuong') || '<tr><td class="ps-sub">—</td><td class="ps-amt">—</td></tr>'}
            ${sectionHead('Giảm trừ', m.giamTru ? '−' + fmt(m.giamTru) : '0đ', 'giam')}
            ${lateRows || '<tr><td class="ps-sub">Không bị phạt muộn.</td><td class="ps-amt">—</td></tr>'}
            ${itemRows(pr.giam_tru_items, '−', 'giam')}
            ${sectionHead('Đã trả', m.daTra ? fmt(m.daTra) : '0đ')}
            ${itemRows(pr.da_tra_items, '') || '<tr><td class="ps-sub">—</td><td class="ps-amt">—</td></tr>'}
          </table>
          <table class="ps-totals">
            <tr><td>TỔNG LƯƠNG</td><td class="ps-amt tong">${fmt(m.tongLuong)}</td></tr>
            <tr class="ps-con"><td>CÒN LẠI PHẢI TRẢ</td><td class="ps-amt">${fmt(m.conCanTra)}</td></tr>
          </table>
          ${pr.ghi_chu ? `<div class="ps-notes"><div class="ps-notes-h">Ghi chú tháng</div><div class="ps-note">${cc.esc(pr.ghi_chu)}</div></div>` : ''}
          ${notesHtml}
          <div class="ps-sign">
            <div><div class="ps-role">Người nhận lương</div>(Ký, ghi rõ họ tên)</div>
            <div><div class="ps-role">Người lập phiếu</div>(Ký, ghi rõ họ tên)</div>
          </div>
          <div class="ps-foot">Phiếu lương in từ hệ thống Chấm công · ${new Intl.DateTimeFormat('vi-VN', { timeZone: cc.S.VN_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}</div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
        </body></html>`;

        const w = global.open('', '_blank', 'width=820,height=900');
        if (!w) {
            cc.toast('Trình duyệt chặn cửa sổ in. Cho phép pop-up rồi thử lại.', 'error');
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // ── Modal sửa điều chỉnh lương ──────────────────────────────────────────
    function itemsEditor(title, items, key) {
        const list = Array.isArray(items) ? items : [];
        const rows = list
            .map(
                (it, i) => `<div class="cc-item-row" data-key="${key}" data-i="${i}">
                <input class="cc-item-label" value="${(it.label || '').replace(/"/g, '&quot;')}" placeholder="Diễn giải">
                <input class="cc-item-amount" type="number" value="${Number(it.amount) || 0}" placeholder="0">
                <button class="cc-item-del" type="button">✕</button>
            </div>`
            )
            .join('');
        return `<div class="cc-item-group" data-group="${key}">
            <div class="cc-item-head"><span>${title}</span><button class="cc-item-add cc-btn cc-btn-ghost" type="button" data-key="${key}">+ Thêm</button></div>
            <div class="cc-item-list">${rows}</div>
          </div>`;
    }

    function openEdit(deviceUserId) {
        const cc = CC();
        const du = cc.state.deviceUsers.find((d) => d.device_user_id === deviceUserId);
        if (!du) return;
        const pr = cc.payrollFor(deviceUserId) || {};
        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccPlBackdrop">
            <div class="cc-modal cc-modal-lg" role="dialog" aria-modal="true" aria-label="Sửa bảng lương nhân viên">
              <div class="cc-modal-head">
                <div>Điều chỉnh lương · <b>${cc.esc(cc.empName(du))}</b> · ${cc.state.monthKey}</div>
                <button class="cc-x" id="ccPlClose">✕</button>
              </div>
              <div class="cc-modal-body">
                ${itemsEditor('Thưởng', pr.thuong_items, 'thuong')}
                ${itemsEditor('Giảm trừ thủ công', pr.giam_tru_items, 'giam')}
                ${itemsEditor('Phụ cấp', pr.allowances, 'allowance')}
                ${itemsEditor('Đã trả', pr.da_tra_items, 'datra')}
                <div class="cc-overrides">
                  <label>Override công <input type="number" id="ccOvDays" value="${pr.salary_days_override ?? ''}" placeholder="auto"></label>
                  <label>Override giờ OT <input type="number" id="ccOvOt" value="${pr.ot_hours_override ?? ''}" placeholder="auto"></label>
                  <label>Override phạt muộn <input type="number" id="ccOvLate" value="${pr.giam_tru_late_override ?? ''}" placeholder="auto"></label>
                </div>
                <label class="cc-note-lbl">Ghi chú <textarea id="ccNote" rows="2">${cc.esc(pr.ghi_chu || '')}</textarea></label>
              </div>
              <div class="cc-modal-foot">
                <button class="cc-btn cc-btn-ghost" id="ccPlCancel">Huỷ</button>
                <button class="cc-btn cc-btn-primary" id="ccPlSave">Lưu</button>
              </div>
            </div>
          </div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ccPlClose').onclick = close;
        document.getElementById('ccPlCancel').onclick = close;
        document.getElementById('ccPlBackdrop').onclick = (e) => {
            if (e.target.id === 'ccPlBackdrop') close();
        };
        // add/del item rows
        mount.querySelectorAll('.cc-item-add').forEach((b) => {
            b.onclick = () => {
                const listEl = b.closest('.cc-item-group').querySelector('.cc-item-list');
                const div = document.createElement('div');
                div.className = 'cc-item-row';
                div.dataset.key = b.dataset.key;
                div.innerHTML = `<input class="cc-item-label" placeholder="Diễn giải">
                    <input class="cc-item-amount" type="number" placeholder="0">
                    <button class="cc-item-del" type="button">✕</button>`;
                listEl.appendChild(div);
                div.querySelector('.cc-item-del').onclick = () => div.remove();
            };
        });
        mount.querySelectorAll('.cc-item-del').forEach((b) => {
            b.onclick = () => b.closest('.cc-item-row').remove();
        });
        document.getElementById('ccPlSave').onclick = async () => {
            const collect = (key) =>
                [...mount.querySelectorAll(`.cc-item-group[data-group="${key}"] .cc-item-row`)]
                    .map((r) => ({
                        label: r.querySelector('.cc-item-label').value.trim(),
                        amount: Number(r.querySelector('.cc-item-amount').value) || 0,
                    }))
                    .filter((x) => x.label || x.amount);
            const numOrNull = (id) => {
                const v = document.getElementById(id).value.trim();
                return v === '' ? null : Number(v);
            };
            const body = {
                thuongItems: collect('thuong'),
                giamTruItems: collect('giam'),
                allowances: collect('allowance'),
                daTraItems: collect('datra'),
                ghiChu: document.getElementById('ccNote').value,
                salaryDaysOverride: numOrNull('ccOvDays'),
                otHoursOverride: numOrNull('ccOvOt'),
                lamThemOverride: pr.lam_them_override ?? null,
                giamTruLateOverride: numOrNull('ccOvLate'),
            };
            try {
                await cc.Api.putPayroll(`${deviceUserId}_${cc.state.monthKey}`, body);
                cc.toast('Đã lưu điều chỉnh lương.', 'success');
                close();
                await cc.loadAll();
            } catch (e) {
                cc.toast(e.message, 'error');
            }
        };
    }

    // ── Xuất Excel ────────────────────────────────────────────────────────────
    async function exportPayroll() {
        const cc = CC();
        try {
            if (!global.XLSX) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('Không tải được thư viện Excel'));
                    document.head.appendChild(s);
                });
            }
            const entries = entriesForRender(); // snapshot khi đã chốt, ngược lại live
            const aoa = [
                [
                    'Nhân viên',
                    'Công',
                    'Lương chính',
                    'Tăng ca',
                    'Phụ cấp',
                    'Thưởng',
                    'Giảm trừ',
                    'Tổng lương',
                    'Đã trả',
                    'Còn lại',
                ],
            ];
            for (const en of entries) {
                const m = en.m;
                aoa.push([
                    en.name,
                    m.workedDays,
                    m.luongChinh,
                    m.lamThem,
                    m.phuCap,
                    m.thuong,
                    m.giamTru,
                    m.tongLuong,
                    m.daTra,
                    m.conCanTra,
                ]);
            }
            const wb = global.XLSX.utils.book_new();
            const ws = global.XLSX.utils.aoa_to_sheet(aoa);
            global.XLSX.utils.book_append_sheet(wb, ws, 'BangLuong');
            global.XLSX.writeFile(wb, `bang-luong-${cc.state.monthKey}.xlsx`);
        } catch (e) {
            cc.toast('Lỗi xuất Excel: ' + e.message, 'error');
        }
    }

    global.ChamCongPayroll = { render };
})(window);
