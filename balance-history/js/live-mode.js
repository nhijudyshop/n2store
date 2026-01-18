// =====================================================
// LIVE MODE - JAVASCRIPT MODULE
// UI tối ưu cho nhân viên xử lý cọc trong phiên live
// =====================================================

/**
 * LiveModeModule - Module quản lý Live Mode UI
 * - Zone "NHẬP TAY": Giao dịch cần match thủ công (has_pending_match hoặc chưa có phone)
 * - Zone "TỰ ĐỘNG GÁN": Giao dịch đã auto-match, có phone
 * - Zone "ĐÃ XÁC NHẬN": Giao dịch đã được hide (is_hidden = true)
 */
const LiveModeModule = (() => {
    'use strict';

    // ===== STATE =====
    const state = {
        manualMatchItems: [],      // Zone "NHẬP TAY" - cần action từ user
        autoMatchedItems: [],      // Zone "TỰ ĐỘNG GÁN" - đã auto-match, có phone
        confirmedItems: [],        // Zone "ĐÃ XÁC NHẬN" - is_hidden = true
        showConfirmed: false,      // Toggle hiện/ẩn đã xác nhận
        searchQuery: '',           // Search filter
        sseConnection: null,       // SSE EventSource
        isLoading: false,
        lastUpdate: null,
        initialized: false,        // Prevent multiple init
    };

    // ===== CONFIG =====
    const config = {
        API_BASE_URL: window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev',
        SSE_ENDPOINT: '/api/sepay/stream',
        RECONNECT_DELAY: 3000,
        MAX_ITEMS_PER_ZONE: 100,
    };

    // ===== DOM ELEMENTS =====
    let elements = {};

    // ===== INITIALIZATION =====
    function init() {
        // Prevent multiple initialization
        if (state.initialized) {
            console.log('[LiveMode] Already initialized, refreshing data...');
            loadData();
            return;
        }

        console.log('[LiveMode] Initializing...');
        cacheElements();
        bindEvents();
        loadData();
        connectSSE();
        state.initialized = true;
        console.log('[LiveMode] Initialized successfully');
    }

    function cacheElements() {
        elements = {
            // Header
            searchInput: document.getElementById('liveSearchInput'),
            showConfirmedToggle: document.getElementById('showConfirmedToggle'),
            sseStatus: document.getElementById('sseStatus'),
            // Stats
            manualCount: document.getElementById('liveManualCount'),
            autoCount: document.getElementById('liveAutoCount'),
            confirmedCount: document.getElementById('liveConfirmedCount'),
            // Zones
            manualZone: document.getElementById('zoneManualContent'),
            autoZone: document.getElementById('zoneAutoContent'),
            confirmedZone: document.getElementById('zoneConfirmedContent'),
            confirmedZoneContainer: document.getElementById('zoneConfirmed'),
            // Footer
            totalTransactions: document.getElementById('liveTotalTransactions'),
            totalAmount: document.getElementById('liveTotalAmount'),
            autoPercent: document.getElementById('liveAutoPercent'),
            manualPercent: document.getElementById('liveManualPercent'),
        };
    }

    function bindEvents() {
        // Search input
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Show confirmed toggle
        if (elements.showConfirmedToggle) {
            elements.showConfirmedToggle.addEventListener('change', handleShowConfirmedToggle);
        }
    }

    // ===== DATA LOADING =====
    async function loadData() {
        if (state.isLoading) return;

        state.isLoading = true;
        console.log('[LiveMode] Loading data...');

        try {
            // Use the same API as main.js but filter for today
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`${config.API_BASE_URL}/api/sepay/history?start_date=${today}&end_date=${today}&limit=500`);
            const result = await response.json();

            if (result.success && result.data) {
                processTransactions(result.data);
                renderAllZones();
                updateStats();
                state.lastUpdate = new Date();
            } else {
                console.error('[LiveMode] Failed to load data:', result.error);
                showNotification('Không thể tải dữ liệu', 'error');
            }
        } catch (error) {
            console.error('[LiveMode] Error loading data:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
        } finally {
            state.isLoading = false;
        }
    }

    function processTransactions(transactions) {
        // Reset arrays
        state.manualMatchItems = [];
        state.autoMatchedItems = [];
        state.confirmedItems = [];

        transactions.forEach(tx => {
            // Only process incoming transactions (tiền vào)
            if (!tx.amount_in || tx.amount_in <= 0) return;

            const item = transformTransaction(tx);

            // Logic phân loại:
            // 1. is_hidden = true → "ĐÃ XÁC NHẬN"
            // 2. has_pending_match hoặc (pending_match_skipped với options) hoặc không có phone → "NHẬP TAY"
            // 3. Có phone và đã auto-match → "TỰ ĐỘNG GÁN"

            if (tx.is_hidden === true) {
                state.confirmedItems.push(item);
            } else if (
                tx.has_pending_match === true ||
                (tx.pending_match_skipped === true && tx.pending_match_options?.length > 0) ||
                !tx.linked_customer_phone
            ) {
                state.manualMatchItems.push(item);
            } else {
                // Có phone, không pending, không hidden
                state.autoMatchedItems.push(item);
            }
        });

        // Sort by time descending (newest first)
        const sortByTime = (a, b) => new Date(b.timestamp) - new Date(a.timestamp);
        state.manualMatchItems.sort(sortByTime);
        state.autoMatchedItems.sort(sortByTime);
        state.confirmedItems.sort(sortByTime);

        console.log('[LiveMode] Processed:', {
            manual: state.manualMatchItems.length,
            auto: state.autoMatchedItems.length,
            confirmed: state.confirmedItems.length
        });
    }

    function transformTransaction(tx) {
        return {
            id: tx.id,
            uniqueCode: tx.unique_code || tx.reference_number,
            amount: tx.amount_in || 0,
            timestamp: tx.transaction_date,
            content: tx.content || '',
            customerName: tx.customer_name || '',
            customerPhone: tx.linked_customer_phone || '',
            verificationStatus: tx.verification_status || '',
            matchMethod: tx.match_method || '',
            isHidden: tx.is_hidden || false,
            // Pending match fields
            hasPendingMatch: tx.has_pending_match || false,
            pendingMatchSkipped: tx.pending_match_skipped || false,
            pendingMatchId: tx.pending_match_id || null,
            pendingMatchOptions: tx.pending_match_options || [],
            pendingExtractedPhone: tx.pending_extracted_phone || '',
        };
    }

    // ===== RENDERING =====
    function renderAllZones() {
        renderManualZone();
        renderAutoZone();
        renderConfirmedZone();
    }

    function renderManualZone() {
        if (!elements.manualZone) return;

        const filtered = filterItems(state.manualMatchItems);

        if (filtered.length === 0) {
            elements.manualZone.innerHTML = `
                <div class="zone-empty">
                    <i data-lucide="check-circle"></i>
                    <p>Không có giao dịch cần xử lý</p>
                </div>
            `;
        } else {
            elements.manualZone.innerHTML = filtered.map(item => renderManualItem(item)).join('');
        }

        lucide?.createIcons();
    }

    function renderAutoZone() {
        if (!elements.autoZone) return;

        const filtered = filterItems(state.autoMatchedItems);

        if (filtered.length === 0) {
            elements.autoZone.innerHTML = `
                <div class="zone-empty">
                    <i data-lucide="inbox"></i>
                    <p>Chưa có giao dịch tự động</p>
                </div>
            `;
        } else {
            elements.autoZone.innerHTML = filtered.map(item => renderAutoItem(item)).join('');
        }

        lucide?.createIcons();
    }

    function renderConfirmedZone() {
        if (!elements.confirmedZone) return;

        // Toggle visibility
        if (elements.confirmedZoneContainer) {
            elements.confirmedZoneContainer.classList.toggle('hidden', !state.showConfirmed);
        }

        if (!state.showConfirmed) return;

        const filtered = filterItems(state.confirmedItems);

        if (filtered.length === 0) {
            elements.confirmedZone.innerHTML = `
                <div class="zone-empty">
                    <i data-lucide="package"></i>
                    <p>Chưa có giao dịch xác nhận</p>
                </div>
            `;
        } else {
            elements.confirmedZone.innerHTML = filtered.map(item => renderConfirmedItem(item)).join('');
        }

        lucide?.createIcons();
    }

    function renderManualItem(item) {
        const amountFormatted = formatAmount(item.amount);
        const timeFormatted = formatTime(item.timestamp);
        const contentShort = item.content.length > 30 ? item.content.substring(0, 30) + '...' : item.content;

        // Check if has pending match (dropdown) or needs phone input
        let actionHtml = '';

        if ((item.hasPendingMatch || item.pendingMatchSkipped) && item.pendingMatchOptions.length > 0) {
            // Has multiple customer matches - show dropdown
            // Structure: [{phone, count, customers: [{id, name, phone}]}]
            const options = item.pendingMatchOptions.map(opt => {
                const customers = opt.customers || [];
                return customers.map(customer => {
                    const customerId = customer.id || customer.customer_id || (customer.phone ? `LOCAL_${customer.phone}` : '');
                    const customerName = customer.name || customer.customer_name || 'N/A';
                    const customerPhone = customer.phone || customer.customer_phone || opt.phone || 'N/A';
                    if (!customerId) return '';
                    return `<option value="${customerId}" data-phone="${customerPhone}" data-name="${escapeHtml(customerName)}">${escapeHtml(customerName)} - ${customerPhone}</option>`;
                }).join('');
            }).join('');

            actionHtml = `
                <select class="customer-dropdown"
                        onchange="LiveModeModule.autoAssignCustomer(this, '${item.id}', ${item.pendingMatchId})"
                        data-transaction-id="${item.id}"
                        data-pending-match-id="${item.pendingMatchId}">
                    <option value="">-- Chọn KH (${item.pendingExtractedPhone || '?'}) --</option>
                    ${options}
                </select>
            `;
        } else {
            // No matches - show phone input
            actionHtml = `
                <input type="text"
                       class="phone-input"
                       placeholder="Nhập SĐT"
                       data-transaction-id="${item.id}"
                       onkeypress="if(event.key==='Enter') LiveModeModule.autoAssignPhone(this, '${item.id}')"
                       onblur="LiveModeModule.autoAssignPhone(this, '${item.id}')">
            `;
        }

        return `
            <div class="live-item manual" data-id="${item.id}">
                <div class="item-amount">${amountFormatted}</div>
                <div class="item-time">${timeFormatted}</div>
                <div class="item-content" title="${escapeHtml(item.content)}">"${escapeHtml(contentShort)}"</div>
                <div class="item-action">
                    ${actionHtml}
                </div>
            </div>
        `;
    }

    function renderAutoItem(item) {
        const amountFormatted = formatAmount(item.amount);
        const timeFormatted = formatTime(item.timestamp);
        const methodLabel = getMethodLabel(item.matchMethod);

        return `
            <div class="live-item auto" data-id="${item.id}">
                <div class="item-amount">${amountFormatted}</div>
                <div class="item-time">${timeFormatted}</div>
                <div class="item-customer">${escapeHtml(item.customerName) || 'N/A'}</div>
                <div class="item-phone">${item.customerPhone || 'N/A'}</div>
                <div class="item-method ${item.matchMethod}">${methodLabel}</div>
                <button class="btn-confirm" onclick="LiveModeModule.confirmAutoMatched('${item.id}')">
                    <i data-lucide="check"></i> Đã xác nhận
                </button>
            </div>
        `;
    }

    function renderConfirmedItem(item) {
        const amountFormatted = formatAmount(item.amount);
        const timeFormatted = formatTime(item.timestamp);
        const methodLabel = getMethodLabel(item.matchMethod);

        // Check if editable (manual entry and not approved by accountant)
        const isEditable = item.matchMethod === 'manual_entry' && item.verificationStatus !== 'APPROVED';

        const sourceHtml = isEditable
            ? `<span class="editable" onclick="LiveModeModule.editConfirmedItem('${item.id}')">${methodLabel} ✏️</span>`
            : `${methodLabel} ✓`;

        return `
            <div class="live-item confirmed" data-id="${item.id}" data-editable="${isEditable}">
                <div class="item-amount">${amountFormatted}</div>
                <div class="item-time">${timeFormatted}</div>
                <div class="item-customer">${escapeHtml(item.customerName) || 'N/A'}</div>
                <div class="item-phone">${item.customerPhone || 'N/A'}</div>
                <div class="item-source">${sourceHtml}</div>
            </div>
        `;
    }

    // ===== ACTIONS =====

    /**
     * Auto assign customer when selecting from dropdown (no extra click needed)
     * Uses the existing resolvePendingMatch API
     */
    async function autoAssignCustomer(selectElement, transactionId, pendingMatchId) {
        const selectedValue = selectElement.value;
        if (!selectedValue) return;

        const selectedOption = selectElement.options[selectElement.selectedIndex];
        const customerName = selectedOption.dataset.name || '';
        const phone = selectedOption.dataset.phone || '';

        console.log('[LiveMode] Auto-assigning customer:', { transactionId, pendingMatchId, phone, customerName });

        // Mark item as loading
        const itemElement = selectElement.closest('.live-item');
        itemElement?.classList.add('loading');

        try {
            // Use existing API endpoint for resolving pending match
            const response = await fetch(`${config.API_BASE_URL}/api/sepay/pending-matches/${pendingMatchId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_customer_id: selectedValue,
                    selected_phone: phone,
                    selected_name: customerName
                })
            });

            const result = await response.json();

            if (result.success) {
                showNotification(`Đã gán: ${customerName} (${phone})`, 'success');

                // Move item from manual to auto (it now has a phone)
                moveItemFromManualToAuto(transactionId, phone, customerName);

                // Animate removal
                itemElement?.classList.add('removing');
                setTimeout(() => {
                    renderAllZones();
                    updateStats();
                }, 300);

                // Flag balance history to reload
                window._balanceHistoryNeedsReload = true;
            } else {
                showNotification(`Lỗi: ${result.error || 'Không thể gán'}`, 'error');
                itemElement?.classList.remove('loading');
            }
        } catch (error) {
            console.error('[LiveMode] Error assigning customer:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
            itemElement?.classList.remove('loading');
        }
    }

    /**
     * Auto assign phone when entering manually (on Enter or blur)
     */
    async function autoAssignPhone(inputElement, transactionId) {
        const phone = inputElement.value.trim();
        if (!phone || phone.length < 10) return;

        // Prevent double-submit
        if (inputElement.dataset.processing === 'true') return;
        inputElement.dataset.processing = 'true';

        console.log('[LiveMode] Auto-assigning phone:', { transactionId, phone });

        // Mark item as loading
        const itemElement = inputElement.closest('.live-item');
        itemElement?.classList.add('loading');
        inputElement.classList.add('loading');

        try {
            // First, try to fetch customer name from TPOS
            let customerName = '';
            try {
                const tposResponse = await fetch(`${config.API_BASE_URL}/api/sepay/tpos/customer/${phone}`);
                const tposResult = await tposResponse.json();
                if (tposResult.success && tposResult.data && tposResult.data.length > 0) {
                    customerName = tposResult.data[0].name || '';
                }
            } catch (e) {
                console.warn('[LiveMode] Could not fetch from TPOS:', e);
            }

            // Call API to assign phone (use existing endpoint)
            const response = await fetch(`${config.API_BASE_URL}/api/sepay/transaction/${transactionId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    customer_name: customerName,
                    match_method: 'manual_entry'
                })
            });

            const result = await response.json();

            if (result.success) {
                showNotification(`Đã gán SĐT: ${phone}${customerName ? ` (${customerName})` : ''}`, 'success');

                // Move item from manual to auto
                moveItemFromManualToAuto(transactionId, phone, customerName);

                // Animate removal
                itemElement?.classList.add('removing');
                setTimeout(() => {
                    renderAllZones();
                    updateStats();
                }, 300);

                // Flag balance history to reload
                window._balanceHistoryNeedsReload = true;
            } else {
                showNotification(`Lỗi: ${result.error || 'Không thể gán'}`, 'error');
                itemElement?.classList.remove('loading');
                inputElement.classList.remove('loading');
            }
        } catch (error) {
            console.error('[LiveMode] Error assigning phone:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
            itemElement?.classList.remove('loading');
            inputElement.classList.remove('loading');
        } finally {
            inputElement.dataset.processing = 'false';
        }
    }

    /**
     * Confirm auto-matched transaction (single click) - Hide the transaction
     */
    async function confirmAutoMatched(transactionId) {
        console.log('[LiveMode] Confirming auto-matched:', transactionId);

        const itemElement = document.querySelector(`.live-item[data-id="${transactionId}"]`);
        itemElement?.classList.add('loading');

        try {
            // Use existing API to hide transaction (marks as confirmed)
            const response = await fetch(`${config.API_BASE_URL}/api/sepay/transaction/${transactionId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_hidden: true })
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Đã xác nhận giao dịch', 'success');

                // Find item in autoMatchedItems and move to confirmedItems
                const itemIndex = state.autoMatchedItems.findIndex(i => i.id == transactionId);
                if (itemIndex > -1) {
                    const item = state.autoMatchedItems.splice(itemIndex, 1)[0];
                    item.isHidden = true;
                    state.confirmedItems.unshift(item);
                }

                // Animate removal
                itemElement?.classList.add('removing');
                setTimeout(() => {
                    renderAllZones();
                    updateStats();
                }, 300);

                // Flag balance history to reload
                window._balanceHistoryNeedsReload = true;
            } else {
                showNotification(`Lỗi: ${result.error || 'Không thể xác nhận'}`, 'error');
                itemElement?.classList.remove('loading');
            }
        } catch (error) {
            console.error('[LiveMode] Error confirming:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
            itemElement?.classList.remove('loading');
        }
    }

    /**
     * Edit confirmed item (for manual entries only)
     */
    function editConfirmedItem(transactionId) {
        const item = state.confirmedItems.find(i => i.id == transactionId);
        if (!item) return;

        // Check if editable
        if (item.verificationStatus === 'APPROVED') {
            showNotification('Giao dịch đã được kế toán duyệt, không thể sửa', 'warning');
            return;
        }

        // Open edit modal (reuse existing modal from main.js)
        if (typeof window.editTransactionCustomer === 'function') {
            window.editTransactionCustomer(item.id, item.customerPhone, item.customerName);
        } else {
            // Fallback: simple prompt
            const newPhone = prompt('Nhập SĐT mới:', item.customerPhone);
            if (newPhone && newPhone !== item.customerPhone) {
                updateConfirmedItemPhone(transactionId, newPhone);
            }
        }
    }

    async function updateConfirmedItemPhone(transactionId, newPhone) {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/sepay/transaction/${transactionId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: newPhone })
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Đã cập nhật SĐT', 'success');
                loadData(); // Reload to get fresh data
            } else {
                showNotification(`Lỗi: ${result.error}`, 'error');
            }
        } catch (error) {
            showNotification(`Lỗi: ${error.message}`, 'error');
        }
    }

    // ===== HELPER FUNCTIONS =====

    function moveItemFromManualToAuto(transactionId, phone, customerName) {
        const itemIndex = state.manualMatchItems.findIndex(i => i.id == transactionId);
        if (itemIndex > -1) {
            const item = state.manualMatchItems.splice(itemIndex, 1)[0];
            item.customerPhone = phone;
            item.customerName = customerName;
            item.hasPendingMatch = false;
            item.pendingMatchSkipped = false;
            state.autoMatchedItems.unshift(item);
        }
    }

    function filterItems(items) {
        if (!state.searchQuery) return items;

        const query = state.searchQuery.toLowerCase();
        return items.filter(item =>
            item.content.toLowerCase().includes(query) ||
            item.customerName.toLowerCase().includes(query) ||
            item.customerPhone.includes(query) ||
            String(item.amount).includes(query)
        );
    }

    function updateStats() {
        // Update counts
        if (elements.manualCount) {
            elements.manualCount.textContent = state.manualMatchItems.length;
        }
        if (elements.autoCount) {
            elements.autoCount.textContent = state.autoMatchedItems.length;
        }
        if (elements.confirmedCount) {
            elements.confirmedCount.textContent = state.confirmedItems.length;
        }

        // Update footer stats
        const totalTx = state.manualMatchItems.length + state.autoMatchedItems.length + state.confirmedItems.length;
        const totalAmt = [...state.manualMatchItems, ...state.autoMatchedItems, ...state.confirmedItems]
            .reduce((sum, item) => sum + item.amount, 0);

        if (elements.totalTransactions) {
            elements.totalTransactions.textContent = totalTx;
        }
        if (elements.totalAmount) {
            elements.totalAmount.textContent = formatAmount(totalAmt, true);
        }

        // Calculate percentages
        const autoCount = state.autoMatchedItems.length + state.confirmedItems.length;
        const manualCount = state.manualMatchItems.length;
        const total = autoCount + manualCount || 1;

        if (elements.autoPercent) {
            elements.autoPercent.textContent = Math.round(autoCount / total * 100) + '%';
        }
        if (elements.manualPercent) {
            elements.manualPercent.textContent = Math.round(manualCount / total * 100) + '%';
        }

        // Update zone header counts
        const manualZoneCount = document.querySelector('#zoneManual .zone-count');
        const autoZoneCount = document.querySelector('#zoneAuto .zone-count');
        const confirmedZoneCount = document.querySelector('#zoneConfirmed .zone-count');

        if (manualZoneCount) manualZoneCount.textContent = state.manualMatchItems.length;
        if (autoZoneCount) autoZoneCount.textContent = state.autoMatchedItems.length;
        if (confirmedZoneCount) confirmedZoneCount.textContent = state.confirmedItems.length;

        // Update Live Mode badge in tab
        const liveModeBadge = document.getElementById('liveModeBadge');
        if (liveModeBadge) {
            if (state.manualMatchItems.length > 0) {
                liveModeBadge.textContent = state.manualMatchItems.length;
                liveModeBadge.style.display = 'inline-block';
            } else {
                liveModeBadge.style.display = 'none';
            }
        }
    }

    function handleSearch(e) {
        state.searchQuery = e.target.value.trim();
        renderAllZones();
    }

    function handleShowConfirmedToggle(e) {
        state.showConfirmed = e.target.checked;
        renderConfirmedZone();
    }

    // ===== SSE REALTIME =====

    function connectSSE() {
        if (state.sseConnection) {
            state.sseConnection.close();
        }

        updateSSEStatus('connecting');

        try {
            state.sseConnection = new EventSource(`${config.API_BASE_URL}${config.SSE_ENDPOINT}`);

            state.sseConnection.onopen = () => {
                console.log('[LiveMode] SSE connected');
                updateSSEStatus('connected');
            };

            state.sseConnection.onerror = (error) => {
                console.error('[LiveMode] SSE error:', error);
                updateSSEStatus('disconnected');

                // Reconnect after delay
                setTimeout(() => {
                    if (document.visibilityState === 'visible') {
                        connectSSE();
                    }
                }, config.RECONNECT_DELAY);
            };

            // Listen for new transactions
            state.sseConnection.addEventListener('new_transaction', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[LiveMode] New transaction:', data);
                    handleNewTransaction(data);
                } catch (e) {
                    console.error('[LiveMode] Error parsing SSE data:', e);
                }
            });

            // Listen for customer info updates
            state.sseConnection.addEventListener('customer_info_updated', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[LiveMode] Customer info updated:', data);
                    handleCustomerUpdate(data);
                } catch (e) {
                    console.error('[LiveMode] Error parsing SSE data:', e);
                }
            });

        } catch (error) {
            console.error('[LiveMode] Error connecting SSE:', error);
            updateSSEStatus('disconnected');
        }
    }

    function handleNewTransaction(data) {
        // Only process incoming transactions
        if (!data.amount_in && !data.transfer_amount) return;

        const item = transformTransaction({
            ...data,
            amount_in: data.amount_in || data.transfer_amount,
            linked_customer_phone: data.linked_customer_phone || ''
        });

        // Add to appropriate zone
        if (item.isHidden) {
            state.confirmedItems.unshift(item);
        } else if (item.hasPendingMatch || !item.customerPhone) {
            state.manualMatchItems.unshift(item);
        } else {
            state.autoMatchedItems.unshift(item);
        }

        // Render with animation
        renderAllZones();
        updateStats();

        // Highlight new item
        setTimeout(() => {
            const newItem = document.querySelector(`.live-item[data-id="${item.id}"]`);
            newItem?.classList.add('new');
        }, 50);

        // Play sound notification
        playNotificationSound();
    }

    function handleCustomerUpdate(data) {
        // Reload data to get fresh state
        loadData();
    }

    function updateSSEStatus(status) {
        if (!elements.sseStatus) return;

        elements.sseStatus.className = `sse-status ${status}`;
        const labels = {
            connected: 'Realtime',
            disconnected: 'Mất kết nối',
            connecting: 'Đang kết nối...'
        };
        elements.sseStatus.innerHTML = `<span class="dot"></span> ${labels[status] || status}`;
    }

    // ===== UTILITY FUNCTIONS =====

    function formatAmount(amount, short = false) {
        if (!amount) return '0đ';
        const num = Number(amount);
        if (short && num >= 1000000) {
            return '+' + (num / 1000000).toFixed(1) + 'tr';
        }
        if (short && num >= 1000) {
            return '+' + Math.round(num / 1000) + 'k';
        }
        return '+' + num.toLocaleString('vi-VN') + 'đ';
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function getMethodLabel(method) {
        const labels = {
            'qr_code': 'QR',
            'exact_phone': 'SĐT',
            'single_match': 'Auto',
            'pending_match': 'Chọn',
            'manual_entry': 'Nhập tay',
            'manual_link': 'Gán tay'
        };
        return labels[method] || method || 'Auto';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function showNotification(message, type = 'info') {
        // Use existing notification system
        if (window.NotificationManager?.show) {
            window.NotificationManager.show(message, type);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[Notification] ${type}: ${message}`);
        }
    }

    function playNotificationSound() {
        // Optional: Play a subtle sound for new transactions
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQMjHWBnbGFhLAMARqLa/fv2BEMbIh8mKyo1LAUAI4fb//////8ABQBDS01PU1tjWUgNAACKwu/////////7BF1bXmRsYFM/AAAA');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore errors if autoplay blocked
        } catch (e) {
            // Ignore
        }
    }

    // ===== PUBLIC API =====
    return {
        init,
        loadData,
        autoAssignCustomer,
        autoAssignPhone,
        confirmAutoMatched,
        editConfirmedItem,
        getState: () => ({ ...state }),
    };

})();

// Initialize when DOM is ready and Live Mode tab is active
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized when tab is switched to Live Mode
    console.log('[LiveMode] Module loaded, waiting for tab activation');
});

// Export for global access
window.LiveModeModule = LiveModeModule;
