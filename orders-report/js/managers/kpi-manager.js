// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Manager - Quản lý KPI upselling sản phẩm
 * 100% Render PostgreSQL - không dùng Firebase cho KPI
 *
 * Flow:
 * 1. Bulk Message Sender hoàn tất → saveAutoBaseSnapshot() lưu BASE
 * 2. Nhân viên thao tác SP → Audit Log ghi qua kpi-audit-logger.js
 * 3. Sau mỗi thao tác → recalculateAndSaveKPI() tính NET KPI
 * 4. NET KPI = chỉ tính SP MỚI (không trong BASE), net = add - remove (min 0)
 * 5. Tổng KPI = SUM(net per product) × 5,000 VNĐ
 *
 * Storage: 100% Render PostgreSQL via REST API (NO Firebase)
 * - kpi_base (key: order_code)
 * - kpi_audit_log (key: order_code)
 * - kpi_statistics (key: user_id + stat_date)
 * - report_order_details (key: table_name) — product data for BASE snapshots
 * - campaign_employee_ranges (key: campaign_name) — STT → employee mapping
 */

(function () {
    'use strict';

    const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    const KPI_AMOUNT_PER_DIFFERENCE = 5000;
    // KPI mode: 'fixed' = 5000đ/SP, 'value' = theo giá SP thực tế
    let KPI_MODE = 'fixed';

    // Cutoff cho tính năng checkbox "SP bán hàng" (ISO UTC).
    // Orders có kpi_base.created_at ≥ giá trị này → áp dụng strict mode:
    //   SP sau BASE phải có kpi_sale_flag.is_sale_product = TRUE thì mới được tính KPI.
    // Orders trước cutoff → legacy: bỏ qua flag, tính KPI như cũ.
    //
    // LỊCH SỬ:
    //   - 2026-04-24: release, cutoff = 2026-04-24 (chỉ new orders từ đó trở đi strict)
    //   - 2026-04-24 (update): user phản hồi "Tính lại KPI" vẫn tính theo logic cũ cho
    //     đơn test (22/04), không respect checkbox → lùi cutoff về quá khứ xa để
    //     MỌI đơn áp dụng strict mode, flag TRUE mới tính KPI.
    const KPI_SALE_FLAG_EFFECTIVE_FROM = '2020-01-01T00:00:00Z';

    // Ngưỡng phát hiện snapshot "đơn thật TPOS" bị LỖI THỜI (stale).
    // Bug race (2026-06-09): khi nhân viên chốt nhiều SP liên tiếp (chat_confirm_held),
    // snapshot kpi_final_snapshot bị chụp GIỮA CHỪNG (sau SP đầu, trước SP sau) rồi đóng
    // băng (ensureKpiFinalSnapshot mặc định force=false → không refetch) → các SP thêm
    // sau snapshot không có trong snapshot → NET = final − BASE đếm THIẾU.
    // Fix: nếu có audit log MỚI HƠN snapshot.fetchedAt + GRACE → coi là stale → fetch lại
    // đơn thật TPOS 1 lần. Grace nhỏ để bỏ qua chênh lệch clock/ghi-log không đáng kể
    // (deltas thật trong bug là 3.7s–12s nên 1.5s bắt được mà không refetch thừa).
    const SNAPSHOT_STALENESS_GRACE_MS = 1500;

    // NGUỒN "đơn thật cuối" để tính NET = final − BASE (2026-06-09):
    //   'invoice'    = SP trên PHIẾU BÁN HÀNG (FastSaleOrder.OrderLines) — chỉ tính SP đã xuất hóa đơn thật.
    //   'saleonline' = SP trên ĐƠN CHAT (SaleOnline_Order.Details) — hành vi cũ.
    // PROD lương (Web 1.0) → đổi 1 dòng để revert tức thì nếu cần.
    const KPI_FINAL_SOURCE = 'invoice';

    // Trạng thái phiếu bán hàng được coi là ĐÃ CHỐT (tính KPI). Phiếu Nháp/Hủy → KHÔNG tính.
    const KPI_CHOT_STATES = new Set(['Đã xác nhận', 'Đã thanh toán', 'Hoàn thành']);

    // ========================================
    // REST API Helper
    // ========================================
    async function kpiAPI(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${KPI_API}${path}`, opts);
        if (!res.ok) throw new Error(`KPI API ${method} ${path}: ${res.status}`);
        return res.json();
    }

    // ========================================
    // Variant detection helpers
    // Dùng trong calculateNetKPI() để KHÔNG tính KPI khi khách đổi biến thể:
    //   - Case 1: cùng TPOS template (B1118T ↔ B1118N)
    //   - Case 2: khác template nhưng tên chỉ khác cụm màu/size cuối
    //     (B1473 HỒNG ↔ B1474 XÁM)
    // ========================================

    // Cache kết quả load attribute values (Màu + Size). Load 1 lần, dùng mãi.
    let _attrValuesPromise = null;
    async function getAttributeValues() {
        if (!_attrValuesPromise) {
            if (global_AttributeValuesLoader()) {
                _attrValuesPromise = global_AttributeValuesLoader().load();
            } else {
                console.warn(
                    '[KPI] AttributeValuesLoader chưa sẵn sàng, dùng set rỗng — tên SP sẽ không được strip theo attribute.'
                );
                _attrValuesPromise = Promise.resolve({
                    colors: new Set(),
                    sizes: new Set(),
                    all: new Set(),
                    _source: 'empty',
                });
            }
        }
        return _attrValuesPromise;
    }

    function global_AttributeValuesLoader() {
        return typeof window !== 'undefined' && window.AttributeValuesLoader
            ? window.AttributeValuesLoader
            : null;
    }

    /**
     * Normalize tên sản phẩm để so sánh "cùng loại".
     *
     * Strip theo thứ tự:
     *   1) prefix `[CODE]`
     *   2) mọi trailing `(...)` (màu, size, combo)
     *   3) trailing `SIZE` keyword
     *   4) trailing token ∈ sizes (S, M, L, XL, 27, 28…)
     *   5) MÀU ở BẤT KỲ VỊ TRÍ NÀO (vì màu có thể nằm giữa, VD: "ÁO TRẮNG M35")
     *      Sort danh sách màu theo độ dài giảm dần để match "Trắng Kem" trước "Trắng".
     *   6) Trailing '+' / space còn sót.
     *
     * Kết quả: uppercase, collapse spaces.
     *
     * @param {string} name
     * @param {{ colors: Set<string>, sizes: Set<string>, all: Set<string> }} attrs
     * @returns {string}
     */
    function normalizeProductName(name, attrs) {
        if (!name || typeof name !== 'string') return '';
        let s = name.trim();

        // 1) Strip prefix [CODE]
        s = s.replace(/^\[[^\]]+\]\s*/, '');

        const colors = attrs && attrs.colors ? attrs.colors : new Set();
        const sizes = attrs && attrs.sizes ? attrs.sizes : new Set();

        // 2) Strip mọi trailing (...)
        let prev;
        do {
            prev = s;
            s = s.replace(/\s*\([^)]*\)\s*$/, '').trimEnd();
        } while (s !== prev);

        // 3) Strip trailing "SIZE"
        s = s.replace(/\s+SIZE\s*$/i, '').trimEnd();

        // 4) Strip trailing token thuộc sizes (lặp để bắt "SIZE L" → "SIZE" đã strip, giờ strip "L")
        do {
            prev = s;
            const m = s.match(/\s+([^\s]+)$/);
            if (m && sizes.has(m[1].toUpperCase())) {
                s = s.slice(0, s.length - m[0].length).trimEnd();
            }
        } while (s !== prev);

        // 5) Strip COLORS ở bất kỳ vị trí nào — chỉ strip màu, KHÔNG strip sizes
        //    giữa tên (S/M/L có thể trùng ký tự trong từ bình thường).
        if (colors.size > 0) {
            const sortedColors = Array.from(colors).sort((a, b) => b.length - a.length);
            for (const color of sortedColors) {
                if (!color) continue;
                const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // (^|non-letter)(color)(non-letter|$) — Unicode-aware word boundary
                const re = new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'giu');
                s = s.replace(re, '$1');
            }
        }

        // 6) Trailing '+' / space sót
        s = s.replace(/[+\s]+$/, '').trimEnd();

        return s.replace(/\s+/g, ' ').trim().toUpperCase();
    }

    /**
     * Batch lookup product_code → tpos_template_id via WarehouseAPI.
     * Fail silently → {}.
     */
    async function fetchTemplateIdMap(codes) {
        if (!Array.isArray(codes) || codes.length === 0) return {};
        if (
            typeof window === 'undefined' ||
            !window.WarehouseAPI ||
            !window.WarehouseAPI.getTemplateIdMap
        ) {
            console.warn(
                '[KPI] WarehouseAPI.getTemplateIdMap chưa sẵn sàng — bỏ qua match theo template.'
            );
            return {};
        }
        try {
            return await window.WarehouseAPI.getTemplateIdMap(codes);
        } catch (e) {
            console.warn('[KPI] fetchTemplateIdMap error:', e?.message || e);
            return {};
        }
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getCurrentDateString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    // YYYY-MM-DD theo giờ VN (UTC+7), không phụ thuộc TZ máy user.
    // Dùng cho stat_date bucket: toISOString() trần là ngày UTC — base tạo
    // 00:00–06:59 giờ VN rơi về NGÀY HÔM TRƯỚC (lệch bucket so với filter ngày
    // local của dashboard, lệch tháng ở mép tháng → sai kỳ lương).
    function vnDateString(d) {
        const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
        return t.toISOString().substring(0, 10);
    }

    // ========================================
    // KPI BASE
    // ========================================

    async function checkKPIBaseExists(orderCode) {
        if (!orderCode) return false;
        try {
            const result = await kpiAPI('GET', `/kpi-base/${encodeURIComponent(orderCode)}`);
            return result.exists === true;
        } catch (e) {
            console.warn('[KPI] checkKPIBaseExists error:', e.message);
            return false;
        }
    }

    async function getKPIBase(orderCode) {
        if (!orderCode) return null;
        try {
            const result = await kpiAPI('GET', `/kpi-base/${encodeURIComponent(orderCode)}`);
            return result.exists ? result.data : null;
        } catch (e) {
            console.warn('[KPI] getKPIBase error:', e.message);
            return null;
        }
    }

    // ========================================
    // Fetch products from TPOS API (Tier 3 fallback)
    // ========================================
    // Lấy auth header TPOS. KPI tab chạy trong iframe thường KHÔNG có
    // window.tokenManager → thử parent/top (same-origin) trước khi bó tay.
    async function _getTposAuthHeader() {
        const candidates = [];
        try {
            candidates.push(window.tokenManager);
        } catch (e) {}
        try {
            if (window.parent && window.parent !== window)
                candidates.push(window.parent.tokenManager);
        } catch (e) {}
        try {
            if (window.top && window.top !== window) candidates.push(window.top.tokenManager);
        } catch (e) {}
        for (const tm of candidates) {
            if (tm && typeof tm.getAuthHeader === 'function') {
                try {
                    const h = await tm.getAuthHeader();
                    if (h) return h;
                } catch (e) {}
            }
        }
        return null;
    }

    // Lấy SP 1 đơn từ TPOS OData ($expand=Details — nguồn chuẩn giống bảng).
    // THROW khi lỗi HTTP/network (để caller retry phân biệt với "đơn thật sự rỗng SP" → trả []).
    async function fetchProductsFromTPOS(orderId) {
        const headers = await _getTposAuthHeader();
        if (!headers) return [];
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details`;
        const response = await fetch(apiUrl, {
            headers: { ...headers, accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`TPOS ${response.status}`);
        const data = await response.json();
        return (data.Details || [])
            .map((d) => ({
                ProductId: d.ProductId || null,
                ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                ProductName: d.ProductNameGet || d.ProductName || d.Name || '',
                Quantity: d.Quantity || 1,
                Price: d.Price || 0,
            }))
            .filter((p) => p.ProductCode);
    }

    // Trích mã SP từ tên hiển thị "[CODE] Tên" (OrderLine KHÔNG có field ProductCode trực tiếp).
    function extractCodeFromNameGet(nameGet) {
        if (!nameGet || typeof nameGet !== 'string') return '';
        const m = nameGet.match(/^\s*\[([^\]]+)\]/);
        return m ? m[1].trim() : '';
    }

    // Phiếu Hủy / gộp-hủy (mirror tab-kpi-commission._isInvoiceCancelled — predicate nội bộ).
    function _isInvoiceCancelledRaw(inv) {
        if (!inv) return true;
        const showState = inv.ShowState || '';
        const stateCode = inv.StateCode || '';
        return (
            inv.State === 'cancel' ||
            stateCode === 'cancel' ||
            inv.IsMergeCancel === true ||
            showState === 'Huỷ bỏ' ||
            showState === 'Hủy bỏ'
        );
    }

    // Lấy SP từ PHIẾU BÁN HÀNG THẬT (FastSaleOrder.OrderLines) cho 1 đơn (Reference = orderCode).
    // Gom MỌI phiếu CHỐT hợp lệ (ShowState ∈ KPI_CHOT_STATES), bỏ phiếu Nháp/Hủy; cộng qty theo ProductId.
    // Trả CÙNG shape với fetchProductsFromTPOS: [{ProductId, ProductCode, ProductName, Quantity, Price}]
    // → drop-in cho NET = final − BASE (ProductId của OrderLines === của SaleOnline/BASE, đã verify).
    // THROW khi lỗi HTTP (caller phân biệt lỗi mạng vs "chưa có phiếu hợp lệ" → trả []).
    async function fetchInvoiceLinesFromTPOS(orderCode) {
        if (!orderCode) return [];
        const headers = await _getTposAuthHeader();
        if (!headers) return [];
        const h = { ...headers, accept: 'application/json' };
        const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';

        // 1) Liệt kê phiếu của đơn.
        const flt = encodeURIComponent(
            `(Type eq 'invoice' and Reference eq '${String(orderCode).replace(/'/g, "''")}')`
        );
        const gvResp = await fetch(
            `${PROXY}/FastSaleOrder/ODataService.GetView?$top=20&$orderby=DateInvoice desc&$filter=${flt}`,
            { headers: h }
        );
        if (!gvResp.ok) throw new Error(`TPOS GetView ${gvResp.status}`);
        const gv = await gvResp.json();
        const invoices = Array.isArray(gv.value) ? gv.value : [];

        // 2) Chỉ giữ phiếu CHỐT hợp lệ (loại Hủy + Nháp).
        const valid = invoices.filter(
            (inv) => !_isInvoiceCancelledRaw(inv) && KPI_CHOT_STATES.has(inv.ShowState || '')
        );
        if (valid.length === 0) return []; // chưa có phiếu hợp lệ → NET 0 (chờ phiếu)

        // 3) Gom OrderLines mọi phiếu hợp lệ → cộng qty theo ProductId.
        const byPid = new Map();
        for (const inv of valid) {
            const dResp = await fetch(`${PROXY}/FastSaleOrder(${inv.Id})?$expand=OrderLines`, {
                headers: h,
            });
            if (!dResp.ok) throw new Error(`TPOS FastSaleOrder(${inv.Id}) ${dResp.status}`);
            const detail = await dResp.json();
            for (const l of detail.OrderLines || []) {
                const pid = l.ProductId != null ? Number(l.ProductId) : null;
                const qty = Number(l.ProductUOMQty) || Number(l.Quantity) || 0;
                if (pid == null || qty <= 0) continue; // bỏ line ship/giảm giá/SP rỗng
                const code = l.ProductBarcode || extractCodeFromNameGet(l.ProductNameGet) || '';
                const key = String(pid);
                const prev = byPid.get(key);
                if (prev) {
                    prev.Quantity += qty;
                } else {
                    byPid.set(key, {
                        ProductId: pid,
                        ProductCode: code,
                        ProductName: l.ProductName || l.ProductNameGet || '',
                        Quantity: qty,
                        Price: Number(l.PriceUnit) || Number(l.Price) || 0,
                    });
                }
            }
        }
        return Array.from(byPid.values());
    }

    // Nguồn "đơn thật cuối" theo flag: 'invoice' → phiếu bán hàng; 'saleonline' → đơn chat.
    async function fetchFinalProducts(orderCode, orderId) {
        if (KPI_FINAL_SOURCE === 'invoice') {
            return await fetchInvoiceLinesFromTPOS(orderCode);
        }
        return await fetchProductsFromTPOS(orderId);
    }

    // ========================================
    // KPI FINAL SNAPSHOT (074) — SP cuối thật trên TPOS, lazy fetch 1 lần.
    // Nguồn SỐ LƯỢNG để tính NET = (final TPOS − BASE), tránh drift audit log.
    // KHÔNG đụng attribution (vẫn quy tắc chủ khoảng STT) — chỉ cấp số lượng.
    // ========================================

    // Đọc snapshot đã lưu (nếu có). Trả { orderCode, orderId, products[] } | null.
    async function getKpiFinalSnapshot(orderCode) {
        if (!orderCode) return null;
        try {
            const r = await kpiAPI('GET', `/kpi-final-snapshot/${encodeURIComponent(orderCode)}`);
            return r && r.exists ? r.data : null;
        } catch (e) {
            console.warn('[KPI] getKpiFinalSnapshot error:', e.message);
            return null;
        }
    }

    // Lưu snapshot SP cuối (upsert). KHÔNG lưu mảng rỗng (tránh ghi đè [] khi fetch fail).
    async function saveKpiFinalSnapshot(orderCode, orderId, products) {
        if (!orderCode || !Array.isArray(products) || products.length === 0) return false;
        let fetchedBy = 'unknown';
        try {
            const auth = window.authManager?.getAuthState?.();
            if (auth) fetchedBy = auth.displayName || auth.username || auth.userType || 'unknown';
        } catch (e) {}
        try {
            await kpiAPI('PUT', `/kpi-final-snapshot/${encodeURIComponent(orderCode)}`, {
                orderId: orderId || null,
                products,
                fetchedBy,
            });
            return true;
        } catch (e) {
            console.warn('[KPI] saveKpiFinalSnapshot error:', e.message);
            return false;
        }
    }

    // Đảm bảo có snapshot: force=false → có rồi bỏ qua (chỉ GET); thiếu → fetch TPOS 1 lần rồi lưu.
    // Trả snapshot data hoặc null (nếu không fetch được — vd thiếu token / đơn rỗng).
    async function ensureKpiFinalSnapshot(orderCode, orderId, opts = {}) {
        if (!orderCode) return null;
        if (!opts.force) {
            const existing = await getKpiFinalSnapshot(orderCode);
            if (existing && Array.isArray(existing.products) && existing.products.length > 0) {
                return existing;
            }
        }
        let products = [];
        try {
            products = await fetchFinalProducts(orderCode, orderId);
        } catch (e) {
            console.warn('[KPI] ensureKpiFinalSnapshot fetch TPOS failed:', e.message);
            return opts.force ? null : await getKpiFinalSnapshot(orderCode);
        }
        if (!products || products.length === 0) return null;
        await saveKpiFinalSnapshot(orderCode, orderId, products);
        return { orderCode, orderId, products };
    }

    // Batch: trả Set<orderCode> CHƯA có snapshot (để "Làm mới dữ liệu" chỉ fetch cái thiếu).
    async function getMissingFinalSnapshots(orderCodes) {
        const codes = Array.from(new Set((orderCodes || []).map((c) => String(c)).filter(Boolean)));
        if (codes.length === 0) return new Set();
        try {
            const r = await kpiAPI('POST', '/kpi-final-snapshot/exists', { orderCodes: codes });
            const existing = new Set(r.existing || []);
            return new Set(codes.filter((c) => !existing.has(c)));
        } catch (e) {
            console.warn('[KPI] getMissingFinalSnapshots error:', e.message);
            return new Set(codes); // fallback: coi như thiếu hết
        }
    }

    // ========================================
    // Save Auto Base Snapshot (after bulk message send)
    // ========================================
    async function saveAutoBaseSnapshot(successOrders, campaignName, userId) {
        if (!Array.isArray(successOrders) || successOrders.length === 0) {
            return { saved: 0, skipped: 0, failed: 0 };
        }

        let userName = 'Unknown';
        if (window.authManager) {
            const auth = window.authManager.getAuthState();
            if (auth) userName = auth.displayName || auth.userType || auth.username || 'Unknown';
        }

        let campaignId = null;
        if (window.campaignManager?.activeCampaignId) {
            campaignId = window.campaignManager.activeCampaignId;
        }
        if (!campaignName && window.campaignManager?.activeCampaign) {
            campaignName =
                window.campaignManager.activeCampaign.name ||
                window.campaignManager.activeCampaign.displayName;
        }

        // Load report_order_details for product data + STT + Code (from Render PostgreSQL)
        let reportOrdersMap = {};
        try {
            if (campaignName) {
                const safeTable = campaignName.replace(/[.$#\[\]\/]/g, '_');
                const result = await kpiAPI(
                    'GET',
                    `/report-order-details/${encodeURIComponent(safeTable)}`
                );
                if (result.exists && Array.isArray(result.orders)) {
                    result.orders.forEach((o) => {
                        const oid = o.Id || o.id;
                        if (oid) reportOrdersMap[oid] = o;
                    });
                }
            }
        } catch (e) {
            console.warn('[KPI] Could not load report_order_details:', e.message);
        }

        const total = successOrders.length;

        // Map raw TPOS/report Details → shape KPI base (giữ nguyên hành vi cũ: KHÔNG lọc IsHeld)
        const mapDetails = (arr) =>
            (arr || [])
                .map((d) => ({
                    ProductId: d.ProductId || null,
                    ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                    ProductName: d.ProductName || d.ProductNameGet || d.Name || '',
                    Quantity: d.Quantity || 1,
                    Price: d.Price || 0,
                }))
                .filter((p) => p.ProductCode);

        // ---- Pass 1: dựng entry từ Tier 1 (report map) + Tier 2 (order.Details đính kèm) ----
        let skippedNoId = 0;
        let sttZero = 0;
        const candidates = []; // { orderCode, orderId, stt, products, needFetch, fetchFailed }
        for (const order of successOrders) {
            const orderId = String(order.Id || order.id || order.orderId || '');
            if (!orderId) {
                skippedNoId++;
                continue;
            }

            const reportOrder = reportOrdersMap[orderId];
            const orderCode =
                order.Code ||
                order.code ||
                (reportOrder && (reportOrder.Code || reportOrder.code)) ||
                '';
            if (!orderCode) {
                skippedNoId++;
                continue;
            }

            // STT (successOrders không có STT → fallback reportOrder + OrderStore)
            const storeOrder = window.OrderStore ? window.OrderStore.get(orderId) : null;
            const stt =
                parseInt(
                    order.STT ||
                        order.stt ||
                        (reportOrder &&
                            (reportOrder.STT || reportOrder.SessionIndex || reportOrder.stt)) ||
                        (storeOrder &&
                            (storeOrder.SessionIndex || storeOrder.STT || storeOrder.stt)) ||
                        0
                ) || 0;
            if (!stt) sttZero++;

            // Tier 1 → Tier 2 (đồng bộ)
            let products = [];
            if (reportOrder?.Details?.length > 0) products = mapDetails(reportOrder.Details);
            if (products.length === 0) {
                products = mapDetails(order.Details || order.products || order.mainProducts || []);
            }

            candidates.push({
                orderCode,
                orderId,
                stt,
                products,
                needFetch: products.length === 0,
                fetchFailed: false,
            });
        }
        if (sttZero > 0) console.warn(`[KPI] ${sttZero}/${candidates.length} đơn có STT=0`);

        // ---- Pass 2: Tier 3 — fetch SP còn thiếu qua TPOS, SONG SONG (concurrency) + RETRY ----
        const CONCURRENCY = 8;
        const FETCH_RETRIES = 3;
        const fetchWithRetry = async (orderId) => {
            for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
                try {
                    return await fetchProductsFromTPOS(orderId); // [] = đơn thật sự rỗng SP
                } catch (e) {
                    if (attempt === FETCH_RETRIES) throw e; // lỗi transient sau N lần → báo fail thật
                    await sleep(Math.pow(2, attempt - 1) * 500);
                }
            }
            return [];
        };

        let fetchFailed = 0;
        const needFetch = candidates.filter((c) => c.needFetch);
        for (let i = 0; i < needFetch.length; i += CONCURRENCY) {
            const chunk = needFetch.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(chunk.map((c) => fetchWithRetry(c.orderId)));
            results.forEach((r, idx) => {
                if (r.status === 'fulfilled') {
                    chunk[idx].products = r.value || [];
                } else {
                    fetchFailed++; // KHÔNG drop âm thầm — đếm để báo cáo
                    chunk[idx].fetchFailed = true; // đánh dấu để khỏi đếm trùng vào noProduct
                    console.warn(
                        `[KPI] fetch SP fail (${chunk[idx].orderCode}):`,
                        r.reason?.message || r.reason
                    );
                }
            });
        }

        // ---- Dựng basesToSave + đếm noProduct (đơn thật sự rỗng SP, không phải lỗi fetch) ----
        let noProduct = 0;
        const orderCodes = [];
        const basesToSave = [];
        for (const c of candidates) {
            orderCodes.push(c.orderCode);
            if (!c.products || c.products.length === 0) {
                if (!c.fetchFailed) noProduct++;
                continue;
            }
            basesToSave.push({
                orderCode: c.orderCode,
                orderId: c.orderId,
                campaignId,
                campaignName,
                userId,
                userName,
                stt: c.stt,
                products: c.products,
            });
        }

        if (basesToSave.length === 0) {
            console.log(
                `[KPI] saveAutoBaseSnapshot: 0 base (noProduct=${noProduct}, fetchFailed=${fetchFailed}, noId=${skippedNoId}, total=${total})`
            );
            return { saved: 0, skipped: 0, failed: fetchFailed, noProduct, total };
        }

        // ---- check-exists (đơn đã có base → skip, không ghi đè) ----
        let existingSet = new Set();
        try {
            const { existing } = await kpiAPI('POST', '/kpi-base/check-exists', { orderCodes });
            existingSet = new Set(existing);
        } catch (e) {
            console.warn('[KPI] check-exists failed:', e.message);
        }
        const newBases = basesToSave.filter((b) => !existingSet.has(b.orderCode));
        const skipped = basesToSave.length - newBases.length;
        if (newBases.length === 0) {
            return { saved: 0, skipped, failed: fetchFailed, noProduct, total };
        }

        // ---- Lưu THEO LÔ (~100) + verify từng lô, retry lô lỗi (không kéo cả batch fail theo) ----
        const SAVE_CHUNK = 100;
        let saved = 0;
        let batchFailed = 0;
        for (let i = 0; i < newBases.length; i += SAVE_CHUNK) {
            const slice = newBases.slice(i, i + SAVE_CHUNK);
            let ok = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const result = await kpiAPI('POST', '/kpi-base/batch', { bases: slice });
                    saved += result.saved || 0;
                    ok = true;
                    break;
                } catch (e) {
                    console.warn(
                        `[KPI] batch save lô ${Math.floor(i / SAVE_CHUNK) + 1} attempt ${attempt}/3:`,
                        e.message
                    );
                    if (attempt < 3) await sleep(Math.pow(2, attempt - 1) * 1000);
                }
            }
            if (!ok) batchFailed += slice.length;
        }

        const failed = fetchFailed + batchFailed;
        console.log(
            `[KPI] saveAutoBaseSnapshot: saved=${saved}, skipped=${skipped}, noProduct=${noProduct}, failed=${failed}, total=${total}`
        );
        return { saved, skipped, failed, noProduct, total };
    }

    // ========================================
    // Calculate NET KPI
    // ========================================
    async function calculateNetKPI(orderCode) {
        const emptyResult = {
            netProducts: 0,
            kpiAmount: 0,
            details: {},
            baseProductCount: 0,
            perUserNet: {},
            perUserKPI: {},
            perUserNames: {},
        };
        if (!orderCode) return emptyResult;

        try {
            const base = await getKPIBase(orderCode);
            if (!base || !base.products || base.products.length === 0) return emptyResult;

            // Get audit logs from PostgreSQL
            const { logs } = await kpiAPI('GET', `/kpi-audit-log/${encodeURIComponent(orderCode)}`);
            if (!logs || logs.length === 0) {
                return { ...emptyResult, baseProductCount: base.products.length };
            }

            // Filter logs after BASE creation
            const baseTime = base.createdAt ? new Date(base.createdAt) : null;
            const relevantLogs = baseTime
                ? logs.filter((l) => new Date(l.createdAt) >= baseTime)
                : logs;

            // Gom tất cả product codes (BASE + audit) → tra template id 1 lần
            const allCodes = [];
            for (const p of base.products) if (p.ProductCode) allCodes.push(p.ProductCode);
            for (const l of relevantLogs) if (l.productCode) allCodes.push(l.productCode);

            const [attrs, templateMap] = await Promise.all([
                getAttributeValues(),
                fetchTemplateIdMap(allCodes),
            ]);

            // Build BASE sets: productId / tpos_template_id / normalized name.
            // Skip null ProductId để tránh Number(null)===0 gây false match.
            const baseProductIds = new Set();
            const baseTemplateIds = new Set();
            const baseNameSet = new Set();
            for (const p of base.products) {
                if (p.ProductId != null) baseProductIds.add(Number(p.ProductId));
                const tpl = p.ProductCode ? templateMap[p.ProductCode] : null;
                if (tpl) baseTemplateIds.add(Number(tpl));
                if (p.ProductName) {
                    const norm = normalizeProductName(p.ProductName, attrs);
                    if (norm) baseNameSet.add(norm);
                }
            }

            // Loại log nếu:
            // (1) out_of_range = STT ngoài phạm vi (không tính KPI)
            // (2) match ProductId với BASE (SP có sẵn, không phải upsell)
            // (3) match tpos_template_id với BASE (biến thể cùng template)
            // (4) match tên đã normalize với BASE (đổi cùng loại khác màu/size)
            const newProductLogs = relevantLogs.filter((l) => {
                if (l.outOfRange === true || l.out_of_range === true) return false;
                if (l.productId != null && baseProductIds.has(Number(l.productId))) return false;
                const tpl = l.productCode ? templateMap[l.productCode] : null;
                if (tpl && baseTemplateIds.has(Number(tpl))) return false;
                if (l.productName) {
                    const norm = normalizeProductName(l.productName, attrs);
                    if (norm && baseNameSet.has(norm)) return false;
                }
                return true;
            });

            // ── NET QUANTITY (2026-06-06): đối chiếu với ĐƠN THẬT trên TPOS ──
            // KPI NET = (final TPOS − BASE) thay vì cộng dồn sự kiện audit log
            // (audit log drift: thêm trùng nhiều lần / xóa ảo → NET sai).
            // Audit log GIỜ chỉ dùng để PHÂN BỔ (ai thêm → cap theo NET thật);
            // attribution downstream (chủ khoảng STT) GIỮ NGUYÊN.
            //
            // stackPerProduct[pid] = [{userId, userName, qty}] tổng = NET thật của SP.
            // Aggregation phía dưới sum stack → productNet = NET thật (không đổi code).
            const stackPerProduct = {};
            const netPerProduct = {};
            const perUserNames = {};

            // Audit tally per productId (TỪ relevantLogs — gồm cả SP base để tính phần dư).
            // Dùng cho: (a) hiển thị added/removed, (b) phân bổ NET cho NV (last-add-wins).
            const auditByPid = {};
            for (const log of relevantLogs) {
                const pid = String(log.productId);
                const qty = log.quantity || 0;
                if (qty <= 0) continue;
                if (log.userId && log.userName) perUserNames[log.userId] = log.userName;
                if (!auditByPid[pid]) auditByPid[pid] = { added: 0, removed: 0, adds: [] };
                if (log.action === 'add') {
                    auditByPid[pid].added += qty;
                    auditByPid[pid].adds.push({
                        userId: log.userId || 'unknown',
                        userName: log.userName || 'Unknown',
                        qty,
                        createdAt: log.createdAt,
                    });
                } else if (log.action === 'remove') {
                    auditByPid[pid].removed += qty;
                }
            }

            // Gán N đơn vị cho NV theo last-add-wins (NV thêm gần nhất giữ credit).
            // Thiếu audit (vd SP thêm thẳng trên TPOS) → phần dư gán 'unknown'
            // (downstream dồn về chủ khoảng STT — không phải My).
            const _attributeUnits = (pid, n) => {
                const out = [];
                if (n <= 0) return out;
                const adds = (auditByPid[pid]?.adds || [])
                    .slice()
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                let remaining = n;
                for (let i = adds.length - 1; i >= 0 && remaining > 0; i--) {
                    const take = Math.min(adds[i].qty, remaining);
                    out.push({ userId: adds[i].userId, userName: adds[i].userName, qty: take });
                    remaining -= take;
                }
                if (remaining > 0)
                    out.push({ userId: 'unknown', userName: 'Unknown', qty: remaining });
                return out;
            };

            // Đọc snapshot SP cuối thật. Có → reconciled (final − base). Không → fallback replay.
            let finalSnapshot = await getKpiFinalSnapshot(orderCode);

            // Staleness guard (fix race "chốt nhiều SP liên tiếp" — 2026-06-09):
            // Nếu có audit log MỚI HƠN thời điểm chụp snapshot → snapshot thiếu SP
            // thêm/xóa sau đó. Fetch lại đơn thật TPOS 1 LẦN (dùng lại fetchProductsFromTPOS
            // qua ensureKpiFinalSnapshot force=true → upsert snapshot tươi vào DB).
            // Bounded: refetch tối đa 1 lần/lượt gọi; sau refetch fetchedAt = now > mọi audit
            // cũ → lần sau không stale. Đơn healthy (không audit mới hơn) ⇒ 0 overhead.
            if (finalSnapshot && finalSnapshot.fetchedAt && base.orderId) {
                const snapAt = new Date(finalSnapshot.fetchedAt).getTime();
                const latestActivityAt = relevantLogs.reduce(
                    (mx, l) => Math.max(mx, new Date(l.createdAt).getTime() || 0),
                    0
                );
                if (
                    Number.isFinite(snapAt) &&
                    latestActivityAt > snapAt + SNAPSHOT_STALENESS_GRACE_MS
                ) {
                    console.log(
                        `[KPI] Snapshot ${orderCode} lỗi thời (audit mới hơn ${Math.round((latestActivityAt - snapAt) / 1000)}s) → fetch lại đơn thật TPOS`
                    );
                    try {
                        const fresh = await ensureKpiFinalSnapshot(orderCode, base.orderId, {
                            force: true,
                        });
                        if (fresh && Array.isArray(fresh.products) && fresh.products.length > 0) {
                            finalSnapshot = fresh; // dùng snapshot tươi
                        }
                    } catch (e) {
                        console.warn('[KPI] refetch snapshot stale thất bại:', e?.message);
                    }
                }
            }

            let reconciled = false;

            if (
                finalSnapshot &&
                Array.isArray(finalSnapshot.products) &&
                finalSnapshot.products.length > 0
            ) {
                reconciled = true;
                // base qty theo productId (gộp nếu trùng).
                const baseQtyByPid = new Map();
                for (const p of base.products) {
                    if (p.ProductId != null) {
                        const k = Number(p.ProductId);
                        baseQtyByPid.set(k, (baseQtyByPid.get(k) || 0) + (Number(p.Quantity) || 1));
                    }
                }
                for (const fp of finalSnapshot.products) {
                    const pidNum = fp.ProductId != null ? Number(fp.ProductId) : null;
                    const finalQty = Number(fp.Quantity) || 0;
                    if (finalQty <= 0) continue;

                    let net = 0;
                    let baseQty = 0;
                    if (pidNum != null && baseProductIds.has(pidNum)) {
                        // Cùng SP với BASE → tính PHẦN DƯ (mua thêm số lượng).
                        baseQty = baseQtyByPid.get(pidNum) || 0;
                        net = Math.max(0, finalQty - baseQty);
                    } else {
                        // Không match productId → kiểm tra đổi biến thể (template/tên) = KHÔNG tính.
                        const tpl = fp.ProductCode ? templateMap[fp.ProductCode] : null;
                        if (tpl && baseTemplateIds.has(Number(tpl))) continue;
                        const norm = fp.ProductName
                            ? normalizeProductName(fp.ProductName, attrs)
                            : null;
                        if (norm && baseNameSet.has(norm)) continue;
                        net = finalQty; // SP mới hoàn toàn (upsell)
                    }
                    if (net <= 0) continue;

                    const pid = pidNum != null ? String(pidNum) : fp.ProductCode || 'unknown';
                    netPerProduct[pid] = {
                        code: fp.ProductCode || '',
                        name: fp.ProductName || '',
                        added: auditByPid[pid]?.added || 0,
                        removed: auditByPid[pid]?.removed || 0,
                        net: 0, // set trong aggregation (= sum stack)
                        price: Number(fp.Price) || 0,
                        perUser: {},
                        real: finalQty, // qty thật trên đơn cuối TPOS
                        baseQty, // qty trong BASE
                    };
                    stackPerProduct[pid] = _attributeUnits(pid, net);
                }
            } else {
                // FALLBACK (chưa có snapshot): replay audit log như cũ — reconciled=false.
                // UI nên cảnh báo "chưa đối chiếu", bấm Làm mới để fetch đơn thật.
                newProductLogs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                for (const log of newProductLogs) {
                    const pid = String(log.productId);
                    const qty = log.quantity || 0;
                    if (qty <= 0) continue;
                    if (!netPerProduct[pid]) {
                        netPerProduct[pid] = {
                            code: log.productCode,
                            name: log.productName,
                            added: 0,
                            removed: 0,
                            net: 0,
                            price: 0,
                            perUser: {},
                        };
                        stackPerProduct[pid] = [];
                    }
                    if (log.action === 'add') {
                        netPerProduct[pid].added += qty;
                        stackPerProduct[pid].push({
                            userId: log.userId || 'unknown',
                            userName: log.userName || 'Unknown',
                            qty,
                        });
                    } else if (log.action === 'remove') {
                        netPerProduct[pid].removed += qty;
                        let remaining = qty;
                        const stack = stackPerProduct[pid];
                        while (remaining > 0 && stack.length > 0) {
                            const top = stack[stack.length - 1];
                            if (top.qty <= remaining) {
                                remaining -= top.qty;
                                stack.pop();
                            } else {
                                top.qty -= remaining;
                                remaining = 0;
                            }
                        }
                    }
                }
            }

            // For value-based KPI: fetch current prices from TPOS
            if (KPI_MODE === 'value' && base.orderId) {
                try {
                    const tposProducts = await fetchProductsFromTPOS(base.orderId);
                    for (const tp of tposProducts) {
                        const pid = String(tp.ProductId);
                        if (netPerProduct[pid] && tp.Price > 0) {
                            netPerProduct[pid].price = tp.Price;
                        }
                    }
                } catch (e) {}
            }

            // Xác định có áp dụng strict mode (dùng sale flag) hay không.
            // Orders sau cutoff → strict: SP chưa check flag sẽ không tính KPI.
            // Orders trước cutoff → legacy: bỏ qua flag (tính như cũ).
            const baseCreated = base.createdAt ? new Date(base.createdAt) : null;
            if (base.createdAt == null) {
                console.warn(
                    `[KPI] base.createdAt thiếu cho orderCode=${orderCode} → fallback legacy mode`
                );
            }
            const strictMode = baseCreated && baseCreated >= new Date(KPI_SALE_FLAG_EFFECTIVE_FROM);

            let flagMap = null;
            if (strictMode) {
                try {
                    if (
                        window.KpiSaleFlagStore &&
                        typeof window.KpiSaleFlagStore.load === 'function'
                    ) {
                        flagMap = await window.KpiSaleFlagStore.load(orderCode);
                    } else {
                        // Fallback: trực tiếp gọi API nếu store chưa load (vd. worker tick)
                        const resp = await kpiAPI(
                            'GET',
                            `/kpi-sale-flag/${encodeURIComponent(orderCode)}`
                        );
                        flagMap = new Map();
                        for (const f of resp.flags || []) {
                            flagMap.set(String(f.productId), f.isSaleProduct === true);
                        }
                    }
                } catch (e) {
                    // Fail-safe: không crash KPI calc. Coi như không có flag nào
                    // (strict mode: mọi SP sau BASE không được tính vì default FALSE).
                    console.warn('[KPI] load sale flags failed:', e?.message);
                    flagMap = new Map();
                }
            }

            // Compute net per user từ remaining stack entries.
            // DUAL aggregation: compute đồng thời strict (chỉ SP tick) + legacy
            // (mọi SP qualify, bỏ qua sale flag — pre-feature behavior).
            //   - strict → lưu vào order.kpi, order.netProducts + total_kpi DB column
            //   - legacy → lưu vào order.kpiLegacy, order.netProductsLegacy (JSONB)
            //     → dashboard "Hiển thị đầy đủ" mode sum từ đây ở client.
            const perUserNet = {};
            const perUserKPI = {};
            const perUserNetLegacy = {};
            const perUserKPILegacy = {};
            let totalNet = 0;
            let totalKPIAmount = 0;
            let totalNetLegacy = 0;
            let totalKPIAmountLegacy = 0;
            let excludedCount = 0;

            for (const [pid, data] of Object.entries(netPerProduct)) {
                const unitKPI =
                    KPI_MODE === 'value' && data.price > 0 ? data.price : KPI_AMOUNT_PER_DIFFERENCE;

                // (A) Tính real NET qty (thực tế đã add/remove) — luôn set data.net
                // để detail modal hiển thị đủ thông tin cho cả SP bị loại khỏi KPI.
                let productNet = 0;
                for (const entry of stackPerProduct[pid]) {
                    if (entry.qty <= 0) continue;
                    productNet += entry.qty;
                }
                data.net = productNet;
                data.unitKPI = unitKPI;

                // (B) LEGACY aggregation — LUÔN count, không filter flag.
                // Tương đương pre-feature: mọi SP qualify variants đều tính KPI.
                for (const entry of stackPerProduct[pid]) {
                    if (entry.qty <= 0) continue;
                    perUserNetLegacy[entry.userId] =
                        (perUserNetLegacy[entry.userId] || 0) + entry.qty;
                    perUserKPILegacy[entry.userId] =
                        (perUserKPILegacy[entry.userId] || 0) + entry.qty * unitKPI;
                }
                totalNetLegacy += productNet;
                totalKPIAmountLegacy += productNet * unitKPI;

                // (C) Strict mode: SP phải được sale tick flag mới cộng vào strict total.
                // Default FALSE (chưa check) → skip aggregation strict. Legacy vẫn counted ở (B).
                if (strictMode) {
                    const isSale = flagMap && flagMap.get(pid) === true;
                    if (!isSale) {
                        data.excludedBySaleFlag = true;
                        excludedCount++;
                        continue;
                    }
                }

                // (D) STRICT aggregation — chỉ SP qualifying (hoặc không strict mode)
                for (const entry of stackPerProduct[pid]) {
                    if (entry.qty <= 0) continue;
                    perUserNet[entry.userId] = (perUserNet[entry.userId] || 0) + entry.qty;
                    perUserKPI[entry.userId] =
                        (perUserKPI[entry.userId] || 0) + entry.qty * unitKPI;
                    data.perUser[entry.userId] = (data.perUser[entry.userId] || 0) + entry.qty;
                }
                totalNet += productNet;
                totalKPIAmount += productNet * unitKPI;
            }

            return {
                netProducts: totalNet,
                kpiAmount: totalKPIAmount,
                netProductsLegacy: totalNetLegacy,
                kpiAmountLegacy: totalKPIAmountLegacy,
                details: netPerProduct,
                baseProductCount: baseProductIds.size,
                perUserNet,
                perUserKPI,
                perUserNetLegacy,
                perUserKPILegacy,
                perUserNames,
                strictMode: !!strictMode,
                excludedCount,
                reconciled, // true = NET tính theo đơn thật TPOS; false = fallback audit replay
            };
        } catch (e) {
            console.error('[KPI] calculateNetKPI error:', e);
            return emptyResult;
        }
    }

    // ========================================
    // Save KPI Statistics (Atomic PATCH via REST)
    // ========================================
    async function saveKPIStatistics(userId, date, statistics) {
        if (!userId || !date || !statistics) return;

        try {
            // Ưu tiên userName do caller truyền vào (recalculateAndSaveKPI đã resolve
            // theo STT-range owner). Fallback employee_ranges chỉ khi caller không cung
            // cấp (legacy callers).
            let userName = statistics.userName || null;
            if (!userName) {
                try {
                    const assigned = await getAssignedEmployeeForSTT(
                        statistics.stt,
                        statistics.campaignName,
                        statistics.campaignId
                    );
                    if (assigned.userName && assigned.userName !== 'Chưa phân')
                        userName = assigned.userName;
                } catch (e) {}
            }

            // Atomic server-side upsert — no client-side read-modify-write race condition.
            // Strict KPI (netProducts/kpi) là số chính (totals server tính từ đây).
            // Legacy (netProductsLegacy/kpiLegacy) lưu kèm để full-mode/báo cáo sau
            // đọc được — trước đây 2 field này bị DROP ở đây dù caller đã truyền
            // và server PATCH đã hỗ trợ (luôn ghi 0).
            await kpiAPI('PATCH', `/kpi-statistics/${encodeURIComponent(userId)}/${date}/order`, {
                orderCode: statistics.orderCode,
                orderId: statistics.orderId || null,
                stt: statistics.stt,
                campaignName: statistics.campaignName || null,
                netProducts: statistics.netProducts || 0,
                kpi: statistics.kpi || 0,
                netProductsLegacy: statistics.netProductsLegacy || 0,
                kpiLegacy: statistics.kpiLegacy || 0,
                hasDiscrepancy: statistics.hasDiscrepancy || false,
                details: statistics.details || {},
                userName,
            });
        } catch (e) {
            console.error('[KPI] saveKPIStatistics error:', e);
        }
    }

    // ========================================
    // Recalculate & Save KPI
    // ========================================
    async function recalculateAndSaveKPI(orderCode) {
        try {
            if (!orderCode) return null;

            const base = await getKPIBase(orderCode);
            if (!base) return null;
            if (!base.products || base.products.length === 0) return null;

            // Đảm bảo có snapshot SP cuối thật trên TPOS trước khi tính (fetch 1 lần
            // nếu thiếu). → calculateNetKPI tính NET = final − BASE (reconciled).
            // Có rồi → chỉ GET, không refetch. Non-fatal nếu TPOS lỗi (fallback audit).
            try {
                await ensureKpiFinalSnapshot(orderCode, base.orderId);
            } catch (e) {}

            // Recover STT if BASE has 0 (vẫn cần để lưu metadata trong statistics)
            let stt = base.stt || 0;
            if (!stt && base.orderId && window.OrderStore) {
                const storeOrder = window.OrderStore.get(base.orderId);
                if (storeOrder) {
                    stt =
                        parseInt(
                            storeOrder.SessionIndex || storeOrder.STT || storeOrder.stt || 0
                        ) || 0;
                    if (stt) {
                        try {
                            await kpiAPI('PUT', `/kpi-base/${encodeURIComponent(orderCode)}`, {
                                ...base,
                                stt,
                            });
                        } catch (e) {}
                        console.log(`[KPI] Recovered STT=${stt} for ${orderCode}`);
                    }
                }
            }

            const result = await calculateNetKPI(orderCode);

            // Use BASE creation date, not today — prevents same order appearing in multiple days.
            // Bucket theo NGÀY GIỜ VN (vnDateString), KHÔNG dùng toISOString() (UTC):
            // đồng nhất với filter ngày local của dashboard + getCurrentDateString() fallback.
            const baseDate = base.createdAt
                ? vnDateString(new Date(base.createdAt))
                : getCurrentDateString();

            // Attribution rule (owner-confirmed 2026-05-07):
            //  • Default: KPI của đơn được tính cho NHÂN VIÊN sở hữu khoảng STT chứa
            //    đơn (theo "phân chia nhân viên" của campaign), KHÔNG phải log.userId.
            //  • Exception (added 2026-05-07): user "my" (userType `my-authenticated`,
            //    userId pattern `user_my_*`) được tính KPI RIÊNG cho chính mình, không
            //    rơi vào STT-range owner. Lý do: My làm cross-campaign / cross-range —
            //    chốt từ luồng riêng, KPI nên gom về My thay vì pad vào range owner.
            //
            // Split per-user KPI: bucket "my" entries (attributed to my directly) vs
            // "others" entries (summed + attributed to STT-range owner).
            const myEntries = []; // [{userId, userName}]
            let myKPI = 0,
                myNet = 0,
                myKPILegacy = 0,
                myNetLegacy = 0;
            let othersKPI = 0,
                othersNet = 0,
                othersKPILegacy = 0,
                othersNetLegacy = 0;

            const allUserIds = new Set([
                ...Object.keys(result.perUserKPI || {}),
                ...Object.keys(result.perUserKPILegacy || {}),
            ]);
            for (const uid of allUserIds) {
                const k = Number(result.perUserKPI?.[uid] || 0);
                const n = Number(result.perUserNet?.[uid] || 0);
                const kL = Number(result.perUserKPILegacy?.[uid] || 0);
                const nL = Number(result.perUserNetLegacy?.[uid] || 0);
                if (_isMyUser(uid, result.perUserNames?.[uid])) {
                    myKPI += k;
                    myNet += n;
                    myKPILegacy += kL;
                    myNetLegacy += nL;
                    myEntries.push({
                        userId: uid,
                        userName: result.perUserNames?.[uid] || 'My',
                    });
                } else {
                    othersKPI += k;
                    othersNet += n;
                    othersKPILegacy += kL;
                    othersNetLegacy += nL;
                }
            }

            // Build danh sách entry TRƯỚC, rồi ghi 1 lần (xem block ghi bên dưới).
            const statEntries = [];

            // (1) "My" portion → save under my's actual userId (one row per distinct my
            //     user — usually just 1; supports multi-my edge case).
            for (const entry of myEntries) {
                const ek = Number(result.perUserKPI?.[entry.userId] || 0);
                const en = Number(result.perUserNet?.[entry.userId] || 0);
                const ekL = Number(result.perUserKPILegacy?.[entry.userId] || 0);
                const enL = Number(result.perUserNetLegacy?.[entry.userId] || 0);
                if (ek <= 0 && ekL <= 0) continue;
                statEntries.push({
                    userId: entry.userId,
                    date: baseDate,
                    orderCode: orderCode,
                    orderId: base.orderId || null,
                    stt: stt,
                    campaignName: base.campaignName || null,
                    campaignId: base.campaignId || null,
                    netProducts: en,
                    kpi: ek,
                    netProductsLegacy: enL,
                    kpiLegacy: ekL,
                    hasDiscrepancy: false,
                    details: result.details,
                    userName: entry.userName,
                });
            }

            // (2) Non-"my" portion → attribute to STT-range owner (per main rule).
            //     Sum across all non-my audit users, save 1 row.
            if (othersKPI > 0 || othersKPILegacy > 0) {
                let assignedUserId = 'unassigned';
                let assignedUserName = 'Chưa phân';
                try {
                    const assigned = await getAssignedEmployeeForSTT(
                        stt,
                        base.campaignName,
                        base.campaignId
                    );
                    if (assigned?.userId) {
                        assignedUserId = assigned.userId;
                        assignedUserName = assigned.userName || assignedUserId;
                    }
                } catch (_e) {
                    /* unassigned fallback */
                }

                // Edge case: STT-range owner is also "my" → row already saved in (1)
                // for the same orderCode+date with the my entries, but here would
                // duplicate. Skip to avoid double-write under same key.
                if (!_isMyUser(assignedUserId, assignedUserName)) {
                    statEntries.push({
                        userId: assignedUserId,
                        date: baseDate,
                        orderCode: orderCode,
                        orderId: base.orderId || null,
                        stt: stt,
                        campaignName: base.campaignName || null,
                        campaignId: base.campaignId || null,
                        netProducts: othersNet,
                        kpi: othersKPI,
                        netProductsLegacy: othersNetLegacy,
                        kpiLegacy: othersKPILegacy,
                        hasDiscrepancy: false,
                        details: result.details,
                        userName: assignedUserName,
                    });
                }
            }

            // ── Ghi statistics ──
            // Ưu tiên POST /kpi-statistics/reattribute: strip orderCode khỏi mọi
            // row + upsert entries + recompute totals trong MỘT transaction
            // (advisory lock theo orderCode) → hết race khi 2 recalc đồng thời
            // cùng đơn interleave DELETE/PATCH, và 2-3 request/đơn → 1.
            // entries=[] vẫn gọi để strip (đơn không còn KPI).
            // Server cũ chưa có endpoint → fallback flow cũ: DELETE rồi PATCH từng entry.
            let reattributed = false;
            try {
                await kpiAPI('POST', '/kpi-statistics/reattribute', {
                    orderCode,
                    entries: statEntries,
                });
                reattributed = true;
            } catch (e) {
                console.warn(
                    '[KPI] reattribute chưa khả dụng → fallback DELETE+PATCH:',
                    e?.message
                );
            }
            if (!reattributed) {
                try {
                    await kpiAPI(
                        'DELETE',
                        `/kpi-statistics/order/${encodeURIComponent(orderCode)}`
                    );
                } catch (e) {
                    console.warn(
                        '[KPI] DELETE kpi-statistics/order failed (non-fatal):',
                        e.message
                    );
                }
                for (const se of statEntries) {
                    await saveKPIStatistics(se.userId, se.date, se);
                }
            }

            // UI badge + toast (non-blocking) — vẫn hiển thị tổng KPI của đơn
            try {
                updateKPIBadge(orderCode, result.netProducts, result.kpiAmount, true);
                showKPIToast(result.netProducts, result.kpiAmount);
            } catch (e) {}

            return {
                netProducts: result.netProducts,
                kpiAmount: result.kpiAmount,
                perUserKPI: result.perUserKPI,
                perUserNames: result.perUserNames,
            };
        } catch (e) {
            console.error('[KPI] recalculateAndSaveKPI error:', e);
            return null;
        }
    }

    // ========================================
    // Employee Range Lookup (Render PostgreSQL)
    // ========================================
    const CAMPAIGNS_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/campaigns';

    // Cache employee_ranges theo campaign key (id hoặc safeName), TTL 60s.
    // "Tính lại KPI" hàng loạt gọi getAssignedEmployeeForSTT cho TỪNG đơn của
    // cùng 1 campaign → trước đây mỗi đơn tốn tới 2 fetch ranges giống hệt nhau.
    // Share promise để các worker song song dùng chung 1 request in-flight.
    const EMPLOYEE_RANGES_TTL_MS = 60 * 1000;
    const _employeeRangesCache = new Map(); // key → { at, promise }
    function _fetchEmployeeRangesCached(key) {
        const now = Date.now();
        const hit = _employeeRangesCache.get(key);
        if (hit && now - hit.at < EMPLOYEE_RANGES_TTL_MS) return hit.promise;
        const promise = fetch(`${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(key)}`)
            .then((r) => r.json())
            .catch((e) => {
                _employeeRangesCache.delete(key); // lỗi → không cache, lần sau thử lại
                throw e;
            });
        _employeeRangesCache.set(key, { at: now, promise });
        return promise;
    }

    /**
     * Identify nhân viên "my" — user có `userType === 'my-authenticated'` (login.js
     * gắn `userType: ${username}-authenticated` → username 'my' → userType 'my-authenticated').
     * Audit log entries từ My có `userId = user_my_<timestamp>_<suffix>` (chuẩn `user_${username}_…`).
     *
     * "my" được attribute KPI riêng cho chính mình, KHÔNG dùng STT-range rule —
     * theo owner-confirmed 2026-05-07.
     *
     * @param {string} userId - audit log user_id
     * @param {string} [userName] - display name (fallback heuristic)
     * @returns {boolean}
     */
    function _isMyUser(userId, userName) {
        if (!userId) return false;
        const id = String(userId);
        // Pattern: user_my_<timestamp>_<suffix>. Underscore right after `my` ensures
        // prefixes like "myanmar" / "myla" don't collide.
        if (/^user_my_/.test(id)) return true;
        // Backward-compat: legacy entries may have user_id = displayName 'My' verbatim
        if (id === 'my' || id.toLowerCase() === 'user_my') return true;
        return false;
    }

    async function getAssignedEmployeeForSTT(stt, campaignName, campaignId) {
        const unassigned = { userId: 'unassigned', userName: 'Chưa phân' };
        if (!stt && stt !== 0) return unassigned;

        try {
            const sttNum = Number(stt);

            // 1a. Campaign-id-keyed ranges (NEW canonical key — survives campaign rename).
            if (campaignId) {
                try {
                    const result = await _fetchEmployeeRangesCached(String(campaignId));
                    if (
                        result.success &&
                        Array.isArray(result.employeeRanges) &&
                        result.employeeRanges.length > 0
                    ) {
                        const found = _findInRanges(result.employeeRanges, sttNum);
                        if (found) return found;
                    }
                } catch (_e) {}
            }

            // 1b. Campaign-name-keyed ranges (legacy, pre-migration).
            if (campaignName) {
                try {
                    const safeName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                    const result = await _fetchEmployeeRangesCached(safeName);
                    if (
                        result.success &&
                        Array.isArray(result.employeeRanges) &&
                        result.employeeRanges.length > 0
                    ) {
                        const found = _findInRanges(result.employeeRanges, sttNum);
                        if (found) return found;
                    }
                } catch (e) {}
            }

            // Per-rule (owner confirmed 2026-05-07): chỉ count KPI khi STT thuộc range
            // của ĐÚNG chiến dịch đang chốt. KHÔNG fallback sang ranges của campaign
            // khác (cross-campaign leak — user A của campaign X không được tính KPI
            // chỉ vì STT cùng số với range của user A trong campaign Y).
            console.warn(
                `[KPI] STT ${stt} not in employee_ranges of campaign "${campaignName || campaignId}" → unassigned`
            );
            return unassigned;
        } catch (e) {
            return unassigned;
        }
    }

    function _findInRanges(ranges, sttNum) {
        if (Array.isArray(ranges)) {
            for (const r of ranges) {
                const from = r.fromSTT || r.from || r.start || 0;
                const to = r.toSTT || r.to || r.end || Infinity;
                if (sttNum >= from && sttNum <= to) {
                    return {
                        userId: r.userId || r.id || 'unassigned',
                        userName: r.userName || r.name || r.userId || r.id || 'Chưa phân',
                    };
                }
            }
        } else if (typeof ranges === 'object') {
            for (const [uid, r] of Object.entries(ranges)) {
                if (!r || typeof r !== 'object') continue;
                if (uid === 'ranges') continue;
                const from = r.from || r.start || r.fromSTT || 0;
                const to = r.to || r.end || r.toSTT || Infinity;
                if (sttNum >= from && sttNum <= to) {
                    return { userId: uid, userName: r.userName || uid };
                }
            }
        }
        return null;
    }

    // ========================================
    // KPI Badge + Toast (UI helpers)
    // ========================================
    function formatKPICurrency(amount) {
        return (amount || 0).toLocaleString('vi-VN') + 'đ';
    }

    function updateKPIBadge(orderCode, netProducts, kpiAmount, hasBase) {
        try {
            const container = document.getElementById('kpi-badge-container');
            const badge = document.getElementById('kpi-badge');
            if (!container || !badge) return;
            container.style.display = 'block';
            if (!hasBase) {
                badge.textContent = 'Chưa có BASE';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#94a3b8';
            } else if (netProducts > 0) {
                badge.textContent =
                    'KPI: +' + netProducts + ' SP = ' + formatKPICurrency(kpiAmount);
                badge.style.background = '#dcfce7';
                badge.style.color = '#16a34a';
            } else {
                badge.textContent = 'KPI: 0';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#94a3b8';
            }
        } catch (e) {}
    }

    function showKPIToast(netProducts, kpiAmount) {
        try {
            if (netProducts <= 0) return;
            let c = document.getElementById('kpi-toast-container');
            if (!c) {
                c = document.createElement('div');
                c.id = 'kpi-toast-container';
                c.style.cssText =
                    'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(c);
            }
            const t = document.createElement('div');
            t.style.cssText =
                'background:#16a34a;color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;opacity:0;transform:translateY(12px);transition:all 0.3s ease;';
            t.textContent = 'KPI: +' + netProducts + ' SP = ' + formatKPICurrency(kpiAmount);
            c.appendChild(t);
            requestAnimationFrame(() => {
                t.style.opacity = '1';
                t.style.transform = 'translateY(0)';
            });
            setTimeout(() => {
                t.style.opacity = '0';
                t.style.transform = 'translateY(12px)';
                setTimeout(() => t.remove(), 300);
            }, 3000);
        } catch (e) {}
    }

    async function initKPIBadge(orderCode) {
        try {
            if (!orderCode) return;
            const hasBase = await checkKPIBaseExists(orderCode);
            if (hasBase) {
                const result = await calculateNetKPI(orderCode);
                updateKPIBadge(orderCode, result.netProducts, result.kpiAmount, true);
            } else {
                updateKPIBadge(orderCode, 0, 0, false);
            }
        } catch (e) {}
    }

    // ========================================
    // Reconcile KPI — compare audit-based KPI with current TPOS products
    // ========================================
    async function reconcileKPI(orderId, campaignName, orderCodeHint) {
        const result = {
            orderId,
            hasDiscrepancy: false,
            actualNet: null,
            actualPerUser: {},
            actualPerUserNames: {},
            // Per-product KPI breakdown { [productId]: {code, name, net, ...} }.
            // Dùng cho đối soát theo MÓN (so khớp với refund excel ExportFileDetail).
            details: {},
            discrepancies: [],
        };
        if (!orderId) return result;

        try {
            // Use provided orderCode or lookup from OrderStore
            let orderCode = orderCodeHint || '';
            if (!orderCode && window.OrderStore) {
                const storeOrder = window.OrderStore.get(orderId);
                if (storeOrder) orderCode = storeOrder.Code || '';
            }
            if (!orderCode) {
                // Can't reconcile without orderCode — not an error
                return result;
            }

            const base = await getKPIBase(orderCode);
            if (!base) {
                result.hasDiscrepancy = true;
                result.discrepancies.push({ type: 'no_base', message: 'Không có BASE snapshot' });
                return result;
            }

            // Calculate actual NET from audit logs (always works, doesn't need TPOS)
            const kpiResult = await calculateNetKPI(orderCode);
            result.actualNet = kpiResult.netProducts;
            result.actualPerUser = kpiResult.perUserKPI || {};
            result.actualPerUserNames = kpiResult.perUserNames || {};
            // Expose per-product breakdown để đối soát refund theo MÓN ở tab KPI.
            result.details = kpiResult.details || {};

            // Try to get current products from TPOS for cross-check (cùng nguồn với NET:
            // phiếu bán hàng nếu KPI_FINAL_SOURCE='invoice', ngược lại đơn chat).
            const currentProducts = await fetchFinalProducts(orderCode, orderId);
            if (currentProducts.length === 0) {
                // Can't reach TPOS — skip cross-check but still return actualNet
                return result;
            }

            // Build sets for comparison
            const baseProductIds = new Set();
            for (const p of base.products) {
                if (p.ProductId != null) baseProductIds.add(Number(p.ProductId));
            }

            const currentProductIds = new Set();
            for (const p of currentProducts) {
                if (p.ProductId != null) currentProductIds.add(Number(p.ProductId));
            }

            // Count actual new products on TPOS (not in BASE)
            const tposNewProducts = [...currentProductIds].filter(
                (pid) => !baseProductIds.has(pid)
            );
            const auditNewProductIds = new Set(
                Object.keys(kpiResult.details)
                    .map(Number)
                    .filter((n) => !isNaN(n))
            );

            // Products in TPOS but missing from audit
            for (const pid of tposNewProducts) {
                if (!auditNewProductIds.has(pid)) {
                    const p = currentProducts.find((cp) => Number(cp.ProductId) === pid);
                    result.hasDiscrepancy = true;
                    result.discrepancies.push({
                        type: 'missing_audit',
                        message: `SP ${p?.ProductCode || pid} có trên TPOS nhưng thiếu audit log`,
                    });
                }
            }

            // Products in audit but removed from TPOS
            for (const pid of auditNewProductIds) {
                if (!currentProductIds.has(pid) && !baseProductIds.has(pid)) {
                    const detail = kpiResult.details[String(pid)];
                    if (detail && detail.net > 0) {
                        result.hasDiscrepancy = true;
                        result.discrepancies.push({
                            type: 'removed_from_tpos',
                            message: `SP ${detail.code || pid} có KPI nhưng đã bị xóa khỏi TPOS`,
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[KPI] reconcileKPI error:', e);
            result.hasDiscrepancy = true;
            result.discrepancies.push({ type: 'error', message: e.message });
        }

        return result;
    }

    // ========================================
    // Export
    // ========================================
    function setKPIMode(mode) {
        if (mode === 'fixed' || mode === 'value') {
            KPI_MODE = mode;
            console.log(`[KPI] Mode set to: ${mode}`);
        }
    }

    function getKPIMode() {
        return KPI_MODE;
    }

    window.kpiManager = {
        checkKPIBaseExists,
        getKPIBase,
        saveAutoBaseSnapshot,
        calculateNetKPI,
        recalculateAndSaveKPI,
        reconcileKPI,
        saveKPIStatistics,
        getAssignedEmployeeForSTT,
        isMyUser: _isMyUser,
        fetchProductsFromTPOS,
        getKpiFinalSnapshot,
        saveKpiFinalSnapshot,
        ensureKpiFinalSnapshot,
        getMissingFinalSnapshots,
        getCurrentDateString,
        updateKPIBadge,
        showKPIToast,
        initKPIBadge,
        setKPIMode,
        getKPIMode,
        KPI_AMOUNT_PER_DIFFERENCE,
        kpiAPI,
    };
})();
