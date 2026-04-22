// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// MERGE ORDER PRODUCTS API FUNCTIONS
// =====================================================

/**
 * Normalize phone number for grouping duplicate orders.
 * Removes spaces/dots/dashes/parens và convert +84xxx → 0xxx.
 * Trả về '' nếu input rỗng → caller skip không group.
 */
function normalizeMergePhone(phone) {
    if (!phone) return '';
    let s = String(phone).trim().replace(/[\s\-\.()]/g, '');
    if (!s) return '';
    if (s.startsWith('+84')) s = '0' + s.slice(3);
    else if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
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

        // Use direct fetch instead of smartFetch to avoid fallback issues
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
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
            console.error(`[MERGE-API] PUT failed:`, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
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
        // Network/fetch failure → retry. Sau khi hết retries thì throw.
        lastError = error;
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
                priceDiffs
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
            totalProducts: allProducts.length
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
            errorResponse: errorResponse
        };
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

        // Find phone numbers with multiple orders (need merging)
        const mergeableGroups = [];
        phoneGroups.forEach((orders, phone) => {
            if (orders.length > 1) {
                // Sort by SessionIndex (STT) descending - target is highest STT
                orders.sort((a, b) => (b.SessionIndex || 0) - (a.SessionIndex || 0));
                const targetOrder = orders[0];
                const sourceOrders = orders.slice(1);

                mergeableGroups.push({
                    Telephone: targetOrder.Telephone || phone,  // Display original target phone
                    TargetOrderId: targetOrder.Id,
                    TargetSTT: targetOrder.SessionIndex,
                    SourceOrderIds: sourceOrders.map(o => o.Id),
                    SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                    IsMerged: true // For compatibility with executeMergeOrderProducts
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
            `- Xóa sản phẩm khỏi ${totalSourceOrders} đơn nguồn`;

        const confirmed = await window.notificationManager.confirm(confirmMsg, "Xác nhận gộp sản phẩm");
        if (!confirmed) {
            return { success: false, message: 'Cancelled by user' };
        }

        // Show loading indicator
        if (window.notificationManager) {
            window.notificationManager.show(`Đang gộp sản phẩm cho ${mergeableGroups.length} SĐT...`, 'info');
        }

        // Execute merge for each phone group
        const results = [];
        for (let i = 0; i < mergeableGroups.length; i++) {
            const group = mergeableGroups[i];
            console.log(`[MERGE-BULK] Processing ${i + 1}/${mergeableGroups.length}: Phone ${group.Telephone}`);

            const result = await executeMergeOrderProducts(group);
            results.push({ order: group, result });

            // Small delay to avoid rate limiting
            if (i < mergeableGroups.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Count successes and failures
        const successCount = results.filter(r => r.result.success).length;
        const failureCount = results.length - successCount;

        // Show summary using custom notification
        if (window.notificationManager) {
            if (failureCount > 0) {
                // Show detailed failure info
                const failedPhones = results.filter(r => !r.result.success).map(r => r.order.Telephone).join(', ');
                window.notificationManager.show(
                    `⚠️ Gộp ${successCount}/${results.length} đơn. Thất bại: ${failedPhones}`,
                    'warning',
                    8000
                );
            } else {
                window.notificationManager.show(
                    `✅ Đã gộp sản phẩm thành công cho ${successCount} đơn hàng!`,
                    'success',
                    5000
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

            // Calculate merged products preview
            const mergedProducts = calculateMergedProductsPreview(ordersWithDetails);

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
 * Phải khớp 1:1 với logic trong executeMergeOrderProducts để preview
 * hiển thị đúng kết quả sẽ được gửi lên TPOS.
 */
function calculateMergedProductsPreview(orders) {
    const productMap = new Map(); // key: ProductId (hoặc _noid_N cho item thiếu ProductId)

    orders.forEach(order => {
        (order.Details || []).forEach(detail => {
            const key = detail.ProductId;
            // Product thiếu ProductId → dùng unique synthetic key để không collision
            if (!key) {
                productMap.set(`_noid_${productMap.size}`, { ...detail });
                return;
            }
            if (productMap.has(key)) {
                const existing = productMap.get(key);
                const newQty = (existing.Quantity || 0) + (detail.Quantity || 0);
                existing.Quantity = Math.min(newQty, 999999); // Bounds check khớp với executeMergeOrderProducts
                // Keep the note from all orders (concat với ", ")
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
 * Render a single cluster card
 */
function renderClusterCard(cluster) {
    const isSelected = selectedMergeClusters.has(cluster.id);
    const orderTitles = cluster.orders.map(o => `STT ${o.SessionIndex} - ${o.PartnerName || 'N/A'}`).join(' | ');

    // Compute merged tags preview (mirror assignTagsAfterMerge logic)
    const mergedTagsPreview = calculateMergedTagsPreview(cluster);
    const mergedTagsHtml = mergedTagsPreview.length > 0
        ? renderMergeTagPills(mergedTagsPreview)
        : `<div class="merge-header-tags merge-empty"><span class="merge-tag-pill" style="background:#9ca3af;">Không có tag</span></div>`;

    // Build table headers
    const headers = [
        `<th class="merged-col">
            Sau Khi Gộp<br><small>(STT ${cluster.targetOrder.SessionIndex})</small>
            ${mergedTagsHtml}
        </th>`
    ];

    cluster.orders.forEach(order => {
        const isTarget = order.Id === cluster.targetOrder.Id;
        const className = isTarget ? 'target-col' : '';
        const targetLabel = isTarget ? ' (Đích)' : '';

        // Render tags pills cho header (hiển thị dưới STT - Tên)
        const tagsHtml = renderMergeTagPills(order.Tags);

        headers.push(`<th class="${className}">
            STT ${order.SessionIndex} - ${order.PartnerName || 'N/A'}${targetLabel}
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
        <div class="merge-cluster-card ${isSelected ? 'selected' : ''}" data-cluster-id="${cluster.id}">
            <div class="merge-cluster-header">
                <input type="checkbox" class="merge-cluster-checkbox"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleMergeClusterSelection('${cluster.id}', this.checked)">
                <div class="merge-cluster-title"># ${orderTitles}</div>
                <div class="merge-cluster-phone"><i class="fas fa-phone"></i> ${cluster.phone}</div>
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
 * Render a single product item
 */
function renderProductItem(product) {
    const imgUrl = product.ProductImageUrl || product.ImageUrl || '';
    const imgHtml = imgUrl
        ? `<img src="${imgUrl}" alt="" class="merge-product-img" onerror="this.style.display='none'">`
        : `<div class="merge-product-img" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;"><i class="fas fa-box"></i></div>`;

    const productCode = product.ProductCode || product.ProductName?.match(/\[([^\]]+)\]/)?.[1] || '';
    const productName = product.ProductName || product.ProductNameGet || 'Sản phẩm';
    const price = product.Price ? `${(product.Price).toLocaleString('vi-VN')}đ` : '';
    const note = product.Note || '';

    return `
        <div class="merge-product-item">
            ${imgHtml}
            <div class="merge-product-info">
                <div class="merge-product-name" title="${productName}">${productName}</div>
                ${productCode ? `<span class="merge-product-code">${productCode}</span>` : ''}
                <div class="merge-product-details">
                    <span class="qty">SL: ${product.Quantity || 0}</span>
                    ${price ? ` | <span class="price">${price}</span>` : ''}
                </div>
                ${note ? `<div class="merge-product-note">Note: ${note}</div>` : ''}
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

        // If merge successful, assign tags
        if (result.success) {
            console.log(`[MERGE-MODAL] Merge successful, assigning tags for cluster ${cluster.phone}`);
            const tagResult = await assignTagsAfterMerge(cluster);
            if (tagResult.success) {
                console.log(`[MERGE-MODAL] ✅ Tags assigned successfully for cluster ${cluster.phone}`);
            } else {
                console.warn(`[MERGE-MODAL] ⚠️ Tag assignment failed for cluster ${cluster.phone}:`, tagResult.error);
            }
        }

        // Small delay to avoid rate limiting
        if (i < selectedClusters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Count successes and failures
    const successCount = results.filter(r => r.result.success).length;
    const failureCount = results.length - successCount;

    // Show summary
    if (window.notificationManager) {
        if (failureCount > 0) {
            const failedPhones = results.filter(r => !r.result.success).map(r => r.cluster.phone).join(', ');
            window.notificationManager.show(
                `Gộp ${successCount}/${results.length} cụm. Thất bại: ${failedPhones}`,
                'warning',
                8000
            );
        } else {
            window.notificationManager.show(
                `Đã gộp sản phẩm thành công cho ${successCount} cụm đơn hàng!`,
                'success',
                5000
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
 * Shared escapeHtml utility - prevents XSS by encoding HTML entities
 * Also used by tab1-order-history.js, live-comments-readonly-modal.js, etc.
 */
if (!window.escapeHtml) {
    window.escapeHtml = function (text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
}
const escapeHtml = window.escapeHtml;

// =====================================================
// MERGE TAG ASSIGNMENT FUNCTIONS
// =====================================================

const MERGE_TAG_COLOR = '#E3A21A';
const MERGED_ORDER_TAG_NAME = 'ĐÃ GỘP KO CHỐT';

/**
 * Query single tag by exact name từ TPOS via OData $filter.
 * Trả về tag object hoặc null nếu không tồn tại.
 * Tránh được vấn đề pagination ($top=1000) khi DB có >1000 tags.
 */
async function queryTPOSTagByName(tagName) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        // OData escape: dấu nháy đơn → ''
        const escapedName = String(tagName).replace(/'/g, "''");
        const filterExpr = `Name eq '${escapedName}'`;
        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$format=json&$filter=${encodeURIComponent(filterExpr)}&$top=5`;

        const resp = await API_CONFIG.smartFetch(url, {
            method: 'GET',
            headers: { ...headers, accept: 'application/json' }
        });
        if (!resp.ok) {
            console.warn(`[MERGE-TAG] queryTPOSTagByName HTTP ${resp.status} for "${tagName}"`);
            return null;
        }
        const data = await resp.json();
        const list = Array.isArray(data?.value) ? data.value : [];
        if (list.length === 0) return null;
        // Ưu tiên exact-case match, fallback case-insensitive first
        const exact = list.find(t => t?.Name === tagName);
        return exact || list.find(t => t?.Name && t.Name.toLowerCase() === tagName.toLowerCase()) || null;
    } catch (e) {
        console.warn(`[MERGE-TAG] queryTPOSTagByName error for "${tagName}":`, e);
        return null;
    }
}

/**
 * Sync 1 tag mới vào local cache (availableTags + Firebase).
 */
function _registerLocalTag(tag) {
    if (!tag || tag.Id == null) return;
    if (!Array.isArray(availableTags)) return;
    if (availableTags.find(t => t.Id === tag.Id)) return;
    availableTags.push(tag);
    window.availableTags = availableTags;
    try { window.cacheManager.set("tags", availableTags, "tags"); } catch {}
    if (typeof database !== 'undefined' && database) {
        database.ref('settings/tags').set(availableTags).catch(e =>
            console.warn('[MERGE-TAG] Firebase tags save failed:', e)
        );
    }
}

/**
 * Ensure a tag exists, create if not found.
 *
 * Lookup priority (tránh false-negative do pagination):
 *   1. Local cache (`availableTags`) — fast path
 *   2. OData `$filter=Name eq '...'` query — targeted, không bị giới hạn $top
 *   3. POST tạo mới
 *   4. Nếu POST 400 "Đã tồn tại" → re-query (1 lần) để recover tag từ server
 *
 * @param {string} tagName - Tag name to ensure exists
 * @param {string} color - Hex color for new tag
 * @returns {Promise<Object>} Tag object with Id, Name, Color
 */
async function ensureMergeTagExists(tagName, color = MERGE_TAG_COLOR) {
    try {
        // STEP 1: Local cache (case-insensitive)
        if (Array.isArray(availableTags)) {
            const local = availableTags.find(t =>
                t?.Name && t.Name.toLowerCase() === tagName.toLowerCase()
            );
            if (local) {
                console.log(`[MERGE-TAG] Tag "${tagName}" found in local cache:`, local);
                return local;
            }
        }

        // STEP 2: Targeted OData filter query (handles >1000 tags)
        console.log(`[MERGE-TAG] Querying tag "${tagName}" via $filter...`);
        const remote = await queryTPOSTagByName(tagName);
        if (remote) {
            console.log(`[MERGE-TAG] Tag "${tagName}" found via filter:`, remote);
            _registerLocalTag(remote);
            return remote;
        }

        // STEP 3: Create new tag
        console.log(`[MERGE-TAG] Creating new tag: "${tagName}" with color ${color}`);
        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ Name: tagName, Color: color })
            }
        );

        if (response.ok) {
            const newTag = await response.json();
            if (newTag['@odata.context']) delete newTag['@odata.context'];
            console.log('[MERGE-TAG] Tag created successfully:', newTag);
            _registerLocalTag(newTag);
            return newTag;
        }

        // STEP 4: POST failed → check if it's "already exists" → re-query để recover
        const errorText = await response.text();
        const isDuplicate = response.status === 400 && /tồn tại|exist/i.test(errorText);
        if (isDuplicate) {
            console.warn(`[MERGE-TAG] POST said "đã tồn tại" — re-querying tag "${tagName}" to recover...`);
            const recovered = await queryTPOSTagByName(tagName);
            if (recovered) {
                console.log(`[MERGE-TAG] Tag "${tagName}" recovered after duplicate error:`, recovered);
                _registerLocalTag(recovered);
                return recovered;
            }
            console.error(`[MERGE-TAG] Tag "${tagName}" exists on server but cannot be retrieved via $filter`);
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);

    } catch (error) {
        console.error('[MERGE-TAG] Error ensuring tag exists:', error);
        throw error;
    }
}

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
 * Assign tags to an order via API
 * @param {string} orderId - Order ID
 * @param {Array} tags - Array of tag objects
 */
async function assignTagsToOrder(orderId, tags) {
    const headers = await window.tokenManager.getAuthHeader();

    const response = await API_CONFIG.smartFetch(
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
        {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                Tags: tags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                OrderId: orderId
            })
        }
    );

    if (!response.ok) {
        throw new Error(`Lỗi gán tag: ${response.status}`);
    }

    // Update order in table
    const updatedData = { Tags: JSON.stringify(tags) };
    updateOrderInTable(orderId, updatedData);

    // Emit Firebase realtime update
    await emitTagUpdateToFirebase(orderId, tags);

    return true;
}

/**
 * Assign tags after successful merge
 * @param {Object} cluster - Cluster data with orders, targetOrder, sourceOrders
 * @returns {Promise<Object>} Result of tag assignment
 */
async function assignTagsAfterMerge(cluster) {
    try {
        console.log('[MERGE-TAG] Starting tag assignment for cluster:', cluster.phone);

        // Step 1: Ensure "ĐÃ GỘP KO CHỐT" tag exists
        const mergedTag = await ensureMergeTagExists(MERGED_ORDER_TAG_NAME, MERGE_TAG_COLOR);

        // Step 2: Create "Gộp X Y Z" tag
        const allSTTs = cluster.orders.map(o => o.SessionIndex).sort((a, b) => a - b);
        const mergeTagName = `Gộp ${allSTTs.join(' ')}`;
        const mergeGroupTag = await ensureMergeTagExists(mergeTagName, MERGE_TAG_COLOR);

        // Step 3: Collect all tags from all orders (for target order)
        const allTags = new Map(); // Use Map to dedupe by tag Id

        // Helper function: Check if a tag should be excluded (merge-related tags)
        const shouldExcludeTag = (tagName) => {
            if (!tagName) return false;
            // Exclude "ĐÃ GỘP KO CHỐT" tag - this is for source orders only
            if (tagName === MERGED_ORDER_TAG_NAME) return true;
            // Exclude old "Gộp X Y Z" tags from previous merges
            if (tagName.startsWith('Gộp ')) return true;
            return false;
        };

        // Add tags from target order (exclude merge-related tags)
        const targetTags = getOrderTagsArray(cluster.targetOrder);
        targetTags.forEach(t => {
            if (t.Id && !shouldExcludeTag(t.Name)) {
                allTags.set(t.Id, t);
            }
        });
        console.log(`[MERGE-TAG] Target order tags after filter: ${targetTags.filter(t => !shouldExcludeTag(t.Name)).map(t => t.Name).join(', ') || '(none)'}`);

        // Add tags from source orders (exclude merge-related tags)
        cluster.sourceOrders.forEach(sourceOrder => {
            const sourceTags = getOrderTagsArray(sourceOrder);
            const filteredTags = sourceTags.filter(t => t.Id && !shouldExcludeTag(t.Name));
            console.log(`[MERGE-TAG] Source order STT ${sourceOrder.SessionIndex} tags after filter: ${filteredTags.map(t => t.Name).join(', ') || '(none)'}`);
            filteredTags.forEach(t => {
                allTags.set(t.Id, t);
            });
        });

        // Add merge group tag
        allTags.set(mergeGroupTag.Id, mergeGroupTag);

        // Convert to array
        const targetOrderNewTags = Array.from(allTags.values());

        console.log(`[MERGE-TAG] Target order STT ${cluster.targetOrder.SessionIndex} will have ${targetOrderNewTags.length} tags: ${targetOrderNewTags.map(t => t.Name).join(', ')}`);

        // Step 4: Assign tags to target order
        await assignTagsToOrder(cluster.targetOrder.Id, targetOrderNewTags);
        console.log(`[MERGE-TAG] ✅ Assigned ${targetOrderNewTags.length} tags to target order STT ${cluster.targetOrder.SessionIndex}`);

        // Step 5: Assign only "ĐÃ GỘP KO CHỐT" tag to source orders (clear all existing)
        const sourceOnlyTags = [mergedTag];

        for (const sourceOrder of cluster.sourceOrders) {
            await assignTagsToOrder(sourceOrder.Id, sourceOnlyTags);
            console.log(`[MERGE-TAG] ✅ Assigned "${MERGED_ORDER_TAG_NAME}" to source order STT ${sourceOrder.SessionIndex}`);
        }

        // Step 6: Assign Tag XL (Processing Tags) — mirror TPOS tag logic
        const ptagResult = await assignTagXLAfterMerge(cluster);
        if (ptagResult.success) {
            console.log(`[MERGE-TAG] ✅ Tag XL assigned successfully for cluster ${cluster.phone}`);
        } else {
            console.warn(`[MERGE-TAG] ⚠️ Tag XL assignment failed for cluster ${cluster.phone}:`, ptagResult.error);
        }

        // Clear cache
        window.cacheManager.clear("orders");

        return {
            success: true,
            targetTags: targetOrderNewTags,
            sourceTag: mergedTag,
            mergeGroupTag: mergeGroupTag
        };

    } catch (error) {
        console.error('[MERGE-TAG] Error assigning tags:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Helper: get flag/tTag id from object or string
 */
function _mergeXLId(item) {
    return (typeof item === 'object' && item !== null) ? item.id : item;
}

/**
 * Gán Tag XL (Processing Tags) sau khi gộp đơn — tương tự logic gán TPOS tags
 * Target order: nhận tất cả Tag XL (category, flags, tTags) từ mọi đơn trong cluster (dedup, persisted, synced)
 * Source orders: gán KHÔNG CẦN CHỐT / Đã gộp không chốt (category 3, subTag DA_GOP_KHONG_CHOT)
 *
 * Persistence strategy:
 * - assignOrderCategory: persists category + flags + sync v3
 * - assignTTagToOrder: persists each tTag individually + sync v3 (idempotent dedup)
 * - toggleOrderFlag: persists flag toggle + sync v3 (used khi không đổi category)
 *
 * SubState preservation:
 * - Nếu target đã đúng category + subTag → KHÔNG gọi assignOrderCategory (giữ nguyên subState
 *   như DA_IN_PHIEU, CHO_HANG, …) → chỉ merge flag/tTag tăng dần.
 * - Nếu khác → assignOrderCategory sẽ auto-detect subState theo tTags hiện tại.
 */
async function assignTagXLAfterMerge(cluster) {
    try {
        if (!window.ProcessingTagState || !window.assignOrderCategory || !window.assignTTagToOrder || !window.toggleOrderFlag) {
            console.warn('[MERGE-PTAG] Required Processing Tag functions not available, skipping Tag XL assignment');
            return { success: false, error: 'Processing Tags module not loaded' };
        }

        console.log('[MERGE-PTAG] Starting Tag XL assignment for cluster:', cluster.phone);

        // --- TARGET ORDER: gộp tất cả Tag XL từ mọi đơn ---
        const targetCode = String(cluster.targetOrder.Code);

        // Collect Tag XL data from ALL orders
        let bestCategory = null;
        let bestSubTag = null;
        const allFlags = new Map(); // key=flagId, value=flag object
        const allTTags = new Map(); // key=tTagId, value=tTag object

        // Process target order first (priority), then source orders
        const allOrders = [cluster.targetOrder, ...cluster.sourceOrders];
        for (const order of allOrders) {
            const ptagData = window.ProcessingTagState.getOrderData(String(order.Code));
            if (!ptagData) continue;

            // Category: ưu tiên đơn đầu tiên có category (target first)
            // Skip "Đã gộp không chốt" categories from previous merges
            if (ptagData.category !== null && ptagData.category !== undefined) {
                const isOldMergeTag = (ptagData.category === 3 && ptagData.subTag === 'DA_GOP_KHONG_CHOT');
                if (!isOldMergeTag && bestCategory === null) {
                    bestCategory = ptagData.category;
                    bestSubTag = ptagData.subTag;
                }
            }

            // Merge all flags from every order (dedup by ID)
            (ptagData.flags || []).forEach(f => {
                const fId = _mergeXLId(f);
                if (fId != null && !allFlags.has(fId)) allFlags.set(fId, f);
            });

            // Merge all tTags from every order (dedup by ID)
            (ptagData.tTags || []).forEach(t => {
                const tId = _mergeXLId(t);
                if (tId != null && !allTTags.has(tId)) allTTags.set(tId, t);
            });
        }

        const mergedFlags = [...allFlags.values()];
        const mergedTTags = [...allTTags.values()];

        // Set merged Tag XL data to target order
        if (bestCategory !== null || mergedFlags.length > 0 || mergedTTags.length > 0) {
            const existingTarget = window.ProcessingTagState.getOrderData(targetCode) || {};
            const targetSameCategory = bestCategory !== null
                && existingTarget.category === bestCategory
                && (existingTarget.subTag || null) === (bestSubTag || null);

            // Step 1: Set/update category
            if (bestCategory !== null && !targetSameCategory) {
                // Cần đổi category → assignOrderCategory (sẽ merge flags + reset+autodetect subState)
                await window.assignOrderCategory(targetCode, bestCategory, {
                    subTag: bestSubTag,
                    flags: mergedFlags,
                    source: 'Hệ thống (gộp đơn)'
                });
            } else {
                // Same category (hoặc không có category mới) → giữ nguyên category+subState,
                // chỉ merge flags individually qua toggleOrderFlag để tránh reset subState.
                for (const flag of mergedFlags) {
                    const flagId = _mergeXLId(flag);
                    if (flagId == null) continue;
                    const cur = window.ProcessingTagState.getOrderData(targetCode);
                    const has = (cur?.flags || []).some(f => _mergeXLId(f) === flagId);
                    if (!has) {
                        await window.toggleOrderFlag(targetCode, flagId, 'Hệ thống (gộp đơn)');
                    }
                }
            }

            // Step 2: Add merged tTags via assignTTagToOrder (each call persists + syncs)
            // Skip nếu tTag đã có ở target sau step 1.
            for (const tTag of mergedTTags) {
                const tId = _mergeXLId(tTag);
                if (tId == null) continue;
                const cur = window.ProcessingTagState.getOrderData(targetCode);
                const has = (cur?.tTags || []).some(t => _mergeXLId(t) === tId);
                if (!has) {
                    await window.assignTTagToOrder(targetCode, tId, 'Hệ thống (gộp đơn)');
                }
            }

            console.log(`[MERGE-PTAG] ✅ Target STT ${cluster.targetOrder.SessionIndex}: cat=${bestCategory}, subTag=${bestSubTag}, flags=${mergedFlags.length}, tTags=${mergedTTags.length}`);
        } else {
            console.log(`[MERGE-PTAG] Target STT ${cluster.targetOrder.SessionIndex}: no Tag XL data to merge`);
        }

        // --- SOURCE ORDERS: gán KHÔNG CẦN CHỐT / Đã gộp không chốt ---
        // Logic tag như cũ: assignOrderCategory(3, DA_GOP_KHONG_CHOT) — preserve flags + tTags
        for (const sourceOrder of cluster.sourceOrders) {
            const sourceCode = String(sourceOrder.Code);
            await window.assignOrderCategory(sourceCode, 3, {
                subTag: 'DA_GOP_KHONG_CHOT',
                source: 'Hệ thống (gộp đơn)'
            });
            console.log(`[MERGE-PTAG] ✅ Source STT ${sourceOrder.SessionIndex}: KHÔNG CẦN CHỐT / Đã gộp không chốt`);
        }

        // Refresh panel if visible
        if (window.renderPanelContent) {
            window.renderPanelContent();
        }

        return { success: true };
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


