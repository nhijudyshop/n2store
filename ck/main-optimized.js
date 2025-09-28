// main-optimized.js - Phần 1: Constructor và Init Methods
// Main application file with performance optimizations and fixed checkbox logic

class MoneyTransferApp {
    constructor() {
        this.firebase = null;
        this.db = null;
        this.collectionRef = null;
        this.historyCollectionRef = null;

        this.virtualScrollManager = null;
        this.filterManager = null;
        this.authManager = null;

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

            // Show ready message
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

        // Show main container
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
            // Initialize Firebase
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
            // Initialize Virtual Scroll Manager
            this.virtualScrollManager = new VirtualScrollManager();
            window.virtualScrollManager = this.virtualScrollManager;

            // Initialize Filter Manager
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
            // Initialize form
            this.initForm();

            // Initialize table events
            this.initTableEvents();

            // Initialize other UI components
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
            ngayck.valueAsDate = new Date();
        }

        // Toggle form button with enhanced animation
        const toggleFormButton = domManager.get(SELECTORS.toggleFormButton);
        const dataForm = domManager.get(SELECTORS.dataForm);

        if (toggleFormButton && dataForm) {
            toggleFormButton.style.transition =
                "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

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
                        dataForm.style.opacity = "0";
                        dataForm.style.transform = "translateY(-20px)";
                        dataForm.style.transition =
                            "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

                        requestAnimationFrame(() => {
                            dataForm.style.opacity = "1";
                            dataForm.style.transform = "translateY(0)";
                        });

                        toggleFormButton.textContent = "Ẩn biểu mẫu";
                        toggleFormButton.style.background =
                            "linear-gradient(135deg, #dc3545, #c82333)";

                        setTimeout(() => {
                            const firstInput = domManager.get(
                                SELECTORS.transferNote,
                            );
                            if (firstInput) {
                                firstInput.focus();
                                firstInput.style.transition = "all 0.3s ease";
                                firstInput.style.borderColor = "#667eea";
                                firstInput.style.boxShadow =
                                    "0 0 0 3px rgba(102, 126, 234, 0.25)";
                            }
                        }, 200);
                    } else {
                        dataForm.style.transition =
                            "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
                        dataForm.style.opacity = "0";
                        dataForm.style.transform = "translateY(-20px)";

                        setTimeout(() => {
                            dataForm.style.display = "none";
                        }, 300);

                        toggleFormButton.textContent = "Hiện biểu mẫu";
                        toggleFormButton.style.background = "";
                    }
                } else {
                    toggleFormButton.style.transform = "translateX(-5px)";
                    setTimeout(() => {
                        toggleFormButton.style.transform = "translateX(5px)";
                        setTimeout(() => {
                            toggleFormButton.style.transform = "";
                        }, 100);
                    }, 100);

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

            moneyTransferForm.addEventListener("keydown", (e) => {
                if (e.ctrlKey && e.key === "Enter") {
                    e.preventDefault();
                    const submitBtn = moneyTransferForm.querySelector(
                        'button[type="submit"]',
                    );
                    if (submitBtn) {
                        submitBtn.style.transform = "scale(0.95)";
                        setTimeout(() => {
                            submitBtn.style.transform = "";
                        }, 150);
                    }
                    this.handleFormSubmit(e);
                }
            });
        }

        // Amount input formatting
        const transferAmountInput = domManager.get(SELECTORS.transferAmount);
        if (transferAmountInput) {
            transferAmountInput.style.transition = "all 0.3s ease";

            transferAmountInput.addEventListener("focus", function () {
                this.style.borderColor = "#667eea";
                this.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.25)";
                this.style.transform = "translateY(-1px)";
            });

            transferAmountInput.addEventListener("blur", function () {
                this.style.borderColor = "";
                this.style.boxShadow = "";
                this.style.transform = "";

                let value = this.value.replace(/[,\.]/g, "");
                value = parseFloat(value);

                if (!isNaN(value) && value > 0) {
                    this.style.color = "#28a745";
                    this.value = numberWithCommas(value);

                    setTimeout(() => {
                        this.style.color = "";
                    }, 1000);
                }
            });
        }

        // Clear form button
        const clearDataButton = domManager.get(SELECTORS.clearDataButton);
        if (clearDataButton) {
            clearDataButton.style.transition =
                "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

            clearDataButton.addEventListener("click", () => {
                if (APP_STATE.isOperationInProgress) {
                    if (window.showError) {
                        window.showError(
                            "Có thao tác đang thực hiện, vui lòng đợi...",
                        );
                    }
                    return;
                }

                clearDataButton.style.transform = "scale(0.95)";
                setTimeout(() => {
                    clearDataButton.style.transform = "";
                }, 150);

                const formInputs = moneyTransferForm.querySelectorAll(
                    "input, select, textarea",
                );
                formInputs.forEach((input, index) => {
                    setTimeout(() => {
                        input.style.transition = "all 0.3s ease";
                        input.style.opacity = "0.5";
                        input.value = "";

                        setTimeout(() => {
                            input.style.opacity = "1";
                        }, 200);
                    }, index * 50);
                });

                if (ngayck) {
                    setTimeout(() => {
                        ngayck.valueAsDate = new Date();
                    }, formInputs.length * 50);
                }

                setTimeout(
                    () => {
                        const firstInput = domManager.get(
                            SELECTORS.transferNote,
                        );
                        if (firstInput) {
                            firstInput.focus();
                            firstInput.style.borderColor = "#667eea";
                            firstInput.style.boxShadow =
                                "0 0 0 3px rgba(102, 126, 234, 0.25)";
                        }
                    },
                    formInputs.length * 50 + 100,
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

    // main-optimized.js - Phần 3: Data Loading và Firebase

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

                    // DEBUG: Log raw data
                    console.log("=== RAW FIREBASE DATA DEBUG ===");
                    console.log("Total items:", data["data"].length);
                    console.log("First 5 items from Firebase:");
                    data["data"].slice(0, 5).forEach((item, index) => {
                        //console.log(`Raw Item ${index}:`, {
                        //    uniqueId: item.uniqueId,
                        //    muted: item.muted,
                        //    mutedType: typeof item.muted,
                        //    noteCell: item.noteCell,
                        //    originalItem: item,
                        //});
                    });

                    // Process data with proper muted handling
                    const processedData = data["data"].map((item) => {
                        const processedItem = ensureUniqueId(item);

                        // CRITICAL: Ensure muted is boolean
                        if (
                            processedItem.muted === undefined ||
                            processedItem.muted === null
                        ) {
                            processedItem.muted = false; // Default: chưa đi đơn
                            //console.log(
                            //    `Set default muted=false for item: ${processedItem.uniqueId}`,
                            //);
                        } else {
                            const oldMuted = processedItem.muted;
                            processedItem.muted = Boolean(processedItem.muted);
                            if (oldMuted !== processedItem.muted) {
                                //console.log(
                                //    `Converted muted from ${oldMuted} to ${processedItem.muted} for item: ${processedItem.uniqueId}`,
                                //);
                            }
                        }

                        return processedItem;
                    });

                    // DEBUG: Log processed data
                    console.log("=== PROCESSED DATA DEBUG ===");
                    console.log("First 5 processed items:");
                    processedData.slice(0, 5).forEach((item, index) => {
                        //console.log(`Processed Item ${index}:`, {
                        //    uniqueId: item.uniqueId,
                        //    muted: item.muted,
                        //    mutedType: typeof item.muted,
                        //    noteCell: item.noteCell,
                        //});
                    });

                    // Count muted vs unmuted items
                    const mutedCount = processedData.filter(
                        (item) => item.muted === true,
                    ).length;
                    const unmutedCount = processedData.filter(
                        (item) => item.muted === false,
                    ).length;
                    console.log("Muted status summary:", {
                        total: processedData.length,
                        muted: mutedCount,
                        unmuted: unmutedCount,
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

        // Apply today's filter by default
        const today = new Date().toISOString().split("T")[0];
        this.filterManager.filters.startDate = today;
        this.filterManager.filters.endDate = today;

        console.log("=== INITIAL RENDER DEBUG ===");
        console.log("Data prepared for filtering:", {
            arrayDataLength: APP_STATE.arrayData.length,
            filteredDataLength: APP_STATE.filteredData.length,
            todayFilter: today,
        });

        // Apply initial filter
        await this.filterManager.applyFilters(sortedData);

        if (window.hideFloatingAlert) {
            window.hideFloatingAlert();
        }

        performanceMonitor.end("renderInitialData");
    }

    // main-optimized.js - Phần 4: Form Submit và Transaction Handling

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

            console.log("=== NEW TRANSACTION DEBUG ===");
            console.log("Created new transaction:", {
                uniqueId: newTransaction.uniqueId,
                muted: newTransaction.muted,
                mutedType: typeof newTransaction.muted,
                noteCell: newTransaction.noteCell,
            });

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
        const tempTimeStamp = new Date();
        const timestamp =
            formData.currentDate.getTime() +
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
            muted: false, // CRITICAL: New transaction always starts as "chưa đi đơn"
        };

        console.log("New transaction created with muted=false (chưa đi đơn)");
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
                newRow.style.opacity = "0";
                newRow.style.transform = "translateY(-20px) scale(0.95)";

                if (tableBody.firstChild) {
                    tableBody.insertBefore(newRow, tableBody.firstChild);
                } else {
                    tableBody.appendChild(newRow);
                }

                requestAnimationFrame(() => {
                    newRow.style.transition =
                        "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
                    newRow.style.opacity = "1";
                    newRow.style.transform = "translateY(0) scale(1)";
                });

                setTimeout(() => {
                    newRow.style.background =
                        "linear-gradient(135deg, #e8f5e8, #f0fff0)";
                    setTimeout(() => {
                        newRow.style.background = "";
                    }, 2000);
                }, 300);
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
            ngayck.valueAsDate = new Date();
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

        const updateData = doc.exists
            ? {
                  ["data"]:
                      firebase.firestore.FieldValue.arrayUnion(transaction),
              }
            : { ["data"]: [transaction] };

        const operation = doc.exists
            ? this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .update(updateData)
            : this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .set(updateData);

        return operation;
    }

    // main-optimized.js - Phần 5: CHECKBOX HANDLER - Phần quan trọng nhất để fix lỗi

    // CRITICAL: Complete rewrite of checkbox handler with extensive debugging
    async handleCheckboxClick(e) {
        console.log("=== CHECKBOX CLICK START ===");

        if (!this.hasPermission(1)) {
            console.log("No permission to change checkbox");
            if (window.showError) {
                window.showError("Không đủ quyền thực hiện chức năng này.");
            }
            e.target.checked = !e.target.checked; // Revert the change
            return;
        }

        const checkbox = e.target;
        const row = checkbox.closest("tr");
        const uniqueId = row.getAttribute("data-unique-id");
        const newCheckedState = checkbox.checked;

        console.log("Checkbox interaction detected:", {
            uniqueId: uniqueId,
            newCheckedState: newCheckedState,
            elementTagName: checkbox.tagName,
            elementType: checkbox.type,
        });

        // Find the item in our data to check current muted state
        const currentItem = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );

        console.log("Current item state before change:", {
            found: !!currentItem,
            uniqueId: currentItem?.uniqueId,
            currentMuted: currentItem?.muted,
            currentMutedType: typeof currentItem?.muted,
            noteCell: currentItem?.noteCell,
        });

        // Verification: checkbox state should match item.muted
        if (currentItem) {
            const expectedChecked = Boolean(currentItem.muted);
            const actualChecked = !newCheckedState; // Before user click
            console.log("State verification before change:", {
                expectedCheckboxState: expectedChecked,
                actualPreviousState: actualChecked,
                isConsistent: expectedChecked === actualChecked,
            });
        }

        // User intention analysis
        const userIntention = newCheckedState
            ? "mark as completed (đã đi đơn)"
            : "mark as active (chưa đi đơn)";
        console.log("User intention:", userIntention);

        // Confirmation messages
        const confirmationMessage = newCheckedState
            ? "Bạn có chắc đơn này đã được đi?"
            : "Bạn có chắc muốn đánh dấu đơn này là chưa đi?";

        console.log("Showing confirmation:", confirmationMessage);

        if (!confirm(confirmationMessage)) {
            // User cancelled - revert checkbox state
            checkbox.checked = !newCheckedState;
            console.log(
                "User cancelled, reverted checkbox to:",
                !newCheckedState,
            );
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

            // The new muted value should match the checkbox state
            // newCheckedState = true means muted = true (đã đi đơn)
            // newCheckedState = false means muted = false (chưa đi đơn)
            const newMutedValue = newCheckedState;

            console.log("Updating to new state:", {
                newCheckboxState: newCheckedState,
                newMutedValue: newMutedValue,
                meaning: newMutedValue
                    ? "đã đi đơn (muted=true)"
                    : "chưa đi đơn (muted=false)",
            });

            // Update UI immediately
            this.updateRowMutedState(row, newMutedValue);

            // Update Firebase
            await this.updateMutedStateInFirebase(uniqueId, row, newMutedValue);

            // Update state
            this.updateMutedStateInData(uniqueId, newMutedValue);

            // Verify the update
            const updatedItem = APP_STATE.arrayData.find(
                (item) => item.uniqueId === uniqueId,
            );
            console.log("After update verification:", {
                uniqueId: updatedItem?.uniqueId,
                updatedMuted: updatedItem?.muted,
                checkboxChecked: checkbox.checked,
                stateConsistent: updatedItem?.muted === checkbox.checked,
            });

            // Update total and cache
            if (this.filterManager) {
                this.filterManager.updateTotalAmount();
            }
            cacheManager.invalidate();

            const dataForLog = this.extractRowData(row);
            this.logAction(
                "update",
                `${newMutedValue ? "Đánh dấu đã đi đơn" : "Hủy đánh dấu đi đơn"}: ${dataForLog.noteCell}`,
                { ...dataForLog, muted: !newMutedValue },
                { ...dataForLog, muted: newMutedValue },
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
            this.updateRowMutedState(row, !newMutedValue);
            checkbox.checked = !newCheckedState;

            console.log(
                "Error occurred, reverted checkbox to:",
                !newCheckedState,
            );
            console.log("Error details:", error);

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

    // Enhanced updateRowMutedState with detailed logging
    updateRowMutedState(row, isMuted) {
        if (!row) {
            console.error("updateRowMutedState: row is null");
            return;
        }

        console.log("=== UPDATING ROW VISUAL STATE ===");
        console.log("Row update parameters:", {
            isMuted: isMuted,
            meaning: isMuted ? "muted (đã đi đơn)" : "active (chưa đi đơn)",
            rowHasUniqueId: !!row.getAttribute("data-unique-id"),
        });

        // Smooth transition for muted state
        row.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

        if (isMuted === true) {
            // isMuted = true = đã đi đơn = muted state = dimmed appearance
            row.style.opacity = "0.4";
            row.style.backgroundColor = "#f8f9fa";
            row.style.transform = "scale(0.98)";
            row.classList.add(CSS_CLASSES.muted);
            row.classList.remove(CSS_CLASSES.active);
            console.log("Applied muted styling (đã đi đơn)");
        } else {
            // isMuted = false = chưa đi đơn = active state = normal appearance
            row.style.opacity = "1.0";
            row.style.backgroundColor = "";
            row.style.transform = "scale(1)";
            row.classList.add(CSS_CLASSES.active);
            row.classList.remove(CSS_CLASSES.muted);
            console.log("Applied active styling (chưa đi đơn)");
        }

        // Reset transform after animation
        setTimeout(() => {
            row.style.transform = "";
        }, 400);

        console.log("Row visual state updated successfully");
    }

    // main-optimized.js - Phần 6: Edit và Delete Handlers

    handleEditButton(e) {
        const editModal = domManager.get(SELECTORS.editModal);
        if (!editModal) return;

        editModal.style.display = "block";

        const row = e.target.parentNode.parentNode;
        const date = row.cells[0].innerText;
        const note = row.cells[1].innerText;
        const amount = row.cells[2].innerText;
        const bank = row.cells[3].innerText;
        const customerInfo = row.cells[5].innerText;

        const canEditAll = this.hasPermission(1);

        const editFields = {
            editDate: domManager.get(SELECTORS.editDate),
            editNote: domManager.get(SELECTORS.editNote),
            editAmount: domManager.get(SELECTORS.editAmount),
            editBank: domManager.get(SELECTORS.editBank),
            editInfo: domManager.get(SELECTORS.editInfo),
        };

        if (canEditAll) {
            Object.entries(editFields).forEach(([key, element]) => {
                if (element) {
                    element.disabled = false;
                    switch (key) {
                        case "editDate":
                            element.value = date;
                            break;
                        case "editNote":
                            element.value = note;
                            break;
                        case "editAmount":
                            element.value = amount;
                            break;
                        case "editBank":
                            element.value = bank;
                            break;
                        case "editInfo":
                            element.value = customerInfo;
                            break;
                    }
                }
            });
        } else {
            Object.entries(editFields).forEach(([key, element]) => {
                if (element) {
                    if (key === "editInfo") {
                        element.disabled = false;
                        element.value = customerInfo;
                    } else {
                        element.disabled = true;
                    }
                }
            });
        }

        APP_STATE.editingRow = row;
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
        APP_STATE.editingRow = null;
    }

    async saveChanges() {
        if (APP_STATE.isOperationInProgress) {
            if (window.showError) {
                window.showError("Có thao tác đang thực hiện, vui lòng đợi...");
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

        if (!APP_STATE.editingRow) {
            if (window.showError) {
                window.showError("Không tìm thấy hàng cần chỉnh sửa.");
            }
            return;
        }

        try {
            this.blockInteraction("edit");
            if (window.showOperationLoading) {
                window.showOperationLoading("Đang lưu thay đổi...", "edit");
            }

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
        const uniqueId = APP_STATE.editingRow.getAttribute("data-unique-id");
        const tdRow = APP_STATE.editingRow.querySelector("td");

        const editDateTimestamp = convertToTimestamp(validatedData.dateValue);

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
                (item) => item.dateCell === tdRow.id,
            );
        }

        if (itemIndex === -1) {
            throw new Error("Transaction not found");
        }

        const auth = this.getAuthState();
        const userInfo = auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown";

        if (this.hasPermission(1)) {
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
            dataArray[itemIndex].customerInfoCell = validatedData.infoValue;
            dataArray[itemIndex].user = userInfo;
        }

        await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });

        this.updateRowAfterEdit(validatedData);
        this.updateStateAfterEdit(uniqueId, validatedData);
        cacheManager.invalidate();

        this.logAction(
            "edit",
            `Sửa giao dịch: ${validatedData.noteValue}`,
            null,
            null,
        );
    }

    updateRowAfterEdit(validatedData) {
        if (this.hasPermission(1)) {
            APP_STATE.editingRow.cells[0].textContent = validatedData.dateValue;
            APP_STATE.editingRow.cells[0].id = convertToTimestamp(
                validatedData.dateValue,
            );
            APP_STATE.editingRow.cells[1].textContent = validatedData.noteValue;
            APP_STATE.editingRow.cells[2].textContent = numberWithCommas(
                validatedData.numAmount,
            );
            APP_STATE.editingRow.cells[3].textContent = validatedData.bankValue;
            APP_STATE.editingRow.cells[5].textContent = validatedData.infoValue;
        } else {
            APP_STATE.editingRow.cells[5].textContent = validatedData.infoValue;
        }
    }

    updateStateAfterEdit(uniqueId, validatedData) {
        const updateItem = (item) => {
            if (item.uniqueId === uniqueId) {
                if (this.hasPermission(1)) {
                    item.dateCell = convertToTimestamp(validatedData.dateValue);
                    item.noteCell = validatedData.noteValue;
                    item.amountCell = numberWithCommas(validatedData.numAmount);
                    item.bankCell = validatedData.bankValue;
                }
                item.customerInfoCell = validatedData.infoValue;
            }
        };

        APP_STATE.arrayData.forEach(updateItem);
        APP_STATE.filteredData.forEach(updateItem);

        if (this.filterManager) {
            this.filterManager.updateTotalAmount();
        }
    }

    // main-optimized.js - Phần 7: Export và Logout

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

            // FIX: Convert NodeList to Array
            const tableRows = Array.from(domManager.getAll("#tableBody tr"));
            let exportedRowCount = 0;
            let processedRows = 0;
            const totalRows = tableRows.length;

            const processRowBatch = (startIndex, batchSize = 50) => {
                const endIndex = Math.min(startIndex + batchSize, totalRows);

                for (let i = startIndex; i < endIndex; i++) {
                    const row = tableRows[i];
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
                    processedRows++;
                }

                const progress = Math.round((processedRows / totalRows) * 100);
                if (window.showOperationLoading) {
                    window.showOperationLoading(
                        `Đang xử lý... ${progress}%`,
                        "export",
                    );
                }

                if (endIndex < totalRows) {
                    setTimeout(() => processRowBatch(endIndex), 10);
                } else {
                    finishExport();
                }
            };

            const finishExport = () => {
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

                setTimeout(() => {
                    const ws = XLSX.utils.aoa_to_sheet(wsData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(
                        wb,
                        ws,
                        "Dữ liệu chuyển khoản",
                    );

                    const fileName = `dulieu_${new Date().toISOString().split("T")[0]}.xlsx`;
                    XLSX.writeFile(wb, fileName);

                    if (window.hideOperationLoading) {
                        window.hideOperationLoading(
                            `Đã xuất ${exportedRowCount} giao dịch ra Excel!`,
                        );
                    }
                }, 500);
            };

            processRowBatch(0);
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

    // main-optimized.js - Phần 8: Utility Methods và Firebase Operations

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
        const initialArrayLength = APP_STATE.arrayData.length;
        const initialFilteredLength = APP_STATE.filteredData.length;

        APP_STATE.arrayData = APP_STATE.arrayData.filter(
            (item) => item.uniqueId !== uniqueId,
        );
        APP_STATE.filteredData = APP_STATE.filteredData.filter(
            (item) => item.uniqueId !== uniqueId,
        );

        console.log("Removed item from state:", {
            uniqueId: uniqueId,
            arrayDataBefore: initialArrayLength,
            arrayDataAfter: APP_STATE.arrayData.length,
            filteredDataBefore: initialFilteredLength,
            filteredDataAfter: APP_STATE.filteredData.length,
        });
    }

    // Enhanced updateMutedStateInData with comprehensive logging
    updateMutedStateInData(uniqueId, newMutedValue) {
        console.log("=== UPDATING MUTED STATE IN DATA ===");
        console.log("Update parameters:", {
            uniqueId: uniqueId,
            newMutedValue: newMutedValue,
            newMutedType: typeof newMutedValue,
        });

        let arrayDataUpdated = false;
        let filteredDataUpdated = false;

        const updateMuted = (item, sourceArray) => {
            if (item.uniqueId === uniqueId) {
                console.log(`Found item in ${sourceArray}:`, {
                    uniqueId: item.uniqueId,
                    oldMuted: item.muted,
                    newMuted: newMutedValue,
                    noteCell: item.noteCell,
                });
                item.muted = newMutedValue;
                return true;
            }
            return false;
        };

        // Update arrayData
        APP_STATE.arrayData.forEach((item) => {
            if (updateMuted(item, "arrayData")) {
                arrayDataUpdated = true;
            }
        });

        // Update filteredData
        APP_STATE.filteredData.forEach((item) => {
            if (updateMuted(item, "filteredData")) {
                filteredDataUpdated = true;
            }
        });

        // Verify the updates
        const updatedArrayItem = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );
        const updatedFilteredItem = APP_STATE.filteredData.find(
            (item) => item.uniqueId === uniqueId,
        );

        console.log("Data update verification:", {
            arrayDataUpdated: arrayDataUpdated,
            filteredDataUpdated: filteredDataUpdated,
            arrayItem: updatedArrayItem
                ? {
                      uniqueId: updatedArrayItem.uniqueId,
                      muted: updatedArrayItem.muted,
                      mutedType: typeof updatedArrayItem.muted,
                  }
                : "not found",
            filteredItem: updatedFilteredItem
                ? {
                      uniqueId: updatedFilteredItem.uniqueId,
                      muted: updatedFilteredItem.muted,
                      mutedType: typeof updatedFilteredItem.muted,
                  }
                : "not found",
        });

        if (!arrayDataUpdated && !filteredDataUpdated) {
            console.error("Failed to update item in both arrays!");
        }

        console.log("=== DATA UPDATE COMPLETED ===");
    }

    async deleteFromFirebase(uniqueId, row) {
        console.log("Deleting from Firebase:", { uniqueId: uniqueId });

        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];
        console.log(
            "Firebase data array length before delete:",
            dataArray.length,
        );

        const updatedArray = dataArray.filter(
            (item) => item.uniqueId !== uniqueId,
        );

        if (updatedArray.length === dataArray.length) {
            console.log("uniqueId not found, trying dateCell fallback");
            const updatedArrayFallback = dataArray.filter(
                (item) => item.dateCell !== row.querySelector("td").id,
            );

            console.log(
                "Firebase data array length after fallback delete:",
                updatedArrayFallback.length,
            );

            return this.collectionRef
                .doc(CONFIG.data.COLLECTION_NAME)
                .update({ data: updatedArrayFallback });
        }

        console.log(
            "Firebase data array length after delete:",
            updatedArray.length,
        );

        return this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: updatedArray });
    }

    // Enhanced updateMutedStateInFirebase with detailed logging
    async updateMutedStateInFirebase(uniqueId, row, newMutedValue) {
        console.log("=== UPDATING FIREBASE ===");
        console.log("Firebase update parameters:", {
            uniqueId: uniqueId,
            newMutedValue: newMutedValue,
            newMutedType: typeof newMutedValue,
        });

        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];
        console.log("Firebase data array length:", dataArray.length);

        let itemIndex = dataArray.findIndex(
            (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex === -1) {
            console.log("Item not found by uniqueId, trying dateCell fallback");
            itemIndex = dataArray.findIndex(
                (item) => item.dateCell === row.querySelector("td").id,
            );
        }

        if (itemIndex === -1) {
            console.error("Item not found in Firebase by uniqueId or dateCell");
            throw new Error("Item not found in Firebase");
        }

        console.log("Found item in Firebase:", {
            index: itemIndex,
            item: {
                uniqueId: dataArray[itemIndex].uniqueId,
                oldMuted: dataArray[itemIndex].muted,
                oldMutedType: typeof dataArray[itemIndex].muted,
                noteCell: dataArray[itemIndex].noteCell,
            },
        });

        // Update the muted field
        const oldMuted = dataArray[itemIndex].muted;
        dataArray[itemIndex].muted = newMutedValue;

        console.log("Firebase item updated:", {
            index: itemIndex,
            oldMuted: oldMuted,
            newMuted: dataArray[itemIndex].muted,
            changed: oldMuted !== dataArray[itemIndex].muted,
        });

        // Save to Firebase
        const result = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });

        console.log("Firebase update completed successfully");
        return result;
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

    // main-optimized.js - Phần 9: Block/Unblock Interactions và Debug Methods

    blockInteraction(operationType) {
        APP_STATE.isOperationInProgress = true;
        APP_STATE.currentOperationType = operationType;

        console.log(`Blocking interactions for operation: ${operationType}`);

        // Disable form inputs
        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                input.setAttribute("data-original-disabled", input.disabled);
                input.disabled = true;
            });
        }

        // Disable table interactions
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "none";
            tableBody.style.opacity = "0.7";
        }

        // Disable modal and action buttons
        const modalButtons = domManager.getAll("#editModal button");
        modalButtons.forEach((btn) => {
            btn.setAttribute("data-original-disabled", btn.disabled);
            btn.disabled = true;
        });

        const actionButtons = domManager.getAll(
            ".filter-btn, #toggleFormButton, #toggleLogoutButton",
        );
        actionButtons.forEach((btn) => {
            btn.setAttribute("data-original-disabled", btn.disabled);
            btn.disabled = true;
        });

        console.log(`Interactions blocked for operation: ${operationType}`);
    }

    unblockInteraction() {
        APP_STATE.isOperationInProgress = false;
        APP_STATE.currentOperationType = null;

        console.log("Unblocking interactions");

        // Re-enable form inputs
        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                const originalDisabled = input.getAttribute(
                    "data-original-disabled",
                );
                input.disabled = originalDisabled === "true";
                input.removeAttribute("data-original-disabled");
            });
        }

        // Re-enable table interactions
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "auto";
            tableBody.style.opacity = "1";
        }

        // Re-enable buttons
        const modalButtons = domManager.getAll("#editModal button");
        modalButtons.forEach((btn) => {
            const originalDisabled = btn.getAttribute("data-original-disabled");
            btn.disabled = originalDisabled === "true";
            btn.removeAttribute("data-original-disabled");
        });

        const actionButtons = domManager.getAll(
            ".filter-btn, #toggleFormButton, #toggleLogoutButton",
        );
        actionButtons.forEach((btn) => {
            const originalDisabled = btn.getAttribute("data-original-disabled");
            btn.disabled = originalDisabled === "true";
            btn.removeAttribute("data-original-disabled");
        });

        console.log("Interactions unblocked");
    }

    // Performance monitoring and debugging
    getPerformanceStats() {
        return {
            app: {
                isInitialized: this.isInitialized,
                initTime: this.initStartTime,
                currentOperation: APP_STATE.currentOperationType,
            },
            virtualScroll: this.virtualScrollManager
                ? this.virtualScrollManager.getStats()
                : null,
            filter: this.filterManager ? this.filterManager.getStats() : null,
            cache: cacheManager.getStats(),
            performance: performanceMonitor.metrics,
            device: deviceDetector.info,
            state: {
                arrayDataLength: APP_STATE.arrayData.length,
                filteredDataLength: APP_STATE.filteredData.length,
                isOperationInProgress: APP_STATE.isOperationInProgress,
                mutedItemsCount: APP_STATE.arrayData.filter(
                    (item) => item.muted === true,
                ).length,
                activeItemsCount: APP_STATE.arrayData.filter(
                    (item) => item.muted === false,
                ).length,
            },
        };
    }

    // Debug helper methods
    debugCheckboxStates() {
        console.log("=== DEBUGGING CHECKBOX STATES ===");

        // Check data states
        const arrayDataSample = APP_STATE.arrayData.slice(0, 10);
        console.log("Sample from arrayData (first 10 items):");
        arrayDataSample.forEach((item, index) => {
            //console.log(`Array Item ${index}:`, {
            //    uniqueId: item.uniqueId,
            //    muted: item.muted,
            //    mutedType: typeof item.muted,
            //    noteCell: item.noteCell?.substring(0, 20) + "...",
            //});
        });

        // Check UI states - FIX: Convert NodeList to Array
        const checkboxes = Array.from(
            domManager.getAll('#tableBody input[type="checkbox"]'),
        );
        console.log(`Found ${checkboxes.length} checkboxes in UI`);

        checkboxes.slice(0, 10).forEach((checkbox, index) => {
            const row = checkbox.closest("tr");
            const uniqueId = row?.getAttribute("data-unique-id");
            const dataItem = APP_STATE.arrayData.find(
                (item) => item.uniqueId === uniqueId,
            );

            console.log(`Checkbox ${index}:`, {
                uniqueId: uniqueId,
                checkboxChecked: checkbox.checked,
                dataItemMuted: dataItem?.muted,
                consistent: checkbox.checked === Boolean(dataItem?.muted),
            });
        });

        console.log("=== CHECKBOX DEBUG COMPLETED ===");
    }

    // Force fix all checkbox states
    forceFixCheckboxStates() {
        console.log("=== FORCE FIXING CHECKBOX STATES ===");

        // FIX: Convert NodeList to Array
        const checkboxes = Array.from(
            domManager.getAll('#tableBody input[type="checkbox"]'),
        );
        let fixedCount = 0;

        checkboxes.forEach((checkbox, index) => {
            const row = checkbox.closest("tr");
            const uniqueId = row?.getAttribute("data-unique-id");
            const dataItem = APP_STATE.arrayData.find(
                (item) => item.uniqueId === uniqueId,
            );

            if (dataItem) {
                const expectedChecked = Boolean(dataItem.muted);
                if (checkbox.checked !== expectedChecked) {
                    console.log(`Fixing checkbox ${index}:`, {
                        uniqueId: uniqueId,
                        oldChecked: checkbox.checked,
                        newChecked: expectedChecked,
                        dataMuted: dataItem.muted,
                    });
                    checkbox.checked = expectedChecked;
                    this.updateRowMutedState(row, dataItem.muted);
                    fixedCount++;
                }
            }
        });

        console.log(`Fixed ${fixedCount} checkbox states`);

        if (this.filterManager) {
            this.filterManager.updateTotalAmount();
        }

        console.log("=== FORCE FIX COMPLETED ===");
    }

    // Cleanup and destroy
    destroy() {
        console.log("Destroying MoneyTransferApp...");

        // Destroy managers
        if (this.virtualScrollManager) {
            this.virtualScrollManager.destroy();
        }
        if (this.filterManager) {
            this.filterManager.destroy();
        }

        // Clear performance monitoring
        performanceMonitor.metrics.clear();

        // Clear throttles and debounces
        throttleManager.clearAll();

        // Clear cache
        cacheManager.invalidate();

        // Clear DOM cache
        domManager.clearCache();

        // Reset state
        Object.assign(APP_STATE, {
            arrayData: [],
            filteredData: [],
            isOperationInProgress: false,
            isFilteringInProgress: false,
            currentOperationType: null,
            editingRow: null,
        });

        this.isInitialized = false;
        console.log("MoneyTransferApp destroyed");
    }
} // END OF CLASS

// main-optimized.js - Phần 10: Global Functions và Event Handlers (CUỐI CÙNG)

// Global app instance
let moneyTransferApp = null;

// Debug helper functions - globally available
window.debugCheckboxes = () => {
    if (moneyTransferApp) {
        moneyTransferApp.debugCheckboxStates();
    } else {
        console.log("App not initialized yet");
    }
};

window.fixCheckboxes = () => {
    if (moneyTransferApp) {
        moneyTransferApp.forceFixCheckboxStates();
    } else {
        console.log("App not initialized yet");
    }
};

window.getAppDebugInfo = () => {
    if (moneyTransferApp) {
        return {
            stats: moneyTransferApp.getPerformanceStats(),
            arrayData: APP_STATE.arrayData.slice(0, 5),
            filteredData: APP_STATE.filteredData.slice(0, 5),
            currentFilters: APP_STATE.currentFilters,
        };
    }
    return null;
};

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", async function () {
    try {
        console.log("DOM loaded, initializing app...");

        moneyTransferApp = new MoneyTransferApp();
        await moneyTransferApp.init();

        // Make app instance globally available for debugging
        window.moneyTransferApp = moneyTransferApp;
        window.getAppStats = () => moneyTransferApp.getPerformanceStats();

        console.log(
            "Money Transfer Management System initialized successfully with comprehensive checkbox logic fixes and enhanced debugging",
        );

        // Auto-debug checkboxes after 3 seconds
        setTimeout(() => {
            console.log("=== AUTO-DEBUGGING CHECKBOXES ===");
            moneyTransferApp.debugCheckboxStates();
        }, 3000);
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

    // Unblock interactions if app is blocked
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

// Performance monitoring
if (window.performance && window.performance.observer) {
    const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
            if (entry.entryType === "measure") {
                console.log(
                    `Performance: ${entry.name} took ${entry.duration.toFixed(2)}ms`,
                );
            }
        });
    });

    observer.observe({ entryTypes: ["measure"] });
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = { MoneyTransferApp };
} else {
    window.MoneyTransferApp = MoneyTransferApp;
}
