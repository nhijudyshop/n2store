// =====================================================
// LIVE MODE - KANBAN LAYOUT MODULE
// Balance History - Realtime transaction monitoring
// With XSS protection, proper error handling, loading states
// =====================================================

const LiveModeModule = (function() {
    'use strict';

    // ===== STATE =====
    const state = {
        // 3 Kanban columns
        manualItems: [],        // NHẬP TAY - cần nhập SĐT
        autoMatchedItems: [],   // TỰ ĐỘNG GÁN - có KH, chờ confirm
        confirmedItems: [],     // ĐÃ XÁC NHẬN - hoàn thành

        // UI state
        showConfirmed: false,   // Column 3 ẩn mặc định
        searchQuery: '',
        isLoading: false,
        lastUpdate: null,

        // Date filter - default today
        filterStartDate: new Date().toISOString().split('T')[0],
        filterEndDate: new Date().toISOString().split('T')[0],

        // SSE
        sseConnection: null,
        sseReconnectAttempts: 0,
        maxReconnectAttempts: 10,
        sseDebounceTimer: null,  // Debounce rapid SSE updates

        // TPOS Cache with expiry
        tposCache: new Map(),
        tposCacheExpiry: 5 * 60 * 1000, // 5 minutes
        tposCacheMaxSize: 100,

        // Search debounce
        searchDebounceTimer: null,

        // Initialized flag
        initialized: false,
    };

    // ===== CONSTANTS =====
    const API_BASE = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const SSE_URL = `${API_BASE}/api/sepay/stream`;

    // ===== SECURITY: XSS Protection =====
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== USER-FRIENDLY ERROR MESSAGES =====
    function getUserFriendlyError(error) {
        const message = error?.message || String(error);

        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
            return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.';
        }
        if (message.includes('401') || message.includes('Unauthorized')) {
            return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
        }
        if (message.includes('403') || message.includes('Forbidden')) {
            return 'Bạn không có quyền thực hiện thao tác này.';
        }
        if (message.includes('404') || message.includes('Not found')) {
            return 'Không tìm thấy dữ liệu. Vui lòng thử lại.';
        }
        if (message.includes('500') || message.includes('Internal Server')) {
            return 'Lỗi máy chủ. Vui lòng thử lại sau.';
        }
        if (message.includes('timeout') || message.includes('Timeout')) {
            return 'Yêu cầu quá thời gian. Vui lòng thử lại.';
        }

        return message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
    }

    // ===== UTILITY FUNCTIONS =====

    function formatCurrency(amount) {
        if (!amount) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${time} ${day}/${month}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    function truncateText(text, maxLength = 50) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // ===== BUTTON LOADING STATE =====
    function setButtonLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
            button.dataset.originalText = button.textContent;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
            }
        }
    }

    function setCardProcessing(txId, isProcessing) {
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        if (card) {
            card.classList.toggle('processing', isProcessing);
        }
    }

    // ===== CLASSIFICATION LOGIC =====

    function classifyTransaction(tx) {
        // ĐÃ XÁC NHẬN: is_hidden = true
        if (tx.is_hidden === true) {
            return 'confirmed';
        }

        // NHẬP TAY: Chưa có khách hàng hoặc cần xử lý
        // Use customer_phone (from backend JOIN) as the primary field
        if (
            !tx.customer_phone ||
            tx.has_pending_match === true ||
            (tx.pending_match_skipped && tx.pending_match_options?.length > 0)
        ) {
            return 'manual';
        }

        // TỰ ĐỘNG GÁN: Có KH nhưng chưa xác nhận
        return 'autoMatched';
    }

    function classifyAllTransactions(transactions) {
        state.manualItems = [];
        state.autoMatchedItems = [];
        state.confirmedItems = [];

        transactions.forEach(tx => {
            const category = classifyTransaction(tx);
            if (category === 'confirmed') {
                state.confirmedItems.push(tx);
            } else if (category === 'manual') {
                state.manualItems.push(tx);
            } else {
                state.autoMatchedItems.push(tx);
            }
        });

        // Sort by date descending (newest first)
        const sortByDate = (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date);
        state.manualItems.sort(sortByDate);
        state.autoMatchedItems.sort(sortByDate);
        state.confirmedItems.sort(sortByDate);
    }

    // ===== RENDER FUNCTIONS =====

    function renderKanbanBoard() {
        const board = document.getElementById('kanbanBoard');
        if (!board) return;

        // Toggle show-confirmed class on board based on state
        board.classList.toggle('show-confirmed', state.showConfirmed);

        // Filter by search query
        const filterItems = (items) => {
            if (!state.searchQuery) return items;
            const query = state.searchQuery.toLowerCase();
            return items.filter(tx =>
                (tx.content || '').toLowerCase().includes(query) ||
                (tx.customer_name || '').toLowerCase().includes(query) ||
                (tx.customer_phone || '').includes(query) ||
                String(tx.transfer_amount || '').includes(query)
            );
        };

        const filteredManual = filterItems(state.manualItems);
        const filteredAuto = filterItems(state.autoMatchedItems);
        const filteredConfirmed = filterItems(state.confirmedItems);

        board.innerHTML = `
            <!-- Column 1: NHẬP TAY -->
            <div class="kanban-column manual">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>⚠️ NHẬP TAY</span>
                    </div>
                    <span class="column-count">${filteredManual.length}</span>
                </div>
                <div class="kanban-column-content" id="columnManual">
                    ${renderManualCards(filteredManual)}
                </div>
            </div>

            <!-- Column 2: TỰ ĐỘNG GÁN -->
            <div class="kanban-column auto">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>✅ TỰ ĐỘNG GÁN</span>
                    </div>
                    <span class="column-count">${filteredAuto.length}</span>
                </div>
                <div class="kanban-column-content" id="columnAuto">
                    ${renderAutoCards(filteredAuto)}
                </div>
            </div>

            <!-- Column 3: ĐÃ XÁC NHẬN (controlled by board.show-confirmed class) -->
            <div class="kanban-column confirmed">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>📦 ĐÃ XÁC NHẬN</span>
                    </div>
                    <span class="column-count">${filteredConfirmed.length}</span>
                </div>
                <div class="kanban-column-content" id="columnConfirmed">
                    ${renderConfirmedCards(filteredConfirmed)}
                </div>
            </div>
        `;

        // Update stats
        updateStats();

        // Re-render Lucide icons
        if (window.lucide) lucide.createIcons();
    }

    function renderManualCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="inbox"></i>
                <p>Không có giao dịch cần xử lý</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const hasPendingMatch = tx.has_pending_match || (tx.pending_match_skipped && tx.pending_match_options?.length > 0);
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            if (hasPendingMatch && tx.pending_match_options?.length > 0) {
                // Row with dropdown
                // Structure: [{phone, count, customers: [{id, name, phone}]}]
                const options = tx.pending_match_options.flatMap(opt => {
                    const customers = opt.customers || [];
                    return customers.map(c => {
                        const customerId = c.id || c.customer_id || (c.phone ? `LOCAL_${c.phone}` : '');
                        const customerName = c.name || c.customer_name || 'N/A';
                        const customerPhone = c.phone || c.customer_phone || opt.phone || 'N/A';
                        if (!customerId) return '';
                        return `<option value="${escapeHtml(customerId)}" data-phone="${escapeHtml(customerPhone)}" data-name="${escapeHtml(customerName)}">${escapeHtml(customerName)} - ${escapeHtml(customerPhone)}</option>`;
                    }).join('');
                }).join('');

                return `
                    <div class="kanban-card manual has-dropdown" data-id="${tx.id}" data-pending-id="${tx.pending_match_id || ''}">
                        <span class="card-time">${formatTime(tx.transaction_date)}</span>
                        <span class="card-amount ${isPositive ? '' : 'negative'}">${isPositive ? '+' : '-'}${formatCurrency(amount)}</span>
                        <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                        <select class="customer-dropdown" data-id="${tx.id}">
                            <option value="">-- Chọn KH --</option>
                            ${options}
                        </select>
                        <button class="btn-assign" data-id="${tx.id}" disabled>Gán</button>
                    </div>
                `;
            } else {
                // Row with phone input + TPOS suggest
                return `
                    <div class="kanban-card manual" data-id="${tx.id}">
                        <span class="card-time">${formatTime(tx.transaction_date)}</span>
                        <span class="card-amount ${isPositive ? '' : 'negative'}">${isPositive ? '+' : '-'}${formatCurrency(amount)}</span>
                        <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                        <input type="text" class="phone-input" id="phone-${tx.id}" placeholder="SĐT" data-id="${tx.id}" maxlength="11">
                        <span class="tpos-suggest empty" id="tpos-${tx.id}">Nhập SĐT...</span>
                        <button class="btn-assign" id="btn-${tx.id}" data-id="${tx.id}" disabled>Gán</button>
                    </div>
                `;
            }
        }).join('');
    }

    function renderAutoCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="check-circle"></i>
                <p>Không có giao dịch chờ xác nhận</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const methodClass = tx.match_method === 'qr_code' ? 'qr' : 'phone';
            const methodLabel = tx.match_method === 'qr_code' ? 'QR' : 'SĐT';
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            return `
                <div class="kanban-card auto" data-id="${tx.id}">
                    <span class="card-time">${formatTime(tx.transaction_date)}</span>
                    <span class="card-amount ${isPositive ? '' : 'negative'}">${isPositive ? '+' : '-'}${formatCurrency(amount)}</span>
                    <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                    <span class="card-customer">${escapeHtml(tx.customer_name || 'Không tên')}</span>
                    <span class="card-phone">${escapeHtml(tx.customer_phone || '')}</span>
                    <span class="card-method ${methodClass}">${methodLabel}</span>
                    <button class="btn-confirm" data-id="${tx.id}">Xác nhận</button>
                </div>
            `;
        }).join('');
    }

    function renderConfirmedCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="package"></i>
                <p>Chưa có giao dịch đã xác nhận</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const methodClass = tx.match_method === 'qr_code' ? 'qr' :
                               tx.match_method === 'manual_entry' ? 'manual' : 'phone';
            const methodLabel = tx.match_method === 'qr_code' ? 'QR' :
                               tx.match_method === 'manual_entry' ? 'Tay' : 'SĐT';
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            // Cho phép sửa nếu chưa được kế toán duyệt
            const canEdit = tx.verification_status !== 'APPROVED';

            return `
                <div class="kanban-card confirmed" data-id="${tx.id}">
                    <span class="card-time">${formatTime(tx.transaction_date)}</span>
                    <span class="card-amount ${isPositive ? '' : 'negative'}">${isPositive ? '+' : '-'}${formatCurrency(amount)}</span>
                    <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                    <span class="card-customer">${escapeHtml(tx.customer_name || 'Không tên')}</span>
                    <span class="card-phone">${escapeHtml(tx.customer_phone || '')}</span>
                    <span class="card-method ${methodClass}">${methodLabel}</span>
                    ${canEdit ? `<button class="btn-edit" data-id="${tx.id}">Sửa</button>` : ''}
                </div>
            `;
        }).join('');
    }

    function updateStats() {
        const totalGD = state.manualItems.length + state.autoMatchedItems.length + state.confirmedItems.length;
        // Use transfer_amount and filter for incoming only (transfer_type === 'in')
        const totalAmount = [...state.manualItems, ...state.autoMatchedItems, ...state.confirmedItems]
            .filter(tx => tx.transfer_type === 'in')
            .reduce((sum, tx) => sum + (tx.transfer_amount || 0), 0);

        const statsEl = document.getElementById('liveStatsTotal');
        if (statsEl) statsEl.textContent = totalGD;

        const amountEl = document.getElementById('liveStatsAmount');
        if (amountEl) amountEl.textContent = formatCurrency(totalAmount);

        const updateEl = document.getElementById('liveLastUpdate');
        if (updateEl && state.lastUpdate) {
            updateEl.textContent = state.lastUpdate.toLocaleTimeString('vi-VN');
        }

        // Update toggle button text
        const toggleBtn = document.getElementById('toggleConfirmedBtn');
        if (toggleBtn) {
            const count = state.confirmedItems.length;
            toggleBtn.innerHTML = `<i data-lucide="${state.showConfirmed ? 'eye' : 'eye-off'}" style="width:14px;height:14px;"></i> Đã XN (${count})`;
            toggleBtn.classList.toggle('active', state.showConfirmed);
            if (window.lucide) lucide.createIcons();
        }
    }

    // ===== EVENT HANDLERS =====

    async function onPhoneInput(input) {
        const phone = input.value.replace(/\D/g, '');
        const txId = input.dataset.id;
        const btn = document.getElementById(`btn-${txId}`);
        const tposSuggest = document.getElementById(`tpos-${txId}`);

        // Enable button if phone has 10+ digits
        if (btn) {
            btn.disabled = phone.length < 10;
        }

        // Update TPOS suggest display
        if (tposSuggest) {
            if (phone.length < 10) {
                tposSuggest.className = 'tpos-suggest empty';
                tposSuggest.textContent = phone.length > 0 ? `${phone.length}/10...` : 'Nhập SĐT...';
            } else if (phone.length === 10) {
                // Show loading
                tposSuggest.className = 'tpos-suggest loading';
                tposSuggest.textContent = 'Đang tìm...';

                try {
                    const customer = await lookupTPOS(phone);
                    if (customer && customer.name) {
                        tposSuggest.className = 'tpos-suggest found';
                        tposSuggest.textContent = truncateText(customer.name || customer.customer_name, 20);
                        tposSuggest.title = customer.name || customer.customer_name;
                    } else {
                        tposSuggest.className = 'tpos-suggest not-found';
                        tposSuggest.textContent = 'Không có TPOS';
                    }
                } catch (err) {
                    console.log('TPOS lookup failed:', err);
                    tposSuggest.className = 'tpos-suggest not-found';
                    tposSuggest.textContent = 'Lỗi lookup';
                }
            }
        }
    }

    function onDropdownChange(select) {
        const txId = select.dataset.id;
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        const btn = card?.querySelector('.btn-assign');
        if (btn) {
            btn.disabled = !select.value;
        }
    }

    function onSearchInput(input) {
        // Debounce search
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
        }
        state.searchDebounceTimer = setTimeout(() => {
            state.searchQuery = input.value;
            renderKanbanBoard();
        }, 300);
    }

    function toggleConfirmedColumn() {
        state.showConfirmed = !state.showConfirmed;
        localStorage.setItem('livemode_show_confirmed', state.showConfirmed);

        // Toggle class on board without re-rendering
        const board = document.getElementById('kanbanBoard');
        if (board) {
            board.classList.toggle('show-confirmed', state.showConfirmed);
        }

        // Update button UI
        updateStats();
    }

    // ===== TPOS CACHE WITH EXPIRY =====

    async function lookupTPOS(phone) {
        const now = Date.now();

        // Check cache with expiry
        if (state.tposCache.has(phone)) {
            const cached = state.tposCache.get(phone);
            if (now - cached.timestamp < state.tposCacheExpiry) {
                return cached.data;
            }
            // Expired, remove
            state.tposCache.delete(phone);
        }

        // Enforce cache size limit
        if (state.tposCache.size >= state.tposCacheMaxSize) {
            // Remove oldest entry
            const oldestKey = state.tposCache.keys().next().value;
            state.tposCache.delete(oldestKey);
        }

        // Correct endpoint: /api/sepay/tpos/customer/{phone}
        const response = await fetch(`${API_BASE}/api/sepay/tpos/customer/${phone}`);
        const result = await response.json();

        // Handle response format: { success, data: [], count }
        if (result.success && result.data && result.data.length > 0) {
            const customer = result.data[0]; // First matching customer
            // Cache with timestamp
            state.tposCache.set(phone, { data: customer, timestamp: now });
            return customer;
        }

        // No customer found - cache null to avoid repeated lookups
        state.tposCache.set(phone, { data: null, timestamp: now });
        return null;
    }

    // ===== API ACTIONS =====

    async function assignManual(txId) {
        const phoneInput = document.getElementById(`phone-${txId}`);
        const btn = document.getElementById(`btn-${txId}`);
        const phone = phoneInput?.value.replace(/\D/g, '');

        if (!phone || phone.length < 10) {
            showNotification('Vui lòng nhập số điện thoại hợp lệ (10 số)', 'error');
            return;
        }

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            // 1. Gán SĐT
            const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    match_method: 'manual_entry'
                })
            });

            if (!response.ok) {
                throw new Error('Gán SĐT thất bại');
            }

            // 2. Đánh dấu hidden = true (chuyển thẳng sang ĐÃ XÁC NHẬN)
            const hideResponse = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true })
            });

            if (!hideResponse.ok) {
                // Partial success - phone was assigned but hide failed
                showNotification('Đã gán SĐT nhưng chưa xác nhận được. Vui lòng thử xác nhận lại.', 'warning');
                await loadTransactions();
                return;
            }

            showNotification('Đã gán và xác nhận giao dịch!', 'success');
            await loadTransactions();

        } catch (err) {
            console.error('assignManual error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    async function assignFromDropdown(txId) {
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        const dropdown = document.querySelector(`.customer-dropdown[data-id="${txId}"]`);
        const btn = card?.querySelector('.btn-assign');
        const pendingMatchId = card?.dataset.pendingId;
        const customerId = dropdown?.value;

        if (!customerId) {
            showNotification('Vui lòng chọn khách hàng', 'error');
            return;
        }

        // Get customer info from selected option
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const customerPhone = selectedOption?.dataset.phone || '';
        const customerName = selectedOption?.dataset.name || '';

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            // Resolve pending match using pendingMatchId and customer_id
            const response = await fetch(`${API_BASE}/api/sepay/pending-matches/${pendingMatchId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: customerId.startsWith('LOCAL_') ? customerId : parseInt(customerId),
                    resolved_by: JSON.parse(localStorage.getItem('n2shop_current_user') || '{}').username || 'admin'
                })
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || 'Resolve thất bại');
            }

            // Đánh dấu hidden = true
            const hideResponse = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true })
            });

            if (!hideResponse.ok) {
                showNotification(`Đã gán ${customerName} nhưng chưa xác nhận được. Vui lòng thử lại.`, 'warning');
                await loadTransactions();
                return;
            }

            showNotification(`Đã gán ${customerName} (${customerPhone}) và xác nhận!`, 'success');
            await loadTransactions();

        } catch (err) {
            console.error('assignFromDropdown error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    async function confirmAutoMatched(txId) {
        const btn = document.querySelector(`.kanban-card[data-id="${txId}"] .btn-confirm`);

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true })
            });

            if (!response.ok) throw new Error('Xác nhận thất bại');

            showNotification('Đã xác nhận giao dịch!', 'success');
            await loadTransactions();

        } catch (err) {
            console.error('confirmAutoMatched error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    function editConfirmedItem(txId) {
        // Mở modal chỉnh sửa có sẵn
        const tx = state.confirmedItems.find(t => String(t.id) === String(txId));
        if (!tx) return;

        // Sử dụng modal editCustomerModal có sẵn trong index.html
        const modal = document.getElementById('editCustomerModal');
        const phoneInput = document.getElementById('editCustomerPhone');
        const nameInput = document.getElementById('editCustomerName');
        const codeSpan = document.getElementById('editCustomerUniqueCode');
        const tposContainer = document.getElementById('tposLookupContainer');

        if (modal && phoneInput && nameInput) {
            if (codeSpan) codeSpan.textContent = tx.reference_code || tx.id;
            // Use customer_phone and customer_name (correct API fields)
            phoneInput.value = tx.customer_phone || '';
            if (nameInput) nameInput.value = tx.customer_name || '';

            // Store current tx id for form submission
            modal.dataset.txId = txId;

            // Show TPOS lookup container
            if (tposContainer) tposContainer.style.display = 'block';

            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        }
    }

    // ===== DATA LOADING =====

    async function loadTransactions() {
        state.isLoading = true;
        updateLoadingState(true);

        try {
            // Use date filter from state
            const params = new URLSearchParams({
                start_date: state.filterStartDate,
                end_date: state.filterEndDate,
                limit: 500,
                include_hidden: 'true'  // Include confirmed (hidden) transactions
            });

            const response = await fetch(`${API_BASE}/api/sepay/history?${params}`);
            if (!response.ok) throw new Error('Load transactions failed');

            const data = await response.json();
            const transactions = data.transactions || data.data || [];

            // Classify into columns
            classifyAllTransactions(transactions);

            state.lastUpdate = new Date();
            state.isLoading = false;

            renderKanbanBoard();

        } catch (err) {
            console.error('loadTransactions error:', err);
            showNotification(getUserFriendlyError(err), 'error');
            state.isLoading = false;
        }

        updateLoadingState(false);
    }

    function updateLoadingState(isLoading) {
        const board = document.getElementById('kanbanBoard');
        if (!board) return;

        if (isLoading && state.manualItems.length === 0 && state.autoMatchedItems.length === 0) {
            board.innerHTML = `
                <div class="kanban-loading">
                    <i data-lucide="loader-2"></i>
                    Đang tải dữ liệu...
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    // ===== SSE REALTIME WITH EXPONENTIAL BACKOFF =====

    function connectSSE() {
        if (state.sseConnection) {
            state.sseConnection.close();
        }

        try {
            state.sseConnection = new EventSource(SSE_URL);

            state.sseConnection.onopen = () => {
                console.log('[LiveMode] SSE connected');
                state.sseReconnectAttempts = 0;
                updateSSEStatus(true);
            };

            // Listen for specific SSE event types (same as main.js)
            state.sseConnection.addEventListener('new-transaction', (event) => {
                console.log('[LiveMode] SSE new-transaction received');
                handleSSEMessage({ type: 'new-transaction', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('customer-info-updated', (event) => {
                console.log('[LiveMode] SSE customer-info-updated received');
                handleSSEMessage({ type: 'customer-info-updated', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('pending-match-created', (event) => {
                console.log('[LiveMode] SSE pending-match-created received');
                handleSSEMessage({ type: 'pending-match-created', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('connected', (event) => {
                console.log('[LiveMode] SSE connected event:', JSON.parse(event.data));
            });

            state.sseConnection.onerror = () => {
                console.log('[LiveMode] SSE error, reconnecting...');
                updateSSEStatus(false);
                state.sseConnection.close();

                if (state.sseReconnectAttempts < state.maxReconnectAttempts) {
                    state.sseReconnectAttempts++;
                    // True exponential backoff: 1s, 2s, 4s, 8s... max 30s
                    const delay = Math.min(1000 * Math.pow(2, state.sseReconnectAttempts), 30000);
                    console.log(`[LiveMode] Reconnecting in ${delay}ms (attempt ${state.sseReconnectAttempts})`);
                    setTimeout(connectSSE, delay);
                } else {
                    console.log('[LiveMode] Max reconnect attempts reached');
                    showNotification('Mất kết nối realtime. Vui lòng tải lại trang.', 'warning');
                }
            };

        } catch (err) {
            console.error('[LiveMode] SSE connection error:', err);
            updateSSEStatus(false);
        }
    }

    function handleSSEMessage(message) {
        const { type, data } = message;
        console.log('[LiveMode] handleSSEMessage:', type);

        // All event types should trigger a reload to get fresh data
        if (type === 'new-transaction' || type === 'customer-info-updated' || type === 'pending-match-created') {
            // Debounce rapid updates - wait 500ms before reloading
            if (state.sseDebounceTimer) {
                clearTimeout(state.sseDebounceTimer);
            }
            state.sseDebounceTimer = setTimeout(() => {
                console.log('[LiveMode] Reloading transactions after SSE event');
                loadTransactions();
            }, 500);
        }
    }

    function updateSSEStatus(connected) {
        const statusEl = document.getElementById('sseStatus');
        if (!statusEl) return;

        if (connected) {
            statusEl.className = 'sse-status connected';
            statusEl.innerHTML = '<span class="status-dot"></span> Realtime';
        } else {
            statusEl.className = 'sse-status disconnected';
            statusEl.innerHTML = '<span class="status-dot"></span> Offline';
        }
    }

    function disconnectSSE() {
        if (state.sseConnection) {
            state.sseConnection.close();
            state.sseConnection = null;
        }
    }

    // ===== NOTIFICATION =====

    function showNotification(message, type = 'info') {
        if (window.notificationManager) {
            window.notificationManager.show(message, type);
        } else if (window.getNotificationManager) {
            window.getNotificationManager().show(message, type);
        } else {
            console.log(`[${type}] ${message}`);
            // Fallback: simple alert for errors
            if (type === 'error') {
                alert(message);
            }
        }
    }

    // ===== EVENT DELEGATION =====

    function setupEventDelegation() {
        const board = document.getElementById('kanbanBoard');
        if (!board || board.dataset.listenerAttached) return;

        board.dataset.listenerAttached = 'true';

        // Click events
        board.addEventListener('click', (e) => {
            const target = e.target;

            // Assign button (manual)
            if (target.classList.contains('btn-assign')) {
                const txId = target.dataset.id;
                const card = target.closest('.kanban-card');
                if (card?.classList.contains('has-dropdown')) {
                    assignFromDropdown(txId);
                } else {
                    assignManual(txId);
                }
                return;
            }

            // Confirm button
            if (target.classList.contains('btn-confirm')) {
                const txId = target.dataset.id;
                confirmAutoMatched(txId);
                return;
            }

            // Edit button
            if (target.classList.contains('btn-edit')) {
                const txId = target.dataset.id;
                editConfirmedItem(txId);
                return;
            }
        });

        // Input events
        board.addEventListener('input', (e) => {
            const target = e.target;

            if (target.classList.contains('phone-input')) {
                onPhoneInput(target);
            }
        });

        // Change events (dropdown)
        board.addEventListener('change', (e) => {
            const target = e.target;

            if (target.classList.contains('customer-dropdown')) {
                onDropdownChange(target);
            }
        });
    }

    // ===== INITIALIZATION =====

    function init() {
        if (state.initialized) return;

        console.log('[LiveMode] Initializing Kanban...');

        // Load saved preference
        state.showConfirmed = localStorage.getItem('livemode_show_confirmed') === 'true';

        // Initial load
        loadTransactions();

        // Connect SSE
        connectSSE();

        // Set up event listeners
        setupEventListeners();
        setupEventDelegation();

        state.initialized = true;
    }

    function setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('liveSearchInput');
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.dataset.listenerAttached = 'true';
            searchInput.addEventListener('input', (e) => onSearchInput(e.target));
        }

        // Toggle button
        const toggleBtn = document.getElementById('toggleConfirmedBtn');
        if (toggleBtn && !toggleBtn.dataset.listenerAttached) {
            toggleBtn.dataset.listenerAttached = 'true';
            toggleBtn.addEventListener('click', toggleConfirmedColumn);
        }

        // Refresh button
        const refreshBtn = document.getElementById('liveRefreshBtn');
        if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
            refreshBtn.dataset.listenerAttached = 'true';
            refreshBtn.addEventListener('click', loadTransactions);
        }

        // Date filter inputs
        const startDateInput = document.getElementById('liveStartDate');
        const endDateInput = document.getElementById('liveEndDate');

        if (startDateInput && !startDateInput.dataset.listenerAttached) {
            startDateInput.dataset.listenerAttached = 'true';
            // Set initial value
            startDateInput.value = formatDateForInput(state.filterStartDate);
            startDateInput.addEventListener('change', onDateFilterChange);
        }

        if (endDateInput && !endDateInput.dataset.listenerAttached) {
            endDateInput.dataset.listenerAttached = 'true';
            // Set initial value
            endDateInput.value = formatDateForInput(state.filterEndDate);
            endDateInput.addEventListener('change', onDateFilterChange);
        }
    }

    // Format date for input (dd/mm/yyyy -> yyyy-mm-dd)
    function formatDateForInput(dateStr) {
        if (!dateStr) return '';
        // Already in yyyy-mm-dd format
        if (dateStr.includes('-')) return dateStr;
        // Convert from dd/mm/yyyy
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    }

    // Handle date filter change
    function onDateFilterChange() {
        const startInput = document.getElementById('liveStartDate');
        const endInput = document.getElementById('liveEndDate');

        if (startInput && startInput.value) {
            state.filterStartDate = startInput.value;
        }
        if (endInput && endInput.value) {
            state.filterEndDate = endInput.value;
        }

        // Reload with new date range
        loadTransactions();
    }

    function destroy() {
        disconnectSSE();

        // Clear cache
        state.tposCache.clear();

        // Clear debounce timer
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
        }

        state.initialized = false;
    }

    // ===== PUBLIC API =====
    return {
        init,
        destroy,
        loadTransactions,
        onPhoneInput,
        onDropdownChange,
        assignManual,
        assignFromDropdown,
        confirmAutoMatched,
        editConfirmedItem,
        toggleConfirmedColumn,
    };

})();

// Export to window
window.LiveModeModule = LiveModeModule;
