// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 17: QR CODE & DEBT FUNCTIONS                      ║
// ║                            search: #QR-DEBT                                 ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// DEBT (CÔNG NỢ) FUNCTIONS #QR-DEBT
// =====================================================

const DEBT_CACHE_KEY = 'orders_phone_debt_cache';
const DEBT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache for sync access
let debtCacheMemory = {};
let debtCacheLoaded = false;

/**
 * Initialize debt cache from IndexedDB
 */
async function initDebtCache() {
    if (debtCacheLoaded) return;

    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.readyPromise;
            const cached = await window.indexedDBStorage.getItem(DEBT_CACHE_KEY);
            if (cached) {
                debtCacheMemory = cached;
                console.log('[DEBT] ✅ Loaded cache from IndexedDB');
            }
        }

        // Migrate from localStorage if exists
        const localCache = localStorage.getItem(DEBT_CACHE_KEY);
        if (localCache) {
            const parsed = JSON.parse(localCache);
            Object.assign(debtCacheMemory, parsed);
            localStorage.removeItem(DEBT_CACHE_KEY);
            await saveDebtCacheAsync();
            console.log('[DEBT] 🔄 Migrated cache from localStorage to IndexedDB');
        }

        debtCacheLoaded = true;
    } catch (e) {
        console.error('[DEBT] Error initializing cache:', e);
        debtCacheLoaded = true;
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initDebtCache, 100));
} else {
    setTimeout(initDebtCache, 100);
}

/**
 * Get debt cache (sync - from memory)
 * @returns {Object} Cache object { phone: { totalDebt, lastFetched } }
 */
function getDebtCache() {
    return debtCacheMemory;
}

/**
 * Save debt cache to IndexedDB (async)
 */
async function saveDebtCacheAsync() {
    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.setItem(DEBT_CACHE_KEY, debtCacheMemory);
        }
    } catch (e) {
        console.error('[DEBT] Error saving cache to IndexedDB:', e);
    }
}

/**
 * Save debt cache (updates memory and triggers async IndexedDB save)
 * @param {Object} cache - Cache object to save
 */
function saveDebtCache(cache) {
    debtCacheMemory = cache;
    // Debounced async save
    if (saveDebtCache._timeout) clearTimeout(saveDebtCache._timeout);
    saveDebtCache._timeout = setTimeout(() => saveDebtCacheAsync(), 1000);
}

/**
 * Get cached debt for a phone number
 * @param {string} phone - Phone number
 * @returns {number|null} Total debt or null if not cached/expired
 */
function getCachedDebt(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    const cache = getDebtCache();
    const cached = cache[normalizedPhone];

    if (cached && (Date.now() - cached.lastFetched) < DEBT_CACHE_TTL) {
        return cached.totalDebt;
    }

    return null;
}

/**
 * Save debt to cache
 * @param {string} phone - Phone number
 * @param {number} totalDebt - Total debt amount
 */
function saveDebtToCache(phone, totalDebt) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const cache = getDebtCache();
    cache[normalizedPhone] = {
        totalDebt: totalDebt,
        lastFetched: Date.now()
    };
    saveDebtCache(cache);
}

/**
 * Fetch debt from API for a phone number
 * @param {string} phone - Phone number
 * @returns {Promise<number>} Total debt
 */
async function fetchDebtForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return 0;

    try {
        // Use wallet balance API instead of debt-summary
        const response = await fetch(`${QR_API_URL}/api/v2/wallet/balance?phone=${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success) {
            const totalBalance = result.balance || 0;
            saveDebtToCache(normalizedPhone, totalBalance);
            return totalBalance;
        }
    } catch (error) {
        console.error('[WALLET] Error fetching balance:', error);
    }

    return 0;
}

/**
 * Format currency for display
 * @param {number} amount - Amount
 * @returns {string} Formatted string
 */
function formatDebtCurrency(amount) {
    if (!amount || amount === 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Render debt column HTML
 * NOTE: This now only shows cached value or loading spinner.
 * Actual fetching is done by batchFetchDebts() after table render.
 * Click opens Customer 360° modal if WalletIntegration is available.
 * @param {string} phone - Phone number
 * @returns {string} HTML string for debt column
 */
function renderDebtColumn(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        return `<span style="color: #9ca3af;">-</span>`;
    }

    // Check cache first
    const cachedDebt = getCachedDebt(normalizedPhone);

    if (cachedDebt !== null) {
        // Has cached value - display immediately with click to open Customer 360° modal
        const color = cachedDebt > 0 ? '#10b981' : '#9ca3af';
        const clickHandler = typeof WalletIntegration !== 'undefined'
            ? `onclick="WalletIntegration.showWalletModal('${normalizedPhone}'); event.stopPropagation();" style="cursor: pointer;" title="Click để xem chi tiết ví"`
            : '';
        return `<span ${clickHandler} style="color: ${color}; font-weight: 500; font-size: 12px;${typeof WalletIntegration !== 'undefined' ? ' cursor: pointer;' : ''}">${formatDebtCurrency(cachedDebt)}</span>`;
    }

    // No cache - show loading spinner (batchFetchDebts will update this later)
    // Do NOT call fetchDebtForPhone here to avoid spam!
    return `<span class="debt-loading" data-phone="${normalizedPhone}" style="color: #9ca3af; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i></span>`;
}

/**
 * Update all debt cells with a specific phone number
 * @param {string} phone - Normalized phone number
 * @param {number} debt - Debt amount
 */
function updateDebtCells(phone, debt) {
    const color = debt > 0 ? '#10b981' : '#9ca3af';
    // Add click handler if WalletIntegration is available
    const clickHandler = typeof WalletIntegration !== 'undefined'
        ? `onclick="WalletIntegration.showWalletModal('${phone}'); event.stopPropagation();" style="cursor: pointer;" title="Click để xem chi tiết ví"`
        : '';
    const html = `<span ${clickHandler} style="color: ${color}; font-weight: 500; font-size: 12px;${typeof WalletIntegration !== 'undefined' ? ' cursor: pointer;' : ''}">${formatDebtCurrency(debt)}</span>`;

    // Find all loading cells with this phone and update them
    document.querySelectorAll(`.debt-loading[data-phone="${phone}"]`).forEach(cell => {
        cell.outerHTML = html;
    });
}

/**
 * Batch fetch wallet balances for multiple phones using wallet batch API
 * Reduces 80 API calls → 1 API call!
 * @param {Array<string>} phones - Array of phone numbers
 */
async function batchFetchDebts(phones) {
    // Validate input
    if (!phones || !Array.isArray(phones)) {
        console.warn('[WALLET-BATCH] Invalid input - phones must be an array');
        return;
    }

    const uniquePhones = [...new Set(phones.map(p => normalizePhoneForQR(p)).filter(p => p))];
    const uncachedPhones = uniquePhones.filter(p => getCachedDebt(p) === null);

    // Double-check before API call to prevent 400 errors
    if (!Array.isArray(uncachedPhones) || uncachedPhones.length === 0) {
        console.log('[WALLET-BATCH] No uncached phones to fetch, skipping API call');
        return;
    }

    console.log(`[WALLET-BATCH] Fetching ${uncachedPhones.length} phones in ONE request...`);

    try {
        // Call wallet batch API - ONE request for ALL phones!
        const requestBody = JSON.stringify({ phones: uncachedPhones });
        console.log('[WALLET-BATCH] Request body:', requestBody);

        const response = await fetch(`${QR_API_URL}/api/wallet/batch-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        // Check response status first
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[WALLET-BATCH] ❌ HTTP ${response.status}: ${errorText}`);
            // Fallback: set all to 0
            for (const phone of uncachedPhones) {
                updateDebtCells(phone, 0);
            }
            return;
        }

        const result = await response.json();

        if (result.success && result.data) {
            console.log(`[WALLET-BATCH] ✅ Received ${Object.keys(result.data).length} results`);

            // Update cache and UI for all phones
            for (const [phone, walletData] of Object.entries(result.data)) {
                // Total = balance + virtualBalance
                const totalBalance = walletData.total || 0;
                saveDebtToCache(phone, totalBalance);
                updateDebtCells(phone, totalBalance);
            }

            // Handle phones that weren't in the response (set to 0)
            for (const phone of uncachedPhones) {
                if (!result.data[phone]) {
                    saveDebtToCache(phone, 0);
                    updateDebtCells(phone, 0);
                }
            }
        } else {
            console.error('[WALLET-BATCH] ❌ API error:', result.error);
            // Fallback: set all to 0
            for (const phone of uncachedPhones) {
                updateDebtCells(phone, 0);
            }
        }
    } catch (error) {
        console.error('[WALLET-BATCH] ❌ Network error:', error);
        // Fallback: set all to 0
        for (const phone of uncachedPhones) {
            updateDebtCells(phone, 0);
        }
    }
}

// Make QR and Debt functions globally accessible
window.copyQRCode = copyQRCode;
window.getOrCreateQRForPhone = getOrCreateQRForPhone;
window.renderQRColumn = renderQRColumn;
window.syncQRFromBalanceHistory = syncQRFromBalanceHistory;
window.showOrderQRModal = showOrderQRModal;
window.closeOrderQRModal = closeOrderQRModal;
window.copyQRCodeFromModal = copyQRCodeFromModal;
window.copyQRImageUrl = copyQRImageUrl;
window.renderDebtColumn = renderDebtColumn;
window.fetchDebtForPhone = fetchDebtForPhone;
window.batchFetchDebts = batchFetchDebts;

// =====================================================
// REALTIME DEBT UPDATES (SSE)
// Lắng nghe giao dịch mới để cập nhật công nợ
// =====================================================

let debtEventSource = null;
let debtReconnectTimeout = null;
let isDebtManualClose = false;

/**
 * Extract phone number from transaction content
 * Tìm SĐT trong nội dung giao dịch hoặc từ customer-info mapping
 * @param {Object} transaction - Transaction object
 * @returns {string|null} Phone number or null
 */
function extractPhoneFromTransaction(transaction) {
    const content = transaction.content || '';

    // Try to find unique code (N2XXXXXXXXXX) in content
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);

    if (uniqueCodeMatch) {
        const uniqueCode = uniqueCodeMatch[0];
        // Look up phone from QR cache (reverse lookup)
        const qrCache = getQRCache();
        for (const [phone, data] of Object.entries(qrCache)) {
            if (data.uniqueCode === uniqueCode) {
                return phone;
            }
        }
    }

    return null;
}

/**
 * Handle new transaction from SSE - update debt
 * @param {Object} transaction - Transaction data
 */
async function handleDebtTransaction(transaction) {
    // Only care about incoming transactions (deposits)
    if (transaction.transfer_type !== 'in') return;

    const phone = extractPhoneFromTransaction(transaction);

    if (phone) {
        console.log(`[DEBT-REALTIME] New transaction for phone ${phone}, refreshing debt...`);

        // Invalidate cache for this phone
        const cache = getDebtCache();
        delete cache[phone];
        saveDebtCache(cache);

        // Re-fetch debt
        const newDebt = await fetchDebtForPhone(phone);

        // Update all cells in the table
        updateDebtCellsInTable(phone, newDebt);

        // Show notification
        showNotification(`Cập nhật công nợ: ${formatDebtCurrency(newDebt)}`, 'info');
    }
}

/**
 * Update debt cells in the orders table
 * @param {string} phone - Phone number
 * @param {number} debt - New debt amount
 */
function updateDebtCellsInTable(phone, debt) {
    const color = debt > 0 ? '#10b981' : '#9ca3af';
    const html = `<span style="color: ${color}; font-weight: 500; font-size: 12px;">${formatDebtCurrency(debt)}</span>`;

    // Find all debt cells and update those matching this phone
    document.querySelectorAll('td[data-column="debt"]').forEach(cell => {
        // Get the phone from the same row
        const row = cell.closest('tr');
        if (row) {
            const phoneCell = row.querySelector('td[data-column="phone"]');
            if (phoneCell) {
                const cellPhone = normalizePhoneForQR(phoneCell.textContent.trim());
                if (cellPhone === phone) {
                    cell.innerHTML = html;
                }
            }
        }
    });
}

/**
 * Connect to SSE endpoint for realtime debt updates
 */
function connectDebtRealtime() {
    if (debtEventSource) return; // Already connected

    try {
        console.log('[DEBT-REALTIME] Connecting to SSE endpoint...');
        debtEventSource = new EventSource(`${QR_API_URL}/api/sepay/stream`);

        // Connection established
        debtEventSource.addEventListener('connected', (e) => {
            console.log('[DEBT-REALTIME] ✅ Connected to SSE');
        });

        // New transaction received
        debtEventSource.addEventListener('new-transaction', (e) => {
            try {
                const transaction = JSON.parse(e.data);
                console.log('[DEBT-REALTIME] New transaction:', transaction.content?.substring(0, 50));
                handleDebtTransaction(transaction);
            } catch (err) {
                console.error('[DEBT-REALTIME] Error parsing transaction:', err);
            }
        });

        // Connection error
        debtEventSource.onerror = (error) => {
            console.error('[DEBT-REALTIME] SSE Error:', error);

            // Close current connection
            if (debtEventSource) {
                debtEventSource.close();
                debtEventSource = null;
            }

            // Attempt to reconnect after 10 seconds (if not manually closed)
            if (!isDebtManualClose) {
                clearTimeout(debtReconnectTimeout);
                debtReconnectTimeout = setTimeout(() => {
                    console.log('[DEBT-REALTIME] Attempting to reconnect...');
                    connectDebtRealtime();
                }, 10000);
            }
        };

    } catch (error) {
        console.error('[DEBT-REALTIME] Failed to connect:', error);
    }
}

/**
 * Disconnect from SSE
 */
function disconnectDebtRealtime() {
    isDebtManualClose = true;
    clearTimeout(debtReconnectTimeout);

    if (debtEventSource) {
        debtEventSource.close();
        debtEventSource = null;
        console.log('[DEBT-REALTIME] Disconnected from SSE');
    }
}

// Auto-connect realtime when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Delay connection to let page load first
    setTimeout(() => {
        connectDebtRealtime();
    }, 3000);
});

// =====================================================
// SALE BUTTON MODAL FUNCTIONS
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;

// =====================================================
// DELIVERY CARRIER MANAGEMENT
// =====================================================
const DELIVERY_CARRIER_CACHE_KEY = 'tpos_delivery_carriers';
const DELIVERY_CARRIER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for sync access
let deliveryCarrierCacheMemory = null;
let deliveryCarrierCacheLoaded = false;

/**
 * Initialize delivery carrier cache from IndexedDB
 */
async function initDeliveryCarrierCache() {
    if (deliveryCarrierCacheLoaded) return;

    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.readyPromise;
            const cached = await window.indexedDBStorage.getItem(DELIVERY_CARRIER_CACHE_KEY);
            if (cached) {
                deliveryCarrierCacheMemory = cached;
                console.log('[DELIVERY-CARRIER] ✅ Loaded cache from IndexedDB');
            }
        }

        // Migrate from localStorage if exists
        const localCache = localStorage.getItem(DELIVERY_CARRIER_CACHE_KEY);
        if (localCache) {
            const parsed = JSON.parse(localCache);
            deliveryCarrierCacheMemory = parsed;
            localStorage.removeItem(DELIVERY_CARRIER_CACHE_KEY);
            await saveDeliveryCarriersAsync(parsed);
            console.log('[DELIVERY-CARRIER] 🔄 Migrated cache from localStorage to IndexedDB');
        }

        deliveryCarrierCacheLoaded = true;
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error initializing cache:', e);
        deliveryCarrierCacheLoaded = true;
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initDeliveryCarrierCache, 200));
} else {
    setTimeout(initDeliveryCarrierCache, 200);
}

/**
 * Save delivery carriers to IndexedDB (async)
 */
async function saveDeliveryCarriersAsync(cacheData) {
    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.setItem(DELIVERY_CARRIER_CACHE_KEY, cacheData);
            console.log('[DELIVERY-CARRIER] 💾 Saved to IndexedDB');
        }
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error saving to IndexedDB:', e);
    }
}

/**
 * Get cached delivery carriers (from memory/IndexedDB)
 * @returns {Array|null} Cached carriers or null if expired/not found
 */
function getCachedDeliveryCarriers() {
    try {
        if (!deliveryCarrierCacheMemory) return null;

        const { data, timestamp } = deliveryCarrierCacheMemory;
        if (Date.now() - timestamp > DELIVERY_CARRIER_CACHE_TTL) {
            deliveryCarrierCacheMemory = null;
            // Clean up IndexedDB async
            if (window.indexedDBStorage) {
                window.indexedDBStorage.removeItem(DELIVERY_CARRIER_CACHE_KEY);
            }
            return null;
        }
        return data;
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error reading cache:', e);
        return null;
    }
}

/**
 * Save delivery carriers to cache (memory + IndexedDB)
 * @param {Array} carriers - Array of carrier objects
 */
function saveDeliveryCarriersToCache(carriers) {
    try {
        const cacheData = {
            data: carriers,
            timestamp: Date.now()
        };
        deliveryCarrierCacheMemory = cacheData;
        // Async save to IndexedDB
        saveDeliveryCarriersAsync(cacheData);
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error saving cache:', e);
    }
}

/**
 * Fetch delivery carriers from TPOS API
 * @returns {Promise<Array>} Array of delivery carrier objects
 */
async function fetchDeliveryCarriers() {
    // Check cache first
    const cached = getCachedDeliveryCarriers();
    if (cached) {
        console.log('[DELIVERY-CARRIER] Using cached data:', cached.length, 'carriers');
        return cached;
    }

    // Get auth token from various possible localStorage keys
    // Priority: bearer_token_data > auth > tpos_token
    let token = null;
    try {
        // Try bearer_token_data first (most common key used by TPOS)
        const bearerData = localStorage.getItem('bearer_token_data');
        if (bearerData) {
            const parsed = JSON.parse(bearerData);
            token = parsed.access_token || parsed.AccessToken;
            console.log('[DELIVERY-CARRIER] Found token in bearer_token_data');
        }

        // Fallback to auth
        if (!token) {
            const authData = localStorage.getItem('auth');
            if (authData) {
                const parsed = JSON.parse(authData);
                token = parsed.AccessToken || parsed.access_token;
                console.log('[DELIVERY-CARRIER] Found token in auth');
            }
        }

        // Fallback to tpos_token
        if (!token) {
            const tokenData = localStorage.getItem('tpos_token');
            if (tokenData) {
                const parsed = JSON.parse(tokenData);
                token = parsed.AccessToken || parsed.access_token;
                console.log('[DELIVERY-CARRIER] Found token in tpos_token');
            }
        }
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error parsing auth:', e);
    }

    if (!token) {
        console.warn('[DELIVERY-CARRIER] No auth token found in: bearer_token_data, auth, tpos_token');
        return [];
    }

    try {
        // Use Cloudflare Worker proxy to bypass CORS
        // Proxy: /api/odata/* → tomato.tpos.vn/odata/*
        const proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier?$format=json&$orderby=DateCreated+desc&$filter=Active+eq+true&$count=true';
        console.log('[DELIVERY-CARRIER] Fetching from proxy:', proxyUrl);

        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'authorization': `Bearer ${token}`,
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const carriers = data.value || [];

        console.log('[DELIVERY-CARRIER] Fetched:', carriers.length, 'carriers');

        // Save to cache
        saveDeliveryCarriersToCache(carriers);

        return carriers;
    } catch (error) {
        console.error('[DELIVERY-CARRIER] Error fetching:', error);
        return [];
    }
}

/**
 * Populate delivery partner dropdown with carriers
 * @param {string} selectedId - Optional: ID of carrier to select
 */
async function populateDeliveryCarrierDropdown(selectedId = null) {
    console.log('[DELIVERY-CARRIER] populateDeliveryCarrierDropdown called');

    const select = document.getElementById('saleDeliveryPartner');
    if (!select) {
        console.error('[DELIVERY-CARRIER] Select element not found!');
        return;
    }

    console.log('[DELIVERY-CARRIER] Found select element, showing loading...');

    // Show loading
    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    const carriers = await fetchDeliveryCarriers();
    console.log('[DELIVERY-CARRIER] Got carriers:', carriers.length);

    // Build options
    let optionsHtml = '<option value="">-- Chọn đối tác giao hàng --</option>';
    carriers.forEach(carrier => {
        const fee = carrier.Config_DefaultFee || carrier.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        const selected = selectedId && carrier.Id == selectedId ? 'selected' : '';
        optionsHtml += `<option value="${carrier.Id}" data-fee="${fee}" data-name="${carrier.Name}"${selected}>${carrier.Name}${feeText}</option>`;
    });

    select.innerHTML = optionsHtml;
    select.disabled = false;

    // Add change event to update shipping fee
    select.onchange = function () {
        const selectedOption = this.options[this.selectedIndex];
        const fee = parseFloat(selectedOption.dataset.fee) || 0;
        const shippingFeeInput = document.getElementById('saleShippingFee');
        if (shippingFeeInput) {
            shippingFeeInput.value = fee;
            // Trigger recalculation of COD
            updateSaleCOD();
        }
    };

    // If a carrier was pre-selected, trigger the change event to set fee
    if (selectedId) {
        select.dispatchEvent(new Event('change'));
    }
}

/**
 * Update COD based on total amount, shipping fee, and prepaid amount
 */
function updateSaleCOD() {
    const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
    const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) || 0;
    const codInput = document.getElementById('saleCOD');

    if (codInput) {
        // COD = Total + Shipping (không trừ prepaid)
        const cod = totalAmount + shippingFee;
        codInput.value = cod;
    }

    // Update remaining balance after COD changes
    updateSaleRemainingBalance();
}

/**
 * Update Remaining Balance (Còn lại) in the modal
 * Logic:
 * - If Prepaid >= COD: Remaining = 0
 * - If Prepaid < COD: Remaining = COD - Prepaid
 */
function updateSaleRemainingBalance() {
    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    const remainingElement = document.getElementById('saleRemainingBalance');

    if (remainingElement) {
        let remaining = 0;
        if (prepaidAmount < codValue) {
            remaining = codValue - prepaidAmount;
        }
        // Format the remaining balance
        remainingElement.textContent = formatNumber(remaining);
    }
}

// Export remaining balance function to window for debugging
window.updateSaleRemainingBalance = updateSaleRemainingBalance;

// Export delivery carrier functions to window for debugging
window.fetchDeliveryCarriers = fetchDeliveryCarriers;
window.populateDeliveryCarrierDropdown = populateDeliveryCarrierDropdown;
window.getCachedDeliveryCarriers = getCachedDeliveryCarriers;

/**
 * Smart select delivery partner based on customer address
 * Parses the carrier names to find matching district/ward
 * @param {string} address - Full customer address string
 * @param {object} extraAddress - Optional ExtraAddress object with District, Ward, City
 */
function smartSelectDeliveryPartner(address, extraAddress = null) {
    console.log('[SMART-DELIVERY] Starting smart selection...');
    console.log('[SMART-DELIVERY] Address:', address);
    console.log('[SMART-DELIVERY] ExtraAddress:', extraAddress);

    const select = document.getElementById('saleDeliveryPartner');
    if (!select || select.options.length <= 1) {
        console.log('[SMART-DELIVERY] Dropdown not ready, skipping');
        return;
    }

    // Extract district info from address or ExtraAddress
    let districtInfo = extractDistrictFromAddress(address, extraAddress);
    console.log('[SMART-DELIVERY] Extracted district info:', districtInfo);

    if (!districtInfo) {
        console.log('[SMART-DELIVERY] Could not extract district, selecting SHIP TỈNH as fallback');
        selectCarrierByName(select, 'SHIP TỈNH', true);
        return;
    }

    // Try to find matching carrier based on district
    const matchedCarrier = findMatchingCarrier(select, districtInfo);

    if (matchedCarrier) {
        console.log('[SMART-DELIVERY] ✅ Found matching carrier:', matchedCarrier.name);
        select.value = matchedCarrier.id;
        select.dispatchEvent(new Event('change'));

        // Show success notification (subtle)
        if (window.notificationManager) {
            window.notificationManager.success(`Tự động chọn: ${matchedCarrier.name}`, 2000);
        }
    } else {
        console.log('[SMART-DELIVERY] ⚠️ No matching carrier found, selecting SHIP TỈNH');
        selectCarrierByName(select, 'SHIP TỈNH', true);
    }
}

/**
 * Extract district information from address string or ExtraAddress object
 * @returns {object|null} - { districtName, districtNumber, wardName, cityName }
 */
function extractDistrictFromAddress(address, extraAddress) {
    let result = {
        districtName: null,
        districtNumber: null,
        wardName: null,
        cityName: null,
        originalText: address
    };

    // Try to get structured data from ExtraAddress first
    if (extraAddress) {
        if (extraAddress.District?.name) {
            result.districtName = extraAddress.District.name;
            // Extract number from district name like "Quận 1", "Quận 12", etc.
            const numMatch = extraAddress.District.name.match(/(\d+)/);
            if (numMatch) {
                result.districtNumber = numMatch[1];
            }
        }
        if (extraAddress.Ward?.name) {
            result.wardName = extraAddress.Ward.name;
        }
        if (extraAddress.City?.name) {
            result.cityName = extraAddress.City.name;
        }
    }

    // Also parse from address string as fallback/supplement
    if (address) {
        const normalizedAddress = address.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove Vietnamese diacritics for matching

        // Try to match district patterns
        // "Quận 1", "Q1", "Q.1", "Quan 1", "District 1"
        const districtPatterns = [
            /quan\s*(\d+)/i,
            /q\.?\s*(\d+)/i,
            /district\s*(\d+)/i
        ];

        for (const pattern of districtPatterns) {
            const match = normalizedAddress.match(pattern);
            if (match) {
                result.districtNumber = match[1];
                break;
            }
        }

        // Match named districts (without diacritics)
        const namedDistricts = [
            { normalized: 'binh chanh', original: 'Bình Chánh' },
            { normalized: 'binh tan', original: 'Bình Tân' },
            { normalized: 'binh thanh', original: 'Bình Thạnh' },
            { normalized: 'go vap', original: 'Gò Vấp' },
            { normalized: 'phu nhuan', original: 'Phú Nhuận' },
            { normalized: 'tan binh', original: 'Tân Bình' },
            { normalized: 'tan phu', original: 'Tân Phú' },
            { normalized: 'thu duc', original: 'Thủ Đức' },
            { normalized: 'nha be', original: 'Nhà Bè' },
            { normalized: 'hoc mon', original: 'Hóc Môn' },
            { normalized: 'cu chi', original: 'Củ Chi' },
            { normalized: 'can gio', original: 'Cần Giờ' }
        ];

        for (const district of namedDistricts) {
            if (normalizedAddress.includes(district.normalized)) {
                result.districtName = district.original;
                break;
            }
        }
    }

    // Return null if we couldn't extract any district info
    if (!result.districtName && !result.districtNumber) {
        return null;
    }

    return result;
}

/**
 * Find matching carrier based on district information
 * Parses carrier names to find coverage areas in parentheses
 * @param {HTMLSelectElement} select - The delivery partner dropdown
 * @param {object} districtInfo - Extracted district information
 * @returns {object|null} - { id, name } of matching carrier
 */
function findMatchingCarrier(select, districtInfo) {
    console.log('[SMART-DELIVERY] Searching for carrier matching:', districtInfo);

    let bestMatch = null;
    let bestMatchScore = 0;

    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (!option.value) continue; // Skip placeholder

        const carrierName = option.dataset.name || option.text;

        // Skip non-matching carriers (GỘP, BÁN HÀNG SHOP)
        if (carrierName.includes('GỘP') || carrierName === 'BÁN HÀNG SHOP') {
            continue;
        }

        // Extract coverage area from carrier name (text in parentheses)
        const coverageMatch = carrierName.match(/\(([^)]+)\)/);
        if (!coverageMatch) continue;

        const coverageArea = coverageMatch[1].toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let matchScore = 0;

        // Check if district number matches
        if (districtInfo.districtNumber) {
            // Look for the number in coverage area
            // Need to be careful: "1" shouldn't match "10" or "11"
            const districtNum = districtInfo.districtNumber;

            // Pattern to match standalone numbers or numbers at word boundaries
            // For coverage like "1 3 4 5 6 7 8 10 11" or "Q2-12-Bình Tân"
            const numPatterns = [
                new RegExp(`\\b${districtNum}\\b`),           // Word boundary
                new RegExp(`^${districtNum}\\s`),             // Start of string
                new RegExp(`\\s${districtNum}\\s`),           // Space surrounded
                new RegExp(`\\s${districtNum}$`),             // End of string
                new RegExp(`-${districtNum}-`),               // Dash surrounded
                new RegExp(`^${districtNum}-`),               // Start with dash
                new RegExp(`-${districtNum}$`),               // End with dash
                new RegExp(`q${districtNum}\\b`, 'i'),        // Q prefix (Q9, Q2)
            ];

            for (const pattern of numPatterns) {
                if (pattern.test(coverageArea) || pattern.test(carrierName)) {
                    matchScore = 10;
                    console.log(`[SMART-DELIVERY] District number ${districtNum} matched in: ${carrierName}`);
                    break;
                }
            }
        }

        // Check if district name matches
        if (districtInfo.districtName && matchScore === 0) {
            const normalizedDistrictName = districtInfo.districtName.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            if (coverageArea.includes(normalizedDistrictName)) {
                matchScore = 8;
                console.log(`[SMART-DELIVERY] District name "${districtInfo.districtName}" matched in: ${carrierName}`);
            }
        }

        // Update best match
        if (matchScore > bestMatchScore) {
            bestMatchScore = matchScore;
            bestMatch = {
                id: option.value,
                name: carrierName
            };
        }
    }

    return bestMatch;
}

/**
 * Select carrier by name pattern (fallback selection)
 * @param {HTMLSelectElement} select - The delivery partner dropdown
 * @param {string} namePattern - Name to search for
 * @param {boolean} showWarning - Whether to show a warning notification
 */
function selectCarrierByName(select, namePattern, showWarning = false) {
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        const carrierName = option.dataset.name || option.text;

        if (carrierName.includes(namePattern)) {
            select.value = option.value;
            select.dispatchEvent(new Event('change'));

            if (showWarning && window.notificationManager) {
                window.notificationManager.info(
                    `Không xác định được quận/huyện, đã chọn: ${carrierName}`,
                    3000
                );
            }
            return true;
        }
    }
    return false;
}

// Export smart delivery functions for debugging
window.smartSelectDeliveryPartner = smartSelectDeliveryPartner;
window.extractDistrictFromAddress = extractDistrictFromAddress;
window.findMatchingCarrier = findMatchingCarrier;

/**
 * Format currency in Vietnamese style
 */
function formatCurrencyVND(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

/**
 * Open Sale Button Modal and fetch order details from API
 */
async function openSaleButtonModal() {
    console.log('[SALE-MODAL] Opening Sale Button Modal...');

    // Get the selected order ID (should be exactly 1)
    if (selectedOrderIds.size !== 1) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn đúng 1 đơn hàng');
        }
        return;
    }

    const orderId = Array.from(selectedOrderIds)[0];
    // O(1) via OrderStore with fallback
    const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);

    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }

    currentSaleOrderData = order;
    console.log('[SALE-MODAL] Selected order:', order);

    // Show modal with loading state
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Restore bill type preference from localStorage (default: 'web')
    const savedBillType = localStorage.getItem('saleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('saleBillTypeWeb');
    const billTypeTpos = document.getElementById('saleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    // Check if user is admin and enable/disable Công nợ field accordingly
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmDebtBtn = document.getElementById('confirmDebtBtn');

    // Check admin access via checkLogin level (0 = admin)
    let isAdmin = window.authManager?.hasPermission(0) || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
            console.log('[SALE-MODAL] Admin detected - Công nợ field enabled with confirm button');
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }

        // Add event listener for prepaid amount changes (for admin)
        prepaidAmountField.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Add event listener for COD input changes
    const codInput = document.getElementById('saleCOD');
    if (codInput) {
        codInput.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Add event listener for shipping fee changes to update COD realtime
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            // Recalculate COD when shipping fee changes
            const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const shippingFee = parseFloat(this.value) || 0;
            const codInput = document.getElementById('saleCOD');
            if (codInput) {
                codInput.value = finalTotal + shippingFee;
                updateSaleRemainingBalance();
            }
        };
    }

    // Add event listener for discount changes to update totals realtime
    const discountInput = document.getElementById('saleDiscount');
    if (discountInput) {
        discountInput.oninput = function () {
            // Recalculate totals when discount changes
            const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Populate basic order data first (from local data)
    populateSaleModalWithOrder(order);

    // Fetch realtime debt for the phone number (same as debt column in table)
    const phone = order.Telephone || order.PartnerPhone;
    if (phone) {
        fetchDebtForSaleModal(phone);
    }

    // Populate delivery carrier dropdown (async, with localStorage cache)
    // Must await to ensure dropdown is ready for smart selection
    await populateDeliveryCarrierDropdown();

    // Fetch detailed order data from API (includes partner, orderLines)
    const orderDetails = await fetchOrderDetailsForSale(orderId);

    if (orderDetails) {
        // Store partner data
        currentSalePartnerData = orderDetails.partner;

        // Populate partner data
        if (orderDetails.partner) {
            populatePartnerData(orderDetails.partner);

            // Smart select delivery partner based on customer address
            const receiverAddress = document.getElementById('saleReceiverAddress')?.value || '';
            const extraAddress = orderDetails.partner.ExtraAddress || null;
            smartSelectDeliveryPartner(receiverAddress, extraAddress);
        }

        // Populate order lines if available
        if (orderDetails.orderLines && orderDetails.orderLines.length > 0) {
            // 🔥 Map SaleOnlineDetailId from orderLine.Id for FastSaleOrder compatibility
            const mappedOrderLines = orderDetails.orderLines.map(line => ({
                ...line,
                SaleOnlineDetailId: line.Id || line.SaleOnlineDetailId || null
            }));
            populateSaleOrderLinesFromAPI(mappedOrderLines);
        }
    } else {
        // Fallback: try smart selection with basic order address if no partner details
        const receiverAddress = order.PartnerAddress || order.Address || '';
        if (receiverAddress) {
            smartSelectDeliveryPartner(receiverAddress, null);
        }
    }

    // Initialize product search for this modal
    initSaleProductSearch();
}

/**
 * Close Sale Button Modal
 * @param {boolean} clearSelection - If true, clear checkbox selection and selectedOrderIds
 */
function closeSaleButtonModal(clearSelection = false) {
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'none';
    currentSaleOrderData = null;
    currentSalePartnerData = null;

    // Clear selection if requested (after successful order creation)
    if (clearSelection) {
        // Clear selectedOrderIds
        selectedOrderIds.clear();

        // Uncheck all checkboxes in table
        const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Uncheck "Select All" checkbox
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        // Update action buttons visibility
        updateActionButtons();
    }
}

/**
 * Confirm debt update - Admin only
 * Updates the debt value in the database (customers.debt field on SQL Render)
 */
async function confirmDebtUpdate() {
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmBtn = document.getElementById('confirmDebtBtn');

    if (!prepaidAmountField || !currentSaleOrderData) {
        if (window.notificationManager) {
            window.notificationManager.error('Không có dữ liệu để cập nhật');
        }
        return;
    }

    const phone = currentSaleOrderData.Telephone || currentSaleOrderData.PartnerPhone;
    if (!phone) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy số điện thoại khách hàng');
        }
        return;
    }

    const newDebt = parseFloat(prepaidAmountField.value) || 0;

    // Show loading state
    const originalText = confirmBtn?.textContent;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '...';
    }

    try {
        console.log('[DEBT-UPDATE] Updating debt for phone:', phone, 'to:', newDebt);

        const response = await fetch(`${QR_API_URL}/api/sepay/update-debt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: phone,
                new_debt: newDebt,
                reason: 'Admin manual adjustment from Sale Modal'
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('[DEBT-UPDATE] ✅ Success:', result);
            if (window.notificationManager) {
                window.notificationManager.success(`Đã cập nhật Công nợ: ${newDebt.toLocaleString('vi-VN')}đ`);
            }
            // Update the field background to indicate saved
            prepaidAmountField.style.background = '#d1fae5'; // Light green
            setTimeout(() => {
                prepaidAmountField.style.background = '#ffffff';
            }, 2000);

            // 🔄 REALTIME UPDATE: Invalidate cache and update table cells immediately
            const normalizedPhone = normalizePhoneForQR(phone);
            if (normalizedPhone) {
                // Invalidate debt cache for this phone
                const cache = getDebtCache();
                delete cache[normalizedPhone];
                saveDebtCache(cache);
                console.log('[DEBT-UPDATE] Cache invalidated for phone:', normalizedPhone);

                // Update debt cells in the orders table immediately
                updateDebtCellsInTable(normalizedPhone, newDebt);
                console.log('[DEBT-UPDATE] Table cells updated for phone:', normalizedPhone);

                // Also update "Nợ cũ" display in modal
                const oldDebtField = document.getElementById('saleOldDebt');
                if (oldDebtField) {
                    oldDebtField.textContent = newDebt > 0 ? `${newDebt.toLocaleString('vi-VN')} đ` : '0';
                }
            }
        } else {
            throw new Error(result.error || 'Failed to update debt');
        }

    } catch (error) {
        console.error('[DEBT-UPDATE] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi cập nhật Công nợ: ' + error.message);
        }
    } finally {
        // Restore button state
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText || 'Xác nhận';
        }
    }
}

/**
 * Switch tabs in Sale Modal
 */
function switchSaleTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.sale-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab contents
    document.querySelectorAll('.sale-tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });

    const activeContent = document.getElementById(`saleTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
    }
}

/**
 * Populate modal with order data
 */
function populateSaleModalWithOrder(order) {
    console.log('[SALE-MODAL] Populating order data:', order);

    // Basic info - Update header (moved from Tab "Thông tin")
    const customerName = order.PartnerName || order.Name || '';
    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerNameHeader').textContent = customerName;

    // Customer status (will be updated by API)
    document.getElementById('saleCustomerStatus').textContent = '';
    document.getElementById('saleCustomerStatusHeader').textContent = '';
    document.getElementById('saleLoyaltyPoints').textContent = '0';
    document.getElementById('saleLoyaltyPointsHeader').textContent = '0';
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = '0';
    document.getElementById('saleOldDebt').textContent = '0';

    // Tab "Thông tin người nhận"
    document.getElementById('saleReceiverName').value = order.PartnerName || order.Name || '';
    document.getElementById('saleReceiverPhone').value = order.PartnerPhone || order.Telephone || '';
    document.getElementById('saleReceiverAddress').value = order.PartnerAddress || order.Address || '';
    document.getElementById('saleReceiverNote').value = '';

    // Tab "Thông tin giao hàng"
    // 🔥 FIX: Use proper check to allow 0 value
    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue)
        : 35000;
    const totalAmount = order.TotalAmount || 0;

    // COD = Tổng tiền hàng + phí ship (nếu khách trả ship)
    document.getElementById('saleCOD').value = totalAmount + shippingFee;

    // Ghi chú giao hàng mặc định
    const defaultDeliveryNote = 'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CỦA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ';
    document.getElementById('saleDeliveryNote').value = order.Comment || defaultDeliveryNote;

    // Giá trị hàng hóa
    document.getElementById('saleGoodsValue').value = totalAmount;

    // Set delivery date
    const now = new Date();
    document.getElementById('saleDeliveryDate').value = formatDateTimeLocal(now);
    document.getElementById('saleInvoiceDate').textContent = formatDateTimeDisplay(now);

    // Populate order items (products)
    populateSaleOrderItems(order);
}

/**
 * Fetch order details (partner, orderLines) from TPOS API
 */
async function fetchOrderDetailsForSale(orderUuid) {
    console.log('[SALE-MODAL] Fetching order details for UUID:', orderUuid);

    try {
        // Use tokenManager to get valid token (auto-refreshes if expired)
        let token;
        if (window.tokenManager) {
            token = await window.tokenManager.getToken();
        } else {
            // Fallback: try to get from bearer_token_data storage
            const storedData = localStorage.getItem('bearer_token_data');
            if (storedData) {
                const data = JSON.parse(storedData);
                token = data.access_token;
            }
        }

        if (!token) {
            console.warn('[SALE-MODAL] No auth token found');
            return null;
        }

        const response = await fetch('https://tomato.tpos.vn/odata/SaleOnline_Order/ODataService.GetDetails?$expand=orderLines($expand=Product,ProductUOM),partner,warehouse', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json;charset=UTF-8',
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1',
                'x-tpos-lang': 'vi'
            },
            body: JSON.stringify({ ids: [orderUuid] })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[SALE-MODAL] Order details response:', data);

        return data;

    } catch (error) {
        console.error('[SALE-MODAL] Error fetching order details:', error);
        if (window.notificationManager) {
            window.notificationManager.warning('Không thể tải thông tin đơn hàng');
        }
        return null;
    }
}

/**
 * Populate partner data into modal
 */
function populatePartnerData(partner) {
    if (!partner) return;

    // Customer info - Update both hidden elements and header
    const customerName = partner.DisplayName || partner.Name || '';
    const customerStatus = partner.StatusText || 'Bình thường';
    const loyaltyPoints = partner.LoyaltyPoints || 0;

    // Hidden elements (for JS compatibility)
    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerStatus').textContent = customerStatus;
    document.getElementById('saleLoyaltyPoints').textContent = loyaltyPoints;

    // Header elements (visible)
    document.getElementById('saleCustomerNameHeader').textContent = customerName;
    document.getElementById('saleCustomerStatusHeader').textContent = customerStatus;
    document.getElementById('saleLoyaltyPointsHeader').textContent = loyaltyPoints;
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = loyaltyPoints;

    // NOTE: Prepaid amount (salePrepaidAmount) and Old Debt (saleOldDebt) are now
    // populated by fetchDebtForSaleModal() using REALTIME debt from balance-history API
    // instead of TPOS partner.Debit/Credit data. This ensures consistency with
    // the "Công Nợ" column in the orders table.

    // Receiver info (update if not already set)
    const receiverName = document.getElementById('saleReceiverName');
    const receiverPhone = document.getElementById('saleReceiverPhone');
    const receiverAddress = document.getElementById('saleReceiverAddress');

    if (!receiverName.value) receiverName.value = partner.DisplayName || partner.Name || '';
    if (!receiverPhone.value) receiverPhone.value = partner.Phone || partner.Mobile || '';

    // Build address from ExtraAddress or FullAddress
    if (!receiverAddress.value) {
        let address = partner.FullAddress || partner.Street || '';
        if (!address && partner.ExtraAddress) {
            const ea = partner.ExtraAddress;
            const parts = [ea.Street, ea.Ward?.name, ea.District?.name, ea.City?.name].filter(p => p);
            address = parts.join(', ');
        }
        receiverAddress.value = address;
    }
}

/**
 * Fetch realtime wallet balance for sale modal
 * Uses wallet API to get customer's available balance (prepaid + virtual credit)
 * @param {string} phone - Phone number
 */
async function fetchDebtForSaleModal(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const oldDebtField = document.getElementById('saleOldDebt');

    // Show loading state
    if (prepaidAmountField) {
        prepaidAmountField.value = '...';
    }

    try {
        // Use wallet API to get customer's available balance
        const response = await fetch(`${QR_API_URL}/api/wallet/${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            // Total balance = real balance + virtual balance
            // API returns snake_case: balance, virtual_balance
            const realBalance = parseFloat(result.data.balance) || 0;
            const virtualBalance = parseFloat(result.data.virtual_balance) || 0;
            const totalBalance = realBalance + virtualBalance;
            console.log('[SALE-MODAL] Wallet balance for phone:', normalizedPhone, '=', totalBalance, '(real:', realBalance, '+ virtual:', virtualBalance, ')');

            // Update prepaid amount field with total available balance
            if (prepaidAmountField) {
                prepaidAmountField.value = totalBalance > 0 ? totalBalance : 0;
            }

            // Also update the "Nợ cũ" display to show wallet balance
            if (oldDebtField) {
                oldDebtField.textContent = formatCurrencyVND(totalBalance);
            }

            // Cache it for later use
            saveDebtToCache(normalizedPhone, totalBalance);

            // Also update debt column in orders table to keep them in sync
            updateDebtCellsInTable(normalizedPhone, totalBalance);

            // Update remaining balance after prepaid amount changes
            updateSaleRemainingBalance();
        } else {
            // No wallet found, set to 0
            console.log('[SALE-MODAL] No wallet data for phone:', normalizedPhone);
            if (prepaidAmountField) {
                prepaidAmountField.value = 0;
            }
            updateSaleRemainingBalance();
        }
    } catch (error) {
        console.error('[SALE-MODAL] Error fetching wallet balance:', error);
        // Fallback to 0 on error
        if (prepaidAmountField) {
            prepaidAmountField.value = 0;
        }
        // Update remaining balance even on error
        updateSaleRemainingBalance();
    }

    // Fetch transactions and auto-fill notes
    try {
        await fetchAndAutoFillNotes(normalizedPhone);
    } catch (txError) {
        console.error('[SALE-MODAL] Error fetching transactions for auto-notes:', txError);
    }
}

/**
 * Generate auto-notes from wallet transactions
 * Format:
 * - Bank transfer: "CK [amount]K [bank] [DD/MM]" (e.g., "CK 1335K ACB 25/01")
 * - Return/refund: "Trừ [amount]K Tiền Trả Hàng Đơn [Order Code]"
 * @param {Array} transactions - Array of transaction objects
 * @returns {string} Combined notes string
 */
function generateAutoNotesFromTransactions(transactions) {
    if (!transactions || !Array.isArray(transactions)) return '';

    const notes = [];

    transactions.forEach(tx => {
        // Chỉ xử lý giao dịch dương (công nợ dương)
        if (tx.amount <= 0) return;

        const amountK = Math.round(tx.amount / 1000);
        const date = new Date(tx.created_at);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        if (tx.source === 'BANK_TRANSFER' || tx.reference_type === 'balance_history') {
            // Chuyển khoản: CK [amount]K [bank] [DD/MM]
            const bank = tx.gateway || 'BANK';
            notes.push(`CK ${amountK}K ${bank} ${dateStr}`);
        } else if (tx.source === 'RETURN_GOODS' || tx.type === 'VIRTUAL_CREDIT_ISSUED' || tx.reference_type === 'ticket') {
            // Trả hàng/Thu về: Trừ [amount]K Tiền Trả Hàng Đơn [Mã đơn]
            const orderCode = tx.reference_id || tx.source_id || '';
            if (orderCode) {
                notes.push(`Trừ ${amountK}K Tiền Trả Hàng Đơn ${orderCode}`);
            } else {
                notes.push(`Trừ ${amountK}K Tiền Trả Hàng`);
            }
        }
    });

    return notes.join('\n');
}

/**
 * Fetch transactions and auto-fill notes in the sale modal
 * @param {string} phone - Normalized phone number
 */
async function fetchAndAutoFillNotes(phone) {
    const noteField = document.getElementById('saleReceiverNote');
    if (!noteField) return;

    try {
        // Fetch transactions from API
        const response = await fetch(`${QR_API_URL}/api/customer/${encodeURIComponent(phone)}/transactions?limit=50`);
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            // Filter only positive amount transactions (công nợ dương)
            const positiveTransactions = result.data.filter(tx => tx.amount > 0);

            if (positiveTransactions.length > 0) {
                const autoNotes = generateAutoNotesFromTransactions(positiveTransactions);
                if (autoNotes) {
                    // Only auto-fill if the note field is empty
                    if (!noteField.value.trim()) {
                        noteField.value = autoNotes;
                        console.log('[SALE-MODAL] Auto-filled notes:', autoNotes);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[SALE-MODAL] Error fetching transactions:', error);
    }
}

/**
 * Show customer wallet history modal
 * Opens the wallet detail modal for the current customer
 */
function showCustomerWalletHistory() {
    const phoneField = document.getElementById('saleReceiverPhone');
    if (!phoneField || !phoneField.value) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có số điện thoại khách hàng');
        }
        return;
    }

    const phone = normalizePhoneForQR(phoneField.value);
    if (!phone) {
        if (window.notificationManager) {
            window.notificationManager.warning('Số điện thoại không hợp lệ');
        }
        return;
    }

    // Use WalletIntegration to show wallet modal
    if (typeof WalletIntegration !== 'undefined' && WalletIntegration.showWalletModal) {
        WalletIntegration.showWalletModal(phone);
    } else {
        if (window.notificationManager) {
            window.notificationManager.error('Chức năng xem ví chưa sẵn sàng');
        }
    }
}

// Export functions to window
window.showCustomerWalletHistory = showCustomerWalletHistory;
window.generateAutoNotesFromTransactions = generateAutoNotesFromTransactions;

/**
 * Populate order items (products) into the modal
 */
function populateSaleOrderItems(order) {
    const container = document.getElementById('saleOrderItems');

    if (!order.Details || order.Details.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
        return;
    }

    let totalQuantity = 0;
    let totalAmount = 0;

    const itemsHTML = order.Details.map((item, index) => {
        const qty = item.Quantity || item.ProductUOMQty || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;

        totalQuantity += qty;
        totalAmount += total;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="sale-product-name">${item.ProductNameGet || item.ProductName || ''}</div>
                    <div style="font-size: 11px; color: #6b7280;">${item.Note || 'Ghi chú'}</div>
                </td>
                <td>
                    <input type="number" class="sale-input" value="${qty}" min="1"
                        onchange="updateSaleItemQuantity(${index}, this.value)"
                        style="width: 60px; text-align: center;">
                </td>
                <td style="text-align: right;">${formatNumber(price)}</td>
                <td style="text-align: right;">${formatNumber(total)}</td>
                <td style="text-align: center;">
                    <button onclick="removeSaleItem(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = itemsHTML;
    updateSaleTotals(totalQuantity, totalAmount);
}

/**
 * Parse discount from product note (e.g., "100k" = 100000)
 * Helper for populateSaleOrderLinesFromAPI highlighting
 */
function parseDiscountFromNoteForDisplay(note) {
    if (!note || typeof note !== 'string') return 0;
    const cleanNote = note.trim().toLowerCase();
    if (!cleanNote) return 0;

    // Pattern 1: "100k" or "100K" -> 100000
    const kMatch = cleanNote.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);
    if (kMatch) {
        const num = parseFloat(kMatch[1].replace(',', '.'));
        return Math.round(num * 1000);
    }

    // Pattern 2: Plain number "100000" or "100.000" or "100"
    const plainMatch = cleanNote.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)$/);
    if (plainMatch) {
        const numStr = plainMatch[1].replace(/[.,]/g, '');
        const num = parseInt(numStr, 10);
        if (num >= 1000) return num;
        // Small numbers treated as shorthand "k" (e.g., "100" = 100k = 100000)
        if (num > 0) return num * 1000;
    }
    return 0;
}

/**
 * Check if current sale order has "GIẢM GIÁ" tag
 */
function currentSaleOrderHasDiscountTag() {
    if (!currentSaleOrderData?.Tags) return false;
    try {
        const tags = typeof currentSaleOrderData.Tags === 'string'
            ? JSON.parse(currentSaleOrderData.Tags)
            : currentSaleOrderData.Tags;
        if (Array.isArray(tags)) {
            return tags.some(tag => {
                const tagName = (tag.Name || '').toUpperCase();
                return tagName.includes('GIẢM GIÁ') || tagName.includes('GIAM GIA');
            });
        }
    } catch (e) {}
    return false;
}

/**
 * Populate order lines from API response (orderLines with Product, ProductUOM)
 */
function populateSaleOrderLinesFromAPI(orderLines) {
    const container = document.getElementById('saleOrderItems');

    if (!orderLines || orderLines.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
        return;
    }

    // Store order lines for editing
    currentSaleOrderData.orderLines = orderLines;

    // Check if order has discount tag
    const hasDiscountTag = currentSaleOrderHasDiscountTag();

    let totalQuantity = 0;
    let totalAmount = 0;
    let totalDiscount = 0;

    const itemsHTML = orderLines.map((item, index) => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;

        // Get product info from nested Product object or direct field
        const productName = item.Product?.NameGet || item.ProductName || '';
        const productNote = item.Note || '';
        const productUOM = item.ProductUOMName || item.ProductUOM?.Name || 'Cái';

        // Check for discount in note (only if order has discount tag)
        // notePrice = giá bán thực tế (e.g., "100k" = 100000)
        // discount = (PriceUnit - notePrice) * Quantity (e.g., (180000 - 100000) * 2 = 160000)
        const notePrice = hasDiscountTag ? parseDiscountFromNoteForDisplay(productNote) : 0;
        const discountPerUnit = notePrice > 0 ? Math.max(0, price - notePrice) : 0;
        const productDiscount = discountPerUnit * qty;
        const isDiscountedProduct = productDiscount > 0;
        if (isDiscountedProduct) totalDiscount += productDiscount;

        // Highlight style for discounted products
        const rowStyle = isDiscountedProduct ? 'background-color: #fef3c7;' : '';
        const noteStyle = isDiscountedProduct
            ? 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 600;'
            : 'font-size: 11px; color: #6b7280;';

        // Get product image (prefer thumbnail 128x128, fallback to ImageUrl)
        const productImage = item.Product?.Thumbnails?.[1] || item.Product?.ImageUrl || '';
        const imageHTML = productImage
            ? `<img src="${productImage}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;">`
            : `<div style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #9ca3af;"></i></div>`;

        totalQuantity += qty;
        totalAmount += total;

        // Note display with discount badge
        const noteDisplay = productNote
            ? (isDiscountedProduct
                ? `<span style="${noteStyle}"><i class="fas fa-tag"></i> -${discountPerUnit.toLocaleString('vi-VN')}đ (${productNote})</span>`
                : `<div style="${noteStyle}">${productNote}</div>`)
            : '<div style="font-size: 11px; color: #9ca3af;">Ghi chú</div>';

        return `
            <tr style="${rowStyle}">
                <td>${index + 1}</td>
                <td>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        ${imageHTML}
                        <div>
                            <div class="sale-product-name">${productName}</div>
                            ${noteDisplay}
                        </div>
                    </div>
                </td>
                <td>
                    <input type="number" class="sale-input" value="${qty}" min="1"
                        onchange="updateSaleItemQuantityFromAPI(${index}, this.value)"
                        style="width: 60px; text-align: center;">
                </td>
                <td style="text-align: right;">${formatNumber(price)}</td>
                <td style="text-align: right;">${formatNumber(total)}</td>
                <td style="text-align: center;">
                    <button onclick="removeSaleItemFromAPI(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = itemsHTML;

    // Auto-fill saleDiscount field if order has discount tag
    if (hasDiscountTag && totalDiscount > 0) {
        console.log(`[SALE-MODAL] Order has discount tag. Total discount: ${totalDiscount.toLocaleString('vi-VN')}đ`);
        const discountInput = document.getElementById('saleDiscount');
        if (discountInput) {
            discountInput.value = totalDiscount;
        }
        // Update discount display if exists
        const discountEl = document.getElementById('saleDiscountFromTag');
        if (discountEl) {
            discountEl.textContent = `-${totalDiscount.toLocaleString('vi-VN')}`;
            discountEl.parentElement.style.display = 'flex';
        }
    }

    updateSaleTotals(totalQuantity, totalAmount);
}

/**
 * Update item quantity from API order lines
 */
async function updateSaleItemQuantityFromAPI(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    const oldQty = currentSaleOrderData.orderLines[index].ProductUOMQty || currentSaleOrderData.orderLines[index].Quantity || 1;
    const newQty = parseInt(value) || 1;

    // Update local data
    currentSaleOrderData.orderLines[index].ProductUOMQty = newQty;
    currentSaleOrderData.orderLines[index].Quantity = newQty;

    // Recalculate totals
    let totalQuantity = 0;
    let totalAmount = 0;

    currentSaleOrderData.orderLines.forEach(item => {
        const itemQty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += itemQty;
        totalAmount += itemQty * price;
    });

    updateSaleTotals(totalQuantity, totalAmount);

    // 🔥 UPDATE ORDER VIA API
    try {
        console.log(`[SALE-UPDATE-QTY] Updating quantity ${oldQty} → ${newQty}, calling API...`);
        await updateSaleOrderWithAPI();
        console.log('[SALE-UPDATE-QTY] ✅ Order updated successfully via API');
    } catch (apiError) {
        console.error('[SALE-UPDATE-QTY] ⚠️ API update failed:', apiError);
        // Rollback on error
        currentSaleOrderData.orderLines[index].ProductUOMQty = oldQty;
        currentSaleOrderData.orderLines[index].Quantity = oldQty;
        populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);

        if (window.notificationManager) {
            window.notificationManager.error('Không thể cập nhật số lượng. Vui lòng thử lại.');
        }
    }
}

/**
 * Remove item from API order lines
 */
async function removeSaleItemFromAPI(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    // Get product info for confirmation
    const productName = currentSaleOrderData.orderLines[index].Product?.NameGet ||
        currentSaleOrderData.orderLines[index].ProductName ||
        'sản phẩm này';

    // Confirm before removing
    const confirmed = await window.notificationManager.confirm(
        `Bạn có chắc muốn xóa ${productName}?`,
        'Xóa sản phẩm'
    );

    if (!confirmed) return;

    // Backup for rollback
    const removedItem = currentSaleOrderData.orderLines[index];
    const removedIndex = index;

    // Remove from local data
    currentSaleOrderData.orderLines.splice(index, 1);
    populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);

    // 🔥 UPDATE ORDER VIA API
    try {
        console.log(`[SALE-REMOVE-PRODUCT] Removing product at index ${index}, calling API...`);
        await updateSaleOrderWithAPI();
        console.log('[SALE-REMOVE-PRODUCT] ✅ Order updated successfully via API');

        if (window.notificationManager) {
            window.notificationManager.success(`Đã xóa ${productName}`);
        }
    } catch (apiError) {
        console.error('[SALE-REMOVE-PRODUCT] ⚠️ API update failed:', apiError);
        // Rollback on error
        currentSaleOrderData.orderLines.splice(removedIndex, 0, removedItem);
        populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);

        if (window.notificationManager) {
            window.notificationManager.error('Không thể xóa sản phẩm. Vui lòng thử lại.');
        }
    }
}

/**
 * Update totals in the modal
 */
function updateSaleTotals(quantity, amount) {
    document.getElementById('saleTotalQuantity').textContent = quantity;
    document.getElementById('saleTotalAmount').textContent = formatNumber(amount);

    const discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    const finalTotal = amount - discount;
    document.getElementById('saleFinalTotal').textContent = formatNumber(finalTotal);

    // Update COD = Tổng tiền hàng + Phí ship
    // 🔥 FIX: Use proper check to allow 0 value (0 is valid, empty is not)
    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue)
        : 0;
    document.getElementById('saleCOD').value = finalTotal + shippingFee;

    // Update Giá trị hàng hóa
    document.getElementById('saleGoodsValue').value = finalTotal;

    // Update remaining balance after COD changes
    updateSaleRemainingBalance();
}

/**
 * Update item quantity
 */
function updateSaleItemQuantity(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.Details) return;

    const qty = parseInt(value) || 1;
    currentSaleOrderData.Details[index].Quantity = qty;

    // Recalculate totals
    let totalQuantity = 0;
    let totalAmount = 0;

    currentSaleOrderData.Details.forEach(item => {
        const itemQty = item.Quantity || item.ProductUOMQty || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += itemQty;
        totalAmount += itemQty * price;
    });

    updateSaleTotals(totalQuantity, totalAmount);
}

/**
 * Remove item from order
 */
function removeSaleItem(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.Details) return;

    currentSaleOrderData.Details.splice(index, 1);
    populateSaleOrderItems(currentSaleOrderData);
}

/**
 * Format date for datetime-local input
 * NOTE: Đã có sẵn trong tab1-search.js, dùng chung function đó
 */
// function formatDateTimeLocal(date) { ... } // REMOVED - duplicate

/**
 * Format date for display
 */
function formatDateTimeDisplay(date) {
    return date.toLocaleString('vi-VN');
}

/**
 * Format number with thousand separator
 */
function formatNumber(num) {
    return (num || 0).toLocaleString('vi-VN');
}

// Close modal when clicking outside
document.addEventListener('click', function (e) {
    const modal = document.getElementById('saleButtonModal');
    if (e.target === modal) {
        closeSaleButtonModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('saleButtonModal');
        if (modal && modal.style.display === 'flex') {
            closeSaleButtonModal();
        }
    }
});

// Disconnect when page unloads and cleanup held products
window.addEventListener('beforeunload', () => {
    disconnectDebtRealtime();

    // Cleanup held products for current user
    if (typeof window.cleanupHeldProductsSync === 'function') {
        window.cleanupHeldProductsSync();
    }

    // Cleanup held products listener
    if (typeof window.cleanupHeldProductsListener === 'function') {
        window.cleanupHeldProductsListener();
    }
});

// Export realtime functions
window.connectDebtRealtime = connectDebtRealtime;
window.disconnectDebtRealtime = disconnectDebtRealtime;

