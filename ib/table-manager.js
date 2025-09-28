// =====================================================
// TABLE AND DATA MANAGEMENT SYSTEM
// =====================================================

class TableManager {
    constructor() {
        this.tbody = document.querySelector("tbody");
        this.currentFilters = {
            category: CONFIG.categories.ALL,
        };
        this.sortOrder = "newest";
        this.isLoading = false;

        this.initializeFirebase();
        this.initializeTableInteractions();
    }

    // Initialize Firebase references
    initializeFirebase() {
        this.app = firebase.initializeApp(CONFIG.firebase);
        this.db = firebase.firestore();
        this.storageRef = firebase.storage().ref();
        this.collectionRef = this.db.collection("ib");
        this.historyCollectionRef = this.db.collection("edit_history");
    }

    // Initialize table interactions
    initializeTableInteractions() {
        if (!this.tbody) return;

        // Throttled scroll handler for performance
        const throttledScroll = Utils.throttle(() => {
            this.handleVirtualScroll();
        }, 100);

        window.addEventListener("scroll", throttledScroll);

        // Click handler for table interactions
        this.tbody.addEventListener("click", this.handleTableClick.bind(this));

        // Tooltip functionality with improved performance
        this.tbody.addEventListener(
            "mouseover",
            Utils.throttle(this.handleTooltip.bind(this), 200),
        );
    }

    // Handle virtual scrolling for performance
    handleVirtualScroll() {
        const tableContainer = document.querySelector(".table-container");
        if (!tableContainer) return;

        const rect = tableContainer.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

        if (isVisible && !this.isLoading) {
            // Load more data if needed
            this.loadMoreDataIfNeeded();
        }
    }

    // Load more data if needed (for large datasets)
    loadMoreDataIfNeeded() {
        const visibleRows = this.tbody.querySelectorAll("tr").length;
        const totalData = cacheManager.getCachedData();

        if (
            totalData &&
            visibleRows < totalData.length &&
            visibleRows < CONFIG.cache.maxVisibleRows
        ) {
            this.renderAdditionalRows(totalData, visibleRows);
        }
    }

    // Handle table click events
    handleTableClick(e) {
        if (
            e.target.classList.contains("delete-button") ||
            e.target.classList.contains("toggle-visibility")
        ) {
            const row = e.target.closest("tr");
            if (row) {
                this.deleteRow(row, e.target);
            }
        }
    }

    // Handle tooltip display
    handleTooltip(e) {
        if (!authManager.hasPermission(0)) return;

        const tooltip = document.getElementById("tooltip");
        const row = e.target.closest("tr");

        if (!row || !tooltip) return;

        const deleteButton = row.querySelector(".toggle-visibility");
        if (deleteButton && e.target.classList.contains("product-image")) {
            const value = deleteButton.id || "Không có nút xóa";
            tooltip.textContent = `Người tải: ${value}`;
            tooltip.style.display = "block";
            tooltip.style.top = e.pageY + 10 + "px";
            tooltip.style.left = e.pageX + 10 + "px";

            setTimeout(() => {
                tooltip.style.display = "none";
            }, 2000);
        }
    }

    // Apply category filter with performance optimization
    applyCategoryFilter() {
        const selectedCategory =
            document.getElementById("filterCategory")?.value ||
            CONFIG.categories.ALL;
        const rows = this.tbody.querySelectorAll("tr");
        let visibleCount = 0;

        // Use requestAnimationFrame for smooth filtering
        const filterBatch = (startIndex) => {
            const endIndex = Math.min(
                startIndex + CONFIG.cache.batchSize,
                rows.length,
            );

            for (let i = startIndex; i < endIndex; i++) {
                const row = rows[i];
                const categoryCell = row.cells[2];

                if (categoryCell) {
                    const category = categoryCell.textContent.trim();
                    const shouldShow =
                        selectedCategory === CONFIG.categories.ALL ||
                        category === selectedCategory;

                    if (shouldShow) {
                        row.style.display = "";
                        visibleCount++;
                        row.cells[0].textContent = visibleCount;
                    } else {
                        row.style.display = "none";
                    }
                }
            }

            if (endIndex < rows.length) {
                requestAnimationFrame(() => filterBatch(endIndex));
            }
        };

        if (rows.length > 0) {
            requestAnimationFrame(() => filterBatch(0));
        }
    }

    // Render data to table with performance optimizations
    renderDataToTable(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            console.log("No data to render");
            return;
        }

        // Performance measurement
        const startTime = performance.now();

        // Sort data - newest first
        let processedDataArray = [...dataArray];
        if (this.sortOrder === "newest") {
            processedDataArray = processedDataArray.reverse();
        }

        // Clear current table content
        this.tbody.innerHTML = "";

        // Render in batches for better performance
        this.renderDataInBatches(processedDataArray);

        // Cache data after rendering
        cacheManager.setCachedData(processedDataArray);

        // Update performance indicator
        const loadTime = performance.now() - startTime;
        uiManager.updatePerformanceIndicator(loadTime);

        console.log(`Table rendered in ${loadTime.toFixed(2)}ms`);
    }

    // Render data in batches for better performance
    renderDataInBatches(dataArray) {
        const maxRows = Math.min(dataArray.length, CONFIG.cache.maxVisibleRows);
        let currentIndex = 0;

        const renderBatch = () => {
            const endIndex = Math.min(
                currentIndex + CONFIG.cache.batchSize,
                maxRows,
            );

            for (let i = currentIndex; i < endIndex; i++) {
                this.createTableRow(dataArray[i], i + 1);
            }

            currentIndex = endIndex;

            if (currentIndex < maxRows) {
                requestAnimationFrame(renderBatch);
            }
        };

        requestAnimationFrame(renderBatch);
    }

    // Render additional rows for virtual scrolling
    renderAdditionalRows(dataArray, startIndex) {
        const endIndex = Math.min(
            startIndex + CONFIG.cache.batchSize,
            dataArray.length,
            CONFIG.cache.maxVisibleRows,
        );

        for (let i = startIndex; i < endIndex; i++) {
            this.createTableRow(dataArray[i], i + 1);
        }
    }

    // Create a single table row
    createTableRow(dataItem, rowNumber) {
        if (!dataItem) return;

        const row = this.tbody.insertRow();
        const itemId = dataItem.id || `fallback_${Date.now()}_${rowNumber}`;
        row.setAttribute("data-item-id", itemId);

        const auth = authManager.getCurrentUser();

        // Special handling for user type 777
        if (auth && auth.checkLogin == "777") {
            this.createHiddenRow(row);
            return;
        }

        // Create normal row
        this.createNormalRow(row, dataItem, rowNumber, auth);
    }

    // Create hidden row for special user type
    createHiddenRow(row) {
        const cells = [];
        for (let i = 0; i < 7; i++) {
            const cell = row.insertCell();
            cell.style.display = "none";
            cells.push(cell);
        }
    }

    // Create normal table row
    createNormalRow(row, dataItem, rowNumber, auth) {
        // Create cells
        const thuTuCell = row.insertCell();
        const thoiGianUploadCell = row.insertCell();
        const phanLoaiCell = row.insertCell();
        const hinhAnhCell = row.insertCell();
        const tenSanPhamCell = row.insertCell();
        const thongTinKhachHangCell = row.insertCell();
        const toggleVisibilityCell = row.insertCell();

        // Fill basic data
        thuTuCell.textContent = rowNumber;
        thoiGianUploadCell.textContent = dataItem.thoiGianUpload || "";
        phanLoaiCell.textContent = dataItem.phanLoai || "";
        tenSanPhamCell.textContent = dataItem.tenSanPham || "";

        // Add product images
        this.addImagesToCell(
            hinhAnhCell,
            dataItem.sp,
            dataItem.tenSanPham || "Product image",
        );

        // Add customer images
        this.addImagesToCell(
            thongTinKhachHangCell,
            dataItem.kh,
            "Hình ảnh khách hàng",
        );

        // Add delete button if authorized
        if (auth && auth.checkLogin == "0") {
            this.addDeleteButton(
                toggleVisibilityCell,
                dataItem.user || "Unknown",
                row,
            );
        }
    }

    // Add images to cell with optimization
    addImagesToCell(cell, imageData, altText) {
        if (!imageData) return;

        const images = Array.isArray(imageData) ? imageData : [imageData];

        images.forEach((imgSrc, index) => {
            if (imgSrc) {
                const img = Utils.createElement("img", {
                    src: imgSrc,
                    alt: altText,
                    className: "product-image",
                    loading: "lazy", // Native lazy loading
                });

                // Add error handling
                img.onerror = () => {
                    img.src =
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik00MCA0NEw0NCA0MEw2MCA1NlY2NEg0NFY1Nkw0MCA1Mkw0NCA1NlY2NEgyMFY1Nkw0MCA0NFoiIGZpbGw9IiM5Q0E0QUIiLz4KPC9zdmc+";
                    img.alt = "Không thể tải ảnh";
                };

                cell.appendChild(img);

                if (index < images.length - 1) {
                    cell.appendChild(document.createTextNode(" "));
                }
            }
        });
    }

    // Add delete button
    addDeleteButton(cell, userId, row) {
        const deleteButton = Utils.createElement("button", {
            className: "delete-button toggle-visibility",
            id: userId,
        });

        deleteButton.textContent = "🗑️";
        deleteButton.title = "Xóa mục này";

        cell.appendChild(deleteButton);
    }

    // Add product to table (for new additions)
    addProductToTable(dataItem) {
        // Insert at top for newest first
        const row = this.tbody.insertRow(0);
        const itemId = dataItem.id || `fallback_${Date.now()}`;
        row.setAttribute("data-item-id", itemId);

        this.createNormalRow(row, dataItem, 1, authManager.getCurrentUser());

        // Update all row numbers
        this.updateRowIndexes();

        // Highlight new row
        uiManager.highlightElement(row);
    }

    // Update row indexes
    updateRowIndexes() {
        const visibleRows = this.tbody.querySelectorAll(
            'tr[style=""], tr:not([style])',
        );
        visibleRows.forEach((row, index) => {
            if (row.cells[0]) {
                row.cells[0].textContent = index + 1;
            }
        });
    }

    // Delete row with confirmation
    deleteRow(row, button) {
        if (!authManager.hasPermission(0)) {
            uiManager.showError("Bạn không đủ quyền để thực hiện thao tác này");
            return;
        }

        const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
        if (!confirmDelete) return;

        const itemId = row.getAttribute("data-item-id");
        if (!itemId) {
            console.error("Cannot find item ID");
            uiManager.showError("Lỗi: Không tìm thấy ID của item để xóa!");
            return;
        }

        this.performDelete(row, button, itemId);
    }

    // Perform the actual deletion
    async performDelete(row, button, itemId) {
        const oldData = {
            id: itemId,
            tenSanPham: row.cells[4]?.textContent || "",
            phanLoai: row.cells[2]?.textContent || "",
            thoiGianUpload: row.cells[1]?.textContent || "",
            user: button.id || "",
        };

        console.log("Deleting item with ID:", itemId);
        uiManager.showLoading("Đang xóa...");

        try {
            const doc = await this.collectionRef.doc("ib").get();

            if (!doc.exists) {
                throw new Error("Document does not exist");
            }

            let data = doc.data().data.slice();
            const indexToDelete = data.findIndex((item) => item.id === itemId);

            if (indexToDelete === -1) {
                throw new Error("Cannot find item with ID: " + itemId);
            }

            console.log(`Found item at index ${indexToDelete}, deleting...`);
            data.splice(indexToDelete, 1);

            await this.collectionRef.doc("ib").update({ data: data });

            // Log action
            this.logAction(
                "delete",
                `Xóa inbox "${oldData.tenSanPham}" - ${oldData.phanLoai}`,
                oldData,
                null,
            );

            // Update UI
            cacheManager.invalidateCache();
            row.remove();
            this.updateRowIndexes();

            uiManager.showSuccess("Đã xóa thành công!");
        } catch (error) {
            console.error("Error deleting:", error);
            uiManager.showError("Lỗi khi xóa: " + error.message);
        }
    }

    // Upload to Firestore
    async uploadToFirestore(formData) {
        const uniqueId = formData.id;
        const currentUser = authManager.getCurrentUser();

        const dataToUpload = {
            id: uniqueId,
            cellShow: true,
            phanLoai: formData.phanLoai,
            tenSanPham: formData.tenSanPham,
            thoiGianUpload: formData.thoiGianUpload,
            sp: formData.sp,
            kh: formData.kh,
            user: currentUser ? currentUser.userType : "Unknown",
        };

        try {
            const doc = await this.collectionRef.doc("ib").get();

            const operation = doc.exists
                ? this.collectionRef.doc("ib").update({
                      data: firebase.firestore.FieldValue.arrayUnion(
                          dataToUpload,
                      ),
                  })
                : this.collectionRef.doc("ib").set({
                      data: firebase.firestore.FieldValue.arrayUnion(
                          dataToUpload,
                      ),
                  });

            await operation;

            // Log the action
            this.logAction(
                "add",
                `Thêm inbox mới "${formData.tenSanPham}" - ${formData.phanLoai}`,
                null,
                formData,
            );

            // Update UI
            cacheManager.invalidateCache();
            console.log("Document uploaded successfully with ID:", uniqueId);
            uiManager.showSuccess("Thành công!");

            // Add to table directly
            this.addProductToTable(dataToUpload);

            // Clear form
            window.formHandler.clearForm();
        } catch (error) {
            console.error("Error uploading document:", error);
            throw new Error("Lỗi khi tải lên Firestore: " + error.message);
        }
    }

    // Load data from Firebase
    async loadData() {
        // Check cache first
        const cachedData = cacheManager.getCachedData();
        if (cachedData) {
            uiManager.showLoading("Sử dụng dữ liệu cache...");
            setTimeout(() => {
                this.renderDataToTable(cachedData);
                uiManager.hideAlert();
                uiManager.showSuccess("Tải dữ liệu từ cache hoàn tất!");
            }, 100);
            return;
        }

        uiManager.showLoading("Đang tải dữ liệu từ server...");
        this.isLoading = true;

        try {
            const doc = await this.collectionRef.doc("ib").get();

            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    this.renderDataToTable(data.data);
                    cacheManager.setCachedData(data.data);
                    uiManager.showSuccess("Tải dữ liệu hoàn tất!");
                } else {
                    uiManager.showError("Không có dữ liệu");
                }
            } else {
                console.log("Document does not exist.");
                uiManager.showError("Tài liệu không tồn tại");
            }
        } catch (error) {
            console.error("Error getting data:", error);
            uiManager.showError("Lỗi khi tải dữ liệu");
        } finally {
            this.isLoading = false;
        }
    }

    // Force refresh data
    forceRefreshData() {
        cacheManager.invalidateCache();
        this.loadData();
    }

    // Log actions for audit trail
    logAction(
        action,
        description,
        oldData = null,
        newData = null,
        pageName = "Check Inbox Khách Hàng",
    ) {
        const currentUser = authManager.getCurrentUser();
        const logEntry = {
            timestamp: new Date(),
            user: currentUser ? currentUser.userType : "Unknown",
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
                console.error("Error saving log entry:", error);
            });
    }

    // Data migration for existing data
    async migrateExistingData() {
        console.log("Starting migration...");
        try {
            const doc = await this.collectionRef.doc("ib").get();
            if (doc.exists) {
                const data = doc.data().data;
                let needsUpdate = false;

                const updatedData = data.map((item) => {
                    if (!item.id) {
                        item.id =
                            Date.now() +
                            "_" +
                            Math.random().toString(36).substr(2, 9);
                        needsUpdate = true;
                    }
                    return item;
                });

                if (needsUpdate) {
                    await this.collectionRef
                        .doc("ib")
                        .update({ data: updatedData });
                    console.log(
                        `Migration completed: Added IDs for ${data.length} items`,
                    );
                    cacheManager.invalidateCache();
                    return true;
                }

                console.log("No migration needed - all items already have IDs");
            }
            return false;
        } catch (error) {
            console.error("Migration error:", error);
            return false;
        }
    }

    // Initialize with migration
    async initializeWithMigration() {
        const migrationNeeded = await this.migrateExistingData();

        if (migrationNeeded) {
            setTimeout(() => {
                this.loadData();
            }, 1000);
        } else {
            this.loadData();
        }
    }
}

// Create global table manager instance
window.tableManager = new TableManager();
