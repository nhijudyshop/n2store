// =====================================================
// SỔ QUỸ - DATABASE OPERATIONS (Firestore CRUD)
// File: soquy-database.js
// =====================================================

const SoquyDatabase = (function () {
    const config = window.SoquyConfig;
    const state = window.SoquyState;

    // =====================================================
    // VOUCHER CODE GENERATION (Auto-increment)
    // =====================================================

    /**
     * Get next voucher code for a given type and fund
     * Format: PREFIX + 6-digit number (e.g., CTM003068, TTM000001)
     */
    async function getNextVoucherCode(voucherType, fundType) {
        const prefix = config.VOUCHER_CODE_PREFIX[voucherType][fundType];
        if (!prefix) throw new Error('Invalid voucher type or fund type');

        const counterDocId = `${prefix}_counter`;

        try {
            // Use Firestore transaction for atomic increment
            const counterRef = config.soquyCountersRef.doc(counterDocId);
            const newCode = await config.db.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);

                let nextNumber = 1;
                if (counterDoc.exists) {
                    nextNumber = (counterDoc.data().lastNumber || 0) + 1;
                }

                transaction.set(counterRef, {
                    lastNumber: nextNumber,
                    prefix: prefix,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                return `${prefix}${String(nextNumber).padStart(6, '0')}`;
            });

            return newCode;
        } catch (error) {
            console.error('[SoquyDB] Error generating voucher code:', error);
            // Fallback: use timestamp-based code
            const timestamp = Date.now().toString().slice(-6);
            return `${prefix}${timestamp}`;
        }
    }

    // =====================================================
    // CREATE OPERATIONS
    // =====================================================

    /**
     * Create a new voucher (receipt or payment)
     */
    async function createVoucher(voucherData) {
        try {
            const fundType = state.fundType === config.FUND_TYPES.ALL
                ? config.FUND_TYPES.CASH
                : state.fundType;

            const voucherCode = await getNextVoucherCode(voucherData.type, fundType);

            const now = new Date();
            const voucher = {
                code: voucherCode,
                type: voucherData.type, // 'receipt' or 'payment'
                fundType: fundType,
                category: voucherData.category || '',
                collector: voucherData.collector || '',
                objectType: voucherData.objectType || 'Khác',
                personName: voucherData.personName || '',
                personCode: voucherData.personCode || '',
                phone: voucherData.phone || '',
                address: voucherData.address || '',
                amount: Math.abs(Number(voucherData.amount) || 0),
                note: voucherData.note || '',
                transferContent: voucherData.transferContent || '',
                accountName: voucherData.accountName || '',
                accountNumber: voucherData.accountNumber || '',
                branch: voucherData.branch || '',
                businessAccounting: voucherData.businessAccounting !== false,
                status: config.VOUCHER_STATUS.PAID,
                voucherDateTime: voucherData.dateTime
                    ? parseVoucherDateTime(voucherData.dateTime)
                    : firebase.firestore.Timestamp.fromDate(now),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: voucherData.createdBy || getCurrentUserName(),
                cancelledAt: null,
                cancelReason: ''
            };

            const docRef = await config.soquyCollectionRef.add(voucher);
            console.log('[SoquyDB] Voucher created:', voucherCode);

            return { id: docRef.id, ...voucher };
        } catch (error) {
            console.error('[SoquyDB] Error creating voucher:', error);
            throw error;
        }
    }

    // =====================================================
    // READ OPERATIONS
    // =====================================================

    /**
     * Fetch vouchers with filters applied
     */
    async function fetchVouchers() {
        try {
            // Use simple orderBy query and filter client-side to avoid composite index issues
            const snapshot = await config.soquyCollectionRef
                .orderBy('voucherDateTime', 'desc')
                .get();

            let vouchers = [];
            snapshot.forEach(doc => {
                vouchers.push({ id: doc.id, ...doc.data() });
            });

            // Apply all filters client-side
            if (state.fundType !== config.FUND_TYPES.ALL) {
                vouchers = vouchers.filter(v => v.fundType === state.fundType);
            }
            if (state.statusFilter.length > 0) {
                vouchers = vouchers.filter(v => state.statusFilter.includes(v.status));
            }
            if (state.voucherTypeFilter.length === 1) {
                vouchers = vouchers.filter(v => v.type === state.voucherTypeFilter[0]);
            }
            if (state.businessAccounting === config.BUSINESS_ACCOUNTING.YES) {
                vouchers = vouchers.filter(v => v.businessAccounting === true);
            } else if (state.businessAccounting === config.BUSINESS_ACCOUNTING.NO) {
                vouchers = vouchers.filter(v => v.businessAccounting === false);
            }

            vouchers = applyClientSideFilters(vouchers);
            return vouchers;
        } catch (error) {
            console.error('[SoquyDB] Error fetching vouchers:', error);
            return [];
        }
    }

    /**
     * Apply client-side filters (time, search, category, creator, employee)
     */
    function applyClientSideFilters(vouchers) {
        // Time filter
        const { startDate, endDate } = getDateRange();
        if (startDate && endDate) {
            vouchers = vouchers.filter(v => {
                const vDate = toDate(v.voucherDateTime);
                return vDate >= startDate && vDate <= endDate;
            });
        }

        // Search by voucher code
        if (state.searchQuery.trim()) {
            const query = state.searchQuery.trim().toLowerCase();
            vouchers = vouchers.filter(v =>
                (v.code || '').toLowerCase().includes(query) ||
                (v.category || '').toLowerCase().includes(query) ||
                (v.personName || '').toLowerCase().includes(query) ||
                (v.note || '').toLowerCase().includes(query)
            );
        }

        // Category filter
        if (state.categoryFilter) {
            const cat = state.categoryFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                (v.category || '').toLowerCase().includes(cat)
            );
        }

        // Creator filter
        if (state.creatorFilter) {
            const creator = state.creatorFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                (v.createdBy || '').toLowerCase().includes(creator)
            );
        }

        // Employee filter
        if (state.employeeFilter) {
            const emp = state.employeeFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                (v.collector || '').toLowerCase().includes(emp)
            );
        }

        // Status filter (for multi-status when both are checked)
        if (state.statusFilter.length > 0) {
            vouchers = vouchers.filter(v => state.statusFilter.includes(v.status));
        }

        // Voucher type filter (when both are checked, show all)
        if (state.voucherTypeFilter.length === 1) {
            vouchers = vouchers.filter(v => v.type === state.voucherTypeFilter[0]);
        }

        return vouchers;
    }

    /**
     * Get date range based on current time filter
     */
    function getDateRange() {
        const now = new Date();
        let startDate, endDate;

        switch (state.timeFilter) {
            case config.TIME_FILTERS.THIS_MONTH:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case config.TIME_FILTERS.LAST_MONTH:
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                break;
            case config.TIME_FILTERS.THIS_QUARTER: {
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
            }
            case config.TIME_FILTERS.THIS_YEAR:
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            case config.TIME_FILTERS.CUSTOM:
                startDate = state.customStartDate ? new Date(state.customStartDate + 'T00:00:00') : null;
                endDate = state.customEndDate ? new Date(state.customEndDate + 'T23:59:59') : null;
                break;
            default:
                startDate = null;
                endDate = null;
        }

        return { startDate, endDate };
    }

    /**
     * Fetch single voucher by ID
     */
    async function getVoucher(docId) {
        try {
            const doc = await config.soquyCollectionRef.doc(docId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('[SoquyDB] Error fetching voucher:', error);
            throw error;
        }
    }

    /**
     * Calculate opening balance (all vouchers BEFORE the start date)
     */
    async function calculateOpeningBalance(fundType) {
        try {
            const { startDate } = getDateRange();
            if (!startDate) return 0;

            let query = config.soquyCollectionRef
                .where('status', '==', config.VOUCHER_STATUS.PAID);

            if (fundType !== config.FUND_TYPES.ALL) {
                query = query.where('fundType', '==', fundType);
            }

            const snapshot = await query.get();
            let balance = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const vDate = toDate(data.voucherDateTime);
                if (vDate < startDate) {
                    if (data.type === config.VOUCHER_TYPES.RECEIPT) {
                        balance += Math.abs(data.amount || 0);
                    } else {
                        balance -= Math.abs(data.amount || 0);
                    }
                }
            });

            return balance;
        } catch (error) {
            console.error('[SoquyDB] Error calculating opening balance:', error);
            return 0;
        }
    }

    // =====================================================
    // UPDATE OPERATIONS
    // =====================================================

    /**
     * Update voucher details
     */
    async function updateVoucher(docId, updateData) {
        try {
            const cleanData = {
                ...updateData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Don't allow changing code or type
            delete cleanData.code;
            delete cleanData.id;

            if (cleanData.amount !== undefined) {
                cleanData.amount = Math.abs(Number(cleanData.amount) || 0);
            }

            if (cleanData.dateTime) {
                cleanData.voucherDateTime = parseVoucherDateTime(cleanData.dateTime);
                delete cleanData.dateTime;
            }

            await config.soquyCollectionRef.doc(docId).update(cleanData);
            console.log('[SoquyDB] Voucher updated:', docId);
            return true;
        } catch (error) {
            console.error('[SoquyDB] Error updating voucher:', error);
            throw error;
        }
    }

    /**
     * Cancel a voucher (soft delete)
     */
    async function cancelVoucher(docId, reason) {
        try {
            await config.soquyCollectionRef.doc(docId).update({
                status: config.VOUCHER_STATUS.CANCELLED,
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                cancelReason: reason || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('[SoquyDB] Voucher cancelled:', docId);
            return true;
        } catch (error) {
            console.error('[SoquyDB] Error cancelling voucher:', error);
            throw error;
        }
    }

    // =====================================================
    // DELETE OPERATIONS
    // =====================================================

    /**
     * Permanently delete a voucher (admin only)
     */
    async function deleteVoucher(docId) {
        try {
            await config.soquyCollectionRef.doc(docId).delete();
            console.log('[SoquyDB] Voucher deleted:', docId);
            return true;
        } catch (error) {
            console.error('[SoquyDB] Error deleting voucher:', error);
            throw error;
        }
    }

    // =====================================================
    // IMPORT FROM EXCEL
    // =====================================================

    /**
     * Import vouchers from parsed Excel data
     * @param {Array} rows - Array of row objects from Excel
     * @returns {Object} { success: number, errors: Array }
     */
    async function importVouchers(rows) {
        const results = { success: 0, errors: [] };

        for (let i = 0; i < rows.length; i++) {
            try {
                const row = rows[i];
                const voucherType = detectVoucherType(row);
                const fundType = detectFundType(row) || state.fundType;
                const effectiveFund = fundType === config.FUND_TYPES.ALL
                    ? config.FUND_TYPES.CASH : fundType;

                const voucherCode = await getNextVoucherCode(voucherType, effectiveFund);
                const now = new Date();

                const voucher = {
                    code: voucherCode,
                    type: voucherType,
                    fundType: effectiveFund,
                    category: String(row['Loại thu chi'] || row['category'] || '').trim(),
                    collector: String(row['Nhân viên'] || row['collector'] || '').trim(),
                    objectType: String(row['Đối tượng'] || row['objectType'] || 'Khác').trim(),
                    personName: String(row['Người nộp/nhận'] || row['personName'] || '').trim(),
                    personCode: String(row['Mã người nộp/nhận'] || row['personCode'] || '').trim(),
                    phone: String(row['Số điện thoại'] || row['phone'] || '').trim(),
                    address: String(row['Địa chỉ'] || row['address'] || '').trim(),
                    amount: Math.abs(parseImportAmount(row['Giá trị'] || row['amount'] || 0)),
                    note: String(row['Ghi chú'] || row['note'] || '').trim(),
                    transferContent: String(row['Nội dung chuyển khoản'] || row['transferContent'] || '').trim(),
                    accountName: String(row['Tên tài khoản'] || row['accountName'] || '').trim(),
                    accountNumber: String(row['Số tài khoản'] || row['accountNumber'] || '').trim(),
                    branch: String(row['Chi nhánh'] || row['branch'] || '').trim(),
                    businessAccounting: parseBoolean(row['Hạch toán KQKD'] || row['businessAccounting'], true),
                    status: config.VOUCHER_STATUS.PAID,
                    voucherDateTime: parseImportDateTime(row['Thời gian'] || row['voucherDateTime'])
                        || firebase.firestore.Timestamp.fromDate(now),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: String(row['Người tạo'] || row['createdBy'] || getCurrentUserName()).trim(),
                    cancelledAt: null,
                    cancelReason: ''
                };

                await config.soquyCollectionRef.add(voucher);

                // Auto-add category if not in predefined list
                if (voucher.category) {
                    await autoAddCategory(voucher.category, voucherType);
                }
                // Auto-add creator if not in predefined list
                if (voucher.createdBy && voucher.createdBy !== 'Admin') {
                    await autoAddCreator(voucher.createdBy);
                }

                results.success++;
            } catch (error) {
                console.error(`[SoquyDB] Error importing row ${i + 1}:`, error);
                results.errors.push({ row: i + 1, error: error.message });
            }
        }

        return results;
    }

    function detectVoucherType(row) {
        const type = (row['Loại'] || row['type'] || '').toLowerCase();
        if (type.includes('thu') || type === 'receipt') return config.VOUCHER_TYPES.RECEIPT;
        if (type.includes('chi') || type === 'payment') return config.VOUCHER_TYPES.PAYMENT;
        // Detect by amount sign
        const amount = parseFloat(String(row['Giá trị'] || row['amount'] || '0').replace(/[.,\s]/g, ''));
        return amount < 0 ? config.VOUCHER_TYPES.PAYMENT : config.VOUCHER_TYPES.RECEIPT;
    }

    function detectFundType(row) {
        const fund = (row['Loại sổ quỹ'] || row['Quỹ'] || row['fundType'] || '').toLowerCase();
        if (fund.includes('mặt') || fund === 'cash') return config.FUND_TYPES.CASH;
        if (fund.includes('ngân') || fund === 'bank') return config.FUND_TYPES.BANK;
        if (fund.includes('ví') || fund === 'ewallet') return config.FUND_TYPES.EWALLET;
        return null;
    }

    function parseImportAmount(value) {
        if (typeof value === 'number') return value;
        const cleaned = String(value).replace(/[.,\s]/g, '');
        return parseInt(cleaned) || 0;
    }

    function parseImportDateTime(value) {
        if (!value) return null;
        // Try dd/MM/yyyy HH:mm format
        const result = parseVoucherDateTime(String(value));
        if (result) return result;
        // Try Date object from Excel
        if (value instanceof Date && !isNaN(value.getTime())) {
            return firebase.firestore.Timestamp.fromDate(value);
        }
        return null;
    }

    function parseBoolean(value, defaultVal) {
        if (value === undefined || value === null || value === '') return defaultVal;
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase().trim();
        if (str === 'có' || str === 'yes' || str === 'true' || str === '1') return true;
        if (str === 'không' || str === 'no' || str === 'false' || str === '0') return false;
        return defaultVal;
    }

    // =====================================================
    // DYNAMIC CATEGORIES & CREATORS
    // =====================================================

    /**
     * Auto-add a category if it doesn't exist in the predefined list
     */
    async function autoAddCategory(category, voucherType) {
        category = String(category || '').trim();
        if (!category) return;

        const isReceipt = voucherType === config.VOUCHER_TYPES.RECEIPT;
        const predefined = isReceipt ? config.RECEIPT_CATEGORIES : config.PAYMENT_CATEGORIES;
        const dynamicList = isReceipt ? state.dynamicReceiptCategories : state.dynamicPaymentCategories;

        // Check if already exists
        const allCategories = [...predefined, ...dynamicList];
        if (allCategories.some(c => String(c).toLowerCase() === category.toLowerCase())) return;

        try {
            const docId = isReceipt ? 'receipt_categories' : 'payment_categories';
            const docRef = config.soquyMetaRef.doc(docId);
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            if (!items.some(c => String(c).toLowerCase() === category.toLowerCase())) {
                items.push(category);
                await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            // Update local state
            if (isReceipt) {
                if (!state.dynamicReceiptCategories.includes(category)) {
                    state.dynamicReceiptCategories.push(category);
                }
            } else {
                if (!state.dynamicPaymentCategories.includes(category)) {
                    state.dynamicPaymentCategories.push(category);
                }
            }

            console.log('[SoquyDB] Auto-added category:', category);
        } catch (error) {
            console.error('[SoquyDB] Error auto-adding category:', error);
        }
    }

    /**
     * Auto-add a creator if not already known
     */
    async function autoAddCreator(creatorName) {
        creatorName = String(creatorName || '').trim();
        if (!creatorName) return;

        const dynamicList = state.dynamicCreators;
        if (dynamicList.some(c => String(c).toLowerCase() === creatorName.toLowerCase())) return;

        try {
            const docRef = config.soquyMetaRef.doc('creators');
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            if (!items.some(c => String(c).toLowerCase() === creatorName.toLowerCase())) {
                items.push(creatorName);
                await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            if (!state.dynamicCreators.includes(creatorName)) {
                state.dynamicCreators.push(creatorName);
            }

            console.log('[SoquyDB] Auto-added creator:', creatorName);
        } catch (error) {
            console.error('[SoquyDB] Error auto-adding creator:', error);
        }
    }

    /**
     * Load dynamic categories & creators from Firestore
     */
    async function loadDynamicMeta() {
        try {
            const [rcDoc, pcDoc, crDoc] = await Promise.all([
                config.soquyMetaRef.doc('receipt_categories').get(),
                config.soquyMetaRef.doc('payment_categories').get(),
                config.soquyMetaRef.doc('creators').get()
            ]);

            if (rcDoc.exists) state.dynamicReceiptCategories = rcDoc.data().items || [];
            if (pcDoc.exists) state.dynamicPaymentCategories = pcDoc.data().items || [];
            if (crDoc.exists) state.dynamicCreators = crDoc.data().items || [];

            console.log('[SoquyDB] Dynamic meta loaded');
        } catch (error) {
            console.error('[SoquyDB] Error loading dynamic meta:', error);
        }
    }

    // =====================================================
    // EXPORT
    // =====================================================

    /**
     * Export vouchers to CSV format for Excel
     */
    function exportToCSV(vouchers) {
        const headers = [
            'Mã phiếu',
            'Loại',
            'Quỹ',
            'Thời gian',
            'Loại thu chi',
            'Người nộp/nhận',
            'Người thu/chi',
            'Giá trị',
            'Ghi chú',
            'Trạng thái',
            'Hạch toán KQKD',
            'Người tạo'
        ];

        const rows = vouchers.map(v => [
            v.code,
            v.type === config.VOUCHER_TYPES.RECEIPT ? 'Phiếu thu' : 'Phiếu chi',
            config.FUND_TYPE_LABELS[v.fundType] || v.fundType,
            formatVoucherDateTime(v.voucherDateTime),
            v.category,
            v.personName,
            v.collector,
            v.type === config.VOUCHER_TYPES.RECEIPT
                ? Math.abs(v.amount)
                : -Math.abs(v.amount),
            v.note,
            config.VOUCHER_STATUS_LABELS[v.status] || v.status,
            v.businessAccounting ? 'Có' : 'Không',
            v.createdBy
        ]);

        const BOM = '\uFEFF';
        const csvContent = BOM + [
            headers.join(','),
            ...rows.map(row =>
                row.map(cell => {
                    const str = String(cell || '');
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        link.href = url;
        link.download = `SoQuy_${dateStr}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function toDate(timestamp) {
        if (!timestamp) return new Date(0);
        if (timestamp.toDate) return timestamp.toDate();
        if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
        return new Date(timestamp);
    }

    function formatVoucherDateTime(timestamp) {
        const date = toDate(timestamp);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    function parseVoucherDateTime(dateTimeStr) {
        // Parse "dd/MM/yyyy HH:mm" format
        const match = dateTimeStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (match) {
            const date = new Date(
                parseInt(match[3]),
                parseInt(match[2]) - 1,
                parseInt(match[1]),
                parseInt(match[4]),
                parseInt(match[5])
            );
            return firebase.firestore.Timestamp.fromDate(date);
        }
        // Try ISO format
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
            return firebase.firestore.Timestamp.fromDate(date);
        }
        return firebase.firestore.Timestamp.fromDate(new Date());
    }

    function getCurrentUserName() {
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            return userData.displayName || userData.username || userData.name || 'Admin';
        } catch {
            return 'Admin';
        }
    }

    function formatCurrency(amount) {
        if (amount === null || amount === undefined) return '0';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        getNextVoucherCode,
        createVoucher,
        fetchVouchers,
        getVoucher,
        calculateOpeningBalance,
        updateVoucher,
        cancelVoucher,
        deleteVoucher,
        exportToCSV,
        importVouchers,
        autoAddCategory,
        autoAddCreator,
        loadDynamicMeta,
        getDateRange,
        toDate,
        formatVoucherDateTime,
        parseVoucherDateTime,
        getCurrentUserName,
        formatCurrency
    };
})();

// Export
window.SoquyDatabase = SoquyDatabase;
