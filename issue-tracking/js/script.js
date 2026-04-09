// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * POST-SALES ISSUE TRACKING
 * Powered by Firebase & TPOS API
 */

// Global State
let TICKETS = [];
let selectedOrder = null;
let currentTicketSubscription = null;
let currentCustomer = null; // NEW: Store current customer info
let selectedOldOrder = null; // NEW: Store selected old order for RETURN_OLD_ORDER
let isSubmitting = false; // Prevent double-click on submit
let isProcessingAction = false; // Prevent double-click on confirm action
let currentSearchTab = 'customer'; // 'customer' (SĐT/Tên) | 'code' (Mã đơn)

// Settings Management
const SETTINGS_KEY = 'issue_tracking_settings';
const DEFAULT_SETTINGS = {
    printBillEnabled: false  // Default: off
};

let appSettings = { ...DEFAULT_SETTINGS };

// Notification Manager instance
let notificationManager = null;

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    ticketList: document.getElementById('ticket-list-body'),
    countPendingGoods: document.getElementById('count-pending-goods'),
    countPendingFinance: document.getElementById('count-pending-finance'),
    countCompleted: document.getElementById('count-completed-today'),
    badgePendingGoods: document.getElementById('badge-pending-goods'),
    badgePendingFinance: document.getElementById('badge-pending-finance'),
    modalCreate: document.getElementById('modal-create-ticket'),
    modalConfirm: document.getElementById('modal-confirm-action'),
    btnCreate: document.getElementById('btn-create-ticket'),
    btnSearchOrder: document.getElementById('btn-search-order'),
    inpSearchOrder: document.getElementById('order-search-input'),
    tabSearchCustomer: document.getElementById('tab-search-customer'),
    tabSearchCode: document.getElementById('tab-search-code'),
    closeButtons: document.querySelectorAll('.close-modal, .close-modal-btn'),
    loadingOverlay: document.createElement('div'), // Creating loading overlay

    // NEW: Customer Info Elements
    customerInfoSection: document.getElementById('customer-info-section'),
    customerInfoName: document.getElementById('customer-info-name'),
    customerInfoPhone: document.getElementById('customer-info-phone'),
    customerInfoTier: document.getElementById('customer-info-tier'),
    customerInfoWalletBalance: document.getElementById('customer-info-wallet-balance'),
    customerInfoNewCustomerWarning: document.getElementById('customer-info-new-customer-warning')
};

/**
 * INITIALIZATION
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Notification Manager
    notificationManager = new NotificationManager();

    // Load settings from localStorage
    loadSettings();

    // Setup UI
    initLoadingOverlay();
    initTabs();
    initModalHandlers();
    initReconcileHandlers();
    initSettingsHandlers();

    // Subscribe to Firebase Realtime Data
    console.log('[APP] Initializing Firebase subscription...');
    currentTicketSubscription = ApiService.subscribeToTickets((tickets) => {
        console.log('[APP] Received tickets update:', tickets.length);
        TICKETS = tickets;
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'pending-goods';
        renderDashboard(activeTab);
        updateStats();
    });

    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Flag to track if mermaid diagram has been rendered
let mermaidRendered = false;

/**
 * Toggle flow details visibility and init mermaid on first show
 */
function toggleFlowDetails() {
    const flowDetails = document.getElementById('flow-details');
    if (!flowDetails) return;

    const isHidden = flowDetails.classList.contains('hidden');
    flowDetails.classList.toggle('hidden');

    // Initialize mermaid only on first show (when element becomes visible)
    if (isHidden && !mermaidRendered && typeof mermaid !== 'undefined') {
        try {
            mermaid.init(undefined, flowDetails.querySelectorAll('.mermaid'));
            mermaidRendered = true;
            console.log('[MERMAID] Diagram rendered successfully');
        } catch (e) {
            console.error('[MERMAID] Error rendering diagram:', e);
        }
    }
}

/**
 * SETTINGS MANAGEMENT
 */
function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
        console.log('[SETTINGS] Loaded:', appSettings);
    } catch (e) {
        console.error('[SETTINGS] Load error:', e);
        appSettings = { ...DEFAULT_SETTINGS };
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
        console.log('[SETTINGS] Saved:', appSettings);
    } catch (e) {
        console.error('[SETTINGS] Save error:', e);
    }
}

function initSettingsHandlers() {
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const modalSettings = document.getElementById('modal-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const togglePrintBill = document.getElementById('setting-print-bill');

    if (btnOpenSettings && modalSettings) {
        btnOpenSettings.addEventListener('click', () => {
            // Load current settings into UI
            if (togglePrintBill) {
                togglePrintBill.checked = appSettings.printBillEnabled;
            }
            openModal(modalSettings);
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            // Save settings from UI
            if (togglePrintBill) {
                appSettings.printBillEnabled = togglePrintBill.checked;
            }
            saveSettings();
            closeModal(modalSettings);
            notificationManager.success('Đã lưu cài đặt');
        });
    }
}

function initLoadingOverlay() {
    elements.loadingOverlay.id = 'loading-overlay';
    elements.loadingOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255,255,255,0.7); z-index: 9999;
        display: none; align-items: center; justify-content: center;
        font-size: 1.5rem; color: #333;
    `;
    elements.loadingOverlay.innerHTML = '<div>⏳ Đang xử lý...</div>';
    document.body.appendChild(elements.loadingOverlay);
}

function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function initTabs() {
    elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDashboard(btn.dataset.tab);
        });
    });

    // Type filter tabs (replaces #filter-type select)
    const typeTabBtns = document.querySelectorAll('#type-tabs .type-tab-btn');
    typeTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            typeTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'pending-goods';
            const term = (document.getElementById('search-ticket')?.value || '').toLowerCase().trim();
            renderDashboard(activeTab, term);
        });
    });
}

function initModalHandlers() {
    // Open Create Modal
    elements.btnCreate.addEventListener('click', () => {
        openModal(elements.modalCreate);
        resetCreateForm();
        // Focus search input
        setTimeout(() => elements.inpSearchOrder.focus(), 100);
    });

    // Close Modals
    elements.closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal'));
        });
    });

    // Dashboard Search Input Listener (with server-side fallback)
    let searchDebounceTimer = null;
    const searchInput = document.getElementById('search-ticket');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            const localCount = renderDashboard(activeTab, term);

            // If no local results and search term >= 3 chars, try server-side search
            clearTimeout(searchDebounceTimer);
            if (localCount === 0 && term.length >= 3) {
                searchDebounceTimer = setTimeout(async () => {
                    try {
                        const serverResults = await ApiService.searchTicketsServer(term);
                        if (serverResults.length > 0 && searchInput.value.toLowerCase().trim() === term) {
                            // Merge server results into TICKETS (avoid duplicates)
                            const existingIds = new Set(TICKETS.map(t => t.ticketCode));
                            const newTickets = serverResults.filter(t => !existingIds.has(t.ticketCode));
                            if (newTickets.length > 0) {
                                TICKETS.push(...newTickets);
                                console.log(`[SEARCH] Added ${newTickets.length} tickets from server`);
                            }
                            // Re-render with merged data
                            renderDashboard(activeTab, term);
                        }
                    } catch (err) {
                        console.error('[SEARCH] Server search failed:', err);
                    }
                }, 500);
            }
        });
    }

    // Modal Search Button
    elements.btnSearchOrder.addEventListener('click', handleSearchOrder);

    // Modal Search Enter Key
    elements.inpSearchOrder.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearchOrder();
    });

    // Modal Search Tabs (SĐT/Tên vs Mã đơn)
    const setSearchTab = (tab) => {
        currentSearchTab = tab;
        const isCustomer = tab === 'customer';
        elements.tabSearchCustomer.classList.toggle('active', isCustomer);
        elements.tabSearchCustomer.setAttribute('aria-selected', isCustomer);
        elements.tabSearchCode.classList.toggle('active', !isCustomer);
        elements.tabSearchCode.setAttribute('aria-selected', !isCustomer);
        elements.inpSearchOrder.placeholder = isCustomer ? 'Nhập SĐT hoặc Tên khách' : 'Nhập Mã đơn';
        elements.inpSearchOrder.value = '';
        elements.inpSearchOrder.focus();
    };
    elements.tabSearchCustomer.addEventListener('click', () => setSearchTab('customer'));
    elements.tabSearchCode.addEventListener('click', () => setSearchTab('code'));

    // Modal Submit Ticket
    document.getElementById('btn-submit-ticket').addEventListener('click', handleSubmitTicket);

    // Modal Confirm Action - "Xác Nhận" button triggers refund flow
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    if (btnConfirmYes) {
        btnConfirmYes.addEventListener('click', handleConfirmAction);
    }


    // Partial Return Checkbox Logic
    const fixCodReason = document.getElementById('fix-cod-reason');
    console.log('[INIT] fix-cod-reason element:', fixCodReason);
    if (fixCodReason) {
        fixCodReason.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to fix-cod-reason');
    } else {
        console.warn('[INIT] fix-cod-reason element NOT FOUND');
    }

    const issueTypeSelect = document.getElementById('issue-type-select');
    console.log('[INIT] issue-type-select element:', issueTypeSelect);
    if (issueTypeSelect) {
        issueTypeSelect.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to issue-type-select');
    } else {
        console.warn('[INIT] issue-type-select element NOT FOUND');
    }
}

/**
 * NEW: Helper function to normalize phone numbers
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = String(phone).replace(/\s/g, ''); // Remove all spaces
    if (normalized.startsWith('+84')) {
        normalized = '0' + normalized.substring(3);
    }
    if (!normalized.startsWith('0')) {
        normalized = '0' + normalized;
    }
    return normalized;
}

/**
 * CORE LOGIC
 */

async function handleSearchOrder() {
    const query = elements.inpSearchOrder.value.trim();
    if (!query) return alert("Vui lòng nhập từ khóa tìm kiếm");

    // Determine search mode from active tab
    let searchArg;
    if (currentSearchTab === 'code') {
        const cleanCode = query.replace(/\D/g, '');
        if (cleanCode.length < 1) return alert("Vui lòng nhập Mã đơn hợp lệ");
        searchArg = { mode: 'code', value: cleanCode };
    } else {
        // customer tab: phone if all digits, else name
        const digits = query.replace(/\D/g, '');
        const isPhone = digits.length === query.replace(/\s/g, '').length && digits.length >= 3;
        if (isPhone) {
            searchArg = { mode: 'phone', value: digits };
        } else {
            if (query.length < 2) return alert("Vui lòng nhập tên ít nhất 2 ký tự");
            // Strip Vietnamese diacritics — TPOS field PartnerNameNoSign is unaccented
            const noSign = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
            searchArg = { mode: 'name', value: noSign };
        }
    }

    showLoading(true);
    try {
        const result = await ApiService.searchOrders(searchArg);
        const orders = result.orders || result; // Support both new {orders, allCancelled} and legacy array format

        if (orders && orders.length > 0) {
            if (orders.length === 1) {
                // Only 1 result - auto select
                selectOrder(orders[0]);
            } else {
                // Multiple results - show selection list
                showOrderSelectionList(orders);
            }
        } else if (result.allCancelled) {
            // All orders found were cancelled/draft
            hideOrderSelectionList();
            showSearchMessage('⚠️ Toàn bộ đơn hàng của SĐT này đã bị hủy hoặc đang ở trạng thái nháp. Không thể tạo phiếu.', 'warning');
        } else {
            // No orders found, try to search for customer
            hideOrderSelectionList();
            await searchCustomerByPhone(query);
            // If customer found, we'll display their info. If not, the "new customer" warning will show.
        }
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tìm kiếm đơn hàng: " + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Search for customer by phone and display info
 * @param {string} phone - Customer phone number
 */
async function searchCustomerByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;

    showLoading(true);
    try {
        const customerData = await ApiService.getCustomer360(normalizedPhone); // Use getCustomer360 for now

        if (customerData && customerData.customer) {
            // Customer found, display info
            currentCustomer = customerData.customer; // Store full customer object
            elements.customerInfoSection.classList.remove('hidden');
            elements.customerInfoName.textContent = currentCustomer.name || 'N/A';
            elements.customerInfoPhone.textContent = currentCustomer.phone || 'N/A';
            elements.customerInfoTier.textContent = currentCustomer.tier || 'New';
            elements.customerInfoWalletBalance.textContent = formatCurrency(customerData.wallet?.balance || 0);
            elements.customerInfoNewCustomerWarning.classList.add('hidden');

            // Hide order result and show issue form directly
            document.getElementById('order-result').classList.add('hidden');
            document.getElementById('issue-details-form').classList.remove('hidden');

        } else {
            // Customer not found on TPOS - show clear message
            showSearchMessage('❌ Khách hàng không tồn tại trên TPOS. Vui lòng kiểm tra lại số điện thoại.', 'error');
            currentCustomer = null;
            selectedOrder = null;
        }
    } catch (error) {
        console.error('Error searching customer:', error);
        // Show error message
        showSearchMessage('❌ Lỗi khi tìm kiếm khách hàng: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Select an order and display its details (with products)
 * @param {Object} order - Order object from TPOS
 */
async function selectOrder(order) {
    selectedOrder = order;
    currentCustomer = null; // Reset current customer when an order is selected
    selectedOldOrder = null; // Reset old order selection for RETURN_OLD_ORDER

    // Reset issue type and related UI when selecting a new order
    document.getElementById('issue-type-select').value = '';
    document.getElementById('ticket-note').value = '';

    // Reset RETURN_OLD_ORDER UI section
    const oldOrdersList = document.getElementById('old-orders-list');
    const oldOrderProductsSection = document.getElementById('old-order-products-section');
    const oldOrderSearchInput = document.getElementById('old-order-search-input');
    if (oldOrdersList) {
        oldOrdersList.innerHTML = '';
        oldOrdersList.classList.add('hidden');
        delete oldOrdersList.dataset.orders;
    }
    if (oldOrderProductsSection) {
        oldOrderProductsSection.classList.add('hidden');
        const checklist = document.getElementById('old-order-product-checklist');
        if (checklist) checklist.innerHTML = '';
    }
    if (oldOrderSearchInput) {
        oldOrderSearchInput.value = '';
    }

    // Reset FIX_COD fields
    const fixCodReason = document.getElementById('fix-cod-reason');
    const codReduceAmount = document.getElementById('cod-reduce-amount');
    if (fixCodReason) fixCodReason.value = '';
    if (codReduceAmount) codReduceAmount.value = '';

    // Reset BOOM reason
    const boomReasonEl = document.getElementById('boom-reason');
    if (boomReasonEl) boomReasonEl.value = 'BOOM_HANG';

    // Hide all dynamic field groups
    document.querySelectorAll('[data-type]').forEach(group => {
        group.classList.add('hidden');
    });

    document.getElementById('order-result').classList.remove('hidden');
    document.getElementById('issue-details-form').classList.remove('hidden');
    elements.customerInfoSection.classList.add('hidden'); // Hide customer info section when order is selected
    elements.customerInfoNewCustomerWarning.classList.add('hidden'); // Hide new customer warning

    // Fill basic order info
    document.getElementById('res-customer').textContent = order.customer;
    document.getElementById('res-phone').textContent = order.phone;
    document.getElementById('res-order-code').textContent = order.tposCode;
    document.getElementById('res-address').textContent = order.address || 'Chưa có địa chỉ';

    // NEW: Attempt to fetch and display customer info based on the order's phone
    if (order.phone) {
        try {
            const customerDetails = await ApiService.getCustomer360(normalizePhone(order.phone));
            if (customerDetails && customerDetails.customer) {
                currentCustomer = customerDetails.customer;
                elements.customerInfoSection.classList.remove('hidden');
                elements.customerInfoName.textContent = currentCustomer.name || 'N/A';
                elements.customerInfoPhone.textContent = currentCustomer.phone || 'N/A';
                elements.customerInfoTier.textContent = currentCustomer.tier || 'New';
                elements.customerInfoWalletBalance.textContent = formatCurrency(customerDetails.wallet?.balance || 0);
            } else {
                // If customer not found for this phone, still show warning as it will be created via ticket
                elements.customerInfoSection.classList.remove('hidden');
                elements.customerInfoName.textContent = 'Khách hàng mới';
                elements.customerInfoPhone.textContent = order.phone;
                elements.customerInfoTier.textContent = 'New';
                elements.customerInfoWalletBalance.textContent = formatCurrency(0);
                elements.customerInfoNewCustomerWarning.classList.remove('hidden');

                currentCustomer = { // Minimal object for new customer related to this order
                    name: 'Khách hàng mới',
                    phone: normalizePhone(order.phone),
                    tier: 'New',
                    wallet_balance: 0
                };
            }
        } catch (error) {
            console.error('Error fetching customer details for selected order:', error);
            // Fallback to new customer warning if API fails
            elements.customerInfoSection.classList.remove('hidden');
            elements.customerInfoName.textContent = 'Lỗi tải thông tin';
            elements.customerInfoPhone.textContent = order.phone;
            elements.customerInfoTier.textContent = 'N/A';
            elements.customerInfoWalletBalance.textContent = '0đ';
            elements.customerInfoNewCustomerWarning.classList.remove('hidden');

            currentCustomer = null; // Clear if error
        }
    }

    // Show loading state
    document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#64748b;">Đang tải sản phẩm...</td></tr>';
    const checklist = document.getElementById('product-checklist');
    checklist.innerHTML = '<p style="color:#64748b;font-size:12px">Đang tải...</p>';

    // Hide order selection list
    hideOrderSelectionList();

    // Fetch full order details with products
    try {
        const details = await ApiService.getOrderDetails(order.id);
        if (details && details.products && details.products.length > 0) {
            // Update selectedOrder with full details, but preserve phone from searchOrders if details.phone is missing
            const preservedPhone = selectedOrder.phone;
            selectedOrder = { ...selectedOrder, ...details };
            // Restore phone if it was overwritten with undefined/null
            if (!selectedOrder.phone && preservedPhone) {
                selectedOrder.phone = preservedPhone;
            }

            // Display products in table
            const productsTableHTML = details.products.map(p => {
                const noteDisplay = p.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">(${p.note})</div>` : '';
                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 8px;">
                            <div><strong>[${p.code}]</strong> ${p.name}</div>
                            ${noteDisplay}
                        </td>
                        <td style="padding:6px 8px;text-align:center;">${p.quantity}</td>
                        <td style="padding:6px 8px;text-align:right;">${formatCurrency(p.price)}</td>
                    </tr>
                `;
            }).join('');
            document.getElementById('res-products-table').innerHTML = productsTableHTML;

            // Calculate totals
            const totalQty = details.products.reduce((sum, p) => sum + p.quantity, 0);
            const finalTotal = details.amountTotal - details.decreaseAmount + details.deliveryPrice;

            // Update summary fields
            document.getElementById('res-total-qty').textContent = totalQty;
            document.getElementById('res-amount-total').textContent = formatCurrency(details.amountTotal);
            document.getElementById('res-decrease-amount').textContent = formatCurrency(details.decreaseAmount);
            document.getElementById('res-delivery-price').textContent = formatCurrency(details.deliveryPrice);
            document.getElementById('res-final-total').textContent = formatCurrency(finalTotal);
            document.getElementById('res-payment-amount').textContent = formatCurrency(details.paymentAmount);
            document.getElementById('res-cod').textContent = formatCurrency(details.cod);

            // Generate product checklist for partial return (with quantity input)
            checklist.innerHTML = details.products.map(p => `
                <div class="checkbox-item" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;border:1px solid #e2e8f0;border-radius:4px;">
                    <input type="checkbox" value="${p.id}" id="prod-${p.id}" checked
                           data-price="${p.price}" data-qty="${p.quantity}"
                           onchange="updateCodReduceFromProducts()" style="margin:0;">
                    <label for="prod-${p.id}" style="flex:1;margin:0;cursor:pointer;">[${p.code}] ${p.name} - ${formatCurrency(p.price)}</label>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:11px;color:#64748b;">SL:</span>
                        <input type="number"
                               id="prod-qty-${p.id}"
                               value="${p.quantity}"
                               min="1"
                               max="${p.quantity}"
                               onchange="updateCodReduceFromProducts()"
                               style="width:50px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:3px;text-align:center;font-size:12px;">
                    </div>
                </div>
            `).join('');
        } else {
            // No products found
            document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#ef4444;">Không tìm thấy sản phẩm</td></tr>';
            checklist.innerHTML = `<p style="color:#64748b;font-size:12px">Mã đơn: ${order.tposCode} | ${order.carrier || 'N/A'}</p>`;
        }
    } catch (err) {
        console.error('[APP] Failed to load order details:', err);
        const isServerError = err.message && (err.message.includes('502') || err.message.includes('503'));
        const errorMsg = isServerError
            ? 'Hệ thống TPOS đang quá tải, vui lòng thử lại sau ít phút.'
            : `Lỗi tải sản phẩm: ${err.message || 'Không xác định'}`;
        document.getElementById('res-products-table').innerHTML = `<tr><td colspan="3" style="text-align:center;padding:10px;color:#ef4444;">${errorMsg}</td></tr>`;
        checklist.innerHTML = `<p style="color:#ef4444;font-size:12px;">${errorMsg} Mã đơn: ${order.tposCode}</p>`;
    }
}

/**
 * Show list of orders for user to select
 * @param {Array} orders - Array of order objects
 */
function showOrderSelectionList(orders) {
    // Store orders for selection by index
    window._searchedOrders = orders;

    // Helper: translate State to Vietnamese
    const translateState = (state) => {
        const map = {
            'draft': 'Nháp',
            'open': 'Đã xác nhận',
            'paid': 'Đã thanh toán',
            'cancel': 'Hủy bỏ'
        };
        return map[state] || state;
    };

    // Helper: translate StateCode to Vietnamese
    const translateStateCode = (stateCode) => {
        const map = {
            'CrossCheckComplete': 'Đã ĐS SP',
            'NotEnoughInventory': 'Không đủ tồn',
            'None': 'Chưa ĐS SP'
        };
        return map[stateCode] || stateCode;
    };

    // Create or get element
    let listEl = document.getElementById('order-selection-list');
    if (!listEl) {
        listEl = document.createElement('div');
        listEl.id = 'order-selection-list';
        listEl.className = 'order-selection-list';
        document.querySelector('.search-section').appendChild(listEl);
    }

    listEl.innerHTML = `
        <div style="padding:10px;background:#f1f5f9;border-radius:6px;margin-top:10px;max-height:300px;overflow-y:auto;">
            <p style="font-weight:600;margin-bottom:8px;">Tìm thấy ${orders.length} đơn hàng:</p>
            ${orders.map((o, i) => `
                <div class="order-option" onclick="selectOrderByIndex(${i})"
                     style="padding:10px;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:6px;cursor:pointer;background:white;transition:all 0.2s;"
                     onmouseover="this.style.borderColor='#3b82f6';this.style.background='#eff6ff'"
                     onmouseout="this.style.borderColor='#e2e8f0';this.style.background='white'">
                    <div style="font-weight:500;color:#1e293b">${o.customer} - ${o.phone}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px">
                        ${o.tposCode} | COD: ${formatCurrency(o.cod)} | ${o.carrier || 'N/A'}
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:2px">
                        ${new Date(o.createdAt).toLocaleDateString('vi-VN')} -
                        <span style="color:#3b82f6;font-weight:500;">${translateState(o.status)}</span> |
                        <span style="color:${o.stateCode === 'CrossCheckComplete' ? '#10b981' : '#f59e0b'};">${translateStateCode(o.stateCode)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    listEl.classList.remove('hidden');

    // Hide order result and form until selection
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    elements.customerInfoSection.classList.add('hidden'); // Also hide customer info section
}

/**
 * Hide order selection list
 */
function hideOrderSelectionList() {
    const listEl = document.getElementById('order-selection-list');
    if (listEl) {
        listEl.classList.add('hidden');
    }
    // Also hide any search message
    hideSearchMessage();
}

/**
 * Show a message in the search section (for errors, warnings, info)
 * @param {string} message - Message to display
 * @param {string} type - 'warning', 'error', or 'info'
 */
function showSearchMessage(message, type = 'info') {
    // Hide order selection list (without recursion)
    const listEl = document.getElementById('order-selection-list');
    if (listEl) {
        listEl.classList.add('hidden');
    }

    // Create or get message element
    let msgEl = document.getElementById('search-message');
    if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'search-message';
        document.querySelector('.search-section').appendChild(msgEl);
    }

    // Style based on type
    const colors = {
        warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
        error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
        info: { bg: '#e0f2fe', border: '#0ea5e9', text: '#0c4a6e' }
    };
    const style = colors[type] || colors.info;

    msgEl.innerHTML = `
        <div style="padding:12px;background:${style.bg};border:1px solid ${style.border};border-radius:6px;margin-top:10px;color:${style.text};">
            ${message}
        </div>
    `;
    msgEl.classList.remove('hidden');

    // Hide other sections
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    elements.customerInfoSection.classList.add('hidden');
}

/**
 * Hide search message
 */
function hideSearchMessage() {
    const msgEl = document.getElementById('search-message');
    if (msgEl) {
        msgEl.classList.add('hidden');
    }
}

/**
 * Select order by index (called from onclick)
 */
window.selectOrderByIndex = function (index) {
    if (window._searchedOrders && window._searchedOrders[index]) {
        selectOrder(window._searchedOrders[index]);
    }
};

function handleIssueTypeChange(e) {
    console.log('[DEBUG] handleIssueTypeChange called');

    // Logic to toggle visibility of fields
    const issueType = document.getElementById('issue-type-select').value;
    const fixCodReason = document.getElementById('fix-cod-reason').value;

    console.log('[DEBUG] Issue Type:', issueType, 'Fix COD Reason:', fixCodReason);

    const dynamicFields = document.getElementById('dynamic-fields');
    const fixCodGroup = dynamicFields.querySelector('[data-type="FIX_COD"]');
    const returnGroup = dynamicFields.querySelector('[data-type="RETURN"]');

    console.log('[DEBUG] Elements found:', {
        dynamicFields: !!dynamicFields,
        fixCodGroup: !!fixCodGroup,
        returnGroup: !!returnGroup
    });

    // Reset all first
    if (fixCodGroup) fixCodGroup.classList.add('hidden');
    if (returnGroup) returnGroup.classList.add('hidden');

    const trackingGroup = document.getElementById('tracking-input-group');
    const shipperGroup = document.getElementById('shipper-input-group');
    if (trackingGroup) trackingGroup.classList.add('hidden');
    if (shipperGroup) shipperGroup.classList.add('hidden');

    if (issueType === 'FIX_COD') {
        console.log('[DEBUG] Showing FIX_COD fields');
        if (fixCodGroup) fixCodGroup.classList.remove('hidden');

        // Special Case: Partial Return in Fix COD
        if (fixCodReason === 'REJECT_PARTIAL') {
            console.log('[DEBUG] Showing RETURN fields for REJECT_PARTIAL');
            if (returnGroup) returnGroup.classList.remove('hidden');
        }
    } else if (['RETURN_CLIENT', 'RETURN_SHIPPER', 'BOOM'].includes(issueType)) {
        console.log('[DEBUG] Showing RETURN fields for', issueType);
        if (returnGroup) returnGroup.classList.remove('hidden');

        if (issueType === 'RETURN_CLIENT') {
            if (trackingGroup) trackingGroup.classList.remove('hidden');
        } else if (issueType === 'RETURN_SHIPPER') {
            if (shipperGroup) shipperGroup.classList.remove('hidden');
        } else if (issueType === 'BOOM') {
            // Show BOOM sub-reason dropdown
            const boomReasonGroup = dynamicFields.querySelector('[data-type="BOOM_REASON"]');
            if (boomReasonGroup) boomReasonGroup.classList.remove('hidden');
            onBoomReasonChange(); // Show initial hint
        }
    }

    console.log('[DEBUG] Final state:', {
        fixCodHidden: fixCodGroup?.classList.contains('hidden'),
        returnHidden: returnGroup?.classList.contains('hidden')
    });
}


// Calculate COD Remaining and Diff for Fix COD
window.calculateCodRemaining = function() {
    if (!selectedOrder) return;
    const codReduce = parseInt(document.getElementById('cod-reduce-amount').value) || 0;
    const codRemaining = selectedOrder.cod - codReduce;

    document.getElementById('cod-remaining-display').textContent = formatCurrency(codRemaining);
    document.getElementById('cod-diff-display').textContent = formatCurrency(codReduce);
}

// Handle FIX_COD reason change
window.onFixCodReasonChange = function() {
    const reason = document.getElementById('fix-cod-reason').value;
    const codReduceInput = document.getElementById('cod-reduce-amount');
    const editBtn = document.getElementById('btn-edit-cod-reduce');
    const returnGroup = document.querySelector('[data-type="RETURN"]');
    const returnOldOrderGroup = document.querySelector('[data-type="RETURN_OLD_ORDER"]');

    // Ẩn tất cả các section phụ thuộc trước
    if (returnGroup) returnGroup.classList.add('hidden');
    if (returnOldOrderGroup) returnOldOrderGroup.classList.add('hidden');

    if (reason === 'REJECT_PARTIAL') {
        // Tự động tính COD giảm = tổng giá SP được chọn trả
        codReduceInput.readOnly = true;
        codReduceInput.style.backgroundColor = '#f1f5f9';
        // Show edit button
        if (editBtn) editBtn.style.display = 'block';
        // Show product checklist
        if (returnGroup) returnGroup.classList.remove('hidden');

        // Bỏ check tất cả sản phẩm để user tự chọn món trả lại
        const checkboxes = document.querySelectorAll('#product-checklist input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Reset COD giảm về 0
        codReduceInput.value = 0;
        calculateCodRemaining();

    } else if (reason === 'RETURN_OLD_ORDER') {
        // === Logic mới cho RETURN_OLD_ORDER ===
        codReduceInput.readOnly = true;
        codReduceInput.style.backgroundColor = '#f1f5f9';
        if (editBtn) editBtn.style.display = 'block';
        if (returnOldOrderGroup) returnOldOrderGroup.classList.remove('hidden');

        // Tự điền SĐT từ đơn hiện tại
        const oldOrderSearchInput = document.getElementById('old-order-search-input');
        if (oldOrderSearchInput && selectedOrder) {
            oldOrderSearchInput.value = selectedOrder.phone || '';
        }

        // Reset COD giảm về 0
        codReduceInput.value = 0;
        calculateCodRemaining();

        // Reset selectedOldOrder
        selectedOldOrder = null;

    } else {
        // Cho phép nhập tay
        codReduceInput.readOnly = false;
        codReduceInput.style.backgroundColor = '';
        // Hide edit button
        if (editBtn) editBtn.style.display = 'none';

        // Check lại tất cả sản phẩm (cho các loại khác như THU VỀ, BOOM)
        const checkboxes = document.querySelectorAll('#product-checklist input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
    }
}

// Handle BOOM reason change
window.onBoomReasonChange = function() {
    const reason = document.getElementById('boom-reason')?.value;
    const hintEl = document.getElementById('boom-reason-hint');
    if (!hintEl) return;

    const hints = {
        'BOOM_HANG': '<span style="color:#ef4444;">⚠️ Khách boom - Lưu ý đơn sau</span>',
        'TRUNG_DON': '<span style="color:#3b82f6;">ℹ️ Xả đơn cũ, nhập kho, đi đơn mới</span>',
        'DOI_DIA_CHI': '<span style="color:#3b82f6;">ℹ️ Hoàn về, nhập kho, đi lại đơn mới</span>',
        'KHAC': '<span style="color:#3b82f6;">ℹ️ Hoàn về, nhập kho</span>'
    };
    hintEl.innerHTML = hints[reason] || '';
};

// Toggle COD Reduce edit mode (for REJECT_PARTIAL)
window.toggleCodReduceEdit = function() {
    const codReduceInput = document.getElementById('cod-reduce-amount');
    const editBtn = document.getElementById('btn-edit-cod-reduce');

    if (codReduceInput.readOnly) {
        // Enable manual editing
        codReduceInput.readOnly = false;
        codReduceInput.style.backgroundColor = '';
        codReduceInput.focus();
        if (editBtn) editBtn.innerHTML = '🔒';
        if (editBtn) editBtn.title = 'Khóa & tính tự động';
    } else {
        // Lock and recalculate from products
        codReduceInput.readOnly = true;
        codReduceInput.style.backgroundColor = '#f1f5f9';
        if (editBtn) editBtn.innerHTML = '✏️';
        if (editBtn) editBtn.title = 'Chỉnh sửa thủ công';
        updateCodReduceFromProducts();
    }
}

// Calculate COD reduce from selected products (for REJECT_PARTIAL)
function updateCodReduceFromProducts() {
    const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
    let totalReduce = 0;

    checkedInputs.forEach(cb => {
        const productId = cb.value;
        const qtyInput = document.getElementById(`prod-qty-${productId}`);
        const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        const price = parseFloat(cb.dataset.price) || 0;
        totalReduce += price * qty;
    });

    document.getElementById('cod-reduce-amount').value = totalReduce;
    calculateCodRemaining();
}

// Expose for checkbox/quantity change events
window.updateCodReduceFromProducts = updateCodReduceFromProducts;

// Toggle all product checkboxes (select all / deselect all)
window.toggleAllProducts = function (selectAll, containerId = 'product-checklist') {
    const checkboxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    checkboxes.forEach(cb => { cb.checked = selectAll; });
    // Update COD calculation
    if (containerId === 'old-order-product-checklist') {
        if (typeof updateCodReduceFromOldOrderProducts === 'function') updateCodReduceFromOldOrderProducts();
    } else {
        updateCodReduceFromProducts();
    }
};

/**
 * Check if a RETURN ticket already exists for this order
 * Prevents creating duplicate RETURN_CLIENT or RETURN_SHIPPER tickets
 * @param {string} orderId - TPOS order code (e.g., NJD/2025/xxx)
 * @returns {{exists: boolean, ticketCode: string|null}} - Whether a return ticket exists
 */
/**
 * Mark all TPOS Partner records for a phone as "Bom hàng"
 * Step 1: Search Partner by phone (dùng Name= như TPOS UI), sort DateCreated desc
 * Step 2: UpdateStatus atomic cho TẤT CẢ partner trùng SĐT
 * Step 3: Ghi note vào field Email cho TẤT CẢ partner trùng SĐT (best-effort)
 */
async function markPartnerAsBoom(phone, noteText) {
    if (!phone) throw new Error('Không có số điện thoại khách');

    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'feature-version': '2',
        'x-tpos-lang': 'vi'
    };

    // Step 1: Search all Partner IDs by phone (dùng Name= như TPOS UI native)
    const searchUrl = `${API_CONFIG.TPOS_ODATA}/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Name=${encodeURIComponent(phone)}&$top=50&$orderby=DateCreated+desc&$filter=Type+eq+'Customer'&$count=true`;

    const searchResponse = await window.tokenManager.authenticatedFetch(searchUrl, {
        method: 'GET',
        headers
    });

    if (!searchResponse.ok) {
        throw new Error(`Tìm khách thất bại (HTTP ${searchResponse.status})`);
    }

    const searchData = await searchResponse.json();
    const partners = searchData.value || [];

    if (partners.length === 0) {
        console.log('[BOOM] No partners found for phone:', phone);
        return;
    }

    console.log(`[BOOM] Found ${partners.length} partner(s) for phone ${phone}`);

    // Step 2: Atomic UpdateStatus for each partner
    // Format: "{color}_{text}" — TPOS parses & sets StatusStyle + StatusText server-side
    const statusPayload = JSON.stringify({ status: '#d1332e_Bom hàng' });
    for (const partner of partners) {
        const updateUrl = `${API_CONFIG.TPOS_ODATA}/Partner(${partner.Id})/ODataService.UpdateStatus`;
        const res = await window.tokenManager.authenticatedFetch(updateUrl, {
            method: 'POST',
            headers,
            body: statusPayload
        });
        if (!res.ok) {
            throw new Error(`Cập nhật trạng thái khách ${partner.Id} thất bại (HTTP ${res.status})`);
        }
        console.log(`[BOOM] Successfully marked partner ${partner.Id} as "Bom hàng"`);
    }

    // Step 3: Overwrite Email field với note cho TẤT CẢ partner trùng SĐT (best-effort)
    if (noteText) {
        for (const partner of partners) {
            try {
                const partnerUrl = `${API_CONFIG.TPOS_ODATA}/Partner(${partner.Id})`;
                const getRes = await window.tokenManager.authenticatedFetch(partnerUrl, {
                    method: 'GET',
                    headers
                });
                if (!getRes.ok) {
                    console.warn(`[BOOM] GET partner ${partner.Id} for note failed (HTTP ${getRes.status})`);
                    continue;
                }
                const partnerData = await getRes.json();
                partnerData.Email = noteText;
                partnerData.Zalo = noteText;
                partnerData.Facebook = noteText;
                partnerData.Website = noteText;
                const putRes = await window.tokenManager.authenticatedFetch(partnerUrl, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(partnerData)
                });
                if (!putRes.ok) {
                    console.warn(`[BOOM] PUT note for partner ${partner.Id} failed (HTTP ${putRes.status})`);
                }
            } catch (err) {
                console.warn(`[BOOM] Update note for partner ${partner.Id} error:`, err);
            }
        }
    }

    console.log('[BOOM] All partner updates completed');
}

function checkExistingReturnTicket(orderId) {
    if (!orderId) return { exists: false, ticketCode: null };

    // Search in local TICKETS array for existing RETURN tickets (exclude CANCELLED)
    const existingTicket = TICKETS.find(ticket =>
        ticket.orderId === orderId &&
        (ticket.type === 'RETURN_CLIENT' || ticket.type === 'RETURN_SHIPPER') &&
        ticket.status !== 'CANCELLED'
    );

    if (existingTicket) {
        return {
            exists: true,
            ticketCode: existingTicket.ticketCode,
            ticketType: existingTicket.type
        };
    }

    return { exists: false, ticketCode: null };
}

async function handleSubmitTicket() {
    // Prevent double-click
    if (isSubmitting) return;

    // If selectedOrder is a minimal object for a new customer
    const isNewCustomerTicket = selectedOrder && !selectedOrder.tposCode;

    if (!selectedOrder && !currentCustomer) return alert("Chưa chọn đơn hàng hoặc SĐT khách hàng!");

    const type = document.getElementById('issue-type-select').value;
    if (!type) return alert("Vui lòng chọn loại vấn đề");

    let status = 'PENDING_GOODS';
    let money = 0;
    let note = document.getElementById('ticket-note').value;
    let selectedProducts = [];

    // Determine channel: TP if HCM, J&T otherwise
    const address = selectedOrder?.address || (currentCustomer ? 'N/A' : ''); // Use customer address if no order
    const channel = address.includes('Hồ Chí Minh') || address.includes('HCM') || address.includes('TP HCM')
        ? 'TP'
        : 'J&T';

    // Logic for Status & Money based on type
    if (type === 'FIX_COD') {
        const fixCodReason = document.getElementById('fix-cod-reason').value;
        const codReduce = parseInt(document.getElementById('cod-reduce-amount').value) || 0;
        money = codReduce; // COD Giảm chính là số tiền phải trả ĐVVC

        if (fixCodReason === 'REJECT_PARTIAL') {
            // Validation: Đơn phải có >= 2 món (tính theo tổng số lượng, không phải số mã)
            const totalQty = selectedOrder?.products?.reduce((sum, p) => sum + p.quantity, 0) || 0;
            if (selectedOrder && totalQty < 2) {
                return alert("Đơn hàng chỉ có 1 món. Nếu khách không nhận, vui lòng chọn 'Boom Hàng'.");
            }

            // Khách nhận 1 phần - có hàng hoàn về
            status = 'PENDING_GOODS';
            // Get selected products with quantities
            const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
            selectedProducts = Array.from(checkedInputs).map(cb => {
                const productId = cb.value;
                const qtyInput = document.getElementById(`prod-qty-${productId}`);
                const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
                const product = selectedOrder?.products?.find(p => String(p.id) === String(productId));
                return {
                    ...product,
                    returnQuantity: returnQty
                };
            });

            // Validation: Phải chọn ít nhất 1 món trả
            if (selectedProducts.length === 0) {
                return alert("Vui lòng chọn ít nhất 1 món hàng khách trả lại.");
            }
            // Validation: Không được trả toàn bộ (đó là BOOM)
            const totalReturnQty = selectedProducts.reduce((sum, p) => sum + (p.returnQuantity || 1), 0);
            const totalOrderQty = selectedOrder?.products?.reduce((sum, p) => sum + p.quantity, 0) || 0;
            if (selectedOrder && totalReturnQty >= totalOrderQty) {
                return alert("Khách trả toàn bộ món hàng. Vui lòng chọn 'Boom Hàng' thay vì 'Nhận 1 phần'.");
            }

        } else if (fixCodReason === 'RETURN_OLD_ORDER') {
            // === LOGIC MỚI: Trả hàng đơn cũ ===

            // Validation: phải chọn đơn cũ
            if (!selectedOldOrder) {
                return alert('Vui lòng chọn đơn hàng cũ cần trả');
            }

            // Validation: phải chọn ít nhất 1 sản phẩm
            const checkedOldOrderInputs = document.querySelectorAll('#old-order-product-checklist input[type="checkbox"]:checked');
            if (checkedOldOrderInputs.length === 0) {
                return alert('Vui lòng chọn ít nhất 1 sản phẩm từ đơn cũ để trả');
            }

            // Status: PENDING_GOODS (chờ hàng cũ về kho)
            status = 'PENDING_GOODS';

            // Lấy sản phẩm được chọn từ đơn cũ (include productId và code for matching)
            selectedProducts = Array.from(checkedOldOrderInputs).map(input => {
                const productId = input.value;
                const qtyInput = document.getElementById(`old-prod-qty-${productId}`);
                const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
                const unitPrice = parseInt(input.dataset.unitPrice) || 0;

                return {
                    id: productId,
                    productId: input.dataset.productId || '',
                    code: input.dataset.code || '',
                    name: input.dataset.name,
                    price: unitPrice * returnQty,  // Tổng giá theo số lượng trả
                    quantity: parseInt(input.dataset.quantity) || 1,
                    returnQuantity: returnQty
                };
            });

        } else {
            // Các lý do khác - không có hàng trả, chỉ đối soát tiền
            status = 'PENDING_FINANCE';
            selectedProducts = []; // Không có sản phẩm
        }
    } else if (type === 'BOOM') {
        // BOOM: COD giảm = toàn bộ COD (khách không nhận gì)
        money = selectedOrder?.cod || 0;
        status = 'PENDING_GOODS';

        // Tất cả sản phẩm đều hoàn về (if order selected)
        selectedProducts = selectedOrder?.products?.map(p => ({
            ...p,
            returnQuantity: p.quantity
        })) || [];
    } else if (type === 'RETURN_CLIENT' || type === 'RETURN_SHIPPER') {
        // Thu về/Khách gửi: Đã thu COD xong, giờ là giá trị hàng hoàn
        status = 'PENDING_GOODS';

        // Get selected products with return quantities (if order selected)
        const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
        selectedProducts = Array.from(checkedInputs).map(cb => {
            const productId = cb.value;
            const qtyInput = document.getElementById(`prod-qty-${productId}`);
            const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
            const product = selectedOrder?.products?.find(p => String(p.id) === String(productId));
            return {
                ...product,
                returnQuantity: returnQty
            };
        });

        // Giá trị hoàn = tổng giá trị sản phẩm trả về
        money = selectedProducts.reduce((sum, p) => sum + (p.price * p.returnQuantity), 0);
    } else if (type === 'OTHER') {
        status = 'COMPLETED';
        money = 0;
        selectedProducts = [];
    }

    // Use selectedOrder data if available, otherwise use currentCustomer data
    const customerPhone = selectedOrder?.phone || currentCustomer?.phone;
    const customerName = selectedOrder?.customer || currentCustomer?.name;
    const tposOrderId = selectedOrder?.tposCode; // TPOS order code (e.g., NJD/2025/xxx)
    const tposInternalId = selectedOrder?.id; // TPOS internal ID (number)
    const orderAddress = selectedOrder?.address;
    const orderStatus = selectedOrder?.status;
    const orderStateCode = selectedOrder?.stateCode;

    if (!customerPhone) return alert("Không tìm thấy thông tin số điện thoại khách hàng!");

    // VALIDATION: Check for duplicate RETURN tickets (1 đơn = 1 ticket hoàn hàng)
    if ((type === 'RETURN_CLIENT' || type === 'RETURN_SHIPPER') && tposOrderId) {
        const existingReturn = checkExistingReturnTicket(tposOrderId);
        if (existingReturn.exists) {
            const typeLabel = existingReturn.ticketType === 'RETURN_CLIENT' ? 'Khách gửi về' : 'Thu về';
            return alert(`Đơn hàng này đã có ticket hoàn hàng!\n\nMã ticket: ${existingReturn.ticketCode}\nLoại: ${typeLabel}\n\nMỗi đơn hàng chỉ được tạo 1 ticket hoàn hàng.`);
        }
    }

    // VALIDATION: Check for duplicate BOOM tickets (1 đơn = 1 ticket boom)
    if (type === 'BOOM' && tposOrderId) {
        const existingBoom = TICKETS.find(t =>
            t.orderId === tposOrderId &&
            t.type === 'BOOM' &&
            t.status !== 'CANCELLED'
        );
        if (existingBoom) {
            return alert(`Đơn hàng này đã có ticket Boom!\n\nMã ticket: ${existingBoom.code}\n\nMỗi đơn chỉ được tạo 1 ticket Boom.`);
        }
    }

    // VALIDATION: Check for duplicate FIX_COD tickets (1 đơn = 1 ticket fix COD)
    if (type === 'FIX_COD' && tposOrderId) {
        const existingFixCod = TICKETS.find(t =>
            t.orderId === tposOrderId &&
            t.type === 'FIX_COD' &&
            t.status !== 'CANCELLED'
        );
        if (existingFixCod) {
            return alert(`Đơn hàng này đã có ticket Fix COD!\n\nMã ticket: ${existingFixCod.code}\n\nMỗi đơn chỉ được tạo 1 ticket Fix COD.`);
        }
    }


    // Lấy thông tin đơn cũ cho RETURN_OLD_ORDER
    const fixCodReason = type === 'FIX_COD' ? document.getElementById('fix-cod-reason').value : null;
    const boomReason = type === 'BOOM' ? document.getElementById('boom-reason')?.value : null;
    const isReturnOldOrder = type === 'FIX_COD' && fixCodReason === 'RETURN_OLD_ORDER';

    const ticketData = {
        orderId: tposOrderId,
        tposId: tposInternalId,
        customer: customerName,
        phone: customerPhone,
        address: orderAddress,
        type: type,
        fixCodReason: fixCodReason,
        boomReason: boomReason,
        channel: channel,
        status: status,
        orderState: orderStatus || 'open', // Trạng thái đơn TPOS: open, paid
        stateCode: orderStateCode || 'None', // Trạng thái đối soát SP: CrossCheckComplete, None
        products: selectedProducts,
        money: money,
        note: note,
        // RETURN_OLD_ORDER: Reference đến đơn cũ
        returnFromOrderId: isReturnOldOrder ? selectedOldOrder?.tposCode : null,
        returnFromTposId: isReturnOldOrder ? selectedOldOrder?.id : null
    };

    isSubmitting = true;
    const btnSubmit = document.getElementById('btn-submit-ticket');
    btnSubmit.disabled = true;

    showLoading(true);
    try {
        // Audit logging TRƯỚC - ghi nhận thao tác bất kể kết quả tạo phiếu
        try {
            if (window.AuditLogger) {
                window.AuditLogger.logAction('ticket_create', {
                    module: 'issue-tracking',
                    description: 'Tạo phiếu ' + type + ' cho KH ' + customerPhone + (tposOrderId ? ' - Đơn ' + tposOrderId : ''),
                    oldData: null,
                    newData: { type, status, money, customerId: customerPhone, orderId: tposOrderId, channel },
                    entityId: tposOrderId || customerPhone,
                    entityType: 'ticket'
                });
            }
        } catch (e) { console.warn('[AuditLog] ticket_create log failed:', e); }

        await ApiService.createTicket(ticketData);

        // =====================================================
        // RETURN_SHIPPER: KHÔNG tự động cấp virtual_credit khi tạo ticket
        // User phải bấm nút "+ Công Nợ Ảo" để cấp (cần quyền issueVirtualCredit)
        // Flow: Tạo ticket → Bấm "+ Công Nợ Ảo" → Nhận hàng
        // =====================================================

        // =====================================================
        // BOOM_HANG: Mark all TPOS Partner records as "Bom hàng"
        // Also update if there's an internal note (Ghi chú nội bộ)
        // Runs in background - don't block ticket creation success
        // =====================================================
        if (type === 'BOOM' && boomReason === 'BOOM_HANG') {
            // Append creation date to Zalo note (e.g., "do mình test 1/3/2026")
            const now = new Date();
            const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
            const noteWithDate = note ? `${note} ${dateStr}` : dateStr;
            try {
                await markPartnerAsBoom(customerPhone, noteWithDate);
                console.log('[APP] Partner boom status updated');
            } catch (err) {
                console.error('[APP] Failed to update partner boom status:', err);
                notificationManager.error(`Đánh boom TPOS thất bại: ${err.message}. Vui lòng đánh thủ công trên TPOS.`);
            }
        }

        closeModal(elements.modalCreate);
        resetCreateForm();
        notificationManager.success('Tạo phiếu thành công!');
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tạo sự vụ: " + error.message);
    } finally {
        showLoading(false);
        isSubmitting = false;
        btnSubmit.disabled = false;
    }
}

let pendingActionTicketId = null;
let pendingActionType = null;

window.promptAction = function (id, action) {
    pendingActionTicketId = id;
    pendingActionType = action;
    const ticket = TICKETS.find(t => t.firebaseId === id); // Note: using firebaseId now

    if (!ticket) return;

    if (action === 'RECEIVE') {
        document.getElementById('confirm-title').textContent = "Xác nhận Nhập Kho";
        document.getElementById('confirm-message').textContent = `Đã nhận đủ hàng từ đơn ${ticket.orderId}?`;
    } else if (action === 'ISSUE_CREDIT') {
        document.getElementById('confirm-title').textContent = "Cấp Công Nợ Ảo";
        const money = parseFloat(ticket.money) || 0;
        document.getElementById('confirm-message').textContent = `Cấp ${money.toLocaleString()}đ công nợ ảo cho ${ticket.phone}? (Hết hạn sau 15 ngày)`;
    } else {
        document.getElementById('confirm-title').textContent = "Xác nhận Thanh Toán";
        document.getElementById('confirm-message').textContent = `Đã chuyển khoản ${formatCurrency(ticket.money)} cho ĐVVC?`;
    }

    openModal(elements.modalConfirm);
}

async function handleConfirmAction() {
    if (!pendingActionTicketId) return;
    if (isProcessingAction) return;

    const ticket = TICKETS.find(t => t.firebaseId === pendingActionTicketId);
    if (!ticket) {
        notificationManager.error('Không tìm thấy phiếu');
        return;
    }

    isProcessingAction = true;
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    if (btnConfirmYes) btnConfirmYes.disabled = true;

    // Close confirm modal first
    closeModal(elements.modalConfirm);

    let loadingId = null;

    try {
        if (pendingActionType === 'RECEIVE') {
            // Audit logging TRƯỚC - ghi nhận thao tác nhận hàng bất kể kết quả
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('ticket_receive_goods', {
                        module: 'issue-tracking',
                        description: 'Nhận hàng hoàn đơn ' + (ticket.orderId || '') + ' - ' + (ticket.phone || ''),
                        oldData: { status: ticket.status },
                        newData: { status: 'RECEIVED', ticketId: pendingActionTicketId },
                        entityId: pendingActionTicketId,
                        entityType: 'ticket'
                    });
                }
            } catch (e) { console.warn('[AuditLog] ticket_receive_goods log failed:', e); }

            // RECEIVE action: Process full TPOS refund flow (5 API calls)
            // RETURN_OLD_ORDER: Phiếu trả hàng tạo cho đơn CŨ (returnFromTposId)
            const tposIdForRefund = (ticket.fixCodReason === 'RETURN_OLD_ORDER' && ticket.returnFromTposId)
                ? ticket.returnFromTposId
                : ticket.tposId;

            console.log('[APP] Processing RECEIVE action for tposId:', tposIdForRefund, '(original:', ticket.tposId, ')');

            if (!tposIdForRefund) {
                throw new Error('Thiếu TPOS Order ID để xử lý nhận hàng');
            }

            // Show loading notification with progress
            loadingId = notificationManager.loading('Bước 1/5: Tạo phiếu hoàn...', 'Đang xử lý nhận hàng');

            // Call the refund process with progress callback
            // Pass ticket.products to filter OrderLines for partial refund
            const result = await ApiService.processRefund(tposIdForRefund, ticket.products, (step, message) => {
                // Update loading notification with step progress
                notificationManager.remove(loadingId);
                loadingId = notificationManager.loading(message, `Bước ${step}/5`);
            });

            console.log('[APP] Refund completed, refundOrderId:', result.refundOrderId);

            // Update loading: Saving to Firebase
            notificationManager.remove(loadingId);
            loadingId = notificationManager.loading('Đang cập nhật hệ thống...', 'Hoàn tất');

            // Update ticket in Firebase with refund info
            // BOOM và FIX_COD cần qua PENDING_FINANCE để đối soát ĐVVC
            // RETURN_CLIENT, RETURN_SHIPPER → COMPLETED (không cần trả ĐVVC)
            const needFinanceSettlement = (ticket.type === 'BOOM' || ticket.type === 'FIX_COD');
            const nextStatus = needFinanceSettlement ? 'PENDING_FINANCE' : 'COMPLETED';

            await ApiService.updateTicket(pendingActionTicketId, {
                status: nextStatus,
                ...(nextStatus === 'COMPLETED' ? { completedAt: Date.now() } : { receivedAt: Date.now() }),
                refundOrderId: result.refundOrderId,
                refundNumber: result.confirmResult?.value?.[0]?.Number || null
            });

            // Thông báo chờ đối soát nếu cần
            if (needFinanceSettlement) {
                notificationManager.info(
                    `Ticket chuyển sang "Chờ Đối Soát" - Cần Kế toán thanh toán ${formatCurrency(ticket.money)} cho ĐVVC`,
                    5000,
                    'Chờ đối soát'
                );
            }

            // =====================================================
            // Credit wallet for RETURN_CLIENT only - ONLY if TPOS amount matches
            // RETURN_SHIPPER: virtual_credit đã được cấp khi TẠO ticket (không cộng lại ở đây)
            // Validate "Tổng tiền" from PrintRefund HTML before crediting
            // =====================================================
            const compensationAmount = parseFloat(ticket.money) || 0;
            const customerPhone = ticket.phone;
            const refundAmountFromHtml = result.refundAmountFromHtml;

            console.log('[APP] Wallet validation - Expected:', compensationAmount, 'TPOS HTML:', refundAmountFromHtml);

            // CHỈ cộng deposit cho RETURN_CLIENT (tiền thật khi hàng đã về)
            // RETURN_SHIPPER đã được cấp virtual_credit ngay khi tạo ticket
            if (compensationAmount > 0 && customerPhone && ticket.type === 'RETURN_CLIENT') {
                // Validate: TPOS refund amount must match ticket.money
                if (refundAmountFromHtml !== null && refundAmountFromHtml === compensationAmount) {
                    try {
                        notificationManager.remove(loadingId);
                        loadingId = notificationManager.loading('Đang cộng tiền vào ví khách...', 'Hoàn tất');

                        // RETURN_CLIENT: luôn dùng deposit (tiền thật)
                        const compensationType = 'deposit';

                        const resolveData = await ApiService.resolveTicket(pendingActionTicketId, {
                                compensation_amount: compensationAmount,
                                compensation_type: compensationType,
                                performed_by: window.authManager?.getUserInfo()?.username || 'warehouse_staff',
                                note: `Hoàn tiền từ ticket ${ticket.ticketCode || ticket.orderId} - Refund: ${result.refundOrderId}`
                        });

                        if (resolveData.success) {
                            console.log('[APP] Wallet credited successfully:', resolveData);
                            notificationManager.success(
                                `Đã cộng ${compensationAmount.toLocaleString()}đ vào ví ${customerPhone}`,
                                3000,
                                'Ví đã cập nhật'
                            );
                        } else {
                            console.error('[APP] Wallet credit failed:', resolveData.error);
                            notificationManager.warning(
                                'Cộng ví thất bại, cần xử lý thủ công qua Customer 360',
                                5000,
                                'Cảnh báo'
                            );
                        }
                    } catch (walletError) {
                        console.error('[APP] Wallet credit error:', walletError);
                        notificationManager.warning(
                            'Không thể cộng ví tự động, vui lòng kiểm tra lại',
                            5000,
                            'Cảnh báo'
                        );
                    }
                } else {
                    // Amount mismatch - DO NOT auto-credit, warn user
                    console.error('[APP] Amount mismatch! Expected:', compensationAmount, 'TPOS:', refundAmountFromHtml);
                    notificationManager.warning(
                        `Số tiền không khớp! Ticket: ${compensationAmount.toLocaleString()}đ, TPOS: ${(refundAmountFromHtml || 0).toLocaleString()}đ. Không tự động cộng ví.`,
                        8000,
                        'Cảnh báo: Cần kiểm tra'
                    );
                }
            }

            // Show success notification
            const refundNumber = result.confirmResult?.value?.[0]?.Number || result.refundOrderId;
            notificationManager.success(`Đã tạo phiếu hoàn: ${refundNumber}`, 3000, 'Nhận hàng thành công');

            // Show print dialog with the HTML bill (only if enabled in settings)
            if (result.printHtml && appSettings.printBillEnabled) {
                showPrintDialog(result.printHtml);
            }

            // Refresh UI to reflect status change (backup in case SSE is slow)
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'pending-goods';
            renderDashboard(activeTab);

        } else if (pendingActionType === 'PAY') {
            // PAY action: Just mark as completed (payment done externally)
            loadingId = notificationManager.loading('Đang cập nhật...', 'Xác nhận thanh toán');

            // Audit logging TRƯỚC - ghi nhận thao tác bất kể kết quả
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('ticket_payment', {
                        module: 'issue-tracking',
                        description: 'Thanh toán ticket ' + (ticket.ticketCode || ticket.orderId || '') + ' - ' + formatCurrency(ticket.money),
                        oldData: { status: ticket.status },
                        newData: { status: 'COMPLETED', amount: ticket.money, ticketId: pendingActionTicketId },
                        entityId: pendingActionTicketId,
                        entityType: 'ticket'
                    });
                }
            } catch (e) { console.warn('[AuditLog] ticket_payment log failed:', e); }

            await ApiService.updateTicket(pendingActionTicketId, {
                status: 'COMPLETED',
                completedAt: Date.now()
            });

            notificationManager.remove(loadingId);
            loadingId = null;

            notificationManager.success('Đã xác nhận thanh toán', 2000, 'Thành công');

        } else if (pendingActionType === 'ISSUE_CREDIT') {
            // =====================================================
            // ISSUE_CREDIT action: Cấp công nợ ảo cho RETURN_SHIPPER
            // =====================================================
            const money = parseFloat(ticket.money) || 0;
            const customerPhone = ticket.phone;
            const ticketCode = ticket.ticketCode || ticket.orderId;

            if (money <= 0 || !customerPhone) {
                throw new Error('Thiếu thông tin số tiền hoặc SĐT khách hàng');
            }

            loadingId = notificationManager.loading('Đang cấp công nợ ảo...', 'Xử lý');

            // Audit logging TRƯỚC - ghi nhận thao tác cấp công nợ ảo bất kể kết quả
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('ticket_add_debt', {
                        module: 'issue-tracking',
                        description: 'Cấp ' + money.toLocaleString() + 'đ công nợ ảo cho ' + customerPhone + ' từ ticket ' + ticketCode,
                        oldData: null,
                        newData: { amount: money, customerId: customerPhone, ticketId: pendingActionTicketId, ticketCode: ticketCode },
                        entityId: pendingActionTicketId,
                        entityType: 'ticket'
                    });
                }
            } catch (e) { console.warn('[AuditLog] ticket_add_debt log failed:', e); }

            const resolveData = await ApiService.resolveTicketCredit(pendingActionTicketId, {
                    phone: customerPhone,
                    amount: money,
                    ticket_code: ticketCode,
                    note: `Công nợ ảo - Thu về đơn ${ticket.orderId}`,
                    expires_in_days: 15
            });

            notificationManager.remove(loadingId);
            loadingId = null;

            if (resolveData.success) {
                console.log('[APP] Virtual credit issued successfully:', resolveData);

                const virtualCreditId = resolveData.data?.virtual_credit_id || true;

                // Update ticket in Firebase/PostgreSQL to persist virtual_credit_id
                // This will trigger Firebase subscription and update TICKETS array
                await ApiService.updateTicket(pendingActionTicketId, {
                    virtualCreditId: virtualCreditId
                });
                console.log('[APP] Ticket updated with virtual_credit_id:', virtualCreditId);

                notificationManager.success(
                    `Đã cấp ${money.toLocaleString()}đ công nợ ảo cho ${customerPhone}`,
                    3000,
                    'Công nợ ảo'
                );

                // Update local ticket data để UI refresh đúng nút (backup in case Firebase slow)
                ticket.virtual_credit_id = virtualCreditId;
                ticket.virtualCreditId = virtualCreditId;

                // Re-render dashboard with current tab
                const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'pending-goods';
                renderDashboard(activeTab);
            } else {
                throw new Error(resolveData.error || resolveData.message || 'Không thể cấp công nợ ảo');
            }
        }
    } catch (error) {
        console.error('[APP] handleConfirmAction error:', error);

        // Remove loading notification if exists
        if (loadingId) {
            notificationManager.remove(loadingId);
        }

        notificationManager.error(error.message, 5000, 'Lỗi xử lý');
    } finally {
        isProcessingAction = false;
        const btnConfirmYes = document.getElementById('btn-confirm-yes');
        if (btnConfirmYes) btnConfirmYes.disabled = false;
    }
}

/**
 * Show print dialog with refund bill HTML
 * @param {string} html - HTML content of the bill
 */
function showPrintDialog(html) {
    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=400,height=600');

    if (!printWindow) {
        alert('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load then trigger print
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

/**
 * RECONCILIATION LOGIC (NEW)
 */

let reconcileMatches = []; // Store processing results

function initReconcileHandlers() {
    // Open Modal
    const btnOpen = document.getElementById('btn-open-reconcile');
    const modalRec = document.getElementById('modal-reconcile');

    if (btnOpen && modalRec) {
        btnOpen.addEventListener('click', () => {
            openModal(modalRec);
            // Reset
            document.getElementById('excel-input').value = '';
            document.getElementById('reconcile-result-container').classList.add('hidden');
            reconcileMatches = [];
            updateReconcileSummary();
            document.getElementById('btn-confirm-reconcile').disabled = true;
        });
    }

    // Process Button
    document.getElementById('btn-process-excel').addEventListener('click', handlePreviewReconcile);

    // Confirm Button
    document.getElementById('btn-confirm-reconcile').addEventListener('click', handleBatchConfirm);
}

function handlePreviewReconcile() {
    const text = document.getElementById('excel-input').value.trim();
    if (!text) return alert("Vui lòng dán dữ liệu từ Excel!");

    showLoading(true);

    // 1. Parse Excel Data
    const rows = parseExcelData(text);
    console.log('[REC] Parsed rows:', rows.length);

    // 2. Match with Tickets
    reconcileMatches = performReconciliation(rows);

    // 3. Render Results
    renderReconcileTable(reconcileMatches);
    updateReconcileSummary();

    showLoading(false);
    document.getElementById('reconcile-result-container').classList.remove('hidden');
}

function parseExcelData(text) {
    // Split by newlines
    const lines = text.split(/\r?\n/);
    const data = [];

    lines.forEach(line => {
        if (!line.trim()) return;

        // Strategy:
        // 1. Extract potential Phone (10-11 digits)
        // 2. Extract potential ID (First column usually)
        // 3. Extract Money (digits with optional commas/dots)

        // Remove commas in numbers for easier parsing
        const cleanLine = line.replace(/,/g, '');
        const cols = cleanLine.split(/\t/); // Excel copy usually uses Tab

        const rawId = cols[0] ? cols[0].trim() : '';

        // Find phone using Regex
        const phoneMatch = line.match(/(0\d{9,10})/);
        const phone = phoneMatch ? phoneMatch[0] : '';

        // Find money: Look for numbers > 1000
        const moneyMatch = cleanLine.match(/(\d{4,})/g);
        // Heuristic: Money is usually the largest number or specific column.
        // For simplicity, let's take largest number found (risk: OrderId might be number)
        // Better: Expect user to check. Or user specific columns.
        // Let's assume Column B (index 1) or D (index 3) based on user image.
        // Image: Col B=325000, Col D=325000.
        // Let's try to parse money from Col B or D.
        let money = 0;
        if (cols[1]) money = parseInt(cols[1].replace(/\D/g, '')) || 0;

        if (rawId || phone) {
            data.push({
                rawId: rawId,
                phone: phone,
                money: money,
                originalLine: line
            });
        }
    });

    return data;
}

function performReconciliation(excelRows) {
    const results = [];

    // Index tickets for faster lookup
    // Map by OrderID (lowercase) and Phone
    const ticketMapById = {};
    const ticketMapByPhone = {}; // Phone might have duplicates!

    TICKETS.forEach(t => {
        if (t.orderId) ticketMapById[t.orderId.toLowerCase()] = t;
        // Phone: store array of tickets
        if (t.phone) {
            if (!ticketMapByPhone[t.phone]) ticketMapByPhone[t.phone] = [];
            ticketMapByPhone[t.phone].push(t);
        }
    });

    excelRows.forEach(row => {
        let match = null;
        let status = 'Not Found';
        let detail = 'Không tìm thấy trên hệ thống';
        let resultCode = 'GHOST'; // GHOST, VALID, ERROR, DUPLICATE

        // 1. Try Match by ID
        if (row.rawId && ticketMapById[row.rawId.toLowerCase()]) {
            match = ticketMapById[row.rawId.toLowerCase()];
        }
        // 2. Try Match by Phone
        else if (row.phone && ticketMapByPhone[row.phone]) {
            const candidates = ticketMapByPhone[row.phone];
            if (candidates.length === 1) {
                match = candidates[0];
            } else if (candidates.length > 1) {
                // Ambiguous: Multiple tickets with same phone
                // Prefer PENDING_FINANCE
                const pending = candidates.find(c => c.status === 'PENDING_FINANCE');
                match = pending || candidates[0]; // Fallback to first
                if (!pending) detail += " (Trùng SĐT)";
            }
        }

        if (match) {
            // Validation Logic
            if (match.status === 'PENDING_FINANCE') {
                resultCode = 'VALID';
                status = 'Ready';
                detail = 'Hợp lệ để thanh toán';
            } else if (match.status === 'PENDING_GOODS') {
                resultCode = 'ERROR';
                status = 'Not Ready';
                detail = 'Đang chờ hàng về (Chưa nhận hàng)';
            } else if (match.status === 'COMPLETED') {
                resultCode = 'DUPLICATE';
                status = 'Done';
                detail = 'Đã thanh toán trước đó';
            } else {
                resultCode = 'UNKNOWN';
                status = match.status;
            }
        }

        results.push({
            excel: row,
            ticket: match,
            resultCode: resultCode,
            statusLabel: status,
            message: detail
        });
    });

    return results;
}

function renderReconcileTable(matches) {
    const tbody = document.getElementById('reconcile-table-body');
    tbody.innerHTML = '';

    matches.forEach(item => {
        let rowClass = '';
        if (item.resultCode === 'VALID') rowClass = 'row-success';
        else if (item.resultCode === 'ERROR' || item.resultCode === 'GHOST') rowClass = 'row-error';
        else if (item.resultCode === 'DUPLICATE') rowClass = 'row-warning';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold">${item.excel.rawId}</div>
                <div>${item.excel.phone || '---'}</div>
                <div style="font-size:11px">${formatCurrency(item.excel.money)}</div>
            </td>
            <td>
                ${item.ticket ? `
                    <div style="font-weight:bold">${item.ticket.orderId}</div>
                    <div>${item.ticket.customer}</div>
                    <span class="status-badge status-${item.ticket.status.toLowerCase().replace('_', '-')}">${translateStatus(item.ticket.status)}</span>
                ` : '<em style="color:#94a3b8">---</em>'}
            </td>
            <td>
                <div class="${item.resultCode === 'VALID' ? 'text-success' : (item.resultCode === 'DUPLICATE' ? 'text-warning' : 'text-error')}">
                    ${item.resultCode}
                </div>
                <div style="font-size:11px">${item.message}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateReconcileSummary() {
    const total = reconcileMatches.length;
    const valid = reconcileMatches.filter(m => m.resultCode === 'VALID').length;
    const error = reconcileMatches.filter(m => ['GHOST', 'ERROR'].includes(m.resultCode)).length;

    // Sum money valid
    const totalMoney = reconcileMatches
        .filter(m => m.resultCode === 'VALID')
        .reduce((sum, m) => sum + (m.ticket ? m.ticket.money : 0), 0);

    document.getElementById('rec-total-count').textContent = total;
    document.getElementById('rec-valid-count').textContent = valid;
    document.getElementById('rec-error-count').textContent = error;
    document.getElementById('rec-total-money').textContent = formatCurrency(totalMoney);
    document.getElementById('btn-rec-count').textContent = valid;
    document.getElementById('btn-confirm-reconcile').disabled = valid === 0;
}

async function handleBatchConfirm() {
    const validItems = reconcileMatches.filter(m => m.resultCode === 'VALID');
    if (validItems.length === 0) return;

    if (!confirm(`Xác nhận thanh toán cho ${validItems.length} đơn hàng hợp lệ?`)) return;

    showLoading(true);
    try {
        const promises = validItems.map(item => {
            return ApiService.updateTicket(item.ticket.firebaseId, {
                status: 'COMPLETED',
                completedAt: Date.now(),
                reconcileNote: `Batch Settle via Excel: ${item.excel.rawId}`
            });
        });

        await Promise.all(promises);

        alert("Đã quyết toán xong!");
        closeModal(document.getElementById('modal-reconcile'));
        // Refresh? Triggered by listener usually
    } catch (e) {
        console.error(e);
        alert("Lỗi khi quyết toán: " + e.message);
    } finally {
        showLoading(false);
    }
}

/**
 * UTILS & RENDER
 */

const GUIDES = {
    'all': `
        <strong>Tất cả sự vụ:</strong> Tra cứu và Theo dõi toàn bộ lịch sử.
        <br/><br/>
        <!-- Trigger for Detailed Flow -->
        <button class="btn btn-sm btn-secondary" onclick="toggleFlowDetails()">
            📜 Xem Quy Trình Xử Lý Chi Tiết
        </button>

        <div id="flow-details" class="hidden" style="margin-top:15px; border-top:1px dashed #ccc; padding-top:15px;">
            <div class="mermaid">
flowchart TD
    Start([Bắt đầu]) --> Search[Tìm kiếm Đơn hàng<br/>SĐT / Mã vận đơn]
    Search -->|Có dữ liệu| Found[Hiện thông tin Đơn]
    Search -->|Không thấy| NotFound[Báo lỗi / Kiểm tra lại]

    Found --> SelectType{Chọn Loại Sự Vụ}

    SelectType -->|Sửa COD| FixCOD[Form Sửa COD]
    FixCOD --> Reason{Lý do}
    Reason -->|Sai phí/Trừ nợ| InputMoney[Nhập COD mới]
    Reason -->|Khách nhận 1 phần| Partial[Hiện DS Sản phẩm]
    Partial --> CheckItem[Chọn SP khách trả lại]
    CheckItem --> InputMoney

    SelectType -->|Khách Trả / Boom| Return[Form Trả Hàng]
    Return --> ReturnSource{Nguồn?}
    ReturnSource -->|Khách gửi| InputTracking[Nhập Mã VĐ Khách gửi]
    ReturnSource -->|Shipper thu| InputShipper[Nhập tên Shipper]
    ReturnSource -->|Boom hàng| ConfirmBoom[Xác nhận Boom]

    InputMoney --> Submit[Tạo Ticket]
    InputTracking --> Submit
    InputShipper --> Submit
    ConfirmBoom --> Submit

    Submit --> End([Lưu vào Hệ thống])

    style Start fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style End fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style Submit fill:#fef3c7,stroke:#d97706,stroke-width:2px
            </div>

            <div class="flow-steps" style="margin-top:20px;display:grid;gap:15px;">
                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">1. Trường hợp Sửa COD</strong>
                    <p style="font-size:12px;color:#475569">Dùng khi Shipper báo thu sai tiền hoặc Shop muốn trừ tiền cọc/đổi trả.</p>
                    <img src="images/fix_cod.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">2. Trường hợp Khách Nhận 1 Phần</strong>
                    <p style="font-size:12px;color:#475569">Chọn lý do "Khách nhận 1 phần" để hiện danh sách. Tích vào sản phẩm Khách <strong>trả lại</strong>.</p>
                    <img src="images/partial.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">3. Trường hợp Hàng Hoàn / Boom</strong>
                    <p style="font-size:12px;color:#475569">Chọn Boom hoặc Khách Gửi. Nếu Khách gửi qua bưu cục, hãy nhập mã vận đơn mới.</p>
                    <img src="images/return.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>
            </div>
        </div>
    `,
    'pending-goods': `
        <strong>Kho xử lý:</strong> Đơn cần nhận hàng hoàn.
        <ul>
            <li><strong>Boom/Hoàn:</strong> Kiểm tra hàng -> Bấm <em>Đã Nhận Hàng</em>.</li>
            <li><strong>Trả 1 phần:</strong> Chỉ check món hàng nhận lại.</li>
        </ul>
    `,
    'pending-finance': `
        <strong>Kế toán / Admin:</strong> Đơn cần đối soát tiền.
        <ul>
            <li><strong>Sửa COD:</strong> Chênh lệch tiền cần ck lại cho ĐVVC.</li>
            <li>Sau khi ck -> Bấm <em>Đã Thanh Toán</em>.</li>
        </ul>
    `,
    'completed': `
        <strong>Lịch sử:</strong> Các sự vụ đã hoàn tất.
    `
};

function renderDashboard(tabName, searchTerm = '') {
    // Toggle filter bars based on tab
    const defaultFilters = document.getElementById('default-filters');
    const historyFilters = document.getElementById('history-filters');
    if (tabName === 'history') {
        if (defaultFilters) defaultFilters.classList.add('hidden');
        if (historyFilters) historyFilters.classList.remove('hidden');
    } else {
        if (defaultFilters) defaultFilters.classList.remove('hidden');
        if (historyFilters) historyFilters.classList.add('hidden');
    }

    // Update table headers based on tab
    updateTableHeaders(tabName);

    // History tab has its own render function
    if (tabName === 'history') {
        const guidePanel = document.getElementById('tab-guide');
        if (guidePanel) guidePanel.classList.add('hidden');
        return renderHistoryTab();
    }

    // 1. Update Guide
    const guidePanel = document.getElementById('tab-guide');
    const guideContent = document.getElementById('guide-content');

    if (GUIDES[tabName]) {
        guidePanel.classList.remove('hidden');
        guideContent.innerHTML = GUIDES[tabName];
        // Note: Mermaid will be initialized when user clicks to show flow-details
        // See initMermaidOnShow() function
    } else {
        guidePanel.classList.add('hidden');
    }

    // 2. Filter Lists
    let filtered = TICKETS;

    // Filter by Tab
    if (tabName === 'overdue') {
        // Special filter: Show only overdue RETURN_SHIPPER tickets (20+ days old)
        const OVERDUE_DAYS = 20;
        const overdueThreshold = Date.now() - (OVERDUE_DAYS * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(t =>
            t.type === 'RETURN_SHIPPER' &&
            t.status !== 'COMPLETED' &&
            t.status !== 'CANCELLED' &&
            (t.createdAt || 0) < overdueThreshold
        );
    } else if (tabName === 'cancelled') {
        filtered = filtered.filter(t => t.status === 'CANCELLED');
    } else if (tabName !== 'all') {
        let filterStatus = [];
        if (tabName === 'pending-goods') filterStatus = ['PENDING_GOODS'];
        else if (tabName === 'pending-finance') filterStatus = ['PENDING_FINANCE'];
        else if (tabName === 'completed') filterStatus = ['COMPLETED'];

        filtered = filtered.filter(t => filterStatus.includes(t.status));
    } else {
        // "all" tab: exclude CANCELLED (they have their own tab)
        filtered = filtered.filter(t => t.status !== 'CANCELLED');
    }

    // Filter by Type (from type-tabs)
    const activeTypeBtn = document.querySelector('#type-tabs .type-tab-btn.active');
    const typeFilter = activeTypeBtn?.dataset.type || 'all';
    if (typeFilter !== 'all') {
        filtered = filtered.filter(t => t.type === typeFilter);
    }

    // Filter by Search
    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.phone && t.phone.includes(searchTerm)) ||
            (t.orderId && t.orderId.toLowerCase().includes(searchTerm)) ||
            (t.customer && t.customer.toLowerCase().includes(searchTerm))
        );
    }

    // Render
    elements.ticketList.innerHTML = '';
    filtered.forEach(t => {
        const tr = document.createElement('tr');

        // Extract last 5 digits after "/" from orderId (e.g., "NJD/2025/41587" -> "41587")
        // Ensure orderId is converted to string first (some old tickets may have non-string values)
        const orderIdStr = String(t.orderId || '');
        const orderIdParts = orderIdStr.split('/');
        const last5Digits = orderIdParts.length > 0 ? orderIdParts[orderIdParts.length - 1] : orderIdStr;

        // Build customer cell
        const customerName = t.customer || 'N/A';
        const customerPhone = t.phone || 'N/A';
        const customerTier = t.customer_tier || null; // NEW: Get customer tier from ticket

        // Helper: Get order state display for row
        const getOrderStateDisplay = () => {
            const orderState = t.orderState || 'open';
            const stateCode = t.stateCode || 'None';

            if (orderState === 'paid') {
                if (stateCode === 'CrossCheckComplete') {
                    return { text: 'Đã thanh toán', color: '#10b981', isError: false };
                } else {
                    return { text: 'Đã TT/Chưa ĐS SP', color: '#ef4444', isError: true };
                }
            } else if (orderState === 'open') {
                if (stateCode === 'CrossCheckComplete') {
                    return { text: 'Đã đối soát SP', color: '#10b981', isError: false };
                } else {
                    return { text: 'Chưa Đối Soát SP', color: '#f59e0b', isError: false };
                }
            }
            return { text: '', color: '#64748b', isError: false };
        };
        const stateDisplay = getOrderStateDisplay();

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold;font-size:13px;${stateDisplay.isError ? 'color:#ef4444;' : ''}">
                    <a href="#" onclick="openOrderDetailModal('${t.tposId}'); return false;"
                       style="${stateDisplay.isError ? 'color:#ef4444;' : 'color:#3b82f6;'}text-decoration:none;">
                        ${last5Digits}
                    </a>
                </div>
                <div style="font-size:11px;color:#64748b;">#${t.tposId || '---'}</div>
                ${stateDisplay.text ? `<div style="font-size:10px;color:${stateDisplay.color};font-weight:500;">${stateDisplay.text}</div>` : ''}
            </td>
            <td>
                <div style="font-weight:500;color:#1e293b;">${customerName}</div>
                <div style="font-weight:500;color:#1e293b;">${customerPhone}</div>
                ${customerTier ? `<div style="font-size:11px;color:#64748b;">${customerTier}</div>` : ''}
            </td>
            <td>
                ${renderTypeBadge(t.type, t.fixCodReason, t.boomReason)}
                ${(t.type === 'BOOM' && t.boomReason) ? '' : `<div style="font-size:12px;margin-top:4px;color:#64748b;">${t.channel || 'TPOS'}</div>`}
            </td>
            <td>
                ${renderProductsList(t)}
            </td>
            <td>
                <div style="font-weight:bold;color:${(t.type === 'BOOM' || t.type === 'FIX_COD') ? '#ef4444' : '#1e293b'};">
                    ${formatCurrency(t.money)}
                </div>
                <div style="font-size:11px;color:#64748b;">
                    ${(t.type === 'BOOM' || t.type === 'FIX_COD') ? 'COD Giảm' : 'Giá trị hoàn'}
                </div>
            </td>
            <td>
                ${renderActionButtons(t)}
            </td>
        `;
        elements.ticketList.appendChild(tr);
    });

    return filtered.length;
}

function renderProductsList(ticket) {
    // Ghi chú luôn hiển thị đầu tiên - chữ thường, màu cam
    const noteDisplay = ticket.note
        ? `<div style="color:#f59e0b;margin-bottom:4px;">${ticket.note}</div>`
        : '';

    // Nếu là RETURN_OLD_ORDER, hiển thị reference đến đơn cũ
    const oldOrderRef = (ticket.type === 'FIX_COD' && ticket.fixCodReason === 'RETURN_OLD_ORDER' && ticket.returnFromOrderId)
        ? `<div style="font-size:11px;color:#8b5cf6;margin-bottom:4px;">📦 Từ đơn: ${ticket.returnFromOrderId}</div>`
        : '';

    // Nếu là FIX_COD và không phải REJECT_PARTIAL hoặc RETURN_OLD_ORDER thì chỉ hiển thị ghi chú (không có sản phẩm)
    if (ticket.type === 'FIX_COD' && ticket.fixCodReason !== 'REJECT_PARTIAL' && ticket.fixCodReason !== 'RETURN_OLD_ORDER') {
        return noteDisplay || '<span style="color:#94a3b8;font-size:12px;">—</span>';
    }

    if (!ticket.products || ticket.products.length === 0) {
        return noteDisplay || '<span style="color:#94a3b8;font-size:12px;">—</span>';
    }

    const productItems = ticket.products.map(p => {
        const qty = p.returnQuantity || p.quantity || 1;
        return `<li style="font-size:12px;">• ${qty}x ${p.code ? `${p.code} ` : ''}${p.name}</li>`;
    }).join('');

    return `${noteDisplay}${oldOrderRef}<ul style="list-style:none;padding:0;margin:0;">${productItems}</ul>`;
}

function renderTypeBadge(type, fixCodReason, boomReason) {
    // Special handling for BOOM type - show only the specific reason as the main label
    if (type === 'BOOM' && boomReason) {
        const boomReasonMap = {
            'BOOM_HANG': 'Boom Hàng',
            'TRUNG_DON': 'Trùng Đơn',
            'DOI_DIA_CHI': 'Sai Địa Chỉ',
            'KHAC': 'Không Nhận Hàng'
        };
        const reasonLabel = boomReasonMap[boomReason] || boomReason;
        return `<span class="type-label type-boom">● ${reasonLabel}</span>`;
    }

    const map = {
        'BOOM': { text: 'Không Nhận Hàng', class: 'type-boom' },
        'FIX_COD': { text: 'Sửa COD', class: 'type-fix' },
        'RETURN_CLIENT': { text: 'Khách Gửi', class: 'type-return' },
        'RETURN_SHIPPER': { text: 'Thu Về', class: 'type-return' },
        'OTHER': { text: 'Vấn đề khác', class: 'type-other' },
    };
    const conf = map[type] || { text: type, class: '' };

    // Add reason detail for FIX_COD if available
    let reasonText = '';
    if (type === 'FIX_COD' && fixCodReason) {
        const reasonMap = {
            'WRONG_SHIP': 'Sai ship',
            'CUSTOMER_DEBT': 'Trừ nợ',
            'DISCOUNT': 'Giảm giá',
            'REJECT_PARTIAL': 'Nhận 1 phần',
            'RETURN_OLD_ORDER': 'Trả đơn cũ'
        };
        reasonText = `<div style="font-size:10px;color:#64748b;margin-top:2px;">${reasonMap[fixCodReason] || fixCodReason}</div>`;
    }

    return `<span class="type-label ${conf.class}">● ${conf.text}</span>${reasonText}`;
}

/**
 * Open order detail modal (read-only view of order)
 */
window.openOrderDetailModal = async function (tposId) {
    if (!tposId) {
        alert('Không có ID đơn hàng');
        return;
    }

    showLoading(true);
    try {
        const details = await ApiService.getOrderDetails(tposId);
        if (!details) {
            alert('Không tìm thấy đơn hàng');
            return;
        }

        // Hide search section for view-only mode
        document.querySelector('.search-section label').style.display = 'none';
        document.querySelector('.search-section .input-group').style.display = 'none';

        // Show order result, hide issue form
        document.getElementById('order-result').classList.remove('hidden');
        document.getElementById('issue-details-form').classList.add('hidden');
        elements.customerInfoSection.classList.add('hidden'); // Also hide customer info section
        elements.customerInfoNewCustomerWarning.classList.add('hidden'); // Hide new customer warning

        // Fill order info
        document.getElementById('res-customer').textContent = details.customer || 'N/A';
        document.getElementById('res-phone').textContent = details.phone || '';
        document.getElementById('res-order-code').textContent = details.tposCode || '';
        document.getElementById('res-address').textContent = details.address || 'Chưa có địa chỉ';

        // Products table
        const productsTableHTML = details.products.map(p => {
            const noteDisplay = p.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">(${p.note})</div>` : '';
            return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 8px;">
                        <div><strong>[${p.code}]</strong> ${p.name}</div>
                        ${noteDisplay}
                    </td>
                    <td style="padding:6px 8px;text-align:center;">${p.quantity}</td>
                    <td style="padding:6px 8px;text-align:right;">${formatCurrency(p.price)}</td>
                </tr>
            `;
        }).join('');
        document.getElementById('res-products-table').innerHTML = productsTableHTML;

        // Summary
        const totalQty = details.products.reduce((sum, p) => sum + p.quantity, 0);
        const finalTotal = details.amountTotal - details.decreaseAmount + details.deliveryPrice;

        document.getElementById('res-total-qty').textContent = totalQty;
        document.getElementById('res-amount-total').textContent = formatCurrency(details.amountTotal);
        document.getElementById('res-decrease-amount').textContent = formatCurrency(details.decreaseAmount);
        document.getElementById('res-delivery-price').textContent = formatCurrency(details.deliveryPrice);
        document.getElementById('res-final-total').textContent = formatCurrency(finalTotal);
        document.getElementById('res-payment-amount').textContent = formatCurrency(details.paymentAmount);
        document.getElementById('res-cod').textContent = formatCurrency(details.cod);

        // Open modal using correct function
        openModal(elements.modalCreate);

    } catch (err) {
        console.error('Failed to load order details:', err);
        alert('Lỗi khi tải thông tin đơn hàng: ' + err.message);
    } finally {
        showLoading(false);
    }
};

function renderActionButtons(ticket) {
    const id = ticket.firebaseId;
    let mainAction = '';

    if (ticket.status === 'PENDING_GOODS') {
        // RETURN_SHIPPER: Kiểm tra đã cấp công nợ ảo chưa
        if (ticket.type === 'RETURN_SHIPPER') {
            if (!ticket.virtualCreditId && !ticket.virtual_credit_id) {
                // Chưa cấp công nợ ảo → Hiển thị nút "+ Công Nợ Ảo" (cần quyền)
                const canIssueCredit = window.authManager?.hasDetailedPermission('issue-tracking', 'issueVirtualCredit');
                if (canIssueCredit) {
                    mainAction = `<button class="btn btn-sm action-btn action-issue-credit" onclick="promptAction('${id}', 'ISSUE_CREDIT')" style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">+ Công Nợ Ảo</button>`;
                } else {
                    // Không có quyền → Hiển thị trạng thái chờ
                    mainAction = `<span style="display:inline-block;padding:6px 12px;background:#fef3c7;color:#92400e;border-radius:6px;font-weight:500;">⏳ Chờ cấp công nợ</span>`;
                }
            } else {
                // Đã cấp công nợ ảo → Hiển thị nút "Nhận hàng"
                mainAction = `<button class="btn btn-sm action-btn action-receive" onclick="promptAction('${id}', 'RECEIVE')" style="background:#3b82f6;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">📦 Nhận hàng</button>`;
            }
        } else {
            // Các loại khác (RETURN_CLIENT, BOOM, etc.) → Nút "Nhận hàng" bình thường
            mainAction = `<button class="btn btn-sm action-btn action-receive" onclick="promptAction('${id}', 'RECEIVE')" style="background:#3b82f6;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">📦 Nhận hàng</button>`;
        }
    } else if (ticket.status === 'PENDING_FINANCE') {
        // Màu vàng cam - chờ thanh toán
        mainAction = `<button class="btn btn-sm action-btn action-pay" onclick="promptAction('${id}', 'PAY')" style="background:#f59e0b;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">💳 Thanh toán</button>`;
    } else if (ticket.status === 'CANCELLED') {
        // Màu đỏ nhạt - đã hủy
        mainAction = `<span style="display:inline-block;padding:6px 12px;background:#fee2e2;color:#dc2626;border-radius:6px;font-weight:500;">🚫 Đã hủy</span>`;
    } else {
        // Màu xám nhạt - đã hoàn tất
        mainAction = `<span style="display:inline-block;padding:6px 12px;background:#e2e8f0;color:#64748b;border-radius:6px;font-weight:500;">✓ Hoàn tất</span>`;
    }

    // Icon buttons for Edit/Cancel
    // Cancel allowed when:
    // - Status must be PENDING_GOODS
    // - RETURN_SHIPPER with virtual credit: only if credit is UNUSED
    const canCancel = window.authManager?.hasDetailedPermission('issue-tracking', 'delete');
    const hasVirtualCredit = !!(ticket.virtualCreditId || ticket.virtual_credit_id);
    let isUntouched = ticket.status === 'PENDING_GOODS';
    if (ticket.type === 'RETURN_SHIPPER' && hasVirtualCredit) {
        // Check if virtual credit has been used (partially or fully)
        const vcUsed = (ticket.vcUsedInOrders && ticket.vcUsedInOrders.length > 0) ||
                       (ticket.vcRemainingAmount != null && ticket.vcOriginalAmount != null &&
                        parseFloat(ticket.vcRemainingAmount) < parseFloat(ticket.vcOriginalAmount));
        isUntouched = !vcUsed;
    }
    const cancelButton = (canCancel && isUntouched)
        ? `<button onclick="cancelTicket('${id}')" title="Hủy phiếu" style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">🚫</button>`
        : '';

    const iconButtons = `
        <div style="display:inline-flex;gap:6px;margin-left:8px;vertical-align:middle;">
            <button onclick="editTicket('${id}')" title="Sửa" style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✏️</button>
            ${cancelButton}
        </div>
    `;

    return `<div style="display:flex;align-items:center;">${mainAction}${iconButtons}</div>`;
}

// Helper: Toggle Guide
window.toggleGuide = function () {
    const content = document.getElementById('guide-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        document.querySelector('.btn-toggle-guide').textContent = '▼';
    } else {
        content.style.display = 'none';
        document.querySelector('.btn-toggle-guide').textContent = '▶';
    }
}

// Helper: Update Stats
function updateStats() {
    const pendingGoods = TICKETS.filter(t => t.status === 'PENDING_GOODS').length;
    const pendingFinance = TICKETS.filter(t => t.status === 'PENDING_FINANCE').length;
    const cancelled = TICKETS.filter(t => t.status === 'CANCELLED').length;

    elements.countPendingGoods.textContent = pendingGoods;
    elements.countPendingFinance.textContent = pendingFinance;

    elements.badgePendingGoods.textContent = pendingGoods > 0 ? pendingGoods : '';
    elements.badgePendingFinance.textContent = pendingFinance > 0 ? pendingFinance : '';

    // Update cancelled badge
    const badgeCancelled = document.getElementById('badge-cancelled');
    if (badgeCancelled) {
        badgeCancelled.textContent = cancelled > 0 ? cancelled : '';
    }

    // Check for overdue RETURN_SHIPPER tickets (20 days old)
    checkOverdueTickets();
}

/**
 * Check for overdue RETURN_SHIPPER tickets and show alert banner
 * Overdue = created more than 20 days ago and not COMPLETED/CANCELLED
 */
function checkOverdueTickets() {
    const OVERDUE_DAYS = 20;
    const now = new Date();
    const overdueThreshold = now.getTime() - (OVERDUE_DAYS * 24 * 60 * 60 * 1000);

    const overdueTickets = TICKETS.filter(ticket => {
        if (ticket.type !== 'RETURN_SHIPPER') return false;
        if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') return false;

        const createdAt = ticket.createdAt || 0;
        return createdAt < overdueThreshold;
    });

    const alertBanner = document.getElementById('overdue-alert');
    const countEl = document.getElementById('overdue-count');
    const btnShow = document.getElementById('btn-show-overdue');
    const btnDismiss = document.getElementById('btn-dismiss-overdue');

    if (!alertBanner) return;

    if (overdueTickets.length > 0) {
        // Show banner
        alertBanner.classList.remove('hidden');
        countEl.textContent = overdueTickets.length;

        // Store overdue tickets for filter
        window.overdueTickets = overdueTickets;

        // Setup event handlers (only once)
        if (!btnShow._handlerAdded) {
            btnShow.addEventListener('click', () => {
                // Filter to show only overdue tickets
                showOverdueTicketsFilter();
            });
            btnShow._handlerAdded = true;
        }

        if (!btnDismiss._handlerAdded) {
            btnDismiss.addEventListener('click', () => {
                alertBanner.classList.add('hidden');
            });
            btnDismiss._handlerAdded = true;
        }
    } else {
        // Hide banner
        alertBanner.classList.add('hidden');
    }
}

/**
 * Filter and show only overdue tickets
 */
function showOverdueTicketsFilter() {
    // Switch to "All" tab first
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const allTab = document.querySelector('.tab-btn[data-tab="all"]');
    if (allTab) allTab.classList.add('active');

    // Render with overdue filter
    renderDashboard('overdue');
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function openModal(el) { el.classList.add('show'); }
function closeModal(el) { el.classList.remove('show'); }

function resetCreateForm() {
    selectedOrder = null;
    currentCustomer = null; // NEW: Reset current customer
    selectedOldOrder = null; // Reset đơn cũ cho RETURN_OLD_ORDER
    elements.inpSearchOrder.value = '';
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    document.getElementById('issue-type-select').value = '';
    document.getElementById('ticket-note').value = '';

    // Restore search section visibility (in case it was hidden by openOrderDetailModal)
    document.querySelector('.search-section label').style.display = '';
    document.querySelector('.search-section .input-group').style.display = '';

    // NEW: Reset customer info section
    elements.customerInfoSection.classList.add('hidden');
    elements.customerInfoName.textContent = 'N/A';
    elements.customerInfoPhone.textContent = 'N/A';
    elements.customerInfoTier.textContent = 'N/A';
    elements.customerInfoWalletBalance.textContent = '0đ';
    elements.customerInfoNewCustomerWarning.classList.add('hidden');

    // Reset RETURN_OLD_ORDER UI section
    const oldOrdersList = document.getElementById('old-orders-list');
    const oldOrderProductsSection = document.getElementById('old-order-products-section');
    const oldOrderSearchInput = document.getElementById('old-order-search-input');
    if (oldOrdersList) {
        oldOrdersList.innerHTML = '';
        oldOrdersList.classList.add('hidden');
        delete oldOrdersList.dataset.orders; // Clear cached orders data
    }
    if (oldOrderProductsSection) {
        oldOrderProductsSection.classList.add('hidden');
        const checklist = document.getElementById('old-order-product-checklist');
        if (checklist) checklist.innerHTML = '';
    }
    if (oldOrderSearchInput) {
        oldOrderSearchInput.value = ''; // Reset SĐT cache
    }

    // Reset BOOM reason dropdown
    const boomReasonEl = document.getElementById('boom-reason');
    if (boomReasonEl) boomReasonEl.value = 'BOOM_HANG';
    const boomReasonGroup = document.querySelector('[data-type="BOOM_REASON"]');
    if (boomReasonGroup) boomReasonGroup.classList.add('hidden');
}

function translateStatus(s) {
    const map = {
        'PENDING_GOODS': 'Chờ nhận hàng',
        'PENDING_FINANCE': 'Chờ đối soát',
        'COMPLETED': 'Hoàn tất',
        'CANCELLED': 'Đã hủy'
    };
    return map[s] || s;
}

/**
 * Edit ticket
 */
window.editTicket = function (firebaseId) {
    const ticket = TICKETS.find(t => t.firebaseId === firebaseId);
    if (!ticket) {
        alert('Không tìm thấy phiếu');
        return;
    }

    // TODO: Implement edit modal
    // For now, just show alert
    alert(`Chức năng sửa phiếu #${firebaseId.slice(-4)} đang được phát triển`);
};

/**
 * Cancel ticket (requires 'delete' permission)
 * Only allowed when NO action has been performed (PENDING_GOODS, no credit issued)
 */
window.cancelTicket = async function (firebaseId) {
    // Check permission first
    if (!window.authManager?.hasDetailedPermission('issue-tracking', 'delete')) {
        notificationManager.error('Bạn không có quyền hủy phiếu. Liên hệ Admin để cấp quyền.', 5000, 'Không có quyền');
        return;
    }

    const ticket = TICKETS.find(t => t.firebaseId === firebaseId);
    if (!ticket) {
        alert('Không tìm thấy phiếu');
        return;
    }

    // Use ticketCode if available, fallback to firebaseId
    const ticketIdentifier = ticket.ticketCode || firebaseId;
    const displayCode = ticket.ticketCode || `#${firebaseId.slice(-4)}`;

    // =====================================================
    // Frontend guard: Only allow cancel on untouched tickets
    // For RETURN_SHIPPER with virtual credit: allow if credit unused
    // =====================================================
    const hasVirtualCredit = !!(ticket.virtualCreditId || ticket.virtual_credit_id);
    if (ticket.status !== 'PENDING_GOODS') {
        notificationManager.error('Không thể hủy: Phiếu đã được xử lý. Chỉ có thể hủy phiếu chưa thực hiện thao tác nào.', 6000, 'Không thể hủy');
        return;
    }

    // RETURN_SHIPPER with virtual credit: check usage (frontend guard - 1st verification)
    if (ticket.type === 'RETURN_SHIPPER' && hasVirtualCredit) {
        const vcUsed = (ticket.vcUsedInOrders && ticket.vcUsedInOrders.length > 0) ||
                       (ticket.vcRemainingAmount != null && ticket.vcOriginalAmount != null &&
                        parseFloat(ticket.vcRemainingAmount) < parseFloat(ticket.vcOriginalAmount));
        if (vcUsed) {
            const usedAmount = parseFloat(ticket.vcOriginalAmount || 0) - parseFloat(ticket.vcRemainingAmount || 0);
            notificationManager.error(
                `Không thể hủy: Công nợ ảo đã được sử dụng (đã dùng: ${usedAmount.toLocaleString()}đ / ${parseFloat(ticket.vcOriginalAmount || 0).toLocaleString()}đ).`,
                6000, 'Không thể hủy'
            );
            return;
        }
    }

    // Build confirmation message
    let confirmMsg = `Xác nhận HỦY phiếu ${displayCode} - ${ticket.orderId}?`;
    if (ticket.type === 'RETURN_SHIPPER' && hasVirtualCredit) {
        const creditAmount = parseFloat(ticket.vcOriginalAmount || ticket.money || 0);
        confirmMsg += `\n\n⚠️ Công nợ ảo ${creditAmount.toLocaleString()}đ sẽ bị thu hồi từ ví khách hàng.`;
    }
    const confirmed = confirm(confirmMsg);
    if (!confirmed) return;

    showLoading(true);
    try {
        // Call cancel API (backend performs 2nd verification in transaction)
        const result = await ApiService.cancelTicket(ticketIdentifier);
        console.log('[CANCEL] Ticket cancelled successfully:', firebaseId, result);

        // Verify virtual credit was actually cancelled (if applicable)
        if (ticket.type === 'RETURN_SHIPPER' && hasVirtualCredit) {
            if (result?.virtualCreditCancelled) {
                console.log('[CANCEL] Virtual credit successfully revoked for ticket:', displayCode);
                notificationManager.success(
                    `Đã hủy phiếu và thu hồi công nợ ảo ${parseFloat(ticket.vcOriginalAmount || ticket.money || 0).toLocaleString()}đ`,
                    4000, 'Hủy phiếu + Thu hồi công nợ'
                );
            } else {
                console.warn('[CANCEL] Virtual credit cancellation not confirmed in response');
                notificationManager.success('Đã hủy phiếu thành công!', 3000, 'Hủy phiếu');
            }
        } else {
            notificationManager.success('Đã hủy phiếu thành công!', 3000, 'Hủy phiếu');
        }

        // Audit log
        try {
            if (window.AuditLogger) {
                const auditData = {
                    module: 'issue-tracking',
                    description: 'Hủy phiếu ' + displayCode + ' - Đơn ' + (ticket.orderId || '') + ' - KH ' + (ticket.phone || ticket.customerId || ''),
                    oldData: {
                        ticketCode: ticket.ticketCode || '',
                        orderId: ticket.orderId || '',
                        type: ticket.type || '',
                        money: ticket.money || 0,
                        phone: ticket.phone || ticket.customerId || '',
                        status: ticket.status || ''
                    },
                    newData: { status: 'CANCELLED' },
                    entityId: ticket.ticketCode || firebaseId,
                    entityType: 'ticket'
                };
                if (result?.virtualCreditCancelled) {
                    auditData.description += ' + Thu hồi công nợ ảo ' + parseFloat(ticket.vcOriginalAmount || ticket.money || 0).toLocaleString() + 'đ';
                    auditData.newData.virtualCreditCancelled = true;
                    auditData.newData.creditAmountRevoked = parseFloat(ticket.vcOriginalAmount || ticket.money || 0);
                }
                window.AuditLogger.logAction('cancel', auditData);
            }
        } catch (e) { console.warn('[AuditLog] cancel log failed:', e); }
    } catch (error) {
        console.error('Cancel ticket failed:', error);
        notificationManager.error(error.message || 'Lỗi khi hủy phiếu', 6000, 'Không thể hủy');
    } finally {
        showLoading(false);
    }
};

// =====================================================
// RETURN_OLD_ORDER: Tìm và chọn đơn cũ của khách
// =====================================================

/**
 * Tìm các đơn hàng cũ của khách (loại trừ đơn hiện tại)
 */
async function searchOldOrders() {
    if (!selectedOrder) {
        alert('Vui lòng chọn đơn hàng mới trước');
        return;
    }

    const phone = selectedOrder.phone;
    const currentOrderId = selectedOrder.tposCode || selectedOrder.orderId;

    showLoading(true);
    try {
        // Gọi API tìm đơn theo SĐT
        const result = await ApiService.searchOrders(phone);
        const orders = result.orders || [];

        // Lọc bỏ đơn hiện tại và chỉ lấy đơn đã giao thành công
        const oldOrders = orders.filter(order =>
            order.tposCode !== currentOrderId &&
            (order.status === 'paid' || order.status === 'open') &&
            order.stateCode === 'CrossCheckComplete' // Đã giao thành công
        );

        if (oldOrders.length === 0) {
            alert('Không tìm thấy đơn hàng cũ nào của khách này đã giao thành công');
            return;
        }

        renderOldOrdersList(oldOrders);

    } catch (error) {
        console.error('[RETURN_OLD_ORDER] Search failed:', error);
        alert('Lỗi khi tìm đơn hàng cũ: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Render danh sách đơn cũ dưới dạng radio buttons
 */
function renderOldOrdersList(orders) {
    const container = document.getElementById('old-orders-list');
    if (!container) return;

    container.innerHTML = orders.map((order, index) => `
        <div class="old-order-item" style="padding:10px;border-bottom:1px solid #e2e8f0;">
            <label style="display:flex;align-items:center;cursor:pointer;">
                <input type="radio" name="old-order-select" value="${order.tposCode}"
                       data-order-index="${index}" onchange="onOldOrderSelected(${index})"
                       style="margin-right:10px;">
                <div style="flex:1;">
                    <div style="font-weight:500;">${order.tposCode}</div>
                    <div style="font-size:12px;color:#64748b;">
                        ${formatDate(order.createdAt)} - ${formatCurrency(order.cod)}
                    </div>
                </div>
            </label>
        </div>
    `).join('');

    // Lưu orders để dùng sau
    container.dataset.orders = JSON.stringify(orders);
    container.classList.remove('hidden');
}

/**
 * Xử lý khi chọn một đơn cũ
 */
window.onOldOrderSelected = async function(orderIndex) {
    const container = document.getElementById('old-orders-list');
    const orders = JSON.parse(container.dataset.orders || '[]');

    if (orderIndex < 0 || orderIndex >= orders.length) return;

    selectedOldOrder = orders[orderIndex];

    // Fetch products từ API nếu chưa có
    if (!selectedOldOrder.products || selectedOldOrder.products.length === 0) {
        showLoading(true);
        try {
            const details = await ApiService.getOrderDetails(selectedOldOrder.id);
            if (details && details.products) {
                selectedOldOrder.products = details.products;
                // Update cached order data
                orders[orderIndex] = selectedOldOrder;
                container.dataset.orders = JSON.stringify(orders);
            }
        } catch (error) {
            console.error('[RETURN_OLD_ORDER] Failed to fetch order details:', error);
            alert('Lỗi khi tải chi tiết đơn hàng cũ');
            return;
        } finally {
            showLoading(false);
        }
    }

    // Render danh sách sản phẩm của đơn cũ
    renderOldOrderProducts(selectedOldOrder);
}

/**
 * Render sản phẩm của đơn cũ dưới dạng checkboxes
 */
function renderOldOrderProducts(order) {
    const container = document.getElementById('old-order-product-checklist');
    const section = document.getElementById('old-order-products-section');

    if (!container || !section) return;

    if (!order.products || order.products.length === 0) {
        container.innerHTML = '<div style="padding:10px;color:#64748b;text-align:center;">Không có sản phẩm trong đơn hàng này</div>';
        section.classList.remove('hidden');
        return;
    }

    container.innerHTML = order.products.map((product, idx) => `
        <div class="product-check-item" style="padding:8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;">
            <label style="display:flex;align-items:center;cursor:pointer;">
                <input type="checkbox" name="old-order-product"
                       id="old-prod-${product.id || idx}"
                       value="${product.id || idx}"
                       data-product-id="${product.productId || ''}"
                       data-code="${product.code || ''}"
                       data-total="${product.total || product.price * product.quantity}"
                       data-unit-price="${product.price}"
                       data-name="${product.name}"
                       data-quantity="${product.quantity}"
                       onchange="updateCodReduceFromOldOrderProducts()"
                       style="margin-right:10px;">
                <div style="flex:1;">
                    <div style="font-weight:500;">${product.name}</div>
                    <div style="font-size:12px;color:#64748b;">
                        Đã mua: x${product.quantity} - ${formatCurrency(product.total || product.price * product.quantity)}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="font-size:12px;color:#64748b;">SL trả:</span>
                    <input type="number" id="old-prod-qty-${product.id || idx}"
                           min="1" max="${product.quantity}" value="${product.quantity}"
                           onchange="updateCodReduceFromOldOrderProducts()"
                           style="width:50px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;text-align:center;">
                </div>
            </label>
        </div>
    `).join('');

    section.classList.remove('hidden');
}

/**
 * Tính COD giảm từ sản phẩm đơn cũ được chọn (theo số lượng trả)
 */
window.updateCodReduceFromOldOrderProducts = function() {
    const checkedInputs = document.querySelectorAll('#old-order-product-checklist input[type="checkbox"]:checked');
    let totalReduce = 0;

    checkedInputs.forEach(input => {
        const unitPrice = parseInt(input.dataset.unitPrice) || 0;
        const productId = input.value;
        const qtyInput = document.getElementById(`old-prod-qty-${productId}`);
        const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        totalReduce += unitPrice * returnQty;
    });

    // Cập nhật COD giảm
    document.getElementById('cod-reduce-amount').value = totalReduce;
    calculateCodRemaining();
}

// Event listener cho nút tìm đơn cũ (khởi tạo sau khi DOM sẵn sàng)
document.addEventListener('DOMContentLoaded', function() {
    const btnSearchOldOrder = document.getElementById('btn-search-old-order');
    if (btnSearchOldOrder) {
        btnSearchOldOrder.addEventListener('click', searchOldOrders);
    }

    // History tab filter listeners
    initHistoryFilters();
});

// =====================================================
// HISTORY TAB - Full ticket history with timeline
// =====================================================

/**
 * Initialize history tab filter event listeners
 */
function initHistoryFilters() {
    const searchInput = document.getElementById('history-search');
    const filterType = document.getElementById('history-filter-type');
    const filterStatus = document.getElementById('history-filter-status');
    const dateFrom = document.getElementById('history-date-from');
    const dateTo = document.getElementById('history-date-to');

    let debounceTimer = null;

    const triggerRender = () => {
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (activeTab === 'history') renderHistoryTab();
    };

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(triggerRender, 300);
        });
    }
    if (filterType) filterType.addEventListener('change', triggerRender);
    if (filterStatus) filterStatus.addEventListener('change', triggerRender);
    if (dateFrom) dateFrom.addEventListener('change', triggerRender);
    if (dateTo) dateTo.addEventListener('change', triggerRender);
}

/**
 * Update table headers based on current tab
 */
function updateTableHeaders(tabName) {
    const thead = document.querySelector('.data-table thead tr');
    if (!thead) return;

    if (tabName === 'history') {
        thead.innerHTML = `
            <th style="width:7%;">Mã đơn / ID</th>
            <th style="width:11%;">Khách hàng</th>
            <th style="width:9%;">Loại & Kênh</th>
            <th>Ghi Chú / Sản Phẩm</th>
            <th style="width:10%;">Trạng thái</th>
            <th style="width:14%;">Tiến trình</th>
            <th style="width:9%;">Chi tiết</th>
        `;
    } else {
        thead.innerHTML = `
            <th style="width:8%;">Mã đơn / ID</th>
            <th style="width:12%;">Khách hàng</th>
            <th style="width:9%;">Loại & Kênh</th>
            <th>Ghi Chú / Sản Phẩm</th>
            <th style="width:10%;">Tài chính</th>
            <th style="width:14%;">Hành động</th>
        `;
    }
}

/**
 * Render the History tab content
 */
function renderHistoryTab() {
    // Read filter values
    const searchTerm = (document.getElementById('history-search')?.value || '').toLowerCase().trim();
    const filterType = document.getElementById('history-filter-type')?.value || 'all';
    const filterStatus = document.getElementById('history-filter-status')?.value || 'all';
    const dateFrom = document.getElementById('history-date-from')?.value;
    const dateTo = document.getElementById('history-date-to')?.value;

    // Start with all tickets
    let filtered = [...TICKETS];

    // Filter by search text
    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.phone && t.phone.includes(searchTerm)) ||
            (t.orderId && t.orderId.toLowerCase().includes(searchTerm)) ||
            (t.customer && t.customer.toLowerCase().includes(searchTerm)) ||
            (t.firebaseId && t.firebaseId.toLowerCase().includes(searchTerm))
        );
    }

    // Filter by type
    if (filterType !== 'all') {
        filtered = filtered.filter(t => t.type === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
        filtered = filtered.filter(t => t.status === filterStatus);
    }

    // Filter by date range (based on createdAt)
    if (dateFrom) {
        const fromTs = new Date(dateFrom).getTime();
        filtered = filtered.filter(t => (t.createdAt || 0) >= fromTs);
    }
    if (dateTo) {
        const toTs = new Date(dateTo).getTime() + 86400000; // end of day
        filtered = filtered.filter(t => (t.createdAt || 0) < toTs);
    }

    // Sort by updatedAt (newest first), fallback to createdAt
    filtered.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    // Render table with history-specific columns
    elements.ticketList.innerHTML = '';

    if (filtered.length === 0) {
        elements.ticketList.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">Không tìm thấy phiếu nào</td></tr>`;
        return 0;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => showTicketHistory(t.firebaseId));

        const orderIdStr = String(t.orderId || '');
        const orderIdParts = orderIdStr.split('/');
        const last5Digits = orderIdParts.length > 0 ? orderIdParts[orderIdParts.length - 1] : orderIdStr;

        const customerName = t.customer || 'N/A';
        const customerPhone = t.phone || 'N/A';

        // Build timeline summary
        const timelineSummary = buildTimelineSummaryHTML(t);

        // Status badge
        const statusBadge = getStatusBadgeHTML(t.status);

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold;font-size:13px;">
                    <span style="color:#3b82f6;">${last5Digits}</span>
                </div>
                <div style="font-size:11px;color:#64748b;">#${t.tposId || '---'}</div>
            </td>
            <td>
                <div style="font-weight:500;color:#1e293b;">${customerName}</div>
                <div style="font-weight:500;color:#1e293b;">${customerPhone}</div>
            </td>
            <td>
                ${renderTypeBadge(t.type, t.fixCodReason, t.boomReason)}
            </td>
            <td>
                ${renderProductsList(t)}
            </td>
            <td class="history-status-cell">
                ${statusBadge}
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                    ${formatDateShort(t.createdAt)}
                </div>
            </td>
            <td>
                <div class="history-timeline-summary">${timelineSummary}</div>
            </td>
            <td>
                <button class="btn-view-history" onclick="event.stopPropagation(); showTicketHistory('${t.firebaseId}')">
                    Xem chi tiết
                </button>
            </td>
        `;
        elements.ticketList.appendChild(tr);
    });

    return filtered.length;
}

/**
 * Get status badge HTML for history tab
 */
function getStatusBadgeHTML(status) {
    const map = {
        'PENDING_GOODS': { cls: 'pending-goods', text: 'Chờ nhận hàng' },
        'PENDING_FINANCE': { cls: 'pending-finance', text: 'Chờ đối soát' },
        'COMPLETED': { cls: 'completed', text: 'Hoàn tất' },
        'CANCELLED': { cls: 'cancelled', text: 'Đã hủy' }
    };
    const info = map[status] || { cls: '', text: status };
    return `<span class="status-badge-sm ${info.cls}">${info.text}</span>`;
}

/**
 * Format date short (dd/MM/yyyy)
 */
function formatDateShort(timestamp) {
    if (!timestamp) return '---';
    const d = new Date(timestamp);
    return d.toLocaleDateString('vi-VN');
}

/**
 * Format date with time (dd/MM/yyyy HH:mm)
 */
function formatDateTime(timestamp) {
    if (!timestamp) return '---';
    const d = new Date(timestamp);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build a short timeline summary for the history table row
 */
function buildTimelineSummaryHTML(ticket) {
    const steps = buildTicketTimeline(ticket);
    return steps.map(s => {
        const icon = s.done ? '✓' : (s.active ? '◉' : '○');
        const cls = s.done ? 'step-done' : (s.active ? 'step-current' : '');
        return `<span class="step ${cls}">${icon} ${s.label}</span>`;
    }).join('');
}

/**
 * Build ticket timeline steps from ticket data
 * Returns array of { label, time, done, active, cancelled, detail }
 */
function buildTicketTimeline(ticket) {
    const steps = [];
    const status = ticket.status;

    // Step 1: Created
    steps.push({
        label: 'Tạo phiếu',
        time: ticket.createdAt,
        done: true,
        active: false,
        cancelled: false,
        detail: `Loại: ${translateType(ticket.type)}`
    });

    // Step 2: Virtual Credit (only for RETURN_SHIPPER)
    if (ticket.type === 'RETURN_SHIPPER') {
        const hasCredit = !!(ticket.virtualCreditId || ticket.virtual_credit_id);
        steps.push({
            label: 'Cấp công nợ ảo',
            time: null,
            done: hasCredit,
            active: !hasCredit && status === 'PENDING_GOODS',
            cancelled: status === 'CANCELLED' && !hasCredit,
            detail: hasCredit ? `ID: ${ticket.virtualCreditId || ticket.virtual_credit_id}` : ''
        });
    }

    // Step 3: Receive goods (for types that require it)
    const needsGoods = ['BOOM', 'RETURN_SHIPPER', 'RETURN_CLIENT', 'FIX_COD'].includes(ticket.type)
        && !(ticket.type === 'FIX_COD' && !['REJECT_PARTIAL', 'RETURN_OLD_ORDER'].includes(ticket.fixCodReason));
    if (needsGoods) {
        const receivedAt = ticket.receivedAt || ticket.received_at;
        const received = !!receivedAt || status === 'PENDING_FINANCE' || status === 'COMPLETED';
        steps.push({
            label: 'Nhận hàng',
            time: receivedAt ? new Date(receivedAt).getTime() : null,
            done: received,
            active: !received && status === 'PENDING_GOODS',
            cancelled: status === 'CANCELLED' && !received,
            detail: ticket.refundNumber ? `Phiếu trả: ${ticket.refundNumber}` : ''
        });
    }

    // Step 4: Payment/Settlement (for BOOM, FIX_COD)
    if (ticket.type === 'BOOM' || ticket.type === 'FIX_COD') {
        const settledAt = ticket.settled_at || ticket.completedAt || ticket.completed_at;
        const settled = status === 'COMPLETED';
        steps.push({
            label: 'Thanh toán',
            time: settled ? (settledAt ? new Date(settledAt).getTime() : null) : null,
            done: settled,
            active: status === 'PENDING_FINANCE',
            cancelled: status === 'CANCELLED',
            detail: settled ? formatCurrency(ticket.money) : ''
        });
    }

    // Step 5: Final status
    if (status === 'COMPLETED') {
        const completedAt = ticket.completedAt || ticket.completed_at;
        steps.push({
            label: 'Hoàn tất',
            time: completedAt ? new Date(completedAt).getTime() : null,
            done: true,
            active: false,
            cancelled: false,
            detail: ''
        });
    } else if (status === 'CANCELLED') {
        steps.push({
            label: 'Đã hủy',
            time: ticket.updatedAt || null,
            done: false,
            active: false,
            cancelled: true,
            detail: ''
        });
    }

    return steps;
}

/**
 * Translate ticket type to Vietnamese
 */
function translateType(type) {
    const map = {
        'BOOM': 'Không Nhận Hàng',
        'RETURN_SHIPPER': 'Thu về (Shipper)',
        'RETURN_CLIENT': 'Khách gửi',
        'FIX_COD': 'Sửa COD',
        'OTHER': 'Khác'
    };
    return map[type] || type;
}

/**
 * Show ticket history modal with full timeline
 */
window.showTicketHistory = async function(firebaseId) {
    const ticket = TICKETS.find(t => t.firebaseId === firebaseId);
    if (!ticket) {
        alert('Không tìm thấy phiếu');
        return;
    }

    const modal = document.getElementById('modal-ticket-history');
    const contentEl = document.getElementById('history-modal-content');

    // Build timeline from ticket data
    const steps = buildTicketTimeline(ticket);

    // Try to fetch audit logs from Firestore
    let auditLogs = [];
    try {
        auditLogs = await fetchAuditLogs(ticket.firebaseId);
    } catch (e) {
        console.warn('[History] Could not fetch audit logs:', e);
    }

    // Merge audit log info into timeline steps
    const enrichedSteps = enrichTimelineWithAuditLogs(steps, auditLogs);

    // Build modal HTML
    const orderIdStr = String(ticket.orderId || '');
    const statusBadge = getStatusBadgeHTML(ticket.status);

    contentEl.innerHTML = `
        <div class="history-modal-header">
            <div>
                <h2>Lịch sử phiếu ${ticket.firebaseId || ''}</h2>
                <div style="margin-top:4px;">${statusBadge}</div>
            </div>
        </div>

        <div class="history-modal-info">
            <div class="info-item">
                <label>Khách hàng</label>
                <span>${ticket.customer || 'N/A'}</span>
            </div>
            <div class="info-item">
                <label>Số điện thoại</label>
                <span>${ticket.phone || 'N/A'}</span>
            </div>
            <div class="info-item">
                <label>Mã đơn hàng</label>
                <span>${orderIdStr}</span>
            </div>
            <div class="info-item">
                <label>Loại sự vụ</label>
                <span>${renderTypeBadge(ticket.type, ticket.fixCodReason, ticket.boomReason)}</span>
            </div>
            <div class="info-item">
                <label>Số tiền</label>
                <span style="font-weight:700;color:${(ticket.type === 'BOOM' || ticket.type === 'FIX_COD') ? '#ef4444' : '#1e293b'};">
                    ${formatCurrency(ticket.money)}
                </span>
            </div>
            <div class="info-item">
                <label>Ghi chú</label>
                <span>${ticket.note || '—'}</span>
            </div>
        </div>

        <h3 style="margin-bottom:16px;font-size:16px;">Dòng thời gian xử lý</h3>
        <div class="ticket-timeline">
            ${enrichedSteps.map(step => {
                const stateClass = step.cancelled ? 'cancelled' : (step.done ? 'done' : (step.active ? 'active' : ''));
                return `
                    <div class="timeline-item ${stateClass}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <div class="timeline-title">${step.label}</div>
                            ${step.time ? `<div class="timeline-time">${formatDateTime(step.time)}</div>` : ''}
                            ${step.performer ? `<div class="timeline-performer">Bởi: ${step.performer}</div>` : ''}
                            ${step.detail ? `<div class="timeline-detail">${step.detail}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${ticket.products && ticket.products.length > 0 ? `
            <h3 style="margin:20px 0 12px;font-size:16px;">Sản phẩm</h3>
            <div style="font-size:13px;">${renderProductsList(ticket)}</div>
        ` : ''}
    `;

    openModal(modal);
};

/**
 * Fetch audit logs for a specific ticket from Firestore edit_history
 */
async function fetchAuditLogs(ticketCode) {
    try {
        let db = null;
        if (typeof window.initializeFirestore === 'function') {
            db = window.initializeFirestore({ enablePersistence: false });
        } else if (typeof window.getFirestore === 'function') {
            db = window.getFirestore();
        } else if (window.firebase && typeof window.firebase.firestore === 'function') {
            db = window.firebase.firestore();
        }

        if (!db) return [];

        const snapshot = await db.collection('edit_history')
            .where('module', '==', 'issue-tracking')
            .where('entityId', '==', ticketCode)
            .orderBy('timestamp', 'asc')
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                actionType: data.actionType,
                timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().getTime() : data.timestamp,
                performer: data.performerUserName || data.performerUserId || '',
                description: data.description || '',
                oldData: data.oldData,
                newData: data.newData
            };
        });
    } catch (e) {
        console.warn('[History] Firestore query failed:', e);
        return [];
    }
}

/**
 * Enrich timeline steps with audit log performer info
 */
function enrichTimelineWithAuditLogs(steps, auditLogs) {
    const actionMap = {
        'ticket_create': 'Tạo phiếu',
        'ticket_add_debt': 'Cấp công nợ ảo',
        'ticket_receive_goods': 'Nhận hàng',
        'ticket_payment': 'Thanh toán',
        'delete': 'Đã hủy'
    };

    return steps.map(step => {
        const enriched = { ...step };

        // Find matching audit log
        const matchingLog = auditLogs.find(log => {
            const mappedLabel = actionMap[log.actionType];
            return mappedLabel === step.label;
        });

        if (matchingLog) {
            if (!enriched.time && matchingLog.timestamp) {
                enriched.time = matchingLog.timestamp;
            }
            enriched.performer = matchingLog.performer;
            if (matchingLog.description && !enriched.detail) {
                enriched.detail = matchingLog.description;
            }
        }

        return enriched;
    });
}
