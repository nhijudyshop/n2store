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
    async function fetchProductsFromTPOS(orderId) {
        if (!window.tokenManager || !window.tokenManager.getAuthHeader) return [];
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details`;
            const response = await fetch(apiUrl, {
                headers: { ...headers, accept: 'application/json' },
            });
            if (!response.ok) return [];
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
        } catch (e) {
            console.error('[KPI] fetchProductsFromTPOS failed:', e);
            return [];
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

        // Build base entries
        const orderCodes = [];
        const basesToSave = [];

        for (const order of successOrders) {
            const orderId = String(order.Id || order.id || '');
            if (!orderId) continue;

            const reportOrder = reportOrdersMap[orderId];

            // Get orderCode (primary key)
            const orderCode =
                order.Code ||
                order.code ||
                (reportOrder && (reportOrder.Code || reportOrder.code)) ||
                '';
            if (!orderCode) continue;

            orderCodes.push(orderCode);

            // Get STT - try multiple sources
            // successOrders doesn't have STT, so fallback to reportOrder and OrderStore
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
            if (!stt) {
                console.warn(`[KPI] STT=0 for order ${orderCode} (orderId=${orderId})`);
                console.warn(
                    '[KPI] Debug: reportOrder keys=',
                    reportOrder ? Object.keys(reportOrder) : 'NULL'
                );
                console.warn(
                    '[KPI] Debug: storeOrder keys=',
                    storeOrder ? Object.keys(storeOrder).slice(0, 10) : 'NULL'
                );
                if (reportOrder)
                    console.warn('[KPI] reportOrder STT fields:', {
                        STT: reportOrder.STT,
                        SessionIndex: reportOrder.SessionIndex,
                        stt: reportOrder.stt,
                    });
                if (storeOrder)
                    console.warn('[KPI] storeOrder STT fields:', {
                        SessionIndex: storeOrder.SessionIndex,
                        STT: storeOrder.STT,
                        stt: storeOrder.stt,
                    });
            }

            // Get products (3-tier fallback)
            let products = [];
            if (reportOrder?.Details?.length > 0) {
                products = reportOrder.Details.map((d) => ({
                    ProductId: d.ProductId || null,
                    ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                    ProductName: d.ProductName || d.Name || '',
                    Quantity: d.Quantity || 1,
                    Price: d.Price || 0,
                })).filter((p) => p.ProductCode);
            }

            if (products.length === 0) {
                const local = order.Details || order.products || order.mainProducts || [];
                products = local
                    .map((p) => ({
                        ProductId: p.ProductId || null,
                        ProductCode: p.ProductCode || p.Code || p.DefaultCode || '',
                        ProductName: p.ProductName || p.Name || '',
                        Quantity: p.Quantity || 1,
                        Price: p.Price || 0,
                    }))
                    .filter((p) => p.ProductCode);
            }

            if (products.length === 0) {
                try {
                    products = await fetchProductsFromTPOS(orderId);
                } catch (e) {}
            }

            if (products.length === 0) continue;

            basesToSave.push({
                orderCode,
                orderId,
                campaignId,
                campaignName,
                userId,
                userName,
                stt,
                products,
            });
        }

        if (basesToSave.length === 0) return { saved: 0, skipped: 0, failed: 0 };

        // Check existing
        let existingSet = new Set();
        try {
            const { existing } = await kpiAPI('POST', '/kpi-base/check-exists', { orderCodes });
            existingSet = new Set(existing);
        } catch (e) {
            console.warn('[KPI] check-exists failed:', e.message);
        }

        const newBases = basesToSave.filter((b) => !existingSet.has(b.orderCode));
        if (newBases.length === 0) return { saved: 0, skipped: basesToSave.length, failed: 0 };

        // Batch save with retry
        let saved = 0,
            failed = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const result = await kpiAPI('POST', '/kpi-base/batch', { bases: newBases });
                saved = result.saved || 0;
                failed = 0;
                break;
            } catch (e) {
                console.warn(`[KPI] saveAutoBaseSnapshot attempt ${attempt}/3 failed:`, e.message);
                if (attempt < 3) await sleep(Math.pow(2, attempt - 1) * 1000);
                else failed = newBases.length;
            }
        }

        return { saved, skipped: existingSet.size, failed };
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

            // Sort logs theo thời gian ASC để áp dụng last-add-wins khi remove
            newProductLogs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            // Per-product attribution stack: { pid: [{userId, userName, qty}, ...] }
            // Mỗi 'add' push vào cuối; mỗi 'remove' pop ngược từ cuối (last-add-wins).
            const stackPerProduct = {};
            const netPerProduct = {};
            const perUserNames = {};

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
                if (log.userId && log.userName) perUserNames[log.userId] = log.userName;

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
                    // remaining > 0 → remove vượt số đã add (vd remove SP trong BASE
                    // nhưng filter BASE không bắt được). Bỏ qua, không trừ ai.
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
                    if (window.KpiSaleFlagStore && typeof window.KpiSaleFlagStore.load === 'function') {
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

            // Compute net per user from remaining stack entries
            const perUserNet = {};
            const perUserKPI = {};
            let totalNet = 0;
            let totalKPIAmount = 0;
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

                // (B) Strict mode: SP phải được sale tick flag mới được tính KPI.
                // Default FALSE (chưa check) → skip aggregation. Legacy (flagMap=null) → không filter.
                if (strictMode) {
                    const isSale = flagMap && flagMap.get(pid) === true;
                    if (!isSale) {
                        data.excludedBySaleFlag = true;
                        excludedCount++;
                        continue;  // NET hiển thị thật, nhưng KPI không cộng vào tổng
                    }
                }

                // (C) Aggregate per-user attribution + tổng KPI chỉ cho SP qualifying
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
                details: netPerProduct,
                baseProductCount: baseProductIds.size,
                perUserNet,
                perUserKPI,
                perUserNames,
                strictMode: !!strictMode,
                excludedCount,
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
            // Ưu tiên userName do caller truyền vào (từ audit log).
            // Fallback employee_ranges chỉ khi caller không cung cấp (vd. legacy callers).
            let userName = statistics.userName || null;
            if (!userName) {
                try {
                    const assigned = await getAssignedEmployeeForSTT(
                        statistics.stt,
                        statistics.campaignName
                    );
                    if (assigned.userName && assigned.userName !== 'Chưa phân')
                        userName = assigned.userName;
                } catch (e) {}
            }

            // Atomic server-side upsert — no client-side read-modify-write race condition
            await kpiAPI('PATCH', `/kpi-statistics/${encodeURIComponent(userId)}/${date}/order`, {
                orderCode: statistics.orderCode,
                orderId: statistics.orderId || null,
                stt: statistics.stt,
                campaignName: statistics.campaignName || null,
                netProducts: statistics.netProducts || 0,
                kpi: statistics.kpi || 0,
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

            // Use BASE creation date, not today — prevents same order appearing in multiple days
            const baseDate = base.createdAt
                ? new Date(base.createdAt).toISOString().substring(0, 10)
                : getCurrentDateString();

            // Wipe TẤT CẢ entries của orderCode này khỏi mọi user/date row trước khi
            // ghi lại (idempotent re-attribution: nếu trước đây ghi cho A nhưng giờ
            // tính cho B, A phải bị xóa). Server endpoint đã có sẵn, atomic.
            try {
                await kpiAPI('DELETE', `/kpi-statistics/order/${encodeURIComponent(orderCode)}`);
            } catch (e) {
                console.warn('[KPI] DELETE kpi-statistics/order failed (non-fatal):', e.message);
            }

            // Ghi entry cho TỪNG user có KPI > 0. Đơn không có upsell → không ghi entry nào.
            const userIds = Object.keys(result.perUserKPI || {});
            for (const userId of userIds) {
                const userKPI = result.perUserKPI[userId] || 0;
                const userNet = result.perUserNet[userId] || 0;
                if (userKPI <= 0) continue;

                await saveKPIStatistics(userId, baseDate, {
                    orderCode: orderCode,
                    orderId: base.orderId || null,
                    stt: stt,
                    campaignName: base.campaignName || null,
                    netProducts: userNet,
                    kpi: userKPI,
                    hasDiscrepancy: false,
                    details: result.details,
                    userName: result.perUserNames[userId] || null,
                });
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
    let _employeeRangesCache = null;
    let _employeeRangesCacheTime = 0;
    const RANGES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async function getAssignedEmployeeForSTT(stt, campaignName) {
        const unassigned = { userId: 'unassigned', userName: 'Chưa phân' };
        if (!stt && stt !== 0) return unassigned;

        try {
            const sttNum = Number(stt);

            // 1. Campaign-specific ranges (priority)
            if (campaignName) {
                try {
                    const safeName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                    const result = await fetch(
                        `${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(safeName)}`
                    ).then((r) => r.json());
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

            // 2. General ranges (all campaigns, cached)
            try {
                const now = Date.now();
                if (!_employeeRangesCache || now - _employeeRangesCacheTime > RANGES_CACHE_TTL) {
                    const result = await fetch(`${CAMPAIGNS_API}/employee-ranges`).then((r) =>
                        r.json()
                    );
                    if (result.success) {
                        _employeeRangesCache = result.rangesByCampaign || {};
                        _employeeRangesCacheTime = now;
                    }
                }
                if (_employeeRangesCache) {
                    for (const ranges of Object.values(_employeeRangesCache)) {
                        const found = _findInRanges(ranges, sttNum);
                        if (found) return found;
                    }
                }
            } catch (e) {}

            console.warn(`[KPI] STT ${stt} not found in any Employee_Range`);
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

            // Try to get current products from TPOS for cross-check
            const currentProducts = await fetchProductsFromTPOS(orderId);
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
        fetchProductsFromTPOS,
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
