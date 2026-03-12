/**
 * Firebase Helpers Global Wrapper — Live Order Book
 * Imports all functions from firebase-helpers.js as ES Module
 * and exposes them to the global window object for use in HTML files.
 * Pattern follows soluong-live/firebase-helpers-global.js
 */
import {
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
} from './firebase-helpers.js';

// Expose all functions to global window object
Object.assign(window, {
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
});

console.log('✅ Live Order Book Firebase helpers loaded and exposed to global scope');
