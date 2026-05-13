// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Customer Orders Lookup — tra cứu mọi đơn hàng của khách qua TPOS OData, có expand chi tiết.
// Trigger: input + button ở đầu trang issue-tracking. Modal liệt kê đơn → click row expand.

(function () {
    'use strict';

    const STATE_LABELS = {
        draft: 'Nháp',
        open: 'Mở',
        paid: 'Đã TT',
        cancel: 'Hủy',
    };
    const STATE_GROUP = {
        draft: 'cancel',
        cancel: 'cancel',
        open: 'open',
        paid: 'paid',
    };

    const state = {
        query: '',
        normalizedQuery: '',
        searchMode: null,
        days: 180,
        orders: [],
        filter: 'all',
        loadedDetails: new Map(),
        loadingDetails: new Set(),
    };

    function $(id) {
        return document.getElementById(id);
    }

    function stripDiacritics(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .trim();
    }

    function isAllDigits(str) {
        const cleaned = String(str).replace(/[\s.\-+]/g, '');
        return cleaned.length >= 3 && /^\d+$/.test(cleaned);
    }

    function detectMode(rawQuery) {
        const cleaned = String(rawQuery).replace(/[\s.\-+]/g, '');
        if (isAllDigits(cleaned)) {
            const digits = cleaned.replace(/^\+?84/, '0');
            return { mode: 'phone', value: digits };
        }
        const noSign = stripDiacritics(rawQuery).toLowerCase().trim();
        if (noSign.length < 2) return null;
        return { mode: 'name', value: noSign };
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatVnd(n) {
        const num = Number(n) || 0;
        return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    function formatDateTime(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        return (
            d.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }) +
            ' ' +
            d.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
            })
        );
    }

    function openModal() {
        const modal = $('modal-customer-orders');
        if (modal) modal.classList.add('show');
    }
    function closeModal() {
        const modal = $('modal-customer-orders');
        if (modal) modal.classList.remove('show');
    }

    function setLoading(message) {
        const body = $('customer-orders-content');
        if (!body) return;
        body.innerHTML = `<div class="customer-orders-loading">${escapeHtml(message || 'Đang tải...')}</div>`;
    }

    function setError(message) {
        const body = $('customer-orders-content');
        if (!body) return;
        body.innerHTML = `<div class="customer-orders-error">⚠️ ${escapeHtml(message)}</div>`;
    }

    function setEmpty(message) {
        const body = $('customer-orders-content');
        if (!body) return;
        body.innerHTML = `<div class="customer-orders-empty">${escapeHtml(message)}</div>`;
    }

    function setSubtitle(text) {
        const sub = $('customer-orders-subtitle');
        if (sub) sub.textContent = text;
    }

    function updateStats(orders) {
        const stats = $('customer-orders-stats');
        if (!stats) return;
        stats.hidden = orders.length === 0;
        const counts = { total: orders.length, paid: 0, open: 0, cancel: 0 };
        orders.forEach((o) => {
            const g = STATE_GROUP[String(o.status || '').toLowerCase()] || 'cancel';
            if (g === 'paid') counts.paid++;
            else if (g === 'open') counts.open++;
            else counts.cancel++;
        });
        $('cust-stat-total').textContent = counts.total;
        $('cust-stat-paid').textContent = counts.paid;
        $('cust-stat-open').textContent = counts.open;
        $('cust-stat-cancel').textContent = counts.cancel;
    }

    function filterOrders(orders, filter) {
        if (filter === 'all') return orders;
        return orders.filter((o) => {
            const g = STATE_GROUP[String(o.status || '').toLowerCase()] || 'cancel';
            return g === filter;
        });
    }

    function buildOdataFilter(mode, value, days) {
        const now = new Date();
        const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const startDate = since.toISOString().replace('Z', '+00:00');
        const endDate = now.toISOString().replace('Z', '+00:00');
        const safe = String(value).replace(/'/g, "''");
        let fieldFilter;
        if (mode === 'phone') fieldFilter = `contains(Phone,'${safe}')`;
        else if (mode === 'name') fieldFilter = `contains(PartnerNameNoSign,'${safe}')`;
        else throw new Error('Unknown mode: ' + mode);
        return `(Type eq 'invoice' and IsMergeCancel ne true and DateInvoice ge ${startDate} and DateInvoice le ${endDate} and ${fieldFilter})`;
    }

    async function fetchOrders(mode, value, days) {
        const tm = window.tokenManager;
        const apiCfg = window.API_CONFIG;
        if (!tm || typeof tm.authenticatedFetch !== 'function') {
            throw new Error('Thiếu tokenManager. Hãy đăng nhập lại.');
        }
        if (!apiCfg || !apiCfg.TPOS_ODATA) {
            throw new Error('Thiếu cấu hình API. Hãy reload trang.');
        }
        const filter = buildOdataFilter(mode, value, days);
        const url =
            `${apiCfg.TPOS_ODATA}/FastSaleOrder/ODataService.GetView?$top=200&$orderby=DateInvoice desc&$filter=` +
            encodeURIComponent(filter) +
            `&$count=true`;

        const res = await tm.authenticatedFetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`TPOS ${res.status}: ${txt.slice(0, 120)}`);
        }
        const data = await res.json();
        const arr = Array.isArray(data.value) ? data.value : [];
        return arr.map((o) => ({
            id: o.Id,
            tposCode: o.Number || '',
            reference: o.Reference || '',
            trackingCode: o.TrackingRef || '',
            customer: o.PartnerDisplayName || o.Ship_Receiver_Name || 'N/A',
            phone: o.Phone || '',
            address: o.FullAddress || o.Address || '',
            cod: o.CashOnDelivery || 0,
            totalAmount: o.AmountTotal || 0,
            status: String(o.State || '').toLowerCase(),
            carrier: o.CarrierName || '',
            channel: o.CRMTeamName || 'TPOS',
            createdAt: o.DateInvoice ? new Date(o.DateInvoice).getTime() : 0,
        }));
    }

    function renderOrderRow(order) {
        const stateKey = STATE_GROUP[order.status] || 'cancel';
        const stateLabel = STATE_LABELS[order.status] || order.status || '—';
        const dateStr = formatDate(order.createdAt);
        return `
        <div class="customer-order-row" data-order-id="${order.id}" data-state="${stateKey}">
            <div class="customer-order-summary" role="button" tabindex="0" aria-expanded="false">
                <span class="order-chevron">▶</span>
                <div class="order-code">
                    ${escapeHtml(order.tposCode || '—')}
                    <span class="order-code-sub">#${order.id} · ${escapeHtml(dateStr)}</span>
                </div>
                <div class="order-cust">
                    ${escapeHtml(order.customer)}
                    <span class="order-cust-phone">${escapeHtml(order.phone || '—')}</span>
                </div>
                <div class="order-channel">
                    ${escapeHtml(order.channel)}
                    <span class="order-channel-carrier">${escapeHtml(order.carrier || '—')}</span>
                </div>
                <div class="order-amount">
                    ${formatVnd(order.totalAmount)}
                    <span class="order-amount-cod">COD ${formatVnd(order.cod)}</span>
                </div>
                <span class="order-status-pill status-${stateKey}">${escapeHtml(stateLabel)}</span>
                <span></span>
            </div>
            <div class="customer-order-details" hidden></div>
        </div>`;
    }

    function renderList() {
        const body = $('customer-orders-content');
        if (!body) return;
        const filtered = filterOrders(state.orders, state.filter);
        if (filtered.length === 0) {
            const msg =
                state.orders.length === 0
                    ? 'Không tìm thấy đơn nào trong khoảng thời gian đã chọn.'
                    : 'Không có đơn phù hợp bộ lọc hiện tại.';
            body.innerHTML = `<div class="customer-orders-empty">${msg}</div>`;
            return;
        }
        body.innerHTML = filtered.map(renderOrderRow).join('');
        attachRowHandlers(body);
    }

    function attachRowHandlers(container) {
        container.querySelectorAll('.customer-order-summary').forEach((sum) => {
            sum.addEventListener('click', onRowClick);
            sum.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(e);
                }
            });
        });
    }

    async function onRowClick(e) {
        const row = e.currentTarget.closest('.customer-order-row');
        if (!row) return;
        const orderId = Number(row.getAttribute('data-order-id'));
        const detailsEl = row.querySelector('.customer-order-details');
        const summaryEl = row.querySelector('.customer-order-summary');
        const isExpanded = row.classList.contains('expanded');

        if (isExpanded) {
            row.classList.remove('expanded');
            detailsEl.hidden = true;
            summaryEl.setAttribute('aria-expanded', 'false');
            return;
        }

        row.classList.add('expanded');
        summaryEl.setAttribute('aria-expanded', 'true');
        detailsEl.hidden = false;

        if (state.loadedDetails.has(orderId)) {
            detailsEl.innerHTML = renderDetailsHtml(state.loadedDetails.get(orderId));
            return;
        }
        if (state.loadingDetails.has(orderId)) {
            return;
        }
        state.loadingDetails.add(orderId);
        detailsEl.innerHTML = `<div class="customer-orders-loading">Đang tải chi tiết đơn ${escapeHtml(String(orderId))}…</div>`;

        try {
            const details = await window.ApiService.getOrderDetails(orderId);
            state.loadedDetails.set(orderId, details);
            // Only render if still expanded (user may have collapsed)
            if (row.classList.contains('expanded')) {
                detailsEl.innerHTML = renderDetailsHtml(details);
            }
        } catch (err) {
            console.error('[CustomerLookup] getOrderDetails failed', err);
            detailsEl.innerHTML = `<div class="customer-orders-error">Lỗi tải chi tiết: ${escapeHtml(
                err.message || String(err)
            )}</div>`;
        } finally {
            state.loadingDetails.delete(orderId);
        }
    }

    function renderDetailsHtml(details) {
        if (!details) {
            return `<div class="customer-orders-error">Không có dữ liệu chi tiết.</div>`;
        }
        const products = Array.isArray(details.products) ? details.products : [];
        const productSubtotal = products.reduce(
            (s, p) => s + (Number(p.total) || (Number(p.price) || 0) * (Number(p.quantity) || 0)),
            0
        );
        const finalTotal =
            productSubtotal -
            (Number(details.decreaseAmount) || 0) +
            (Number(details.deliveryPrice) || 0);
        const productsHtml = products.length
            ? products
                  .map(
                      (p) => `
            <tr>
                <td>
                    <div style="font-weight:500;">${escapeHtml(p.name || p.code || '—')}</div>
                    ${p.code ? `<div style="color:#94a3b8;font-size:11px;">${escapeHtml(p.code)}</div>` : ''}
                </td>
                <td class="col-qty">${Number(p.quantity) || 0}</td>
                <td class="col-price">${formatVnd(p.price)}</td>
                <td class="col-total">${formatVnd(p.total)}</td>
            </tr>`
                  )
                  .join('')
            : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:14px;">Không có sản phẩm.</td></tr>`;

        return `
        <div class="order-details-grid">
            <div><span class="det-label">Mã đơn:</span><span class="det-value">${escapeHtml(details.tposCode || '—')}</span></div>
            <div><span class="det-label">Ngày tạo:</span><span class="det-value">${escapeHtml(formatDateTime(details.createdAt))}</span></div>
            <div><span class="det-label">SĐT:</span><span class="det-value">${escapeHtml(details.phone || '—')}</span></div>
            <div><span class="det-label">Tracking:</span><span class="det-value">${escapeHtml(details.trackingCode || '—')}</span></div>
            <div><span class="det-label">Kênh:</span><span class="det-value">${escapeHtml(details.channel || '—')}</span></div>
            <div><span class="det-label">ĐVVC:</span><span class="det-value">${escapeHtml(details.carrier || '—')}</span></div>
            <div class="order-details-address"><span class="det-label">Địa chỉ:</span><span class="det-value">${escapeHtml(details.address || '—')}</span></div>
        </div>
        <table class="order-products-mini">
            <thead>
                <tr>
                    <th>Sản phẩm</th>
                    <th class="col-qty">SL</th>
                    <th class="col-price">Giá</th>
                    <th class="col-total">Thành tiền</th>
                </tr>
            </thead>
            <tbody>
                ${productsHtml}
                <tr class="order-totals-row">
                    <td colspan="3" class="label-cell">Tổng sản phẩm</td>
                    <td class="col-total">${formatVnd(productSubtotal)}</td>
                </tr>
                <tr class="order-totals-row">
                    <td colspan="3" class="label-cell">Giảm giá</td>
                    <td class="col-total">- ${formatVnd(details.decreaseAmount)}</td>
                </tr>
                <tr class="order-totals-row">
                    <td colspan="3" class="label-cell">Phí ship</td>
                    <td class="col-total">${formatVnd(details.deliveryPrice)}</td>
                </tr>
                <tr class="order-totals-row">
                    <td colspan="3" class="label-cell">Tổng cuối</td>
                    <td class="col-total" style="color:#dc2626;">${formatVnd(finalTotal)}</td>
                </tr>
                <tr class="order-totals-row">
                    <td colspan="3" class="label-cell">COD</td>
                    <td class="col-total" style="color:#2563eb;">${formatVnd(details.cod)}</td>
                </tr>
            </tbody>
        </table>`;
    }

    async function runSearch(query) {
        const trimmed = String(query || '').trim();
        if (!trimmed) {
            alert('Vui lòng nhập SĐT hoặc tên khách.');
            return;
        }
        const detected = detectMode(trimmed);
        if (!detected) {
            alert('Vui lòng nhập ít nhất 2 ký tự cho tên, hoặc 3 chữ số cho SĐT.');
            return;
        }

        state.query = trimmed;
        state.normalizedQuery = detected.value;
        state.searchMode = detected.mode;
        state.orders = [];
        state.loadedDetails.clear();
        state.loadingDetails.clear();
        state.filter = 'all';

        // Reset filter UI
        document.querySelectorAll('#cust-orders-filter .quick-filter-btn').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-filter') === 'all');
        });

        openModal();
        setSubtitle(
            detected.mode === 'phone'
                ? `Tìm theo SĐT chứa "${trimmed}"`
                : `Tìm theo tên chứa "${trimmed}"`
        );
        $('customer-orders-stats').hidden = true;
        setLoading('Đang tìm trên TPOS…');

        try {
            const orders = await fetchOrders(detected.mode, detected.value, state.days);
            state.orders = orders;
            updateStats(orders);
            setSubtitle(
                `${orders.length} đơn — ${
                    detected.mode === 'phone' ? 'SĐT' : 'Tên'
                } chứa "${trimmed}" · ${state.days} ngày gần nhất`
            );
            renderList();
        } catch (err) {
            console.error('[CustomerLookup] search failed', err);
            setError('Không tìm được đơn: ' + (err.message || String(err)));
        }
    }

    function bindUi() {
        const input = $('customer-lookup-input');
        const btn = $('btn-customer-lookup');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch(input.value);
                }
            });
        }
        if (btn) {
            btn.addEventListener('click', () => runSearch(input ? input.value : ''));
        }

        // Modal close handlers (X + click outside)
        const modal = $('modal-customer-orders');
        if (modal) {
            modal.querySelectorAll('.close-modal').forEach((el) => {
                el.addEventListener('click', closeModal);
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
                closeModal();
            }
        });

        // Quick filter tabs
        document.querySelectorAll('#cust-orders-filter .quick-filter-btn').forEach((b) => {
            b.addEventListener('click', () => {
                const f = b.getAttribute('data-filter');
                state.filter = f;
                document.querySelectorAll('#cust-orders-filter .quick-filter-btn').forEach((x) => {
                    x.classList.toggle('active', x === b);
                });
                renderList();
            });
        });

        // Days range select
        const rangeSel = $('cust-orders-days');
        if (rangeSel) {
            rangeSel.addEventListener('change', () => {
                state.days = Number(rangeSel.value) || 180;
                if (state.query) runSearch(state.query);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }

    // Expose for debug
    window.CustomerOrdersLookup = { runSearch, state };
})();
