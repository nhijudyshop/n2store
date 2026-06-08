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

    // Mọi timestamp hiển thị đều theo UTC+7 Hà Nội.
    const VN_TZ = 'Asia/Ho_Chi_Minh';

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('vi-VN', {
            timeZone: VN_TZ,
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
                timeZone: VN_TZ,
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }) +
            ' ' +
            d.toLocaleTimeString('vi-VN', {
                timeZone: VN_TZ,
                hour: '2-digit',
                minute: '2-digit',
            })
        );
    }

    // Lazy-load html2canvas (page không nạp cdn-libs.js sẵn).
    function ensureHtml2Canvas() {
        if (typeof window.html2canvas !== 'undefined') return Promise.resolve();
        if (typeof window.loadHtml2Canvas === 'function') return window.loadHtml2Canvas();
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-lib="html2canvas"]');
            if (existing) {
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () =>
                    reject(new Error('html2canvas load failed'))
                );
                return;
            }
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.dataset.lib = 'html2canvas';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('html2canvas load failed'));
            document.head.appendChild(s);
        });
    }

    function toast(message, type) {
        if (window.notificationManager && typeof window.notificationManager.show === 'function') {
            window.notificationManager.show(message, type || 'info');
            return;
        }
        // Fallback: toast tối giản tự huỷ.
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
            z-index:99999;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;
            color:#fff;background:${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#334155'};
            box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:80vw;`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Lấy HTML bill chính thức của TPOS (giống tab BÁN HÀNG: /api/fastsaleorder/print1).
    // Đơn Nháp/Huỷ bị TPOS từ chối in → ném lỗi với message của TPOS.
    async function fetchTposBillHtml(orderId) {
        const tm = window.tokenManager;
        if (!tm || typeof tm.authenticatedFetch !== 'function') {
            throw new Error('Thiếu tokenManager. Hãy đăng nhập lại.');
        }
        const url = `${WORKER_URL}/api/fastsaleorder/print1?ids=${encodeURIComponent(orderId)}`;
        const resp = await tm.authenticatedFetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'feature-version': '2',
                'x-tpos-lang': 'vi',
            },
        });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error(`TPOS ${resp.status}: ${t.slice(0, 120)}`);
        }
        const data = await resp.json();
        if (!data || !data.html) {
            const msg =
                (data &&
                    Array.isArray(data.listErrors) &&
                    data.listErrors[0] &&
                    data.listErrors[0].Message) ||
                'TPOS không trả về HTML bill (đơn Nháp/Huỷ không in được).';
            throw new Error(msg);
        }
        return data.html;
    }

    function waitForDocImages(doc) {
        const imgs = Array.from(doc.images || []);
        if (!imgs.length) return Promise.resolve();
        return Promise.all(
            imgs.map(
                (img) =>
                    new Promise((resolve) => {
                        if (img.complete) return resolve();
                        img.addEventListener('load', resolve, { once: true });
                        img.addEventListener('error', resolve, { once: true });
                        setTimeout(resolve, 4000);
                    })
            )
        );
    }

    // Render HTML bill TPOS trong iframe cô lập (tránh leak style) → PNG blob.
    async function renderBillHtmlToBlob(html) {
        await ensureHtml2Canvas();
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText =
            'position:fixed;left:-99999px;top:0;width:780px;height:40px;border:0;background:#fff;';
        document.body.appendChild(iframe);
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
            await new Promise((resolve) => {
                if (doc.readyState === 'complete') return resolve();
                iframe.addEventListener('load', resolve, { once: true });
                setTimeout(resolve, 2000);
            });
            await waitForDocImages(doc);
            await new Promise((r) => setTimeout(r, 80));
            const target = doc.body;
            const w = Math.max(target.scrollWidth, doc.documentElement.scrollWidth, 360);
            const h = Math.max(target.scrollHeight, doc.documentElement.scrollHeight, 120);
            iframe.style.width = w + 'px';
            iframe.style.height = h + 'px';
            const canvas = await window.html2canvas(target, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: false,
                width: w,
                height: h,
                windowWidth: w,
                windowHeight: h,
            });
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Không tạo được ảnh.');
            return blob;
        } finally {
            iframe.remove();
        }
    }

    async function blobToClipboard(blob) {
        if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
            throw new Error('Trình duyệt không hỗ trợ copy ảnh vào clipboard.');
        }
        await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    async function copyBillImage(orderId, btn) {
        const details = state.loadedDetails.get(orderId);
        const order = findOrderInState(orderId);
        const codeForName = (details && details.tposCode) || (order && order.tposCode) || orderId;
        const original = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Đang tạo ảnh…';
        }
        try {
            const html = await fetchTposBillHtml(orderId);
            const blob = await renderBillHtmlToBlob(html);
            try {
                await blobToClipboard(blob);
                toast('✅ Đã copy hình bill — dán (Ctrl/Cmd+V) để gửi khách.', 'success');
            } catch (clipErr) {
                console.warn('[CustomerLookup] clipboard failed, fallback download', clipErr);
                downloadBlob(blob, `bill-${codeForName}.png`.replace(/[\\/]/g, '-'));
                toast('Clipboard bị chặn — đã tải ảnh bill về máy.', 'info');
            }
        } catch (err) {
            console.error('[CustomerLookup] copyBillImage failed', err);
            toast('Lỗi tạo hình bill: ' + (err.message || String(err)), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }
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
            note: (o.Comment || '').trim(),
            deliveryNote: (o.DeliveryNote || '').trim(),
            createdAt: o.DateInvoice ? new Date(o.DateInvoice).getTime() : 0,
        }));
    }

    function renderOrderRow(order) {
        const stateKey = STATE_GROUP[order.status] || 'cancel';
        const stateLabel = STATE_LABELS[order.status] || order.status || '—';
        const dateStr = formatDate(order.createdAt);
        const noteRibbon = order.note
            ? `<div class="customer-order-note" title="${escapeHtml(order.note)}">
                <span class="note-icon">📝</span>
                <span class="note-text">${escapeHtml(order.note)}</span>
            </div>`
            : '';
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
            </div>
            ${noteRibbon}
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
        // Delegate copy-bill clicks (button render lại mỗi lần expand).
        if (!container.dataset.billDelegated) {
            container.dataset.billDelegated = '1';
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-copy-bill');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const oid = Number(btn.getAttribute('data-order-id'));
                if (oid) copyBillImage(oid, btn);
            });
        }
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

    function findOrderInState(orderId) {
        return state.orders.find((o) => o.id === orderId) || null;
    }

    async function onRowClick(e) {
        const row = e.currentTarget.closest('.customer-order-row');
        if (!row) return;
        const orderId = Number(row.getAttribute('data-order-id'));
        const detailsEl = row.querySelector('.customer-order-details');
        const summaryEl = row.querySelector('.customer-order-summary');
        const isExpanded = row.classList.contains('expanded');
        const orderFromList = findOrderInState(orderId);

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
            detailsEl.innerHTML = renderDetailsHtml(
                state.loadedDetails.get(orderId),
                orderFromList
            );
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
                detailsEl.innerHTML = renderDetailsHtml(details, orderFromList);
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

    function renderDetailsHtml(details, orderFromList) {
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

        const note = orderFromList && orderFromList.note ? orderFromList.note : '';
        const deliveryNote =
            orderFromList && orderFromList.deliveryNote ? orderFromList.deliveryNote : '';
        const noteSection = note
            ? `<div class="order-note-block order-note-main">
                <div class="order-note-label">📝 Ghi chú</div>
                <div class="order-note-content">${escapeHtml(note)}</div>
            </div>`
            : '';
        const deliveryNoteSection = deliveryNote
            ? `<details class="order-note-block order-note-delivery">
                <summary class="order-note-label">🚚 Ghi chú giao hàng</summary>
                <div class="order-note-content">${escapeHtml(deliveryNote)}</div>
            </details>`
            : '';

        const billOrderId = (orderFromList && orderFromList.id) || details.id;
        const billActions = `
        <div class="order-bill-actions">
            <button type="button" class="btn-copy-bill" data-order-id="${escapeHtml(String(billOrderId))}">
                📋 Copy hình bill
            </button>
        </div>`;

        return `
        ${billActions}
        ${noteSection}
        ${deliveryNoteSection}
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
