// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
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
            }
        }

        // Migrate from localStorage if exists
        const localCache = localStorage.getItem(DEBT_CACHE_KEY);
        if (localCache) {
            const parsed = JSON.parse(localCache);
            Object.assign(debtCacheMemory, parsed);
            localStorage.removeItem(DEBT_CACHE_KEY);
            await saveDebtCacheAsync();
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
        return;
    }

    try {
        // Call wallet batch API - ONE request for ALL phones!
        const requestBody = JSON.stringify({ phones: uncachedPhones });
        const response = await fetch(`${QR_API_URL}/api/v2/wallets/batch-summary`, {
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

// =====================================================
// WALLET DEBT BADGES - Hiển thị công nợ ví khách hàng
// Badge theo nguồn: CK, Thu về, Khách gửi, Nạp Tay
// =====================================================

// Map: phone → { total, balance, virtualBalance, sourceBreakdown }
window.walletDebtData = new Map();

// Use direct Render API URL (same as WalletIntegration) - proxy may not handle POST correctly
const WALLET_BATCH_API_URL = 'https://n2store-fallback.onrender.com/api';

const WALLET_DEBT_BADGE_CONFIG = {
    BANK_TRANSFER:        { label: 'CK',        bg: '#10b981' },
    RETURN_GOODS:         { label: 'Khách gửi',  bg: '#8b5cf6' },
    VIRTUAL_CREDIT_ISSUE: { label: 'Thu về',     bg: '#f59e0b' },
    MANUAL_ADJUSTMENT:    { label: 'Nạp Tay',   bg: '#3b82f6' },
    ORDER_CANCEL_REFUND:  { label: 'Hoàn đơn',  bg: '#ef4444' },
};

function formatAmountShort(amount) {
    if (!amount || amount <= 0) return '0';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1).replace('.0', '') + 'tr';
    if (amount >= 1000) return Math.round(amount / 1000) + 'k';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Fetch wallet debt data for all phones in current view via batch API
 * Automatically chunks into batches of 150 to respect API limits
 */
async function fetchWalletDebtBatch(phones) {
    if (!phones || !Array.isArray(phones) || phones.length === 0) return;

    const uniquePhones = [...new Set(phones.map(p => normalizePhoneForQR(p)).filter(Boolean))];
    if (uniquePhones.length === 0) return;

    const CHUNK_SIZE = 150;
    const totalChunks = Math.ceil(uniquePhones.length / CHUNK_SIZE);
    for (let i = 0; i < uniquePhones.length; i += CHUNK_SIZE) {
        const chunk = uniquePhones.slice(i, i + CHUNK_SIZE);
        try {
            const response = await fetch(`${WALLET_BATCH_API_URL}/v2/wallets/batch-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: chunk })
            });

            if (!response.ok) {
                console.error(`[WALLET-DEBT] ❌ HTTP ${response.status} for chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
                continue;
            }

            const result = await response.json();
            if (result.success && result.data) {
                for (const [phone, data] of Object.entries(result.data)) {
                    if ((data.total || 0) > 0) {
                        window.walletDebtData.set(phone, data);
                    } else {
                        window.walletDebtData.delete(phone);
                    }
                }
            }
        } catch (error) {
            console.error(`[WALLET-DEBT] Error fetching chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, error);
        }
    }
}

/**
 * Check if phone has wallet debt (total > 0)
 */
function hasWalletDebt(phone) {
    if (!phone) return false;
    const normalized = normalizePhoneForQR(phone);
    return normalized && window.walletDebtData.has(normalized);
}

/**
 * Render wallet debt badges for a phone number
 * Returns HTML string with one badge per active source
 */
function renderWalletDebtBadges(phone) {
    if (!phone) return '';
    const normalized = normalizePhoneForQR(phone);
    if (!normalized || !window.walletDebtData.has(normalized)) return '';

    const data = window.walletDebtData.get(normalized);
    const sources = data.sourceBreakdown || {};
    const total = data.total || 0;
    if (total <= 0) return '';

    // Build badges for each source that has positive amount
    // Determine effective source amounts based on current balance/virtualBalance
    const badges = [];
    for (const [source, config] of Object.entries(WALLET_DEBT_BADGE_CONFIG)) {
        const sourceAmount = sources[source] || 0;
        if (sourceAmount <= 0) continue;

        const shortAmt = formatAmountShort(sourceAmount);
        badges.push(`<span class="wallet-debt-badge" data-source="${source}" onclick="window.openWalletDebtModal('${normalized}'); event.stopPropagation();" style="display:inline-block;background:#10b981;color:white;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600;vertical-align:middle;margin-left:3px;cursor:pointer;white-space:nowrap;" title="${config.label}: ${new Intl.NumberFormat('vi-VN').format(sourceAmount)}đ">${config.label} ${shortAmt}</span>`);
    }

    // If no source breakdown available but total > 0, show generic badge
    if (badges.length === 0 && total > 0) {
        const shortAmt = formatAmountShort(total);
        badges.push(`<span class="wallet-debt-badge" onclick="window.openWalletDebtModal('${normalized}'); event.stopPropagation();" style="display:inline-block;background:#10b981;color:white;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600;vertical-align:middle;margin-left:3px;cursor:pointer;white-space:nowrap;" title="Số dư ví: ${new Intl.NumberFormat('vi-VN').format(total)}đ">Ví ${shortAmt}</span>`);
    }

    return ' ' + badges.join(' ');
}

/**
 * Update wallet debt badges in table for a specific phone (or all phones)
 */
function updateWalletDebtBadgesInTable(targetPhone) {
    const normalized = targetPhone ? normalizePhoneForQR(targetPhone) : null;
    document.querySelectorAll('td[data-column="customer"]').forEach(cell => {
        const row = cell.closest('tr');
        if (!row) return;
        const phoneCell = row.querySelector('td[data-column="phone"]');
        if (!phoneCell) return;
        const rowPhone = normalizePhoneForQR(phoneCell.textContent.trim());
        if (normalized && rowPhone !== normalized) return;

        // Remove existing badges
        cell.querySelectorAll('.wallet-debt-badge').forEach(b => b.remove());

        const nameDiv = cell.querySelector('.customer-name');
        if (!nameDiv) return;

        if (rowPhone && window.walletDebtData.has(rowPhone)) {
            const data = window.walletDebtData.get(rowPhone);
            if ((data.total || 0) <= 0) {
                cell.style.background = '';
                return;
            }

            // Insert badges
            const temp = document.createElement('span');
            temp.innerHTML = renderWalletDebtBadges(rowPhone);
            while (temp.firstChild) {
                nameDiv.appendChild(temp.firstChild);
            }

            // Watermark background
            cell.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.03) 100%)';

            // Auto-gắn tag CK / Trừ Công Nợ khi badge hiển thị
            const orderId = row.getAttribute('data-order-id');
            const orderCode = row.getAttribute('data-order-code') || (orderId && window._ptagResolveCode ? window._ptagResolveCode(orderId) : null);

            // Debug: trace auto-tag logic
            console.log(`[WALLET-AUTOTAG] Row phone=${rowPhone}, orderId=${orderId}, orderCode=${orderCode}, balance=${data.balance}, virtualBalance=${data.virtualBalance || data.virtual_balance}, _isLoaded=${window.ProcessingTagState?._isLoaded}, toggleOrderFlag=${typeof window.toggleOrderFlag}`);

            if (orderCode && typeof window.toggleOrderFlag === 'function' && window.ProcessingTagState && window.ProcessingTagState._isLoaded) {
                const existingFlags = window.ProcessingTagState.getOrderFlags(orderCode);
                const existingFlagIds = existingFlags.map(f => typeof f === 'object' ? f.id : f);
                console.log(`[WALLET-AUTOTAG] orderCode=${orderCode}, existingFlagIds=${JSON.stringify(existingFlagIds)}, needCK=${(data.balance || 0) > 0 && !existingFlagIds.includes('CHUYEN_KHOAN')}, needTCN=${((data.virtualBalance || data.virtual_balance || 0) > 0) && !existingFlagIds.includes('TRU_CONG_NO')}`);
                if ((data.balance || 0) > 0 && !existingFlagIds.includes('CHUYEN_KHOAN')) {
                    console.log(`[WALLET-AUTOTAG] ✅ Adding CHUYEN_KHOAN to ${orderCode}`);
                    window.toggleOrderFlag(orderCode, 'CHUYEN_KHOAN', 'Tự Động');
                }
                if (((data.virtualBalance || data.virtual_balance) || 0) > 0 && !existingFlagIds.includes('TRU_CONG_NO')) {
                    console.log(`[WALLET-AUTOTAG] ✅ Adding TRU_CONG_NO to ${orderCode}`);
                    window.toggleOrderFlag(orderCode, 'TRU_CONG_NO', 'Tự Động');
                }
            } else {
                console.warn(`[WALLET-AUTOTAG] ⚠️ Guard failed: orderCode=${orderCode}, toggleOrderFlag=${typeof window.toggleOrderFlag}, ProcessingTagState=${!!window.ProcessingTagState}, _isLoaded=${window.ProcessingTagState?._isLoaded}`);
            }
        } else {
            cell.style.background = '';
        }
    });
}

/**
 * Trigger wallet debt fetch for phones currently visible in the table.
 * Called from renderTable(), loadMoreRows(), performTableSearch().
 * Debounced to avoid multiple rapid calls.
 */
let _walletDebtFetchTimer = null;
function triggerWalletDebtFetch() {
    clearTimeout(_walletDebtFetchTimer);
    _walletDebtFetchTimer = setTimeout(() => {
        const phones = [];
        document.querySelectorAll('td[data-column="phone"]').forEach(cell => {
            const p = cell.textContent.trim();
            if (p) phones.push(p);
        });
        const unique = [...new Set(phones)];
        if (unique.length > 0) {
            fetchWalletDebtBatch(unique).then(() => {
                updateWalletDebtBadgesInTable();
            }).catch(err => console.error('[WALLET-DEBT] Fetch error:', err));
        }
    }, 300);
}

// =====================================================
// WALLET SSE REALTIME + TOAST NOTIFICATIONS
// Listen for wallet balance changes via SSE
// =====================================================

let walletEventSource = null;
let walletReconnectTimeout = null;
let isWalletManualClose = false;
const RENDER_SSE_URL = 'https://n2store-fallback.onrender.com';

/**
 * Check if current user is in employee mode (not admin)
 */
function isEmployeeMode() {
    const isAdmin = window.authManager?.isAdminTemplate?.() || false;
    return !isAdmin && (window.employeeRanges?.length > 0);
}

/**
 * Get the set of phone numbers visible in current employee's orders
 */
function getEmployeePhones() {
    const phones = new Set();
    document.querySelectorAll('td[data-column="phone"]').forEach(cell => {
        const phone = normalizePhoneForQR(cell.textContent.trim());
        if (phone) phones.add(phone);
    });
    return phones;
}

/**
 * Get customer name from table by phone
 */
function getCustomerNameByPhone(phone) {
    const normalized = normalizePhoneForQR(phone);
    const rows = document.querySelectorAll('tr[data-order-id]');
    for (const row of rows) {
        const phoneCell = row.querySelector('td[data-column="phone"]');
        if (!phoneCell) continue;
        const rowPhone = normalizePhoneForQR(phoneCell.textContent.trim());
        if (rowPhone === normalized) {
            const nameDiv = row.querySelector('.customer-name');
            if (nameDiv) {
                // Get text content without badge text
                const clone = nameDiv.cloneNode(true);
                clone.querySelectorAll('.wallet-debt-badge').forEach(b => b.remove());
                return clone.textContent.trim();
            }
        }
    }
    return phone;
}

/**
 * Connect to SSE for wallet updates (subscribe to "wallet" prefix for all events)
 */
function connectWalletSSE() {
    if (walletEventSource) return;

    try {
        const sseUrl = `${RENDER_SSE_URL}/api/realtime/sse?keys=${encodeURIComponent('wallet')}`;
        walletEventSource = new EventSource(sseUrl);

        walletEventSource.addEventListener('wallet_update', (e) => {
            try {
                const parsed = JSON.parse(e.data);
                const eventData = parsed.data || parsed;
                const phone = eventData.phone;
                const wallet = eventData.wallet;
                const transaction = eventData.transaction;

                if (!phone || !wallet) return;

                const normalized = normalizePhoneForQR(phone);
                if (!normalized) return;

                const newTotal = (parseFloat(wallet.balance) || 0) + (parseFloat(wallet.virtual_balance) || 0);
                const oldData = window.walletDebtData.get(normalized);
                const oldTotal = oldData ? (oldData.total || 0) : 0;

                // Update local wallet data
                if (newTotal > 0) {
                    // Merge source breakdown - add the new transaction source amount
                    const existingSources = oldData?.sourceBreakdown || {};
                    if (transaction?.source && transaction?.amount > 0) {
                        existingSources[transaction.source] = (existingSources[transaction.source] || 0) + parseFloat(transaction.amount);
                    }
                    window.walletDebtData.set(normalized, {
                        balance: parseFloat(wallet.balance) || 0,
                        virtualBalance: parseFloat(wallet.virtual_balance) || 0,
                        total: newTotal,
                        sourceBreakdown: existingSources
                    });
                } else {
                    window.walletDebtData.delete(normalized);
                }

                // Update badges in table
                updateWalletDebtBadgesInTable(phone);

                // Also update debt badges in chat modal if open for this phone
                updateChatDebtBadges(normalized);

                // Also update debt column
                updateDebtCellsInTable(phone, newTotal);

                // Toast notification: only when balance INCREASED + employee mode + phone in employee's orders
                if (newTotal > oldTotal && isEmployeeMode()) {
                    const employeePhones = getEmployeePhones();
                    if (employeePhones.has(normalized)) {
                        const increase = newTotal - oldTotal;
                        const customerName = getCustomerNameByPhone(phone);
                        showNotification(`Ví khách ${customerName} vừa tăng ${new Intl.NumberFormat('vi-VN').format(increase)}đ`, 'success');
                    }
                }
            } catch (err) {
                console.error('[WALLET-SSE] Error handling event:', err);
            }
        });

        walletEventSource.addEventListener('connected', () => {
        });

        walletEventSource.onerror = () => {
            console.warn('[WALLET-SSE] Connection error');
            if (walletEventSource) {
                walletEventSource.close();
                walletEventSource = null;
            }
            if (!isWalletManualClose) {
                clearTimeout(walletReconnectTimeout);
                walletReconnectTimeout = setTimeout(connectWalletSSE, 15000);
            }
        };

    } catch (error) {
        console.error('[WALLET-SSE] Failed to connect:', error);
    }
}

function disconnectWalletSSE() {
    isWalletManualClose = true;
    clearTimeout(walletReconnectTimeout);
    if (walletEventSource) {
        walletEventSource.close();
        walletEventSource = null;
    }
}

/**
 * Update debt badges in chat modal header if it's open for this phone
 */
function updateChatDebtBadges(normalizedPhone) {
    const container = document.getElementById('chatDebtBadgesContainer');
    if (!container) return;
    const chatPhone = window.currentChatPhone;
    if (!chatPhone) return;
    const normalizedChatPhone = normalizePhoneForQR(chatPhone);
    if (normalizedChatPhone !== normalizedPhone) return;
    container.innerHTML = renderWalletDebtBadges(chatPhone);
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
window.hasWalletDebt = hasWalletDebt;
window.renderWalletDebtBadges = renderWalletDebtBadges;
window.updateWalletDebtBadgesInTable = updateWalletDebtBadgesInTable;
window.updateChatDebtBadges = updateChatDebtBadges;
window.fetchWalletDebtBatch = fetchWalletDebtBatch;
window.triggerWalletDebtFetch = triggerWalletDebtFetch;
window.connectWalletSSE = connectWalletSSE;
window.disconnectWalletSSE = disconnectWalletSSE;

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
        debtEventSource = new EventSource(`${QR_API_URL}/api/sepay/stream`);

        // Connection established
        debtEventSource.addEventListener('connected', (e) => {
        });

        // New transaction received
        debtEventSource.addEventListener('new-transaction', (e) => {
            try {
                const transaction = JSON.parse(e.data);
                handleDebtTransaction(transaction);
            } catch (err) {
                console.error('[DEBT-REALTIME] Error parsing transaction:', err);
            }
        });

        // Customer matched to transaction - refresh wallet debt badges
        debtEventSource.addEventListener('customer-info-updated', (e) => {
            try {
                const data = JSON.parse(e.data);
                const phone = data.customer_phone;
                if (phone) {
                    fetchWalletDebtBatch([phone]).then(() => {
                        updateWalletDebtBadgesInTable(phone);
                        updateChatDebtBadges(normalizePhoneForQR(phone));
                    });
                }
            } catch (err) {
                console.error('[WALLET-DEBT] Error handling customer-info-updated:', err);
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
    }
}

// Auto-connect realtime when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Delay connection to let page load first
    setTimeout(() => {
        connectDebtRealtime();
        connectWalletSSE();
    }, 3000);
});

// =====================================================
// SALE BUTTON MODAL FUNCTIONS
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;
let currentSaleLastDeposit = null; // { amount, date } from wallet API
let currentSaleAvailableDeposits = []; // [{ amount, date, source }] all deposits contributing to wallet balance
let currentSaleVirtualCredits = []; // [{ remaining_amount, source_type, source_id, ticket_note }] active virtual credits

// =====================================================
// DELIVERY CARRIER, SALE MODAL UI, TOTALS, etc.
// → Moved to js/utils/sale-modal-common.js
// =====================================================

// (carrier cache, delivery dropdown, COD, smart delivery, district parsing,
//  carrier matching, formatCurrencyVND → all in sale-modal-common.js)


/**
 * Open Sale Button Modal and fetch order details from API
 */
async function openSaleButtonModal() {
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

    // Block if order has pending wallet adjustment
    if (window.WalletAdjustmentStore?.isPending(orderId)) {
        const adj = window.WalletAdjustmentStore.get(orderId);
        const stt = order.SessionIndex || '';
        const name = order.Name || adj.customerName || '';
        const phone = order.Telephone || adj.newPhone || '';
        const msg = `<div style="font-size:15px;line-height:1.6;"><b style="font-size:16px;">Đơn STT ${stt} - ${name} (${phone})</b><br>đang chờ điều chỉnh công nợ ví.<br><b>Liên hệ kế toán để điều chỉnh.</b></div>`;
        if (window.notificationManager) {
            window.notificationManager.error(msg, 10000, 'Chờ điều chỉnh công nợ');
        } else {
            alert(`Đơn STT ${stt} - ${name} (${phone}) đang chờ điều chỉnh công nợ ví. Liên hệ kế toán để điều chỉnh.`);
        }
        return;
    }

    currentSaleOrderData = order;
    // Reset form fields to avoid stale data from previous order
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) {
        prepaidEl.value = 0;
        prepaidEl.dataset.originalBalance = '';
        prepaidEl.dataset.manualEdit = '';
        prepaidEl.style.border = '';
        prepaidEl.style.color = '';
    }
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';
    const prepaidWarning = document.getElementById('prepaidExcessWarning');
    if (prepaidWarning) prepaidWarning.style.display = 'none';
    const editPrepaidBtn = document.getElementById('editPrepaidBtn');
    if (editPrepaidBtn) editPrepaidBtn.style.display = 'none';

    // Show modal with loading state
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Reset confirm button state (in case it was disabled from previous session)
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xác nhận và in (F9)';
    }

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

    // Check admin access via roleTemplate
    let isAdmin = window.authManager?.isAdminTemplate?.() || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
            const editPrepaidBtnAdmin = document.getElementById('editPrepaidBtn');
            if (editPrepaidBtnAdmin) editPrepaidBtnAdmin.style.display = 'none';
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            prepaidAmountField.style.border = '';
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
        await fetchDebtForSaleModal(phone);
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

    // Auto-fill notes from existing data (wallet, tags)
    autoFillSaleNote();
}

/**
 * Open Sale Modal from Social Order data (called via postMessage from Đơn Social tab)
 * Reuses all existing sale modal sub-functions: populateSaleModalWithOrder,
 * fetchDebtForSaleModal, populateDeliveryCarrierDropdown, etc.
 * @param {Object} socialOrder - Social order data mapped from tab-social
 */
async function openSaleModalFromSocialOrder(socialOrder) {
    // Block if order has pending wallet adjustment
    if (socialOrder.id && window.WalletAdjustmentStore?.isPending(socialOrder.id)) {
        const adj = window.WalletAdjustmentStore.get(socialOrder.id);
        const name = socialOrder.customerName || adj.customerName || '';
        const phone = socialOrder.phone || adj.newPhone || '';
        window.notificationManager?.error(
            `<div style="font-size:15px;line-height:1.6;"><b style="font-size:16px;">Đơn ${name} (${phone})</b><br>đang chờ điều chỉnh công nợ ví.<br><b>Liên hệ kế toán để điều chỉnh.</b></div>`,
            10000, 'Chờ điều chỉnh công nợ'
        );
        return;
    }

    // Map social order data to Tab1 order format
    const mappedOrder = {
        Id: socialOrder.id,
        PartnerName: socialOrder.customerName,
        Name: socialOrder.customerName,
        Telephone: socialOrder.phone,
        PartnerPhone: socialOrder.phone,
        PartnerAddress: socialOrder.address,
        Address: socialOrder.address,
        TotalAmount: socialOrder.totalAmount || 0,
        Comment: socialOrder.note || '',
        Details: (socialOrder.products || []).map(p => ({
            ProductNameGet: p.productName || '',
            ProductName: p.productName || '',
            Quantity: p.quantity || 1,
            PriceUnit: p.sellingPrice || 0,
            Price: p.sellingPrice || 0,
            Note: p.variant || ''
        })),
        Tags: socialOrder.tags ? JSON.stringify(socialOrder.tags) : '[]',
        _isSocialOrder: true
    };

    currentSaleOrderData = mappedOrder;

    // Reset form fields (same logic as openSaleButtonModal)
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) {
        prepaidEl.value = 0;
        prepaidEl.dataset.originalBalance = '';
        prepaidEl.dataset.manualEdit = '';
        prepaidEl.style.border = '';
        prepaidEl.style.color = '';
    }
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';
    const prepaidWarning = document.getElementById('prepaidExcessWarning');
    if (prepaidWarning) prepaidWarning.style.display = 'none';
    const editPrepaidBtn = document.getElementById('editPrepaidBtn');
    if (editPrepaidBtn) editPrepaidBtn.style.display = 'none';

    // Show modal
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Reset confirm button
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xác nhận và in (F9)';
    }

    // Restore bill type preference
    const savedBillType = localStorage.getItem('saleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('saleBillTypeWeb');
    const billTypeTpos = document.getElementById('saleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    // Admin check for Công nợ field
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmDebtBtn = document.getElementById('confirmDebtBtn');
    let isAdmin = window.authManager?.isAdminTemplate?.() || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
            const editPrepaidBtnAdmin = document.getElementById('editPrepaidBtn');
            if (editPrepaidBtnAdmin) editPrepaidBtnAdmin.style.display = 'none';
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            prepaidAmountField.style.border = '';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }
        prepaidAmountField.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Event listeners for COD, shipping fee, discount (same as openSaleButtonModal)
    const codInput = document.getElementById('saleCOD');
    if (codInput) {
        codInput.oninput = function () { updateSaleRemainingBalance(); };
    }
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const shippingFee = parseFloat(this.value) || 0;
            const codInput = document.getElementById('saleCOD');
            if (codInput) {
                codInput.value = finalTotal + shippingFee;
                updateSaleRemainingBalance();
            }
        };
    }
    const discountInput = document.getElementById('saleDiscount');
    if (discountInput) {
        discountInput.oninput = function () {
            const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Reuse existing sub-functions to populate the modal
    populateSaleModalWithOrder(mappedOrder);

    // Fetch wallet/debt if phone available
    if (mappedOrder.Telephone) {
        await fetchDebtForSaleModal(mappedOrder.Telephone);
    }

    // Populate delivery carrier dropdown
    await populateDeliveryCarrierDropdown();

    // Smart select delivery partner based on address
    if (mappedOrder.Address) {
        smartSelectDeliveryPartner(mappedOrder.Address, null);
    }

    // Init product search
    initSaleProductSearch();

    // Auto-fill notes
    autoFillSaleNote();
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
    currentSaleLastDeposit = null;

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
                // Update debt cells in the orders table immediately
                updateDebtCellsInTable(normalizedPhone, newDebt);
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
 * Fetch order details (partner, orderLines) from TPOS API
 */
async function fetchOrderDetailsForSale(orderUuid) {
    try {
        if (!window.tokenManager) {
            console.warn('[SALE-MODAL] No tokenManager found');
            return null;
        }

        const response = await window.tokenManager.authenticatedFetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetDetails?$expand=orderLines($expand=Product,ProductUOM),partner,warehouse', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({ ids: [orderUuid] })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('[SALE-MODAL] Error fetching order details:', error);
        if (window.notificationManager) {
            window.notificationManager.warning('Không thể tải thông tin đơn hàng');
        }
        return null;
    }
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

// Export sale modal functions
window.openSaleButtonModal = openSaleButtonModal;
window.closeSaleButtonModal = closeSaleButtonModal;

