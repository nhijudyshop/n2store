// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/*.
// =====================================================================
// Web2CustomerDetailModal — click tên KH ở balance-history → modal tổng hợp:
//   • Thông tin: tên/SĐT/địa chỉ (sửa → PATCH /api/web2/customers/:id, warehouse độc lập)
//   • KH trùng SĐT (search by phone)
//   • Lịch sử ví: nạp tiền / dùng tiền (web2_wallet_transactions)
//   • Đơn hàng: Đơn Web + PBH + đếm thành công
// Nguồn dữ liệu = kho dùng chung Web 2.0 (xem overview #datastores).
// =====================================================================

(function (global) {
    'use strict';
    if (typeof window === 'undefined') return;

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const FALLBACK =
        (window.API_CONFIG && window.API_CONFIG.WEB2_API) || 'https://web2-api-kv04.onrender.com';

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

    function esc(v) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(v);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(v);
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.num(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN');
    }
    function fmtDate(iso) {
        if (window.Web2Format) return window.Web2Format.dateTime(iso);
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (
                d.toLocaleDateString('vi-VN') +
                ' ' +
                d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            );
        } catch {
            return iso;
        }
    }
    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (window.Web2PhoneUtils) return window.Web2PhoneUtils.norm(p);
        let s = String(p || '').replace(/\D/g, '');
        if (s && !s.startsWith('0')) s = '0' + s.slice(-9);
        return s;
    }
    async function getJSON(path) {
        // /customers/* GET là route auth-gated (PII) → gửi x-web2-token. (audit 2026-06-30)
        const headers = _w2Auth();
        try {
            const r = await fetch(`${WORKER}${path}`, { credentials: 'include', headers });
            if (r.ok) return await r.json();
        } catch {}
        try {
            const r = await fetch(`${FALLBACK}${path}`, { credentials: 'include', headers });
            if (r.ok) return await r.json();
        } catch {}
        return null;
    }

    // ----- DOM shell (1 lần) -----
    let _el = null;
    function ensureDom() {
        if (_el) return _el;
        injectStyle();
        _el = document.createElement('div');
        _el.className = 'w2cd-overlay';
        _el.hidden = true;
        _el.innerHTML = `
            <div class="w2cd-backdrop" data-close></div>
            <div class="modal-content w2cd-panel" role="dialog" aria-modal="true">
                <header class="w2cd-head">
                    <div class="w2cd-title" id="w2cdTitle">Khách hàng</div>
                    <div class="w2cd-head-actions">
                        <button type="button" class="w2cd-chat-btn" id="w2cdChat" title="Xem đoạn hội thoại Facebook của khách">💬 Mở chat</button>
                        <button type="button" class="w2cd-close" data-close aria-label="Đóng">&times;</button>
                    </div>
                </header>
                <nav class="w2cd-tabs">
                    <button class="w2cd-tab is-active" data-tab="info">Thông tin</button>
                    <button class="w2cd-tab" data-tab="wallet">Lịch sử ví</button>
                    <button class="w2cd-tab" data-tab="orders">Đơn hàng</button>
                </nav>
                <div class="modal-body w2cd-body" id="w2cdBody"></div>
            </div>`;
        document.body.appendChild(_el);
        _el.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) close();
            if (e.target.closest('#w2cdChat')) {
                openChat();
                return;
            }
            const tab = e.target.closest('.w2cd-tab');
            if (tab) switchTab(tab.getAttribute('data-tab'));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !_el.hidden) close();
        });
        return _el;
    }

    let _data = {}; // { phone, name, customer, duplicates, wallet, txns, orders }

    function close() {
        if (_el) _el.hidden = true;
        document.body.style.overflow = '';
    }

    function _notify(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[chat]', msg);
    }

    // Mở popup xem hội thoại FB read-only của KH. Resolve SĐT → pageId+psid qua
    // /api/web2/customers/:phone/fb-conversation, rồi Web2CustomerChat.open (modal readonly).
    async function openChat() {
        const phone = _data.phone || _data.customer?.phone;
        if (!phone) {
            _notify('Thiếu SĐT khách', 'warning');
            return;
        }
        // Có SĐT → FULL chat (Pancake + Zalo) qua launcher dùng chung Web2CustomerChat.
        if (global.Web2CustomerChat?.open) {
            global.Web2CustomerChat.open({
                phone,
                name: _data.name || _data.customer?.name || '',
            });
            return;
        }
        const btn = _el.querySelector('#w2cdChat');
        const old = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Đang mở…';
        }
        try {
            const r = await getJSON(
                `/api/web2/customers/${encodeURIComponent(phone)}/fb-conversation`
            );
            if (!global.Web2CustomerChat?.open) {
                _notify('Module chat chưa load (web2-customer-chat.js)', 'error');
                return;
            }
            const custName = _data.name || _data.customer?.name || '';
            if (!r || !r.found) {
                // Chưa resolve được FB → mở modal TÌM, seed tên/SĐT để user tự chọn.
                _notify('Chưa có hội thoại FB gán sẵn — tìm thủ công bên trái', 'info');
                global.Web2CustomerChat.open({
                    layout: 'modal',
                    readonly: true,
                    query: custName || phone,
                });
                return;
            }
            global.Web2CustomerChat.open({
                layout: 'modal',
                readonly: true,
                fbId: r.psid,
                pageId: r.pageId || null,
                name: r.name || custName,
            });
        } catch (e) {
            _notify('Lỗi mở chat: ' + (e?.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = old || '💬 Mở chat';
            }
        }
    }

    function switchTab(tab) {
        _el.querySelectorAll('.w2cd-tab').forEach((t) =>
            t.classList.toggle('is-active', t.getAttribute('data-tab') === tab)
        );
        const body = _el.querySelector('#w2cdBody');
        if (tab === 'info') body.innerHTML = renderInfo();
        else if (tab === 'wallet') body.innerHTML = renderWallet();
        else body.innerHTML = renderOrders();
    }

    // ----- Renders -----
    function renderInfo() {
        const c = _data.customer || {};
        const dups = (_data.duplicates || []).filter((x) => String(x.id) !== String(c.id));
        const w = _data.wallet || {};
        const balance = Number(w.balance || 0);
        return `
            <div class="w2cd-info-card">
                <div class="w2cd-balance">Số dư ví: <b>${fmtVnd(balance)}₫</b></div>
                <label class="w2cd-field"><span>Tên</span>
                    <input id="w2cdName" value="${esc(c.name || _data.name || '')}" /></label>
                <label class="w2cd-field"><span>SĐT</span>
                    <input id="w2cdPhone" value="${esc(c.phone || _data.phone || '')}" /></label>
                <label class="w2cd-field"><span>Địa chỉ</span>
                    <input id="w2cdAddress" value="${esc(c.address || '')}" /></label>
                <div class="w2cd-actions">
                    <button type="button" class="w2cd-btn-save" id="w2cdSave" ${c.id ? '' : 'disabled title="Chưa có WEB2 Id — không sửa được"'}>💾 Lưu → đồng bộ WEB2</button>
                    <span id="w2cdSaveMsg" class="w2cd-savemsg"></span>
                </div>
            </div>
            <div class="w2cd-dups">
                <div class="w2cd-sub">Khách trùng SĐT (${dups.length})</div>
                ${
                    dups.length
                        ? dups
                              .map(
                                  (d) =>
                                      `<div class="w2cd-dup-row"><b>${esc(d.name || '(không tên)')}</b><span>${esc(d.address || '')}</span><i>id ${esc(d.id)}</i></div>`
                              )
                              .join('')
                        : '<div class="w2cd-empty">Không có khách khác trùng SĐT</div>'
                }
            </div>`;
    }

    function renderWallet() {
        const txns = _data.txns || [];
        const inSum = txns
            .filter((t) => Number(t.amount) > 0)
            .reduce((s, t) => s + Number(t.amount), 0);
        const outSum = txns
            .filter((t) => Number(t.amount) < 0)
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        return `
            <div class="w2cd-wallet-sum">
                <div class="w2cd-sum-in">Nạp: +${fmtVnd(inSum)}₫</div>
                <div class="w2cd-sum-out">Dùng: -${fmtVnd(outSum)}₫</div>
                <div>${txns.length} giao dịch</div>
            </div>
            ${
                txns.length
                    ? `<table class="w2cd-table"><thead><tr><th>Thời gian</th><th>Loại</th><th class="num">Số tiền</th><th>Người thực hiện</th><th>Ghi chú</th></tr></thead><tbody>${txns
                          .map((t) => {
                              const amt = Number(t.amount) || 0;
                              const isIn = amt > 0;
                              const by =
                                  t.performed_by ||
                                  (t.reference_type === 'sepay' ? '(SePay tự động)' : '—');
                              return `<tr><td>${fmtDate(t.created_at)}</td><td>${esc(t.type || '')}</td><td class="num ${isIn ? 'w2cd-in' : 'w2cd-out'}">${isIn ? '+' : '-'}${fmtVnd(Math.abs(amt))}₫</td><td>${esc(by)}</td><td>${esc(t.description || t.note || '')}</td></tr>`;
                          })
                          .join('')}</tbody></table>`
                    : '<div class="w2cd-empty">Chưa có giao dịch ví</div>'
            }`;
    }

    function renderOrders() {
        const o = _data.orders || { native: [], pbh: [] };
        const native = o.native || [];
        const pbh = o.pbh || [];
        // PBH thành công: state không phải cancel/draft
        const pbhOk = pbh.filter(
            (x) => !['cancel', 'draft'].includes(String(x.state || '').toLowerCase())
        );
        const total = native.length + pbh.length;
        return `
            <div class="w2cd-order-sum">
                <span>Tổng: <b>${total}</b> đơn</span>
                <span>Đơn Web: <b>${native.length}</b></span>
                <span>PBH: <b>${pbh.length}</b></span>
                <span class="w2cd-ok">PBH thành công: <b>${pbhOk.length}</b></span>
            </div>
            ${
                total
                    ? `<table class="w2cd-table"><thead><tr><th>Loại</th><th>Mã</th><th>Trạng thái</th><th class="num">Tiền</th><th>Thời gian</th></tr></thead><tbody>${[
                          ...pbh.map(
                              (x) =>
                                  `<tr><td>PBH</td><td>${esc(x.number || '')}</td><td>${esc(x.state || '')}</td><td class="num">${fmtVnd(x.amountTotal || 0)}₫</td><td>${fmtDate(x.dateInvoice || x.dateCreated)}</td></tr>`
                          ),
                          ...native.map(
                              (x) =>
                                  `<tr><td>Đơn Web</td><td>${esc(x.code || '')}</td><td>${esc({ draft: 'Giỏ hàng', confirmed: 'Đơn hàng', cancelled: 'Đã hủy', delivered: 'Đã giao' }[x.status] || x.status || '')}</td><td class="num">${fmtVnd(x.totalAmount || 0)}₫</td><td>${fmtDate(x.createdAt)}</td></tr>`
                          ),
                      ].join('')}</tbody></table>`
                    : '<div class="w2cd-empty">Chưa có đơn hàng</div>'
            }`;
    }

    // ----- Save (sửa → WEB2 qua kho KH chung) -----
    async function saveCustomer() {
        const c = _data.customer || {};
        if (!c.id) return;
        const msg = _el.querySelector('#w2cdSaveMsg');
        const btn = _el.querySelector('#w2cdSave');
        const payload = {
            name: _el.querySelector('#w2cdName').value.trim(),
            phone: _el.querySelector('#w2cdPhone').value.trim(),
            address: _el.querySelector('#w2cdAddress').value.trim(),
        };
        btn.disabled = true;
        msg.textContent = 'Đang lưu…';
        try {
            const r = await fetch(`${WORKER}/api/web2/customers/${encodeURIComponent(c.id)}`, {
                method: 'PATCH',
                headers: _w2Auth({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (d.success) {
                // 2026-06-07: kho KH warehouse độc lập — warehouse độc lập.
                msg.textContent = '✓ Đã lưu';
                _data.customer = { ...c, ...payload };
                window.notificationManager?.show?.('Đã lưu thông tin KH', 'success');
            } else {
                msg.textContent = '✗ ' + (d.error || 'Lỗi');
            }
        } catch (e) {
            msg.textContent = '✗ ' + e.message;
        } finally {
            btn.disabled = false;
        }
    }

    // ----- Open -----
    async function open(phone, name) {
        const p = normPhone(phone);
        if (!p) return;
        ensureDom();
        _data = { phone: p, name: name || '' };
        _el.hidden = false;
        document.body.style.overflow = 'hidden';
        _el.querySelector('#w2cdTitle').textContent = name ? `${name} — ${p}` : p;
        const body = _el.querySelector('#w2cdBody');
        body.innerHTML = '<div class="w2cd-loading">Đang tải…</div>';
        // Reset về tab info
        _el.querySelectorAll('.w2cd-tab').forEach((t, i) =>
            t.classList.toggle('is-active', i === 0)
        );

        const [cust, dup, wallet, txns, orders] = await Promise.all([
            getJSON(`/api/web2/customers/${encodeURIComponent(p)}`),
            getJSON(`/api/web2/customers/search?search=${encodeURIComponent(p)}&limit=20`),
            getJSON(`/api/web2/wallets/by-phone/${encodeURIComponent(p)}`),
            getJSON(`/api/web2/wallets/${encodeURIComponent(p)}/transactions?limit=100`),
            getJSON(`/api/web2/customers/by-phone/${encodeURIComponent(p)}/orders?limit=100`),
        ]);
        _data.customer = cust?.customer ||
            (dup?.data || []).find((x) => normPhone(x.phone) === p) || { name, phone: p };
        _data.duplicates = dup?.data || [];
        _data.wallet = wallet?.data || {};
        _data.txns = txns?.data || [];
        _data.orders = orders?.data || { native: [], pbh: [] };

        body.innerHTML = renderInfo();
        // Wire save (event delegation đã có cho tab/close; save cần riêng)
        body.addEventListener('click', (e) => {
            if (e.target.closest('#w2cdSave')) saveCustomer();
        });
    }

    function injectStyle() {
        if (document.getElementById('w2cd-style')) return;
        const s = document.createElement('style');
        s.id = 'w2cd-style';
        s.textContent = `
        .w2cd-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;}
        .w2cd-overlay[hidden]{display:none;}
        .w2cd-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);}
        .w2cd-panel{position:relative;background:#fff;width:min(680px,94vw);max-height:88vh;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.2);}
        .w2cd-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0;}
        .w2cd-title{font-weight:700;font-size:16px;color:#0f172a;}
        .w2cd-head-actions{display:flex;align-items:center;gap:10px;}
        .w2cd-chat-btn{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:13px;font-weight:600;padding:5px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s;}
        .w2cd-chat-btn:hover{background:#dbeafe;border-color:#93c5fd;}
        .w2cd-chat-btn:disabled{opacity:.6;cursor:default;}
        .w2cd-close{border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:#64748b;}
        .w2cd-tabs{display:flex;gap:4px;padding:8px 14px 0;border-bottom:1px solid #e2e8f0;}
        .w2cd-tab{border:0;background:none;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;border-bottom:2px solid transparent;}
        .w2cd-tab.is-active{color:#2563eb;border-bottom-color:#2563eb;}
        .w2cd-body{padding:16px 18px;overflow-y:auto;overscroll-behavior:contain;}
        .w2cd-loading,.w2cd-empty{padding:18px;text-align:center;color:#94a3b8;font-size:13px;}
        .w2cd-balance{font-size:14px;margin-bottom:10px;color:#166534;}
        .w2cd-field{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;}
        .w2cd-field span{width:64px;color:#475569;font-weight:600;}
        .w2cd-field input{flex:1;padding:7px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;}
        .w2cd-actions{display:flex;align-items:center;gap:10px;margin-top:6px;}
        .w2cd-btn-save{background:#2563eb;color:#fff;border:0;border-radius:7px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer;}
        .w2cd-btn-save:disabled{opacity:.5;cursor:not-allowed;}
        .w2cd-savemsg{font-size:12px;color:#475569;}
        .w2cd-sub{font-weight:700;font-size:13px;margin:16px 0 8px;color:#334155;}
        .w2cd-dup-row{display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;}
        .w2cd-dup-row span{color:#64748b;flex:1;}
        .w2cd-dup-row i{color:#94a3b8;font-size:11px;}
        .w2cd-wallet-sum,.w2cd-order-sum{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin-bottom:12px;padding:10px 12px;background:#f8fafc;border-radius:8px;}
        .w2cd-sum-in{color:#166534;font-weight:600;}.w2cd-sum-out{color:#b91c1c;font-weight:600;}
        .w2cd-order-sum .w2cd-ok{color:#166534;}
        .w2cd-table{width:100%;border-collapse:collapse;font-size:12.5px;}
        .w2cd-table th,.w2cd-table td{padding:7px 9px;text-align:left;border-bottom:1px solid #f1f5f9;}
        .w2cd-table th{background:#f1f5f9;color:#475569;font-weight:600;position:sticky;top:0;}
        .w2cd-table .num{text-align:right;font-variant-numeric:tabular-nums;}
        .w2cd-in{color:#166534;}.w2cd-out{color:#b91c1c;}
        .w2bh-customer-name-link{cursor:pointer;color:#1d4ed8;text-decoration:underline dotted;}
        .w2bh-customer-name-link:hover{text-decoration:underline;}
        `;
        document.head.appendChild(s);
    }

    global.Web2CustomerDetailModal = { open };
})(window);
