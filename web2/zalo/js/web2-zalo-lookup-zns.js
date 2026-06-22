// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang Zalo — tab Tra cứu (xem thông tin người dùng / thông tin của tôi)
// + tab ZNS (load template, gửi ZNS, lịch sử log).
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { $, esc, notify, avatarHtml, setBusy, fmtTime, state } = WZApp;

    // ===================================================================
    // LOOKUP (xem thông tin người khác)
    // ===================================================================
    async function doLookup() {
        const accountKey = $('#wzLookupAccount').value;
        const phone = $('#wzLookupPhone').value.trim();
        const box = $('#wzLookupResult');
        if (!accountKey) return notify('Chọn tài khoản Zalo (cá nhân, đã kết nối)', 'warning');
        if (!phone) return notify('Nhập SĐT cần tra cứu', 'warning');
        box.innerHTML = `<div class="wz-loading">Đang tra cứu…</div>`;
        try {
            const res = await window.ZaloApi.lookup({ accountKey, phone });
            const u = res.data?.profile || res.data || {};
            if (!u || (!u.displayName && !u.zaloName && !u.uid && !u.userId)) {
                box.innerHTML = `<div class="wz-empty">Không tìm thấy người dùng Zalo với SĐT này</div>`;
                return;
            }
            box.innerHTML = `<div class="wz-lookup-result">
                ${avatarHtml(u.avatar, u.displayName || u.zaloName, 'wz-acc-avatar', 'width:64px;height:64px;font-size:24px;border-radius:18px')}
                <div>
                    <div style="font-weight:700;font-size:16px">${esc(u.displayName || u.zaloName || '—')}</div>
                    <div class="wz-acc-sub">UID: ${esc(u.userId || u.uid || '—')}</div>
                    ${u.phoneNumber ? `<div class="wz-acc-sub">SĐT: ${esc(u.phoneNumber)}</div>` : ''}
                    ${u.gender != null ? `<div class="wz-acc-sub">Giới tính: ${u.gender === 0 ? 'Nam' : 'Nữ'}</div>` : ''}
                    ${u.sdob || u.dob ? `<div class="wz-acc-sub">Sinh nhật: ${esc(u.sdob || u.dob)}</div>` : ''}
                </div>
            </div>`;
        } catch (e) {
            box.innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    async function showSelf() {
        const accountKey = $('#wzLookupAccount').value;
        const box = $('#wzLookupResult');
        if (!accountKey) return notify('Chọn tài khoản', 'warning');
        box.innerHTML = `<div class="wz-loading">Đang tải…</div>`;
        try {
            const res = await window.ZaloApi.self(accountKey);
            const u = res.data?.profile || res.data || {};
            box.innerHTML = `<div class="wz-lookup-result">
                ${avatarHtml(u.avatar, u.displayName || u.zaloName || 'Tôi', 'wz-acc-avatar', 'width:64px;height:64px;font-size:24px;border-radius:18px')}
                <div>
                    <div style="font-weight:700;font-size:16px">${esc(u.displayName || u.zaloName || 'Tôi')}</div>
                    <div class="wz-acc-sub">UID: ${esc(u.userId || u.uid || '—')}</div>
                    ${u.phoneNumber ? `<div class="wz-acc-sub">SĐT: ${esc(u.phoneNumber)}</div>` : ''}
                </div>
            </div>`;
        } catch (e) {
            box.innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    // ===================================================================
    // ZNS
    // ===================================================================
    async function loadTemplates() {
        try {
            const res = await window.ZaloApi.znsTemplates();
            state.zns.templates = res.data || [];
            const sel = $('#wzZnsTemplate');
            sel.innerHTML =
                `<option value="">— Chọn template —</option>` +
                state.zns.templates
                    .map(
                        (t) =>
                            `<option value="${esc(t.template_id)}">${esc(t.template_name)} (${esc(t.template_id)})</option>`
                    )
                    .join('');
            $('#wzZnsTplCount').textContent = state.zns.templates.length;
            if (!sel._wzBound) {
                sel.addEventListener('change', renderZnsFields);
                sel._wzBound = true;
            }
            renderZnsFields();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    // params của 1 template có thể là array [{name,...}] hoặc đã JSON-encode string.
    function _tplParams(t) {
        let p = t && t.params;
        if (typeof p === 'string') {
            try {
                p = JSON.parse(p);
            } catch {
                p = [];
            }
        }
        if (!Array.isArray(p)) return [];
        // chuẩn hoá tên param (Zalo: {name, require, type, sample_value})
        return p
            .map((x) =>
                typeof x === 'string'
                    ? { name: x, require: false }
                    : {
                          name: x.name || x.param || x.key || '',
                          require: !!(x.require ?? x.required),
                          type: x.type || '',
                          sample: x.sample_value || x.sample || '',
                      }
            )
            .filter((x) => x.name);
    }

    // Render 1 ô nhập / tham số của template đang chọn. Không có param → ẩn form,
    // dùng JSON thủ công (details). Có param → form là nguồn chính.
    function renderZnsFields() {
        const box = $('#wzZnsFields');
        const raw = $('#wzZnsRaw');
        if (!box) return;
        const tid = $('#wzZnsTemplate').value;
        const tpl = state.zns.templates.find((t) => String(t.template_id) === String(tid));
        const params = tpl ? _tplParams(tpl) : [];
        if (!params.length) {
            box.innerHTML = '';
            box.hidden = true;
            if (raw) raw.open = !!tid; // không có metadata param → mở sẵn ô JSON
            return;
        }
        box.hidden = false;
        if (raw) raw.open = false;
        box.innerHTML =
            `<div class="wz-zns-fields-hd">Điền nội dung (${params.length} trường)</div>` +
            params
                .map(
                    (p) => `<div class="wz-field wz-zns-f">
                        <label>${esc(p.name)}${p.require ? ' <span class="req">*</span>' : ''}</label>
                        <input type="${p.type === 'NUMBER' ? 'number' : 'text'}"
                            data-zns-param="${esc(p.name)}" data-req="${p.require ? '1' : ''}"
                            placeholder="${esc(p.sample || p.name)}" autocomplete="off">
                    </div>`
                )
                .join('');
    }

    // Thu data từ form động. Trả {data, error}. error != null → dừng gửi.
    function _collectZnsData() {
        const box = $('#wzZnsFields');
        if (box && !box.hidden && box.querySelector('[data-zns-param]')) {
            const data = {};
            for (const el of box.querySelectorAll('[data-zns-param]')) {
                const key = el.dataset.znsParam;
                const val = el.value.trim();
                if (!val && el.dataset.req) return { data: null, error: `Thiếu trường "${key}"` };
                if (val) data[key] = val;
            }
            return { data, error: null };
        }
        // fallback: JSON thủ công
        const rawTxt = ($('#wzZnsData').value || '').trim();
        if (!rawTxt) return { data: {}, error: null };
        try {
            return { data: JSON.parse(rawTxt), error: null };
        } catch {
            return { data: null, error: 'template_data phải là JSON hợp lệ' };
        }
    }

    async function sendZns() {
        const phone = $('#wzZnsPhone').value.trim();
        const templateId = $('#wzZnsTemplate').value;
        const errEl = $('#wzZnsErr');
        errEl.textContent = '';
        if (!phone || !templateId) {
            errEl.textContent = 'Cần SĐT và template';
            return;
        }
        const { data, error } = _collectZnsData();
        if (error) {
            errEl.textContent = error;
            return;
        }
        const btn = $('#wzZnsSend');
        setBusy(btn, true);
        try {
            const sentBy = window.Web2UserInfo?.get?.('web2/zalo')?.userName || null;
            await window.ZaloApi.sendZns({ phone, templateId, data, sentBy });
            notify('Đã gửi ZNS', 'success');
            $('#wzZnsPhone').value = '';
            $('#wzZnsData').value = '';
            $('#wzZnsFields')
                ?.querySelectorAll('[data-zns-param]')
                .forEach((el) => (el.value = ''));
            loadZnsLog();
        } catch (e) {
            errEl.textContent = e.message;
        } finally {
            setBusy(btn, false);
        }
    }

    async function loadZnsLog() {
        try {
            const res = await window.ZaloApi.znsLog({ limit: 50 });
            const rows = res.data || [];
            $('#wzZnsLog').innerHTML = !rows.length
                ? `<div class="wz-empty">Chưa có log ZNS</div>`
                : `<table class="wz-table"><thead><tr><th>Thời gian</th><th>SĐT</th><th>Template</th><th>Trạng thái</th></tr></thead><tbody>` +
                  rows
                      .map(
                          (r) => `<tr>
                    <td>${fmtTime(r.created_at)}</td>
                    <td>${esc(r.phone)}</td>
                    <td>${esc(r.template_id)}</td>
                    <td><span class="wz-chip ${esc(r.status)}">${esc(r.status)}</span>${r.error_msg ? ' <span class="wz-err" style="font-size:11px">' + esc(String(r.error_msg).slice(0, 40)) + '</span>' : ''}</td>
                </tr>`
                      )
                      .join('') +
                  `</tbody></table>`;
        } catch (e) {
            $('#wzZnsLog').innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    // ── Export ─────────────────────────────────────────────────────────────
    WZApp.doLookup = doLookup;
    WZApp.showSelf = showSelf;
    WZApp.loadTemplates = loadTemplates;
    WZApp.sendZns = sendZns;
    WZApp.loadZnsLog = loadZnsLog;
})();
