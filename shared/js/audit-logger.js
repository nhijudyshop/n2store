// =====================================================
// AUDIT LOGGER - Shared Action Logger Service
// File: shared/js/audit-logger.js
// Ghi nhận toàn bộ thao tác từ mọi module vào Firestore
// collection `edit_history` để kiểm toán tập trung.
//
// Sử dụng:
// - IIFE: window.AuditLogger.logAction(actionType, details)
// - ES Module: import { logAction } from '../../shared/js/audit-logger.js'
// =====================================================

window.AuditLogger = (function () {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================

    const COLLECTION_NAME = 'edit_history';

    const VALID_ACTION_TYPES = [
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

    /**
     * Kiểm tra actionType có hợp lệ không
     * @param {string} actionType
     * @returns {boolean}
     */
    function isValidActionType(actionType) {
        return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
    }

    // =====================================================
    // HELPER: Get current user info
    // =====================================================

    /**
     * Lấy thông tin user hiện tại từ authManager
     * Pattern giống kpi-audit-logger.js
     * @returns {{ userId: string, userName: string }}
     */
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
        return { userId: '', userName: 'Unknown' };
    }

    // =====================================================
    // HELPER: Get Firestore instance
    // =====================================================

    function getFirestore() {
        try {
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

    /**
     * Build Audit Record chuẩn hóa từ actionType và details
     * @param {string} actionType
     * @param {object} details
     * @param {{ userId: string, userName: string }} user
     * @returns {object|null}
     */
    function buildRecord(actionType, details, user) {
        var record = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            performerUserId: user.userId,
            performerUserName: user.userName,
            module: details.module,
            actionType: actionType,
            description: details.description || '',
            oldData: details.oldData || null,
            newData: details.newData || null
        };

        // Trường tùy chọn - chỉ thêm khi được cung cấp
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

    /**
     * Ghi nhận audit action vào Firestore
     * Fire-and-forget: không await trong flow chính, lỗi chỉ console.error
     *
     * @param {string} actionType - Loại thao tác (phải thuộc VALID_ACTION_TYPES)
     * @param {object} details - Chi tiết thao tác
     * @param {string} details.module - Tên module (bắt buộc)
     * @param {string} [details.description] - Mô tả thao tác
     * @param {object} [details.oldData] - Dữ liệu trước thay đổi
     * @param {object} [details.newData] - Dữ liệu sau thay đổi
     * @param {string} [details.approverUserId] - ID người duyệt
     * @param {string} [details.approverUserName] - Tên người duyệt
     * @param {string} [details.creatorUserId] - ID người tạo
     * @param {string} [details.creatorUserName] - Tên người tạo
     * @param {string} [details.entityId] - ID đối tượng
     * @param {string} [details.entityType] - Loại đối tượng
     * @param {object} [details.metadata] - Dữ liệu bổ sung
     */
    function logAction(actionType, details) {
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
            var record = buildRecord(actionType, details, user);
            var db = getFirestore();

            if (!db) {
                console.error('[AuditLogger] Firestore not available, cannot log action');
                return;
            }

            // Ghi bất đồng bộ - không block thao tác chính
            db.collection(COLLECTION_NAME).add(record).catch(function (error) {
                console.error('[AuditLogger] Failed to write audit record:', error);
            });
        } catch (error) {
            console.error('[AuditLogger] Error in logAction:', error);
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        logAction: logAction,
        isValidActionType: isValidActionType,
        VALID_ACTION_TYPES: VALID_ACTION_TYPES
    };

})();
