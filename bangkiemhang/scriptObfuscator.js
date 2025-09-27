// =====================================================
// INVENTORY MANAGEMENT SYSTEM WITH GROUPING
// File: inventory-script.js
// =====================================================

// =====================================================
// CONFIGURATION & GLOBAL VARIABLES
// =====================================================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const tbody = document.getElementById("orderTableBody");
const filterSupplierSelect = document.getElementById("filterSupplier");
const dateFilterSelect = document.getElementById("dateFilter");
const filterProductInput = document.getElementById("filterProduct");

// Configuration
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 500;

// Global variables
let groupingEnabled = true;
let memoryCache = { data: null, timestamp: null };
let isFilteringInProgress = false;
let currentFilters = { supplier: "all", date: "all", product: "" };

// =====================================================
// AUTHENTICATION FUNCTIONS
// =====================================================

const AUTH_STORAGE_KEY = "loginindex_auth";
let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }

        // Fallback to legacy system for compatibility
        const legacyLogin =
            localStorage.getItem("isLoggedIn") ||
            sessionStorage.getItem("isLoggedIn");
        const legacyUserType =
            localStorage.getItem("userType") ||
            sessionStorage.getItem("userType");
        const legacyCheckLogin =
            localStorage.getItem("checkLogin") ||
            sessionStorage.getItem("checkLogin");

        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now(),
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
        }
    } catch (error) {
        console.error("Error reading auth state:", error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        clearLegacyAuth();
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === "true";
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;
    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}/${month}/${year}`;
}

function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.replace(/,?\s*/g, " ").trim();
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        ];

        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                );
            }
        }

        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

function getFormattedDateTime() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, "0");
    const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const year = currentDate.getFullYear();
    const hour = currentDate.getHours().toString().padStart(2, "0");
    const minute = currentDate.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `inv_${timestamp}_${random}`;
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

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached inventory data");
                return [...memoryCache.data];
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        memoryCache.data = [...data];
        memoryCache.timestamp = Date.now();
        console.log("Inventory data cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// =====================================================
// DATA TRANSFORMATION WITH GROUPING
// =====================================================

function transformOrderDataToInventory(orderData, enableGrouping = true) {
    if (!Array.isArray(orderData)) return [];

    const inventoryMap = new Map();

    orderData.forEach((order) => {
        if (!order.maSanPham && !order.tenSanPham) return;

        // Only group by supplier (nhaCungCap), not by product
        const supplier = order.nhaCungCap || "Unknown";
        const groupingKey = enableGrouping ? supplier : order.id;

        if (inventoryMap.has(groupingKey)) {
            const existing = inventoryMap.get(groupingKey);
            existing.soLuong += order.soLuong || 0;
            existing.thucNhan += order.thucNhan || 0;
            existing.tongNhan += order.tongNhan || 0;

            if (!existing.groupedOrderIds) {
                existing.groupedOrderIds = [existing.originalOrderId];
            }
            existing.groupedOrderIds.push(order.id);
            existing.groupedCount = (existing.groupedCount || 1) + 1;

            const existingDate = parseVietnameseDate(existing.ngayNhan);
            const orderDate = parseVietnameseDate(order.thoiGianUpload);

            if (orderDate && (!existingDate || orderDate > existingDate)) {
                existing.ngayNhan = order.thoiGianUpload;
                existing.lastOrderId = order.id;
            }

            if (order.ngayDatHang) existing.ngayDatHang = order.ngayDatHang;

            // For grouped items, combine product names and codes
            if (
                order.maSanPham &&
                existing.maSanPham &&
                !existing.maSanPham.includes(order.maSanPham)
            ) {
                existing.maSanPham += `, ${order.maSanPham}`;
            }
            if (
                order.tenSanPham &&
                existing.tenSanPham &&
                !existing.tenSanPham.includes(order.tenSanPham)
            ) {
                existing.tenSanPham += `, ${order.tenSanPham}`;
            }
        } else {
            const inventoryRecord = {
                id: enableGrouping
                    ? `grouped_${supplier}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    : order.id || generateUniqueID(),
                ngayDatHang: order.ngayDatHang,
                ngayNhan: order.thoiGianUpload,
                nhaCungCap: order.nhaCungCap,
                maSanPham: order.maSanPham || "",
                tenSanPham: order.tenSanPham || "",
                soLuong: order.soLuong || 0,
                thucNhan: order.thucNhan || 0,
                tongNhan: order.tongNhan || 0,
                originalOrderId: order.id,
                lastUpdated: order.lastUpdated || getFormattedDateTime(),
                updatedBy: order.updatedBy || getUserName(),
                inventoryUpdated: order.inventoryUpdated || false,
                isGrouped: false,
                groupedCount: 1,
                groupingKey: supplier,
            };

            inventoryMap.set(groupingKey, inventoryRecord);
        }
    });

    // Mark grouped items
    Array.from(inventoryMap.values()).forEach((item) => {
        if (item.groupedCount > 1) {
            item.isGrouped = true;
        }
    });

    return Array.from(inventoryMap.values());
}

// =====================================================
// DATA LOADING FUNCTIONS
// =====================================================

async function loadInventoryData(enableGrouping = true) {
    const cachedData = getCachedData();
    if (cachedData && !enableGrouping) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        renderInventoryTable(cachedData);
        updateFilterOptions(cachedData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu đặt hàng từ Firebase...", true);

    try {
        // Load order data from Firebase 'dathang' collection
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
                console.log(`Loaded ${orderData.length} orders from Firebase`);
            } else {
                console.warn("No data array found in dathang document");
                showFloatingAlert(
                    "Không tìm thấy dữ liệu đặt hàng!",
                    false,
                    3000,
                );
                return;
            }
        } else {
            console.warn("dathang document does not exist");
            showFloatingAlert(
                "Không tìm thấy collection dathang!",
                false,
                3000,
            );
            return;
        }

        if (orderData.length === 0) {
            showFloatingAlert("Chưa có dữ liệu đặt hàng nào!", false, 3000);
            tbody.innerHTML =
                '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #6c757d;">Chưa có dữ liệu để hiển thị</td></tr>';
            return;
        }

        const inventoryData = transformOrderDataToInventory(
            orderData,
            enableGrouping,
        );

        const sortedData = inventoryData.sort((a, b) => {
            const dateA = parseVietnameseDate(a.ngayNhan);
            const dateB = parseVietnameseDate(b.ngayNhan);

            if (dateA && dateB) {
                return dateB - dateA;
            }

            return 0;
        });

        renderInventoryTable(sortedData);
        updateFilterOptions(sortedData);
        setCachedData(sortedData);

        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu hoàn tất!", false, 2000);
    } catch (error) {
        console.error("Error loading inventory data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi tải dữ liệu: " + error.message, false, 3000);
    }
}

// =====================================================
// FILTER FUNCTIONS
// =====================================================

function applyFiltersToInventory(dataArray) {
    const filterSupplier = filterSupplierSelect
        ? filterSupplierSelect.value
        : "all";
    const filterDate = dateFilterSelect ? dateFilterSelect.value : "all";
    const filterProductText = filterProductInput
        ? filterProductInput.value.toLowerCase().trim()
        : "";

    return dataArray.filter((item) => {
        const matchSupplier =
            filterSupplier === "all" || item.nhaCungCap === filterSupplier;

        let matchDate = true;
        if (filterDate !== "all") {
            const itemDate =
                parseVietnameseDate(item.ngayNhan) ||
                parseVietnameseDate(item.ngayDatHang);
            if (itemDate) {
                const today = new Date();
                const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate(),
                );

                if (filterDate === "today") {
                    const itemDateStart = new Date(
                        itemDate.getFullYear(),
                        itemDate.getMonth(),
                        itemDate.getDate(),
                    );
                    matchDate =
                        itemDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === "week") {
                    const weekAgo = new Date(
                        todayStart.getTime() - 7 * 24 * 60 * 60 * 1000,
                    );
                    matchDate = itemDate >= weekAgo;
                } else if (filterDate === "month") {
                    const monthAgo = new Date(
                        todayStart.getFullYear(),
                        todayStart.getMonth() - 1,
                        todayStart.getDate(),
                    );
                    matchDate = itemDate >= monthAgo;
                }
            }
        }

        const matchProduct =
            !filterProductText ||
            (item.tenSanPham &&
                item.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (item.maSanPham &&
                item.maSanPham.toLowerCase().includes(filterProductText));

        return matchSupplier && matchDate && matchProduct;
    });
}

function updateFilterOptions(fullDataArray) {
    if (!filterSupplierSelect) return;

    const suppliers = [
        ...new Set(
            fullDataArray
                .map((item) => item.nhaCungCap)
                .filter((supplier) => supplier),
        ),
    ];
    const currentSelectedValue = filterSupplierSelect.value;

    while (filterSupplierSelect.children.length > 1) {
        filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
    }

    suppliers.forEach((supplier) => {
        const option = document.createElement("option");
        option.value = supplier;
        option.textContent = supplier;
        filterSupplierSelect.appendChild(option);
    });

    if (
        currentSelectedValue &&
        currentSelectedValue !== "all" &&
        suppliers.includes(currentSelectedValue)
    ) {
        filterSupplierSelect.value = currentSelectedValue;
    }
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;
    showFloatingAlert("Đang lọc dữ liệu...", true);

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderInventoryTable(cachedData);
            } else {
                loadInventoryData(groupingEnabled);
            }
            hideFloatingAlert();
            showFloatingAlert("Lọc dữ liệu hoàn tất!", false, 1000);
        } catch (error) {
            console.error("Error during filtering:", error);
            hideFloatingAlert();
            showFloatingAlert("Có lỗi xảy ra khi lọc dữ liệu", false, 3000);
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

// =====================================================
// TABLE RENDERING
// =====================================================

function renderInventoryTable(inventoryData) {
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    const filteredData = applyFiltersToInventory(inventoryData);
    tbody.innerHTML = "";

    // Add summary row
    if (filteredData.length > 0) {
        const summaryRow = document.createElement("tr");
        summaryRow.style.backgroundColor = "#f8f9fa";
        summaryRow.style.fontWeight = "bold";
        const summaryTd = document.createElement("td");
        summaryTd.colSpan = 9;

        const totalItems = filteredData.length;
        const groupedItems = filteredData.filter(
            (item) => item.isGrouped,
        ).length;
        const originalOrders = filteredData.reduce(
            (sum, item) => sum + (item.groupedCount || 1),
            0,
        );

        summaryTd.innerHTML = `
            Hiển thị: <strong>${totalItems}</strong> sản phẩm 
            (<strong>${groupedItems}</strong> đã gộp từ <strong>${originalOrders}</strong> đơn hàng gốc)
        `;
        summaryTd.style.textAlign = "center";
        summaryTd.style.color = "#007bff";
        summaryTd.style.padding = "8px";
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    // Render inventory rows
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const item = filteredData[i];
        const tr = document.createElement("tr");
        tr.className = "inventory-row";
        tr.setAttribute("data-inventory-id", item.id || "");

        // Add special styling for grouped items
        if (item.isGrouped) {
            tr.classList.add("grouped");
        }

        // Create cells
        const cells = [];
        for (let j = 0; j < 9; j++) {
            cells[j] = document.createElement("td");
        }

        // Ngày đặt hàng
        cells[0].textContent = item.ngayDatHang || "Chưa nhập";

        // Ngày nhận hàng
        const receivedDate = parseVietnameseDate(item.ngayNhan);
        if (receivedDate) {
            cells[1].textContent = formatDate(receivedDate);
        } else {
            cells[1].textContent = item.ngayNhan || "Chưa nhập";
        }

        // Nhà cung cấp
        cells[2].textContent = sanitizeInput(item.nhaCungCap || "");

        // Mã sản phẩm
        cells[3].textContent = sanitizeInput(item.maSanPham || "");

        // Tên sản phẩm
        cells[4].textContent = sanitizeInput(item.tenSanPham || "");

        // Số lượng (with grouping indicator)
        const quantityDiv = document.createElement("div");
        if (item.isGrouped) {
            quantityDiv.innerHTML = `
                <strong>${item.soLuong || 0}</strong>
                <br><small style="color: #28a745; font-weight: bold;">
                    (Gộp ${item.groupedCount} đơn)
                </small>
            `;
        } else {
            quantityDiv.textContent = item.soLuong || 0;
        }
        quantityDiv.style.textAlign = "center";
        quantityDiv.style.fontWeight = "bold";
        cells[5].appendChild(quantityDiv);

        // Thực nhận
        const receivedContainer = document.createElement("div");
        const receivedLabel = document.createElement("span");
        receivedLabel.className = "received-label";
        if (item.thucNhan || item.thucNhan === 0) {
            receivedLabel.textContent = item.thucNhan;
            if (item.isGrouped && item.thucNhan > 0) {
                receivedLabel.style.background = "#d4edda";
                receivedLabel.style.borderColor = "#28a745";
            }
        } else {
            receivedLabel.textContent = "Chưa nhập";
            receivedLabel.classList.add("empty");
        }
        receivedLabel.setAttribute("data-field", "thucNhan");
        receivedLabel.setAttribute("data-inventory-id", item.id || "");
        receivedContainer.appendChild(receivedLabel);
        cells[6].appendChild(receivedContainer);

        // Tổng nhận
        const totalContainer = document.createElement("div");
        const totalLabel = document.createElement("span");
        totalLabel.className = "total-label";
        if (item.tongNhan || item.tongNhan === 0) {
            totalLabel.textContent = item.tongNhan;
            if (item.isGrouped && item.tongNhan > 0) {
                totalLabel.style.background = "#d4edda";
                totalLabel.style.borderColor = "#28a745";
            }
        } else {
            totalLabel.textContent = "Chưa nhập";
            totalLabel.classList.add("empty");
        }
        totalLabel.setAttribute("data-field", "tongNhan");
        totalLabel.setAttribute("data-inventory-id", item.id || "");
        totalContainer.appendChild(totalLabel);
        cells[7].appendChild(totalContainer);

        // Buttons
        const buttonGroup = document.createElement("div");
        buttonGroup.className = "button-group";

        // Add expand button for grouped items
        if (item.isGrouped) {
            const expandButton = document.createElement("button");
            //expandButton.className = 'expand-button';
            //expandButton.textContent = 'Chi tiết';
            //expandButton.setAttribute('data-inventory-id', item.id);
            //expandButton.setAttribute('data-grouped-orders', JSON.stringify(item.groupedOrderIds || []));
            //expandButton.addEventListener('click', showGroupedOrderDetails);
            //buttonGroup.appendChild(expandButton);
        }

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.setAttribute("data-inventory-id", item.id || "");
        editButton.setAttribute(
            "data-inventory-info",
            `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
        );
        editButton.setAttribute(
            "data-is-grouped",
            item.isGrouped ? "true" : "false",
        );
        editButton.addEventListener("click", editInventoryItem);

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.setAttribute("data-inventory-id", item.id || "");
        deleteButton.setAttribute(
            "data-inventory-info",
            `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
        );
        deleteButton.setAttribute(
            "data-is-grouped",
            item.isGrouped ? "true" : "false",
        );
        deleteButton.addEventListener("click", deleteInventoryItem);

        buttonGroup.appendChild(editButton);
        buttonGroup.appendChild(deleteButton);
        cells[8].appendChild(buttonGroup);

        // Apply permissions
        const auth = getAuthState();
        if (auth) {
            const editableElements = [receivedLabel, totalLabel];
            applyRowPermissions(
                tr,
                editableElements,
                [editButton, deleteButton],
                parseInt(auth.checkLogin),
            );
        }

        // Append cells to row
        cells.forEach((cell) => tr.appendChild(cell));
        tbody.appendChild(tr);
    }

    updateFilterOptions(inventoryData);
    updateStatistics(inventoryData);
}

function applyRowPermissions(row, editableElements, buttons, userRole) {
    if (userRole !== 0) {
        editableElements.forEach((element) => {
            element.style.opacity = "0.6";
            element.style.cursor = "not-allowed";
        });
        buttons.forEach((button) => (button.style.display = "none"));
        row.style.opacity = "0.7";
    } else {
        editableElements.forEach((element) => {
            element.style.opacity = "1";
            element.style.cursor = "pointer";
        });
        buttons.forEach((button) => (button.style.display = ""));
        row.style.opacity = "1";
    }
}

// =====================================================
// GROUPING FUNCTIONS
// =====================================================

function showGroupedOrderDetails(event) {
    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const groupedOrderIds = JSON.parse(
        button.getAttribute("data-grouped-orders") || "[]",
    );

    if (groupedOrderIds.length === 0) {
        showFloatingAlert("Không có thông tin chi tiết!", false, 2000);
        return;
    }

    const modal = document.createElement("div");
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;

    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    `;

    modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 15px;">
            <h3 style="margin: 0; color: #333;">Chi tiết các đơn hàng đã gộp</h3>
            <button onclick="this.closest('[style*=\"position: fixed\"]').remove()" 
                style="background: #dc3545; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 16px;">×</button>
        </div>
        <div style="color: #666; margin-bottom: 15px;">
            <strong>Tổng cộng:</strong> ${groupedOrderIds.length} đơn hàng được gộp lại
        </div>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead style="background: #f8f9fa;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">STT</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ID Đơn hàng</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Trạng thái</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupedOrderIds
                        .map(
                            (orderId, index) => `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
                            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">${orderId}</td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                                <span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Đã gộp</span>
                            </td>
                        </tr>
                    `,
                        )
                        .join("")}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
            <strong>Lưu ý:</strong> Đây là các đơn hàng có cùng sản phẩm và nhà cung cấp đã được gộp lại để tiện theo dõi.
            Khi chỉnh sửa thông tin kiểm hàng, tất cả các đơn hàng này sẽ được cập nhật đồng thời.
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function toggleGrouping() {
    groupingEnabled = !groupingEnabled;
    const toggleButton = document.getElementById("toggleGroupingButton");
    const indicator = document.getElementById("groupingIndicator");
    const explanation = document.getElementById("groupingExplanation");

    if (toggleButton) {
        toggleButton.textContent = groupingEnabled
            ? "Tắt gộp NCC"
            : "Bật gộp NCC";
        toggleButton.style.background = groupingEnabled
            ? "linear-gradient(135deg, #dc3545 0%, #c82333 100%)"
            : "linear-gradient(135deg, #28a745 0%, #20c997 100%)";
    }

    if (indicator) {
        indicator.textContent = groupingEnabled ? "GỘP THEO NCC" : "CHI TIẾT";
        indicator.style.background = groupingEnabled ? "#007bff" : "#6c757d";
    }

    if (explanation) {
        explanation.style.display = groupingEnabled ? "block" : "none";
    }

    invalidateCache();
    loadInventoryData(groupingEnabled);

    showFloatingAlert(
        groupingEnabled
            ? "Đã bật gộp sản phẩm theo NCC"
            : "Đã tắt gộp sản phẩm theo NCC",
        false,
        2000,
    );
}

// =====================================================
// CRUD OPERATIONS
// =====================================================

async function editInventoryItem(event) {
    const auth = getAuthState();
    if (!auth || parseInt(auth.checkLogin) > 0) {
        showFloatingAlert("Không có quyền chỉnh sửa", false, 3000);
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");
    const isGrouped = button.getAttribute("data-is-grouped") === "true";

    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    const row = button.closest("tr");

    if (row.classList.contains("editing")) {
        await saveInventoryChanges(row, inventoryId, itemInfo, isGrouped);
    } else {
        startEditingInventory(row, button, isGrouped);
    }
}

function startEditingInventory(row, button, isGrouped) {
    row.classList.add("editing");
    button.textContent = "Lưu";
    button.style.background =
        "linear-gradient(135deg, #28a745 0%, #20c997 100%)";

    if (isGrouped) {
        const warningDiv = document.createElement("div");
        warningDiv.style.cssText = `
            position: absolute;
            top: -40px;
            left: 50%;
            transform: translateX(-50%);
            background: #fff3cd;
            color: #856404;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 1000;
        `;
        warningDiv.textContent = "Sửa gộp nhiều đơn hàng";
        button.parentElement.style.position = "relative";
        button.parentElement.appendChild(warningDiv);

        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.remove();
            }
        }, 3000);
    }

    const receivedLabel = row.querySelector(".received-label");
    const totalLabel = row.querySelector(".total-label");

    if (receivedLabel) {
        const currentValue = receivedLabel.classList.contains("empty")
            ? ""
            : receivedLabel.textContent;
        const input = document.createElement("input");
        input.type = "number";
        input.className = "received-input";
        input.value = currentValue === "Chưa nhập" ? "" : currentValue;
        input.min = "0";
        input.step = "any";
        input.placeholder = "0";
        input.setAttribute("data-field", "thucNhan");
        input.setAttribute(
            "data-inventory-id",
            receivedLabel.getAttribute("data-inventory-id"),
        );

        receivedLabel.parentNode.replaceChild(input, receivedLabel);
        input.focus();
        input.select();
    }

    if (totalLabel) {
        const currentValue = totalLabel.classList.contains("empty")
            ? ""
            : totalLabel.textContent;
        const input = document.createElement("input");
        input.type = "number";
        input.className = "total-input";
        input.value = currentValue === "Chưa nhập" ? "" : currentValue;
        input.min = "0";
        input.step = "any";
        input.placeholder = "0";
        input.setAttribute("data-field", "tongNhan");
        input.setAttribute(
            "data-inventory-id",
            totalLabel.getAttribute("data-inventory-id"),
        );

        totalLabel.parentNode.replaceChild(input, totalLabel);
    }
}

async function saveInventoryChanges(row, inventoryId, itemInfo, isGrouped) {
    try {
        showFloatingAlert("Đang lưu thay đổi...", true);

        const receivedInput = row.querySelector(".received-input");
        const totalInput = row.querySelector(".total-input");

        const receivedValue = receivedInput
            ? parseFloat(receivedInput.value) || 0
            : 0;
        const totalValue = totalInput ? parseFloat(totalInput.value) || 0 : 0;

        const updateData = {
            thucNhan: receivedValue,
            tongNhan: totalValue,
            lastUpdated: getFormattedDateTime(),
            updatedBy: getUserName(),
            inventoryUpdated: true,
        };

        // Update in Firebase - original order data
        await updateOrderInventoryData(inventoryId, updateData);

        // Convert inputs back to labels
        if (receivedInput) {
            const label = document.createElement("span");
            label.className = "received-label";
            label.textContent =
                receivedValue || receivedValue === 0
                    ? receivedValue
                    : "Chưa nhập";
            if (!receivedValue && receivedValue !== 0)
                label.classList.add("empty");
            label.setAttribute("data-field", "thucNhan");
            label.setAttribute("data-inventory-id", inventoryId);
            receivedInput.parentNode.replaceChild(label, receivedInput);
        }

        if (totalInput) {
            const label = document.createElement("span");
            label.className = "total-label";
            label.textContent =
                totalValue || totalValue === 0 ? totalValue : "Chưa nhập";
            if (!totalValue && totalValue !== 0) label.classList.add("empty");
            label.setAttribute("data-field", "tongNhan");
            label.setAttribute("data-inventory-id", inventoryId);
            totalInput.parentNode.replaceChild(label, totalInput);
        }

        // Reset row state
        row.classList.remove("editing");

        // Reset button
        const editButton = row.querySelector(".edit-button");
        editButton.style.background =
            "linear-gradient(135deg, #007bff 0%, #0056b3 100%)";

        // Update cached data
        const cachedData = getCachedData();
        if (cachedData) {
            const index = cachedData.findIndex(
                (item) => item.id === inventoryId,
            );
            if (index !== -1) {
                cachedData[index].thucNhan = receivedValue;
                cachedData[index].tongNhan = totalValue;
                cachedData[index].lastUpdated = getFormattedDateTime();
                cachedData[index].updatedBy = getUserName();
                setCachedData(cachedData);
            }
        }

        // Log action to history
        logAction(
            "edit",
            `Chỉnh sửa thông tin kiểm hàng "${itemInfo}" - Thực nhận: ${receivedValue}, Tổng nhận: ${totalValue} - ID: ${inventoryId}`,
            null,
            updateData,
        );

        hideFloatingAlert();
        showFloatingAlert("Lưu thay đổi thành công!", false, 2000);
    } catch (error) {
        console.error("Lỗi khi lưu thay đổi:", error);
        showFloatingAlert(
            "Lỗi khi lưu thay đổi: " + error.message,
            false,
            3000,
        );

        // Revert changes on error - reload from cache
        const cachedData = getCachedData();
        if (cachedData) {
            const item = cachedData.find((item) => item.id === inventoryId);
            if (item) {
                const receivedInput = row.querySelector(".received-input");
                const totalInput = row.querySelector(".total-input");

                if (receivedInput) {
                    const label = document.createElement("span");
                    label.className = "received-label";
                    if (item.thucNhan || item.thucNhan === 0) {
                        label.textContent = item.thucNhan;
                    } else {
                        label.textContent = "Chưa nhập";
                        label.classList.add("empty");
                    }
                    label.setAttribute("data-field", "thucNhan");
                    label.setAttribute("data-inventory-id", inventoryId);
                    receivedInput.parentNode.replaceChild(label, receivedInput);
                }

                if (totalInput) {
                    const label = document.createElement("span");
                    label.className = "total-label";
                    if (item.tongNhan || item.tongNhan === 0) {
                        label.textContent = item.tongNhan;
                    } else {
                        label.textContent = "Chưa nhập";
                        label.classList.add("empty");
                    }
                    label.setAttribute("data-field", "tongNhan");
                    label.setAttribute("data-inventory-id", inventoryId);
                    totalInput.parentNode.replaceChild(label, totalInput);
                }

                // Reset row and button
                row.classList.remove("editing");
                const editButton = row.querySelector(".edit-button");
                editButton.style.background =
                    "linear-gradient(135deg, #007bff 0%, #0056b3 100%)";
            }
        }
    }
}

// Update inventory data in the original order record
async function updateOrderInventoryData(orderId, updateData) {
    try {
        // Load order data from 'dathang' collection
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        } else {
            throw new Error("Không tìm thấy document dathang");
        }

        // Find the order by ID - handle both grouped and individual items
        let orderIndex = -1;
        let cachedData = getCachedData();
        let targetItem = null;

        if (cachedData) {
            targetItem = cachedData.find((item) => item.id === orderId);
        }

        if (targetItem && targetItem.isGrouped && targetItem.groupedOrderIds) {
            // For grouped items, update all associated orders
            let updatedCount = 0;
            targetItem.groupedOrderIds.forEach((originalOrderId) => {
                const index = orderData.findIndex(
                    (order) => order.id === originalOrderId,
                );
                if (index !== -1) {
                    orderData[index] = {
                        ...orderData[index],
                        ...updateData,
                    };
                    updatedCount++;
                }
            });

            if (updatedCount === 0) {
                throw new Error("Không tìm thấy đơn hàng gốc nào để cập nhật");
            }

            console.log(
                `Updated ${updatedCount} grouped orders for inventory item ${orderId}`,
            );
        } else {
            // For individual items, find by original order ID
            if (targetItem && targetItem.originalOrderId) {
                orderIndex = orderData.findIndex(
                    (order) => order.id === targetItem.originalOrderId,
                );
            } else {
                // Fallback: try to find by current ID
                orderIndex = orderData.findIndex(
                    (order) => order.id === orderId,
                );
            }

            if (orderIndex !== -1) {
                orderData[orderIndex] = {
                    ...orderData[orderIndex],
                    ...updateData,
                };
                console.log(
                    `Updated individual order ${orderId} with inventory data`,
                );
            } else {
                throw new Error("Không tìm thấy đơn hàng để cập nhật");
            }
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });
        console.log("Successfully updated Firebase with inventory data");
    } catch (error) {
        console.error("Error updating order inventory data:", error);
        throw error;
    }
}

async function deleteInventoryItem(event) {
    const auth = getAuthState();
    if (!auth || parseInt(auth.checkLogin) > 0) {
        showFloatingAlert(
            "Không đủ quyền thực hiện chức năng này.",
            false,
            3000,
        );
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");
    const isGrouped = button.getAttribute("data-is-grouped") === "true";

    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    const confirmMessage = isGrouped
        ? `Bạn có chắc chắn muốn xóa thông tin kiểm kho gộp của sản phẩm "${itemInfo}"?\nLưu ý: Đây là mục đã gộp từ nhiều đơn hàng. Chỉ xóa thông tin kiểm kho, không xóa đơn hàng gốc.\nID: ${inventoryId}`
        : `Bạn có chắc chắn muốn xóa thông tin kiểm kho của sản phẩm "${itemInfo}"?\nLưu ý: Chỉ xóa thông tin kiểm kho, đơn hàng gốc vẫn được giữ lại.\nID: ${inventoryId}`;

    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) return;

    const row = button.closest("tr");

    showFloatingAlert("Đang xóa thông tin kiểm kho...", true);

    try {
        // Get old data for logging
        const cachedData = getCachedData();
        let oldItemData = null;

        if (cachedData) {
            const index = cachedData.findIndex(
                (item) => item.id === inventoryId,
            );
            if (index !== -1) {
                oldItemData = { ...cachedData[index] };
                cachedData.splice(index, 1);
                setCachedData(cachedData);
            }
        }

        // Remove inventory data from Firebase (not the entire order)
        await removeInventoryDataFromOrder(inventoryId);

        // Log action to history
        logAction(
            "delete",
            `Xóa thông tin kiểm kho "${itemInfo}" - ID: ${inventoryId}`,
            oldItemData,
            null,
        );

        hideFloatingAlert();
        showFloatingAlert("Đã xóa thông tin kiểm kho thành công!", false, 2000);

        if (row) row.remove();
    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xóa:", error);
        showFloatingAlert("Lỗi khi xóa: " + error.message, false, 3000);

        // Restore cached data on error
        if (cachedData && oldItemData) {
            cachedData.push(oldItemData);
            setCachedData(cachedData);
        }
    }
}

// Remove inventory data from original order (keep the order, just remove inventory fields)
async function removeInventoryDataFromOrder(inventoryId) {
    try {
        // Load order data from 'dathang' collection
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        } else {
            throw new Error("Không tìm thấy document dathang");
        }

        // Find target item in cache to get original order IDs
        const cachedData = getCachedData();
        let targetItem = null;

        if (cachedData) {
            targetItem = cachedData.find((item) => item.id === inventoryId);
        }

        let updatedCount = 0;

        if (targetItem && targetItem.isGrouped && targetItem.groupedOrderIds) {
            // For grouped items, remove inventory data from all associated orders
            targetItem.groupedOrderIds.forEach((originalOrderId) => {
                const orderIndex = orderData.findIndex(
                    (order) => order.id === originalOrderId,
                );
                if (orderIndex !== -1) {
                    // Remove inventory fields from the order
                    delete orderData[orderIndex].thucNhan;
                    delete orderData[orderIndex].tongNhan;
                    delete orderData[orderIndex].inventoryUpdated;

                    // Update timestamp
                    orderData[orderIndex].lastUpdated = getFormattedDateTime();
                    orderData[orderIndex].updatedBy = getUserName();
                    updatedCount++;
                }
            });

            console.log(
                `Removed inventory data from ${updatedCount} grouped orders`,
            );
        } else {
            // For individual items, find by original order ID
            let orderIndex = -1;

            if (targetItem && targetItem.originalOrderId) {
                orderIndex = orderData.findIndex(
                    (order) => order.id === targetItem.originalOrderId,
                );
            } else {
                // Fallback: try to find by current ID
                orderIndex = orderData.findIndex(
                    (order) => order.id === inventoryId,
                );
            }

            if (orderIndex !== -1) {
                // Remove inventory fields from the order
                delete orderData[orderIndex].thucNhan;
                delete orderData[orderIndex].tongNhan;
                delete orderData[orderIndex].inventoryUpdated;

                // Update timestamp
                orderData[orderIndex].lastUpdated = getFormattedDateTime();
                orderData[orderIndex].updatedBy = getUserName();
                updatedCount++;

                console.log(
                    `Removed inventory data from individual order ${inventoryId}`,
                );
            } else {
                throw new Error(
                    "Không tìm thấy đơn hàng để xóa thông tin kiểm kho",
                );
            }
        }

        if (updatedCount === 0) {
            throw new Error("Không có đơn hàng nào được cập nhật");
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });
        console.log("Successfully removed inventory data from Firebase");
    } catch (error) {
        console.error("Error removing inventory data from order:", error);
        throw error;
    }
}

// Log action to history
function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Kiểm Hàng",
) {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    // Save to Firebase history collection
    historyCollectionRef
        .add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// STATISTICS FUNCTIONS
// =====================================================

function updateStatistics(inventoryData) {
    const totalProducts = document.getElementById("totalProducts");
    const completedProducts = document.getElementById("completedProducts");
    const partialProducts = document.getElementById("partialProducts");
    const pendingProducts = document.getElementById("pendingProducts");
    const groupedItems = document.getElementById("groupedItems");

    if (!inventoryData || !Array.isArray(inventoryData)) return;

    let total = inventoryData.length;
    let completed = 0;
    let partial = 0;
    let pending = 0;
    let grouped = 0;

    inventoryData.forEach((item) => {
        const ordered = item.soLuong || 0;
        const received = (item.thucNhan || 0) + (item.tongNhan || 0);

        if (received >= ordered && received > 0) {
            completed++;
        } else if (received > 0 && received < ordered) {
            partial++;
        } else {
            pending++;
        }

        if (item.isGrouped) {
            grouped++;
        }
    });

    if (totalProducts) totalProducts.textContent = total;
    if (completedProducts) completedProducts.textContent = completed;
    if (partialProducts) partialProducts.textContent = partial;
    if (pendingProducts) pendingProducts.textContent = pending;
    if (groupedItems) groupedItems.textContent = grouped;
}

// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showFloatingAlert("Không có dữ liệu để xuất", false, 3000);
        return;
    }

    showFloatingAlert("Đang tạo file Excel...", true);

    try {
        const filteredData = applyFiltersToInventory(cachedData);
        const excelData = filteredData.map((item, index) => ({
            "Loại sản phẩm": "Có thể lưu trữ",
            "Mã sản phẩm": item.maSanPham || "",
            "Mã chốt đơn": "",
            "Tên sản phẩm": item.tenSanPham || "",
            "Giá bán": item.giaBan || "",
            "Giá mua": item.giaMua || "",
            "Đơn vị": "",
            "Nhóm sản phẩm": "Có thể bán",
            "Mã vạch": "",
            "Khối lượng": "",
            "Chiết khấu bán": "",
            "Chiết khấu mua": "",
            "Tồn kho": "",
            "Giá vốn": "",
            "Ghi chú": "",
            "Cho phép bán ở công ty khác": "",
            "Thuộc tính": "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kiểm Hàng");
        const fileName = `KiemHang_${groupingEnabled ? "Gop" : "ChiTiet"}_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showFloatingAlert("Xuất Excel thành công!", false, 2000);
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi xuất Excel!", false, 3000);
    }
}

// =====================================================
// EVENT HANDLERS
// =====================================================

function initializeFilterEvents() {
    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener("change", applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener("change", applyFilters);
    }
    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            debounce(applyFilters, 300),
        );
    }
}

async function refreshInventoryData() {
    try {
        showFloatingAlert("Đang làm mới dữ liệu...", true);
        invalidateCache();
        await loadInventoryData(groupingEnabled);
        hideFloatingAlert();
        showFloatingAlert("Làm mới dữ liệu thành công!", false, 2000);
    } catch (error) {
        console.error("Error refreshing inventory data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi làm mới dữ liệu!", false, 3000);
    }
}

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        localStorage.clear();
        sessionStorage.clear();
        invalidateCache();
        window.location.href = "../index.html";
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

async function initializeInventorySystem() {
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        // Uncomment the next line in production:
        // window.location.href = '../index.html';
        // return;
    }

    if (auth && auth.userType && auth.userType !== "Admin") {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.userType;
        }
    }

    initializeFilterEvents();
    await loadInventoryData(groupingEnabled);

    // Set up event listeners
    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", refreshInventoryData);
    }

    const exportButton = document.getElementById("exportButton");
    if (exportButton) {
        exportButton.addEventListener("click", exportToExcel);
    }

    const toggleGroupingButton = document.getElementById(
        "toggleGroupingButton",
    );
    if (toggleGroupingButton) {
        toggleGroupingButton.addEventListener("click", toggleGrouping);
    }

    console.log(
        "Inventory Management System with Grouping initialized successfully",
    );
    console.log('Data source: Firebase collection "dathang"');
    console.log("Grouping enabled:", groupingEnabled);
}

// =====================================================
// DOM INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    // Force unblock any blocking overlays
    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    // Remove any existing ads
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    // Initialize the inventory system
    initializeInventorySystem();

    console.log(
        "Inventory System with Firebase Integration loaded successfully",
    );
});

// =====================================================
// DEBUG AND UTILITY FUNCTIONS
// =====================================================

// Debug functions for development
window.debugInventoryFunctions = {
    loadInventoryData,
    transformOrderDataToInventory,
    toggleGrouping,
    showGroupedOrderDetails,
    refreshInventoryData,
    invalidateCache,
    getAuthState,
    exportToExcel,
    updateOrderInventoryData,
    removeInventoryDataFromOrder,
    groupingEnabled: () => groupingEnabled,
};

// Emergency reset function
window.forceUnblock = function () {
    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    const alertBox = document.getElementById("floatingAlert");
    if (alertBox) {
        alertBox.style.display = "none";
        alertBox.style.opacity = "0";
        alertBox.style.visibility = "hidden";
    }

    console.log("Force unblocked - page should be interactive now");
    console.log(
        "Available debug functions:",
        Object.keys(window.debugInventoryFunctions),
    );
};

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showFloatingAlert("Có lỗi xảy ra. Vui lòng tải lại trang.", false, 5000);
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    showFloatingAlert("Có lỗi xảy ra trong xử lý dữ liệu.", false, 5000);
});

console.log("Inventory Management System - JavaScript loaded successfully");
console.log(
    "Features: Firebase integration, supplier grouping, real-time updates, export functionality",
);
