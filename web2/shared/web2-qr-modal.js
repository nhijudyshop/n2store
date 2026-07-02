// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
// =====================================================================
// Web2QrModal — reusable modal hiển thị VietQR cho 1 KH.
// Auto-fetch GET /api/web2/customer-wallet/:phone/qr; nếu 404 thì auto POST
// UPSERT (backend tự lookup WEB2 partner_id + name).
//
// API: Web2QrModal.open(phone, opts?)
//   - phone: 10-digit VN phone
//   - opts.customerId (number, optional): web2_customers.id — Mã KH Web 2.0 (skip lookup)
//   - opts.customerName (string, optional): KH name (skip lookup)
// =====================================================================

(function (global) {
    'use strict';

    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    const QR_BASE =
        (global.API_CONFIG?.WORKER_URL ||
            global.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/customer-wallet';
    const QR_DIRECT =
        (global.WEB2_CONFIG?.WEB2_API || 'https://web2-api-kv04.onrender.com') +
        '/api/web2/customer-wallet';

    function _w2Auth(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    }

    let _modalEl = null;

    async function qrRequest(path, options) {
        const opts = options || {};
        try {
            const r = await fetch(`${QR_BASE}${path}`, opts);
            const body = await r.json().catch(() => ({}));
            return { status: r.status, body };
        } catch (e) {
            const r = await fetch(`${QR_DIRECT}${path}`, opts);
            const body = await r.json().catch(() => ({}));
            return { status: r.status, body };
        }
    }

    function ensureStyles() {
        if (document.getElementById('web2-qr-modal-styles')) return;
        const css = `
.w2qr-modal { position: fixed; inset: 0; z-index: 9999; display: flex;
  align-items: center; justify-content: center; }
.w2qr-modal[hidden] { display: none; }
.w2qr-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px); }
.w2qr-panel { position: relative; background: #fff; border-radius: 12px;
  width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
  overflow: auto; box-shadow: 0 24px 48px rgba(0,0,0,0.25);
  display: flex; flex-direction: column; }
.w2qr-head { display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
.w2qr-head h3 { margin: 0; font-size: 16px; font-weight: 600; color: #111827; }
.w2qr-head .w2qr-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
.w2qr-close { background: none; border: 0; cursor: pointer; padding: 4px;
  color: #6b7280; border-radius: 6px; }
.w2qr-close:hover { background: #f3f4f6; color: #111827; }
.w2qr-body { padding: 20px; }
.w2qr-loading, .w2qr-error { text-align: center; padding: 48px 16px; color: #6b7280; }
.w2qr-error { color: #dc2626; }
.w2qr-content { display: grid; grid-template-columns: 260px 1fr; gap: 24px; }
.w2qr-image-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.w2qr-image-wrap img { width: 100%; height: auto; display: block; border-radius: 4px; }
.w2qr-info { display: flex; flex-direction: column; gap: 14px; }
.w2qr-field label { display: block; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; color: #6b7280; margin-bottom: 4px; font-weight: 600; }
.w2qr-field > div, .w2qr-field > code { font-size: 14px; color: #111827; }
.w2qr-code-row { display: flex; gap: 8px; align-items: center; }
.w2qr-code-row code { flex: 1; background: #f3f4f6; padding: 8px 12px;
  border-radius: 6px; font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 14px; font-weight: 600; color: #1f2937; word-break: break-all; }
.w2qr-stats { display: flex; gap: 16px; font-size: 13px; color: #4b5563; }
.w2qr-stats b { color: #111827; }
.w2qr-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.w2qr-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
  border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1px solid #d1d5db; background: #fff; color: #374151; text-decoration: none; }
.w2qr-btn:hover { background: #f9fafb; }
.w2qr-btn-primary { background: #2a96ff; color: #fff; border-color: #2a96ff; }
.w2qr-btn-primary:hover { background: #0058da; }
.w2qr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 640px) { .w2qr-content { grid-template-columns: 1fr; } }
        `;
        const style = document.createElement('style');
        style.id = 'web2-qr-modal-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function ensureDom() {
        if (_modalEl) return _modalEl;
        ensureStyles();
        const el = document.createElement('div');
        el.className = 'w2qr-modal';
        el.id = 'web2QrModal';
        el.hidden = true;
        el.innerHTML = `
            <div class="w2qr-backdrop" data-w2qr-close></div>
            <div class="w2qr-panel">
                <header class="w2qr-head">
                    <div>
                        <h3 id="w2qrTitle">QR VietQR</h3>
                        <div class="w2qr-sub" id="w2qrSub"></div>
                    </div>
                    <button class="w2qr-close" type="button" data-w2qr-close aria-label="Đóng">
                        <i data-lucide="x" style="width:18px;height:18px;"></i>
                    </button>
                </header>
                <div class="w2qr-body" id="w2qrBody">
                    <div class="w2qr-loading" id="w2qrLoading">Đang tải / tạo QR…</div>
                    <div class="w2qr-error" id="w2qrError" hidden></div>
                    <div class="w2qr-content" id="w2qrContent" hidden>
                        <div class="w2qr-image-wrap">
                            <img id="w2qrImg" alt="VietQR" />
                        </div>
                        <div class="w2qr-info">
                            <div class="w2qr-field">
                                <label>Mã QR (nội dung CK)</label>
                                <div class="w2qr-code-row">
                                    <code id="w2qrCode">—</code>
                                    <button type="button" class="w2qr-btn" id="w2qrCopyCode">
                                        <i data-lucide="copy" style="width:14px;height:14px;"></i> Copy
                                    </button>
                                </div>
                            </div>
                            <div class="w2qr-field">
                                <label>Ngân hàng</label>
                                <div id="w2qrBank">—</div>
                            </div>
                            <div class="w2qr-field">
                                <label>Mã KH (Web 2.0)</label>
                                <div id="w2qrPartnerId">—</div>
                            </div>
                            <div class="w2qr-field w2qr-stats">
                                <span>Đã dùng: <b id="w2qrUseCount">0</b> lần</span>
                                <span>Lần gần nhất: <b id="w2qrLastUsed">—</b></span>
                            </div>
                            <div class="w2qr-actions">
                                <button type="button" class="w2qr-btn w2qr-btn-primary" id="w2qrRefresh">
                                    <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Refresh QR
                                </button>
                                <a id="w2qrOpenImg" class="w2qr-btn" target="_blank" rel="noopener" href="#">
                                    <i data-lucide="external-link" style="width:14px;height:14px;"></i> Mở ảnh QR
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(el);
        _modalEl = el;

        // Bind close + actions
        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-w2qr-close]')) close();
            else if (e.target.closest('#w2qrCopyCode')) copyCode();
            else if (e.target.closest('#w2qrRefresh')) refresh();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !el.hidden) close();
        });
        return el;
    }

    function showLoading() {
        document.getElementById('w2qrLoading').hidden = false;
        document.getElementById('w2qrError').hidden = true;
        document.getElementById('w2qrContent').hidden = true;
    }
    function showError(msg) {
        document.getElementById('w2qrLoading').hidden = true;
        document.getElementById('w2qrError').hidden = false;
        document.getElementById('w2qrError').textContent = 'Lỗi: ' + msg;
        document.getElementById('w2qrContent').hidden = true;
    }
    function renderData(qr) {
        document.getElementById('w2qrLoading').hidden = true;
        document.getElementById('w2qrError').hidden = true;
        document.getElementById('w2qrContent').hidden = false;
        document.getElementById('w2qrTitle').textContent = qr.customer_name || '(không tên)';
        document.getElementById('w2qrSub').textContent = `SĐT ${qr.phone}`;
        document.getElementById('w2qrImg').src = qr.vietqr_url;
        document.getElementById('w2qrCode').textContent = qr.qr_code;
        document.getElementById('w2qrPartnerId').textContent = qr.customer_id || '—';
        document.getElementById('w2qrUseCount').textContent = qr.use_count || 0;
        document.getElementById('w2qrLastUsed').textContent = qr.last_used_at
            ? new Date(qr.last_used_at).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
              })
            : '(chưa dùng)';
        document.getElementById('w2qrOpenImg').href = qr.vietqr_url;
        if (qr.bank) {
            document.getElementById('w2qrBank').textContent =
                `${qr.bank.code} · ${qr.bank.accountNo} · ${qr.bank.accountName}`;
        }
        if (window.lucide) window.lucide.createIcons();
    }
    function copyCode() {
        const code = document.getElementById('w2qrCode').textContent;
        if (!code || code === '—') return;
        navigator.clipboard?.writeText(code).then(
            () => window.notificationManager?.show?.('Đã copy mã QR', 'success'),
            () => window.notificationManager?.show?.('Copy thất bại', 'error')
        );
    }

    let _ctx = null; // { phone, opts }

    async function fetchOrCreate(phone, opts) {
        // Có customerId (WEB2 partner_id) → POST upsert theo customer_id → trả
        // ĐÚNG QR của partner đó. Tránh GET-by-phone (LIMIT 1) trả nhầm partner
        // khi nhiều WEB2 partner gán chung 1 SĐT (vd test clone trùng SĐT).
        if (opts?.customerId) {
            const post = await qrRequest(`/${encodeURIComponent(phone)}/qr`, {
                method: 'POST',
                headers: _w2Auth({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    customerId: opts.customerId,
                    customerName: opts.customerName,
                }),
            });
            if (post.status !== 200) {
                throw new Error(post.body?.error || `HTTP ${post.status}`);
            }
            return post.body.data;
        }
        // Không có customerId → GET theo phone (backward compat)
        const get = await qrRequest(`/${encodeURIComponent(phone)}/qr`);
        if (get.status === 200) return get.body.data;
        // 404 → auto UPSERT (backend tự lookup WEB2 partner theo phone)
        const post = await qrRequest(`/${encodeURIComponent(phone)}/qr`, {
            method: 'POST',
            headers: _w2Auth({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ customerName: opts?.customerName }),
        });
        if (post.status !== 200) {
            throw new Error(post.body?.error || `HTTP ${post.status}`);
        }
        return post.body.data;
    }

    async function refresh() {
        if (!_ctx) return;
        showLoading();
        try {
            const post = await qrRequest(`/${encodeURIComponent(_ctx.phone)}/qr`, {
                method: 'POST',
                headers: _w2Auth({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    customerId: _ctx.opts?.customerId,
                    customerName: _ctx.opts?.customerName,
                }),
            });
            if (post.status !== 200) {
                throw new Error(post.body?.error || `HTTP ${post.status}`);
            }
            renderData(post.body.data);
            window.notificationManager?.show?.('Đã refresh QR', 'success');
        } catch (e) {
            showError(e.message);
        }
    }

    async function open(phone, opts) {
        const normPhone = String(phone || '').replace(/\D/g, '');
        if (normPhone.length < 9) {
            window.notificationManager?.show?.('SĐT không hợp lệ', 'warning');
            return;
        }
        _ctx = { phone: normPhone, opts: opts || {} };
        const modal = ensureDom();
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        showLoading();
        if (window.lucide) window.lucide.createIcons();
        try {
            const qr = await fetchOrCreate(normPhone, opts);
            renderData(qr);
        } catch (e) {
            showError(e.message);
        }
    }

    function close() {
        if (!_modalEl) return;
        _modalEl.hidden = true;
        document.body.style.overflow = '';
        _ctx = null;
    }

    global.Web2QrModal = { open, close };
})(window);
