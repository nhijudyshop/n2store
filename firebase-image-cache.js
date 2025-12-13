/**
 * Firebase Image Cache Manager
 * Manages cached product images uploaded to Pancake server
 * Structure: pancake_images/{product_id} = { product_name, content_url }
 */

(function() {
    'use strict';

    class FirebaseImageCache {
        constructor() {
            this.cacheRef = null;
            this.isInitialized = false;
            this.initPromise = this.init();
        }

        /**
         * Initialize Firebase reference
         * @returns {Promise<boolean>}
         */
        async init() {
            try {
                // Check if Firebase is available
                if (typeof firebase === 'undefined' || !firebase.database) {
                    console.warn('[FIREBASE-CACHE] Firebase database not available');
                    this.isInitialized = false;
                    return false;
                }

                // Check if Firebase is initialized
                if (!firebase.apps || firebase.apps.length === 0) {
                    console.warn('[FIREBASE-CACHE] Firebase not initialized');
                    this.isInitialized = false;
                    return false;
                }

                this.cacheRef = firebase.database().ref('pancake_images');
                this.isInitialized = true;
                console.log('[FIREBASE-CACHE] ✅ Initialized successfully');
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Init error:', error);
                this.isInitialized = false;
                return false;
            }
        }

        /**
         * Get cached image for a product
         * @param {string|number} productId
         * @returns {Promise<{product_name: string, content_url: string}|null>}
         */
        async get(productId) {
            try {
                // Wait for initialization
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    console.warn('[FIREBASE-CACHE] Not initialized, skipping cache get');
                    return null;
                }

                if (!productId) {
                    return null;
                }

                // Convert to string for consistent keys
                const productIdStr = String(productId);

                const snapshot = await this.cacheRef.child(productIdStr).once('value');

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    console.log(`[FIREBASE-CACHE] ✅ Cache HIT for product ${productIdStr}:`, data.content_url);
                    return data;
                } else {
                    console.log(`[FIREBASE-CACHE] ❌ Cache MISS for product ${productIdStr}`);
                    return null;
                }

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error getting cache:', error);
                // Return null on error to fallback to normal upload
                return null;
            }
        }

        /**
         * Save image to cache
         * @param {string|number} productId
         * @param {string} productName
         * @param {string} contentUrl
         * @returns {Promise<boolean>}
         */
        async set(productId, productName, contentUrl) {
            try {
                // Wait for initialization
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    console.warn('[FIREBASE-CACHE] Not initialized, skipping cache set');
                    return false;
                }

                if (!productId || !contentUrl) {
                    console.warn('[FIREBASE-CACHE] Missing productId or contentUrl, skipping cache set');
                    return false;
                }

                // Convert to string for consistent keys
                const productIdStr = String(productId);

                await this.cacheRef.child(productIdStr).set({
                    product_name: productName || '',
                    content_url: contentUrl,
                    updated_at: firebase.database.ServerValue.TIMESTAMP
                });

                console.log(`[FIREBASE-CACHE] ✅ Saved to cache: product ${productIdStr}`);
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error saving to cache:', error);
                // Don't throw error - just log and continue (upload still succeeded)
                return false;
            }
        }

        /**
         * Check if cache is available
         * @returns {boolean}
         */
        isAvailable() {
            return this.isInitialized && this.cacheRef !== null;
        }

        /**
         * Clear cache for a specific product (for admin use)
         * @param {string|number} productId
         * @returns {Promise<boolean>}
         */
        async clear(productId) {
            try {
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    return false;
                }

                const productIdStr = String(productId);
                await this.cacheRef.child(productIdStr).remove();
                console.log(`[FIREBASE-CACHE] ✅ Cleared cache for product ${productIdStr}`);
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error clearing cache:', error);
                return false;
            }
        }

        /**
         * Get all cached images (for debugging)
         * @returns {Promise<Object>}
         */
        async getAll() {
            try {
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    return {};
                }

                const snapshot = await this.cacheRef.once('value');
                return snapshot.val() || {};

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error getting all cache:', error);
                return {};
            }
        }
    }

    // Initialize and expose globally
    window.firebaseImageCache = new FirebaseImageCache();

    console.log('[FIREBASE-CACHE] Module loaded');

})();
