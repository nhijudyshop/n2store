// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.
// =====================================================================
// Web2CkAssignPicker — đơn native chưa nhận CK → bấm → modal chọn 1 giao dịch
// SePay (balance-history) gán cho KH của đơn (cộng ví → tự áp vào đơn). Tìm theo
// nội dung (mặc định = tên KH, sửa được). Mặc định chỉ hiện GD chưa gán + tiền vào.
//   Web2CkAssignPicker.open({ phone, name, total, orderCode, onDone })
// =====================================================================
(function (global) {
    'use strict';
    if (typeof window === 'undefined' || global.Web2CkAssignPicker) return;

    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const FALLBACK =
        (window.API_CONFIG && window.API_CONFIG.WEB2_API) || 'https://web2-api-kv04.onrender.com';
    const BH = '/api/web2/balance-history';

    function esc(v) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(v);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(v);
        const d = document.createElement('div');
        d.textContent = String(v ?? '');
        return d.innerHTML;
    }
    function fmtVnd(n) {
        if (global.Web2Format) return global.Web2Format.num(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN');
    }
    function fmtDate(v) {
        if (global.Web2Format) return global.Web2Format.dateTime(v);
        if (!v) return '';
        const d = new Date(v);
        return Number.isNaN(d.getTime())
            ? ''
            : d.toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
              });
    }
    function toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
    }
    function last9(p) {
        const s = String(p || '').replace(/\D/g, '');
        return s.length >= 9 ? s.slice(-9) : '';
    }
    // GET balance-history (chứa nội dung CK = PII KH) → gắn x-web2-token cho nhất quán với write
    // + để backend gate được khi cần (header thừa vô hại nếu route chưa enforce read).
    async function getJSON(path) {
        for (const base of [PROXY, FALLBACK]) {
            try {
                const r = await fetch(base + path, {
                    headers: authHeaders(),
                    credentials: 'include',
                });
                if (r.ok) return await r.json();
            } catch (e) {
                /* next base */
            }
        }
        return null;
    }
    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho PATCH /api/web2/balance-history/:id/link
    // (soft-gate → WEB2_AUTH_ENFORCE=1). Fallback đọc localStorage nếu page không load web2-auth.js.
    function authHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    async function patchJSON(path, body) {
        let last = null;
        for (const base of [PROXY, FALLBACK]) {
            try {
                const r = await fetch(base + path, {
                    method: 'PATCH',
                    headers: authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
                last = await r.json().catch(() => ({}));
                if (r.ok && last?.success) return last;
            } catch (e) {
                /* next base */
            }
        }
        return last || { success: false, error: 'request failed' };
    }

    let _el = null;
    let _ctx = null;
    let _unassignedOnly = true;
    let _searchTimer = null; // debounce timer — cleared in close() để load() không chạy khi modal đã đóng

    function ensureDom() {
        if (_el) return _el;
        const style = document.createElement('style');
        style.textContent = `
            .w2cap-ov{position:fixed;inset:0;z-index:9200;display:flex;align-items:center;justify-content:center;}
            .w2cap-ov[hidden]{display:none;}
            .w2cap-bd{position:absolute;inset:0;background:rgba(15,23,42,.45);}
            .w2cap-panel{position:relative;background:#fff;width:min(640px,94vw);max-height:88vh;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.2);}
            .w2cap-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid #e2e8f0;}
            .w2cap-title{font-weight:700;font-size:15px;color:#0f172a;}
            .w2cap-sub{font-size:12px;color:#64748b;margin-top:2px;}
            .w2cap-x{background:none;border:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;}
            .w2cap-tools{display:flex;gap:8px;align-items:center;padding:10px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;}
            .w2cap-search{flex:1;min-width:160px;height:36px;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:13px;}
            .w2cap-chk{font-size:12px;color:#475569;display:inline-flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;}
            .w2cap-list{overflow:auto;padding:10px 14px;display:grid;gap:8px;}
            .w2cap-row{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;cursor:pointer;transition:border-color .12s,box-shadow .12s;}
            .w2cap-row:hover{border-color:#14b8a6;box-shadow:0 1px 6px rgba(20,184,166,.18);}
            .w2cap-row.match{border-color:#34d399;background:#f0fdf4;}
            .w2cap-row.linked{opacity:.7;}
            .w2cap-amt{font-weight:700;color:#047857;font-size:14px;}
            .w2cap-amt.match::after{content:' · khớp tiền đơn';color:#059669;font-size:11px;font-weight:600;}
            .w2cap-content{font-size:12px;color:#475569;margin-top:3px;word-break:break-word;}
            .w2cap-meta{font-size:11px;color:#94a3b8;margin-top:3px;}
            .w2cap-tag{font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:6px;}
            .w2cap-tag.linked{background:#fef3c7;color:#92400e;}
            .w2cap-empty{text-align:center;color:#94a3b8;padding:30px;font-size:13px;}
        `;
        document.head.appendChild(style);
        _el = document.createElement('div');
        _el.className = 'w2cap-ov';
        _el.hidden = true;
        _el.innerHTML = `
            <div class="w2cap-bd" data-close></div>
            <div class="w2cap-panel">
                <div class="w2cap-head">
                    <div>
                        <div class="w2cap-title" id="w2capTitle">Gán giao dịch CK</div>
                        <div class="w2cap-sub" id="w2capSub"></div>
                    </div>
                    <button class="w2cap-x" data-close aria-label="Đóng">&times;</button>
                </div>
                <div class="w2cap-tools">
                    <input class="w2cap-search" id="w2capSearch" placeholder="Tìm theo tên / nội dung / SĐT…" />
                    <label class="w2cap-chk"><input type="checkbox" id="w2capUnassigned" checked /> Chỉ GD chưa gán</label>
                </div>
                <div class="w2cap-list" id="w2capList"></div>
            </div>`;
        document.body.appendChild(_el);
        _el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
        const se = _el.querySelector('#w2capSearch');
        se.oninput = () => {
            if (_searchTimer) clearTimeout(_searchTimer);
            _searchTimer = setTimeout(load, 350);
        };
        _el.querySelector('#w2capUnassigned').onchange = (e) => {
            _unassignedOnly = e.target.checked;
            load();
        };
        return _el;
    }

    function close() {
        if (_searchTimer) {
            clearTimeout(_searchTimer);
            _searchTimer = null;
        }
        if (_el) _el.hidden = true;
        document.body.style.overflow = '';
        _ctx = null;
    }

    async function load() {
        // Guard: modal đã đóng (close() xoá _ctx) → bỏ qua load() đang chờ debounce
        if (!_ctx || !_el || _el.hidden) return;
        const list = _el.querySelector('#w2capList');
        list.innerHTML = '<div class="w2cap-empty">Đang tải…</div>';
        const q = _el.querySelector('#w2capSearch').value.trim();
        const params = new URLSearchParams({ limit: '30' });
        if (_unassignedOnly) params.set('status', 'NO_PHONE');
        if (q) params.set('search', q);
        const d = await getJSON(`${BH}?${params.toString()}`);
        let rows = (d?.data || []).filter((r) => (r.transfer_type || 'in') === 'in');
        if (!rows.length) {
            list.innerHTML = '<div class="w2cap-empty">Không có giao dịch phù hợp.</div>';
            return;
        }
        const total = Number(_ctx?.total || 0);
        list.innerHTML = rows
            .map((r) => {
                const amt = Number(r.transfer_amount) || 0;
                const isMatch = total > 0 && amt === total;
                const linked = r.linked_customer_phone;
                return `
                <div class="w2cap-row${isMatch ? ' match' : ''}${linked ? ' linked' : ''}" data-id="${r.id}" data-amt="${amt}" data-linked="${esc(linked || '')}">
                    <div class="w2cap-amt${isMatch ? ' match' : ''}">+${fmtVnd(amt)}₫</div>
                    <div class="w2cap-content">${esc((r.content || '').slice(0, 140))}</div>
                    <div class="w2cap-meta">${esc(fmtDate(r.transaction_date))}${
                        linked ? `<span class="w2cap-tag linked">đã gán: ${esc(linked)}</span>` : ''
                    }</div>
                </div>`;
            })
            .join('');
        list.querySelectorAll('[data-id]').forEach((row) => {
            row.onclick = () => pick(row);
        });
    }

    async function pick(row) {
        const id = row.dataset.id;
        const amt = Number(row.dataset.amt) || 0;
        const linked = row.dataset.linked;
        if (linked && last9(linked) !== last9(_ctx.phone)) {
            // GD đã gán cho SĐT khác → không thể gán lại trực tiếp (phải dùng "Đổi KH" ở trang Số dư).
            // Chỉ thông báo; mọi lựa chọn đều là no-op (xác nhận = bỏ qua, huỷ = ở lại). Không gán.
            await global.Popup.confirm(
                `Giao dịch này đã gán cho SĐT ${linked}. Không thể gán lại trực tiếp — dùng "Đổi KH" ở trang Số dư.`
            );
            return;
        }
        if (
            !(await global.Popup.confirm(
                `Gán giao dịch +${fmtVnd(amt)}₫ cho ${_ctx.name || _ctx.phone}?`
            ))
        )
            return;
        row.style.pointerEvents = 'none';
        row.style.opacity = '.5';
        const userName =
            (global.Web2UserInfo?.get && global.Web2UserInfo.get()?.userName) || 'staff';
        const r = await patchJSON(`${BH}/${encodeURIComponent(id)}/link`, {
            phone: _ctx.phone,
            name: _ctx.name || null,
            verifiedBy: userName + ' (gán từ đơn)',
        });
        if (r?.success) {
            toast('Đã gán giao dịch + cộng ví cho khách', 'success');
            const cb = _ctx.onDone;
            close();
            if (typeof cb === 'function') cb();
        } else {
            row.style.pointerEvents = '';
            row.style.opacity = '';
            toast(r?.error || 'Gán thất bại', 'error');
        }
    }

    function open(ctx) {
        if (!ctx || !ctx.phone) {
            toast('Đơn chưa có SĐT khách — không gán được giao dịch', 'error');
            return;
        }
        _ctx = ctx;
        _unassignedOnly = true;
        ensureDom();
        _el.querySelector('#w2capTitle').textContent = `Gán CK cho đơn ${ctx.orderCode || ''}`;
        _el.querySelector('#w2capSub').textContent =
            `${ctx.name || ''} · ${ctx.phone} · cần thu ${fmtVnd(ctx.total || 0)}₫`;
        const se = _el.querySelector('#w2capSearch');
        se.value = ctx.name || ctx.phone || ''; // mặc định tìm theo tên KH (sửa được)
        _el.querySelector('#w2capUnassigned').checked = true;
        _el.hidden = false;
        document.body.style.overflow = 'hidden';
        load();
        setTimeout(() => se.focus(), 50);
    }

    global.Web2CkAssignPicker = { open };
})(window);
