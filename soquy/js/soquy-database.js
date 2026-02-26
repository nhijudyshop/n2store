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
                amount: Math.abs(Number(voucherData.amount) || 0),
                note: voucherData.note || '',
                businessAccounting: voucherData.businessAccounting !== false,
                status: config.VOUCHER_STATUS.PAID,
                voucherDateTime: voucherData.dateTime
                    ? parseVoucherDateTime(voucherData.dateTime)
                    : firebase.firestore.Timestamp.fromDate(now),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: getCurrentUserName(),
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
