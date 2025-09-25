// Money Transfer Management System - Enhanced with Loading States
// Added comprehensive loading states and interaction blocking for data operations

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com", 
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};

// Cache configuration - using in-memory storage
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 100; // Batch size for rendering
const INITIAL_LOAD_SIZE = 200; // Initial rows to show immediately
const LAZY_LOAD_SIZE = 100; // Rows to load per scroll/pagination
const MAX_VISIBLE_ROWS = 1000; // Maximum rows before pagination
const FILTER_DEBOUNCE_DELAY = 300; // Reduced delay for faster response
const RENDER_DEBOUNCE_DELAY = 50; // Debounce for rendering

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("ck");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const moneyTransferForm = document.getElementById('moneyTransferForm');
const tableBody = document.getElementById('tableBody');
const toggleFormButton = document.getElementById('toggleFormButton');
const dataForm = document.getElementById('dataForm');
const ngayck = document.getElementById('ngayck');
const transferAmountInput = document.getElementById('transferAmount');
const totalAmountElement = document.getElementById('totalAmount');
const editModal = document.getElementById('editModal');

// Global variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let filteredData = []; // Store filtered data for performance
let currentDisplayedRows = 0; // Track how many rows are currently displayed
let isLazyLoading = false; // Prevent concurrent lazy loads
let renderQueue = []; // Queue for batch rendering
let currentFilters = {
    startDate: null,
    endDate: null,
    status: 'all'
};
let filterTimeout = null;
let renderTimeout = null;
let isFilteringInProgress = false;

// Operation blocking variables
let isOperationInProgress = false;
let currentOperationType = null;

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = 'loginindex_auth';
let authState = null;

// =====================================================
// UTILITY FUNCTIONS - UNIQUE ID GENERATION
// =====================================================

function generateUniqueId() {
    // Generate a unique ID using timestamp + random string
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `tx_${timestamp}_${randomPart}`;
}

function ensureUniqueId(item) {
    // Ensure each item has a unique ID
    if (!item.uniqueId) {
        item.uniqueId = generateUniqueId();
    }
    return item;
}

// =====================================================
// OPERATION BLOCKING FUNCTIONS
// =====================================================

function blockInteraction(operationType) {
    isOperationInProgress = true;
    currentOperationType = operationType;
    
    // Disable form inputs but preserve their original disabled state
    if (moneyTransferForm) {
        const inputs = moneyTransferForm.querySelectorAll('input, select, button, textarea');
        inputs.forEach(input => {
            // Store original disabled state
            input.setAttribute('data-original-disabled', input.disabled);
            input.disabled = true;
        });
    }
    
    // Disable table interactions
    if (tableBody) {
        tableBody.style.pointerEvents = 'none';
        tableBody.style.opacity = '0.7';
    }
    
    // Disable modal buttons if open
    const modalButtons = document.querySelectorAll('#editModal button');
    modalButtons.forEach(btn => {
        btn.setAttribute('data-original-disabled', btn.disabled);
        btn.disabled = true;
    });
    
    // Disable export and other action buttons
    const actionButtons = document.querySelectorAll('.filter-btn, #toggleFormButton, #toggleLogoutButton');
    actionButtons.forEach(btn => {
        btn.setAttribute('data-original-disabled', btn.disabled);
        btn.disabled = true;
    });
    
    console.log(`Interactions blocked for operation: ${operationType}`);
}

function unblockInteraction() {
    isOperationInProgress = false;
    currentOperationType = null;
    
    // Re-enable form inputs based on their original state
    if (moneyTransferForm) {
        const inputs = moneyTransferForm.querySelectorAll('input, select, button, textarea');
        inputs.forEach(input => {
            // Restore original disabled state
            const originalDisabled = input.getAttribute('data-original-disabled');
            input.disabled = originalDisabled === 'true';
            input.removeAttribute('data-original-disabled');
        });
    }
    
    // Re-enable table interactions
    if (tableBody) {
        tableBody.style.pointerEvents = 'auto';
        tableBody.style.opacity = '1';
    }
    
    // Re-enable modal buttons
    const modalButtons = document.querySelectorAll('#editModal button');
    modalButtons.forEach(btn => {
        const originalDisabled = btn.getAttribute('data-original-disabled');
        btn.disabled = originalDisabled === 'true';
        btn.removeAttribute('data-original-disabled');
    });
    
    // Re-enable action buttons
    const actionButtons = document.querySelectorAll('.filter-btn, #toggleFormButton, #toggleLogoutButton');
    actionButtons.forEach(btn => {
        const originalDisabled = btn.getAttribute('data-original-disabled');
        btn.disabled = originalDisabled === 'true';
        btn.removeAttribute('data-original-disabled');
    });
    
    console.log('Interactions unblocked');
}

function showOperationLoading(message, operationType) {
    blockInteraction(operationType);
    showFloatingAlert(message, true);
}

function hideOperationLoading(successMessage = null) {
    unblockInteraction();
    hideFloatingAlert();
    
    if (successMessage) {
        setTimeout(() => {
            showSuccess(successMessage);
        }, 100);
    }
}

// =====================================================
// AUTHENTICATION FUNCTIONS
// =====================================================

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }
    } catch (error) {
        console.error('Error reading auth state:', error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    } catch (error) {
        console.error('Error saving auth state:', error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        // Clear legacy keys
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType'); 
        localStorage.removeItem('checkLogin');
        sessionStorage.clear();
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === 'true';
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;
    
    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel; // Lower number = higher permission
}

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached data");
                return memoryCache.data;
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn('Error accessing cache:', e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        memoryCache.data = Array.isArray(data) ? [...data] : data;
        memoryCache.timestamp = Date.now();
        console.log("Data cached successfully");
    } catch (e) {
        console.warn('Cannot cache data:', e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// =====================================================
// PERFORMANCE OPTIMIZATION FUNCTIONS
// =====================================================

function createDocumentFragment(items, startIndex = 0, endIndex = items.length) {
    const fragment = document.createDocumentFragment();
    const itemsToRender = items.slice(startIndex, endIndex);
    
    itemsToRender.forEach(item => {
        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);
        
        if (formattedTime) {
            const newRow = createTableRow(item, formattedTime);
            fragment.appendChild(newRow);
        }
    });
    
    return fragment;
}

function batchRenderRows(items, batchSize = BATCH_SIZE) {
    return new Promise((resolve) => {
        let currentIndex = 0;
        
        function renderBatch() {
            const endIndex = Math.min(currentIndex + batchSize, items.length);
            const fragment = createDocumentFragment(items, currentIndex, endIndex);
            tableBody.appendChild(fragment);
            
            currentIndex = endIndex;
            currentDisplayedRows = endIndex;
            
            // Update progress
            const progress = Math.round((currentIndex / items.length) * 100);
            showLoading(`Đang tải dữ liệu... ${progress}%`);
            
            if (currentIndex < items.length) {
                // Use requestAnimationFrame for smooth rendering
                requestAnimationFrame(() => {
                    setTimeout(renderBatch, 0);
                });
            } else {
                resolve();
            }
        }
        
        renderBatch();
    });
}

function debouncedRender(callback, delay = RENDER_DEBOUNCE_DELAY) {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(callback, delay);
}

// Virtual scrolling simulation - only render visible rows
function enableLazyLoading() {
    const tableContainer = tableBody.parentElement;
    if (!tableContainer) return;
    
    const scrollHandler = () => {
        if (isLazyLoading || filteredData.length === 0) return;
        
        const scrollTop = tableContainer.scrollTop;
        const containerHeight = tableContainer.clientHeight;
        const scrollHeight = tableContainer.scrollHeight;
        
        // Load more when near bottom (80% scrolled)
        if (scrollTop + containerHeight >= scrollHeight * 0.8) {
            loadMoreRows();
        }
    };
    
    tableContainer.addEventListener('scroll', scrollHandler, { passive: true });
}

function loadMoreRows() {
    if (isLazyLoading || currentDisplayedRows >= filteredData.length) return;
    
    isLazyLoading = true;
    const nextBatch = Math.min(currentDisplayedRows + LAZY_LOAD_SIZE, filteredData.length);
    const itemsToLoad = filteredData.slice(currentDisplayedRows, nextBatch);
    
    if (itemsToLoad.length === 0) {
        isLazyLoading = false;
        return;
    }
    
    showLoading(`Đang tải thêm ${itemsToLoad.length} giao dịch...`);
    
    setTimeout(() => {
        const fragment = createDocumentFragment(itemsToLoad);
        tableBody.appendChild(fragment);
        currentDisplayedRows = nextBatch;
        
        hideFloatingAlert();
        isLazyLoading = false;
        
        console.log(`Loaded ${itemsToLoad.length} more rows. Total displayed: ${currentDisplayedRows}/${filteredData.length}`);
    }, 100);
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>\"']/g, '').trim();
}

function numberWithCommas(x) {
    if (!x && x !== 0) return '0';
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${day}-${month}-${year}`;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);
    
    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    const result = new Date(year, month, day);
    return isNaN(result.getTime()) ? null : result;
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
    const parts = dateString.split("-");
    
    if (parts.length !== 3) {
        throw new Error('Invalid date format. Expected DD-MM-YY');
    }
    
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    
    if (year < 100) {
        year = 2000 + year;
    }
    
    const dateObj = new Date(year, month - 1, day);
    const timestamp = dateObj.getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    
    return timestamp.toString();
}

function isValidDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    
    const regex = /^\d{2}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    
    const parts = dateStr.split('-');
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 0;
}

// =====================================================
// UI FUNCTIONS
// =====================================================

function showLoading(message = "Đang xử lý...") {
    showFloatingAlert(message, true);
}

function showSuccess(message = "Thành công!", duration = 2000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
    }, 100);
}

function showError(message = "Có lỗi xảy ra!", duration = 3000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
    }, 100);
}

function showFloatingAlert(message, isLoading = false, duration = 3000) {
    let alertBox = document.getElementById('floatingAlert');
    
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'floatingAlert';
        alertBox.innerHTML = `
            <div class="alert-content">
                <div class="loading-spinner" style="display: none;">
                    <div class="spinner"></div>
                </div>
                <div class="alert-text"></div>
            </div>
        `;
        
        alertBox.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            color: #333;
            border-radius: 8px;
            z-index: 10001;
            font-size: 14px;
            font-weight: bold;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            padding: 20px;
            min-width: 200px;
            text-align: center;
            border: 2px solid #28a745;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #floatingAlert.loading {
                background: rgba(0,0,0,0.9);
                color: white;
                border-color: #007bff;
            }
            
            #floatingAlert.show {
                opacity: 1 !important;
            }
            
            .loading-spinner {
                margin-bottom: 10px;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid #f3f3f3;
                border-top: 2px solid #007bff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            #loadingOverlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 10000;
                display: none;
            }
            
            #loadingOverlay.show {
                display: block;
            }
        `;
        document.head.appendChild(style);
        
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        document.body.appendChild(loadingOverlay);
        document.body.appendChild(alertBox);
    }
    
    const alertText = alertBox.querySelector('.alert-text');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const spinner = alertBox.querySelector('.loading-spinner');
    
    if (alertText) {
        alertText.textContent = message;
    }
    
    if (isLoading) {
        alertBox.classList.add('loading');
        if (loadingOverlay) loadingOverlay.classList.add('show');
        if (spinner) spinner.style.display = 'block';
        
        document.body.style.overflow = 'hidden';
        document.body.style.cursor = 'wait';
    } else {
        alertBox.classList.remove('loading');
        if (loadingOverlay) loadingOverlay.classList.remove('show');
        if (spinner) spinner.style.display = 'none';
        
        document.body.style.overflow = 'auto';
        document.body.style.cursor = 'default';
    }
    
    alertBox.classList.add('show');
    
    if (!isLoading && duration > 0) {
        setTimeout(() => {
            hideFloatingAlert();
        }, duration);
    }
}

function hideFloatingAlert() {
    const alertBox = document.getElementById('floatingAlert');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    if (alertBox) {
        alertBox.classList.remove('show', 'loading');
    }
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
    
    document.body.style.overflow = 'auto';
    document.body.style.cursor = 'default';
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Chuyển khoản') {
    const auth = getAuthState();
    const logEntry = {
        timestamp: new Date(),
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown',
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    historyCollectionRef.add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// FILTER SYSTEM
// =====================================================

function createFilterSystem() {
    if (document.getElementById('improvedFilterSystem')) {
        return;
    }
    
    const today = new Date();
	const tzOffset = today.getTimezoneOffset() * 60000;
	const localISODate = new Date(today - tzOffset).toISOString().split('T')[0];
    
    const filterContainer = document.createElement('div');
    filterContainer.id = 'improvedFilterSystem';
    filterContainer.className = 'filter-system';
    filterContainer.innerHTML = `
        <style>
            .filter-system {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border: 1px solid #dee2e6;
            }
            
            .filter-row {
                display: flex;
                gap: 15px;
                align-items: end;
                flex-wrap: wrap;
                margin-bottom: 15px;
            }
            
            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
                min-width: 150px;
            }
            
            .filter-group label {
                font-weight: bold;
                color: #495057;
                font-size: 14px;
            }
            
            .filter-input, .filter-select {
                padding: 8px 12px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                background: white;
                font-size: 14px;
                transition: border-color 0.15s;
            }
            
            .filter-input:focus, .filter-select:focus {
                outline: none;
                border-color: #80bdff;
                box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
            }
            
            .filter-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.15s;
                margin-right: 5px;
            }
            
            .clear-btn {
                background: #dc3545;
                color: white;
            }
            
            .clear-btn:hover {
                background: #c82333;
            }
            
            .today-btn {
                background: #17a2b8;
                color: white;
            }
            
            .today-btn:hover {
                background: #138496;
            }
            
            .all-btn {
                background: #28a745;
                color: white;
            }
            
            .all-btn:hover {
                background: #218838;
            }
            
            .filter-info {
                background: #e7f3ff;
                border: 1px solid #b3d4fc;
                padding: 10px;
                border-radius: 4px;
                font-size: 13px;
                color: #0c5460;
                text-align: center;
                margin-top: 10px;
            }
            
            .hidden {
                display: none;
            }
            
            .date-inputs {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .date-separator {
                font-weight: bold;
                color: #6c757d;
            }
        </style>
        
        <div class="filter-row">
            <div class="filter-group">
                <label>Từ ngày:</label>
                <input type="date" id="startDateFilter" class="filter-input" value="${localISODate}">
            </div>
            
            <div class="filter-group">
                <label>Đến ngày:</label>
                <input type="date" id="endDateFilter" class="filter-input" value="${localISODate}">
            </div>
            
            <div class="filter-group">
                <label for="statusFilterDropdown">Trạng thái:</label>
                <select id="statusFilterDropdown" class="filter-select">
                    <option value="all">Tất cả</option>
                    <option value="active">Chưa đi đơn</option>
                    <option value="completed">Đã đi đơn</option>
                </select>
            </div>
            
            <div class="filter-group">
                <label>&nbsp;</label>
                <div>
                    <button id="todayFilterBtn" class="filter-btn today-btn">Hôm nay</button>
                    <button id="allFilterBtn" class="filter-btn all-btn">Tất cả</button>
                    <button id="clearFiltersBtn" class="filter-btn clear-btn">Xóa lọc</button>
                </div>
            </div>
        </div>
        
        <div id="filterInfo" class="filter-info hidden"></div>
    `;
    
    const tableContainer = document.querySelector('.table-container') || (tableBody ? tableBody.parentNode : null);
    if (tableContainer && tableContainer.parentNode) {
        tableContainer.parentNode.insertBefore(filterContainer, tableContainer);
    }
    
    currentFilters.startDate = localISODate;
    currentFilters.endDate = localISODate;
    
    setTimeout(() => {
        attachFilterEventListeners();
    }, 100);
}

function attachFilterEventListeners() {
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const statusFilter = document.getElementById('statusFilterDropdown');
    const todayBtn = document.getElementById('todayFilterBtn');
    const allBtn = document.getElementById('allFilterBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    if (startDateFilter) startDateFilter.addEventListener('change', handleDateRangeChange);
    if (endDateFilter) endDateFilter.addEventListener('change', handleDateRangeChange);
    if (statusFilter) statusFilter.addEventListener('change', handleFilterChange);
    if (todayBtn) todayBtn.addEventListener('click', setTodayFilter);
    if (allBtn) allBtn.addEventListener('click', setAllFilter);
    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);
}

function handleDateRangeChange() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    if (!startDateFilter || !endDateFilter) return;
    
    let startDate = startDateFilter.value;
    let endDate = endDateFilter.value;
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        [startDate, endDate] = [endDate, startDate];
        startDateFilter.value = startDate;
        endDateFilter.value = endDate;
    }
    
    currentFilters.startDate = startDate;
    currentFilters.endDate = endDate;
    
    debouncedApplyFilters();
}

function handleFilterChange() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    const statusFilter = document.getElementById('statusFilterDropdown');
    if (statusFilter) {
        currentFilters.status = statusFilter.value;
        debouncedApplyFilters();
    }
}

function setTodayFilter() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000; // phút → ms
    const localISODate = new Date(today - tzOffset).toISOString().split('T')[0];

    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    if (startDateFilter) startDateFilter.value = localISODate;
    if (endDateFilter) endDateFilter.value = localISODate;
    
    currentFilters.startDate = localISODate;
    currentFilters.endDate = localISODate;
    
    applyFilters();
}

function setAllFilter() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    
    currentFilters.startDate = null;
    currentFilters.endDate = null;
    
    applyFilters();
}

function clearAllFilters() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const statusFilter = document.getElementById('statusFilterDropdown');
    
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    if (statusFilter) statusFilter.value = 'all';
    
    currentFilters = {
        startDate: null,
        endDate: null,
        status: 'all'
    };
    
    applyFilters();
}

function debouncedApplyFilters() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }
    
    filterTimeout = setTimeout(() => {
        applyFilters();
    }, FILTER_DEBOUNCE_DELAY);
}

function applyFilters() {
    if (isFilteringInProgress || isOperationInProgress) return;
    
    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");
    
    debouncedRender(() => {
        try {
            // Filter data from source instead of DOM for better performance
            const filteredResults = arrayData.filter(item => {
                const timestamp = parseFloat(item.dateCell);
                const itemDate = new Date(timestamp);
                const formattedDate = formatDate(itemDate);
                const rowDate = parseDisplayDate(formattedDate);
                
                const matchDate = checkDateInRange(rowDate, currentFilters.startDate, currentFilters.endDate);
                
                let matchStatus = true;
                if (currentFilters.status === "active") {
                    matchStatus = !item.muted;
                } else if (currentFilters.status === "completed") {
                    matchStatus = Boolean(item.muted);
                }
                
                return matchDate && matchStatus;
            });
            
            // Update filtered data
            filteredData = filteredResults;
            
            // Re-render table with filtered data
            renderFilteredData(filteredResults);
            
            updateFilterInfo(filteredResults.length, arrayData.length);
            updateTotalAmount();
            
            hideFloatingAlert();
            showSuccess(`Hiển thị ${filteredResults.length} giao dịch`);
            
        } catch (error) {
            console.error('Error during filtering:', error);
            showError('Có lỗi xảy ra khi lọc dữ liệu');
        } finally {
            isFilteringInProgress = false;
        }
    });
}

async function renderFilteredData(dataToRender) {
    // Sort by date only (newest first) - NO muted sorting  
    const sortedData = [...dataToRender].sort((a, b) => {
        const timestampA = parseInt(a.dateCell) || 0;
        const timestampB = parseInt(b.dateCell) || 0;
        return timestampB - timestampA; // Only sort by date, keep muted items in place
    });
    
    // Clear table and reset counter
    tableBody.innerHTML = '';
    currentDisplayedRows = 0;
    
    if (sortedData.length === 0) {
        return;
    }
    
    // For small datasets, render immediately
    if (sortedData.length <= INITIAL_LOAD_SIZE) {
        const fragment = createDocumentFragment(sortedData);
        tableBody.appendChild(fragment);
        currentDisplayedRows = sortedData.length;
    } else {
        // For large datasets, use batch rendering
        await batchRenderRows(sortedData);
    }
}

function checkDateInRange(rowDate, startDateStr, endDateStr) {
    if (!startDateStr && !endDateStr) return true;
    if (!rowDate) return false;
    
    const rowTime = rowDate.getTime();
    
    if (startDateStr) {
        const startTime = new Date(startDateStr + 'T00:00:00').getTime();
        if (rowTime < startTime) return false;
    }
    
    if (endDateStr) {
        const endTime = new Date(endDateStr + 'T23:59:59').getTime();
        if (rowTime > endTime) return false;
    }
    
    return true;
}

function updateFilterInfo(visibleCount, totalCount) {
    const filterInfo = document.getElementById('filterInfo');
    if (!filterInfo) return;
    
    if (visibleCount !== totalCount) {
        let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} giao dịch`;
        
        if (currentFilters.startDate || currentFilters.endDate) {
            const startStr = currentFilters.startDate ? formatDateForDisplay(currentFilters.startDate) : '';
            const endStr = currentFilters.endDate ? formatDateForDisplay(currentFilters.endDate) : '';
            
            if (startStr && endStr) {
                if (startStr === endStr) {
                    filterText += ` (ngày ${startStr})`;
                } else {
                    filterText += ` (từ ${startStr} đến ${endStr})`;
                }
            } else if (startStr) {
                filterText += ` (từ ${startStr})`;
            } else if (endStr) {
                filterText += ` (đến ${endStr})`;
            }
        }
        
        if (currentFilters.status !== 'all') {
            const statusText = currentFilters.status === 'active' ? 'chưa đi đơn' : 'đã đi đơn';
            filterText += ` - ${statusText}`;
        }
        
        filterInfo.innerHTML = filterText;
        filterInfo.classList.remove('hidden');
    } else {
        filterInfo.classList.add('hidden');
    }
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

// =====================================================
// TABLE MANAGEMENT FUNCTIONS
// =====================================================

function updateTotalAmount() {
    let totalAmount = 0;
    
    // Calculate from filtered data instead of DOM for accuracy
    if (filteredData && filteredData.length > 0) {
        filteredData.forEach(item => {
            // Only count non-muted items
            if (!item.muted) {
                const amountStr = item.amountCell || '0';
                const cleanAmount = amountStr.toString().replace(/[,\.]/g, '');
                const amount = parseFloat(cleanAmount);
                if (!isNaN(amount)) {
                    totalAmount += amount;
                }
            }
        });
    } else {
        // Fallback to arrayData if filteredData not available
        arrayData.forEach(item => {
            if (!item.muted) {
                const amountStr = item.amountCell || '0';
                const cleanAmount = amountStr.toString().replace(/[,\.]/g, '');
                const amount = parseFloat(cleanAmount);
                if (!isNaN(amount)) {
                    totalAmount += amount;
                }
            }
        });
    }
    
    if (totalAmountElement) {
        totalAmountElement.innerText = 'Tổng Tiền: ' + numberWithCommas(totalAmount) + ',000';
    }
}

async function renderTableFromData(dataArray, applyInitialFilter = false) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log('No data to render');
        createFilterSystem();
        return;
    }
    
    showLoading("Đang chuẩn bị dữ liệu...");
    
    // Ensure all items have unique IDs
    const dataWithUniqueIds = dataArray.map(item => ensureUniqueId(item));
    arrayData = [...dataWithUniqueIds];
    
    if (applyInitialFilter) {
        const today = new Date().toISOString().split('T')[0];
        currentFilters.startDate = today;
        currentFilters.endDate = today;
    }
    
    // Sort data by date only (newest first) - NO muted sorting
    const sortedData = [...dataWithUniqueIds].sort((a, b) => {
        const timestampA = parseInt(a.dateCell) || 0;
        const timestampB = parseInt(b.dateCell) || 0;
        return timestampB - timestampA; // Newest first only
    });
    
    // Store sorted data - will be filtered later
    filteredData = [...sortedData];
    
    // Clear table and reset counters
    tableBody.innerHTML = '';
    currentDisplayedRows = 0;
    const uniqueDates = new Set();
    
    // Extract unique dates for filter
    sortedData.forEach(item => {
        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);
        if (formattedTime) {
            uniqueDates.add(formattedTime);
        }
    });
    arrayDate = Array.from(uniqueDates);
    
    try {
        // Create filter system first
        createFilterSystem();
        
        // If we need to apply initial filter, do it now before rendering
        if (applyInitialFilter) {
            // Filter the data first
            const filteredResults = sortedData.filter(item => {
                const timestamp = parseFloat(item.dateCell);
                const itemDate = new Date(timestamp);
                const formattedDate = formatDate(itemDate);
                const rowDate = parseDisplayDate(formattedDate);
                
                const matchDate = checkDateInRange(rowDate, currentFilters.startDate, currentFilters.endDate);
                
                let matchStatus = true;
                if (currentFilters.status === "active") {
                    matchStatus = !item.muted;
                } else if (currentFilters.status === "completed") {
                    matchStatus = Boolean(item.muted);
                }
                
                return matchDate && matchStatus;
            });
            
            filteredData = filteredResults;
            
            // Render filtered data
            if (filteredResults.length > 0) {
                const initialBatchSize = Math.min(INITIAL_LOAD_SIZE, filteredResults.length);
                showLoading("Đang tải dữ liệu hôm nay...");
                const initialFragment = createDocumentFragment(filteredResults, 0, initialBatchSize);
                tableBody.appendChild(initialFragment);
                currentDisplayedRows = initialBatchSize;
                
                updateTotalAmount();
                updateFilterInfo(filteredResults.length, sortedData.length);
                
                hideFloatingAlert();
                showSuccess(`Hiển thị ${filteredResults.length} giao dịch hôm nay`);
                
                // Load remaining filtered data in background if needed
                if (filteredResults.length > initialBatchSize) {
                    setTimeout(async () => {
                        showLoading(`Đang tải ${filteredResults.length - initialBatchSize} giao dịch còn lại...`);
                        await batchRenderRows(filteredResults.slice(initialBatchSize));
                        updateTotalAmount();
                        hideFloatingAlert();
                        console.log(`Completed loading ${filteredResults.length} filtered transactions`);
                    }, 100);
                }
            } else {
                hideFloatingAlert();
                showSuccess("Không có giao dịch nào trong ngày hôm nay");
                updateTotalAmount();
                updateFilterInfo(0, sortedData.length);
            }
        } else {
            // No initial filter, render all data
            const initialBatchSize = Math.min(INITIAL_LOAD_SIZE, sortedData.length);
            if (initialBatchSize > 0) {
                showLoading("Đang tải dữ liệu ban đầu...");
                const initialFragment = createDocumentFragment(sortedData, 0, initialBatchSize);
                tableBody.appendChild(initialFragment);
                currentDisplayedRows = initialBatchSize;
                
                updateTotalAmount();
                
                hideFloatingAlert();
                showSuccess(`Đã tải ${initialBatchSize}/${sortedData.length} giao dịch đầu tiên`);
                
                // Load remaining data in background if needed
                if (sortedData.length > initialBatchSize) {
                    setTimeout(async () => {
                        showLoading(`Đang tải ${sortedData.length - initialBatchSize} giao dịch còn lại...`);
                        await batchRenderRows(sortedData.slice(initialBatchSize));
                        updateTotalAmount();
                        hideFloatingAlert();
                        console.log(`Completed loading all ${sortedData.length} transactions`);
                    }, 100);
                }
            }
        }
        
        // Enable lazy loading for future interactions
        enableLazyLoading();
        
    } catch (error) {
        console.error('Error rendering table:', error);
        showError('Có lỗi xảy ra khi hiển thị dữ liệu');
    }
}

function createTableRow(item, dateStr) {
    const newRow = document.createElement('tr');
    
    // Apply styling for muted items (dimmed and moved to bottom)
    if (item.muted) {
        newRow.style.cssText = 'opacity: 0.4; background-color: #f8f9fa;';
        newRow.classList.add('muted-row');
    } else {
        newRow.style.cssText = 'opacity: 1.0;';
        newRow.classList.add('active-row');
    }

    const cells = [
        { content: sanitizeInput(dateStr), id: item.dateCell },
        { content: sanitizeInput(item.noteCell || '') },
        { content: item.amountCell ? numberWithCommas(sanitizeInput(item.amountCell.toString()).replace(/[,\.]/g, '')) : '0' },
        { content: sanitizeInput(item.bankCell || '') },
        { content: null, type: 'checkbox', checked: Boolean(item.muted) },
        { content: sanitizeInput(item.customerInfoCell || '') },
        { content: null, type: 'edit' },
        { content: null, type: 'delete', userId: item.user || 'Unknown' }
    ];

    // Create cells using document fragment for better performance
    const cellFragment = document.createDocumentFragment();
    
    cells.forEach((cellData, index) => {
        const cell = document.createElement('td');
        
        if (cellData.type === 'checkbox') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
            checkbox.checked = cellData.checked;
            cell.appendChild(checkbox);
        } else if (cellData.type === 'edit') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            cell.appendChild(editButton);
        } else if (cellData.type === 'delete') {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.setAttribute('data-user', cellData.userId);
            cell.appendChild(deleteButton);
        } else {
            cell.textContent = cellData.content;
            if (cellData.id) cell.id = cellData.id;
        }
        
        cellFragment.appendChild(cell);
    });
    
    newRow.appendChild(cellFragment);

    // Store the unique ID in the row for easier identification
    newRow.setAttribute('data-unique-id', item.uniqueId);
    
    const auth = getAuthState();
    if (auth) {
        applyRowPermissions(newRow, parseInt(auth.checkLogin));
    }
    
    return newRow;
}

function applyRowPermissions(row, userRole) {
    const deleteCell = row.cells[7];
    const editCell = row.cells[6];
    const checkboxCell = row.cells[4];
    
    if (userRole !== 0) {
        deleteCell.style.visibility = 'hidden';
        
        if (userRole === 1) {
            checkboxCell.style.visibility = 'visible';
            editCell.style.visibility = 'visible';
        } else {
            editCell.style.visibility = 'hidden';
            checkboxCell.style.visibility = 'hidden';
        }
    }
}

function updateTable() {
    const cachedData = getCachedData();
    if (cachedData) {
        console.log('Loading from cache...');
        showLoading("Đang tải dữ liệu từ cache...");
        // Use setTimeout to prevent blocking UI
        setTimeout(async () => {
            await renderTableFromData(cachedData, true);
            hideFloatingAlert();
        }, 50);
        return;
    }
    
    console.log('Loading from Firebase...');
    showLoading("Đang tải dữ liệu từ Firebase...");
    
    collectionRef.doc("ck").get()
        .then(async (doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    console.log(`Loading ${data["data"].length} transactions from Firebase...`);
                    await renderTableFromData(data["data"], true);
                    setCachedData(data["data"]);
                    showSuccess(`Đã tải xong ${data["data"].length} giao dịch!`);
                } else {
                    console.log("No data found or data array is empty");
                    createFilterSystem();
                    showError("Không có dữ liệu");
                }
            } else {
                console.log("Document does not exist");
                createFilterSystem();
                showError("Tài liệu không tồn tại");
            }
        })
        .catch((error) => {
            console.error("Error getting document:", error);
            createFilterSystem();
            showError("Lỗi khi tải dữ liệu từ Firebase");
        });
}

// =====================================================
// FORM HANDLING
// =====================================================

function initializeForm() {
    if (ngayck) {
        ngayck.valueAsDate = new Date();
    }
    
    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', () => {
            if (isOperationInProgress) {
                showError('Có thao tác đang thực hiện, vui lòng đợi...');
                return;
            }
            
            if (hasPermission(3)) {
                if (dataForm.style.display === 'none' || dataForm.style.display === '') {
                    dataForm.style.display = 'block';
                    toggleFormButton.textContent = 'Ẩn biểu mẫu';
                    
                    // Auto-focus on first input when form opens
                    setTimeout(() => {
                        const firstInput = document.getElementById('transferNote');
                        if (firstInput) {
                            firstInput.focus();
                        }
                    }, 100);
                } else {
                    dataForm.style.display = 'none';
                    toggleFormButton.textContent = 'Hiện biểu mẫu';
                }
            } else {
                showError('Không có quyền truy cập form');
            }
        });
    }
    
    // Form submit handler
    if (moneyTransferForm) {
        moneyTransferForm.addEventListener('submit', handleFormSubmit);
        
        // Add keyboard shortcuts for faster entry
        moneyTransferForm.addEventListener('keydown', function(e) {
            // Ctrl + Enter to submit form
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleFormSubmit(e);
            }
        });
    }
    
    // Amount input formatting
    if (transferAmountInput) {
        transferAmountInput.addEventListener('blur', function() {
            let value = this.value.replace(/[,\.]/g, '');
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = numberWithCommas(value);
            }
        });
        
        // Auto-advance to next field on Enter
        transferAmountInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const bankSelect = document.getElementById('bank');
                if (bankSelect) {
                    bankSelect.focus();
                }
            }
        });
    }
    
    // Add Enter key navigation for form fields (except the last one)
    const formFields = ['transferNote', 'transferAmount', 'bank'];
    formFields.forEach((fieldId, index) => {
        const field = document.getElementById(fieldId);
        if (field && fieldId !== 'transferAmount') { // transferAmount already handled above
            field.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextIndex = index + 1;
                    if (nextIndex < formFields.length) {
                        const nextField = document.getElementById(formFields[nextIndex]);
                        if (nextField) {
                            nextField.focus();
                        }
                    } else {
                        // If this is the last field, focus on customerInfo
                        const customerInfoField = document.getElementById('customerInfo');
                        if (customerInfoField) {
                            customerInfoField.focus();
                        }
                    }
                }
            });
        }
    });
    
    // For customerInfo (last field), Enter should submit the form
    const customerInfoField = document.getElementById('customerInfo');
    if (customerInfoField) {
        customerInfoField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Submit the form
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                moneyTransferForm.dispatchEvent(submitEvent);
            }
        });
    }
    
    // Clear form button
    const clearDataButton = document.getElementById('clearDataButton');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', function() {
            if (isOperationInProgress) {
                showError('Có thao tác đang thực hiện, vui lòng đợi...');
                return;
            }
            const currentDate = new Date();
            moneyTransferForm.reset();
            ngayck.valueAsDate = currentDate;
            
            // Focus on first input after clearing
            setTimeout(() => {
                const firstInput = document.getElementById('transferNote');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        });
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    // Check if any operation is in progress
    if (isOperationInProgress) {
        showError('Có thao tác đang thực hiện, vui lòng đợi...');
        return;
    }

    if (!hasPermission(3)) {
        showError('Không có quyền thêm giao dịch');
        return;
    }

    const currentDate = new Date(ngayck.value);
    const formattedDate = formatDate(currentDate);
    const transferNote = sanitizeInput(document.getElementById('transferNote').value);
    let transferAmount = transferAmountInput.value.replace(/[,\.]/g, '');
    transferAmount = parseFloat(transferAmount);
    const selectedBank = sanitizeInput(document.getElementById('bank').value);
    const customerInfo = sanitizeInput(document.getElementById('customerInfo').value);

    // Validation
    if (isNaN(transferAmount) || transferAmount <= 0) {
        showError('Vui lòng nhập số tiền chuyển hợp lệ.');
        return;
    }

    if (!transferNote.trim()) {
        showError('Vui lòng nhập ghi chú chuyển khoản.');
        return;
    }

    // Generate timestamp
    const tempTimeStamp = new Date();
    const timestamp = currentDate.getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;

    const auth = getAuthState();
    const dataToUpload = {
        uniqueId: generateUniqueId(),
        dateCell: timestamp.toString(),
        noteCell: transferNote,
        amountCell: numberWithCommas(transferAmount),
        bankCell: selectedBank,
        customerInfoCell: customerInfo,
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown',
        muted: false
    };

    // Start loading and block interactions
    showOperationLoading("Đang thêm giao dịch...", "add");

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertBefore(newRow, tableBody.firstChild);

    // Store form data before reset for potential restore
    const formData = {
        transferNote: transferNote,
        transferAmount: transferAmount,
        selectedBank: selectedBank,
        customerInfo: customerInfo,
        currentDate: currentDate
    };

    // Reset form IMMEDIATELY after getting data
    moneyTransferForm.reset();
    ngayck.valueAsDate = new Date(); // Set to current date for next entry

    // Upload to Firebase
    collectionRef.doc("ck").get().then(doc => {
        const updateData = doc.exists ?
            { ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload) } :
            { ["data"]: [dataToUpload] };

        const operation = doc.exists ?
            collectionRef.doc("ck").update(updateData) :
            collectionRef.doc("ck").set(updateData);

        return operation;
    }).then(() => {
        logAction('add', `Thêm giao dịch chuyển khoản: ${transferNote}`, null, dataToUpload);
        invalidateCache();
        
        // Update arrays to include new data
        arrayData.unshift(dataToUpload);
        
        // Update filtered data if applicable
        const timestamp = parseFloat(dataToUpload.dateCell);
        const itemDate = new Date(timestamp);
        const formattedDate = formatDate(itemDate);
        const rowDate = parseDisplayDate(formattedDate);
        
        const matchDate = checkDateInRange(rowDate, currentFilters.startDate, currentFilters.endDate);
        let matchStatus = true;
        if (currentFilters.status === "active") {
            matchStatus = !dataToUpload.muted;
        } else if (currentFilters.status === "completed") {
            matchStatus = Boolean(dataToUpload.muted);
        }
        
        if (matchDate && matchStatus) {
            filteredData.unshift(dataToUpload);
        }
        
        updateTotalAmount();
        hideOperationLoading("Đã thêm giao dịch thành công!");
        
        // Focus on the first input field for continuous entry
        setTimeout(() => {
            const firstInput = document.getElementById('transferNote');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
        
        console.log("Document uploaded successfully");
    }).catch((error) => {
        console.error("Error uploading document: ", error);
        newRow.remove(); // Remove the row if upload fails
        
        // Restore form data on error
        document.getElementById('transferNote').value = formData.transferNote;
        transferAmountInput.value = numberWithCommas(formData.transferAmount);
        document.getElementById('bank').value = formData.selectedBank;
        document.getElementById('customerInfo').value = formData.customerInfo;
        ngayck.valueAsDate = formData.currentDate;
        
        hideOperationLoading();
        showError('Lỗi khi tải document lên.');
    });
}

// =====================================================
// TABLE EVENT HANDLERS
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener('click', function(e) {
        // Block interactions during operations
        if (isOperationInProgress) {
            showError('Có thao tác đang thực hiện, vui lòng đợi...');
            return;
        }

        const auth = getAuthState();
        if (!auth || auth.checkLogin == '777') {
            if (e.target.type === 'checkbox') {
                e.target.checked = false;
            }
            return;
        }

        if (e.target.classList.contains('edit-button')) {
            handleEditButton(e);
        } else if (e.target.classList.contains('delete-button')) {
            handleDeleteButton(e);
        } else if (e.target.type === 'checkbox') {
            handleCheckboxClick(e);
        }
    });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = 'block';

    const editDate = document.getElementById('editDate');
    const editNote = document.getElementById('editNote');
    const editAmount = document.getElementById('editAmount');
    const editBank = document.getElementById('editBank');
    const editInfo = document.getElementById('editInfo');

    const row = e.target.parentNode.parentNode;
    const date = row.cells[0].innerText;
    const note = row.cells[1].innerText;
    const amount = row.cells[2].innerText;
    const bank = row.cells[3].innerText;
    const customerInfo = row.cells[5].innerText;

    const auth = getAuthState();
    const canEditAll = hasPermission(1);

    if (canEditAll) {
        if (editDate) { editDate.disabled = false; editDate.value = date; }
        if (editNote) { editNote.disabled = false; editNote.value = note; }
        if (editAmount) { editAmount.disabled = false; editAmount.value = amount; }
        if (editBank) { editBank.disabled = false; editBank.value = bank; }
        if (editInfo) { editInfo.value = customerInfo; }
    } else {
        if (editDate) editDate.disabled = true;
        if (editNote) editNote.disabled = true;
        if (editAmount) editAmount.disabled = true;
        if (editBank) editBank.disabled = true;
        if (editInfo) editInfo.value = customerInfo;
    }

    editingRow = row;
}

function handleDeleteButton(e) {
    if (!hasPermission(0)) {
        showError('Không đủ quyền thực hiện chức năng này.');
        return;
    }
    
    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
    if (!confirmDelete) return;

    const row = e.target.closest("tr");
    const uniqueId = row.getAttribute('data-unique-id');
    
    if (!row || !uniqueId) {
        showError('Không tìm thấy ID giao dịch để xóa.');
        return;
    }

    // Start loading and block interactions
    showOperationLoading("Đang xóa giao dịch...", "delete");

    const oldData = {
        uniqueId: uniqueId,
        dateCell: row.querySelector("td").id,
        noteCell: row.cells[1].innerText,
        amountCell: row.cells[2].innerText,
        bankCell: row.cells[3].innerText,
        customerInfoCell: row.cells[5].innerText
    };

    collectionRef.doc("ck").get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Document does not exist');
            }

            const data = doc.data();
            const dataArray = data["data"] || [];
            
            // Use uniqueId to find and remove the item
            const updatedArray = dataArray.filter(item => item.uniqueId !== uniqueId);
            
            if (updatedArray.length === dataArray.length) {
                // Fallback to dateCell if uniqueId not found
                const updatedArrayFallback = dataArray.filter(item => item.dateCell !== row.querySelector("td").id);
                return collectionRef.doc("ck").update({ "data": updatedArrayFallback });
            }
            
            return collectionRef.doc("ck").update({ "data": updatedArray });
        })
        .then(() => {
            logAction('delete', `Xóa giao dịch: ${oldData.noteCell}`, oldData, null);
            invalidateCache();
            
            // Remove from arrays
            arrayData = arrayData.filter(item => item.uniqueId !== uniqueId);
            filteredData = filteredData.filter(item => item.uniqueId !== uniqueId);
            
            row.remove();
            updateTotalAmount();
            hideOperationLoading("Đã xóa giao dịch thành công!");
        })
        .catch((error) => {
            console.error("Error deleting transaction:", error);
            hideOperationLoading();
            showError("Lỗi khi xóa giao dịch");
        });
}

function handleCheckboxClick(e) {
    if (!hasPermission(1)) {
        showError('Không đủ quyền thực hiện chức năng này.');
        e.target.checked = !e.target.checked;
        return;
    }

    const isChecked = e.target.checked;
    const row = e.target.parentNode.parentNode;
    const uniqueId = row.getAttribute('data-unique-id');
    const confirmationMessage = isChecked ? 
        'Bạn có chắc đơn này đã được đi?' : 
        'Đã hủy xác nhận đi đơn';

    if (!confirm(confirmationMessage)) {
        e.target.checked = !isChecked;
        return;
    }

    // Start loading and block interactions
    showOperationLoading("Đang cập nhật trạng thái...", "status_update");
    
    // Apply visual changes for muted state
    if (isChecked) {
        row.style.opacity = '0.4';
        row.style.backgroundColor = '#f8f9fa';
        row.classList.add('muted-row');
        row.classList.remove('active-row');
    } else {
        row.style.opacity = '1.0';
        row.style.backgroundColor = '';
        row.classList.add('active-row');
        row.classList.remove('muted-row');
    }
    
    const tdRow = row.querySelector("td");
    const dataForLog = {
        uniqueId: uniqueId,
        dateCell: tdRow.id,
        noteCell: row.cells[1].innerText,
        amountCell: row.cells[2].innerText,
        bankCell: row.cells[3].innerText,
        customerInfoCell: row.cells[5].innerText,
        muted: isChecked
    };

    collectionRef.doc("ck").get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Document does not exist');
            }

            const data = doc.data();
            const dataArray = data["data"] || [];
            
            // Find item by uniqueId first, fallback to dateCell
            let itemIndex = dataArray.findIndex(item => item.uniqueId === uniqueId);
            if (itemIndex === -1) {
                itemIndex = dataArray.findIndex(item => item.dateCell === tdRow.id);
            }
            
            if (itemIndex === -1) {
                throw new Error('Item not found');
            }
            
            dataArray[itemIndex].muted = isChecked;
            
            return collectionRef.doc("ck").update({ "data": dataArray });
        })
        .then(() => {
            logAction('update', 
                `${isChecked ? 'Đánh dấu đã đi đơn' : 'Hủy đánh dấu đi đơn'}: ${dataForLog.noteCell}`, 
                { ...dataForLog, muted: !isChecked }, 
                { ...dataForLog, muted: isChecked }
            );
            invalidateCache();
            
            // Update arrays
            const itemIndexInArray = arrayData.findIndex(item => item.uniqueId === uniqueId);
            if (itemIndexInArray !== -1) {
                arrayData[itemIndexInArray].muted = isChecked;
            }
            
            const itemIndexInFiltered = filteredData.findIndex(item => item.uniqueId === uniqueId);
            if (itemIndexInFiltered !== -1) {
                filteredData[itemIndexInFiltered].muted = isChecked;
            }
            
            updateTotalAmount();
            hideOperationLoading("Đã cập nhật trạng thái thành công!");
            
            // Re-sort table to move muted items to bottom
            setTimeout(() => {
                rerenderTableWithCurrentData();
            }, 500);
        })
        .catch((error) => {
            console.error("Error updating status:", error);
            hideOperationLoading();
            showError('Lỗi khi cập nhật trạng thái');
            // Revert visual changes on error
            if (isChecked) {
                row.style.opacity = '1.0';
                row.style.backgroundColor = '';
                row.classList.add('active-row');
                row.classList.remove('muted-row');
            } else {
                row.style.opacity = '0.4';
                row.style.backgroundColor = '#f8f9fa';
                row.classList.add('muted-row');
                row.classList.remove('active-row');
            }
            e.target.checked = !isChecked;
        });
}

function rerenderTableWithCurrentData() {
    // Get current data from cache or reload
    const cachedData = getCachedData();
    if (cachedData) {
        renderTableFromData(cachedData, false);
        if (currentFilters.startDate || currentFilters.endDate || currentFilters.status !== 'all') {
            applyFilters();
        }
    } else {
        updateTable();
    }
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    if (isOperationInProgress) {
        showError('Có thao tác đang thực hiện, vui lòng đợi...');
        return;
    }
    
    if (editModal) {
        editModal.style.display = 'none';
    }
    editingRow = null;
}

function saveChanges() {
    // Check if any operation is in progress
    if (isOperationInProgress) {
        showError('Có thao tác đang thực hiện, vui lòng đợi...');
        return;
    }
    
    const editDate = document.getElementById('editDate');
    const editNote = document.getElementById('editNote');
    const editAmount = document.getElementById('editAmount');
    const editBank = document.getElementById('editBank');
    const editInfo = document.getElementById('editInfo');
    
    if (!editDate || !editNote || !editAmount || !editBank || !editInfo) {
        showError('Các trường nhập liệu không tồn tại.');
        return;
    }
    
    const dateValue = editDate.value;
    const noteValue = sanitizeInput(editNote.value.trim());
    const amountValue = editAmount.value.trim();
    const bankValue = sanitizeInput(editBank.value.trim());
    const infoValue = sanitizeInput(editInfo.value.trim());

    // Validation
    if (!isValidDateFormat(dateValue)) {
        showError('Nhập đúng định dạng ngày: DD-MM-YY');
        return;
    }

    if (!noteValue || !amountValue || !bankValue) {
        showError('Vui lòng điền đầy đủ thông tin bắt buộc.');
        return;
    }

    const cleanAmount = amountValue.replace(/[,\.]/g, '');
    const numAmount = parseFloat(cleanAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
        showError('Số tiền không hợp lệ.');
        return;
    }

    if (!editingRow) {
        showError('Không tìm thấy hàng cần chỉnh sửa.');
        return;
    }
    
    const uniqueId = editingRow.getAttribute('data-unique-id');
    const tdRow = editingRow.querySelector("td");
    
    if (!uniqueId && (!tdRow || !tdRow.id)) {
        showError('Không tìm thấy ID của giao dịch.');
        return;
    }

    // Start loading and block interactions
    showOperationLoading("Đang lưu thay đổi...", "edit");

    try {
        const editDateTimestamp = convertToTimestamp(dateValue);
        
        collectionRef.doc("ck").get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error('Document does not exist');
                }

                const data = doc.data();
                const dataArray = data["data"] || [];
                
                // Find item by uniqueId first, fallback to dateCell
                let itemIndex = dataArray.findIndex(item => item.uniqueId === uniqueId);
                if (itemIndex === -1) {
                    itemIndex = dataArray.findIndex(item => item.dateCell === tdRow.id);
                }
                
                if (itemIndex === -1) {
                    throw new Error('Transaction not found');
                }

                const oldData = { ...dataArray[itemIndex] };
                const auth = getAuthState();
                
                if (hasPermission(1)) {
                    // Full edit permissions
                    dataArray[itemIndex].dateCell = editDateTimestamp;
                    dataArray[itemIndex].noteCell = noteValue;
                    dataArray[itemIndex].amountCell = numberWithCommas(numAmount);
                    dataArray[itemIndex].bankCell = bankValue;
                    dataArray[itemIndex].customerInfoCell = infoValue;
                    dataArray[itemIndex].user = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
                    // Ensure uniqueId is preserved
                    if (!dataArray[itemIndex].uniqueId) {
                        dataArray[itemIndex].uniqueId = generateUniqueId();
                    }
                } else {
                    // Limited edit permissions
                    dataArray[itemIndex].customerInfoCell = infoValue;
                    dataArray[itemIndex].user = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
                }
                
                return collectionRef.doc("ck").update({ "data": dataArray });
            })
            .then(() => {
                // Update the row in the table
                if (hasPermission(1)) {
                    editingRow.cells[0].textContent = dateValue;
                    editingRow.cells[0].id = editDateTimestamp;
                    editingRow.cells[1].textContent = noteValue;
                    editingRow.cells[2].textContent = numberWithCommas(numAmount);
                    editingRow.cells[3].textContent = bankValue;
                    editingRow.cells[5].textContent = infoValue;
                } else {
                    editingRow.cells[5].textContent = infoValue;
                }
                
                // Update arrays
                const itemIndexInArray = arrayData.findIndex(item => item.uniqueId === uniqueId);
                if (itemIndexInArray !== -1) {
                    if (hasPermission(1)) {
                        arrayData[itemIndexInArray].dateCell = editDateTimestamp;
                        arrayData[itemIndexInArray].noteCell = noteValue;
                        arrayData[itemIndexInArray].amountCell = numberWithCommas(numAmount);
                        arrayData[itemIndexInArray].bankCell = bankValue;
                    }
                    arrayData[itemIndexInArray].customerInfoCell = infoValue;
                }
                
                const itemIndexInFiltered = filteredData.findIndex(item => item.uniqueId === uniqueId);
                if (itemIndexInFiltered !== -1) {
                    if (hasPermission(1)) {
                        filteredData[itemIndexInFiltered].dateCell = editDateTimestamp;
                        filteredData[itemIndexInFiltered].noteCell = noteValue;
                        filteredData[itemIndexInFiltered].amountCell = numberWithCommas(numAmount);
                        filteredData[itemIndexInFiltered].bankCell = bankValue;
                    }
                    filteredData[itemIndexInFiltered].customerInfoCell = infoValue;
                }
                
                logAction('edit', `Sửa giao dịch: ${noteValue}`, null, null);
                invalidateCache();
                updateTotalAmount();
                hideOperationLoading("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                hideOperationLoading();
                showError('Lỗi khi cập nhật dữ liệu');
            });
            
    } catch (error) {
        console.error('Error in saveChanges:', error);
        hideOperationLoading();
        showError('Lỗi: ' + error.message);
    }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

function exportToExcel() {
    if (isOperationInProgress) {
        showError('Có thao tác đang thực hiện, vui lòng đợi...');
        return;
    }
    
    if (!hasPermission(1)) {
        showError('Không có quyền xuất dữ liệu');
        return;
    }

    try {
        showOperationLoading("Đang chuẩn bị file Excel...", "export");
        
        const wsData = [
            ['Ngày', 'Ghi chú chuyển khoản', 'Số tiền chuyển', 'Ngân hàng', 'Đi đơn', 'Tên FB + SĐT']
        ];

        const tableRows = document.querySelectorAll('#tableBody tr');
        let exportedRowCount = 0;
        
        tableRows.forEach(function(row) {
            if (row.style.display !== 'none' && row.cells && row.cells.length >= 6) {
                const rowData = [];
                
                rowData.push(row.cells[0].textContent || '');
                rowData.push(row.cells[1].textContent || '');
                rowData.push(row.cells[2].textContent || '');
                rowData.push(row.cells[3].textContent || '');
                
                const checkbox = row.cells[4].querySelector('input[type="checkbox"]');
                rowData.push(checkbox && checkbox.checked ? 'Đã đi đơn' : 'Chưa đi đơn');
                rowData.push(row.cells[5].textContent || '');
                
                wsData.push(rowData);
                exportedRowCount++;
            }
        });

        if (exportedRowCount === 0) {
            hideOperationLoading();
            showError('Không có dữ liệu để xuất ra Excel');
            return;
        }

        if (typeof XLSX === 'undefined') {
            hideOperationLoading();
            showError('Thư viện Excel không khả dụng. Vui lòng tải lại trang');
            return;
        }

        setTimeout(() => {
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu chuyển khoản');
            
            const fileName = `dulieu_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            hideOperationLoading(`Đã xuất ${exportedRowCount} giao dịch ra Excel!`);
        }, 500);
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        hideOperationLoading();
        showError('Có lỗi xảy ra khi xuất dữ liệu ra Excel');
    }
}

// =====================================================
// LOGOUT FUNCTION
// =====================================================

function handleLogout() {
    if (isOperationInProgress) {
        showError('Có thao tác đang thực hiện, vui lòng đợi trước khi đăng xuất...');
        return;
    }
    
    const confirmLogout = confirm('Bạn có chắc muốn đăng xuất?');
    if (confirmLogout) {
        showOperationLoading("Đang đăng xuất...", "logout");
        
        setTimeout(() => {
            clearAuthState();
            invalidateCache();
            hideOperationLoading();
            window.location.href = '../index.html';
        }, 1000);
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        window.location.href = '../index.html';
        return;
    }

    // Update UI based on user
    if (auth.userType) {
        const titleElement = document.querySelector('.tieude');
        if (titleElement) {
            titleElement.textContent += ' - ' + auth.displayName;
        }
    }

    // Show main container
    const parentContainer = document.getElementById('parentContainer');
    if (parentContainer) {
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
    }

    // Initialize components
    initializeForm();
    initializeTableEvents();
    updateTable();
    
    // Add logout button event listener
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    // Remove ads
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }

    console.log('Money Transfer Management System initialized successfully with enhanced loading states');
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    
    // If an operation is in progress, unblock interactions
    if (isOperationInProgress) {
        hideOperationLoading();
    }
    
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

// Handle page unload during operations
window.addEventListener('beforeunload', function(e) {
    if (isOperationInProgress) {
        e.preventDefault();
        e.returnValue = 'Có thao tác đang thực hiện. Bạn có chắc muốn rời khỏi trang?';
        return e.returnValue;
    }
});

// Export functions for global use
window.closeModal = closeModal;
window.saveChanges = saveChanges;
window.exportToExcel = exportToExcel;
