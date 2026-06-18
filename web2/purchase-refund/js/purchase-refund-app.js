// #Note: WEB2.0 module — Trả hàng NCC.
// CRUD generic qua /api/web2/purchase-refund/* + state machine qua /api/purchase-refund/:code/{approve|cancel-approve|refunded|reject}.
// SSE topic 'web2:purchase-refund' tự reload list khi server change state.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const GENERIC_API = `${WORKER}/api/web2/purchase-refund`;
    const SM_API = `${WORKER}/api/purchase-refund`; // state-machine endpoints

    const STATUS_LABEL = {
        draft: 'Nháp',
        sent: 'Đã gửi NCC',
        approved: 'NCC duyệt',
        refunded: 'NCC đã hoàn tiền',
        rejected: 'NCC từ chối',
        cancelled: 'Hủy',
    };
    const REASON_LABEL = {
        defect: 'Hàng lỗi / hỏng',
        wrong_item: 'Sai mã / sai SP',
        excess: 'Dư hàng',
        quality: 'Chất lượng kém',
        other: 'Khác',
    };
    const REFUND_METHOD_LABEL = {
        cash: 'Tiền mặt',
        bank: 'Chuyển khoản',
        debt_offset: 'Trừ công nợ',
        replace: 'Đổi hàng mới',
    };

    const STATE = {
        items: [],
        selected: null,
        filterStatus: '',
        search: '',
        sseUnsub: null,
    };

    const $ = (id) => document.getElementById(id);

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            console.log(`[${type || 'info'}] ${msg}`);
        }
    }
    function fmtMoney(n) {
        return Number(n || 0).toLocaleString('vi-VN') + '₫';
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('vi-VN');
        } catch {
            return iso;
        }
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Chỉ cho phép scheme ảnh an toàn (chặn javascript:/data:text/html…).
    function safeImageUrl(s) {
        s = String(s || '').trim();
        return /^(https:\/\/|http:\/\/|\/|data:image\/)/i.test(s) ? s : '';
    }
    // Thumbnail SP (ảnh từ Kho SP) — fallback icon khi thiếu/lỗi ảnh.
    // Ảnh thật click được → mở xem FULL (lightbox), data-full giữ URL gốc.
    function thumbHtml(imageUrl) {
        const src = safeImageUrl(imageUrl);
        if (src) {
            const e = escapeHtml(src);
            return `<img class="pr-thumb pr-thumb-zoom" src="${e}" data-full="${e}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="pr-thumb pr-thumb-ph" style="display:none;"><i data-lucide="image"></i></span>`;
        }
        return `<span class="pr-thumb pr-thumb-ph"><i data-lucide="image"></i></span>`;
    }

    // Lightbox xem ảnh SP full-size (native theo browser, không crop).
    function openImageLightbox(src) {
        if (!src) return;
        let ov = document.getElementById('prImgOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'prImgOverlay';
            ov.className = 'pr-img-overlay';
            ov.hidden = true;
            ov.innerHTML = `<img alt="Ảnh sản phẩm"><button type="button" class="pr-img-close" aria-label="Đóng">×</button>`;
            ov.addEventListener('click', () => {
                ov.hidden = true;
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !ov.hidden) ov.hidden = true;
            });
            document.body.appendChild(ov);
        }
        ov.querySelector('img').src = src;
        ov.hidden = false;
    }

    // 2026-06-07: 1 "đơn" = 1 shipment/đợt trong Sổ Order. Group Section A +
    // picker theo (NCC + shipment) để SP tạo ở đợt khác nhau tách nhóm riêng,
    // kể cả cùng NCC. Header hiển thị NCC + đợt/ngày cho dễ phân biệt.
    function _orderGroupKey(it) {
        return `${it.supplier}::${it.shipmentId || ''}`;
    }
    function _orderGroupLabel(it) {
        const parts = [];
        if (it.shipBatch) parts.push('Đợt ' + it.shipBatch);
        if (it.shipDate) parts.push(fmtDate(it.shipDate));
        return parts.join(' · ') || 'Đơn (chưa rõ đợt)';
    }

    /**
     * Lấy user hiện tại — delegate sang shared Web2UserInfo.
     * P1 2026-05-30: shared module thay cho per-page inline helper. Fallback
     * inline nếu Web2UserInfo chưa load (race condition).
     */
    function _currentUserInfo() {
        if (window.Web2UserInfo?.get) {
            return window.Web2UserInfo.get('purchase-refund');
        }
        // Fallback inline (rare race condition)
        let user = null;
        try {
            user = window.Web2Auth?.getStored?.()?.user || null;
        } catch {}
        if (!user) {
            try {
                user = window.AuthManager?.getCurrentUser?.() || null;
            } catch {}
        }
        if (!user) return { userId: null, userName: '(ẩn danh)', sourcePage: 'purchase-refund' };
        return {
            userId: user.id || user.uid || user.username || user.email || null,
            userName: user.displayName || user.username || user.email || '(ẩn danh)',
            sourcePage: 'purchase-refund',
        };
    }

    function fmtDateTime(ts) {
        if (!ts) return '—';
        try {
            return new Date(ts).toLocaleString('vi-VN');
        } catch {
            return String(ts);
        }
    }

    const HISTORY_ACTION_LABEL = {
        create: '📝 Tạo phiếu',
        approve: '✓ Duyệt + trừ kho',
        'cancel-approve': '↩ Hủy duyệt (trả tồn về)',
        refunded: '💰 NCC đã hoàn tiền',
        reject: '✗ NCC từ chối',
        update: '✎ Cập nhật',
    };

    // ---------- API ----------
    // ENFORCE-PREP (2026-06-12): /api/web2/purchase-refund/* (generic
    // create/update/delete) sắp gate WEB2_AUTH_ENFORCE=1. SM_API
    // /api/purchase-refund/* không gate nhưng thêm header vô hại — gắn ở
    // choke point fetchJson cho mọi call. Page load web2-auth.js →
    // Web2Auth.authHeaders; không load → đọc thẳng localStorage 'web2_auth'.
    function _authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    async function fetchJson(url, opts) {
        // ENFORCE-PREP (2026-06-12): gắn x-web2-token mặc định.
        const o = { ...(opts || {}), headers: _authHeaders(opts?.headers) };
        const r = await fetch(url, o);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    async function loadList() {
        try {
            const data = await fetchJson(`${GENERIC_API}/list?limit=200`);
            const items = data?.items || data?.records || data?.data || [];
            STATE.items = items.map((it) => ({
                code: it.code,
                name: it.name,
                createdAt: it.created_at || it.createdAt,
                ...(it.data || {}),
                _row: it,
            }));
            renderList();
        } catch (e) {
            notify(`Tải DS phiếu thất bại: ${e.message}`, 'error');
        }
    }

    function applyFilters(items) {
        const s = STATE.search.trim().toLowerCase();
        const st = STATE.filterStatus;
        return items.filter((it) => {
            if (st && (it.status || 'draft') !== st) return false;
            if (s) {
                const hay =
                    `${it.code} ${it.name} ${it.supplierName || ''} ${it.supplierCode || ''} ${it.reason || ''}`.toLowerCase();
                if (!hay.includes(s)) return false;
            }
            return true;
        });
    }

    function renderList() {
        const items = applyFilters(STATE.items);
        $('prListCount').textContent = `${items.length} phiếu`;
        const ul = $('prList');
        const empty = $('prEmpty');
        if (!items.length) {
            ul.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        ul.innerHTML = items
            .map((it) => {
                const sel = it.code === STATE.selected?.code ? 'is-selected' : '';
                const status = it.status || 'draft';
                return `
                <li class="${sel}" data-code="${escapeHtml(it.code)}">
                    <div class="pr-li-row1">
                        <span class="pr-li-code">${escapeHtml(it.code)}</span>
                        <span class="pr-status-badge pr-status-${status}">${STATUS_LABEL[status] || status}</span>
                    </div>
                    <div class="pr-li-supplier">${escapeHtml(it.supplierName || it.supplierCode || '—')}</div>
                    <div class="pr-li-row2">
                        <span>${escapeHtml(it.name || '')}</span>
                        <span>${fmtMoney(it.totalAmount)}</span>
                    </div>
                </li>
            `;
            })
            .join('');
        ul.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => selectRefund(li.dataset.code));
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function selectRefund(code) {
        STATE.selected = STATE.items.find((x) => x.code === code) || null;
        renderList();
        renderDetail();
    }

    function renderDetail() {
        const detail = $('prDetail');
        const empty = $('prDetailEmpty');
        if (!STATE.selected) {
            detail.hidden = true;
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        detail.hidden = false;
        const r = STATE.selected;
        const status = r.status || 'draft';
        const products = parseProducts(r.products);

        // P1 2026-05-30: bỏ tất cả action buttons (Duyệt/NCC từ chối/Sửa/
        // Hủy duyệt/Hoàn tiền). User ask "trả → xác nhận là trả luôn" —
        // quick refund đã auto-create + auto-approve + trừ kho + ghi ví NCC
        // atomic. Detail view CHỈ HIỂN THỊ thông tin + lịch sử (read-only).
        // Phiếu đã chốt khi tạo → không cần state machine UI nữa.
        const actions = [];
        if (false) {
            actions.push(
                `<button class="btn btn-secondary btn-sm" data-action="view-only" disabled>Đã chốt — không sửa được</button>`
            );
        }

        detail.innerHTML = `
            <div class="pr-detail-head">
                <div>
                    <h2>${escapeHtml(r.name || '')}</h2>
                    <div style="color:#64748b;font-size:13px;margin-top:2px">${escapeHtml(r.code)}</div>
                </div>
                <span class="pr-status-badge pr-status-${status}">${STATUS_LABEL[status] || status}</span>
            </div>
            <div class="pr-detail-grid">
                <div><strong>NCC:</strong> ${escapeHtml(r.supplierName || '—')}</div>
                <div><strong>Mã NCC:</strong> ${escapeHtml(r.supplierCode || '—')}</div>
                <div><strong>SĐT NCC:</strong> ${escapeHtml(r.supplierPhone || '—')}</div>
                <div><strong>Sổ Order gốc:</strong> ${
                    r.sourcePurchaseCode
                        ? `<a href="../../so-order/index.html?code=${encodeURIComponent(r.sourcePurchaseCode)}" target="_blank" style="color:#3b82f6;text-decoration:none;">${escapeHtml(r.sourcePurchaseCode)}</a>`
                        : '—'
                }</div>
                <div><strong>Ngày trả:</strong> ${escapeHtml(r.refundDate || '—')}</div>
                <div><strong>Lý do:</strong> ${escapeHtml(REASON_LABEL[r.reason] || r.reason || '—')}</div>
                <div><strong>Tổng SL:</strong> ${Number(r.totalQty || 0)}</div>
                <div><strong>Tổng tiền:</strong> ${fmtMoney(r.totalAmount)}</div>
                <div><strong>Phương thức hoàn:</strong> ${escapeHtml(REFUND_METHOD_LABEL[r.refundMethod] || r.refundMethod || '—')}</div>
                <div><strong>Đã trừ kho:</strong> ${r.stock_deducted ? '✓ Yes' : '— No'}</div>
                ${r.approved_at ? `<div><strong>Duyệt lúc:</strong> ${new Date(r.approved_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.refunded_at ? `<div><strong>Hoàn tiền lúc:</strong> ${new Date(r.refunded_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.rejected_at ? `<div><strong>Từ chối lúc:</strong> ${new Date(r.rejected_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.note ? `<div style="grid-column:1/-1"><strong>Ghi chú:</strong> ${escapeHtml(r.note)}</div>` : ''}
                ${r.approved_note ? `<div style="grid-column:1/-1"><strong>Ghi chú duyệt:</strong> ${escapeHtml(r.approved_note)}</div>` : ''}
                ${r.rejected_reason ? `<div style="grid-column:1/-1"><strong>Lý do từ chối:</strong> ${escapeHtml(r.rejected_reason)}</div>` : ''}
            </div>

            ${
                products.length > 0
                    ? `
            <div class="pr-products">
                <h3>Danh sách SP trả (${products.length})</h3>
                <table>
                    <thead><tr>
                        <th>Mã SP</th><th>Tên SP</th>
                        <th class="num">SL</th><th class="num">Giá</th><th class="num">Thành tiền</th>
                    </tr></thead>
                    <tbody>
                        ${products
                            .map(
                                (p) => `<tr>
                            <td><code>${escapeHtml(p.code || '')}</code></td>
                            <td>${escapeHtml(p.name || '')}</td>
                            <td class="num">${Number(p.qty || 0)}</td>
                            <td class="num">${fmtMoney(p.price)}</td>
                            <td class="num">${fmtMoney(Number(p.qty || 0) * Number(p.price || 0))}</td>
                        </tr>`
                            )
                            .join('')}
                    </tbody>
                </table>
            </div>`
                    : '<div class="pr-empty" style="padding:16px;background:#fef3c7;color:#92400e;border-radius:8px;margin-top:14px">⚠️ Phiếu chưa có SP — không thể duyệt (cần thêm SP để trừ tồn).</div>'
            }

            <div class="pr-detail-actions">${actions.join('')}</div>

            ${
                window.Web2HistoryTimeline?.render
                    ? window.Web2HistoryTimeline.render(r.history)
                    : ''
            }
        `;

        detail.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => handleAction(btn.dataset.action));
        });
        if (window.lucide) window.lucide.createIcons();
    }

    // Parse products từ JSON array hoặc multi-line text "code | name | qty | price"
    function parseProducts(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[')) {
                try {
                    const arr = JSON.parse(trimmed);
                    return Array.isArray(arr) ? arr : [];
                } catch {
                    return [];
                }
            }
            // Pipe-separated lines
            return trimmed
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const parts = line.split('|').map((s) => s.trim());
                    return {
                        code: parts[0] || '',
                        name: parts[1] || '',
                        qty: Number(parts[2] || 0),
                        price: Number(parts[3] || 0),
                    };
                })
                .filter((p) => p.code);
        }
        return [];
    }

    async function handleAction(action) {
        const code = STATE.selected?.code;
        if (!code) return;
        if (action === 'edit') {
            openModal(STATE.selected);
            return;
        }
        if (action === 'approve') {
            if (
                !(await Popup.confirm(
                    `Duyệt phiếu ${code}? Stock kho sẽ TRỪ qty cho từng SP. Hành động idempotent.`
                ))
            )
                return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                const n = res.linesProcessed || 0;
                notify(
                    res.idempotent
                        ? `Phiếu ${code} đã ở trạng thái duyệt (không đổi)`
                        : `✓ Đã duyệt ${code}. Trừ kho ${n} dòng SP.`,
                    'success'
                );
                await loadList();
                selectRefund(code);
            } catch (e) {
                notify(`Duyệt thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'cancel-approve') {
            const reason = await Popup.prompt('Lý do hủy duyệt (sẽ trả tồn về):', {
                defaultValue: '',
            });
            if (reason === null) return;
            try {
                const res = await fetchJson(
                    `${SM_API}/${encodeURIComponent(code)}/cancel-approve`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reason,
                            userId: _currentUserInfo().userId,
                            userName: _currentUserInfo().userName,
                        }),
                    }
                );
                notify(`✓ Đã trả tồn về (${res.linesProcessed || 0} dòng SP)`, 'success');
                await loadList();
                selectRefund(code);
            } catch (e) {
                notify(`Hủy duyệt thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'refunded') {
            const method = await Popup.prompt('Phương thức hoàn (cash/bank/debt_offset/replace):', {
                defaultValue: STATE.selected.refundMethod || 'bank',
            });
            if (method === null) return;
            try {
                await fetchJson(`${SM_API}/${encodeURIComponent(code)}/refunded`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        refundMethod: method,
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                notify(`✓ Đã ghi nhận NCC hoàn tiền`, 'success');
                await loadList();
                selectRefund(code);
            } catch (e) {
                notify(`Đánh dấu hoàn tiền thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'reject') {
            const reason = await Popup.prompt('Lý do NCC từ chối (sẽ trả tồn nếu đã trừ):', {
                defaultValue: '',
            });
            if (reason === null) return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        reason,
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                notify(
                    `✓ Đã từ chối${res.linesProcessed ? ` + trả tồn ${res.linesProcessed} dòng` : ''}`,
                    'success'
                );
                await loadList();
                selectRefund(code);
            } catch (e) {
                notify(`Từ chối thất bại: ${e.message}`, 'error');
            }
            return;
        }
    }

    // ---------- Create / Edit Modal ----------
    // NCC dùng chung: gợi ý tên NCC trong form thủ công từ nguồn duy nhất
    // Web2SuppliersCache (Ví NCC / supplier-wallet). Form quick-refund vẫn lấy NCC
    // từ ngữ cảnh mua hàng (so-order) — không đụng.
    function _populateSupplierDatalist() {
        const dl = document.getElementById('prSupplierNameList');
        const cache = window.Web2SuppliersCache;
        if (!dl || !cache?.init) return;
        cache
            .init()
            .then(() => {
                const names = cache.getNames ? cache.getNames() : [];
                dl.innerHTML = names
                    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
                    .join('');
            })
            .catch(() => {});
    }

    function openModal(existing) {
        const modal = $('prModal');
        modal.hidden = false;
        $('prModalTitle').textContent = existing
            ? `Sửa phiếu ${existing.code}`
            : 'Phiếu trả hàng NCC mới';

        const form = $('prForm');
        form.reset();
        _populateSupplierDatalist();
        if (existing) {
            const set = (name, val) => {
                if (form.elements[name]) form.elements[name].value = val ?? '';
            };
            set('code', existing.code);
            set('name', existing.name);
            set('supplierCode', existing.supplierCode);
            set('supplierName', existing.supplierName);
            set('supplierPhone', existing.supplierPhone);
            set('sourcePurchaseCode', existing.sourcePurchaseCode);
            set('refundDate', existing.refundDate);
            set('reason', existing.reason || 'defect');
            set('refundMethod', existing.refundMethod || 'bank');
            set('totalQty', existing.totalQty);
            set('totalAmount', existing.totalAmount);
            set('note', existing.note);
            // Products: serialize to pipe text
            const prods = parseProducts(existing.products);
            const text = prods
                .map((p) => `${p.code} | ${p.name} | ${p.qty} | ${p.price}`)
                .join('\n');
            set('productsText', text);
            form.dataset.editCode = existing.code;
        } else {
            // Auto-fill new code
            const today = new Date();
            const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            const rnd = String(Math.floor(Math.random() * 999)).padStart(3, '0');
            form.elements['code'].value = `TRA-${ymd}-${rnd}`;
            form.elements['refundDate'].value = today.toISOString().slice(0, 10);
            delete form.dataset.editCode;
        }
    }
    function closeModal() {
        $('prModal').hidden = true;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const productsText = fd.get('productsText') || '';
        const products = parseProducts(String(productsText));
        const payload = {
            code: fd.get('code'),
            name: fd.get('name'),
            data: {
                supplierCode: fd.get('supplierCode') || null,
                supplierName: fd.get('supplierName') || null,
                supplierPhone: fd.get('supplierPhone') || null,
                sourcePurchaseCode: fd.get('sourcePurchaseCode') || null,
                refundDate: fd.get('refundDate') || null,
                reason: fd.get('reason') || null,
                refundMethod: fd.get('refundMethod') || null,
                totalQty: Number(fd.get('totalQty') || 0),
                totalAmount: Number(fd.get('totalAmount') || 0),
                note: fd.get('note') || null,
                products,
                status: 'draft', // mới tạo = draft; edit thì giữ status cũ ở server side qua merge
            },
        };
        // NCC dùng chung: tên NCC nhập tay → đảm bảo tồn tại trong nguồn duy nhất
        // Ví NCC (fire-and-forget, idempotent). Không chặn submit nếu lỗi.
        if (payload.data.supplierName && window.Web2SuppliersCache?.ensure) {
            window.Web2SuppliersCache.ensure(payload.data.supplierName).catch(() => {});
        }
        const isEdit = !!form.dataset.editCode;
        try {
            if (isEdit) {
                const code = form.dataset.editCode;
                // Generic update merges JSONB → giữ status hiện tại nếu không gửi
                const existing = STATE.items.find((x) => x.code === code);
                if (existing?.status) payload.data.status = existing.status;
                if (existing?.stock_deducted != null)
                    payload.data.stock_deducted = existing.stock_deducted;
                await fetchJson(`${GENERIC_API}/update/${encodeURIComponent(code)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                notify(`✓ Đã cập nhật phiếu ${code}`, 'success');
            } else {
                await fetchJson(`${GENERIC_API}/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                notify(`✓ Đã tạo phiếu ${payload.code}`, 'success');
            }
            closeModal();
            await loadList();
            selectRefund(payload.code);
        } catch (e) {
            notify(`Lưu thất bại: ${e.message}`, 'error');
        }
    }

    // ---------- Picker: chọn SP đã nhận hàng từ so-order ----------
    //
    // P1 2026-05-30 (refactor): user ask "sản phẩm đã NHẬN HÀNG bên so-order
    // sẽ có danh sách bên trả hàng NCC". Picker giờ source từ Firestore
    // `web2_so_order/main` (purchase context — NCC + SP user đặt), cross-ref
    // với Web2ProductsCache để biết stock thực (= max refundable qty).
    //
    // Filter: chỉ rows có matching web2_product VÀ stock > 0 (= đã nhận hàng).
    // Group by supplier (từ so-order row.supplier — NCC user thực sự mua từ,
    // KHÔNG dùng web2_products.supplier vì field đó chỉ giữ NCC đầu tiên).
    //
    // Schema mỗi item: { supplier, code, name, variant, orderedQty, stock,
    //                    price, sources: [{tab, ship, qty}] }

    const PICKER_STATE = {
        items: [], // (supplier, code) aggregates from so-order ∩ web2_products
        selectedCodes: new Set(),
        qtyOverrides: new Map(), // code → qty user nhập
        supplierFilter: '',
        search: '',
        onlyStock: true,
    };

    /**
     * Load so-order data từ localStorage (cùng domain) → fallback Firestore.
     * Join với Web2ProductsCache. Trả về aggregates by (supplier, code) cho
     * SP đã nhận hàng (stock>0).
     *
     * Lý do localStorage trước: so-order là local-first; data trong localStorage
     * mới nhất, Firestore có thể trễ vì debounced push. Same-domain key
     * `soOrder_v1` accessible cross-page.
     */
    async function loadSoOrderReceivedItems() {
        const cache = window.Web2ProductsCache;
        if (!cache) return { items: [], err: 'Web2ProductsCache chưa load' };

        let data = null;
        let source = 'none';
        // P1 2026-05-30: soOrder_v1 chuyển sang IDB qua Web2IdbStore.
        // Đọc IDB trước, fallback localStorage (legacy nếu chưa migrate).
        if (window.Web2IdbStore) {
            try {
                const store = window.Web2IdbStore.open('so_order_storage', {
                    migrateFromLs: 'soOrder_v1',
                });
                const idbData = await store.get();
                if (idbData) {
                    data = idbData;
                    source = 'idb';
                }
            } catch (e) {
                console.warn('[picker] IDB read fail:', e.message);
            }
        }
        if (!data) {
            try {
                const raw = localStorage.getItem('soOrder_v1');
                if (raw) {
                    data = JSON.parse(raw);
                    source = 'localStorage';
                }
            } catch (e) {
                console.warn('[picker] localStorage parse fail:', e.message);
            }
        }

        // Fallback Postgres (nguồn chuẩn từ C8) nếu cả IDB + localStorage trống.
        // 2026-06-14 (Hướng D): bỏ fallback Firestore frozen — so-order đã chuyển
        // sang Postgres, đọc qua shared reader Web2SoOrder.load() (có auth header).
        // Đây là consumer C8 bị bỏ sót khi fix data-flow (đã sửa debt/wallet/products).
        if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
            if (!window.Web2SoOrder?.load) {
                return { items: [], err: 'Web2SoOrder reader chưa load + local trống' };
            }
            try {
                const pgData = await window.Web2SoOrder.load();
                if (pgData && Array.isArray(pgData.tabs)) {
                    data = pgData;
                    source = 'postgres';
                }
            } catch (e) {
                return { items: [], err: `Sổ Order (Postgres): ${e.message}` };
            }
        }
        if (!data) return { items: [], err: null };
        console.log(`[picker] so-order loaded from ${source}`);
        const norm = cache._normalize;

        // HashMap O(1) lookup: normalize(name|variant) → product
        const productByKey = new Map();
        for (const p of cache.getAll()) {
            const key = norm(p.name) + '|' + norm(p.variant || '');
            if (!productByKey.has(key)) productByKey.set(key, p);
        }

        // Aggregate so-order rows by (supplier, code) — sum qty across shipments
        const agg = new Map();
        for (const tab of data.tabs || []) {
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    const productName = (r.productName || '').trim();
                    if (!supplier || !productName) continue;
                    const variant = (r.variant || '').trim();
                    const key = norm(productName) + '|' + norm(variant);
                    const matched = productByKey.get(key);
                    if (!matched) continue; // SP chưa sync web2_products
                    const stock = Number(matched.stock || 0);
                    if (stock <= 0) continue; // chưa nhận hàng → không trả được
                    // 2026-06-07: tách theo ĐƠN (shipment/đợt) — mỗi lần "Tạo Đơn
                    // Hàng" trong Sổ Order = 1 đơn riêng, KHÔNG gộp chung NCC. SP
                    // tạo ở đợt sau → nhóm riêng dù cùng NCC. aggKey gồm sh.id.
                    const aggKey = `${supplier}::${sh.id}::${matched.code}`;
                    if (!agg.has(aggKey)) {
                        agg.set(aggKey, {
                            aggId: aggKey,
                            supplier,
                            shipmentId: sh.id,
                            shipBatch: sh.batch || '',
                            shipDate: sh.date || '',
                            tabLabel: tab.label || tab.id,
                            code: matched.code,
                            name: matched.name,
                            variant: matched.variant || variant,
                            // Ảnh SP tham chiếu thẳng từ Kho SP (Web2ProductsCache).
                            imageUrl: matched.imageUrl || '',
                            stock,
                            price: Number(matched.price || r.price || 0),
                            orderedQty: 0,
                            sources: [],
                        });
                    }
                    const entry = agg.get(aggKey);
                    entry.orderedQty += Number(r.qty || 0);
                    entry.sources.push({
                        tab: tab.label || tab.id,
                        ship: sh.id,
                        qty: Number(r.qty || 0),
                    });
                }
            }
        }
        return { items: Array.from(agg.values()), err: null };
    }

    async function openPicker() {
        if (!window.Web2ProductsCache) {
            notify('Web2ProductsCache chưa load — refresh trang', 'error');
            return;
        }
        PICKER_STATE.selectedCodes.clear();
        PICKER_STATE.qtyOverrides.clear();
        PICKER_STATE.search = '';
        try {
            await window.Web2ProductsCache.init();
        } catch (e) {
            notify(`Tải kho SP thất bại: ${e.message}`, 'error');
            return;
        }
        const { items, err } = await loadSoOrderReceivedItems();
        if (err) {
            notify(`Tải so-order: ${err}`, 'warning');
        }
        PICKER_STATE.items = items;

        // Pre-fill supplier filter từ form NCC nếu có
        const formSupplier = $('prForm').elements['supplierName']?.value?.trim() || '';
        PICKER_STATE.supplierFilter = formSupplier;

        // Populate supplier dropdown — distinct từ so-order items
        const suppliers = Array.from(
            new Set(PICKER_STATE.items.map((p) => p.supplier).filter(Boolean))
        ).sort();
        const supSel = $('prPickerSupplierFilter');
        supSel.innerHTML =
            '<option value="">Tất cả NCC</option>' +
            suppliers
                .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
                .join('');
        supSel.value = PICKER_STATE.supplierFilter;
        $('prPickerSearch').value = '';
        $('prPickerOnlyStock').checked = PICKER_STATE.onlyStock;

        renderPicker();
        $('prPicker').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }

    function closePicker() {
        $('prPicker').hidden = true;
    }

    function renderPicker() {
        const q = PICKER_STATE.search.trim().toLowerCase();
        const filtered = PICKER_STATE.items.filter((it) => {
            if (PICKER_STATE.supplierFilter && it.supplier !== PICKER_STATE.supplierFilter)
                return false;
            if (q) {
                const hay =
                    `${it.code} ${it.name} ${it.variant || ''} ${it.supplier}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        // Group by ĐƠN (NCC + shipment/đợt) — tách đơn khác nhau dù cùng NCC.
        const grouped = new Map();
        for (const it of filtered) {
            const k = _orderGroupKey(it);
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k).push(it);
        }

        const listEl = $('prPickerList');
        if (!grouped.size) {
            const emptyMsg = PICKER_STATE.items.length
                ? 'Không có SP nào phù hợp filter.'
                : 'Chưa có SP đã nhận hàng từ Sổ Order — vào Sổ Order → Nhận hàng trước.';
            listEl.innerHTML = `<div class="pr-picker-empty">${emptyMsg}</div>`;
            updatePickerCount();
            return;
        }
        let html = '';
        for (const [, items] of grouped) {
            const first = items[0];
            html += `<div class="pr-picker-group">
                <h4>${escapeHtml(first.supplier)} <span class="pr-source-order-tag">${escapeHtml(_orderGroupLabel(first))}</span> <span class="pr-picker-group-count">${items.length} SP đã nhận</span></h4>
                <table class="pr-picker-table">
                    <thead><tr>
                        <th style="width:32px"></th>
                        <th style="width:140px">Mã SP</th>
                        <th>Tên + Biến thể</th>
                        <th class="num" style="width:70px" title="Tổng SL đã đặt từ Sổ Order">Đã đặt</th>
                        <th class="num" style="width:70px" title="Tồn kho hiện tại = đã nhận, tối đa có thể trả">Tồn kho</th>
                        <th class="num" style="width:80px">Trả SL</th>
                        <th class="num" style="width:100px">Giá</th>
                    </tr></thead>
                    <tbody>
                ${items
                    .map((it) => {
                        const isPicked = PICKER_STATE.selectedCodes.has(it.aggId);
                        const stock = it.stock;
                        const qty = PICKER_STATE.qtyOverrides.get(it.aggId) ?? stock;
                        return `<tr data-pick-agg="${escapeHtml(it.aggId)}" class="${isPicked ? 'is-picked' : ''}">
                            <td><input type="checkbox" class="pr-pick-cb" ${isPicked ? 'checked' : ''}></td>
                            <td><code>${escapeHtml(it.code)}</code></td>
                            <td>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</td>
                            <td class="num" style="color:#64748b">${it.orderedQty}</td>
                            <td class="num"><strong>${stock}</strong></td>
                            <td class="num"><input type="number" class="pr-pick-qty" min="1" max="${stock}" value="${qty}" style="width:60px;text-align:right;"></td>
                            <td class="num">${fmtMoney(it.price)}</td>
                        </tr>`;
                    })
                    .join('')}
                    </tbody>
                </table>
            </div>`;
        }
        listEl.innerHTML = html;
        updatePickerCount();
    }

    function updatePickerCount() {
        $('prPickerCount').textContent = `${PICKER_STATE.selectedCodes.size} SP đã chọn`;
    }

    function confirmPicker() {
        if (!PICKER_STATE.selectedCodes.size) {
            notify('Chưa chọn SP nào — tick checkbox bên trái', 'warning');
            return;
        }
        const lines = [];
        for (const aggId of PICKER_STATE.selectedCodes) {
            const it = PICKER_STATE.items.find((x) => x.aggId === aggId);
            if (!it) continue;
            const stock = it.stock;
            const qty = Math.min(Math.max(1, PICKER_STATE.qtyOverrides.get(aggId) ?? stock), stock);
            const nameWithVariant = it.variant ? `${it.name} (${it.variant})` : it.name;
            const price = Number(it.price) || 0;
            lines.push(`${it.code} | ${nameWithVariant} | ${qty} | ${price}`);
        }
        const textarea = $('prForm').elements['productsText'];
        const existing = (textarea.value || '').trim();
        textarea.value = existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n');

        // C11 (2026-06-13): recompute totalQty + totalAmount từ TOÀN BỘ textarea
        // (gồm cả các lần pick trước), KHÔNG chỉ batch hiện tại. Trước đây chỉ điền
        // batch cuối + guard `!value` → pick nhiều lần ⇒ tổng thiếu ⇒ trừ ví NCC
        // sai. Picker là nguồn chuẩn của danh sách → set đè; muốn tổng tuỳ chỉnh
        // (chiết khấu) thì sửa tay SAU lần pick cuối. Dòng format: `code|name|qty|price`.
        const qtyInp = $('prForm').elements['totalQty'];
        const amtInp = $('prForm').elements['totalAmount'];
        let totalQtyAll = 0;
        let totalAmountAll = 0;
        for (const line of textarea.value.split('\n')) {
            const parts = line.split('|').map((s) => s.trim());
            if (parts.length < 4) continue;
            const lq = Number(parts[2]) || 0;
            const lp = Number(parts[3]) || 0;
            totalQtyAll += lq;
            totalAmountAll += lq * lp;
        }
        if (qtyInp) qtyInp.value = totalQtyAll;
        if (amtInp) amtInp.value = totalAmountAll;

        closePicker();
        notify(`✓ Đã thêm ${lines.length} SP vào danh sách`, 'success');
    }

    function wirePicker() {
        $('prPickFromKho')?.addEventListener('click', openPicker);
        $('prPickerConfirm')?.addEventListener('click', confirmPicker);
        document
            .querySelectorAll('[data-pr-picker-close]')
            .forEach((el) => el.addEventListener('click', closePicker));
        $('prPickerSearch')?.addEventListener('input', (e) => {
            PICKER_STATE.search = e.target.value;
            renderPicker();
        });
        $('prPickerSupplierFilter')?.addEventListener('change', (e) => {
            PICKER_STATE.supplierFilter = e.target.value;
            renderPicker();
        });
        $('prPickerOnlyStock')?.addEventListener('change', (e) => {
            PICKER_STATE.onlyStock = e.target.checked;
            renderPicker();
        });
        // Delegated change handler cho checkbox + qty input
        $('prPickerList')?.addEventListener('change', (e) => {
            const cb = e.target.closest('.pr-pick-cb');
            if (cb) {
                const row = cb.closest('[data-pick-agg]');
                if (!row) return;
                const aggId = row.dataset.pickAgg;
                if (cb.checked) PICKER_STATE.selectedCodes.add(aggId);
                else PICKER_STATE.selectedCodes.delete(aggId);
                row.classList.toggle('is-picked', cb.checked);
                updatePickerCount();
                return;
            }
            const qty = e.target.closest('.pr-pick-qty');
            if (qty) {
                const row = qty.closest('[data-pick-agg]');
                if (!row) return;
                const aggId = row.dataset.pickAgg;
                const v = Number(qty.value || 0);
                PICKER_STATE.qtyOverrides.set(aggId, v);
                // Auto-pick when user nhập qty mà chưa checkbox
                if (v > 0 && !PICKER_STATE.selectedCodes.has(aggId)) {
                    PICKER_STATE.selectedCodes.add(aggId);
                    const cb = row.querySelector('.pr-pick-cb');
                    if (cb) cb.checked = true;
                    row.classList.add('is-picked');
                    updatePickerCount();
                }
            }
        });
    }

    // ---------- SSE ----------
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        STATE.sseUnsub = window.Web2SSE.subscribe('web2:purchase-refund', () => {
            // Debounce 600ms (chuẩn 500-600) để gom burst, tránh load liên tục.
            clearTimeout(setupSSE._t);
            setupSSE._t = setTimeout(() => loadList(), 600);
        });
    }

    // ---------- Section A: Hàng nhận từ Sổ Order (main UI) ----------
    //
    // P1 2026-05-30: user ask "đâu cần tạo phiếu mới — purchase-refund SẼ CÓ
    // DANH SÁCH nhận hàng từ so-order → trả hàng confirm, nhớ logic SL +
    // tiền ví NCC". Page giờ auto load so-order items khi init, render section
    // A. User click "Trả NCC" trên 1 row → quick modal → submit:
    //   1) POST /create với prefilled single product line
    //   2) POST /:code/approve (trừ stock idempotent)
    //   3) SupplierWalletStorage.addTransaction type='return' (giảm balance NCC)
    //   4) Push wallet → Firestore
    //   5) Reload section A + section B

    const SOURCE_STATE = {
        items: [],
        groups: [], // [[item,...], ...] — gom theo ĐƠN (NCC+shipment), rebuild mỗi render
        search: '',
        supplierFilter: '',
        loaded: false,
    };

    async function loadSourceItems() {
        if (!window.Web2ProductsCache) {
            notify('Web2ProductsCache chưa load — refresh trang', 'error');
            return;
        }
        try {
            await window.Web2ProductsCache.init();
        } catch (e) {
            notify(`Tải kho SP: ${e.message}`, 'error');
        }
        const { items, err } = await loadSoOrderReceivedItems();
        if (err) notify(`Tải Sổ Order: ${err}`, 'warning');
        SOURCE_STATE.items = items;
        SOURCE_STATE.loaded = true;

        // Populate supplier dropdown distinct
        const suppliers = Array.from(new Set(items.map((it) => it.supplier))).sort();
        const sel = $('prSourceSupplier');
        sel.innerHTML =
            '<option value="">Tất cả NCC</option>' +
            suppliers
                .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
                .join('');
        if (SOURCE_STATE.supplierFilter) sel.value = SOURCE_STATE.supplierFilter;

        renderSourceList();
    }

    function renderSourceList() {
        const q = SOURCE_STATE.search.trim().toLowerCase();
        const filtered = SOURCE_STATE.items.filter((it) => {
            if (SOURCE_STATE.supplierFilter && it.supplier !== SOURCE_STATE.supplierFilter)
                return false;
            if (q) {
                const hay =
                    `${it.code} ${it.name} ${it.variant || ''} ${it.supplier}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        $('prSourceCount').textContent = `${filtered.length} SP`;
        const listEl = $('prSourceList');
        const emptyEl = $('prSourceEmpty');
        if (!filtered.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;

        // Group by ĐƠN (NCC + shipment/đợt) — tách đơn khác nhau dù cùng NCC.
        const grouped = new Map();
        for (const it of filtered) {
            const k = _orderGroupKey(it);
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k).push(it);
        }

        // Lưu groups để modal trả-cả-đơn truy theo index (rebuild mỗi lần render).
        SOURCE_STATE.groups = Array.from(grouped.values());

        let html = '';
        SOURCE_STATE.groups.forEach((items, gi) => {
            const first = items[0];
            const totalValue = items.reduce((s, it) => s + it.stock * it.price, 0);
            html += `<div class="pr-source-group">
                <h3 class="pr-source-group-head">
                    <i data-lucide="building-2"></i>
                    ${escapeHtml(first.supplier)}
                    <span class="pr-source-order-tag">${escapeHtml(_orderGroupLabel(first))}</span>
                    <span class="pr-source-group-meta">${items.length} SP · tồn ${fmtMoney(totalValue)}</span>
                    <button class="btn btn-danger btn-sm pr-bulk-btn" data-bulk-group="${gi}" title="Trả nhiều SP của đơn này cùng lúc"><i data-lucide="undo-2"></i> Trả hàng</button>
                </h3>
                <table class="pr-source-table">
                    <thead><tr>
                        <th style="width:130px">Mã SP</th>
                        <th>Tên + Biến thể</th>
                        <th class="num" style="width:80px">Đã đặt</th>
                        <th class="num" style="width:80px">Tồn kho</th>
                        <th class="num" style="width:110px">Giá</th>
                        <th style="width:130px"></th>
                    </tr></thead>
                    <tbody>
                ${items
                    .map(
                        (it) => `<tr data-src-agg="${escapeHtml(it.aggId)}">
                        <td><code>${escapeHtml(it.code)}</code></td>
                        <td><div class="pr-name-cell">${thumbHtml(it.imageUrl)}<span>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</span></div></td>
                        <td class="num" style="color:#64748b">${it.orderedQty}</td>
                        <td class="num"><strong>${it.stock}</strong></td>
                        <td class="num">${fmtMoney(it.price)}</td>
                        <td><button class="btn btn-danger btn-sm pr-source-refund" data-src-agg="${escapeHtml(it.aggId)}"><i data-lucide="undo-2"></i> Trả NCC</button></td>
                    </tr>`
                    )
                    .join('')}
                    </tbody>
                </table>
            </div>`;
        });
        listEl.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    // ---------- Quick Refund Modal ----------

    const QUICK_STATE = {
        item: null, // current source item being refunded
    };

    function openQuickRefund(aggId) {
        const item = SOURCE_STATE.items.find((it) => it.aggId === aggId);
        if (!item) {
            notify('SP không còn trong danh sách', 'error');
            return;
        }
        QUICK_STATE.item = item;
        const form = $('prQuickForm');
        form.reset();
        form.elements['qty'].value = item.stock;
        form.elements['qty'].max = item.stock;
        form.elements['price'].value = item.price;
        $('prQuickQtyHint').querySelector('span').textContent = String(item.stock);

        $('prQuickInfo').innerHTML = `
            <div class="pr-quick-info-row" style="align-items:center;">
                <span class="pr-quick-label">Ảnh:</span>
                ${thumbHtml(item.imageUrl)}
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">NCC:</span>
                <strong>${escapeHtml(item.supplier)}</strong>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Đơn:</span>
                <span>${escapeHtml(_orderGroupLabel(item))}</span>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Mã SP:</span>
                <code>${escapeHtml(item.code)}</code>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Tên SP:</span>
                ${escapeHtml(item.name)}${item.variant ? ` <small style="color:#64748b">(${escapeHtml(item.variant)})</small>` : ''}
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Tồn kho:</span>
                <strong>${item.stock}</strong>
                <span style="color:#64748b">· đã đặt qua Sổ Order ${item.orderedQty}</span>
            </div>
        `;
        updateQuickTotal();
        $('prQuickModal').hidden = false;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => form.elements['qty'].focus(), 50);
    }

    function closeQuickRefund() {
        $('prQuickModal').hidden = true;
        QUICK_STATE.item = null;
    }

    function updateQuickTotal() {
        const form = $('prQuickForm');
        const qty = Number(form.elements['qty'].value) || 0;
        const price = Number(form.elements['price'].value) || 0;
        $('prQuickTotal').textContent = fmtMoney(qty * price);
    }

    /**
     * Submit quick refund:
     *   1. POST /api/web2/purchase-refund/create — tạo phiếu draft
     *   2. POST /api/purchase-refund/:code/approve — trừ stock idempotent
     *   3. SupplierWalletStorage.addTransaction type='return' — giảm balance NCC
     *   4. Push wallet → Firestore
     */
    async function submitQuickRefund(e) {
        e.preventDefault();
        const item = QUICK_STATE.item;
        if (!item) return;
        const form = $('prQuickForm');
        const qty = Math.max(1, Math.min(item.stock, Number(form.elements['qty'].value) || 0));
        const price = Number(form.elements['price'].value) || 0;
        const reason = form.elements['reason'].value;
        const method = form.elements['refundMethod'].value;
        const note = form.elements['note'].value || '';
        const amount = qty * price;

        // Gen mã phiếu: TRA-<yyyymmdd>-<NCCshort>-<rand4>
        const today = new Date();
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const ncShort = (item.supplier || 'NCC')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 6);
        const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
        const refundCode = `TRA-${ymd}-${ncShort}-${rand}`;
        const refundName = `Trả ${item.name}${item.variant ? ' (' + item.variant + ')' : ''} cho ${item.supplier}`;

        const submitBtn = $('prQuickSubmit');
        submitBtn.disabled = true;
        const orig = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader"></i> Đang xử lý...';

        const userInfo = _currentUserInfo();
        try {
            // C9 (2026-06-13): 1 LẦN GỌI ATOMIC thay 3 bước rời (create→approve→
            // wallet). Server tạo phiếu (approved) + trừ kho + ghi ledger ví NCC
            // trong 1 transaction → approve fail KHÔNG còn để lại phiếu draft mồ côi.
            const productName = item.variant ? `${item.name} (${item.variant})` : item.name;
            await fetchJson(`${SM_API}/quick-refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: refundCode,
                    name: refundName,
                    supplier: item.supplier,
                    supplierCode: null,
                    refundDate: today.toISOString().slice(0, 10),
                    reason,
                    refundMethod: method,
                    totalQty: qty,
                    totalAmount: amount,
                    note,
                    products: [{ code: item.code, name: productName, qty, price }],
                    sourcePurchaseCode: item.sources?.[0]?.ship || null,
                    userId: userInfo.userId,
                    userName: userInfo.userName,
                }),
            });

            notify(
                `✓ Đã trả ${qty} ${item.name} cho ${item.supplier} — giảm ví NCC ${fmtMoney(amount)}`,
                'success'
            );
            closeQuickRefund();
            // Reload section A (stock đã giảm) + section B (phiếu mới). Ví NCC cập
            // nhật realtime qua SSE web2:supplier-wallet (server đã _notify).
            // quick-refund KHÔNG notify SSE 'web2:products' → ép refresh cache để
            // section A hiện tồn kho mới (init() idempotent sẽ giữ stock cũ).
            await window.Web2ProductsCache?.refresh?.().catch(() => {});
            await loadSourceItems();
            await loadList();
        } catch (e) {
            console.error('[quick refund] fail:', e);
            notify(`Trả NCC thất bại: ${e.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    /**
     * Add transaction type='return' to supplier wallet → giảm balance.
     * Wallet là local-first (localStorage `supplierWallet_v1` + Firestore
     * `web2_supplier_wallet/main`). Pattern: load → mutate → push.
     */
    async function updateSupplierWallet(supplier, opts) {
        if (!window.SupplierWalletStorage) {
            console.warn('[quick refund] SupplierWalletStorage missing — skip wallet');
            return;
        }
        const SW = window.SupplierWalletStorage;
        try {
            // Pull latest từ Firestore (so other tabs/máy đã mutate cũng sync)
            await SW.Sync.init();
        } catch (e) {
            console.warn('[quick refund] wallet sync init fail:', e.message);
        }
        // C6 fix 2026-06-11: SW.load() là async (IDB read) — thiếu await làm
        // state = Promise → addTransaction TypeError → ví NCC không bao giờ ghi.
        const state = await SW.load();
        const productLabel = opts.variant
            ? `${opts.productName} (${opts.variant})`
            : opts.productName;
        const byUser = opts.userName ? ` · bởi ${opts.userName}` : '';
        const note = `Trả ${opts.qty}× ${productLabel} — ${opts.refundCode} (${opts.method})${byUser}`;
        // ĐỢT E (2026-06-12): addTransaction giờ POST server ledger (await,
        // idempotent theo txId = refundCode — retry không ghi đôi). Lỗi →
        // throw cho caller (submitQuickRefund đã có try/catch ví riêng, toast
        // warning "phiếu OK + ví fail"). Hết fire-and-forget Sync.push.
        await SW.addTransaction(state, supplier, {
            type: 'return',
            amount: opts.amount,
            note,
            txId: `tx-refund-${opts.refundCode}`,
            ref: {
                refundCode: opts.refundCode,
                qty: opts.qty,
                method: opts.method,
                userId: opts.userId || null,
                userName: opts.userName || null,
            },
            performedBy: opts.userName || null,
        });
    }

    function wireQuickModal() {
        $('prQuickForm').addEventListener('submit', submitQuickRefund);
        document
            .querySelectorAll('[data-pr-quick-close]')
            .forEach((el) => el.addEventListener('click', closeQuickRefund));
        const form = $('prQuickForm');
        form.elements['qty'].addEventListener('input', updateQuickTotal);
        form.elements['price'].addEventListener('input', updateQuickTotal);
        // Esc to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('prQuickModal').hidden) closeQuickRefund();
        });
    }

    // ---------- Bulk Refund Modal (trả cả đơn 1 lần, SL mặc định 0) ----------
    //
    // User ask 2026-06-17: nút "Trả hàng" ở header NHÓM (đơn) → mở modal gồm
    // TẤT CẢ SP của đơn, mỗi SP 1 ô SL mặc định 0 để chỉnh → nhanh hơn trả từng
    // cái. Submit 1 phiếu quick-refund đa SP (backend đã atomic: trừ kho từng
    // dòng + ghi ví NCC theo totalAmount). CHỈ SP có SL>0 mới đưa vào phiếu.

    const BULK_STATE = {
        group: null, // array of source items (1 đơn)
    };

    function openBulkRefund(groupIdx) {
        const group = SOURCE_STATE.groups[groupIdx];
        if (!group || !group.length) {
            notify('Đơn không còn SP nào', 'error');
            return;
        }
        BULK_STATE.group = group;
        const first = group[0];
        const form = $('prBulkForm');
        form.reset();

        $('prBulkInfo').innerHTML = `
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">NCC:</span>
                <strong>${escapeHtml(first.supplier)}</strong>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Đơn:</span>
                <span>${escapeHtml(_orderGroupLabel(first))}</span>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Số SP:</span>
                <strong>${group.length}</strong>
                <span style="color:#64748b">· nhập SL muốn trả cho từng dòng</span>
            </div>
        `;
        renderBulkRows();
        updateBulkTotal();
        $('prBulkModal').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }

    function renderBulkRows() {
        const group = BULK_STATE.group || [];
        $('prBulkRows').innerHTML = group
            .map(
                (it, i) => `<tr data-bulk-idx="${i}">
                    <td><code>${escapeHtml(it.code)}</code></td>
                    <td><div class="pr-name-cell">${thumbHtml(it.imageUrl)}<span>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</span></div></td>
                    <td class="num"><strong>${it.stock}</strong></td>
                    <td class="num">${fmtMoney(it.price)}</td>
                    <td class="num"><input type="number" class="pr-bulk-qty" min="0" max="${it.stock}" value="0" data-bulk-idx="${i}"></td>
                    <td class="num pr-bulk-line" data-bulk-line="${i}">0₫</td>
                </tr>`
            )
            .join('');
    }

    // Đọc qty từng dòng (clamp 0..stock), trả [{item, qty}] cho SP có qty>0.
    function _collectBulkLines() {
        const group = BULK_STATE.group || [];
        const out = [];
        document.querySelectorAll('#prBulkRows .pr-bulk-qty').forEach((inp) => {
            const i = Number(inp.dataset.bulkIdx);
            const it = group[i];
            if (!it) return;
            const qty = Math.max(0, Math.min(Number(it.stock) || 0, Number(inp.value) || 0));
            if (qty > 0) out.push({ item: it, qty });
        });
        return out;
    }

    function updateBulkTotal() {
        const group = BULK_STATE.group || [];
        let totalQty = 0;
        let totalAmount = 0;
        document.querySelectorAll('#prBulkRows .pr-bulk-qty').forEach((inp) => {
            const i = Number(inp.dataset.bulkIdx);
            const it = group[i];
            if (!it) return;
            const qty = Math.max(0, Math.min(Number(it.stock) || 0, Number(inp.value) || 0));
            const line = qty * (Number(it.price) || 0);
            totalQty += qty;
            totalAmount += line;
            const cell = document.querySelector(`#prBulkRows [data-bulk-line="${i}"]`);
            if (cell) cell.textContent = fmtMoney(line);
            const row = inp.closest('tr');
            if (row) row.classList.toggle('is-on', qty > 0);
        });
        $('prBulkQty').textContent = String(totalQty);
        $('prBulkTotal').textContent = fmtMoney(totalAmount);
    }

    function closeBulkRefund() {
        $('prBulkModal').hidden = true;
        BULK_STATE.group = null;
    }

    async function submitBulkRefund(e) {
        e.preventDefault();
        const lines = _collectBulkLines();
        if (!lines.length) {
            notify('Chưa nhập SL cho SP nào (mặc định 0) — nhập SL muốn trả', 'warning');
            return;
        }
        const form = $('prBulkForm');
        const first = BULK_STATE.group[0];
        const supplier = first.supplier;
        const reason = form.elements['reason'].value;
        const method = form.elements['refundMethod'].value;
        const note = form.elements['note'].value || '';

        const products = lines.map(({ item, qty }) => ({
            code: item.code,
            name: item.variant ? `${item.name} (${item.variant})` : item.name,
            qty,
            price: Number(item.price) || 0,
        }));
        const totalQty = lines.reduce((s, l) => s + l.qty, 0);
        const totalAmount = lines.reduce((s, l) => s + l.qty * (Number(l.item.price) || 0), 0);

        // Mã + tên phiếu (gộp cả đơn).
        const today = new Date();
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const ncShort = (supplier || 'NCC')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 6);
        const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
        const refundCode = `TRA-${ymd}-${ncShort}-${rand}`;
        const refundName = `Trả ${products.length} SP cho ${supplier}`;

        const submitBtn = $('prBulkSubmit');
        submitBtn.disabled = true;
        const orig = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader"></i> Đang xử lý...';
        if (window.lucide) window.lucide.createIcons();

        const userInfo = _currentUserInfo();
        try {
            // 1 phiếu quick-refund đa SP — atomic ở server (trừ kho từng dòng +
            // ghi ledger ví NCC theo totalAmount, idempotent theo txId=code).
            await fetchJson(`${SM_API}/quick-refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: refundCode,
                    name: refundName,
                    supplier,
                    supplierCode: null,
                    refundDate: today.toISOString().slice(0, 10),
                    reason,
                    refundMethod: method,
                    totalQty,
                    totalAmount,
                    note,
                    products,
                    sourcePurchaseCode: first.shipmentId || first.sources?.[0]?.ship || null,
                    userId: userInfo.userId,
                    userName: userInfo.userName,
                }),
            });
            notify(
                `✓ Đã trả ${totalQty} SP (${products.length} dòng) cho ${supplier} — giảm ví NCC ${fmtMoney(totalAmount)}`,
                'success'
            );
            closeBulkRefund();
            // quick-refund KHÔNG notify SSE 'web2:products' → ép refresh cache để
            // section A hiện tồn kho mới (init() idempotent giữ stock cũ).
            await window.Web2ProductsCache?.refresh?.().catch(() => {});
            await loadSourceItems();
            await loadList();
        } catch (err) {
            console.error('[bulk refund] fail:', err);
            notify(`Trả NCC thất bại: ${err.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function wireBulkModal() {
        $('prBulkForm')?.addEventListener('submit', submitBulkRefund);
        document
            .querySelectorAll('[data-pr-bulk-close]')
            .forEach((el) => el.addEventListener('click', closeBulkRefund));
        // Live total khi đổi qty bất kỳ dòng nào. Clamp input về 0..tồn để user
        // thấy đúng số (không cho gõ vượt tồn kho).
        $('prBulkRows')?.addEventListener('input', (e) => {
            const inp = e.target.closest('.pr-bulk-qty');
            if (!inp) return;
            const group = BULK_STATE.group || [];
            const it = group[Number(inp.dataset.bulkIdx)];
            if (it && inp.value !== '') {
                const max = Number(it.stock) || 0;
                let v = Math.floor(Number(inp.value) || 0);
                if (v < 0) v = 0;
                if (v > max) v = max;
                if (String(v) !== inp.value) inp.value = String(v);
            }
            updateBulkTotal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('prBulkModal').hidden) closeBulkRefund();
        });
    }

    function wireSourceList() {
        $('prReloadBtn').addEventListener('click', async () => {
            await Promise.all([loadSourceItems(), loadList()]);
        });
        $('prSourceSearch').addEventListener('input', (e) => {
            SOURCE_STATE.search = e.target.value;
            renderSourceList();
        });
        $('prSourceSupplier').addEventListener('change', (e) => {
            SOURCE_STATE.supplierFilter = e.target.value;
            renderSourceList();
        });
        // Delegate "Trả NCC" (1 SP) + "Trả hàng" (cả đơn) buttons
        $('prSourceList').addEventListener('click', (e) => {
            const bulkBtn = e.target.closest('.pr-bulk-btn');
            if (bulkBtn) {
                openBulkRefund(Number(bulkBtn.dataset.bulkGroup));
                return;
            }
            const btn = e.target.closest('.pr-source-refund');
            if (!btn) return;
            openQuickRefund(btn.dataset.srcAgg);
        });
    }

    // ---------- Init ----------
    function init() {
        // Mount sidebar
        if (window.Web2Sidebar) {
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        }
        // Wire UI — section A + B
        $('prFilterStatus')?.addEventListener('change', (e) => {
            STATE.filterStatus = e.target.value;
            renderList();
        });
        $('prSearch')?.addEventListener('input', (e) => {
            STATE.search = e.target.value;
            renderList();
        });
        // Legacy modal close (still has form for edit existing)
        document
            .querySelectorAll('[data-pr-modal-close]')
            .forEach((el) => el.addEventListener('click', closeModal));
        $('prForm')?.addEventListener('submit', handleFormSubmit);
        wirePicker();
        wireSourceList();
        wireQuickModal();
        wireBulkModal();
        // Click thumbnail SP (bất kỳ đâu) → xem ảnh full-size.
        document.addEventListener('click', (e) => {
            const img = e.target.closest('img.pr-thumb-zoom');
            if (img && img.dataset.full) {
                e.preventDefault();
                e.stopPropagation();
                openImageLightbox(img.dataset.full);
            }
        });

        // Initial loads: section A (so-order) + section B (refunds)
        loadSourceItems();
        loadList();
        setupSSE();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
