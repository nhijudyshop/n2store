// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders - API Module (Render PostgreSQL)
 *
 * Strategy:
 * - All operations via Render API (PostgreSQL)
 * - localStorage as offline fallback cache
 *
 * API Base: /api/social-orders (via Cloudflare Worker → n2store-fallback)
 */

// ===== CONSTANTS =====
const SOCIAL_API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/social-orders';

// ===== API HELPER =====
async function _apiFetch(path, options = {}) {
    const url = `${SOCIAL_API_BASE}${path}`;
    const resp = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `API ${resp.status}`);
    }
    return resp.json();
}

// ===== LOAD ALL ORDERS (Render API only) =====
/**
 * Load orders from Render API. Falls back to localStorage if API fails.
 * @returns {Promise<Array>} Array of orders
 */
async function loadSocialOrdersFromFirebase() {
    let orders = [];
    try {
        const data = await _apiFetch('/load?limit=500');
        if (data.success && data.orders) {
            orders = data.orders;
            console.log('[SocialAPI] Loaded', orders.length, 'orders from Render API');
        }
    } catch (e) {
        console.warn('[SocialAPI] Render API failed:', e.message);
    }

    if (orders.length === 0) {
        const cached = loadSocialOrdersFromStorage();
        if (cached.length > 0) {
            console.log('[SocialAPI] Using localStorage cache:', cached.length, 'orders');
            return cached;
        }
    }

    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    SocialOrderState.orders = orders;
    saveSocialOrdersToStorage();
    return orders;
}

// ===== LOAD TAGS (Render API only, with local fallback) =====
async function loadSocialTagsFromFirebase() {
    // 1. Try Render API first
    try {
        const data = await _apiFetch('/tags');
        if (data.success && data.tags && data.tags.length > 0) {
            const tags = data.tags;
            console.log('[SocialAPI] Loaded', tags.length, 'tags from Render API');

            // Recovery: scan orders for orphan tags
            const recovered = recoverOrphanTags(tags);
            SocialOrderState.tags = recovered;
            saveSocialTagsToStorage();
            return recovered;
        }
    } catch (e) {
        console.warn('[SocialAPI] Tags API failed:', e.message);
    }

    // 2. Fallback: Local cache
    let localTags;
    if (typeof loadSocialTagsFromStorageAsync === 'function') {
        localTags = await loadSocialTagsFromStorageAsync();
    } else {
        localTags = loadSocialTagsFromStorage();
    }

    if (localTags && localTags.length > 0) {
        const defaultIds = new Set(DEFAULT_TAGS.map(t => t.id));
        const hasCustomTags = localTags.some(t => !defaultIds.has(t.id));
        if (hasCustomTags || localTags.length > DEFAULT_TAGS.length) {
            // Save to Render API
            saveSocialTagsToFirebase(localTags);
            return localTags;
        }
    }

    return DEFAULT_TAGS;
}

/**
 * Recover tags that exist on orders but are missing from the tag list.
 */
function recoverOrphanTags(currentTags) {
    const tagIds = new Set(currentTags.map(t => t.id));
    const orphanTags = [];

    (SocialOrderState.orders || []).forEach(order => {
        (order.tags || []).forEach(tag => {
            if (tag.id && !tagIds.has(tag.id)) {
                tagIds.add(tag.id);
                orphanTags.push({
                    id: tag.id,
                    name: tag.name || 'Unknown',
                    color: tag.color || '#6b7280',
                    image: tag.image || undefined,
                    recoveredAt: Date.now()
                });
            }
        });
    });

    if (orphanTags.length > 0) {
        console.warn('[SocialAPI] Recovered', orphanTags.length, 'orphan tags:', orphanTags.map(t => t.name));
        const merged = [...currentTags, ...orphanTags];
        saveSocialTagsToFirebase(merged);
        return merged;
    }

    return currentTags;
}

// ===== SAVE TAGS (Render API only) =====
async function saveSocialTagsToFirebase(tags) {
    const tagsToSave = tags || SocialOrderState.tags;
    try {
        await _apiFetch('/tags', {
            method: 'POST',
            body: JSON.stringify({ tags: tagsToSave })
        });
        console.log('[SocialAPI] Saved', tagsToSave.length, 'tags to Render API');
    } catch (e) {
        console.error('[SocialAPI] Error saving tags:', e.message);
    }
}

// ===== CREATE ORDER (Render API only) =====
async function createSocialOrder(order) {
    saveSocialOrdersToStorage();

    try {
        await _apiFetch('/entries', {
            method: 'POST',
            body: JSON.stringify(order)
        });
        console.log('[SocialAPI] Created order:', order.id);
    } catch (e) {
        console.error('[SocialAPI] Error creating order:', e.message);
        showNotification('Lỗi lưu server, đã lưu cục bộ', 'warning');
    }

    return order.id;
}

// ===== UPDATE ORDER (Render API only) =====
async function updateSocialOrder(orderId, updates) {
    saveSocialOrdersToStorage();

    try {
        await _apiFetch(`/entries/${encodeURIComponent(orderId)}`, {
            method: 'PUT',
            body: JSON.stringify({ ...updates, updatedAt: Date.now() })
        });
        console.log('[SocialAPI] Updated order:', orderId);
    } catch (e) {
        console.error('[SocialAPI] Error updating order:', e.message);
    }
}

// ===== DELETE ORDER (Render API only) =====
async function deleteSocialOrder(orderId) {
    saveSocialOrdersToStorage();

    try {
        await _apiFetch(`/entries/${encodeURIComponent(orderId)}`, {
            method: 'DELETE'
        });
        console.log('[SocialAPI] Deleted order:', orderId);
    } catch (e) {
        console.error('[SocialAPI] Error deleting order:', e.message);
    }
}

// ===== BULK DELETE ORDERS (Render API only) =====
async function bulkDeleteSocialOrders(orderIds) {
    saveSocialOrdersToStorage();

    try {
        await _apiFetch('/entries/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids: orderIds })
        });
        console.log('[SocialAPI] Bulk deleted', orderIds.length, 'orders');
    } catch (e) {
        console.error('[SocialAPI] Error bulk deleting:', e.message);
    }
}

// ===== UPDATE TAGS FOR ORDER =====
async function updateSocialOrderTags(orderId, tags) {
    return updateSocialOrder(orderId, { tags });
}

// ===== BULK UPDATE ORDER TAGS (for tag deletion) =====
async function bulkUpdateSocialOrderTags(orderIds, deletedTagId) {
    if (orderIds.length === 0) return;

    try {
        // Update each affected order via API
        for (const orderId of orderIds) {
            const order = SocialOrderState.orders.find(o => o.id === orderId);
            if (order) {
                await updateSocialOrder(orderId, { tags: order.tags || [] });
            }
        }
        console.log('[SocialAPI] Batch updated tags for', orderIds.length, 'orders');
    } catch (e) {
        console.error('[SocialAPI] Error batch updating tags:', e.message);
    }
}

/**
 * Batch update tags data for multiple orders.
 * Used when editing a tag (name/color/image change).
 */
async function bulkUpdateSocialOrderTagsData(orderTagsData) {
    if (!orderTagsData || orderTagsData.length === 0) return;

    try {
        for (const { id, tags } of orderTagsData) {
            await updateSocialOrder(id, { tags });
        }
        console.log('[SocialAPI] Batch updated tag data for', orderTagsData.length, 'orders');
    } catch (e) {
        console.error('[SocialAPI] Error batch updating tag data:', e.message);
    }
}

// ===== GET SINGLE ORDER =====
async function getSocialOrderById(orderId) {
    // Use local state first (fastest)
    return SocialOrderState.orders.find(o => o.id === orderId) || null;
}

// ===== HELPER FUNCTIONS =====
function getNextSTT() {
    if (SocialOrderState.orders.length === 0) return 1;
    const maxSTT = Math.max(...SocialOrderState.orders.map(o => o.stt || 0));
    return maxSTT + 1;
}

function orderIdExists(orderId) {
    return SocialOrderState.orders.some(o => o.id === orderId);
}

// ===== EXPORTS =====
window.loadSocialOrdersFromFirebase = loadSocialOrdersFromFirebase;
window.loadSocialTagsFromFirebase = loadSocialTagsFromFirebase;
window.saveSocialTagsToFirebase = saveSocialTagsToFirebase;
window.createSocialOrder = createSocialOrder;
window.updateSocialOrder = updateSocialOrder;
window.deleteSocialOrder = deleteSocialOrder;
window.bulkDeleteSocialOrders = bulkDeleteSocialOrders;
window.updateSocialOrderTags = updateSocialOrderTags;
window.bulkUpdateSocialOrderTags = bulkUpdateSocialOrderTags;
window.bulkUpdateSocialOrderTagsData = bulkUpdateSocialOrderTagsData;
window.getSocialOrderById = getSocialOrderById;
window.getNextSTT = getNextSTT;
window.orderIdExists = orderIdExists;
