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
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    async function sendZns() {
        const phone = $('#wzZnsPhone').value.trim();
        const templateId = $('#wzZnsTemplate').value;
        const raw = $('#wzZnsData').value.trim();
        const errEl = $('#wzZnsErr');
        errEl.textContent = '';
        if (!phone || !templateId) {
            errEl.textContent = 'Cần SĐT và template';
            return;
        }
        let data = {};
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch {
                errEl.textContent = 'template_data phải là JSON hợp lệ';
                return;
            }
        }
        const btn = $('#wzZnsSend');
        setBusy(btn, true);
        try {
            const sentBy = window.Web2UserInfo?.get?.('web2/zalo')?.userName || null;
            await window.ZaloApi.sendZns({ phone, templateId, data, sentBy });
            notify('Đã gửi ZNS', 'success');
            $('#wzZnsPhone').value = '';
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
