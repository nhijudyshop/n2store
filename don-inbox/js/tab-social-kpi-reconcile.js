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
    const REFUND_MONTHS = 3; // refund quét cố định 3 tháng (giống orders-report)

    const WORKER = () =>
        window.API_CONFIG?.WORKER_URL ||
        window.parent?.API_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    // ===== STATE =====
    const state = {
        running: false,
        lastResult: null, // { totalGross, totalLoss, totalNet, totalMonKpi, totalMonRefund, orderCount, refundCount, bySeller:Map, refundFailed, ranAt }
        byOrder: new Map(), // orderId → { grossKpi, refundedKpiAmount, netKpi, monKpi, refundedProducts[], refundedMon, sellerName, invoiceNumber, stt, customerName }
        lastRefundFile: null, // { buffer: ArrayBuffer, filename } — file refund excel gốc TPOS để tải về kiểm tra chéo
        rangeOrders: null, // [orders] phủ ĐỦ khoảng ngày đang chọn (tách khỏi bảng — bảng vẫn 500 cho nhẹ)
        rangeKey: null, // key của khoảng đã load (from_to)
        rangeLoading: false, // đang phân trang load full range
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

    // ===== LOAD ĐỦ KHOẢNG NGÀY (vượt cap 500 của bảng) =====
    // Bảng inbox chỉ load 500 đơn gần nhất (nhẹ). KPI/đối soát/modal cần ĐỦ đơn trong
    // khoảng ngày đã chọn → phân trang /load (limit 1000) tới khi phủ range.from.
    function _rangeKeyOf(range) {
        return (range?.from ? range.from.getTime() : '') + '_' + (range?.to ? range.to.getTime() : '');
    }

    function isRangeLoaded() {
        return state.rangeKey === _rangeKeyOf(getInboxDateRange()) && Array.isArray(state.rangeOrders);
    }

    // Tập đơn dùng cho KPI: ưu tiên rangeOrders (đủ khoảng) — fallback bảng (500).
    function kpiOrderSet() {
        if (isRangeLoaded()) return state.rangeOrders;
        return window.SocialOrderState?.orders || [];
    }

    async function ensureRangeLoaded(force) {
        const range = getInboxDateRange();
        const key = _rangeKeyOf(range);
        if (!force && state.rangeKey === key && Array.isArray(state.rangeOrders)) return state.rangeOrders;
        const from = range.from ? range.from.getTime() : 0; // 'all' → 0 → load hết
        state.rangeLoading = true;
        try {
            const byId = new Map();
            let page = 1,
                more = true;
            while (more && page <= 12) {
                const resp = await fetch(`${WORKER()}/api/social-orders/load?limit=1000&page=${page}`);
                if (!resp.ok) throw new Error(`social-orders/load HTTP ${resp.status}`);
                const d = await resp.json();
                const os = d.orders || [];
                for (const o of os) byId.set(String(o.id), o);
                more = d.hasMore;
                if (!os.length) break;
                const minTs = os.reduce((m, o) => Math.min(m, Number(o.createdAt) || Infinity), Infinity);
                if (from && minTs <= from) break; // đã chạm mốc đầu khoảng → đủ
                page++;
            }
            state.rangeOrders = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            state.rangeKey = key;
            console.log(
                `[SOCIAL-KPI] Range load: ${state.rangeOrders.length} đơn cho khoảng ${range.from ? new Date(range.from).toLocaleDateString('vi-VN') : 'tất cả'}–${range.to ? new Date(range.to).toLocaleDateString('vi-VN') : 'nay'} (${page} trang)`
            );
            return state.rangeOrders;
        } finally {
            state.rangeLoading = false;
        }
    }

    // Lọc đơn trong khoảng ngày (theo createdAt) — dùng chung run() + modal.
    function _inRange(order, range) {
        if (!range || (!range.from && !range.to)) return true;
        const ts = new Date(order.createdAt);
        if (range.from && ts < range.from) return false;
        if (range.to && ts > range.to) return false;
        return true;
    }

    // ===== LÀM MỚI TRẠNG THÁI PHIẾU TỪ TPOS (bước 0 của đối soát) =====
    // Refresh trạng thái phiếu mới nhất cho TOÀN BỘ đơn 'Đơn hàng' trong khoảng, rồi reload
    // InvoiceStatusStore → đối soát chạy trên trạng thái phiếu mới nhất. Chia 10 lệnh song song.
    async function refreshInvoicesFromTPOS(orders, range, setBtn) {
        const ids = orders
            .filter((o) => o.status === 'order' && _inRange(o, range))
            .map((o) => String(o.id));
        if (!ids.length) return 0;
        if (setBtn) setBtn(`<i class="fas fa-spinner fa-spin"></i> Làm mới phiếu TPOS (${ids.length})...`, true);
        const GROUPS = 10;
        const groups = Array.from({ length: GROUPS }, () => []);
        ids.forEach((id, i) => groups[i % GROUPS].push(id));
        let updated = 0;
        await Promise.all(
            groups
                .filter((g) => g.length)
                .map(async (g) => {
                    try {
                        const resp = await fetch(`${WORKER()}/api/invoice-status/refresh-from-tpos`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ saleOnlineIds: g }),
                        });
                        if (resp.ok) {
                            const d = await resp.json();
                            updated += d.updated || 0;
                        }
                    } catch (e) {
                        console.warn('[SOCIAL-KPI] refresh phiếu group fail:', e.message);
                    }
                })
        );
        // Reload store để các bước sau đọc trạng thái phiếu mới nhất
        try {
            if (window.InvoiceStatusStore?.reload) await window.InvoiceStatusStore.reload();
        } catch (e) {
            console.warn('[SOCIAL-KPI] InvoiceStatusStore.reload fail:', e.message);
        }
        console.log(`[SOCIAL-KPI] Làm mới phiếu TPOS: ${updated} cập nhật / ${ids.length} đơn`);
        return updated;
    }

    // ===== STORE "ĐÃ KIỂM TRA" (Render + localStorage fallback) =====
    const VERIFY_LS_KEY = 'socialKpiVerify_v1';
    const verify = {
        current: new Map(), // orderId → { checked, verifiedBy, verifiedByName, verifiedAt }
        history: [], // [{ orderId, invoiceNumber, sellerName, customerName, action, verifiedBy, verifiedByName, verifiedAt }]
        loaded: false,
        backendDown: false, // true sau khi endpoint 404/lỗi → chỉ dùng localStorage, ngừng spam request
    };
    const _verifyApi = () => `${WORKER()}/api/social-kpi-verify`;

    function _currentUser() {
        const a = window.authManager?.getAuthState?.() || {};
        return {
            id: a.username || a.userType || 'unknown',
            name: a.displayName || a.username || a.userType || 'Ẩn danh',
        };
    }
    function _loadVerifyLocal() {
        try {
            const d = JSON.parse(localStorage.getItem(VERIFY_LS_KEY) || '{}');
            verify.history = Array.isArray(d.history) ? d.history : [];
            verify.current = new Map(Object.entries(d.current || {}));
        } catch (_) {}
    }
    function _saveVerifyLocal() {
        try {
            localStorage.setItem(
                VERIFY_LS_KEY,
                JSON.stringify({ history: verify.history.slice(0, 2000), current: Object.fromEntries(verify.current) })
            );
        } catch (_) {}
    }
    // Tính trạng thái hiện tại mỗi đơn = action MỚI NHẤT (verifiedAt lớn nhất).
    function _recomputeCurrent() {
        const m = new Map();
        const sorted = [...verify.history].sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0));
        for (const h of sorted) {
            if (m.has(h.orderId)) continue;
            m.set(h.orderId, {
                checked: h.action === 'check',
                verifiedBy: h.verifiedBy,
                verifiedByName: h.verifiedByName,
                verifiedAt: h.verifiedAt,
            });
        }
        verify.current = m;
    }
    async function _postMark(entry) {
        const resp = await fetch(`${_verifyApi()}/mark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        if (resp.status === 404) {
            verify.backendDown = true;
            return false;
        }
        return resp.ok;
    }
    // Đẩy các mark còn synced=false (đánh dấu lúc backend chưa deploy) lên Render → KHÔNG mất.
    async function _flushPending() {
        if (verify.backendDown) return 0;
        let n = 0;
        for (const h of verify.history) {
            if (h.synced !== false) continue;
            try {
                if (await _postMark(h)) {
                    h.synced = true;
                    n++;
                } else break; // backendDown
            } catch (e) {
                verify.backendDown = true;
                break;
            }
        }
        if (n) _saveVerifyLocal();
        return n;
    }
    async function loadVerifications() {
        _loadVerifyLocal(); // offline-first
        if (verify.backendDown) {
            verify.loaded = true;
            return verify; // backend chưa deploy → dùng localStorage, không gọi lại
        }
        try {
            const flushed = await _flushPending(); // sync mark local chưa đẩy lên Render TRƯỚC
            if (flushed) console.info(`[SOCIAL-KPI] Đã đồng bộ ${flushed} đánh dấu local → Render.`);
            const resp = await fetch(`${_verifyApi()}/load`);
            if (resp.ok) {
                const d = await resp.json();
                if (d.success) {
                    // Render = nguồn chính (synced=true); giữ thêm mark local còn chưa sync (nếu có).
                    const serverHist = (d.history || []).map((h) => ({ ...h, synced: true }));
                    const localUnsynced = verify.history.filter((h) => h.synced === false);
                    verify.history = [...localUnsynced, ...serverHist].sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0));
                    _recomputeCurrent();
                    _saveVerifyLocal();
                }
            } else if (resp.status === 404) {
                verify.backendDown = true;
                console.info('[SOCIAL-KPI] Backend kiểm-tra chưa deploy (404) → dùng localStorage tạm (sẽ tự sync khi deploy).');
            }
        } catch (e) {
            verify.backendDown = true;
            console.warn('[SOCIAL-KPI] verify load (dùng local):', e.message);
        }
        verify.loaded = true;
        return verify;
    }
    function isVerified(orderId) {
        return verify.current.get(String(orderId))?.checked === true;
    }
    async function markVerified(rec, checked) {
        const u = _currentUser();
        const entry = {
            orderId: String(rec.orderId),
            invoiceNumber: rec.invoiceNumber || '',
            sellerName: rec.sellerName || '',
            customerName: rec.customerName || '',
            action: checked ? 'check' : 'uncheck',
            verifiedBy: u.id,
            verifiedByName: u.name,
            verifiedAt: Date.now(),
            synced: false, // chưa lên Render
        };
        verify.current.set(entry.orderId, { checked, verifiedBy: u.id, verifiedByName: u.name, verifiedAt: entry.verifiedAt });
        verify.history.unshift(entry);
        _saveVerifyLocal();
        if (!verify.backendDown) {
            try {
                if (await _postMark(entry)) {
                    entry.synced = true; // đã lưu trên Render
                    _saveVerifyLocal();
                }
            } catch (e) {
                verify.backendDown = true;
                console.warn('[SOCIAL-KPI] verify mark (chỉ lưu local, sẽ sync khi deploy):', e.message);
            }
        }
        return entry;
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

    // Trích code SP từ 1 OrderLine phiếu (chuẩn hóa giống refund "Chi tiết" → trim+UPPERCASE).
    // ⚠ FastSaleOrderLine GỐC chỉ có ProductId — code nằm ở entity Product (cần $expand=Product).
    // Đọc Product.DefaultCode/Barcode trước, rồi tới ProductCode/DefaultCode flat, cuối là [CODE] trong NameGet.
    function extractLineCode(line) {
        const raw =
            line.Product?.DefaultCode ||
            line.Product?.Barcode ||
            line.ProductCode ||
            line.DefaultCode ||
            (line.ProductNameGet || line.Product?.NameGet || '').match(/\[([^\]]+)\]/)?.[1] ||
            '';
        return String(raw).trim().toUpperCase();
    }
    function lineQty(line) {
        return Number(line.ProductUOMQty) || Number(line.ProductQty) || Number(line.Quantity) || 0;
    }

    // Mã SP của 1 product trong social order (đơn inbox) — đã verify khớp refund "Chi tiết" 100%.
    function productCode(p) {
        return String(p.productCode || p.ProductCode || '').trim().toUpperCase();
    }

    /**
     * Nguồn MÓN để khớp refund của 1 đơn. Trả { details:{i:{code,name,net}}, grossQty, source }.
     * Ưu tiên OrderLines phiếu (nếu fetch được code qua $expand=Product). Nếu OrderLines KHÔNG
     * cho ra code nào (TPOS limit / fetch fail) → fallback products của ĐƠN (luôn có productCode).
     * → matchRefundForOrder LUÔN có code để khớp, không còn ra hoàn 0đ vì thiếu code.
     */
    function buildMatchDetails(order, invoiceLines) {
        const det = {};
        let i = 0, grossQty = 0, codeCount = 0;
        for (const l of invoiceLines || []) {
            const q = lineQty(l);
            if (q <= 0) continue;
            const code = extractLineCode(l);
            det[i++] = { code, name: l.ProductName || l.Product?.NameGet || l.ProductNameGet || '', net: q };
            grossQty += q;
            if (code) codeCount++;
        }
        // OrderLines phiếu không ra được code nào → dùng products của đơn (có code, đã verify).
        if (codeCount === 0) {
            const det2 = {};
            let j = 0, g2 = 0;
            for (const p of order.products || []) {
                const q = Number(p.quantity) || 0;
                if (q <= 0) continue;
                det2[j++] = { code: productCode(p), name: p.productName || p.productNameGet || '', net: q };
                g2 += q;
            }
            if (j > 0) return { details: det2, grossQty: g2, source: 'order-products' };
        }
        if (grossQty <= 0) return { details: det, grossQty: Number(order.totalQuantity) || 0, source: 'empty' };
        return { details: det, grossQty, source: 'invoice-lines' };
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

    // ⚠ ĐÃ BỎ bulkFetchInvoiceLines (GetListOrderIds): FastSaleOrderLine gốc chỉ có ProductId,
    //   nested $expand=OrderLines($expand=Product) bị TPOS từ chối (HTTP 400). Nguồn MÓN khớp
    //   refund dùng products của ĐƠN (luôn có productCode, verify khớp 100%) — buildMatchDetails.

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
        // Giữ buffer XLSX gốc để user tải về kiểm tra chéo (file y nguyên TPOS trả về).
        const todayName = new Date().toISOString().slice(0, 10);
        const filename = `mon-tra-tpos_${monthsBack}thang_${todayName}.xlsx`;
        return { refundByInvoice, codes, totalRows: rows.length, buffer: buf, filename, startISO, endISO };
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
        setBtn('<i class="fas fa-spinner fa-spin"></i> Đang tải đủ khoảng...', true);
        try {
            // 0) Load ĐỦ đơn trong khoảng ngày (vượt cap 500 của bảng) → đối soát phủ trọn khoảng
            let all;
            try {
                all = await ensureRangeLoaded(true);
            } catch (e) {
                console.error('[SOCIAL-KPI] ensureRangeLoaded fail, fallback bảng:', e);
                all = window.SocialOrderState?.orders || [];
            }
            const range = getInboxDateRange();

            // 0b) LÀM MỚI trạng thái phiếu từ TPOS cho toàn bộ đơn trong khoảng (chạy ĐẦU TIÊN,
            //     10 lệnh song song) rồi reload store → đối soát dùng trạng thái phiếu mới nhất.
            try {
                await refreshInvoicesFromTPOS(all, range, setBtn);
            } catch (e) {
                console.warn('[SOCIAL-KPI] refresh phiếu TPOS lỗi (tiếp tục):', e.message);
            }
            // 0c) Nạp trạng thái "đã kiểm tra" (để modal tô xanh + lịch sử)
            await loadVerifications().catch(() => {});

            setBtn('<i class="fas fa-spinner fa-spin"></i> Đang đối soát...', true);

            // 1) Gom đơn đủ điều kiện trong khoảng ngày của bộ lọc inbox
            const qualifying = [];
            for (const o of all) {
                const inv = getQualifyingInvoice(o);
                if (!inv) continue;
                if (!_inRange(o, range)) continue;
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

            // 2) Fetch refund excel 3 tháng. (Nguồn MÓN dùng products của đơn — luôn có
            //    productCode, đã verify khớp refund 100%. KHÔNG fetch OrderLines phiếu nữa vì
            //    GetListOrderIds không trả ProductCode mà nested $expand=Product lại bị 400.)
            const linesMap = new Map();
            const refund = await fetchRefundDetailByInvoice(REFUND_MONTHS).catch((e) => {
                console.error('[SOCIAL-KPI] refund fetch fail:', e);
                return null;
            });
            const refundByInvoice = refund?.refundByInvoice || new Map();
            const refundFailed = !refund;
            // Lưu file refund gốc để user tải về kiểm tra chéo (chỉ khi fetch thành công)
            if (refund?.buffer) {
                state.lastRefundFile = { buffer: refund.buffer, filename: refund.filename };
            }
            updateDownloadBtn();

            // 3) Tính per-order + gộp theo nhân viên (KPI tính theo TỔNG MÓN × 5.000đ)
            state.byOrder.clear();
            const bySeller = new Map();
            const srcCount = { 'invoice-lines': 0, 'order-products': 0, empty: 0 };
            let totalGross = 0,
                totalLoss = 0,
                totalNet = 0,
                totalMonKpi = 0, // tổng số MÓN tính KPI
                totalMonRefund = 0, // tổng số MÓN bị hoàn (loại KPI)
                refundCount = 0; // số ĐƠN có ≥1 món hoàn (chỉ để hiển thị, KHÔNG dùng tính tiền)
            for (const { order, inv } of qualifying) {
                const lines = linesMap.get(inv.Id) || inv.OrderLines || [];
                const built = buildMatchDetails(order, lines);
                srcCount[built.source] = (srcCount[built.source] || 0) + 1;
                const monKpi = built.grossQty; // số món tính KPI của đơn
                const grossKpi = monKpi * KPI_PER_UNIT;
                const m = matchRefundForOrder(inv.Number, built.details, refundByInvoice);
                const refundedKpiAmount = m.refundedKpiAmount;
                const refundedMon = m.refundedProducts.reduce((s, p) => s + (Number(p.qty) || 0), 0); // tổng món hoàn
                const netKpi = Math.max(0, grossKpi - refundedKpiAmount);
                if (refundedKpiAmount > 0) refundCount++;
                totalGross += grossKpi;
                totalLoss += refundedKpiAmount;
                totalNet += netKpi;
                totalMonKpi += monKpi;
                totalMonRefund += refundedMon;

                const sellerName = inv.UserName || 'Chưa rõ NV';
                state.byOrder.set(order.id, {
                    grossKpi,
                    refundedKpiAmount,
                    netKpi,
                    monKpi,
                    refundedMon,
                    refundedProducts: m.refundedProducts,
                    kpiProducts: Object.values(built.details).filter((d) => (d.net || 0) > 0), // [{code,name,net}] để expand món
                    sellerName,
                    invoiceNumber: inv.Number,
                    invoiceState: inv.ShowState || '',
                    stt: order.stt,
                    customerName: order.customerName || '',
                });
                const s = bySeller.get(sellerName) || {
                    sellerName,
                    gross: 0,
                    loss: 0,
                    net: 0,
                    orders: 0,
                    refundOrders: 0,
                    monKpi: 0,
                    monRefund: 0,
                };
                s.gross += grossKpi;
                s.loss += refundedKpiAmount;
                s.net += netKpi;
                s.orders++;
                s.monKpi += monKpi;
                s.monRefund += refundedMon;
                if (refundedKpiAmount > 0) s.refundOrders++;
                bySeller.set(sellerName, s);
            }
            console.log(
                `[SOCIAL-KPI] Nguồn món: invoice-lines=${srcCount['invoice-lines']}, ` +
                    `order-products=${srcCount['order-products']}, empty=${srcCount.empty} | ` +
                    `KPI: ${totalMonKpi} món gross − ${totalMonRefund} món hoàn = ${totalNet}đ (loại ${totalLoss}đ, ${refundCount} đơn có hoàn)`
            );

            state.lastResult = {
                totalGross,
                totalLoss,
                totalNet,
                totalMonKpi,
                totalMonRefund,
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
                        ? `<span style="color:#dc2626;font-size:11px;">−${escHtml(formatVnd(s.loss))} <span style="color:#9ca3af;">(${s.monRefund} món)</span></span>`
                        : `<span style="color:#9ca3af;font-size:11px;">—</span>`;
                return `
                <tr>
                    <td style="padding:6px 8px;font-weight:600;color:#111827;">${escHtml(s.sellerName)}</td>
                    <td style="padding:6px 8px;text-align:right;color:#6b7280;font-size:12px;">${escHtml(formatVnd(s.gross))} <span style="color:#9ca3af;">(${s.monKpi} món)</span></td>
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
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                <div style="font-weight:700;color:#111827;font-size:14px;">
                    <i class="fas fa-trophy" style="color:#f59e0b;"></i>
                    KPI theo nhân viên (sau đối soát)
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:12px;color:#6b7280;">
                        ${r.orderCount} đơn · gross ${escHtml(formatVnd(r.totalGross))} (${r.totalMonKpi} món) − hoàn ${escHtml(formatVnd(r.totalLoss))} (${r.totalMonRefund} món) =
                        <strong style="color:#059669;">net ${escHtml(formatVnd(r.totalNet))}</strong>
                        · lúc ${ranAt}
                    </span>
                    <button onclick="window.SocialKpiReconcile && window.SocialKpiReconcile.showDetailModal()"
                        style="background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca;cursor:pointer;font-size:12px;font-weight:600;padding:3px 9px;border-radius:6px;">
                        <i class="fas fa-list"></i> Xem chi tiết
                    </button>
                    <button onclick="document.getElementById('socialKpiSellerBreakdown').style.display='none';"
                        style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;" title="Đóng">×</button>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;">
                        <th style="padding:4px 8px;text-align:left;">Nhân viên</th>
                        <th style="padding:4px 8px;text-align:right;">Gross (món)</th>
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

    // ===== TẢI FILE REFUND GỐC (kiểm tra chéo) =====
    function updateDownloadBtn() {
        const btn = document.getElementById('btnSocialKpiDownloadRefund');
        if (!btn) return;
        btn.style.display = state.lastRefundFile?.buffer ? 'inline-flex' : 'none';
        if (state.lastRefundFile?.filename) {
            btn.title = `Tải file refund gốc TPOS để kiểm tra chéo (${state.lastRefundFile.filename})`;
        }
    }

    function downloadRefundExcel() {
        const f = state.lastRefundFile;
        if (!f || !f.buffer) {
            notify('Chưa có file refund — hãy bấm "Chạy đối soát KPI" trước', 'warning');
            return;
        }
        const blob = new Blob([f.buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.filename || 'mon-tra-tpos.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    // ===== MODAL CHI TIẾT (click thẻ "KPI khoảng đã chọn") =====
    function _ensureDetailModal() {
        let modal = document.getElementById('socialKpiDetailModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'socialKpiDetailModal';
        modal.style.cssText =
            'display:none;position:fixed;inset:0;z-index:10000;background:rgba(17,24,39,.55);' +
            'align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;';
        modal.innerHTML = `
            <div class="skpi-modal-content" style="background:#fff;border-radius:14px;max-width:1400px;width:98%;
                box-shadow:0 24px 70px rgba(0,0,0,.3);display:flex;flex-direction:column;max-height:94vh;">
                <div class="skpi-modal-head" style="padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;
                    align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"></div>
                <div class="skpi-modal-tabs" style="padding:0 20px;border-bottom:1px solid #e5e7eb;display:flex;gap:4px;"></div>
                <div class="skpi-modal-tools" style="padding:10px 20px;border-bottom:1px solid #f3f4f6;display:flex;
                    gap:10px;align-items:center;flex-wrap:wrap;"></div>
                <div class="skpi-modal-body" style="overflow:auto;padding:0;"></div>
            </div>`;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') modal.style.display = 'none';
        });
        document.body.appendChild(modal);
        return modal;
    }

    function _showStateBadge(s) {
        if (!s) return '<span style="color:#9ca3af;font-size:11px;">—</span>';
        const cfg = window.getShowStateConfig ? window.getShowStateConfig(s) : null;
        const bg = cfg?.bgColor || '#f3f4f6', col = cfg?.color || '#6b7280', bd = cfg?.borderColor || '#d1d5db';
        return `<span style="background:${bg};color:${col};border:1px solid ${bd};font-size:11px;padding:1px 7px;border-radius:4px;white-space:nowrap;">${escHtml(s)}</span>`;
    }

    // HTML chi tiết món của 1 đơn: món nào +KPI, món nào hoàn (không +).
    function _monDetailHtml(row) {
        const refMap = new Map((row.refunded || []).map((p) => [String(p.code || '').toUpperCase(), Number(p.qty) || 0]));
        const items =
            row.kpiProducts && row.kpiProducts.length
                ? row.kpiProducts
                : (row.products || []).map((p) => ({ code: p.productCode, name: p.productName, net: Number(p.quantity) || 0 }));
        if (!items.length)
            return `<div style="padding:8px 16px 8px 46px;color:#9ca3af;font-size:12px;">Chưa có chi tiết món — bấm "Chạy đối soát KPI" để lấy.</div>`;
        const lis = items
            .map((it) => {
                const qty = Number(it.net) || 0;
                const ref = refMap.get(String(it.code || '').toUpperCase()) || 0;
                const counted = Math.max(0, qty - ref);
                if (ref > 0) {
                    return `<li style="color:#dc2626;">[${escHtml(it.code)}] ${escHtml(it.name || '')} — SL ${qty}, hoàn ${ref} → <strong>KHÔNG +${escHtml(formatVnd(Math.min(ref, qty) * KPI_PER_UNIT))}</strong>${counted > 0 ? ` <span style="color:#059669;">(còn ${counted} → +${escHtml(formatVnd(counted * KPI_PER_UNIT))})</span>` : ''}</li>`;
                }
                return `<li style="color:#059669;">[${escHtml(it.code)}] ${escHtml(it.name || '')} — SL ${qty} → <strong>+${escHtml(formatVnd(qty * KPI_PER_UNIT))}</strong></li>`;
            })
            .join('');
        return `<div style="padding:8px 16px 10px 46px;background:#fafafa;font-size:12.5px;">
            <div style="color:#6b7280;margin-bottom:4px;">Chi tiết món phiếu <strong>${escHtml(row.number)}</strong> — KH ${escHtml(row.khach)}:</div>
            <ul style="margin:0;padding-left:18px;line-height:1.7;">${lis}</ul></div>`;
    }

    async function showDetailModal() {
        const modal = _ensureDetailModal();
        const headEl = modal.querySelector('.skpi-modal-head');
        const tabsEl = modal.querySelector('.skpi-modal-tabs');
        const toolsEl = modal.querySelector('.skpi-modal-tools');
        const bodyEl = modal.querySelector('.skpi-modal-body');
        modal.style.display = 'flex';
        headEl.innerHTML = `<div style="font-weight:700;font-size:16px;color:#111827;"><i class="fas fa-trophy" style="color:#f59e0b;"></i> Chi tiết KPI khoảng đã chọn</div>
            <button id="skpiModalClose" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:22px;line-height:1;">×</button>`;
        headEl.querySelector('#skpiModalClose').onclick = () => (modal.style.display = 'none');
        tabsEl.innerHTML = '';
        toolsEl.innerHTML = '';
        bodyEl.innerHTML = '<div style="padding:60px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang tải đủ đơn + trạng thái kiểm tra…</div>';

        let all;
        try {
            all = await ensureRangeLoaded();
        } catch (e) {
            all = window.SocialOrderState?.orders || [];
        }
        if (!verify.loaded) await loadVerifications().catch(() => {});
        const range = getInboxDateRange();
        const reconRan = state.byOrder.size > 0;

        // Build rows từ đơn đủ điều kiện trong khoảng
        const rows = [];
        for (const o of all) {
            const inv = getQualifyingInvoice(o);
            if (!inv || !_inRange(o, range)) continue;
            const rec = state.byOrder.get(o.id);
            const base = {
                oid: String(o.id), stt: o.stt, number: inv.Number, khach: o.customerName || '',
                stateStr: inv.ShowState || '', products: o.products || [],
            };
            if (rec) {
                rows.push({
                    ...base, seller: rec.sellerName, monKpi: rec.monKpi, gross: rec.grossKpi,
                    monRefund: rec.refundedMon, loss: rec.refundedKpiAmount, net: rec.netKpi,
                    refunded: rec.refundedProducts || [], kpiProducts: rec.kpiProducts || [],
                });
            } else {
                const gq = grossQtyFromCache(o, inv);
                rows.push({
                    ...base, seller: inv.UserName || 'Chưa rõ NV', monKpi: gq, gross: gq * KPI_PER_UNIT,
                    monRefund: 0, loss: 0, net: gq * KPI_PER_UNIT, refunded: [], kpiProducts: [],
                });
            }
        }
        rows.sort((a, b) => (a.seller || '').localeCompare(b.seller || '') || (a.stt || 0) - (b.stt || 0));
        const rowByOid = new Map(rows.map((r) => [r.oid, r]));

        const sellers = [...new Set(rows.map((r) => r.seller))].sort();
        let activeTab = 'detail';

        tabsEl.innerHTML = `
            <button data-tab="detail" class="skpi-tab" style="border:none;background:none;padding:10px 14px;cursor:pointer;font-weight:600;font-size:13px;border-bottom:2px solid transparent;">📋 Chi tiết KPI</button>
            <button data-tab="history" class="skpi-tab" style="border:none;background:none;padding:10px 14px;cursor:pointer;font-weight:600;font-size:13px;border-bottom:2px solid transparent;">🕘 Lịch sử kiểm tra</button>`;
        toolsEl.innerHTML = `
            <select id="skpiFilterSeller" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                <option value="">Tất cả NV (${sellers.length})</option>
                ${sellers.map((s) => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('')}
            </select>
            <input id="skpiFilterText" type="text" placeholder="Tìm mã phiếu / khách / STT…"
                style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;flex:1;min-width:160px;" />
            ${reconRan ? '' : '<span style="font-size:12px;color:#b45309;">⚠ Chưa đối soát — cột Hoàn/Net = gross. Bấm "Chạy đối soát KPI".</span>'}`;

        const renderDetail = () => {
            const fs = toolsEl.querySelector('#skpiFilterSeller').value;
            const ft = (toolsEl.querySelector('#skpiFilterText').value || '').trim().toLowerCase();
            const view = rows.filter((r) => {
                if (fs && r.seller !== fs) return false;
                if (ft && !`${r.stt} ${r.number} ${r.khach}`.toLowerCase().includes(ft)) return false;
                return true;
            });
            // Gộp theo NV
            const groups = new Map();
            for (const r of view) {
                if (!groups.has(r.seller)) groups.set(r.seller, []);
                groups.get(r.seller).push(r);
            }
            let tGross = 0, tLoss = 0, tNet = 0, tMon = 0, tMonR = 0, tVerified = 0;
            const groupHtml = [...groups.entries()]
                .map(([seller, list]) => {
                    let gG = 0, gL = 0, gN = 0, gM = 0, gMR = 0, gV = 0;
                    const ordRows = list
                        .map((r) => {
                            gG += r.gross; gL += r.loss; gN += r.net; gM += r.monKpi; gMR += r.monRefund;
                            const checked = isVerified(r.oid);
                            if (checked) gV++;
                            const refCell = r.monRefund > 0
                                ? `<span style="color:#dc2626;">${r.monRefund} món · −${escHtml(formatVnd(r.loss))}</span>`
                                : '<span style="color:#9ca3af;">—</span>';
                            const rowBg = checked ? 'background:#ecfdf5;' : '';
                            return `<tr class="skpi-ord" data-seller="${escHtml(seller)}" data-oid="${escHtml(r.oid)}" style="border-bottom:1px solid #f3f4f6;display:none;${rowBg}">
                                <td style="padding:6px 8px;text-align:center;"><input type="checkbox" class="skpi-check" data-oid="${escHtml(r.oid)}" ${checked ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;"></td>
                                <td style="padding:6px 8px;text-align:center;color:#6b7280;">${r.stt ?? ''}</td>
                                <td style="padding:6px 8px;"><span class="skpi-maphieu" data-oid="${escHtml(r.oid)}" style="color:#4338ca;cursor:pointer;text-decoration:underline;font-weight:600;" title="Bấm xem chi tiết món">${escHtml(r.number || '')}</span></td>
                                <td style="padding:6px 8px;">${escHtml(r.khach)}</td>
                                <td style="padding:6px 8px;">${_showStateBadge(r.stateStr)}</td>
                                <td style="padding:6px 8px;text-align:center;">${r.monKpi}</td>
                                <td style="padding:6px 8px;text-align:right;color:#6b7280;">${escHtml(formatVnd(r.gross))}</td>
                                <td style="padding:6px 8px;text-align:right;">${refCell}</td>
                                <td style="padding:6px 8px;text-align:right;font-weight:700;color:#059669;">${escHtml(formatVnd(r.net))}</td>
                            </tr>
                            <tr class="skpi-det" data-seller="${escHtml(seller)}" data-oid="${escHtml(r.oid)}" style="display:none;"><td colspan="9" style="padding:0;">${_monDetailHtml(r)}</td></tr>`;
                        })
                        .join('');
                    tGross += gG; tLoss += gL; tNet += gN; tMon += gM; tMonR += gMR; tVerified += gV;
                    return `<tr class="skpi-grp" data-seller="${escHtml(seller)}" style="background:#f9fafb;cursor:pointer;border-bottom:1px solid #e5e7eb;">
                            <td style="padding:9px 8px;text-align:center;color:#6b7280;"><span class="skpi-caret" data-seller="${escHtml(seller)}">▸</span></td>
                            <td colspan="3" style="padding:9px 8px;font-weight:700;color:#111827;">${escHtml(seller)} <span style="color:#6b7280;font-weight:400;font-size:12px;">· ${list.length} đơn · đã kiểm ${gV}/${list.length}</span></td>
                            <td style="padding:9px 8px;color:#6b7280;font-size:12px;">${gM} món</td>
                            <td style="padding:9px 8px;text-align:center;">${gM}</td>
                            <td style="padding:9px 8px;text-align:right;color:#6b7280;">${escHtml(formatVnd(gG))}</td>
                            <td style="padding:9px 8px;text-align:right;color:#dc2626;">${gMR ? '−' + escHtml(formatVnd(gL)) : '—'}</td>
                            <td style="padding:9px 8px;text-align:right;font-weight:700;color:#059669;">${escHtml(formatVnd(gN))}</td>
                        </tr>${ordRows}`;
                })
                .join('');
            bodyEl.innerHTML = `
                <div style="padding:9px 16px;font-size:12.5px;color:#374151;background:#eef2ff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:2;">
                    <strong>${view.length}</strong> đơn · đã kiểm <strong style="color:#059669;">${tVerified}/${view.length}</strong> ·
                    <strong>${tMon}</strong> món gross (${escHtml(formatVnd(tGross))}) −
                    <strong style="color:#dc2626;">${tMonR}</strong> món hoàn (${escHtml(formatVnd(tLoss))}) =
                    <strong style="color:#059669;">net ${escHtml(formatVnd(tNet))}</strong>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:#fff;position:sticky;top:35px;z-index:1;color:#6b7280;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">
                        <th style="padding:6px 8px;width:36px;">✓</th>
                        <th style="padding:6px 8px;text-align:center;">STT</th>
                        <th style="padding:6px 8px;text-align:left;">Mã phiếu</th>
                        <th style="padding:6px 8px;text-align:left;">Khách</th>
                        <th style="padding:6px 8px;text-align:left;">Trạng thái phiếu</th>
                        <th style="padding:6px 8px;text-align:center;">Món KPI</th>
                        <th style="padding:6px 8px;text-align:right;">Gross</th>
                        <th style="padding:6px 8px;text-align:right;">Hoàn (loại KPI)</th>
                        <th style="padding:6px 8px;text-align:right;">KPI net</th>
                    </tr></thead>
                    <tbody>${groupHtml || '<tr><td colspan="9" style="padding:30px;text-align:center;color:#9ca3af;">Không có đơn</td></tr>'}</tbody>
                </table>`;
        };

        const renderHistory = () => {
            const h = verify.history || [];
            const trs = h
                .slice(0, 1000)
                .map((e) => {
                    const dt = new Date(e.verifiedAt || 0).toLocaleString('vi-VN');
                    const act = e.action === 'uncheck'
                        ? '<span style="color:#dc2626;">bỏ đánh dấu</span>'
                        : '<span style="color:#059669;">đã kiểm tra</span>';
                    return `<tr style="border-bottom:1px solid #f3f4f6;">
                        <td style="padding:6px 10px;color:#6b7280;white-space:nowrap;">${escHtml(dt)}</td>
                        <td style="padding:6px 10px;font-weight:600;">${escHtml(e.verifiedByName || e.verifiedBy || '')}</td>
                        <td style="padding:6px 10px;">${act}</td>
                        <td style="padding:6px 10px;color:#4338ca;">${escHtml(e.invoiceNumber || '')}</td>
                        <td style="padding:6px 10px;">${escHtml(e.sellerName || '')}</td>
                        <td style="padding:6px 10px;">${escHtml(e.customerName || '')}</td>
                    </tr>`;
                })
                .join('');
            bodyEl.innerHTML = `
                <div style="padding:9px 16px;font-size:12.5px;color:#374151;background:#f9fafb;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:2;">
                    Lịch sử kiểm tra — <strong>${h.length}</strong> lượt (ai · giờ · đơn · NV · khách)
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:#fff;position:sticky;top:35px;z-index:1;color:#6b7280;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">
                        <th style="padding:6px 10px;text-align:left;">Thời gian</th>
                        <th style="padding:6px 10px;text-align:left;">Người kiểm</th>
                        <th style="padding:6px 10px;text-align:left;">Hành động</th>
                        <th style="padding:6px 10px;text-align:left;">Mã phiếu</th>
                        <th style="padding:6px 10px;text-align:left;">Nhân viên đơn</th>
                        <th style="padding:6px 10px;text-align:left;">Khách</th>
                    </tr></thead>
                    <tbody>${trs || '<tr><td colspan="6" style="padding:30px;text-align:center;color:#9ca3af;">Chưa có lượt kiểm tra nào</td></tr>'}</tbody>
                </table>`;
        };

        const setTab = (tab) => {
            activeTab = tab;
            tabsEl.querySelectorAll('.skpi-tab').forEach((b) => {
                const on = b.dataset.tab === tab;
                b.style.borderBottomColor = on ? '#4338ca' : 'transparent';
                b.style.color = on ? '#4338ca' : '#6b7280';
            });
            toolsEl.style.display = tab === 'detail' ? 'flex' : 'none';
            tab === 'detail' ? renderDetail() : renderHistory();
        };
        tabsEl.querySelectorAll('.skpi-tab').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
        toolsEl.querySelector('#skpiFilterSeller').onchange = renderDetail;
        toolsEl.querySelector('#skpiFilterText').oninput = renderDetail;

        // Event delegation cho body (group toggle, mã phiếu expand, checkbox)
        bodyEl.onclick = (e) => {
            const grp = e.target.closest('.skpi-grp');
            if (grp) {
                const seller = grp.dataset.seller;
                const ords = bodyEl.querySelectorAll(`.skpi-ord[data-seller="${CSS.escape(seller)}"]`);
                const open = ords.length && ords[0].style.display !== 'none';
                ords.forEach((tr) => (tr.style.display = open ? 'none' : ''));
                if (open) bodyEl.querySelectorAll(`.skpi-det[data-seller="${CSS.escape(seller)}"]`).forEach((tr) => (tr.style.display = 'none'));
                const caret = grp.querySelector('.skpi-caret');
                if (caret) caret.textContent = open ? '▸' : '▾';
                return;
            }
            const mp = e.target.closest('.skpi-maphieu');
            if (mp) {
                const oid = mp.dataset.oid;
                const det = bodyEl.querySelector(`.skpi-det[data-oid="${CSS.escape(oid)}"]`);
                if (det) det.style.display = det.style.display === 'none' ? '' : 'none';
            }
        };
        bodyEl.onchange = async (e) => {
            const cb = e.target.closest('.skpi-check');
            if (!cb) return;
            const oid = cb.dataset.oid;
            const row = rowByOid.get(oid);
            if (!row) return;
            const checked = cb.checked;
            const ordTr = bodyEl.querySelector(`.skpi-ord[data-oid="${CSS.escape(oid)}"]`);
            if (ordTr) ordTr.style.background = checked ? '#ecfdf5' : '';
            await markVerified(
                { orderId: oid, invoiceNumber: row.number, sellerName: row.seller, customerName: row.khach },
                checked
            );
        };

        setTab('detail');
    }

    // ===== EXPORT =====
    window.SocialKpiReconcile = {
        run,
        qualify,
        getQualifyingInvoice,
        grossQtyFromCache,
        getOrderKpiCell,
        renderSellerBreakdown,
        downloadRefundExcel,
        showDetailModal,
        ensureRangeLoaded,
        kpiOrderSet,
        isRangeLoaded,
        refreshInvoicesFromTPOS,
        loadVerifications,
        isVerified,
        markVerified,
        isInvoiceCancelled,
        KPI_PER_UNIT,
        CHOT_STATES,
        get verifyHistory() {
            return verify.history;
        },
        get lastResult() {
            return state.lastResult;
        },
        get byOrder() {
            return state.byOrder;
        },
        get rangeLoading() {
            return state.rangeLoading;
        },
    };
    // Gate dùng chung cho thẻ KPI tổng + cột KPI + đối soát (1 nguồn sự thật)
    window.socialKpiQualify = qualify;
})();
