// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — smart customer search modal cho balance-history.
// =====================================================================
// Web2LinkCustomerModal — search KH qua kho warehouse Web 2.0.
// Server-side filter $top=20 + contains(Name|Phone, query) → fast,
// không tải hết. Click row → PATCH /api/web2/balance-history/:id/link.
// =====================================================================

(function (global) {
    'use strict';

    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    const BASE =
        (global.API_CONFIG?.WORKER_URL ||
            global.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/balance-history';
    const DIRECT_BASE =
        (global.WEB2_CONFIG?.WEB2_API || 'https://web2-api-kv04.onrender.com') +
        '/api/web2/balance-history';

    let _modal = null;
    let _activeTxId = null;
    let _searchTimer = null;
    let _searchSeq = 0;

    function escapeHtml(v) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(v);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(v); // 1 nguồn
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n); // 1 nguồn (₫)
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho PATCH /api/web2/balance-history/:id/link
    // (soft-gate → WEB2_AUTH_ENFORCE=1). Choke point: jsonFetch.
    function authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    async function jsonFetch(url, options) {
        const opts = { ...(options || {}), headers: authHeaders((options || {}).headers) }; // ENFORCE-PREP (2026-06-12)
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            throw new Error(
                (body && body.error) ||
                    (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`)
            );
        }
        return body;
    }

    function ensureStyles() {
        if (document.getElementById('w2lcm-styles')) return;
        const s = document.createElement('style');
        s.id = 'w2lcm-styles';
        s.textContent = `
            .w2lcm-modal { position: fixed; inset: 0; z-index: 9998; display: flex; align-items: center; justify-content: center; }
            .w2lcm-modal[hidden] { display: none; }
            .w2lcm-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2lcm-panel { position: relative; background: #fff; border-radius: 10px; width: min(640px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(15,23,42,.32); overflow: hidden; }
            .w2lcm-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
            .w2lcm-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2lcm-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; padding: 4px 8px; }
            .w2lcm-info { margin: 10px 18px 0; font-size: 12px; color: #475569; padding: 8px 12px; background: #ecfeff; border-radius: 6px; border: 1px solid #a5f3fc; }
            .w2lcm-search { padding: 12px 18px 6px; }
            .w2lcm-search input { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; outline: none; }
            .w2lcm-search input:focus { border-color: #0891b2; }
            .w2lcm-body { padding: 6px 12px 12px; overflow-y: auto; flex: 1; min-height: 200px; }
            .w2lcm-hint { color: #94a3b8; font-style: italic; padding: 20px; text-align: center; font-size: 13px; }
            .w2lcm-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: background .12s; border: 1px solid transparent; }
            .w2lcm-row:hover { background: #f0f9ff; border-color: #bfdbfe; }
            .w2lcm-row-info { flex: 1; min-width: 0; }
            .w2lcm-row-name { font-weight: 600; color: #0f172a; font-size: 14px; }
            .w2lcm-row-phone { color: #2563eb; font-size: 12px; margin-top: 2px; }
            .w2lcm-row-meta { color: #6b7280; font-size: 11px; margin-top: 2px; display: flex; gap: 8px; }
            .w2lcm-status { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
            .w2lcm-status.normal { background: #d1fae5; color: #065f46; }
            .w2lcm-status.bom { background: #fee2e2; color: #991b1b; }
            .w2lcm-status.warn { background: #fef3c7; color: #92400e; }
            .w2lcm-status.danger { background: #fecaca; color: #7f1d1d; }
            .w2lcm-status.vip { background: #dbeafe; color: #1e40af; }
            .w2lcm-row-btn { background: #0891b2; color: #fff; border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px; flex-shrink: 0; }
            .w2lcm-row-btn:hover { background: #0e7490; }
            .w2lcm-row-btn:disabled { opacity: .5; }
            .w2lcm-error { color: #b91c1c; padding: 12px; text-align: center; font-size: 13px; }
            .w2lcm-manual { padding: 12px 18px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
            .w2lcm-manual-row { display: flex; gap: 8px; }
            .w2lcm-manual-row input { flex: 1; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
            .w2lcm-manual-row button { background: #fef3c7; color: #92400e; border: 1px dashed #d97706; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .w2lcm-manual-row button:hover { background: #fde68a; }
            .w2lcm-manual-label { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
        `;
        document.head.appendChild(s);
    }

    function ensureModalDom() {
        if (_modal) return _modal;
        const div = document.createElement('div');
        div.id = 'web2LinkCustomerModal';
        div.className = 'w2lcm-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2lcm-backdrop"></div>
            <div class="w2lcm-panel">
                <header class="w2lcm-head">
                    <h3>Gán khách hàng cho giao dịch</h3>
                    <button type="button" class="w2lcm-close" aria-label="Đóng">&times;</button>
                </header>
                <p class="w2lcm-info">Tìm KH trong kho Web 2.0 — gõ ≥ 3 ký tự (SĐT hoặc tên). Click → cộng tiền vào ví Web 2.0.</p>
                <div class="w2lcm-search">
                    <input type="search" placeholder="Gõ SĐT (vd: 0903) hoặc tên KH…" autocomplete="off" />
                </div>
                <div class="w2lcm-body">
                    <div class="w2lcm-hint">Gõ vào ô tìm phía trên</div>
                </div>
                <footer class="w2lcm-manual">
                    <div class="w2lcm-manual-label">Hoặc nhập SĐT thủ công (chưa có trong kho):</div>
                    <div class="w2lcm-manual-row">
                        <input type="tel" placeholder="0901234567" maxlength="11" class="w2lcm-manual-phone" />
                        <input type="text" placeholder="Tên KH (tuỳ chọn)" class="w2lcm-manual-name" />
                        <button type="button" class="w2lcm-manual-submit">Gán</button>
                    </div>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelector('.w2lcm-backdrop').addEventListener('click', closeModal);
        div.querySelector('.w2lcm-close').addEventListener('click', closeModal);
        div.querySelector('.w2lcm-search input').addEventListener('input', onSearchInput);
        div.querySelector('.w2lcm-manual-submit').addEventListener('click', onManualSubmit);
        _modal = div;
        return div;
    }

    function closeModal() {
        if (_modal) _modal.hidden = true;
        _activeTxId = null;
    }

    function openModal(txId, defaultSearch) {
        ensureStyles();
        ensureModalDom();
        _activeTxId = txId;
        _modal.querySelector('.w2lcm-search input').value = defaultSearch || '';
        _modal.querySelector('.w2lcm-manual-phone').value = '';
        _modal.querySelector('.w2lcm-manual-name').value = '';
        _modal.querySelector('.w2lcm-body').innerHTML =
            '<div class="w2lcm-hint">Gõ ≥ 3 ký tự để tìm</div>';
        _modal.hidden = false;
        setTimeout(() => _modal.querySelector('.w2lcm-search input').focus(), 80);
        if (defaultSearch && defaultSearch.length >= 3) {
            runSearch(defaultSearch);
        }
    }

    function onSearchInput(e) {
        const q = e.target.value.trim();
        if (_searchTimer) clearTimeout(_searchTimer);
        if (q.length < 3) {
            _modal.querySelector('.w2lcm-body').innerHTML =
                '<div class="w2lcm-hint">Gõ ≥ 3 ký tự để tìm</div>';
            return;
        }
        _searchTimer = setTimeout(() => runSearch(q), 350);
    }

    async function runSearch(query) {
        const body = _modal.querySelector('.w2lcm-body');
        body.innerHTML = '<div class="w2lcm-hint">Đang tìm trong WEB2…</div>';
        const mySeq = ++_searchSeq;
        try {
            if (!window.PartnerCustomerApi?.list) {
                throw new Error('PartnerCustomerApi chưa load');
            }
            // Kho warehouse Web 2.0 — server-side filter
            const result = await window.PartnerCustomerApi.list({
                top: 20,
                search: query,
                orderby: 'DateCreated desc',
            });
            if (mySeq !== _searchSeq) return; // stale
            const items = result?.value || [];
            if (!items.length) {
                body.innerHTML = `<div class="w2lcm-hint">Không có KH nào khớp "${escapeHtml(query)}"</div>`;
                return;
            }
            body.innerHTML = items.map(renderRow).join('');
            window.Web2WalletBalance?.attachBalances?.(body);
            body.querySelectorAll('[data-pick]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const phone = btn.getAttribute('data-phone');
                    const name = btn.getAttribute('data-name') || '';
                    linkAndClose(phone, name);
                });
            });
        } catch (e) {
            if (mySeq !== _searchSeq) return;
            body.innerHTML = `<div class="w2lcm-error">Lỗi tìm: ${escapeHtml(e.message)}</div>`;
        }
    }

    function statusBadge(partner) {
        const status = partner.Status || 'Normal';
        const cls = {
            Normal: 'normal',
            BomHang: 'bom',
            Warning: 'warn',
            Danger: 'danger',
            VIP: 'vip',
        }[status];
        const text = partner.StatusText || status;
        if (!cls || status === 'Normal') return '';
        return `<span class="w2lcm-status ${cls}">${escapeHtml(text)}</span>`;
    }

    function renderRow(p) {
        const phone = p.Phone || p.Mobile || '';
        const addr =
            p.FullAddress ||
            [p.Street, p.Ward, p.District, p.City].filter(Boolean).join(', ') ||
            '';
        const credit = Number(p.Credit || 0);
        return `
            <div class="w2lcm-row">
                <div class="w2lcm-row-info">
                    <div class="w2lcm-row-name">${escapeHtml(p.Name || '(không tên)')} ${statusBadge(p)} <span class="w2lcm-row-bal" data-w2wallet-phone="${escapeHtml(phone)}"></span></div>
                    <div class="w2lcm-row-phone">${escapeHtml(phone || '(no phone)')}</div>
                    ${addr ? `<div class="w2lcm-row-meta"><span title="Địa chỉ">📍 ${escapeHtml(addr.slice(0, 80))}</span></div>` : ''}
                    ${credit ? `<div class="w2lcm-row-meta"><span>Nợ WEB2: ${fmtVnd(credit)}</span></div>` : ''}
                </div>
                <button type="button" class="w2lcm-row-btn"
                    data-pick
                    data-phone="${escapeHtml(phone)}"
                    data-name="${escapeHtml(p.Name || '')}"
                    ${!phone ? 'disabled title="KH này chưa có SĐT"' : ''}>
                    Chọn
                </button>
            </div>
        `;
    }

    async function onManualSubmit(e) {
        const phone = _modal.querySelector('.w2lcm-manual-phone').value.trim();
        const name = _modal.querySelector('.w2lcm-manual-name').value.trim();
        if (!/^\d{9,11}$/.test(phone)) {
            notify('SĐT không hợp lệ (9-11 chữ số)', 'warning');
            return;
        }
        await linkAndClose(phone, name);
    }

    async function linkAndClose(phone, name) {
        if (!_activeTxId) return;
        try {
            const r = await jsonFetch(`${BASE}/${encodeURIComponent(_activeTxId)}/link`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, name: name || null }),
            }).catch(async () => {
                // Fallback direct
                return await jsonFetch(`${DIRECT_BASE}/${encodeURIComponent(_activeTxId)}/link`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name: name || null }),
                });
            });
            const credited = r?.data?.credited;
            notify(
                credited
                    ? `✅ Gán ${name || phone} + cộng ví Web 2.0`
                    : `✅ Gán ${name || phone} (giao dịch không phải tiền vào nên không cộng ví)`,
                'success'
            );
            closeModal();
            // Trigger refresh of balance-history app
            window.Web2BalanceHistoryApp?.load?.();
        } catch (e) {
            notify('Lỗi gán: ' + e.message, 'error');
        }
    }

    global.Web2LinkCustomerModal = { openModal, closeModal };
})(window);
