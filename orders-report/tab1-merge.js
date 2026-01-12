/**
 * TAB1-MERGE.JS - Order Merge Module
 * Handles merging duplicate orders by phone number
 * Depends on: tab1-core.js, tab1-firebase.js
 */

// =====================================================
// MERGE STATE
// =====================================================
let mergeClusters = [];
let selectedMergeClusters = new Set();

const MERGE_HISTORY_COLLECTION = 'merge_orders_history';
const MERGE_TAG_COLOR = '#E3A21A';
const MERGED_ORDER_TAG_NAME = 'ĐÃ GỘP KO CHỐT';

// =====================================================
// FIND DUPLICATE ORDERS
// =====================================================
function findDuplicateOrdersByPhone() {
    const state = window.tab1State;
    const allData = state.allData;

    if (!allData || allData.length === 0) {
        return [];
    }

    // Group orders by phone number
    const phoneGroups = {};

    allData.forEach(order => {
        const phone = normalizePhone(order.Telephone || order.PartnerPhone);
        if (!phone) return;

        if (!phoneGroups[phone]) {
            phoneGroups[phone] = [];
        }
        phoneGroups[phone].push(order);
    });

    // Find groups with more than 1 order
    const duplicates = [];

    Object.keys(phoneGroups).forEach(phone => {
        const orders = phoneGroups[phone];
        if (orders.length > 1) {
            // Sort by SessionIndex (STT) - largest first
            orders.sort((a, b) => {
                const sttA = parseInt(a.SessionIndex) || 0;
                const sttB = parseInt(b.SessionIndex) || 0;
                return sttB - sttA;
            });

            // Target order is the one with largest STT
            const targetOrder = orders[0];
            const sourceOrders = orders.slice(1);

            // Merge products from all orders
            const mergedProducts = mergeOrderProducts(orders);

            duplicates.push({
                phone: phone,
                orders: orders,
                targetOrder: targetOrder,
                sourceOrders: sourceOrders,
                mergedProducts: mergedProducts,
                totalOrders: orders.length
            });
        }
    });

    // Sort by number of duplicate orders (descending)
    duplicates.sort((a, b) => b.totalOrders - a.totalOrders);

    return duplicates;
}

function normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters
    return phone.toString().replace(/\D/g, '');
}

function mergeOrderProducts(orders) {
    const productMap = {};

    orders.forEach(order => {
        const details = order.Details || [];
        details.forEach(detail => {
            const productId = detail.ProductId;
            if (!productId) return;

            if (!productMap[productId]) {
                productMap[productId] = {
                    ProductId: productId,
                    ProductCode: detail.ProductCode || '',
                    ProductName: detail.ProductName || detail.ProductNameGet || '',
                    ImageUrl: detail.ImageUrl || detail.ProductImageUrl || '',
                    Quantity: 0,
                    Price: detail.Price || 0,
                    Note: ''
                };
            }

            productMap[productId].Quantity += detail.Quantity || 0;

            // Combine notes
            if (detail.Note) {
                if (productMap[productId].Note) {
                    productMap[productId].Note += '; ' + detail.Note;
                } else {
                    productMap[productId].Note = detail.Note;
                }
            }
        });
    });

    return Object.values(productMap);
}

// =====================================================
// MERGE MODAL
// =====================================================
function showMergeDuplicateOrdersModal() {
    mergeClusters = findDuplicateOrdersByPhone();
    selectedMergeClusters.clear();

    const modal = document.getElementById('mergeDuplicateOrdersModal');
    const modalBody = document.getElementById('mergeDuplicateOrdersModalBody');
    const subtitle = document.getElementById('mergeDuplicateOrdersModalSubtitle');

    if (!modal || !modalBody) {
        console.error('[MERGE] Modal elements not found');
        return;
    }

    modal.classList.add('show');

    if (mergeClusters.length === 0) {
        subtitle.textContent = 'Không tìm thấy đơn hàng trùng lặp';
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 16px;"></i>
                <p>Không có đơn hàng nào trùng số điện thoại.</p>
            </div>`;
        return;
    }

    subtitle.textContent = `Tìm thấy ${mergeClusters.length} nhóm đơn hàng trùng SĐT`;

    const html = mergeClusters.map((cluster, index) => renderMergeCluster(cluster, index)).join('');
    modalBody.innerHTML = html;

    updateMergeConfirmButton();
}

function renderMergeCluster(cluster, index) {
    const ordersInfo = cluster.orders.map(o => `STT ${o.SessionIndex}`).join(' | ');
    const productsPreview = cluster.mergedProducts.slice(0, 3).map(p =>
        `${p.ProductName} (x${p.Quantity})`
    ).join(', ');

    const moreProducts = cluster.mergedProducts.length > 3
        ? ` + ${cluster.mergedProducts.length - 3} sản phẩm khác`
        : '';

    return `
        <div class="merge-cluster" data-index="${index}">
            <div class="merge-cluster-header" onclick="toggleMergeClusterSelection(${index})">
                <div class="merge-cluster-checkbox">
                    <input type="checkbox" id="mergeCluster_${index}"
                        ${selectedMergeClusters.has(index) ? 'checked' : ''}
                        onclick="event.stopPropagation(); toggleMergeClusterSelection(${index})">
                </div>
                <div class="merge-cluster-info">
                    <div class="merge-cluster-phone">
                        <i class="fas fa-phone"></i> ${cluster.phone}
                    </div>
                    <div class="merge-cluster-orders">
                        ${cluster.totalOrders} đơn: ${ordersInfo}
                    </div>
                    <div class="merge-cluster-products">
                        ${cluster.mergedProducts.length} SP: ${productsPreview}${moreProducts}
                    </div>
                </div>
                <div class="merge-cluster-toggle">
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
            <div class="merge-cluster-details" style="display: none;">
                ${renderMergeClusterTable(cluster)}
            </div>
        </div>`;
}

function renderMergeClusterTable(cluster) {
    const headers = [
        `<th class="merged-col">Sau Khi Gộp<br><small>(STT ${cluster.targetOrder.SessionIndex})</small></th>`
    ];

    cluster.sourceOrders.forEach(order => {
        headers.push(`<th>STT ${order.SessionIndex}</th>`);
    });

    headers.push(`<th class="target-col">STT ${cluster.targetOrder.SessionIndex} (Đích)</th>`);

    // Build rows
    const maxProducts = Math.max(
        cluster.mergedProducts.length,
        ...cluster.orders.map(o => (o.Details || []).length)
    );

    const rows = [];
    for (let i = 0; i < maxProducts; i++) {
        const cells = [];

        // Merged column
        const mergedProduct = cluster.mergedProducts[i];
        cells.push(`<td class="merged-col">${mergedProduct ? renderMergeProductItem(mergedProduct) : ''}</td>`);

        // Source orders
        cluster.sourceOrders.forEach(order => {
            const product = (order.Details || [])[i];
            cells.push(`<td>${product ? renderMergeProductItem(product) : ''}</td>`);
        });

        // Target order
        const targetProduct = (cluster.targetOrder.Details || [])[i];
        cells.push(`<td class="target-col">${targetProduct ? renderMergeProductItem(targetProduct) : ''}</td>`);

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
        </div>`;
}

function renderMergeProductItem(product) {
    const imgUrl = product.ImageUrl || product.ProductImageUrl || '';
    const imgHtml = imgUrl
        ? `<img src="${imgUrl}" class="merge-product-img" onerror="this.style.display='none'">`
        : `<div class="merge-product-img" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;"><i class="fas fa-box"></i></div>`;

    const name = product.ProductName || product.ProductNameGet || '';
    const code = product.ProductCode || '';
    const qty = product.Quantity || 0;
    const price = product.Price ? `${product.Price.toLocaleString('vi-VN')}đ` : '';

    return `
        <div class="merge-product-item">
            ${imgHtml}
            <div class="merge-product-info">
                <div class="merge-product-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                ${code ? `<span class="merge-product-code">${escapeHtml(code)}</span>` : ''}
                <div class="merge-product-details">
                    <span class="qty">SL: ${qty}</span>
                    ${price ? ` | <span class="price">${price}</span>` : ''}
                </div>
            </div>
        </div>`;
}

function closeMergeDuplicateOrdersModal() {
    const modal = document.getElementById('mergeDuplicateOrdersModal');
    if (modal) {
        modal.classList.remove('show');
    }
    mergeClusters = [];
    selectedMergeClusters.clear();
}

// =====================================================
// SELECTION HANDLING
// =====================================================
function toggleMergeClusterSelection(index) {
    if (selectedMergeClusters.has(index)) {
        selectedMergeClusters.delete(index);
    } else {
        selectedMergeClusters.add(index);
    }

    // Update checkbox
    const checkbox = document.getElementById(`mergeCluster_${index}`);
    if (checkbox) {
        checkbox.checked = selectedMergeClusters.has(index);
    }

    // Toggle details visibility
    const cluster = document.querySelector(`.merge-cluster[data-index="${index}"]`);
    if (cluster) {
        const details = cluster.querySelector('.merge-cluster-details');
        if (details) {
            details.style.display = selectedMergeClusters.has(index) ? 'block' : 'none';
        }
    }

    updateMergeConfirmButton();
}

function toggleSelectAllMergeClusters() {
    const allSelected = selectedMergeClusters.size === mergeClusters.length;

    if (allSelected) {
        selectedMergeClusters.clear();
    } else {
        mergeClusters.forEach((_, index) => {
            selectedMergeClusters.add(index);
        });
    }

    // Update all checkboxes
    mergeClusters.forEach((_, index) => {
        const checkbox = document.getElementById(`mergeCluster_${index}`);
        if (checkbox) {
            checkbox.checked = selectedMergeClusters.has(index);
        }

        const cluster = document.querySelector(`.merge-cluster[data-index="${index}"]`);
        if (cluster) {
            const details = cluster.querySelector('.merge-cluster-details');
            if (details) {
                details.style.display = selectedMergeClusters.has(index) ? 'block' : 'none';
            }
        }
    });

    updateMergeConfirmButton();
}

function updateMergeConfirmButton() {
    const btn = document.getElementById('mergeConfirmBtn');
    if (btn) {
        btn.disabled = selectedMergeClusters.size === 0;
        btn.textContent = selectedMergeClusters.size > 0
            ? `Gộp ${selectedMergeClusters.size} nhóm đã chọn`
            : 'Chọn nhóm để gộp';
    }
}

// =====================================================
// EXECUTE MERGE
// =====================================================
async function confirmMergeSelectedClusters() {
    if (selectedMergeClusters.size === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một nhóm để gộp');
        }
        return;
    }

    const confirmed = await window.notificationManager?.confirm(
        `Bạn có chắc chắn muốn gộp ${selectedMergeClusters.size} nhóm đơn hàng?`,
        'Xác nhận gộp đơn'
    );

    if (!confirmed) return;

    const selectedClusters = [];
    selectedMergeClusters.forEach(index => {
        selectedClusters.push(mergeClusters[index]);
    });

    // Show loading
    const btn = document.getElementById('mergeConfirmBtn');
    const originalText = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gộp...';
    }

    let successCount = 0;
    let failCount = 0;

    for (const cluster of selectedClusters) {
        try {
            const result = await executeMergeCluster(cluster);
            if (result.success) {
                successCount++;
                await saveMergeHistory(cluster, result);
            } else {
                failCount++;
                await saveMergeHistory(cluster, result, result.errorResponse);
            }
        } catch (error) {
            console.error('[MERGE] Error merging cluster:', error);
            failCount++;
            await saveMergeHistory(cluster, { success: false, message: error.message });
        }
    }

    // Show result
    if (window.notificationManager) {
        if (failCount === 0) {
            window.notificationManager.success(`Đã gộp thành công ${successCount} nhóm đơn hàng`);
        } else {
            window.notificationManager.warning(`Gộp xong: ${successCount} thành công, ${failCount} thất bại`);
        }
    }

    // Close modal and refresh
    closeMergeDuplicateOrdersModal();

    // Refresh table data
    try {
        if (typeof fetchOrders === 'function') {
            await fetchOrders();
        } else {
            if (typeof renderTable === 'function') renderTable();
            if (typeof updateStats === 'function') updateStats();
        }
    } catch (e) {
        console.warn('[MERGE] Could not auto-refresh:', e);
        if (typeof renderTable === 'function') renderTable();
    }
}

async function executeMergeCluster(cluster) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const targetOrderId = cluster.targetOrder.Id;

        // Fetch full target order
        const getUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${targetOrderId})?$expand=Details,Partner,User,CRMTeam`;
        const getResponse = await API_CONFIG.smartFetch(getUrl, {
            method: 'GET',
            headers: { ...headers, Accept: 'application/json' }
        });

        if (!getResponse.ok) {
            throw new Error(`Failed to fetch target order: HTTP ${getResponse.status}`);
        }

        const targetOrder = await getResponse.json();

        // Prepare merged details
        const payload = JSON.parse(JSON.stringify(targetOrder));

        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Replace details with merged products
        payload.Details = cluster.mergedProducts.map(product => ({
            ProductId: product.ProductId,
            Quantity: product.Quantity,
            Price: product.Price,
            Note: product.Note || null,
            UOMId: product.UOMId || 1,
            Factor: 1,
            Priority: 0,
            OrderId: targetOrderId,
            LiveCampaign_DetailId: null,
            ProductWeight: 0,
            ProductName: product.ProductName,
            ProductNameGet: product.ProductNameGet || product.ProductName,
            ProductCode: product.ProductCode,
            UOMName: product.UOMName || 'Cái',
            ImageUrl: product.ImageUrl
        }));

        // Calculate totals
        let totalQty = 0;
        let totalAmount = 0;
        payload.Details.forEach(d => {
            totalQty += d.Quantity || 0;
            totalAmount += (d.Quantity || 0) * (d.Price || 0);
        });
        payload.TotalQuantity = totalQty;
        payload.TotalAmount = totalAmount;

        // PUT updated order
        const putUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${targetOrderId})`;
        const putResponse = await API_CONFIG.smartFetch(putUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!putResponse.ok) {
            const errorText = await putResponse.text();
            return { success: false, message: `HTTP ${putResponse.status}`, errorResponse: errorText };
        }

        // Assign tags to merged orders
        await assignTagsAfterMerge(cluster);

        console.log('[MERGE] Successfully merged cluster:', cluster.phone);
        return { success: true };

    } catch (error) {
        console.error('[MERGE] Error executing merge:', error);
        return { success: false, message: error.message };
    }
}

// =====================================================
// MERGE HISTORY
// =====================================================
async function saveMergeHistory(cluster, result, errorResponse = null) {
    if (!window.db) return;

    try {
        const { userId, userName } = getMergeHistoryUserInfo();
        const timestamp = new Date();

        const historyEntry = {
            phone: cluster.phone,
            timestamp: firebase.firestore.Timestamp.fromDate(timestamp),
            timestampISO: timestamp.toISOString(),
            userId: userId,
            userName: userName,
            success: result.success,
            errorMessage: result.success ? null : (result.message || 'Unknown error'),
            errorResponse: errorResponse ? JSON.stringify(errorResponse) : null,
            sourceOrders: cluster.sourceOrders.map(o => ({
                orderId: o.Id,
                stt: o.SessionIndex,
                partnerName: o.PartnerName || ''
            })),
            targetOrder: {
                orderId: cluster.targetOrder.Id,
                stt: cluster.targetOrder.SessionIndex,
                partnerName: cluster.targetOrder.PartnerName || ''
            },
            mergedProducts: cluster.mergedProducts.map(p => ({
                productId: p.ProductId,
                productCode: p.ProductCode || '',
                productName: p.ProductName || '',
                quantity: p.Quantity || 0,
                price: p.Price || 0
            })),
            totalSourceOrders: cluster.sourceOrders.length,
            totalMergedProducts: cluster.mergedProducts.length
        };

        await window.db.collection(MERGE_HISTORY_COLLECTION).add(historyEntry);
        console.log('[MERGE-HISTORY] Saved history entry for phone:', cluster.phone);

    } catch (error) {
        console.error('[MERGE-HISTORY] Error saving history:', error);
    }
}

function getMergeHistoryUserInfo() {
    let userId = 'guest';
    let userName = 'Unknown';

    try {
        if (window.userStorageManager && window.userStorageManager.getUserIdentifier) {
            userId = window.userStorageManager.getUserIdentifier() || 'guest';
        }

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

async function showMergeHistoryModal() {
    const modal = document.getElementById('mergeHistoryModal');
    const modalBody = document.getElementById('mergeHistoryModalBody');

    if (!modal || !modalBody) return;

    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử gộp đơn...</p>
        </div>`;

    try {
        const history = await loadMergeHistory(100);

        if (history.length === 0) {
            modalBody.innerHTML = `
                <div class="merge-no-history">
                    <i class="fas fa-inbox"></i>
                    <p>Chưa có lịch sử gộp đơn nào.</p>
                </div>`;
            return;
        }

        const html = history.map((entry, index) => renderMergeHistoryEntry(entry, index)).join('');
        modalBody.innerHTML = html;

    } catch (error) {
        console.error('[MERGE-HISTORY] Error loading history:', error);
        modalBody.innerHTML = `
            <div class="merge-no-history">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi khi tải lịch sử: ${error.message}</p>
            </div>`;
    }
}

async function loadMergeHistory(limit = 50) {
    if (!window.db) return [];

    try {
        const snapshot = await window.db.collection(MERGE_HISTORY_COLLECTION)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const history = [];
        snapshot.forEach(doc => {
            history.push({ id: doc.id, ...doc.data() });
        });

        return history;

    } catch (error) {
        console.error('[MERGE-HISTORY] Error loading:', error);
        return [];
    }
}

function renderMergeHistoryEntry(entry, index) {
    const timestamp = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date(entry.timestampISO);
    const timeStr = timestamp.toLocaleString('vi-VN');
    const statusClass = entry.success ? 'success' : 'failed';
    const statusText = entry.success ? 'Thành công' : 'Thất bại';

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
            <div class="merge-history-details" style="display: none;">
                ${!entry.success && entry.errorMessage ? `
                    <div class="merge-history-error">
                        <i class="fas fa-exclamation-circle"></i> ${escapeHtml(entry.errorMessage)}
                    </div>
                ` : ''}
                <div style="padding: 16px; color: #6b7280;">
                    Chi tiết lịch sử gộp đơn...
                </div>
            </div>
        </div>`;
}

function toggleHistoryEntry(index) {
    const entry = document.getElementById(`history-entry-${index}`);
    if (entry) {
        entry.classList.toggle('expanded');
        const details = entry.querySelector('.merge-history-details');
        if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        }
    }
}

function closeMergeHistoryModal() {
    const modal = document.getElementById('mergeHistoryModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// =====================================================
// TAG ASSIGNMENT AFTER MERGE
// =====================================================
async function assignTagsAfterMerge(cluster) {
    try {
        // Ensure merge tag exists
        const mergedTag = await ensureMergeTagExists(MERGED_ORDER_TAG_NAME, MERGE_TAG_COLOR);

        // Assign tag to source orders (the ones that were merged into target)
        for (const order of cluster.sourceOrders) {
            const existingTags = getOrderTagsArray(order);
            const hasMergeTag = existingTags.some(t => t.Name === MERGED_ORDER_TAG_NAME);

            if (!hasMergeTag) {
                const newTags = [...existingTags, mergedTag];
                await assignTagsToOrder(order.Id, newTags);
            }
        }

        console.log('[MERGE-TAG] Assigned tags to source orders');

    } catch (error) {
        console.error('[MERGE-TAG] Error assigning tags:', error);
    }
}

async function ensureMergeTagExists(tagName, color) {
    const headers = await window.tokenManager.getAuthHeader();

    // Fetch fresh tags
    const tagsResponse = await API_CONFIG.smartFetch(
        `${API_CONFIG.WORKER_URL}/api/odata/Tag?$format=json&$count=true&$top=1000`,
        { method: 'GET', headers: { ...headers, Accept: 'application/json' } }
    );

    if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        const existingTag = (tagsData.value || []).find(t =>
            t.Name && t.Name.toLowerCase() === tagName.toLowerCase()
        );

        if (existingTag) return existingTag;
    }

    // Create new tag
    const createResponse = await API_CONFIG.smartFetch(
        `${API_CONFIG.WORKER_URL}/api/odata/Tag`,
        {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ Name: tagName, Color: color })
        }
    );

    if (createResponse.ok) {
        const newTag = await createResponse.json();
        delete newTag['@odata.context'];
        return newTag;
    }

    throw new Error('Could not create merge tag');
}

function getOrderTagsArray(order) {
    if (!order || !order.Tags) return [];

    const tagsData = order.Tags;

    if (Array.isArray(tagsData)) return tagsData;

    if (typeof tagsData === 'string' && tagsData.trim() !== '') {
        try {
            const parsed = JSON.parse(tagsData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    return [];
}

async function assignTagsToOrder(orderId, tags) {
    const headers = await window.tokenManager.getAuthHeader();

    await API_CONFIG.smartFetch(
        `${API_CONFIG.WORKER_URL}/api/odata/TagSaleOnlineOrder/ODataService.AssignTag`,
        {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                Tags: tags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                OrderId: orderId
            })
        }
    );
}

// =====================================================
// HELPER
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// EXPORTS
// =====================================================
window.showMergeDuplicateOrdersModal = showMergeDuplicateOrdersModal;
window.closeMergeDuplicateOrdersModal = closeMergeDuplicateOrdersModal;
window.toggleMergeClusterSelection = toggleMergeClusterSelection;
window.toggleSelectAllMergeClusters = toggleSelectAllMergeClusters;
window.confirmMergeSelectedClusters = confirmMergeSelectedClusters;
window.showMergeHistoryModal = showMergeHistoryModal;
window.closeMergeHistoryModal = closeMergeHistoryModal;
window.toggleHistoryEntry = toggleHistoryEntry;
window.findDuplicateOrdersByPhone = findDuplicateOrdersByPhone;
window.mergeOrderProducts = mergeOrderProducts;

console.log('[TAB1-MERGE] Module loaded');
