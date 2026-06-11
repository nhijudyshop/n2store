// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — danh sách đơn đã tạo theo chiến dịch (STT + tìm kiếm) trong live-chat.
// =====================================================================
// LiveOrderHistory — nút nổi "📋 Đơn đã tạo" + modal: liệt kê các đơn web đã
// tạo ở (các) chiến dịch đang chọn. Cột STT (campaign_stt) | Tên KH | Mã đơn |
// SL/Tổng | Giờ. Tìm kiếm theo tên / STT / mã. Click → mở chi tiết đơn.
// Data: GET /api/native-orders/load?campaignIds=<sel>&channel=web2_livestream.
// =====================================================================

(function (global) {
    'use strict';
    if (global.LiveOrderHistory) return;

    const _base = () => {
        const w = global.LiveState?.workerUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return w.replace(/\/$/, '') + '/api/native-orders';
    };
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    const fmtMoney = (n) => (Number(n || 0) ? Number(n).toLocaleString('vi-VN') + '₫' : '—');
    const fmtTime = (ms) => {
        if (!ms) return '';
        const d = new Date(Number(ms));
        const p = (x) => String(x).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
    };

    let _orders = [];
    let _query = '';

    function _injectStyles() {
        if (document.getElementById('loh-styles')) return;
        const s = document.createElement('style');
        s.id = 'loh-styles';
        s.textContent = `
        .loh-fab{background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:5px;align-items:center;white-space:nowrap;flex-shrink:0}
        .loh-fab.loh-fab-float{position:fixed;right:18px;bottom:64px;z-index:9998;border-radius:999px;padding:10px 16px;font-size:13px;box-shadow:0 4px 14px rgba(14,165,233,.4)}
        .loh-fab:hover{filter:brightness(1.05)}
        .loh-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center}
        .loh-modal.open{display:flex}
        .loh-back{position:absolute;inset:0;background:rgba(15,23,42,.5)}
        .loh-panel{position:relative;background:#fff;border-radius:14px;width:min(760px,95vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
        .loh-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eef2f7}
        .loh-head h3{margin:0;font-size:16px}
        .loh-x{border:0;background:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}
        .loh-tools{padding:10px 18px;border-bottom:1px solid #f4f6f9;display:flex;gap:10px;align-items:center}
        .loh-search{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:7px 11px;font-size:13px}
        .loh-count{font-size:12px;color:#6b7280;white-space:nowrap}
        .loh-body{overflow:auto;padding:0}
        .loh-table{width:100%;border-collapse:collapse;font-size:13px}
        .loh-table th{position:sticky;top:0;background:#f8fafc;text-align:left;padding:8px 12px;font-size:11.5px;color:#64748b;font-weight:600;border-bottom:1px solid #eef2f7;z-index:1}
        .loh-table td{padding:8px 12px;border-bottom:1px solid #f4f6f9}
        .loh-row{cursor:pointer}
        .loh-row:hover{background:#f0f9ff}
        .loh-stt{display:inline-flex;min-width:26px;justify-content:center;background:#e0f2fe;color:#0369a1;border-radius:6px;padding:2px 6px;font-weight:700;font-size:12px}
        .loh-code{color:#6d28d9;font-weight:600;font-size:11.5px}
        .loh-name{font-weight:600}
        .loh-empty{padding:28px;text-align:center;color:#9ca3af;font-size:13px}`;
        document.head.appendChild(s);
    }

    function _selectedCampaignIds() {
        const st = global.LiveState;
        return st?.selectedCampaignIds ? Array.from(st.selectedCampaignIds) : [];
    }

    async function _fetchOrders() {
        const ids = _selectedCampaignIds();
        const qs = new URLSearchParams();
        qs.set('limit', '500');
        qs.set('status', 'all');
        qs.set('channel', 'web2_livestream');
        if (ids.length) qs.set('campaignIds', ids.join(','));
        const r = await fetch(`${_base()}/load?${qs.toString()}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json().catch(() => ({}));
        const list = d.orders || d.data || [];
        // Sắp theo campaign_stt tăng dần (đơn không STT xuống cuối).
        list.sort((a, b) => {
            const sa = a.campaignStt == null ? 1e9 : Number(a.campaignStt);
            const sb = b.campaignStt == null ? 1e9 : Number(b.campaignStt);
            return sa - sb;
        });
        return list;
    }

    function _filtered() {
        const q = _query.trim().toLowerCase();
        if (!q) return _orders;
        return _orders.filter((o) => {
            const stt = String(o.campaignStt ?? '');
            const name = String(o.customerName || o.fbUserName || '').toLowerCase();
            const code = String(o.code || '').toLowerCase();
            const phone = String(o.phone || '');
            return stt === q || name.includes(q) || code.includes(q) || phone.includes(q);
        });
    }

    function _renderBody() {
        const body = document.getElementById('loh-body');
        const cnt = document.getElementById('loh-count');
        if (!body) return;
        const rows = _filtered();
        if (cnt) cnt.textContent = `${rows.length} đơn`;
        if (!rows.length) {
            body.innerHTML = `<div class="loh-empty">${
                _orders.length
                    ? 'Không tìm thấy đơn khớp.'
                    : 'Chưa có đơn nào ở chiến dịch đang chọn.'
            }</div>`;
            return;
        }
        body.innerHTML = `<table class="loh-table">
            <thead><tr><th>STT</th><th>Tên KH</th><th>Mã đơn</th><th>SL</th><th>Tổng</th><th>Giờ</th></tr></thead>
            <tbody>${rows
                .map((o) => {
                    const stt = o.campaignStt != null ? o.campaignStt : '—';
                    const name = esc(o.customerName || o.fbUserName || '(không tên)');
                    const uid = esc(o.fbUserId || '');
                    return `<tr class="loh-row" data-uid="${uid}">
                        <td><span class="loh-stt">${esc(String(stt))}</span></td>
                        <td><span class="loh-name">${name}</span>${
                            o.phone
                                ? `<div style="color:#9ca3af;font-size:11px">${esc(o.phone)}</div>`
                                : ''
                        }</td>
                        <td><span class="loh-code">${esc(o.code || '')}</span></td>
                        <td>${esc(String(o.totalQuantity || 0))}</td>
                        <td>${fmtMoney(o.totalAmount)}</td>
                        <td style="color:#6b7280;white-space:nowrap">${fmtTime(o.createdAt)}</td>
                    </tr>`;
                })
                .join('')}</tbody></table>`;
        body.querySelectorAll('.loh-row').forEach((tr) => {
            tr.addEventListener('click', () => {
                const uid = tr.getAttribute('data-uid');
                if (uid && global.LiveCommentList?.showOrderDetail) {
                    _close();
                    global.LiveCommentList.showOrderDetail(uid);
                }
            });
        });
    }

    async function _open() {
        document.getElementById('loh-modal')?.classList.add('open');
        const body = document.getElementById('loh-body');
        if (body) body.innerHTML = '<div class="loh-empty">Đang tải…</div>';
        try {
            _orders = await _fetchOrders();
        } catch (e) {
            _orders = [];
            if (body) {
                body.innerHTML = `<div class="loh-empty" style="color:#ef4444">Lỗi tải đơn: ${esc(e.message)}</div>`;
            }
            return;
        }
        _renderBody();
    }
    function _close() {
        document.getElementById('loh-modal')?.classList.remove('open');
    }

    function _mount() {
        _injectStyles();
        if (document.getElementById('loh-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'loh-fab';
        fab.innerHTML = '📋 Đơn đã tạo';
        fab.onclick = _open;
        // Gắn vào topbar (#liveTopbarActions) để iframe livestream không che;
        // fallback floating nếu chưa có slot.
        const slot = document.getElementById('liveTopbarActions');
        if (slot) {
            fab.className = 'loh-fab';
            slot.appendChild(fab);
        } else {
            fab.className = 'loh-fab loh-fab-float';
            document.body.appendChild(fab);
        }

        const modal = document.createElement('div');
        modal.id = 'loh-modal';
        modal.className = 'loh-modal';
        modal.innerHTML = `
            <div class="loh-back"></div>
            <div class="loh-panel">
                <div class="loh-head">
                    <h3>📋 Đơn đã tạo (chiến dịch đang chọn)</h3>
                    <button class="loh-x" id="loh-close">×</button>
                </div>
                <div class="loh-tools">
                    <input class="loh-search" id="loh-search" placeholder="Tìm theo tên, STT, mã đơn, SĐT…" />
                    <span class="loh-count" id="loh-count"></span>
                </div>
                <div class="loh-body" id="loh-body"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.loh-back').addEventListener('click', _close);
        document.getElementById('loh-close').addEventListener('click', _close);
        const inp = document.getElementById('loh-search');
        let t = null;
        inp.addEventListener('input', () => {
            _query = inp.value;
            clearTimeout(t);
            t = setTimeout(_renderBody, 150);
        });
    }

    global.LiveOrderHistory = { mount: _mount, open: _open, reload: _open };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_mount, 1500));
    } else {
        setTimeout(_mount, 1500);
    }
})(window);
