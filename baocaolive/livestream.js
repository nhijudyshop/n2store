// Livestream Report Management System - Complete JavaScript File
// Enhanced with edit history tooltip system

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Reduced limit
const FILTER_DEBOUNCE_DELAY = 500; // Increased delay

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null
};

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com", 
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("livestream_reports");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const livestreamForm = document.getElementById('livestreamForm');
const tableBody = document.getElementById('tableBody');
const toggleFormButton = document.getElementById('toggleFormButton');
const dataForm = document.getElementById('dataForm');
const ngayLive = document.getElementById('ngayLive');
const editModal = document.getElementById('editModal');

// Global variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let currentFilters = {
    startDate: null,
    endDate: null,
    status: 'all'
};
let filterTimeout = null;
let isFilteringInProgress = false;

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = 'loginindex_auth';
let authState = null;

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
    return userLevel <= requiredLevel;
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
// EDIT HISTORY TOOLTIP FUNCTIONS
// =====================================================

function showEditHistoryTooltip(event, editHistory, row) {
    // Remove existing tooltip
    removeEditHistoryTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'editHistoryTooltip';
    tooltip.className = 'edit-history-tooltip';
    
    let historyContent = '<div class="tooltip-header">📝 Lịch sử chỉnh sửa</div>';
    
    // Sort edit history by timestamp (newest first)
    const sortedHistory = [...editHistory].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    sortedHistory.forEach((history, index) => {
        const editDate = new Date(history.timestamp).toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        historyContent += `
            <div class="history-entry">
                <div class="history-header">
                    <span class="history-index">#${sortedHistory.length - index}</span>
                    <span class="history-user">${history.editedBy || 'Unknown'}</span>
                    <span class="history-date">${editDate}</span>
                </div>
                <div class="history-changes">
                    ${renderEditChanges(history.oldData, history.newData)}
                </div>
            </div>
        `;
    });
    
    // If no history available
    if (editHistory.length === 0) {
        historyContent += '<div class="no-history">Không có lịch sử chỉnh sửa</div>';
    }
    
    tooltip.innerHTML = historyContent;
    
    // Style the tooltip
    tooltip.style.cssText = `
        position: absolute;
        background: white;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 0;
        max-width: 450px;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 12px;
        font-family: inherit;
        line-height: 1.4;
    `;
    
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = row.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;
    
    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - tooltipRect.height - 5;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    
    // Add close on click outside
    setTimeout(() => {
        document.addEventListener('click', handleTooltipClickOutside);
        document.addEventListener('keydown', handleTooltipKeydown);
    }, 100);
}

function renderEditChanges(oldData, newData) {
    if (!oldData || !newData) {
        return '<em style="color: #6c757d;">Không có dữ liệu thay đổi</em>';
    }
    
    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    
    // Define field display names
    const fieldNames = {
        'dateCell': 'Ngày',
        'mauLive': 'Mẫu live',
        'tienQC': 'Tiền QC',
        'thoiGian': 'Thời gian',
        'soMonLive': 'Số món trên live',
        'soMonInbox': 'Số món inbox'
    };
    
    allKeys.forEach(key => {
        // Skip metadata fields
        if (['id', 'user', 'editHistory', 'createdBy', 'createdAt'].includes(key)) {
            return;
        }
        
        const oldValue = oldData[key];
        const newValue = newData[key];
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            const fieldName = fieldNames[key] || key;
            const formattedOldValue = formatValueForDisplay(oldValue, key);
            const formattedNewValue = formatValueForDisplay(newValue, key);
            
            changes.push(`
                <div class="change-item">
                    <div class="change-field">${fieldName}:</div>
                    <div class="change-values">
                        <div class="old-value">
                            <span class="value-label">Cũ:</span> 
                            <span class="value-content">${formattedOldValue}</span>
                        </div>
                        <div class="new-value">
                            <span class="value-label">Mới:</span> 
                            <span class="value-content">${formattedNewValue}</span>
                        </div>
                    </div>
                </div>
            `);
        }
    });
    
    return changes.length > 0 ? 
        changes.join('') : 
        '<em style="color: #28a745;">Không có thay đổi</em>';
}

function formatValueForDisplay(value, field) {
    if (value === null || value === undefined) {
        return '<span style="color: #6c757d; font-style: italic;">Không có</span>';
    }
    
    // Special formatting for date fields
    if (field === 'dateCell' && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('vi-VN');
        }
    }
    
    // Truncate long strings
    const stringValue = value.toString();
    if (stringValue.length > 80) {
        return stringValue.substring(0, 80) + '...';
    }
    
    return stringValue;
}

function handleTooltipClickOutside(event) {
    const tooltip = document.getElementById('editHistoryTooltip');
    if (tooltip && !tooltip.contains(event.target)) {
        removeEditHistoryTooltip();
    }
}

function handleTooltipKeydown(event) {
    if (event.key === 'Escape') {
        removeEditHistoryTooltip();
    }
}

function removeEditHistoryTooltip() {
    const existingTooltip = document.getElementById('editHistoryTooltip');
    if (existingTooltip) {
        existingTooltip.remove();
        document.removeEventListener('click', handleTooltipClickOutside);
        document.removeEventListener('keydown', handleTooltipKeydown);
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

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

function generateUniqueId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

function logAction(action, description, oldData = null, newData = null, pageName = 'Báo cáo Livestream') {
    const auth = getAuthState();
    const logEntry = {
        timestamp: new Date(),
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown',
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateUniqueId()
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
    const todayBtn = document.getElementById('todayFilterBtn');
    const allBtn = document.getElementById('allFilterBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    if (startDateFilter) startDateFilter.addEventListener('change', handleDateRangeChange);
    if (endDateFilter) endDateFilter.addEventListener('change', handleDateRangeChange);
    if (todayBtn) todayBtn.addEventListener('click', setTodayFilter);
    if (allBtn) allBtn.addEventListener('click', setAllFilter);
    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);
    
    applyFilters();
}

function handleDateRangeChange() {
    if (isFilteringInProgress) return;
    
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

function setTodayFilter() {
    if (isFilteringInProgress) return;
    
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
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
    if (isFilteringInProgress) return;
    
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    
    currentFilters.startDate = null;
    currentFilters.endDate = null;
    
    applyFilters();
}

function clearAllFilters() {
    if (isFilteringInProgress) return;
    
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    
    currentFilters = {
        startDate: null,
        endDate: null,
        status: 'all'
    };
    
    applyFilters();
}

function debouncedApplyFilters() {
    if (isFilteringInProgress) return;
    
    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }
    
    filterTimeout = setTimeout(() => {
        applyFilters();
    }, FILTER_DEBOUNCE_DELAY);
}

function applyFilters() {
    if (isFilteringInProgress) return;
    
    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");
    
    setTimeout(() => {
        try {
            const rows = Array.from(tableBody.rows);
            let visibleCount = 0;
            
            rows.forEach((row, index) => {
                if (index >= MAX_VISIBLE_ROWS) {
                    row.style.display = 'none';
                    return;
                }
                
                const cells = row.cells;
                if (cells.length > 0) {
                    const dateText = cells[0].innerText;
                    const rowDate = parseDisplayDate(dateText);
                    const matchDate = checkDateInRange(rowDate, currentFilters.startDate, currentFilters.endDate);
                    
                    if (matchDate) {
                        visibleCount++;
                        row.style.display = 'table-row';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
            
            updateFilterInfo(visibleCount, rows.length);
            
            hideFloatingAlert();
            showSuccess(`Hiển thị ${visibleCount} báo cáo`);
            
        } catch (error) {
            console.error('Error during filtering:', error);
            showError('Có lỗi xảy ra khi lọc dữ liệu');
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
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
        let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} báo cáo`;
        
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

function renderTableFromData(dataArray, applyInitialFilter = false) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log('No data to render');
        createFilterSystem();
        return;
    }
    
    arrayData = [...dataArray];
    
    if (applyInitialFilter) {
        const today = new Date().toISOString().split('T')[0];
        currentFilters.startDate = today;
        currentFilters.endDate = today;
    }
    
    // Sort data by date (newest first)
    const sortedData = [...dataArray].sort((a, b) => {
        const timestampA = parseInt(a.dateCell) || 0;
        const timestampB = parseInt(b.dateCell) || 0;
        return timestampB - timestampA;
    });
    
    tableBody.innerHTML = '';
    const uniqueDates = new Set();
    const fragment = document.createDocumentFragment();
    
    const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);
    
    for (let i = 0; i < maxRender; i++) {
        const item = sortedData[i];
        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);
        
        if (formattedTime) {
            uniqueDates.add(formattedTime);
            const newRow = createTableRow(item, formattedTime);
            fragment.appendChild(newRow);
        }
    }
    
    tableBody.appendChild(fragment);
    arrayDate = Array.from(uniqueDates);
    
    createFilterSystem();
    
    console.log(`Rendered ${maxRender} / ${sortedData.length} reports`);
}

function createTableRow(item, dateStr) {
    const newRow = document.createElement('tr');
    
    // Check if item has edit history
    const hasEditHistory = item.editHistory && item.editHistory.length > 0;
    
    // Add visual indicator for edited rows
    if (hasEditHistory) {
		const auth = getAuthState();
		if (auth && hasEditHistory && parseInt(auth.checkLogin) === 0) {
			newRow.classList.add('edited-row');
			newRow.style.borderLeft = '4px solid #ffc107';
			newRow.style.backgroundColor = '#fff3cd';
			newRow.title = 'Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)';
		}
    }

    const cells = [
        { content: sanitizeInput(dateStr), id: item.id },
        { 
            content: sanitizeInput(item.mauLive || '') + 
                    (hasEditHistory ? ' <span class="edit-indicator"></span>' : '') 
        },
        { content: item.tienQC ? numberWithCommas(sanitizeInput(item.tienQC.toString()).replace(/[,\.]/g, '')) : '0' },
        { content: sanitizeInput(item.thoiGian || '') },
        { content: sanitizeInput(item.soMonLive || '0') },
        { content: sanitizeInput(item.soMonInbox || '0') },
        { content: null, type: 'edit' },
        { content: null, type: 'delete', userId: item.user || 'Unknown' }
    ];

    cells.forEach((cellData, index) => {
        const cell = document.createElement('td');
        
        if (cellData.type === 'edit') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '✏️';
            editButton.style.cssText = `
                cursor: pointer; 
                padding: 5px; 
                border: none; 
                background: transparent; 
                font-size: 16px;
                border-radius: 4px;
                transition: background-color 0.2s;
            `;
            editButton.title = 'Chỉnh sửa';
            editButton.addEventListener('mouseenter', () => {
                editButton.style.backgroundColor = '#f8f9fa';
            });
            editButton.addEventListener('mouseleave', () => {
                editButton.style.backgroundColor = 'transparent';
            });
            cell.appendChild(editButton);
        } else if (cellData.type === 'delete') {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';
            deleteButton.style.cssText = `
                cursor: pointer; 
                padding: 5px; 
                border: none; 
                background: transparent; 
                font-size: 16px;
                border-radius: 4px;
                transition: background-color 0.2s;
            `;
            deleteButton.title = 'Xóa';
            deleteButton.setAttribute('data-user', cellData.userId);
            deleteButton.addEventListener('mouseenter', () => {
                deleteButton.style.backgroundColor = '#ffe6e6';
            });
            deleteButton.addEventListener('mouseleave', () => {
                deleteButton.style.backgroundColor = 'transparent';
            });
            cell.appendChild(deleteButton);
        } else {
            if (cellData.content && cellData.content.includes('<span class="edit-indicator">')) {
                cell.innerHTML = cellData.content;
            } else {
                cell.textContent = cellData.content;
            }
            if (cellData.id) cell.setAttribute('data-id', cellData.id);
        }
        
        newRow.appendChild(cell);
    });

    // Store edit history data on the row for tooltip access
    if (hasEditHistory) {
        newRow.setAttribute('data-edit-history', JSON.stringify(item.editHistory));
    }

    // Add click event for ADMIN to view edit history - ONLY ON CLICK
    const auth = getAuthState();
    if (auth && hasEditHistory && parseInt(auth.checkLogin) === 0) {
        newRow.style.cursor = 'pointer';
        newRow.addEventListener('click', function(e) {
            // Don't trigger on button clicks
            if (e.target.classList.contains('edit-button') || 
                e.target.classList.contains('delete-button') ||
                e.target.closest('button')) {
                return;
            }
            
            // Show tooltip only on click
            showEditHistoryTooltip(e, item.editHistory, newRow);
        });
    }

    // Apply role-based permissions
    const authForPermissions = getAuthState();
    if (authForPermissions) {
        applyRowPermissions(newRow, parseInt(authForPermissions.checkLogin));
    }
    
    return newRow;
}

function applyRowPermissions(row, userRole) {
    const deleteCell = row.cells[7];
    const editCell = row.cells[6];
    
    if (userRole !== 0) {
        deleteCell.style.visibility = 'hidden';
        
        if (userRole === 1) {
            editCell.style.visibility = 'visible';
        } else {
            editCell.style.visibility = 'hidden';
        }
    }
}

function updateTable() {
    const cachedData = getCachedData();
    if (cachedData) {
        console.log('Loading from cache...');
        showLoading("Đang tải dữ liệu từ cache...");
        setTimeout(() => {
            renderTableFromData(cachedData, true);
            hideFloatingAlert();
        }, 100);
        return;
    }
    
    console.log('Loading from Firebase...');
    showLoading("Đang tải dữ liệu từ Firebase...");
    
    collectionRef.doc("reports").get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    renderTableFromData(data["data"], true);
                    setCachedData(data["data"]);
                    showSuccess("Đã tải xong dữ liệu!");
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
    if (ngayLive) {
        ngayLive.valueAsDate = new Date();
    }
    
    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', () => {
            if (hasPermission(2)) {
                if (dataForm.style.display === 'none' || dataForm.style.display === '') {
                    dataForm.style.display = 'block';
                    toggleFormButton.textContent = 'Ẩn biểu mẫu';
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
    if (livestreamForm) {
        livestreamForm.addEventListener('submit', handleFormSubmit);
    }
    
    // Amount input formatting
    const tienQCInput = document.getElementById('tienQC');
    if (tienQCInput) {
        tienQCInput.addEventListener('blur', function() {
            let value = this.value.replace(/[,\.]/g, '');
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = numberWithCommas(value);
            }
        });
    }
    
    // Clear form button
    const clearDataButton = document.getElementById('clearDataButton');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', function() {
            const currentDate = new Date(ngayLive.value);
            ngayLive.valueAsDate = currentDate;
            livestreamForm.reset();
        });
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(2)) {
        showError('Không có quyền thêm báo cáo');
        return;
    }

    const currentDate = new Date(ngayLive.value);
    const formattedDate = formatDate(currentDate);
    const mauLive = sanitizeInput(document.getElementById('mauLive').value);
    let tienQC = document.getElementById('tienQC').value.replace(/[,\.]/g, '');
    tienQC = parseFloat(tienQC);
    const thoiGian = sanitizeInput(document.getElementById('thoiGian').value);
    const soMonLive = sanitizeInput(document.getElementById('soMonLive').value);
    const soMonInbox = sanitizeInput(document.getElementById('soMonInbox').value);

    // Validation
    if (isNaN(tienQC) || tienQC <= 0) {
        showError('Vui lòng nhập số tiền QC hợp lệ.');
        return;
    }

    if (!mauLive.trim()) {
        showError('Vui lòng nhập mô tả mẫu live.');
        return;
    }

    // Generate timestamp and unique ID
    const tempTimeStamp = new Date();
    const timestamp = currentDate.getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    const auth = getAuthState();
    const userName = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
    
    const dataToUpload = {
        id: uniqueId,
        dateCell: timestamp.toString(),
        mauLive: mauLive,
        tienQC: numberWithCommas(tienQC),
        thoiGian: thoiGian,
        soMonLive: soMonLive,
        soMonInbox: soMonInbox,
        user: userName,
        createdBy: userName,
        createdAt: new Date().toISOString(),
        editHistory: []
    };

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertRow(0).replaceWith(newRow);

    // Reset form
    livestreamForm.reset();
    ngayLive.valueAsDate = currentDate;

    showLoading("Đang lưu báo cáo...");

    // Upload to Firebase
    collectionRef.doc("reports").get().then(doc => {
        const updateData = doc.exists ? 
            { ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload) } :
            { ["data"]: [dataToUpload] };

        const operation = doc.exists ? 
            collectionRef.doc("reports").update(updateData) : 
            collectionRef.doc("reports").set(updateData);

        return operation;
    }).then(() => {
        logAction('add', `Thêm báo cáo livestream: ${mauLive}`, null, dataToUpload);
        invalidateCache();
        showSuccess("Đã thêm báo cáo thành công!");
        console.log("Document uploaded successfully");
    }).catch((error) => {
        console.error("Error uploading document: ", error);
        newRow.remove();
        showError('Lỗi khi tải document lên.');
    });
}

// =====================================================
// TABLE EVENT HANDLERS
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener('click', function(e) {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == '777') {
            return;
        }

        if (e.target.classList.contains('edit-button')) {
            handleEditButton(e);
        } else if (e.target.classList.contains('delete-button')) {
            handleDeleteButton(e);
        }
    });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = 'block';

    const editDate = document.getElementById('editDate');
    const editMauLive = document.getElementById('editMauLive');
    const editTienQC = document.getElementById('editTienQC');
    const editThoiGian = document.getElementById('editThoiGian');
    const editSoMonLive = document.getElementById('editSoMonLive');
    const editSoMonInbox = document.getElementById('editSoMonInbox');

    const row = e.target.parentNode.parentNode;
    const date = row.cells[0].innerText;
    const mauLive = row.cells[1].innerText;
    const tienQC = row.cells[2].innerText;
    const thoiGian = row.cells[3].innerText;
    const soMonLive = row.cells[4].innerText;
    const soMonInbox = row.cells[5].innerText;

    const auth = getAuthState();
    const canEditAll = hasPermission(1);

    if (canEditAll) {
        if (editDate) { 
            editDate.disabled = false; 
            // Convert DD-MM-YY to YYYY-MM-DD for date input
            const parts = date.split('-');
            if (parts.length === 3) {
                const day = parts[0];
                const month = parts[1];
                let year = parseInt(parts[2]);
                if (year < 100) {
                    year = year < 50 ? 2000 + year : 1900 + year;
                }
                editDate.value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
        }
        if (editMauLive) { editMauLive.disabled = false; editMauLive.value = mauLive; }
        if (editTienQC) { editTienQC.disabled = false; editTienQC.value = tienQC; }
        if (editThoiGian) { editThoiGian.disabled = false; editThoiGian.value = thoiGian; }
        if (editSoMonLive) { editSoMonLive.disabled = false; editSoMonLive.value = soMonLive; }
        if (editSoMonInbox) { editSoMonInbox.disabled = false; editSoMonInbox.value = soMonInbox; }
    } else {
        if (editDate) editDate.disabled = true;
        if (editMauLive) editMauLive.disabled = true;
        if (editTienQC) editTienQC.disabled = true;
        if (editThoiGian) editThoiGian.disabled = true;
        if (editSoMonLive) editSoMonLive.disabled = true;
        if (editSoMonInbox) editSoMonInbox.disabled = true;
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
    const firstCell = row.querySelector("td");
    
    if (!row || !firstCell) return;

    const recordId = firstCell.getAttribute('data-id');
    if (!recordId) {
        showError('Không tìm thấy ID báo cáo');
        return;
    }

    showLoading("Đang xóa báo cáo...");

    const oldData = {
        id: recordId,
        mauLive: row.cells[1].innerText,
        tienQC: row.cells[2].innerText,
        thoiGian: row.cells[3].innerText,
        soMonLive: row.cells[4].innerText,
        soMonInbox: row.cells[5].innerText
    };

    collectionRef.doc("reports").get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Document does not exist');
            }

            const data = doc.data();
            const dataArray = data["data"] || [];
            
            const updatedArray = dataArray.filter(item => item.id !== recordId);
            
            return collectionRef.doc("reports").update({ "data": updatedArray });
        })
        .then(() => {
            logAction('delete', `Xóa báo cáo livestream: ${oldData.mauLive}`, oldData, null);
            invalidateCache();
            row.remove();
            showSuccess("Đã xóa báo cáo thành công!");
        })
        .catch((error) => {
            console.error("Error deleting report:", error);
            showError("Lỗi khi xóa báo cáo");
        });
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    if (editModal) {
        editModal.style.display = 'none';
    }
    editingRow = null;
}

function saveChanges() {
    const editDate = document.getElementById('editDate');
    const editMauLive = document.getElementById('editMauLive');
    const editTienQC = document.getElementById('editTienQC');
    const editThoiGian = document.getElementById('editThoiGian');
    const editSoMonLive = document.getElementById('editSoMonLive');
    const editSoMonInbox = document.getElementById('editSoMonInbox');
    
    if (!editDate || !editMauLive || !editTienQC || !editThoiGian || !editSoMonLive || !editSoMonInbox) {
        showError('Các trường nhập liệu không tồn tại.');
        return;
    }
    
    const dateValue = editDate.value;
    const mauLiveValue = sanitizeInput(editMauLive.value.trim());
    const tienQCValue = editTienQC.value.trim();
    const thoiGianValue = sanitizeInput(editThoiGian.value.trim());
    const soMonLiveValue = sanitizeInput(editSoMonLive.value.trim());
    const soMonInboxValue = sanitizeInput(editSoMonInbox.value.trim());

    // Validation
    if (!dateValue || !mauLiveValue || !tienQCValue) {
        showError('Vui lòng điền đầy đủ thông tin bắt buộc.');
        return;
    }

    const cleanAmount = tienQCValue.replace(/[,\.]/g, '');
    const numAmount = parseFloat(cleanAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
        showError('Số tiền QC không hợp lệ.');
        return;
    }

    if (!editingRow) {
        showError('Không tìm thấy hàng cần chỉnh sửa.');
        return;
    }
    
    const firstCell = editingRow.querySelector("td");
    if (!firstCell) {
        showError('Không tìm thấy cell đầu tiên.');
        return;
    }

    const recordId = firstCell.getAttribute('data-id');
    if (!recordId) {
        showError('Không tìm thấy ID của báo cáo.');
        return;
    }

    showLoading("Đang lưu thay đổi...");

    try {
        // Convert date back to timestamp
        const dateObj = new Date(dateValue);
        const editDateTimestamp = dateObj.getTime() + (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;
        
        collectionRef.doc("reports").get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error('Document does not exist');
                }

                const data = doc.data();
                const dataArray = data["data"] || [];
                
                const itemIndex = dataArray.findIndex(item => item.id === recordId);
                if (itemIndex === -1) {
                    throw new Error('Report not found');
                }

                const oldData = { ...dataArray[itemIndex] };
                const auth = getAuthState();
                const currentUser = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
                
                if (hasPermission(1)) {
                    // Prepare new data
                    const newData = {
                        ...oldData,
                        dateCell: editDateTimestamp.toString(),
                        mauLive: mauLiveValue,
                        tienQC: numberWithCommas(numAmount),
                        thoiGian: thoiGianValue,
                        soMonLive: soMonLiveValue,
                        soMonInbox: soMonInboxValue
                    };
                    
                    // Create comprehensive edit history entry
                    const editHistoryEntry = {
                        timestamp: new Date().toISOString(),
                        editedBy: currentUser,
                        oldData: {
                            dateCell: oldData.dateCell,
                            mauLive: oldData.mauLive,
                            tienQC: oldData.tienQC,
                            thoiGian: oldData.thoiGian,
                            soMonLive: oldData.soMonLive,
                            soMonInbox: oldData.soMonInbox
                        },
                        newData: {
                            dateCell: newData.dateCell,
                            mauLive: newData.mauLive,
                            tienQC: newData.tienQC,
                            thoiGian: newData.thoiGian,
                            soMonLive: newData.soMonLive,
                            soMonInbox: newData.soMonInbox
                        }
                    };
                    
                    // Initialize or update edit history
                    if (!newData.editHistory) {
                        newData.editHistory = [];
                    }
                    newData.editHistory.push(editHistoryEntry);
                    
                    // Update the item in array
                    dataArray[itemIndex] = newData;
                }
                
                return collectionRef.doc("reports").update({ "data": dataArray });
            })
            .then(() => {
                // Update the row in the table with edit indicators
                if (hasPermission(1)) {
                    const formattedDisplayDate = formatDate(new Date(editDateTimestamp));
                    editingRow.cells[0].textContent = formattedDisplayDate;
                    editingRow.cells[0].setAttribute('data-id', recordId);
                    editingRow.cells[1].innerHTML = mauLiveValue + ' <span class="edit-indicator"></span>';
                    editingRow.cells[2].textContent = numberWithCommas(numAmount);
                    editingRow.cells[3].textContent = thoiGianValue;
                    editingRow.cells[4].textContent = soMonLiveValue;
                    editingRow.cells[5].textContent = soMonInboxValue;
                    
                    // Add visual indicators for edited row
                    editingRow.classList.add('edited-row');
                    editingRow.style.borderLeft = '4px solid #ffc107';
                    editingRow.style.backgroundColor = '#fff3cd';
                    editingRow.title = 'Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)';
                }
                
                logAction('edit', `Sửa báo cáo livestream: ${mauLiveValue}`, null, null);
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                showError('Lỗi khi cập nhật dữ liệu: ' + error.message);
            });
            
    } catch (error) {
        console.error('Error in saveChanges:', error);
        showError('Lỗi: ' + error.message);
    }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

function exportToExcel() {
    if (!hasPermission(1)) {
        showError('Không có quyền xuất dữ liệu');
        return;
    }

    try {
        showLoading("Đang chuẩn bị file Excel...");
        
        const wsData = [
            ['Ngày', 'Mẫu live', 'Tiền QC', 'Thời gian', 'Số món trên live', 'Số món inbox']
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
                rowData.push(row.cells[4].textContent || '');
                rowData.push(row.cells[5].textContent || '');
                
                wsData.push(rowData);
                exportedRowCount++;
            }
        });

        if (exportedRowCount === 0) {
            showError('Không có dữ liệu để xuất ra Excel');
            return;
        }

        if (typeof XLSX === 'undefined') {
            showError('Thư viện Excel không khả dụng. Vui lòng tải lại trang');
            return;
        }

        setTimeout(() => {
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo Livestream');
            
            const fileName = `baocao_livestream_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            showSuccess(`Đã xuất ${exportedRowCount} báo cáo ra Excel!`);
        }, 500);
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showError('Có lỗi xảy ra khi xuất dữ liệu ra Excel');
    }
}

// =====================================================
// LOGOUT FUNCTION
// =====================================================

function handleLogout() {
    const confirmLogout = confirm('Bạn có chắc muốn đăng xuất?');
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = '../index.html';
    }
}

// =====================================================
// SIDEBAR FUNCTIONS
// =====================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.classList.remove('hidden');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.classList.add('active');
        menuToggle.classList.add('hidden');
    }
}

// =====================================================
// CSS INJECTION FOR EDIT HISTORY
// =====================================================

function injectEditHistoryStyles() {
    if (document.getElementById('editHistoryStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'editHistoryStyles';
    style.textContent = `
        .edit-history-tooltip .tooltip-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 15px;
            margin: 0;
            border-radius: 10px 10px 0 0;
            font-weight: 600;
            font-size: 14px;
            text-align: center;
            border-bottom: 1px solid #dee2e6;
        }

        .edit-history-tooltip .history-entry {
            border-bottom: 1px solid #f1f3f4;
            background: white;
        }

        .edit-history-tooltip .history-entry:last-child {
            border-bottom: none;
            border-radius: 0 0 10px 10px;
        }

        .edit-history-tooltip .history-header {
            background: #f8f9fa;
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            border-bottom: 1px solid #e9ecef;
        }

        .edit-history-tooltip .history-index {
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 10px;
        }

        .edit-history-tooltip .history-user {
            font-weight: 600;
            color: #2c3e50;
            font-size: 11px;
        }

        .edit-history-tooltip .history-date {
            color: #6c757d;
            font-size: 10px;
        }

        .edit-history-tooltip .history-changes {
            padding: 12px 15px;
            font-size: 11px;
        }

        .edit-history-tooltip .change-item {
            margin-bottom: 8px;
            padding: 8px 10px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #dee2e6;
        }

        .edit-history-tooltip .change-item:last-child {
            margin-bottom: 0;
        }

        .edit-history-tooltip .change-field {
            font-weight: 600;
            color: #495057;
            margin-bottom: 4px;
            font-size: 11px;
        }

        .edit-history-tooltip .change-values {
            margin-left: 8px;
        }

        .edit-history-tooltip .old-value, 
        .edit-history-tooltip .new-value {
            margin: 2px 0;
            font-size: 10px;
            display: flex;
            align-items: flex-start;
            gap: 5px;
        }

        .edit-history-tooltip .value-label {
            font-weight: 600;
            min-width: 30px;
        }

        .edit-history-tooltip .old-value .value-label {
            color: #dc3545;
        }

        .edit-history-tooltip .new-value .value-label {
            color: #28a745;
        }

        .edit-history-tooltip .value-content {
            word-break: break-word;
            line-height: 1.3;
        }

        .edit-history-tooltip .no-history {
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-style: italic;
        }

        .edit-indicator {
            color: #ffc107;
            font-size: 12px;
            margin-left: 5px;
        }

        .edited-row {
            border-left: 4px solid #ffc107 !important;
            background-color: #fff3cd !important;
        }

        .edited-row:hover {
            background-color: #ffeaa7 !important;
        }
    `;
    
    document.head.appendChild(style);
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
            titleElement.textContent += ' - ' + auth.userType.split('-')[0];
        }
    }

    // Show main container
    const parentContainer = document.getElementById('parentContainer');
    if (parentContainer) {
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
    }

    // Initialize CSS styles for edit history
    injectEditHistoryStyles();

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

    console.log('Livestream Report Management System with Edit History initialized successfully');
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

// Export functions for global use
window.closeModal = closeModal;
window.saveChanges = saveChanges;
window.exportToExcel = exportToExcel;
window.toggleSidebar = toggleSidebar;

// Fixed Edit History System - Using Modal Popup instead of Tooltip
// Add this to your existing JavaScript file

// =====================================================
// EDIT HISTORY MODAL FUNCTIONS
// =====================================================

function showEditHistoryModal(editHistory, rowData) {
    console.log('showEditHistoryModal called with:', editHistory, rowData); // Debug log
    
    // Remove existing modal if any
    removeEditHistoryModal();
    
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'editHistoryModalOverlay';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.id = 'editHistoryModal';
    modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 0;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        position: relative;
        margin: 20px;
        width: 90%;
    `;
    
    // Build modal content
    let modalContent = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <h3 style="margin: 0; font-size: 18px;">📝 Lịch sử chỉnh sửa</h3>
            <button onclick="removeEditHistoryModal()" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                font-weight: bold;
            ">&times;</button>
        </div>
        <div style="padding: 20px;">
    `;
    
    // Show current data info
    modalContent += `
        <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        ">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Thông tin hiện tại:</h4>
            <div style="font-size: 14px; color: #495057;">
                <strong>Mẫu live:</strong> ${rowData.mauLive || 'N/A'}<br>
                <strong>Tiền QC:</strong> ${rowData.tienQC || 'N/A'}<br>
                <strong>Thời gian:</strong> ${rowData.thoiGian || 'N/A'}<br>
                <strong>Số món live:</strong> ${rowData.soMonLive || 'N/A'}<br>
                <strong>Số món inbox:</strong> ${rowData.soMonInbox || 'N/A'}
            </div>
        </div>
    `;
    
    // Check if there's edit history
    if (!editHistory || editHistory.length === 0) {
        modalContent += `
            <div style="
                text-align: center;
                padding: 30px;
                color: #6c757d;
                font-style: italic;
            ">
                Không có lịch sử chỉnh sửa
            </div>
        `;
    } else {
        // Sort edit history by timestamp (newest first)
        const sortedHistory = [...editHistory].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        modalContent += '<h4 style="margin: 0 0 15px 0; color: #2c3e50;">Lịch sử chỉnh sửa:</h4>';
        
        sortedHistory.forEach((history, index) => {
            const editDate = new Date(history.timestamp).toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            modalContent += `
                <div style="
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    overflow: hidden;
                ">
                    <div style="
                        background: #e9ecef;
                        padding: 10px 15px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 13px;
                    ">
                        <span style="
                            background: #667eea;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-weight: 600;
                            font-size: 11px;
                        ">#${sortedHistory.length - index}</span>
                        <span style="font-weight: 600; color: #2c3e50;">${history.editedBy || 'Unknown'}</span>
                        <span style="color: #6c757d; font-size: 11px;">${editDate}</span>
                    </div>
                    <div style="padding: 15px;">
                        ${renderEditChangesForModal(history.oldData, history.newData)}
                    </div>
                </div>
            `;
        });
    }
    
    modalContent += '</div>';
    modal.innerHTML = modalContent;
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Close on overlay click
    modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
            removeEditHistoryModal();
        }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', handleModalKeydown);
}

function renderEditChangesForModal(oldData, newData) {
    if (!oldData || !newData) {
        return '<em style="color: #6c757d;">Không có dữ liệu thay đổi</em>';
    }
    
    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    
    // Define field display names
    const fieldNames = {
        'dateCell': 'Ngày',
        'mauLive': 'Mẫu live',
        'tienQC': 'Tiền QC',
        'thoiGian': 'Thời gian',
        'soMonLive': 'Số món trên live',
        'soMonInbox': 'Số món inbox'
    };
    
    allKeys.forEach(key => {
        // Skip metadata fields
        if (['id', 'user', 'editHistory', 'createdBy', 'createdAt'].includes(key)) {
            return;
        }
        
        const oldValue = oldData[key];
        const newValue = newData[key];
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            const fieldName = fieldNames[key] || key;
            const formattedOldValue = formatValueForModal(oldValue, key);
            const formattedNewValue = formatValueForModal(newValue, key);
            
            changes.push(`
                <div style="
                    margin-bottom: 10px;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 6px;
                    border-left: 3px solid #dee2e6;
                ">
                    <div style="font-weight: 600; color: #495057; margin-bottom: 5px; font-size: 13px;">
                        ${fieldName}:
                    </div>
                    <div style="margin-left: 10px;">
                        <div style="margin: 3px 0; font-size: 12px; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #dc3545; font-weight: 600; min-width: 30px;">Cũ:</span> 
                            <span style="word-break: break-word;">${formattedOldValue}</span>
                        </div>
                        <div style="margin: 3px 0; font-size: 12px; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #28a745; font-weight: 600; min-width: 30px;">Mới:</span> 
                            <span style="word-break: break-word;">${formattedNewValue}</span>
                        </div>
                    </div>
                </div>
            `);
        }
    });
    
    return changes.length > 0 ? 
        changes.join('') : 
        '<em style="color: #28a745;">Không có thay đổi</em>';
}

function formatValueForModal(value, field) {
    if (value === null || value === undefined) {
        return '<span style="color: #6c757d; font-style: italic;">Không có</span>';
    }
    
    // Special formatting for date fields
    if (field === 'dateCell' && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('vi-VN');
        }
    }
    
    // Truncate very long strings
    const stringValue = value.toString();
    if (stringValue.length > 100) {
        return stringValue.substring(0, 100) + '...';
    }
    
    return stringValue;
}

function handleModalKeydown(event) {
    if (event.key === 'Escape') {
        removeEditHistoryModal();
    }
}

function removeEditHistoryModal() {
    const modal = document.getElementById('editHistoryModalOverlay');
    if (modal) {
        modal.remove();
        document.removeEventListener('keydown', handleModalKeydown);
    }
}

// =====================================================
// ENHANCED TABLE ROW CREATION WITH DEBUG
// =====================================================

function createTableRowWithEditHistory(item, dateStr) {
    console.log('Creating row for item:', item); // Debug log
    
    const newRow = document.createElement('tr');
    
    // Check if item has edit history
    const hasEditHistory = item.editHistory && item.editHistory.length > 0;
    console.log('Has edit history:', hasEditHistory, item.editHistory); // Debug log
    
    // Add visual indicator for edited rows
    if (hasEditHistory) {
        newRow.classList.add('edited-row');
        newRow.style.borderLeft = '4px solid #ffc107';
        newRow.style.backgroundColor = '#fff3cd';
        newRow.title = 'Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)';
    }

    const cells = [
        { content: sanitizeInput(dateStr), id: item.id },
        { 
            content: sanitizeInput(item.mauLive || '') + 
                    (hasEditHistory ? ' <span class="edit-indicator"></span>' : '') 
        },
        { content: item.tienQC ? numberWithCommas(sanitizeInput(item.tienQC.toString()).replace(/[,\.]/g, '')) : '0' },
        { content: sanitizeInput(item.thoiGian || '') },
        { content: sanitizeInput(item.soMonLive || '0') },
        { content: sanitizeInput(item.soMonInbox || '0') },
        { content: null, type: 'edit' },
        { content: null, type: 'delete', userId: item.user || 'Unknown' }
    ];

    cells.forEach((cellData, index) => {
        const cell = document.createElement('td');
        
        if (cellData.type === 'edit') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '✏️';
            editButton.style.cssText = `
                cursor: pointer; 
                padding: 5px; 
                border: none; 
                background: transparent; 
                font-size: 16px;
                border-radius: 4px;
                transition: background-color 0.2s;
            `;
            editButton.title = 'Chỉnh sửa';
            cell.appendChild(editButton);
        } else if (cellData.type === 'delete') {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';
            deleteButton.style.cssText = `
                cursor: pointer; 
                padding: 5px; 
                border: none; 
                background: transparent; 
                font-size: 16px;
                border-radius: 4px;
                transition: background-color 0.2s;
            `;
            deleteButton.title = 'Xóa';
            deleteButton.setAttribute('data-user', cellData.userId);
            cell.appendChild(deleteButton);
        } else {
            if (cellData.content && cellData.content.includes('<span class="edit-indicator">')) {
                cell.innerHTML = cellData.content;
            } else {
                cell.textContent = cellData.content;
            }
            if (cellData.id) cell.setAttribute('data-id', cellData.id);
        }
        
        newRow.appendChild(cell);
    });

    // Store complete item data on the row
    if (hasEditHistory) {
        newRow.setAttribute('data-edit-history', JSON.stringify(item.editHistory));
        newRow.setAttribute('data-row-data', JSON.stringify({
            mauLive: item.mauLive,
            tienQC: item.tienQC,
            thoiGian: item.thoiGian,
            soMonLive: item.soMonLive,
            soMonInbox: item.soMonInbox
        }));
    }

    // Add click event for ADMIN to view edit history
    const auth = getAuthState();
    console.log('Auth state:', auth); // Debug log
    
    if (auth && hasEditHistory && parseInt(auth.checkLogin) === 0) {
        console.log('Adding click event for admin user'); // Debug log
        newRow.style.cursor = 'pointer';
        
        // Add click event with better event handling
        newRow.addEventListener('click', function(e) {
            console.log('Row clicked!', e.target); // Debug log
            
            // Don't trigger on button clicks
            if (e.target.classList.contains('edit-button') || 
                e.target.classList.contains('delete-button') ||
                e.target.closest('button')) {
                console.log('Button clicked, ignoring'); // Debug log
                return;
            }
            
            // Get data from attributes
            const editHistoryData = JSON.parse(newRow.getAttribute('data-edit-history') || '[]');
            const rowData = JSON.parse(newRow.getAttribute('data-row-data') || '{}');
            
            console.log('Showing modal with data:', editHistoryData, rowData); // Debug log
            showEditHistoryModal(editHistoryData, rowData);
        });
        
        // Add visual feedback
        newRow.addEventListener('mouseenter', () => {
            if (!document.getElementById('editHistoryModalOverlay')) {
                newRow.style.backgroundColor = '#ffeaa7';
            }
        });
        
        newRow.addEventListener('mouseleave', () => {
            if (!document.getElementById('editHistoryModalOverlay')) {
                newRow.style.backgroundColor = hasEditHistory ? '#fff3cd' : '';
            }
        });
    }

    // Apply role-based permissions
    const authForPermissions = getAuthState();
    if (authForPermissions) {
        applyRowPermissions(newRow, parseInt(authForPermissions.checkLogin));
    }
    
    return newRow;
}

// =====================================================
// UPDATED SAVE CHANGES WITH BETTER EDIT HISTORY
// =====================================================

function saveChangesWithEditHistory() {
    const editDate = document.getElementById('editDate');
    const editMauLive = document.getElementById('editMauLive');
    const editTienQC = document.getElementById('editTienQC');
    const editThoiGian = document.getElementById('editThoiGian');
    const editSoMonLive = document.getElementById('editSoMonLive');
    const editSoMonInbox = document.getElementById('editSoMonInbox');
    
    if (!editDate || !editMauLive || !editTienQC || !editThoiGian || !editSoMonLive || !editSoMonInbox) {
        showError('Các trường nhập liệu không tồn tại.');
        return;
    }
    
    const dateValue = editDate.value;
    const mauLiveValue = sanitizeInput(editMauLive.value.trim());
    const tienQCValue = editTienQC.value.trim();
    const thoiGianValue = sanitizeInput(editThoiGian.value.trim());
    const soMonLiveValue = sanitizeInput(editSoMonLive.value.trim());
    const soMonInboxValue = sanitizeInput(editSoMonInbox.value.trim());

    // Validation
    if (!dateValue || !mauLiveValue || !tienQCValue) {
        showError('Vui lòng điền đầy đủ thông tin bắt buộc.');
        return;
    }

    const cleanAmount = tienQCValue.replace(/[,\.]/g, '');
    const numAmount = parseFloat(cleanAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
        showError('Số tiền QC không hợp lệ.');
        return;
    }

    if (!editingRow) {
        showError('Không tìm thấy hàng cần chỉnh sửa.');
        return;
    }
    
    const firstCell = editingRow.querySelector("td");
    if (!firstCell) {
        showError('Không tìm thấy cell đầu tiên.');
        return;
    }

    const recordId = firstCell.getAttribute('data-id');
    if (!recordId) {
        showError('Không tìm thấy ID của báo cáo.');
        return;
    }

    showLoading("Đang lưu thay đổi...");

    try {
        // Convert date back to timestamp
        const dateObj = new Date(dateValue);
        const editDateTimestamp = dateObj.getTime() + (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;
        
        collectionRef.doc("reports").get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error('Document does not exist');
                }

                const data = doc.data();
                const dataArray = data["data"] || [];
                
                const itemIndex = dataArray.findIndex(item => item.id === recordId);
                if (itemIndex === -1) {
                    throw new Error('Report not found');
                }

                const oldData = { ...dataArray[itemIndex] };
                const auth = getAuthState();
                const currentUser = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
                
                if (hasPermission(1)) {
                    // Prepare new data
                    const newData = {
                        ...oldData,
                        dateCell: editDateTimestamp.toString(),
                        mauLive: mauLiveValue,
                        tienQC: numberWithCommas(numAmount),
                        thoiGian: thoiGianValue,
                        soMonLive: soMonLiveValue,
                        soMonInbox: soMonInboxValue
                    };
                    
                    // Create comprehensive edit history entry
                    const editHistoryEntry = {
                        timestamp: new Date().toISOString(),
                        editedBy: currentUser,
                        oldData: {
                            dateCell: oldData.dateCell,
                            mauLive: oldData.mauLive,
                            tienQC: oldData.tienQC,
                            thoiGian: oldData.thoiGian,
                            soMonLive: oldData.soMonLive,
                            soMonInbox: oldData.soMonInbox
                        },
                        newData: {
                            dateCell: newData.dateCell,
                            mauLive: newData.mauLive,
                            tienQC: newData.tienQC,
                            thoiGian: newData.thoiGian,
                            soMonLive: newData.soMonLive,
                            soMonInbox: newData.soMonInbox
                        }
                    };
                    
                    // Initialize or update edit history
                    if (!newData.editHistory) {
                        newData.editHistory = [];
                    }
                    newData.editHistory.push(editHistoryEntry);
                    
                    console.log('Saving edit history:', newData.editHistory); // Debug log
                    
                    // Update the item in array
                    dataArray[itemIndex] = newData;
                }
                
                return collectionRef.doc("reports").update({ "data": dataArray });
            })
            .then(() => {
                // Update the row in the table with edit indicators
                if (hasPermission(1)) {
                    const formattedDisplayDate = formatDate(new Date(editDateTimestamp));
                    editingRow.cells[0].textContent = formattedDisplayDate;
                    editingRow.cells[0].setAttribute('data-id', recordId);
                    editingRow.cells[1].innerHTML = mauLiveValue + ' <span class="edit-indicator"></span>';
                    editingRow.cells[2].textContent = numberWithCommas(numAmount);
                    editingRow.cells[3].textContent = thoiGianValue;
                    editingRow.cells[4].textContent = soMonLiveValue;
                    editingRow.cells[5].textContent = soMonInboxValue;
                    
                    // Add visual indicators for edited row
                    editingRow.classList.add('edited-row');
                    editingRow.style.borderLeft = '4px solid #ffc107';
                    editingRow.style.backgroundColor = '#fff3cd';
                    editingRow.title = 'Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)';
                    
                    // Update stored data attributes
                    editingRow.setAttribute('data-row-data', JSON.stringify({
                        mauLive: mauLiveValue,
                        tienQC: numberWithCommas(numAmount),
                        thoiGian: thoiGianValue,
                        soMonLive: soMonLiveValue,
                        soMonInbox: soMonInboxValue
                    }));
                }
                
                logAction('edit', `Sửa báo cáo livestream: ${mauLiveValue}`, null, null);
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                showError('Lỗi khi cập nhật dữ liệu: ' + error.message);
            });
            
    } catch (error) {
        console.error('Error in saveChanges:', error);
        showError('Lỗi: ' + error.message);
    }
}

// Export functions for global use
window.removeEditHistoryModal = removeEditHistoryModal;
window.saveChangesWithEditHistory = saveChangesWithEditHistory;

// Inject CSS for edit indicators
function injectEditHistoryCSS() {
    if (document.getElementById('editHistoryCSS')) return;
    
    const style = document.createElement('style');
    style.id = 'editHistoryCSS';
    style.textContent = `
        .edit-indicator {
            color: #ffc107;
            font-size: 12px;
            margin-left: 5px;
        }

        .edited-row {
            border-left: 4px solid #ffc107 !important;
            background-color: #fff3cd !important;
        }

        .edited-row:hover {
            background-color: #ffeaa7 !important;
        }
    `;
    
    document.head.appendChild(style);
}

// Initialize CSS
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEditHistoryCSS);
} else {
    injectEditHistoryCSS();
}