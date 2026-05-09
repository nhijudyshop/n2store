// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TAB3-HISTORY-V2.JS
 * Upload History V2 viewer (separate database), group-by-STT view,
 * detail view, comparison, save/sync with IndexedDB fallback.
 *
 * Load order: tab3-history-v2.js (8th, after tab3-history.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, ui } = window._tab3;
    const database = window._tab3.database;

    // =====================================================
    // HISTORY V2 STATE
    // =====================================================

    let uploadHistoryRecordsV2 = [];
    let filteredHistoryRecordsV2 = [];
    let currentHistoryPageV2 = 1;
    const HISTORY_PAGE_SIZE_V2 = 20;

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function getUserFirebasePathV2(basePath) {
        basePath = basePath || 'productAssignments_v2_history';
        const usm = state.userStorageManager || window.userStorageManager;
        return usm ? usm.getUserFirebasePath(basePath) : `${basePath}/guest`;
    }

    function getUserDisplayNameV2(userId) {
        if (!userId) return 'Unknown';
        if (userId.includes('-')) {
            return userId.split('-')[0];
        }
        return userId;
    }

    async function loadAllUsersForFilterV2() {
        try {
            console.log('[HISTORY-V2] Loading all users for filter...');
            const historyRef = database.ref('productAssignments_v2_history');
            const snapshot = await historyRef.once('value');

            const userIds = [];
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    userIds.push(childSnapshot.key);
                });
            }

            userIds.sort();
            console.log(`[HISTORY-V2] Found ${userIds.length} users with upload history`);
            return userIds;
        } catch (error) {
            console.error('[HISTORY-V2] Error loading users for filter:', error);
            return [];
        }
    }

    async function populateUserFilterV2() {
        try {
            const userFilterSelect = document.getElementById('historyV2UserFilter');
            if (!userFilterSelect) {
                console.warn('[HISTORY-V2] User filter select not found');
                return;
            }

            const previousSelection = userFilterSelect.value;
            console.log('[HISTORY-V2] Preserving selection:', previousSelection);

            const usm = state.userStorageManager || window.userStorageManager;
            const currentUser =
                usm && typeof usm.getUserIdentifier === 'function' ? usm.getUserIdentifier() : null;
            console.log('[HISTORY-V2] Current user:', currentUser);

            const allUsers = await loadAllUsersForFilterV2();

            userFilterSelect.innerHTML = `
                <option value="current">👤 Lịch sử của tôi</option>
                <option value="all">👥 Tất cả người dùng</option>
            `;

            if (allUsers.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '───────────────';
                userFilterSelect.appendChild(separator);
            }

            allUsers.forEach((userId) => {
                const option = document.createElement('option');
                option.value = userId;
                option.textContent = `👤 ${getUserDisplayNameV2(userId)}`;

                if (userId === currentUser) {
                    option.textContent += ' (bạn)';
                }

                userFilterSelect.appendChild(option);
            });

            if (previousSelection) {
                const optionExists = Array.from(userFilterSelect.options).some(
                    (opt) => opt.value === previousSelection
                );
                if (optionExists) {
                    userFilterSelect.value = previousSelection;
                    console.log('[HISTORY-V2] Restored selection to:', previousSelection);
                }
            }

            console.log('[HISTORY-V2] User filter populated with', allUsers.length, 'users');
        } catch (error) {
            console.error('[HISTORY-V2] Error populating user filter:', error);
        }
    }

    // =====================================================
    // OPEN UPLOAD HISTORY V2 MODAL
    // =====================================================

    window.openUploadHistoryV2Modal = async function () {
        console.log('[HISTORY-V2] Opening upload history v2 modal...');

        try {
            const modal = new bootstrap.Modal(document.getElementById('uploadHistoryV2Modal'));
            modal.show();

            const container = document.getElementById('historyV2ListContainer');
            container.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-info" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải lịch sử...</p>
                </div>
            `;

            const pendingCount = await getPendingHistoryCount();
            if (pendingCount > 0) {
                console.log(
                    `[HISTORY-V2] Found ${pendingCount} pending records, attempting sync...`
                );
                container.innerHTML = `
                    <div class="history-loading">
                        <div class="spinner-border text-warning" role="status">
                            <span class="visually-hidden">Syncing...</span>
                        </div>
                        <p class="text-muted mt-3">Đang đồng bộ ${pendingCount} bản ghi chưa lưu...</p>
                    </div>
                `;
                await syncPendingHistoryV2();
            }

            await populateUserFilterV2();
            await loadUploadHistoryV2();

            const remainingPending = await getPendingHistoryCount();
            if (remainingPending > 0) {
                updatePendingSyncIndicator(remainingPending);
            }
        } catch (error) {
            console.error('[HISTORY-V2] Error opening history modal:', error);
            ui.showNotification('Lỗi khi tải lịch sử upload', 'error');

            const container = document.getElementById('historyV2ListContainer');
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải lịch sử upload</p>
                    <p class="small text-danger">${error.message}</p>
                    <button class="btn btn-sm btn-primary mt-2" onclick="openUploadHistoryV2Modal()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    // =====================================================
    // PENDING SYNC INDICATOR
    // =====================================================

    function updatePendingSyncIndicator(count) {
        const modalHeader = document.querySelector('#uploadHistoryV2Modal .modal-header');
        if (!modalHeader) return;

        const existing = modalHeader.querySelector('.pending-sync-indicator');
        if (existing) existing.remove();

        if (count > 0) {
            const indicator = document.createElement('div');
            indicator.className = 'pending-sync-indicator ms-3';
            indicator.innerHTML = `
                <span class="badge bg-warning text-dark" title="Có ${count} bản ghi chưa đồng bộ">
                    <i class="fas fa-exclamation-triangle"></i> ${count} chưa đồng bộ
                </span>
                <button class="btn btn-sm btn-outline-warning ms-2" onclick="retrySyncPendingHistory()" title="Thử đồng bộ lại">
                    <i class="fas fa-sync"></i>
                </button>
            `;
            modalHeader.querySelector('.modal-title').after(indicator);
        }
    }

    window.retrySyncPendingHistory = async function () {
        ui.showNotification('Đang đồng bộ...', 'info');
        const result = await syncPendingHistoryV2();

        if (result.synced > 0) {
            await loadUploadHistoryV2();
        }

        const remaining = await getPendingHistoryCount();
        updatePendingSyncIndicator(remaining);
    };

    // =====================================================
    // LOAD UPLOAD HISTORY V2
    // =====================================================

    async function loadUploadHistoryV2() {
        try {
            console.log('[HISTORY-V2] Loading history from Firebase...');

            const userFilterSelect = document.getElementById('historyV2UserFilter');
            const selectedUser = userFilterSelect ? userFilterSelect.value : 'current';
            console.log('[HISTORY-V2] Selected user filter:', selectedUser);

            let historyPath;
            let snapshot;

            if (selectedUser === 'current') {
                historyPath = getUserFirebasePathV2('productAssignments_v2_history');
                console.log('[HISTORY-V2] Loading current user history from path:', historyPath);
                snapshot = await database
                    .ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            } else if (selectedUser === 'all') {
                historyPath = 'productAssignments_v2_history';
                console.log('[HISTORY-V2] Loading ALL users history from path:', historyPath);
                snapshot = await database.ref(historyPath).once('value');
            } else {
                historyPath = `productAssignments_v2_history/${selectedUser}`;
                console.log('[HISTORY-V2] Loading specific user history from path:', historyPath);
                snapshot = await database
                    .ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            }

            const data = snapshot.val();

            if (!data) {
                console.log('[HISTORY-V2] No history records found');
                uploadHistoryRecordsV2 = [];
                filteredHistoryRecordsV2 = [];
                filterUploadHistoryV2();
                return;
            }

            uploadHistoryRecordsV2 = [];

            if (selectedUser === 'all') {
                console.log('[HISTORY-V2] Flattening data from all users...');
                Object.keys(data).forEach((userId) => {
                    const userHistory = data[userId];
                    if (userHistory && typeof userHistory === 'object') {
                        Object.keys(userHistory).forEach((uploadKey) => {
                            const record = userHistory[uploadKey];
                            if (!record || typeof record !== 'object') return;
                            if (!record.timestamp && !record.uploadId && !record.uploadStatus)
                                return;

                            let validatedUploadedSTTs = [];
                            if (Array.isArray(record.uploadedSTTs)) {
                                validatedUploadedSTTs = record.uploadedSTTs
                                    .filter((stt) => stt != null)
                                    .map((stt) => String(stt));
                            }

                            uploadHistoryRecordsV2.push({
                                uploadId: record.uploadId || uploadKey,
                                firebaseKey: uploadKey,
                                timestamp: record.timestamp || 0,
                                uploadStatus: record.uploadStatus || 'unknown',
                                totalSTTs: record.totalSTTs || 0,
                                totalAssignments: record.totalAssignments || 0,
                                successCount: record.successCount || 0,
                                failCount: record.failCount || 0,
                                uploadedSTTs: validatedUploadedSTTs,
                                note: record.note || '',
                                committedAt: record.committedAt || null,
                                restoredAt: record.restoredAt || null,
                                userId: record.userId || userId || 'guest',
                                beforeSnapshot: record.beforeSnapshot || null,
                            });
                        });
                    }
                });
            } else {
                uploadHistoryRecordsV2 = Object.keys(data).map((key) => {
                    const record = data[key];

                    let validatedUploadedSTTs = [];
                    if (Array.isArray(record.uploadedSTTs)) {
                        validatedUploadedSTTs = record.uploadedSTTs
                            .filter((stt) => stt != null)
                            .map((stt) => String(stt));
                    }

                    return {
                        uploadId: record.uploadId || key,
                        firebaseKey: key,
                        timestamp: record.timestamp || 0,
                        uploadStatus: record.uploadStatus || 'unknown',
                        totalSTTs: record.totalSTTs || 0,
                        totalAssignments: record.totalAssignments || 0,
                        successCount: record.successCount || 0,
                        failCount: record.failCount || 0,
                        uploadedSTTs: validatedUploadedSTTs,
                        note: record.note || '',
                        committedAt: record.committedAt || null,
                        restoredAt: record.restoredAt || null,
                        userId: record.userId || selectedUser || 'guest',
                        beforeSnapshot: record.beforeSnapshot || null,
                    };
                });
            }

            uploadHistoryRecordsV2.sort((a, b) => b.timestamp - a.timestamp);

            if (selectedUser === 'all' && uploadHistoryRecordsV2.length > 100) {
                uploadHistoryRecordsV2 = uploadHistoryRecordsV2.slice(0, 100);
            }

            filteredHistoryRecordsV2 = [...uploadHistoryRecordsV2];

            if (uploadHistoryRecordsV2.length > 0) {
                const newest = new Date(uploadHistoryRecordsV2[0].timestamp);
                const oldest = new Date(
                    uploadHistoryRecordsV2[uploadHistoryRecordsV2.length - 1].timestamp
                );
                console.log(`[HISTORY-V2] Loaded ${uploadHistoryRecordsV2.length} records`, {
                    newest: newest.toLocaleString('vi-VN'),
                    oldest: oldest.toLocaleString('vi-VN'),
                });
            } else {
                console.log('[HISTORY-V2] Loaded 0 history records');
            }

            filterUploadHistoryV2();
        } catch (error) {
            console.error('[HISTORY-V2] Error loading history:', error);
            throw error;
        }
    }

    // =====================================================
    // FILTER UPLOAD HISTORY V2
    // =====================================================

    window.filterUploadHistoryV2 = function () {
        const status = document.getElementById('historyV2StatusFilter').value;
        const dateFrom = document.getElementById('historyV2DateFrom').value;
        const dateTo = document.getElementById('historyV2DateTo').value;
        const searchSTT = document.getElementById('historyV2SearchSTT').value.trim();
        const searchProduct = document.getElementById('historyV2SearchProduct').value.trim();

        filteredHistoryRecordsV2 = [...uploadHistoryRecordsV2];

        if (status && status !== 'all') {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(
                (record) => record.uploadStatus === status
            );
        }

        if (dateFrom) {
            const fromTimestamp = new Date(dateFrom).getTime();
            if (!isNaN(fromTimestamp)) {
                filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(
                    (record) => (record.timestamp || 0) >= fromTimestamp
                );
            }
        }

        if (dateTo) {
            const toTimestamp = new Date(dateTo).getTime();
            if (!isNaN(toTimestamp)) {
                filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(
                    (record) => (record.timestamp || 0) <= toTimestamp
                );
            }
        }

        if (searchSTT) {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter((record) => {
                if (!Array.isArray(record.uploadedSTTs) || record.uploadedSTTs.length === 0)
                    return false;
                return record.uploadedSTTs.some(
                    (stt) => stt != null && stt.toString().includes(searchSTT)
                );
            });
        }

        if (searchProduct) {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter((record) => {
                const assignments = record.beforeSnapshot?.assignments;
                if (!Array.isArray(assignments) || assignments.length === 0) return false;
                return assignments.some((assignment) => {
                    const searchLower = searchProduct.toLowerCase();
                    return (
                        String(assignment.productCode || '')
                            .toLowerCase()
                            .includes(searchLower) ||
                        String(assignment.productId || '')
                            .toLowerCase()
                            .includes(searchLower) ||
                        String(assignment.productName || '')
                            .toLowerCase()
                            .includes(searchLower)
                    );
                });
            });
        }

        currentHistoryPageV2 = 1;

        const isGroupBySTT = document.getElementById('historyV2GroupBySTT')?.checked;
        if (isGroupBySTT) {
            renderGroupBySTTView();
        } else {
            renderUploadHistoryListV2();
        }

        console.log(
            `[HISTORY-V2] Final filtered count: ${filteredHistoryRecordsV2.length} records`
        );
    };

    window.clearHistoryV2Filters = function () {
        document.getElementById('historyV2StatusFilter').value = 'all';
        document.getElementById('historyV2DateFrom').value = '';
        document.getElementById('historyV2DateTo').value = '';
        document.getElementById('historyV2SearchSTT').value = '';
        document.getElementById('historyV2SearchProduct').value = '';
        filterUploadHistoryV2();
    };

    // =====================================================
    // RENDER UPLOAD HISTORY LIST V2
    // =====================================================

    function renderUploadHistoryListV2() {
        const container = document.getElementById('historyV2ListContainer');

        if (filteredHistoryRecordsV2.length === 0) {
            const hasFilters =
                document.getElementById('historyV2StatusFilter').value !== 'all' ||
                document.getElementById('historyV2DateFrom').value ||
                document.getElementById('historyV2DateTo').value ||
                document.getElementById('historyV2SearchSTT').value.trim() ||
                document.getElementById('historyV2SearchProduct').value.trim();

            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy lịch sử upload nào</p>
                    ${
                        hasFilters
                            ? `
                        <p class="small text-muted">
                            Đã tải ${uploadHistoryRecordsV2.length} bản ghi, nhưng không phù hợp với bộ lọc.
                        </p>
                        <button class="btn btn-sm btn-outline-secondary mt-2" onclick="clearHistoryV2Filters()">
                            <i class="fas fa-times"></i> Xóa bộ lọc
                        </button>
                    `
                            : `
                        <p class="small">Lịch sử sẽ được lưu tự động sau mỗi lần upload</p>
                    `
                    }
                </div>
            `;
            document.getElementById('historyV2Pagination').innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(filteredHistoryRecordsV2.length / HISTORY_PAGE_SIZE_V2);
        const startIndex = (currentHistoryPageV2 - 1) * HISTORY_PAGE_SIZE_V2;
        const endIndex = Math.min(
            startIndex + HISTORY_PAGE_SIZE_V2,
            filteredHistoryRecordsV2.length
        );
        const pageRecords = filteredHistoryRecordsV2.slice(startIndex, endIndex);

        container.innerHTML = pageRecords.map((record) => formatHistoryCardV2(record)).join('');
        renderHistoryPaginationV2(totalPages);
    }

    function formatHistoryCardV2(record) {
        const statusConfig = {
            completed: { icon: '✅', text: 'Thành công', class: 'completed' },
            partial: { icon: '⚠️', text: 'Thành công một phần', class: 'partial' },
            failed: { icon: '❌', text: 'Thất bại', class: 'failed' },
            deletion_failed: {
                icon: '⚠️',
                text: 'Upload OK - Xóa failed',
                class: 'deletion_failed',
            },
        };

        const config = statusConfig[record.uploadStatus] || {
            icon: '❓',
            text: 'Unknown',
            class: 'unknown',
        };

        let totalAssignmentsCalc = record.totalAssignments || record.totalSTTs || 0;
        let successCountCalc = record.successCount || 0;
        let failCountCalc = record.failCount || 0;

        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleString('vi-VN');
        const shortId = record.uploadId.slice(-8);
        const userBadge = record.userId
            ? `<span class="user-badge">👤 ${getUserDisplayNameV2(record.userId)}</span>`
            : '';
        const sttList = record.uploadedSTTs.slice(0, 20).join(', ');
        const moreStt =
            record.uploadedSTTs.length > 20
                ? ` và ${record.uploadedSTTs.length - 20} STT khác`
                : '';

        return `
            <div class="history-card ${config.class}">
                <div class="history-card-header">
                    <div>
                        <h6 class="history-card-title">
                            ${config.icon} Upload #${shortId} ${userBadge}
                            <span class="history-card-date">${dateStr}</span>
                        </h6>
                    </div>
                    <span class="history-status-badge ${config.class}">${config.text}</span>
                </div>

                <div class="history-stats">
                    <div class="history-stat-item history-stat-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${successCountCalc}</strong> thành công</span>
                    </div>
                    <div class="history-stat-item history-stat-failed">
                        <i class="fas fa-times-circle"></i>
                        <span><strong>${failCountCalc}</strong> thất bại</span>
                    </div>
                    <div class="history-stat-item history-stat-total">
                        <i class="fas fa-list"></i>
                        <span><strong>${totalAssignmentsCalc}</strong> tổng STT</span>
                    </div>
                </div>

                <div class="history-stts">
                    <strong>STT:</strong> ${sttList}${moreStt}
                </div>

                <div class="history-actions">
                    <button class="btn btn-sm btn-info" onclick="compareCartHistoryV2('${record.firebaseKey || record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-balance-scale"></i> So Sánh Giỏ
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="viewUploadHistoryDetailV2('${record.firebaseKey || record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-eye"></i> Xem Chi Tiết
                    </button>
                </div>

                ${
                    record.note
                        ? `
                    <div class="history-note">
                        <i class="fas fa-sticky-note"></i>
                        ${record.note}
                    </div>
                `
                        : ''
                }
            </div>
        `;
    }

    // =====================================================
    // PAGINATION V2
    // =====================================================

    function renderHistoryPaginationV2(totalPages) {
        const pagination = document.getElementById('historyV2Pagination');
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = `<button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(${currentHistoryPageV2 - 1})" ${currentHistoryPageV2 === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        const maxPageButtons = 7;
        let startPage = Math.max(1, currentHistoryPageV2 - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
        if (endPage - startPage < maxPageButtons - 1)
            startPage = Math.max(1, endPage - maxPageButtons + 1);

        if (startPage > 1) {
            html += `<button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(1)">1</button>${startPage > 2 ? '<span>...</span>' : ''}`;
        }
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn btn-sm ${i === currentHistoryPageV2 ? 'btn-info active' : 'btn-outline-secondary'}" onclick="changeHistoryPageV2(${i})">${i}</button>`;
        }
        if (endPage < totalPages) {
            html += `${endPage < totalPages - 1 ? '<span>...</span>' : ''}<button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(${totalPages})">${totalPages}</button>`;
        }

        html += `<button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(${currentHistoryPageV2 + 1})" ${currentHistoryPageV2 === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;

        pagination.innerHTML = html;
    }

    window.changeHistoryPageV2 = function (page) {
        currentHistoryPageV2 = page;
        renderUploadHistoryListV2();
        document
            .getElementById('historyV2ListContainer')
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // =====================================================
    // GROUP BY STT VIEW
    // =====================================================

    window.toggleGroupBySTTView = function () {
        const isGroupBySTT = document.getElementById('historyV2GroupBySTT').checked;
        if (isGroupBySTT) {
            renderGroupBySTTView();
        } else {
            renderUploadHistoryListV2();
        }
    };

    function renderGroupBySTTView() {
        const container = document.getElementById('historyV2ListContainer');
        const dateFrom = document.getElementById('historyV2DateFrom').value;
        const dateTo = document.getElementById('historyV2DateTo').value;
        const searchSTT = document.getElementById('historyV2SearchSTT').value.trim();
        const searchProduct = document.getElementById('historyV2SearchProduct').value.trim();

        const sttProductMap = new Map();

        filteredHistoryRecordsV2.forEach((record) => {
            const uploadInfo = {
                uploadId: record.uploadId,
                timestamp: record.timestamp,
                userId: record.userId,
            };

            if (
                record.beforeSnapshot &&
                record.beforeSnapshot.assignments &&
                record.beforeSnapshot.assignments.length > 0
            ) {
                record.beforeSnapshot.assignments.forEach((assignment) => {
                    if (!assignment.sttList || !assignment.sttList.length) return;

                    const productInfo = {
                        productCode: assignment.productCode || '',
                        productId: assignment.productId || '',
                        productName: assignment.productName || '',
                        productImage: assignment.productImage || '',
                    };

                    assignment.sttList.forEach((sttItem) => {
                        const sttStr = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);

                        if (!sttProductMap.has(sttStr)) {
                            sttProductMap.set(sttStr, { products: new Map(), uploads: [] });
                        }

                        const sttData = sttProductMap.get(sttStr);
                        const productKey =
                            productInfo.productCode ||
                            productInfo.productId ||
                            productInfo.productName;
                        if (productKey && !sttData.products.has(productKey)) {
                            sttData.products.set(productKey, productInfo);
                        }
                        if (!sttData.uploads.find((u) => u.uploadId === record.uploadId)) {
                            sttData.uploads.push(uploadInfo);
                        }
                    });
                });
            } else if (record.uploadedSTTs && record.uploadedSTTs.length > 0) {
                record.uploadedSTTs.forEach((stt) => {
                    const sttStr = String(stt);
                    if (!sttProductMap.has(sttStr)) {
                        sttProductMap.set(sttStr, { products: new Map(), uploads: [] });
                    }
                    const sttData = sttProductMap.get(sttStr);
                    if (!sttData.uploads.find((u) => u.uploadId === record.uploadId)) {
                        sttData.uploads.push(uploadInfo);
                    }
                });
            }
        });

        let filteredSTTs = Array.from(sttProductMap.entries());
        if (searchSTT) {
            filteredSTTs = filteredSTTs.filter(([stt]) => stt.includes(searchSTT));
        }
        if (searchProduct) {
            const searchLower = searchProduct.toLowerCase();
            filteredSTTs = filteredSTTs.filter(([stt, data]) => {
                return Array.from(data.products.values()).some((product) => {
                    return (
                        product.productCode.toLowerCase().includes(searchLower) ||
                        product.productId.toLowerCase().includes(searchLower) ||
                        product.productName.toLowerCase().includes(searchLower)
                    );
                });
            });
        }

        filteredSTTs.sort((a, b) => {
            const numA = parseInt(a[0], 10);
            const numB = parseInt(b[0], 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a[0].localeCompare(b[0]);
        });

        if (filteredSTTs.length === 0) {
            container.innerHTML = `<div class="history-empty-state"><i class="fas fa-inbox"></i><p>Không tìm thấy STT nào trong khoảng thời gian đã chọn</p></div>`;
            document.getElementById('historyV2Pagination').innerHTML = '';
            return;
        }

        const formatDateTime = (dateTimeStr) => {
            if (!dateTimeStr) return '';
            return new Date(dateTimeStr).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        };

        let dateRangeText = '';
        if (dateFrom && dateTo)
            dateRangeText = `Từ ${formatDateTime(dateFrom)} đến ${formatDateTime(dateTo)}`;
        else if (dateFrom) dateRangeText = `Từ ${formatDateTime(dateFrom)}`;
        else if (dateTo) dateRangeText = `Đến ${formatDateTime(dateTo)}`;
        else dateRangeText = 'Tất cả thời gian';

        let html = `<div class="stt-group-header mb-3"><div class="d-flex justify-content-between align-items-center"><div><h6 class="mb-1"><i class="fas fa-layer-group"></i> Danh sách STT và Sản phẩm</h6><small class="text-muted">${dateRangeText} • ${filteredSTTs.length} STT</small></div></div></div><div class="stt-group-list">`;

        filteredSTTs.forEach(([stt, data]) => {
            const products = Array.from(data.products.values());
            const uploadsCount = data.uploads.length;

            html += `<div class="stt-group-card"><div class="stt-group-card-header"><span class="stt-group-number"><i class="fas fa-hashtag"></i> STT ${stt}</span><div>${products.length > 0 ? `<span class="badge bg-success">${products.length} sản phẩm</span>` : ''}<span class="badge bg-info ms-1">${uploadsCount} lần upload</span></div></div><div class="stt-group-products">`;

            if (products.length > 0) {
                products.forEach((product) => {
                    const rawImg = product.productImage || '';
                    const imgSrc =
                        rawImg && window.TPOSImageProxy
                            ? window.TPOSImageProxy.proxyImageUrl(rawImg)
                            : rawImg;
                    const hasImage = imgSrc && imgSrc.length > 0;
                    html += `<div class="stt-product-item"><div class="stt-product-image ${hasImage ? '' : 'no-image'}">${hasImage ? `<img src="${imgSrc}" alt="${product.productName}" />` : '<i class="fas fa-box"></i>'}</div><div class="stt-product-info"><div class="stt-product-code">${product.productCode || product.productId || 'N/A'}</div><div class="stt-product-name">${product.productName || ''}</div></div></div>`;
                });
            } else {
                html += `<div class="stt-no-products"><i class="fas fa-info-circle text-muted"></i><span class="text-muted">Không có thông tin sản phẩm chi tiết</span></div>`;
            }

            html += '</div></div>';
        });

        html += '</div>';
        container.innerHTML = html;
        document.getElementById('historyV2Pagination').innerHTML = '';
    }

    // =====================================================
    // VIEW DETAIL V2
    // =====================================================

    window.viewUploadHistoryDetailV2 = async function (firebaseKey, userId) {
        userId = userId || '';
        console.log('[HISTORY-V2] Viewing detail for firebaseKey:', firebaseKey, 'userId:', userId);

        try {
            const detailModal = new bootstrap.Modal(
                document.getElementById('uploadHistoryV2DetailModal')
            );
            detailModal.show();

            const titleEl = document.getElementById('historyV2DetailModalTitle');
            const bodyEl = document.getElementById('historyV2DetailModalBody');

            titleEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
            bodyEl.innerHTML = `<div class="history-loading"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="text-muted mt-3">Đang tải chi tiết upload...</p></div>`;

            const effectiveUserId = userId && userId !== '' ? userId : 'guest';
            let historyPath = `productAssignments_v2_history/${effectiveUserId}`;

            let snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
            let record = snapshot.val();

            if (!record && effectiveUserId !== 'guest') {
                historyPath = 'productAssignments_v2_history/guest';
                snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
                record = snapshot.val();
            }

            if (!record) {
                const currentUserPath = getUserFirebasePathV2('productAssignments_v2_history');
                if (currentUserPath !== historyPath) {
                    snapshot = await database
                        .ref(`${currentUserPath}/${firebaseKey}`)
                        .once('value');
                    record = snapshot.val();
                }
            }

            if (!record) {
                throw new Error(
                    `Không tìm thấy record (key: ${firebaseKey.slice(-8)}, user: ${effectiveUserId})`
                );
            }

            const shortId = firebaseKey.slice(-8);
            titleEl.innerHTML = `<i class="fas fa-info-circle"></i> Chi Tiết Upload #${shortId}`;
            bodyEl.innerHTML = renderUploadHistoryDetailV2(record);
        } catch (error) {
            console.error('[HISTORY-V2] Error viewing detail:', error);
            ui.showNotification('Lỗi khi tải chi tiết upload', 'error');

            const bodyEl = document.getElementById('historyV2DetailModalBody');
            bodyEl.innerHTML = `<div class="alert alert-danger" role="alert"><i class="fas fa-exclamation-triangle"></i><strong>Lỗi:</strong> ${error.message}<hr><small class="text-muted">Có thể record này đã bị xóa hoặc được lưu với user khác.<br>Thử chọn "Tất cả người dùng" trong bộ lọc và tìm lại.</small></div>`;
        }
    };

    function renderUploadHistoryDetailV2(record) {
        const statusConfig = {
            completed: { icon: '✅', text: 'Thành công hoàn toàn', class: 'success' },
            partial: { icon: '⚠️', text: 'Thành công một phần', class: 'warning' },
            failed: { icon: '❌', text: 'Thất bại hoàn toàn', class: 'danger' },
            deletion_failed: { icon: '⚠️', text: 'Upload OK - Không xóa được', class: 'warning' },
        };

        const config = statusConfig[record.uploadStatus] || {
            icon: '❓',
            text: 'Unknown',
            class: 'secondary',
        };
        const date = new Date(record.timestamp).toLocaleString('vi-VN');
        let totalAssignmentsCalc = record.totalAssignments || record.totalSTTs || 0;

        // Stash record on the modal node so the recon button có thể đọc nguyên liệu
        // mà không cần re-fetch Firebase. Cleared khi modal close (handled by Bootstrap).
        const _modalBody = document.getElementById('historyV2DetailModalBody');
        if (_modalBody) _modalBody.__record = record;

        let html = `<div class="history-detail-info mb-4"><div class="row"><div class="col-md-6"><span class="history-detail-label">Upload ID:</span><span class="history-detail-value">${record.uploadId}</span></div><div class="col-md-6"><span class="history-detail-label">Thời gian:</span><span class="history-detail-value">${date}</span></div></div><div class="row"><div class="col-md-6"><span class="history-detail-label">Trạng thái:</span><span class="history-detail-value"><span class="badge bg-${config.class}">${config.icon} ${config.text}</span></span></div><div class="col-md-6"><span class="history-detail-label">Tổng STT:</span><span class="history-detail-value"><strong>${totalAssignmentsCalc}</strong> (✅ ${record.successCount || 0} | ❌ ${record.failCount || 0})</span></div></div></div>`;

        // Reconciliation panel — học cách lấy Excel theo campaignId từ KPI tab
        // (POST /api/SaleOnline_Order/ExportFile?campaignId=N) rồi đối soát từng
        // STT × productCode để soi sản phẩm bị TPOS silent-drop sau khi upload.
        // Records cũ (trước fix post-PUT verify 2026-05-08) hay bị: claim
        // `success:true` nhưng TPOS thực tế không có sản phẩm.
        html += `<div class="d-flex justify-content-between align-items-center mb-3" style="gap: 8px;">
            <h6 class="mb-0"><i class="fas fa-balance-scale"></i> Đối soát với TPOS</h6>
            <button class="btn btn-sm btn-warning" onclick="reconcileUploadWithTPOSV2()" id="reconcileTposBtn">
                <i class="fas fa-cloud-download-alt"></i> Tải Excel TPOS &amp; đối soát
            </button>
        </div>
        <div id="tab3ReconcileResults" class="mb-4" style="font-size: 13px;"></div>`;

        const productsByCode = {};
        if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
            record.beforeSnapshot.assignments.forEach((assignment) => {
                if (assignment.sttList && Array.isArray(assignment.sttList)) {
                    assignment.sttList.forEach((sttItem) => {
                        const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                        const productKey = assignment.productCode || assignment.productId;
                        if (!productsByCode[productKey]) {
                            productsByCode[productKey] = {
                                productId: assignment.productId,
                                productCode: assignment.productCode,
                                productName: assignment.productName,
                                imageUrl: assignment.imageUrl,
                                note: assignment.note || '',
                                count: 0,
                                sttList: [],
                            };
                        }
                        productsByCode[productKey].count++;
                        productsByCode[productKey].sttList.push(stt);
                    });
                }
            });
        }

        html += '<h6 class="mb-3"><i class="fas fa-box"></i> Sản phẩm đã upload</h6>';

        // Build per-STT outcome map từ uploadResults để màu hóa từng STT trong
        // bảng "Sản phẩm đã upload". Dữ liệu QUEUED không bằng dữ liệu PERSISTED:
        // có lúc PUT trả 200 nhưng TPOS silent drop sản phẩm (bug đã gặp 2026-05).
        // Hiển thị badge ❌ kèm tooltip lỗi cho mỗi STT bị drop để soi nhanh.
        const sttOutcome = new Map();
        (record.uploadResults || []).forEach((r) => {
            const stt = String(r.stt);
            const missingByPid = new Set((r.missingProducts || []).map((m) => String(m.productId)));
            const missingByCode = new Set(
                (r.missingProducts || []).map((m) => (m.productCode || '').toUpperCase())
            );
            sttOutcome.set(stt, {
                success: !!r.success,
                error: r.error || '',
                missingByPid,
                missingByCode,
            });
        });

        const renderSttBadge = (stt, product) => {
            const sttStr = String(stt);
            const out = sttOutcome.get(sttStr);
            const productKey = String(product.productId || '');
            const productCode = (product.productCode || '').toUpperCase();
            if (!out) {
                return `<span class="badge bg-light text-dark" style="margin: 1px;">${sttStr}</span>`;
            }
            const productMissing =
                (productKey && out.missingByPid.has(productKey)) ||
                (productCode && out.missingByCode.has(productCode));
            if (!out.success || productMissing) {
                const titleAttr = utils.escapeHtml(out.error || 'TPOS không lưu sản phẩm');
                return `<span class="badge bg-danger" style="margin: 1px;" title="${titleAttr}">❌ ${sttStr}</span>`;
            }
            return `<span class="badge bg-success" style="margin: 1px;">✓ ${sttStr}</span>`;
        };

        if (Object.keys(productsByCode).length === 0) {
            html += `<div class="alert alert-warning" role="alert"><i class="fas fa-exclamation-triangle"></i> Không có dữ liệu products trong beforeSnapshot</div>`;
        } else {
            html += `<div class="card mb-3 border-primary"><div class="card-body"><table class="table table-sm table-bordered"><thead class="table-light"><tr><th style="width: 50%;">Sản phẩm</th><th class="text-center" style="width: 15%;">Số lượng</th><th class="text-center" style="width: 20%;">Mã đơn hàng</th><th style="width: 15%;">Note</th></tr></thead><tbody>${Object.values(
                productsByCode
            )
                .map(
                    (product) =>
                        `<tr><td><div class="d-flex align-items-center gap-2">${product.imageUrl ? `<img src="${window.TPOSImageProxy ? window.TPOSImageProxy.proxyImageUrl(product.imageUrl) : product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}<div style="flex: 1;"><div style="font-weight: 600; font-size: 14px;">${product.productName}</div><div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div></div></div></td><td class="text-center"><span class="badge bg-primary">${product.count}</span></td><td class="text-center small" style="line-height: 1.8;">${product.sttList.map((stt) => renderSttBadge(stt, product)).join(' ')}</td><td class="small">${product.note}</td></tr>`
                )
                .join('')}</tbody></table></div></div>`;
        }

        const failedResults = (record.uploadResults || []).filter((r) => !r.success && r.error);
        if (failedResults.length > 0) {
            html += `<h6 class="mb-3 mt-4 text-danger"><i class="fas fa-exclamation-triangle"></i> Chi tiết lỗi (${failedResults.length} STT thất bại)</h6><div class="card mb-3 border-danger"><div class="card-body p-0"><table class="table table-sm table-bordered mb-0"><thead class="table-danger"><tr><th style="width: 15%;">STT</th><th style="width: 15%;">Mã đơn hàng</th><th style="width: 70%;">Lỗi từ TPOS</th></tr></thead><tbody>${failedResults.map((result) => `<tr><td><span class="badge bg-secondary">${result.stt}</span></td><td>${result.orderId || 'N/A'}</td><td class="text-danger small"><i class="fas fa-times-circle"></i> <code style="word-break: break-all; white-space: pre-wrap;">${utils.escapeHtml(result.error || 'Unknown error')}</code></td></tr>`).join('')}</tbody></table></div></div>`;
        }

        if (record.note) {
            html += `<div class="history-note mt-3"><i class="fas fa-sticky-note"></i><strong>Ghi chú:</strong> ${record.note}</div>`;
        }

        return html;
    }

    // =====================================================
    // RECONCILE UPLOAD WITH TPOS EXCEL
    // =====================================================
    // Học pattern KPI tab: `POST /api/SaleOnline_Order/ExportFile?campaignId=N`
    // trả XLSX, mỗi row = 1 SaleOnline_Order với cột "Sản phẩm" gồm các sản phẩm
    // hiện diện thật trên TPOS. Đối soát danh sách này với upload's beforeSnapshot
    // để biết product nào claim đã upload nhưng TPOS không lưu (silent drop).

    async function _ensureXLSX() {
        if (typeof XLSX !== 'undefined') return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function _getAuthHeaderForRecon() {
        const tm = window.tokenManager || window.parent?.tokenManager;
        if (tm?.getAuthHeader) return await tm.getAuthHeader();
        throw new Error('tokenManager không khả dụng — vui lòng reload trang');
    }

    function _getWorkerUrl() {
        return (
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    // Resolve campaign name → TPOS campaignId qua OData. Cache theo phiên modal.
    const _campaignIdCache = new Map();
    async function _resolveCampaignId(campaignName) {
        if (!campaignName) return null;
        if (_campaignIdCache.has(campaignName)) return _campaignIdCache.get(campaignName);

        const headers = await _getAuthHeaderForRecon();
        const WORKER = _getWorkerUrl();
        const enc = encodeURIComponent(campaignName);
        // Dùng eq trước (chính xác). Nếu không tìm thấy, fallback contains.
        const tryUrl = (filter) =>
            `${WORKER}/api/odata/SaleOnline_LiveCampaign?$top=10&$orderby=DateCreated+desc&$filter=${filter}`;
        try {
            let res = await fetch(tryUrl(`Name+eq+'${enc}'`), {
                headers: { ...headers, Accept: 'application/json' },
            });
            let data = res.ok ? await res.json() : { value: [] };
            let hit = (data.value || [])[0];
            if (!hit) {
                res = await fetch(tryUrl(`contains(Name%2C'${enc}')`), {
                    headers: { ...headers, Accept: 'application/json' },
                });
                data = res.ok ? await res.json() : { value: [] };
                hit = (data.value || [])[0];
            }
            const id = hit?.Id || null;
            _campaignIdCache.set(campaignName, id);
            return id;
        } catch (e) {
            console.warn('[RECON-V2] resolveCampaignId failed:', campaignName, e);
            _campaignIdCache.set(campaignName, null);
            return null;
        }
    }

    // Fetch + parse 1 campaign Excel → Map<sttString, Set<productCodeUpper>>
    async function _fetchCampaignExcel(campaignId) {
        const headers = await _getAuthHeaderForRecon();
        const WORKER = _getWorkerUrl();
        const url = `${WORKER}/api/SaleOnline_Order/ExportFile?campaignId=${campaignId}&sort=date`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: '*/*' },
            body: JSON.stringify({ data: '{}' }),
        });
        if (!res.ok) throw new Error(`ExportFile HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // Skip 2 title rows (giống overview-fetch.js).
        const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const sttToCodes = new Map();
        // Cột STT thực = SessionIndex của order. TPOS Excel header là `###`
        // (cột thứ 2). Cột "STT" (cột 1) chỉ là row counter 1..N — KHÔNG phải
        // SessionIndex; trước đây dùng nhầm cột này → 0 khớp khi đối soát.
        const sampleKeys = rows.length ? Object.keys(rows[0]) : [];
        const sttKey =
            sampleKeys.find((k) => k === '###') ||
            sampleKeys.find((k) => /Số\s*thứ\s*tự|SessionIndex/i.test(k)) ||
            // Fallback: nếu TPOS đổi format, ưu tiên cột thứ 2 (vị trí ###).
            sampleKeys[1] ||
            sampleKeys[0];
        const productKey =
            sampleKeys.find((k) => /sản\s*phẩm/i.test(k)) ||
            sampleKeys.find((k) => /Product/i.test(k)) ||
            'Sản phẩm';
        for (const row of rows) {
            const sttVal = row[sttKey];
            if (sttVal == null) continue;
            const sttStr = String(sttVal).trim();
            if (!sttStr) continue;
            const productsStr = String(row[productKey] || '');
            const codes = new Set();
            // Parse "[CODE] Name SL: 1 Giá: 230.000" — có thể nhiều dòng.
            for (const line of productsStr.split(/[\n\r]+/)) {
                const m = line.match(/\[([^\]]+)\]/);
                if (m && m[1]) codes.add(m[1].trim().toUpperCase());
            }
            // Merge nếu STT trùng (TPOS hiếm khi nhưng phòng case ghép đơn).
            if (sttToCodes.has(sttStr)) {
                for (const c of codes) sttToCodes.get(sttStr).add(c);
            } else {
                sttToCodes.set(sttStr, codes);
            }
        }
        return sttToCodes;
    }

    function _setReconStatus(html) {
        const el = document.getElementById('tab3ReconcileResults');
        if (el) el.innerHTML = html;
    }

    function _renderReconcileResults(record, sttToCodes, sttUnresolved, sttResolvedCampaign) {
        const productExpectations = []; // [{productCode, productId, productName, stt}]
        (record.beforeSnapshot?.assignments || []).forEach((a) => {
            const code = (a.productCode || '').toUpperCase();
            (a.sttList || []).forEach((sttItem) => {
                const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                productExpectations.push({
                    stt,
                    productCode: code || '(no code)',
                    productName: a.productName || '',
                    productId: a.productId,
                });
            });
        });

        let okCount = 0;
        let droppedCount = 0;
        let unresolvedCount = 0;
        const dropped = []; // { stt, productCode, productName }
        const unresolved = []; // { stt, productCode, reason }
        for (const exp of productExpectations) {
            if (sttUnresolved.has(exp.stt)) {
                unresolvedCount++;
                unresolved.push({
                    stt: exp.stt,
                    productCode: exp.productCode,
                    reason: 'campaign không resolve được trên TPOS',
                });
                continue;
            }
            const tposCodes = sttToCodes.get(exp.stt);
            if (!tposCodes) {
                unresolvedCount++;
                unresolved.push({
                    stt: exp.stt,
                    productCode: exp.productCode,
                    reason: 'STT không có trong Excel campaign',
                });
                continue;
            }
            if (tposCodes.has(exp.productCode)) {
                okCount++;
            } else {
                droppedCount++;
                dropped.push(exp);
            }
        }

        const total = productExpectations.length;
        let html = `<div class="alert alert-${droppedCount > 0 ? 'danger' : 'success'} mb-3">`;
        html += `<i class="fas fa-${droppedCount > 0 ? 'exclamation-triangle' : 'check-circle'}"></i> `;
        html += `<strong>Đối soát ${total} bản ghi (STT × sản phẩm):</strong> `;
        html += `<span class="text-success">✅ ${okCount} khớp</span> · `;
        html += `<span class="text-danger">❌ ${droppedCount} TPOS không có</span>`;
        if (unresolvedCount > 0) {
            html += ` · <span class="text-warning">⚠ ${unresolvedCount} không kiểm được</span>`;
        }
        html += `</div>`;

        if (sttResolvedCampaign.size > 0) {
            const items = [...sttResolvedCampaign.entries()]
                .map(
                    ([name, id]) =>
                        `<code>${utils.escapeHtml(name)}</code> → id <strong>${id}</strong>`
                )
                .join(', ');
            html += `<div class="mb-2 small text-muted">Campaign đã resolve: ${items}</div>`;
        }

        if (dropped.length > 0) {
            // Group by productCode
            const byProduct = new Map();
            for (const d of dropped) {
                if (!byProduct.has(d.productCode)) {
                    byProduct.set(d.productCode, { productName: d.productName, stts: [] });
                }
                byProduct.get(d.productCode).stts.push(d.stt);
            }
            html += `<div class="card border-danger mb-3"><div class="card-body p-0">
                <table class="table table-sm table-bordered mb-0">
                    <thead class="table-danger"><tr>
                        <th style="width: 30%;">Sản phẩm</th>
                        <th style="width: 10%;" class="text-center">SL STT rớt</th>
                        <th style="width: 60%;">Các STT không có sản phẩm trên TPOS</th>
                    </tr></thead><tbody>${[...byProduct.entries()]
                        .map(
                            ([code, info]) =>
                                `<tr>
                                <td><strong>${utils.escapeHtml(code)}</strong><div class="small text-muted">${utils.escapeHtml(info.productName)}</div></td>
                                <td class="text-center"><span class="badge bg-danger">${info.stts.length}</span></td>
                                <td class="small">${info.stts.map((s) => `<span class="badge bg-danger" style="margin: 1px;">❌ ${utils.escapeHtml(s)}</span>`).join(' ')}</td>
                            </tr>`
                        )
                        .join('')}</tbody></table></div></div>`;
        }

        if (unresolved.length > 0) {
            const sample = unresolved.slice(0, 30);
            const more = unresolved.length > 30 ? ` (+${unresolved.length - 30} dòng nữa)` : '';
            html += `<details class="mb-3"><summary class="text-warning small">⚠ ${unresolved.length} bản ghi không kiểm được${more}</summary>
                <ul class="small mt-2">${sample
                    .map(
                        (u) =>
                            `<li>STT ${utils.escapeHtml(u.stt)} · ${utils.escapeHtml(u.productCode)} — ${utils.escapeHtml(u.reason)}</li>`
                    )
                    .join('')}</ul></details>`;
        }

        _setReconStatus(html);
    }

    window.reconcileUploadWithTPOSV2 = async function () {
        const btn = document.getElementById('reconcileTposBtn');
        const _modalBody = document.getElementById('historyV2DetailModalBody');
        const record = _modalBody && _modalBody.__record;
        if (!record) {
            _setReconStatus(
                `<div class="alert alert-danger">Không tìm thấy record để đối soát. Đóng modal và mở lại.</div>`
            );
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đối soát…';
        }
        try {
            await _ensureXLSX();
            _setReconStatus(
                `<div class="text-muted small"><i class="fas fa-spinner fa-spin"></i> Đang resolve campaign…</div>`
            );

            // Group STTs theo campaignName từ orderInfo trong beforeSnapshot.
            const campaignToSTTs = new Map(); // campaignName → Set<sttStr>
            const sttToCampaign = new Map(); // sttStr → campaignName
            (record.beforeSnapshot?.assignments || []).forEach((a) => {
                (a.sttList || []).forEach((sttItem) => {
                    if (!sttItem || typeof sttItem !== 'object') return;
                    const stt = String(sttItem.stt);
                    const cname =
                        sttItem.orderInfo?.liveCampaignName ||
                        sttItem.orderInfo?.LiveCampaignName ||
                        '';
                    if (!cname) return;
                    if (!campaignToSTTs.has(cname)) campaignToSTTs.set(cname, new Set());
                    campaignToSTTs.get(cname).add(stt);
                    sttToCampaign.set(stt, cname);
                });
            });

            if (campaignToSTTs.size === 0) {
                _setReconStatus(
                    `<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy <code>liveCampaignName</code> nào trong <code>beforeSnapshot.assignments[].sttList[].orderInfo</code>. Có thể đây là upload cũ không lưu thông tin campaign — không thể đối soát qua Excel TPOS.</div>`
                );
                return;
            }

            // Resolve mỗi campaignName → campaignId (parallel).
            _setReconStatus(
                `<div class="text-muted small"><i class="fas fa-spinner fa-spin"></i> Đang resolve ${campaignToSTTs.size} campaign…</div>`
            );
            const resolvedCampaign = new Map(); // campaignName → campaignId
            await Promise.all(
                [...campaignToSTTs.keys()].map(async (cname) => {
                    const id = await _resolveCampaignId(cname);
                    if (id) resolvedCampaign.set(cname, id);
                })
            );

            // Tập STTs có campaign không resolve được — sẽ marked unresolved.
            const sttUnresolved = new Set();
            for (const [cname, ssts] of campaignToSTTs.entries()) {
                if (!resolvedCampaign.has(cname)) ssts.forEach((s) => sttUnresolved.add(s));
            }

            if (resolvedCampaign.size === 0) {
                _setReconStatus(
                    `<div class="alert alert-danger"><i class="fas fa-times-circle"></i> Không resolve được campaign nào trên TPOS (${[...campaignToSTTs.keys()].map((n) => `<code>${utils.escapeHtml(n)}</code>`).join(', ')}). Có thể campaign đã đổi tên hoặc xóa.</div>`
                );
                return;
            }

            // Fetch Excel parallel cho mỗi campaign đã resolve.
            _setReconStatus(
                `<div class="text-muted small"><i class="fas fa-spinner fa-spin"></i> Đang tải ${resolvedCampaign.size} Excel TPOS…</div>`
            );
            const sttToCodes = new Map(); // tổng hợp tất cả campaign
            const errors = [];
            await Promise.all(
                [...resolvedCampaign.entries()].map(async ([cname, cid]) => {
                    try {
                        const map = await _fetchCampaignExcel(cid);
                        for (const [stt, codes] of map.entries()) {
                            // Chỉ giữ STTs thuộc campaign này (theo grouping).
                            const wantedSet = campaignToSTTs.get(cname);
                            if (wantedSet && !wantedSet.has(stt)) continue;
                            if (sttToCodes.has(stt)) {
                                for (const c of codes) sttToCodes.get(stt).add(c);
                            } else {
                                sttToCodes.set(stt, new Set(codes));
                            }
                        }
                    } catch (e) {
                        errors.push(`${cname}: ${e.message || e}`);
                        // Mark all STTs in this campaign unresolved.
                        const wantedSet = campaignToSTTs.get(cname);
                        if (wantedSet) wantedSet.forEach((s) => sttUnresolved.add(s));
                    }
                })
            );

            _renderReconcileResults(record, sttToCodes, sttUnresolved, resolvedCampaign);

            if (errors.length) {
                const el = document.getElementById('tab3ReconcileResults');
                if (el) {
                    el.insertAdjacentHTML(
                        'beforeend',
                        `<div class="alert alert-warning small mt-2"><strong>Lỗi tải Excel:</strong> ${errors.map(utils.escapeHtml).join('; ')}</div>`
                    );
                }
            }
        } catch (e) {
            console.error('[RECON-V2] Reconcile failed:', e);
            _setReconStatus(
                `<div class="alert alert-danger"><i class="fas fa-times-circle"></i> Lỗi đối soát: ${utils.escapeHtml(e.message || String(e))}</div>`
            );
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML =
                    '<i class="fas fa-cloud-download-alt"></i> Tải Excel TPOS &amp; đối soát';
            }
        }
    };

    // =====================================================
    // COMPARE CART HISTORY V2
    // =====================================================

    window.compareCartHistoryV2 = async function (firebaseKey, userId) {
        userId = userId || '';
        console.log(
            '[HISTORY-V2-COMPARE] Comparing cart for firebaseKey:',
            firebaseKey,
            'userId:',
            userId
        );

        try {
            const compareModal = new bootstrap.Modal(
                document.getElementById('compareCartHistoryV2Modal')
            );
            compareModal.show();

            const modalBody = document.getElementById('compareCartHistoryV2ModalBody');
            modalBody.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="text-muted mt-2">Đang tải dữ liệu so sánh...</p></div>`;

            const effectiveUserId = userId && userId !== '' ? userId : 'guest';
            let historyPath = `productAssignments_v2_history/${effectiveUserId}`;

            let snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
            let record = snapshot.val();

            if (!record && effectiveUserId !== 'guest') {
                historyPath = 'productAssignments_v2_history/guest';
                snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
                record = snapshot.val();
            }

            if (!record) {
                const currentUserPath = getUserFirebasePathV2('productAssignments_v2_history');
                if (currentUserPath !== historyPath) {
                    snapshot = await database
                        .ref(`${currentUserPath}/${firebaseKey}`)
                        .once('value');
                    record = snapshot.val();
                }
            }

            if (!record || !record.beforeSnapshot) {
                throw new Error(
                    `Không tìm thấy dữ liệu snapshot (key: ${firebaseKey.slice(-8)}, user: ${effectiveUserId})`
                );
            }

            modalBody.innerHTML = window._tab3.fn.renderComparisonContent(record);
        } catch (error) {
            console.error('[HISTORY-V2-COMPARE] Error:', error);
            ui.showNotification('Lỗi khi tải dữ liệu so sánh', 'error');

            const modalBody = document.getElementById('compareCartHistoryV2ModalBody');
            modalBody.innerHTML = `<div class="alert alert-danger" role="alert"><i class="fas fa-exclamation-triangle"></i><strong>Lỗi:</strong> ${error.message}<hr><small class="text-muted">Có thể record này đã bị xóa hoặc không có snapshot.<br>Thử chọn "Tất cả người dùng" trong bộ lọc và tìm lại.</small></div>`;
        }
    };

    // =====================================================
    // SAVE TO UPLOAD HISTORY V2
    // =====================================================

    async function saveToUploadHistoryV2(uploadId, results, status) {
        let historyRecord = null;

        try {
            console.log('[HISTORY-V2-SAVE] Saving to V2 database...');

            const currentUserId =
                window.userStorageManager &&
                typeof window.userStorageManager.getUserIdentifier === 'function'
                    ? window.userStorageManager.getUserIdentifier()
                    : 'guest';

            const beforeSnapshot = {
                assignments: JSON.parse(JSON.stringify(state.assignments)),
                _timestamp: Date.now(),
                _version: 1,
            };

            let totalAssignments = 0;
            let successfulAssignments = 0;
            let failedAssignments = 0;

            const uploadedSTTsSet = new Set(results.map((r) => r.stt));
            const successfulSTTsSet = new Set(results.filter((r) => r.success).map((r) => r.stt));
            const failedSTTsSet = new Set(results.filter((r) => !r.success).map((r) => r.stt));

            if (beforeSnapshot && beforeSnapshot.assignments) {
                beforeSnapshot.assignments.forEach((assignment) => {
                    if (assignment.sttList && Array.isArray(assignment.sttList)) {
                        assignment.sttList.forEach((sttItem) => {
                            const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                            if (uploadedSTTsSet.has(stt)) {
                                totalAssignments++;
                                if (successfulSTTsSet.has(stt)) successfulAssignments++;
                                else if (failedSTTsSet.has(stt)) failedAssignments++;
                            }
                        });
                    }
                });
            }

            historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),
                userId: currentUserId,
                beforeSnapshot: {
                    assignments: beforeSnapshot.assignments || [],
                    _timestamp: beforeSnapshot._timestamp,
                    _version: beforeSnapshot._version,
                },
                afterSnapshot: null,
                uploadedSTTs: results.map((r) => r.stt),
                uploadResults: results.map((r) => ({
                    stt: r.stt,
                    orderId: r.orderId,
                    success: r.success,
                    error: r.error || null,
                    existingProducts: r.existingProducts || [],
                })),
                totalSTTs: results.length,
                totalAssignments: totalAssignments,
                successCount: successfulAssignments,
                failCount: failedAssignments,
                uploadStatus: status,
                canRestore: false,
                restoredAt: status === 'failed' ? Date.now() : null,
                committedAt: null,
                note: '',
            };

            const historyPath = getUserFirebasePathV2('productAssignments_v2_history');
            await database.ref(`${historyPath}/${uploadId}`).set(historyRecord);
            console.log('[HISTORY-V2-SAVE] Saved to V2 database:', uploadId);

            if (window.indexedDBStorage) {
                try {
                    await window.indexedDBStorage.removeItem(`pending_history_v2_${uploadId}`);
                } catch (e) {
                    /* ignore */
                }
            }

            return true;
        } catch (error) {
            console.error('[HISTORY-V2-SAVE] Error saving V2 history:', error);

            try {
                if (window.indexedDBStorage && historyRecord) {
                    historyRecord.saveError = {
                        message: error.message,
                        timestamp: Date.now(),
                        code: error.code || 'UNKNOWN',
                    };
                    const pendingRecord = {
                        uploadId: uploadId,
                        historyRecord: historyRecord,
                        error: error.message,
                        failedAt: Date.now(),
                        retryCount: 0,
                    };
                    await window.indexedDBStorage.setItem(
                        `pending_history_v2_${uploadId}`,
                        pendingRecord
                    );
                    console.log('[HISTORY-V2-SAVE] Saved to IndexedDB for later retry:', uploadId);
                    ui.showNotification(
                        'Lịch sử upload đã được lưu tạm. Sẽ đồng bộ lên server sau.',
                        'warning'
                    );
                } else {
                    ui.showNotification(
                        'Không thể lưu lịch sử upload. Vui lòng kiểm tra kết nối mạng.',
                        'error'
                    );
                }
            } catch (fallbackError) {
                console.error(
                    '[HISTORY-V2-SAVE] Fallback to IndexedDB also failed:',
                    fallbackError
                );
                ui.showNotification(
                    'Không thể lưu lịch sử upload. Vui lòng kiểm tra kết nối mạng.',
                    'error'
                );
            }

            return false;
        }
    }

    // =====================================================
    // SYNC PENDING HISTORY V2
    // =====================================================

    async function syncPendingHistoryV2() {
        if (!window.indexedDBStorage) {
            return { synced: 0, failed: 0, pending: 0 };
        }

        try {
            const allKeys = await window.indexedDBStorage.getKeys('pending_history_v2_*');
            if (!allKeys || allKeys.length === 0) {
                return { synced: 0, failed: 0, pending: 0 };
            }

            console.log(`[HISTORY-V2-SYNC] Found ${allKeys.length} pending records`);

            let synced = 0;
            let failed = 0;

            for (const key of allKeys) {
                try {
                    const pendingRecord = await window.indexedDBStorage.getItem(key);
                    if (!pendingRecord || !pendingRecord.historyRecord) {
                        await window.indexedDBStorage.removeItem(key);
                        continue;
                    }

                    const { uploadId, historyRecord } = pendingRecord;
                    const historyPath = getUserFirebasePathV2('productAssignments_v2_history');

                    await database.ref(`${historyPath}/${uploadId}`).set(historyRecord);
                    await window.indexedDBStorage.removeItem(key);
                    synced++;
                    console.log(`[HISTORY-V2-SYNC] Synced: ${uploadId}`);
                } catch (syncError) {
                    console.error(`[HISTORY-V2-SYNC] Failed to sync ${key}:`, syncError);

                    try {
                        const pendingRecord = await window.indexedDBStorage.getItem(key);
                        if (pendingRecord) {
                            pendingRecord.retryCount = (pendingRecord.retryCount || 0) + 1;
                            pendingRecord.lastRetryAt = Date.now();
                            pendingRecord.lastError = syncError.message;
                            await window.indexedDBStorage.setItem(key, pendingRecord);
                        }
                    } catch (e) {
                        /* ignore */
                    }

                    failed++;
                }
            }

            const remaining = allKeys.length - synced;
            console.log(
                `[HISTORY-V2-SYNC] Result: ${synced} synced, ${failed} failed, ${remaining} remaining`
            );

            if (synced > 0) {
                ui.showNotification(`Đã đồng bộ ${synced} lịch sử upload lên server`, 'success');
            }

            return { synced, failed, pending: remaining };
        } catch (error) {
            console.error('[HISTORY-V2-SYNC] Error during sync:', error);
            return { synced: 0, failed: 0, pending: -1 };
        }
    }

    async function getPendingHistoryCount() {
        if (!window.indexedDBStorage) return 0;
        try {
            const keys = await window.indexedDBStorage.getKeys('pending_history_v2_*');
            return keys ? keys.length : 0;
        } catch (e) {
            return 0;
        }
    }

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window.syncPendingHistoryV2 = syncPendingHistoryV2;
    window.getPendingHistoryCount = getPendingHistoryCount;
    window._tab3.fn.saveToUploadHistoryV2 = saveToUploadHistoryV2;
})();
