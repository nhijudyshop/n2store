// #Note: TPOS FastSaleOrder list — invoice ('invoice') & refund ('refund'). Live fetch via window.tokenManager + Cloudflare worker proxy. Paging via OData $top/$skip/$count.

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const ODATA_BASE = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView`;

    const TYPE_CFG = {
        invoice: {
            tposType: 'invoice',
            label: 'Hóa đơn',
            colCount: 10,
            rowRenderer: renderInvoiceRow,
        },
        refund: {
            tposType: 'refund',
            label: 'Trả hàng',
            colCount: 9,
            rowRenderer: renderRefundRow,
        },
    };

    const STATE_META = {
        draft: { label: 'Nháp', cls: 's-draft', icon: 'file' },
        open: { label: 'Đang xử lý', cls: 's-open', icon: 'loader' },
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

    function stateBadge(state) {
        const m = STATE_META[state] || { label: state || '—', cls: 's-draft', icon: 'help-circle' };
        return `<span class="tpos-fso-badge ${m.cls}"><i data-lucide="${m.icon}"></i>${m.label}</span>`;
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

            // Row click: open in TPOS
            const tbody = this.$.tbody;
            if (tbody) {
                tbody.addEventListener('click', (e) => {
                    const el = e.target.closest('[data-action="open"]');
                    if (!el) return;
                    const id = el.dataset.id;
                    if (!id) return;
                    const path =
                        this.type === 'refund'
                            ? 'fastsaleorder/refundlist'
                            : 'fastsaleorder/invoicelist';
                    window.open(`https://tomato.tpos.vn/#/app/${path}/${id}`, '_blank', 'noopener');
                });
            }
        }

        totalPages() {
            return Math.max(1, Math.ceil(this.state.total / this.state.limit));
        }

        buildFilter() {
            const parts = [`Type eq '${this.cfg.tposType}'`];
            // Invoices exclude merge-cancel rows by default (matches TPOS native list)
            if (this.cfg.tposType === 'invoice') parts.push('IsMergeCancel ne true');
            if (this.state.stateFilter) parts.push(`State eq '${this.state.stateFilter}'`);
            if (this.state.dateFrom)
                parts.push(`DateInvoice ge ${this.state.dateFrom}T00:00:00.000Z`);
            if (this.state.dateTo) parts.push(`DateInvoice le ${this.state.dateTo}T23:59:59.999Z`);
            const q = this.state.search;
            if (q) {
                const safe = q.replace(/'/g, "''");
                // Phone numeric → match Phone OR PartnerNameNoSign OR Number
                if (/^\d{4,}$/.test(q)) {
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
            return `${ODATA_BASE}?${params.toString()}`;
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

        render() {
            const { rows, total, page, limit } = this.state;
            const offset = (page - 1) * limit;

            if (!rows.length) {
                this.showEmpty();
            } else {
                const html = rows
                    .map((row, i) => this.cfg.rowRenderer(row, offset + i + 1, this.ns))
                    .join('');
                this.$.tbody.innerHTML = html;
                if (window.lucide) window.lucide.createIcons();
            }

            // Counters
            if (this.$.count) this.$.count.textContent = total.toLocaleString('vi-VN');
            if (this.$.total) this.$.total.textContent = total.toLocaleString('vi-VN');
            if (this.$.from) this.$.from.textContent = rows.length ? offset + 1 : 0;
            if (this.$.to) this.$.to.textContent = offset + rows.length;
            if (this.$.totalPages) this.$.totalPages.textContent = this.totalPages();
            if (this.$.page) this.$.page.value = this.state.page;
            if (this.$.prev) this.$.prev.disabled = this.state.page <= 1;
            if (this.$.next) this.$.next.disabled = this.state.page >= this.totalPages();
        }

        async activate() {
            if (this.loaded) return;
            this.loaded = true;
            await this.load();
        }
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

    document.addEventListener('DOMContentLoaded', () => {
        init();
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
