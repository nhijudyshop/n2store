// Enhanced Goods Receipt Management System - Complete Version Part 1
// Security and performance improvements for goods receipt tracking

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_KEY = 'nhanhang_data_cache';
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
    width: 100px;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
    text-align: center;
}

/* Camera button styles */
.camera-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s ease;
    font-size: 14px;
}

.camera-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.camera-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.camera-icon {
    width: 18px;
    height: 18px;
    font-size: 18px;
}

.camera-container {
    position: relative;
    margin: 20px 0;
    border: 2px solid #ddd;
    border-radius: 10px;
    overflow: hidden;
    background: #f8f9fa;
}

.camera-controls {
    padding: 15px;
    background: white;
    border-bottom: 1px solid #ddd;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.camera-preview {
    position: relative;
    width: 100%;
    height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
}

.camera-preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.camera-preview canvas {
    display: none;
}

.captured-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.no-camera {
    color: #6c757d;
    font-style: italic;
    text-align: center;
}

.image-display-area {
    border: 2px dashed #ddd;
    border-radius: 10px;
    padding: 20px;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    background: #f8f9fa;
    transition: all 0.3s ease;
    margin: 10px 0;
}

.image-display-area:hover {
    border-color: #667eea;
    background: #f0f4ff;
}

.image-display-area.has-content {
    border-color: #28a745;
    background: #f8fff9;
}

.image-display-area img {
    max-width: 200px;
    max-height: 200px;
    object-fit: cover;
    border-radius: 8px;
    margin: 5px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.image-display-area p {
    color: #6c757d;
    font-style: italic;
    margin: 0;
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
const collectionRef = db.collection("nhanhang");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const tbody = document.getElementById('receiptTableBody');
const receiptForm = document.getElementById('receiptForm');
const tenNguoiNhanInput = document.getElementById('tenNguoiNhan');
const soKgInput = document.getElementById('soKg');
const ghiChuInput = document.getElementById('ghiChu');

// Camera elements
const cameraPreview = document.getElementById('cameraPreview');
const cameraVideo = document.getElementById('cameraVideo');
const cameraCanvas = document.getElementById('cameraCanvas');
const startCameraButton = document.getElementById('startCamera');
const takePictureButton = document.getElementById('takePicture');
const retakePictureButton = document.getElementById('retakePicture');
const imageDisplayArea = document.getElementById('imageDisplayArea');

// Edit modal elements
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editReceiptId = document.getElementById('editReceiptId');
const editTenNguoiNhanInput = document.getElementById('editTenNguoiNhan');
const editSoKgInput = document.getElementById('editSoKg');
const editGhiChuInput = document.getElementById('editGhiChu');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditButton = document.getElementById('cancelEditButton');
const updateButton = document.getElementById('updateButton');

// Edit camera elements
const editCameraPreview = document.getElementById('editCameraPreview');
const editCameraVideo = document.getElementById('editCameraVideo');
const editCameraCanvas = document.getElementById('editCameraCanvas');
const editStartCameraButton = document.getElementById('editStartCamera');
const editTakePictureButton = document.getElementById('editTakePicture');
const editRetakePictureButton = document.getElementById('editRetakePicture');
const editKeepCurrentImageButton = document.getElementById('editKeepCurrentImage');
const editImageDisplayArea = document.getElementById('editImageDisplayArea');
const currentImageContainer = document.getElementById('currentImageContainer');

// Filter elements
const filterUserSelect = document.getElementById('filterUser');
const dateFilterSelect = document.getElementById('dateFilter');
const filterWeightInput = document.getElementById('filterWeight');

// Global variables
var capturedImageUrl = null;
var capturedImageBlob = null;
var editCapturedImageUrl = null;
var editCapturedImageBlob = null;
var editKeepCurrentImage = false;
var editCurrentImageUrl = null;
var cameraStream = null;
var editCameraStream = null;
let editingRow = null;
let currentFilters = {
    user: 'all',
    date: 'all',
    weight: ''
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
    if (!amount && amount !== 0) return '0 kg';
    return numberWithCommas(amount) + ' kg';
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
    return `receipt_${timestamp}_${random}`;
}

// Function to generate unique filename
function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.jpg';
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

// Set current user name in input
function setCurrentUserName() {
    if (tenNguoiNhanInput) {
        const userName = getUserName();
        tenNguoiNhanInput.value = userName;
        tenNguoiNhanInput.setAttribute('readonly', true);
    }
}

// Input validation for weight
function initializeInputValidation() {
    if (soKgInput) {
        soKgInput.addEventListener('input', function() {
            const enteredValue = parseFloat(soKgInput.value);
            if (enteredValue < 0) {
                soKgInput.value = '0';
            }
        });
    }
}

// =====================================================
// CAMERA HANDLING FUNCTIONS
// =====================================================

// Initialize camera system
function initializeCameraSystem() {
    if (startCameraButton) {
        startCameraButton.addEventListener('click', startCamera);
    }
    
    if (takePictureButton) {
        takePictureButton.addEventListener('click', takePicture);
    }
    
    if (retakePictureButton) {
        retakePictureButton.addEventListener('click', retakePicture);
    }

    // Edit camera events
    if (editStartCameraButton) {
        editStartCameraButton.addEventListener('click', startEditCamera);
    }
    
    if (editTakePictureButton) {
        editTakePictureButton.addEventListener('click', takeEditPicture);
    }
    
    if (editRetakePictureButton) {
        editRetakePictureButton.addEventListener('click', retakeEditPicture);
    }

    if (editKeepCurrentImageButton) {
        editKeepCurrentImageButton.addEventListener('click', keepCurrentImage);
    }
}

// Start camera
async function startCamera() {
    try {
        showLoading("Đang khởi động camera...");
        
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' // Use back camera if available
            }
        };
        
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (cameraVideo) {
            cameraVideo.srcObject = cameraStream;
            cameraVideo.play();
            
            cameraVideo.addEventListener('loadedmetadata', () => {
                // Adjust canvas size to match video
                if (cameraCanvas) {
                    cameraCanvas.width = cameraVideo.videoWidth;
                    cameraCanvas.height = cameraVideo.videoHeight;
                }
            });
        }
        
        // Update UI
        if (startCameraButton) startCameraButton.style.display = 'none';
        if (takePictureButton) takePictureButton.style.display = 'inline-flex';
        if (cameraPreview) cameraPreview.style.display = 'block';
        
        hideFloatingAlert();
        showSuccess("Camera đã sẵn sàng!");
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        hideFloatingAlert();
        
        let errorMessage = "Không thể truy cập camera. ";
        if (error.name === 'NotAllowedError') {
            errorMessage += "Vui lòng cho phép truy cập camera.";
        } else if (error.name === 'NotFoundError') {
            errorMessage += "Không tìm thấy camera.";
        } else {
            errorMessage += "Lỗi: " + error.message;
        }
        
        showError(errorMessage);
    }
}

// Take picture
function takePicture() {
    if (!cameraVideo || !cameraCanvas) {
        showError("Camera chưa sẵn sàng!");
        return;
    }
    
    try {
        const canvas = cameraCanvas;
        const context = canvas.getContext('2d');
        
        // Draw current video frame to canvas
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        
        // Convert to blob
        canvas.toBlob((blob) => {
            if (blob) {
                capturedImageBlob = blob;
                capturedImageUrl = URL.createObjectURL(blob);
                
                // Display captured image
                displayCapturedImage();
                
                // Stop camera
                stopCamera();
                
                showSuccess("Đã chụp ảnh thành công!");
            } else {
                showError("Không thể chụp ảnh!");
            }
        }, 'image/jpeg', 0.8);
        
    } catch (error) {
        console.error('Error taking picture:', error);
        showError("Lỗi khi chụp ảnh: " + error.message);
    }
}

// Display captured image
function displayCapturedImage() {
    if (imageDisplayArea && capturedImageUrl) {
        imageDisplayArea.innerHTML = '';
        
        const img = document.createElement('img');
        img.src = capturedImageUrl;
        img.alt = 'Ảnh đã chụp';
        img.className = 'captured-image';
        
        imageDisplayArea.appendChild(img);
        imageDisplayArea.classList.add('has-content');
        
        // Update UI
        if (takePictureButton) takePictureButton.style.display = 'none';
        if (retakePictureButton) retakePictureButton.style.display = 'inline-flex';
    }
}

// Retake picture
function retakePicture() {
    // Clear captured image
    capturedImageUrl = null;
    capturedImageBlob = null;
    
    if (imageDisplayArea) {
        imageDisplayArea.innerHTML = '<p>📷 Ảnh sẽ hiển thị ở đây sau khi chụp</p>';
        imageDisplayArea.classList.remove('has-content');
    }
    
    // Show start camera button again
    if (startCameraButton) startCameraButton.style.display = 'inline-flex';
    if (takePictureButton) takePictureButton.style.display = 'none';
    if (retakePictureButton) retakePictureButton.style.display = 'none';
    if (cameraPreview) cameraPreview.style.display = 'none';
}

// Stop camera
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }
    
    if (cameraPreview) {
        cameraPreview.style.display = 'none';
    }
}

// =====================================================
// EDIT CAMERA FUNCTIONS
// =====================================================

// Start camera for editing
async function startEditCamera() {
    try {
        showLoading("Đang khởi động camera...");
        
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment'
            }
        };
        
        editCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (editCameraVideo) {
            editCameraVideo.srcObject = editCameraStream;
            editCameraVideo.play();
            
            editCameraVideo.addEventListener('loadedmetadata', () => {
                if (editCameraCanvas) {
                    editCameraCanvas.width = editCameraVideo.videoWidth;
                    editCameraCanvas.height = editCameraVideo.videoHeight;
                }
            });
        }
        
        // Update UI
        if (editStartCameraButton) editStartCameraButton.style.display = 'none';
        if (editTakePictureButton) editTakePictureButton.style.display = 'inline-flex';
        if (editRetakePictureButton) editRetakePictureButton.style.display = 'inline-flex';
        if (editKeepCurrentImageButton) editKeepCurrentImageButton.style.display = 'inline-flex';
        if (editCameraPreview) editCameraPreview.style.display = 'block';
        if (editImageDisplayArea) editImageDisplayArea.style.display = 'flex';
        
        hideFloatingAlert();
        showSuccess("Camera edit đã sẵn sàng!");
        
    } catch (error) {
        console.error('Error accessing edit camera:', error);
        hideFloatingAlert();
        showError("Không thể truy cập camera: " + error.message);
    }
}

// Take picture for editing
function takeEditPicture() {
    if (!editCameraVideo || !editCameraCanvas) {
        showError("Camera chưa sẵn sàng!");
        return;
    }
    
    try {
        const canvas = editCameraCanvas;
        const context = canvas.getContext('2d');
        
        context.drawImage(editCameraVideo, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if (blob) {
                editCapturedImageBlob = blob;
                editCapturedImageUrl = URL.createObjectURL(blob);
                editKeepCurrentImage = false;
                
                displayEditCapturedImage();
                stopEditCamera();
                
                showSuccess("Đã chụp ảnh mới thành công!");
            } else {
                showError("Không thể chụp ảnh!");
            }
        }, 'image/jpeg', 0.8);
        
    } catch (error) {
        console.error('Error taking edit picture:', error);
        showError("Lỗi khi chụp ảnh: " + error.message);
    }
}

// Display captured image for editing
function displayEditCapturedImage() {
    if (editImageDisplayArea && editCapturedImageUrl) {
        editImageDisplayArea.innerHTML = '';
        
        const img = document.createElement('img');
        img.src = editCapturedImageUrl;
        img.alt = 'Ảnh mới đã chụp';
        img.className = 'captured-image';
        
        editImageDisplayArea.appendChild(img);
        editImageDisplayArea.classList.add('has-content');
        editImageDisplayArea.style.display = 'flex';
    }
}

// Retake picture for editing
function retakeEditPicture() {
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;
    
    if (editImageDisplayArea) {
        editImageDisplayArea.innerHTML = '<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>';
        editImageDisplayArea.classList.remove('has-content');
    }
    
    // Restart camera
    startEditCamera();
}

// Keep current image
function keepCurrentImage() {
    editKeepCurrentImage = true;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;
    
    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = 'none';
    }
    
    stopEditCamera();
    resetEditCameraUI();
    
    showSuccess("Sẽ giữ ảnh hiện tại!");
}

// Stop edit camera
function stopEditCamera() {
    if (editCameraStream) {
        editCameraStream.getTracks().forEach(track => track.stop());
        editCameraStream = null;
    }
    
    if (editCameraVideo) {
        editCameraVideo.srcObject = null;
    }
    
    if (editCameraPreview) {
        editCameraPreview.style.display = 'none';
    }
}

// Reset edit camera UI
function resetEditCameraUI() {
    if (editStartCameraButton) editStartCameraButton.style.display = 'inline-flex';
    if (editTakePictureButton) editTakePictureButton.style.display = 'none';
    if (editRetakePictureButton) editRetakePictureButton.style.display = 'none';
    if (editKeepCurrentImageButton) editKeepCurrentImageButton.style.display = 'none';
    if (editCameraPreview) editCameraPreview.style.display = 'none';
    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = 'none';
        editImageDisplayArea.innerHTML = '<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>';
        editImageDisplayArea.classList.remove('has-content');
    }
}

// =====================================================
// IMAGE UPLOAD FUNCTIONS
// =====================================================

// Upload captured image to Firebase Storage
async function uploadCapturedImage() {
    if (!capturedImageBlob) {
        return null; // No image captured
    }
    
    try {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);
        
        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(capturedImageBlob, newMetadata);
            
            uploadTask.on('state_changed',
                function(snapshot) {
                    // Progress can be shown here if needed
                },
                function(error) {
                    console.error('Error uploading image:', error);
                    reject(error);
                },
                function() {
                    uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                        console.log('Image uploaded successfully');
                        resolve(downloadURL);
                    }).catch(reject);
                }
            );
        });
        
    } catch (error) {
        console.error('Error in image upload process:', error);
        throw error;
    }
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Nhận Hàng') {
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
        // Sort by receipt time first (newest first)
        const timeA = parseVietnameseDate(a.thoiGianNhan);
        const timeB = parseVietnameseDate(b.thoiGianNhan);
        
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
    if (!id || !id.startsWith('receipt_')) return 0;
    
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