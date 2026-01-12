/**
 * TAB1-UTILS.JS - Utility Functions Module
 * Handles encoding/decoding, address lookup, cross-tab communication
 * Depends on: tab1-core.js
 */

// =====================================================
// ENCODING/DECODING FUNCTIONS
// =====================================================
function encodeOrderForURL(orderId) {
    // Simple base64 encoding
    try {
        return btoa(orderId.toString());
    } catch (e) {
        console.error('[ENCODE] Error:', e);
        return orderId;
    }
}

function decodeOrderFromURL(encoded) {
    try {
        return atob(encoded);
    } catch (e) {
        console.error('[DECODE] Error:', e);
        return encoded;
    }
}

// =====================================================
// ADDRESS LOOKUP FUNCTIONS
// =====================================================
const ADDRESS_API_URL = 'https://api.tiki.vn/v2/address/suggest';

async function searchAddress(query) {
    if (!query || query.length < 3) return [];

    try {
        const response = await fetch(`${ADDRESS_API_URL}?q=${encodeURIComponent(query)}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];

    } catch (error) {
        console.error('[ADDRESS] Search error:', error);
        return [];
    }
}

async function handleAddressSearch(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const resultsContainer = document.getElementById(resultsId);

    if (!input || !resultsContainer) return;

    const query = input.value.trim();

    if (query.length < 3) {
        resultsContainer.style.display = 'none';
        return;
    }

    // Show loading
    resultsContainer.innerHTML = '<div class="address-loading"><i class="fas fa-spinner fa-spin"></i> Đang tìm...</div>';
    resultsContainer.style.display = 'block';

    const results = await searchAddress(query);

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="address-empty">Không tìm thấy địa chỉ</div>';
        return;
    }

    const html = results.slice(0, 10).map((addr, index) => {
        const fullAddress = addr.full_address || addr.address || '';
        return `
            <div class="address-result-item" onclick="selectAddressResult('${inputId}', '${resultsId}', ${index})">
                <i class="fas fa-map-marker-alt"></i>
                <span>${escapeHtml(fullAddress)}</span>
            </div>`;
    }).join('');

    resultsContainer.innerHTML = html;

    // Store results for selection
    resultsContainer.dataset.results = JSON.stringify(results);
}

function selectAddressResult(inputId, resultsId, index) {
    const input = document.getElementById(inputId);
    const resultsContainer = document.getElementById(resultsId);

    if (!input || !resultsContainer) return;

    try {
        const results = JSON.parse(resultsContainer.dataset.results || '[]');
        const selected = results[index];

        if (selected) {
            const fullAddress = selected.full_address || selected.address || '';
            input.value = fullAddress;
        }

    } catch (e) {
        console.error('[ADDRESS] Selection error:', e);
    }

    resultsContainer.style.display = 'none';
}

// =====================================================
// CROSS-TAB COMMUNICATION
// =====================================================
function setupCrossTabCommunication() {
    window.addEventListener('message', handleCrossTabMessage);
}

function handleCrossTabMessage(event) {
    const { type, data } = event.data || {};

    switch (type) {
        case 'REQUEST_ORDERS_DATA':
            sendOrdersDataToTab3();
            break;

        case 'REQUEST_ORDERS_DATA_FROM_OVERVIEW':
            sendOrdersDataToOverview();
            break;

        case 'REQUEST_EMPLOYEE_RANGES':
            sendEmployeeRangesToOverview();
            break;

        case 'REQUEST_CAMPAIGN_INFO':
            sendCampaignInfoToOverview();
            break;

        case 'FETCH_CONVERSATIONS_FOR_ORDERS':
            handleFetchConversationsRequest(data?.orders || []);
            break;

        default:
            // Unknown message type, ignore
            break;
    }
}

function sendOrdersDataToTab3() {
    const state = window.tab1State;
    const allData = state.allData;

    if (!allData || allData.length === 0) {
        console.log('[CROSS-TAB] No data to send to Tab3');
        return;
    }

    const ordersData = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(),
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags,
        LiveCampaignName: order.LiveCampaignName,
        products: (order.Details || []).map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        }))
    }));

    // Save to localStorage for persistence
    localStorage.setItem('ordersData', JSON.stringify(ordersData));

    // Send to parent
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_TAB3',
            orders: ordersData
        }, '*');
        console.log(`[CROSS-TAB] Sent ${ordersData.length} orders to Tab3`);
    }
}

function sendOrdersDataToOverview() {
    const state = window.tab1State;
    const allData = state.allData;

    if (!allData || allData.length === 0) {
        console.log('[CROSS-TAB] No data to send to Overview');
        return;
    }

    const ordersData = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(),
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags,
        liveCampaignName: order.LiveCampaignName,
        products: (order.Details || []).map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        }))
    }));

    // Get campaign name
    let campaignName = null;
    if (window.campaignManager?.activeCampaign?.name) {
        campaignName = window.campaignManager.activeCampaign.name;
    } else {
        const labelEl = document.getElementById('activeCampaignLabel');
        if (labelEl && labelEl.textContent !== 'Đang tải...') {
            campaignName = labelEl.textContent.trim();
        }
    }

    // Send to parent
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_OVERVIEW',
            orders: ordersData,
            tableName: campaignName,
            timestamp: Date.now()
        }, '*');
        console.log(`[CROSS-TAB] Sent ${ordersData.length} orders to Overview with campaign: ${campaignName}`);
    }
}

function sendEmployeeRangesToOverview() {
    const employeeRanges = window.employeeRanges || [];

    if (window.parent) {
        window.parent.postMessage({
            type: 'EMPLOYEE_RANGES_RESPONSE',
            ranges: employeeRanges
        }, '*');
        console.log(`[CROSS-TAB] Sent ${employeeRanges.length} employee ranges to Overview`);
    }
}

function sendCampaignInfoToOverview() {
    if (window.parent) {
        window.parent.postMessage({
            type: 'CAMPAIGN_INFO_RESPONSE',
            campaignInfo: {
                allCampaigns: window.campaignManager?.allCampaigns || {},
                activeCampaign: window.campaignManager?.activeCampaign || null,
                activeCampaignId: window.campaignManager?.activeCampaignId || null
            }
        }, '*');
        console.log('[CROSS-TAB] Sent campaign info to Overview');
    }
}

// Anti-spam cache for conversations
const fetchedChannelIdsCache = new Set();
let fetchConversationsDebounceTimer = null;
let isFetchingConversationsFromOverview = false;

function handleFetchConversationsRequest(orders) {
    if (orders.length === 0 || !window.chatDataManager) {
        return;
    }

    if (isFetchingConversationsFromOverview) {
        return;
    }

    // Parse channel IDs
    const allChannelIds = [...new Set(
        orders
            .map(order => {
                const postId = order.Facebook_PostId;
                if (!postId) return null;
                const parts = postId.split('_');
                return parts.length > 0 ? parts[0] : null;
            })
            .filter(Boolean)
    )];

    // Filter out already fetched
    const newChannelIds = allChannelIds.filter(id => !fetchedChannelIdsCache.has(id));

    if (newChannelIds.length === 0) {
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
        return;
    }

    // Debounce
    if (fetchConversationsDebounceTimer) {
        clearTimeout(fetchConversationsDebounceTimer);
    }

    fetchConversationsDebounceTimer = setTimeout(async () => {
        isFetchingConversationsFromOverview = true;

        try {
            await window.chatDataManager.fetchConversations(true, newChannelIds);

            newChannelIds.forEach(id => fetchedChannelIdsCache.add(id));

            if (typeof performTableSearch === 'function') {
                performTableSearch();
            }
        } catch (err) {
            console.error('[CROSS-TAB] Error fetching conversations:', err);
        } finally {
            isFetchingConversationsFromOverview = false;
        }
    }, 500);
}

// =====================================================
// CLIPBOARD FUNCTIONS
// =====================================================
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (err) {
            document.body.removeChild(textarea);
            return false;
        }
    }
}

// =====================================================
// DATE/TIME UTILITIES
// =====================================================
function formatDateVN(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTimeVN(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeAgo(date) {
    if (!date) return '';

    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay < 7) return `${diffDay} ngày trước`;

    return formatDateVN(date);
}

// =====================================================
// NUMBER/CURRENCY UTILITIES
// =====================================================
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0đ';
    return Math.round(amount).toLocaleString('vi-VN') + 'đ';
}

function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/[^\d.-]/g, '')) || 0;
}

// =====================================================
// STRING UTILITIES
// =====================================================
function truncateString(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

function slugify(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// =====================================================
// DOM UTILITIES
// =====================================================
function createElement(tag, attributes = {}, children = []) {
    const el = document.createElement(tag);

    Object.keys(attributes).forEach(key => {
        if (key === 'className') {
            el.className = attributes[key];
        } else if (key === 'style' && typeof attributes[key] === 'object') {
            Object.assign(el.style, attributes[key]);
        } else if (key.startsWith('on') && typeof attributes[key] === 'function') {
            el.addEventListener(key.substring(2).toLowerCase(), attributes[key]);
        } else {
            el.setAttribute(key, attributes[key]);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    });

    return el;
}

function removeAllChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// =====================================================
// INITIALIZATION
// =====================================================
function initUtilsModule() {
    // Setup cross-tab communication
    setupCrossTabCommunication();

    // Add global click handler to close dropdowns
    document.addEventListener('click', (e) => {
        // Close address results
        const addressResults = document.querySelectorAll('.address-results');
        addressResults.forEach(container => {
            if (!container.contains(e.target) && !e.target.closest('.address-input')) {
                container.style.display = 'none';
            }
        });
    });

    console.log('[TAB1-UTILS] Module initialized');
}

// Auto-init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUtilsModule);
} else {
    initUtilsModule();
}

// =====================================================
// EXPORTS
// =====================================================
window.encodeOrderForURL = encodeOrderForURL;
window.decodeOrderFromURL = decodeOrderFromURL;
window.searchAddress = searchAddress;
window.handleAddressSearch = handleAddressSearch;
window.selectAddressResult = selectAddressResult;
window.sendOrdersDataToTab3 = sendOrdersDataToTab3;
window.sendOrdersDataToOverview = sendOrdersDataToOverview;
window.copyToClipboard = copyToClipboard;
window.formatDateVN = formatDateVN;
window.formatDateTimeVN = formatDateTimeVN;
window.formatTimeAgo = formatTimeAgo;
window.formatCurrency = formatCurrency;
window.parseCurrency = parseCurrency;
window.truncateString = truncateString;
window.slugify = slugify;
window.createElement = createElement;
window.removeAllChildren = removeAllChildren;
window.escapeHtml = escapeHtml;
window.debounce = debounce;
window.throttle = throttle;

console.log('[TAB1-UTILS] Module loaded');
