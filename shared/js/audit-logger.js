// =====================================================
// AUDIT LOGGER - Shared Action Logger Service
// File: shared/js/audit-logger.js
// Ghi nhận toàn bộ thao tác từ mọi module vào Firestore
// collection `edit_history` để kiểm toán tập trung.
//
// Sử dụng:
// - IIFE: window.AuditLogger.logAction(actionType, details)
// - ES Module: import { logAction } from '../../shared/js/audit-logger.esm.js'
// =====================================================

window.AuditLogger = (function () {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================

    var COLLECTION_NAME = 'edit_history';

    var VALID_ACTION_TYPES = [
        // Customer Hub
        'wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt',
        'customer_info_update', 'wallet_transaction',
        // Issue Tracking
        'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
        'ticket_payment', 'ticket_update',
        // Balance History
        'transaction_assign', 'livemode_confirm_customer',
        'transaction_approve', 'transaction_adjust',
        'customer_info_update_bh', 'transaction_verify',
        'accountant_entry_create',
        // Legacy (tương thích ngược)
        'add', 'edit', 'delete', 'update', 'mark'
    ];

    // =====================================================
    // HELPER: Validate actionType
    // =====================================================

    function isValidActionType(actionType) {
        return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
    }

    // =====================================================
    // HELPER: Get current user info
    // =====================================================

    function getCurrentUser() {
        try {
            if (window.authManager && typeof window.authManager.getAuthState === 'function') {
                var authState = window.authManager.getAuthState();
                return {
                    userId: authState.userId || authState.uid || '',
                    userName: authState.displayName || authState.email || ''
                };
            }
        } catch (error) {
            console.warn('[AuditLogger] Could not get user info from authManager:', error);
        }
        // Fallback: try sessionStorage/localStorage
        try {
            var authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            var authData = JSON.parse(authStr);
            if (authData.username || authData.uid) {
                return {
                    userId: authData.username || authData.uid || '',
                    userName: authData.username || ''
                };
            }
        } catch (e) { /* ignore */ }
        return { userId: '', userName: 'Unknown' };
    }

    // =====================================================
    // HELPER: Get server timestamp safely
    // =====================================================

    function getServerTimestamp() {
        try {
            // Try compat SDK path (firebase.firestore.FieldValue)
            if (window.firebase && window.firebase.firestore &&
                window.firebase.firestore.FieldValue &&
                typeof window.firebase.firestore.FieldValue.serverTimestamp === 'function') {
                return window.firebase.firestore.FieldValue.serverTimestamp();
            }
        } catch (e) {
            console.warn('[AuditLogger] serverTimestamp via FieldValue failed:', e);
        }
        // Fallback: use client-side Date
        return new Date();
    }

    // =====================================================
    // HELPER: Get Firestore instance
    // =====================================================

    function getFirestoreDB() {
        try {
            // Method 1: Use global initializeFirestore from firebase-config.js
            if (typeof window.initializeFirestore === 'function') {
                var db = window.initializeFirestore({ enablePersistence: false });
                if (db) return db;
            }
            // Method 2: Use global getFirestore from firebase-config.js
            if (typeof window.getFirestore === 'function') {
                var db2 = window.getFirestore();
                if (db2) return db2;
            }
            // Method 3: Direct firebase.firestore() call
            if (window.firebase && typeof window.firebase.firestore === 'function') {
                return window.firebase.firestore();
            }
        } catch (error) {
            console.error('[AuditLogger] Firestore not available:', error);
        }
        return null;
    }

    // =====================================================
    // CORE: Build Audit Record
    // =====================================================

    function buildRecord(actionType, details, user) {
        var record = {
            timestamp: getServerTimestamp(),
            performerUserId: user.userId,
            performerUserName: user.userName,
            module: details.module,
            actionType: actionType,
            description: details.description || '',
            oldData: details.oldData || null,
            newData: details.newData || null
        };

        var optionalFields = [
            'approverUserId', 'approverUserName',
            'creatorUserId', 'creatorUserName',
            'entityId', 'entityType', 'metadata'
        ];

        for (var i = 0; i < optionalFields.length; i++) {
            var field = optionalFields[i];
            if (details[field] !== undefined && details[field] !== null) {
                record[field] = details[field];
            }
        }

        return record;
    }

    // =====================================================
    // CORE: logAction - API chính
    // =====================================================

    function logAction(actionType, details) {
        console.log('[AuditLogger] logAction called:', actionType, details ? details.module : 'no-details');

        // Validate actionType
        if (!isValidActionType(actionType)) {
            console.warn('[AuditLogger] Invalid actionType:', actionType);
            return;
        }

        // Validate module
        if (!details || !details.module) {
            console.warn('[AuditLogger] Missing details.module for actionType:', actionType);
            return;
        }

        // Fire-and-forget
        try {
            var user = getCurrentUser();
            console.log('[AuditLogger] User:', user.userId, user.userName);

            var record = buildRecord(actionType, details, user);
            console.log('[AuditLogger] Record built, timestamp type:', typeof record.timestamp);

            var db = getFirestoreDB();
            if (!db) {
                console.error('[AuditLogger] Firestore DB is null - cannot log action');
                return;
            }

            console.log('[AuditLogger] Writing to', COLLECTION_NAME, '...');
            db.collection(COLLECTION_NAME).add(record).then(function(docRef) {
                console.log('[AuditLogger] SUCCESS - doc written:', docRef.id);
            }).catch(function (error) {
                console.error('[AuditLogger] FAILED to write audit record:', error);
            });
        } catch (error) {
            console.error('[AuditLogger] Error in logAction:', error);
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    console.log('[AuditLogger] Module loaded. firebase available:', typeof window.firebase !== 'undefined');

    return {
        logAction: logAction,
        isValidActionType: isValidActionType,
        VALID_ACTION_TYPES: VALID_ACTION_TYPES
    };

})();
