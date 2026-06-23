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

    function render() {
        const cc = CC();
        const el = document.getElementById('ccBody');
        if (!el) return;
        if (cc.state.loading) {
            el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            return;
        }
        // Chỉ tính lương cho PIN máy ĐÃ gán nhân viên (đồng bộ với Bảng công).
        const dus = cc.state.deviceUsers.filter((d) => d.active !== false && d.employee_id);
        if (!dus.length) {
            el.innerHTML = `<div class="cc-empty"><p>Chưa có PIN máy nào được gán nhân viên. Vào tab <b>Nhân viên</b> để gán.</p></div>`;
            return;
        }
        let rows = '';
        let tot = { luong: 0, ot: 0, pc: 0, thuong: 0, giam: 0, tong: 0, datra: 0, con: 0 };
        for (const du of dus) {
            const m = computeRow(du);
            tot.luong += m.luongChinh;
            tot.ot += m.lamThem;
            tot.pc += m.phuCap;
            tot.thuong += m.thuong;
            tot.giam += m.giamTru;
            tot.tong += m.tongLuong;
            tot.datra += m.daTra;
            tot.con += m.conCanTra;
            rows += `<tr>
                <td class="cc-pl-name">${cc.esc(cc.empName(du))}</td>
                <td class="num">${m.workedDays}</td>
                <td class="num">${fmt(m.luongChinh)}</td>
                <td class="num ot">${m.lamThem ? '+' + fmt(m.lamThem) : '—'}</td>
                <td class="num">${m.phuCap ? fmt(m.phuCap) : '—'}</td>
                <td class="num thuong">${m.thuong ? '+' + fmt(m.thuong) : '—'}</td>
                <td class="num giam" title="Phạt muộn ${fmt(m.lateDeduction)} + thủ công ${fmt(m.giamTruManual)}">${m.giamTru ? '−' + fmt(m.giamTru) : '—'}</td>
                <td class="num tong">${fmt(m.tongLuong)}</td>
                <td class="num">${m.daTra ? fmt(m.daTra) : '—'}</td>
                <td class="num con ${m.conCanTra > 0 ? 'pos' : ''}">${fmt(m.conCanTra)}</td>
                <td><button class="cc-btn cc-btn-ghost cc-pl-edit" data-uid="${cc.esc(du.device_user_id)}">Sửa</button></td>
            </tr>`;
        }
        el.innerHTML = `
          <div class="cc-grid-wrap">
            <table class="cc-payroll">
              <thead><tr>
                <th>Nhân viên</th><th>Công</th><th>Lương chính</th><th>Tăng ca</th>
                <th>Phụ cấp</th><th>Thưởng</th><th>Giảm trừ</th><th>Tổng lương</th>
                <th>Đã trả</th><th>Còn lại</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr>
                <td>TỔNG (${dus.length} NV)</td><td></td>
                <td class="num">${fmt(tot.luong)}</td><td class="num ot">${fmt(tot.ot)}</td>
                <td class="num">${fmt(tot.pc)}</td><td class="num thuong">${fmt(tot.thuong)}</td>
                <td class="num giam">${fmt(tot.giam)}</td><td class="num tong">${fmt(tot.tong)}</td>
                <td class="num">${fmt(tot.datra)}</td><td class="num con">${fmt(tot.con)}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
          <div class="cc-pl-actions">
            <button class="cc-btn cc-btn-ghost" id="ccExportPayroll"><i data-lucide="download"></i> Xuất Excel bảng lương</button>
          </div>`;
        el.querySelectorAll('.cc-pl-edit').forEach((b) => {
            b.addEventListener('click', () => openEdit(b.dataset.uid));
        });
        document.getElementById('ccExportPayroll')?.addEventListener('click', exportPayroll);
        if (global.lucide) global.lucide.createIcons();
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
            <div class="cc-modal cc-modal-lg">
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
            const dus = cc.state.deviceUsers.filter((d) => d.active !== false && d.employee_id);
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
            for (const du of dus) {
                const m = computeRow(du);
                aoa.push([
                    cc.empName(du),
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
