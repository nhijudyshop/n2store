// #Note: TPOS FastSaleOrder + FastPurchaseOrder list (4 types: invoice/refund/purchase/purchaseRefund). Live fetch via window.tokenManager + Cloudflare worker proxy. Paging via OData $top/$skip/$count.

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    const TYPE_CFG = {
        invoice: {
            entity: 'FastSaleOrder',
            tposType: 'invoice',
            label: 'Hóa đơn',
            colCount: 11,
            tposPath: 'fastsaleorder/invoicelist',
            rowRenderer: renderInvoiceRow,
        },
        refund: {
            entity: 'FastSaleOrder',
            tposType: 'refund',
            label: 'Trả hàng',
            colCount: 10,
            tposPath: 'fastsaleorder/refundlist',
            rowRenderer: renderRefundRow,
        },
        purchase: {
            entity: 'FastPurchaseOrder',
            tposType: 'invoice',
            label: 'Mua hàng NCC',
            colCount: 12,
            tposPath: 'fastpurchaseorder/invoicelist',
            rowRenderer: renderPurchaseRow,
            mockable: true,
        },
        purchaseRefund: {
            entity: 'FastPurchaseOrder',
            tposType: 'refund',
            label: 'Trả hàng NCC',
            colCount: 10,
            tposPath: 'fastpurchaseorder/refundlist',
            rowRenderer: renderPurchaseRefundRow,
            mockable: true,
        },
    };

    function ymd(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    // datetime-local input expects YYYY-MM-DDTHH:mm in LOCAL time, not UTC.
    function localDateTimeForInput(d) {
        if (!d || isNaN(d)) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function getCurrentMonthRange() {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: ymd(first), to: ymd(last) };
    }

    function actionButtons(id) {
        return `<td class="tpos-fso-actions-cell">
            <button type="button" class="tpos-fso-row-btn tpos-fso-row-edit" data-action="edit" data-id="${id || ''}" title="Sửa">
                <i data-lucide="pencil"></i>
            </button>
            <button type="button" class="tpos-fso-row-btn tpos-fso-row-delete" data-action="delete" data-id="${id || ''}" title="Xóa">
                <i data-lucide="trash-2"></i>
            </button>
        </td>`;
    }

    function expandCell() {
        return `<td class="tpos-fso-exp-cell"><button type="button" class="tpos-fso-exp-btn" data-action="expand" aria-expanded="false" title="Xem chi tiết"><i data-lucide="chevron-right"></i></button></td>`;
    }

    const STATE_META = {
        draft: { label: 'Nháp', cls: 's-draft', icon: 'file' },
        open: { label: 'Đang xử lý', cls: 's-open', icon: 'loader' },
        paid: { label: 'Đã trả', cls: 's-paid', icon: 'wallet' },
        done: { label: 'Hoàn thành', cls: 's-done', icon: 'check-circle' },
        cancel: { label: 'Đã hủy', cls: 's-cancel', icon: 'x-circle' },
    };

    // Purchase orders use different state labels (TPOS: "Đã xác nhận" instead of "Đang xử lý")
    const PURCHASE_STATE_META = {
        draft: { label: 'Nháp', cls: 's-draft', icon: 'file' },
        open: { label: 'Đã xác nhận', cls: 's-open', icon: 'check-circle' },
        paid: { label: 'Đã trả', cls: 's-paid', icon: 'wallet' },
        done: { label: 'Hoàn thành', cls: 's-done', icon: 'check-circle' },
        cancel: { label: 'Đã hủy', cls: 's-cancel', icon: 'x-circle' },
    };

    function fmtMoney(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtDate(s) {
        if (!s) return '—';
        const d = new Date(s);
        if (isNaN(d)) return '—';
        const pad = (x) => String(x).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function debounce(fn, ms) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function stateBadge(state, meta = STATE_META, textOnly = false) {
        const m = meta[state] || { label: state || '—', cls: 's-draft', icon: 'help-circle' };
        const iconHtml = textOnly ? '' : `<i data-lucide="${m.icon}"></i>`;
        const extraCls = textOnly ? ' tpos-fso-badge-text' : '';
        return `<span class="tpos-fso-badge ${m.cls}${extraCls}">${iconHtml}${m.label}</span>`;
    }

    function renderInvoiceRow(row, idx, ns) {
        const customer = row.PartnerDisplayName || row.PartnerName || row.Ship_Receiver_Name || '—';
        const phone = row.Phone || row.Ship_Receiver_Phone || '';
        const address = row.FullAddress || row.Address || '';
        const total = fmtMoney(row.AmountTotal);
        const cod = row.CashOnDelivery > 0 ? fmtMoney(row.CashOnDelivery) : '—';
        const channel = row.CRMTeamName || row.Source || '—';
        const date = fmtDate(row.DateInvoice);
        return `<tr data-tpos-id="${row.Id || ''}">
            ${expandCell()}
            <td style="text-align:center;color:#94a3b8;font-variant-numeric:tabular-nums;">${idx}</td>
            <td><span class="tpos-fso-num mono" data-action="open" data-id="${row.Id || ''}" data-num="${escapeHtml(row.Number || '')}">${escapeHtml(row.Number || '—')}</span></td>
            <td><div class="tpos-fso-customer">${escapeHtml(customer)}</div></td>
            <td><span class="tpos-fso-phone">${escapeHtml(phone || '—')}</span></td>
            <td><div class="tpos-fso-address" title="${escapeHtml(address)}">${escapeHtml(address || '—')}</div></td>
            <td class="num">${total}</td>
            <td class="num" style="color:#475569;">${cod}</td>
            <td>${stateBadge(row.State)}</td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(channel)}</span></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
        </tr>`;
    }

    function renderRefundRow(row, idx, ns) {
        const customer = row.PartnerDisplayName || row.PartnerName || row.Ship_Receiver_Name || '—';
        const phone = row.Phone || row.Ship_Receiver_Phone || '';
        const total = fmtMoney(Math.abs(row.AmountTotal || 0));
        const channel = row.CRMTeamName || row.Source || '—';
        const date = fmtDate(row.DateInvoice);
        const refundOf = row.RefundOrderName || row.Origin || '';
        return `<tr data-tpos-id="${row.Id || ''}">
            ${expandCell()}
            <td style="text-align:center;color:#94a3b8;font-variant-numeric:tabular-nums;">${idx}</td>
            <td><span class="tpos-fso-num mono" data-action="open" data-id="${row.Id || ''}" data-num="${escapeHtml(row.Number || '')}">${escapeHtml(row.Number || '—')}</span></td>
            <td><span class="mono" style="color:#475569;">${escapeHtml(refundOf || '—')}</span></td>
            <td><div class="tpos-fso-customer">${escapeHtml(customer)}</div></td>
            <td><span class="tpos-fso-phone">${escapeHtml(phone || '—')}</span></td>
            <td class="num" style="color:#dc2626;">${total}</td>
            <td>${stateBadge(row.State)}</td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(channel)}</span></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
        </tr>`;
    }

    function renderPurchaseRow(row, idx, ns) {
        const supplier = row.PartnerDisplayName || row.PartnerName || '—';
        const total = fmtMoney(row.AmountTotal);
        const residual = row.Residual > 0 ? fmtMoney(row.Residual) : '0đ';
        const date = fmtDate(row.DateInvoice);
        const vatNum = row.VatInvoiceNumber || row.Origin || '';
        const employee = row.UserName || '—';
        const company = row.CompanyName || '—';
        const isMock = String(row.Id || '').startsWith('MOCK-');
        return `<tr data-tpos-id="${row.Id || ''}" ${isMock ? 'data-mock="1"' : ''} ${row.__mockEdited ? 'data-mock-edited="1"' : ''}>
            ${expandCell()}
            <td style="text-align:center;color:#94a3b8;font-variant-numeric:tabular-nums;">${idx}</td>
            <td><div class="tpos-fso-customer">${escapeHtml(supplier)}${isMock ? ' <span class="tpos-mock-tag">MOCK</span>' : ''}${row.__mockEdited ? ' <span class="tpos-mock-tag tpos-mock-tag-edited">SỬA</span>' : ''}</div></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
            <td><span class="tpos-fso-num mono" data-action="open" data-id="${row.Id || ''}" data-num="${escapeHtml(row.Number || '')}">${escapeHtml(row.Number || '—')}</span></td>
            <td><span class="mono" style="color:#475569;">${escapeHtml(vatNum || '—')}</span></td>
            <td class="num">${total}</td>
            <td class="num" style="color:${row.Residual > 0 ? '#dc2626' : '#475569'};">${residual}</td>
            <td>${stateBadge(row.State, PURCHASE_STATE_META, true)}</td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(employee)}</span></td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(company)}</span></td>
            ${actionButtons(row.Id)}
        </tr>`;
    }

    function renderPurchaseRefundRow(row, idx, ns) {
        const supplier = row.PartnerDisplayName || row.PartnerName || '—';
        const total = fmtMoney(Math.abs(row.AmountTotal || 0));
        const date = fmtDate(row.DateInvoice);
        const employee = row.UserName || '—';
        const company = row.CompanyName || '—';
        const isMock = String(row.Id || '').startsWith('MOCK-');
        return `<tr data-tpos-id="${row.Id || ''}" ${isMock ? 'data-mock="1"' : ''} ${row.__mockEdited ? 'data-mock-edited="1"' : ''}>
            ${expandCell()}
            <td style="text-align:center;color:#94a3b8;font-variant-numeric:tabular-nums;">${idx}</td>
            <td><span class="tpos-fso-num mono" data-action="open" data-id="${row.Id || ''}" data-num="${escapeHtml(row.Number || '')}">${escapeHtml(row.Number || '—')}</span></td>
            <td><div class="tpos-fso-customer">${escapeHtml(supplier)}${isMock ? ' <span class="tpos-mock-tag">MOCK</span>' : ''}${row.__mockEdited ? ' <span class="tpos-mock-tag tpos-mock-tag-edited">SỬA</span>' : ''}</div></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
            <td class="num" style="color:#dc2626;">${total}</td>
            <td>${stateBadge(row.State, PURCHASE_STATE_META, true)}</td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(employee)}</span></td>
            <td><span style="color:#475569;font-size:12px;">${escapeHtml(company)}</span></td>
            ${actionButtons(row.Id)}
        </tr>`;
    }

    function renderDetailHTML(detail) {
        const lines = Array.isArray(detail.OrderLines) ? detail.OrderLines : [];
        const subtotal = lines.reduce((s, l) => s + (Number(l.PriceTotal) || 0), 0);
        const linesHtml = lines.length
            ? lines
                  .map((l, i) => {
                      const pname = l.ProductNameGet || l.Name || l.ProductName || '';
                      const sku = l.ProductBarcode || '';
                      const uom = l.ProductUOMName || '';
                      const qty = Number(l.ProductUOMQty) || 0;
                      const price = fmtMoney(l.PriceUnit);
                      const weight = Number(l.WeightTotal || l.Weight || 0);
                      const lineTotal = fmtMoney(l.PriceTotal);
                      return `<tr>
                          <td style="text-align:center;color:#94a3b8;">${i + 1}</td>
                          <td>
                              <div class="tpos-fso-detail-pname">${escapeHtml(pname)}</div>
                              ${sku ? `<div class="tpos-fso-detail-sku">SKU: ${escapeHtml(sku)}</div>` : ''}
                          </td>
                          <td>${escapeHtml(uom)}</td>
                          <td class="num">${qty}</td>
                          <td class="num">${price}</td>
                          <td class="num">${weight ? weight.toFixed(3) : '—'}</td>
                          <td class="num">${lineTotal}</td>
                      </tr>`;
                  })
                  .join('')
            : `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;">Không có dòng sản phẩm</td></tr>`;

        const summary = `<div class="tpos-fso-detail-summary">
            <div><span>Tổng tiền hàng:</span><strong>${fmtMoney(subtotal)}</strong></div>
            ${detail.DecreaseAmount > 0 ? `<div><span>Giảm giá:</span><strong>-${fmtMoney(detail.DecreaseAmount)}</strong></div>` : ''}
            ${detail.DeliveryPrice > 0 ? `<div><span>Phí giao hàng:</span><strong>${fmtMoney(detail.DeliveryPrice)}</strong></div>` : ''}
            ${detail.AmountTax > 0 ? `<div><span>Thuế:</span><strong>${fmtMoney(detail.AmountTax)}</strong></div>` : ''}
            <div class="total"><span>Tổng cộng:</span><strong>${fmtMoney(detail.AmountTotal)}</strong></div>
            ${detail.CashOnDelivery > 0 ? `<div><span>Tiền thu (COD):</span><strong>${fmtMoney(detail.CashOnDelivery)}</strong></div>` : ''}
            ${detail.Note ? `<div class="note"><span>Ghi chú:</span><em>${escapeHtml(detail.Note)}</em></div>` : ''}
        </div>`;

        return `<div class="tpos-fso-detail-wrap">
            <table class="tpos-fso-detail-table">
                <thead><tr>
                    <th style="width:50px;text-align:center;">STT</th>
                    <th>Sản phẩm</th>
                    <th style="width:80px;">Đơn vị</th>
                    <th style="width:80px;text-align:right;">Số lượng</th>
                    <th style="width:120px;text-align:right;">Đơn giá</th>
                    <th style="width:90px;text-align:right;">KL (Kg)</th>
                    <th style="width:130px;text-align:right;">Thành tiền</th>
                </tr></thead>
                <tbody>${linesHtml}</tbody>
            </table>
            ${summary}
        </div>`;
    }

    class TposFastSaleTab {
        constructor(root) {
            this.root = root;
            this.type = root.dataset.fsoType || 'invoice';
            this.ns = root.dataset.fsoNs || this.type;
            this.cfg = TYPE_CFG[this.type] || TYPE_CFG.invoice;

            // Locate elements via data-bind within root
            this.$ = {};
            root.querySelectorAll('[data-bind]').forEach((el) => {
                this.$[el.dataset.bind] = el;
            });

            this.state = {
                page: 1,
                limit: 100,
                search: '',
                stateFilter: '',
                dateFrom: '',
                dateTo: '',
                total: 0,
                rows: [],
                inflight: null,
                lastLoadAt: 0,
            };

            // Purchase entities default to current month range (matches TPOS native "36 Ngày" badge).
            if (this.cfg.entity === 'FastPurchaseOrder') {
                const r = getCurrentMonthRange();
                this.state.dateFrom = r.from;
                this.state.dateTo = r.to;
                if (this.$.dateFrom) this.$.dateFrom.value = r.from;
                if (this.$.dateTo) this.$.dateTo.value = r.to;
            }

            // For purchase refund tab: register host-page hook on shared ReturnOrderModal
            // so that a successful real refund creation auto-reloads the list.
            if (
                this.cfg.tposType === 'refund' &&
                this.cfg.entity === 'FastPurchaseOrder' &&
                window.ReturnOrderModal?.onSuccess
            ) {
                window.ReturnOrderModal.onSuccess(() => this.load());
            }

            // Mock CRUD overlay — only writes locally, never hits TPOS.
            this.mock = this.cfg.mockable
                ? { overlay: new Map(), deleted: new Set(), added: [], nextId: 1 }
                : null;

            this.loaded = false;
            this.bindEvents();
        }

        bindEvents() {
            const $ = this.$;
            const reload = () => this.load();

            const debouncedReload = debounce(() => {
                this.state.page = 1;
                this.load();
            }, 400);

            if ($.search) {
                $.search.addEventListener('input', (e) => {
                    this.state.search = e.target.value.trim();
                    const wrap = $.search.closest('.tpos-fso-search');
                    if (wrap) wrap.classList.toggle('has-text', !!this.state.search);
                    debouncedReload();
                });
            }
            if ($.searchClear) {
                $.searchClear.addEventListener('click', () => {
                    if ($.search) $.search.value = '';
                    this.state.search = '';
                    $.search.closest('.tpos-fso-search')?.classList.remove('has-text');
                    this.state.page = 1;
                    this.load();
                });
            }
            if ($.state) {
                $.state.addEventListener('change', (e) => {
                    this.state.stateFilter = e.target.value;
                    this.state.page = 1;
                    this.load();
                });
            }
            if ($.dateFrom) {
                $.dateFrom.addEventListener('change', (e) => {
                    this.state.dateFrom = e.target.value;
                    this.state.page = 1;
                    this.load();
                });
            }
            if ($.dateTo) {
                $.dateTo.addEventListener('change', (e) => {
                    this.state.dateTo = e.target.value;
                    this.state.page = 1;
                    this.load();
                });
            }
            if ($.limit) {
                $.limit.addEventListener('change', (e) => {
                    this.state.limit = Number(e.target.value) || 100;
                    this.state.page = 1;
                    this.load();
                });
            }
            if ($.reload) $.reload.addEventListener('click', reload);
            if ($.clear) {
                $.clear.addEventListener('click', () => {
                    this.state.search = '';
                    this.state.stateFilter = '';
                    this.state.dateFrom = '';
                    this.state.dateTo = '';
                    this.state.page = 1;
                    if ($.search) {
                        $.search.value = '';
                        $.search.closest('.tpos-fso-search')?.classList.remove('has-text');
                    }
                    if ($.state) $.state.value = '';
                    if ($.dateFrom) $.dateFrom.value = '';
                    if ($.dateTo) $.dateTo.value = '';
                    this.load();
                });
            }
            if ($.prev) {
                $.prev.addEventListener('click', () => {
                    if (this.state.page > 1) {
                        this.state.page -= 1;
                        this.load();
                    }
                });
            }
            if ($.next) {
                $.next.addEventListener('click', () => {
                    const total = this.totalPages();
                    if (this.state.page < total) {
                        this.state.page += 1;
                        this.load();
                    }
                });
            }
            if ($.page) {
                $.page.addEventListener('change', (e) => {
                    const v = Math.max(1, Math.min(this.totalPages(), Number(e.target.value) || 1));
                    this.state.page = v;
                    e.target.value = v;
                    this.load();
                });
            }

            // Row click: open / expand / edit / delete
            const tbody = this.$.tbody;
            if (tbody) {
                tbody.addEventListener('click', (e) => {
                    const editBtn = e.target.closest('[data-action="edit"]');
                    if (editBtn) {
                        e.stopPropagation();
                        this.openEditModal(editBtn.dataset.id);
                        return;
                    }
                    const deleteBtn = e.target.closest('[data-action="delete"]');
                    if (deleteBtn) {
                        e.stopPropagation();
                        this.openDeleteConfirm(deleteBtn.dataset.id);
                        return;
                    }
                    const expandBtn = e.target.closest('[data-action="expand"]');
                    if (expandBtn) {
                        e.stopPropagation();
                        this.toggleExpand(expandBtn);
                        return;
                    }
                    const openLink = e.target.closest('[data-action="open"]');
                    if (openLink) {
                        const id = openLink.dataset.id;
                        if (!id) return;
                        const path = this.cfg.tposPath;
                        window.open(
                            `https://tomato.tpos.vn/#/app/${path}/${id}`,
                            '_blank',
                            'noopener'
                        );
                        return;
                    }
                    // Click anywhere on row (not on links) → toggle expand
                    const tr = e.target.closest('tr[data-tpos-id]');
                    if (tr && !tr.classList.contains('tpos-fso-detail-row')) {
                        const btn = tr.querySelector('[data-action="expand"]');
                        if (btn) this.toggleExpand(btn);
                    }
                });
            }

            // Toolbar buttons (purchase only)
            if (this.cfg.mockable) {
                const addBtn = this.root.querySelector('[data-bind="addNew"]');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        // For purchase REFUND, prefer the shared full TPOS-clone return form
                        // (real product picker + supplier search + real POST to FastPurchaseOrder).
                        // Falls back to mock edit modal if shared module not loaded.
                        if (
                            this.cfg.tposType === 'refund' &&
                            this.cfg.entity === 'FastPurchaseOrder' &&
                            window.ReturnOrderModal?.open
                        ) {
                            window.ReturnOrderModal.open();
                            return;
                        }
                        this.openEditModal(null);
                    });
                }
                const bulkBtn = this.root.querySelector('[data-bind="bulkAction"]');
                if (bulkBtn) {
                    bulkBtn.addEventListener('click', () => {
                        toast(
                            'Mock mode: thao tác hàng loạt chưa giả lập. Dùng nút Sửa/Xóa từng dòng.',
                            'info'
                        );
                    });
                }
                const colBtn = this.root.querySelector('[data-bind="toggleCols"]');
                if (colBtn) {
                    colBtn.addEventListener('click', () => {
                        toast(
                            'Mock mode: ẩn/hiện cột chưa hỗ trợ. Mở rộng từng dòng để xem chi tiết.',
                            'info'
                        );
                    });
                }
            }
        }

        async toggleExpand(btn) {
            const row = btn.closest('tr[data-tpos-id]');
            if (!row) return;
            const id = row.dataset.tposId;
            if (!id) return;

            const isOpen = btn.classList.contains('open');
            const nextRow = row.nextElementSibling;

            if (isOpen) {
                if (nextRow && nextRow.classList.contains('tpos-fso-detail-row')) {
                    nextRow.remove();
                }
                btn.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
                row.classList.remove('expanded');
                return;
            }

            // Open: insert loading detail row, then fetch
            btn.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            row.classList.add('expanded');

            const detailTr = document.createElement('tr');
            detailTr.className = 'tpos-fso-detail-row';
            detailTr.innerHTML = `<td colspan="${this.cfg.colCount}"><div class="tpos-fso-detail-loading"><div class="sp"></div>Đang tải chi tiết đơn ${escapeHtml(id)}…</div></td>`;
            row.after(detailTr);

            if (!this.detailCache) this.detailCache = new Map();
            let detail = this.detailCache.get(id);
            if (!detail) {
                try {
                    const url = `${WORKER_URL}/api/odata/${this.cfg.entity}(${encodeURIComponent(id)})?$expand=OrderLines($expand=Product,ProductUOM)`;
                    const resp = await window.tokenManager.authenticatedFetch(url, {
                        method: 'GET',
                        headers: { Accept: 'application/json' },
                    });
                    if (!resp.ok) {
                        const t = await resp.text().catch(() => '');
                        throw new Error(`HTTP ${resp.status} ${t.slice(0, 120)}`);
                    }
                    detail = await resp.json();
                    this.detailCache.set(id, detail);
                } catch (e) {
                    console.error(`[tpos-fastsale:${this.type}] detail fetch failed:`, e);
                    detailTr.innerHTML = `<td colspan="${this.cfg.colCount}"><div class="tpos-fso-detail-error"><i data-lucide="alert-triangle"></i> Lỗi tải chi tiết: ${escapeHtml(e.message)}</div></td>`;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }
            }
            detailTr.innerHTML = `<td colspan="${this.cfg.colCount}">${renderDetailHTML(detail)}</td>`;
            if (window.lucide) window.lucide.createIcons();
        }

        totalPages() {
            return Math.max(1, Math.ceil(this.state.total / this.state.limit));
        }

        buildFilter() {
            const parts = [`Type eq '${this.cfg.tposType}'`];
            // FastSaleOrder invoices exclude merge-cancel rows by default (matches TPOS native list).
            // FastPurchaseOrder ViewModel doesn't expose IsMergeCancel — skip the filter for purchase entities.
            if (this.cfg.entity === 'FastSaleOrder' && this.cfg.tposType === 'invoice') {
                parts.push('IsMergeCancel ne true');
            }
            if (this.state.stateFilter) parts.push(`State eq '${this.state.stateFilter}'`);
            if (this.state.dateFrom)
                parts.push(`DateInvoice ge ${this.state.dateFrom}T00:00:00.000Z`);
            if (this.state.dateTo) parts.push(`DateInvoice le ${this.state.dateTo}T23:59:59.999Z`);
            const q = this.state.search;
            if (q) {
                const safe = q.replace(/'/g, "''");
                // FastPurchaseOrder ViewModel has no Phone field — match supplier/number only
                if (this.cfg.entity === 'FastPurchaseOrder') {
                    parts.push(
                        `(contains(PartnerNameNoSign,'${safe}') or contains(Number,'${safe}'))`
                    );
                } else if (/^\d{4,}$/.test(q)) {
                    // Phone numeric → match Phone OR Number
                    parts.push(`(contains(Phone,'${safe}') or contains(Number,'${safe}'))`);
                } else {
                    parts.push(
                        `(contains(PartnerNameNoSign,'${safe}') or contains(Number,'${safe}') or contains(Phone,'${safe}'))`
                    );
                }
            }
            return parts.join(' and ');
        }

        buildUrl() {
            const skip = (this.state.page - 1) * this.state.limit;
            const params = new URLSearchParams();
            params.set('$top', String(this.state.limit));
            params.set('$skip', String(skip));
            params.set('$orderby', 'DateInvoice desc');
            params.set('$count', 'true');
            params.set('$filter', this.buildFilter());
            return `${WORKER_URL}/api/odata/${this.cfg.entity}/ODataService.GetView?${params.toString()}`;
        }

        showLoading() {
            if (!this.$.tbody) return;
            this.$.tbody.innerHTML = `<tr><td colspan="${this.cfg.colCount}" class="tpos-fso-empty"><div class="tpos-fso-loader"><div class="sp"></div>Đang tải TPOS…</div></td></tr>`;
        }

        showError(msg) {
            if (!this.$.tbody) return;
            this.$.tbody.innerHTML = `<tr><td colspan="${this.cfg.colCount}" class="tpos-fso-empty"><div class="tpos-fso-empty-state"><i data-lucide="alert-triangle" style="color:#ef4444;"></i><div style="color:#ef4444;font-weight:600;">Lỗi tải dữ liệu</div><div style="font-size:12px;">${escapeHtml(msg)}</div></div></td></tr>`;
            if (window.lucide) window.lucide.createIcons();
        }

        showEmpty() {
            if (!this.$.tbody) return;
            this.$.tbody.innerHTML = `<tr><td colspan="${this.cfg.colCount}" class="tpos-fso-empty"><div class="tpos-fso-empty-state"><i data-lucide="inbox"></i><div>Chưa có dữ liệu</div></div></td></tr>`;
            if (window.lucide) window.lucide.createIcons();
        }

        async load() {
            if (!window.tokenManager?.authenticatedFetch) {
                this.showError('Chưa có TPOS token. Refresh trang để init token manager.');
                return;
            }
            // Cancel previous in-flight via abort signal (best-effort)
            if (this.state.inflight) {
                try {
                    this.state.inflight.abort();
                } catch (_) {}
            }
            const ctrl = new AbortController();
            this.state.inflight = ctrl;

            this.showLoading();
            const url = this.buildUrl();
            const startedAt = Date.now();
            try {
                const resp = await window.tokenManager.authenticatedFetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    signal: ctrl.signal,
                });
                if (!resp.ok) {
                    const txt = await resp.text().catch(() => '');
                    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
                }
                const data = await resp.json();
                this.state.rows = Array.isArray(data.value) ? data.value : [];
                this.state.total = Number(data['@odata.count'] || data.totalCount || 0);
                this.state.lastLoadAt = Date.now();
                this.render();
                console.log(
                    `[tpos-fastsale:${this.type}] ${this.state.rows.length} rows / ${this.state.total} total in ${this.state.lastLoadAt - startedAt}ms (page ${this.state.page}/${this.totalPages()})`
                );
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.error(`[tpos-fastsale:${this.type}] load error:`, e);
                this.showError(e.message || 'Unknown error');
            } finally {
                if (this.state.inflight === ctrl) this.state.inflight = null;
            }
        }

        // Apply local mock overlay (edits/deletes) + prepended mock rows. Does not mutate this.state.rows.
        applyMockOverlay(rows) {
            if (!this.mock) return rows;
            const merged = [];
            // Prepend any added mock rows (only on page 1 so they don't repeat across pages)
            if (this.state.page === 1) {
                for (const r of this.mock.added) {
                    if (!this.mock.deleted.has(String(r.Id))) merged.push(r);
                }
            }
            for (const r of rows) {
                const id = String(r.Id);
                if (this.mock.deleted.has(id)) continue;
                const ov = this.mock.overlay.get(id);
                if (ov) {
                    merged.push({ ...r, ...ov, __mockEdited: true });
                } else {
                    merged.push(r);
                }
            }
            return merged;
        }

        render() {
            const { rows, total, page, limit } = this.state;
            const offset = (page - 1) * limit;
            const visible = this.applyMockOverlay(rows);

            if (!visible.length) {
                this.showEmpty();
            } else {
                const html = visible
                    .map((row, i) => this.cfg.rowRenderer(row, offset + i + 1, this.ns))
                    .join('');
                this.$.tbody.innerHTML = html;
                if (window.lucide) window.lucide.createIcons();
            }

            // Counters (purchase mock: total reflects server count + added - deleted on visible page)
            const mockDelta = this.mock
                ? (this.state.page === 1 ? this.mock.added.length : 0) -
                  rows.filter((r) => this.mock.deleted.has(String(r.Id))).length
                : 0;
            const totalDisplay =
                total + (this.mock ? this.mock.added.length - this.mock.deleted.size : 0);
            if (this.$.count) this.$.count.textContent = totalDisplay.toLocaleString('vi-VN');
            if (this.$.total) this.$.total.textContent = totalDisplay.toLocaleString('vi-VN');
            if (this.$.from) this.$.from.textContent = visible.length ? offset + 1 : 0;
            if (this.$.to) this.$.to.textContent = offset + visible.length;
            if (this.$.totalPages) this.$.totalPages.textContent = this.totalPages();
            if (this.$.page) this.$.page.value = this.state.page;
            if (this.$.prev) this.$.prev.disabled = this.state.page <= 1;
            if (this.$.next) this.$.next.disabled = this.state.page >= this.totalPages();
        }

        // --------------- MOCK CRUD ---------------
        // Returns merged row (server row + overlay) for an id, or null if unknown.
        getRowById(id) {
            if (!id) return null;
            const sId = String(id);
            const fromAdded = this.mock?.added.find((r) => String(r.Id) === sId);
            if (fromAdded) return fromAdded;
            const fromServer = this.state.rows.find((r) => String(r.Id) === sId);
            if (!fromServer) return null;
            const ov = this.mock?.overlay.get(sId);
            return ov ? { ...fromServer, ...ov } : fromServer;
        }

        openEditModal(id) {
            const modal = document.getElementById('modal-purchase-edit');
            if (!modal) {
                toast('Modal sửa chưa load. Refresh trang.', 'error');
                return;
            }
            const row = id ? this.getRowById(id) : null;
            const isCreate = !row;
            modal.dataset.activeNs = this.ns;
            modal.dataset.activeId = isCreate ? '' : String(row.Id);
            modal.querySelector('.modal-title').textContent = isCreate
                ? `Thêm phiếu ${this.cfg.label} mới (Mock)`
                : `Sửa phiếu ${escapeHtml(row.Number || row.Id)} (Mock)`;
            const f = modal.querySelector('form');
            f.reset();
            const set = (name, val) => {
                const el = f.elements[name];
                if (el != null) el.value = val == null ? '' : val;
            };
            const seed = isCreate
                ? {
                      PartnerDisplayName: '',
                      DateInvoice: localDateTimeForInput(new Date()),
                      Number: '',
                      VatInvoiceNumber: '',
                      AmountTotal: 0,
                      Residual: 0,
                      State: 'draft',
                      UserName: '',
                      CompanyName: 'NJD Live',
                      Note: '',
                  }
                : {
                      PartnerDisplayName: row.PartnerDisplayName || '',
                      DateInvoice: row.DateInvoice
                          ? localDateTimeForInput(new Date(row.DateInvoice))
                          : '',
                      Number: row.Number || '',
                      VatInvoiceNumber: row.VatInvoiceNumber || row.Origin || '',
                      AmountTotal: row.AmountTotal || 0,
                      Residual: row.Residual || 0,
                      State: row.State || 'draft',
                      UserName: row.UserName || '',
                      CompanyName: row.CompanyName || '',
                      Note: row.Note || '',
                  };
            Object.entries(seed).forEach(([k, v]) => set(k, v));
            // Refund hides Residual + VatInvoiceNumber
            const isRefund = this.cfg.tposType === 'refund';
            modal.querySelectorAll('[data-only-invoice]').forEach((el) => {
                el.style.display = isRefund ? 'none' : '';
            });
            modal.classList.add('show');
        }

        submitEditModal(formData) {
            const modal = document.getElementById('modal-purchase-edit');
            if (!modal || modal.dataset.activeNs !== this.ns) return;
            const id = modal.dataset.activeId;
            const isCreate = !id;
            const patch = {
                PartnerDisplayName: (formData.PartnerDisplayName || '').trim(),
                DateInvoice: formData.DateInvoice
                    ? new Date(formData.DateInvoice).toISOString()
                    : new Date().toISOString(),
                Number: (formData.Number || '').trim() || null,
                VatInvoiceNumber: (formData.VatInvoiceNumber || '').trim() || null,
                AmountTotal: Number(formData.AmountTotal) || 0,
                Residual: Number(formData.Residual) || 0,
                State: formData.State || 'draft',
                UserName: (formData.UserName || '').trim() || 'mock-user',
                CompanyName: (formData.CompanyName || '').trim() || 'NJD Live',
                Note: formData.Note || '',
            };
            if (!patch.PartnerDisplayName) {
                toast('Vui lòng nhập Nhà cung cấp', 'error');
                return;
            }
            patch.PartnerNameNoSign = patch.PartnerDisplayName.normalize('NFD').replace(/[̀-ͯ]/g, '');
            patch.Type = this.cfg.tposType;

            if (isCreate) {
                const newId = `MOCK-${this.ns}-${Date.now()}-${this.mock.nextId++}`;
                this.mock.added.unshift({ Id: newId, ...patch });
                toast(`Đã thêm phiếu mock cho ${patch.PartnerDisplayName} (chỉ local).`, 'success');
            } else {
                if (id.startsWith('MOCK-')) {
                    // Editing a previously added mock row → update in-place
                    const idx = this.mock.added.findIndex((r) => String(r.Id) === id);
                    if (idx >= 0) this.mock.added[idx] = { ...this.mock.added[idx], ...patch };
                } else {
                    this.mock.overlay.set(id, patch);
                }
                toast(
                    `Đã lưu thay đổi mock cho phiếu ${patch.Number || id} (chỉ local).`,
                    'success'
                );
            }
            modal.classList.remove('show');
            this.render();
        }

        openDeleteConfirm(id) {
            const row = this.getRowById(id);
            if (!row) return;
            const modal = document.getElementById('modal-purchase-delete');
            if (!modal) {
                if (confirm(`Xóa phiếu ${row.Number || id}? (Mock — chỉ local)`)) {
                    this.executeDelete(id);
                }
                return;
            }
            modal.dataset.activeNs = this.ns;
            modal.dataset.activeId = String(id);
            modal.querySelector('[data-bind="deleteTarget"]').textContent =
                `${row.Number || id} — ${row.PartnerDisplayName || ''}`;
            modal.classList.add('show');
        }

        executeDelete(id) {
            if (!this.mock) return;
            const sId = String(id);
            if (sId.startsWith('MOCK-')) {
                this.mock.added = this.mock.added.filter((r) => String(r.Id) !== sId);
            } else {
                this.mock.deleted.add(sId);
                this.mock.overlay.delete(sId);
            }
            toast(`Đã xóa phiếu ${sId} (mock — không sync TPOS).`, 'success');
            const modal = document.getElementById('modal-purchase-delete');
            if (modal) modal.classList.remove('show');
            this.render();
        }

        async activate() {
            if (this.loaded) return;
            this.loaded = true;
            await this.load();
        }
    }

    // Lightweight toast that prefers notificationManager when available.
    function toast(msg, level = 'info') {
        try {
            if (window.notificationManager?.show) {
                window.notificationManager.show(msg, level);
                return;
            }
        } catch (_) {}
        // Fallback: log + inline div
        let host = document.getElementById('tpos-mock-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'tpos-mock-toast-host';
            host.style.cssText =
                'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(host);
        }
        const div = document.createElement('div');
        const bg = level === 'error' ? '#fee2e2' : level === 'success' ? '#d1fae5' : '#e0f2fe';
        const fg = level === 'error' ? '#991b1b' : level === 'success' ? '#065f46' : '#1e3a8a';
        div.style.cssText = `background:${bg};color:${fg};padding:10px 14px;border-radius:8px;border:1px solid currentColor;box-shadow:0 4px 12px rgba(0,0,0,0.12);font-size:13px;font-weight:500;min-width:200px;max-width:400px;`;
        div.textContent = msg;
        host.appendChild(div);
        setTimeout(() => div.remove(), 3500);
    }

    // Registry — key by tab id so page-tabs.js can trigger first-load on click
    const REGISTRY = {};

    function init() {
        document.querySelectorAll('.tpos-fastsale').forEach((root) => {
            const inst = new TposFastSaleTab(root);
            const paneTab = root.closest('.page-tab-pane')?.dataset.tab;
            if (paneTab) REGISTRY[paneTab] = inst;
        });
    }

    // Wire up shared modals (edit form + delete confirm) for purchase mock CRUD.
    function bindMockModals() {
        const editModal = document.getElementById('modal-purchase-edit');
        if (editModal && !editModal.dataset.bound) {
            editModal.dataset.bound = '1';
            editModal
                .querySelectorAll('[data-bind="close"]')
                .forEach((el) =>
                    el.addEventListener('click', () => editModal.classList.remove('show'))
                );
            editModal.addEventListener('click', (e) => {
                if (e.target === editModal) editModal.classList.remove('show');
            });
            const form = editModal.querySelector('form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const ns = editModal.dataset.activeNs;
                    const inst = Object.values(REGISTRY).find((i) => i.ns === ns);
                    if (!inst) return;
                    const fd = new FormData(form);
                    const data = {};
                    fd.forEach((v, k) => (data[k] = v));
                    inst.submitEditModal(data);
                });
            }
        }
        const delModal = document.getElementById('modal-purchase-delete');
        if (delModal && !delModal.dataset.bound) {
            delModal.dataset.bound = '1';
            delModal
                .querySelectorAll('[data-bind="close"]')
                .forEach((el) =>
                    el.addEventListener('click', () => delModal.classList.remove('show'))
                );
            delModal.addEventListener('click', (e) => {
                if (e.target === delModal) delModal.classList.remove('show');
            });
            const confirmBtn = delModal.querySelector('[data-bind="confirmDelete"]');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    const ns = delModal.dataset.activeNs;
                    const id = delModal.dataset.activeId;
                    const inst = Object.values(REGISTRY).find((i) => i.ns === ns);
                    if (inst && id) inst.executeDelete(id);
                });
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        init();
        bindMockModals();
        // If a TPOS tab is already active on load (e.g. via hash), trigger first load
        const activeTab = document.querySelector('.page-tab-pane.active')?.dataset.tab;
        if (activeTab && REGISTRY[activeTab]) REGISTRY[activeTab].activate();
    });

    // Expose for page-tabs.js to call on tab activation
    window.TposFastSaleTabs = {
        activate(tabId) {
            const inst = REGISTRY[tabId];
            if (inst) inst.activate();
        },
        instance(tabId) {
            return REGISTRY[tabId] || null;
        },
    };
})();
