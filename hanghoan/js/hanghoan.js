// Hang Hoan Management System - Optimized Version
// Performance improvements: Optimistic UI, cached references, reduced Firebase calls

// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

const CACHE_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    STORAGE_KEY: "hanghoan_cache",
};

const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 300;

// =====================================================
// STATE MANAGEMENT
// =====================================================

// Firebase references (initialized on DOMContentLoaded)
let db = null;
let collectionRef = null;
let historyCollectionRef = null;

// Cache & Data
let cacheManager = null;
let localDataCache = null; // In-memory cache for instant access

// UI State
let notificationManager = null;
let editingRow = null;
let searchFilter = "";
let filterTimeout = null;
let currentLoadingNotification = null;

// Cached DOM Elements (populated once on init)
const DOM = {
    form: null,
    tableBody: null,
    toggleFormButton: null,
    dataForm: null,
    editModal: null,
    searchInput: null,
    emptyState: null,
    // Filter elements
    channelFilter: null,
    scenarioFilter: null,
    statusFilter: null,
    startDate: null,
    endDate: null,
    // Stats elements
    statTotal: null,
    statPending: null,
    statCompleted: null,
    statThisMonth: null,
};

// Cached auth state (refreshed periodically, not per-row)
let cachedAuthState = null;
let cachedUserRole = 777;

// =====================================================
// DOM CACHE INITIALIZATION
// =====================================================

function initializeDOMCache() {
    DOM.form = document.getElementById("return-product");
    DOM.tableBody = document.getElementById("tableBody");
    DOM.toggleFormButton = document.getElementById("toggleFormButton");
    DOM.dataForm = document.getElementById("dataForm");
    DOM.editModal = document.getElementById("editModal");
    DOM.searchInput = document.getElementById("searchInput");
    DOM.emptyState = document.getElementById("emptyState");

    // Filter elements
    DOM.channelFilter = document.getElementById("channelFilter");
    DOM.scenarioFilter = document.getElementById("scenarioFilter");
    DOM.statusFilter = document.getElementById("statusFilter");
    DOM.startDate = document.getElementById("startDate");
    DOM.endDate = document.getElementById("endDate");

    // Stats elements
    DOM.statTotal = document.getElementById("statTotal");
    DOM.statPending = document.getElementById("statPending");
    DOM.statCompleted = document.getElementById("statCompleted");
    DOM.statThisMonth = document.getElementById("statThisMonth");
}

function refreshAuthCache() {
    if (typeof authManager !== 'undefined' && authManager) {
        cachedAuthState = authManager.getAuthState();
        cachedUserRole = cachedAuthState ? parseInt(cachedAuthState.checkLogin || 777) : 777;
    }
}

// =====================================================
// NOTIFICATION FUNCTIONS
// =====================================================

function showLoading(message = "Đang xử lý...") {
    if (!notificationManager) return;
    if (currentLoadingNotification) {
        notificationManager.remove(currentLoadingNotification);
    }
    currentLoadingNotification = notificationManager.loading(message);
}

function hideLoading() {
    if (currentLoadingNotification && notificationManager) {
        notificationManager.remove(currentLoadingNotification);
        currentLoadingNotification = null;
    }
}

function showSuccess(message) {
    hideLoading();
    if (notificationManager) notificationManager.success(message);
}

function showError(message) {
    hideLoading();
    if (notificationManager) notificationManager.error(message);
}

function showInfo(message) {
    hideLoading();
    if (notificationManager) notificationManager.info(message);
}

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    // Return in-memory cache first (instant)
    if (localDataCache) return localDataCache;

    // Fall back to persistent cache
    if (cacheManager) {
        const data = cacheManager.get("hanghoan_data", "hanghoan");
        if (data) localDataCache = data;
        return data;
    }
    return null;
}

function setCachedData(data) {
    localDataCache = data; // Update in-memory cache
    if (cacheManager) {
        cacheManager.set("hanghoan_data", data, "hanghoan");
    }
}

function invalidateCache() {
    localDataCache = null;
    if (cacheManager) cacheManager.clear("hanghoan");
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"']/g, "").trim();
}

function formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year.toString().padStart(2, "0")}`;
}

function convertToTimestamp(dateString) {
    console.log('[HangHoan] convertToTimestamp input:', dateString);
    const parts = dateString.split("-");
    if (parts.length !== 3) {
        console.error('[HangHoan] Invalid date parts:', parts);
        return Date.now().toString(); // Fallback to current time
    }

    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    if (year < 100) year = 2000 + year;

    // Use Date constructor with explicit values (months are 0-indexed)
    const date = new Date(year, month - 1, day);

    if (isNaN(date.getTime())) {
        console.error('[HangHoan] Invalid date created:', year, month, day);
        return Date.now().toString(); // Fallback to current time
    }

    const timestamp = date.getTime();
    console.log('[HangHoan] convertToTimestamp output:', timestamp, '→', new Date(timestamp).toLocaleDateString());
    return timestamp.toString();
}

function isValidDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;
    // Accept formats: DD-MM-YY, DD/MM/YY, DD-MM-YYYY, DD/MM/YYYY
    const regex = /^(\d{2})[-\/](\d{2})[-\/](\d{2,4})$/;
    const match = dateStr.match(regex);
    if (!match) return false;
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function normalizeDate(dateStr) {
    // Convert various formats to DD-MM-YY
    const regex = /^(\d{2})[-\/](\d{2})[-\/](\d{2,4})$/;
    const match = dateStr.match(regex);
    if (!match) return dateStr;
    let year = match[3];
    if (year.length === 4) year = year.slice(-2); // 2026 -> 26
    return `${match[1]}-${match[2]}-${year}`;
}

// =====================================================
// LOGGING (Fire-and-forget, non-blocking)
// =====================================================

function logAction(action, description, oldData = null, newData = null) {
    if (!historyCollectionRef) return;

    const logEntry = {
        timestamp: new Date(),
        user: cachedAuthState?.displayName || cachedAuthState?.username || "Unknown",
        page: "Hàng hoàn",
        action,
        description,
        oldData,
        newData,
        id: Date.now() + "_" + Math.random().toString(36).substring(2, 11),
    };

    // Fire and forget - don't wait for this
    historyCollectionRef.add(logEntry).catch(() => {});
}

// =====================================================
// STATS UPDATE
// =====================================================

function updateStats(dataArray) {
    if (!Array.isArray(dataArray)) return;

    const total = dataArray.length;
    let completed = 0;
    let thisMonth = 0;

    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    // Single loop for all stats
    for (let i = 0; i < dataArray.length; i++) {
        const item = dataArray[i];
        if (item.muted) completed++;
        if (parseFloat(item.duyetHoanValue) >= firstDayOfMonth) thisMonth++;
    }

    if (DOM.statTotal) DOM.statTotal.textContent = total;
    if (DOM.statPending) DOM.statPending.textContent = total - completed;
    if (DOM.statCompleted) DOM.statCompleted.textContent = completed;
    if (DOM.statThisMonth) DOM.statThisMonth.textContent = thisMonth;
}

// =====================================================
// TABLE RENDERING - OPTIMIZED
// =====================================================

function updateTable(forceRefresh = false) {
    const cachedData = forceRefresh ? null : getCachedData();

    if (cachedData) {
        renderTableFromData(cachedData);
        updateStats(cachedData);
        hideLoading();
        return;
    }

    showLoading("Đang tải dữ liệu...");

    collectionRef.doc("hanghoan").get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data.data)) {
                    setCachedData(data.data);
                    renderTableFromData(data.data);
                    updateStats(data.data);
                    updateSuggestions();
                }
            }
            hideLoading();
        })
        .catch((error) => {
            console.error("Firebase error:", error);
            showError("Lỗi khi tải dữ liệu: " + (error.message || "Unknown error"));
        });
}

function renderTableFromData(dataArray) {
    if (!Array.isArray(dataArray) || !DOM.tableBody) return;

    const filteredData = applyFiltersToData(dataArray);

    // Handle empty state
    if (filteredData.length === 0) {
        if (DOM.emptyState) DOM.emptyState.classList.add("show");
        DOM.tableBody.innerHTML = "";
        return;
    }

    if (DOM.emptyState) DOM.emptyState.classList.remove("show");

    // Sort: active first, then by date descending
    filteredData.sort((a, b) => {
        if (a.muted !== b.muted) return a.muted ? 1 : -1;
        return parseInt(b.duyetHoanValue) - parseInt(a.duyetHoanValue);
    });

    // Batch render with DocumentFragment
    const fragment = document.createDocumentFragment();
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);

    // Refresh auth cache once before loop
    refreshAuthCache();

    for (let i = 0; i < maxRender; i++) {
        fragment.appendChild(renderSingleRow(filteredData[i], i + 1));
    }

    DOM.tableBody.innerHTML = "";
    DOM.tableBody.appendChild(fragment);

    // Only create icons for new elements in tableBody
    if (typeof lucide !== "undefined") {
        lucide.createIcons({ nodes: [DOM.tableBody] });
    }
}

function applyFiltersToData(dataArray) {
    // Get filter values once (using cached DOM refs)
    const channelFilter = (DOM.channelFilter?.value || "all").toLowerCase();
    const scenarioFilter = (DOM.scenarioFilter?.value || "all").toLowerCase();
    const statusFilterValue = (DOM.statusFilter?.value || "all").toLowerCase();
    const startDateVal = DOM.startDate?.value;
    const endDateVal = DOM.endDate?.value;

    const timestampStartDate = startDateVal ? new Date(startDateVal).getTime() : null;
    const timestampEndDate = endDateVal ? new Date(endDateVal).getTime() : null;
    const searchLower = searchFilter.toLowerCase();

    return dataArray.filter((item) => {
        // Channel filter
        if (channelFilter !== "all" && (item.shipValue || "").toLowerCase() !== channelFilter) {
            return false;
        }

        // Scenario filter
        if (scenarioFilter !== "all" && (item.scenarioValue || "").toLowerCase() !== scenarioFilter) {
            return false;
        }

        // Status filter
        if (statusFilterValue === "active" && item.muted) return false;
        if (statusFilterValue === "completed" && !item.muted) return false;

        // Date filter
        if (timestampStartDate && timestampEndDate) {
            const timestamp = parseFloat(item.duyetHoanValue);
            if (timestamp < timestampStartDate || timestamp > timestampEndDate) {
                return false;
            }
        }

        // Search filter
        if (searchLower) {
            const searchFields = [
                item.shipValue,
                item.scenarioValue,
                item.customerInfoValue,
                item.totalAmountValue,
                item.causeValue
            ].join(" ").toLowerCase();
            if (!searchFields.includes(searchLower)) return false;
        }

        return true;
    });
}

function renderSingleRow(item, sttNumber) {
    const timestamp = parseFloat(item.duyetHoanValue);
    const formattedTime = formatDate(new Date(timestamp));
    const rowId = item.duyetHoanValue || Date.now().toString();

    const tr = document.createElement("tr");
    tr.style.opacity = item.muted ? "0.5" : "1.0";
    tr.dataset.id = rowId;

    // Build row HTML in one go (faster than multiple createElement)
    tr.innerHTML = `
        <td id="${rowId}">${sttNumber}</td>
        <td>${sanitizeInput(item.shipValue || "")}</td>
        <td>${sanitizeInput(item.scenarioValue || "")}</td>
        <td>${sanitizeInput(item.customerInfoValue || "")}</td>
        <td>${sanitizeInput(item.totalAmountValue || "")}</td>
        <td>${sanitizeInput(item.causeValue || "")}</td>
        <td><input type="checkbox" class="received-checkbox" ${item.muted ? "checked" : ""}></td>
        <td>${formattedTime}</td>
        <td><button class="edit-button"><i data-lucide="edit-3"></i></button></td>
        <td><button class="delete-button" data-user="${item.user || 'Unknown'}"><i data-lucide="trash-2"></i></button></td>
    `;

    // Apply permissions using cached role (not fetched per row)
    applyRowPermissions(tr, cachedUserRole);

    return tr;
}

function applyRowPermissions(row, userRole) {
    if (userRole === 0) return; // Admin - full access

    const cells = row.cells;
    if (cells.length < 10) return;

    cells[9].style.visibility = "hidden"; // Delete button

    if (userRole !== 1) {
        cells[8].style.visibility = "hidden"; // Edit button
        cells[6].style.visibility = "hidden"; // Checkbox
    }
}

// =====================================================
// FORM HANDLING
// =====================================================

function initializeForm() {
    if (DOM.toggleFormButton) {
        DOM.toggleFormButton.addEventListener("click", () => {
            const isHidden = DOM.dataForm.style.display === "none" || !DOM.dataForm.classList.contains("show");
            DOM.dataForm.style.display = isHidden ? "block" : "none";
            DOM.dataForm.classList.toggle("show", isHidden);
        });
    }

    const closeForm = document.getElementById("closeForm");
    if (closeForm) {
        closeForm.addEventListener("click", () => {
            DOM.dataForm.style.display = "none";
            DOM.dataForm.classList.remove("show");
        });
    }

    if (DOM.form) {
        DOM.form.addEventListener("submit", handleFormSubmit);
    }

    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", () => DOM.form?.reset());
    }
}

function handleFormSubmit(event) {
    event.preventDefault();
    console.log('[HangHoan] handleFormSubmit called');

    const shipValue = sanitizeInput(DOM.form.querySelector("#ship").value);
    const scenarioValue = sanitizeInput(DOM.form.querySelector("#scenario").value);
    const customerInfoValue = sanitizeInput(DOM.form.querySelector("#customerInfo").value);
    const causeValue = sanitizeInput(DOM.form.querySelector("#cause").value);

    let totalAmountValue = DOM.form.querySelector("#totalAmount").value;
    const numericValue = Number(totalAmountValue.replace(/,/g, ""));
    if (!isNaN(numericValue) && numericValue >= 1000) {
        totalAmountValue = numericValue.toLocaleString("en");
    }

    if (!shipValue || !scenarioValue || !customerInfoValue || !totalAmountValue || !causeValue) {
        showError("Vui lòng điền đầy đủ thông tin");
        return;
    }

    // Check if Firebase is ready
    if (!collectionRef) {
        console.error('[HangHoan] collectionRef is null');
        alert('Lỗi: Database chưa sẵn sàng. Vui lòng refresh trang.');
        return;
    }

    const dataToUpload = {
        shipValue,
        scenarioValue,
        customerInfoValue,
        totalAmountValue,
        causeValue,
        duyetHoanValue: Date.now().toString(),
        user: cachedAuthState?.displayName || cachedAuthState?.username || "Unknown",
        muted: false,
    };

    // Optimistic UI: Add to local cache immediately (no loading block)
    const currentData = getCachedData() || [];
    currentData.unshift(dataToUpload);
    setCachedData(currentData);
    renderTableFromData(currentData);
    updateStats(currentData);

    DOM.form.reset();
    DOM.dataForm.style.display = "none";
    DOM.dataForm.classList.remove("show");
    showSuccess("Đã thêm đơn hàng!");
    console.log('[HangHoan] UI updated, saving to Firebase...');

    // Firebase update in background (non-blocking)
    collectionRef.doc("hanghoan").update({
        data: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
    }).then(() => {
        console.log('[HangHoan] Firebase add successful');
        logAction("add", `Thêm mới: ${customerInfoValue}`, null, dataToUpload);
    }).catch((error) => {
        console.error('[HangHoan] Firebase add error:', error);
        // Rollback on error
        const data = getCachedData() || [];
        const idx = data.findIndex(d => d.duyetHoanValue === dataToUpload.duyetHoanValue);
        if (idx !== -1) data.splice(idx, 1);
        setCachedData(data);
        renderTableFromData(data);
        updateStats(data);
        showError("Lỗi khi thêm: " + error.message);
        alert("Lỗi khi thêm: " + error.message);
    });
}

// =====================================================
// TABLE EVENT HANDLERS - OPTIMIZED
// =====================================================

function initializeTableEvents() {
    if (!DOM.tableBody) return;

    DOM.tableBody.addEventListener("click", function(e) {
        const editBtn = e.target.closest(".edit-button");
        const deleteBtn = e.target.closest(".delete-button");
        const checkbox = e.target.classList.contains("received-checkbox") ? e.target : null;

        if (editBtn) handleEditButton(editBtn);
        else if (deleteBtn) handleDeleteButton(deleteBtn);
        else if (checkbox) handleCheckboxClick(checkbox);
    });
}

function handleEditButton(button) {
    const row = button.closest("tr");
    if (!row || !DOM.editModal) return;

    const cells = row.cells;
    const offset = cells[0]?.querySelector('.row-select-checkbox') ? 1 : 0;

    document.getElementById("editDelivery").value = cells[1 + offset]?.innerText || "";
    document.getElementById("eidtScenario").value = cells[2 + offset]?.innerText || "";
    document.getElementById("editInfo").value = cells[3 + offset]?.innerText || "";
    document.getElementById("editAmount").value = cells[4 + offset]?.innerText || "";
    document.getElementById("editNote").value = cells[5 + offset]?.innerText || "";
    document.getElementById("editDate").value = cells[7 + offset]?.innerText || "";

    editingRow = row;
    DOM.editModal.classList.add("show");
    DOM.editModal.style.display = "flex";

    if (typeof lucide !== "undefined") {
        lucide.createIcons({ nodes: [DOM.editModal] });
    }
}

function handleDeleteButton(button) {
    if (!confirm("Bạn có chắc chắn muốn xóa?")) return;

    const row = button.closest("tr");
    const rowId = row?.dataset?.id || row?.querySelector("td[id]")?.id;

    if (!rowId) {
        showError("Không thể xác định đơn hàng");
        return;
    }

    // Check if Firebase is ready
    if (!collectionRef) {
        alert('Lỗi: Database chưa sẵn sàng. Vui lòng refresh trang.');
        return;
    }

    // Optimistic UI: Remove from display immediately
    const currentData = getCachedData() || [];
    const itemIndex = currentData.findIndex(item => item.duyetHoanValue === rowId);

    if (itemIndex === -1) {
        showError("Không tìm thấy đơn hàng");
        return;
    }

    const deletedItem = currentData[itemIndex];
    currentData.splice(itemIndex, 1);
    setCachedData(currentData);

    // Animate row removal
    row.style.transition = "opacity 0.2s";
    row.style.opacity = "0";
    setTimeout(() => {
        renderTableFromData(currentData);
        updateStats(currentData);
    }, 200);

    // Firebase update in background (non-blocking)
    collectionRef.doc("hanghoan").update({ data: currentData })
        .then(() => {
            showSuccess("Đã xóa!");
            console.log('[HangHoan] Delete successful');
            logAction("delete", `Xóa: ${deletedItem.customerInfoValue}`, deletedItem, null);
        })
        .catch((error) => {
            console.error('[HangHoan] Delete error:', error);
            // Rollback
            currentData.splice(itemIndex, 0, deletedItem);
            setCachedData(currentData);
            renderTableFromData(currentData);
            updateStats(currentData);
            showError("Lỗi khi xóa: " + error.message);
        });
}

function handleCheckboxClick(checkbox) {
    const isChecked = checkbox.checked;
    const row = checkbox.closest("tr");
    const rowId = row?.dataset?.id || row?.querySelector("td[id]")?.id;

    // Check if Firebase is ready
    if (!collectionRef) {
        checkbox.checked = !isChecked;
        alert('Lỗi: Database chưa sẵn sàng. Vui lòng refresh trang.');
        return;
    }

    // Optimistic UI: Update immediately (no confirm, no loading)
    row.style.opacity = isChecked ? "0.5" : "1.0";

    const currentData = getCachedData() || [];
    const itemIndex = currentData.findIndex(item => item.duyetHoanValue === rowId);

    if (itemIndex === -1) {
        checkbox.checked = !isChecked;
        row.style.opacity = isChecked ? "1.0" : "0.5";
        return;
    }

    currentData[itemIndex].muted = isChecked;
    setCachedData(currentData);
    updateStats(currentData);

    // Firebase update in background (non-blocking, silent)
    collectionRef.doc("hanghoan").update({ data: currentData })
        .then(() => {
            console.log('[HangHoan] Checkbox update successful');
            logAction("update", `${isChecked ? "Đánh dấu" : "Hủy"}: ${currentData[itemIndex].customerInfoValue}`);
        })
        .catch((error) => {
            console.error('[HangHoan] Checkbox update error:', error);
            // Rollback silently
            currentData[itemIndex].muted = !isChecked;
            setCachedData(currentData);
            checkbox.checked = !isChecked;
            row.style.opacity = isChecked ? "1.0" : "0.5";
            updateStats(currentData);
            showError("Lỗi: " + error.message);
        });
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    if (DOM.editModal) {
        DOM.editModal.style.display = "none";
        DOM.editModal.classList.remove("show");
    }
    editingRow = null;
}

function saveChanges() {
    console.log('[HangHoan] saveChanges called');

    const deliveryValue = sanitizeInput(document.getElementById("editDelivery").value);
    const scenarioValue = sanitizeInput(document.getElementById("eidtScenario").value);
    const infoValue = sanitizeInput(document.getElementById("editInfo").value);
    const amountValue = document.getElementById("editAmount").value.trim();
    const noteValue = sanitizeInput(document.getElementById("editNote").value);
    const dateValue = document.getElementById("editDate").value;

    if (!isValidDateFormat(dateValue)) {
        showError("Định dạng ngày: DD-MM-YY hoặc DD/MM/YYYY");
        alert("Định dạng ngày: DD-MM-YY hoặc DD/MM/YYYY");
        return;
    }

    // Normalize date to DD-MM-YY format
    const normalizedDate = normalizeDate(dateValue);

    if (!deliveryValue || !scenarioValue || !infoValue || !amountValue || !noteValue) {
        showError("Vui lòng điền đầy đủ thông tin");
        alert("Vui lòng điền đầy đủ thông tin");
        return;
    }

    if (!editingRow) {
        console.error('[HangHoan] No editing row');
        return;
    }

    const rowId = editingRow.dataset?.id || editingRow.querySelector("td[id]")?.id;
    if (!rowId) {
        console.error('[HangHoan] No row ID found');
        return;
    }

    // Check if Firebase is ready
    if (!collectionRef) {
        console.error('[HangHoan] collectionRef is null');
        alert('Lỗi: Database chưa sẵn sàng. Vui lòng refresh trang.');
        return;
    }

    const currentData = getCachedData() || [];
    const itemIndex = currentData.findIndex(item => item.duyetHoanValue === rowId);

    if (itemIndex === -1) {
        showError("Không tìm thấy đơn hàng");
        return;
    }

    const oldData = { ...currentData[itemIndex] };

    // Only update timestamp if date actually changed
    const oldDateStr = formatDate(new Date(parseFloat(oldData.duyetHoanValue)));
    const dateChanged = oldDateStr !== normalizedDate;
    const newTimestamp = dateChanged ? convertToTimestamp(normalizedDate) : oldData.duyetHoanValue;

    console.log('[HangHoan] Date comparison:', { oldDateStr, normalizedDate, dateChanged });

    // Update local data
    currentData[itemIndex] = {
        ...currentData[itemIndex],
        shipValue: deliveryValue,
        scenarioValue: scenarioValue,
        customerInfoValue: infoValue,
        totalAmountValue: amountValue,
        causeValue: noteValue,
        duyetHoanValue: newTimestamp, // Only changes if date was modified
        user: cachedAuthState?.displayName || cachedAuthState?.username || "Unknown",
    };

    const updatedItem = currentData[itemIndex];

    // Optimistic UI update (no loading block)
    setCachedData(currentData);
    renderTableFromData(currentData);
    closeModal();
    showSuccess("Đã lưu!");
    console.log('[HangHoan] UI updated, saving to Firebase...');

    // Firebase update in background (non-blocking)
    collectionRef.doc("hanghoan").update({ data: currentData })
        .then(() => {
            console.log('[HangHoan] Firebase save successful');
            logAction("edit", `Sửa: ${infoValue}`, oldData, updatedItem);
        })
        .catch((error) => {
            console.error('[HangHoan] Firebase save error:', error);
            // Rollback
            currentData[itemIndex] = oldData;
            setCachedData(currentData);
            renderTableFromData(currentData);
            showError("Lỗi: " + error.message);
            alert("Lỗi lưu: " + error.message);
        });
}

// =====================================================
// SUGGESTIONS
// =====================================================

function updateSuggestions() {
    const data = getCachedData();
    if (!data || data.length === 0) return;

    const causes = new Set();
    const infos = new Set();

    const limit = Math.min(data.length, 200);
    for (let i = 0; i < limit; i++) {
        if (data[i].causeValue) causes.add(data[i].causeValue);
        if (data[i].customerInfoValue) infos.add(data[i].customerInfoValue);
    }

    const dataListCause = document.getElementById("suggestionsCause");
    const dataListInfo = document.getElementById("suggestionsInfo");

    if (dataListCause) {
        dataListCause.innerHTML = [...causes].map(v => `<option value="${v}">`).join("");
    }
    if (dataListInfo) {
        dataListInfo.innerHTML = [...infos].map(v => `<option value="${v}">`).join("");
    }
}

// =====================================================
// FILTER INITIALIZATION
// =====================================================

function initializeFilters() {
    const filterElements = [DOM.channelFilter, DOM.scenarioFilter, DOM.statusFilter, DOM.startDate, DOM.endDate];

    filterElements.forEach(el => {
        if (el) {
            el.addEventListener("change", () => {
                if (filterTimeout) clearTimeout(filterTimeout);
                filterTimeout = setTimeout(() => {
                    renderTableFromData(getCachedData() || []);
                }, FILTER_DEBOUNCE_DELAY);
            });
        }
    });

    if (DOM.searchInput) {
        DOM.searchInput.addEventListener("input", (e) => {
            searchFilter = e.target.value;
            if (filterTimeout) clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                renderTableFromData(getCachedData() || []);
            }, FILTER_DEBOUNCE_DELAY);
        });
    }

    const btnRefresh = document.getElementById("btnRefresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            btnRefresh.disabled = true;
            invalidateCache();
            updateTable(true);
            setTimeout(() => { btnRefresh.disabled = false; }, 1000);
        });
    }
}

// =====================================================
// CORE UTILITIES INITIALIZATION
// =====================================================

function initializeCoreUtilities() {
    if (typeof PersistentCacheManager === 'undefined') {
        console.error('PersistentCacheManager not available');
        return false;
    }
    cacheManager = new PersistentCacheManager(CACHE_CONFIG);
    return true;
}

function ensureCoreUtilitiesLoaded(callback) {
    let callbackCalled = false;
    const safeCallback = () => {
        if (callbackCalled) return;
        if (initializeCoreUtilities()) {
            callbackCalled = true;
            callback();
        }
    };

    // Check if already loaded (multiple ways to detect)
    const isLoaded = window.CORE_UTILITIES_LOADED ||
                     typeof PersistentCacheManager !== 'undefined' ||
                     typeof window.PersistentCacheManager !== 'undefined';

    if (isLoaded) {
        safeCallback();
        if (callbackCalled) return;
    }

    // Try waiting for events
    document.addEventListener('coreUtilitiesLoaded', safeCallback, { once: true });
    window.addEventListener('sharedModulesLoaded', safeCallback, { once: true });

    // Fallback: poll for availability (max 5 seconds)
    let attempts = 0;
    const checkInterval = setInterval(() => {
        if (callbackCalled) {
            clearInterval(checkInterval);
            return;
        }
        attempts++;
        if (typeof PersistentCacheManager !== 'undefined') {
            clearInterval(checkInterval);
            safeCallback();
        } else if (attempts > 50) {
            clearInterval(checkInterval);
            console.error('Core utilities failed to load');
        }
    }, 100);
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", function() {
    console.log('[HangHoan] Starting initialization...');

    // Initialize Firebase first
    if (typeof initializeFirestore === 'undefined') {
        console.error('[HangHoan] initializeFirestore not available');
        alert('Lỗi: Firebase config chưa load. Vui lòng refresh trang.');
        return;
    }

    db = initializeFirestore();
    if (!db) {
        console.error('[HangHoan] Firestore initialization failed');
        alert('Lỗi kết nối database. Vui lòng refresh trang.');
        return;
    }

    collectionRef = db.collection("hanghoan");
    historyCollectionRef = db.collection("edit_history");
    console.log('[HangHoan] Firebase initialized');

    // Initialize DOM cache
    initializeDOMCache();

    // Attach critical event handlers immediately (don't wait for core utils)
    const saveButton = document.getElementById("saveButton");
    if (saveButton) {
        saveButton.addEventListener("click", saveChanges);
    }

    // Initial icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Wait for core utilities (for caching and notifications)
    ensureCoreUtilitiesLoaded(function() {
        console.log('[HangHoan] Core utilities loaded');

        // Check auth
        if (typeof authManager !== 'undefined' && authManager && !authManager.isAuthenticated()) {
            setTimeout(() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = "../index.html";
            }, 100);
            return;
        }

        // Initialize notifications
        if (typeof NotificationManager !== 'undefined') {
            notificationManager = new NotificationManager();
        }
        refreshAuthCache();

        initializeForm();
        initializeTableEvents();
        initializeFilters();

        // Load data immediately (no delay)
        updateTable();

        console.log('[HangHoan] Initialization complete');
    });
});

// Global exports
window.closeModal = closeModal;
window.saveChanges = saveChanges;
