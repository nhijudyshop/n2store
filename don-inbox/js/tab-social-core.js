// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders - Core Module
 * Initialization, state management, utilities
 */

// ===== GLOBAL STATE =====
const SocialOrderState = {
    orders: [], // All orders from Firebase
    filteredOrders: [], // Orders after filtering
    selectedOrders: new Set(), // Selected order IDs
    tags: [], // Available tags
    isLoading: false,
    currentEditingOrder: null,

    // Filters
    filters: {
        search: '',
        status: 'draft',
        source: 'all',
        tag: 'all',
    },
};

// ===== CONSTANTS =====
const SOURCE_CONFIG = {
    manual: { label: 'Thủ công', icon: 'fa-pen', color: '#6b7280' },
    facebook_post: { label: 'Facebook', icon: 'fa-facebook-f', color: '#1877f2' },
    instagram: { label: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
    tiktok: { label: 'TikTok', icon: 'fa-tiktok', color: '#000000' },
};

const STATUS_CONFIG = {
    draft: { label: 'Nháp', color: '#fbbf24', bgColor: '#fef3c7', textColor: '#92400e' },
    order: { label: 'Đơn hàng', color: '#6366f1', bgColor: '#e0e7ff', textColor: '#4338ca' },
    processing: { label: 'Đang xử lý', color: '#3b82f6', bgColor: '#dbeafe', textColor: '#1e40af' },
    completed: { label: 'Hoàn thành', color: '#10b981', bgColor: '#d1fae5', textColor: '#065f46' },
    cancelled: { label: 'Đã hủy', color: '#ef4444', bgColor: '#fee2e2', textColor: '#991b1b' },
};

// ===== DEFAULT TAGS =====
const DEFAULT_TAGS = [
    { id: 'tag_vip', name: 'VIP', color: '#ef4444' },
    { id: 'tag_new', name: 'Khách mới', color: '#10b981' },
    { id: 'tag_call', name: 'Đã gọi', color: '#3b82f6' },
    { id: 'tag_wait', name: 'Chờ ship', color: '#f59e0b' },
    { id: 'tag_return', name: 'Khách cũ', color: '#8b5cf6' },
];

// ===== STORAGE KEYS =====
const SOCIAL_ORDERS_STORAGE_KEY = 'socialOrders';
const SOCIAL_TAGS_STORAGE_KEY = 'socialOrderTags';
const SOCIAL_TAGS_IDB_KEY = 'social_tags_cache'; // IndexedDB key for tags

// ===== LOCAL STORAGE PERSISTENCE (Orders - stripped images to avoid quota) =====
function saveSocialOrdersToStorage() {
    try {
        // Strip base64 images to prevent localStorage quota overflow
        const stripped = SocialOrderState.orders.map(order => ({
            ...order,
            noteImages: [],
            products: (order.products || []).map(p => ({
                ...p,
                productImages: [],
                priceImages: []
            }))
        }));
        localStorage.setItem(SOCIAL_ORDERS_STORAGE_KEY, JSON.stringify(stripped));
    } catch (e) {
        console.warn('[Tab Social] Failed to save orders to localStorage:', e);
        // If still quota exceeded, clear and retry with minimal data
        if (e.name === 'QuotaExceededError') {
            try {
                localStorage.removeItem(SOCIAL_ORDERS_STORAGE_KEY);
                console.warn('[Tab Social] Cleared orders from localStorage due to quota');
            } catch (_) { /* ignore */ }
        }
    }
}

function loadSocialOrdersFromStorage() {
    try {
        const data = localStorage.getItem(SOCIAL_ORDERS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Tab Social] Failed to load orders from localStorage:', e);
        return [];
    }
}

// ===== INDEXEDDB PERSISTENCE (Tags - may contain base64 images) =====
/**
 * Save tags to IndexedDB (primary local cache) + localStorage (fallback).
 * IndexedDB handles large data (images) better than localStorage's 5MB limit.
 */
function saveSocialTagsToStorage() {
    const tags = SocialOrderState.tags;

    // Primary: IndexedDB (async, large capacity)
    if (window.indexedDBStorage) {
        window.indexedDBStorage.setItem(SOCIAL_TAGS_IDB_KEY, tags).catch(e => {
            console.error('[Tab Social] Failed to save tags to IndexedDB:', e);
        });
    }

    // Fallback: localStorage (sync, for quick reads if IndexedDB not ready)
    // Strip images to avoid localStorage quota issues
    try {
        const tagsWithoutImages = tags.map(t => {
            const { image, ...rest } = t;
            return rest;
        });
        localStorage.setItem(SOCIAL_TAGS_STORAGE_KEY, JSON.stringify(tagsWithoutImages));
    } catch (e) {
        console.warn('[Tab Social] Failed to save tags to localStorage (fallback):', e);
    }
}

/**
 * Load tags from IndexedDB first, fallback to localStorage, then defaults.
 * This is synchronous-compatible: returns cached data immediately.
 * For async IndexedDB load, use loadSocialTagsFromStorageAsync().
 */
function loadSocialTagsFromStorage() {
    // Synchronous fallback: localStorage (may not have images)
    try {
        const data = localStorage.getItem(SOCIAL_TAGS_STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_TAGS;
    } catch (e) {
        console.error('[Tab Social] Failed to load tags from localStorage:', e);
        return DEFAULT_TAGS;
    }
}

/**
 * Async version: loads from IndexedDB (with images), falls back to localStorage.
 * @returns {Promise<Array>} Tags array
 */
async function loadSocialTagsFromStorageAsync() {
    // Try IndexedDB first (has full data including images)
    if (window.indexedDBStorage) {
        try {
            const tags = await window.indexedDBStorage.getItem(SOCIAL_TAGS_IDB_KEY);
            if (tags && Array.isArray(tags) && tags.length > 0) {
                console.log('[Tab Social] Loaded', tags.length, 'tags from IndexedDB cache');
                return tags;
            }
        } catch (e) {
            console.warn('[Tab Social] Failed to load tags from IndexedDB:', e);
        }
    }

    // Fallback to localStorage (sync, may not have images)
    return loadSocialTagsFromStorage();
}

/**
 * Migrate existing tags from localStorage to IndexedDB (one-time).
 * Called during init to ensure IndexedDB has the data.
 */
async function migrateTagsToIndexedDB() {
    if (!window.indexedDBStorage) return;

    try {
        const existing = await window.indexedDBStorage.getItem(SOCIAL_TAGS_IDB_KEY);
        if (existing && Array.isArray(existing) && existing.length > 0) {
            return; // Already migrated
        }

        // Migrate from localStorage
        const localData = localStorage.getItem(SOCIAL_TAGS_STORAGE_KEY);
        if (localData) {
            const tags = JSON.parse(localData);
            await window.indexedDBStorage.setItem(SOCIAL_TAGS_IDB_KEY, tags);
            console.log('[Tab Social] Migrated', tags.length, 'tags from localStorage to IndexedDB');
        }
    } catch (e) {
        console.warn('[Tab Social] Tag migration to IndexedDB failed:', e);
    }
}

// ===== UTILITY FUNCTIONS =====
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function generateOrderId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
    return `SO-${dateStr}-${random}`;
}

function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
    SocialOrderState.isLoading = show;
}

function showNotification(message, type = 'success') {
    // Try to use the shared notification system
    if (typeof window.notificationManager !== 'undefined') {
        window.notificationManager.show(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        // Fallback to alert
        alert(message);
    }
}

// 2026-05-19: KPI inbox = 5.000đ / món bán được (status='order'). Đồng bộ với
// orders-report KPI Đơn Inbox tab.
const KPI_PER_UNIT_INBOX = 5000;

/**
 * Cập nhật stat card KPI ở filter row — chạy mỗi lần performTableSearch.
 * KPI CHỈ thay đổi theo bộ lọc NGÀY, bỏ qua status/source/tag/search.
 *
 * Gate (đồng bộ SocialKpiReconcile.qualify — 1 nguồn sự thật):
 *   - status === 'order' AND có phiếu bán hàng TPOS ĐÃ CHỐT (ShowState ∈
 *     {Đã xác nhận, Đã thanh toán, Hoàn thành}) và KHÔNG bị hủy.
 *   - createdAt nằm trong dateRange của `currentDateFilter`.
 * KPI gross/đơn = Σ (Quantity line item phiếu) × 5.000đ (fallback totalQuantity).
 * Nếu đã chạy đối soát (SocialKpiReconcile.byOrder có record) → dùng KPI net (đã trừ
 * món hoàn) cho đơn đó; đơn chưa đối soát → net = gross.
 */
function updateInboxKpiStatCard() {
    const card = document.getElementById('inboxKpiStatCard');
    if (!card) return;
    const all = window.SocialOrderState?.orders || [];
    const R = window.SocialKpiReconcile;

    const filterKey =
        typeof currentDateFilter !== 'undefined' ? currentDateFilter : 'all';
    // Reuse getDateRange (defined in tab-social-table.js). Nếu chưa load → fallback all.
    const range =
        typeof getDateRange === 'function'
            ? getDateRange(filterKey)
            : { from: null, to: null };

    // Gate: ưu tiên module; fallback inline nếu module chưa load.
    const qualifies = (o) => {
        if (R?.qualify) return R.qualify(o);
        if (!o || o.status !== 'order') return false;
        const inv = window.InvoiceStatusStore?.get(o.id);
        if (!inv) return false;
        const cancelled =
            inv.State === 'cancel' ||
            inv.StateCode === 'cancel' ||
            inv.IsMergeCancel === true ||
            inv.ShowState === 'Huỷ bỏ' ||
            inv.ShowState === 'Hủy bỏ';
        if (cancelled) return false;
        return ['Đã xác nhận', 'Đã thanh toán', 'Hoàn thành'].includes(
            inv.ShowState || ''
        );
    };
    const grossQty = (o) => {
        const inv = window.InvoiceStatusStore?.get(o.id);
        if (R?.grossQtyFromCache) return R.grossQtyFromCache(o, inv);
        const lines = inv?.OrderLines;
        if (Array.isArray(lines) && lines.length) {
            const sum = lines.reduce(
                (s, l) => s + (Number(l.ProductUOMQty) || Number(l.Quantity) || 0),
                0
            );
            if (sum > 0) return sum;
        }
        return Number(o.totalQuantity) || 0;
    };

    const kpiOrders = all.filter((o) => {
        if (!qualifies(o)) return false;
        if (range.from || range.to) {
            const ts = new Date(o.createdAt);
            if (range.from && ts < range.from) return false;
            if (range.to && ts > range.to) return false;
        }
        return true;
    });

    let totalQty = 0;
    let totalGross = 0;
    let totalNet = 0;
    let totalLoss = 0;
    let anyRecon = false;
    for (const o of kpiOrders) {
        const rec = R?.byOrder?.get(o.id);
        if (rec) {
            // Đơn đã đối soát → dùng gross/net của đối soát (đồng bộ nguồn món).
            anyRecon = true;
            totalQty += rec.grossKpi / KPI_PER_UNIT_INBOX;
            totalGross += rec.grossKpi;
            totalNet += rec.netKpi;
            totalLoss += rec.refundedKpiAmount;
        } else {
            const q = grossQty(o);
            const g = q * KPI_PER_UNIT_INBOX;
            totalQty += q;
            totalGross += g;
            totalNet += g; // chưa đối soát đơn này → net = gross
        }
    }
    const displayKpi = anyRecon ? totalNet : totalGross;

    const labelMap = {
        all: 'KPI tất cả',
        today: 'KPI hôm nay',
        yesterday: 'KPI hôm qua',
        '3days': 'KPI 3 ngày',
        '7days': 'KPI 7 ngày',
        '15days': 'KPI 15 ngày',
        custom: 'KPI khoảng đã chọn',
    };
    const labelEl = document.getElementById('inboxKpiStatLabel');
    if (labelEl) labelEl.textContent = labelMap[filterKey] || 'KPI';

    const qtyEl = document.getElementById('inboxKpiQty');
    if (qtyEl) qtyEl.textContent = totalQty.toLocaleString('vi-VN');

    const amtEl = document.getElementById('inboxKpiAmount');
    if (amtEl) amtEl.textContent = formatVndInbox(displayKpi);

    // Dòng phụ: loss (đã đối soát) hoặc hint chưa trừ hàng trả.
    const lossEl = document.getElementById('inboxKpiLoss');
    if (lossEl) {
        if (anyRecon && totalLoss > 0) {
            lossEl.innerHTML = `<span style="color:#dc2626;">(−${formatVndInbox(totalLoss)} hoàn)</span>`;
        } else if (anyRecon) {
            lossEl.innerHTML = `<span style="color:#059669;">(đã đối soát)</span>`;
        } else {
            lossEl.innerHTML = `<span style="color:#9ca3af;">· chưa trừ hàng trả</span>`;
        }
    }
    card.title = anyRecon
        ? `KPI net các đơn 'Đơn hàng' có phiếu đã chốt (gross ${formatVndInbox(totalGross)} − ${formatVndInbox(totalLoss)} hoàn)`
        : "Tổng KPI gross các đơn 'Đơn hàng' có phiếu TPOS đã chốt (5.000đ/món). Bấm 'Chạy đối soát KPI' để trừ hàng trả.";
}

function formatVndInbox(n) {
    return new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ';
}

/**
 * Toast "User bán được X món - nhận được Yk" khi đơn vừa transition sang
 * status='order' (được chấp nhận tính KPI). Gọi từ các call site update status.
 *
 * @param {object} order — order sau khi đã set status='order'.
 * @param {string} [prevStatus] — status trước đó. Nếu đã là 'order' → không fire.
 */
function notifyOrderKpiEarned(order, prevStatus) {
    if (!order) return;
    if (prevStatus === 'order') return; // đã tính KPI trước đó, không bắn nữa
    if (order.status !== 'order') return;
    const qty = Number(order.totalQuantity) || 0;
    if (qty <= 0) return;

    const kpi = qty * KPI_PER_UNIT_INBOX;
    const kpiK = Math.round(kpi / 1000); // "25k", "10k" — quy đổi sang nghìn cho gọn
    const userName =
        order.createdByName ||
        order.assignedUserName ||
        order.createdBy ||
        'Bạn';
    const msg = `${userName} bán được ${qty.toLocaleString('vi-VN')} món - nhận được ${kpiK}k`;

    if (window.notificationManager?.success) {
        window.notificationManager.success(msg, 6000, { title: 'KPI 🎉' });
    } else if (typeof showNotification === 'function') {
        showNotification(msg, 'success');
    } else {
        console.log('[KPI] ', msg);
    }
}

window.updateInboxKpiStatCard = updateInboxKpiStatCard;
window.notifyOrderKpiEarned = notifyOrderKpiEarned;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    console.log('[Tab Social] Initializing...');
    initSocialTab();
});

async function initSocialTab() {
    try {
        showLoading(true);

        // Initialize Pancake Token Manager for fetching posts
        if (window.pancakeTokenManager) {
            console.log('[Tab Social] Initializing Pancake Token Manager...');
            await window.pancakeTokenManager.initialize();
            console.log('[Tab Social] Pancake Token Manager initialized');
        } else {
            console.warn('[Tab Social] Pancake Token Manager not available');
        }

        // Migrate tags to IndexedDB if needed (one-time)
        await migrateTagsToIndexedDB();

        // Load data from Firestore (source of truth), fallback to local cache
        if (typeof loadSocialOrdersFromFirebase === 'function') {
            SocialOrderState.orders = await loadSocialOrdersFromFirebase();
            SocialOrderState.tags = await loadSocialTagsFromFirebase();
        } else {
            // Fallback if firebase module not loaded
            SocialOrderState.orders = loadSocialOrdersFromStorage();
            SocialOrderState.tags = await loadSocialTagsFromStorageAsync();
        }
        // Apply default filters (status=draft) and render table
        performTableSearch();

        // Initialize column visibility
        if (typeof initializeColumnVisibility === 'function') {
            initializeColumnVisibility();
        }

        // Populate tag filter
        populateTagFilter();

        // Initialize tag panel (right side filter)
        if (typeof initTagPanel === 'function') {
            initTagPanel();
        }

        // Update search result count
        updateSearchResultCount();

        // Real-time listeners DISABLED - tab social chỉ 1 nhân viên phụ trách, không cần cross-device sync
        // Nếu cần bật lại: bỏ comment 2 dòng bên dưới
        // if (typeof setupSocialOrdersListener === 'function') setupSocialOrdersListener();
        // if (typeof setupSocialTagsListener === 'function') setupSocialTagsListener();

        // Load currentUserIdentifier from Firestore (needed for cancel order to save canceller name)
        if (!window.currentUserIdentifier) {
            try {
                const auth = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
                if (auth?.username && typeof firebase !== 'undefined' && firebase.firestore) {
                    const db = firebase.firestore();
                    const userDoc = await db.collection('users').doc(auth.username).get();
                    if (userDoc.exists) {
                        window.currentUserIdentifier = userDoc.data().identifier || null;
                        console.log('[Tab Social] Loaded user identifier:', window.currentUserIdentifier);
                    }
                }
                // Fallback: use displayName from authManager
                if (!window.currentUserIdentifier) {
                    const authFallback = window.authManager?.getAuthData?.();
                    window.currentUserIdentifier = authFallback?.displayName || authFallback?.username || null;
                    console.log('[Tab Social] Using auth displayName as fallback:', window.currentUserIdentifier);
                }
            } catch (e) {
                console.warn('[Tab Social] Could not load user identifier:', e);
            }
        }

        console.log('[Tab Social] Initialized with', SocialOrderState.orders.length, 'orders');
    } catch (error) {
        console.error('[Tab Social] Init error:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadOrders() {
    console.log('[Tab Social] Reloading orders...');
    if (typeof loadSocialOrdersFromFirebase === 'function') {
        SocialOrderState.orders = await loadSocialOrdersFromFirebase();
        SocialOrderState.tags = await loadSocialTagsFromFirebase();
    } else {
        SocialOrderState.orders = loadSocialOrdersFromStorage();
        SocialOrderState.tags = await loadSocialTagsFromStorageAsync();
    }
    performTableSearch();
    populateTagFilter();
    showNotification('Đã tải lại dữ liệu', 'success');
}

// ===== EXPORT FOR OTHER MODULES =====
window.SocialOrderState = SocialOrderState;
window.SOURCE_CONFIG = SOURCE_CONFIG;
window.STATUS_CONFIG = STATUS_CONFIG;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.generateOrderId = generateOrderId;
window.showLoading = showLoading;
window.showNotification = showNotification;
window.debounce = debounce;
window.loadOrders = loadOrders;
window.saveSocialOrdersToStorage = saveSocialOrdersToStorage;
window.saveSocialTagsToStorage = saveSocialTagsToStorage;
window.loadSocialTagsFromStorageAsync = loadSocialTagsFromStorageAsync;
