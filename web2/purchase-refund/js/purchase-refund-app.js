// #Note: WEB2.0 module — Trả hàng NCC.
// CRUD generic qua /api/web2/purchase-refund/* + state machine qua /api/purchase-refund/:code/{approve|cancel-approve|refunded|reject}.
// SSE topic 'web2:purchase-refund' tự reload list khi server change state.

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
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
            .replace(/"/g, '&quot;');
    }

    // ---------- API ----------
    async function fetchJson(url, opts) {
        const r = await fetch(url, opts);
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

        const actions = [];
        if (['draft', 'sent'].includes(status)) {
            actions.push(
                `<button class="btn btn-success btn-sm" data-action="approve"><i data-lucide="check-circle"></i> Duyệt + Trừ kho</button>`
            );
            actions.push(
                `<button class="btn btn-danger btn-sm" data-action="reject"><i data-lucide="x-circle"></i> NCC từ chối</button>`
            );
            actions.push(
                `<button class="btn btn-secondary btn-sm" data-action="edit"><i data-lucide="edit-3"></i> Sửa</button>`
            );
        }
        if (status === 'approved') {
            actions.push(
                `<button class="btn btn-success btn-sm" data-action="refunded"><i data-lucide="banknote"></i> NCC đã hoàn tiền</button>`
            );
            actions.push(
                `<button class="btn btn-warn btn-sm" data-action="cancel-approve"><i data-lucide="undo-2"></i> Hủy duyệt (trả tồn về)</button>`
            );
            actions.push(
                `<button class="btn btn-danger btn-sm" data-action="reject"><i data-lucide="x-circle"></i> NCC từ chối (trả tồn)</button>`
            );
        }
        if (status === 'refunded' || status === 'rejected' || status === 'cancelled') {
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
                !confirm(
                    `Duyệt phiếu ${code}? Stock kho sẽ TRỪ qty cho từng SP. Hành động idempotent.`
                )
            )
                return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
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
            const reason = prompt('Lý do hủy duyệt (sẽ trả tồn về):', '');
            if (reason === null) return;
            try {
                const res = await fetchJson(
                    `${SM_API}/${encodeURIComponent(code)}/cancel-approve`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason }),
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
            const method = prompt(
                'Phương thức hoàn (cash/bank/debt_offset/replace):',
                STATE.selected.refundMethod || 'bank'
            );
            if (method === null) return;
            try {
                await fetchJson(`${SM_API}/${encodeURIComponent(code)}/refunded`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refundMethod: method }),
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
            const reason = prompt('Lý do NCC từ chối (sẽ trả tồn nếu đã trừ):', '');
            if (reason === null) return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason }),
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
    function openModal(existing) {
        const modal = $('prModal');
        modal.hidden = false;
        $('prModalTitle').textContent = existing
            ? `Sửa phiếu ${existing.code}`
            : 'Phiếu trả hàng NCC mới';

        const form = $('prForm');
        form.reset();
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
        try {
            const raw = localStorage.getItem('soOrder_v1');
            if (raw) {
                data = JSON.parse(raw);
                source = 'localStorage';
            }
        } catch (e) {
            console.warn('[picker] localStorage parse fail:', e.message);
        }

        // Fallback Firestore nếu localStorage trống
        if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
            if (typeof firebase === 'undefined' || !firebase.firestore) {
                return { items: [], err: 'Firebase chưa load + localStorage trống' };
            }
            try {
                const db = firebase.firestore();
                const snap = await db.collection('web2_so_order').doc('main').get();
                if (snap.exists) {
                    data = snap.data();
                    source = 'firestore';
                }
            } catch (e) {
                return { items: [], err: `Firestore: ${e.message}` };
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
                    const aggKey = `${supplier}::${matched.code}`;
                    if (!agg.has(aggKey)) {
                        agg.set(aggKey, {
                            supplier,
                            code: matched.code,
                            name: matched.name,
                            variant: matched.variant || variant,
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

        // Group by supplier
        const grouped = new Map();
        for (const it of filtered) {
            const k = it.supplier;
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
        for (const [supplier, items] of grouped) {
            html += `<div class="pr-picker-group">
                <h4>${escapeHtml(supplier)} <span class="pr-picker-group-count">${items.length} SP đã nhận</span></h4>
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
                        const isPicked = PICKER_STATE.selectedCodes.has(it.code);
                        const stock = it.stock;
                        const qty = PICKER_STATE.qtyOverrides.get(it.code) ?? stock;
                        return `<tr data-pick-code="${escapeHtml(it.code)}" class="${isPicked ? 'is-picked' : ''}">
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
        let addedQty = 0;
        let addedAmount = 0;
        for (const code of PICKER_STATE.selectedCodes) {
            const it = PICKER_STATE.items.find((x) => x.code === code);
            if (!it) continue;
            const stock = it.stock;
            const qty = Math.min(Math.max(1, PICKER_STATE.qtyOverrides.get(code) ?? stock), stock);
            const nameWithVariant = it.variant ? `${it.name} (${it.variant})` : it.name;
            const price = Number(it.price) || 0;
            lines.push(`${it.code} | ${nameWithVariant} | ${qty} | ${price}`);
            addedQty += qty;
            addedAmount += qty * price;
        }
        const textarea = $('prForm').elements['productsText'];
        const existing = (textarea.value || '').trim();
        textarea.value = existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n');

        // Auto fill totalQty + totalAmount nếu trống
        const qtyInp = $('prForm').elements['totalQty'];
        const amtInp = $('prForm').elements['totalAmount'];
        if (qtyInp && !qtyInp.value) qtyInp.value = addedQty;
        if (amtInp && !amtInp.value) amtInp.value = addedAmount;

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
                const row = cb.closest('[data-pick-code]');
                if (!row) return;
                const code = row.dataset.pickCode;
                if (cb.checked) PICKER_STATE.selectedCodes.add(code);
                else PICKER_STATE.selectedCodes.delete(code);
                row.classList.toggle('is-picked', cb.checked);
                updatePickerCount();
                return;
            }
            const qty = e.target.closest('.pr-pick-qty');
            if (qty) {
                const row = qty.closest('[data-pick-code]');
                if (!row) return;
                const code = row.dataset.pickCode;
                const v = Number(qty.value || 0);
                PICKER_STATE.qtyOverrides.set(code, v);
                // Auto-pick when user nhập qty mà chưa checkbox
                if (v > 0 && !PICKER_STATE.selectedCodes.has(code)) {
                    PICKER_STATE.selectedCodes.add(code);
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
            // Debounce 400ms để tránh load liên tục.
            clearTimeout(setupSSE._t);
            setupSSE._t = setTimeout(() => loadList(), 400);
        });
    }

    // ---------- Init ----------
    function init() {
        // Mount sidebar
        if (window.Web2Sidebar) {
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        }
        // Wire UI
        $('prNewBtn').addEventListener('click', () => openModal(null));
        $('prReloadBtn').addEventListener('click', loadList);
        $('prFilterStatus').addEventListener('change', (e) => {
            STATE.filterStatus = e.target.value;
            renderList();
        });
        $('prSearch').addEventListener('input', (e) => {
            STATE.search = e.target.value;
            renderList();
        });
        document
            .querySelectorAll('[data-pr-modal-close]')
            .forEach((el) => el.addEventListener('click', closeModal));
        $('prForm').addEventListener('submit', handleFormSubmit);
        wirePicker();

        loadList();
        setupSSE();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
