// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Chấm công: tab Nhân viên (gán PIN máy ↔ web2_users + cấu hình ca/lương).
// =====================================================================
// Bảng cấu hình NV máy: gán employee_id (web2_users), lương/ngày, giờ ca,
// phạt muộn/phút, hệ số OT, CN đủ công, active. Lưu PATCH /device-users/:id.
// =====================================================================

(function (global) {
    'use strict';

    function CC() {
        return global.ChamCong;
    }

    function render() {
        const cc = CC();
        const el = document.getElementById('ccBody');
        if (!el) return;
        if (cc.state.loading) {
            el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            return;
        }
        const dus = cc.state.deviceUsers;
        if (!dus.length) {
            el.innerHTML = `<div class="cc-empty">
                <p>Chưa có nhân viên từ máy chấm công.</p>
                <p class="cc-empty-hint">Khi agent đồng bộ máy hoặc ADMS push punch, danh sách PIN sẽ tự xuất hiện ở đây để gán nhân viên.</p>
            </div>`;
            return;
        }
        const empOptions = (selId) =>
            ['<option value="">— Chưa gán —</option>']
                .concat(
                    cc.state.employees.map(
                        (e) =>
                            `<option value="${e.id}" ${String(e.id) === String(selId) ? 'selected' : ''}>${cc.esc(e.displayName || e.username)}</option>`
                    )
                )
                .join('');

        let rows = '';
        for (const du of dus) {
            rows += `<tr data-uid="${cc.esc(du.device_user_id)}">
                <td class="cc-emp-pin">${cc.esc(du.device_user_id)}<span class="cc-emp-mname">${cc.esc(du.name || '')}</span></td>
                <td><input class="cc-emp-dn" value="${cc.esc(du.display_name || '')}" placeholder="${cc.esc(du.name || '')}"></td>
                <td><select class="cc-emp-emp">${empOptions(du.employee_id)}</select></td>
                <td><input class="cc-emp-rate num" type="number" value="${Number(du.daily_rate) || 0}"></td>
                <td><input class="cc-emp-ws" type="time" value="${du.work_start || '08:00'}"></td>
                <td><input class="cc-emp-we" type="time" value="${du.work_end || '20:00'}"></td>
                <td><input class="cc-emp-late num" type="number" value="${Number(du.late_penalty_per_min) || 0}"></td>
                <td><input class="cc-emp-ot num" type="number" step="0.5" value="${Number(du.ot_multiplier) || 1}"></td>
                <td class="ctr"><input class="cc-emp-active" type="checkbox" ${du.active !== false ? 'checked' : ''}></td>
                <td><button class="cc-btn cc-btn-primary cc-emp-save">Lưu</button></td>
            </tr>`;
        }
        el.innerHTML = `
          <div class="cc-emp-hint">Gán mỗi PIN máy vào 1 nhân viên Web 2.0, đặt lương/ngày + giờ ca. Mốc <b>giờ ra</b> cũng là mốc bắt đầu tính tăng ca (OT).</div>
          <div class="cc-grid-wrap">
            <table class="cc-emp">
              <thead><tr>
                <th>PIN máy</th><th>Tên hiển thị</th><th>Gán NV</th><th>Lương/ngày</th>
                <th>Giờ vào</th><th>Giờ ra</th><th>Phạt muộn/phút</th><th>Hệ số OT</th><th>Bật</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
        el.querySelectorAll('.cc-emp-save').forEach((b) => {
            b.addEventListener('click', () => saveRow(b.closest('tr')));
        });
    }

    async function saveRow(tr) {
        const cc = CC();
        const uid = tr.dataset.uid;
        const body = {
            display_name: tr.querySelector('.cc-emp-dn').value.trim(),
            employee_id: tr.querySelector('.cc-emp-emp').value || null,
            daily_rate: Number(tr.querySelector('.cc-emp-rate').value) || 0,
            work_start: tr.querySelector('.cc-emp-ws').value || '08:00',
            work_end: tr.querySelector('.cc-emp-we').value || '20:00',
            late_penalty_per_min: Number(tr.querySelector('.cc-emp-late').value) || 0,
            ot_multiplier: Number(tr.querySelector('.cc-emp-ot').value) || 1,
            active: tr.querySelector('.cc-emp-active').checked,
        };
        const btn = tr.querySelector('.cc-emp-save');
        btn.disabled = true;
        btn.textContent = '…';
        try {
            await cc.Api.patchDeviceUser(uid, body);
            cc.toast('Đã lưu cấu hình NV.', 'success');
            // cập nhật state cục bộ (tránh reload nguyên trang).
            const idx = cc.state.deviceUsers.findIndex((d) => d.device_user_id === uid);
            if (idx >= 0) cc.state.deviceUsers[idx] = { ...cc.state.deviceUsers[idx], ...body };
        } catch (e) {
            cc.toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Lưu';
        }
    }

    global.ChamCongEmployees = { render };
})(window);
