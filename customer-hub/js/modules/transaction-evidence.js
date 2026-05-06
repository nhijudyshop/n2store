// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Transaction Evidence helpers
 *
 * Dùng chung giữa wallet-panel và transaction-activity (và customer-profile nếu cần).
 *
 * Exposed on window.TxEvidence:
 *   getSepayImageUrl(tx)   -> string|null
 *   getTicketCode(tx)      -> string|null (mã TV-YYYY-NNNNN)
 *   showSepayImage(url)    -> open lightbox
 *   showTicketDetail(code) -> open ticket history modal
 */
(function () {
    const STYLE_ID = 'tx-evidence-style';
    const LIGHTBOX_ID = 'tx-evidence-lightbox';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = `
            .tx-eye-btn { background: transparent; border: 0; cursor: pointer; padding: 4px;
                border-radius: 6px; color: #64748b; flex-shrink: 0;
                display: inline-flex; align-items: center; justify-content: center; }
            .tx-eye-btn:hover { background: rgba(100, 116, 139, 0.12); }
            .tx-eye-btn[data-eye-kind="sepay"]:hover { color: #2563eb; }
            .tx-eye-btn[data-eye-kind="ticket"]:hover { color: #7c3aed; }
            .tx-eye-btn .material-symbols-outlined { font-size: 18px; }
            #${LIGHTBOX_ID} { position: fixed; inset: 0; background: rgba(0,0,0,0.75);
                z-index: 10000; display: flex; align-items: center; justify-content: center;
                padding: 24px; cursor: zoom-out; }
            #${LIGHTBOX_ID} img { max-width: 100%; max-height: 100%;
                border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        `;
        document.head.appendChild(el);
    }

    /**
     * Detect CK Sepay DEPOSIT that has an approval image attached.
     * Backend now returns `sepay_image_url` via LEFT JOIN balance_history.
     */
    function getSepayImageUrl(tx) {
        if (!tx) return null;
        if (tx.type !== 'DEPOSIT') return null;
        if (tx.reference_type !== 'balance_history') return null;
        return tx.sepay_image_url || null;
    }

    /**
     * Detect ticket-linked transaction. Accepts either:
     *   - TV-YYYY-NNNNN  (ticket_code — direct lookup)
     *   - NJD/YYYY/NNNNN (order_id — viewer resolves via searchTicketsServer)
     *
     * Why both: VIRTUAL_CREDIT from "Thu Về" and other ticket-driven tx often
     * embed only the NJD order id in note (e.g. "Cộng Nợ Ảo Từ Thu Về (NJD/2026/62709)…").
     */
    function getTicketCode(tx) {
        if (!tx) return null;
        const fields = [tx.reference_id, tx.note, tx.source].filter(Boolean);
        // Prefer TV- code first (direct match); fall back to NJD order id.
        for (const f of fields) {
            const m = String(f).match(/TV-\d{4}-\d+/);
            if (m) return m[0];
        }
        for (const f of fields) {
            const m = String(f).match(/NJD\/\d{4}\/\d+/i);
            if (m) return m[0].toUpperCase();
        }
        return null;
    }

    /**
     * Detect COD payment tx: WITHDRAW hoặc VIRTUAL_DEBIT có note "Thanh toán
     * công nợ qua COD đơn hàng" → eye icon → TPOS invoice (PBH), KHÔNG phải
     * ticket return. Trước đây đi qua getTicketCode → searchTicketsServer
     * không tìm thấy ticket → hiện "Không tìm thấy phiếu cho đơn".
     */
    function getOrderCodeForCodPayment(tx) {
        if (!tx) return null;
        const isCod =
            (tx.type === 'WITHDRAW' || tx.type === 'VIRTUAL_DEBIT') &&
            (tx.source === 'SALE_ORDER' ||
                tx.source === 'ORDER_PAYMENT' ||
                /Thanh toán công nợ.*đơn hàng/i.test(tx.note || ''));
        if (!isCod) return null;
        const fields = [tx.reference_id, tx.note];
        for (const f of fields) {
            if (!f) continue;
            const m = String(f).match(/NJD\/\d{4}\/\d+/i);
            if (m) return m[0].toUpperCase();
        }
        return null;
    }

    /**
     * Pick which eye icon (if any) to show for a transaction.
     * Priority: sepay > order (COD payment) > ticket. Skip if note already
     * contains [Ảnh GD:] (existing thumbnail).
     */
    function pickEvidence(tx) {
        const hasInlineImage = /\[Ảnh GD: https?:\/\//.test(String(tx?.note || ''));
        const sepay = !hasInlineImage ? getSepayImageUrl(tx) : null;
        if (sepay) return { kind: 'sepay', value: sepay };
        // COD payment → mở TPOS PBH (không phải ticket return)
        const orderCode = getOrderCodeForCodPayment(tx);
        if (orderCode) return { kind: 'order', value: orderCode };
        const ticket = getTicketCode(tx);
        if (ticket) return { kind: 'ticket', value: ticket };
        return null;
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Render HTML button for the evidence eye icon. Returns '' if no evidence.
     * extraClass: any layout class to merge.
     */
    function renderEyeButton(tx, extraClass = '') {
        const ev = pickEvidence(tx);
        if (!ev) return '';
        const title = ev.kind === 'sepay' ? 'Xem ảnh duyệt CK' : 'Xem chi tiết phiếu';
        const cls = `tx-eye-btn ${extraClass}`.trim();
        return `<button type="button" class="${cls}" data-eye-kind="${ev.kind}" data-eye-val="${escapeAttr(ev.value)}" title="${title}">
            <span class="material-symbols-outlined">visibility</span>
        </button>`;
    }

    function showSepayImage(imgUrl) {
        if (!imgUrl) return;
        injectStyle();
        let box = document.getElementById(LIGHTBOX_ID);
        if (box) box.remove();
        box = document.createElement('div');
        box.id = LIGHTBOX_ID;
        box.innerHTML = `<img src="${escapeAttr(imgUrl)}" data-cache-src="${escapeAttr(imgUrl)}" alt="Ảnh duyệt CK">`;
        box.addEventListener('click', () => box.remove());
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                box.remove();
                document.removeEventListener('keydown', onEsc);
            }
        });
        document.body.appendChild(box);
        window.ImageCache?.applyTo?.(box);
    }

    let ticketViewerLoading = null;
    async function ensureTicketViewer() {
        if (typeof window.showTicketHistoryViewer === 'function') return;
        if (ticketViewerLoading) return ticketViewerLoading;
        ticketViewerLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '../shared/js/ticket-history-viewer.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Không tải được ticket-history-viewer.js'));
            document.head.appendChild(s);
        });
        return ticketViewerLoading;
    }

    async function showTicketDetail(ticketCode) {
        if (!ticketCode) return;
        try {
            await ensureTicketViewer();
            if (typeof window.showTicketHistoryViewer === 'function') {
                window.showTicketHistoryViewer(ticketCode);
            } else {
                alert('Không mở được chi tiết phiếu');
            }
        } catch (e) {
            console.error('[TxEvidence] ticket detail failed:', e);
            alert(`Không mở được chi tiết phiếu: ${e.message}`);
        }
    }

    /**
     * Render danh sách TPOS invoice cho 1 NJD order code vào container.
     * Fetch fresh OData by Reference.
     */
    async function _renderTposInvoices(orderCode, container) {
        if (!container) return;
        container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">Đang tải dữ liệu TPOS…</div>`;
        try {
            if (!window.tokenManager?.getAuthHeader) {
                throw new Error('Token manager chưa sẵn sàng');
            }
            const tposOData =
                window.API_CONFIG?.TPOS_ODATA ||
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
            const headers = await window.tokenManager.getAuthHeader();
            const filter = `(Type eq 'invoice' and Reference eq '${String(orderCode).replace(/'/g, "''")}')`;
            const url =
                `${tposOData}/FastSaleOrder/ODataService.GetView` +
                `?$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filter)}`;
            const resp = await fetch(url, {
                headers: { ...headers, accept: 'application/json' },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            const invoices = Array.isArray(result?.value) ? result.value : [];
            if (invoices.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;">Không có phiếu bán hàng (PBH) cho đơn ${escapeAttr(orderCode)}</div>`;
                return;
            }
            const fmt = (v) => new Intl.NumberFormat('vi-VN').format(parseFloat(v) || 0) + 'đ';
            const fmtDate = (d) => {
                if (!d) return '';
                const x = new Date(d);
                return isNaN(x.getTime()) ? '' : x.toLocaleString('vi-VN');
            };
            const stateBadge = (inv) => {
                const s = inv.ShowState || inv.State || '';
                const isCancel =
                    inv.State === 'cancel' || inv.IsMergeCancel || /Hu[ỷy] b[ỏo]/i.test(s);
                const bg = isCancel ? '#fee2e2' : '#dbeafe';
                const fg = isCancel ? '#dc2626' : '#2563eb';
                return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeAttr(s)}</span>`;
            };
            container.innerHTML = invoices
                .map(
                    (inv) => `
                <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <strong style="font-size:14px;color:#1e293b;">${escapeAttr(inv.Number || '?')}</strong>
                        ${stateBadge(inv)}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
                        <div><span style="color:#64748b;">Ngày:</span> ${fmtDate(inv.DateInvoice)}</div>
                        <div><span style="color:#64748b;">Khách:</span> ${escapeAttr(inv.PartnerDisplayName || '')}</div>
                        <div><span style="color:#64748b;">Tổng tiền:</span> <strong>${fmt(inv.AmountTotal)}</strong></div>
                        <div><span style="color:#64748b;">COD:</span> ${fmt(inv.CashOnDelivery)}</div>
                        <div><span style="color:#64748b;">Đã thanh toán:</span> ${fmt(inv.PaymentAmount)}</div>
                        <div><span style="color:#64748b;">Vận chuyển:</span> ${escapeAttr(inv.CarrierName || inv.Carrier?.Name || '')}</div>
                        ${inv.TrackingRef ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">Mã VĐ:</span> <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;">${escapeAttr(inv.TrackingRef)}</code></div>` : ''}
                    </div>
                </div>
            `
                )
                .join('');
        } catch (e) {
            console.error('[TxEvidence] order invoice fetch failed:', e);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;">Lỗi tải phiếu: ${escapeAttr(e.message)}</div>`;
        }
    }

    /**
     * Render Phiếu Hoàn (ticket) cho 1 NJD order code vào container.
     */
    async function _renderReturnTickets(orderCode, container) {
        if (!container) return;
        container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">Đang tải phiếu hoàn…</div>`;
        try {
            const api = window.ApiService || window.apiService;
            if (!api || typeof api.searchTicketsServer !== 'function') {
                throw new Error('ApiService.searchTicketsServer không khả dụng');
            }
            const results = await api.searchTicketsServer(orderCode);
            if (!Array.isArray(results) || results.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;">Không có phiếu hoàn cho đơn ${escapeAttr(orderCode)}</div>`;
                return;
            }
            container.innerHTML = results
                .map((t) => {
                    const code = t.ticket_code || t.code || '';
                    const status = t.status || '';
                    const isCancelled = status === 'CANCELLED';
                    const bg = isCancelled ? '#fee2e2' : '#dcfce7';
                    const fg = isCancelled ? '#dc2626' : '#16a34a';
                    const date = t.created_at ? new Date(t.created_at).toLocaleString('vi-VN') : '';
                    return `
                    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;" onclick="window.TxEvidence.showTicketDetail('${escapeAttr(code)}')">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <strong style="font-size:14px;color:#1e293b;">${escapeAttr(code)}</strong>
                            <span style="background:${bg};color:${fg};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeAttr(status)}</span>
                        </div>
                        <div style="font-size:12px;color:#64748b;">
                            ${escapeAttr(t.type || '')} · ${date}${t.refund_amount ? ' · Hoàn: ' + new Intl.NumberFormat('vi-VN').format(t.refund_amount) + 'đ' : ''}
                        </div>
                        ${t.internal_note ? `<div style="font-size:12px;color:#475569;margin-top:4px;">${escapeAttr(t.internal_note)}</div>` : ''}
                    </div>
                `;
                })
                .join('');
        } catch (e) {
            console.error('[TxEvidence] return tickets fetch failed:', e);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;">Lỗi tải phiếu hoàn: ${escapeAttr(e.message)}</div>`;
        }
    }

    /**
     * Modal 2-tab: TPOS PBH + Phiếu Hoàn cho 1 NJD order code.
     * defaultTab='pbh' (COD payment) hoặc 'ticket' (ticket-related tx).
     */
    function showOrderTabbedModal(orderCode, defaultTab = 'pbh') {
        if (!orderCode) return;
        injectStyle();
        const modalId = 'tx-order-modal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:24px;cursor:pointer;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:85vh;display:flex;flex-direction:column;cursor:default;box-shadow:0 20px 60px rgba(0,0,0,0.3);" onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <h3 style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">Đơn ${escapeAttr(orderCode)}</h3>
                    <button data-close style="background:none;border:0;font-size:24px;color:#64748b;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>
                </div>
                <div style="display:flex;border-bottom:1px solid #e2e8f0;">
                    <button data-tab="pbh" class="tx-tab" style="flex:1;padding:10px;background:none;border:0;border-bottom:2px solid transparent;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;">📄 TPOS PBH</button>
                    <button data-tab="ticket" class="tx-tab" style="flex:1;padding:10px;background:none;border:0;border-bottom:2px solid transparent;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;">↩ Phiếu Hoàn</button>
                </div>
                <div data-content style="padding:16px 20px;overflow:auto;flex:1;font-size:13px;color:#334155;"></div>
            </div>
        `;
        modal.addEventListener('click', () => modal.remove());
        modal.querySelector('[data-close]').addEventListener('click', (e) => {
            e.stopPropagation();
            modal.remove();
        });
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', onEsc);
            }
        });
        document.body.appendChild(modal);

        const content = modal.querySelector('[data-content]');
        const tabs = modal.querySelectorAll('.tx-tab');
        const activate = (which) => {
            tabs.forEach((t) => {
                const isActive = t.dataset.tab === which;
                t.style.borderBottomColor = isActive ? '#2563eb' : 'transparent';
                t.style.color = isActive ? '#2563eb' : '#64748b';
            });
            if (which === 'pbh') _renderTposInvoices(orderCode, content);
            else _renderReturnTickets(orderCode, content);
        };
        tabs.forEach((t) =>
            t.addEventListener('click', (e) => {
                e.stopPropagation();
                activate(t.dataset.tab);
            })
        );
        activate(defaultTab);
    }

    // Backward-compat alias
    function showOrderInvoice(orderCode) {
        showOrderTabbedModal(orderCode, 'pbh');
    }

    /**
     * Bind click handlers on all .tx-eye-btn inside a given root.
     * Safe to call multiple times; uses data attr flag to avoid double-binding.
     */
    function bindHandlers(root) {
        if (!root) return;
        const buttons = root.querySelectorAll('.tx-eye-btn:not([data-eye-bound])');
        buttons.forEach((btn) => {
            btn.setAttribute('data-eye-bound', '1');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const kind = btn.getAttribute('data-eye-kind');
                const val = btn.getAttribute('data-eye-val');
                if (kind === 'sepay') showSepayImage(val);
                else if (kind === 'order') showOrderTabbedModal(val, 'pbh');
                else if (kind === 'ticket') {
                    // TV-YYYY-NNNNN: ticket trực tiếp. NJD/YYYY/NNNNN: modal 2 tab (PBH + Hoàn).
                    if (/^TV-\d{4}-\d+$/i.test(val)) showTicketDetail(val);
                    else showOrderTabbedModal(val, 'ticket');
                }
            });
        });
    }

    // Inject styles eagerly so the button looks right on first paint.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
    } else {
        injectStyle();
    }

    window.TxEvidence = {
        getSepayImageUrl,
        getTicketCode,
        getOrderCodeForCodPayment,
        pickEvidence,
        renderEyeButton,
        showSepayImage,
        showTicketDetail,
        showOrderInvoice,
        showOrderTabbedModal,
        bindHandlers,
    };
})();
