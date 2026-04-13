// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS MODULE - REST API SERVICE LAYER
 * File: service.js
 * Purpose: CRUD operations for purchase orders via Render PostgreSQL API
 * Migrated from Firestore → PostgreSQL for faster queries
 */

// ========================================
// REST API SERVICE CLASS
// ========================================
class PurchaseOrderService {
    constructor() {
        this.API_BASE = 'https://n2store-fallback.onrender.com/api/v2/purchase-orders';
        this.currentUser = null;
        this.initialized = false;
        this.storage = null; // Firebase Storage still used for images
        this.PAGE_SIZE = 20;
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    async initialize() {
        if (this.initialized) return;

        try {
            // Get current user from shared authManager
            if (window.authManager) {
                const authState = window.authManager.getAuthState?.() || window.authManager.getUserInfo?.();
                if (authState) {
                    this.currentUser = {
                        uid: authState.userId || authState.userType || 'anonymous',
                        displayName: authState.userName || authState.userType?.split('-')[0] || 'User',
                        email: authState.email || ''
                    };
                }
            }

            // Images stored via REST API (no Firebase Storage needed)

            this.initialized = true;
            console.log('[PurchaseOrderService] Initialized (REST API mode)');
        } catch (error) {
            console.error('[PurchaseOrderService] Initialization failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'INIT_FAILED',
                'Không thể khởi tạo service. Vui lòng tải lại trang.'
            );
        }
    }

    // ========================================
    // HTTP HELPERS
    // ========================================

    _getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.currentUser) {
            headers['X-Auth-Data'] = JSON.stringify({
                userId: this.currentUser.uid,
                userName: this.currentUser.displayName,
                email: this.currentUser.email
            });
        }
        return headers;
    }

    async _fetch(path, options = {}) {
        const url = `${this.API_BASE}${path}`;
        const response = await fetch(url, {
            headers: this._getHeaders(),
            ...options
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new window.PurchaseOrderValidation.ServiceException(
                'API_ERROR',
                data.error || `API error: ${response.status}`
            );
        }
        return data;
    }

    // ========================================
    // USER MANAGEMENT
    // ========================================

    setCurrentUser(user) {
        this.currentUser = user;
    }

    getUserSnapshot() {
        if (!this.currentUser) {
            return { uid: 'anonymous', displayName: 'Anonymous', email: '' };
        }
        return {
            uid: this.currentUser.uid || this.currentUser.id,
            displayName: this.currentUser.displayName || this.currentUser.name || 'Unknown',
            email: this.currentUser.email || ''
        };
    }

    // ========================================
    // CREATE OPERATIONS
    // ========================================

    async createOrder(orderData) {
        await this.initialize();

        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;

        try {
            // Validate order data
            const isDraft = orderData.status === config.OrderStatus.DRAFT;
            const validationOptions = isDraft ? { skipItems: true, skipFinancials: true } : {};
            const validationResult = validation.validateOrder(orderData, validationOptions);
            if (!validationResult.isValid) {
                throw new validation.ValidationException(validationResult.errors);
            }

            const data = await this._fetch('', {
                method: 'POST',
                body: JSON.stringify(orderData)
            });

            console.log('[PurchaseOrderService] Order created:', data.id);
            return data.id;
        } catch (error) {
            if (error instanceof validation.ValidationException) throw error;
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Create failed:', error);
            throw new validation.ServiceException('CREATE_FAILED', 'Không thể tạo đơn hàng. Vui lòng thử lại.');
        }
    }

    // ========================================
    // READ OPERATIONS
    // ========================================

    async getOrdersByStatus(status, options = {}) {
        await this.initialize();

        const {
            lastDoc = null,
            pageSize = this.PAGE_SIZE,
            startDate = null,
            endDate = null,
            searchTerm = null,
            page = 1
        } = options;

        try {
            const params = new URLSearchParams();
            if (status) {
                params.set('status', Array.isArray(status) ? status.join(',') : status);
            }
            params.set('pageSize', pageSize);
            params.set('page', lastDoc ? (lastDoc._page || 1) + 1 : page);
            if (startDate) params.set('startDate', startDate instanceof Date ? startDate.toISOString() : startDate);
            if (endDate) params.set('endDate', endDate instanceof Date ? endDate.toISOString() : endDate);
            if (searchTerm) params.set('search', searchTerm);

            const data = await this._fetch(`?${params.toString()}`);

            // Create a pagination cursor compatible with existing data-manager
            const currentPage = data.page || 1;

            return {
                orders: data.orders,
                lastDoc: data.hasMore ? { _page: currentPage } : null,
                hasMore: data.hasMore
            };
        } catch (error) {
            console.error('[PurchaseOrderService] Fetch failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'FETCH_FAILED',
                'Không thể tải danh sách đơn hàng. Vui lòng thử lại.'
            );
        }
    }

    async getOrderById(orderId) {
        await this.initialize();

        try {
            const data = await this._fetch(`/${orderId}`);
            return data.order;
        } catch (error) {
            console.error('[PurchaseOrderService] Get order failed:', error);
            return null;
        }
    }

    // ========================================
    // STATS (single query)
    // ========================================

    async getStatsAndCounts() {
        await this.initialize();

        try {
            const data = await this._fetch('/stats');
            return { stats: data.stats, counts: data.counts };
        } catch (error) {
            console.error('[PurchaseOrderService] Stats failed:', error);
            return {
                stats: { totalOrders: 0, totalValue: 0, todayOrders: 0, todayValue: 0, tposSyncRate: 0 },
                counts: {}
            };
        }
    }

    /** @deprecated Use getStatsAndCounts() */
    async getOrderStats() {
        const { stats } = await this.getStatsAndCounts();
        return stats;
    }

    /** @deprecated Use getStatsAndCounts() */
    async getStatusCounts() {
        const { counts } = await this.getStatsAndCounts();
        return counts;
    }

    // ========================================
    // UPDATE OPERATIONS
    // ========================================

    async updateOrder(orderId, updateData) {
        await this.initialize();

        const validation = window.PurchaseOrderValidation;

        try {
            await this._fetch(`/${orderId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });

            console.log('[PurchaseOrderService] Order updated:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Update failed:', error);
            throw new validation.ServiceException('UPDATE_FAILED', 'Không thể cập nhật đơn hàng. Vui lòng thử lại.');
        }
    }

    async updateOrderStatus(orderId, newStatus, reason = '') {
        await this.initialize();

        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;

        try {
            // Client-side transition validation (server also validates)
            // Get current order to validate transition
            const order = await this.getOrderById(orderId);
            if (order) {
                const transitionCheck = validation.validateStatusTransition(order.status, newStatus);
                if (!transitionCheck.isValid) {
                    throw new validation.ServiceException('INVALID_TRANSITION', transitionCheck.error);
                }
            }

            await this._fetch(`/${orderId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus, reason })
            });

            console.log('[PurchaseOrderService] Status updated:', orderId, '->', newStatus);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Status update failed:', error);
            throw new validation.ServiceException('UPDATE_FAILED', 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
        }
    }

    // ========================================
    // DELETE OPERATIONS
    // ========================================

    async deleteOrder(orderId) {
        await this.initialize();
        const validation = window.PurchaseOrderValidation;

        try {
            await this._fetch(`/${orderId}`, { method: 'DELETE' });
            console.log('[PurchaseOrderService] Order soft-deleted:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Delete failed:', error);
            throw new validation.ServiceException('DELETE_FAILED', 'Không thể xóa đơn hàng. Vui lòng thử lại.');
        }
    }

    async restoreOrder(orderId) {
        await this.initialize();
        const validation = window.PurchaseOrderValidation;

        try {
            await this._fetch(`/${orderId}/restore`, { method: 'POST' });
            console.log('[PurchaseOrderService] Order restored:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Restore failed:', error);
            throw new validation.ServiceException('RESTORE_FAILED', 'Không thể khôi phục đơn hàng. Vui lòng thử lại.');
        }
    }

    async permanentDeleteOrder(orderId) {
        await this.initialize();
        const validation = window.PurchaseOrderValidation;

        try {
            await this._fetch(`/${orderId}/permanent`, { method: 'DELETE' });
            console.log('[PurchaseOrderService] Order permanently deleted:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Permanent delete failed:', error);
            throw new validation.ServiceException('DELETE_FAILED', 'Không thể xóa vĩnh viễn đơn hàng. Vui lòng thử lại.');
        }
    }

    async cleanupTrash() {
        await this.initialize();
        const config = window.PurchaseOrderConfig;

        try {
            const data = await this._fetch('/cleanup-trash', {
                method: 'POST',
                body: JSON.stringify({ retentionDays: config.TRASH_RETENTION_DAYS || 30 })
            });
            if (data.deletedCount > 0) {
                console.log(`[PurchaseOrderService] Trash cleanup: deleted ${data.deletedCount} orders`);
            }
            return data.deletedCount;
        } catch (error) {
            console.error('[PurchaseOrderService] Trash cleanup failed:', error);
            return 0;
        }
    }

    // ========================================
    // COPY OPERATIONS
    // ========================================

    async copyOrder(sourceOrderId) {
        await this.initialize();
        const validation = window.PurchaseOrderValidation;

        try {
            const data = await this._fetch(`/${sourceOrderId}/copy`, { method: 'POST' });
            console.log('[PurchaseOrderService] Order copied:', sourceOrderId, '->', data.id);
            return data.id;
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Copy failed:', error);
            throw new validation.ServiceException('COPY_FAILED', 'Không thể sao chép đơn hàng. Vui lòng thử lại.');
        }
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    prepareItems(items) {
        const config = window.PurchaseOrderConfig;
        return items.map((item, index) => ({
            id: item.id || config.generateUUID(),
            position: index + 1,
            productCode: item.productCode || '',
            productName: item.productName || '',
            variant: item.variant || '',
            selectedAttributeValueIds: item.selectedAttributeValueIds || [],
            productImages: this.filterFirebaseUrls(item.productImages || []),
            priceImages: this.filterFirebaseUrls(item.priceImages || []),
            purchasePrice: item.purchasePrice || 0,
            sellingPrice: item.sellingPrice || 0,
            quantity: item.quantity || 1,
            subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
            notes: item.notes || '',
            tposSyncStatus: item.tposSyncStatus || null,
            tposProductId: item.tposProductId || null,
            tposProductTmplId: item.tposProductTmplId || null,
            tposSynced: item.tposSynced || false
        }));
    }

    filterFirebaseUrls(urls) {
        if (!Array.isArray(urls)) return [];
        return urls.filter(url => typeof url === 'string' && !url.startsWith('data:'));
    }

    calculateTotalAmount(items) {
        if (!items || !Array.isArray(items)) return 0;
        return items.reduce((sum, item) => sum + (item.purchasePrice || 0) * (item.quantity || 1), 0);
    }

    async generateOrderNumber() {
        try {
            const data = await this._fetch('/generate-number', { method: 'POST' });
            return data.orderNumber;
        } catch (error) {
            // Fallback
            const today = new Date();
            const datePrefix = this.formatDateForOrderNumber(today);
            return `PO-${datePrefix}-${Date.now().toString().slice(-4)}`;
        }
    }

    formatDateForOrderNumber(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    // ========================================
    // IMAGE UPLOAD (via Render REST API)
    // ========================================

    async uploadImage(file, folder = 'purchase-orders') {
        await this.initialize();

        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`${this.API_BASE}/images`, {
                method: 'POST',
                headers: {
                    // Don't set Content-Type - browser sets it with boundary for FormData
                    ...(this.currentUser ? {
                        'X-Auth-Data': JSON.stringify({
                            userId: this.currentUser.uid,
                            userName: this.currentUser.displayName,
                            email: this.currentUser.email
                        })
                    } : {})
                },
                body: formData
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Upload failed');
            }

            console.log('[PurchaseOrderService] Image uploaded:', data.url);
            return data.url;
        } catch (error) {
            console.error('[PurchaseOrderService] Upload failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'UPLOAD_FAILED', 'Không thể tải lên hình ảnh. Vui lòng thử lại.'
            );
        }
    }

    async uploadImages(files, folder = 'purchase-orders') {
        const urls = [];
        for (const file of files) {
            const url = await this.uploadImage(file, folder);
            urls.push(url);
        }
        return urls;
    }

    // ========================================
    // IMAGE CLEANUP (no-ops, Firebase Storage removed)
    // ========================================

    async deleteStorageFile(downloadUrl) {
        // No-op: Firebase Storage removed, images managed via REST API
        return false;
    }

    async cleanupOldFirebaseImages() {
        // No-op: Firebase Storage removed, images managed via REST API
        return;
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderService = new PurchaseOrderService();

console.log('[Purchase Orders] Service layer loaded (REST API mode)');
