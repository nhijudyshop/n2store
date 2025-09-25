// Enhanced Order Management System - Complete Version Part 1
// Security and performance improvements for order tracking

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_KEY = 'dathang_data_cache';
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
    width: 80px;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
    text-align: center;
}

/* Style for price inputs */
input[type=number].price-input {
    width: 120px;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
    text-align: right;
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
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const tbody = document.getElementById('orderTableBody');
const orderForm = document.getElementById('orderForm');
const ngayDatHangInput = document.getElementById('ngayDatHang');
const nhaCungCapInput = document.getElementById('nhaCungCap');
const hoaDonInput = document.getElementById('hoaDon');
const tenSanPhamInput = document.getElementById('tenSanPham');
const maSanPhamInput = document.getElementById('maSanPham');
const bienTheInput = document.getElementById('bienThe');
const soLuongInput = document.getElementById('soLuong');
const giaNhapInput = document.getElementById('giaNhap');
const ghiChuInput = document.getElementById('ghiChu');

// Image containers
const invoiceClipboardContainer = document.getElementById('invoiceClipboardContainer');
const productClipboardContainer = document.getElementById('productClipboardContainer');
const priceClipboardContainer = document.getElementById('priceClipboardContainer');
const invoiceFileInput = document.getElementById('invoiceFileInput');
const productFileInput = document.getElementById('productFileInput');
const priceFileInput = document.getElementById('priceFileInput');
const invoiceLinkInput = document.getElementById('invoiceLinkInput');
const productLinkInput = document.getElementById('productLinkInput');
const priceLinkInput = document.getElementById('priceLinkInput');

// Filter elements
const filterSupplierSelect = document.getElementById('filterSupplier');
const dateFilterSelect = document.getElementById('dateFilter');
const filterProductInput = document.getElementById('filterProduct');

// Global variables
var invoiceImageUrls = []; // Array for invoice images
var productImageUrls = []; // Array for product images
var priceImageUrls = []; // Array for price images
var invoiceImgArray = [];
var productImgArray = [];
var priceImgArray = [];
let editingRow = null;
let currentFilters = {
    supplier: 'all',
    date: 'all',
    product: ''
};
let filterTimeout = null;
let isFilteringInProgress = false;

// =====================================================
// AUTHENTICATION SYSTEM (Same as inventory system)
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
    return input.replace(/[<>"'&]/g, '').trim(); // Enhanced XSS protection
}

function numberWithCommas(x) {
    if (!x && x !== 0) return '0';
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${day}/${month}/${year}`;
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0 ₫';
    return numberWithCommas(amount) + ' ₫';
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
// ID GENERATION SYSTEM
// =====================================================

function generateUniqueID() {
    // Create unique ID based on timestamp and random
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `id_${timestamp}_${random}`;
}

// Function to generate unique filename
function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
}

// =====================================================
// FORM HANDLING FUNCTIONS
// =====================================================

// Get formatted current date and time
function getFormattedDateTime() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const year = currentDate.getFullYear();
    const hour = currentDate.getHours().toString().padStart(2, '0');
    const minute = currentDate.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

// Set today's date in date input
function setTodayDate() {
    if (ngayDatHangInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        ngayDatHangInput.value = `${year}-${month}-${day}`;
    }
}

// Input validation for quantity and price
function initializeInputValidation() {
    if (soLuongInput) {
        soLuongInput.addEventListener('input', function() {
            const enteredValue = parseInt(soLuongInput.value);
            if (enteredValue < 1) {
                soLuongInput.value = '1';
            }
        });
    }
    
    if (giaNhapInput) {
        giaNhapInput.addEventListener('input', function() {
            const enteredValue = parseFloat(giaNhapInput.value);
            if (enteredValue < 0) {
                giaNhapInput.value = '0';
            }
        });
    }
}

// =====================================================
// IMAGE HANDLING FUNCTIONS - MOVED TO TOP
// =====================================================

// HANDLE IMAGE UPLOAD FOR PRODUCTS
async function handleProductImageUpload(orderData) {
    const selectedType = document.querySelector('input[name="productInputType"]:checked').value;
    
    if (selectedType === 'link') {
        if (!productLinkInput.value.startsWith("https://")) {
            return null; // Optional field
        }
        return productLinkInput.value;
    } else if (selectedType === 'file') {
        if (!productFileInput.files || productFileInput.files.length === 0) {
            return null; // Optional field
        }
        return await handleFileImageUpload(productFileInput.files, 'product');
    } else if (selectedType === 'clipboard') {
        if (window.isProductUrlPasted && window.pastedProductImageUrl) {
            return window.pastedProductImageUrl;
        } else if (productImgArray.length > 0) {
            return await handleClipboardImageUpload(productImgArray[0], 'product');
        } else {
            return null; // Optional field
        }
    }
    return null;
}

// HANDLE IMAGE UPLOAD FOR INVOICES
async function handleInvoiceImageUpload(orderData) {
    const selectedType = document.querySelector('input[name="invoiceInputType"]:checked').value;
    
    if (selectedType === 'link') {
        if (!invoiceLinkInput.value.startsWith("https://")) {
            return null; // Optional field
        }
        return invoiceLinkInput.value;
    } else if (selectedType === 'file') {
        if (!invoiceFileInput.files || invoiceFileInput.files.length === 0) {
            return null; // Optional field
        }
        return await handleFileImageUpload(invoiceFileInput.files, 'invoice');
    } else if (selectedType === 'clipboard') {
        if (window.isInvoiceUrlPasted && window.pastedInvoiceImageUrl) {
            return window.pastedInvoiceImageUrl;
        } else if (invoiceImgArray.length > 0) {
            return await handleClipboardImageUpload(invoiceImgArray[0], 'invoice');
        } else {
            return null; // Optional field
        }
    }
    return null;
}

// HANDLE IMAGE UPLOAD FOR PRICES
async function handlePriceImageUpload(orderData) {
    const selectedType = document.querySelector('input[name="priceInputType"]:checked').value;
    
    if (selectedType === 'link') {
        if (!priceLinkInput.value.startsWith("https://")) {
            return null; // Optional field
        }
        return priceLinkInput.value;
    } else if (selectedType === 'file') {
        if (!priceFileInput.files || priceFileInput.files.length === 0) {
            return null; // Optional field
        }
        return await handleFileImageUpload(priceFileInput.files, 'price');
    } else if (selectedType === 'clipboard') {
        if (window.isPriceUrlPasted && window.pastedPriceImageUrl) {
            return window.pastedPriceImageUrl;
        } else if (priceImgArray.length > 0) {
            return await handleClipboardImageUpload(priceImgArray[0], 'price');
        } else {
            return null; // Optional field
        }
    }
    return null;
}

// HANDLE FILE IMAGE UPLOAD
async function handleFileImageUpload(files, type) {
    const imageUrls = [];
    var imagesRef = storageRef.child(`dathang/${type}`);

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
                                imageUrls.push(downloadURL);
                                resolve();
                            })
                            .catch(function(error) {
                                reject(error);
                            });
                    }
                );
            } catch (error) {
                showError(`Lỗi khi tải ảnh ${type} lên...`);
                console.error(error);
                reject(error);
            }
        });
    }

    for (const file of files) {
        uploadPromises.push(uploadImage(file));
    }

    try {
        await Promise.all(uploadPromises);
        return imageUrls.length === 1 ? imageUrls[0] : imageUrls;
    } catch (error) {
        console.error(`Lỗi trong quá trình tải ảnh ${type} lên:`, error);
        showError(`Lỗi khi tải ảnh ${type} lên!`);
        throw error;
    }
}

// HANDLE CLIPBOARD IMAGE UPLOAD
async function handleClipboardImageUpload(file, type) {
    var imageName = generateUniqueFileName();
    var imageRef = storageRef.child(`dathang/${type}/` + imageName);

    return new Promise((resolve, reject) => {
        var uploadTask = imageRef.put(file, newMetadata);

        uploadTask.on('state_changed',
            function(snapshot) {},
            function(error) {
                console.error(`Lỗi tải ảnh ${type} lên: `, error);
                showError(`Lỗi tải ảnh ${type} lên!`);
                reject(error);
            },
            function() {
                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                    console.log(`Tải ảnh ${type} lên thành công`);
                    resolve(downloadURL);
                }).catch(reject);
            }
        );
    });
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Đặt Hàng') {
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
        // Sort by order date first (newest first)
        const dateA = parseDate(a.ngayDatHang);
        const dateB = parseDate(b.ngayDatHang);
        
        if (dateA && dateB) {
            const timeDiff = dateB - dateA;
            if (timeDiff !== 0) return timeDiff;
        }
        
        // If same date, sort by upload time (newest first)
        const timeA = parseVietnameseDate(a.thoiGianUpload);
        const timeB = parseVietnameseDate(b.thoiGianUpload);
        
        if (!timeA && !timeB) {
            const timestampA = extractTimestampFromId(a.id);
            const timestampB = extractTimestampFromId(b.id);
            return timestampB - timestampA;
        }
        
        if (!timeA) return 1;
        if (!timeB) return -1;
        
        return timeB - timeA;
    });
}

// Helper function to parse date strings
function parseDate(dateString) {
    if (!dateString) return null;
    
    try {
        // Handle both YYYY-MM-DD and DD/MM/YYYY formats
        if (dateString.includes('-')) {
            return new Date(dateString);
        } else if (dateString.includes('/')) {
            const [day, month, year] = dateString.split('/');
            return new Date(year, month - 1, day);
        }
        return new Date(dateString);
    } catch (error) {
        console.warn('Error parsing date:', dateString, error);
        return null;
    }
}

// Helper function to parse Vietnamese date format
function parseVietnameseDate(dateString) {
    if (!dateString) return null;
    
    try {
        const cleanDateString = dateString.replace(/,?\s*/g, ' ').trim();
        
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/, // dd/mm/yyyy hh:mm
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // dd/mm/yyyy
        ];
        
        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                               parseInt(hour), parseInt(minute));
            }
        }
        
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