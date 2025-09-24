// Hang Hoan Management System - Enhanced Version
// Security and performance improvements

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Limit for better performance
const FILTER_DEBOUNCE_DELAY = 500; // Debounce delay for filters

// In-memory cache object (replaces localStorage)
let memoryCache = {
    data: null,
    timestamp: null
};

// Firebase configuration (should be moved to environment variables in production)
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
const collectionRef = db.collection("hanghoan");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const form = document.getElementById("return-product");
const tableBody = document.getElementById("tableBody");
const toggleFormButton = document.getElementById("toggleFormButton");
const dataForm = document.getElementById('dataForm');
const editModal = document.getElementById("editModal");

// Global variables
let editingRow;
let tempSTT = 0;
let statusFilter = "all"; // "all", "active", "completed"
let filterTimeout = null;
let isFilteringInProgress = false;

// User authentication state - using consistent storage like file 3
const AUTH_STORAGE_KEY = 'loginindex_auth';
let authState = null;

// =====================================================
// AUTHENTICATION FUNCTIONS (from file 3)
// =====================================================

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }
        
        // Check legacy storage for migration
        const legacyLogin = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const legacyUserType = localStorage.getItem('userType') || sessionStorage.getItem('userType');
        const legacyCheckLogin = localStorage.getItem('checkLogin') || sessionStorage.getItem('checkLogin');
        
        if (legacyLogin) {
            authState = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now()
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
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
// CACHE FUNCTIONS (improved from original)
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
// UTILITY FUNCTIONS (enhanced)
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>\"']/g, '').trim();
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const formattedDate = `${day}-${month}-${year}`;
    return formattedDate;
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
    
    let year = parseInt(parts[2]);
    if (year < 100) {
        year = 2000 + year;
    }
    
    const formattedDate = year + "-" + parts[1] + "-" + parts[0];
    const timestamp = new Date(formattedDate).getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
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
// LOGGING FUNCTIONS (enhanced)
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Hàng hoàn') {
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
// UI FUNCTIONS (improved from file 3)
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
// FILTER SYSTEM (enhanced with better performance)
// =====================================================

function createStatusFilter() {
    let statusFilterContainer = document.getElementById('statusFilterContainer');
    if (!statusFilterContainer) {
        statusFilterContainer = document.createElement('div');
        statusFilterContainer.id = 'statusFilterContainer';
        statusFilterContainer.style.cssText = 'margin: 10px 0; display: flex; align-items: center; gap: 10px;';
        
        const table = document.querySelector('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(statusFilterContainer, table);
        }
        
        statusFilterContainer.innerHTML = `
            <label for="statusFilter">Trạng thái đơn hàng:</label>
            <select id="statusFilter" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; background: white;">
                <option value="all">Tất cả</option>
                <option value="active">Chưa nhận hàng hoàn</option>
                <option value="completed">Đã nhận hàng hoàn</option>
            </select>
        `;
        
        const statusFilterSelect = document.getElementById('statusFilter');
        statusFilterSelect.addEventListener('change', function() {
            statusFilter = this.value;
            debouncedUpdateTable();
        });
    }
    
    const statusFilterSelect = document.getElementById('statusFilter');
    if (statusFilterSelect) {
        statusFilterSelect.value = statusFilter;
    }
}

function debouncedUpdateTable() {
    if (isFilteringInProgress) return;
    
    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }
    
    filterTimeout = setTimeout(() => {
        updateTable();
    }, FILTER_DEBOUNCE_DELAY);
}

// =====================================================
// TABLE MANAGEMENT (enhanced performance)
// =====================================================

function updateTable() {
    // Check cache first
    const cachedData = getCachedData();
    if (cachedData) {
        console.log('Loading from cache...');
        showLoading("Đang tải từ cache...");
        setTimeout(() => {
            renderTableFromData(cachedData);
            hideFloatingAlert();
        }, 100);
        return;
    }
    
    console.log('Loading from Firebase...');
    showLoading("Đang tải dữ liệu...");
    
    collectionRef.doc("hanghoan").get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();

                if (!Array.isArray(data["data"])) {
                    console.error("Lỗi: data['data'] không phải là một mảng hoặc chưa được khởi tạo.", data);
                    showError("Dữ liệu không hợp lệ");
                } else {
                    setCachedData(data["data"]);
                    renderTableFromData(data["data"]);
                    showSuccess("Đã tải xong dữ liệu!");
                }
                updateSuggestions();
            } else {
                showError("Không tìm thấy dữ liệu");
            }
        })
        .catch((error) => {
            console.error("Lỗi lấy document:", error);
            showError("Lỗi khi tải dữ liệu");
        });
}

function renderTableFromData(dataArray) {
    if (!Array.isArray(dataArray)) {
        console.error("Invalid data array");
        return;
    }

    // Apply filters
    const filteredData = applyFiltersToData(dataArray);
    
    // Sort filtered data - active items first, then by date
    const sortedData = filteredData.sort(function(a, b) {
        // First sort by muted status
        if (a.muted !== b.muted) {
            return a.muted ? 1 : -1;
        }
        // Then sort by date (newest first)
        return parseInt(b.duyetHoanValue) - parseInt(a.duyetHoanValue);
    });
    
    // Clear existing table
    tableBody.innerHTML = '';
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);
    
    // Render data in batches for better performance
    let currentIndex = 0;
    function renderBatch() {
        const batchEnd = Math.min(currentIndex + BATCH_SIZE, maxRender);
        
        for (let i = currentIndex; i < batchEnd; i++) {
            const row = renderSingleRow(sortedData[i], i + 1);
            fragment.appendChild(row);
        }
        
        currentIndex = batchEnd;
        
        if (currentIndex < maxRender) {
            setTimeout(renderBatch, 0); // Yield to browser
        } else {
            tableBody.appendChild(fragment);
            createStatusFilter();
            updateSuggestions();
            hideFloatingAlert();
        }
    }
    
    renderBatch();
}

function applyFiltersToData(dataArray) {
    const channelFilter = document.getElementById('channelFilter') ? document.getElementById('channelFilter').value.trim().toLowerCase() : '';
    const scenarioFilter = document.getElementById('scenarioFilter') ? document.getElementById('scenarioFilter').value.trim().toLowerCase() : '';
    const startDate = document.getElementById('startDate') ? document.getElementById('startDate').value : '';
    const endDate = document.getElementById('endDate') ? document.getElementById('endDate').value : '';

    const timestampstartDate = startDate ? new Date(startDate).getTime() / 1000 : null;
    const timestampendDate = endDate ? new Date(endDate).getTime() / 1000 : null;
    
    return dataArray.filter(item => {
        // Channel filter
        const channelText = item.shipValue ? item.shipValue.trim().toLowerCase() : '';
        const channelMatch = (channelFilter === "all" || channelText === channelFilter || channelFilter === "");
        
        // Scenario filter
        const scenarioText = item.scenarioValue ? item.scenarioValue.trim().toLowerCase() : '';
        const scenarioMatch = (scenarioFilter === "all" || scenarioText === scenarioFilter || scenarioFilter === "");
        
        // Date filter
        const timestamp = parseFloat(item.duyetHoanValue);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);
        const timestampdateText = parseDateText(formattedTime.replace(/\//g, '-'));
        
        const dateMatch = (!isNaN(timestampdateText) &&
            ((timestampstartDate === null && timestampendDate === null) ||
                (timestampstartDate !== null && timestampendDate !== null &&
                    timestampdateText >= timestampstartDate && timestampdateText <= timestampendDate)));
        
        // Apply status filter
        const matchStatus = (() => {
            switch(statusFilter) {
                case "active":
                    return !item.muted;
                case "completed":
                    return item.muted;
                default:
                    return true;
            }
        })();
        
        return channelMatch && scenarioMatch && dateMatch && matchStatus;
    });
}

function renderSingleRow(item, sttNumber) {
    // Convert and format date
    const timestamp = parseFloat(item.duyetHoanValue);
    const dateCellConvert = new Date(timestamp);
    const formattedTime = formatDate(dateCellConvert);

    // Create new row
    const newRow = document.createElement('tr');
    newRow.style.opacity = item.muted ? '0.5' : '1.0';
    
    const cells = [
        { content: sttNumber, id: item.duyetHoanValue },
        { content: sanitizeInput(item.shipValue || '') },
        { content: sanitizeInput(item.scenarioValue || '') },
        { content: sanitizeInput(item.customerInfoValue || '') },
        { content: sanitizeInput(item.totalAmountValue || '') },
        { content: sanitizeInput(item.causeValue || '') },
        { content: null, type: 'checkbox', checked: Boolean(item.muted) },
        { content: formattedTime.replace(/\//g, '-') },
        { content: null, type: 'edit' },
        { content: null, type: 'delete', userId: item.user || 'Unknown' }
    ];

    cells.forEach((cellData, index) => {
        const cell = document.createElement('td');
        
        if (cellData.type === 'checkbox') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
            checkbox.className = 'received-checkbox';
            checkbox.checked = cellData.checked;
            cell.appendChild(checkbox);
        } else if (cellData.type === 'edit') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '✏️';
            editButton.style.cssText = 'cursor: pointer; padding: 5px; border: none; background: transparent; font-size: 16px;';
            cell.appendChild(editButton);
        } else if (cellData.type === 'delete') {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';
            deleteButton.style.cssText = 'cursor: pointer; padding: 5px; border: none; background: transparent; font-size: 16px;';
            deleteButton.id = cellData.userId;
            cell.appendChild(deleteButton);
        } else {
            cell.textContent = cellData.content;
            if (cellData.id) cell.id = cellData.id;
        }
        
        newRow.appendChild(cell);
    });

    const auth = getAuthState();
    if (auth) {
        applyRowPermissions(newRow, parseInt(auth.checkLogin));
    }
    
    return newRow;
}

function applyRowPermissions(row, userRole) {
    const deleteCell = row.cells[9];
    const editCell = row.cells[8];
    const checkboxCell = row.cells[6];
    
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

function parseDateText(dateText) {
    const parts = dateText.split('-');
    if (parts.length !== 3) return NaN;

    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);

    year += (year < 100) ? 2000 : 0;

    return new Date(year, month, day).getTime() / 1000;
}

// =====================================================
// FORM HANDLING (enhanced)
// =====================================================

function initializeForm() {
    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', () => {
            const auth = getAuthState();
            if (auth && auth.checkLogin !== '777') {
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
    if (form) {
        form.addEventListener("submit", handleFormSubmit);
    }
}

function handleFormSubmit(event) {
    event.preventDefault();

    if (!hasPermission(3)) {
        showError('Không có quyền thêm đơn hàng hoàn');
        return;
    }

    const firstRow = tableBody.rows[0];
    if (firstRow) {
        tempSTT = parseInt(firstRow.innerText);
    }

    const shipValue = sanitizeInput(form.querySelector("#ship").value);
    const scenarioValue = sanitizeInput(form.querySelector('#scenario').value);
    const customerInfoValue = sanitizeInput(form.querySelector("#customerInfo").value);
    
    // Get and format totalAmount value
    let totalAmountValue = form.querySelector("#totalAmount").value;
    let numericValue = Number(totalAmountValue.replace(/,/g, ''));
    if (!isNaN(numericValue) && numericValue >= 1000) {
        totalAmountValue = numericValue.toLocaleString('en');
    }
    const causeValue = sanitizeInput(form.querySelector("#cause").value);

    // Validation
    if (!shipValue || !scenarioValue || !customerInfoValue || !totalAmountValue || !causeValue) {
        showError('Vui lòng điền đầy đủ thông tin');
        return;
    }

    // Generate timestamp
    const tempTimeStamp = new Date();
    const auth = getAuthState();
    
    const dataToUpload = {
        shipValue: shipValue,
        scenarioValue: scenarioValue,
        customerInfoValue: customerInfoValue,
        totalAmountValue: totalAmountValue,
        causeValue: causeValue,
        duyetHoanValue: tempTimeStamp.getTime().toString(),
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown',
        muted: false
    };

    showLoading("Đang thêm đơn hàng...");
    
    // Check if document exists then add data
    collectionRef.doc("hanghoan").get().then(doc => {
        const updateData = doc.exists ? 
            { ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload) } :
            { ["data"]: [dataToUpload] };

        const operation = doc.exists ? 
            collectionRef.doc("hanghoan").update(updateData) : 
            collectionRef.doc("hanghoan").set(updateData);

        return operation;
    }).then(function() {
        showSuccess("Đã thêm đơn hàng thành công!");
        console.log("Document uploaded successfully");
        
        // Log the add action
        logAction('add', `Thêm mới đơn hàng hoàn: ${customerInfoValue}`, null, dataToUpload);
        
        // Invalidate cache and refresh table
        invalidateCache();
        updateTable();
        
    }).catch(function(error) {
        console.error("Error uploading document: ", error);
        showError('Lỗi khi thêm đơn hàng');
    });
    
    updateSuggestions();
    form.reset();
}

// =====================================================
// TABLE EVENT HANDLERS (enhanced)
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener('click', function(e) {
        const auth = getAuthState();
        if (!auth || auth.checkLogin === '777') {
            if (e.target.type === 'checkbox') {
                e.target.checked = false;
                showError('Không có quyền thực hiện chức năng này');
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

    // Handle checkbox changes for moving rows
    tableBody.addEventListener("change", function(event) {
        const target = event.target;
        if (target.classList.contains("received-checkbox")) {
            const row = target.closest("tr");

            if (target.checked) {
                // Move row to bottom
                tableBody.appendChild(row);
            } else {
                // Insert row at top but maintain order of unchecked rows
                const firstUncheckedRow = [...tableBody.rows].find(r => !r.querySelector(".received-checkbox").checked);
                if (firstUncheckedRow) {
                    tableBody.insertBefore(row, firstUncheckedRow);
                } else {
                    tableBody.insertBefore(row, tableBody.firstElementChild);
                }
            }
        }
    });
}

function handleEditButton(e) {
    if (!hasPermission(1)) {
        showError('Không có quyền chỉnh sửa');
        return;
    }

    if (!editModal) return;

    editModal.style.display = 'block';

    const editDelivery = document.getElementById('editDelivery');
    const editScenario = document.getElementById('eidtScenario');
    const editInfo = document.getElementById('editInfo');
    const editAmount = document.getElementById('editAmount');
    const editNote = document.getElementById('editNote');
    const editDate = document.getElementById('editDate');

    const row = e.target.parentNode.parentNode;
    const selectedDelivery = row.cells[1].innerText;
    const selectScenario = row.cells[2].innerText;
    const info = row.cells[3].innerText;
    const amount = row.cells[4].innerText;
    const note = row.cells[5].innerText;
    const date = row.cells[7].innerText;

    if (editDelivery) editDelivery.value = selectedDelivery;
    if (editScenario) editScenario.value = selectScenario;
    if (editInfo) editInfo.value = info;
    if (editAmount) editAmount.value = amount;
    if (editNote) editNote.value = note;
    if (editDate) editDate.value = date;

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
    const tdRow = row.querySelector("td");
    
    if (!row || !tdRow) return;

    showLoading("Đang xóa đơn hàng...");

    const deleteData = {
        shipValue: row.cells[1].innerText,
        scenarioValue: row.cells[2].innerText,
        customerInfoValue: row.cells[3].innerText,
        totalAmountValue: row.cells[4].innerText,
        causeValue: row.cells[5].innerText,
        duyetHoanValue: tdRow.id
    };

    collectionRef.doc("hanghoan").get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Document does not exist');
            }

            const data = doc.data();
            const dataArray = data["data"] || [];
            
            const updatedArray = dataArray.filter(item => item.duyetHoanValue !== tdRow.id);
            
            return collectionRef.doc("hanghoan").update({ "data": updatedArray });
        })
        .then(() => {
            logAction('delete', `Xóa đơn hàng hoàn: ${deleteData.customerInfoValue}`, deleteData, null);
            invalidateCache();
            row.remove();
            showSuccess("Đã xóa đơn hàng thành công!");
        })
        .catch((error) => {
            console.error("Error deleting transaction:", error);
            showError("Lỗi khi xóa đơn hàng");
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
    const confirmationMessage = isChecked ? 
        'Bạn có chắc đơn này đã được nhận hàng hoàn?' : 
        'Đã hủy xác nhận nhận hàng hoàn';

    if (!confirm(confirmationMessage)) {
        e.target.checked = !isChecked;
        return;
    }

    showLoading("Đang cập nhật trạng thái...");
    
    row.style.opacity = isChecked ? '0.5' : '1.0';
    
    const tdRow = row.querySelector("td");
    const updateData = {
        customerInfoValue: row.cells[3].innerText,
        mutedStatus: !isChecked
    };
    
    const newUpdateData = {
        customerInfoValue: row.cells[3].innerText,
        mutedStatus: isChecked
    };

    collectionRef.doc("hanghoan").get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Document does not exist');
            }

            const data = doc.data();
            const dataArray = data["data"] || [];
            
            const itemIndex = dataArray.findIndex(item => item.duyetHoanValue === tdRow.id);
            if (itemIndex === -1) {
                throw new Error('Item not found');
            }
            
            dataArray[itemIndex].muted = isChecked;
            
            return collectionRef.doc("hanghoan").update({ "data": dataArray });
        })
        .then(() => {
            const actionDesc = isChecked ? 'Đánh dấu đã nhận hàng hoàn' : 'Hủy đánh dấu đã nhận hàng hoàn';
            logAction('update', `${actionDesc}: ${updateData.customerInfoValue}`, updateData, newUpdateData);
            
            invalidateCache();
            showSuccess("Đã cập nhật trạng thái thành công!");
            
            // Refresh table to show muted items at bottom
            setTimeout(() => {
                updateTable();
            }, 500);
        })
        .catch((error) => {
            console.error("Error updating status:", error);
            showError('Lỗi khi cập nhật trạng thái');
            // Revert on error
            row.style.opacity = isChecked ? '1.0' : '0.5';
            e.target.checked = !isChecked;
        });
}

// =====================================================
// MODAL FUNCTIONS (enhanced with better validation)
// =====================================================

function closeModal() {
    if (editModal) {
        editModal.style.display = 'none';
    }
    editingRow = null;
}

function saveChanges() {
    const editDelivery = document.getElementById('editDelivery');
    const editScenario = document.getElementById('eidtScenario');
    const editInfo = document.getElementById('editInfo');
    const editAmount = document.getElementById('editAmount');
    const editNote = document.getElementById('editNote');
    const editDate = document.getElementById('editDate');
    
    if (!editDelivery || !editScenario || !editInfo || !editAmount || !editNote || !editDate) {
        showError('Các trường nhập liệu không tồn tại.');
        return;
    }
    
    const deliveryValue = sanitizeInput(editDelivery.value);
    const scenarioValue = sanitizeInput(editScenario.value);
    const infoValue = sanitizeInput(editInfo.value.trim());
    const amountValue = editAmount.value.trim();
    const noteValue = sanitizeInput(editNote.value.trim());
    const dateValue = editDate.value;

    // Validation
    if (!isValidDateFormat(dateValue)) {
        showError('Nhập đúng định dạng ngày: DD-MM-YY');
        return;
    }

    if (!deliveryValue || !scenarioValue || !infoValue || !amountValue || !noteValue) {
        showError('Vui lòng điền đầy đủ thông tin bắt buộc.');
        return;
    }

    if (!editingRow) {
        showError('Không tìm thấy hàng cần chỉnh sửa.');
        return;
    }
    
    const tdRow = editingRow.querySelector("td");
    if (!tdRow || !tdRow.id) {
        showError('Không tìm thấy ID của đơn hàng.');
        return;
    }

    showLoading("Đang lưu thay đổi...");

    try {
        const editDateTimestamp = convertToTimestamp(dateValue);
        
        // Store old data for logging
        const oldData = {
            shipValue: editingRow.cells[1].innerText,
            scenarioValue: editingRow.cells[2].innerText,
            customerInfoValue: editingRow.cells[3].innerText,
            totalAmountValue: editingRow.cells[4].innerText,
            causeValue: editingRow.cells[5].innerText,
            duyetHoanValue: tdRow.id
        };
        
        const newData = {
            shipValue: deliveryValue,
            scenarioValue: scenarioValue,
            customerInfoValue: infoValue,
            totalAmountValue: amountValue,
            causeValue: noteValue,
            duyetHoanValue: editDateTimestamp
        };
        
        collectionRef.doc("hanghoan").get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error('Document does not exist');
                }

                const data = doc.data();
                const dataArray = data["data"] || [];
                
                const itemIndex = dataArray.findIndex(item => item.duyetHoanValue === tdRow.id);
                if (itemIndex === -1) {
                    throw new Error('Transaction not found');
                }

                const auth = getAuthState();
                
                // Update the item
                dataArray[itemIndex].shipValue = deliveryValue;
                dataArray[itemIndex].scenarioValue = scenarioValue;
                dataArray[itemIndex].customerInfoValue = infoValue;
                dataArray[itemIndex].totalAmountValue = amountValue;
                dataArray[itemIndex].causeValue = noteValue;
                dataArray[itemIndex].duyetHoanValue = editDateTimestamp;
                dataArray[itemIndex].user = auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown';
                
                return collectionRef.doc("hanghoan").update({ "data": dataArray });
            })
            .then(() => {
                // Update the row in the table
                editingRow.cells[1].innerText = deliveryValue;
                editingRow.cells[2].innerText = scenarioValue;
                editingRow.cells[3].innerText = infoValue;
                editingRow.cells[4].innerText = amountValue;
                editingRow.cells[5].innerText = noteValue;
                editingRow.cells[7].innerText = dateValue;
                
                logAction('edit', `Chỉnh sửa đơn hàng hoàn: ${infoValue}`, oldData, newData);
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                showError('Lỗi khi cập nhật dữ liệu');
            });
            
    } catch (error) {
        console.error('Error in saveChanges:', error);
        showError('Lỗi: ' + error.message);
    }
}

// =====================================================
// SUGGESTION SYSTEM (enhanced performance)
// =====================================================

function updateSuggestions() {
    if (!tableBody || tableBody.rows.length === 0) return;

    const uniqueValuesCause = new Set();
    const uniqueValuesInfo = new Set();

    // Use more efficient iteration
    const rows = tableBody.rows;
    for (let i = 0; i < Math.min(rows.length, MAX_VISIBLE_ROWS); i++) {
        const row = rows[i];
        if (row.cells && row.cells.length >= 6) {
            const cause = row.cells[5]?.textContent?.trim();
            const info = row.cells[3]?.textContent?.trim();
            if (cause) uniqueValuesCause.add(cause);
            if (info) uniqueValuesInfo.add(info);
        }
    }

    const createOptionsFragment = (values) => {
        const fragment = document.createDocumentFragment();
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            fragment.appendChild(option);
        });
        return fragment;
    };

    const dataListCause = document.getElementById('suggestionsCause');
    const dataListInfo = document.getElementById('suggestionsInfo');

    if (dataListCause) {
        dataListCause.innerHTML = '';
        dataListCause.appendChild(createOptionsFragment(uniqueValuesCause));
    }
    if (dataListInfo) {
        dataListInfo.innerHTML = '';
        dataListInfo.appendChild(createOptionsFragment(uniqueValuesInfo));
    }
}

// =====================================================
// FILTER EVENT HANDLERS (enhanced)
// =====================================================

function initializeFilterEvents() {
    // Listen for changes on all 4 filters
    const channelFilter = document.getElementById('channelFilter');
    const scenarioFilter = document.getElementById('scenarioFilter');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');

    if (channelFilter) channelFilter.addEventListener('change', debouncedUpdateTable);
    if (scenarioFilter) scenarioFilter.addEventListener('change', debouncedUpdateTable);
    if (startDate) startDate.addEventListener('change', handleDateChange);
    if (endDate) endDate.addEventListener('change', handleDateChange);
}

function handleDateChange() {
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');

    if (startDate && endDate && startDate.value && endDate.value) {
        debouncedUpdateTable();
    }
}

// =====================================================
// LOGOUT FUNCTION (enhanced)
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
// INITIALIZATION (enhanced)
// =====================================================

document.addEventListener("DOMContentLoaded", function() {
    // Check authentication
    if (!isAuthenticated()) {
        console.log('User not logged in - redirecting to login');
        window.location.href = '../index.html';
        return;
    }

    // Update UI based on user
    const auth = getAuthState();
    if (auth && auth.userType) {
        const titleElement = document.querySelector('.tieude');
        if (titleElement) {
            titleElement.textContent += ' - ' + auth.displayName;
        }
    }

    // Show main container
    const loginContainer = document.querySelector('.login-container');
    const parentContainer = document.getElementById('parentContainer');
    
    if (loginContainer) loginContainer.style.display = 'none';
    if (parentContainer) {
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
    }

    // Initialize components
    initializeForm();
    initializeTableEvents();
    initializeFilterEvents();
    updateTable();

    // Remove ads
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }

    console.log('Hang Hoan Management System initialized successfully');
});

// Event listeners for buttons
document.addEventListener('DOMContentLoaded', function() {
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    const saveButton = document.getElementById('saveButton');
    const clearDataButton = document.getElementById('clearDataButton');

    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    if (saveButton) {
        saveButton.addEventListener('click', saveChanges);
    }

    if (clearDataButton) {
        clearDataButton.addEventListener('click', function() {
            if (form) {
                form.reset();
                showSuccess('Đã xóa dữ liệu form');
            }
        });
    }
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

// Export functions for global use
window.closeModal = closeModal;
window.saveChanges = saveChanges;