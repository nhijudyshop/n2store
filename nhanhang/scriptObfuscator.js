// Enhanced Goods Receipt Management System - Complete Version
// CRUD Operations, UI Functions, and Main Application Logic

// =====================================================
// CRUD OPERATIONS
// =====================================================

// DELETE RECEIPT BY ID
async function deleteReceiptByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showFloatingAlert(
            "Không đủ quyền thực hiện chức năng này.",
            false,
            3000,
        );
        return;
    }

    const button = event.currentTarget;
    const receiptId = button.getAttribute("data-receipt-id");
    const receiptInfo = button.getAttribute("data-receipt-info");

    if (!receiptId) {
        showFloatingAlert("Không tìm thấy ID phiếu nhận!", false, 3000);
        return;
    }

    const confirmDelete = confirm(
        `Bạn có chắc chắn muốn xóa phiếu nhận "${receiptInfo}"?\nID: ${receiptId}`,
    );
    if (!confirmDelete) return;

    const row = button.closest("tr");

    // Get old data for logging
    const oldReceiptData = {
        id: receiptId,
        info: receiptInfo,
        tenNguoiNhan: row.cells[0].textContent,
        soKg: row.cells[1].textContent,
        thoiGianNhan: row.cells[2].textContent,
    };

    showFloatingAlert("Đang xóa...", true);

    try {
        const doc = await collectionRef.doc("nhanhang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'nhanhang'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        // Find and delete by ID
        const index = data.data.findIndex((item) => item.id === receiptId);

        if (index === -1) {
            throw new Error(`Không tìm thấy phiếu nhận với ID: ${receiptId}`);
        }

        // Remove item by index
        data.data.splice(index, 1);

        await collectionRef.doc("nhanhang").update({ data: data.data });

        // Log action
        logAction(
            "delete",
            `Xóa phiếu nhận "${receiptInfo}" - ID: ${receiptId}`,
            oldReceiptData,
            null,
        );

        // Invalidate cache
        invalidateCache();

        hideFloatingAlert();
        showFloatingAlert("Đã xóa thành công!", false, 2000);

        // Remove row
        if (row) row.remove();
    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xoá:", error);
        showFloatingAlert("Lỗi khi xoá: " + error.message, false, 3000);
    }
}

// UPDATE RECEIPT BY ID
async function updateReceiptByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showFloatingAlert(
            "Không đủ quyền thực hiện chức năng này.",
            false,
            3000,
        );
        event.target.value = event.target.defaultValue;
        return;
    }

    const input = event.target;
    const receiptId = input.getAttribute("data-receipt-id");
    const newValue = parseFloat(input.value);
    const oldValue = parseFloat(input.defaultValue);
    const fieldName = "soKg";

    if (!receiptId) {
        showFloatingAlert("Không tìm thấy ID phiếu nhận!", false, 3000);
        input.value = oldValue;
        return;
    }

    const row = input.closest("tr");
    const receiptInfo = `${row.cells[0].textContent} - ${formatCurrency(oldValue)}`;

    // Confirm change
    if (newValue !== oldValue) {
        const confirmMessage = `Bạn có chắc chắn muốn thay đổi số kg phiếu nhận "${receiptInfo}" từ ${formatCurrency(oldValue)} thành ${formatCurrency(newValue)}?\nID: ${receiptId}`;

        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldValue;
            return;
        }
    }

    if (newValue < 0) {
        showFloatingAlert("Số kg phải lớn hơn hoặc bằng 0", false, 3000);
        input.value = oldValue;
        return;
    }

    showFloatingAlert("Đang cập nhật...", true);

    const oldData = { id: receiptId, [fieldName]: oldValue };
    const newData = { id: receiptId, [fieldName]: newValue };

    try {
        const doc = await collectionRef.doc("nhanhang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Find and update by ID
        const index = data.data.findIndex((item) => item.id === receiptId);

        if (index === -1) {
            throw new Error(`Không tìm thấy phiếu nhận với ID: ${receiptId}`);
        }

        data.data[index][fieldName] = newValue;

        await collectionRef.doc("nhanhang").update({ data: data.data });

        // Log action
        logAction(
            "update",
            `Cập nhật số kg phiếu nhận "${receiptInfo}" từ ${formatCurrency(oldValue)} thành ${formatCurrency(newValue)} - ID: ${receiptId}`,
            oldData,
            newData,
        );

        // Invalidate cache
        invalidateCache();

        // Update defaultValue for future comparisons
        input.defaultValue = newValue;

        showFloatingAlert("Cập nhật thành công!", false, 2000);
        hideFloatingAlert();
    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        showFloatingAlert("Lỗi khi cập nhật: " + error.message, false, 3000);
        input.value = oldValue; // Restore old value
        hideFloatingAlert();
    }
}

// UPLOAD TO FIRESTORE WITH ID
async function uploadToFirestore(receiptData) {
    try {
        const doc = await collectionRef.doc("nhanhang").get();

        if (doc.exists) {
            await collectionRef.doc("nhanhang").update({
                data: firebase.firestore.FieldValue.arrayUnion(receiptData),
            });
        } else {
            await collectionRef.doc("nhanhang").set({
                data: firebase.firestore.FieldValue.arrayUnion(receiptData),
            });
        }

        // Log action with ID
        logAction(
            "add",
            `Thêm phiếu nhận mới "${receiptData.tenNguoiNhan}" - ${formatCurrency(receiptData.soKg)} - ID: ${receiptData.id}`,
            null,
            receiptData,
        );

        // Invalidate cache
        invalidateCache();

        console.log("Document với ID tải lên thành công:", receiptData.id);
        showSuccess("Thành công!");

        // Reload table to show new item
        await displayReceiptData();

        document.getElementById("addButton").disabled = false;
        clearReceiptForm();
    } catch (error) {
        showError("Lỗi khi tải lên...");
        console.error("Lỗi khi tải document lên: ", error);
        document.getElementById("addButton").disabled = false;
    }
}

// ADD RECEIPT
async function addReceipt(event) {
    event.preventDefault();

    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền thêm phiếu nhận");
        return;
    }

    document.getElementById("addButton").disabled = true;

    // Get form values
    const tenNguoiNhan = sanitizeInput(tenNguoiNhanInput.value.trim());
    const soKg = parseFloat(soKgInput.value);
    const soKien = parseFloat(soKienInput.value);

    // Validation
    if (!tenNguoiNhan) {
        showError("Vui lòng nhập tên người nhận");
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (isNaN(soKg) || soKg < 0) {
        showError("Số kg phải lớn hơn hoặc bằng 0");
        document.getElementById("addButton").disabled = false;
        return;
    }

    const thoiGianNhan = getFormattedDateTime();
    const receiptId = generateUniqueID();

    // Receipt data with ID
    const newReceiptData = {
        id: receiptId,
        tenNguoiNhan: tenNguoiNhan,
        soKg: soKg,
        thoiGianNhan: thoiGianNhan,
        soKien: soKien,
        user: getUserName(),
    };

    try {
        showLoading("Đang xử lý phiếu nhận...");

        // Handle image upload if available
        const imageUrl = await uploadCapturedImage();
        if (imageUrl) {
            newReceiptData.anhNhanHang = imageUrl;
        }

        // Upload to Firestore
        await uploadToFirestore(newReceiptData);
    } catch (error) {
        console.error("Lỗi trong quá trình thêm phiếu nhận:", error);
        showError("Lỗi khi thêm phiếu nhận: " + error.message);
        document.getElementById("addButton").disabled = false;
    }
}

// Clear receipt form
function clearReceiptForm() {
    capturedImageUrl = null;
    capturedImageBlob = null;

    // Clear all form inputs
    if (receiptForm) receiptForm.reset();

    // Set current user name again
    setCurrentUserName();

    // Clear image display
    if (imageDisplayArea) {
        imageDisplayArea.innerHTML =
            "<p>📷 Ảnh sẽ hiển thị ở đây sau khi chụp</p>";
        imageDisplayArea.classList.remove("has-content");
    }

    // Reset camera UI
    retakePicture();

    // Stop any running camera
    stopCamera();
}

// =====================================================
// EDIT MODAL FUNCTIONS
// =====================================================

// Open edit modal
function openEditModal(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền chỉnh sửa phiếu nhận");
        return;
    }

    const button = event.currentTarget;
    const receiptId = button.getAttribute("data-receipt-id");

    if (!receiptId) {
        showError("Không tìm thấy ID phiếu nhận!");
        return;
    }

    // Find receipt data
    const cachedData = getCachedData();
    if (!cachedData) {
        showError("Không tìm thấy dữ liệu!");
        return;
    }

    const receiptData = cachedData.find((item) => item.id === receiptId);
    if (!receiptData) {
        showError("Không tìm thấy dữ liệu phiếu nhận!");
        return;
    }

    // Populate form with current data
    editReceiptId.value = receiptData.id;
    editTenNguoiNhanInput.value = receiptData.tenNguoiNhan || "";
    editSoKgInput.value = receiptData.soKg || 0;
    editSoKienInput.value = receiptData.soKien || 0;

    // FIX: Đảm bảo hiển thị ảnh hiện tại đúng cách
    editCurrentImageUrl = receiptData.anhNhanHang || null;
    console.log("Setting current image URL:", editCurrentImageUrl);

    if (editCurrentImageUrl && currentImageContainer) {
        currentImageContainer.innerHTML = "";
        const img = document.createElement("img");
        img.src = editCurrentImageUrl;
        img.alt = "Ảnh hiện tại";
        img.className = "captured-image";
        img.style.maxWidth = "200px";
        img.style.maxHeight = "200px";
        img.style.borderRadius = "8px";
        img.style.border = "2px solid #28a745";
        currentImageContainer.appendChild(img);
        currentImageContainer.classList.add("has-content");

        // Hiển thị section ảnh hiện tại
        const currentImageDisplay = document.getElementById(
            "currentImageDisplay",
        );
        if (currentImageDisplay) {
            currentImageDisplay.style.display = "block";
        }
    } else {
        currentImageContainer.innerHTML =
            '<p style="color: #6c757d; font-style: italic;">Không có ảnh</p>';
        currentImageContainer.classList.remove("has-content");
    }

    // Reset edit camera state
    resetEditCameraUI();
    editKeepCurrentImage = true; // Mặc định giữ ảnh cũ
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    // Show modal
    if (editModal) {
        editModal.style.display = "block";
    }
}

// Close edit modal
function closeEditModalFunction() {
    if (editModal) {
        editModal.style.display = "none";
    }

    // Stop camera if running
    stopEditCamera();
    resetEditCameraUI();

    // Clear form
    if (editForm) {
        editForm.reset();
    }

    editKeepCurrentImage = false;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;
    editCurrentImageUrl = null;
}

// Update receipt
async function updateReceipt(event) {
    event.preventDefault();

    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền cập nhật phiếu nhận");
        return;
    }

    updateButton.disabled = true;

    // Get form values
    const receiptId = editReceiptId.value;
    const tenNguoiNhan = sanitizeInput(editTenNguoiNhanInput.value.trim());
    const soKg = parseFloat(editSoKgInput.value);
    const soKien = parseFloat(editSoKienInput.value);

    // Validation
    if (!tenNguoiNhan) {
        showError("Vui lòng nhập tên người nhận");
        updateButton.disabled = false;
        return;
    }

    if (isNaN(soKg) || soKg <= 0) {
        showError("Số kg phải lớn hơn 0");
        updateButton.disabled = false;
        return;
    }

    if (isNaN(soKien) || soKien <= 0) {
        showError("Số kiện phải lớn hơn 0");
        updateButton.disabled = false;
        return;
    }

    try {
        showLoading("Đang cập nhật phiếu nhận...");

        // Get current data from Firestore
        const doc = await collectionRef.doc("nhanhang").get();
        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Find receipt index
        const index = data.data.findIndex((item) => item.id === receiptId);
        if (index === -1) {
            throw new Error(`Không tìm thấy phiếu nhận với ID: ${receiptId}`);
        }

        const oldData = { ...data.data[index] };

        // Update basic data
        data.data[index].tenNguoiNhan = tenNguoiNhan;
        data.data[index].soKg = soKg;
        data.data[index].soKien = soKien;

        // Handle image update - FIX: Logic rõ ràng hơn
        if (editCapturedImageBlob) {
            // Có ảnh mới được chụp - upload ảnh mới
            console.log("Uploading new captured image...");
            const newImageUrl = await uploadEditCapturedImage();
            if (newImageUrl) {
                data.data[index].anhNhanHang = newImageUrl;
            }
        } else if (editKeepCurrentImage && editCurrentImageUrl) {
            // Giữ ảnh cũ - không thay đổi gì
            console.log("Keeping current image:", editCurrentImageUrl);
            data.data[index].anhNhanHang = editCurrentImageUrl;
        } else if (!editKeepCurrentImage && !editCapturedImageBlob) {
            // Không có ảnh mới và không giữ ảnh cũ - xóa ảnh
            console.log("Removing image...");
            delete data.data[index].anhNhanHang;
        }
        // Nếu editKeepCurrentImage = true nhưng không có editCurrentImageUrl thì giữ nguyên

        // Update in Firestore
        await collectionRef.doc("nhanhang").update({ data: data.data });

        // Log action
        logAction(
            "update",
            `Cập nhật phiếu nhận "${tenNguoiNhan}" - ID: ${receiptId}`,
            oldData,
            data.data[index],
        );

        // Invalidate cache
        invalidateCache();

        showSuccess("Cập nhật thành công!");

        // Close modal and refresh data
        closeEditModalFunction();
        await displayReceiptData();
    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        showError("Lỗi khi cập nhật: " + error.message);
    } finally {
        updateButton.disabled = false;
    }
}

// Upload captured image for editing
async function uploadEditCapturedImage() {
    if (!editCapturedImageBlob) {
        return null;
    }

    try {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(editCapturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {},
                function (error) {
                    console.error("Error uploading edit image:", error);
                    reject(error);
                },
                function () {
                    uploadTask.snapshot.ref
                        .getDownloadURL()
                        .then(function (downloadURL) {
                            console.log("Edit image uploaded successfully");
                            resolve(downloadURL);
                        })
                        .catch(reject);
                },
            );
        });
    } catch (error) {
        console.error("Error in edit image upload process:", error);
        throw error;
    }
}

// =====================================================
// MIGRATION FUNCTION
// =====================================================

// MIGRATION FUNCTION (Run once only)
async function migrateDataWithIDs() {
    try {
        showFloatingAlert("Đang kiểm tra và migration dữ liệu...", true);

        const doc = await collectionRef.doc("nhanhang").get();

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
        const migratedData = data.data.map((item) => {
            // Only add ID if not present
            if (!item.id) {
                hasChanges = true;
                return {
                    ...item,
                    id: generateUniqueID(),
                };
            }
            return item;
        });

        if (hasChanges) {
            // Sort data after migration (newest first)
            const sortedMigratedData = sortDataByNewest(migratedData);

            // Update data with new IDs and sorted
            await collectionRef.doc("nhanhang").update({
                data: sortedMigratedData,
            });

            // Log migration
            logAction(
                "migration",
                `Migration hoàn tất: Thêm ID cho ${migratedData.filter((item) => item.id).length} phiếu nhận và sắp xếp theo thời gian`,
                null,
                null,
            );

            console.log(
                `Migration hoàn tất: Đã thêm ID cho ${migratedData.length} phiếu nhận và sắp xếp theo thời gian`,
            );
            showFloatingAlert("Migration hoàn tất!", false, 3000);
        } else {
            // If no ID changes, just sort again
            const sortedData = sortDataByNewest(data.data);

            // Check if order changed
            const orderChanged =
                JSON.stringify(data.data) !== JSON.stringify(sortedData);

            if (orderChanged) {
                await collectionRef.doc("nhanhang").update({
                    data: sortedData,
                });

                logAction(
                    "sort",
                    "Sắp xếp lại dữ liệu theo thời gian mới nhất",
                    null,
                    null,
                );
                console.log("Đã sắp xếp lại dữ liệu theo thời gian");
                showFloatingAlert(
                    "Đã sắp xếp dữ liệu theo thời gian mới nhất!",
                    false,
                    2000,
                );
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
// FILTER SYSTEM
// =====================================================

function applyFiltersToData(dataArray) {
    const filterUser = filterUserSelect.value;
    const filterDate = dateFilterSelect.value;

    return dataArray.filter((receipt) => {
        const matchUser =
            filterUser === "all" || receipt.tenNguoiNhan === filterUser;

        let matchDate = true;
        if (filterDate !== "all") {
            const receiptDate = parseVietnameseDate(receipt.thoiGianNhan);
            if (receiptDate) {
                const today = new Date();
                const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate(),
                );

                if (filterDate === "today") {
                    const receiptDateStart = new Date(
                        receiptDate.getFullYear(),
                        receiptDate.getMonth(),
                        receiptDate.getDate(),
                    );
                    matchDate =
                        receiptDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === "week") {
                    const weekAgo = new Date(
                        todayStart.getTime() - 7 * 24 * 60 * 60 * 1000,
                    );
                    matchDate = receiptDate >= weekAgo;
                } else if (filterDate === "month") {
                    const monthAgo = new Date(
                        todayStart.getFullYear(),
                        todayStart.getMonth() - 1,
                        todayStart.getDate(),
                    );
                    matchDate = receiptDate >= monthAgo;
                }
            }
        }

        return matchUser && matchDate;
    });
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderDataToTable(cachedData);
            } else {
                displayReceiptData();
            }
            hideFloatingAlert();
            showSuccess("Lọc dữ liệu hoàn tất!");
        } catch (error) {
            console.error("Error during filtering:", error);
            showError("Có lỗi xảy ra khi lọc dữ liệu");
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

function renderDataToTable(dataArray) {
    const filteredData = applyFiltersToData(dataArray);
    tbody.innerHTML = "";

    if (filteredData.length > 0) {
        var summaryRow = document.createElement("tr");
        summaryRow.style.backgroundColor = "#f8f9fa";
        summaryRow.style.fontWeight = "bold";
        var summaryTd = document.createElement("td");
        summaryTd.colSpan = 6;
        summaryTd.textContent = `Tổng: ${filteredData.length} phiếu nhận`;
        summaryTd.style.textAlign = "center";
        summaryTd.style.color = "#007bff";
        summaryTd.style.padding = "8px";
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    let totalImages = 0;
    let loadedImages = 0;

    const imageObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const actualSrc = img.dataset.src;
                    if (actualSrc) {
                        img.onload = () => {
                            loadedImages++;
                            if (loadedImages === totalImages)
                                setCachedData(dataArray);
                        };
                        img.onerror = () => {
                            loadedImages++;
                            if (loadedImages === totalImages)
                                setCachedData(dataArray);
                        };
                        img.src = actualSrc;
                        img.removeAttribute("data-src");
                    }
                    imageObserver.unobserve(img);
                }
            });
        },
        { rootMargin: "50px" },
    );

    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const receipt = filteredData[i];
        var tr = document.createElement("tr");
        tr.setAttribute("data-receipt-id", receipt.id || "");

        var cells = [];
        for (let j = 0; j < 6; j++) {
            cells[j] = document.createElement("td");
        }

        cells[0].textContent = sanitizeInput(receipt.tenNguoiNhan || "");

        cells[1].textContent = parseFloat(receipt.soKg);

        cells[2].textContent = parseFloat(receipt.soKien);

        const weightInput = document.createElement("input");
        const quantInput = document.createElement("input");

        if (receipt.anhNhanHang) {
            const img = document.createElement("img");
            img.dataset.src = receipt.anhNhanHang;
            img.src =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
            img.alt = "Đang tải...";
            img.className = "product-image";
            img.style.cursor = "pointer";
            totalImages++;
            imageObserver.observe(img);

            cells[3].appendChild(img);
        } else {
            cells[3].textContent = "Không có ảnh";
        }

        cells[4].textContent = receipt.thoiGianNhan || "Chưa nhập";

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.setAttribute("data-receipt-id", receipt.id || "");
        deleteButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`,
        );
        deleteButton.addEventListener("click", deleteReceiptByID);

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.setAttribute("data-receipt-id", receipt.id || "");
        editButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`,
        );
        editButton.addEventListener("click", openEditModal);

        const actionContainer = document.createElement("div");
        actionContainer.className = "action-buttons";
        actionContainer.appendChild(editButton);
        actionContainer.appendChild(deleteButton);
        cells[5].appendChild(actionContainer);

        const auth = getAuthState();
        if (auth) {
            applyRowPermissions(
                tr,
                [weightInput],
                deleteButton,
                parseInt(auth.checkLogin),
            );
        }

        cells.forEach((cell) => tr.appendChild(cell));
        tbody.appendChild(tr);
    }

    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement("tr");
        warningRow.style.backgroundColor = "#fff3cd";
        warningRow.style.color = "#856404";
        const warningTd = document.createElement("td");
        warningTd.colSpan = 6;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} phiếu nhận. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = "center";
        warningTd.style.padding = "8px";
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }

    if (totalImages === 0) setCachedData(dataArray);
    updateDropdownOptions(dataArray);
}

function applyRowPermissions(row, inputs, button, userRole) {
    if (userRole !== 0) {
        inputs.forEach((input) => (input.disabled = true));
        button.style.display = "none";
    } else {
        inputs.forEach((input) => (input.disabled = false));
        button.style.display = "";
    }
}

function updateDropdownOptions(fullDataArray) {
    const users = [
        ...new Set(
            fullDataArray
                .map((receipt) => receipt.tenNguoiNhan)
                .filter((user) => user),
        ),
    ];
    if (filterUserSelect) {
        const currentSelectedValue = filterUserSelect.value;
        while (filterUserSelect.children.length > 1) {
            filterUserSelect.removeChild(filterUserSelect.lastChild);
        }
        users.forEach((user) => {
            const option = document.createElement("option");
            option.value = user;
            option.textContent = user;
            filterUserSelect.appendChild(option);
        });
        if (
            currentSelectedValue &&
            currentSelectedValue !== "all" &&
            users.includes(currentSelectedValue)
        ) {
            filterUserSelect.value = currentSelectedValue;
        }
    }
}

// =====================================================
// DATA LOADING & INITIALIZATION
// =====================================================

async function displayReceiptData() {
    const cachedData = getCachedData();
    if (cachedData) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        const sortedCacheData = sortDataByNewest(cachedData);
        renderDataToTable(sortedCacheData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu từ server...", true);
    try {
        const doc = await collectionRef.doc("nhanhang").get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                const sortedData = sortDataByNewest(data.data);
                renderDataToTable(sortedData);
                setCachedData(sortedData);
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

async function initializeWithMigration() {
    try {
        await migrateDataWithIDs();
        await displayReceiptData();
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showFloatingAlert("Lỗi khởi tạo ứng dụng", false, 3000);
    }
}

function toggleForm() {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền truy cập biểu mẫu");
        return;
    }
    const dataForm = document.getElementById("dataForm");
    const toggleFormButton = document.getElementById("toggleFormButton");
    if (dataForm.style.display === "none" || dataForm.style.display === "") {
        dataForm.style.display = "block";
        toggleFormButton.textContent = "Ẩn biểu mẫu";
    } else {
        dataForm.style.display = "none";
        toggleFormButton.textContent = "Hiện biểu mẫu";
    }
}

function initializeFormElements() {
    setCurrentUserName();
    initializeCameraSystem();
    initializeInputValidation();

    if (receiptForm) {
        receiptForm.addEventListener("submit", addReceipt);
    }

    // Edit modal events
    if (editForm) {
        editForm.addEventListener("submit", updateReceipt);
    }

    if (closeEditModal) {
        closeEditModal.addEventListener("click", closeEditModalFunction);
    }

    if (cancelEditButton) {
        cancelEditButton.addEventListener("click", closeEditModalFunction);
    }

    // Close modal when clicking outside
    window.addEventListener("click", function (event) {
        if (event.target === editModal) {
            closeEditModalFunction();
        }
    });

    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", clearReceiptForm);
    }

    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", toggleForm);
    }
}

function initializeFilterEvents() {
    if (filterUserSelect) {
        filterUserSelect.addEventListener("change", applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener("change", applyFilters);
    }
}

// =====================================================
// EXPORT & UTILITIES
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showError("Không có dữ liệu để xuất");
        return;
    }

    showLoading("Đang tạo file Excel...");
    try {
        const filteredData = applyFiltersToData(cachedData);
        const excelData = filteredData.map((receipt, index) => ({
            STT: index + 1,
            "Tên người nhận": receipt.tenNguoiNhan || "",
            "Số kg": receipt.soKg || 0,
            "Số kiện": receipt.soKien || 0,
            "Thời gian nhận": receipt.thoiGianNhan || "",
            "Người tạo": receipt.user || "",
            ID: receipt.id || "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Nhận Hàng");
        const fileName = `NhanHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất Excel thành công!");
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        showError("Lỗi khi xuất Excel!");
    }
}

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener("click", function (e) {
            const auth = getAuthState();
            if (auth && auth.checkLogin == "0") {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton
                    ? deleteButton.getAttribute("data-receipt-info")
                    : "Không có nút xóa";

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

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = "../index.html";
    }
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeApplication() {
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
        return;
    }

    if (auth.userType) {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();
    await initializeWithMigration();

    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    console.log(
        "Enhanced Goods Receipt Management System initialized successfully",
    );
}

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    showError("Có lỗi xảy ra trong xử lý dữ liệu.");
});

// Debug functions
window.debugFunctions = {
    checkDataIntegrity: async function () {
        const doc = await collectionRef.doc("nhanhang").get();
        if (doc.exists) {
            const data = doc.data();
            console.log("Data integrity check:", {
                total: data.data.length,
                withId: data.data.filter((item) => item.id).length,
                withoutId: data.data.filter((item) => !item.id).length,
            });
        }
    },
    generateUniqueID,
    sortDataByNewest,
    parseVietnameseDate,
    forceRefreshData: function () {
        invalidateCache();
        displayReceiptData();
    },
    invalidateCache,
    getAuthState,
    hasPermission,
    exportToExcel,
    startCamera,
    stopCamera,
    takePicture,
    retakePicture,
    openEditModal,
    closeEditModalFunction,
    startEditCamera,
    stopEditCamera,
    takeEditPicture,
    retakeEditPicture,
    keepCurrentImage,
};

// Camera cleanup on page unload
window.addEventListener("beforeunload", function () {
    stopCamera();
    stopEditCamera();
});

// DOM initialization
document.addEventListener("DOMContentLoaded", function () {
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }
    initializeApplication();
});

// Thêm vào cuối file scriptObfuscator.js để debug việc xử lý ảnh

// Debug functions cho image handling
window.debugImageFunctions = {
    // Kiểm tra trạng thái edit image
    checkEditImageState: function () {
        console.log("=== EDIT IMAGE STATE ===");
        console.log("editCurrentImageUrl:", editCurrentImageUrl);
        console.log("editCapturedImageUrl:", editCapturedImageUrl);
        console.log("editCapturedImageBlob:", editCapturedImageBlob);
        console.log("editKeepCurrentImage:", editKeepCurrentImage);
        console.log("========================");
    },

    // Test open edit modal với data giả
    testEditModal: function (receiptId) {
        const cachedData = getCachedData();
        if (cachedData) {
            const receipt = cachedData.find((item) => item.id === receiptId);
            if (receipt) {
                console.log("Testing edit modal with receipt:", receipt);
                // Simulate button click
                const fakeEvent = {
                    currentTarget: {
                        getAttribute: (attr) =>
                            attr === "data-receipt-id" ? receiptId : null,
                    },
                };
                openEditModal(fakeEvent);
            } else {
                console.log("Receipt not found with ID:", receiptId);
            }
        } else {
            console.log("No cached data available");
        }
    },

    // Kiểm tra tất cả receipts có ảnh
    checkReceiptsWithImages: function () {
        const cachedData = getCachedData();
        if (cachedData) {
            const withImages = cachedData.filter((item) => item.anhNhanHang);
            console.log("Receipts with images:", withImages.length);
            console.log("Image URLs:");
            withImages.forEach((item) => {
                console.log(`ID: ${item.id}, URL: ${item.anhNhanHang}`);
            });
            return withImages;
        }
        return [];
    },

    // Force set edit image state
    forceSetEditImageState: function (currentUrl, keepCurrent = true) {
        editCurrentImageUrl = currentUrl;
        editKeepCurrentImage = keepCurrent;
        editCapturedImageUrl = null;
        editCapturedImageBlob = null;
        console.log("Forced edit image state:", {
            editCurrentImageUrl,
            editKeepCurrentImage,
            editCapturedImageUrl,
            editCapturedImageBlob,
        });
    },
};

// Enhance existing openEditModal với logging
const originalOpenEditModal = openEditModal;
openEditModal = function (event) {
    console.log("=== OPENING EDIT MODAL ===");

    const button = event.currentTarget;
    const receiptId = button.getAttribute("data-receipt-id");
    console.log("Receipt ID:", receiptId);

    // Find receipt data
    const cachedData = getCachedData();
    if (cachedData) {
        const receiptData = cachedData.find((item) => item.id === receiptId);
        if (receiptData) {
            console.log("Receipt data found:", receiptData);
            console.log(
                "Current image URL from data:",
                receiptData.anhNhanHang,
            );
        }
    }

    // Call original function
    const result = originalOpenEditModal.call(this, event);

    // Log state after opening
    setTimeout(() => {
        console.log("Edit modal opened. Image state:");
        window.debugImageFunctions.checkEditImageState();
    }, 100);

    console.log("=========================");
    return result;
};

// Enhance updateReceipt với detailed logging
const originalUpdateReceipt = updateReceipt;
updateReceipt = async function (event) {
    console.log("=== UPDATING RECEIPT ===");
    window.debugImageFunctions.checkEditImageState();

    const receiptId = editReceiptId.value;
    console.log("Updating receipt ID:", receiptId);

    // Determine image action
    let imageAction = "no change";
    if (editCapturedImageBlob) {
        imageAction = "upload new image";
    } else if (editKeepCurrentImage && editCurrentImageUrl) {
        imageAction = "keep current image";
    } else if (!editKeepCurrentImage && !editCapturedImageBlob) {
        imageAction = "remove image";
    }

    console.log("Image action:", imageAction);
    console.log("========================");

    // Call original function
    return await originalUpdateReceipt.call(this, event);
};

// Enhanced camera functions with logging
const originalStartEditCamera = startEditCamera;
startEditCamera = async function () {
    console.log("Starting edit camera...");
    editKeepCurrentImage = false; // Khi bắt đầu camera mới thì không giữ ảnh cũ
    const result = await originalStartEditCamera.call(this);
    window.debugImageFunctions.checkEditImageState();
    return result;
};

const originalKeepCurrentImage = keepCurrentImage;
keepCurrentImage = function () {
    console.log("Keeping current image...");
    console.log("Current editCurrentImageUrl:", editCurrentImageUrl);
    const result = originalKeepCurrentImage.call(this);
    window.debugImageFunctions.checkEditImageState();
    return result;
};

// Log khi đóng modal
const originalCloseEditModalFunction = closeEditModalFunction;
closeEditModalFunction = function () {
    console.log("Closing edit modal...");
    const result = originalCloseEditModalFunction.call(this);

    // Reset image state
    editCurrentImageUrl = null;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;
    editKeepCurrentImage = false;

    console.log("Edit modal closed and state reset");
    return result;
};

console.log(
    "Debug image functions loaded. Available at window.debugImageFunctions",
);
console.log(
    "Available functions:",
    Object.keys(window.debugImageFunctions).join(", "),
);
