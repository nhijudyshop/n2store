// #Note: TPOS FastSaleOrder + FastPurchaseOrder list (4 types: invoice/refund/purchase/purchaseRefund). Live fetch via window.tokenManager + Cloudflare worker proxy. Paging via OData $top/$skip/$count.

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    const TYPE_CFG = {
        invoice: {
            entity: 'FastSaleOrder',
            tposType: 'invoice',
            label: 'Hóa đơn',
            colCount: 12, // +1 for "In bill" action column
            tposPath: 'fastsaleorder/invoicelist',
            rowRenderer: renderInvoiceRow,
        },
        refund: {
            entity: 'FastSaleOrder',
            tposType: 'refund',
            label: 'Trả hàng',
            colCount: 11, // +1 for "In bill" action column
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

    // ============================================================
    // Column toggle config — per tab type, declare toggleable cols + which hidden by default
    // ============================================================
    const TOGGLEABLE_COLS = {
        invoice: [{ key: 'channel', label: 'Kênh' }],
        refund: [
            { key: 'refundOf', label: 'PBH gốc' },
            { key: 'channel', label: 'Kênh' },
        ],
        purchase: [],
        purchaseRefund: [],
    };
    const DEFAULT_HIDDEN_COLS = {
        invoice: ['channel'],
        refund: ['refundOf', 'channel'],
        purchase: [],
        purchaseRefund: [],
    };
    const COL_STORE_KEY = (ns) => `tpos-cols-hidden-${ns}`;

    function loadHiddenCols(ns, tposType) {
        try {
            const raw = localStorage.getItem(COL_STORE_KEY(ns));
            if (raw === null) return new Set(DEFAULT_HIDDEN_COLS[tposType] || []);
            const arr = JSON.parse(raw);
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (_) {
            return new Set(DEFAULT_HIDDEN_COLS[tposType] || []);
        }
    }

    function saveHiddenCols(ns, hiddenSet) {
        try {
            localStorage.setItem(COL_STORE_KEY(ns), JSON.stringify([...hiddenSet]));
        } catch (_) {}
    }

    function applyHiddenColClasses(root, hiddenSet) {
        // Remove all previous tpos-hide-col-* classes
        Array.from(root.classList)
            .filter((c) => c.startsWith('tpos-hide-col-'))
            .forEach((c) => root.classList.remove(c));
        // Apply new
        hiddenSet.forEach((key) => root.classList.add(`tpos-hide-col-${key}`));
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

    // Print bill cell — for FastSaleOrder rows (BÁN HÀNG + TRẢ HÀNG).
    // Fetches TPOS rendered HTML via /api/fastsaleorder/print1 and opens print popup.
    function printCell(id) {
        return `<td class="tpos-fso-actions-cell">
            <button type="button" class="tpos-fso-row-btn tpos-fso-row-print" data-action="print" data-id="${id || ''}" title="In bill">
                <i data-lucide="printer"></i>
            </button>
        </td>`;
    }

    // Action cell for real FastSaleOrder rows (BÁN HÀNG + TRẢ HÀNG):
    // In bill · Lịch sử (audit log) · Hủy phiếu (ActionCancel). Single <td> keeps colCount stable.
    function saleActionsCell(id, state) {
        const canCancel = state !== 'cancel';
        return `<td class="tpos-fso-actions-cell">
            <button type="button" class="tpos-fso-row-btn tpos-fso-row-print" data-action="print" data-id="${id || ''}" title="In bill"><i data-lucide="printer"></i></button>
            <button type="button" class="tpos-fso-row-btn tpos-fso-row-history" data-action="history" data-id="${id || ''}" title="Lịch sử"><i data-lucide="history"></i></button>
            ${canCancel ? `<button type="button" class="tpos-fso-row-btn tpos-fso-row-cancel" data-action="cancel" data-id="${id || ''}" title="Hủy phiếu bán hàng"><i data-lucide="ban"></i></button>` : ''}
        </td>`;
    }

    // TPOS AuditLog Action → Vietnamese label (matches TPOS "Lịch sử" tab).
    const AUDIT_ACTION_LABEL = {
        INSERT: 'Thêm mới',
        CREATE: 'Thêm mới',
        UPDATE: 'Cập nhật',
        DELETE: 'Xóa',
        CANCEL: 'Hủy phiếu',
    };

    async function printBill(id) {
        if (!id) return;
        const toastMsg = (msg, level = 'info') => {
            try {
                window.notificationManager?.show?.(msg, level);
            } catch (_) {}
        };
        try {
            const loading = window.notificationManager?.loading?.('Đang tải bill từ TPOS...');
            const url = `${WORKER_URL}/api/fastsaleorder/print1?ids=${encodeURIComponent(id)}`;
            const resp = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json, text/javascript, */*; q=0.01',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            });
            if (loading) window.notificationManager?.remove?.(loading);
            if (!resp.ok) {
                const t = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status} ${t.slice(0, 120)}`);
            }
            const data = await resp.json();
            if (!data?.html) throw new Error('TPOS không trả về HTML in bill');
            openPrintPopup(data.html);
        } catch (e) {
            console.error(`[tpos-fastsale] print error:`, e);
            toastMsg(`Lỗi in bill: ${e.message}`, 'error');
        }
    }

    function openPrintPopup(html) {
        const win = window.open('', '_blank', 'width=800,height=900,scrollbars=yes');
        if (!win) {
            try {
                window.notificationManager?.warning?.(
                    'Không thể mở cửa sổ in. Vui lòng cho phép popup cho trang này.'
                );
            } catch (_) {}
            return;
        }
        win.document.write(html);
        win.document.close();
        let printed = false;
        const trigger = () => {
            if (printed || !win || win.closed) return;
            printed = true;
            win.focus();
            win.print();
        };
        win.onafterprint = () => win.close();
        win.onload = () => setTimeout(trigger, 500);
        setTimeout(trigger, 1500);
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
            <td>${stateBadge(row.State, STATE_META, true)}</td>
            <td data-col="channel"><span style="color:#475569;font-size:12px;">${escapeHtml(channel)}</span></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
            ${saleActionsCell(row.Id, row.State)}
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
            <td data-col="refundOf"><span class="mono" style="color:#475569;">${escapeHtml(refundOf || '—')}</span></td>
            <td><div class="tpos-fso-customer">${escapeHtml(customer)}</div></td>
            <td><span class="tpos-fso-phone">${escapeHtml(phone || '—')}</span></td>
            <td class="num" style="color:#dc2626;">${total}</td>
            <td>${stateBadge(row.State, STATE_META, true)}</td>
            <td data-col="channel"><span style="color:#475569;font-size:12px;">${escapeHtml(channel)}</span></td>
            <td><span class="mono" style="color:#64748b;">${date}</span></td>
            ${saleActionsCell(row.Id, row.State)}
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

    function renderDetailHTML(detail, opts = {}) {
        const lines = Array.isArray(detail.OrderLines) ? detail.OrderLines : [];
        const subtotal = lines.reduce((s, l) => s + (Number(l.PriceTotal) || 0), 0);
        const showRefund = !!opts.showRefundActions;
        const colCount = showRefund ? 9 : 7;
        const linesHtml = lines.length
            ? lines
                  .map((l, i) => {
                      const pname = l.ProductNameGet || l.Name || l.ProductName || '';
                      const sku = l.ProductBarcode || '';
                      const uom = l.ProductUOMName || '';
                      // FastSaleOrder lines: ProductUOMQty · FastPurchaseOrder lines: ProductQty
                      const qty = Number(l.ProductUOMQty ?? l.ProductQty) || 0;
                      const price = fmtMoney(l.PriceUnit);
                      const weight = Number(l.WeightTotal || l.Weight || 0);
                      const lineTotal = fmtMoney(l.PriceTotal);
                      const refundCols = showRefund
                          ? `<td class="tpos-refund-check"><input type="checkbox" data-refund-line="${i}" checked></td>
                             <td class="tpos-refund-qty"><input type="number" data-refund-qty="${i}" min="0" max="${qty}" step="1" value="${qty}" style="width:62px;text-align:right;"></td>`
                          : '';
                      return `<tr data-line-idx="${i}">
                          ${refundCols}
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
            : `<tr><td colspan="${colCount}" style="text-align:center;color:#94a3b8;padding:16px;">Không có dòng sản phẩm</td></tr>`;

        const summary = `<div class="tpos-fso-detail-summary">
            <div><span>Tổng tiền hàng:</span><strong>${fmtMoney(subtotal)}</strong></div>
            ${detail.DecreaseAmount > 0 ? `<div><span>Giảm giá:</span><strong>-${fmtMoney(detail.DecreaseAmount)}</strong></div>` : ''}
            ${detail.DeliveryPrice > 0 ? `<div><span>Phí giao hàng:</span><strong>${fmtMoney(detail.DeliveryPrice)}</strong></div>` : ''}
            ${detail.AmountTax > 0 ? `<div><span>Thuế:</span><strong>${fmtMoney(detail.AmountTax)}</strong></div>` : ''}
            <div class="total"><span>Tổng cộng:</span><strong>${fmtMoney(detail.AmountTotal)}</strong></div>
            ${detail.CashOnDelivery > 0 ? `<div><span>Tiền thu (COD):</span><strong>${fmtMoney(detail.CashOnDelivery)}</strong></div>` : ''}
            ${detail.Note ? `<div class="note"><span>Ghi chú:</span><em>${escapeHtml(detail.Note)}</em></div>` : ''}
        </div>`;

        const refundToolbar = showRefund
            ? `<div class="tpos-refund-toolbar">
                  <button type="button" class="tpos-refund-btn tpos-refund-btn-secondary" data-refund-action="select-all">
                      <i data-lucide="check-square"></i> Chọn tất cả
                  </button>
                  <button type="button" class="tpos-refund-btn tpos-refund-btn-secondary" data-refund-action="deselect-all">
                      <i data-lucide="square"></i> Bỏ chọn
                  </button>
                  <button type="button" class="tpos-refund-btn tpos-refund-btn-primary" data-refund-action="refund-all" title="Trả toàn bộ BILL này">
                      <i data-lucide="undo-2"></i> Trả toàn bộ
                  </button>
                  <button type="button" class="tpos-refund-btn tpos-refund-btn-warning" data-refund-action="refund-selected" title="Trả các dòng đã chọn với số lượng đã điều chỉnh">
                      <i data-lucide="package-x"></i> Trả đã chọn
                  </button>
                  <span class="tpos-refund-hint">Bỏ tick = không trả dòng đó · Sửa số lượng để trả 1 phần</span>
              </div>`
            : '';

        const refundCols = showRefund
            ? `<th style="width:36px;text-align:center;">Chọn</th>
               <th style="width:88px;text-align:center;">SL trả</th>`
            : '';

        return `<div class="tpos-fso-detail-wrap ${showRefund ? 'tpos-fso-detail-purchase' : ''}">
            ${refundToolbar}
            <table class="tpos-fso-detail-table">
                <thead><tr>
                    ${refundCols}
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

            // Column visibility — load saved or apply defaults
            this.hiddenCols = loadHiddenCols(this.ns, this.cfg.tposType);
            applyHiddenColClasses(this.root, this.hiddenCols);

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
                    const printBtn = e.target.closest('[data-action="print"]');
                    if (printBtn) {
                        e.stopPropagation();
                        printBill(printBtn.dataset.id);
                        return;
                    }
                    const historyBtn = e.target.closest('[data-action="history"]');
                    if (historyBtn) {
                        e.stopPropagation();
                        this.openHistory(historyBtn.dataset.id);
                        return;
                    }
                    const cancelBtn = e.target.closest('[data-action="cancel"]');
                    if (cancelBtn) {
                        e.stopPropagation();
                        this.openCancelConfirm(cancelBtn.dataset.id);
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
            }

            // Column toggle button + dropdown — wired for ALL tabs (not just mockable)
            this.bindColumnToggle();
        }

        bindColumnToggle() {
            const cols = TOGGLEABLE_COLS[this.cfg.tposType] || [];
            const btn = this.root.querySelector('[data-bind="toggleCols"]');
            const dropdown = this.root.querySelector('[data-bind="colDropdown"]');
            if (!btn || !dropdown || !cols.length) return;

            const renderDropdown = () => {
                dropdown.innerHTML = cols
                    .map((c) => {
                        const hidden = this.hiddenCols.has(c.key);
                        return `<label class="tpos-col-row">
                            <input type="checkbox" data-col-key="${c.key}" ${hidden ? '' : 'checked'}>
                            <span>${escapeHtml(c.label)}</span>
                        </label>`;
                    })
                    .join('');
            };

            renderDropdown();

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = !dropdown.hasAttribute('hidden');
                if (isOpen) {
                    dropdown.setAttribute('hidden', '');
                } else {
                    renderDropdown();
                    dropdown.removeAttribute('hidden');
                }
            });

            // Outside click closes
            document.addEventListener('click', (e) => {
                if (dropdown.hasAttribute('hidden')) return;
                if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                    dropdown.setAttribute('hidden', '');
                }
            });

            dropdown.addEventListener('change', (e) => {
                const cb = e.target.closest('input[data-col-key]');
                if (!cb) return;
                const key = cb.dataset.colKey;
                if (cb.checked) {
                    this.hiddenCols.delete(key);
                } else {
                    this.hiddenCols.add(key);
                }
                applyHiddenColClasses(this.root, this.hiddenCols);
                saveHiddenCols(this.ns, this.hiddenCols);
            });
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
            // Show refund-from-BILL controls only for purchase invoice rows in non-cancelled state
            const canRefund =
                this.cfg.entity === 'FastPurchaseOrder' &&
                this.cfg.tposType === 'invoice' &&
                detail.State !== 'cancel';
            detailTr.innerHTML = `<td colspan="${this.cfg.colCount}">${renderDetailHTML(detail, { showRefundActions: canRefund })}</td>`;
            if (window.lucide) window.lucide.createIcons();

            if (canRefund) this.bindRefundActions(detailTr, detail);
        }

        // Wire up the refund-from-BILL toolbar inside an expanded purchase detail row.
        bindRefundActions(detailTr, detail) {
            const wrap = detailTr.querySelector('.tpos-fso-detail-purchase');
            if (!wrap) return;

            const getSelectedLines = (mode) => {
                const allLines = Array.isArray(detail.OrderLines) ? detail.OrderLines : [];
                if (mode === 'all') {
                    // Trả toàn bộ — use original qty for every line.
                    // FastPurchaseOrder lines use ProductQty (not ProductUOMQty like FastSaleOrder).
                    return allLines.map((l) => ({
                        src: l,
                        qty: Number(l.ProductUOMQty ?? l.ProductQty) || 0,
                    }));
                }
                // mode === 'selected' — read checkboxes + qty inputs
                const out = [];
                wrap.querySelectorAll('tr[data-line-idx]').forEach((tr) => {
                    const idx = Number(tr.dataset.lineIdx);
                    const checked = tr.querySelector('[data-refund-line]')?.checked;
                    const qty = Number(tr.querySelector('[data-refund-qty]')?.value) || 0;
                    if (checked && qty > 0 && allLines[idx]) {
                        out.push({ src: allLines[idx], qty });
                    }
                });
                return out;
            };

            const adaptLine = (entry) => {
                const l = entry.src;
                const p = l.Product || {};
                return {
                    templateId: p.ProductTmplId || p.Id,
                    productId: l.ProductId || p.Id,
                    variantData: p.Id
                        ? {
                              Id: p.Id,
                              Name: p.Name,
                              UOMId: p.UOMId || l.ProductUOMId,
                              UOMName: p.UOMName || l.ProductUOMName,
                              NameGet: p.NameGet || l.ProductNameGet,
                              Barcode: p.Barcode || l.ProductBarcode,
                              Price: p.Price || l.PriceUnit,
                              DefaultCode: p.DefaultCode || l.ProductBarcode,
                              ProductTmplId: p.ProductTmplId,
                              PurchaseOK: true,
                              SaleOK: true,
                              PurchasePrice: p.PurchasePrice || l.PriceUnit,
                              Weight: p.Weight || 0,
                              ImageUrl: p.ImageUrl || l.ProductImageUrl || null,
                              Active: p.Active !== false,
                              Factor: 1,
                          }
                        : null,
                    product: p,
                    name: l.Name || l.ProductNameGet || '',
                    code: p.DefaultCode || l.ProductBarcode || '',
                    quantity: entry.qty,
                    price: Number(l.PriceUnit) || 0,
                    uom: l.ProductUOMName || p.UOMName || 'Cái',
                    uomId: l.ProductUOMId || p.UOMId || 1,
                };
            };

            const openRefund = (mode) => {
                if (!window.ReturnOrderModal?.open) {
                    toast('Modal trả hàng chưa load', 'error');
                    return;
                }
                const entries = getSelectedLines(mode);
                if (!entries.length) {
                    toast('Chọn ít nhất 1 dòng để trả', 'error');
                    return;
                }
                const supplierData = {
                    Id: detail.PartnerId,
                    Name: detail.Partner?.Name || detail.PartnerDisplayName,
                    DisplayName: detail.PartnerDisplayName || detail.Partner?.DisplayName,
                    Ref: detail.Partner?.Ref || null,
                };
                window.ReturnOrderModal.open({
                    supplierData,
                    presetLines: entries.map(adaptLine),
                    refundOrderId: detail.Id,
                    origin: detail.Number || `BILL/Id-${detail.Id}`,
                    title: `Trả hàng từ ${detail.Number || '(BILL nháp)'} — chỉnh số lượng / xoá dòng để trả 1 phần`,
                });
            };

            wrap.querySelector('[data-refund-action="select-all"]')?.addEventListener(
                'click',
                () => {
                    wrap.querySelectorAll('[data-refund-line]').forEach(
                        (cb) => (cb.checked = true)
                    );
                }
            );
            wrap.querySelector('[data-refund-action="deselect-all"]')?.addEventListener(
                'click',
                () => {
                    wrap.querySelectorAll('[data-refund-line]').forEach(
                        (cb) => (cb.checked = false)
                    );
                }
            );
            wrap.querySelector('[data-refund-action="refund-all"]')?.addEventListener('click', () =>
                openRefund('all')
            );
            wrap.querySelector('[data-refund-action="refund-selected"]')?.addEventListener(
                'click',
                () => openRefund('selected')
            );
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

        // --------------- LỊCH SỬ (TPOS AuditLog) ---------------
        async openHistory(id) {
            if (!id) return;
            const row = this.getRowById(id);
            const title = row ? row.Number || id : id;
            const subtitle = row ? row.PartnerDisplayName || row.PartnerName || '' : '';
            const modal = ensureHistoryModal();
            modal.querySelector('[data-bind="histTitle"]').textContent = title;
            modal.querySelector('[data-bind="histSub"]').textContent = subtitle;
            const body = modal.querySelector('[data-bind="histBody"]');
            body.innerHTML = `<div class="tpos-hist-loading"><div class="sp"></div>Đang tải lịch sử…</div>`;
            modal.classList.add('show');

            try {
                const url = `${WORKER_URL}/api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=${encodeURIComponent(this.cfg.entity)}&entityId=${encodeURIComponent(id)}&skip=0&take=50`;
                const resp = await window.tokenManager.authenticatedFetch(url, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                });
                if (!resp.ok) {
                    const t = await resp.text().catch(() => '');
                    throw new Error(`HTTP ${resp.status} ${t.slice(0, 120)}`);
                }
                const data = await resp.json();
                const entries = Array.isArray(data.value) ? data.value : [];
                body.innerHTML = renderHistoryFeed(entries);
                if (window.lucide) window.lucide.createIcons();
            } catch (e) {
                console.error(`[tpos-fastsale:${this.type}] history fetch failed:`, e);
                body.innerHTML = `<div class="tpos-hist-error"><i data-lucide="alert-triangle"></i> Lỗi tải lịch sử: ${escapeHtml(e.message)}</div>`;
                if (window.lucide) window.lucide.createIcons();
            }
        }

        // --------------- HỦY PHIẾU BÁN HÀNG (TPOS ActionCancel) ---------------
        openCancelConfirm(id) {
            const row = this.getRowById(id);
            if (!row) return;
            if (row.State === 'cancel') {
                toast('Phiếu này đã hủy.', 'info');
                return;
            }
            const modal = ensureCancelModal();
            modal.dataset.activeNs = this.ns;
            modal.dataset.activeId = String(id);
            modal.querySelector('[data-bind="cancelTarget"]').textContent =
                `${row.Number || id} — ${row.PartnerDisplayName || row.PartnerName || ''}`;
            const btn = modal.querySelector('[data-bind="confirmCancel"]');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="ban"></i> Hủy phiếu';
            modal.classList.add('show');
            if (window.lucide) window.lucide.createIcons();
        }

        // Money/state mutation → keep await + loading state (UI-FIRST exception).
        async executeCancelSale(id) {
            const numId = parseInt(id, 10);
            if (!numId || isNaN(numId)) {
                toast('ID phiếu không hợp lệ.', 'error');
                return;
            }
            const modal = document.getElementById('tpos-cancel-modal');
            const btn = modal?.querySelector('[data-bind="confirmCancel"]');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="tpos-btn-spin"></span> Đang hủy…';
            }
            try {
                const resp = await window.tokenManager.authenticatedFetch(
                    `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.ActionCancel`,
                    {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ ids: [numId] }),
                    }
                );
                if (!resp.ok) {
                    const t = await resp.text().catch(() => '');
                    let msg = `HTTP ${resp.status}`;
                    try {
                        const j = JSON.parse(t);
                        msg = j?.error?.message || j?.message || msg;
                    } catch (_) {
                        if (t) msg += ` ${t.slice(0, 160)}`;
                    }
                    throw new Error(msg);
                }
                if (modal) modal.classList.remove('show');
                if (this.detailCache) this.detailCache.delete(String(id));
                toast(`Đã hủy phiếu ${id}.`, 'success');
                await this.load();
            } catch (e) {
                console.error(`[tpos-fastsale:${this.type}] cancel failed:`, e);
                toast(`Lỗi hủy phiếu: ${e.message}`, 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="ban"></i> Hủy phiếu';
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        }

        async activate() {
            if (this.loaded) return;
            this.loaded = true;
            await this.load();
        }
    }

    // ============================================================
    // Shared singleton modals (history feed + cancel confirm)
    // ============================================================
    function fmtAuditDate(s) {
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d)) return escapeHtml(String(s));
        const pad = (x) => String(x).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function renderHistoryFeed(entries) {
        if (!entries.length) {
            return `<div class="tpos-hist-empty"><i data-lucide="inbox"></i><div>Chưa có lịch sử</div></div>`;
        }
        return entries
            .map((e) => {
                const actionRaw = (e.Action || '').toUpperCase();
                const action = AUDIT_ACTION_LABEL[actionRaw] || e.Action || '—';
                const actCls =
                    actionRaw === 'INSERT' || actionRaw === 'CREATE'
                        ? 'is-insert'
                        : actionRaw === 'CANCEL' || actionRaw === 'DELETE'
                          ? 'is-cancel'
                          : 'is-update';
                const desc = escapeHtml(e.Description || '').replace(/\r\n|\r|\n/g, '<br>');
                return `<div class="tpos-hist-item">
                    <div class="tpos-hist-head">
                        <span class="tpos-hist-user">${escapeHtml(e.UserName || '—')}</span>
                        <span class="tpos-hist-time">${fmtAuditDate(e.DateCreated)}</span>
                    </div>
                    <div class="tpos-hist-action ${actCls}">${escapeHtml(action)}</div>
                    ${desc ? `<div class="tpos-hist-desc">${desc}</div>` : ''}
                </div>`;
            })
            .join('');
    }

    function ensureHistoryModal() {
        let modal = document.getElementById('tpos-history-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'tpos-history-modal';
        modal.className = 'tpos-fso-modal';
        modal.innerHTML = `<div class="tpos-fso-modal-box tpos-hist-box">
            <header class="tpos-fso-modal-head">
                <div>
                    <div class="tpos-fso-modal-title"><i data-lucide="history"></i> Lịch sử <span data-bind="histTitle" class="mono"></span></div>
                    <div class="tpos-fso-modal-subtitle" data-bind="histSub"></div>
                </div>
                <button type="button" class="tpos-fso-modal-close" data-bind="close"><i data-lucide="x"></i></button>
            </header>
            <div class="tpos-fso-modal-body" data-bind="histBody"></div>
        </div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove('show');
        modal.querySelector('[data-bind="close"]').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        if (window.lucide) window.lucide.createIcons();
        return modal;
    }

    function ensureCancelModal() {
        let modal = document.getElementById('tpos-cancel-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'tpos-cancel-modal';
        modal.className = 'tpos-fso-modal';
        modal.innerHTML = `<div class="tpos-fso-modal-box tpos-cancel-box">
            <header class="tpos-fso-modal-head">
                <div class="tpos-fso-modal-title tpos-cancel-title"><i data-lucide="ban"></i> Hủy phiếu bán hàng</div>
                <button type="button" class="tpos-fso-modal-close" data-bind="close"><i data-lucide="x"></i></button>
            </header>
            <div class="tpos-fso-modal-body">
                <p class="tpos-cancel-q">Bạn chắc chắn muốn <strong>hủy</strong> phiếu này trên TPOS?</p>
                <div class="tpos-cancel-target" data-bind="cancelTarget"></div>
                <p class="tpos-cancel-warn"><i data-lucide="alert-triangle"></i> Thao tác này gọi trực tiếp TPOS (ActionCancel) — phiếu sẽ chuyển sang trạng thái <strong>Đã hủy</strong>.</p>
            </div>
            <footer class="tpos-fso-modal-foot">
                <button type="button" class="tpos-modal-btn tpos-modal-btn-ghost" data-bind="close">Đóng</button>
                <button type="button" class="tpos-modal-btn tpos-modal-btn-danger" data-bind="confirmCancel"><i data-lucide="ban"></i> Hủy phiếu</button>
            </footer>
        </div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove('show');
        modal
            .querySelectorAll('[data-bind="close"]')
            .forEach((el) => el.addEventListener('click', close));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        modal.querySelector('[data-bind="confirmCancel"]').addEventListener('click', () => {
            const ns = modal.dataset.activeNs;
            const id = modal.dataset.activeId;
            const inst = Object.values(REGISTRY).find((i) => i.ns === ns);
            if (inst && id) inst.executeCancelSale(id);
        });
        if (window.lucide) window.lucide.createIcons();
        return modal;
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
