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

    // ---------- Picker: chọn SP từ Kho (stock>0) ----------
    //
    // P1 2026-05-30: user ask "nhận hàng -> purchase-refund sẽ có danh sách
    // để trả hàng cho NCC". Thay vì gõ thủ công textarea, mở picker hiển thị
    // tất cả SP đã nhập kho (stock>0) group by NCC, multi-select + qty editor.
    // Sau khi confirm → emit lines vào textarea + auto compute totals.
    //
    // Data source: Web2ProductsCache (đã pre-load tất cả SP, refresh qua SSE).

    const PICKER_STATE = {
        products: [],
        selectedCodes: new Set(),
        qtyOverrides: new Map(), // code → qty user nhập
        supplierFilter: '',
        search: '',
        onlyStock: true,
    };

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
        PICKER_STATE.products = window.Web2ProductsCache.getAll() || [];

        // Pre-fill supplier filter từ form NCC nếu có
        const formSupplier = $('prForm').elements['supplierName']?.value?.trim() || '';
        PICKER_STATE.supplierFilter = formSupplier;

        // Populate supplier dropdown — distinct list từ tất cả products
        const suppliers = Array.from(
            new Set(PICKER_STATE.products.map((p) => (p.supplier || '').trim()).filter(Boolean))
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
        const filtered = PICKER_STATE.products.filter((p) => {
            if (PICKER_STATE.onlyStock && Number(p.stock || 0) <= 0) return false;
            if (PICKER_STATE.supplierFilter && (p.supplier || '') !== PICKER_STATE.supplierFilter)
                return false;
            if (q) {
                const hay =
                    `${p.code || ''} ${p.name || ''} ${p.variant || ''} ${p.supplier || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        // Group by supplier
        const grouped = new Map();
        for (const p of filtered) {
            const k = p.supplier || '(Chưa có NCC)';
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k).push(p);
        }

        const listEl = $('prPickerList');
        if (!grouped.size) {
            listEl.innerHTML = '<div class="pr-picker-empty">Không có SP nào phù hợp filter.</div>';
            updatePickerCount();
            return;
        }
        let html = '';
        for (const [supplier, items] of grouped) {
            html += `<div class="pr-picker-group">
                <h4>${escapeHtml(supplier)} <span class="pr-picker-group-count">${items.length} SP</span></h4>
                <table class="pr-picker-table">
                    <thead><tr>
                        <th style="width:32px"></th>
                        <th style="width:140px">Mã SP</th>
                        <th>Tên + Biến thể</th>
                        <th class="num" style="width:60px">Tồn</th>
                        <th class="num" style="width:80px">Trả SL</th>
                        <th class="num" style="width:100px">Giá</th>
                    </tr></thead>
                    <tbody>
                ${items
                    .map((p) => {
                        const isPicked = PICKER_STATE.selectedCodes.has(p.code);
                        const stock = Number(p.stock || 0);
                        const qty = PICKER_STATE.qtyOverrides.get(p.code) ?? stock;
                        return `<tr data-pick-code="${escapeHtml(p.code)}" class="${isPicked ? 'is-picked' : ''}">
                            <td><input type="checkbox" class="pr-pick-cb" ${isPicked ? 'checked' : ''}></td>
                            <td><code>${escapeHtml(p.code)}</code></td>
                            <td>${escapeHtml(p.name)}${p.variant ? ` <small style="color:#64748b">(${escapeHtml(p.variant)})</small>` : ''}</td>
                            <td class="num">${stock}</td>
                            <td class="num"><input type="number" class="pr-pick-qty" min="1" max="${stock}" value="${qty}" style="width:60px;text-align:right;"></td>
                            <td class="num">${fmtMoney(p.price)}</td>
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
            const p = PICKER_STATE.products.find((x) => x.code === code);
            if (!p) continue;
            const stock = Number(p.stock || 0);
            const qty = Math.min(
                Math.max(1, PICKER_STATE.qtyOverrides.get(code) ?? stock),
                stock || 9999
            );
            const nameWithVariant = p.variant ? `${p.name} (${p.variant})` : p.name;
            const price = Number(p.price) || 0;
            lines.push(`${p.code} | ${nameWithVariant} | ${qty} | ${price}`);
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
