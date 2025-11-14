/**
 * Firebase Helper Functions for Object-based Structure
 * Provides optimized operations for Firebase Realtime Database
 */

/**
 * Add or update a single product in Firebase
 * @param {Object} database - Firebase database reference
 * @param {Object} product - Product object to add/update
 * @param {Object} localProductsObject - Local products object reference
 * @returns {Promise}
 */
async function addProductToFirebase(database, product, localProductsObject) {
    const productKey = `product_${product.Id}`;

    // Check if product exists in local object
    const existingProduct = localProductsObject[productKey];

    if (existingProduct) {
        // Update existing product
        const updatedProduct = {
            ...product,
            soldQty: existingProduct.soldQty || 0, // Keep existing soldQty
            remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
            addedAt: existingProduct.addedAt || product.addedAt, // Keep original addedAt
            lastRefreshed: Date.now()
        };

        // Update in Firebase
        await database.ref(`savedProducts/${productKey}`).set(updatedProduct);

        // Update local object
        localProductsObject[productKey] = updatedProduct;

        return { action: 'updated', product: updatedProduct };
    } else {
        // Add new product
        await database.ref(`savedProducts/${productKey}`).set(product);

        // Add to local object
        localProductsObject[productKey] = product;

        // Update sortedIds metadata
        await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            const newId = product.Id.toString();
            if (!ids.includes(newId)) {
                ids.unshift(newId); // Add to beginning (newest first)
            }
            return ids;
        });

        // Update count
        await database.ref('savedProductsMeta/count').set(Object.keys(localProductsObject).length);

        return { action: 'added', product: product };
    }
}

/**
 * Add multiple products (batch operation)
 * Used for adding products with variants
 */
async function addProductsToFirebase(database, products, localProductsObject) {
    const updates = {};
    const newIds = [];

    products.forEach(product => {
        const productKey = `product_${product.Id}`;

        // Check if exists in local object
        const existingProduct = localProductsObject[productKey];

        if (existingProduct) {
            // Update existing
            const updatedProduct = {
                ...product,
                soldQty: existingProduct.soldQty || 0,
                remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
                addedAt: existingProduct.addedAt || product.addedAt,
                lastRefreshed: Date.now()
            };
            updates[`savedProducts/${productKey}`] = updatedProduct;
            localProductsObject[productKey] = updatedProduct;
        } else {
            // Add new
            updates[`savedProducts/${productKey}`] = product;
            localProductsObject[productKey] = product;
            newIds.push(product.Id.toString());
        }
    });

    // Batch update in Firebase
    await database.ref().update(updates);

    // Update metadata if there are new products
    if (newIds.length > 0) {
        await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            newIds.forEach(id => {
                if (!ids.includes(id)) {
                    ids.unshift(id);
                }
            });
            return ids;
        });

        await database.ref('savedProductsMeta/count').set(Object.keys(localProductsObject).length);
    }

    return { added: newIds.length, updated: products.length - newIds.length };
}

/**
 * Remove a product from Firebase
 */
async function removeProductFromFirebase(database, productId, localProductsObject) {
    const productKey = `product_${productId}`;

    // Remove from Firebase
    await database.ref(`savedProducts/${productKey}`).remove();

    // Remove from local object
    delete localProductsObject[productKey];

    // Update metadata
    await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });

    await database.ref('savedProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Update product quantity (soldQty)
 */
async function updateProductQtyInFirebase(database, productId, change, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));

    if (newSoldQty === product.soldQty) return;

    // Update local first (optimistic update)
    product.soldQty = newSoldQty;
    product.remainingQty = product.QtyAvailable - newSoldQty;

    // Sync to Firebase (just the fields that changed)
    await database.ref(`savedProducts/${productKey}`).update({
        soldQty: newSoldQty,
        remainingQty: product.remainingQty
    });
}

/**
 * Hide/unhide a product
 */
async function updateProductVisibility(database, productId, isHidden, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    // Update local
    product.isHidden = isHidden;

    // Sync to Firebase
    await database.ref(`savedProducts/${productKey}/isHidden`).set(isHidden);
}

/**
 * Cleanup old products (older than 7 days)
 */
async function cleanupOldProducts(database, localProductsObject) {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - SEVEN_DAYS;

    // Find products to remove
    const productsToRemove = Object.entries(localProductsObject).filter(([key, product]) => {
        const addedAt = product.addedAt || 0;
        return (Date.now() - addedAt) >= SEVEN_DAYS;
    });

    if (productsToRemove.length === 0) {
        return { removed: 0 };
    }

    // Prepare batch remove
    const updates = {};
    const idsToRemove = [];

    productsToRemove.forEach(([productKey, product]) => {
        updates[`savedProducts/${productKey}`] = null; // null means remove
        idsToRemove.push(product.Id.toString());
    });

    // Batch remove
    await database.ref().update(updates);

    // Update metadata
    await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Remove from local object
    productsToRemove.forEach(([productKey]) => {
        delete localProductsObject[productKey];
    });

    await database.ref('savedProductsMeta/count').set(Object.keys(localProductsObject).length);

    return { removed: productsToRemove.length };
}

/**
 * Clear all products
 */
async function clearAllProducts(database, localProductsObject) {
    // Remove all products
    await database.ref('savedProducts').remove();

    // Reset metadata
    await database.ref('savedProductsMeta').set({
        sortedIds: [],
        count: 0,
        lastUpdated: Date.now()
    });

    // Clear local object
    Object.keys(localProductsObject).forEach(key => delete localProductsObject[key]);
}

/**
 * Load all products from Firebase (initial load)
 * Returns an object with products keyed by product_${Id}
 */
async function loadAllProductsFromFirebase(database) {
    try {
        // Load products
        const productsSnapshot = await database.ref('savedProducts').once('value');
        const productsObject = productsSnapshot.val();

        if (!productsObject || typeof productsObject !== 'object') {
            return {};
        }

        // Return the object as-is (already in correct format)
        return productsObject;

    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}

/**
 * Setup Firebase child listeners for realtime updates
 * NOTE: This should be called AFTER loadAllProductsFromFirebase() to avoid duplicate loading
 */
function setupFirebaseChildListeners(database, localProductsObject, callbacks) {
    const productsRef = database.ref('savedProducts');

    console.log('🔧 Setting up Firebase child listeners...');

    // child_added: Fired for each existing child and when new child is added
    // Since loadAllProductsFromFirebase() already loaded all products,
    // we only add to localProductsObject if it doesn't exist (new addition)
    productsRef.on('child_added', (snapshot) => {
        const product = snapshot.val();
        const productKey = snapshot.key;

        // Only add if not already in local object (skip already loaded products)
        if (!localProductsObject[productKey]) {
            console.log('🔥 [child_added] New product:', product.NameGet);
            localProductsObject[productKey] = product;

            if (callbacks.onProductAdded) {
                callbacks.onProductAdded(product);
            }
        }
    });

    // child_changed: When a product is updated
    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [child_changed] Product updated:', updatedProduct.NameGet);

        // Always update local object with latest data
        localProductsObject[productKey] = updatedProduct;

        if (callbacks.onProductChanged) {
            callbacks.onProductChanged(updatedProduct, productKey);
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

    // Call onInitialLoadComplete immediately since products were already loaded
    if (callbacks.onInitialLoadComplete) {
        console.log('✅ Firebase listeners setup complete');
        callbacks.onInitialLoadComplete();
    }

    return {
        detach: () => {
            productsRef.off('child_added');
            productsRef.off('child_changed');
            productsRef.off('child_removed');
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
        // Sort by addedAt (newest first) if no sortedIds provided
        return productsArray.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    // Sort according to sortedIds
    return productsArray.sort((a, b) => {
        const indexA = sortedIds.indexOf(a.Id.toString());
        const indexB = sortedIds.indexOf(b.Id.toString());

        // If both in sortedIds, use that order
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }

        // If only one in sortedIds, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // Otherwise sort by addedAt (newest first)
        return (b.addedAt || 0) - (a.addedAt || 0);
    });
}
