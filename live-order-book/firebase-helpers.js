/**
 * Firebase Helper Functions for Live Order Book
 * Session-based order management with dual-node architecture (products + qty)
 * Pattern follows soluong-live/firebase-helpers.js
 */

// ============================================================================
// SESSION CRUD
// ============================================================================

/**
 * Create a new live session
 * @param {Object} database - Firebase database reference
 * @param {string} name - Session name
 * @param {string} date - Session date (YYYY-MM-DD)
 * @returns {Promise<string>} Session ID
 */
async function createSession(database, name, date) {
    const sessionId = `session_${Date.now()}`;
    const sessionData = {
        name: name,
        date: date,
        createdAt: Date.now(),
        productCount: 0
    };

    await database.ref(`liveOrderSessions/${sessionId}`).set(sessionData);
    console.log('✅ [createSession] Created session:', sessionId, sessionData);
    return sessionId;
}

/**
 * Delete a session and ALL related data (cascade delete)
 * Removes: session + products + qty + meta + settings + cart history
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID to delete
 */
async function deleteSession(database, sessionId) {
    console.log('🔵 [deleteSession] Cascade deleting session:', sessionId);

    const updates = {};
    updates[`liveOrderSessions/${sessionId}`] = null;
    updates[`liveOrderProducts/${sessionId}`] = null;
    updates[`liveOrderProductsQty/${sessionId}`] = null;
    updates[`liveOrderProductsMeta/${sessionId}`] = null;
    updates[`liveOrderDisplaySettings/${sessionId}`] = null;
    updates[`liveOrderCartHistory/${sessionId}`] = null;

    await database.ref().update(updates);
    console.log('✅ [deleteSession] Session and all related data deleted:', sessionId);
}

/**
 * Rename a session
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} newName - New session name
 */
async function renameSession(database, sessionId, newName) {
    await database.ref(`liveOrderSessions/${sessionId}/name`).set(newName);
    console.log('✅ [renameSession] Session renamed:', sessionId, '→', newName);
}

/**
 * Load all sessions, sorted by date descending (newest first)
 * @param {Object} database - Firebase database reference
 * @returns {Promise<Array>} Array of session objects with id field
 */
async function loadSessions(database) {
    const snapshot = await database.ref('liveOrderSessions').once('value');
    const sessionsObj = snapshot.val();

    if (!sessionsObj || typeof sessionsObj !== 'object') {
        return [];
    }

    const sessions = Object.entries(sessionsObj).map(([id, data]) => ({
        id,
        ...data
    }));

    // Sort by date descending (newest first)
    sessions.sort((a, b) => {
        if (a.date && b.date) {
            return b.date.localeCompare(a.date);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    console.log(`📦 [loadSessions] Loaded ${sessions.length} sessions`);
    return sessions;
}

// ============================================================================
// PRODUCT CRUD
// ============================================================================

/**
 * Add or update a product in a session
 * If product already exists, keeps existing soldQty/orderedQty, only updates product info.
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {Object} product - Product object from TPOS
 * @param {Object} localProductsObject - Local products object reference
 * @returns {Promise<Object>} Result with action ('added' or 'updated')
 */
async function addProductToFirebase(database, sessionId, product, localProductsObject) {
    const productKey = `product_${product.Id}`;
    const existingProduct = localProductsObject[productKey];

    if (existingProduct) {
        // Update existing product — keep existing soldQty/orderedQty
        const soldQty = existingProduct.soldQty || 0;
        const orderedQty = existingProduct.orderedQty || 0;
        const updatedProduct = {
            ...product,
            soldQty: soldQty,
            orderedQty: orderedQty,
            addedAt: existingProduct.addedAt || product.addedAt,
            lastRefreshed: Date.now()
        };

        await database.ref(`liveOrderProducts/${sessionId}/${productKey}`).set(updatedProduct);
        localProductsObject[productKey] = updatedProduct;

        return { action: 'updated', product: updatedProduct };
    } else {
        // Add new product with default qty values
        const soldQty = product.soldQty || 0;
        const orderedQty = product.orderedQty || 0;
        const newProduct = {
            ...product,
            soldQty: soldQty,
            orderedQty: orderedQty,
            addedAt: product.addedAt || Date.now()
        };

        // Write product to Firebase
        await database.ref(`liveOrderProducts/${sessionId}/${productKey}`).set(newProduct);

        // Write qty to separate node
        await database.ref(`liveOrderProductsQty/${sessionId}/${productKey}`).set({
            soldQty: soldQty,
            orderedQty: orderedQty
        });

        // Add to local object
        localProductsObject[productKey] = newProduct;

        // Update sortedIds metadata
        await database.ref(`liveOrderProductsMeta/${sessionId}/sortedIds`).transaction((currentIds) => {
            const ids = currentIds || [];
            const newId = product.Id.toString();
            if (!ids.includes(newId)) {
                ids.unshift(newId);
            }
            return ids;
        });

        // Update count and lastUpdated
        await database.ref(`liveOrderProductsMeta/${sessionId}/count`).set(Object.keys(localProductsObject).length);
        await database.ref(`liveOrderProductsMeta/${sessionId}/lastUpdated`).set(Date.now());

        // Update session productCount
        await database.ref(`liveOrderSessions/${sessionId}/productCount`).set(Object.keys(localProductsObject).length);

        return { action: 'added', product: newProduct };
    }
}

/**
 * Remove a product from a session (both products + qty nodes)
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} productKey - Product key (e.g. 'product_123')
 * @param {Object} localProductsObject - Local products object reference
 */
async function removeProductFromFirebase(database, sessionId, productKey, localProductsObject) {
    // Extract product ID from key
    const productId = productKey.replace('product_', '');

    // Remove from both Firebase nodes
    await database.ref(`liveOrderProducts/${sessionId}/${productKey}`).remove();
    await database.ref(`liveOrderProductsQty/${sessionId}/${productKey}`).remove();

    // Remove from local object
    delete localProductsObject[productKey];

    // Update metadata
    await database.ref(`liveOrderProductsMeta/${sessionId}/sortedIds`).transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId);
    });

    const newCount = Object.keys(localProductsObject).length;
    await database.ref(`liveOrderProductsMeta/${sessionId}/count`).set(newCount);
    await database.ref(`liveOrderProductsMeta/${sessionId}/lastUpdated`).set(Date.now());

    // Update session productCount
    await database.ref(`liveOrderSessions/${sessionId}/productCount`).set(newCount);
}

/**
 * Update soldQty for a product (writes to BOTH nodes)
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} productKey - Product key
 * @param {number} newSoldQty - New soldQty value (enforced >= 0)
 */
async function updateProductQtyInFirebase(database, sessionId, productKey, newSoldQty) {
    const safeSoldQty = Math.max(0, Math.floor(newSoldQty));

    // Write to BOTH nodes for cross-page compatibility
    await Promise.all([
        database.ref(`liveOrderProducts/${sessionId}/${productKey}/soldQty`).set(safeSoldQty),
        database.ref(`liveOrderProductsQty/${sessionId}/${productKey}/soldQty`).set(safeSoldQty)
    ]);
}

/**
 * Update orderedQty for a product (writes to BOTH nodes)
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} productKey - Product key
 * @param {number} newOrderedQty - New orderedQty value (enforced >= 0)
 */
async function updateOrderedQtyInFirebase(database, sessionId, productKey, newOrderedQty) {
    const safeOrderedQty = Math.max(0, Math.floor(newOrderedQty));

    await Promise.all([
        database.ref(`liveOrderProducts/${sessionId}/${productKey}/orderedQty`).set(safeOrderedQty),
        database.ref(`liveOrderProductsQty/${sessionId}/${productKey}/orderedQty`).set(safeOrderedQty)
    ]);
}

/**
 * Update product visibility (hide/unhide)
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} productKey - Product key
 * @param {boolean} isHidden - Whether the product is hidden
 */
async function updateProductVisibility(database, sessionId, productKey, isHidden) {
    await database.ref(`liveOrderProducts/${sessionId}/${productKey}/isHidden`).set(isHidden);
}

/**
 * Update product image URL
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} productKey - Product key
 * @param {string} imageUrl - New image URL
 */
async function updateProductImage(database, sessionId, productKey, imageUrl) {
    await database.ref(`liveOrderProducts/${sessionId}/${productKey}/imageUrl`).set(imageUrl);
}

// ============================================================================
// DATA LOADING & DUAL-NODE MERGE
// ============================================================================

/**
 * Load all products from Firebase (parallel load + merge)
 * Loads products and qty data from separate nodes, merges with qty as source of truth
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Products object keyed by product_{Id}
 */
async function loadAllProductsFromFirebase(database, sessionId) {
    try {
        // Load products AND qty data in parallel
        const [productsSnapshot, qtySnapshot] = await Promise.all([
            database.ref(`liveOrderProducts/${sessionId}`).once('value'),
            database.ref(`liveOrderProductsQty/${sessionId}`).once('value')
        ]);

        const productsObject = productsSnapshot.val();
        const qtyObject = qtySnapshot.val() || {};

        if (!productsObject || typeof productsObject !== 'object') {
            return {};
        }

        // Merge qty data into products (qty node is source of truth)
        Object.keys(productsObject).forEach(key => {
            if (qtyObject[key]) {
                productsObject[key].soldQty = qtyObject[key].soldQty || 0;
                productsObject[key].orderedQty = qtyObject[key].orderedQty || 0;
            } else {
                // Fallback to values in product node
                productsObject[key].soldQty = productsObject[key].soldQty || 0;
                productsObject[key].orderedQty = productsObject[key].orderedQty || 0;
            }
        });

        console.log(`📦 [loadAllProductsFromFirebase] Loaded ${Object.keys(productsObject).length} products, merged ${Object.keys(qtyObject).length} qty entries for session ${sessionId}`);

        return productsObject;

    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}

/**
 * Setup Firebase child listeners for realtime updates (dual-node)
 * Listens on BOTH products node (child_added/changed/removed) and qty node (child_changed)
 * Pattern follows soluong-live exactly.
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {Object} localProductsObject - Local products object reference
 * @param {Object} callbacks - Callback functions
 * @returns {Object} Object with detach() method to cleanup listeners
 */
function setupFirebaseChildListeners(database, sessionId, localProductsObject, callbacks) {
    const productsRef = database.ref(`liveOrderProducts/${sessionId}`);
    const qtyRef = database.ref(`liveOrderProductsQty/${sessionId}`);

    console.log('🔧 Setting up Firebase child listeners for session:', sessionId);

    const alreadyLoaded = Object.keys(localProductsObject).length > 0;
    let isInitialLoad = !alreadyLoaded;
    let initialLoadCount = 0;

    console.log(`📊 Products already loaded: ${alreadyLoaded} (${Object.keys(localProductsObject).length} products)`);

    // child_added: Fired for each existing child and when new child is added
    productsRef.on('child_added', (snapshot) => {
        const product = snapshot.val();
        const productKey = snapshot.key;

        if (alreadyLoaded) {
            if (!localProductsObject[productKey]) {
                console.log('🔥 [child_added] New product (pre-loaded mode):', product.NameGet);
                localProductsObject[productKey] = product;
                if (callbacks.onProductAdded) {
                    callbacks.onProductAdded(product);
                }
            }
            return;
        }

        if (isInitialLoad) {
            initialLoadCount++;
            localProductsObject[productKey] = product;

            database.ref(`liveOrderProductsMeta/${sessionId}/count`).once('value', (countSnap) => {
                const expectedCount = countSnap.val() || 0;
                if (expectedCount === 0 || initialLoadCount >= expectedCount) {
                    isInitialLoad = false;
                    console.log('✅ Initial load complete:', initialLoadCount, 'products');
                    if (callbacks.onInitialLoadComplete) {
                        callbacks.onInitialLoadComplete();
                    }
                }
            });
            return;
        }

        if (!localProductsObject[productKey]) {
            console.log('🔥 [child_added] New product:', product.NameGet);
            localProductsObject[productKey] = product;
            if (callbacks.onProductAdded) {
                callbacks.onProductAdded(product);
            }
        }
    });

    // child_changed: When product STATIC data is updated (name, image, visibility, etc.)
    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const productKey = snapshot.key;

        // Preserve current qty from local (qty updates come from separate listener)
        const currentSoldQty = localProductsObject[productKey]?.soldQty || 0;
        const currentOrderedQty = localProductsObject[productKey]?.orderedQty || 0;

        console.log('🔥 [child_changed] Product static data updated:', updatedProduct.NameGet);

        localProductsObject[productKey] = {
            ...updatedProduct,
            soldQty: currentSoldQty,
            orderedQty: currentOrderedQty
        };

        if (callbacks.onProductChanged) {
            callbacks.onProductChanged(localProductsObject[productKey], productKey);
        }
    });

    // child_removed: When a product is deleted
    productsRef.on('child_removed', (snapshot) => {
        const removedProduct = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [child_removed] Product removed:', removedProduct.NameGet);

        if (localProductsObject[productKey]) {
            delete localProductsObject[productKey];
            if (callbacks.onProductRemoved) {
                callbacks.onProductRemoved(removedProduct, productKey);
            }
        }
    });

    // OPTIMIZED: Listen for qty changes on SEPARATE node (~60 bytes per update)
    qtyRef.on('child_changed', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [qty_changed] Qty updated:', productKey, '→ soldQty:', qtyData.soldQty, 'orderedQty:', qtyData.orderedQty);

        if (localProductsObject[productKey]) {
            localProductsObject[productKey].soldQty = qtyData.soldQty || 0;
            localProductsObject[productKey].orderedQty = qtyData.orderedQty || 0;

            if (callbacks.onQtyChanged) {
                callbacks.onQtyChanged(localProductsObject[productKey], productKey);
            } else if (callbacks.onProductChanged) {
                callbacks.onProductChanged(localProductsObject[productKey], productKey);
            }
        }
    });

    // Listen for new qty entries (when new product is added)
    qtyRef.on('child_added', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        if (localProductsObject[productKey] && alreadyLoaded) {
            if (localProductsObject[productKey].soldQty !== qtyData.soldQty ||
                localProductsObject[productKey].orderedQty !== qtyData.orderedQty) {
                console.log('🔥 [qty_added] New qty entry:', productKey);
                localProductsObject[productKey].soldQty = qtyData.soldQty || 0;
                localProductsObject[productKey].orderedQty = qtyData.orderedQty || 0;
            }
        }
    });

    // Call onInitialLoadComplete immediately if products were pre-loaded
    if (alreadyLoaded && callbacks.onInitialLoadComplete) {
        console.log('✅ Firebase listeners setup complete (pre-loaded mode)');
        callbacks.onInitialLoadComplete();
    } else if (!alreadyLoaded && Object.keys(localProductsObject).length === 0) {
        database.ref(`liveOrderProductsMeta/${sessionId}/count`).once('value', (countSnap) => {
            const expectedCount = countSnap.val() || 0;
            if (expectedCount === 0) {
                isInitialLoad = false;
                console.log('✅ No products to load');
                if (callbacks.onInitialLoadComplete) {
                    callbacks.onInitialLoadComplete();
                }
            }
        });
    }

    return {
        detach: () => {
            productsRef.off('child_added');
            productsRef.off('child_changed');
            productsRef.off('child_removed');
            qtyRef.off('child_changed');
            qtyRef.off('child_added');
        }
    };
}

/**
 * Convert products object to sorted array
 * @param {Object} productsObject - Products object { product_123: {...}, ... }
 * @param {Array} sortedIds - Optional array of IDs in sort order
 * @returns {Array} Sorted products array
 */
function getProductsArray(productsObject, sortedIds = null) {
    const productsArray = Object.values(productsObject);

    if (!sortedIds || sortedIds.length === 0) {
        return productsArray.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    return productsArray.sort((a, b) => {
        const indexA = sortedIds.indexOf(a.Id.toString());
        const indexB = sortedIds.indexOf(b.Id.toString());

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return (b.addedAt || 0) - (a.addedAt || 0);
    });
}

// ============================================================================
// CART CACHE HELPERS
// ============================================================================

const CART_CACHE_KEY = 'liveOrder_cartSnapshots_cache';
const CART_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cart snapshots from localStorage cache
 * @returns {Array|null} Cached data or null if expired/not found
 */
function getCartCache() {
    try {
        const cached = localStorage.getItem(CART_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CART_CACHE_TTL) {
                console.log('📦 [getCartCache] Using cached data (age: ' + Math.round((Date.now() - timestamp) / 1000) + 's)');
                return data;
            }
            console.log('📦 [getCartCache] Cache expired, will reload from Firebase');
        }
    } catch (e) {
        console.warn('📦 [getCartCache] Cache read error:', e);
    }
    return null;
}

/**
 * Save cart snapshots to localStorage cache
 * @param {Array} data - Snapshots array to cache
 */
function setCartCache(data) {
    try {
        localStorage.setItem(CART_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
        console.log('📦 [setCartCache] Cached ' + data.length + ' snapshots');
    } catch (e) {
        console.warn('📦 [setCartCache] Cache write error:', e);
    }
}

/**
 * Invalidate cart cache
 */
function invalidateCartCache() {
    localStorage.removeItem(CART_CACHE_KEY);
    console.log('📦 [invalidateCartCache] Cache cleared');
}

// ============================================================================
// CART HISTORY / SNAPSHOT FUNCTIONS
// ============================================================================

/**
 * Save cart snapshot to Firebase
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {Object} snapshot - Snapshot object with metadata and products
 * @returns {Promise<string>} Snapshot ID
 */
async function saveCartSnapshot(database, sessionId, snapshot) {
    const snapshotId = `snapshot_${snapshot.metadata.savedAt}`;

    console.log('🔵 [saveCartSnapshot] Saving snapshot:', snapshotId, 'for session:', sessionId);

    // Save snapshot data
    await database.ref(`liveOrderCartHistory/${sessionId}/${snapshotId}`).set(snapshot);

    // Invalidate cache after saving
    invalidateCartCache();

    console.log('✅ [saveCartSnapshot] Snapshot saved:', snapshotId);
    return snapshotId;
}

/**
 * Restore products from a snapshot — overwrites products + qty nodes
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {Object} snapshotProducts - Products object from snapshot
 * @param {Object} localProductsObject - Local products object reference
 */
async function restoreProductsFromSnapshot(database, sessionId, snapshotProducts, localProductsObject) {
    // Clear existing products and qty for this session
    const updates = {};
    updates[`liveOrderProducts/${sessionId}`] = null;
    updates[`liveOrderProductsQty/${sessionId}`] = null;

    // Write all snapshot products
    const productIds = [];
    Object.entries(snapshotProducts).forEach(([key, product]) => {
        updates[`liveOrderProducts/${sessionId}/${key}`] = product;
        updates[`liveOrderProductsQty/${sessionId}/${key}`] = {
            soldQty: product.soldQty || 0,
            orderedQty: product.orderedQty || 0
        };
        productIds.push((product.Id || '').toString());
    });

    // Update metadata
    updates[`liveOrderProductsMeta/${sessionId}`] = {
        sortedIds: productIds,
        count: productIds.length,
        lastUpdated: Date.now()
    };

    // Update session productCount
    updates[`liveOrderSessions/${sessionId}/productCount`] = productIds.length;

    await database.ref().update(updates);

    // Update local object
    Object.keys(localProductsObject).forEach(key => delete localProductsObject[key]);
    Object.entries(snapshotProducts).forEach(([key, product]) => {
        localProductsObject[key] = { ...product };
    });

    console.log('✅ [restoreProductsFromSnapshot] Restored', productIds.length, 'products for session:', sessionId);
}

/**
 * Get all cart snapshots for a session (sorted by savedAt descending)
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Array of snapshot objects
 */
async function getAllCartSnapshots(database, sessionId) {
    console.log('🔵 [getAllCartSnapshots] Loading snapshots for session:', sessionId);

    const snapshot = await database.ref(`liveOrderCartHistory/${sessionId}`).once('value');
    const snapshotsData = snapshot.val() || {};

    const snapshots = Object.entries(snapshotsData).map(([id, data]) => ({
        id,
        ...data
    }));

    // Sort by savedAt descending (newest first)
    snapshots.sort((a, b) => {
        const savedAtA = a.metadata?.savedAt || 0;
        const savedAtB = b.metadata?.savedAt || 0;
        return savedAtB - savedAtA;
    });

    console.log(`✅ [getAllCartSnapshots] Loaded ${snapshots.length} snapshots`);
    return snapshots;
}

/**
 * Delete a cart snapshot
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {string} snapshotId - Snapshot ID to delete
 */
async function deleteCartSnapshot(database, sessionId, snapshotId) {
    console.log(`🔵 [deleteCartSnapshot] Deleting snapshot: ${snapshotId} from session: ${sessionId}`);

    await database.ref(`liveOrderCartHistory/${sessionId}/${snapshotId}`).remove();

    // Invalidate cache
    invalidateCartCache();

    console.log(`✅ [deleteCartSnapshot] Snapshot deleted: ${snapshotId}`);
}

// ============================================================================
// DISPLAY SETTINGS
// ============================================================================

const DEFAULT_DISPLAY_SETTINGS = {
    gridColumns: 4,
    gridRows: 2,
    gridGap: 10,
    fontSize: 14
};

/**
 * Load display settings for a session
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Display settings (with defaults if not set)
 */
async function loadDisplaySettings(database, sessionId) {
    const snapshot = await database.ref(`liveOrderDisplaySettings/${sessionId}`).once('value');
    const settings = snapshot.val();

    if (!settings) {
        return { ...DEFAULT_DISPLAY_SETTINGS };
    }

    // Merge with defaults to ensure all fields exist
    return {
        gridColumns: settings.gridColumns ?? DEFAULT_DISPLAY_SETTINGS.gridColumns,
        gridRows: settings.gridRows ?? DEFAULT_DISPLAY_SETTINGS.gridRows,
        gridGap: settings.gridGap ?? DEFAULT_DISPLAY_SETTINGS.gridGap,
        fontSize: settings.fontSize ?? DEFAULT_DISPLAY_SETTINGS.fontSize
    };
}

/**
 * Save display settings for a session
 * @param {Object} database - Firebase database reference
 * @param {string} sessionId - Session ID
 * @param {Object} settings - Display settings object
 */
async function saveDisplaySettings(database, sessionId, settings) {
    await database.ref(`liveOrderDisplaySettings/${sessionId}`).set(settings);
    console.log('✅ [saveDisplaySettings] Settings saved for session:', sessionId);
}

// ============================================================================
// ES MODULE EXPORTS
// ============================================================================

export {
    // Session CRUD
    createSession,
    deleteSession,
    renameSession,
    loadSessions,

    // Product CRUD
    addProductToFirebase,
    removeProductFromFirebase,
    updateProductQtyInFirebase,
    updateOrderedQtyInFirebase,
    updateProductVisibility,
    updateProductImage,

    // Data Loading & Listeners
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,

    // Cart Cache
    getCartCache,
    setCartCache,
    invalidateCartCache,

    // Cart History
    saveCartSnapshot,
    restoreProductsFromSnapshot,
    getAllCartSnapshots,
    deleteCartSnapshot,

    // Display Settings
    loadDisplaySettings,
    saveDisplaySettings,
    DEFAULT_DISPLAY_SETTINGS
};
