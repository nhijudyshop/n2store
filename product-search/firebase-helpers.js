/**
 * Firebase Helper Functions for Object-based Structure
 * Provides optimized operations for Firebase Realtime Database
 */

/**
 * Add or update a single product in Firebase
 * @param {Object} database - Firebase database reference
 * @param {Object} product - Product object to add/update
 * @param {Array} localProductsArray - Local products array reference
 * @returns {Promise}
 */
async function addProductToFirebase(database, product, localProductsArray) {
    const productKey = `product_${product.Id}`;

    // Check if product exists in local array
    const existingIndex = localProductsArray.findIndex(p => p.Id === product.Id);

    if (existingIndex !== -1) {
        // Update existing product
        const existingProduct = localProductsArray[existingIndex];
        const updatedProduct = {
            ...product,
            soldQty: existingProduct.soldQty || 0, // Keep existing soldQty
            remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
            addedAt: existingProduct.addedAt || product.addedAt, // Keep original addedAt
            lastRefreshed: Date.now()
        };

        // Update in Firebase
        await database.ref(`savedProducts/${productKey}`).set(updatedProduct);

        // Update local array
        localProductsArray[existingIndex] = updatedProduct;

        return { action: 'updated', product: updatedProduct };
    } else {
        // Add new product
        await database.ref(`savedProducts/${productKey}`).set(product);

        // Add to local array
        localProductsArray.push(product);

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
        await database.ref('savedProductsMeta/count').set(localProductsArray.length);

        return { action: 'added', product: product };
    }
}

/**
 * Add multiple products (batch operation)
 * Used for adding products with variants
 */
async function addProductsToFirebase(database, products, localProductsArray) {
    const updates = {};
    const newIds = [];

    products.forEach(product => {
        const productKey = `product_${product.Id}`;

        // Check if exists in local array
        const existingIndex = localProductsArray.findIndex(p => p.Id === product.Id);

        if (existingIndex !== -1) {
            // Update existing
            const existingProduct = localProductsArray[existingIndex];
            const updatedProduct = {
                ...product,
                soldQty: existingProduct.soldQty || 0,
                remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
                addedAt: existingProduct.addedAt || product.addedAt,
                lastRefreshed: Date.now()
            };
            updates[`savedProducts/${productKey}`] = updatedProduct;
            localProductsArray[existingIndex] = updatedProduct;
        } else {
            // Add new
            updates[`savedProducts/${productKey}`] = product;
            localProductsArray.push(product);
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

        await database.ref('savedProductsMeta/count').set(localProductsArray.length);
    }

    return { added: newIds.length, updated: products.length - newIds.length };
}

/**
 * Remove a product from Firebase
 */
async function removeProductFromFirebase(database, productId, localProductsArray) {
    const productKey = `product_${productId}`;

    // Remove from Firebase
    await database.ref(`savedProducts/${productKey}`).remove();

    // Remove from local array
    const index = localProductsArray.findIndex(p => p.Id === productId);
    if (index !== -1) {
        localProductsArray.splice(index, 1);
    }

    // Update metadata
    await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });

    await database.ref('savedProductsMeta/count').set(localProductsArray.length);
}

/**
 * Update product quantity (soldQty)
 */
async function updateProductQtyInFirebase(database, productId, change, localProductsArray) {
    const product = localProductsArray.find(p => p.Id === productId);
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));

    if (newSoldQty === product.soldQty) return;

    // Update local first (optimistic update)
    product.soldQty = newSoldQty;
    product.remainingQty = product.QtyAvailable - newSoldQty;

    // Sync to Firebase (just the fields that changed)
    const productKey = `product_${productId}`;
    await database.ref(`savedProducts/${productKey}`).update({
        soldQty: newSoldQty,
        remainingQty: product.remainingQty
    });
}

/**
 * Hide/unhide a product
 */
async function updateProductVisibility(database, productId, isHidden, localProductsArray) {
    const product = localProductsArray.find(p => p.Id === productId);
    if (!product) return;

    // Update local
    product.isHidden = isHidden;

    // Sync to Firebase
    const productKey = `product_${productId}`;
    await database.ref(`savedProducts/${productKey}/isHidden`).set(isHidden);
}

/**
 * Cleanup old products (older than 7 days)
 */
async function cleanupOldProducts(database, localProductsArray) {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - SEVEN_DAYS;

    // Find products to remove
    const productsToRemove = localProductsArray.filter(product => {
        const addedAt = product.addedAt || 0;
        return (Date.now() - addedAt) >= SEVEN_DAYS;
    });

    if (productsToRemove.length === 0) {
        return { removed: 0 };
    }

    // Prepare batch remove
    const updates = {};
    const idsToRemove = [];

    productsToRemove.forEach(product => {
        const productKey = `product_${product.Id}`;
        updates[`savedProducts/${productKey}`] = null; // null means remove
        idsToRemove.push(product.Id.toString());
    });

    // Batch remove
    await database.ref().update(updates);

    // Update metadata
    await database.ref('savedProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Remove from local array
    idsToRemove.forEach(id => {
        const index = localProductsArray.findIndex(p => p.Id.toString() === id);
        if (index !== -1) {
            localProductsArray.splice(index, 1);
        }
    });

    await database.ref('savedProductsMeta/count').set(localProductsArray.length);

    return { removed: productsToRemove.length };
}

/**
 * Clear all products
 */
async function clearAllProducts(database, localProductsArray) {
    // Remove all products
    await database.ref('savedProducts').remove();

    // Reset metadata
    await database.ref('savedProductsMeta').set({
        sortedIds: [],
        count: 0,
        lastUpdated: Date.now()
    });

    // Clear local array
    localProductsArray.length = 0;
}

/**
 * Load all products from Firebase (initial load)
 */
async function loadAllProductsFromFirebase(database) {
    try {
        // Load products
        const productsSnapshot = await database.ref('savedProducts').once('value');
        const productsObject = productsSnapshot.val();

        if (!productsObject || typeof productsObject !== 'object') {
            return [];
        }

        // Convert object to array
        const productsArray = Object.values(productsObject);

        // Load sort order from metadata
        const metaSnapshot = await database.ref('savedProductsMeta/sortedIds').once('value');
        const sortedIds = metaSnapshot.val() || [];

        // Sort according to metadata
        productsArray.sort((a, b) => {
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

        return productsArray;

    } catch (error) {
        console.error('Error loading products:', error);
        return [];
    }
}

/**
 * Setup Firebase child listeners for realtime updates
 */
function setupFirebaseChildListeners(database, localProductsArray, callbacks) {
    const productsRef = database.ref('savedProducts');

    let isInitialLoad = true;
    let initialLoadCount = 0;

    // Get expected count for initial load
    database.ref('savedProductsMeta/count').once('value', (snapshot) => {
        const expectedCount = snapshot.val() || 0;

        // child_added: Fired for each existing child and when new child is added
        productsRef.on('child_added', (snapshot) => {
            const product = snapshot.val();

            // During initial load, count items
            if (isInitialLoad) {
                initialLoadCount++;

                // Check if initial load is complete
                if (initialLoadCount >= expectedCount) {
                    isInitialLoad = false;
                    if (callbacks.onInitialLoadComplete) {
                        callbacks.onInitialLoadComplete();
                    }
                }
                // Don't call onProductAdded during initial load
                return;
            }

            // After initial load, this is a real addition
            const exists = localProductsArray.find(p => p.Id === product.Id);
            if (!exists) {
                localProductsArray.push(product);

                // Sort by addedAt (newest first)
                localProductsArray.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

                // Sync to localStorage
                localStorage.setItem('savedProducts', JSON.stringify(localProductsArray));

                if (callbacks.onProductAdded) {
                    callbacks.onProductAdded(product);
                }
            }
        });
    });

    // child_changed: When a product is updated
    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const index = localProductsArray.findIndex(p => p.Id === updatedProduct.Id);

        if (index !== -1) {
            localProductsArray[index] = updatedProduct;

            // Sync to localStorage
            localStorage.setItem('savedProducts', JSON.stringify(localProductsArray));

            if (callbacks.onProductChanged) {
                callbacks.onProductChanged(updatedProduct, index);
            }
        }
    });

    // child_removed: When a product is deleted
    productsRef.on('child_removed', (snapshot) => {
        const removedProduct = snapshot.val();
        const index = localProductsArray.findIndex(p => p.Id === removedProduct.Id);

        if (index !== -1) {
            localProductsArray.splice(index, 1);

            // Sync to localStorage
            localStorage.setItem('savedProducts', JSON.stringify(localProductsArray));

            if (callbacks.onProductRemoved) {
                callbacks.onProductRemoved(removedProduct, index);
            }
        }
    });

    return {
        detach: () => {
            productsRef.off('child_added');
            productsRef.off('child_changed');
            productsRef.off('child_removed');
        }
    };
}
