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
                  <button class="cc-pl-ico cc-pl-hist" data-uid="${cc.esc(en.uid)}" title="Lịch sử chỉnh sửa lương"><i data-lucide="history"></i></button>
                </td>
                <td class="num">${m.workedDays}</td>
                ${clickCell(en, 'luongchinh', locked)}
                ${clickCell(en, 'ot', locked)}
                ${clickCell(en, 'allowance', locked)}
                ${clickCell(en, 'thuong', locked)}
                ${clickCell(en, 'giam', locked)}
                <td class="num tong">${fmt(m.tongLuong)}</td>
                ${clickCell(en, 'datra', locked)}
                <td class="num con ${m.conCanTra > 0 ? 'pos' : ''}">${fmt(m.conCanTra)}</td>
                ${noteCell(en, locked)}
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
                <th>Đã trả</th><th>Còn lại</th><th>Ghi chú</th>
              </tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr>
                <td>TỔNG (${dusLen} NV)</td><td></td>
                <td class="num">${fmt(tot.luong)}</td><td class="num ot">${fmt(tot.ot)}</td>
                <td class="num">${fmt(tot.pc)}</td><td class="num thuong">${fmt(tot.thuong)}</td>
                <td class="num giam">${fmt(tot.giam)}</td><td class="num tong">${fmt(tot.tong)}</td>
                <td class="num">${fmt(tot.datra)}</td><td class="num con">${fmt(tot.con)}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
          <div class="cc-pl-actions">
            <button class="cc-btn cc-btn-ghost" id="ccExportPayroll"><i data-lucide="download"></i> Xuất Excel bảng lương</button>
            ${locked ? '' : `<button class="cc-btn cc-btn-primary" id="ccLockPeriod"><i data-lucide="lock"></i> Chốt lương tháng này</button>`}
          </div>`;
        el.querySelectorAll('.cc-pl-cell').forEach((b) => {
            b.addEventListener('click', () => {
                const uid = b.dataset.uid;
                const kind = b.dataset.kind;
                if (kind === 'luongchinh') openLuongChinhModal(uid);
                else if (kind === 'ot') openOtModal(uid);
                else if (kind === 'giam') openGiamTruModal(uid);
                else openItemsModal(uid, kind);
            });
        });
        el.querySelectorAll('.cc-pl-cal').forEach((b) => {
            b.addEventListener('click', () => openAttendance(b.dataset.uid));
        });
        el.querySelectorAll('.cc-pl-print').forEach((b) => {
            b.addEventListener('click', () => printPayslip(b.dataset.uid));
        });
        el.querySelectorAll('.cc-pl-hist').forEach((b) => {
            b.addEventListener('click', () => {
                if (!global.Web2AuditLog)
                    return cc.toast('Chưa tải được lịch sử chỉnh sửa.', 'error');
                const R = resolveRow(b.dataset.uid);
                global.Web2AuditLog.openRecord({
                    entity: 'attendance-payroll',
                    entityId: `${b.dataset.uid}_${cc.state.monthKey}`,
                    title: `Lịch sử chỉnh sửa lương · ${R ? R.name : ''} · ${cc.state.monthKey}`,
                });
            });
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

    // ── Helpers hiển thị ngày/giờ (phiếu lương in) ────────────────────────────
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

    // ── Inline sửa 1 cột tiền / ghi chú trong bảng (không mở popup) ───────────
    // Backend PUT /payroll là MERGE cho items nhưng override set THẲNG → gửi FULL body
    // (dựng lại từ pr hiện tại) + patch field cần đổi để KHÔNG xoá nhầm khoản khác.
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
            lamThemDetail: pr.lam_them_detail ?? null,
            luongChinhDetail: pr.luong_chinh_detail ?? null,
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
    function saveInlineNote(inp) {
        const cc = CC();
        return saveInline(inp.dataset.uid, cc.payrollFor(inp.dataset.uid) || {}, {
            ghiChu: inp.value,
        });
    }

    // ── Ô tiền bấm được trong bảng → mở modal chỉnh từng khoản (kiểu TPOS) ────
    function clickCell(en, kind, locked) {
        const cc = CC();
        const m = en.m;
        const V = {
            luongchinh: { cls: '', sign: '', val: m.luongChinh },
            ot: { cls: 'ot', sign: '+', val: m.lamThem },
            allowance: { cls: '', sign: '', val: m.phuCap },
            thuong: { cls: 'thuong', sign: '+', val: m.thuong },
            giam: { cls: 'giam', sign: '−', val: m.giamTru },
            datra: { cls: '', sign: '', val: m.daTra },
        }[kind];
        const txt = V.val ? V.sign + fmt(V.val) : '—';
        if (locked) return `<td class="num ${V.cls}">${txt}</td>`;
        return `<td class="num ${V.cls}"><button type="button" class="cc-pl-cell" data-uid="${cc.esc(en.uid)}" data-kind="${kind}" title="Bấm để chỉnh">${txt}</button></td>`;
    }

    const KIND_CFG = {
        allowance: {
            title: 'Các khoản phụ cấp',
            colL: 'Loại phụ cấp',
            colR: 'Tiền phụ cấp',
            field: 'allowances',
            src: 'allowances',
            groups: ['Phụ cấp cố định', 'Phụ cấp khác'],
        },
        thuong: {
            title: 'Các khoản thưởng',
            colL: 'Loại thưởng',
            colR: 'Tiền thưởng',
            field: 'thuongItems',
            src: 'thuong_items',
            groups: ['Thưởng theo ngày làm việc', 'Thưởng khác'],
        },
        datra: {
            title: 'Đã trả nhân viên',
            colL: 'Nội dung',
            colR: 'Số tiền',
            field: 'daTraItems',
            src: 'da_tra_items',
            groups: ['Thêm khoản trả'],
            link: true,
        },
    };
    function parseAmt(v) {
        return Number(String(v || '').replace(/[^\d]/g, '')) || 0;
    }

    // Khung modal chung (head + foot "Bỏ qua"/"Xong"). Caller tự wire #ccTplDone.
    function tplShell(title, name, inner) {
        const cc = CC();
        const mount = document.getElementById('ccModalMount');
        mount.innerHTML = `
          <div class="cc-modal-backdrop" id="ccTplBackdrop">
            <div class="cc-modal cc-modal-lg cc-tpl" role="dialog" aria-modal="true" aria-label="${title}">
              <div class="cc-modal-head">
                <div><div class="cc-tpl-title">${title}</div><div class="cc-tpl-sub">Nhân viên: ${cc.esc(name)}</div></div>
                <button class="cc-x" id="ccTplX">✕</button>
              </div>
              <div class="cc-modal-body">${inner}</div>
              <div class="cc-modal-foot">
                <span class="cc-foot-spacer"></span>
                <button class="cc-btn cc-btn-ghost" id="ccTplCancel">Bỏ qua</button>
                <button class="cc-btn cc-btn-primary" id="ccTplDone">Xong</button>
              </div>
            </div>
          </div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ccTplX').onclick = close;
        document.getElementById('ccTplCancel').onclick = close;
        document.getElementById('ccTplBackdrop').onclick = (e) => {
            if (e.target.id === 'ccTplBackdrop') close();
        };
        return { mount, close };
    }
    function itemRowHtml(label, amount) {
        return `<div class="cc-tpl-item">
            <input class="cc-tpl-ilabel" value="${String(label || '').replace(/"/g, '&quot;')}" placeholder="Diễn giải">
            <input class="cc-tpl-iamt" type="text" inputmode="numeric" value="${amount ? Number(amount).toLocaleString('vi-VN') : ''}" placeholder="0">
            <button class="cc-tpl-idel" type="button" title="Xoá khoản này">✕</button>
        </div>`;
    }
    // Wire xoá/nhập cho item rows + nút (+) thêm row (label mặc định = tên nhóm).
    function wireItems(mount, list, recompute) {
        const wireRow = (row) => {
            row.querySelector('.cc-tpl-idel').onclick = () => {
                row.remove();
                recompute();
            };
            row.querySelector('.cc-tpl-iamt').addEventListener('input', recompute);
        };
        list.querySelectorAll('.cc-tpl-item').forEach(wireRow);
        mount.querySelectorAll('.cc-tpl-add').forEach((b) => {
            const add = () => {
                const div = document.createElement('div');
                div.innerHTML = itemRowHtml(b.dataset.label, 0);
                const row = div.firstElementChild;
                list.appendChild(row);
                wireRow(row);
                row.querySelector('.cc-tpl-iamt').focus();
                recompute();
            };
            b.onclick = add;
            const g = b.closest('.cc-tpl-group');
            if (g && g.classList.contains('link'))
                g.onclick = (e) => {
                    if (!b.contains(e.target)) add();
                };
        });
    }
    function collectItems(list) {
        return [...list.querySelectorAll('.cc-tpl-item')]
            .map((r) => ({
                label: r.querySelector('.cc-tpl-ilabel').value.trim(),
                amount: parseAmt(r.querySelector('.cc-tpl-iamt').value),
            }))
            .filter((x) => x.label || x.amount);
    }

    // Modal Thưởng / Phụ cấp / Đã trả — danh sách khoản {label, amount}.
    function openItemsModal(uid, kind) {
        const cc = CC();
        if (isLocked()) return cc.toast('Tháng đã chốt — mở khoá để sửa.', 'warning');
        const K = KIND_CFG[kind];
        const R = resolveRow(uid);
        if (!R) return;
        const pr = cc.payrollFor(uid) || {};
        const items = Array.isArray(pr[K.src]) ? pr[K.src] : [];
        const inner = `
            <div class="cc-tpl-cols"><span>${K.colL}</span><span>${K.colR}</span></div>
            <div class="cc-tpl-total"><span></span><b id="ccTplTotal">-</b></div>
            <div class="cc-tpl-list" id="ccTplList">${items.map((it) => itemRowHtml(it.label, it.amount)).join('')}</div>
            ${K.groups.map((g) => `<div class="cc-tpl-group${K.link ? ' link' : ''}"><span>${g}</span><button class="cc-tpl-add" type="button" data-label="${g}" title="Thêm khoản">+</button></div>`).join('')}`;
        const { mount, close } = tplShell(K.title, R.name, inner);
        const list = document.getElementById('ccTplList');
        const totalEl = document.getElementById('ccTplTotal');
        const recompute = () => {
            let s = 0;
            list.querySelectorAll('.cc-tpl-iamt').forEach((i) => (s += parseAmt(i.value)));
            totalEl.textContent = s ? fmt(s) : '-';
        };
        wireItems(mount, list, recompute);
        recompute();
        document.getElementById('ccTplDone').onclick = async () => {
            await saveInline(uid, pr, { [K.field]: collectItems(list) });
            close();
        };
    }

    // Modal Giảm trừ — ô "đi muộn, về sớm, cố định" (rỗng = auto theo chấm công,
    // nhập số = override) + khoản thủ công theo nhóm + ghi chú (chung ghi_chu tháng).
    function openGiamTruModal(uid) {
        const cc = CC();
        if (isLocked()) return cc.toast('Tháng đã chốt — mở khoá để sửa.', 'warning');
        const R = resolveRow(uid);
        if (!R) return;
        const pr = cc.payrollFor(uid) || {};
        const items = Array.isArray(pr.giam_tru_items) ? pr.giam_tru_items : [];
        const ovLate = pr.giam_tru_late_override;
        const autoLate = Number(R.m.lateDeduction) || 0;
        const inner = `
            <div class="cc-tpl-cols"><span>Loại giảm trừ</span><span>Tiền giảm trừ</span></div>
            <div class="cc-tpl-total"><span></span><b id="ccTplTotal">-</b></div>
            <div class="cc-tpl-group fixed"><span>Giảm trừ đi muộn, về sớm, cố định</span>
                <input id="ccTplLate" type="text" inputmode="numeric" value="${ovLate != null && ovLate !== '' ? Number(ovLate).toLocaleString('vi-VN') : ''}" placeholder="${autoLate ? autoLate.toLocaleString('vi-VN') : '-'}" title="Rỗng = phạt muộn TỰ ĐỘNG theo chấm công · nhập số = ghi đè"></div>
            <div class="cc-tpl-list" id="ccTplList">${items.map((it) => itemRowHtml(it.label, it.amount)).join('')}</div>
            <div class="cc-tpl-group"><span>Phạt vi phạm theo ngày</span><button class="cc-tpl-add" type="button" data-label="Phạt vi phạm theo ngày" title="Thêm khoản">+</button></div>
            <div class="cc-tpl-group"><span>Giảm trừ khác</span><button class="cc-tpl-add" type="button" data-label="Giảm trừ khác" title="Thêm khoản">+</button></div>
            <label class="cc-tpl-note">Ghi chú<textarea id="ccTplNote" rows="2" placeholder="Ghi chú giảm trừ…">${cc.esc(pr.ghi_chu || '')}</textarea></label>`;
        const { mount, close } = tplShell('Các khoản giảm trừ', R.name, inner);
        const list = document.getElementById('ccTplList');
        const totalEl = document.getElementById('ccTplTotal');
        const lateInp = document.getElementById('ccTplLate');
        const recompute = () => {
            let s = lateInp.value.trim() === '' ? autoLate : parseAmt(lateInp.value);
            list.querySelectorAll('.cc-tpl-iamt').forEach((i) => (s += parseAmt(i.value)));
            totalEl.textContent = s ? '−' + fmt(s) : '-';
        };
        lateInp.addEventListener('input', recompute);
        wireItems(mount, list, recompute);
        recompute();
        document.getElementById('ccTplDone').onclick = async () => {
            await saveInline(uid, pr, {
                giamTruItems: collectItems(list),
                giamTruLateOverride: lateInp.value.trim() === '' ? null : parseAmt(lateInp.value),
                ghiChu: document.getElementById('ccTplNote').value,
            });
            close();
        };
    }

    // Modal Tăng ca ("Lương làm thêm") — bảng giờ theo loại ngày × đơn giá OT.
    // Lương NGÀY: nhập SỐ GIỜ → thành tiền = giờ × (đơn giá giờ × hệ số OT). Không đổi
    //   gì → đóng không lưu; xoá hết giờ → về auto. Giờ từng ca lưu lam_them_detail.
    // Lương THÁNG: không có đơn giá giờ chuẩn → nhập TIỀN tăng ca trực tiếp.
    const OT_ROWS = [
        { k: 'ngay_thuong', label: 'Ngày thường' },
        { k: 'thu7', label: 'Thứ 7' },
        { k: 'chu_nhat', label: 'Chủ nhật' },
        { k: 'ngay_nghi', label: 'Ngày nghỉ' },
        { k: 'le_tet', label: 'Ngày lễ tết' },
    ];
    function openOtModal(uid) {
        const cc = CC();
        if (isLocked()) return cc.toast('Tháng đã chốt — mở khoá để sửa.', 'warning');
        const R = resolveRow(uid);
        if (!R) return;
        const cfg = cc.cfgFor(R.du);
        const pr = cc.payrollFor(uid) || {};
        const m = R.m;

        if (cfg.salaryType === 'monthly') {
            const ov = pr.lam_them_override;
            const inner = `
                <div class="cc-tpl-subline">Loại lương: Theo tháng — nhập TIỀN tăng ca trực tiếp (rỗng = không có).</div>
                <div class="cc-tpl-group fixed"><span>Tiền tăng ca tháng này</span>
                    <input id="ccTplOtMoney" type="text" inputmode="numeric" value="${ov != null && ov !== '' ? Number(ov).toLocaleString('vi-VN') : ''}" placeholder="0"></div>`;
            const { close } = tplShell('Lương làm thêm', R.name, inner);
            document.getElementById('ccTplDone').onclick = async () => {
                const v = document.getElementById('ccTplOtMoney').value.trim();
                await saveInline(uid, pr, {
                    lamThemOverride: v === '' ? null : parseAmt(v),
                    lamThemDetail: null,
                });
                close();
            };
            return;
        }

        const startMin = cc.S.hmToMinutes(cfg.workStart || '08:00');
        const endMin = cc.S.hmToMinutes(cfg.workEnd || '20:00');
        const stdH = Math.max(0.5, (endMin - startMin) / 60);
        const hourly = (Number(cfg.dailyRate) || 0) / stdH;
        const otMult = Number.isFinite(Number(cfg.otMultiplier)) ? Number(cfg.otMultiplier) : 1;
        const otRate = hourly * otMult;
        const autoH = Math.round(((m.otMinutes || 0) / 60) * 100) / 100;
        const detail =
            pr.lam_them_detail && typeof pr.lam_them_detail === 'object'
                ? pr.lam_them_detail
                : null;
        const defOf = (k) => {
            const v = detail ? Number(detail[k]) || 0 : k === 'macdinh' ? autoH : 0;
            return v || '';
        };
        const rowHtml = (k, label, sub, autoHours) => `
            <tr class="${k === 'macdinh' ? 'cc-tpl-otdef' : ''}">
                <td><b>${label}</b>${sub ? `<div class="cc-tpl-otsub">${sub}</div>` : ''}</td>
                <td class="num">${k === 'macdinh' ? '' : Math.round(otRate).toLocaleString('vi-VN')}</td>
                <td class="num">${autoHours || 0}</td>
                <td class="num"><input class="cc-tpl-oth" type="number" min="0" step="0.5" data-k="${k}" value="${defOf(k)}" placeholder="0"></td>
                <td class="num" data-money="${k}">-</td>
            </tr>`;
        const inner = `
            <div class="cc-tpl-subline">Loại lương: Theo ngày công chuẩn</div>
            <table class="cc-tpl-ot">
              <thead><tr><th>Ca</th><th class="num">Mỗi giờ làm thêm</th><th class="num">Số giờ làm thêm</th><th class="num">Số giờ tính lương</th><th class="num">Thành tiền</th></tr></thead>
              <tbody>
                ${rowHtml('macdinh', 'Mặc định', Math.round(hourly).toLocaleString('vi-VN') + '/Giờ', autoH)}
                ${OT_ROWS.map((r) => rowHtml(r.k, r.label, '', 0)).join('')}
              </tbody>
            </table>
            <div class="cc-tpl-total"><span>Tổng tăng ca</span><b id="ccTplTotal">-</b></div>
            <div class="cc-tpl-hint">Không nhập gì = OT tự động theo chấm công. Nhập giờ = chốt tiền tăng ca theo bảng này (xoá hết giờ để quay về tự động).</div>`;
        const { mount, close } = tplShell('Lương làm thêm', R.name, inner);
        const inputs = [...mount.querySelectorAll('.cc-tpl-oth')];
        let dirty = false;
        const recompute = () => {
            let total = 0;
            inputs.forEach((i) => {
                const money = Math.round((parseFloat(i.value) || 0) * otRate);
                total += money;
                const cell = mount.querySelector(`[data-money="${i.dataset.k}"]`);
                if (cell) cell.textContent = money ? fmt(money) : '-';
            });
            const totalEl = document.getElementById('ccTplTotal');
            if (totalEl) totalEl.textContent = total ? '+' + fmt(total) : '-';
            return total;
        };
        inputs.forEach((i) =>
            i.addEventListener('input', () => {
                dirty = true;
                recompute();
            })
        );
        recompute();
        document.getElementById('ccTplDone').onclick = async () => {
            if (!dirty) return close(); // không đổi gì → không lưu (giữ auto/override cũ)
            const hours = {};
            let any = false;
            inputs.forEach((i) => {
                const h = parseFloat(i.value) || 0;
                hours[i.dataset.k] = h;
                if (h > 0) any = true;
            });
            await saveInline(
                uid,
                pr,
                any
                    ? { lamThemOverride: recompute(), lamThemDetail: hours }
                    : { lamThemOverride: null, lamThemDetail: null }
            );
            close();
        };
    }

    // Modal Lương chính — bảng ngày công theo loại ngày × lương/ngày.
    // Chấm công đủ = trọn lương ngày (engine calcDay 2026-07-02). "Số ngày tính lương"
    // sửa được → salary_days_override (tổng) + luong_chinh_detail (chia theo loại ngày).
    // Không đổi gì → đóng không lưu; xoá hết → về auto. Lương THÁNG: chỉ xem (cố định).
    const LC_ROWS = [
        { k: 'ngay_thuong', label: 'Ngày thường', sub: '' },
        { k: 'ngay_nghi', label: 'Ngày nghỉ', sub: '100%' },
        { k: 'le_tet', label: 'Ngày lễ tết', sub: '100%' },
    ];
    function openLuongChinhModal(uid) {
        const cc = CC();
        if (isLocked()) return cc.toast('Tháng đã chốt — mở khoá để sửa.', 'warning');
        const R = resolveRow(uid);
        if (!R) return;
        const cfg = cc.cfgFor(R.du);
        const pr = cc.payrollFor(uid) || {};
        const m = R.m;
        const dayRate = Number(cfg.dailyRate) || 0;
        const days = cc.S.daysOfMonth(cc.state.monthKey);

        if (cfg.salaryType === 'monthly') {
            const inner = `
                <div class="cc-tpl-subline">Loại lương: Theo tháng (cố định)</div>
                <div class="cc-tpl-group fixed"><span>Lương tháng cố định — đi làm ${m.workedDays} ngày</span><b>${fmt(m.luongChinh)}</b></div>
                <div class="cc-tpl-hint">Lương tháng KHÔNG nhân số ngày công. Trừ ngày nghỉ qua "Giảm trừ".</div>`;
            const { close } = tplShell('Lương chính', R.name, inner);
            document.getElementById('ccTplDone').onclick = close;
            return;
        }

        // Đếm ngày công auto theo loại ngày: lễ (holidaySet) / CN / thường.
        const cnt = { ngay_thuong: 0, ngay_nghi: 0, le_tet: 0 };
        const dr = m.dayResults || {};
        for (const dk of days) {
            if (!dr[dk] || !dr[dk].worked) continue;
            if (cc.state.holidaySet.has(dk)) cnt.le_tet++;
            else if (new Date(`${dk}T12:00:00+07:00`).getDay() === 0) cnt.ngay_nghi++;
            else cnt.ngay_thuong++;
        }
        const detail =
            pr.luong_chinh_detail && typeof pr.luong_chinh_detail === 'object'
                ? pr.luong_chinh_detail
                : null;
        const defOf = (k) => {
            const v = detail ? Number(detail[k]) || 0 : cnt[k] || 0;
            return v || '';
        };
        const rowHtml = (r) => `
            <tr>
                <td><b>${r.label}</b>${r.sub ? `<div class="cc-tpl-otsub">${r.sub}</div>` : ''}</td>
                <td class="num">${Math.round(dayRate).toLocaleString('vi-VN')}</td>
                <td class="num">${cnt[r.k] || 0}</td>
                <td class="num"><input class="cc-tpl-oth" type="number" min="0" step="0.5" data-k="${r.k}" value="${defOf(r.k)}" placeholder="0"></td>
                <td class="num" data-money="${r.k}">-</td>
            </tr>`;
        const inner = `
            <div class="cc-tpl-subline">Loại lương: Theo ngày công chuẩn &nbsp;·&nbsp; Ngày công chuẩn: ${days.length} &nbsp;·&nbsp; Mức lương: ${fmt(dayRate * days.length)}</div>
            <table class="cc-tpl-ot">
              <thead><tr><th>Ngày</th><th class="num">Lương mỗi ngày</th><th class="num">Số ngày chấm công</th><th class="num">Số ngày tính lương</th><th class="num">Thành tiền</th></tr></thead>
              <tbody>${LC_ROWS.map(rowHtml).join('')}</tbody>
            </table>
            <div class="cc-tpl-total"><span>Tổng lương chính</span><b id="ccTplTotal">-</b></div>
            <div class="cc-tpl-hint">Chấm công đủ Vào/Ra = trọn lương ngày. Sửa "Số ngày tính lương" = chốt số công tay (xoá hết để quay về tự động — phạt muộn auto sẽ bỏ khi chốt tay).</div>`;
        const { mount, close } = tplShell('Lương chính', R.name, inner);
        const inputs = [...mount.querySelectorAll('.cc-tpl-oth')];
        let dirty = false;
        const recompute = () => {
            let totalDays = 0;
            inputs.forEach((i) => {
                const d = parseFloat(i.value) || 0;
                totalDays += d;
                const cell = mount.querySelector(`[data-money="${i.dataset.k}"]`);
                if (cell) cell.textContent = d ? fmt(Math.round(d * dayRate)) : '-';
            });
            const totalEl = document.getElementById('ccTplTotal');
            if (totalEl)
                totalEl.textContent = totalDays ? fmt(Math.round(totalDays * dayRate)) : '-';
            return totalDays;
        };
        inputs.forEach((i) =>
            i.addEventListener('input', () => {
                dirty = true;
                recompute();
            })
        );
        recompute();
        document.getElementById('ccTplDone').onclick = async () => {
            if (!dirty) return close(); // không đổi gì → không lưu (giữ auto)
            const detailOut = {};
            let totalDays = 0;
            inputs.forEach((i) => {
                const d = parseFloat(i.value) || 0;
                detailOut[i.dataset.k] = d;
                totalDays += d;
            });
            await saveInline(
                uid,
                pr,
                totalDays > 0
                    ? {
                          salaryDaysOverride: Math.round(totalDays * 100) / 100,
                          luongChinhDetail: detailOut,
                      }
                    : { salaryDaysOverride: null, luongChinhDetail: null }
            );
            close();
        };
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
