// Livestream Report Management System - Complete JavaScript File
// Enhanced with edit history tooltip system

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
    measurementId: "G-TEJH3S2T1D",
};

// Cache configuration - using in-memory storage
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Reduced limit
const FILTER_DEBOUNCE_DELAY = 500; // Increased delay

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null,
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("livestream_reports");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const livestreamForm = document.getElementById("livestreamForm");
const tableBody = document.getElementById("tableBody");
const toggleFormButton = document.getElementById("toggleFormButton");
const dataForm = document.getElementById("dataForm");
const ngayLive = document.getElementById("ngayLive");
const editModal = document.getElementById("editModal");

// Global variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let currentFilters = {
    startDate: null,
    endDate: null,
    status: "all",
};
let filterTimeout = null;
let isFilteringInProgress = false;

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = "loginindex_auth";
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
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === "true";
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
        console.warn("Error accessing cache:", e);
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
        console.warn("Cannot cache data:", e);
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

    const tooltip = document.createElement("div");
    tooltip.id = "editHistoryTooltip";
    tooltip.className = "edit-history-tooltip";

    // Get main table and measure column widths
    const mainTable = document.querySelector("#tableBody").closest("table");
    const mainTableRect = mainTable.getBoundingClientRect();

    // Get actual column widths from the main table header
    const mainTableHeaders = mainTable.querySelectorAll("thead th");
    const columnWidths = [];

    // Measure each column width from the main table
    for (let i = 0; i < mainTableHeaders.length; i++) {
        const headerRect = mainTableHeaders[i].getBoundingClientRect();
        columnWidths.push(headerRect.width);
    }

    // If no headers found, get from first row cells
    if (columnWidths.length === 0) {
        const firstRowCells = mainTable.querySelectorAll(
            "tbody tr:first-child td",
        );
        for (let i = 0; i < firstRowCells.length; i++) {
            const cellRect = firstRowCells[i].getBoundingClientRect();
            columnWidths.push(cellRect.width);
        }
    }

    // Calculate width for action columns (edit + delete columns combined)
    const actionColumnsWidth =
        (columnWidths[6] || 50) + (columnWidths[7] || 50);
    const singleActionColumnWidth = actionColumnsWidth / 3; // Divide by 3 for our 3 new columns

    // Sort edit history by timestamp (newest first)
    const sortedHistory = [...editHistory].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    // Build tooltip content as table with exact column widths
    let tooltipContent = `
        <div class="tooltip-header">Lịch sử chỉnh sửa</div>
        <div class="tooltip-table-container">
            <table class="history-table">
                <thead>
                    <tr class="history-header-row">
                        <th style="width: ${columnWidths[0] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Ngày</th>
                        <th style="width: ${columnWidths[1] || 200}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Mẫu live</th>
                        <th style="width: ${columnWidths[2] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Tiền QC</th>
                        <th style="width: ${columnWidths[3] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Thời gian</th>
                        <th style="width: ${columnWidths[4] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Số món live</th>
                        <th style="width: ${columnWidths[5] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Số món inbox</th>
                        <th style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Lần sửa</th>
                        <th style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Người sửa</th>
                        <th style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">Thời điểm sửa</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Get current data from the row for comparison
    const currentData = {
        dateCell: row.cells[0].textContent,
        mauLive: row.cells[1].textContent
            .replace(" ✨", "")
            .replace(/\s*<span[^>]*>.*?<\/span>\s*/g, ""), // Remove edit indicator
        tienQC: row.cells[2].textContent,
        thoiGian: row.cells[3].textContent,
        soMonLive: row.cells[4].textContent,
        soMonInbox: row.cells[5].textContent,
    };

    // Don't add current version row - we'll start directly with edit history

    // Add edit history rows first (starting from newest #1, #2, #3...)
    sortedHistory.forEach((history, index) => {
        const editDate = new Date(history.timestamp).toLocaleString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

        // Edit number starts from 1 (after the original #0)
        const editNumber = sortedHistory.length - index;

        const currentHistoryData = history.newData || {};
        const oldHistoryData = history.oldData || {};

        // Determine what actually changed in THIS specific edit
        const changes = {
            dateCell: compareValues(
                oldHistoryData.dateCell,
                currentHistoryData.dateCell,
                "dateCell",
            ),
            mauLive: compareValues(
                oldHistoryData.mauLive,
                currentHistoryData.mauLive,
                "mauLive",
            ),
            tienQC: compareValues(
                oldHistoryData.tienQC,
                currentHistoryData.tienQC,
                "tienQC",
            ),
            thoiGian: compareValues(
                oldHistoryData.thoiGian,
                currentHistoryData.thoiGian,
                "thoiGian",
            ),
            soMonLive: compareValues(
                oldHistoryData.soMonLive,
                currentHistoryData.soMonLive,
                "soMonLive",
            ),
            soMonInbox: compareValues(
                oldHistoryData.soMonInbox,
                currentHistoryData.soMonInbox,
                "soMonInbox",
            ),
        };

        // Debug logging
        console.log("Edit #" + editNumber + ":", {
            oldData: oldHistoryData,
            newData: currentHistoryData,
            changes: changes,
        });

        tooltipContent += `
            <tr class="history-row">
                <td class="data-cell ${changes.dateCell ? "changed" : ""}" style="width: ${columnWidths[0] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.dateCell ? "Đã thay đổi trong lần sửa này" : ""}">${formatHistoryDate(currentHistoryData.dateCell) || "-"}</td>
                <td class="data-cell ${changes.mauLive ? "changed" : ""}" style="width: ${columnWidths[1] || 200}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.mauLive ? "Đã thay đổi trong lần sửa này" : ""}">${currentHistoryData.mauLive || "-"}</td>
                <td class="data-cell ${changes.tienQC ? "changed" : ""}" style="width: ${columnWidths[2] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.tienQC ? "Đã thay đổi trong lần sửa này" : ""}">${currentHistoryData.tienQC || "-"}</td>
                <td class="data-cell ${changes.thoiGian ? "changed" : ""}" style="width: ${columnWidths[3] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.thoiGian ? "Đã thay đổi trong lần sửa này" : ""}">${currentHistoryData.thoiGian || "-"}</td>
                <td class="data-cell ${changes.soMonLive ? "changed" : ""}" style="width: ${columnWidths[4] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.soMonLive ? "Đã thay đổi trong lần sửa này" : ""}">${currentHistoryData.soMonLive || "-"}</td>
                <td class="data-cell ${changes.soMonInbox ? "changed" : ""}" style="width: ${columnWidths[5] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;" title="${changes.soMonInbox ? "Đã thay đổi trong lần sửa này" : ""}">${currentHistoryData.soMonInbox || "-"}</td>
                <td class="edit-number" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">#${editNumber}</td>
                <td class="data-cell user-cell" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${history.editedBy || "Unknown"}</td>
                <td class="data-cell timestamp-cell" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${editDate}</td>
            </tr>
        `;
    });

    // Finally, add the original data row (#0) at the bottom
    if (sortedHistory.length > 0) {
        const oldestEdit = sortedHistory[sortedHistory.length - 1];
        const originalData = oldestEdit.oldData || {};
        const recordId = row.cells[0].getAttribute("data-id");
        const itemData = arrayData.find((item) => item.id === recordId);
        const creatorName = itemData
            ? itemData.createdBy || itemData.user || "Unknown"
            : "Unknown";

        tooltipContent += `
                <tr class="history-row original-row">
                    <td class="data-cell" style="width: ${columnWidths[0] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${formatHistoryDate(originalData.dateCell) || "-"}</td>
                    <td class="data-cell" style="width: ${columnWidths[1] || 200}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${originalData.mauLive || "-"}</td>
                    <td class="data-cell" style="width: ${columnWidths[2] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${originalData.tienQC || "-"}</td>
                    <td class="data-cell" style="width: ${columnWidths[3] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${originalData.thoiGian || "-"}</td>
                    <td class="data-cell" style="width: ${columnWidths[4] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${originalData.soMonLive || "-"}</td>
                    <td class="data-cell" style="width: ${columnWidths[5] || 100}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${originalData.soMonInbox || "-"}</td>
                    <td class="edit-number original" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">#0</td>
                    <td class="data-cell user-cell" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${creatorName}</td>
                    <td class="data-cell timestamp-cell" style="width: ${singleActionColumnWidth}px; text-align: center !important; vertical-align: middle !important; padding: 8px 4px !important;">${itemData && itemData.createdAt ? new Date(itemData.createdAt).toLocaleString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : itemData && itemData.dateCell ? new Date(parseInt(itemData.dateCell)).toLocaleString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Không rõ"}</td>
                </tr>
            `;
    }

    // If no history available
    if (editHistory.length === 0) {
        tooltipContent += `
            <tr class="no-history-row">
                <td colspan="9" class="no-history">Không có lịch sử chỉnh sửa</td>
            </tr>
        `;
    }

    tooltipContent += `
                </tbody>
            </table>
        </div>
        <div class="tooltip-footer">
            <small>Các ô được tô đỏ là dữ liệu đã thay đổi so với lần sửa trước</small>
        </div>
    `;

    tooltip.innerHTML = tooltipContent;

    // Style the tooltip to match main table width and position
    const totalWidth =
        columnWidths.slice(0, 6).reduce((sum, width) => sum + width, 0) +
        actionColumnsWidth +
        20; // Main columns + action columns + padding

    tooltip.style.cssText = `
        position: absolute;
        background: white;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 0;
        width: ${Math.max(totalWidth, mainTableRect.width)}px;
        max-height: 400px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 12px;
        font-family: inherit;
        line-height: 1.4;
    `;

    document.body.appendChild(tooltip);

    // Position tooltip below the row, aligned with main table
    const rect = row.getBoundingClientRect();
    const tableRect = mainTable.getBoundingClientRect();

    // Calculate precise alignment with main table columns
    const mainTableCells = mainTable.querySelector("tbody tr td");
    const firstCellRect = mainTableCells
        ? mainTableCells.getBoundingClientRect()
        : tableRect;

    let left = firstCellRect.left + window.scrollX; // Align with first data column, not table edge
    let top = rect.bottom + window.scrollY + 5;

    // Adjust if tooltip goes off screen
    if (left + totalWidth > window.innerWidth) {
        left = window.innerWidth - totalWidth - 10;
    }
    if (top + 400 > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - 405;
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    // Add close on click outside
    setTimeout(() => {
        document.addEventListener("click", handleTooltipClickOutside);
        document.addEventListener("keydown", handleTooltipKeydown);
    }, 100);
}

// Helper function to format date from timestamp
function formatHistoryDate(dateCell) {
    if (!dateCell || isNaN(dateCell)) return "";

    const date = new Date(parseInt(dateCell));
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);

    return `${day}-${month}-${year}`;
}

// Helper function to compare values and detect changes
function compareValues(oldValue, newValue, fieldName = "") {
    // Handle null/undefined/empty values
    const normalizeValue = (val) => {
        if (val === null || val === undefined) return "";
        // Convert to string and trim whitespace
        return String(val).trim();
    };

    const normalizedOld = normalizeValue(oldValue);
    const normalizedNew = normalizeValue(newValue);

    // Special handling for date fields (timestamps)
    if (
        fieldName === "dateCell" &&
        !isNaN(oldValue) &&
        !isNaN(newValue) &&
        oldValue &&
        newValue
    ) {
        const oldFormatted = formatHistoryDate(oldValue);
        const newFormatted = formatHistoryDate(newValue);
        if (oldFormatted && newFormatted) {
            return oldFormatted !== newFormatted;
        }
    }

    // For all other fields, do simple string comparison
    return normalizedOld !== normalizedNew;
}

// Enhanced CSS injection for the new table-style tooltip
function injectEnhancedEditHistoryStyles() {
    if (document.getElementById("enhancedEditHistoryStyles")) return;

    const style = document.createElement("style");
    style.id = "enhancedEditHistoryStyles";
    style.textContent = `
        .edit-history-tooltip .tooltip-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            margin: 0;
            border-radius: 10px 10px 0 0;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
        }

        .edit-history-tooltip .tooltip-table-container {
            max-height: 300px;
            overflow-y: auto;
            overflow-x: auto;
        }

        .edit-history-tooltip .history-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin: 0;
            table-layout: fixed; /* This ensures fixed column widths */
        }

        .edit-history-tooltip .history-table th:first-child,
        .edit-history-tooltip .history-table td:first-child {
            text-align: center;
            padding-left: 0;
            padding-right: 0;
        }

        .edit-history-tooltip .history-table th:nth-child(2),
        .edit-history-tooltip .history-table td:nth-child(2) {
            text-align: center;
            padding-left: 2px;
            padding-right: 2px;
        }

        .edit-history-tooltip .history-table th:nth-child(3),
        .edit-history-tooltip .history-table td:nth-child(3) {
            text-align: center;
            padding-left: 4px;
            padding-right: 4px;
        }

        .edit-history-tooltip .history-table th:nth-child(4),
        .edit-history-tooltip .history-table td:nth-child(4) {
            text-align: center;
            padding-left: 2px;
            padding-right: 2px;
        }

        .edit-history-tooltip .history-table th:nth-child(5),
        .edit-history-tooltip .history-table td:nth-child(5) {
            text-align: center;
            padding-left: 2px;
            padding-right: 2px;
        }

        .edit-history-tooltip .history-table th:nth-child(6),
        .edit-history-tooltip .history-table td:nth-child(6) {
            text-align: center;
            padding-left: 2px;
            padding-right: 2px;
        }

        .edit-history-tooltip .history-header-row {
            background: #f8f9fa;
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .edit-history-tooltip .history-table th {
            padding: 8px 6px;
            border: 1px solid #dee2e6;
            font-weight: 600;
            text-align: center;
            font-size: 10px;
            background: #e9ecef;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .edit-history-tooltip .history-table td {
            padding: 6px 4px;
            border: 1px solid #dee2e6;
            text-align: center;
            vertical-align: middle;
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 0;
        }

        .edit-history-tooltip .current-version {
            background: #d1ecf1;
            font-weight: 600;
        }

        .edit-history-tooltip .current-version .edit-number.current {
            background: #17a2b8;
            color: white;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 9px;
            font-weight: bold;
        }

        .edit-history-tooltip .history-row:nth-child(even) {
            background: #f8f9fa;
        }

        .edit-history-tooltip .history-row:nth-child(odd) {
            background: white;
        }

        .edit-history-tooltip .edit-number.original {
            background: #6c757d !important;
            color: white;
            border-radius: 4px;
            padding: 2px 6px;
            font-weight: 600;
            font-size: 9px;
            text-align: center;
        }

        .edit-history-tooltip .data-cell.changed {
            background-color: #ffebee !important;
            border: 2px solid #f44336 !important;
            color: #c62828 !important;
            font-weight: 700 !important;
            position: relative;
            animation: highlight-pulse 2s ease-in-out;
        }

        @keyframes highlight-pulse {
            0% { background-color: #ff5252; }
            50% { background-color: #ffebee; }
            100% { background-color: #ffebee; }
        }

        .edit-history-tooltip .data-cell.changed::before {
            content: '🔴';
            font-size: 8px;
            position: absolute;
            top: 2px;
            right: 3px;
            animation: blink 1.5s infinite;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0.3; }
        }

        .edit-history-tooltip .user-cell {
            background: #e8f5e8 !important;
            color: #2e7d32;
            font-weight: 600;
        }

        .edit-history-tooltip .timestamp-cell {
            background: #fff3e0 !important;
            color: #f57c00;
            font-size: 9px;
        }

        .edit-history-tooltip .no-history {
            padding: 30px;
            text-align: center;
            color: #6c757d;
            font-style: italic;
        }

        .edit-history-tooltip .tooltip-footer {
            background: #f8f9fa;
            padding: 10px 15px;
            border-radius: 0 0 10px 10px;
            border-top: 1px solid #dee2e6;
            text-align: center;
        }

        .edit-history-tooltip .tooltip-footer small {
            color: #6c757d;
            font-size: 10px;
        }

        /* Scrollbar styling */
        .edit-history-tooltip .tooltip-table-container::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        .edit-history-tooltip .tooltip-table-container::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        .edit-history-tooltip .tooltip-table-container::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 3px;
        }

        .edit-history-tooltip .tooltip-table-container::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
        }

        /* Responsive adjustments */
        @media (max-width: 1200px) {
            .edit-history-tooltip .history-table th,
            .edit-history-tooltip .history-table td {
                font-size: 9px;
                padding: 4px 2px;
            }
        }
    `;

    document.head.appendChild(style);
}

// Initialize enhanced styles
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        injectEnhancedEditHistoryStyles,
    );
} else {
    injectEnhancedEditHistoryStyles();
}

function renderEditChanges(oldData, newData) {
    if (!oldData || !newData) {
        return '<em style="color: #6c757d;">Không có dữ liệu thay đổi</em>';
    }

    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    // Define field display names
    const fieldNames = {
        dateCell: "Ngày",
        mauLive: "Mẫu live",
        tienQC: "Tiền QC",
        thoiGian: "Thời gian",
        soMonLive: "Số món trên live",
        soMonInbox: "Số món inbox",
    };

    allKeys.forEach((key) => {
        // Skip metadata fields
        if (
            ["id", "user", "editHistory", "createdBy", "createdAt"].includes(
                key,
            )
        ) {
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

    return changes.length > 0
        ? changes.join("")
        : '<em style="color: #28a745;">Không có thay đổi</em>';
}

function formatValueForDisplay(value, field) {
    if (value === null || value === undefined) {
        return '<span style="color: #6c757d; font-style: italic;">Không có</span>';
    }

    // Special formatting for date fields
    if (field === "dateCell" && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString("vi-VN");
        }
    }

    // Truncate long strings
    const stringValue = value.toString();
    if (stringValue.length > 80) {
        return stringValue.substring(0, 80) + "...";
    }

    return stringValue;
}

function handleTooltipClickOutside(event) {
    const tooltip = document.getElementById("editHistoryTooltip");
    if (tooltip && !tooltip.contains(event.target)) {
        removeEditHistoryTooltip();
    }
}

function handleTooltipKeydown(event) {
    if (event.key === "Escape") {
        removeEditHistoryTooltip();
    }
}

function removeEditHistoryTooltip() {
    const existingTooltip = document.getElementById("editHistoryTooltip");
    if (existingTooltip) {
        existingTooltip.remove();
        document.removeEventListener("click", handleTooltipClickOutside);
        document.removeEventListener("keydown", handleTooltipKeydown);
    }
}

// =====================================================
// ENHANCED DATE FORMATTING WITH TIME PERIOD
// =====================================================

// Enhanced formatDate function to include time period
function formatDateWithPeriod(date, startTime = null) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const baseDate = `${day}-${month}-${year}`;

    // If no start time provided, return basic date
    if (!startTime) return baseDate;

    // Parse start time to get hour
    const timeParts = startTime.split(":");
    if (timeParts.length !== 2) return baseDate;

    const startHour = parseInt(timeParts[0]);
    if (isNaN(startHour)) return baseDate;

    // Determine time period
    let period = "";
    if (startHour >= 6 && startHour < 12) {
        period = " (Sáng)";
    } else if (startHour >= 12 && startHour < 18) {
        period = " (Chiều)";
    } else {
        period = " (Tối)";
    }

    return baseDate + period;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>\"']/g, "").trim();
}

function numberWithCommas(x) {
    if (x === 0 || x === "0") return "0";
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    // Remove time period suffix if present
    let cleanDateStr = dateStr;
    const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
    const match = dateStr.match(periodPattern);
    if (match) {
        cleanDateStr = dateStr.replace(periodPattern, "").trim();
    }

    const parts = cleanDateStr.split("-");
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
        throw new Error("Invalid date format. Expected DD-MM-YY");
    }

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = 2000 + year;
    }

    const dateObj = new Date(year, month - 1, day);
    const timestamp =
        dateObj.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;

    return timestamp.toString();
}

function generateUniqueId() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Báo cáo Livestream",
) {
    const auth = getAuthState();
    const logEntry = {
        timestamp: new Date(),
        user: auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown",
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateUniqueId(),
    };

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
// FILTER SYSTEM
// =====================================================

function createFilterSystem() {
    if (document.getElementById("improvedFilterSystem")) {
        return;
    }

    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const filterContainer = document.createElement("div");
    filterContainer.id = "improvedFilterSystem";
    filterContainer.className = "filter-system";
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

    const tableContainer =
        document.querySelector(".table-container") ||
        (tableBody ? tableBody.parentNode : null);
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
    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");
    const todayBtn = document.getElementById("todayFilterBtn");
    const allBtn = document.getElementById("allFilterBtn");
    const clearBtn = document.getElementById("clearFiltersBtn");

    if (startDateFilter)
        startDateFilter.addEventListener("change", handleDateRangeChange);
    if (endDateFilter)
        endDateFilter.addEventListener("change", handleDateRangeChange);
    if (todayBtn) todayBtn.addEventListener("click", setTodayFilter);
    if (allBtn) allBtn.addEventListener("click", setAllFilter);
    if (clearBtn) clearBtn.addEventListener("click", clearAllFilters);

    applyFilters();
}

function handleDateRangeChange() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

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
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = localISODate;
    if (endDateFilter) endDateFilter.value = localISODate;

    currentFilters.startDate = localISODate;
    currentFilters.endDate = localISODate;

    applyFilters();
}

function setAllFilter() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    currentFilters.startDate = null;
    currentFilters.endDate = null;

    applyFilters();
}

function clearAllFilters() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    currentFilters = {
        startDate: null,
        endDate: null,
        status: "all",
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
                    row.style.display = "none";
                    return;
                }

                const cells = row.cells;
                if (cells.length > 0) {
                    const dateText = cells[0].innerText;
                    const rowDate = parseDisplayDate(dateText);
                    const matchDate = checkDateInRange(
                        rowDate,
                        currentFilters.startDate,
                        currentFilters.endDate,
                    );

                    if (matchDate) {
                        visibleCount++;
                        row.style.display = "table-row";
                    } else {
                        row.style.display = "none";
                    }
                }
            });

            updateFilterInfo(visibleCount, rows.length);

            hideFloatingAlert();
            showSuccess(`Hiển thị ${visibleCount} báo cáo`);
        } catch (error) {
            console.error("Error during filtering:", error);
            showError("Có lỗi xảy ra khi lọc dữ liệu");
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
        const startTime = new Date(startDateStr + "T00:00:00").getTime();
        if (rowTime < startTime) return false;
    }

    if (endDateStr) {
        const endTime = new Date(endDateStr + "T23:59:59").getTime();
        if (rowTime > endTime) return false;
    }

    return true;
}

function updateFilterInfo(visibleCount, totalCount) {
    const filterInfo = document.getElementById("filterInfo");
    if (!filterInfo) return;

    if (visibleCount !== totalCount) {
        let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} báo cáo`;

        if (currentFilters.startDate || currentFilters.endDate) {
            const startStr = currentFilters.startDate
                ? formatDateForDisplay(currentFilters.startDate)
                : "";
            const endStr = currentFilters.endDate
                ? formatDateForDisplay(currentFilters.endDate)
                : "";

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
        filterInfo.classList.remove("hidden");
    } else {
        filterInfo.classList.add("hidden");
    }
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

// =====================================================
// TABLE MANAGEMENT FUNCTIONS
// =====================================================

function renderTableFromData(dataArray, applyInitialFilter = false) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log("No data to render");
        createFilterSystem();
        return;
    }

    arrayData = [...dataArray];

    if (applyInitialFilter) {
        const today = new Date().toISOString().split("T")[0];
        currentFilters.startDate = today;
        currentFilters.endDate = today;
    }

    // Sort data by date (newest first)
    const sortedData = [...dataArray].sort((a, b) => {
        const timestampA = parseInt(a.dateCell) || 0;
        const timestampB = parseInt(b.dateCell) || 0;
        return timestampB - timestampA;
    });

    tableBody.innerHTML = "";
    const uniqueDates = new Set();
    const fragment = document.createDocumentFragment();

    const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const item = sortedData[i];
        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);

        // Extract start time and create formatted date with period
        let formattedTime = formatDate(dateCellConvert); // Basic format as fallback
        if (item.thoiGian) {
            const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
            const match = item.thoiGian.match(timePattern);
            if (match) {
                const startHour = parseInt(match[1]);
                const startMin = parseInt(match[2]);
                const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;
                formattedTime = formatDateWithPeriod(
                    dateCellConvert,
                    startTime,
                );
            }
        }

        if (formattedTime) {
            uniqueDates.add(formattedTime);
            const newRow = createTableRow(item, formattedTime);
            fragment.appendChild(newRow);
        }
    }

    tableBody.appendChild(fragment);
    arrayDate = Array.from(uniqueDates);

    createFilterSystem();

    console.log(
        `Rendered ${maxRender} / ${sortedData.length} reports with time periods`,
    );
}

function createTableRow(item, dateStr) {
    const newRow = document.createElement("tr");

    // Check if item has edit history
    const hasEditHistory = item.editHistory && item.editHistory.length > 0;

    // Get auth state for styling decisions
    const auth = getAuthState();
    const isAdmin = auth && parseInt(auth.checkLogin) === 0;

    // Apply styling based on edit history and admin status
    if (hasEditHistory) {
        // Rows that have been edited - yellow styling

        if (isAdmin) {
            newRow.classList.add("edited-row");
            newRow.style.borderLeft = "4px solid #ffc107";
            newRow.style.backgroundColor = "#fff3cd";
            newRow.title = "Hàng này đã được chỉnh sửa - Click để xem lịch sử";
            newRow.style.cursor = "pointer";
        }
    } else if (isAdmin) {
        // Rows that haven't been edited but admin can click - light blue styling
        newRow.classList.add("admin-clickable-row");
        newRow.style.borderLeft = "4px solid #17a2b8";
        newRow.style.backgroundColor = "#d1ecf1";
        newRow.style.cursor = "pointer";
        newRow.title = "Click để xem thông tin tạo (Admin only)";
    }

    // Extract start time from thoiGian if available
    let displayDate = dateStr;
    if (item.thoiGian) {
        const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
        const match = item.thoiGian.match(timePattern);
        if (match) {
            const startHour = parseInt(match[1]);
            const startMin = parseInt(match[2]);
            const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;

            // Parse the original date and add period
            const dateParts = dateStr.split("-");
            if (dateParts.length === 3) {
                const day = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]);
                let year = parseInt(dateParts[2]);
                if (year < 100) {
                    year = year < 50 ? 2000 + year : 1900 + year;
                }
                const fullDate = new Date(year, month - 1, day);
                displayDate = formatDateWithPeriod(fullDate, startTime);
            }
        }
    }

    // Helper function to format soMonInbox - show empty if 0
    function formatSoMonInbox(value) {
        if (!value || value === "0" || value === 0 || value === "0 món") {
            return ""; // Return empty string when value is 0
        }
        // If it already has " món" suffix, return as is
        if (typeof value === "string" && value.includes(" món")) {
            return value;
        }
        // Otherwise add " món" suffix
        return value + " món";
    }

    // Helper function to format other số món fields (soMonLive) - show "0 món" when 0
    function formatSoMonOther(value) {
        if (!value || value === "") {
            return "0 món";
        }
        // If it already has " món" suffix, return as is
        if (typeof value === "string" && value.includes(" món")) {
            return value;
        }
        // Otherwise add " món" suffix
        return value + " món";
    }

    const cells = [
        { content: sanitizeInput(displayDate), id: item.id }, // Use displayDate with period
        {
            content:
                sanitizeInput(item.mauLive || "") +
                (hasEditHistory ? ' <span class="edit-indicator"></span>' : ""),
        },
        {
            content: item.tienQC
                ? numberWithCommas(
                      sanitizeInput(item.tienQC.toString()).replace(
                          /[,\.]/g,
                          "",
                      ),
                  )
                : "0",
        },
        { content: sanitizeInput(item.thoiGian || "") },
        { content: formatSoMonOther(item.soMonLive) }, // Show "0 món" when 0
        { content: formatSoMonInbox(item.soMonInbox) }, // Show empty when 0
        { content: null, type: "edit" },
        { content: null, type: "delete", userId: item.user || "Unknown" },
    ];

    cells.forEach((cellData, index) => {
        const cell = document.createElement("td");

        if (cellData.type === "edit") {
            const editButton = document.createElement("button");
            editButton.className = "edit-button";
            editButton.addEventListener("mouseenter", () => {
                editButton.style.backgroundColor = "#f8f9fa";
            });
            editButton.addEventListener("mouseleave", () => {
                editButton.style.backgroundColor = "transparent";
            });
            cell.appendChild(editButton);
        } else if (cellData.type === "delete") {
            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.setAttribute("data-user", cellData.userId);
            deleteButton.addEventListener("mouseenter", () => {
                deleteButton.style.backgroundColor = "#ffe6e6";
            });
            deleteButton.addEventListener("mouseleave", () => {
                deleteButton.style.backgroundColor = "transparent";
            });
            cell.appendChild(deleteButton);
        } else {
            if (
                cellData.content &&
                cellData.content.includes('<span class="edit-indicator">')
            ) {
                cell.innerHTML = cellData.content;
            } else {
                cell.textContent = cellData.content;
            }
            if (cellData.id) cell.setAttribute("data-id", cellData.id);
        }

        newRow.appendChild(cell);
    });

    // Store edit history data on the row for tooltip access
    if (hasEditHistory) {
        newRow.setAttribute(
            "data-edit-history",
            JSON.stringify(item.editHistory),
        );
    }

    // Add click event for ADMIN to view history/info - ONLY ON CLICK
    if (isAdmin) {
        newRow.addEventListener("click", function (e) {
            // Don't trigger on button clicks
            if (
                e.target.classList.contains("edit-button") ||
                e.target.classList.contains("delete-button") ||
                e.target.closest("button")
            ) {
                return;
            }

            if (hasEditHistory) {
                // Show edit history tooltip for edited rows
                showEditHistoryTooltip(e, item.editHistory, newRow);
            } else {
                // Show creation info for non-edited rows
                //showCreationInfoTooltip(e, item, newRow);
            }
        });
    }

    // Apply role-based permissions
    if (auth) {
        applyRowPermissions(newRow, parseInt(auth.checkLogin));
    }

    return newRow;
}

function applyRowPermissions(row, userRole) {
    const deleteCell = row.cells[7];
    const editCell = row.cells[6];

    if (userRole === 0) {
        // Admin - can see both edit and delete buttons
        deleteCell.style.visibility = "visible";
        editCell.style.visibility = "visible";
    } else if (userRole === 1) {
        // Level 1 - can edit but not delete
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "visible";
    } else if (userRole === 2) {
        // Level 2 - can edit (soMonInbox only) but not delete
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "visible";
    } else {
        // Level 3+ - cannot edit or delete
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "hidden";
    }
}

function updateTable() {
    const cachedData = getCachedData();
    if (cachedData) {
        console.log("Loading from cache...");
        showLoading("Đang tải dữ liệu từ cache...");
        setTimeout(() => {
            renderTableFromData(cachedData, true);
            hideFloatingAlert();
        }, 100);
        return;
    }

    console.log("Loading from Firebase...");
    showLoading("Đang tải dữ liệu từ Firebase...");

    collectionRef
        .doc("reports")
        .get()
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

function initializeUpdatedForm() {
    if (ngayLive) {
        ngayLive.valueAsDate = new Date();
    }

    // Update HTML structure for time inputs
    const thoiGianContainer =
        document.querySelector('[for="thoiGian"]').parentNode;
    thoiGianContainer.innerHTML = `
        <label for="thoiGian">Thời gian:</label>
        <div id="thoiGianContainer" style="display: flex; gap: 5px; align-items: center;">
          <input type="number" id="hh1" min="0" max="23" placeholder="HH" style="width:50px;">
          :
          <input type="number" id="mm1" min="0" max="59" placeholder="MM" style="width:50px;">
          <span>đến</span>
          <input type="number" id="hh2" min="0" max="23" placeholder="HH" style="width:50px;">
          :
          <input type="number" id="mm2" min="0" max="59" placeholder="MM" style="width:50px;">
        </div>
    `;

    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", () => {
            if (hasPermission(3)) {
                if (
                    dataForm.style.display === "none" ||
                    dataForm.style.display === ""
                ) {
                    dataForm.style.display = "block";
                    toggleFormButton.textContent = "Ẩn biểu mẫu";
                } else {
                    dataForm.style.display = "none";
                    toggleFormButton.textContent = "Hiện biểu mẫu";
                }
            } else {
                showError("Không có quyền truy cập form");
            }
        });
    }

    // Form submit handler
    if (livestreamForm) {
        livestreamForm.addEventListener("submit", handleUpdatedFormSubmit);
    }

    // Amount input formatting (only numbers)
    const tienQCInput = document.getElementById("tienQC");
    if (tienQCInput) {
        tienQCInput.addEventListener("input", function () {
            // Only allow numbers and commas
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        tienQCInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = numberWithCommas(value);
            } else {
                this.value = "";
                showError("Tiền QC phải là số hợp lệ");
            }
        });
    }

    // Mau live input - only numbers
    const mauLiveInput = document.getElementById("mauLive");
    if (mauLiveInput) {
        mauLiveInput.addEventListener("input", function () {
            // Only allow numbers and commas
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        mauLiveInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Mẫu live phải là số hợp lệ");
            }
        });
    }

    // Số món live - only numbers
    const soMonLiveInput = document.getElementById("soMonLive");
    if (soMonLiveInput) {
        soMonLiveInput.addEventListener("input", function () {
            // Only allow numbers and commas
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonLiveInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            // FIXED: Allow 0 value for live dishes
            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món live phải là số không âm");
            }
        });
    }

    // FIX: Số món inbox - allow 0 value
    const soMonInboxInput = document.getElementById("soMonInbox");
    if (soMonInboxInput) {
        soMonInboxInput.addEventListener("input", function () {
            // Only allow numbers and commas
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonInboxInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            // FIXED: Explicitly allow 0 value for inbox dishes
            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món inbox phải là số không âm (có thể là 0)");
            }
        });
    }

    // Clear form button
    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", function () {
            const currentDate = new Date(ngayLive.value);
            ngayLive.valueAsDate = currentDate;
            livestreamForm.reset();
        });
    }
}

function handleUpdatedFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(3)) {
        showError("Không có quyền thêm báo cáo");
        return;
    }

    const currentDate = new Date(ngayLive.value);

    // Get and validate mau live (must be number)
    const mauLiveValue = document.getElementById("mauLive").value.trim();
    if (!mauLiveValue || isNaN(mauLiveValue) || parseInt(mauLiveValue) <= 0) {
        showError("Mẫu live phải là số nguyên dương.");
        return;
    }
    const mauLive = parseInt(mauLiveValue) + " mẫu";

    // Get and validate tien QC (must be number)
    let tienQC = document.getElementById("tienQC").value.replace(/[,\.]/g, "");
    tienQC = parseFloat(tienQC);
    if (isNaN(tienQC) || tienQC <= 0) {
        showError("Vui lòng nhập số tiền QC hợp lệ.");
        return;
    }

    // Get and validate time
    const hh1 = document.getElementById("hh1").value.padStart(2, "0");
    const mm1 = document.getElementById("mm1").value.padStart(2, "0");
    const hh2 = document.getElementById("hh2").value.padStart(2, "0");
    const mm2 = document.getElementById("mm2").value.padStart(2, "0");
    const startTime = `${hh1}:${mm1}`;
    const endTime = `${hh2}:${mm2}`;

    if (!startTime || !endTime) {
        showError("Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.");
        return;
    }

    const thoiGian = formatTimeRange(startTime, endTime);
    if (!thoiGian) {
        showError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu.");
        return;
    }

    // Get and validate số món live (must be number)
    const soMonLiveValue = document.getElementById("soMonLive").value.trim();
    if (
        !soMonLiveValue ||
        isNaN(soMonLiveValue) ||
        parseInt(soMonLiveValue) < 0
    ) {
        showError("Số món trên live phải là số không âm.");
        return;
    }
    const soMonLive = parseInt(soMonLiveValue) + " món";

    // Get and validate số món inbox - save empty string when 0
    const soMonInboxValue = document.getElementById("soMonInbox").value.trim();
    if (
        soMonInboxValue === "" ||
        isNaN(soMonInboxValue) ||
        parseInt(soMonInboxValue) < 0
    ) {
        showError("Số món inbox phải là số không âm (có thể là 0).");
        return;
    }

    // Store different values based on input
    let soMonInbox;
    const soMonInboxNumber = parseInt(soMonInboxValue);
    if (soMonInboxNumber === 0) {
        soMonInbox = ""; // Save empty string when 0
    } else {
        soMonInbox = soMonInboxNumber + " món"; // Save with " món" suffix when > 0
    }

    // Generate timestamp and unique ID
    const tempTimeStamp = new Date();
    const timestamp =
        currentDate.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    const auth = getAuthState();
    const userName = auth
        ? auth.userType
            ? auth.userType.split("-")[0]
            : "Unknown"
        : "Unknown";

    const dataToUpload = {
        id: uniqueId,
        dateCell: timestamp.toString(),
        mauLive: mauLive,
        tienQC: numberWithCommas(tienQC),
        thoiGian: thoiGian,
        soMonLive: soMonLive,
        soMonInbox: soMonInbox, // This will be empty string when 0, or "X món" when > 0
        user: userName,
        createdBy: userName,
        createdAt: new Date().toISOString(),
        editHistory: [],
    };

    // Create formatted date with period for display
    const formattedDate = formatDateWithPeriod(currentDate, startTime);

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertRow(0).replaceWith(newRow);

    // Reset form
    livestreamForm.reset();
    ngayLive.valueAsDate = currentDate;

    showLoading("Đang lưu báo cáo...");

    // Upload to Firebase
    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            const updateData = doc.exists
                ? {
                      ["data"]:
                          firebase.firestore.FieldValue.arrayUnion(
                              dataToUpload,
                          ),
                  }
                : { ["data"]: [dataToUpload] };

            const operation = doc.exists
                ? collectionRef.doc("reports").update(updateData)
                : collectionRef.doc("reports").set(updateData);

            return operation;
        })
        .then(() => {
            logAction(
                "add",
                `Thêm báo cáo livestream: ${mauLive}`,
                null,
                dataToUpload,
            );
            invalidateCache();
            showSuccess("Đã thêm báo cáo thành công!");
            console.log("Document uploaded successfully");
        })
        .catch((error) => {
            console.error("Error uploading document: ", error);
            newRow.remove();
            showError("Lỗi khi tải document lên.");
        });
}

// Function to format time range and calculate duration
function formatTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return null;

    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    // Handle overnight time (end time is next day)
    if (end <= start) {
        showError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu.");
        return null;
        //end.setDate(end.getDate() + 1);
    }

    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 0) {
        return null; // Invalid time range
    }

    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;

    const startFormatted = `${start.getHours().toString().padStart(2, "0")}h${start.getMinutes().toString().padStart(2, "0")}m`;
    const endFormatted = `${end.getHours().toString().padStart(2, "0")}h${end.getMinutes().toString().padStart(2, "0")}m`;

    let duration = "";
    if (hours > 0) {
        duration += `${hours}h`;
    }
    if (minutes > 0) {
        duration += `${minutes}m`;
    }
    if (!duration) {
        duration = "0m";
    }

    return `Từ ${startFormatted} đến ${endFormatted} - ${duration}`;
}

function handleFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(3)) {
        showError("Không có quyền thêm báo cáo");
        return;
    }

    const currentDate = new Date(ngayLive.value);
    const formattedDate = formatDate(currentDate);
    const mauLive = sanitizeInput(document.getElementById("mauLive").value);
    let tienQC = document.getElementById("tienQC").value.replace(/[,\.]/g, "");
    tienQC = parseFloat(tienQC);
    const thoiGian = sanitizeInput(document.getElementById("thoiGian").value);
    const soMonLive = sanitizeInput(document.getElementById("soMonLive").value);
    const soMonInbox = sanitizeInput(
        document.getElementById("soMonInbox").value,
    );

    // Validation
    if (isNaN(tienQC) || tienQC <= 0) {
        showError("Vui lòng nhập số tiền QC hợp lệ.");
        return;
    }

    if (!mauLive.trim()) {
        showError("Vui lòng nhập mô tả mẫu live.");
        return;
    }

    // Generate timestamp and unique ID
    const tempTimeStamp = new Date();
    const timestamp =
        currentDate.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    const auth = getAuthState();
    const userName = auth
        ? auth.userType
            ? auth.userType.split("-")[0]
            : "Unknown"
        : "Unknown";

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
        editHistory: [],
    };

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertRow(0).replaceWith(newRow);

    // Reset form
    livestreamForm.reset();
    ngayLive.valueAsDate = currentDate;

    showLoading("Đang lưu báo cáo...");

    // Upload to Firebase
    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            const updateData = doc.exists
                ? {
                      ["data"]:
                          firebase.firestore.FieldValue.arrayUnion(
                              dataToUpload,
                          ),
                  }
                : { ["data"]: [dataToUpload] };

            const operation = doc.exists
                ? collectionRef.doc("reports").update(updateData)
                : collectionRef.doc("reports").set(updateData);

            return operation;
        })
        .then(() => {
            logAction(
                "add",
                `Thêm báo cáo livestream: ${mauLive}`,
                null,
                dataToUpload,
            );
            invalidateCache();
            showSuccess("Đã thêm báo cáo thành công!");
            console.log("Document uploaded successfully");
        })
        .catch((error) => {
            console.error("Error uploading document: ", error);
            newRow.remove();
            showError("Lỗi khi tải document lên.");
        });
}

// =====================================================
// TABLE EVENT HANDLERS
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener("click", function (e) {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == "777") {
            return;
        }

        if (e.target.classList.contains("edit-button")) {
            handleEditButton(e);
        } else if (e.target.classList.contains("delete-button")) {
            handleDeleteButton(e);
        }
    });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = "block";

    const editDate = document.getElementById("editDate");
    const editMauLive = document.getElementById("editMauLive");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    // Lấy các trường thời gian mới
    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const row = e.target.parentNode.parentNode;
    const date = row.cells[0].innerText;
    const mauLive = row.cells[1].innerText;
    const tienQC = row.cells[2].innerText;
    const thoiGian = row.cells[3].innerText;
    const soMonLive = row.cells[4].innerText;
    const soMonInbox = row.cells[5].innerText;

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Set values for all fields first
    if (editDate) {
        // Convert DD-MM-YY (period) to YYYY-MM-DD for date input
        // Remove time period suffix first
        let cleanDate = date;
        const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
        if (periodPattern.test(date)) {
            cleanDate = date.replace(periodPattern, "").trim();
        }

        const parts = cleanDate.split("-");
        if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            let year = parseInt(parts[2]);
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            editDate.value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    if (editMauLive) {
        // Loại bỏ " mẫu" và edit indicator nếu có
        let cleanMauLive = mauLive
            .replace(" mẫu", "")
            .replace(" ✨", "")
            .replace(/\s*<span[^>]*>.*?<\/span>\s*/g, "");
        editMauLive.value = cleanMauLive;
    }

    if (editTienQC) {
        editTienQC.value = tienQC;
    }

    // Xử lý thời gian - parse từ format "Từ 20h00m đến 22h00m - 2h0m"
    if (thoiGian && thoiGian.trim()) {
        const timePattern =
            /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m/;
        const match = thoiGian.match(timePattern);

        if (match) {
            const [, startHour, startMin, endHour, endMin] = match;
            if (hh1) hh1.value = startHour;
            if (mm1) mm1.value = startMin;
            if (hh2) hh2.value = endHour;
            if (mm2) mm2.value = endMin;
            if (hh1.value < 12 && !hasPermission(0)) {
                editModal.style.display = "none";
                return;
            }
        } else {
            // Nếu không parse được, để trống các trường
            if (hh1) hh1.value = "";
            if (mm1) mm1.value = "";
            if (hh2) hh2.value = "";
            if (mm2) mm2.value = "";
        }
    } else {
        // Nếu không có thời gian, để trống
        if (hh1) hh1.value = "";
        if (mm1) mm1.value = "";
        if (hh2) hh2.value = "";
        if (mm2) mm2.value = "";
    }

    if (editSoMonLive) {
        // Loại bỏ " món"
        let cleanSoMonLive = soMonLive.replace(" món", "");
        editSoMonLive.value = cleanSoMonLive;
    }

    // Handle soMonInbox - if empty, set to 0 for editing
    if (editSoMonInbox) {
        // If cell is empty, set input to 0, otherwise remove " món" suffix
        if (soMonInbox.trim() === "") {
            editSoMonInbox.value = "0";
        } else {
            let cleanSoMonInbox = soMonInbox.replace(" món", "");
            editSoMonInbox.value = cleanSoMonInbox;
        }
    }

    // Apply permissions based on user level
    if (userLevel <= 1) {
        // Level 0 and 1 can edit everything
        if (editDate) editDate.disabled = false;
        if (editMauLive) editMauLive.disabled = false;
        if (editTienQC) editTienQC.disabled = false;
        if (hh1) hh1.disabled = false;
        if (mm1) mm1.disabled = false;
        if (hh2) hh2.disabled = false;
        if (mm2) mm2.disabled = false;
        if (editSoMonLive) editSoMonLive.disabled = false;
        if (editSoMonInbox) editSoMonInbox.disabled = false;
    } else if (userLevel === 2) {
        // Level 2 can only edit soMonInbox, others are readonly
        if (editDate) {
            editDate.disabled = true;
            editDate.style.backgroundColor = "#f8f9fa";
        }
        if (editMauLive) {
            editMauLive.readOnly = true;
            editMauLive.style.backgroundColor = "#f8f9fa";
        }
        if (editTienQC) {
            editTienQC.readOnly = true;
            editTienQC.style.backgroundColor = "#f8f9fa";
        }
        if (hh1) {
            hh1.readOnly = true;
            hh1.style.backgroundColor = "#f8f9fa";
        }
        if (mm1) {
            mm1.readOnly = true;
            mm1.style.backgroundColor = "#f8f9fa";
        }
        if (hh2) {
            hh2.readOnly = true;
            hh2.style.backgroundColor = "#f8f9fa";
        }
        if (mm2) {
            mm2.readOnly = true;
            mm2.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonLive) {
            editSoMonLive.readOnly = true;
            editSoMonLive.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonInbox) {
            editSoMonInbox.disabled = false;
            editSoMonInbox.readOnly = false;
            editSoMonInbox.style.backgroundColor = "white";
        }
    } else {
        // Level 3+ cannot edit anything
        if (editDate) editDate.disabled = true;
        if (editMauLive) editMauLive.disabled = true;
        if (editTienQC) editTienQC.disabled = true;
        if (hh1) hh1.disabled = true;
        if (mm1) mm1.disabled = true;
        if (hh2) hh2.disabled = true;
        if (mm2) mm2.disabled = true;
        if (editSoMonLive) editSoMonLive.disabled = true;
        if (editSoMonInbox) editSoMonInbox.disabled = true;
    }

    editingRow = row;
}

function handleDeleteButton(e) {
    if (!hasPermission(0)) {
        showError("Không đủ quyền thực hiện chức năng này.");
        return;
    }

    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
    if (!confirmDelete) return;

    const row = e.target.closest("tr");
    const firstCell = row.querySelector("td");

    if (!row || !firstCell) return;

    const recordId = firstCell.getAttribute("data-id");
    if (!recordId) {
        showError("Không tìm thấy ID báo cáo");
        return;
    }

    showLoading("Đang xóa báo cáo...");

    const oldData = {
        id: recordId,
        mauLive: row.cells[1].innerText,
        tienQC: row.cells[2].innerText,
        thoiGian: row.cells[3].innerText,
        soMonLive: row.cells[4].innerText,
        soMonInbox: row.cells[5].innerText,
    };

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error("Document does not exist");
            }

            const data = doc.data();
            const dataArray = data["data"] || [];

            const updatedArray = dataArray.filter(
                (item) => item.id !== recordId,
            );

            return collectionRef.doc("reports").update({ data: updatedArray });
        })
        .then(() => {
            logAction(
                "delete",
                `Xóa báo cáo livestream: ${oldData.mauLive}`,
                oldData,
                null,
            );
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
        editModal.style.display = "none";
    }
    editingRow = null;
}

function saveUpdatedChanges() {
    const editDate = document.getElementById("editDate");
    const editMauLive = document.getElementById("editMauLive");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    // Lấy các trường thời gian
    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Get current row data for comparison and fallback
    if (!editingRow) {
        showError("Không tìm thấy hàng cần chỉnh sửa.");
        return;
    }

    const currentRowData = {
        date: editingRow.cells[0].innerText,
        mauLive: editingRow.cells[1].innerText,
        tienQC: editingRow.cells[2].innerText,
        thoiGian: editingRow.cells[3].innerText,
        soMonLive: editingRow.cells[4].innerText,
        soMonInbox: editingRow.cells[5].innerText,
    };

    // Prepare values based on user permission level
    let finalValues = {};

    if (userLevel <= 1) {
        // Level 0 and 1 can edit everything - validate all fields
        const dateValue = editDate.value;
        const mauLiveValue = editMauLive.value.trim();
        const tienQCValue = editTienQC.value.trim();
        const soMonLiveValue = editSoMonLive.value.trim();
        const soMonInboxValue = editSoMonInbox.value.trim();

        // Validation for full edit permission
        if (!dateValue || !mauLiveValue || !tienQCValue) {
            showError("Vui lòng điền đầy đủ thông tin bắt buộc.");
            return;
        }

        // Validate mau live is number
        if (isNaN(mauLiveValue) || parseInt(mauLiveValue) <= 0) {
            showError("Mẫu live phải là số nguyên dương.");
            return;
        }

        const cleanAmount = tienQCValue.replace(/[,\.]/g, "");
        const numAmount = parseFloat(cleanAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            showError("Số tiền QC không hợp lệ.");
            return;
        }

        // Validate và format time
        let formattedTime = "";
        const startHour = hh1.value.trim();
        const startMin = mm1.value.trim();
        const endHour = hh2.value.trim();
        const endMin = mm2.value.trim();

        if (startHour && startMin && endHour && endMin) {
            const startTime = `${startHour.padStart(2, "0")}:${startMin.padStart(2, "0")}`;
            const endTime = `${endHour.padStart(2, "0")}:${endMin.padStart(2, "0")}`;
            formattedTime = formatTimeRange(startTime, endTime);

            if (!formattedTime) {
                showError("Thời gian không hợp lệ.");
                return;
            }
        }

        // Validate số món - allow 0 values
        if (isNaN(soMonLiveValue) || parseInt(soMonLiveValue) < 0) {
            showError("Số món trên live phải là số không âm.");
            return;
        }

        if (isNaN(soMonInboxValue) || parseInt(soMonInboxValue) < 0) {
            showError("Số món inbox phải là số không âm (có thể là 0).");
            return;
        }

        // Convert date back to timestamp
        const dateObj = new Date(dateValue);
        const editDateTimestamp =
            dateObj.getTime() +
            (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;

        // Format data with suffixes
        const finalMauLive = parseInt(mauLiveValue) + " mẫu";
        const finalSoMonLive = parseInt(soMonLiveValue) + " món";

        // Handle soMonInbox - empty string when 0, otherwise add suffix
        let finalSoMonInbox;
        const soMonInboxNumber = parseInt(soMonInboxValue);
        if (soMonInboxNumber === 0) {
            finalSoMonInbox = ""; // Save empty string when 0
        } else {
            finalSoMonInbox = soMonInboxNumber + " món";
        }

        finalValues = {
            dateCell: editDateTimestamp.toString(),
            mauLive: finalMauLive,
            tienQC: numberWithCommas(numAmount),
            thoiGian: formattedTime || currentRowData.thoiGian,
            soMonLive: finalSoMonLive,
            soMonInbox: finalSoMonInbox,
        };
    } else if (userLevel === 2) {
        // Level 2 can only edit soMonInbox
        const soMonInboxValue = editSoMonInbox.value.trim();

        // Validate only soMonInbox
        if (isNaN(soMonInboxValue) || parseInt(soMonInboxValue) < 0) {
            showError("Số món inbox phải là số không âm (có thể là 0).");
            return;
        }

        // Keep all other values from current row, only change soMonInbox
        let currentDateTimestamp;
        try {
            // Parse current date back to timestamp for consistency
            let cleanDate = currentRowData.date;
            const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
            if (periodPattern.test(currentRowData.date)) {
                cleanDate = currentRowData.date
                    .replace(periodPattern, "")
                    .trim();
            }

            const parts = cleanDate.split("-");
            if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                let year = parseInt(parts[2]);
                if (year < 100) {
                    year = year < 50 ? 2000 + year : 1900 + year;
                }
                const dateObj = new Date(year, month - 1, day);
                currentDateTimestamp =
                    dateObj.getTime() +
                    (new Date().getMinutes() * 60 + new Date().getSeconds()) *
                        1000;
            }
        } catch (error) {
            console.error("Error parsing current date:", error);
            currentDateTimestamp = Date.now();
        }

        // Handle soMonInbox - empty string when 0, otherwise add suffix
        let finalSoMonInbox;
        const soMonInboxNumber = parseInt(soMonInboxValue);
        if (soMonInboxNumber === 0) {
            finalSoMonInbox = ""; // Save empty string when 0
        } else {
            finalSoMonInbox = soMonInboxNumber + " món";
        }

        finalValues = {
            dateCell: currentDateTimestamp.toString(),
            mauLive: currentRowData.mauLive
                .replace(" ✨", "")
                .replace(/\s*<span[^>]*>.*?<\/span>\s*/g, ""), // Remove edit indicators
            tienQC: currentRowData.tienQC,
            thoiGian: currentRowData.thoiGian,
            soMonLive: currentRowData.soMonLive,
            soMonInbox: finalSoMonInbox, // Only this field changes
        };
    } else {
        showError("Không có quyền chỉnh sửa.");
        return;
    }

    const firstCell = editingRow.querySelector("td");
    if (!firstCell) {
        showError("Không tìm thấy cell đầu tiên.");
        return;
    }

    const recordId = firstCell.getAttribute("data-id");
    if (!recordId) {
        showError("Không tìm thấy ID của báo cáo.");
        return;
    }

    showLoading("Đang lưu thay đổi...");

    try {
        collectionRef
            .doc("reports")
            .get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error("Document does not exist");
                }

                const data = doc.data();
                const dataArray = data["data"] || [];

                const itemIndex = dataArray.findIndex(
                    (item) => item.id === recordId,
                );
                if (itemIndex === -1) {
                    throw new Error("Report not found");
                }

                const oldData = { ...dataArray[itemIndex] };
                const currentUser = auth
                    ? auth.userType
                        ? auth.userType.split("-")[0]
                        : "Unknown"
                    : "Unknown";

                // Prepare new data
                const newData = {
                    ...oldData,
                    ...finalValues, // Apply the final values based on permission level
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
                        soMonInbox: oldData.soMonInbox,
                    },
                    newData: {
                        dateCell: newData.dateCell,
                        mauLive: newData.mauLive,
                        tienQC: newData.tienQC,
                        thoiGian: newData.thoiGian,
                        soMonLive: newData.soMonLive,
                        soMonInbox: newData.soMonInbox,
                    },
                };

                // Initialize or update edit history
                if (!newData.editHistory) {
                    newData.editHistory = [];
                }
                newData.editHistory.push(editHistoryEntry);

                // Update the item in array
                dataArray[itemIndex] = newData;

                return collectionRef.doc("reports").update({ data: dataArray });
            })
            .then(() => {
                // Update the row in the table with edit indicators
                // Create display date with time period
                let formattedDisplayDate = formatDate(
                    new Date(parseInt(finalValues.dateCell)),
                );

                // Add time period if we have time information
                if (finalValues.thoiGian) {
                    const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
                    const match = finalValues.thoiGian.match(timePattern);
                    if (match) {
                        const startHour = parseInt(match[1]);
                        const startMin = parseInt(match[2]);
                        const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;
                        formattedDisplayDate = formatDateWithPeriod(
                            new Date(parseInt(finalValues.dateCell)),
                            startTime,
                        );
                    }
                }

                editingRow.cells[0].textContent = formattedDisplayDate;
                editingRow.cells[0].setAttribute("data-id", recordId);
                editingRow.cells[1].innerHTML =
                    finalValues.mauLive +
                    ' <span class="edit-indicator"></span>';
                editingRow.cells[2].textContent = finalValues.tienQC;
                editingRow.cells[3].textContent = finalValues.thoiGian;
                editingRow.cells[4].textContent = finalValues.soMonLive;
                editingRow.cells[5].textContent = finalValues.soMonInbox; // This will be empty when 0

                // Add visual indicators for edited row
                editingRow.classList.add("edited-row");
                editingRow.style.borderLeft = "4px solid #ffc107";
                editingRow.style.backgroundColor = "#fff3cd";
                editingRow.title =
                    "Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)";

                // Update stored data attributes
                editingRow.setAttribute(
                    "data-row-data",
                    JSON.stringify({
                        mauLive: finalValues.mauLive,
                        tienQC: finalValues.tienQC,
                        thoiGian: finalValues.thoiGian,
                        soMonLive: finalValues.soMonLive,
                        soMonInbox: finalValues.soMonInbox,
                    }),
                );

                const actionText =
                    userLevel === 2
                        ? "Sửa số món inbox"
                        : "Sửa báo cáo livestream";
                logAction(
                    "edit",
                    `${actionText}: ${finalValues.mauLive}`,
                    null,
                    null,
                );
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                showError("Lỗi khi cập nhật dữ liệu: " + error.message);
            });
    } catch (error) {
        console.error("Error in saveUpdatedChanges:", error);
        showError("Lỗi: " + error.message);
    }
}

// Helper function to extract time period from existing date string
function extractTimePeriod(dateString) {
    const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
    const match = dateString.match(periodPattern);
    return match ? match[1] : null;
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

function exportToExcel() {
    if (!hasPermission(1)) {
        showError("Không có quyền xuất dữ liệu");
        return;
    }

    try {
        showLoading("Đang chuẩn bị file Excel...");

        const wsData = [
            [
                "Ngày",
                "Mẫu live",
                "Tiền QC",
                "Thời gian",
                "Số món trên live",
                "Số món inbox",
            ],
        ];

        const tableRows = document.querySelectorAll("#tableBody tr");
        let exportedRowCount = 0;

        tableRows.forEach(function (row) {
            if (
                row.style.display !== "none" &&
                row.cells &&
                row.cells.length >= 6
            ) {
                const rowData = [];

                rowData.push(row.cells[0].textContent || "");
                rowData.push(row.cells[1].textContent || "");
                rowData.push(row.cells[2].textContent || "");
                rowData.push(row.cells[3].textContent || "");
                rowData.push(row.cells[4].textContent || "");
                rowData.push(row.cells[5].textContent || "");

                wsData.push(rowData);
                exportedRowCount++;
            }
        });

        if (exportedRowCount === 0) {
            showError("Không có dữ liệu để xuất ra Excel");
            return;
        }

        if (typeof XLSX === "undefined") {
            showError("Thư viện Excel không khả dụng. Vui lòng tải lại trang");
            return;
        }

        setTimeout(() => {
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Báo cáo Livestream");

            const fileName = `baocao_livestream_${new Date().toISOString().split("T")[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            showSuccess(`Đã xuất ${exportedRowCount} báo cáo ra Excel!`);
        }, 500);
    } catch (error) {
        console.error("Error exporting to Excel:", error);
        showError("Có lỗi xảy ra khi xuất dữ liệu ra Excel");
    }
}

// =====================================================
// LOGOUT FUNCTION
// =====================================================

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = "../index.html";
    }
}

// =====================================================
// CSS INJECTION FOR EDIT HISTORY
// =====================================================

function injectEditHistoryStyles() {
    if (document.getElementById("editHistoryStyles")) return;

    const style = document.createElement("style");
    style.id = "editHistoryStyles";
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

document.addEventListener("DOMContentLoaded", function () {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        window.location.href = "../index.html";
        return;
    }

    // Update UI based on user
    if (auth.userType) {
        const titleElement = document.querySelector(".tieude");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    // Show main container
    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    // Initialize CSS styles for edit history
    injectEditHistoryStyles();

    // Initialize components
    initializeUpdatedForm();
    initializeTableEvents();
    updateTable();

    // Add logout button event listener
    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    // Remove ads
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    console.log(
        "Livestream Report Management System with Edit History initialized successfully",
    );
});

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

// Export functions for global use
window.closeModal = closeModal;
window.saveUpdatedChanges = saveUpdatedChanges;
window.exportToExcel = exportToExcel;

// Fixed Edit History System - Using Modal Popup instead of Tooltip
// Add this to your existing JavaScript file

// =====================================================
// EDIT HISTORY MODAL FUNCTIONS
// =====================================================

function showEditHistoryModal(editHistory, rowData) {
    console.log("showEditHistoryModal called with:", editHistory, rowData); // Debug log

    // Remove existing modal if any
    removeEditHistoryModal();

    // Create modal overlay
    const modalOverlay = document.createElement("div");
    modalOverlay.id = "editHistoryModalOverlay";
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
    const modal = document.createElement("div");
    modal.id = "editHistoryModal";
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
                <strong>Mẫu live:</strong> ${rowData.mauLive || "N/A"}<br>
                <strong>Tiền QC:</strong> ${rowData.tienQC || "N/A"}<br>
                <strong>Thời gian:</strong> ${rowData.thoiGian || "N/A"}<br>
                <strong>Số món live:</strong> ${rowData.soMonLive || "N/A"}<br>
                <strong>Số món inbox:</strong> ${rowData.soMonInbox || "N/A"}
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
        const sortedHistory = [...editHistory].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
        );

        modalContent +=
            '<h4 style="margin: 0 0 15px 0; color: #2c3e50;">Lịch sử chỉnh sửa:</h4>';

        sortedHistory.forEach((history, index) => {
            const editDate = new Date(history.timestamp).toLocaleString(
                "vi-VN",
                {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                },
            );

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
                        <span style="font-weight: 600; color: #2c3e50;">${history.editedBy || "Unknown"}</span>
                        <span style="color: #6c757d; font-size: 11px;">${editDate}</span>
                    </div>
                    <div style="padding: 15px;">
                        ${renderEditChangesForModal(history.oldData, history.newData)}
                    </div>
                </div>
            `;
        });
    }

    modalContent += "</div>";
    modal.innerHTML = modalContent;
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // Close on overlay click
    modalOverlay.addEventListener("click", function (e) {
        if (e.target === modalOverlay) {
            removeEditHistoryModal();
        }
    });

    // Close on ESC key
    document.addEventListener("keydown", handleModalKeydown);
}

function renderEditChangesForModal(oldData, newData) {
    if (!oldData || !newData) {
        return '<em style="color: #6c757d;">Không có dữ liệu thay đổi</em>';
    }

    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    // Define field display names
    const fieldNames = {
        dateCell: "Ngày",
        mauLive: "Mẫu live",
        tienQC: "Tiền QC",
        thoiGian: "Thời gian",
        soMonLive: "Số món trên live",
        soMonInbox: "Số món inbox",
    };

    allKeys.forEach((key) => {
        // Skip metadata fields
        if (
            ["id", "user", "editHistory", "createdBy", "createdAt"].includes(
                key,
            )
        ) {
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

    return changes.length > 0
        ? changes.join("")
        : '<em style="color: #28a745;">Không có thay đổi</em>';
}

function formatValueForModal(value, field) {
    if (value === null || value === undefined) {
        return '<span style="color: #6c757d; font-style: italic;">Không có</span>';
    }

    // Special formatting for date fields
    if (field === "dateCell" && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString("vi-VN");
        }
    }

    // Truncate very long strings
    const stringValue = value.toString();
    if (stringValue.length > 100) {
        return stringValue.substring(0, 100) + "...";
    }

    return stringValue;
}

function handleModalKeydown(event) {
    if (event.key === "Escape") {
        removeEditHistoryModal();
    }
}

function removeEditHistoryModal() {
    const modal = document.getElementById("editHistoryModalOverlay");
    if (modal) {
        modal.remove();
        document.removeEventListener("keydown", handleModalKeydown);
    }
}

// Inject CSS for edit indicators
function injectEditHistoryCSS() {
    if (document.getElementById("editHistoryCSS")) return;

    const style = document.createElement("style");
    style.id = "editHistoryCSS";
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
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectEditHistoryCSS);
} else {
    injectEditHistoryCSS();
}

// =====================================================
// TOTAL CALCULATION FUNCTIONS - Updated to always show details
// =====================================================

// Biến global để theo dõi dữ liệu
let filteredDataForTotal = [];

// Hàm khởi tạo tổng tiền (gọi sau khi load data) - UPDATED
function initializeTotalCalculation() {
    // Luôn hiển thị chi tiết ngay từ ban đầu
    showTotalDetailsAlways();

    // Cập nhật tổng tiền
    updateAllTotals();
}

// Hàm hiển thị chi tiết luôn luôn - UPDATED
function showTotalDetailsAlways() {
    const totalGrid = document.querySelector(".total-grid");
    const totalSummary = document.querySelector(".total-summary");

    if (totalGrid) {
        // Hiển thị tất cả cards ngay từ đầu
        const totalCards = totalGrid.querySelectorAll(".total-card");
        totalCards.forEach((card) => {
            card.style.display = "block";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        });

        // Thiết lập grid để hiện tất cả cards
        totalGrid.style.gridTemplateColumns =
            "repeat(auto-fit, minmax(180px, 1fr))";
    }

    // Cập nhật title để không có click action
    if (totalSummary) {
        totalSummary.style.cursor = "default"; // Bỏ cursor pointer
        updateTotalSummaryTitle("Tổng kết Tiền QC");
    }
}

// Hàm cập nhật title của summary - UPDATED
function updateTotalSummaryTitle(newTitle) {
    const summaryTitle = document.querySelector(".total-summary h2");
    if (summaryTitle) {
        summaryTitle.textContent = newTitle;
    }
}

// Hàm tính tổng tiền từ dữ liệu - UNCHANGED
function calculateTotalAmounts() {
    // Sử dụng arrayData đã có từ Firebase
    if (!arrayData || arrayData.length === 0) {
        return {
            all: { amount: 0, count: 0 },
            today: { amount: 0, count: 0 },
            week: { amount: 0, count: 0 },
            month: { amount: 0, count: 0 },
            filtered: { amount: 0, count: 0 },
        };
    }

    const today = new Date();
    const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    );
    const endOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
    );

    // Tính tuần này (Chủ nhật đến Thứ 7)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Tính tháng này
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59,
    );

    const totals = {
        all: { amount: 0, count: 0 },
        today: { amount: 0, count: 0 },
        week: { amount: 0, count: 0 },
        month: { amount: 0, count: 0 },
        filtered: { amount: 0, count: 0 },
    };

    arrayData.forEach((item) => {
        // Parse tiền QC - loại bỏ dấu phẩy và chuyển về số
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        // Parse ngày từ timestamp
        const itemDate = new Date(parseInt(item.dateCell));

        // Tổng tất cả
        totals.all.amount += amount;
        totals.all.count++;

        // Hôm nay
        if (itemDate >= startOfToday && itemDate <= endOfToday) {
            totals.today.amount += amount;
            totals.today.count++;
        }

        // Tuần này
        if (itemDate >= startOfWeek && itemDate <= endOfWeek) {
            totals.week.amount += amount;
            totals.week.count++;
        }

        // Tháng này
        if (itemDate >= startOfMonth && itemDate <= endOfMonth) {
            totals.month.amount += amount;
            totals.month.count++;
        }
    });

    // Tính filtered data (sử dụng bộ lọc hiện tại)
    filteredDataForTotal = getFilteredDataForTotal();
    filteredDataForTotal.forEach((item) => {
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        totals.filtered.amount += amount;
        totals.filtered.count++;
    });

    return totals;
}

// Hàm lấy dữ liệu đã lọc cho tính tổng - UNCHANGED
function getFilteredDataForTotal() {
    if (!arrayData || arrayData.length === 0) return [];

    // Sử dụng bộ lọc hiện tại từ hệ thống filter chính
    if (
        currentFilters &&
        (currentFilters.startDate || currentFilters.endDate)
    ) {
        const startDate = currentFilters.startDate;
        const endDate = currentFilters.endDate;

        if (!startDate || !endDate) {
            return arrayData;
        }

        const startTime = new Date(startDate + "T00:00:00").getTime();
        const endTime = new Date(endDate + "T23:59:59").getTime();

        return arrayData.filter((item) => {
            const itemTime = parseInt(item.dateCell);
            return itemTime >= startTime && itemTime <= endTime;
        });
    }

    return arrayData;
}

// Hàm format số tiền - UNCHANGED
function formatCurrency(amount) {
    if (!amount && amount !== 0) return "0 ₫";
    return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

// Hàm cập nhật tất cả tổng tiền - UNCHANGED
function updateAllTotals() {
    const totals = calculateTotalAmounts();

    // Cập nhật UI
    const totalAllAmount = document.getElementById("totalAllAmount");
    const totalAllCount = document.getElementById("totalAllCount");
    const totalTodayAmount = document.getElementById("totalTodayAmount");
    const totalTodayCount = document.getElementById("totalTodayCount");
    const totalWeekAmount = document.getElementById("totalWeekAmount");
    const totalWeekCount = document.getElementById("totalWeekCount");
    const totalMonthAmount = document.getElementById("totalMonthAmount");
    const totalMonthCount = document.getElementById("totalMonthCount");
    const totalFilteredAmount = document.getElementById("totalFilteredAmount");
    const totalFilteredCount = document.getElementById("totalFilteredCount");

    if (totalAllAmount)
        totalAllAmount.textContent = formatCurrency(totals.all.amount);
    if (totalAllCount)
        totalAllCount.textContent = totals.all.count + " báo cáo";

    if (totalTodayAmount)
        totalTodayAmount.textContent = formatCurrency(totals.today.amount);
    if (totalTodayCount)
        totalTodayCount.textContent = totals.today.count + " báo cáo";

    if (totalWeekAmount)
        totalWeekAmount.textContent = formatCurrency(totals.week.amount);
    if (totalWeekCount)
        totalWeekCount.textContent = totals.week.count + " báo cáo";

    if (totalMonthAmount)
        totalMonthAmount.textContent = formatCurrency(totals.month.amount);
    if (totalMonthCount)
        totalMonthCount.textContent = totals.month.count + " báo cáo";

    if (totalFilteredAmount)
        totalFilteredAmount.textContent = formatCurrency(
            totals.filtered.amount,
        );
    if (totalFilteredCount)
        totalFilteredCount.textContent = totals.filtered.count + " báo cáo";

    console.log("Updated totals:", totals);
}

// Override hàm applyFilters hiện có để tự động cập nhật tổng tiền - UNCHANGED
const originalApplyFilters = window.applyFilters || applyFilters;
if (typeof originalApplyFilters === "function") {
    window.applyFilters = function () {
        originalApplyFilters.call(this);

        // Cập nhật tổng tiền sau khi apply filter
        setTimeout(() => {
            updateAllTotals();
        }, 200);
    };
}

// Override hàm renderTableFromData để tự động cập nhật tổng tiền - UNCHANGED
const originalRenderTableFromData = renderTableFromData;
renderTableFromData = function (dataArray, applyInitialFilter = false) {
    // Gọi hàm gốc
    originalRenderTableFromData.call(this, dataArray, applyInitialFilter);

    // Cập nhật tổng tiền sau khi render table
    setTimeout(() => {
        updateAllTotals();
    }, 100);
};

// Override hàm updateTable để tự động cập nhật tổng tiền - UNCHANGED
const originalUpdateTable = updateTable;
updateTable = function () {
    originalUpdateTable.call(this);

    // Khởi tạo total calculation sau khi load data
    setTimeout(() => {
        initializeTotalCalculation();
    }, 500);
};

// Thêm event listeners khi DOM ready - UPDATED
document.addEventListener("DOMContentLoaded", function () {
    // Khởi tạo total calculation nếu data đã có
    if (arrayData && arrayData.length > 0) {
        setTimeout(() => {
            initializeTotalCalculation();
        }, 1000);
    }

    // Override các hàm form submit để cập nhật tổng tiền
    const originalHandleUpdatedFormSubmit = handleUpdatedFormSubmit;
    handleUpdatedFormSubmit = function (e) {
        originalHandleUpdatedFormSubmit.call(this, e);

        // Cập nhật tổng tiền sau khi thêm mới
        setTimeout(() => {
            updateAllTotals();
        }, 1000);
    };
});

// Export các hàm để sử dụng global - UPDATED
window.initializeTotalCalculation = initializeTotalCalculation;
window.updateAllTotals = updateAllTotals;
