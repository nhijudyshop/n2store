// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// MERGE ORDER PRODUCTS API FUNCTIONS
// =====================================================

/**
 * Normalize phone number for grouping duplicate orders.
 * Removes spaces/dots/dashes/parens và convert +84xxx → 0xxx.
 * Trả về '' nếu input rỗng hoặc không đạt min-length → caller skip không group
 * (tránh placeholder như "0", "000" gộp nhầm khách hàng khác nhau).
 */
function normalizeMergePhone(phone) {
    if (!phone) return '';
    let s = String(phone).trim().replace(/[\s\-\.()]/g, '');
    if (!s) return '';
    if (s.startsWith('+84')) s = '0' + s.slice(3);
    else if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
    // VN phone tối thiểu 9 chữ số (mobile 10, landline tối thiểu 9 khi chưa có mã vùng).
    // Nếu toàn ký tự không phải digit hoặc ngắn quá → không tin cậy để group.
    if (!/^\d{9,12}$/.test(s)) return '';
    return s;
}

/**
 * Get order details with products from API
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Order data with Details array
 */
async function getOrderDetails(orderId, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

            const response = await API_CONFIG.smartFetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                if (response.status === 502 && attempt < retries) {
                    console.warn(`[MERGE-API] 502 for order ${orderId}, retry ${attempt + 1}/${retries}...`);
                    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    continue;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[MERGE-API] Fetched order ${orderId} with ${data.Details?.length || 0} products`);
            return data;
        } catch (error) {
            if (attempt < retries) {
                console.warn(`[MERGE-API] Error for order ${orderId}, retry ${attempt + 1}/${retries}...`);
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            console.error(`[MERGE-API] Error fetching order ${orderId} after ${retries + 1} attempts:`, error);
            return null; // Return null instead of throwing - let caller handle gracefully
        }
    }
}

/**
 * Update order with full payload via API, with retry on transient failures.
 * @param {Object} orderData - Full order data (fetched from API)
 * @param {Array} newDetails - New Details array to set
 * @param {number} totalAmount - Total amount
 * @param {number} totalQuantity - Total quantity
 * @param {number} retries - Số lần retry khi gặp 502/503/504/timeout
 * @returns {Promise<Object>} Updated order data
 */
async function updateOrderWithFullPayload(orderData, newDetails, totalAmount, totalQuantity, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderData.Id})`;

        // Clone order data and prepare payload (same approach as prepareOrderPayload)
        const payload = JSON.parse(JSON.stringify(orderData));

        // Add @odata.context (CRITICAL for PUT request)
        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Get CreatedById from order or auth
        const createdById = orderData.CreatedById || orderData.UserId;

        // Update Details with new products - CLEAN UP to only include API-required fields
        payload.Details = (newDetails || []).map(detail => {
            // Only include fields that API expects
            const cleaned = {
                ProductId: detail.ProductId,
                Quantity: detail.Quantity,
                Price: detail.Price,
                Note: detail.Note || null,
                UOMId: detail.UOMId || 1,
                Factor: detail.Factor || 1,
                Priority: detail.Priority || 0,
                OrderId: orderData.Id,
                LiveCampaign_DetailId: detail.LiveCampaign_DetailId || null,
                ProductWeight: detail.ProductWeight || 0,
                ProductName: detail.ProductName,
                ProductNameGet: detail.ProductNameGet,
                ProductCode: detail.ProductCode,
                UOMName: detail.UOMName || 'Cái',
                ImageUrl: detail.ImageUrl || '',
                IsOrderPriority: detail.IsOrderPriority || null,
                QuantityRegex: detail.QuantityRegex || null,
                IsDisabledLiveCampaignDetail: detail.IsDisabledLiveCampaignDetail || false,
                CreatedById: detail.CreatedById || createdById  // CRITICAL: Add CreatedById
            };

            // Keep Id if it exists (for existing details)
            if (detail.Id) {
                cleaned.Id = detail.Id;
            }

            return cleaned;
        });

        // Update totals
        payload.TotalAmount = totalAmount || 0;
        payload.TotalQuantity = totalQuantity || 0;

        console.log(`[MERGE-API] Preparing PUT payload for order ${orderData.Id}:`, {
            detailsCount: payload.Details.length,
            totalAmount: payload.TotalAmount,
            totalQuantity: payload.TotalQuantity,
            hasContext: !!payload["@odata.context"],
            hasRowVersion: !!payload.RowVersion
        });

        // Build headers. DISABLED: If-Match header gây CORS preflight reject (CF Worker
        // CORS_HEADERS chưa whitelist "If-Match") → "Request header field if-match is not allowed".
        // RowVersion đã có trong payload body → TPOS vẫn có thể validate concurrency nội bộ.
        // Khi CF Worker được deploy với If-Match trong Allow-Headers, bật lại block dưới đây.
        const putHeaders = {
            ...headers,
            "Content-Type": "application/json",
            Accept: "application/json",
        };
        // NOTE: tạm thời disable until CF Worker allows If-Match header.
        // if (payload.RowVersion != null && payload.RowVersion !== '') {
        //     putHeaders["If-Match"] = `W/"${String(payload.RowVersion).replace(/"/g, '\\"')}"`;
        // }

        // Use direct fetch instead of smartFetch to avoid fallback issues
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: putHeaders,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Transient server errors → retry (502/503/504). Errors khác (400 validation, 409 conflict) fail fast.
            if ([502, 503, 504].includes(response.status) && attempt < retries) {
                console.warn(`[MERGE-API] PUT ${orderData.Id} HTTP ${response.status}, retry ${attempt + 1}/${retries}...`);
                lastError = new Error(`HTTP ${response.status}: ${errorText}`);
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            // Concurrency conflict (412/409 với message về RowVersion/ETag) → không retry, thông báo rõ
            if (response.status === 412 || (response.status === 409 && /rowversion|etag|concurren|conflict/i.test(errorText))) {
                console.error(`[MERGE-API] 🔀 Concurrency conflict PUT ${orderData.Id} (HTTP ${response.status}):`, errorText);
                const concErr = new Error(`Concurrency conflict: Đơn ${orderData.Id} đã bị sửa bởi user khác. Vui lòng load lại và thử lại.`);
                concErr.__noRetry = true;
                concErr.__concurrencyConflict = true;
                throw concErr;
            }
            console.error(`[MERGE-API] PUT failed:`, errorText);
            // Non-retryable HTTP (400/401/403/404/409/422/...) → throw với flag để catch không retry
            const httpErr = new Error(`HTTP ${response.status}: ${errorText}`);
            httpErr.__noRetry = true;
            throw httpErr;
        }

        // Handle empty response body (PUT often returns 200 OK with no content)
        let data = null;
        const responseText = await response.text();
        if (responseText && responseText.trim()) {
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.log(`[MERGE-API] Response is not JSON, treating as success`);
            }
        }

        console.log(`[MERGE-API] ✅ Updated order ${orderData.Id} with ${newDetails.length} products`);
        return data || { success: true, orderId: orderData.Id };
    } catch (error) {
        // Non-retryable HTTP (400/409/...) → throw ngay, không retry.
        // Chỉ retry khi là network error thuần (fetch reject, TypeError, timeout).
        lastError = error;
        if (error && error.__noRetry) {
            throw error;
        }
        if (attempt < retries) {
            console.warn(`[MERGE-API] PUT ${orderData.Id} network error, retry ${attempt + 1}/${retries}...`, error.message);
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
        }
        console.error(`[MERGE-API] Error updating order ${orderData.Id} after ${retries + 1} attempts:`, error);
        throw error;
    }
    }
    // Không nên tới đây, nhưng safety
    throw lastError || new Error(`[MERGE-API] Update failed for order ${orderData.Id}`);
}

// Export API functions for external modules
// Note: saveChatProductsToFirebase is defined in tab1-chat-products.js
if (typeof saveChatProductsToFirebase !== 'undefined') {
    window.saveChatProductsToFirebase = saveChatProductsToFirebase;
}
window.getOrderDetails = getOrderDetails;
window.updateOrderWithFullPayload = updateOrderWithFullPayload;

// Module-level lock tracking in-progress merges để tránh race condition khi user mở 2 tab
// cùng chạy merge trên cùng 1 target (second PUT sẽ overwrite first + mất products nguồn).
// Lock keyed by TargetOrderId; set khi bắt đầu, xóa trong finally.
// Shared qua window để live-waiting module cũng dùng được lock chung.
const _mergeInProgress = window.__merge_inprogress = window.__merge_inprogress || new Set();

/**
 * Acquire merge lock cho 1 target order. Return false nếu đã bị lock.
 * Caller PHẢI gọi releaseMergeLock trong finally.
 */
function acquireMergeLock(targetOrderId) {
    const key = String(targetOrderId || '');
    if (!key) return false;
    if (_mergeInProgress.has(key)) return false;
    _mergeInProgress.add(key);
    return true;
}

function releaseMergeLock(targetOrderId) {
    _mergeInProgress.delete(String(targetOrderId || ''));
}

window.acquireMergeLock = acquireMergeLock;
window.releaseMergeLock = releaseMergeLock;

/**
 * Execute product merge for a single merged order
 * @param {Object} mergedOrder - Merged order object with TargetOrderId and SourceOrderIds
 * @returns {Promise<Object>} Merge result
 */
async function executeMergeOrderProducts(mergedOrder) {
    if (!mergedOrder.IsMerged || !mergedOrder.TargetOrderId || !mergedOrder.SourceOrderIds || mergedOrder.SourceOrderIds.length === 0) {
        console.log('[MERGE-API] Not a merged order or no source orders to merge');
        return { success: false, message: 'Not a merged order' };
    }

    // Merge lock: cùng target đang chạy → từ chối để tránh race condition (data loss)
    const lockKey = String(mergedOrder.TargetOrderId);
    if (!acquireMergeLock(lockKey)) {
        console.warn(`[MERGE-API] 🔒 Target ${lockKey} đang gộp — từ chối concurrent merge`);
        return {
            success: false,
            message: `Đơn đích STT ${mergedOrder.TargetSTT} đang được gộp (tab khác?). Chờ hoàn tất rồi thử lại.`,
            locked: true
        };
    }

    try {
        console.log(`[MERGE-API] Starting merge for phone ${mergedOrder.Telephone}`);
        console.log(`[MERGE-API] Target: STT ${mergedOrder.TargetSTT} (${mergedOrder.TargetOrderId})`);
        console.log(`[MERGE-API] Sources: STT ${mergedOrder.SourceSTTs.join(', ')} (${mergedOrder.SourceOrderIds.length} orders)`);

        // Step 1: Fetch all order details
        const targetOrderData = await getOrderDetails(mergedOrder.TargetOrderId);
        if (!targetOrderData) {
            return { success: false, message: `Không thể tải đơn đích ${mergedOrder.TargetOrderId} (API lỗi 502)` };
        }
        const sourceOrdersData = await Promise.all(
            mergedOrder.SourceOrderIds.map(id => getOrderDetails(id))
        );
        const failedSources = sourceOrdersData.filter(d => !d);
        if (failedSources.length > 0) {
            return { success: false, message: `Không thể tải ${failedSources.length} đơn nguồn (API lỗi 502)` };
        }

        // Step 2: Collect all products and merge by ProductId
        const productMap = new Map(); // key: ProductId, value: product detail

        // Add target order products first
        (targetOrderData.Details || []).forEach(detail => {
            // Skip products without ProductId to avoid merging unrelated items under null key
            const key = detail.ProductId;
            if (!key) {
                console.warn(`[MERGE-API] Skipping product without ProductId: ${detail.ProductName || 'unknown'}`);
                // Still include it with a unique key so it's not lost
                productMap.set(`_noid_${productMap.size}`, { ...detail });
                return;
            }
            if (productMap.has(key)) {
                // Same product exists, merge quantity (with bounds check)
                const existing = productMap.get(key);
                const newQty = (existing.Quantity || 0) + (detail.Quantity || 0);
                existing.Quantity = Math.min(newQty, 999999); // Prevent overflow
                existing.Price = detail.Price; // Keep latest price
            } else {
                productMap.set(key, { ...detail });
            }
        });

        // Add source order products — skip null sourceOrders from failed fetches
        const priceDiffs = []; // Cảnh báo khi source/target có giá khác nhau cho cùng ProductId
        sourceOrdersData.forEach((sourceOrder, index) => {
            if (!sourceOrder) {
                console.error(`[MERGE-API] Source order at index ${index} is null, skipping`);
                return;
            }
            const sourceProducts = sourceOrder.Details || [];
            const sourceSTT = mergedOrder.SourceSTTs[index];
            console.log(`[MERGE-API] Source STT ${sourceSTT}: ${sourceProducts.length} products`);

            sourceProducts.forEach(detail => {
                const key = detail.ProductId;
                if (!key) {
                    productMap.set(`_noid_${productMap.size}`, { ...detail });
                    return;
                }
                if (productMap.has(key)) {
                    // Same product exists → cộng quantity (bounds check) + concat note + warn giá khác
                    const existing = productMap.get(key);
                    const newQty = (existing.Quantity || 0) + (detail.Quantity || 0);
                    existing.Quantity = Math.min(newQty, 999999);
                    // Concat note từ source vào existing nếu chưa có
                    if (detail.Note && !(existing.Note || '').includes(detail.Note)) {
                        existing.Note = existing.Note ? `${existing.Note}, ${detail.Note}` : detail.Note;
                    }
                    // Cảnh báo nếu giá source khác target (target price giữ nguyên — điều chỉnh manual nếu cần)
                    if (detail.Price != null && existing.Price != null && Number(detail.Price) !== Number(existing.Price)) {
                        priceDiffs.push({
                            sourceSTT,
                            productId: key,
                            productName: detail.ProductName || detail.ProductNameGet || '?',
                            targetPrice: Number(existing.Price),
                            sourcePrice: Number(detail.Price)
                        });
                    }
                    console.log(`[MERGE-API] Merged duplicate ProductId ${key}: new qty = ${existing.Quantity}`);
                } else {
                    productMap.set(key, { ...detail });
                }
            });
        });

        if (priceDiffs.length > 0) {
            console.warn(`[MERGE-API] ⚠️ ${priceDiffs.length} product(s) có giá khác giữa source/target — target price giữ nguyên:`, priceDiffs);
        }

        // Convert map to array
        const allProducts = Array.from(productMap.values());

        // Calculate totals from merged products
        let totalAmount = 0;
        let totalQuantity = 0;
        allProducts.forEach(p => {
            totalAmount += (p.Price || 0) * (p.Quantity || 0);
            totalQuantity += (p.Quantity || 0);
        });

        console.log(`[MERGE-API] Total products to merge: ${allProducts.length}`);
        console.log(`[MERGE-API] Total amount: ${totalAmount}, Total quantity: ${totalQuantity}`);

        // Step 3: Update target order with all products (using full payload)
        // Nếu target PUT fail → không có side-effect, các source vẫn nguyên vẹn → safe abort.
        await updateOrderWithFullPayload(targetOrderData, allProducts, totalAmount, totalQuantity);
        console.log(`[MERGE-API] ✅ Updated target order STT ${mergedOrder.TargetSTT} with ${allProducts.length} products`);

        // Step 4: Clear products from source orders (using full payload).
        // CRITICAL: target đã nhận tất cả products → MỖI source clear fail = duplicate products!
        // Vì vậy: track per-source, KHÔNG throw, trả kết quả chi tiết cho caller quyết định.
        const sourceClearResults = [];
        const failedSourceSTTs = [];
        for (let i = 0; i < mergedOrder.SourceOrderIds.length; i++) {
            const sourceOrder = sourceOrdersData[i];
            const sourceId = mergedOrder.SourceOrderIds[i];
            const sourceSTT = mergedOrder.SourceSTTs[i];

            if (!sourceOrder) {
                console.warn(`[MERGE-API] Source order index ${i} is null, skipping clear`);
                sourceClearResults.push({ sourceId, sourceSTT, cleared: false, reason: 'fetch-null' });
                failedSourceSTTs.push(sourceSTT);
                continue;
            }
            try {
                await updateOrderWithFullPayload(sourceOrder, [], 0, 0);
                console.log(`[MERGE-API] ✅ Cleared products from source order STT ${sourceSTT}`);
                sourceClearResults.push({ sourceId, sourceSTT, cleared: true });
            } catch (clearErr) {
                console.error(`[MERGE-API] ❌ Failed to clear source STT ${sourceSTT} (${sourceId}):`, clearErr);
                sourceClearResults.push({ sourceId, sourceSTT, cleared: false, reason: clearErr.message || 'clear-fail' });
                failedSourceSTTs.push(sourceSTT);
            }
        }

        const clearedCount = sourceClearResults.filter(r => r.cleared).length;
        const failedClearCount = sourceClearResults.length - clearedCount;

        // Snapshot pre-merge Details cho history (bulk path cần vì displayedData không có Details)
        const preMergeTargetDetails = Array.isArray(targetOrderData.Details) ? targetOrderData.Details : [];
        const preMergeSourceDetails = sourceOrdersData.map(so => Array.isArray(so?.Details) ? so.Details : []);

        if (failedClearCount > 0) {
            // ⚠️ Target đã có đủ products nhưng source chưa được clear → DUPLICATE RISK.
            // Return partial success để caller hiển thị rõ tình trạng và người dùng có thể retry thủ công.
            console.error(`[MERGE-API] ⚠️ PARTIAL MERGE: Target đã cập nhật nhưng ${failedClearCount}/${sourceClearResults.length} source KHÔNG clear được. DUPLICATE PRODUCTS RISK!`);
            return {
                success: false,
                partial: true,
                message: `Target STT ${mergedOrder.TargetSTT} đã gộp xong, NHƯNG ${failedClearCount}/${sourceClearResults.length} đơn nguồn (STT ${failedSourceSTTs.join(', ')}) KHÔNG clear được → CẢNH BÁO: sản phẩm có thể bị trùng trên cả 2 đơn. Hãy kiểm tra và xóa thủ công các STT nguồn này.`,
                targetSTT: mergedOrder.TargetSTT,
                sourceSTTs: mergedOrder.SourceSTTs,
                sourceClearResults,
                failedSourceSTTs,
                totalProducts: allProducts.length,
                priceDiffs,
                mergedProducts: allProducts,
                preMergeTargetDetails,
                preMergeSourceDetails
            };
        }

        console.log(`[MERGE-API] ✅ Merge completed successfully!`);

        // KPI: Merge (gộp đơn trùng SĐT) không liên quan KPI upselling - đã loại bỏ

        return {
            success: true,
            message: `Đã gộp ${sourceOrdersData.length} đơn vào STT ${mergedOrder.TargetSTT}`,
            targetSTT: mergedOrder.TargetSTT,
            sourceSTTs: mergedOrder.SourceSTTs,
            sourceClearResults,
            priceDiffs,
            totalProducts: allProducts.length,
            mergedProducts: allProducts,
            preMergeTargetDetails,
            preMergeSourceDetails
        };

    } catch (error) {
        console.error('[MERGE-API] Error during merge:', error);

        // Extract error response for history logging
        let errorResponse = null;
        if (error.message) {
            // Try to extract HTTP response from error message (format: "HTTP XXX: {response}")
            const httpMatch = error.message.match(/^HTTP \d+:\s*(.+)$/s);
            if (httpMatch) {
                errorResponse = httpMatch[1];
            } else {
                errorResponse = error.message;
            }
        }

        return {
            success: false,
            message: 'Lỗi: ' + error.message,
            error: error,
            errorResponse: errorResponse,
            concurrencyConflict: !!(error && error.__concurrencyConflict)
        };
    } finally {
        releaseMergeLock(lockKey);
    }
}

/**
 * Execute product merge for all merged orders in current displayed data
 * @returns {Promise<Object>} Bulk merge result
 */
async function executeBulkMergeOrderProducts() {
    try {
        // Group orders by NORMALIZED phone number to find duplicates
        // (handles +84xxx vs 0xxx, spaces, dashes...)
        const phoneGroups = new Map();
        displayedData.forEach(order => {
            const phone = normalizeMergePhone(order.Telephone);
            if (phone) {
                if (!phoneGroups.has(phone)) {
                    phoneGroups.set(phone, []);
                }
                phoneGroups.get(phone).push(order);
            }
        });

        // Find phone numbers with multiple orders (need merging).
        // Giữ reference tới full order objects để có Tags (cho assignTagsAfterMerge)
        const mergeableGroups = [];
        phoneGroups.forEach((orders, phone) => {
            if (orders.length > 1) {
                // Sort by SessionIndex (STT) descending - target is highest STT
                orders.sort((a, b) => (b.SessionIndex || 0) - (a.SessionIndex || 0));
                const targetOrder = orders[0];
                const sourceOrders = orders.slice(1);

                mergeableGroups.push({
                    Telephone: targetOrder.Telephone || phone,
                    TargetOrderId: targetOrder.Id,
                    TargetSTT: targetOrder.SessionIndex,
                    SourceOrderIds: sourceOrders.map(o => o.Id),
                    SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                    IsMerged: true,
                    // Lưu full order objects để tag assignment sau merge
                    _targetOrder: targetOrder,
                    _sourceOrders: sourceOrders,
                    _allOrders: orders // sorted DESC, target ở đầu
                });
            }
        });

        if (mergeableGroups.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.show('Không có đơn hàng nào trùng SĐT cần gộp sản phẩm.', 'warning');
            }
            return { success: false, message: 'No duplicate phone orders found' };
        }

        const totalSourceOrders = mergeableGroups.reduce((sum, g) => sum + g.SourceOrderIds.length, 0);
        const confirmMsg = `Tìm thấy ${mergeableGroups.length} SĐT trùng (${totalSourceOrders + mergeableGroups.length} đơn).\n\n` +
            `Hành động này sẽ:\n` +
            `- Gộp sản phẩm từ đơn STT nhỏ → đơn STT lớn\n` +
            `- Xóa sản phẩm khỏi ${totalSourceOrders} đơn nguồn\n` +
            `- Gán tag "ĐÃ GỘP KO CHỐT" cho đơn nguồn, tag "Gộp X Y Z" cho đơn đích`;

        const confirmed = await window.notificationManager.confirm(confirmMsg, "Xác nhận gộp sản phẩm");
        if (!confirmed) {
            return { success: false, message: 'Cancelled by user' };
        }

        // Show loading indicator
        if (window.notificationManager) {
            window.notificationManager.show(`Đang gộp sản phẩm cho ${mergeableGroups.length} SĐT...`, 'info');
        }

        // Load available tags trước để tag assignment có Id đúng
        try { await loadAvailableTags(); } catch (e) { console.warn('[MERGE-BULK] loadAvailableTags fail:', e); }

        // Execute merge for each phone group
        const results = [];
        for (let i = 0; i < mergeableGroups.length; i++) {
            const group = mergeableGroups[i];
            console.log(`[MERGE-BULK] Processing ${i + 1}/${mergeableGroups.length}: Phone ${group.Telephone}`);

            const result = await executeMergeOrderProducts(group);
            results.push({ order: group, result });

            // Gán tag sau khi merge (BUG-2: bulk path trước đây skip tag — gây mất audit trail).
            // Enrich cluster với Details từ pre-merge snapshot (result.preMergeTargetDetails/
            // preMergeSourceDetails) để history có sản phẩm thực thay vì rỗng.
            if (result.success || result.partial) {
                const baseCluster = {
                    phone: group.Telephone,
                    targetOrder: {
                        ...group._targetOrder,
                        Details: result.preMergeTargetDetails || []
                    },
                    sourceOrders: group._sourceOrders.map((s, i) => ({
                        ...s,
                        Details: (result.preMergeSourceDetails || [])[i] || []
                    })),
                    orders: group._allOrders, // DESC — assignTagsAfterMerge sort nội bộ nên thứ tự không matter
                    mergedProducts: result.mergedProducts || []
                };
                const clusterForTagging = result.partial
                    ? buildPartialTagCluster(baseCluster, result.sourceClearResults)
                    : baseCluster;

                try {
                    const tagResult = await assignTagsAfterMerge(clusterForTagging);
                    if (!tagResult.success) {
                        console.warn(`[MERGE-BULK] Tag assignment fail for ${group.Telephone}:`, tagResult.error);
                    }
                } catch (tagErr) {
                    console.warn(`[MERGE-BULK] Tag assignment error for ${group.Telephone}:`, tagErr);
                }

                // Save history với Details đầy đủ (không còn empty products như trước)
                if (typeof saveMergeHistory === 'function') {
                    try {
                        await saveMergeHistory(baseCluster, result, result.errorResponse || null);
                    } catch (historyErr) {
                        console.warn(`[MERGE-BULK] saveMergeHistory fail for ${group.Telephone}:`, historyErr);
                    }
                }

                // Mark PBH merge-cancelled cho source đã clear
                const clearedIds = (result.sourceClearResults || []).filter(r => r.cleared).map(r => r.sourceId);
                if (clearedIds.length > 0 && typeof markSourceOrdersMergeCancelled === 'function') {
                    try {
                        markSourceOrdersMergeCancelled(clearedIds);
                    } catch (pbhErr) {
                        console.warn(`[MERGE-BULK] markSourceOrdersMergeCancelled fail for ${group.Telephone}:`, pbhErr);
                    }
                }
            }

            // Small delay to avoid rate limiting
            if (i < mergeableGroups.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Count successes, partials, failures — phân loại concurrency & locked, tập hợp (không ẩn)
        const successCount = results.filter(r => r.result.success).length;
        const partialList = results.filter(r => !r.result.success && r.result.partial);
        const concurrencyList = results.filter(r => !r.result.success && r.result.concurrencyConflict);
        const lockedList = results.filter(r => !r.result.success && r.result.locked);
        const genericFails = results.filter(r =>
            !r.result.success
            && !r.result.partial
            && !r.result.concurrencyConflict
            && !r.result.locked
        );
        const failureCount = results.length - successCount;

        // Show summary — tập hợp tất cả failure categories
        if (window.notificationManager) {
            if (failureCount === 0) {
                window.notificationManager.show(
                    `Đã gộp sản phẩm thành công cho ${successCount} đơn hàng!`,
                    'success',
                    5000
                );
            } else {
                const parts = [];
                if (partialList.length > 0) {
                    const details = partialList
                        .map(r => `${r.order.Telephone} (STT nguồn chưa clear: ${(r.result.failedSourceSTTs || []).join(',')})`)
                        .join('; ');
                    parts.push(`⚠️ ${partialList.length} GỘP DANG DỞ: ${details}`);
                }
                if (concurrencyList.length > 0) {
                    parts.push(`🔀 ${concurrencyList.length} CONFLICT: ${concurrencyList.map(r => r.order.Telephone).join(', ')} — load lại rồi thử lại`);
                }
                if (lockedList.length > 0) {
                    parts.push(`🔒 ${lockedList.length} BỊ LOCK: ${lockedList.map(r => r.order.Telephone).join(', ')}`);
                }
                if (genericFails.length > 0) {
                    parts.push(`❌ ${genericFails.length} LỖI: ${genericFails.map(r => r.order.Telephone).join(', ')}`);
                }
                const level = partialList.length > 0 || concurrencyList.length > 0 ? 'error' : 'warning';
                window.notificationManager.show(
                    `Gộp ${successCount}/${results.length} đơn. ${parts.join(' | ')}`,
                    level,
                    12000
                );
            }
        }
        // Refresh table - fetch fresh data from API and re-render
        try {
            // Reload orders data from current campaign
            await fetchOrders();
            // renderTable and updateStats are called inside fetchOrders flow
        } catch (refreshError) {
            console.warn('[MERGE-BULK] Could not auto-refresh, please reload manually:', refreshError);
            // Fallback: just re-render with current data
            renderTable();
            updateStats();
        }

        return {
            success: true,
            totalOrders: results.length,
            successCount,
            failureCount,
            results
        };

    } catch (error) {
        console.error('[MERGE-BULK] Error during bulk merge:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gộp sản phẩm: ' + error.message, 'error', 5000);
        }
        return { success: false, message: error.message, error };
    }
}

// Make function globally accessible
window.executeMergeOrderProducts = executeMergeOrderProducts;
window.executeBulkMergeOrderProducts = executeBulkMergeOrderProducts;

// =====================================================
// MERGE DUPLICATE ORDERS MODAL FUNCTIONS
// =====================================================

// Store merge clusters data for modal
let mergeClustersData = [];
let selectedMergeClusters = new Set();

/**
 * Show modal with duplicate orders preview
 */
async function showMergeDuplicateOrdersModal() {
    const modal = document.getElementById('mergeDuplicateOrdersModal');
    const modalBody = document.getElementById('mergeDuplicateModalBody');
    const subtitle = document.getElementById('mergeDuplicateModalSubtitle');
    const selectAllCheckbox = document.getElementById('mergeSelectAllCheckbox');

    // Reset state
    mergeClustersData = [];
    selectedMergeClusters.clear();
    selectAllCheckbox.checked = false;

    // Show modal with loading state
    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải dữ liệu đơn hàng...</p>
        </div>
    `;

    try {
        // Group orders by NORMALIZED phone number to find duplicates
        // (handles +84xxx vs 0xxx, spaces, dashes...)
        const phoneGroups = new Map();
        displayedData.forEach(order => {
            const phone = normalizeMergePhone(order.Telephone);
            if (phone) {
                if (!phoneGroups.has(phone)) {
                    phoneGroups.set(phone, []);
                }
                phoneGroups.get(phone).push(order);
            }
        });

        // Find phone numbers with multiple orders (need merging)
        const clusters = [];
        phoneGroups.forEach((orders, phone) => {
            if (orders.length > 1) {
                // Sort by SessionIndex (STT) ascending for display
                orders.sort((a, b) => (a.SessionIndex || 0) - (b.SessionIndex || 0));

                // Target is highest STT (last after sort)
                const targetOrder = orders[orders.length - 1];
                const sourceOrders = orders.slice(0, -1);

                clusters.push({
                    phone: targetOrder.Telephone || phone,  // Display original target phone
                    orders: orders,
                    targetOrder,
                    sourceOrders,
                    minSTT: orders[0].SessionIndex || 0
                });
            }
        });

        if (clusters.length === 0) {
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-check-circle"></i>
                    <p>Không có đơn hàng nào trùng SĐT cần gộp.</p>
                </div>
            `;
            subtitle.textContent = 'Không tìm thấy đơn trùng';
            return;
        }

        // Sort clusters by minSTT
        clusters.sort((a, b) => a.minSTT - b.minSTT);

        // Fetch full details for all orders in all clusters
        const allOrderIds = clusters.flatMap(c => c.orders.map(o => o.Id));
        const orderDetailsMap = new Map();

        // Update loading message
        modalBody.innerHTML = `
            <div class="merge-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải chi tiết ${allOrderIds.length} đơn hàng...</p>
            </div>
        `;

        // Fetch details in batches to avoid rate limiting
        const batchSize = 5;
        let failedCount = 0;
        for (let i = 0; i < allOrderIds.length; i += batchSize) {
            const batch = allOrderIds.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(id => getOrderDetails(id)));
            results.forEach((detail, idx) => {
                if (detail) {
                    orderDetailsMap.set(batch[idx], detail);
                } else {
                    failedCount++;
                    console.warn(`[MERGE-MODAL] Failed to fetch details for order ${batch[idx]}, will show without products`);
                }
            });

            // Update loading progress
            const loaded = Math.min(i + batchSize, allOrderIds.length);
            modalBody.innerHTML = `
                <div class="merge-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Đang tải chi tiết ${loaded}/${allOrderIds.length} đơn hàng...${failedCount > 0 ? ` (${failedCount} lỗi)` : ''}</p>
                </div>
            `;

            // Small delay between batches
            if (i + batchSize < allOrderIds.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // Build clusters with full product details
        mergeClustersData = clusters.map((cluster, index) => {
            const ordersWithDetails = cluster.orders.map(order => {
                const apiOrderData = orderDetailsMap.get(order.Id);

                // Tags lấy từ displayedData (đã có sẵn, không cần từ API)
                // Chỉ cần Details từ API vì displayedData không có chi tiết sản phẩm
                console.log(`[MERGE-MODAL] Order STT ${order.SessionIndex}: Tags from displayedData: ${order.Tags || '(empty)'}`);

                return {
                    ...order,
                    Details: apiOrderData?.Details || []
                    // Tags giữ nguyên từ ...order (displayedData)
                };
            });

            // Calculate merged products preview — truyền targetOrderId để preview
            // process target-first (giữ giá target) khớp với executeMergeOrderProducts
            const targetOrderForPreview = ordersWithDetails[ordersWithDetails.length - 1];
            const mergedProducts = calculateMergedProductsPreview(ordersWithDetails, targetOrderForPreview.Id);

            return {
                id: `cluster_${index}`,
                phone: cluster.phone,
                orders: ordersWithDetails,
                targetOrder: ordersWithDetails[ordersWithDetails.length - 1],
                sourceOrders: ordersWithDetails.slice(0, -1),
                mergedProducts
            };
        });

        // Render clusters
        renderMergeClusters();

        const totalSourceOrders = mergeClustersData.reduce((sum, c) => sum + c.sourceOrders.length, 0);
        subtitle.textContent = `Tìm thấy ${mergeClustersData.length} SĐT trùng (${totalSourceOrders + mergeClustersData.length} đơn)`;

    } catch (error) {
        console.error('[MERGE-MODAL] Error loading data:', error);
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi khi tải dữ liệu: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Calculate merged products preview for a cluster.
 * Phải khớp 1:1 với logic trong executeMergeOrderProducts:
 *   - Target order xử lý TRƯỚC → giá target giữ nguyên khi source có cùng ProductId
 *   - `_noid_${size}` synthetic key cho products thiếu ProductId (tránh null collision)
 *   - Bounds check quantity 999999
 *   - Concat source note vào target note với ", "
 *
 * Caller thường truyền `orders` sort ASC theo STT (target cuối) từ modal; function
 * này tự reorder target-first để đảm bảo price priority khớp với API thực.
 */
function calculateMergedProductsPreview(orders, targetOrderId = null) {
    const productMap = new Map();
    // Reorder: target first, sources theo thứ tự gốc
    const ordered = targetOrderId
        ? [
            ...orders.filter(o => String(o.Id) === String(targetOrderId)),
            ...orders.filter(o => String(o.Id) !== String(targetOrderId))
          ]
        : (orders.length > 1
            // Fallback heuristic: STT cao nhất = target → đưa lên đầu
            ? [...orders].sort((a, b) => (b.SessionIndex || 0) - (a.SessionIndex || 0))
            : orders);

    ordered.forEach(order => {
        (order.Details || []).forEach(detail => {
            const key = detail.ProductId;
            if (!key) {
                productMap.set(`_noid_${productMap.size}`, { ...detail });
                return;
            }
            if (productMap.has(key)) {
                const existing = productMap.get(key);
                const newQty = (existing.Quantity || 0) + (detail.Quantity || 0);
                existing.Quantity = Math.min(newQty, 999999);
                // Giá target (insert đầu tiên) được giữ nguyên — khớp với executeMergeOrderProducts
                if (detail.Note && !existing.Note?.includes(detail.Note)) {
                    existing.Note = existing.Note ? `${existing.Note}, ${detail.Note}` : detail.Note;
                }
            } else {
                productMap.set(key, { ...detail });
            }
        });
    });

    return Array.from(productMap.values());
}

/**
 * Render tag pills for merge modal headers
 * @param {string|Array} tags - Tags as JSON string or array
 * @returns {string} HTML string of tag pills
 */
function renderMergeTagPills(tags) {
    let tagsArray = [];

    if (!tags) return '';

    // Parse tags if string
    if (typeof tags === 'string' && tags.trim() !== '') {
        try {
            tagsArray = JSON.parse(tags);
        } catch (e) {
            console.warn('[renderMergeTagPills] Failed to parse tags:', tags);
            return '';
        }
    } else if (Array.isArray(tags)) {
        tagsArray = tags;
    }

    if (!Array.isArray(tagsArray) || tagsArray.length === 0) return '';

    const pillsHtml = tagsArray.map(t =>
        `<span class="merge-tag-pill" style="background: ${t.Color || '#6b7280'};" title="${escapeHtml(t.Name || '')}">${escapeHtml(t.Name || '')}</span>`
    ).join('');

    return `<div class="merge-header-tags">${pillsHtml}</div>`;
}

/**
 * Render all merge clusters in modal
 */
function renderMergeClusters() {
    const modalBody = document.getElementById('mergeDuplicateModalBody');

    if (mergeClustersData.length === 0) {
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-check-circle"></i>
                <p>Không có đơn hàng nào trùng SĐT cần gộp.</p>
            </div>
        `;
        return;
    }

    const html = mergeClustersData.map(cluster => renderClusterCard(cluster)).join('');
    modalBody.innerHTML = html;

    updateConfirmButtonState();
}

/**
 * Safe HTML escape local cho merge module — coerce về string trước khi replace.
 * Lý do: tab1-chat-messages.js load sau và override window.escapeHtml bằng version
 * gọi .replace() trực tiếp → crash với number/null input (TypeError).
 */
function _escMerge(v) {
    if (v == null) return '';
    const s = String(v);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render a single cluster card.
 * BUG-10: PartnerName/Telephone/ProductName/Note đến từ TPOS — phải escape khi inject vào innerHTML.
 */
function renderClusterCard(cluster) {
    const esc = _escMerge;
    const isSelected = selectedMergeClusters.has(cluster.id);
    const orderTitles = cluster.orders
        .map(o => `STT ${esc(o.SessionIndex)} - ${esc(o.PartnerName || 'N/A')}`)
        .join(' | ');

    // Compute merged tags preview (mirror assignTagsAfterMerge logic)
    const mergedTagsPreview = calculateMergedTagsPreview(cluster);
    const mergedTagsHtml = mergedTagsPreview.length > 0
        ? renderMergeTagPills(mergedTagsPreview)
        : `<div class="merge-header-tags merge-empty"><span class="merge-tag-pill" style="background:#9ca3af;">Không có tag</span></div>`;

    // Build table headers
    const headers = [
        `<th class="merged-col">
            Sau Khi Gộp<br><small>(STT ${esc(cluster.targetOrder.SessionIndex)})</small>
            ${mergedTagsHtml}
        </th>`
    ];

    cluster.orders.forEach(order => {
        const isTarget = order.Id === cluster.targetOrder.Id;
        const className = isTarget ? 'target-col' : '';
        const targetLabel = isTarget ? ' (Đích)' : '';

        // Target header: current tags. Source header: preview tags SAU merge
        // (để khớp với cột "Sau Khi Gộp" — user thấy ngay STT 17 sẽ có "Gộp X Y")
        const tagsHtml = isTarget
            ? renderMergeTagPills(order.Tags)
            : renderMergeTagPills(calculateSourceTagsPreview(order, cluster));

        headers.push(`<th class="${className}">
            STT ${esc(order.SessionIndex)} - ${esc(order.PartnerName || 'N/A')}${targetLabel}
            ${tagsHtml}
        </th>`);
    });

    // Find max products count for rows
    const maxProducts = Math.max(
        cluster.mergedProducts.length,
        ...cluster.orders.map(o => (o.Details || []).length)
    );

    // Build table rows
    const rows = [];
    for (let i = 0; i < maxProducts; i++) {
        const cells = [];

        // Merged column
        const mergedProduct = cluster.mergedProducts[i];
        cells.push(`<td class="merged-col">${mergedProduct ? renderProductItem(mergedProduct) : ''}</td>`);

        // Order columns
        cluster.orders.forEach(order => {
            const isTarget = order.Id === cluster.targetOrder.Id;
            const className = isTarget ? 'target-col' : '';
            const product = (order.Details || [])[i];
            cells.push(`<td class="${className}">${product ? renderProductItem(product) : ''}</td>`);
        });

        rows.push(`<tr>${cells.join('')}</tr>`);
    }

    // If no products at all
    if (maxProducts === 0) {
        const emptyCells = ['<td class="merged-col"><div class="merge-empty-cell">Trống</div></td>'];
        cluster.orders.forEach(order => {
            const isTarget = order.Id === cluster.targetOrder.Id;
            const className = isTarget ? 'target-col' : '';
            emptyCells.push(`<td class="${className}"><div class="merge-empty-cell">Trống</div></td>`);
        });
        rows.push(`<tr>${emptyCells.join('')}</tr>`);
    }

    return `
        <div class="merge-cluster-card ${isSelected ? 'selected' : ''}" data-cluster-id="${esc(cluster.id)}">
            <div class="merge-cluster-header">
                <input type="checkbox" class="merge-cluster-checkbox"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleMergeClusterSelection('${esc(cluster.id)}', this.checked)">
                <div class="merge-cluster-title"># ${orderTitles}</div>
                <div class="merge-cluster-phone"><i class="fas fa-phone"></i> ${esc(cluster.phone)}</div>
            </div>
            <div class="merge-cluster-table-wrapper">
                <table class="merge-cluster-table">
                    <thead>
                        <tr>${headers.join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render a single product item.
 * BUG-10: ProductName/ProductCode/Note đến từ TPOS — escape khi inject vào innerHTML.
 * ImageUrl chỉ dùng trong attribute src → validate scheme để chống javascript: URIs.
 */
function renderProductItem(product) {
    const esc = _escMerge;
    const rawImg = product.ProductImageUrl || product.ImageUrl || '';
    const imgUrl = /^(https?:|\/\/|data:image\/)/i.test(rawImg) ? rawImg : '';
    const imgHtml = imgUrl
        ? `<img src="${esc(imgUrl)}" alt="" class="merge-product-img" onerror="this.style.display='none'">`
        : `<div class="merge-product-img" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;"><i class="fas fa-box"></i></div>`;

    const productCode = product.ProductCode || product.ProductName?.match(/\[([^\]]+)\]/)?.[1] || '';
    const productName = product.ProductName || product.ProductNameGet || 'Sản phẩm';
    const price = product.Price ? `${(product.Price).toLocaleString('vi-VN')}đ` : '';
    const note = product.Note || '';

    return `
        <div class="merge-product-item">
            ${imgHtml}
            <div class="merge-product-info">
                <div class="merge-product-name" title="${esc(productName)}">${esc(productName)}</div>
                ${productCode ? `<span class="merge-product-code">${esc(productCode)}</span>` : ''}
                <div class="merge-product-details">
                    <span class="qty">SL: ${esc(product.Quantity || 0)}</span>
                    ${price ? ` | <span class="price">${esc(price)}</span>` : ''}
                </div>
                ${note ? `<div class="merge-product-note">Note: ${esc(note)}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Toggle selection for a single cluster
 */
function toggleMergeClusterSelection(clusterId, checked) {
    if (checked) {
        selectedMergeClusters.add(clusterId);
    } else {
        selectedMergeClusters.delete(clusterId);
    }

    // Update card visual
    const card = document.querySelector(`.merge-cluster-card[data-cluster-id="${clusterId}"]`);
    if (card) {
        card.classList.toggle('selected', checked);
    }

    // Update select all checkbox
    updateMergeSelectAllCheckbox();
    updateConfirmButtonState();
}

/**
 * Toggle select all clusters
 */
function toggleSelectAllMergeClusters(checked) {
    if (checked) {
        mergeClustersData.forEach(cluster => {
            selectedMergeClusters.add(cluster.id);
        });
    } else {
        selectedMergeClusters.clear();
    }

    // Update all checkboxes and cards
    document.querySelectorAll('.merge-cluster-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
    });
    document.querySelectorAll('.merge-cluster-card').forEach(card => {
        card.classList.toggle('selected', checked);
    });

    updateConfirmButtonState();
}

/**
 * Update select all checkbox state based on individual selections
 */
function updateMergeSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('mergeSelectAllCheckbox');
    if (mergeClustersData.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedMergeClusters.size === mergeClustersData.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedMergeClusters.size === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

/**
 * Update confirm button state
 */
function updateConfirmButtonState() {
    const confirmBtn = document.getElementById('confirmMergeBtn');
    confirmBtn.disabled = selectedMergeClusters.size === 0;
}

/**
 * Close the merge modal
 */
function closeMergeDuplicateOrdersModal() {
    const modal = document.getElementById('mergeDuplicateOrdersModal');
    modal.classList.remove('show');

    // Reset state
    mergeClustersData = [];
    selectedMergeClusters.clear();
}

/**
 * Confirm and execute merge for selected clusters
 */
async function confirmMergeSelectedClusters() {
    if (selectedMergeClusters.size === 0) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng chọn ít nhất một cụm đơn hàng để gộp.', 'warning');
        }
        return;
    }

    const selectedClusters = mergeClustersData.filter(c => selectedMergeClusters.has(c.id));
    const totalSourceOrders = selectedClusters.reduce((sum, c) => sum + c.sourceOrders.length, 0);

    const confirmMsg = `Bạn sắp gộp ${selectedClusters.length} cụm đơn hàng (${totalSourceOrders + selectedClusters.length} đơn).\n\n` +
        `Hành động này sẽ:\n` +
        `- Gộp sản phẩm từ đơn STT nhỏ → đơn STT lớn\n` +
        `- Xóa sản phẩm khỏi ${totalSourceOrders} đơn nguồn\n\n` +
        `Tiếp tục?`;

    const confirmed = await window.notificationManager.confirm(confirmMsg, "Xác nhận gộp đơn");
    if (!confirmed) {
        return;
    }

    // Close modal and show loading
    closeMergeDuplicateOrdersModal();

    if (window.notificationManager) {
        window.notificationManager.show(`Đang gộp sản phẩm cho ${selectedClusters.length} cụm...`, 'info');
    }

    // Load available tags before merge (needed for tag assignment)
    await loadAvailableTags();

    // Execute merge for each selected cluster
    const results = [];
    for (let i = 0; i < selectedClusters.length; i++) {
        const cluster = selectedClusters[i];
        console.log(`[MERGE-MODAL] Processing ${i + 1}/${selectedClusters.length}: Phone ${cluster.phone}`);

        const mergeData = {
            Telephone: cluster.phone,
            TargetOrderId: cluster.targetOrder.Id,
            TargetSTT: cluster.targetOrder.SessionIndex,
            SourceOrderIds: cluster.sourceOrders.map(o => o.Id),
            SourceSTTs: cluster.sourceOrders.map(o => o.SessionIndex),
            IsMerged: true
        };

        const result = await executeMergeOrderProducts(mergeData);
        results.push({ cluster, result });

        // Save merge history to Firebase (before tag assignment to capture original tags)
        await saveMergeHistory(cluster, result, result.errorResponse || null);

        // Assign tags trong 2 trường hợp:
        // 1) success=true: gán tag đầy đủ cho target + tất cả source
        // 2) partial=true: target đã có đủ products → vẫn cần tag target, CHỈ gán "ĐÃ GỘP KO CHỐT"
        //    cho các source đã clear thành công (source chưa clear giữ nguyên tag cũ để user retry)
        const clusterForTagging = result.success
            ? cluster
            : (result.partial ? buildPartialTagCluster(cluster, result.sourceClearResults) : null);

        if (clusterForTagging) {
            console.log(`[MERGE-MODAL] Assigning tags for cluster ${cluster.phone} (${result.partial ? 'partial' : 'full'})`);
            const tagResult = await assignTagsAfterMerge(clusterForTagging);
            if (tagResult.success) {
                console.log(`[MERGE-MODAL] ✅ Tags assigned for cluster ${cluster.phone}`);
            } else {
                console.warn(`[MERGE-MODAL] ⚠️ Tag assignment failed for cluster ${cluster.phone}:`, tagResult.error);
            }
        }

        // Sync InvoiceStatusStore (PBH) cho source đã clear → đánh dấu merge-cancelled local
        if (result.success || result.partial) {
            const clearedIds = (result.sourceClearResults || [])
                .filter(r => r.cleared)
                .map(r => r.sourceId);
            if (clearedIds.length > 0 && typeof window.markSourceOrdersMergeCancelled === 'function') {
                try {
                    window.markSourceOrdersMergeCancelled(clearedIds);
                } catch (e) {
                    console.warn(`[MERGE-MODAL] markSourceOrdersMergeCancelled failed:`, e);
                }
            }
        }

        // Small delay to avoid rate limiting
        if (i < selectedClusters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Count successes, partials, failures — phân loại concurrency & locked
    const successCount = results.filter(r => r.result.success).length;
    const partialList = results.filter(r => !r.result.success && r.result.partial);
    const concurrencyList = results.filter(r => !r.result.success && r.result.concurrencyConflict);
    const lockedList = results.filter(r => !r.result.success && r.result.locked);
    const genericFails = results.filter(r =>
        !r.result.success
        && !r.result.partial
        && !r.result.concurrencyConflict
        && !r.result.locked
    );

    // Show summary — TẬP HỢP tất cả failure categories, không ẩn qua else-if chain
    if (window.notificationManager) {
        const totalFail = partialList.length + concurrencyList.length + lockedList.length + genericFails.length;
        if (totalFail === 0) {
            window.notificationManager.show(
                `Đã gộp sản phẩm thành công cho ${successCount} cụm đơn hàng!`,
                'success',
                5000
            );
        } else {
            const parts = [];
            if (partialList.length > 0) {
                const details = partialList
                    .map(r => `${r.cluster.phone} (STT nguồn chưa clear: ${(r.result.failedSourceSTTs || []).join(',')})`)
                    .join('; ');
                parts.push(`⚠️ ${partialList.length} GỘP DANG DỞ (trùng SP): ${details}`);
            }
            if (concurrencyList.length > 0) {
                parts.push(`🔀 ${concurrencyList.length} CONFLICT (user khác sửa đơn): ${concurrencyList.map(r => r.cluster.phone).join(', ')} — load lại rồi thử lại`);
            }
            if (lockedList.length > 0) {
                parts.push(`🔒 ${lockedList.length} BỊ LOCK (tab khác đang gộp): ${lockedList.map(r => r.cluster.phone).join(', ')}`);
            }
            if (genericFails.length > 0) {
                parts.push(`❌ ${genericFails.length} LỖI khác: ${genericFails.map(r => r.cluster.phone).join(', ')}`);
            }
            const level = partialList.length > 0 || concurrencyList.length > 0 ? 'error' : 'warning';
            window.notificationManager.show(
                `Gộp ${successCount}/${results.length} cụm. ${parts.join(' | ')}`,
                level,
                12000
            );
        }
    }

    // Refresh table
    try {
        await fetchOrders();
    } catch (refreshError) {
        console.warn('[MERGE-MODAL] Could not auto-refresh, please reload manually:', refreshError);
        renderTable();
        updateStats();
    }
}

// Make modal functions globally accessible
window.showMergeDuplicateOrdersModal = showMergeDuplicateOrdersModal;
window.closeMergeDuplicateOrdersModal = closeMergeDuplicateOrdersModal;
window.toggleMergeClusterSelection = toggleMergeClusterSelection;
window.toggleSelectAllMergeClusters = toggleSelectAllMergeClusters;
window.confirmMergeSelectedClusters = confirmMergeSelectedClusters;

// =====================================================
// MERGE HISTORY FUNCTIONS (Firebase Storage)
// =====================================================

// Firebase collection for merge history
const MERGE_HISTORY_COLLECTION = 'merge_orders_history';

/**
 * Get current user info for history tracking
 */
function getMergeHistoryUserInfo() {
    let userId = 'guest';
    let userName = 'Unknown';

    try {
        // Try userStorageManager first
        if (window.userStorageManager && typeof window.userStorageManager.getUserIdentifier === 'function') {
            userId = window.userStorageManager.getUserIdentifier() || 'guest';
        }

        // Try to get display name from auth
        const authStr = localStorage.getItem('loginindex_auth');
        if (authStr) {
            const auth = JSON.parse(authStr);
            userName = auth.displayName || auth.name || auth.email || 'Unknown';
            if (!userId || userId === 'guest') {
                userId = auth.uid || auth.id || auth.email || 'guest';
            }
        }
    } catch (e) {
        console.warn('[MERGE-HISTORY] Error getting user info:', e);
    }

    return { userId, userName };
}

/**
 * Save merge history to Firebase
 */
async function saveMergeHistory(cluster, result, errorResponse = null) {
    if (!db) {
        console.warn('[MERGE-HISTORY] Firebase not available, cannot save history');
        return;
    }

    try {
        const { userId, userName } = getMergeHistoryUserInfo();
        const timestamp = new Date();

        // Build source orders data with original tags
        const sourceOrdersData = cluster.sourceOrders.map(order => ({
            orderId: order.Id,
            stt: order.SessionIndex,
            partnerName: order.PartnerName || '',
            originalTags: getOrderTagsArray(order).map(t => ({
                id: t.Id,
                name: t.Name || '',
                color: t.Color || ''
            })),
            products: (order.Details || []).map(p => ({
                productId: p.ProductId,
                productCode: p.ProductCode || '',
                productName: p.ProductName || '',
                productImage: p.ProductImageUrl || p.ImageUrl || '',
                quantity: p.Quantity || 0,
                price: p.Price || 0,
                note: p.Note || ''
            }))
        }));

        // Build target order data with original tags
        const targetOrderData = {
            orderId: cluster.targetOrder.Id,
            stt: cluster.targetOrder.SessionIndex,
            partnerName: cluster.targetOrder.PartnerName || '',
            originalTags: getOrderTagsArray(cluster.targetOrder).map(t => ({
                id: t.Id,
                name: t.Name || '',
                color: t.Color || ''
            })),
            products: (cluster.targetOrder.Details || []).map(p => ({
                productId: p.ProductId,
                productCode: p.ProductCode || '',
                productName: p.ProductName || '',
                productImage: p.ProductImageUrl || p.ImageUrl || '',
                quantity: p.Quantity || 0,
                price: p.Price || 0,
                note: p.Note || ''
            }))
        };

        // Build merged products data
        const mergedProductsData = (cluster.mergedProducts || []).map(p => ({
            productId: p.ProductId,
            productCode: p.ProductCode || '',
            productName: p.ProductName || '',
            productImage: p.ProductImageUrl || p.ImageUrl || '',
            quantity: p.Quantity || 0,
            price: p.Price || 0,
            note: p.Note || ''
        }));

        const historyEntry = {
            phone: cluster.phone,
            timestamp: firebase.firestore.Timestamp.fromDate(timestamp),
            timestampISO: timestamp.toISOString(),
            userId: userId,
            userName: userName,
            success: result.success,
            errorMessage: result.success ? null : (result.message || 'Unknown error'),
            errorResponse: errorResponse ? JSON.stringify(errorResponse) : null,
            sourceOrders: sourceOrdersData,
            targetOrder: targetOrderData,
            mergedProducts: mergedProductsData,
            totalSourceOrders: sourceOrdersData.length,
            totalMergedProducts: mergedProductsData.length
        };

        await db.collection(MERGE_HISTORY_COLLECTION).add(historyEntry);
        console.log('[MERGE-HISTORY] Saved history entry for phone:', cluster.phone);

    } catch (error) {
        console.error('[MERGE-HISTORY] Error saving history:', error);
    }
}

/**
 * Load merge history from Firebase
 */
async function loadMergeHistory(limit = 50) {
    if (!db) {
        console.warn('[MERGE-HISTORY] Firebase not available');
        return [];
    }

    try {
        const snapshot = await db.collection(MERGE_HISTORY_COLLECTION)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const history = [];
        snapshot.forEach(doc => {
            history.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`[MERGE-HISTORY] Loaded ${history.length} history entries`);
        return history;

    } catch (error) {
        console.error('[MERGE-HISTORY] Error loading history:', error);
        return [];
    }
}

/**
 * Show merge history modal
 */
async function showMergeHistoryModal() {
    const modal = document.getElementById('mergeHistoryModal');
    const modalBody = document.getElementById('mergeHistoryModalBody');
    const subtitle = document.getElementById('mergeHistoryModalSubtitle');

    // Show modal with loading state
    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử gộp đơn...</p>
        </div>
    `;

    try {
        const history = await loadMergeHistory(100);

        if (history.length === 0) {
            modalBody.innerHTML = `
                <div class="merge-no-history">
                    <i class="fas fa-inbox"></i>
                    <p>Chưa có lịch sử gộp đơn nào.</p>
                </div>
            `;
            subtitle.textContent = 'Không có lịch sử';
            return;
        }

        // Render history entries
        const html = history.map((entry, index) => renderHistoryEntry(entry, index)).join('');
        modalBody.innerHTML = html;

        const successCount = history.filter(e => e.success).length;
        const failedCount = history.length - successCount;
        subtitle.textContent = `${history.length} lần gộp (${successCount} thành công, ${failedCount} thất bại)`;

    } catch (error) {
        console.error('[MERGE-HISTORY] Error showing history:', error);
        modalBody.innerHTML = `
            <div class="merge-no-history">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi khi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Render a single history entry
 */
function renderHistoryEntry(entry, index) {
    const timestamp = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date(entry.timestampISO);
    const timeStr = timestamp.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const statusClass = entry.success ? 'success' : 'failed';
    const statusText = entry.success ? 'Thành công' : 'Thất bại';

    // Build order titles for header
    const allSTTs = [
        ...entry.sourceOrders.map(o => `STT ${o.stt}`),
        `STT ${entry.targetOrder.stt} (Đích)`
    ].join(' | ');

    // Build table for details
    const tableHtml = renderHistoryTable(entry);

    // Error section if failed
    const errorHtml = !entry.success && entry.errorResponse ? `
        <div class="merge-history-error">
            <div class="merge-history-error-title">
                <i class="fas fa-exclamation-circle"></i> Chi tiết lỗi từ TPOS
            </div>
            <div class="merge-history-error-content">${escapeHtml(entry.errorResponse)}</div>
        </div>
    ` : (!entry.success ? `
        <div class="merge-history-error">
            <div class="merge-history-error-title">
                <i class="fas fa-exclamation-circle"></i> Lỗi
            </div>
            <div class="merge-history-error-content">${escapeHtml(entry.errorMessage || 'Unknown error')}</div>
        </div>
    ` : '');

    return `
        <div class="merge-history-entry" id="history-entry-${index}">
            <div class="merge-history-header ${statusClass}" onclick="toggleHistoryEntry(${index})">
                <div class="merge-history-info">
                    <span class="merge-history-time"><i class="fas fa-clock"></i> ${timeStr}</span>
                    <span class="merge-history-user"><i class="fas fa-user"></i> ${escapeHtml(entry.userName)}</span>
                    <span class="merge-history-phone"><i class="fas fa-phone"></i> ${escapeHtml(entry.phone)}</span>
                    <span class="merge-history-orders">${entry.totalSourceOrders + 1} đơn → ${entry.totalMergedProducts} SP</span>
                </div>
                <span class="merge-history-status ${statusClass}">${statusText}</span>
                <i class="fas fa-chevron-down merge-history-toggle"></i>
            </div>
            <div class="merge-history-details">
                ${errorHtml}
                <div class="merge-history-orders-title" style="font-weight: 600; margin-bottom: 12px; color: #374151;">
                    # ${allSTTs}
                </div>
                ${tableHtml}
            </div>
        </div>
    `;
}

/**
 * Render tag pills for history display
 */
function renderHistoryTagPills(tags) {
    if (!tags || tags.length === 0) return '';
    return `<div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
        ${tags.map(t => `<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: white; background: ${t.color || '#6b7280'};">${escapeHtml(t.name)}</span>`).join('')}
    </div>`;
}

/**
 * Render history table (similar to merge preview)
 */
function renderHistoryTable(entry) {
    // Build headers with original tags
    const headers = [
        `<th class="merged-col">Sau Khi Gộp<br><small>(STT ${entry.targetOrder.stt})</small></th>`
    ];

    // Source orders headers with original tags
    entry.sourceOrders.forEach(order => {
        const tagsHtml = renderHistoryTagPills(order.originalTags);
        headers.push(`<th>STT ${order.stt} - ${escapeHtml(order.partnerName)}${tagsHtml}</th>`);
    });

    // Target order header with original tags
    const targetTagsHtml = renderHistoryTagPills(entry.targetOrder.originalTags);
    headers.push(`<th class="target-col">STT ${entry.targetOrder.stt} - ${escapeHtml(entry.targetOrder.partnerName)} (Đích)${targetTagsHtml}</th>`);

    // Find max products
    const allProductCounts = [
        entry.mergedProducts.length,
        ...entry.sourceOrders.map(o => o.products.length),
        entry.targetOrder.products.length
    ];
    const maxProducts = Math.max(...allProductCounts, 1);

    // Build rows
    const rows = [];
    for (let i = 0; i < maxProducts; i++) {
        const cells = [];

        // Merged column
        const mergedProduct = entry.mergedProducts[i];
        cells.push(`<td class="merged-col">${mergedProduct ? renderHistoryProductItem(mergedProduct) : ''}</td>`);

        // Source order columns
        entry.sourceOrders.forEach(order => {
            const product = order.products[i];
            cells.push(`<td>${product ? renderHistoryProductItem(product) : ''}</td>`);
        });

        // Target order column
        const targetProduct = entry.targetOrder.products[i];
        cells.push(`<td class="target-col">${targetProduct ? renderHistoryProductItem(targetProduct) : ''}</td>`);

        rows.push(`<tr>${cells.join('')}</tr>`);
    }

    return `
        <div class="merge-cluster-table-wrapper">
            <table class="merge-cluster-table">
                <thead>
                    <tr>${headers.join('')}</tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render a product item for history
 */
function renderHistoryProductItem(product) {
    const imgUrl = product.productImage || '';
    const imgHtml = imgUrl
        ? `<img src="${imgUrl}" alt="" class="merge-product-img" onerror="this.style.display='none'">`
        : `<div class="merge-product-img" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;"><i class="fas fa-box"></i></div>`;

    const price = product.price ? `${product.price.toLocaleString('vi-VN')}đ` : '';

    return `
        <div class="merge-product-item">
            ${imgHtml}
            <div class="merge-product-info">
                <div class="merge-product-name" title="${escapeHtml(product.productName)}">${escapeHtml(product.productName)}</div>
                ${product.productCode ? `<span class="merge-product-code">${escapeHtml(product.productCode)}</span>` : ''}
                <div class="merge-product-details">
                    <span class="qty">SL: ${product.quantity || 0}</span>
                    ${price ? ` | <span class="price">${price}</span>` : ''}
                </div>
                ${product.note ? `<div class="merge-product-note">Note: ${escapeHtml(product.note)}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Toggle history entry expand/collapse
 */
function toggleHistoryEntry(index) {
    const entry = document.getElementById(`history-entry-${index}`);
    if (entry) {
        entry.classList.toggle('expanded');
    }
}

/**
 * Close merge history modal
 */
function closeMergeHistoryModal() {
    const modal = document.getElementById('mergeHistoryModal');
    modal.classList.remove('show');
}

/**
 * Shared escapeHtml utility - prevents XSS by encoding HTML entities.
 * Dùng `_escMerge` local-safe (coerce non-string) để tránh crash khi tab1-chat-messages.js
 * override window.escapeHtml bằng version không coerce. Expose về window nếu chưa có.
 */
if (!window.escapeHtml) {
    window.escapeHtml = function (text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
}
// Module-internal ref — luôn dùng _escMerge an toàn bất kể window.escapeHtml bị ghi đè sau
const escapeHtml = _escMerge;

// =====================================================
// MERGE TAG ASSIGNMENT FUNCTIONS
// =====================================================

const MERGE_TAG_COLOR = '#E3A21A';
const MERGED_ORDER_TAG_NAME = 'ĐÃ GỘP KO CHỐT';

/**
 * Get tags array from order object
 * NOTE: This function was renamed from parseOrderTags to avoid collision
 *       with the parseOrderTags() function at line ~4969 that renders HTML
 * @param {Object} order - Order object
 * @returns {Array} Array of tag objects
 */
function getOrderTagsArray(order) {
    if (!order || !order.Tags) return [];

    const tagsData = order.Tags;

    // Case 1: Tags đã là array (đã parse sẵn)
    if (Array.isArray(tagsData)) {
        return tagsData;
    }

    // Case 2: Tags là JSON string
    if (typeof tagsData === 'string' && tagsData.trim() !== '') {
        try {
            const parsed = JSON.parse(tagsData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[getOrderTagsArray] Failed to parse Tags:', tagsData);
            return [];
        }
    }

    return [];
}

/**
 * Tính toán preview merged tags cho cluster — pure function, mirror logic
 * của assignTagsAfterMerge (filter merge tags cũ + dedup by Id + thêm
 * "Gộp X Y Z" placeholder). Dùng để hiển thị preview trong modal trước khi
 * user xác nhận gộp đơn.
 *
 * @param {Object} cluster - { targetOrder, sourceOrders, orders }
 * @returns {Array<{Id, Name, Color}>} Danh sách tag dedup theo Id
 */
function calculateMergedTagsPreview(cluster) {
    if (!cluster || !cluster.targetOrder) return [];

    const allTags = new Map(); // dedup by tag.Id

    // Filter giống hệt assignTagsAfterMerge — KHÔNG được lệch
    const shouldExcludeTag = (tagName) => {
        if (!tagName) return false;
        if (tagName === MERGED_ORDER_TAG_NAME) return true;     // 'ĐÃ GỘP KO CHỐT'
        if (tagName.startsWith('Gộp ')) return true;            // tag merge group cũ
        return false;
    };

    // 1) Target tags trước (priority hiển thị)
    const targetTags = getOrderTagsArray(cluster.targetOrder);
    targetTags.forEach(t => {
        if (t && t.Id != null && !shouldExcludeTag(t.Name)) {
            allTags.set(t.Id, t);
        }
    });

    // 2) Source tags theo STT ascending — đảm bảo deterministic
    const sourceOrdersSorted = [...(cluster.sourceOrders || [])]
        .sort((a, b) => (a.SessionIndex || 0) - (b.SessionIndex || 0));

    sourceOrdersSorted.forEach(sourceOrder => {
        const sourceTags = getOrderTagsArray(sourceOrder);
        sourceTags.forEach(t => {
            if (t && t.Id != null && !shouldExcludeTag(t.Name) && !allTags.has(t.Id)) {
                allTags.set(t.Id, t);
            }
        });
    });

    // 3) Placeholder "Gộp X Y Z" tag (sẽ tạo thật khi confirm merge)
    const allSTTs = (cluster.orders || [])
        .map(o => o.SessionIndex)
        .filter(s => s != null)
        .sort((a, b) => a - b);
    if (allSTTs.length > 0) {
        const previewMergeTagName = `Gộp ${allSTTs.join(' ')}`;
        allTags.set('__preview_merge_group__', {
            Id: '__preview_merge_group__',
            Name: previewMergeTagName,
            Color: MERGE_TAG_COLOR
        });
    }

    return Array.from(allTags.values());
}

/**
 * Tính preview tags của 1 SOURCE order SAU merge.
 * Mirror step 5 trong assignTagsAfterMerge: preserved custom + "ĐÃ GỘP KO CHỐT" + "Gộp X Y Z".
 */
function calculateSourceTagsPreview(sourceOrder, cluster) {
    const shouldExcludeTag = (tagName) => {
        if (!tagName) return false;
        if (tagName === MERGED_ORDER_TAG_NAME) return true;
        if (tagName.startsWith('Gộp ')) return true;
        return false;
    };

    const result = new Map();

    // 1) Preserved custom tags (filter merge-related)
    const existing = getOrderTagsArray(sourceOrder);
    existing.forEach(t => {
        if (t && t.Id != null && !shouldExcludeTag(t.Name)) {
            result.set(t.Id, t);
        }
    });

    // 2) "ĐÃ GỘP KO CHỐT"
    result.set('__preview_merged__', {
        Id: '__preview_merged__',
        Name: MERGED_ORDER_TAG_NAME,
        Color: MERGE_TAG_COLOR
    });

    // 3) "Gộp X Y Z"
    const allSTTs = (cluster.orders || [])
        .map(o => o.SessionIndex)
        .filter(s => s != null)
        .sort((a, b) => a - b);
    if (allSTTs.length > 0) {
        result.set('__preview_merge_group__', {
            Id: '__preview_merge_group__',
            Name: `Gộp ${allSTTs.join(' ')}`,
            Color: MERGE_TAG_COLOR
        });
    }

    return Array.from(result.values());
}

/**
 * Helper: get flag/tTag id from object or string
 */
function _mergeXLId(item) {
    return (typeof item === 'object' && item !== null) ? item.id : item;
}

/**
 * #Note: Wrapper mỏng để nuôi call-site cũ trong merge flow.
 * Toàn bộ thao tác gán tag sau khi gộp đơn CHỈ ghi vào Tag XL (web / Postgres).
 * KHÔNG gọi TPOS tag API (theo yêu cầu: merge không được thay đổi tag bên TPOS —
 * trước đây ghi TPOS rồi sync ngược về Tag XL gây lỗi hiển thị).
 *
 * @param {Object} cluster - Cluster data with orders, targetOrder, sourceOrders
 * @returns {Promise<Object>}
 */
async function assignTagsAfterMerge(cluster) {
    try {
        console.log('[MERGE-TAG] Tag XL-only merge tag assignment for cluster:', cluster.phone);
        const result = await assignTagXLAfterMerge(cluster);
        // Cache orders giữ nguyên behavior cũ (modal refresh sau merge).
        try { window.cacheManager?.clear?.("orders"); } catch {}
        return result;
    } catch (error) {
        console.error('[MERGE-TAG] Error in assignTagsAfterMerge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Gán Tag XL sau khi gộp đơn.
 *
 * TARGET (đơn đích):
 *   - KHÔNG đụng category/subTag → giữ nguyên state hiện tại.
 *   - Merge flags + tTags từ toàn bộ cluster (dedup theo id).
 *   - Loại bỏ tTag cũ `GOP_DON` và mọi tTag dạng `GOP_<digits>...` từ lần merge trước.
 *   - Add tTag động `Gộp X Y Z` (id = `GOP_<sttList>`, name = `Gộp <sttList>`).
 *
 * SOURCE (đơn nguồn):
 *   - Reset sạch: flags = [], tTags = [], category = 3 (KHÔNG CẦN CHỐT), subTag = DA_GOP_KHONG_CHOT.
 *   - Add tTag động `Gộp X Y Z` để đánh dấu đã gộp về group nào.
 *
 * Tất cả call đều dùng `{ suppressSync: true }` — không trigger XL→TPOS sync.
 */
async function assignTagXLAfterMerge(cluster) {
    try {
        if (!window.ProcessingTagState || !window.assignTTagToOrder || !window.toggleOrderFlag || !window.resetOrderTagsForMerge) {
            console.warn('[MERGE-PTAG] Required Processing Tag functions not available, skipping Tag XL assignment');
            return { success: false, error: 'Processing Tags module not loaded' };
        }

        console.log('[MERGE-PTAG] Starting Tag XL-only assignment for cluster:', cluster.phone);

        // ===== Tính merge tag id + name =====
        const allSTTs = cluster.orders
            .map(o => o.SessionIndex)
            .filter(n => Number.isFinite(n))
            .sort((a, b) => a - b);
        if (allSTTs.length === 0) {
            console.warn('[MERGE-PTAG] No valid SessionIndex in cluster — abort');
            return { success: false, error: 'No valid STT' };
        }
        const mergeTagId = 'GOP_' + allSTTs.join('_');
        const mergeTagName = 'Gộp ' + allSTTs.join(' ');

        // Lọc các tTag merge cũ: GOP_DON, GOP_<digits>... (từ lần merge trước đó)
        const isOldMergeTTag = (id) => {
            if (!id) return false;
            if (id === 'GOP_DON') return true;
            if (typeof id === 'string' && /^GOP_\d+(_\d+)*$/.test(id)) return true;
            return false;
        };

        // ===== TARGET: merge flags/tTags từ cluster =====
        const targetCode = String(cluster.targetOrder.Code);
        const allOrders = [cluster.targetOrder, ...cluster.sourceOrders];

        const allFlags = new Map();
        const allTTags = new Map();
        for (const order of allOrders) {
            const ptagData = window.ProcessingTagState.getOrderData(String(order.Code));
            if (!ptagData) continue;
            (ptagData.flags || []).forEach(f => {
                const fId = _mergeXLId(f);
                if (fId != null && !allFlags.has(fId)) allFlags.set(fId, f);
            });
            (ptagData.tTags || []).forEach(t => {
                const tId = _mergeXLId(t);
                if (tId == null) return;
                if (isOldMergeTTag(tId)) return; // bỏ GOP_DON + merge tag cũ
                if (!allTTags.has(tId)) allTTags.set(tId, t);
            });
        }

        // Add flags còn thiếu vào target
        for (const flag of allFlags.values()) {
            const flagId = _mergeXLId(flag);
            if (flagId == null) continue;
            const cur = window.ProcessingTagState.getOrderData(targetCode);
            const has = (cur?.flags || []).some(f => _mergeXLId(f) === flagId);
            if (!has) {
                try {
                    await window.toggleOrderFlag(targetCode, flagId, 'Hệ thống (gộp đơn)', { suppressSync: true });
                } catch (e) {
                    console.warn(`[MERGE-PTAG] toggleOrderFlag target ${targetCode}/${flagId} fail:`, e);
                }
            }
        }

        // Add tTags còn thiếu vào target
        for (const tTag of allTTags.values()) {
            const tId = _mergeXLId(tTag);
            if (tId == null) continue;
            const cur = window.ProcessingTagState.getOrderData(targetCode);
            const has = (cur?.tTags || []).some(t => _mergeXLId(t) === tId);
            if (!has) {
                try {
                    await window.assignTTagToOrder(targetCode, tId, 'Hệ thống (gộp đơn)', { suppressSync: true });
                } catch (e) {
                    console.warn(`[MERGE-PTAG] assignTTagToOrder target ${targetCode}/${tId} fail:`, e);
                }
            }
        }

        // Add tTag động "Gộp X Y Z" vào target
        try {
            const curTarget = window.ProcessingTagState.getOrderData(targetCode);
            const hasMergeTag = (curTarget?.tTags || []).some(t => _mergeXLId(t) === mergeTagId);
            if (!hasMergeTag) {
                await window.assignTTagToOrder(targetCode, mergeTagId, 'Hệ thống (gộp đơn)', {
                    tagName: mergeTagName,
                    suppressSync: true
                });
            }
            console.log(`[MERGE-PTAG] ✅ Target STT ${cluster.targetOrder.SessionIndex}: flags=${allFlags.size}, tTags=${allTTags.size}, +${mergeTagName}`);
        } catch (e) {
            console.error(`[MERGE-PTAG] Failed to add merge tag to target ${targetCode}:`, e);
        }

        // ===== SOURCES: reset sạch, chỉ giữ marker gộp =====
        for (const sourceOrder of cluster.sourceOrders) {
            const sourceCode = String(sourceOrder.Code);
            try {
                await window.resetOrderTagsForMerge(
                    sourceCode,
                    {
                        category: 3,
                        subTag: 'DA_GOP_KHONG_CHOT',
                        flags: [],
                        tTags: [{ id: mergeTagId, name: mergeTagName }]
                    },
                    'Hệ thống (gộp đơn)'
                );
                console.log(`[MERGE-PTAG] ✅ Source STT ${sourceOrder.SessionIndex}: reset → cat=3/DA_GOP_KHONG_CHOT + ${mergeTagName}`);
            } catch (e) {
                console.error(`[MERGE-PTAG] resetOrderTagsForMerge source ${sourceCode} fail:`, e);
            }
        }

        if (window.renderPanelContent) {
            window.renderPanelContent();
        }

        return { success: true, mergeTagId, mergeTagName };
    } catch (error) {
        console.error('[MERGE-PTAG] Error assigning Tag XL:', error);
        return { success: false, error: error.message };
    }
}

// Make history functions globally accessible
window.showMergeHistoryModal = showMergeHistoryModal;
window.closeMergeHistoryModal = closeMergeHistoryModal;
window.toggleHistoryEntry = toggleHistoryEntry;
window.saveMergeHistory = saveMergeHistory;

// =====================================================
// MERGE RECOVERY & SIDE-EFFECT HELPERS
// =====================================================

/**
 * Xây cluster giảm phạm vi tag assignment khi merge partial-success.
 * Chỉ gồm các source đã clear thành công — source chưa clear được giữ nguyên
 * tag cũ để user có thể retry thủ công mà không mất tag gốc.
 */
function buildPartialTagCluster(cluster, sourceClearResults) {
    if (!Array.isArray(sourceClearResults) || sourceClearResults.length === 0) return cluster;
    const clearedIds = new Set(sourceClearResults.filter(r => r.cleared).map(r => String(r.sourceId)));
    const filteredSources = (cluster.sourceOrders || []).filter(o => clearedIds.has(String(o.Id)));
    // Giữ convention `orders[last]` = target như showMergeDuplicateOrdersModal,
    // sort by STT ascending để khớp display (source STT thấp đầu, target cuối).
    const allFiltered = [...filteredSources].sort((a, b) => (a.SessionIndex || 0) - (b.SessionIndex || 0));
    return {
        ...cluster,
        sourceOrders: filteredSources,
        orders: [...allFiltered, cluster.targetOrder]
    };
}

/**
 * Mark local InvoiceStatusStore entries của các source đã clear là "Hủy do gộp đơn".
 * - Mutate in-place trong Map + call _saveBatchToAPI để persist xuống Postgres.
 * - Không cancel invoice bên TPOS (quá destructive, cần user confirm riêng).
 *
 * CHÚ Ý: KHÔNG call refreshAllFromTPOS ở đây vì hàm đó gọi clearAll() → wipe
 * toàn bộ store trước khi fetch lại, sẽ mất PBH của mọi đơn khác.
 * Nếu cần sync TPOS thật cho các source → user bấm refresh thủ công sau.
 */
function markSourceOrdersMergeCancelled(sourceOrderIds) {
    if (!Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) return;
    if (!window.InvoiceStatusStore) {
        console.warn('[MERGE-PBH] InvoiceStatusStore not available, skipping merge-cancel flag');
        return;
    }
    const store = window.InvoiceStatusStore;
    const soIdSet = new Set(sourceOrderIds.map(String).filter(Boolean));
    const mutatedCompoundKeys = [];

    // Iterate _data map để tìm mọi entry thuộc các source order → mutate + collect compound keys.
    // Pattern này giống refreshAllFromTPOS (tab1-fast-sale-invoice-status.js:957-971).
    if (store._data && typeof store._data.forEach === 'function') {
        store._data.forEach((entry, compoundKey) => {
            if (!entry) return;
            const entrySoId = String(entry.SaleOnlineId || '');
            if (!soIdSet.has(entrySoId)) return;
            if (entry.IsMergeCancel === true) return; // Đã mark rồi, skip
            entry.IsMergeCancel = true;
            store._data.set(compoundKey, entry);
            mutatedCompoundKeys.push(compoundKey);
        });
    }

    if (mutatedCompoundKeys.length > 0) {
        console.log(`[MERGE-PBH] ✅ Marked ${mutatedCompoundKeys.length} invoice entry(ies) as merge-cancelled`);
        // Persist xuống API
        if (typeof store._saveBatchToAPI === 'function') {
            Promise.resolve(store._saveBatchToAPI(mutatedCompoundKeys))
                .catch(e => console.warn('[MERGE-PBH] _saveBatchToAPI failed:', e?.message || e));
        }
        // Re-render UI
        if (typeof store._refreshInvoiceStatusUI === 'function') {
            try { store._refreshInvoiceStatusUI(sourceOrderIds.map(String)); } catch {}
        }
    }
}

window.buildPartialTagCluster = buildPartialTagCluster;
window.markSourceOrdersMergeCancelled = markSourceOrdersMergeCancelled;

