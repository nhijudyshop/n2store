// Hang Hoan Management System - Modern UI Version with Complete Notifications
// Updated to use NotificationManager with full notification coverage

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

// Cache configuration
const CACHE_EXPIRY = 10 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 300;

// In-memory cache
let memoryCache = {
    data: null,
    timestamp: null,
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const collectionRef = db.collection("hanghoan");
const historyCollectionRef = db.collection("edit_history");

// Notification Manager
let notificationManager;

// DOM Elements
const form = document.getElementById("return-product");
const tableBody = document.getElementById("tableBody");
const toggleFormButton = document.getElementById("toggleFormButton");
const dataForm = document.getElementById("dataForm");
const editModal = document.getElementById("editModal");
const searchInput = document.getElementById("searchInput");

// Global variables
let editingRow;
let statusFilter = "all";
let searchFilter = "";
let filterTimeout = null;
let currentLoadingNotification = null;

// =====================================================
// NOTIFICATION FUNCTIONS (using NotificationManager)
// =====================================================

function showLoading(message = "Đang xử lý...") {
    if (currentLoadingNotification) {
        notificationManager.remove(currentLoadingNotification);
    }
    currentLoadingNotification = notificationManager.loading(message);
}

function hideLoading() {
    if (currentLoadingNotification) {
        notificationManager.remove(currentLoadingNotification);
        currentLoadingNotification = null;
    }
}

function showSuccess(message) {
    hideLoading();
    notificationManager.success(message);
}

function showError(message) {
    hideLoading();
    notificationManager.error(message);
}

function showWarning(message) {
    hideLoading();
    notificationManager.warning(message);
}

function showInfo(message) {
    hideLoading();
    notificationManager.info(message);
}

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                return memoryCache.data;
            } else {
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
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"']/g, "").trim();
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
    const parts = dateString.split("-");
    if (parts.length !== 3) throw new Error("Invalid date format");

    let year = parseInt(parts[2]);
    if (year < 100) year = 2000 + year;

    const formattedDate = `${year}-${parts[1]}-${parts[0]}`;
    const timestamp =
        new Date(formattedDate).getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    return timestamp.toString();
}

function isValidDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;
    const regex = /^\d{2}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const parts = dateStr.split("-");
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 0;
}

function parseDateText(dateText) {
    const parts = dateText.split("-");
    if (parts.length !== 3) return NaN;
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    year += year < 100 ? 2000 : 0;
    return new Date(year, month, day).getTime() / 1000;
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null) {
    try {
        const auth = authManager ? authManager.getAuthState() : null;
        const logEntry = {
            timestamp: new Date(),
            user: auth
                ? auth.displayName || auth.username || "Unknown"
                : "Unknown",
            page: "Hàng hoàn",
            action: action,
            description: description,
            oldData: oldData,
            newData: newData,
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        };

        historyCollectionRef.add(logEntry).catch((error) => {
            console.error("Error saving log entry:", error);
        });
    } catch (error) {
        console.error("Error in logAction:", error);
    }
}

// =====================================================
// STATS UPDATE
// =====================================================

function updateStats(dataArray) {
    try {
        if (!Array.isArray(dataArray)) return;

        const total = dataArray.length;
        const completed = dataArray.filter((item) => item.muted).length;
        const pending = total - completed;

        // This month
        const now = new Date();
        const firstDayOfMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
        ).getTime();
        const thisMonth = dataArray.filter((item) => {
            const itemDate = parseFloat(item.duyetHoanValue);
            return itemDate >= firstDayOfMonth;
        }).length;

        document.getElementById("statTotal").textContent = total;
        document.getElementById("statPending").textContent = pending;
        document.getElementById("statCompleted").textContent = completed;
        document.getElementById("statThisMonth").textContent = thisMonth;
    } catch (error) {
        console.error("Error updating stats:", error);
    }
}

// =====================================================
// TABLE MANAGEMENT
// =====================================================

function updateTable() {
    const cachedData = getCachedData();
    if (cachedData) {
        try {
            renderTableFromData(cachedData);
            return;
        } catch (error) {
            console.error("Error rendering from cache:", error);
            showError("Lỗi khi hiển thị dữ liệu từ bộ nhớ đệm");
            invalidateCache();
        }
    }

    showLoading("Đang tải dữ liệu...");

    collectionRef
        .doc("hanghoan")
        .get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (!Array.isArray(data["data"])) {
                    showError("Dữ liệu không hợp lệ");
                    return;
                }

                setCachedData(data["data"]);
                renderTableFromData(data["data"]);
                updateStats(data["data"]);
                hideLoading();
                updateSuggestions();
            } else {
                showError("Không tìm thấy dữ liệu");
            }
        })
        .catch((error) => {
            console.error("Lỗi lấy document:", error);
            showError(
                "Lỗi khi tải dữ liệu: " + (error.message || "Unknown error"),
            );
        });
}

function renderTableFromData(dataArray) {
    try {
        if (!Array.isArray(dataArray)) {
            console.error("Invalid data array");
            return;
        }

        const filteredData = applyFiltersToData(dataArray);

        // Update empty state
        const emptyState = document.getElementById("emptyState");
        if (filteredData.length === 0) {
            emptyState.classList.add("show");
            tableBody.innerHTML = "";
            return;
        } else {
            emptyState.classList.remove("show");
        }

        const sortedData = filteredData.sort((a, b) => {
            if (a.muted !== b.muted) return a.muted ? 1 : -1;
            return parseInt(b.duyetHoanValue) - parseInt(a.duyetHoanValue);
        });

        tableBody.innerHTML = "";
        const fragment = document.createDocumentFragment();
        const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);

        for (let i = 0; i < maxRender; i++) {
            const row = renderSingleRow(sortedData[i], i + 1);
            fragment.appendChild(row);
        }

        tableBody.appendChild(fragment);
        updateSuggestions();

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    } catch (error) {
        console.error("Error rendering table:", error);
        showError("Lỗi khi hiển thị bảng dữ liệu");
    }
}

function applyFiltersToData(dataArray) {
    try {
        const channelFilter = document
            .getElementById("channelFilter")
            .value.toLowerCase();
        const scenarioFilter = document
            .getElementById("scenarioFilter")
            .value.toLowerCase();
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;

        const timestampStartDate = startDate
            ? new Date(startDate).getTime() / 1000
            : null;
        const timestampEndDate = endDate
            ? new Date(endDate).getTime() / 1000
            : null;

        return dataArray.filter((item) => {
            // Channel filter
            const channelText = (item.shipValue || "").trim().toLowerCase();
            const channelMatch =
                channelFilter === "all" || channelText === channelFilter;

            // Scenario filter
            const scenarioText = (item.scenarioValue || "")
                .trim()
                .toLowerCase();
            const scenarioMatch =
                scenarioFilter === "all" || scenarioText === scenarioFilter;

            // Date filter
            const timestamp = parseFloat(item.duyetHoanValue);
            const dateMatch =
                !timestampStartDate ||
                !timestampEndDate ||
                (timestamp / 1000 >= timestampStartDate &&
                    timestamp / 1000 <= timestampEndDate);

            // Status filter
            const statusMatch =
                statusFilter === "all" ||
                (statusFilter === "active" && !item.muted) ||
                (statusFilter === "completed" && item.muted);

            // Search filter
            const searchMatch =
                !searchFilter ||
                Object.values(item).some((val) =>
                    String(val)
                        .toLowerCase()
                        .includes(searchFilter.toLowerCase()),
                );

            return (
                channelMatch &&
                scenarioMatch &&
                dateMatch &&
                statusMatch &&
                searchMatch
            );
        });
    } catch (error) {
        console.error("Error filtering data:", error);
        return dataArray;
    }
}

function renderSingleRow(item, sttNumber) {
    try {
        const timestamp = parseFloat(item.duyetHoanValue);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);

        const newRow = document.createElement("tr");
        newRow.style.opacity = item.muted ? "0.5" : "1.0";

        const cells = [
            { content: sttNumber, id: item.duyetHoanValue },
            { content: sanitizeInput(item.shipValue || "") },
            { content: sanitizeInput(item.scenarioValue || "") },
            { content: sanitizeInput(item.customerInfoValue || "") },
            { content: sanitizeInput(item.totalAmountValue || "") },
            { content: sanitizeInput(item.causeValue || "") },
            { content: null, type: "checkbox", checked: Boolean(item.muted) },
            { content: formattedTime.replace(/\//g, "-") },
            { content: null, type: "edit" },
            { content: null, type: "delete", userId: item.user || "Unknown" },
        ];

        cells.forEach((cellData) => {
            const cell = document.createElement("td");

            if (cellData.type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.className = "received-checkbox";
                checkbox.checked = cellData.checked;
                cell.appendChild(checkbox);
            } else if (cellData.type === "edit") {
                const editButton = document.createElement("button");
                editButton.innerHTML = '<i data-lucide="edit-3"></i>';
                editButton.className = "edit-button";
                cell.appendChild(editButton);
            } else if (cellData.type === "delete") {
                const deleteButton = document.createElement("button");
                deleteButton.className = "delete-button";
                deleteButton.innerHTML = '<i data-lucide="trash-2"></i>';
                deleteButton.id = cellData.userId;
                cell.appendChild(deleteButton);
            } else {
                cell.textContent = cellData.content;
                if (cellData.id) cell.id = cellData.id;
            }

            newRow.appendChild(cell);
        });

        // Apply permissions
        if (authManager) {
            const auth = authManager.getAuthState();
            if (auth) {
                const userRole = parseInt(auth.checkLogin || 777);
                applyRowPermissions(newRow, userRole);
            }
        }

        return newRow;
    } catch (error) {
        console.error("Error rendering row:", error);
        const errorRow = document.createElement("tr");
        errorRow.innerHTML =
            '<td colspan="10" style="color: red;">Lỗi hiển thị dữ liệu</td>';
        return errorRow;
    }
}

function applyRowPermissions(row, userRole) {
    try {
        const deleteCell = row.cells[9];
        const editCell = row.cells[8];
        const checkboxCell = row.cells[6];

        if (userRole !== 0) {
            deleteCell.style.visibility = "hidden";
            if (userRole === 1) {
                checkboxCell.style.visibility = "visible";
                editCell.style.visibility = "visible";
            } else {
                editCell.style.visibility = "hidden";
                checkboxCell.style.visibility = "hidden";
            }
        }
    } catch (error) {
        console.error("Error applying permissions:", error);
    }
}

// =====================================================
// FORM HANDLING
// =====================================================

function initializeForm() {
    try {
        if (toggleFormButton) {
            toggleFormButton.addEventListener("click", () => {
                if (
                    dataForm.style.display === "none" ||
                    !dataForm.classList.contains("show")
                ) {
                    dataForm.style.display = "block";
                    dataForm.classList.add("show");
                    showInfo("Đã mở form thêm đơn hàng", 1500);
                } else {
                    dataForm.style.display = "none";
                    dataForm.classList.remove("show");
                    showInfo("Đã đóng form", 1500);
                }
            });
        }

        // Close form button
        const closeForm = document.getElementById("closeForm");
        if (closeForm) {
            closeForm.addEventListener("click", () => {
                dataForm.style.display = "none";
                dataForm.classList.remove("show");
                showInfo("Đã đóng form", 1500);
            });
        }

        if (form) {
            form.addEventListener("submit", handleFormSubmit);
        }

        // Clear button
        const clearDataButton = document.getElementById("clearDataButton");
        if (clearDataButton) {
            clearDataButton.addEventListener("click", () => {
                form.reset();
                showInfo("Đã reset form", 1500);
            });
        }
    } catch (error) {
        console.error("Error initializing form:", error);
        showError("Lỗi khởi tạo form");
    }
}

function handleFormSubmit(event) {
    event.preventDefault();

    try {
        const shipValue = sanitizeInput(form.querySelector("#ship").value);
        const scenarioValue = sanitizeInput(
            form.querySelector("#scenario").value,
        );
        const customerInfoValue = sanitizeInput(
            form.querySelector("#customerInfo").value,
        );

        let totalAmountValue = form.querySelector("#totalAmount").value;
        let numericValue = Number(totalAmountValue.replace(/,/g, ""));
        if (!isNaN(numericValue) && numericValue >= 1000) {
            totalAmountValue = numericValue.toLocaleString("en");
        }

        const causeValue = sanitizeInput(form.querySelector("#cause").value);

        if (
            !shipValue ||
            !scenarioValue ||
            !customerInfoValue ||
            !totalAmountValue ||
            !causeValue
        ) {
            showError("Vui lòng điền đầy đủ thông tin");
            return;
        }

        const tempTimeStamp = new Date();
        const auth = authManager ? authManager.getAuthState() : null;

        const dataToUpload = {
            shipValue,
            scenarioValue,
            customerInfoValue,
            totalAmountValue,
            causeValue,
            duyetHoanValue: tempTimeStamp.getTime().toString(),
            user: auth
                ? auth.displayName || auth.username || "Unknown"
                : "Unknown",
            muted: false,
        };

        showLoading("Đang thêm đơn hàng...");

        collectionRef
            .doc("hanghoan")
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

                return doc.exists
                    ? collectionRef.doc("hanghoan").update(updateData)
                    : collectionRef.doc("hanghoan").set(updateData);
            })
            .then(() => {
                showSuccess("Đã thêm đơn hàng thành công!");
                logAction(
                    "add",
                    `Thêm mới đơn hàng hoàn: ${customerInfoValue}`,
                    null,
                    dataToUpload,
                );
                invalidateCache();
                updateTable();
                form.reset();
                dataForm.style.display = "none";
                dataForm.classList.remove("show");
            })
            .catch((error) => {
                console.error("Error uploading document:", error);
                showError(
                    "Lỗi khi thêm đơn hàng: " +
                        (error.message || "Unknown error"),
                );
            });
    } catch (error) {
        console.error("Error in form submit:", error);
        showError("Lỗi xử lý form: " + (error.message || "Unknown error"));
    }
}

// =====================================================
// TABLE EVENT HANDLERS
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener("click", function (e) {
        try {
            if (
                e.target.classList.contains("edit-button") ||
                e.target.closest(".edit-button")
            ) {
                handleEditButton(e);
            } else if (
                e.target.classList.contains("delete-button") ||
                e.target.closest(".delete-button")
            ) {
                handleDeleteButton(e);
            } else if (
                e.target.type === "checkbox" &&
                e.target.classList.contains("received-checkbox")
            ) {
                handleCheckboxClick(e);
            }
        } catch (error) {
            console.error("Error handling table click:", error);
            showError("Lỗi xử lý thao tác");
        }
    });
}

function handleEditButton(e) {
    try {
        if (!editModal) {
            showError("Không tìm thấy modal chỉnh sửa");
            return;
        }

        const button = e.target.closest("button");
        const row = button.closest("tr");

        if (!row || row.cells.length < 8) {
            showError("Không thể lấy thông tin hàng");
            return;
        }

        document.getElementById("editDelivery").value = row.cells[1].innerText;
        document.getElementById("eidtScenario").value = row.cells[2].innerText;
        document.getElementById("editInfo").value = row.cells[3].innerText;
        document.getElementById("editAmount").value = row.cells[4].innerText;
        document.getElementById("editNote").value = row.cells[5].innerText;
        document.getElementById("editDate").value = row.cells[7].innerText;

        editingRow = row;

        editModal.classList.add("show");
        editModal.style.display = "flex";

        // Initialize Lucide icons in modal
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        showInfo("Đã mở form chỉnh sửa", 1500);
    } catch (error) {
        console.error("Error in handleEditButton:", error);
        showError("Lỗi khi mở form chỉnh sửa");
    }
}

function handleDeleteButton(e) {
    try {
        if (!confirm("Bạn có chắc chắn muốn xóa?")) return;

        const button = e.target.closest("button");
        const row = button.closest("tr");
        const tdRow = row.querySelector("td");

        if (!tdRow || !tdRow.id) {
            showError("Không thể xác định đơn hàng cần xóa");
            return;
        }

        showLoading("Đang xóa đơn hàng...");

        const deleteData = {
            shipValue: row.cells[1].innerText,
            scenarioValue: row.cells[2].innerText,
            customerInfoValue: row.cells[3].innerText,
            totalAmountValue: row.cells[4].innerText,
            causeValue: row.cells[5].innerText,
            duyetHoanValue: tdRow.id,
        };

        collectionRef
            .doc("hanghoan")
            .get()
            .then((doc) => {
                if (!doc.exists) throw new Error("Document does not exist");

                const data = doc.data();
                const dataArray = data["data"] || [];
                const updatedArray = dataArray.filter(
                    (item) => item.duyetHoanValue !== tdRow.id,
                );

                return collectionRef
                    .doc("hanghoan")
                    .update({ data: updatedArray });
            })
            .then(() => {
                logAction(
                    "delete",
                    `Xóa đơn hàng hoàn: ${deleteData.customerInfoValue}`,
                    deleteData,
                    null,
                );
                invalidateCache();
                row.remove();
                showSuccess("Đã xóa đơn hàng thành công!");

                // Update stats after deletion
                setTimeout(() => updateTable(), 500);
            })
            .catch((error) => {
                console.error("Error deleting:", error);
                showError(
                    "Lỗi khi xóa đơn hàng: " +
                        (error.message || "Unknown error"),
                );
            });
    } catch (error) {
        console.error("Error in handleDeleteButton:", error);
        showError("Lỗi xử lý xóa đơn hàng");
    }
}

function handleCheckboxClick(e) {
    try {
        const isChecked = e.target.checked;
        const row = e.target.closest("tr");

        const confirmMsg = isChecked
            ? "Bạn có chắc đơn này đã được nhận hàng hoàn?"
            : "Đã hủy xác nhận nhận hàng hoàn";

        if (!confirm(confirmMsg)) {
            e.target.checked = !isChecked;
            return;
        }

        showLoading("Đang cập nhật trạng thái...");
        row.style.opacity = isChecked ? "0.5" : "1.0";

        const tdRow = row.querySelector("td");

        if (!tdRow || !tdRow.id) {
            showError("Không thể xác định đơn hàng");
            row.style.opacity = isChecked ? "1.0" : "0.5";
            e.target.checked = !isChecked;
            return;
        }

        collectionRef
            .doc("hanghoan")
            .get()
            .then((doc) => {
                if (!doc.exists) throw new Error("Document does not exist");

                const data = doc.data();
                const dataArray = data["data"] || [];
                const itemIndex = dataArray.findIndex(
                    (item) => item.duyetHoanValue === tdRow.id,
                );

                if (itemIndex === -1) throw new Error("Item not found");

                dataArray[itemIndex].muted = isChecked;

                return collectionRef
                    .doc("hanghoan")
                    .update({ data: dataArray });
            })
            .then(() => {
                const actionDesc = isChecked
                    ? "Đánh dấu đã nhận hàng hoàn"
                    : "Hủy đánh dấu đã nhận hàng hoàn";
                logAction("update", `${actionDesc}: ${row.cells[3].innerText}`);

                invalidateCache();
                showSuccess("Đã cập nhật trạng thái thành công!");

                setTimeout(() => updateTable(), 500);
            })
            .catch((error) => {
                console.error("Error updating status:", error);
                showError(
                    "Lỗi khi cập nhật trạng thái: " +
                        (error.message || "Unknown error"),
                );
                row.style.opacity = isChecked ? "1.0" : "0.5";
                e.target.checked = !isChecked;
            });
    } catch (error) {
        console.error("Error in handleCheckboxClick:", error);
        showError("Lỗi xử lý thay đổi trạng thái");
    }
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    try {
        if (editModal) {
            editModal.style.display = "none";
            editModal.classList.remove("show");
            showInfo("Đã đóng form chỉnh sửa", 1500);
        }
        editingRow = null;
    } catch (error) {
        console.error("Error closing modal:", error);
    }
}

function saveChanges() {
    try {
        const deliveryValue = sanitizeInput(
            document.getElementById("editDelivery").value,
        );
        const scenarioValue = sanitizeInput(
            document.getElementById("eidtScenario").value,
        );
        const infoValue = sanitizeInput(
            document.getElementById("editInfo").value,
        );
        const amountValue = document.getElementById("editAmount").value.trim();
        const noteValue = sanitizeInput(
            document.getElementById("editNote").value,
        );
        const dateValue = document.getElementById("editDate").value;

        if (!isValidDateFormat(dateValue)) {
            showError("Nhập đúng định dạng ngày: DD-MM-YY");
            return;
        }

        if (
            !deliveryValue ||
            !scenarioValue ||
            !infoValue ||
            !amountValue ||
            !noteValue
        ) {
            showError("Vui lòng điền đầy đủ thông tin bắt buộc");
            return;
        }

        if (!editingRow) {
            showError("Không tìm thấy hàng cần chỉnh sửa");
            return;
        }

        const tdRow = editingRow.querySelector("td");
        if (!tdRow || !tdRow.id) {
            showError("Không thể xác định đơn hàng cần chỉnh sửa");
            return;
        }

        showLoading("Đang lưu thay đổi...");

        const editDateTimestamp = convertToTimestamp(dateValue);

        const oldData = {
            shipValue: editingRow.cells[1].innerText,
            scenarioValue: editingRow.cells[2].innerText,
            customerInfoValue: editingRow.cells[3].innerText,
            totalAmountValue: editingRow.cells[4].innerText,
            causeValue: editingRow.cells[5].innerText,
            duyetHoanValue: tdRow.id,
        };

        const newData = {
            shipValue: deliveryValue,
            scenarioValue: scenarioValue,
            customerInfoValue: infoValue,
            totalAmountValue: amountValue,
            causeValue: noteValue,
            duyetHoanValue: editDateTimestamp,
        };

        collectionRef
            .doc("hanghoan")
            .get()
            .then((doc) => {
                if (!doc.exists) throw new Error("Document does not exist");

                const data = doc.data();
                const dataArray = data["data"] || [];
                const itemIndex = dataArray.findIndex(
                    (item) => item.duyetHoanValue === tdRow.id,
                );

                if (itemIndex === -1) throw new Error("Transaction not found");

                const auth = authManager ? authManager.getAuthState() : null;

                dataArray[itemIndex].shipValue = deliveryValue;
                dataArray[itemIndex].scenarioValue = scenarioValue;
                dataArray[itemIndex].customerInfoValue = infoValue;
                dataArray[itemIndex].totalAmountValue = amountValue;
                dataArray[itemIndex].causeValue = noteValue;
                dataArray[itemIndex].duyetHoanValue = editDateTimestamp;
                dataArray[itemIndex].user = auth
                    ? auth.displayName || auth.username || "Unknown"
                    : "Unknown";

                return collectionRef
                    .doc("hanghoan")
                    .update({ data: dataArray });
            })
            .then(() => {
                editingRow.cells[1].innerText = deliveryValue;
                editingRow.cells[2].innerText = scenarioValue;
                editingRow.cells[3].innerText = infoValue;
                editingRow.cells[4].innerText = amountValue;
                editingRow.cells[5].innerText = noteValue;
                editingRow.cells[7].innerText = dateValue;

                logAction(
                    "edit",
                    `Chỉnh sửa đơn hàng hoàn: ${infoValue}`,
                    oldData,
                    newData,
                );
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating:", error);
                showError(
                    "Lỗi khi cập nhật dữ liệu: " +
                        (error.message || "Unknown error"),
                );
            });
    } catch (error) {
        console.error("Error in saveChanges:", error);
        showError("Lỗi: " + (error.message || "Unknown error"));
    }
}

// =====================================================
// SUGGESTION SYSTEM
// =====================================================

function updateSuggestions() {
    try {
        if (!tableBody || tableBody.rows.length === 0) return;

        const uniqueValuesCause = new Set();
        const uniqueValuesInfo = new Set();

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

        const createOptions = (values) => {
            const fragment = document.createDocumentFragment();
            values.forEach((value) => {
                const option = document.createElement("option");
                option.value = value;
                fragment.appendChild(option);
            });
            return fragment;
        };

        const dataListCause = document.getElementById("suggestionsCause");
        const dataListInfo = document.getElementById("suggestionsInfo");

        if (dataListCause) {
            dataListCause.innerHTML = "";
            dataListCause.appendChild(createOptions(uniqueValuesCause));
        }
        if (dataListInfo) {
            dataListInfo.innerHTML = "";
            dataListInfo.appendChild(createOptions(uniqueValuesInfo));
        }
    } catch (error) {
        console.error("Error updating suggestions:", error);
    }
}

// =====================================================
// FILTER & SEARCH
// =====================================================

function initializeFilters() {
    try {
        const filters = [
            "channelFilter",
            "scenarioFilter",
            "statusFilter",
            "startDate",
            "endDate",
        ];

        filters.forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener("change", () => {
                    if (filterTimeout) clearTimeout(filterTimeout);
                    showInfo("Đang áp dụng bộ lọc...", 1000);
                    filterTimeout = setTimeout(() => {
                        updateTable();
                        showInfo("Đã áp dụng bộ lọc", 1500);
                    }, FILTER_DEBOUNCE_DELAY);
                });
            }
        });

        // Search input
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                searchFilter = e.target.value;
                if (filterTimeout) clearTimeout(filterTimeout);
                filterTimeout = setTimeout(
                    () => updateTable(),
                    FILTER_DEBOUNCE_DELAY,
                );
            });
        }

        // Refresh button
        const btnRefresh = document.getElementById("btnRefresh");
        if (btnRefresh) {
            btnRefresh.addEventListener("click", () => {
                showLoading("Đang làm mới dữ liệu...");
                invalidateCache();

                setTimeout(() => {
                    updateTable();
                    showSuccess("Đã làm mới dữ liệu thành công!");
                }, 500);
            });
        }
    } catch (error) {
        console.error("Error initializing filters:", error);
        showError("Lỗi khởi tạo bộ lọc");
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    try {
        // Check authentication
        if (!authManager || !authManager.isAuthenticated()) {
            showError("Phiên đăng nhập hết hạn, đang chuyển hướng...");
            setTimeout(() => {
                window.location.href = "../index.html";
            }, 1500);
            return;
        }

        // Initialize notification manager
        notificationManager = new NotificationManager();
        showInfo("Đang khởi tạo hệ thống...", 1500);

        // Initialize components
        initializeForm();
        initializeTableEvents();
        initializeFilters();

        // Load initial data
        showLoading("Đang tải dữ liệu ban đầu...");
        setTimeout(() => {
            updateTable();
        }, 300);

        // Save button in modal
        const saveButton = document.getElementById("saveButton");
        if (saveButton) {
            saveButton.addEventListener("click", saveChanges);
        }

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log("Hang Hoan Management System initialized successfully");
    } catch (error) {
        console.error("Critical initialization error:", error);
        if (notificationManager) {
            showError(
                "Lỗi khởi tạo hệ thống: " + (error.message || "Unknown error"),
            );
        } else {
            alert("Lỗi nghiêm trọng khi khởi tạo hệ thống!");
        }
    }
});

// Export for global use
window.closeModal = closeModal;
window.saveChanges = saveChanges;
