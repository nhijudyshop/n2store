// Enhanced Inventory Management System - Fixed Version
// Security and performance improvements

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

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_KEY = 'hangrotxa_data_cache';
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Reduced limit
const FILTER_DEBOUNCE_DELAY = 500; // Increased delay

// Add CSS to hide number input spinners globally
const hideSpinnerStyles = `
<style>
/* Hide number input spinners for all browsers */
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

input[type=number] {
    -moz-appearance: textfield;
    appearance: none;
}

/* Style for quantity inputs */
input[type=number].quantity-input {
    width: 60px;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
    text-align: center;
}
</style>
`;

// Add styles to head if not already present
if (!document.getElementById('hideSpinnerStyles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'hideSpinnerStyles';
    styleElement.innerHTML = hideSpinnerStyles;
    document.head.appendChild(styleElement);
}

// In-memory cache object (replaces localStorage)
let memoryCache = {
    data: null,
    timestamp: null
};

// Create file metadata to update
var newMetadata = {
    cacheControl: 'public,max-age=31536000',
}

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("hangrotxa");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const tbody = document.getElementById('productTableBody');
const inputFileRadio = document.getElementById('inputFile');
const inputLinkRadio = document.getElementById('inputLink');
const inputClipboardRadio = document.getElementById('inputClipboard');
const inputFileContainer = document.getElementById('inputFileContainer');
const inputLinkContainer = document.getElementById('inputLinkContainer');
const inputClipboardContainer = document.getElementById('container');
const hinhAnhInputFile = document.getElementById('hinhAnhInputFile');
const hinhAnhInputLink = document.getElementById('hinhAnhInputLink');
const hinhAnhContainer = document.getElementById('hinhAnhContainer');
const dotLiveInput = document.getElementById('dotLive');
const dateFilterDropdown = document.getElementById('dateFilter');
const filterCategorySelect = document.getElementById('filterCategory');

// Global variables
var imageUrlFile = []; // Mảng để lưu trữ URL tải về
var imgArray = [];
let editingRow = null;
let currentFilters = {
    category: 'all',
    dotLive: 'all'
};
let filterTimeout = null;
let isFilteringInProgress = false;

// =====================================================
// AUTHENTICATION SYSTEM (Enhanced like file 3)
// =====================================================

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = 'loginindex_auth';
let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }
        
        // Fallback to legacy system for compatibility
        const legacyLogin = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const legacyUserType = localStorage.getItem('userType') || sessionStorage.getItem('userType');
        const legacyCheckLogin = localStorage.getItem('checkLogin') || sessionStorage.getItem('checkLogin');
        
        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now()
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
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
        clearLegacyAuth();
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}

function clearLegacyAuth() {
    // Clear legacy keys
    try {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType'); 
        localStorage.removeItem('checkLogin');
        sessionStorage.clear();
    } catch (error) {
        console.error('Error clearing legacy auth:', error);
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

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split('-')[0] : 'Unknown';
}

// =====================================================
// ENHANCED CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached data - will sort before rendering");
                // LUÔN SẮP XẾP DỮ LIỆU CACHE TRƯỚC KHI TRẢ VỀ
                return sortDataByNewest([...memoryCache.data]);
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
        // LƯU DỮ LIỆU ĐÃ ĐƯỢC SẮP XẾP VÀO CACHE
        const sortedData = sortDataByNewest([...data]);
        memoryCache.data = sortedData;
        memoryCache.timestamp = Date.now();
        console.log("Data sorted and cached successfully");
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

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>\"'&]/g, '').trim(); // Enhanced XSS protection
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

// Debounced function factory
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

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Hàng rớt - xả') {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    // Save to Firebase
    historyCollectionRef.add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// SORTING FUNCTIONS
// =====================================================

function sortDataByNewest(dataArray) {
    if (!Array.isArray(dataArray)) return dataArray;
    
    return dataArray.sort((a, b) => {
        // Sắp xếp theo ĐỢT LIVE (cao nhất trước)
        const dotLiveA = parseInt(a.dotLive) || 0;
        const dotLiveB = parseInt(b.dotLive) || 0;
        
        // Nếu ĐỢT LIVE khác nhau, sắp xếp theo ĐỢT LIVE (cao nhất trước)
        if (dotLiveA !== dotLiveB) {
            return dotLiveB - dotLiveA;
        }
        
        // Nếu ĐỢT LIVE giống nhau, sắp xếp theo thời gian upload (mới nhất trước)
        const timeA = parseVietnameseDate(a.thoiGianUpload);
        const timeB = parseVietnameseDate(b.thoiGianUpload);
        
        // Nếu không parse được thời gian, sử dụng ID (mới hơn có timestamp lớn hơn)
        if (!timeA && !timeB) {
            // Fallback to ID comparison (newer IDs have larger timestamps)
            const timestampA = extractTimestampFromId(a.id);
            const timestampB = extractTimestampFromId(b.id);
            return timestampB - timestampA;
        }
        
        if (!timeA) return 1; // a không có thời gian, đẩy xuống
        if (!timeB) return -1; // b không có thời gian, đẩy xuống
        
        return timeB - timeA; // Mới nhất trước
    });
}

// Helper function to parse Vietnamese date format
function parseVietnameseDate(dateString) {
    if (!dateString) return null;
    
    try {
        // Format: "dd/mm/yyyy, hh:mm" hoặc "dd-mm-yyyy, hh:mm" hoặc các variant khác
        const cleanDateString = dateString.replace(/,?\s*/g, ' ').trim();
        
        // Thử các pattern khác nhau
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/, // dd/mm/yyyy hh:mm
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // dd/mm/yyyy
        ];
        
        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                // Tạo Date object (month - 1 vì JavaScript month bắt đầu từ 0)
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                               parseInt(hour), parseInt(minute));
            }
        }
        
        // Nếu không match pattern nào, thử parse trực tiếp
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
        
    } catch (error) {
        console.warn('Error parsing date:', dateString, error);
        return null;
    }
}

// Helper function to extract timestamp from ID
function extractTimestampFromId(id) {
    if (!id || !id.startsWith('id_')) return 0;
    
    try {
        const parts = id.split('_');
        if (parts.length >= 2) {
            // Convert from base36 back to timestamp
            return parseInt(parts[1], 36);
        }
    } catch (error) {
        console.warn('Error extracting timestamp from ID:', id, error);
    }
    
    return 0;
}

// =====================================================
// ID GENERATION SYSTEM
// =====================================================

function generateUniqueID() {
    // Tạo ID duy nhất dựa trên timestamp và random
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `id_${timestamp}_${random}`;
}

// MIGRATION FUNCTION (Chạy 1 lần duy nhất)
async function migrateDataWithIDs() {
    try {
        showFloatingAlert("Đang kiểm tra và migration dữ liệu...", true);
        
        const doc = await collectionRef.doc("hangrotxa").get();
        
        if (!doc.exists) {
            console.log("Không có dữ liệu để migrate");
            hideFloatingAlert();
            return;
        }
        
        const data = doc.data();
        if (!Array.isArray(data.data)) {
            console.log("Dữ liệu không hợp lệ");
            hideFloatingAlert();
            return;
        }
        
        let hasChanges = false;
        const migratedData = data.data.map(item => {
            // Chỉ thêm ID nếu chưa có
            if (!item.id) {
                hasChanges = true;
                return {
                    ...item,
                    id: generateUniqueID() // Tạo ID mới
                };
            }
            return item;
        });
        
        if (hasChanges) {
            // SẮP XẾP DỮ LIỆU SAU MIGRATION (mới nhất trước)
            const sortedMigratedData = sortDataByNewest(migratedData);
            
            // Cập nhật dữ liệu với ID mới đã được sắp xếp
            await collectionRef.doc("hangrotxa").update({
                data: sortedMigratedData
            });
            
            // Log migration
            logAction('migration', `Migration hoàn tất: Thêm ID cho ${migratedData.filter(item => item.id).length} sản phẩm và sắp xếp theo thời gian`, null, null);
            
            console.log(`Migration hoàn tất: Đã thêm ID cho ${migratedData.length} sản phẩm và sắp xếp theo thời gian`);
            showFloatingAlert("Migration hoàn tất!", false, 3000);
        } else {
            // Nếu không có thay đổi ID, chỉ sắp xếp lại
            const sortedData = sortDataByNewest(data.data);
            
            // Kiểm tra xem thứ tự có thay đổi không
            const orderChanged = JSON.stringify(data.data) !== JSON.stringify(sortedData);
            
            if (orderChanged) {
                await collectionRef.doc("hangrotxa").update({
                    data: sortedData
                });
                
                logAction('sort', 'Sắp xếp lại dữ liệu theo thời gian mới nhất', null, null);
                console.log("Đã sắp xếp lại dữ liệu theo thời gian");
                showFloatingAlert("Đã sắp xếp dữ liệu theo thời gian mới nhất!", false, 2000);
            } else {
                console.log("Tất cả dữ liệu đã có ID và đã được sắp xếp đúng");
                showFloatingAlert("Dữ liệu đã có ID đầy đủ", false, 2000);
            }
        }
        
    } catch (error) {
        console.error("Lỗi trong quá trình migration:", error);
        showFloatingAlert("Lỗi migration: " + error.message, false, 5000);
    }
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
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(44, 62, 80, 0.9) 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            width: auto;
            min-width: 200px;
            max-width: 350px;
            text-align: center;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            pointer-events: none;
            z-index: 9999;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
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
                border-color: #007bff;
            }
            
            #floatingAlert.show {
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: all !important;
            }
            
            .loading-spinner {
                margin-bottom: 10px;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 1s ease-in-out infinite;
                margin: 0 auto;
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
                z-index: 9998;
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
        
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
        alertBox.style.pointerEvents = 'all';
        document.body.style.overflow = 'hidden';
        document.body.style.cursor = 'wait';
    } else {
        alertBox.classList.remove('loading');
        if (loadingOverlay) loadingOverlay.classList.remove('show');
        if (spinner) spinner.style.display = 'none';
        
        document.body.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';
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
    
    document.body.style.pointerEvents = 'auto';
    document.body.style.userSelect = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.cursor = 'default';
}

// =====================================================
// IMAGE HANDLING FUNCTIONS
// =====================================================

function preloadImagesAndCache(dataArray) {
    const imageUrls = [];
    
    // Collect all image URLs
    dataArray.forEach(product => {
        if (product.hinhAnh) {
            if (Array.isArray(product.hinhAnh)) {
                imageUrls.push(...product.hinhAnh);
            } else {
                imageUrls.push(product.hinhAnh);
            }
        }
    });
    
    // Pre-load all images
    const imagePromises = imageUrls.map(url => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(url); // Still resolve even if error
            img.src = url;
        });
    });
    
    // Cache data only after all images are loaded/attempted
    Promise.all(imagePromises).then(() => {
        console.log('All images pre-loaded, sorting and caching data');
        setCachedData(dataArray);
    }).catch(error => {
        console.warn('Error pre-loading images:', error);
        // Cache anyway after timeout
        setTimeout(() => {
            setCachedData(dataArray);
        }, 5000);
    });
}

// Complete inputClipboardContainer event listener
function initializeClipboardHandling() {
    inputClipboardContainer.addEventListener('paste', async function(e) {
        if (inputClipboardRadio.checked) {
            imgArray = [];
            window.pastedImageUrl = null;
            window.isUrlPasted = false;
            e.preventDefault();
            
            const text = e.clipboardData.getData('text');
            if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
                try {
                    inputClipboardContainer.innerHTML = "";
                    
                    const imgElement = document.createElement("img");
                    imgElement.src = text;
                    imgElement.onload = function() {
                        console.log("URL image preview loaded successfully");
                    };
                    imgElement.onerror = function() {
                        console.error("Failed to load image preview from URL");
                        imgElement.alt = "Image preview (may have CORS issues)";
                    };
                    inputClipboardContainer.appendChild(imgElement);
                    
                    window.pastedImageUrl = text;
                    window.isUrlPasted = true;
                    
                    console.log("URL pasted and saved:", text);
                    return;
                    
                } catch (error) {
                    console.error('Error handling image URL:', error);
                }
            }
            
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;
            var hasImageData = false;
            
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    hasImageData = true;
                    var blob = items[i].getAsFile();
                    var file = new File([blob], "image.jpg");

                    inputClipboardContainer.innerHTML = "";

                    var imgElement = document.createElement("img");
                    imgElement.src = URL.createObjectURL(file);
                    inputClipboardContainer.appendChild(imgElement);

                    const compressImage = async (file) => {
                        return new Promise((resolve) => {
                            const maxWidth = 500;
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
                    };

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

// Hàm để tạo tên tệp động duy nhất
function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
}

// =====================================================
// ENHANCED FILTER SYSTEM
// =====================================================

// Hàm áp dụng filter cho dữ liệu (không ảnh hưởng đến DOM)
function applyFiltersToData(dataArray) {
    const filterCategory = filterCategorySelect.value;
    const selectedDotlive = dateFilterDropdown.value;
    
    return dataArray.filter(product => {
        const matchCategory = (filterCategory === 'all' || product.phanLoai === filterCategory);
        const matchDate = (selectedDotlive === 'all' || product.dotLive == selectedDotlive);
        return matchCategory && matchDate;
    });
}

// Create debounced filter function
const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    
    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");
    
    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderDataToTable(cachedData);
                updateSuggestions(cachedData);
            } else {
                // Reload data if no cache
                displayInventoryData();
            }
            
            hideFloatingAlert();
            showSuccess("Lọc dữ liệu hoàn tất!");
        } catch (error) {
            console.error('Error during filtering:', error);
            showError('Có lỗi xảy ra khi lọc dữ liệu');
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, FILTER_DEBOUNCE_DELAY);

// Simplified applyFilters function
function applyFilters() {
    debouncedApplyFilters();
}

// =====================================================
// TABLE RENDERING FUNCTIONS
// =====================================================

// SIMPLIFIED RENDER TABLE FUNCTION - NO PAGINATION
function renderDataToTable(dataArray) {
    // Áp dụng filter
    const filteredData = applyFiltersToData(dataArray);
    
    // Xóa nội dung bảng hiện tại
    tbody.innerHTML = '';
    
    // Thêm hàng thông tin tổng số ở đầu bảng
    if (filteredData.length > 0) {
        var summaryRow = document.createElement('tr');
        summaryRow.style.backgroundColor = '#f8f9fa';
        summaryRow.style.fontWeight = 'bold';
        
        var summaryTd = document.createElement('td');
        summaryTd.colSpan = 9; // Span across all columns
        summaryTd.textContent = `Tổng: ${filteredData.length} sản phẩm`;
        summaryTd.style.textAlign = 'center';
        summaryTd.style.color = '#007bff';
        summaryTd.style.padding = '8px';
        
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }
    
    var arrCountDotLive = [];
    let totalImages = 0;
    let loadedImages = 0;
    
    // Intersection Observer cho lazy loading
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const actualSrc = img.dataset.src;
                if (actualSrc) {
                    img.onload = () => {
                        loadedImages++;
                        checkAllLoaded();
                    };
                    img.onerror = () => {
                        loadedImages++;
                        checkAllLoaded();
                    };
                    img.src = actualSrc;
                    img.removeAttribute('data-src');
                }
                imageObserver.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px'
    });
    
    function checkAllLoaded() {
        if (loadedImages === totalImages) {
            console.log('All visible images loaded, caching sorted data');
            setCachedData(dataArray);
        }
    }
    
    // Render all filtered data (with limit for performance)
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);
    
    for (let i = 0; i < maxRender; i++) {
        const product = filteredData[i];
        
        var tr = document.createElement('tr');
        
        // LƯU ID VÀO DATA ATTRIBUTE CỦA ROW
        tr.setAttribute('data-product-id', product.id || '');
        
        var td1 = document.createElement('td');
        var td2 = document.createElement('td');
        var td3 = document.createElement('td');
        var td4 = document.createElement('td');
        var td5 = document.createElement('td');
        var td6 = document.createElement('td');
        var td7 = document.createElement('td');
        var td8 = document.createElement('td');
        var td9 = document.createElement('td');
        var img = document.createElement('img');
        var input = document.createElement('input');
        var button = document.createElement('button');

        // Thiết lập nội dung cơ bản - STT bình thường
        td1.textContent = i + 1;
        td2.textContent = product.dotLive || "Chưa nhập";
        arrCountDotLive.push(product.dotLive);
        td3.textContent = product.thoiGianUpload;
        td4.textContent = sanitizeInput(product.phanLoai || '');
        
        // LAZY LOADING: Không set src ngay, dùng data-src
        if (Array.isArray(product.hinhAnh)) {
            img.dataset.src = product.hinhAnh[0];
        } else {
            img.dataset.src = product.hinhAnh;
        }
        
        // Placeholder image hoặc loading spinner
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K';
        img.alt = 'Đang tải...';
        img.style.width = '50px';
        img.style.height = '50px';
        
        // Count images và observe cho lazy loading
        totalImages++;
        imageObserver.observe(img);
        
        td5.appendChild(img);
        td6.textContent = sanitizeInput(product.tenSanPham || '');
        td7.textContent = sanitizeInput(product.kichCo || '');
        
        // Input quantity với ID tracking - bỏ spinner arrows
        input.type = 'number';
        input.value = product.soLuong;
        input.min = '0';
        input.className = 'quantity-input';
        input.setAttribute('data-product-id', product.id || '');
        input.addEventListener('change', updateInventoryByID);
        
        // Prevent mouse wheel from changing value
        input.addEventListener('wheel', function(e) {
            e.preventDefault();
        });
        
        td8.appendChild(input);
        
        // Delete button với ID
        button.className = 'delete-button';
        button.setAttribute("data-product-id", product.id || '');
        button.setAttribute("data-product-name", sanitizeInput(product.tenSanPham || ''));
        button.id = sanitizeInput(product.user || '');
        button.addEventListener('click', deleteInventoryByID);

        // Apply permissions to row
        const auth = getAuthState();
        if (auth) {
            applyRowPermissions(tr, input, button, parseInt(auth.checkLogin));
        }

        // Append all elements
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        tr.appendChild(td7);
        tr.appendChild(td8);
        tr.appendChild(td9);
        td9.appendChild(button);

        tbody.appendChild(tr);
    }
    
    // Show info if data was limited
    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement('tr');
        warningRow.style.backgroundColor = '#fff3cd';
        warningRow.style.color = '#856404';
        
        const warningTd = document.createElement('td');
        warningTd.colSpan = 9;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} sản phẩm. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = 'center';
        warningTd.style.padding = '8px';
        
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }
    
    // Nếu không có hình ảnh, cache ngay
    if (totalImages === 0) {
        setCachedData(dataArray);
    }
    
    // Update dropdown với toàn bộ dữ liệu gốc, không phải dữ liệu đã filter
    updateDropdownOptions(dataArray);
}

function applyRowPermissions(row, input, button, userRole) {
    if (userRole !== 0) {
        // No permissions
        input.disabled = true;
        button.style.display = 'none';
    } else {
        // Full permissions
        input.disabled = false;
        button.style.display = '';
    }
    // userRole === 0 has full permissions (default)
}

// Helper function để update dropdown options từ toàn bộ dữ liệu
function updateDropdownOptions(fullDataArray) {
    // Lấy tất cả dotLive từ toàn bộ dữ liệu, không phải chỉ dữ liệu đã filter
    const allDotLiveValues = fullDataArray.map(product => product.dotLive);
    const numericValues = allDotLiveValues.map(Number).filter(num => !isNaN(num));
    const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : null;
    
    if (dateFilterDropdown && maxValue !== null) {
        // Lưu giá trị hiện tại
        const currentSelectedValue = dateFilterDropdown.value;
        
        // Xóa tất cả options (trừ option "all")
        while (dateFilterDropdown.children.length > 1) {
            dateFilterDropdown.removeChild(dateFilterDropdown.lastChild);
        }

        // Tạo options từ 1 đến maxValue
        for (let i = 1; i <= maxValue; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            dateFilterDropdown.appendChild(option);
        }
        
        // Khôi phục giá trị đã chọn nếu vẫn còn tồn tại
        if (currentSelectedValue && currentSelectedValue !== 'all') {
            const selectedNum = parseInt(currentSelectedValue);
            if (selectedNum <= maxValue) {
                dateFilterDropdown.value = currentSelectedValue;
            }
        }
        
        // Cập nhật dotLiveInput
        if (dotLiveInput) {
            if (maxValue > 0) {
                dotLiveInput.value = maxValue + 1; // Next batch
            } else {
                dotLiveInput.value = 1;
            }
        }
    }
}

// =====================================================
// DATA LOADING FUNCTIONS
// =====================================================

// Modified displayInventoryData function - don't cache from Firebase immediately
async function displayInventoryData() {
    // Check cache first
    const cachedData = getCachedData();
    if (cachedData) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        const sortedCacheData = sortDataByNewest(cachedData);
        renderDataToTable(sortedCacheData);
        updateSuggestions(sortedCacheData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu từ server...", true);
    
    try {
        const doc = await collectionRef.doc("hangrotxa").get();

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                const sortedData = sortDataByNewest(data.data);
                renderDataToTable(sortedData);
                updateSuggestions(sortedData);
                
                // Preload images and cache in background
                preloadImagesAndCache(sortedData);
            }
        }
        
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu hoàn tất!", false, 2000);
        
    } catch (error) {
        console.error(error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi tải dữ liệu!", false, 3000);
    }
}

// UPDATED DISPLAY FUNCTION WITH MIGRATION
async function initializeWithMigration() {
    try {
        // Bước 1: Chạy migration trước
        await migrateDataWithIDs();
        
        // Bước 2: Load dữ liệu bình thường
        await displayInventoryData();
        
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showFloatingAlert("Lỗi khởi tạo ứng dụng", false, 3000);
    }
}

// =====================================================
// FORM HANDLING FUNCTIONS
// =====================================================

// Hàm để lấy thời gian hiện tại và định dạng theo dd/mm/yyyy
function getFormattedDate() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const year = currentDate.getFullYear();
    return `${day}-${month}-${year}`;
}

// Input validation for quantity
function initializeQuantityValidation() {
    const soLuongInput = document.getElementById('soLuong');
    
    if (soLuongInput) {
        soLuongInput.addEventListener('input', function() {
            const enteredValue = parseInt(soLuongInput.value);
            const auth = getAuthState();

            if (!auth || auth.checkLogin != '777') {
                if (enteredValue < 1) {
                    showFloatingAlert('Số lượng phải lớn hơn hoặc bằng 1', false, 3000);
                    soLuongInput.value = '1';
                }
            } else {
                showFloatingAlert('Không đủ quyền!', false, 3000);
                soLuongInput.value = enteredValue;
            }
        });
    }
}

// =====================================================
// CRUD OPERATIONS
// =====================================================

// DELETE BY ID FUNCTION
async function deleteInventoryByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không đủ quyền thực hiện chức năng này.', false, 3000);
        return;
    }
    
    const button = event.currentTarget;
    const productId = button.getAttribute("data-product-id");
    const productName = button.getAttribute("data-product-name");
    
    if (!productId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${productName}"?\nID: ${productId}`);
    if (!confirmDelete) return;

    const row = button.closest("tr");
    
    // Lấy dữ liệu cũ để log
    const oldProductData = {
        id: productId,
        tenSanPham: productName,
        kichCo: row.cells[6].textContent,
        soLuong: row.querySelector('input').value,
        phanLoai: row.cells[3].textContent,
        dotLive: row.cells[1].textContent,
        hinhAnh: row.querySelector('img').dataset.src || row.querySelector('img').src
    };

    showFloatingAlert("Đang xóa...", true);

    try {
        const doc = await collectionRef.doc("hangrotxa").get();
        
        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'hangrotxa'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        // TÌM VÀ XÓA THEO ID
        const index = data.data.findIndex(item => item.id === productId);

        if (index === -1) {
            throw new Error(`Không tìm thấy sản phẩm với ID: ${productId}`);
        }

        // Xóa item theo index
        data.data.splice(index, 1);

        await collectionRef.doc("hangrotxa").update({ data: data.data });

        // Log action
        logAction('delete', `Xóa sản phẩm "${productName}" - ID: ${productId}`, oldProductData, null);
        
        // Invalidate cache
        invalidateCache();
        
        hideFloatingAlert();
        showFloatingAlert("Đã xóa thành công!", false, 2000);

        // Remove row
        if (row) row.remove();

        // Update row numbers
        const rows = tbody.querySelectorAll("tr");
        rows.forEach((r, idx) => {
            if (r.cells[0]) {
                r.cells[0].textContent = idx;
            }
        });

    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xoá:", error);
        showFloatingAlert("Lỗi khi xoá: " + error.message, false, 3000);
    }
}

// UPDATE INVENTORY BY ID
async function updateInventoryByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không đủ quyền thực hiện chức năng này.', false, 3000);
        event.target.value = event.target.defaultValue;
        return;
    }
    
    const input = event.target;
    const productId = input.getAttribute("data-product-id");
    const newQuantity = parseInt(input.value);
    const oldQuantity = parseInt(input.defaultValue);
    
    if (!productId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        input.value = oldQuantity;
        return;
    }

    const row = input.closest("tr");
    const productName = row.cells[5].textContent;

    // Xác nhận thay đổi
    if (newQuantity !== oldQuantity) {
        let confirmMessage;
        
        if (newQuantity < 1) {
            confirmMessage = `Bạn có chắc chắn muốn xóa sản phẩm "${productName}" bằng cách đặt số lượng về 0?\nID: ${productId}`;
        } else {
            confirmMessage = `Bạn có chắc chắn muốn thay đổi số lượng sản phẩm "${productName}" từ ${oldQuantity} thành ${newQuantity}?\nID: ${productId}`;
        }
        
        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldQuantity;
            return;
        }
    }

    if (newQuantity < 1) {
        // Xóa sản phẩm khi số lượng = 0
        deleteInventoryByID({ currentTarget: row.querySelector('.delete-button') });
        return;
    }

    showFloatingAlert("Đang cập nhật số lượng...", true);
    
    // Dữ liệu để log
    const oldData = {
        id: productId,
        tenSanPham: productName,
        soLuong: oldQuantity
    };
    
    const newData = {
        id: productId,
        tenSanPham: productName,
        soLuong: newQuantity
    };

    try {
        const doc = await collectionRef.doc("hangrotxa").get();
        
        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Tìm và cập nhật theo ID
        const index = data.data.findIndex(item => item.id === productId);
        
        if (index === -1) {
            throw new Error(`Không tìm thấy sản phẩm với ID: ${productId}`);
        }

        data.data[index].soLuong = newQuantity;
        
        await collectionRef.doc("hangrotxa").update({ data: data.data });

        // Log action
        logAction('update', `Cập nhật số lượng sản phẩm "${productName}" từ ${oldQuantity} thành ${newQuantity} - ID: ${productId}`, oldData, newData);
        
        // Invalidate cache
        invalidateCache();
        
        // Update defaultValue for future comparisons
        input.defaultValue = newQuantity;
        
        showFloatingAlert("Cập nhật thành công!", false, 2000);
        hideFloatingAlert();

    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        showFloatingAlert("Lỗi khi cập nhật: " + error.message, false, 3000);
        input.value = oldQuantity; // Khôi phục giá trị cũ
        hideFloatingAlert();
    }
}

// UPLOAD TO FIRESTORE WITH ID
async function uploadToFirestore(productData) {
    try {
        const doc = await collectionRef.doc("hangrotxa").get();
        
        if (doc.exists) {
            await collectionRef.doc("hangrotxa").update({
                data: firebase.firestore.FieldValue.arrayUnion(productData)
            });
        } else {
            await collectionRef.doc("hangrotxa").set({
                data: firebase.firestore.FieldValue.arrayUnion(productData)
            });
        }

        // Log action with ID
        logAction('add', `Thêm sản phẩm mới "${productData.tenSanPham}" - ID: ${productData.id}`, null, productData);
        
        // Invalidate cache
        invalidateCache();
        
        console.log("Document với ID tải lên thành công:", productData.id);
        showSuccess("Thành công!");
        
        // Reload table to show new item
        await displayInventoryData();
        
        document.getElementById("addButton").disabled = false;
        clearData();
        
    } catch (error) {
        showError("Lỗi khi tải lên...");
        console.error("Lỗi khi tải document lên: ", error);
        document.getElementById("addButton").disabled = false;
    }
}

// HANDLE FILE UPLOAD
async function handleFileUpload(newProductData) {
    showLoading("Đang tải lên...");

    const hinhAnhFiles = hinhAnhInputFile.files;
    var imagesRef = storageRef.child('hangrotxa/sp');

    const compressImage = async (file) => {
        return new Promise((resolve) => {
            const maxWidth = 500;
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
    };

    const uploadPromises = [];

    function uploadImage(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const compressedFile = await compressImage(file);
                var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                var uploadTask = imageRef.put(compressedFile, newMetadata);

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
                showError("Lỗi khi tải ảnh lên...");
                console.error(error);
                reject(error);
            }
        });
    }

    for (const hinhAnh of hinhAnhFiles) {
        uploadPromises.push(uploadImage(hinhAnh));
    }

    try {
        await Promise.all(uploadPromises);
        newProductData.hinhAnh = imageUrlFile;
        await uploadToFirestore(newProductData);
    } catch (error) {
        console.error("Lỗi trong quá trình tải lên ảnh:", error);
        showError("Lỗi khi tải ảnh lên!");
        document.getElementById("addButton").disabled = false;
    }
}

// HANDLE CLIPBOARD UPLOAD
async function handleClipboardUpload(newProductData) {
    // Kiểm tra xem có URL được paste không
    if (window.isUrlPasted && window.pastedImageUrl) {
        showLoading("Đang xử lý URL...");
        newProductData.hinhAnh = window.pastedImageUrl;
        await uploadToFirestore(newProductData);
        return;
    }
    
    // Xử lý file upload bình thường (khi copy image)
    if (imgArray.length > 0) {
        showLoading("Đang tải lên image...");

        var imageName = generateUniqueFileName();
        var imageRef = storageRef.child('hangrotxa/sp/' + imageName);

        var uploadTask = imageRef.put(imgArray[0], newMetadata);

        uploadTask.on('state_changed',
            function(snapshot) {},
            function(error) {
                console.error("Lỗi tải lên: ", error);
                showError("Lỗi tải lên!");
                document.getElementById("addButton").disabled = false;
            },
            function() {
                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                    newProductData.hinhAnh = downloadURL;
                    uploadToFirestore(newProductData);
                });
                console.log("Tải lên thành công");
            }
        );
    } else {
        showError("Vui lòng dán hình ảnh vào container!");
        document.getElementById("addButton").disabled = false;
    }
}

// UPDATED ADD PRODUCT WITH ID
function addProduct(event) {
    event.preventDefault();
    
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showError('Không có quyền thêm sản phẩm');
        return;
    }
    
    document.getElementById("addButton").disabled = true;
    
    const phanLoai = document.getElementById('phanLoai').value;
    const hinhAnhInput = document.getElementById('hinhAnhInput');
    const tenSanPham = sanitizeInput(document.getElementById('tenSanPham').value);
    const kichCo = document.getElementById('kichCo').value;
    const soLuong = parseInt(document.getElementById('soLuong').value);
    const dotLiveInput = document.getElementById('dotLive');
    const dotLive = dotLiveInput.value;

    if (isNaN(soLuong) || soLuong < 1) {
        showError('Số lượng phải lớn hơn hoặc bằng 1');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (!tenSanPham.trim()) {
        showError('Vui lòng nhập tên sản phẩm');
        document.getElementById("addButton").disabled = false;
        return;
    }

    var thoiGianUpload = new Date();
    var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    // TẠO ID DUY NHẤT CHO SAN PHẨM MỚI
    const productId = generateUniqueID();

    // Dữ liệu sản phẩm với ID
    const newProductData = {
        id: productId, // ID bắt buộc
        dotLive: dotLive,
        thoiGianUpload: formattedTime,
        phanLoai: phanLoai,
        tenSanPham: tenSanPham,
        kichCo: kichCo,
        soLuong: soLuong,
        user: getUserName()
    };

    // Xử lý theo từng loại input (link, file, clipboard)
    if (inputLinkRadio.checked) {
        if (!hinhAnhInput.value.startsWith("https://")) {
            showError('Sai định dạng link!');
            document.getElementById("addButton").disabled = false;
            return;
        }
        showLoading("Đang xử lý...");
        newProductData.hinhAnh = hinhAnhInput.value;
        uploadToFirestore(newProductData);

    } else if (inputFileRadio.checked) {
        if (!hinhAnhInputFile.files || hinhAnhInputFile.files.length === 0) {
            showError('Vui lòng chọn file hình ảnh!');
            document.getElementById("addButton").disabled = false;
            return;
        }
        handleFileUpload(newProductData);
    } else if (inputClipboardRadio.checked) {
        handleClipboardUpload(newProductData);
    }
}

// Updated clearData function
function clearData() {
    imgArray = [];
    imageUrlFile = [];
    window.pastedImageUrl = null;
    window.isUrlPasted = false;

    document.getElementById('tenSanPham').value = '';
    document.getElementById('soLuong').value = '';
    document.getElementById('hinhAnhInput').value = '';
    if (hinhAnhInputFile) hinhAnhInputFile.value = '';

    var imagesToRemoveSP = inputClipboardContainer.querySelectorAll('img');

    if (imagesToRemoveSP.length > 0) {
        imagesToRemoveSP.forEach(function(image) {
            inputClipboardContainer.removeChild(image);
        });

        var paragraph = document.createElement('p');
        paragraph.textContent = 'Dán ảnh ở đây…';
        inputClipboardContainer.appendChild(paragraph);
    }
}

// =====================================================
// FORM INITIALIZATION
// =====================================================

// Thêm hàm để ẩn/hiện biểu mẫu
function toggleForm() {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showError('Không có quyền truy cập biểu mẫu');
        return;
    }
    
    const dataForm = document.getElementById('dataForm');
    const toggleFormButton = document.getElementById('toggleFormButton');

    if (dataForm.style.display === 'none' || dataForm.style.display === '') {
        dataForm.style.display = 'block';
        toggleFormButton.textContent = 'Ẩn biểu mẫu';
    } else {
        dataForm.style.display = 'none';
        toggleFormButton.textContent = 'Hiện biểu mẫu';
    }
}

function initializeFormElements() {
    // Hide trường nhập liệu ban đầu
    if (inputLinkContainer) inputLinkContainer.style.display = 'none';
    if (inputFileContainer) inputFileContainer.style.display = 'none';

    // Radio button event listeners
    if (inputFileRadio) {
        inputFileRadio.addEventListener('change', function() {
            inputFileContainer.style.display = 'block';
            inputLinkContainer.style.display = 'none';
            inputClipboardContainer.style.display = 'none';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'none';
        });
    }

    if (inputLinkRadio) {
        inputLinkRadio.addEventListener('change', function() {
            inputFileContainer.style.display = 'none';
            inputLinkContainer.style.display = 'block';
            inputClipboardContainer.style.display = 'none';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'none';
        });
    }

    if (inputClipboardRadio) {
        inputClipboardRadio.addEventListener('change', function() {
            inputFileContainer.style.display = 'none';
            inputLinkContainer.style.display = 'none';
            inputClipboardContainer.style.display = 'block';
            if (hinhAnhContainer) hinhAnhContainer.style.display = 'none';
        });
    }

    // Initialize clipboard handling
    initializeClipboardHandling();
    
    // Initialize quantity validation
    initializeQuantityValidation();

    // Form submit handler
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', addProduct);
    }

    // Clear data button
    const clearDataButton = document.getElementById('clearDataButton');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', clearData);
    }

    // Toggle form button
    const toggleFormButton = document.getElementById('toggleFormButton');
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', toggleForm);
    }
}

// =====================================================
// FILTER EVENT HANDLERS
// =====================================================

function initializeFilterEvents() {
    // Lấy thẻ select
    if (filterCategorySelect) {
        filterCategorySelect.addEventListener('change', applyFilters);
    }
    
    if (dateFilterDropdown) {
        dateFilterDropdown.addEventListener('change', applyFilters);
    }
}

// =====================================================
// SUGGESTIONS SYSTEM
// =====================================================

// Update suggestions from full data array instead of DOM
function updateSuggestions(fullDataArray) {
    if (!fullDataArray || !Array.isArray(fullDataArray)) return;

    // Lấy tất cả tên sản phẩm từ toàn bộ dữ liệu
    const values = fullDataArray
        .map(product => product.tenSanPham?.trim())
        .filter(value => value && value.length > 0);

    const uniqueValues = [...new Set(values)];

    const dataList = document.getElementById('suggestions');
    if (dataList) {
        dataList.innerHTML = uniqueValues.map(value => `<option value="${sanitizeInput(value)}">`).join('');
    }
}

// =====================================================
// TOOLTIP & INTERACTION HANDLERS
// =====================================================

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener('click', function(e) {
            const auth = getAuthState();
            if (auth && auth.checkLogin == '0') {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton ? deleteButton.id : "Không có nút xóa";

                if (tooltip) {
                    tooltip.textContent = value;
                    tooltip.style.display = "block";

                    tooltip.style.top = e.pageY + 10 + "px";
                    tooltip.style.left = e.pageX + 10 + "px";

                    setTimeout(() => {
                        tooltip.style.display = "none";
                    }, 1000);
                }
            }
        });
    }
}

// =====================================================
// ADMIN/DEBUG FUNCTIONS
// =====================================================

function checkDataIntegrity() {
    collectionRef.doc("hangrotxa").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const itemsWithoutId = data.data.filter(item => !item.id);
            const itemsWithId = data.data.filter(item => item.id);
            
            console.log(`Tổng số items: ${data.data.length}`);
            console.log(`Items có ID: ${itemsWithId.length}`);
            console.log(`Items không có ID: ${itemsWithoutId.length}`);
            
            if (itemsWithoutId.length > 0) {
                console.log("Items không có ID:", itemsWithoutId);
                showFloatingAlert(`Tìm thấy ${itemsWithoutId.length} items không có ID. Cần chạy migration!`, false, 5000);
            } else {
                showFloatingAlert("Tất cả dữ liệu đã có ID!", false, 2000);
            }
            
            // Kiểm tra duplicate ID
            const ids = itemsWithId.map(item => item.id);
            const uniqueIds = [...new Set(ids)];
            
            if (ids.length !== uniqueIds.length) {
                console.warn("Phát hiện duplicate ID!");
                showFloatingAlert("Cảnh báo: Có ID trùng lặp trong database!", false, 5000);
            }
            
            // Kiểm tra thứ tự sắp xếp
            const sorted = sortDataByNewest([...data.data]);
            const isAlreadySorted = JSON.stringify(data.data) === JSON.stringify(sorted);
            
            console.log(`Dữ liệu đã được sắp xếp đúng: ${isAlreadySorted}`);
            if (!isAlreadySorted) {
                showFloatingAlert("Dữ liệu chưa được sắp xếp theo thời gian!", false, 3000);
            }
        }
    }).catch(error => {
        console.error("Lỗi kiểm tra data integrity:", error);
        showFloatingAlert("Lỗi kiểm tra data integrity", false, 3000);
    });
}

// Test function để kiểm tra ID system
function testIDSystem() {
    console.log("=== TESTING ID SYSTEM ===");
    checkDataIntegrity();
    
    // Test generate ID
    console.log("Testing ID generation:");
    for (let i = 0; i < 3; i++) {
        const id = generateUniqueID();
        const timestamp = extractTimestampFromId(id);
        console.log("Generated ID:", id, "| Timestamp:", timestamp, "| Date:", new Date(timestamp));
    }
    
    // Test date parsing
    console.log("Testing date parsing:");
    const testDates = [
        "22/09/2025, 14:30",
        "01-01-2025, 09:15",
        "15/12/2024",
        "Invalid date"
    ];
    
    testDates.forEach(dateStr => {
        const parsed = parseVietnameseDate(dateStr);
        console.log(`"${dateStr}" -> ${parsed ? parsed.toLocaleString() : 'null'}`);
    });
    
    // Test DOM elements have proper ID attributes
    const rows = tbody.querySelectorAll('tr');
    let rowsWithId = 0;
    let rowsWithoutId = 0;
    
    rows.forEach(row => {
        const productId = row.getAttribute('data-product-id');
        if (productId) {
            rowsWithId++;
        } else {
            rowsWithoutId++;
        }
    });
    
    console.log(`Rows với ID: ${rowsWithId}`);
    console.log(`Rows không có ID: ${rowsWithoutId}`);
    
    if (rowsWithoutId > 0) {
        console.warn("Một số rows không có ID attribute!");
        showFloatingAlert("Cảnh báo: Một số rows không có ID!", false, 3000);
    }
}

// Manual sorting function
async function forceSortByTime() {
    const auth = getAuthState();
    if (!auth) {
        showError('Không có quyền thực hiện chức năng này');
        return;
    }
    
    const confirmSort = confirm("Bạn có chắc chắn muốn sắp xếp lại dữ liệu theo thời gian mới nhất?");
    if (!confirmSort) return;
    
    try {
        showFloatingAlert("Đang sắp xếp dữ liệu...", true);
        
        const doc = await collectionRef.doc("hangrotxa").get();
        if (!doc.exists) return;
        
        const data = doc.data();
        if (!Array.isArray(data.data)) return;
        
        const sortedData = sortDataByNewest(data.data);
        
        await collectionRef.doc("hangrotxa").update({
            data: sortedData
        });
        
        logAction('sort', 'Sắp xếp thủ công dữ liệu theo thời gian mới nhất', null, null);
        
        // Invalidate cache và reload
        invalidateCache();
        
        hideFloatingAlert();
        showFloatingAlert("Đã sắp xếp dữ liệu thành công!", false, 2000);
        
        // Reload data
        setTimeout(() => {
            displayInventoryData();
        }, 1000);
        
    } catch (error) {
        console.error("Lỗi khi sắp xếp:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi sắp xếp dữ liệu!", false, 3000);
    }
}

// Manual migration trigger (for admin use)
function forceMigration() {
    const auth = getAuthState();
    if (!auth || !hasPermission(0)) {
        showError('Không có quyền thực hiện migration');
        return;
    }
    
    const confirmMigration = confirm("Bạn có chắc chắn muốn chạy migration?\nChỉ chạy khi cần thiết.");
    if (confirmMigration) {
        //migrateDataWithIDs();
    }
}

// Add manual refresh function
function forceRefreshData() {
    invalidateCache();
    displayInventoryData();
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

// Main initialization function
async function initializeApplication() {
    // Check authentication first
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
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

    // Initialize all components
    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();
    
    // Initialize data with migration
    await initializeWithMigration();
    
    // Add logout button event listener
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    console.log('Enhanced Inventory Management System initialized successfully');
}

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showError('Có lỗi xảy ra trong xử lý dữ liệu.');
});

// Export functions for global use and debugging
window.debugFunctions = {
    checkDataIntegrity,
    testIDSystem,
    forceSortByTime,
    forceMigration,
    generateUniqueID,
    sortDataByNewest,
    parseVietnameseDate,
    forceRefreshData,
    invalidateCache,
    getAuthState,
    hasPermission
};

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    // Remove any ads or unwanted elements
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }
    
    // Initialize application
    initializeApplication();
});

console.log("Enhanced Inventory Management System loaded");
console.log("Debug functions available at window.debugFunctions");
console.log("Available functions:", Object.keys(window.debugFunctions).join(', '));
