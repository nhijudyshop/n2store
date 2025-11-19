/**
 * FIREBASE INITIALIZATION
 * File: firebase-init.js
 * Purpose: Initialize Firebase with configuration before other scripts use it
 *
 * This script MUST be loaded:
 * 1. AFTER Firebase SDK (firebase-app-compat.js, firebase-database-compat.js)
 * 2. BEFORE any script that uses Firebase (token-manager.js, etc.)
 */

(function() {
    'use strict';

    console.log('[FIREBASE] Initializing Firebase...');

    // Wait for Firebase SDK to be available
    function initFirebase() {
        // Check if Firebase SDK is loaded
        if (!window.firebase) {
            console.error('[FIREBASE] Firebase SDK not loaded yet');
            return false;
        }

        // Check if Firebase config is available
        let config = null;

        // Try to get config from window.FIREBASE_CONFIG (loaded by core-loader.js)
        if (window.FIREBASE_CONFIG) {
            config = window.FIREBASE_CONFIG;
            console.log('[FIREBASE] Using FIREBASE_CONFIG from window');
        } else {
            // Fallback: define config directly if not available
            config = {
                apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
                authDomain: "n2shop-69e37.firebaseapp.com",
                projectId: "n2shop-69e37",
                storageBucket: "n2shop-69e37-ne0q1",
                messagingSenderId: "598906493303",
                appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
                measurementId: "G-TEJH3S2T1D",
            };
            console.warn('[FIREBASE] Using fallback config');
        }

        // Check if Firebase is already initialized
        if (firebase.apps && firebase.apps.length > 0) {
            console.log('[FIREBASE] ✅ Firebase already initialized');
            return true;
        }

        // Initialize Firebase
        try {
            firebase.initializeApp(config);
            console.log('[FIREBASE] ✅ Firebase initialized successfully');

            // Set global flag to indicate Firebase is ready
            window.FIREBASE_INITIALIZED = true;

            // Trigger custom event for other scripts to listen to
            const event = new CustomEvent('firebaseInitialized', {
                detail: {
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(event);

            return true;
        } catch (error) {
            console.error('[FIREBASE] ❌ Error initializing Firebase:', error);
            return false;
        }
    }

    // Try to initialize immediately if Firebase SDK is already loaded
    if (window.firebase) {
        initFirebase();
    } else {
        // Wait for Firebase SDK to load
        let checkCount = 0;
        const maxChecks = 50; // 5 seconds max (50 * 100ms)

        const checkInterval = setInterval(function() {
            checkCount++;

            if (window.firebase) {
                clearInterval(checkInterval);
                initFirebase();
            } else if (checkCount >= maxChecks) {
                clearInterval(checkInterval);
                console.error('[FIREBASE] ❌ Firebase SDK not loaded after 5 seconds');
            }
        }, 100);
    }
})();
