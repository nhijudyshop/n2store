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

    // Banner "có thay đổi chưa lưu" — toggle hiển thị.
    function setDirtyBanner(on) {
        const b = document.getElementById('ccEmpDirty');
        if (b) b.style.display = on ? 'flex' : 'none';
    }
    // Gắn theo dõi sửa: gõ/đổi bất kỳ ô nào trong bảng → đánh dấu dirty + hiện banner.
    function wireDirty(el) {
        const cc = CC();
        const tbl = el.querySelector('.cc-emp');
        if (!tbl) return;
        const mark = () => {
            if (!cc.state.empDirty) {
                cc.state.empDirty = true;
                setDirtyBanner(true);
            }
        };
        tbl.addEventListener('input', mark);
        tbl.addEventListener('change', mark);
    }

    function render(opts) {
        const cc = CC();
        const el = document.getElementById('ccBody');
        if (!el) return;
        // GUARD chống mất chỉnh sửa: đang sửa dở + đây là RELOAD NỀN (không force, vd máy
        // đẩy dữ liệu / SSE) → GIỮ NGUYÊN bảng đang gõ, chỉ nhắc bằng banner. Bấm "Tải lại"
        // hoặc đổi tab/tháng (force=true) mới dựng lại bảng mới.
        if (!(opts && opts.force) && cc.state.empDirty && el.querySelector('.cc-emp')) {
            setDirtyBanner(true);
            return;
        }
        cc.state.empDirty = false; // dựng bảng mới = sạch
        if (cc.state.loading) {
            // First-load only (loading chỉ bật khi load lạnh / đổi tháng) → skeleton bảng
            // cấu hình NV 12 cột; reload nền không bật loading nên không flash.
            if (global.Web2Skeleton) global.Web2Skeleton.table(el, { rows: 6, cols: 12 });
            else el.innerHTML = `<div class="cc-empty">Đang tải…</div>`;
            return;
        }
        const dus = cc.state.deviceUsers;
        if (!dus.length) {
            el.innerHTML = `<div class="cc-emp-top">
                <div class="cc-emp-hint">Chưa có NV từ máy. Có thể <b>thêm NV thủ công</b> cho người không bấm máy DG-600.</div>
                <button class="cc-btn cc-btn-ghost cc-emp-addmanual" type="button"><i data-lucide="user-plus"></i> Thêm NV thủ công</button>
              </div>
              <div class="cc-empty">
                <p>Chưa có nhân viên từ máy chấm công.</p>
                <p class="cc-empty-hint">Khi agent đồng bộ máy hoặc ADMS push punch, danh sách PIN sẽ tự xuất hiện ở đây để gán nhân viên.</p>
            </div>`;
            el.querySelector('.cc-emp-addmanual')?.addEventListener('click', addManual);
            if (global.lucide?.createIcons) global.lucide.createIcons();
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
            const isManual = String(du.device_user_id).startsWith('MANUAL-');
            const pinCell = isManual
                ? `<span class="cc-emp-manual-pill">Thủ công</span>`
                : `${cc.esc(du.device_user_id)}<span class="cc-emp-mname">${cc.esc(du.name || '')}</span>`;
            const isMonthly = du.salary_type === 'monthly';
            const grace = du.grace_minutes != null ? Number(du.grace_minutes) : 6;
            rows += `<tr data-uid="${cc.esc(du.device_user_id)}">
                <td class="cc-emp-pin">${pinCell}</td>
                <td><input class="cc-emp-dn" value="${cc.esc(du.display_name || '')}" placeholder="${cc.esc(du.name || '')}"></td>
                <td><select class="cc-emp-emp">${empOptions(du.employee_id)}</select></td>
                <td><input class="cc-emp-rate num" type="number" value="${Number(du.daily_rate) || 0}"></td>
                <td><select class="cc-emp-stype">
                    <option value="daily" ${isMonthly ? '' : 'selected'}>Ngày</option>
                    <option value="monthly" ${isMonthly ? 'selected' : ''}>Tháng</option>
                </select></td>
                <td><input class="cc-emp-ws cc-time24" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${du.work_start || '08:00'}"></td>
                <td><input class="cc-emp-we cc-time24" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${du.work_end || '20:00'}"></td>
                <td><input class="cc-emp-late num" type="number" value="${Number(du.late_penalty_per_min) || 0}"></td>
                <td><input class="cc-emp-grace num" type="number" min="0" value="${grace}"></td>
                <td><input class="cc-emp-ot num" type="number" step="0.5" value="${Number(du.ot_multiplier) || 1}"></td>
                <td class="ctr"><input class="cc-emp-active" type="checkbox" ${du.active !== false ? 'checked' : ''}></td>
                <td class="cc-emp-acts">
                    <button class="cc-btn cc-btn-primary cc-emp-save">Lưu</button>
                    ${isManual ? `<button class="cc-btn cc-btn-danger-link cc-emp-del" title="Xoá NV thủ công">🗑</button>` : ''}
                </td>
            </tr>`;
        }
        el.innerHTML = `
          <div class="cc-emp-top">
            <div class="cc-emp-hint">Gán mỗi PIN máy vào 1 nhân viên Web 2.0. <b>Loại lương</b>: Ngày = lương/ngày × số công; Tháng = lương cố định cả tháng. <b>Dung sai</b> = số phút vào trễ / về sớm bỏ qua (mặc định 6'; vd ca 08:00 vào 08:06, ca 20:00 ra 19:54 vẫn đúng giờ). Mốc <b>giờ ra</b> cũng là mốc bắt đầu tính tăng ca (OT).</div>
            <div class="cc-emp-top-btns">
              <button class="cc-btn cc-btn-ghost cc-emp-addmanual" type="button"><i data-lucide="user-plus"></i> Thêm NV thủ công</button>
              <button class="cc-btn cc-btn-primary cc-emp-saveall" type="button"><i data-lucide="save"></i> Lưu tất cả</button>
            </div>
          </div>
          <div id="ccEmpDirty" style="display:none;align-items:center;gap:8px;margin:0 0 10px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:12.5px;">
            <span>●</span><span><b>Có thay đổi chưa lưu.</b> Bảng tạm dừng tự cập nhật để không mất chỉnh sửa đang gõ. Bấm <b>Lưu</b> rồi <b>Tải lại</b> (↻) để đồng bộ dữ liệu mới từ máy.</span>
          </div>
          <div class="cc-grid-wrap">
            <table class="cc-emp">
              <thead><tr>
                <th>PIN máy</th><th>Tên hiển thị</th><th>Gán NV</th><th>Lương</th><th>Loại lương</th>
                <th>Giờ vào</th><th>Giờ ra</th><th>Phạt muộn/phút</th><th>Dung sai (phút)</th><th>Hệ số OT</th><th>Bật</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
        el.querySelectorAll('.cc-emp-save').forEach((b) => {
            b.addEventListener('click', () => saveRow(b.closest('tr')));
        });
        el.querySelectorAll('.cc-emp-del').forEach((b) => {
            b.addEventListener('click', () => deleteManual(b.closest('tr')));
        });
        el.querySelector('.cc-emp-saveall')?.addEventListener('click', (e) =>
            saveAll(e.currentTarget)
        );
        el.querySelector('.cc-emp-addmanual')?.addEventListener('click', addManual);
        wireDirty(el); // theo dõi sửa dở → guard chống reload nền đè
        if (global.lucide?.createIcons) global.lucide.createIcons();
    }

    // Thêm NV thủ công (không bấm máy DG-600): hỏi tên → tạo PIN 'MANUAL-*' →
    // reload. Sau đó admin gán NV + nhập công qua popup ngày / override bảng lương.
    async function addManual() {
        const cc = CC();
        let name = '';
        if (global.Popup?.prompt) {
            name = await global.Popup.prompt('Tên nhân viên thủ công', {
                placeholder: 'VD: Cô Ba phụ kho',
                okText: 'Tạo',
            });
        } else {
            name = global.prompt('Tên nhân viên thủ công:');
        }
        if (name == null) return; // huỷ
        name = String(name).trim();
        if (!name) return cc.toast('Cần nhập tên nhân viên.', 'warning');
        try {
            await cc.Api.createDeviceUser({ displayName: name });
            cc.toast(`Đã thêm NV thủ công "${name}".`, 'success');
            cc.state.empDirty = false; // hành động chủ động → cho render lại để thấy NV mới
            await cc.loadAll(true);
        } catch (e) {
            cc.toast(e.message, 'error');
        }
    }

    async function deleteManual(tr) {
        const cc = CC();
        const uid = tr.dataset.uid;
        const name = tr.querySelector('.cc-emp-dn')?.value || uid;
        if (
            !(await cc.confirmBox(
                `Xoá NV thủ công "${name}"? (xoá luôn chấm công + lương của NV này)`
            ))
        )
            return;
        try {
            await cc.Api.deleteDeviceUser(uid);
            cc.state.deviceUsers = cc.state.deviceUsers.filter((d) => d.device_user_id !== uid);
            cc.toast('Đã xoá NV thủ công.', 'success');
            cc.state.empDirty = false; // hành động chủ động → render lại
            render({ force: true });
        } catch (e) {
            cc.toast(e.message, 'error');
        }
    }

    // Đọc cấu hình từ 1 hàng <tr> thành body PATCH.
    function rowBody(tr) {
        return {
            display_name: tr.querySelector('.cc-emp-dn').value.trim(),
            employee_id: tr.querySelector('.cc-emp-emp').value || null,
            daily_rate: Number(tr.querySelector('.cc-emp-rate').value) || 0,
            salary_type:
                tr.querySelector('.cc-emp-stype').value === 'monthly' ? 'monthly' : 'daily',
            work_start: tr.querySelector('.cc-emp-ws').value || '08:00',
            work_end: tr.querySelector('.cc-emp-we').value || '20:00',
            late_penalty_per_min: Number(tr.querySelector('.cc-emp-late').value) || 0,
            grace_minutes: Math.max(0, Number(tr.querySelector('.cc-emp-grace').value) || 0),
            ot_multiplier: Number(tr.querySelector('.cc-emp-ot').value) || 1,
            active: tr.querySelector('.cc-emp-active').checked,
        };
    }

    // B3: cảnh báo gán 1 NV cho 2 PIN (Bảng lương sẽ tính lương người đó 2 lần).
    async function checkDupEmp(uid, employeeId) {
        if (!employeeId) return true;
        const cc = CC();
        const dup = cc.state.deviceUsers.find(
            (d) => d.device_user_id !== uid && String(d.employee_id) === String(employeeId)
        );
        if (!dup) return true;
        const e = cc.state.employees.find((x) => String(x.id) === String(employeeId));
        const ename = e ? e.displayName || e.username : 'NV này';
        return await cc.confirmBox(
            `"${ename}" đã gán cho PIN ${dup.device_user_id}. Gán thêm cho PIN ${uid} sẽ tính lương 2 LẦN cho cùng người. Vẫn gán?`
        );
    }
    // B11: giờ ra phải sau giờ vào (chưa hỗ trợ ca qua nửa đêm).
    function validHours(body) {
        return CC().S.hmToMinutes(body.work_end) > CC().S.hmToMinutes(body.work_start);
    }

    async function saveRow(tr) {
        const cc = CC();
        const uid = tr.dataset.uid;
        const body = rowBody(tr);
        if (!validHours(body))
            return cc.toast('Giờ ra phải sau giờ vào (chưa hỗ trợ ca qua nửa đêm).', 'error');
        if (!(await checkDupEmp(uid, body.employee_id))) return;
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

    // Lưu TẤT CẢ hàng: PATCH tuần tự (tránh dội máy chủ), gom kết quả → 1 toast.
    async function saveAll(btn) {
        const cc = CC();
        const trs = Array.from(document.querySelectorAll('.cc-emp tbody tr'));
        if (!trs.length) return;
        // B3: phát hiện 1 NV gán cho nhiều PIN → cảnh báo 1 lần (lương tính trùng).
        const empCount = {};
        for (const tr of trs) {
            const eid = tr.querySelector('.cc-emp-emp')?.value;
            if (eid) empCount[eid] = (empCount[eid] || 0) + 1;
        }
        const dups = Object.keys(empCount).filter((k) => empCount[k] > 1);
        if (dups.length) {
            const names = dups.map((id) => {
                const e = cc.state.employees.find((x) => String(x.id) === id);
                return e ? e.displayName || e.username : id;
            });
            if (
                !(await cc.confirmBox(
                    `Có NV gán cho NHIỀU PIN (${names.join(', ')}) → Bảng lương tính trùng. Vẫn lưu tất cả?`
                ))
            )
                return;
        }
        const orig = btn.innerHTML;
        btn.disabled = true;
        let ok = 0;
        const fails = [];
        for (let i = 0; i < trs.length; i++) {
            const tr = trs[i];
            const uid = tr.dataset.uid;
            btn.textContent = `Đang lưu ${i + 1}/${trs.length}…`;
            try {
                const body = rowBody(tr);
                if (!validHours(body)) {
                    fails.push(uid + ' (giờ)');
                    continue;
                }
                await cc.Api.patchDeviceUser(uid, body);
                const idx = cc.state.deviceUsers.findIndex((d) => d.device_user_id === uid);
                if (idx >= 0) cc.state.deviceUsers[idx] = { ...cc.state.deviceUsers[idx], ...body };
                ok++;
            } catch (e) {
                fails.push(uid);
            }
        }
        btn.disabled = false;
        btn.innerHTML = orig;
        if (global.lucide?.createIcons) global.lucide.createIcons();
        if (fails.length) {
            cc.toast(`Đã lưu ${ok}/${trs.length}. Lỗi PIN: ${fails.join(', ')}`, 'error');
        } else {
            // Tất cả đã lưu → hết "sửa dở", cho phép bảng tự cập nhật lại.
            cc.state.empDirty = false;
            setDirtyBanner(false);
            cc.toast(`Đã lưu tất cả ${ok} nhân viên.`, 'success');
        }
    }

    global.ChamCongEmployees = { render };
})(window);
