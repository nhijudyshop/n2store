// Enhanced Inbox Management System with Secure Authentication
// Improved cache management, authentication system, and performance optimizations

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

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("ib");
const historyCollectionRef = db.collection("edit_history");

// File metadata for storage
const newMetadata = {
    cacheControl: 'public,max-age=31536000',
};

// Category constants
const ALL_CATEGORIES = 'all';
const CATEGORY_AO = 'Áo';
const CATEGORY_QUAN = 'Quần';
const CATEGORY_SET_DAM = 'Set và Đầm';
const CATEGORY_PKGD = 'PKGD';

// Global variables
let editingRow = null;
let sortOrder = 'newest';
let currentFilters = {
    category: ALL_CATEGORIES
};
let filterTimeout = null;
let isFilteringInProgress = false;
let imgArray = [];
let imgArrayKH = [];
let imageUrlFile = [];
let imageUrlFileKH = [];

// DOM Elements
const tbody = document.querySelector('tbody');
const inputFileRadio = document.getElementById('inputFile');
const inputLinkRadio = document.getElementById('inputLink');
const inputClipboardRadio = document.getElementById('inputClipboard');
const inputFileRadioKH = document.getElementById('inputFileKH');
const inputClipboardRadioKH = document.getElementById('inputClipboardKH');
const inputFileContainer = document.getElementById('inputFileContainer');
const inputLinkContainer = document.getElementById('inputLinkContainer');
const inputFileContainerKH = document.getElementById('inputFileContainerKH');
const inputClipboardContainer = document.getElementById('container');
const inputClipboardContainerKH = document.getElementById('containerKH');
const hinhAnhInputFile = document.getElementById('hinhAnhInputFile');
const hinhAnhInputFileKH = document.getElementById('hinhAnhInputFileKH');
const hinhAnhContainer = document.getElementById('hinhAnhContainer');
const hinhAnhContainerKH = document.getElementById('hinhAnhContainerKH');
const filterCategoryDropdown = document.getElementById('filterCategory');
const dataForm = document.getElementById('dataForm');

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
        
        // Fallback to legacy keys for backward compatibility
        const legacyLogin = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const legacyType = localStorage.getItem('userType') || sessionStorage.getItem('userType');
        const legacyCheck = localStorage.getItem('checkLogin') || sessionStorage.getItem('checkLogin');
        
        if (legacyLogin) {
            authState = {
                isLoggedIn: legacyLogin,
                userType: legacyType,
                checkLogin: legacyCheck,
                timestamp: Date.now()
            };
            setAuthState(legacyLogin, legacyType, legacyCheck);
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

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>\"']/g, '').trim();
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
// UTILITY FUNCTIONS
// =====================================================

function formatDate(date) {
    if (!date || !(date instanceof Date)) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
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
            background: rgba(0,0,0,0.9);
            color: white;
            border-radius: 12px;
            z-index: 10001;
            font-size: 14px;
            font-weight: 500;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            padding: 20px 30px;
            min-width: 200px;
            max-width: 350px;
            text-align: center;
            letter-spacing: 0.3px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #floatingAlert.loading {
                background: rgba(0,0,0,0.9);
                color: white;
            }
            
            #floatingAlert.show {
                opacity: 1 !important;
            }
            
            .loading-spinner {
                margin-right: 10px;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 1s ease-in-out infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            #loadingOverlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.3);
                z-index: 10000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                pointer-events: none !important;
            }
            
            #loadingOverlay.show {
                opacity: 1;
                visibility: visible;
                pointer-events: all !important;
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
        document.body.style.pointerEvents = 'none';
        alertBox.style.pointerEvents = 'all';
    } else {
        alertBox.classList.remove('loading');
        if (loadingOverlay) loadingOverlay.classList.remove('show');
        if (spinner) spinner.style.display = 'none';
        
        document.body.style.overflow = 'auto';
        document.body.style.cursor = 'default';
        document.body.style.pointerEvents = 'auto';
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
    const spinner = alertBox?.querySelector('.loading-spinner');
    
    if (alertBox) {
        alertBox.classList.remove('show', 'loading');
    }
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
    if (spinner) {
        spinner.style.display = 'none';
    }
    
    document.body.style.overflow = 'auto';
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Check Inbox Khách Hàng') {
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
// DATA MIGRATION
// =====================================================

async function migrateExistingData() {
    console.log("Starting migration...");
    try {
        const doc = await collectionRef.doc("ib").get();
        if (doc.exists) {
            const data = doc.data().data;
            let needsUpdate = false;
            
            const updatedData = data.map(item => {
                if (!item.id) {
                    item.id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    needsUpdate = true;
                }
                return item;
            });
            
            if (needsUpdate) {
                await collectionRef.doc("ib").update({ data: updatedData });
                console.log(`Migration completed: Added IDs for ${data.length} items`);
                invalidateCache();
                return true;
            } else {
                console.log("No migration needed - all items already have IDs");
                return false;
            }
        }
    } catch (error) {
        console.error("Migration error:", error);
        return false;
    }
}

// =====================================================
// FILTER SYSTEM
// =====================================================

function applyCategoryFilter() {
    const selectedCategory = filterCategoryDropdown.value;
    const rows = tbody.querySelectorAll('tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const categoryCell = row.cells[2];
        if (categoryCell) {
            const category = categoryCell.textContent.trim();
            const shouldShow = selectedCategory === ALL_CATEGORIES || category === selectedCategory;
            
            if (shouldShow) {
                row.style.display = '';
                visibleCount++;
                // Update row number
                row.cells[0].textContent = visibleCount;
            } else {
                row.style.display = 'none';
            }
        }
    });
}

// =====================================================
// TABLE MANAGEMENT
// =====================================================

function updateRowIndexes() {
    const visibleRows = tbody.querySelectorAll('tr[style=""], tr:not([style])');
    visibleRows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
}

function renderDataToTable(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log('No data to render');
        return;
    }
    
    // Sort data - newest first
    let processedDataArray = [...dataArray];
    if (sortOrder === 'newest') {
        processedDataArray = processedDataArray.reverse();
    }
    
    // Clear current table content
    tbody.innerHTML = '';
    
    for (let i = 0; i < Math.min(processedDataArray.length, MAX_VISIBLE_ROWS); i++) {
        const dataItem = processedDataArray[i];
        if (dataItem) {
            const row = tbody.insertRow();
            
            // Set ID attribute
            const itemId = dataItem.id || `fallback_${Date.now()}_${i}`;
            row.setAttribute('data-item-id', itemId);
            
            // Create cells
            const thuTuCell = row.insertCell();
            const thoiGianUploadCell = row.insertCell();
            const phanLoaiCell = row.insertCell();
            const hinhAnhCell = row.insertCell();
            const tenSanPhamCell = row.insertCell();
            const thongTinKhachHangCell = row.insertCell();
            const toggleVisibilityCell = row.insertCell();
            
            const auth = getAuthState();
            if (auth && auth.checkLogin == '777') {
                // Hide all cells for special user type
                [thuTuCell, thoiGianUploadCell, phanLoaiCell, hinhAnhCell, tenSanPhamCell, thongTinKhachHangCell].forEach(cell => {
                    cell.style.display = 'none';
                });
            } else {
                // Normal display
                thuTuCell.textContent = i + 1;
                thoiGianUploadCell.textContent = dataItem.thoiGianUpload || '';
                phanLoaiCell.textContent = dataItem.phanLoai || '';
                tenSanPhamCell.textContent = dataItem.tenSanPham || '';

                // SP images
                if (Array.isArray(dataItem.sp)) {
                    dataItem.sp.forEach((imgSrc, index) => {
                        const productImage = document.createElement('img');
                        productImage.src = imgSrc;
                        productImage.alt = dataItem.tenSanPham || 'Product image';
                        productImage.classList.add('product-image');
                        hinhAnhCell.appendChild(productImage);
                        if (index < dataItem.sp.length - 1) {
                            hinhAnhCell.appendChild(document.createTextNode(' '));
                        }
                    });
                } else if (dataItem.sp) {
                    const productImage = document.createElement('img');
                    productImage.src = dataItem.sp;
                    productImage.alt = dataItem.tenSanPham || 'Product image';
                    productImage.classList.add('product-image');
                    hinhAnhCell.appendChild(productImage);
                }

                // KH images
                if (Array.isArray(dataItem.kh)) {
                    dataItem.kh.forEach((imgSrc, index) => {
                        const customerImage = document.createElement('img');
                        customerImage.src = imgSrc;
                        customerImage.alt = "Hình ảnh khách hàng";
                        customerImage.classList.add('product-image');
                        thongTinKhachHangCell.appendChild(customerImage);
                        if (index < dataItem.kh.length - 1) {
                            thongTinKhachHangCell.appendChild(document.createTextNode(' '));
                        }
                    });
                } else if (dataItem.kh) {
                    const customerImage = document.createElement('img');
                    customerImage.src = dataItem.kh;
                    customerImage.alt = "Hình ảnh khách hàng";
                    customerImage.classList.add('product-image');
                    thongTinKhachHangCell.appendChild(customerImage);
                }
                
                // Delete button (only for admin)
                if (auth && auth.checkLogin == '0') {
                    const hideButton = document.createElement('button');
                    hideButton.className = 'toggle-visibility';
                    hideButton.innerHTML = '🗑️';
                    hideButton.id = dataItem.user || 'Unknown';
                    hideButton.onclick = () => deleteRow(row, hideButton);
                    toggleVisibilityCell.appendChild(hideButton);
                }
            }
        }
    }
    
    // Cache data after rendering
    setCachedData(processedDataArray);
}

function addProductToTable(dataItem) {
    const row = tbody.insertRow(0); // Insert at top for newest first
    
    // Set ID attribute
    const itemId = dataItem.id || `fallback_${Date.now()}`;
    row.setAttribute('data-item-id', itemId);
    
    const thuTuCell = row.insertCell();
    const thoiGianUploadCell = row.insertCell();
    const phanLoaiCell = row.insertCell();
    const hinhAnhCell = row.insertCell();
    const tenSanPhamCell = row.insertCell();
    const thongTinKhachHangCell = row.insertCell();
    const toggleVisibilityCell = row.insertCell();
    
    thuTuCell.textContent = '1';
    thoiGianUploadCell.textContent = dataItem.thoiGianUpload;
    phanLoaiCell.textContent = dataItem.phanLoai;
    tenSanPhamCell.textContent = dataItem.tenSanPham;
    
    // Add SP images
    if (Array.isArray(dataItem.sp)) {
        dataItem.sp.forEach((imgSrc, index) => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = dataItem.tenSanPham;
            img.classList.add('product-image');
            hinhAnhCell.appendChild(img);
            if (index < dataItem.sp.length - 1) {
                hinhAnhCell.appendChild(document.createTextNode(' '));
            }
        });
    } else {
        const img = document.createElement('img');
        img.src = dataItem.sp;
        img.alt = dataItem.tenSanPham;
        img.classList.add('product-image');
        hinhAnhCell.appendChild(img);
    }
    
    // Add KH images
    if (Array.isArray(dataItem.kh)) {
        dataItem.kh.forEach((imgSrc, index) => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = "Hình ảnh khách hàng";
            img.classList.add('product-image');
            thongTinKhachHangCell.appendChild(img);
            if (index < dataItem.kh.length - 1) {
                thongTinKhachHangCell.appendChild(document.createTextNode(' '));
            }
        });
    } else {
        const img = document.createElement('img');
        img.src = dataItem.kh;
        img.alt = "Hình ảnh khách hàng";
        img.classList.add('product-image');
        thongTinKhachHangCell.appendChild(img);
    }
    
    // Add delete button if authorized
    const auth = getAuthState();
    if (auth && auth.checkLogin == '0') {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'toggle-visibility';
        deleteButton.innerHTML = '🗑️';
        deleteButton.id = dataItem.user;
        deleteButton.onclick = () => deleteRow(row, deleteButton);
        toggleVisibilityCell.appendChild(deleteButton);
    }
    
    // Update all row numbers
    updateRowIndexes();
}

// =====================================================
// DELETE FUNCTION
// =====================================================

function deleteRow(row, button) {
    if (!hasPermission(0)) {
        alert("Bạn không đủ quyền để thực hiện thao tác này");
        return;
    }

    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
    if (!confirmDelete) return;

    // Get ID from attribute
    const itemId = row.getAttribute('data-item-id');
    
    if (!itemId) {
        console.error("Cannot find item ID");
        showError("Lỗi: Không tìm thấy ID của item để xóa!");
        return;
    }

    // Get data for logging
    const oldData = {
        id: itemId,
        tenSanPham: row.cells[4]?.textContent || '',
        phanLoai: row.cells[2]?.textContent || '',
        thoiGianUpload: row.cells[1]?.textContent || '',
        user: button.id || ''
    };

    console.log("Deleting item with ID:", itemId);
    showLoading("Đang xóa...");
    
    collectionRef.doc("ib").get()
        .then((doc) => {
            if (doc.exists) {
                let data = doc.data().data.slice();
                
                // Find index based on ID
                const indexToDelete = data.findIndex(item => item.id === itemId);
                
                if (indexToDelete !== -1) {
                    console.log(`Found item at index ${indexToDelete}, deleting...`);
                    
                    // Remove item from array
                    data.splice(indexToDelete, 1);

                    // Update Firestore
                    return collectionRef.doc("ib").update({
                        data: data
                    });
                } else {
                    throw new Error("Cannot find item with ID: " + itemId);
                }
            } else {
                throw new Error("Document does not exist");
            }
        })
        .then(() => {
            // Log action
            logAction('delete', `Xóa inbox "${oldData.tenSanPham}" - ${oldData.phanLoai}`, oldData, null);

            // Clear cache and refresh UI
            invalidateCache();
            
            // Remove row from table
            row.remove();
            
            // Update row indexes
            updateRowIndexes();
            
            showSuccess("Đã xóa thành công!");
        })
        .catch((error) => {
            console.error("Error deleting:", error);
            showError("Lỗi khi xóa: " + error.message);
        });
}

// =====================================================
// DATA LOADING
// =====================================================

function addImagesFromStorage() {
    // Check cache first
    const cachedData = getCachedData();
    if (cachedData) {
        showLoading("Sử dụng dữ liệu cache...");
        setTimeout(() => {
            renderDataToTable(cachedData);
            hideFloatingAlert();
            showSuccess("Tải dữ liệu từ cache hoàn tất!");
        }, 100);
        return;
    }

    showLoading("Đang tải dữ liệu từ server...");
    
    collectionRef.doc("ib").get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    renderDataToTable(data.data);
                    setCachedData(data.data);
                    showSuccess("Tải dữ liệu hoàn tất!");
                } else {
                    showError("Không có dữ liệu");
                }
            } else {
                console.log("Document does not exist.");
                showError("Tài liệu không tồn tại");
            }
        })
        .catch((error) => {
            console.error("Error getting data:", error);
            showError("Lỗi khi tải dữ liệu");
        });
}

function forceRefreshData() {
    invalidateCache();
    addImagesFromStorage();
}

function displayAll() {
    addImagesFromStorage();
}

// =====================================================
// IMAGE HANDLING FUNCTIONS
// =====================================================

function compressImage(file, maxWidth = 500) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const width = img.width;
                const height = img.height;

                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    canvas.width = maxWidth;
                    canvas.height = height * ratio;
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function(blob) {
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, file.type, 0.8);
            };
        };
    });
}

function uploadProductFiles(files, phanLoai, tenSanPham, formattedTime, newInboxData) {
    const imagesRef = storageRef.child('ib/sp');
    const uploadPromises = [];

    function uploadImage(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const compressedFile = await compressImage(file);
                const imageRef = imagesRef.child(file.name + generateUniqueFileName());
                const uploadTask = imageRef.put(compressedFile, newMetadata);

                uploadTask.on(
                    'state_changed',
                    function(snapshot) {},
                    function(error) {
                        reject(error);
                    },
                    function() {
                        uploadTask.snapshot.ref
                            .getDownloadURL()
                            .then(function(downloadURL) {
                                imageUrlFile.push(downloadURL);
                                resolve();
                            })
                            .catch(function(error) {
                                reject(error);
                            });
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    for (const hinhAnh of files) {
        uploadPromises.push(uploadImage(hinhAnh));
    }

    Promise.all(uploadPromises)
        .then(() => {
            newInboxData.sp = imageUrlFile;
            handleCustomerData(imageUrlFile, phanLoai, tenSanPham, formattedTime, newInboxData);
        })
        .catch((error) => {
            console.error("Error uploading product images:", error);
            showError("Lỗi khi tải ảnh sản phẩm lên!");
            document.getElementById("addButton").disabled = false;
        });
}

function uploadProductClipboard(imgArray, phanLoai, tenSanPham, formattedTime, newInboxData) {
    const giaTriText = [];
    let uploadedCount = 0;
    
    imgArray.forEach(function(file, index) {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child('ib/sp/' + imageName);
        const uploadTask = imageRef.put(file, newMetadata);

        uploadTask.on('state_changed',
            function(snapshot) {},
            function(error) {
                console.error("Upload error: ", error);
                showError("Lỗi tải lên sản phẩm!");
                document.getElementById("addButton").disabled = false;
            },
            function() {
                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                    giaTriText.push(downloadURL);
                    uploadedCount++;

                    if (uploadedCount === imgArray.length) {
                        newInboxData.sp = giaTriText;
                        handleCustomerData(giaTriText, phanLoai, tenSanPham, formattedTime, newInboxData);
                    }
                });
            }
        );
    });
}

function uploadCustomerFiles(files, productImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData) {
    const imagesRef = storageRef.child('ib/kh');
    const uploadPromises = [];

    function uploadImage(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const compressedFile = await compressImage(file);
                const imageRef = imagesRef.child(file.name + generateUniqueFileName());
                const uploadTask = imageRef.put(compressedFile, newMetadata);

                uploadTask.on(
                    'state_changed',
                    function(snapshot) {},
                    function(error) {
                        reject(error);
                    },
                    function() {
                        uploadTask.snapshot.ref
                            .getDownloadURL()
                            .then(function(downloadURL) {
                                imageUrlFileKH.push(downloadURL);
                                resolve();
                            })
                            .catch(function(error) {
                                reject(error);
                            });
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    for (const hinhAnh of files) {
        uploadPromises.push(uploadImage(hinhAnh));
    }

    Promise.all(uploadPromises)
        .then(() => {
            newInboxData.kh = imageUrlFileKH;
            uploadToFirestore(productImageUrl, imageUrlFileKH, phanLoai, tenSanPham, formattedTime, newInboxData);
        })
        .catch((error) => {
            console.error("Error uploading customer images:", error);
            showError("Lỗi khi tải ảnh khách hàng lên!");
            document.getElementById("addButton").disabled = false;
        });
}

function uploadCustomerClipboard(imgArrayKH, productImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData) {
    const giaTriKHText = [];
    let uploadedCount = 0;

    imgArrayKH.forEach(function(file, index) {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child('ib/kh/' + imageName);
        const uploadTask = imageRef.put(file, newMetadata);

        uploadTask.then((snapshot) => {
            snapshot.ref.getDownloadURL().then(function(downloadURL) {
                giaTriKHText.push(downloadURL);
                uploadedCount++;
                
                if (uploadedCount === imgArrayKH.length) {
                    newInboxData.kh = giaTriKHText;
                    uploadToFirestore(productImageUrl, giaTriKHText, phanLoai, tenSanPham, formattedTime, newInboxData);
                }
            });
        })
        .catch(function(error) {
            console.error("Customer upload error: ", error);
            showError("Lỗi tải lên ảnh khách hàng!");
            document.getElementById("addButton").disabled = false;
        });
    });
}

function handleCustomerData(productImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData) {
    // Handle customer clipboard
    if (inputClipboardRadioKH && inputClipboardRadioKH.checked) {
        // Check if customer URL was pasted
        if (window.isUrlPastedKH && window.pastedImageUrlKH) {
            const customerImageUrl = [window.pastedImageUrlKH];
            newInboxData.kh = customerImageUrl;
            uploadToFirestore(productImageUrl, customerImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData);
            return;
        }
        
        // Upload from imgArrayKH
        if (imgArrayKH.length > 0) {
            uploadCustomerClipboard(imgArrayKH, productImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData);
        } else {
            showError("Vui lòng dán hình ảnh khách hàng!");
            document.getElementById("addButton").disabled = false;
        }
    } 
    // Handle customer files
    else if (inputFileRadioKH && inputFileRadioKH.checked) {
        const hinhAnhFilesKH = hinhAnhInputFileKH.files;
        if (hinhAnhFilesKH.length === 0) {
            showError('Vui lòng chọn file hình ảnh khách hàng!');
            document.getElementById("addButton").disabled = false;
            return;
        }
        
        uploadCustomerFiles(hinhAnhFilesKH, productImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData);
    } else {
        showError('Vui lòng chọn phương thức nhập hình ảnh khách hàng!');
        document.getElementById("addButton").disabled = false;
    }
}

function uploadToFirestore(productImageUrl, customerImageUrl, phanLoai, tenSanPham, formattedTime, newInboxData) {
    // Create unique ID for new item
    const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const auth = getAuthState();
    const dataToUpload = {
        id: uniqueId,
        cellShow: true,
        phanLoai: phanLoai,
        tenSanPham: tenSanPham,
        thoiGianUpload: formattedTime,
        sp: productImageUrl,
        kh: customerImageUrl,
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown'
    };

    // Add ID to newInboxData for logging
    newInboxData.id = uniqueId;

    collectionRef.doc("ib").get().then((doc) => {
        const operation = doc.exists ? 
            collectionRef.doc("ib").update({
                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
            }) :
            collectionRef.doc("ib").set({
                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
            });

        return operation;
    })
    .then(function() {
        // Log the action
        logAction('add', `Thêm inbox mới "${tenSanPham}" - ${phanLoai}`, null, newInboxData);
        
        // Invalidate cache after successful addition
        invalidateCache();
        
        console.log("Document uploaded successfully with ID:", uniqueId);
        showSuccess("Thành công!");
        
        // Add to table directly
        addProductToTable(dataToUpload);
        
        document.getElementById("addButton").disabled = false;
        clearData();
    })
    .catch(function(error) {
        showError("Lỗi khi tải lên Firestore...");
        console.error("Error uploading document: ", error);
        document.getElementById("addButton").disabled = false;
    });
}

// =====================================================
// CLIPBOARD HANDLING
// =====================================================

function initializeClipboardHandlers() {
    // SP clipboard handler
    if (inputClipboardContainer) {
        inputClipboardContainer.addEventListener('paste', async function(e) {
            if (inputClipboardRadio && inputClipboardRadio.checked) {
                imgArray = [];
                window.pastedImageUrl = null;
                window.isUrlPasted = false;
                e.preventDefault();
                
                // Check for text (URL) first
                const text = e.clipboardData.getData('text');
                if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
                    try {
                        // Clear old content
                        inputClipboardContainer.innerHTML = "";
                        
                        // Create img from URL for preview
                        const imgElement = document.createElement("img");
                        imgElement.src = text;
                        imgElement.classList.add('clipboard-image');
                        imgElement.onload = function() {
                            console.log("URL image preview loaded successfully");
                        };
                        imgElement.onerror = function() {
                            console.error("Failed to load image preview from URL");
                            imgElement.alt = "Image preview (may have CORS issues)";
                        };
                        inputClipboardContainer.appendChild(imgElement);
                        
                        // Save URL for use when submitting
                        window.pastedImageUrl = text;
                        window.isUrlPasted = true;
                        
                        console.log("URL pasted and saved:", text);
                        return;
                        
                    } catch (error) {
                        console.error('Error handling image URL:', error);
                    }
                }
                
                // Handle image data from clipboard
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                let hasImageData = false;
                
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        hasImageData = true;
                        const blob = items[i].getAsFile();
                        const file = new File([blob], "imageSP.jpg");

                        // Create img element
                        const imgElement = document.createElement("img");
                        imgElement.src = URL.createObjectURL(file);
                        imgElement.classList.add('clipboard-image');

                        // Add img element to div
                        inputClipboardContainer.appendChild(imgElement);

                        const compressedFile = await compressImage(file);
                        imgArray.push(compressedFile);
                        window.isUrlPasted = false;
                        console.log("Image file processed and added to imgArray");
                        break;
                    }
                }
                
                if (!hasImageData && !window.pastedImageUrl) {
                    console.log("No image data or URL found in clipboard");
                }
            }
        });
    }

    // KH clipboard handler
    if (inputClipboardContainerKH) {
        inputClipboardContainerKH.addEventListener('paste', async function(e) {
            if (inputClipboardRadioKH && inputClipboardRadioKH.checked) {
                imgArrayKH = [];
                window.pastedImageUrlKH = null;
                window.isUrlPastedKH = false;
                e.preventDefault();
                
                // Check for text (URL) first
                const text = e.clipboardData.getData('text');
                if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
                    try {
                        // Clear old content
                        inputClipboardContainerKH.innerHTML = "";
                        
                        // Create img from URL for preview
                        const imgElement = document.createElement("img");
                        imgElement.src = text;
                        imgElement.classList.add('clipboard-image');
                        imgElement.onload = function() {
                            console.log("KH URL image preview loaded successfully");
                        };
                        imgElement.onerror = function() {
                            console.error("Failed to load KH image preview from URL");
                            imgElement.alt = "Image preview (may have CORS issues)";
                        };
                        inputClipboardContainerKH.appendChild(imgElement);
                        
                        // Save URL for use when submitting
                        window.pastedImageUrlKH = text;
                        window.isUrlPastedKH = true;
                        
                        console.log("KH URL pasted and saved:", text);
                        return;
                        
                    } catch (error) {
                        console.error('Error handling KH image URL:', error);
                    }
                }
                
                // Handle image data from clipboard
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                let hasImageData = false;
                
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        hasImageData = true;
                        const blob = items[i].getAsFile();
                        const file = new File([blob], "imageKH.jpg");

                        // Create img element
                        const imgElement = document.createElement("img");
                        imgElement.src = URL.createObjectURL(file);
                        imgElement.classList.add('clipboard-image');

                        // Add img element to div
                        inputClipboardContainerKH.appendChild(imgElement);

                        const compressedFile = await compressImage(file);
                        imgArrayKH.push(compressedFile);
                        window.isUrlPastedKH = false;
                        console.log("KH Image file processed and added to imgArrayKH");
                        break;
                    }
                }
                
                if (!hasImageData && !window.pastedImageUrlKH) {
                    console.log("No KH image data or URL found in clipboard");
                }
            }
        });
    }
}

// =====================================================
// FORM HANDLING
// =====================================================

function initializeForm() {
    // Toggle form button
    const toggleFormButton = document.getElementById('toggleFormButton');
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', function() {
            if (hasPermission(3)) {
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
    const dataFormElement = document.getElementById('dataForm');
    if (dataFormElement) {
        dataFormElement.addEventListener('submit', handleFormSubmit);
    }

    // Clear form button
    const clearDataButton = document.getElementById('clearDataButton');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', clearData);
    }

    // Radio button handlers
    if (inputFileRadio) {
        inputFileRadio.addEventListener('change', function() {
            if (inputFileContainer) inputFileContainer.style.display = 'block';
            if (inputLinkContainer) inputLinkContainer.style.display = 'none';
            if (inputClipboardContainer) inputClipboardContainer.style.display = 'none';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'none';
        });
    }

    if (inputLinkRadio) {
        inputLinkRadio.addEventListener('change', function() {
            if (inputFileContainer) inputFileContainer.style.display = 'none';
            if (inputLinkContainer) inputLinkContainer.style.display = 'block';
            if (inputClipboardContainer) inputClipboardContainer.style.display = 'none';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'block';
        });
    }

    if (inputClipboardRadio) {
        inputClipboardRadio.addEventListener('change', function() {
            if (inputFileContainer) inputFileContainer.style.display = 'none';
            if (inputLinkContainer) inputLinkContainer.style.display = 'none';
            if (inputClipboardContainer) inputClipboardContainer.style.display = 'block';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'none';
        });
    }

    if (inputFileRadioKH) {
        inputFileRadioKH.addEventListener('change', function() {
            if (inputFileContainerKH) inputFileContainerKH.style.display = 'block';
            if (inputClipboardContainerKH) inputClipboardContainerKH.style.display = 'none';
        });
    }

    if (inputClipboardRadioKH) {
        inputClipboardRadioKH.addEventListener('change', function() {
            if (inputFileContainerKH) inputFileContainerKH.style.display = 'none';
            if (inputClipboardContainerKH) inputClipboardContainerKH.style.display = 'block';
        });
    }

    // Link input handler
    const hinhAnhInputLink = document.getElementById('hinhAnhInputLink');
    if (hinhAnhInputLink) {
        hinhAnhInputLink.addEventListener('click', function(event) {
            // Create new input field
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.id = 'hinhAnhInput';
            newInput.accept = 'image/*';

            // Add new input field to container
            if (hinhAnhContainer) {
                hinhAnhContainer.appendChild(newInput);
            }
        });
    }

    // Category filter
    if (filterCategoryDropdown) {
        filterCategoryDropdown.addEventListener('change', applyCategoryFilter);
    }

    // Hide input fields initially
    if (inputLinkContainer) inputLinkContainer.style.display = 'none';
    if (inputFileContainer) inputFileContainer.style.display = 'none';
    if (inputFileContainerKH) inputFileContainerKH.style.display = 'none';
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!hasPermission(3)) {
        showError('Không có quyền thêm inbox');
        return;
    }
    
    const addButton = document.getElementById("addButton");
    if (addButton) addButton.disabled = true;
    
    const phanLoai = document.getElementById('phanLoai')?.value;
    const hinhAnhInput = document.getElementById('hinhAnhInput');
    const tenSanPham = document.getElementById('tenSanPham')?.value;

    if (!phanLoai || !tenSanPham) {
        showError('Vui lòng điền đầy đủ thông tin.');
        if (addButton) addButton.disabled = false;
        return;
    }

    const thoiGianUpload = new Date();
    const formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    const auth = getAuthState();
    const newInboxData = {
        phanLoai: phanLoai,
        tenSanPham: tenSanPham,
        thoiGianUpload: formattedTime,
        user: auth ? (auth.userType ? auth.userType.split('-')[0] : 'Unknown') : 'Unknown'
    };

    // Handle link input
    if (inputLinkRadio && inputLinkRadio.checked) {
        if (!hinhAnhInput || !hinhAnhInput.value) {
            showError('Nhập URL hình ảnh sản phẩm!');
            if (addButton) addButton.disabled = false;
            return;
        }

        if (!hinhAnhInput.value.startsWith("https://")) {
            showError('Sai định dạng link');
            if (addButton) addButton.disabled = false;
            return;
        }

        showLoading("Đang xử lý...");

        const inputs = hinhAnhContainer ? hinhAnhContainer.querySelectorAll('input[type="text"]') : [];
        const giaTriText = [];
        inputs.forEach(function(input) {
            if (input.value !== "") {
                giaTriText.push(input.value);
            }
        });

        const imageUrl = giaTriText;
        newInboxData.sp = imageUrl;

        handleCustomerData(imageUrl, phanLoai, tenSanPham, formattedTime, newInboxData);
    } 
    // Handle product file upload
    else if (inputFileRadio && inputFileRadio.checked) {
        showLoading("Đang tải lên...");

        const hinhAnhFiles = hinhAnhInputFile ? hinhAnhInputFile.files : null;
        if (!hinhAnhFiles || hinhAnhFiles.length === 0) {
            showError('Vui lòng chọn file hình ảnh!');
            if (addButton) addButton.disabled = false;
            return;
        }

        uploadProductFiles(hinhAnhFiles, phanLoai, tenSanPham, formattedTime, newInboxData);
    } 
    // Handle product clipboard
    else if (inputClipboardRadio && inputClipboardRadio.checked) {
        // Check if URL was pasted
        if (window.isUrlPasted && window.pastedImageUrl) {
            showLoading("Đang xử lý URL sản phẩm...");
            
            const imageUrl = [window.pastedImageUrl];
            newInboxData.sp = imageUrl;
            handleCustomerData(imageUrl, phanLoai, tenSanPham, formattedTime, newInboxData);
            return;
        }
        
        // Handle normal file upload (when copying image)
        if (imgArray.length > 0) {
            showLoading("Đang tải lên hình sản phẩm...");
            uploadProductClipboard(imgArray, phanLoai, tenSanPham, formattedTime, newInboxData);
        } else {
            showError("Vui lòng dán hình ảnh sản phẩm!");
            if (addButton) addButton.disabled = false;
        }
    }
}

function clearData() {
    imgArray = [];
    imgArrayKH = [];
    imageUrlFile = [];
    imageUrlFileKH = [];
    window.pastedImageUrl = null;
    window.isUrlPasted = false;
    window.pastedImageUrlKH = null;
    window.isUrlPastedKH = false;

    const tenSanPham = document.getElementById('tenSanPham');
    if (tenSanPham) tenSanPham.value = '';
    
    if (hinhAnhInputFile) hinhAnhInputFile.value = '';
    if (hinhAnhInputFileKH) hinhAnhInputFileKH.value = '';

    // Clear link inputs
    if (hinhAnhContainer) {
        const resetInputLinks = hinhAnhContainer.querySelectorAll('input');
        resetInputLinks.forEach(function(input) {
            hinhAnhContainer.removeChild(input);
        });
    }

    // Clear SP clipboard images
    if (inputClipboardContainer) {
        const imagesToRemoveSP = inputClipboardContainer.querySelectorAll('img');
        imagesToRemoveSP.forEach(function(image) {
            inputClipboardContainer.removeChild(image);
        });
    }

    // Clear KH clipboard images
    if (inputClipboardContainerKH) {
        const imagesToRemoveKH = inputClipboardContainerKH.querySelectorAll('img');
        imagesToRemoveKH.forEach(function(image) {
            inputClipboardContainerKH.removeChild(image);
        });
    }
}

// =====================================================
// TABLE INTERACTIONS
// =====================================================

function initializeTableInteractions() {
    if (!tbody) return;

    // Tooltip functionality
    tbody.addEventListener('click', function(e) {
        const auth = getAuthState();
        if (auth && auth.checkLogin == '0') {
            const tooltip = document.getElementById("tooltip");
            const row = e.target.closest("tr");
            if (!row || !tooltip) return;

            const deleteButton = row.querySelector(".toggle-visibility");
            const value = deleteButton ? deleteButton.id : "Không có nút xóa";

            tooltip.textContent = value;
            tooltip.style.display = "block";
            tooltip.style.top = e.pageY + 10 + "px";
            tooltip.style.left = e.pageX + 10 + "px";

            setTimeout(() => {
                tooltip.style.display = "none";
            }, 1000);
        }
    });
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
// INITIALIZATION
// =====================================================

async function initializeWithMigration() {
    // Run migration first
    const migrationNeeded = await migrateExistingData();
    
    if (migrationNeeded) {
        // If migration needed, wait a bit then load data
        setTimeout(() => {
            displayAll();
        }, 1000);
    } else {
        // No migration needed, load data immediately
        displayAll();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log('User not authenticated, redirecting...');
        window.location.href = '../index.html';
        return;
    }

    console.log('User authenticated:', auth);

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

    // Initialize all components
    initializeForm();
    initializeClipboardHandlers();
    initializeTableInteractions();
    
    // Initialize with migration and display
    initializeWithMigration();
    
    // Add logout button event listener
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    // Add refresh button functionality
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Làm mới dữ liệu';
    refreshButton.onclick = forceRefreshData;
    refreshButton.style.cssText = `
        margin-left: 10px;
        padding: 8px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.3s ease;
    `;
    refreshButton.addEventListener('mouseover', function() {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
    });
    refreshButton.addEventListener('mouseout', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = 'none';
    });
    
    if (parentContainer) {
        parentContainer.appendChild(refreshButton);
    }

    // Remove ads
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }

    console.log('Enhanced Inbox Management System initialized successfully');
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

// Performance monitoring
window.addEventListener('load', function() {
    // Remove ads on load as well
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }
    
    // Log performance metrics
    if (performance && performance.timing) {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log('Page load time:', loadTime + 'ms');
    }
});

// Cleanup function for memory management
function cleanup() {
    invalidateCache();
    imgArray = [];
    imgArrayKH = [];
    imageUrlFile = [];
    imageUrlFileKH = [];
    window.pastedImageUrl = null;
    window.isUrlPasted = false;
    window.pastedImageUrlKH = null;
    window.isUrlPastedKH = false;
}

// Call cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Export key functions for debugging
if (typeof window !== 'undefined') {
    window.inboxDebug = {
        getAuthState,
        getCachedData,
        invalidateCache,
        forceRefreshData,
        showLoading,
        showSuccess,
        showError
    };
}