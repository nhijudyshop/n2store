// main-optimized.js - FIXED VERSION
// Phiên bản đã sửa lỗi checkbox và tối ưu hiệu suất

class MoneyTransferApp {
    constructor() {
        this.firebase = null;
        this.db = null;
        this.collectionRef = null;
        this.historyCollectionRef = null;
        this.virtualScrollManager = null;
        this.filterManager = null;
        this.isInitialized = false;
        this.initStartTime = performance.now();

        console.log("MoneyTransferApp initializing...");
    }

    async init() {
        try {
            performanceMonitor.start("appInit");

            // Check authentication first
            if (!this.checkAuthentication()) {
                return;
            }

            // Initialize Firebase
            await this.initFirebase();

            // Initialize managers
            this.initManagers();

            // Initialize UI
            this.initUI();

            // Load initial data
            await this.loadInitialData();

            this.isInitialized = true;
            const initTime = performanceMonitor.end("appInit");
            console.log(
                `App initialized successfully in ${initTime.toFixed(0)}ms`,
            );

            if (window.showSuccess) {
                window.showSuccess(
                    `Ứng dụng sẵn sàng (${initTime.toFixed(0)}ms)`,
                );
            }
        } catch (error) {
            console.error("App initialization failed:", error);
            if (window.showError) {
                window.showError(
                    "Không thể khởi tạo ứng dụng: " + error.message,
                );
            }
        }
    }

    checkAuthentication() {
        const auth = this.getAuthState();
        if (!auth || auth.isLoggedIn !== "true") {
            console.log("User not authenticated, redirecting...");
            window.location.href = "../index.html";
            return false;
        }

        console.log("User authenticated:", auth.userType);
        this.updateUIForUser(auth);
        return true;
    }

    getAuthState() {
        try {
            const stored = localStorage.getItem(CONFIG.data.AUTH_STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error("Error reading auth state:", error);
            return null;
        }
    }

    updateUIForUser(auth) {
        if (auth.userType) {
            const titleElement = domManager.get(".page-title");
            if (titleElement) {
                titleElement.textContent +=
                    " - " + (auth.displayName || auth.userType);
            }
        }

        const parentContainer = domManager.get("#parentContainer");
        if (parentContainer) {
            parentContainer.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
            `;
        }
    }

    async initFirebase() {
        try {
            this.firebase = firebase.initializeApp(CONFIG.firebase);
            this.db = firebase.firestore();
            this.collectionRef = this.db.collection(
                CONFIG.data.COLLECTION_NAME,
            );
            this.historyCollectionRef = this.db.collection(
                CONFIG.data.HISTORY_COLLECTION_NAME,
            );
            console.log("Firebase initialized successfully");
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            throw new Error("Không thể kết nối Firebase");
        }
    }

    initManagers() {
        try {
            this.virtualScrollManager = new VirtualScrollManager();
            window.virtualScrollManager = this.virtualScrollManager;

            this.filterManager = new FilterManager();
            window.filterManager = this.filterManager;

            console.log("Managers initialized successfully");
        } catch (error) {
            console.error("Manager initialization failed:", error);
            throw new Error("Không thể khởi tạo các module");
        }
    }

    initUI() {
        try {
            this.initForm();
            this.initTableEvents();
            this.initUIComponents();
            console.log("UI initialized successfully");
        } catch (error) {
            console.error("UI initialization failed:", error);
            throw new Error("Không thể khởi tạo giao diện");
        }
    }

    initForm() {
        const ngayck = domManager.get(SELECTORS.ngayck);
        if (ngayck) {
            // FIXED: Set Vietnam today as default date
            const vietnamToday = VietnamTime.getDateString();
            ngayck.value = vietnamToday;

            console.log("Form initialized with Vietnam date:", vietnamToday);
        }

        // Toggle form button (unchanged)
        const toggleFormButton = domManager.get(SELECTORS.toggleFormButton);
        const dataForm = domManager.get(SELECTORS.dataForm);

        if (toggleFormButton && dataForm) {
            toggleFormButton.addEventListener("click", () => {
                if (APP_STATE.isOperationInProgress) {
                    if (window.showError) {
                        window.showError(
                            "Có thao tác đang thực hiện, vui lòng đợi...",
                        );
                    }
                    return;
                }

                if (this.hasPermission(3)) {
                    const isHidden =
                        dataForm.style.display === "none" ||
                        dataForm.style.display === "";

                    if (isHidden) {
                        dataForm.style.display = "block";
                        toggleFormButton.textContent = "Ẩn biểu mẫu";

                        setTimeout(() => {
                            const firstInput = domManager.get(
                                SELECTORS.transferNote,
                            );
                            if (firstInput) firstInput.focus();
                        }, 200);
                    } else {
                        dataForm.style.display = "none";
                        toggleFormButton.textContent = "Hiện biểu mẫu";
                    }
                } else {
                    if (window.showError) {
                        window.showError("Không có quyền truy cập form");
                    }
                }
            });
        }

        // Form submit handler
        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            moneyTransferForm.addEventListener("submit", (e) =>
                this.handleFormSubmit(e),
            );
        }

        // Amount input formatting
        const transferAmountInput = domManager.get(SELECTORS.transferAmount);
        if (transferAmountInput) {
            transferAmountInput.addEventListener("blur", function () {
                let value = this.value.replace(/[,\.]/g, "");
                value = parseFloat(value);
                if (!isNaN(value) && value > 0) {
                    this.value = numberWithCommas(value);
                }
            });
        }

        // Clear form button
        const clearDataButton = domManager.get(SELECTORS.clearDataButton);
        if (clearDataButton) {
            clearDataButton.addEventListener("click", () => {
                if (APP_STATE.isOperationInProgress) return;

                const formInputs = moneyTransferForm.querySelectorAll(
                    "input, select, textarea",
                );
                formInputs.forEach((input) => {
                    input.value = "";
                });

                // FIXED: Reset to Vietnam today
                if (ngayck) {
                    ngayck.value = VietnamTime.getDateString();
                }

                console.log(
                    "Form reset with Vietnam date:",
                    VietnamTime.getDateString(),
                );
            });
        }
    }

    initTableEvents() {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        tableBody.addEventListener("click", (e) => {
            if (APP_STATE.isOperationInProgress) {
                if (window.showError) {
                    window.showError(
                        "Có thao tác đang thực hiện, vui lòng đợi...",
                    );
                }
                return;
            }

            const auth = this.getAuthState();
            if (!auth || auth.checkLogin == "777") {
                if (e.target.type === "checkbox") {
                    e.target.checked = false;
                }
                return;
            }

            if (e.target.classList.contains("edit-button")) {
                this.handleEditButton(e);
            } else if (e.target.classList.contains("delete-button")) {
                this.handleDeleteButton(e);
            } else if (e.target.type === "checkbox") {
                this.handleCheckboxClick(e);
            }
        });
    }

    initUIComponents() {
        const toggleLogoutButton = domManager.get(SELECTORS.toggleLogoutButton);
        if (toggleLogoutButton) {
            toggleLogoutButton.addEventListener("click", () =>
                this.handleLogout(),
            );
        }

        window.exportToExcel = () => this.exportToExcel();
        window.closeModal = () => this.closeModal();
        window.saveChanges = () => this.saveChanges();
    }

    // ===== DATA LOADING =====
    async loadInitialData() {
        try {
            performanceMonitor.start("initialDataLoad");

            const cachedData = cacheManager.get();
            if (cachedData) {
                console.log("Loading from cache...");
                await this.renderInitialData(cachedData);
                performanceMonitor.end("initialDataLoad");
                return;
            }

            console.log("Loading from Firebase...");
            if (window.showLoading) {
                window.showLoading("Đang tải dữ liệu từ Firebase...");
            }

            const doc = await this.collectionRef
                .doc(CONFIG.data.COLLECTION_NAME)
                .get();

            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    console.log(
                        `Loading ${data["data"].length} transactions from Firebase...`,
                    );

                    // FIXED: Process data with proper completed status
                    const processedData = data["data"].map((item) => {
                        const processedItem = ensureUniqueId(item);

                        // CRITICAL FIX: Convert 'muted' to 'completed' with correct logic
                        if (item.muted !== undefined) {
                            // muted: true = đã đi đơn = completed: true
                            // muted: false = chưa đi đơn = completed: false
                            processedItem.completed = Boolean(item.muted);
                            delete processedItem.muted; // Remove old property
                        } else {
                            // Default for new items
                            processedItem.completed = false; // Chưa đi đơn
                        }

                        return processedItem;
                    });

                    console.log("Data conversion summary:", {
                        total: processedData.length,
                        completed: processedData.filter(
                            (item) => item.completed,
                        ).length,
                        active: processedData.filter((item) => !item.completed)
                            .length,
                    });

                    cacheManager.set(processedData);
                    await this.renderInitialData(processedData);

                    if (window.showSuccess) {
                        window.showSuccess(
                            `Đã tải xong ${processedData.length} giao dịch!`,
                        );
                    }
                } else {
                    console.log("No data found or data array is empty");
                    this.filterManager.createFilterUI();
                    if (window.showError) {
                        window.showError("Không có dữ liệu");
                    }
                }
            } else {
                console.log("Document does not exist");
                this.filterManager.createFilterUI();
                if (window.showError) {
                    window.showError("Tài liệu không tồn tại");
                }
            }

            performanceMonitor.end("initialDataLoad");
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.filterManager.createFilterUI();
            if (window.showError) {
                window.showError("Lỗi khi tải dữ liệu từ Firebase");
            }
        }
    }

    async renderInitialData(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            console.log("No data to render");
            return;
        }

        performanceMonitor.start("renderInitialData");

        if (window.showLoading) {
            window.showLoading("Đang chuẩn bị dữ liệu...");
        }

        // Store in global state
        APP_STATE.arrayData = [...dataArray];

        // Sort data by date (newest first)
        const sortedData = ArrayUtils.fastSort([...dataArray], (a, b) => {
            const timestampA = parseInt(a.dateCell) || 0;
            const timestampB = parseInt(b.dateCell) || 0;
            return timestampB - timestampA;
        });

        APP_STATE.filteredData = [...sortedData];

        // FIXED: Apply today's filter using Vietnam timezone
        const vietnamToday = VietnamTime.getDateString();
        this.filterManager.filters.startDate = vietnamToday;
        this.filterManager.filters.endDate = vietnamToday;

        console.log("Initial render with Vietnam today filter:", {
            vietnamToday: vietnamToday,
            systemToday: new Date().toISOString().split("T")[0],
            dataCount: sortedData.length,
            sampleTimestamps: sortedData.slice(0, 3).map((item) => ({
                timestamp: item.dateCell,
                vietnamDate: VietnamTime.formatVietnamDate(
                    parseFloat(item.dateCell),
                ),
            })),
        });

        // Apply initial filter
        await this.filterManager.applyFilters(sortedData);

        if (window.hideFloatingAlert) {
            window.hideFloatingAlert();
        }

        performanceMonitor.end("renderInitialData");
    }

    // ===== FORM SUBMIT =====
    async handleFormSubmit(e) {
        e.preventDefault();

        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError("Có thao tác đang thực hiện, vui lòng đợi...");
            }
            return;
        }

        if (!this.hasPermission(3)) {
            if (window.showError) {
                window.showError("Không có quyền thêm giao dịch");
            }
            return;
        }

        const formData = this.getFormData();
        if (!formData) return;

        try {
            this.blockInteraction("add");
            if (window.showOperationLoading) {
                window.showOperationLoading("Đang thêm giao dịch...", "add");
            }

            const newTransaction = this.createTransaction(formData);
            this.addTransactionToUI(newTransaction);
            this.resetForm();
            await this.uploadTransaction(newTransaction);

            APP_STATE.arrayData.unshift(newTransaction);
            cacheManager.invalidate();

            this.logAction(
                "add",
                `Thêm giao dịch chuyển khoản: ${formData.transferNote}`,
                null,
                newTransaction,
            );

            if (window.hideOperationLoading) {
                window.hideOperationLoading("Đã thêm giao dịch thành công!");
            }

            setTimeout(() => {
                const firstInput = domManager.get(SELECTORS.transferNote);
                if (firstInput) firstInput.focus();
            }, 100);
        } catch (error) {
            console.error("Error adding transaction:", error);

            const tableBody = domManager.get(SELECTORS.tableBody);
            if (tableBody && tableBody.firstChild) {
                tableBody.removeChild(tableBody.firstChild);
            }

            this.restoreFormData(formData);

            if (window.hideOperationLoading) {
                window.hideOperationLoading();
            }
            if (window.showError) {
                window.showError("Lỗi khi tải document lên.");
            }
        } finally {
            this.unblockInteraction();
        }
    }

    getFormData() {
        const ngayck = domManager.get(SELECTORS.ngayck);
        const transferNote = domManager.get(SELECTORS.transferNote);
        const transferAmount = domManager.get(SELECTORS.transferAmount);
        const bank = domManager.get(SELECTORS.bank);
        const customerInfo = domManager.get(SELECTORS.customerInfo);

        if (
            !ngayck ||
            !transferNote ||
            !transferAmount ||
            !bank ||
            !customerInfo
        ) {
            if (window.showError) {
                window.showError("Không tìm thấy các trường form");
            }
            return null;
        }

        const currentDate = new Date(ngayck.value);
        const noteValue = sanitizeInput(transferNote.value);
        let amountValue = transferAmount.value.replace(/[,\.]/g, "");
        amountValue = parseFloat(amountValue);
        const selectedBank = sanitizeInput(bank.value);
        const customerInfoValue = sanitizeInput(customerInfo.value);

        if (isNaN(amountValue) || amountValue <= 0) {
            if (window.showError) {
                window.showError("Vui lòng nhập số tiền chuyển hợp lệ.");
            }
            return null;
        }

        if (!noteValue.trim()) {
            if (window.showError) {
                window.showError("Vui lòng nhập ghi chú chuyển khoản.");
            }
            return null;
        }

        return {
            currentDate,
            transferNote: noteValue,
            transferAmount: amountValue,
            selectedBank,
            customerInfo: customerInfoValue,
        };
    }

    createTransaction(formData) {
        // FIXED: Handle Vietnam timezone properly
        const vietnamDate = new Date(formData.currentDate.getTime());
        const tempTimeStamp = VietnamTime.now();

        // Create timestamp with Vietnam timezone
        const timestamp =
            vietnamDate.getTime() +
            (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) *
                1000;

        const auth = this.getAuthState();

        const newTransaction = {
            uniqueId: generateUniqueId(),
            dateCell: timestamp.toString(),
            noteCell: formData.transferNote,
            amountCell: numberWithCommas(formData.transferAmount),
            bankCell: formData.selectedBank,
            customerInfoCell: formData.customerInfo,
            user: auth
                ? auth.userType
                    ? auth.userType.split("-")[0]
                    : "Unknown"
                : "Unknown",
            completed: false, // New transaction starts as incomplete
        };

        console.log("New transaction created with Vietnam timezone:", {
            uniqueId: newTransaction.uniqueId,
            timestamp: timestamp,
            vietnamDate: VietnamTime.formatVietnamDate(timestamp),
            originalDate: formData.currentDate,
        });

        return newTransaction;
    }

    addTransactionToUI(transaction) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        const timestamp = parseFloat(transaction.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);

        if (this.filterManager) {
            const newRow = this.filterManager.createTableRow(
                transaction,
                formattedTime,
            );
            if (newRow) {
                if (tableBody.firstChild) {
                    tableBody.insertBefore(newRow, tableBody.firstChild);
                } else {
                    tableBody.appendChild(newRow);
                }
            }
        }
    }

    resetForm() {
        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        const ngayck = domManager.get(SELECTORS.ngayck);

        if (moneyTransferForm) {
            moneyTransferForm.reset();
        }

        if (ngayck) {
            // FIXED: Reset to Vietnam today
            const vietnamToday = VietnamTime.getDateString();
            ngayck.value = vietnamToday;

            console.log("Form reset to Vietnam date:", vietnamToday);
        }
    }

    restoreFormData(formData) {
        const transferNote = domManager.get(SELECTORS.transferNote);
        const transferAmount = domManager.get(SELECTORS.transferAmount);
        const bank = domManager.get(SELECTORS.bank);
        const customerInfo = domManager.get(SELECTORS.customerInfo);
        const ngayck = domManager.get(SELECTORS.ngayck);

        if (transferNote) transferNote.value = formData.transferNote;
        if (transferAmount)
            transferAmount.value = numberWithCommas(formData.transferAmount);
        if (bank) bank.value = formData.selectedBank;
        if (customerInfo) customerInfo.value = formData.customerInfo;
        if (ngayck) ngayck.valueAsDate = formData.currentDate;
    }

    async uploadTransaction(transaction) {
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();

        // FIXED: Store with 'muted' for backward compatibility but set it correctly
        const transactionForFirebase = {
            ...transaction,
            muted: transaction.completed, // Convert completed back to muted for Firebase
        };
        delete transactionForFirebase.completed; // Remove the new field

        const updateData = doc.exists
            ? {
                  ["data"]: firebase.firestore.FieldValue.arrayUnion(
                      transactionForFirebase,
                  ),
              }
            : { ["data"]: [transactionForFirebase] };

        const operation = doc.exists
            ? this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .update(updateData)
            : this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .set(updateData);

        return operation;
    }

    // ===== CHECKBOX HANDLER - COMPLETELY REWRITTEN =====
    async handleCheckboxClick(e) {
        console.log("=== CHECKBOX CLICK START ===");

        if (!this.hasPermission(1)) {
            console.log("No permission to change checkbox");
            if (window.showError) {
                window.showError("Không đủ quyền thực hiện chức năng này.");
            }
            e.preventDefault();
            return;
        }

        const checkbox = e.target;
        const row = checkbox.closest("tr");
        const uniqueId = row.getAttribute("data-unique-id");
        const newCheckedState = checkbox.checked;

        console.log("Checkbox interaction:", {
            uniqueId: uniqueId,
            newCheckedState: newCheckedState,
            meaning: newCheckedState ? "đã đi đơn" : "chưa đi đơn",
        });

        // Find the item in our data
        const currentItem = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );

        if (!currentItem) {
            console.error("Transaction not found");
            e.preventDefault();
            return;
        }

        console.log("Current item state:", {
            uniqueId: currentItem.uniqueId,
            currentCompleted: currentItem.completed,
            noteCell: currentItem.noteCell,
        });

        // User confirmation
        const confirmationMessage = newCheckedState
            ? "Bạn có chắc đơn này đã được đi?"
            : "Bạn có chắc muốn đánh dấu đơn này là chưa đi?";

        if (!confirm(confirmationMessage)) {
            e.preventDefault();
            console.log("User cancelled change");
            return;
        }

        console.log("User confirmed change, proceeding...");

        try {
            this.blockInteraction("status_update");
            if (window.showOperationLoading) {
                window.showOperationLoading(
                    "Đang cập nhật trạng thái...",
                    "status_update",
                );
            }

            // The new completed value should match the checkbox state
            const newCompletedValue = newCheckedState;

            console.log("Updating to new state:", {
                newCheckboxState: newCheckedState,
                newCompletedValue: newCompletedValue,
                meaning: newCompletedValue ? "đã đi đơn" : "chưa đi đơn",
            });

            // Update UI immediately
            this.updateRowCompletedState(row, newCompletedValue);

            // Update Firebase
            await this.updateCompletedStateInFirebase(
                uniqueId,
                row,
                newCompletedValue,
            );

            // Update state
            this.updateCompletedStateInData(uniqueId, newCompletedValue);

            // Update total and cache
            if (this.filterManager) {
                this.filterManager.updateTotalAmount();
            }
            cacheManager.invalidate();

            const dataForLog = this.extractRowData(row);
            this.logAction(
                "update",
                `${newCompletedValue ? "Đánh dấu đã đi đơn" : "Hủy đánh dấu đi đơn"}: ${dataForLog.noteCell}`,
                { ...dataForLog, completed: !newCompletedValue },
                { ...dataForLog, completed: newCompletedValue },
            );

            if (window.hideOperationLoading) {
                window.hideOperationLoading(
                    "Đã cập nhật trạng thái thành công!",
                );
            }

            console.log("=== CHECKBOX UPDATE COMPLETED SUCCESSFULLY ===");
        } catch (error) {
            console.error("Error updating status:", error);

            // Revert UI changes
            this.updateRowCompletedState(row, !newCompletedValue);
            checkbox.checked = !newCheckedState;

            if (window.hideOperationLoading) {
                window.hideOperationLoading();
            }
            if (window.showError) {
                window.showError("Lỗi khi cập nhật trạng thái");
            }
        } finally {
            this.unblockInteraction();
        }
    }

    // FIXED: Update row visual state based on completion status
    updateRowCompletedState(row, isCompleted) {
        if (!row) {
            console.error("updateRowCompletedState: row is null");
            return;
        }

        console.log("=== UPDATING ROW VISUAL STATE ===");
        console.log("Row update parameters:", {
            isCompleted: isCompleted,
            meaning: isCompleted
                ? "completed (đã đi đơn)"
                : "active (chưa đi đơn)",
        });

        row.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

        if (isCompleted === true) {
            // Completed = đã đi đơn = dimmed appearance
            row.style.opacity = "0.4";
            row.style.backgroundColor = "#f8f9fa";
            row.classList.add(CSS_CLASSES.muted);
            row.classList.remove(CSS_CLASSES.active);
            console.log("Applied completed styling (đã đi đơn)");
        } else {
            // Not completed = chưa đi đơn = normal appearance
            row.style.opacity = "1.0";
            row.style.backgroundColor = "";
            row.classList.add(CSS_CLASSES.active);
            row.classList.remove(CSS_CLASSES.muted);
            console.log("Applied active styling (chưa đi đơn)");
        }

        console.log("Row visual state updated successfully");
    }

    // FIXED: Update data state
    updateCompletedStateInData(uniqueId, newCompletedValue) {
        console.log("=== UPDATING COMPLETED STATE IN DATA ===");

        let arrayDataUpdated = false;
        let filteredDataUpdated = false;

        const updateCompleted = (item, sourceArray) => {
            if (item.uniqueId === uniqueId) {
                console.log(`Found item in ${sourceArray}:`, {
                    uniqueId: item.uniqueId,
                    oldCompleted: item.completed,
                    newCompleted: newCompletedValue,
                });
                item.completed = newCompletedValue;
                return true;
            }
            return false;
        };

        // Update arrayData
        APP_STATE.arrayData.forEach((item) => {
            if (updateCompleted(item, "arrayData")) {
                arrayDataUpdated = true;
            }
        });

        // Update filteredData
        APP_STATE.filteredData.forEach((item) => {
            if (updateCompleted(item, "filteredData")) {
                filteredDataUpdated = true;
            }
        });

        console.log("Data update verification:", {
            arrayDataUpdated: arrayDataUpdated,
            filteredDataUpdated: filteredDataUpdated,
        });

        console.log("=== DATA UPDATE COMPLETED ===");
    }

    // FIXED: Update Firebase with proper field conversion
    async updateCompletedStateInFirebase(uniqueId, row, newCompletedValue) {
        console.log("=== UPDATING FIREBASE ===");

        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        let itemIndex = dataArray.findIndex(
            (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex === -1) {
            itemIndex = dataArray.findIndex(
                (item) => item.dateCell === row.querySelector("td").id,
            );
        }

        if (itemIndex === -1) {
            throw new Error("Item not found in Firebase");
        }

        console.log("Found item in Firebase:", {
            index: itemIndex,
            uniqueId: dataArray[itemIndex].uniqueId,
            oldMuted: dataArray[itemIndex].muted,
        });

        // FIXED: Convert completed back to muted for Firebase storage
        dataArray[itemIndex].muted = newCompletedValue;

        console.log("Firebase item updated:", {
            index: itemIndex,
            newMuted: dataArray[itemIndex].muted,
        });

        const result = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });
        console.log("Firebase update completed successfully");
        return result;
    }

    // ===== OTHER HANDLERS =====
    handleEditButton(e) {
        const editModal = domManager.get(SELECTORS.editModal);
        if (!editModal) return;

        const row = e.target.closest("tr");
        if (!row) {
            console.error("Could not find table row");
            return;
        }

        const uniqueId = row.getAttribute("data-unique-id");
        if (!uniqueId) {
            console.error("Could not find unique ID");
            return;
        }

        const transaction = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );

        if (!transaction) {
            console.error("Transaction not found in data:", uniqueId);
            if (window.showError) {
                window.showError("Không tìm thấy giao dịch để chỉnh sửa");
            }
            return;
        }

        console.log("Opening edit modal for transaction:", {
            uniqueId: transaction.uniqueId,
            originalTimestamp: transaction.dateCell,
            vietnamDate: VietnamTime.formatVietnamDate(
                parseFloat(transaction.dateCell),
            ),
        });

        const canEditAll = this.hasPermission(1);

        const editFields = {
            editDate: domManager.get(SELECTORS.editDate),
            editNote: domManager.get(SELECTORS.editNote),
            editAmount: domManager.get(SELECTORS.editAmount),
            editBank: domManager.get(SELECTORS.editBank),
            editInfo: domManager.get(SELECTORS.editInfo),
        };

        if (
            !editFields.editDate ||
            !editFields.editNote ||
            !editFields.editAmount ||
            !editFields.editBank ||
            !editFields.editInfo
        ) {
            console.error("Edit form elements not found", editFields);
            if (window.showError) {
                window.showError("Không tìm thấy form chỉnh sửa");
            }
            return;
        }

        // FIXED: Convert timestamp to Vietnam date format for display
        const timestamp = parseFloat(transaction.dateCell);
        const formattedDate = VietnamTime.formatVietnamDate(timestamp); // DD-MM-YY format

        if (canEditAll) {
            editFields.editDate.disabled = false;
            editFields.editNote.disabled = false;
            editFields.editAmount.disabled = false;
            editFields.editBank.disabled = false;
            editFields.editInfo.disabled = false;

            editFields.editDate.value = formattedDate;
            editFields.editNote.value = transaction.noteCell || "";
            editFields.editAmount.value = transaction.amountCell || "";
            editFields.editBank.value = transaction.bankCell || "";
            editFields.editInfo.value = transaction.customerInfoCell || "";

            console.log("Populated all edit fields with Vietnam date:", {
                date: formattedDate,
                note: transaction.noteCell,
                amount: transaction.amountCell,
            });
        } else {
            editFields.editDate.disabled = true;
            editFields.editNote.disabled = true;
            editFields.editAmount.disabled = true;
            editFields.editBank.disabled = true;
            editFields.editInfo.disabled = false;

            editFields.editDate.value = formattedDate;
            editFields.editNote.value = transaction.noteCell || "";
            editFields.editAmount.value = transaction.amountCell || "";
            editFields.editBank.value = transaction.bankCell || "";
            editFields.editInfo.value = transaction.customerInfoCell || "";

            [
                editFields.editDate,
                editFields.editNote,
                editFields.editAmount,
                editFields.editBank,
            ].forEach((field) => {
                field.style.backgroundColor = "#f8f9fa";
                field.style.color = "#6c757d";
                field.style.cursor = "not-allowed";
            });

            editFields.editInfo.style.backgroundColor = "white";
            editFields.editInfo.style.color = "#495057";
            editFields.editInfo.style.cursor = "text";

            console.log(
                "Limited edit permissions - only customer info editable",
            );
        }

        APP_STATE.editingRow = row;
        APP_STATE.editingTransaction = transaction;

        editModal.style.display = "block";

        setTimeout(() => {
            if (canEditAll) {
                editFields.editNote.focus();
            } else {
                editFields.editInfo.focus();
            }
        }, 100);

        console.log("Edit modal opened with Vietnam timezone support");
    }

    debugVietnamTimezone() {
        const debug = VietnamTime.debug();

        console.log("=== VIETNAM TIMEZONE DEBUG ===");
        console.log("Current filter dates:", this.filterManager?.filters);

        // Test với một số giao dịch
        const sampleTransactions = APP_STATE.arrayData.slice(0, 5);
        console.log("Sample transactions with Vietnam dates:");
        sampleTransactions.forEach((tx, index) => {
            const timestamp = parseFloat(tx.dateCell);
            const vietnamDate = VietnamTime.formatVietnamDate(timestamp);
            console.log(`Transaction ${index + 1}:`, {
                uniqueId: tx.uniqueId,
                timestamp: timestamp,
                vietnamDate: vietnamDate,
                noteCell: tx.noteCell,
            });
        });

        // Test filter range
        const today = VietnamTime.getDateString();
        const todayRange = VietnamTime.getDateRange(today);
        console.log("Today's filter range:", {
            date: today,
            range: todayRange,
            startTime: new Date(todayRange.start),
            endTime: new Date(todayRange.end),
        });

        return debug;
    }

    async handleDeleteButton(e) {
        if (!this.hasPermission(0)) {
            if (window.showError) {
                window.showError("Không đủ quyền thực hiện chức năng này.");
            }
            return;
        }

        const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
        if (!confirmDelete) return;

        const row = e.target.closest("tr");
        const uniqueId = row.getAttribute("data-unique-id");

        if (!row || !uniqueId) {
            if (window.showError) {
                window.showError("Không tìm thấy ID giao dịch để xóa.");
            }
            return;
        }

        try {
            this.blockInteraction("delete");
            if (window.showOperationLoading) {
                window.showOperationLoading("Đang xóa giao dịch...", "delete");
            }

            const oldData = this.extractRowData(row);
            await this.deleteFromFirebase(uniqueId, row);

            row.remove();
            this.removeFromState(uniqueId);

            if (this.filterManager) {
                this.filterManager.updateTotalAmount();
            }
            cacheManager.invalidate();

            this.logAction(
                "delete",
                `Xóa giao dịch: ${oldData.noteCell}`,
                oldData,
                null,
            );

            if (window.hideOperationLoading) {
                window.hideOperationLoading("Đã xóa giao dịch thành công!");
            }
        } catch (error) {
            console.error("Error deleting transaction:", error);
            if (window.hideOperationLoading) {
                window.hideOperationLoading();
            }
            if (window.showError) {
                window.showError("Lỗi khi xóa giao dịch");
            }
        } finally {
            this.unblockInteraction();
        }
    }

    closeModal() {
        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError("Có thao tác đang thực hiện, vui lòng đợi...");
            }
            return;
        }

        const editModal = domManager.get(SELECTORS.editModal);
        if (editModal) {
            editModal.style.display = "none";
        }

        // Clear editing state
        APP_STATE.editingRow = null;
        APP_STATE.editingTransaction = null;

        console.log("Edit modal closed and state cleared");
    }

    async saveChanges() {
        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError("Có thao tác đang thực hiện, vui lòng đợi...");
            }
            return;
        }

        if (!APP_STATE.editingRow || !APP_STATE.editingTransaction) {
            if (window.showError) {
                window.showError("Không tìm thấy giao dịch cần chỉnh sửa.");
            }
            return;
        }

        const editFields = {
            editDate: domManager.get(SELECTORS.editDate),
            editNote: domManager.get(SELECTORS.editNote),
            editAmount: domManager.get(SELECTORS.editAmount),
            editBank: domManager.get(SELECTORS.editBank),
            editInfo: domManager.get(SELECTORS.editInfo),
        };

        const validation = this.validateEditForm(editFields);
        if (!validation.isValid) {
            if (window.showError) {
                window.showError(validation.message);
            }
            return;
        }

        try {
            this.blockInteraction("edit");
            if (window.showOperationLoading) {
                window.showOperationLoading("Đang lưu thay đổi...", "edit");
            }

            console.log("Saving changes for transaction:", {
                uniqueId: APP_STATE.editingTransaction.uniqueId,
                oldData: APP_STATE.editingTransaction,
                newData: validation.data,
            });

            await this.performEdit(editFields, validation.data);

            if (window.hideOperationLoading) {
                window.hideOperationLoading("Đã lưu thay đổi thành công!");
            }
            this.closeModal();
        } catch (error) {
            console.error("Error saving changes:", error);
            if (window.hideOperationLoading) {
                window.hideOperationLoading();
            }
            if (window.showError) {
                window.showError("Lỗi khi cập nhật dữ liệu");
            }
        } finally {
            this.unblockInteraction();
        }
    }

    validateEditForm(editFields) {
        const { editDate, editNote, editAmount, editBank, editInfo } =
            editFields;

        if (!editDate || !editNote || !editAmount || !editBank || !editInfo) {
            return {
                isValid: false,
                message: "Các trường nhập liệu không tồn tại.",
            };
        }

        const dateValue = editDate.value;
        const noteValue = sanitizeInput(editNote.value.trim());
        const amountValue = editAmount.value.trim();
        const bankValue = sanitizeInput(editBank.value.trim());
        const infoValue = sanitizeInput(editInfo.value.trim());

        if (!isValidDateFormat(dateValue)) {
            return {
                isValid: false,
                message: "Nhập đúng định dạng ngày: DD-MM-YY",
            };
        }

        if (!noteValue || !amountValue || !bankValue) {
            return {
                isValid: false,
                message: "Vui lòng điền đầy đủ thông tin bắt buộc.",
            };
        }

        const cleanAmount = amountValue.replace(/[,\.]/g, "");
        const numAmount = parseFloat(cleanAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return { isValid: false, message: "Số tiền không hợp lệ." };
        }

        return {
            isValid: true,
            data: {
                dateValue,
                noteValue,
                amountValue,
                bankValue,
                infoValue,
                numAmount,
            },
        };
    }

    async performEdit(editFields, validatedData) {
        const transaction = APP_STATE.editingTransaction;
        const uniqueId = transaction.uniqueId;

        console.log("Performing edit for transaction:", {
            uniqueId: uniqueId,
            currentData: transaction,
            newData: validatedData,
        });

        // Convert date to timestamp if editing dates
        let editDateTimestamp = transaction.dateCell; // Keep original if not changing
        if (this.hasPermission(1) && validatedData.dateValue) {
            editDateTimestamp = convertToTimestamp(validatedData.dateValue);
        }

        // Update Firebase
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        let itemIndex = dataArray.findIndex(
            (item) => item.uniqueId === uniqueId,
        );
        if (itemIndex === -1) {
            // Fallback to dateCell matching
            itemIndex = dataArray.findIndex(
                (item) => item.dateCell === transaction.dateCell,
            );
        }

        if (itemIndex === -1) {
            throw new Error("Transaction not found in Firebase");
        }

        const auth = this.getAuthState();
        const userInfo = auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown";

        // Update Firebase document
        if (this.hasPermission(1)) {
            // Can edit all fields
            dataArray[itemIndex] = {
                ...dataArray[itemIndex],
                dateCell: editDateTimestamp,
                noteCell: validatedData.noteValue,
                amountCell: numberWithCommas(validatedData.numAmount),
                bankCell: validatedData.bankValue,
                customerInfoCell: validatedData.infoValue,
                user: userInfo,
            };
        } else {
            // Can only edit customer info
            dataArray[itemIndex] = {
                ...dataArray[itemIndex],
                customerInfoCell: validatedData.infoValue,
                user: userInfo,
            };
        }

        await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });

        // Update local data and UI
        this.updateRowAfterEdit(validatedData);
        this.updateStateAfterEdit(uniqueId, validatedData, editDateTimestamp);
        cacheManager.invalidate();

        this.logAction(
            "edit",
            `Sửa giao dịch: ${validatedData.noteValue || transaction.noteCell}`,
            transaction,
            dataArray[itemIndex],
        );

        console.log("Edit completed successfully");
    }

    updateRowAfterEdit(validatedData) {
        const row = APP_STATE.editingRow;
        if (!row || !row.cells) return;

        console.log("Updating row display with new data:", validatedData);

        if (this.hasPermission(1)) {
            // Update all visible cells
            if (row.cells[0]) {
                row.cells[0].textContent = validatedData.dateValue;
                row.cells[0].id = convertToTimestamp(validatedData.dateValue);
            }
            if (row.cells[1])
                row.cells[1].textContent = validatedData.noteValue;
            if (row.cells[2])
                row.cells[2].textContent = numberWithCommas(
                    validatedData.numAmount,
                );
            if (row.cells[3])
                row.cells[3].textContent = validatedData.bankValue;
            if (row.cells[5])
                row.cells[5].textContent = validatedData.infoValue;
        } else {
            // Only update customer info
            if (row.cells[5])
                row.cells[5].textContent = validatedData.infoValue;
        }

        // Add visual feedback for updated row
        row.style.backgroundColor = "#e8f5e8";
        setTimeout(() => {
            row.style.backgroundColor = "";
        }, 2000);

        console.log("Row updated successfully");
    }

    updateStateAfterEdit(uniqueId, validatedData, editDateTimestamp = null) {
        const updateItem = (item) => {
            if (item.uniqueId === uniqueId) {
                if (this.hasPermission(1)) {
                    if (editDateTimestamp) item.dateCell = editDateTimestamp;
                    item.noteCell = validatedData.noteValue;
                    item.amountCell = numberWithCommas(validatedData.numAmount);
                    item.bankCell = validatedData.bankValue;
                }
                item.customerInfoCell = validatedData.infoValue;

                console.log("Updated item in state:", {
                    uniqueId: item.uniqueId,
                    noteCell: item.noteCell,
                    customerInfoCell: item.customerInfoCell,
                });
            }
        };

        APP_STATE.arrayData.forEach(updateItem);
        APP_STATE.filteredData.forEach(updateItem);

        if (this.filterManager) {
            this.filterManager.updateTotalAmount();
        }
    }

    // ===== EXPORT AND LOGOUT =====
    exportToExcel() {
        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError("Có thao tác đang thực hiện, vui lòng đợi...");
            }
            return;
        }

        if (!this.hasPermission(1)) {
            if (window.showError) {
                window.showError("Không có quyền xuất dữ liệu");
            }
            return;
        }

        try {
            this.blockInteraction("export");

            if (window.showOperationLoading) {
                window.showOperationLoading(
                    "Đang chuẩn bị file Excel...",
                    "export",
                );
            }

            const wsData = [
                [
                    "Ngày",
                    "Ghi chú chuyển khoản",
                    "Số tiền chuyển",
                    "Ngân hàng",
                    "Đi đơn",
                    "Tên FB + SĐT",
                ],
            ];

            const tableRows = Array.from(domManager.getAll("#tableBody tr"));
            let exportedRowCount = 0;

            tableRows.forEach((row) => {
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

                    const checkbox = row.cells[4].querySelector(
                        'input[type="checkbox"]',
                    );
                    // FIXED: Correct export logic
                    rowData.push(
                        checkbox && checkbox.checked
                            ? "Đã đi đơn"
                            : "Chưa đi đơn",
                    );
                    rowData.push(row.cells[5].textContent || "");

                    wsData.push(rowData);
                    exportedRowCount++;
                }
            });

            if (exportedRowCount === 0) {
                if (window.hideOperationLoading) {
                    window.hideOperationLoading();
                }
                if (window.showError) {
                    window.showError("Không có dữ liệu để xuất ra Excel");
                }
                return;
            }

            if (typeof XLSX === "undefined") {
                if (window.hideOperationLoading) {
                    window.hideOperationLoading();
                }
                if (window.showError) {
                    window.showError(
                        "Thư viện Excel không khả dụng. Vui lòng tải lại trang",
                    );
                }
                return;
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu chuyển khoản");

            const fileName = `dulieu_${new Date().toISOString().split("T")[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            if (window.hideOperationLoading) {
                window.hideOperationLoading(
                    `Đã xuất ${exportedRowCount} giao dịch ra Excel!`,
                );
            }
        } catch (error) {
            console.error("Error exporting to Excel:", error);
            if (window.hideOperationLoading) {
                window.hideOperationLoading();
            }
            if (window.showError) {
                window.showError("Có lỗi xảy ra khi xuất dữ liệu ra Excel");
            }
        } finally {
            setTimeout(() => {
                this.unblockInteraction();
            }, 2000);
        }
    }

    handleLogout() {
        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError(
                    "Có thao tác đang thực hiện, vui lòng đợi trước khi đăng xuất...",
                );
            }
            return;
        }

        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            this.blockInteraction("logout");
            if (window.showOperationLoading) {
                window.showOperationLoading("Đang đăng xuất...", "logout");
            }

            setTimeout(() => {
                this.clearAuthState();
                cacheManager.invalidate();
                if (window.hideOperationLoading) {
                    window.hideOperationLoading();
                }
                window.location.href = "../index.html";
            }, 1000);
        }
    }

    clearAuthState() {
        try {
            localStorage.removeItem(CONFIG.data.AUTH_STORAGE_KEY);
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userType");
            localStorage.removeItem("checkLogin");
            sessionStorage.clear();
        } catch (error) {
            console.error("Error clearing auth state:", error);
        }
    }

    // ===== UTILITY METHODS =====
    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        const userLevel = parseInt(auth.checkLogin);
        return userLevel <= requiredLevel;
    }

    extractRowData(row) {
        return {
            uniqueId: row.getAttribute("data-unique-id"),
            dateCell: row.querySelector("td").id,
            noteCell: row.cells[1].innerText,
            amountCell: row.cells[2].innerText,
            bankCell: row.cells[3].innerText,
            customerInfoCell: row.cells[5].innerText,
        };
    }

    removeFromState(uniqueId) {
        APP_STATE.arrayData = APP_STATE.arrayData.filter(
            (item) => item.uniqueId !== uniqueId,
        );
        APP_STATE.filteredData = APP_STATE.filteredData.filter(
            (item) => item.uniqueId !== uniqueId,
        );
    }

    async deleteFromFirebase(uniqueId, row) {
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        const updatedArray = dataArray.filter(
            (item) => item.uniqueId !== uniqueId,
        );

        if (updatedArray.length === dataArray.length) {
            // Try fallback with dateCell
            const updatedArrayFallback = dataArray.filter(
                (item) => item.dateCell !== row.querySelector("td").id,
            );
            return this.collectionRef
                .doc(CONFIG.data.COLLECTION_NAME)
                .update({ data: updatedArrayFallback });
        }

        return this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: updatedArray });
    }

    logAction(
        action,
        description,
        oldData = null,
        newData = null,
        pageName = "Chuyển khoản",
    ) {
        const auth = this.getAuthState();
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
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        };

        this.historyCollectionRef
            .add(logEntry)
            .then(() => {
                console.log("Log entry saved successfully");
            })
            .catch((error) => {
                console.error("Error saving log entry: ", error);
            });
    }

    blockInteraction(operationType) {
        APP_STATE.isOperationInProgress = true;
        APP_STATE.currentOperationType = operationType;

        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                input.disabled = true;
            });
        }

        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "none";
            tableBody.style.opacity = "0.7";
        }
    }

    unblockInteraction() {
        APP_STATE.isOperationInProgress = false;
        APP_STATE.currentOperationType = null;

        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                input.disabled = false;
            });
        }

        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "auto";
            tableBody.style.opacity = "1";
        }
    }

    destroy() {
        if (this.virtualScrollManager) {
            this.virtualScrollManager.destroy();
        }
        if (this.filterManager) {
            this.filterManager.destroy();
        }

        performanceMonitor.metrics.clear();
        throttleManager.clearAll();
        cacheManager.invalidate();
        domManager.clearCache();

        Object.assign(APP_STATE, {
            arrayData: [],
            filteredData: [],
            isOperationInProgress: false,
            currentOperationType: null,
            editingRow: null,
        });

        this.isInitialized = false;
        console.log("MoneyTransferApp destroyed");
    }
}

// Global app instance
let moneyTransferApp = null;

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", async function () {
    try {
        console.log("DOM loaded, initializing app...");
        moneyTransferApp = new MoneyTransferApp();
        await moneyTransferApp.init();
        window.moneyTransferApp = moneyTransferApp;
        console.log(
            "Money Transfer Management System initialized successfully with FIXED checkbox logic",
        );
    } catch (error) {
        console.error(
            "Failed to initialize Money Transfer Management System:",
            error,
        );
        if (window.showError) {
            window.showError(
                "Không thể khởi tạo ứng dụng. Vui lòng tải lại trang.",
            );
        }
    }
});

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    if (moneyTransferApp && APP_STATE.isOperationInProgress) {
        moneyTransferApp.unblockInteraction();
        if (window.hideOperationLoading) {
            window.hideOperationLoading();
        }
    }
    if (window.showError) {
        window.showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
    }
});

// Handle page unload during operations
window.addEventListener("beforeunload", function (e) {
    if (APP_STATE.isOperationInProgress) {
        e.preventDefault();
        e.returnValue =
            "Có thao tác đang thực hiện. Bạn có chắc muốn rời khỏi trang?";
        return e.returnValue;
    }
});

// Export
if (typeof module !== "undefined" && module.exports) {
    module.exports = { MoneyTransferApp };
} else {
    window.MoneyTransferApp = MoneyTransferApp;
}
