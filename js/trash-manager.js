// =====================================================
// TRASH MANAGER - Shared Trash Bin Management System
// =====================================================
// Manages soft deletion and trash bin for all pages

class TrashManager {
    constructor(collectionName, db) {
        this.collectionName = collectionName;
        this.db = db;
        this.trashCollection = this.db.collection('trash_bin');
        this.TRASH_EXPIRY_DAYS = 30;
    }

    /**
     * Move item(s) to trash instead of permanent deletion
     * @param {Object|Array} items - Single item or array of items to delete
     * @param {string} pageSource - Source page (ck, hanghoan, etc.)
     * @returns {Promise}
     */
    async moveToTrash(items, pageSource) {
        try {
            const itemsArray = Array.isArray(items) ? items : [items];
            const batch = this.db.batch();
            const now = new Date();

            itemsArray.forEach(item => {
                const trashDoc = this.trashCollection.doc();
                const trashItem = {
                    ...item,
                    deletedAt: now,
                    deletedBy: this.getCurrentUser(),
                    pageSource: pageSource,
                    expiresAt: new Date(now.getTime() + (this.TRASH_EXPIRY_DAYS * 24 * 60 * 60 * 1000))
                };
                batch.set(trashDoc, trashItem);
            });

            await batch.commit();
            console.log(`Moved ${itemsArray.length} item(s) to trash`);
            return { success: true, count: itemsArray.length };
        } catch (error) {
            console.error('Error moving items to trash:', error);
            throw error;
        }
    }

    /**
     * Restore item(s) from trash
     * @param {string|Array} trashIds - Trash document ID(s) to restore
     * @returns {Promise}
     */
    async restoreFromTrash(trashIds) {
        try {
            const idsArray = Array.isArray(trashIds) ? trashIds : [trashIds];
            const restoredItems = [];

            for (const trashId of idsArray) {
                const trashDoc = await this.trashCollection.doc(trashId).get();
                if (!trashDoc.exists) {
                    console.warn(`Trash item ${trashId} not found`);
                    continue;
                }

                const item = trashDoc.data();
                // Remove trash metadata
                const { deletedAt, deletedBy, pageSource, expiresAt, ...originalItem } = item;

                restoredItems.push({
                    item: originalItem,
                    pageSource: pageSource,
                    trashId: trashId
                });
            }

            return { success: true, items: restoredItems };
        } catch (error) {
            console.error('Error restoring from trash:', error);
            throw error;
        }
    }

    /**
     * Permanently delete item(s) from trash
     * @param {string|Array} trashIds - Trash document ID(s) to delete permanently
     * @returns {Promise}
     */
    async permanentlyDelete(trashIds) {
        try {
            const idsArray = Array.isArray(trashIds) ? trashIds : [trashIds];
            const batch = this.db.batch();

            idsArray.forEach(trashId => {
                batch.delete(this.trashCollection.doc(trashId));
            });

            await batch.commit();
            console.log(`Permanently deleted ${idsArray.length} item(s)`);
            return { success: true, count: idsArray.length };
        } catch (error) {
            console.error('Error permanently deleting items:', error);
            throw error;
        }
    }

    /**
     * Get all trash items with optional filtering
     * @param {Object} filters - Filter options (pageSource, dateRange, etc.)
     * @returns {Promise<Array>}
     */
    async getTrashItems(filters = {}) {
        try {
            let query = this.trashCollection;

            if (filters.pageSource) {
                query = query.where('pageSource', '==', filters.pageSource);
            }

            if (filters.startDate) {
                query = query.where('deletedAt', '>=', filters.startDate);
            }

            if (filters.endDate) {
                query = query.where('deletedAt', '<=', filters.endDate);
            }

            const snapshot = await query.orderBy('deletedAt', 'desc').get();
            const items = [];

            snapshot.forEach(doc => {
                items.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return items;
        } catch (error) {
            console.error('Error getting trash items:', error);
            throw error;
        }
    }

    /**
     * Clean up expired trash items (auto-delete after 30 days)
     * @returns {Promise}
     */
    async cleanExpiredItems() {
        try {
            const now = new Date();
            const snapshot = await this.trashCollection
                .where('expiresAt', '<=', now)
                .get();

            if (snapshot.empty) {
                console.log('No expired items to clean');
                return { success: true, count: 0 };
            }

            const batch = this.db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Cleaned ${snapshot.size} expired item(s)`);
            return { success: true, count: snapshot.size };
        } catch (error) {
            console.error('Error cleaning expired items:', error);
            throw error;
        }
    }

    /**
     * Get trash statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        try {
            const snapshot = await this.trashCollection.get();
            const now = new Date();

            const stats = {
                total: 0,
                byPage: {},
                expiringSoon: 0 // expiring in next 7 days
            };

            const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

            snapshot.forEach(doc => {
                const item = doc.data();
                stats.total++;

                // Count by page source
                if (!stats.byPage[item.pageSource]) {
                    stats.byPage[item.pageSource] = 0;
                }
                stats.byPage[item.pageSource]++;

                // Count expiring soon
                if (item.expiresAt && item.expiresAt.toDate() <= sevenDaysFromNow) {
                    stats.expiringSoon++;
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting stats:', error);
            throw error;
        }
    }

    /**
     * Get current user from auth manager
     * @returns {string}
     */
    getCurrentUser() {
        try {
            if (typeof authManager !== 'undefined' && authManager) {
                const auth = authManager.getAuthState();
                return auth ? (auth.displayName || auth.username || 'Unknown') : 'Unknown';
            }
            return 'Unknown';
        } catch (error) {
            console.error('Error getting current user:', error);
            return 'Unknown';
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TrashManager = TrashManager;
}
