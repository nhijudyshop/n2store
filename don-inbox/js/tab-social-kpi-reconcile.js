// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders (Đơn Inbox) — KPI Reconcile Engine
 *
 * Tính KPI cho page Đơn Inbox theo đúng nghiệp vụ:
 *   - Gate: đơn `status==='order'` VÀ có phiếu bán hàng TPOS ĐÃ CHỐT (ShowState ∈
 *     {Đã xác nhận, Đã thanh toán, Hoàn thành}) và KHÔNG bị hủy.
 *   - KPI gross = Σ (Quantity mỗi line item trên phiếu TPOS) × 5.000đ.
 *   - Đối soát: lấy Excel món trả 3 tháng từ TPOS → loại KPI của đúng món bị trả
 *     (per-MÓN, trừ theo SL = min(SL hoàn, SL phiếu) × 5.000đ). KPI net = gross − loss.
 *
 * Mirror engine "Đối soát KPI" của orders-report (xem docs/orders-report/DOI-SOAT-KPI.md)
 * nhưng nguồn MÓN = OrderLines của phiếu TPOS (không phải audit-log/BASE).
 *
 * CHỈ ĐỌC TPOS + tính trong bộ nhớ — KHÔNG ghi DB (tuân MEMORY feedback_api_scope).
 * Module ISOLATED của don-inbox (không sửa tab-kpi-commission.js). 3 helper refund được
 * port từ tab-kpi-commission.js (format excel ổn định) — future: gom về shared.
 */

(function () {
    'use strict';

    // ===== HẰNG SỐ & CONFIG =====
    const KPI_PER_UNIT = 5000; // 5.000đ / món NET (đồng bộ KPI_PER_UNIT_INBOX của tab-social-core)
    const CHOT_STATES = new Set(['Đã xác nhận', 'Đã thanh toán', 'Hoàn thành']); // "đã chốt"
    const BULK_BATCH = 200; // API GetListOrderIds limit 200 đơn / request
    const REFUND_MONTHS = 3; // refund quét cố định 3 tháng (giống orders-report)

    const WORKER = () =>
        window.API_CONFIG?.WORKER_URL ||
        window.parent?.API_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    // ===== STATE =====
    const state = {
        running: false,
        lastResult: null, // { totalGross, totalLoss, totalNet, orderCount, refundCount, bySeller:Map, refundFailed, ranAt }
        byOrder: new Map(), // orderId → { grossKpi, refundedKpiAmount, netKpi, refundedProducts[], sellerName, invoiceNumber }
    };

    // ===== TIỆN ÍCH =====
    function formatVnd(n) {
        if (typeof window.formatVndInbox === 'function') return window.formatVndInbox(n);
        return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';
    }

    function notify(msg, type) {
        if (window.notificationManager?.show) return window.notificationManager.show(msg, type);
        if (typeof window.showNotification === 'function') return window.showNotification(msg, type);
        console.log('[SOCIAL-KPI]', type || 'info', msg);
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getInboxDateRange() {
        const key = typeof currentDateFilter !== 'undefined' ? currentDateFilter : 'all';
        return typeof getDateRange === 'function' ? getDateRange(key) : { from: null, to: null };
    }

    // ===== GATE: đơn có đủ điều kiện tính KPI không =====
    // Mirror _isInvoiceCancelled (tab1) — phiếu hủy bằng bất kỳ tín hiệu nào.
    function isInvoiceCancelled(inv) {
        if (!inv) return true;
        return (
            inv.State === 'cancel' ||
            inv.StateCode === 'cancel' ||
            inv.IsMergeCancel === true ||
            inv.ShowState === 'Huỷ bỏ' ||
            inv.ShowState === 'Hủy bỏ'
        );
    }

    /**
     * Trả phiếu hợp lệ (đã chốt, chưa hủy) của đơn — hoặc null nếu không đủ điều kiện.
     * Điều kiện: status==='order' AND phiếu mới nhất chưa hủy AND ShowState ∈ CHOT_STATES.
     */
    function getQualifyingInvoice(order) {
        if (!order || order.status !== 'order') return null;
        const inv = window.InvoiceStatusStore?.get(order.id);
        if (!inv || isInvoiceCancelled(inv)) return null;
        if (!CHOT_STATES.has(inv.ShowState || '')) return null;
        return inv;
    }

    function qualify(order) {
        return !!getQualifyingInvoice(order);
    }

    // ===== GROSS QTY (preview nhanh, từ cache order_lines; fallback totalQuantity) =====
    function grossQtyFromCache(order, inv) {
        const invoice = inv || (order ? window.InvoiceStatusStore?.get(order.id) : null);
        const lines = invoice?.OrderLines;
        if (Array.isArray(lines) && lines.length) {
            const sum = lines.reduce(
                (s, l) => s + (Number(l.ProductUOMQty) || Number(l.Quantity) || 0),
                0
            );
            if (sum > 0) return sum;
        }
        return Number(order?.totalQuantity) || 0;
    }

    // Trích code SP từ 1 line phiếu (chuẩn hóa giống refund "Chi tiết" → trim+UPPERCASE).
    function extractLineCode(line) {
        const raw =
            line.ProductCode ||
            line.DefaultCode ||
            (line.ProductNameGet || '').match(/\[([^\]]+)\]/)?.[1] ||
            '';
        return String(raw).trim().toUpperCase();
    }
    function lineQty(line) {
        return Number(line.ProductUOMQty) || Number(line.Quantity) || 0;
    }

    // ===== TOKEN TPOS (reuse hạ tầng có sẵn trên trang inbox — KHÔNG hardcode creds) =====
    async function getAuthHeader() {
        if (window.tokenManager?.getAuthHeader) {
            return await window.tokenManager.getAuthHeader();
        }
        if (window.billTokenManager) {
            try {
                await window.billTokenManager.loadFromRender();
            } catch (_) {}
            if (window.billTokenManager.getAuthHeader) {
                return await window.billTokenManager.getAuthHeader();
            }
        }
        throw new Error('Token manager chưa sẵn sàng');
    }

    // ===== BULK FETCH OrderLines phiếu (có ProductCode + Quantity) =====
    // POST /api/odata/FastSaleOrder/ODataService.GetListOrderIds?$expand=OrderLines
    // body { ids: [FastSaleOrder Id...] } — ids = invoice.Id (tpos_id) từ InvoiceStatusStore.
    async function bulkFetchInvoiceLines(fsoIds) {
        const out = new Map(); // tpos_id → OrderLines[]
        if (!fsoIds || !fsoIds.length) return out;
        const headers = await getAuthHeader();
        const url = `${WORKER()}/api/odata/FastSaleOrder/ODataService.GetListOrderIds?$expand=OrderLines`;
        const batches = [];
        for (let i = 0; i < fsoIds.length; i += BULK_BATCH) {
            batches.push(fsoIds.slice(i, i + BULK_BATCH));
        }
        const results = await Promise.all(
            batches.map(async (ids) => {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        accept: 'application/json',
                    },
                    body: JSON.stringify({ ids }),
                });
                if (!resp.ok) throw new Error(`GetListOrderIds HTTP ${resp.status}`);
                const data = await resp.json();
                return data.value || [];
            })
        );
        for (const arr of results) {
            for (const fso of arr) {
                if (fso && fso.Id != null) out.set(fso.Id, fso.OrderLines || []);
            }
        }
        return out;
    }

    // ===== REFUND EXCEL (port từ tab-kpi-commission.js — DOI-SOAT-KPI §4) =====

    // Parse cột "Chi tiết": "<SL> x [<CODE>] <tên> ; ..." → [{code, qty}] (code trim+UPPERCASE).
    function parseRefundChiTiet(chiTiet) {
        const items = [];
        if (!chiTiet) return items;
        const re = /(\d+)\s*x\s*\[([^\]]+)\]/g;
        let m;
        while ((m = re.exec(String(chiTiet))) !== null) {
            const qty = parseInt(m[1], 10) || 0;
            const code = (m[2] || '').trim().toUpperCase();
            if (code && qty > 0) items.push({ code, qty });
        }
        return items;
    }

    /**
     * Fetch + parse refund excel CHI TIẾT 3 tháng gần nhất từ TPOS.
     * @returns {{ refundByInvoice: Map<string, Map<string, number>>, codes: Set, totalRows:number }}
     *   refundByInvoice: số phiếu gốc ("Tham chiếu") → (productCode → tổng SL hoàn)
     */
    async function fetchRefundDetailByInvoice(monthsBack = REFUND_MONTHS) {
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const headers = await getAuthHeader();
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);
        // − 7h để khớp múi giờ VN (UTC+7), giống orders-report
        const startISO = new Date(startDate.setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000).toISOString();
        const endISO = new Date(
            endDate.setHours(23, 59, 59, 999) - 7 * 60 * 60 * 1000
        ).toISOString();
        const filter = {
            Filter: {
                logic: 'and',
                filters: [
                    { field: 'Type', operator: 'eq', value: 'refund' },
                    { field: 'DateInvoice', operator: 'gte', value: startISO },
                    { field: 'DateInvoice', operator: 'lte', value: endISO },
                    { field: 'IsMergeCancel', operator: 'neq', value: true },
                ],
            },
        };
        const res = await fetch(`${WORKER()}/api/FastSaleOrder/ExportFileDetail?TagIds=&type=refund`, {
            method: 'POST',
            headers: { ...headers, Accept: '*/*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: JSON.stringify(filter), ids: [] }),
        });
        if (!res.ok) throw new Error(`ExportFileDetail HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // range:2 = bỏ 2 dòng tiêu đề, header thật ở dòng 3 (cột "Tham chiếu" + "Chi tiết")
        const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const refundByInvoice = new Map();
        const codes = new Set();
        for (const row of rows) {
            const ref = String(row['Tham chiếu'] || '').trim();
            if (!ref) continue;
            codes.add(ref);
            const items = parseRefundChiTiet(row['Chi tiết']);
            if (items.length === 0) continue;
            let codeMap = refundByInvoice.get(ref);
            if (!codeMap) {
                codeMap = new Map();
                refundByInvoice.set(ref, codeMap);
            }
            for (const it of items) {
                codeMap.set(it.code, (codeMap.get(it.code) || 0) + it.qty);
            }
        }
        console.log(
            `[SOCIAL-KPI] Refund detail ${monthsBack} tháng: ${rows.length} dòng, ` +
                `${codes.size} phiếu unique, ${refundByInvoice.size} phiếu có chi tiết món`
        );
        return { refundByInvoice, codes, totalRows: rows.length };
    }

    /**
     * So khớp món hoàn với món tính KPI của 1 đơn (per-MÓN). Chỉ món có code khớp mới bị loại,
     * trừ theo SL = min(SL hoàn, SL phiếu) × KPI_PER_UNIT.
     * @param {string} invNumber số phiếu (invoice.Number) = join key với "Tham chiếu"
     * @param {object} details { [i]: { code, name, net } } — món trên phiếu (net = Quantity)
     * @param {Map<string, Map<string, number>>} refundByInvoice
     */
    function matchRefundForOrder(invNumber, details, refundByInvoice) {
        const refundItems = invNumber ? refundByInvoice?.get(invNumber) : null;
        const out = { refundedKpiAmount: 0, refundedProducts: [], hasRefundRow: !!refundItems };
        if (!refundItems || !details) return out;
        for (const d of Object.values(details)) {
            const net = d?.net || 0;
            if (net <= 0) continue;
            const code = (d.code || '').trim().toUpperCase();
            if (!code) continue;
            const refQty = refundItems.get(code) || 0;
            if (refQty <= 0) continue;
            const lostQty = Math.min(refQty, net);
            out.refundedKpiAmount += lostQty * KPI_PER_UNIT;
            out.refundedProducts.push({ code: d.code, name: d.name || '', qty: lostQty });
        }
        return out;
    }

    // ===== ORCHESTRATOR: Chạy đối soát KPI =====
    async function run() {
        if (state.running) return;
        state.running = true;
        const btn = document.getElementById('btnSocialKpiReconcile');
        const setBtn = (txt, disabled) => {
            if (btn) {
                btn.disabled = disabled;
                btn.innerHTML = txt;
            }
        };
        setBtn('<i class="fas fa-spinner fa-spin"></i> Đang đối soát...', true);
        try {
            // 1) Gom đơn đủ điều kiện trong khoảng ngày của bộ lọc inbox
            const all = window.SocialOrderState?.orders || [];
            const range = getInboxDateRange();
            const qualifying = [];
            for (const o of all) {
                const inv = getQualifyingInvoice(o);
                if (!inv) continue;
                if (range.from || range.to) {
                    const ts = new Date(o.createdAt);
                    if (range.from && ts < range.from) continue;
                    if (range.to && ts > range.to) continue;
                }
                qualifying.push({ order: o, inv });
            }
            if (!qualifying.length) {
                state.lastResult = null;
                state.byOrder.clear();
                renderSellerBreakdown();
                if (typeof window.updateInboxKpiStatCard === 'function')
                    window.updateInboxKpiStatCard();
                notify(
                    'Không có đơn nào đủ điều kiện (Đơn hàng + phiếu đã chốt) để đối soát',
                    'warning'
                );
                return;
            }

            // 2) Fetch song song: (a) OrderLines phiếu (có code), (b) refund excel 3 tháng
            const fsoIds = [...new Set(qualifying.map((q) => q.inv.Id).filter((v) => v != null))];
            const [linesMap, refund] = await Promise.all([
                bulkFetchInvoiceLines(fsoIds).catch((e) => {
                    console.error('[SOCIAL-KPI] bulk OrderLines fail:', e);
                    return new Map();
                }),
                fetchRefundDetailByInvoice(REFUND_MONTHS).catch((e) => {
                    console.error('[SOCIAL-KPI] refund fetch fail:', e);
                    return null;
                }),
            ]);
            const refundByInvoice = refund?.refundByInvoice || new Map();
            const refundFailed = !refund;

            // 3) Tính per-order + gộp theo nhân viên
            state.byOrder.clear();
            const bySeller = new Map();
            let totalGross = 0,
                totalLoss = 0,
                totalNet = 0,
                refundCount = 0;
            for (const { order, inv } of qualifying) {
                let lines = linesMap.get(inv.Id);
                if (!Array.isArray(lines) || !lines.length) lines = inv.OrderLines || []; // fallback cache
                const details = {};
                let grossQty = 0;
                lines.forEach((l, i) => {
                    const q = lineQty(l);
                    if (q <= 0) return;
                    grossQty += q;
                    details[i] = {
                        code: extractLineCode(l),
                        name: l.ProductName || l.ProductNameGet || '',
                        net: q,
                    };
                });
                if (grossQty <= 0) grossQty = grossQtyFromCache(order, inv); // last fallback
                const grossKpi = grossQty * KPI_PER_UNIT;
                const m = matchRefundForOrder(inv.Number, details, refundByInvoice);
                const refundedKpiAmount = m.refundedKpiAmount;
                const netKpi = Math.max(0, grossKpi - refundedKpiAmount);
                if (refundedKpiAmount > 0) refundCount++;
                totalGross += grossKpi;
                totalLoss += refundedKpiAmount;
                totalNet += netKpi;

                const sellerName = inv.UserName || 'Chưa rõ NV';
                state.byOrder.set(order.id, {
                    grossKpi,
                    refundedKpiAmount,
                    netKpi,
                    refundedProducts: m.refundedProducts,
                    sellerName,
                    invoiceNumber: inv.Number,
                });
                const s = bySeller.get(sellerName) || {
                    sellerName,
                    gross: 0,
                    loss: 0,
                    net: 0,
                    orders: 0,
                    refundOrders: 0,
                };
                s.gross += grossKpi;
                s.loss += refundedKpiAmount;
                s.net += netKpi;
                s.orders++;
                if (refundedKpiAmount > 0) s.refundOrders++;
                bySeller.set(sellerName, s);
            }

            state.lastResult = {
                totalGross,
                totalLoss,
                totalNet,
                orderCount: qualifying.length,
                refundCount,
                bySeller,
                refundFailed,
                ranAt: Date.now(),
            };

            // 4) Render: breakdown NV + thẻ tổng + bảng (đánh dấu từng dòng)
            renderSellerBreakdown();
            if (typeof window.updateInboxKpiStatCard === 'function') window.updateInboxKpiStatCard();
            if (typeof window.performTableSearch === 'function') window.performTableSearch();
            else if (typeof window.renderTable === 'function') window.renderTable();

            let msg = `Đối soát xong ${qualifying.length} đơn (hoàn: ${refundCount}, loại ${formatVnd(totalLoss)})`;
            if (refundFailed) {
                msg += ' — ⚠ không tải được refund, KPI chưa trừ hàng trả';
                notify(msg, 'warning');
            } else {
                notify(msg, 'success');
            }
        } catch (e) {
            console.error('[SOCIAL-KPI] run failed:', e);
            notify('Đối soát KPI thất bại: ' + e.message, 'error');
        } finally {
            state.running = false;
            setBtn('<i class="fas fa-balance-scale"></i> Chạy đối soát KPI', false);
        }
    }

    // ===== RENDER: breakdown KPI theo nhân viên =====
    function renderSellerBreakdown() {
        const box = document.getElementById('socialKpiSellerBreakdown');
        if (!box) return;
        const r = state.lastResult;
        if (!r || !r.bySeller || r.bySeller.size === 0) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        const sellers = [...r.bySeller.values()].sort((a, b) => b.net - a.net);
        const maxNet = sellers[0]?.net || 1;

        const rowsHtml = sellers
            .map((s) => {
                const pct = maxNet > 0 ? Math.round((s.net / maxNet) * 100) : 0;
                const lossHtml =
                    s.loss > 0
                        ? `<span style="color:#dc2626;font-size:11px;">−${escHtml(formatVnd(s.loss))}</span>`
                        : `<span style="color:#9ca3af;font-size:11px;">—</span>`;
                return `
                <tr>
                    <td style="padding:6px 8px;font-weight:600;color:#111827;">${escHtml(s.sellerName)}</td>
                    <td style="padding:6px 8px;text-align:right;color:#6b7280;font-size:12px;">${escHtml(formatVnd(s.gross))}</td>
                    <td style="padding:6px 8px;text-align:right;">${lossHtml}</td>
                    <td style="padding:6px 8px;text-align:right;font-weight:700;color:#059669;">${escHtml(formatVnd(s.net))}</td>
                    <td style="padding:6px 8px;text-align:center;font-size:11px;color:#6b7280;">${s.orders} đơn${s.refundOrders ? ` · ${s.refundOrders} hoàn` : ''}</td>
                    <td style="padding:6px 8px;min-width:90px;">
                        <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:#10b981;"></div>
                        </div>
                    </td>
                </tr>`;
            })
            .join('');

        const ranAt = new Date(r.ranAt).toLocaleTimeString('vi-VN');
        const warn = r.refundFailed
            ? `<div style="color:#b45309;font-size:12px;margin-top:4px;">⚠ Không tải được refund — KPI chưa trừ hàng trả.</div>`
            : '';
        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-weight:700;color:#111827;font-size:14px;">
                    <i class="fas fa-trophy" style="color:#f59e0b;"></i>
                    KPI theo nhân viên (sau đối soát)
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:12px;color:#6b7280;">
                        ${r.orderCount} đơn · gross ${escHtml(formatVnd(r.totalGross))} − hoàn ${escHtml(formatVnd(r.totalLoss))} =
                        <strong style="color:#059669;">net ${escHtml(formatVnd(r.totalNet))}</strong>
                        · lúc ${ranAt}
                    </span>
                    <button onclick="document.getElementById('socialKpiSellerBreakdown').style.display='none';"
                        style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;" title="Đóng">×</button>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;">
                        <th style="padding:4px 8px;text-align:left;">Nhân viên</th>
                        <th style="padding:4px 8px;text-align:right;">Gross</th>
                        <th style="padding:4px 8px;text-align:right;">Hoàn</th>
                        <th style="padding:4px 8px;text-align:right;">KPI net</th>
                        <th style="padding:4px 8px;text-align:center;">Đơn</th>
                        <th style="padding:4px 8px;text-align:left;">&nbsp;</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            ${warn}`;
        box.style.display = 'block';
    }

    // ===== Ô cột "KPI" cho từng dòng đơn =====
    function getOrderKpiCell(order) {
        if (!order) return '<span style="color:#9ca3af;">—</span>';
        const inv = getQualifyingInvoice(order);
        if (!inv) return '<span style="color:#9ca3af;" title="Chưa đủ điều kiện tính KPI (cần Đơn hàng + phiếu đã chốt, chưa hủy)">—</span>';

        const rec = state.byOrder.get(order.id);
        if (rec) {
            // Đã đối soát: hiển thị net (xanh) + badge loss (đỏ) nếu có món bị hoàn
            let html = `<span style="color:#059669;font-weight:700;font-size:12px;" title="KPI net — đã trừ hàng trả">${escHtml(formatVnd(rec.netKpi))}</span>`;
            if (rec.refundedKpiAmount > 0) {
                const tip = rec.refundedProducts.map((p) => `${p.qty} x [${p.code}]`).join(', ');
                html += `<br><span style="color:#dc2626;font-size:10px;" title="Món hoàn: ${escHtml(tip)}">−${escHtml(formatVnd(rec.refundedKpiAmount))} ↩</span>`;
            }
            return html;
        }
        // Chưa đối soát: gross preview từ cache
        const gq = grossQtyFromCache(order, inv);
        const g = gq * KPI_PER_UNIT;
        return `<span style="color:#059669;font-weight:600;font-size:12px;" title="Gross ${gq} món × 5.000đ (chưa đối soát — bấm 'Chạy đối soát KPI' để trừ hàng trả)">${escHtml(formatVnd(g))}</span>`;
    }

    // ===== EXPORT =====
    window.SocialKpiReconcile = {
        run,
        qualify,
        getQualifyingInvoice,
        grossQtyFromCache,
        getOrderKpiCell,
        renderSellerBreakdown,
        isInvoiceCancelled,
        KPI_PER_UNIT,
        CHOT_STATES,
        get lastResult() {
            return state.lastResult;
        },
        get byOrder() {
            return state.byOrder;
        },
    };
    // Gate dùng chung cho thẻ KPI tổng + cột KPI + đối soát (1 nguồn sự thật)
    window.socialKpiQualify = qualify;
})();
