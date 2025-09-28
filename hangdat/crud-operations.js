// =====================================================
// CRUD OPERATIONS WITH FIREBASE STORAGE SUPPORT AND AUTO TABLE REFRESH
// =====================================================

async function editInventoryItem(event) {
    const auth = getAuthState();
    // Allow both permission level 0 and 3 to edit
    if (!auth || parseInt(auth.checkLogin) > 2) {
        showFloatingAlert("Không có quyền chỉnh sửa", false, 3000);
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");

    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    // Find the item data from cache
    const cachedData = getCachedData();
    const itemData = cachedData?.find((item) => item.id === inventoryId);

    if (!itemData) {
        showFloatingAlert("Không tìm thấy thông tin sản phẩm!", false, 3000);
        return;
    }

    // Show edit modal for full row
    showFullEditModal(itemData);
}

function showFullEditModal(itemData) {
    // Remove existing modal if any
    const existingModal = document.querySelector(".modal-overlay");
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div class="modal-overlay show">
            <div class="edit-modal full-edit-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Chỉnh sửa thông tin sản phẩm</h3>
                    <button class="modal-close" onclick="closeEditModal()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <form class="modal-form" id="editForm">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="editProductName">Tên sản phẩm *</label>
                                <input 
                                    type="text" 
                                    id="editProductName" 
                                    placeholder="Nhập tên sản phẩm"
                                    value="${sanitizeInput(itemData.tenSanPham || "")}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editProductCode">Mã sản phẩm</label>
                                <input 
                                    type="text" 
                                    id="editProductCode" 
                                    placeholder="Nhập mã sản phẩm"
                                    value="${sanitizeInput(itemData.maSanPham || "")}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editVariant">Biến thể</label>
                                <input 
                                    type="text" 
                                    id="editVariant" 
                                    placeholder="Nhập biến thể"
                                    value="${sanitizeInput(itemData.bienThe || "")}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editQuantity">Số lượng *</label>
                                <input 
                                    type="number" 
                                    id="editQuantity" 
                                    min="0" 
                                    step="1" 
                                    placeholder="Nhập số lượng"
                                    value="${itemData.soLuong || 0}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editBuyPrice">Giá mua</label>
                                <input 
                                    type="number" 
                                    id="editBuyPrice" 
                                    min="0" 
                                    step="0.01" 
                                    placeholder="Nhập giá mua"
                                    value="${itemData.giaMua || ""}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editSellPrice">Giá bán</label>
                                <input 
                                    type="number" 
                                    id="editSellPrice" 
                                    min="0" 
                                    step="0.01" 
                                    placeholder="Nhập giá bán"
                                    value="${itemData.giaBan || ""}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editNotes">Ghi chú</label>
                                <textarea 
                                    id="editNotes" 
                                    placeholder="Nhập ghi chú"
                                    rows="3"
                                >${sanitizeInput(itemData.ghiChu || "")}</textarea>
                            </div>
                        </div>
                        
                        <div class="image-section">
                            <h4>Hình ảnh</h4>
                            <div class="image-grid">
                                <div class="image-group">
                                    <label>Ảnh sản phẩm</label>
                                    <div class="paste-area modal-paste-area" id="editProductImagePaste" tabindex="0">
                                        <div class="paste-text">Dán ảnh sản phẩm mới (Ctrl+V)</div>
                                        ${
                                            itemData.anhSanPham
                                                ? `<img src="${itemData.anhSanPham}" class="image-preview current-image" onclick="openImageModal('${itemData.anhSanPham}')" alt="Ảnh sản phẩm hiện tại">`
                                                : '<div class="no-image">Chưa có ảnh</div>'
                                        }
                                    </div>
                                </div>
                                
                                <div class="image-group">
                                    <label>Ảnh giá mua</label>
                                    <div class="paste-area modal-paste-area" id="editPriceImagePaste" tabindex="0">
                                        <div class="paste-text">Dán ảnh giá mua mới (Ctrl+V)</div>
                                        ${
                                            itemData.anhGiaMua
                                                ? `<img src="${itemData.anhGiaMua}" class="image-preview current-image" onclick="openImageModal('${itemData.anhGiaMua}')" alt="Ảnh giá mua hiện tại">`
                                                : '<div class="no-image">Chưa có ảnh</div>'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="modal-button secondary" onclick="closeEditModal()">Hủy</button>
                    <button class="modal-button primary" onclick="saveFullEditChanges('${itemData.id}', '${itemData.tenSanPham || itemData.maSanPham || "Unknown"}')">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Setup paste areas
    const productImagePaste = document.getElementById("editProductImagePaste");
    const priceImagePaste = document.getElementById("editPriceImagePaste");

    if (productImagePaste) setupModalPasteArea(productImagePaste);
    if (priceImagePaste) setupModalPasteArea(priceImagePaste);

    // Focus on first input
    setTimeout(() => {
        const firstInput = document.getElementById("editProductName");
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 100);

    // Add escape key listener
    document.addEventListener("keydown", handleModalEscape);
}

function setupModalPasteArea(pasteArea) {
    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        pasteArea.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop area
    ["dragenter", "dragover"].forEach((eventName) => {
        pasteArea.addEventListener(
            eventName,
            () => pasteArea.classList.add("dragover"),
            false,
        );
    });

    ["dragleave", "drop"].forEach((eventName) => {
        pasteArea.addEventListener(
            eventName,
            () => pasteArea.classList.remove("dragover"),
            false,
        );
    });

    // Handle paste event
    pasteArea.addEventListener("paste", function (e) {
        e.preventDefault();
        const items = e.clipboardData?.items;
        if (!items) return;

        pasteArea.classList.add("pasting");

        for (let item of items) {
            if (item.type.indexOf("image") !== -1) {
                const file = item.getAsFile();
                if (file) {
                    displayModalPastedImage(file, pasteArea);
                    break;
                }
            }
        }

        setTimeout(() => {
            pasteArea.classList.remove("pasting");
        }, 300);
    });

    // Handle drop event
    pasteArea.addEventListener("drop", function (e) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.type.indexOf("image") !== -1) {
            displayModalPastedImage(file, pasteArea);
        }
    });

    // Focus on click
    pasteArea.addEventListener("click", function () {
        this.focus();
    });
}

function displayModalPastedImage(file, pasteArea) {
    const reader = new FileReader();
    reader.onload = function (e) {
        // Remove existing current image
        const currentImage = pasteArea.querySelector(".current-image");
        const noImage = pasteArea.querySelector(".no-image");
        if (currentImage) currentImage.remove();
        if (noImage) noImage.remove();

        // Create new preview
        const preview = document.createElement("img");
        preview.src = e.target.result;
        preview.className = "image-preview new-image";
        preview.onclick = () => openImageModal(e.target.result);
        preview.alt = "Ảnh mới";

        pasteArea.appendChild(preview);
        pasteArea.classList.add("has-image");

        // Store file data
        pasteArea._pastedFile = file;
    };
    reader.readAsDataURL(file);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function closeEditModal() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) {
        modal.classList.remove("show");
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
    document.removeEventListener("keydown", handleModalEscape);
}

function handleModalEscape(event) {
    if (event.key === "Escape") {
        closeEditModal();
    }
}

async function saveFullEditChanges(inventoryId, itemInfo) {
    try {
        showFloatingAlert("Đang lưu thay đổi...", true);

        // Get form values
        const productName = document
            .getElementById("editProductName")
            .value.trim();
        const productCode = document
            .getElementById("editProductCode")
            .value.trim();
        const variant = document.getElementById("editVariant").value.trim();
        const quantity =
            parseInt(document.getElementById("editQuantity").value) || 0;
        const buyPrice =
            parseFloat(document.getElementById("editBuyPrice").value) || 0;
        const sellPrice =
            parseFloat(document.getElementById("editSellPrice").value) || 0;
        const notes = document.getElementById("editNotes").value.trim();

        if (!productName) {
            hideFloatingAlert();
            showFloatingAlert("Tên sản phẩm không được để trống!", false, 3000);
            return;
        }

        const updateData = {
            tenSanPham: productName,
            maSanPham: productCode,
            bienThe: variant,
            soLuong: quantity,
            giaMua: buyPrice,
            giaBan: sellPrice,
            ghiChu: notes,
            lastUpdated: getFormattedDateTime(),
            updatedBy: getUserName(),
        };

        // Handle image uploads if new images were pasted
        const productImagePaste = document.getElementById(
            "editProductImagePaste",
        );
        const priceImagePaste = document.getElementById("editPriceImagePaste");

        if (productImagePaste && productImagePaste._pastedFile) {
            try {
                console.log("Uploading new product image...");
                updateData.anhSanPham = await uploadImageToFirebaseStorage(
                    productImagePaste._pastedFile,
                    "dathang/product",
                );
                console.log("Product image uploaded:", updateData.anhSanPham);
            } catch (error) {
                console.warn("Không thể upload ảnh sản phẩm:", error);
            }
        }

        if (priceImagePaste && priceImagePaste._pastedFile) {
            try {
                console.log("Uploading new price image...");
                updateData.anhGiaMua = await uploadImageToFirebaseStorage(
                    priceImagePaste._pastedFile,
                    "dathang/price",
                );
                console.log("Price image uploaded:", updateData.anhGiaMua);
            } catch (error) {
                console.warn("Không thể upload ảnh giá:", error);
            }
        }

        // Update in Firebase
        await updateOrderInventoryData(inventoryId, updateData);

        // IMPROVED: Update cached data and refresh table immediately
        await refreshCachedDataAndTable();

        // Close modal
        closeEditModal();

        // Log action
        logAction(
            "edit",
            `Chỉnh sửa sản phẩm "${productName}" - ID: ${inventoryId}`,
            null,
            updateData,
        );

        hideFloatingAlert();
        showFloatingAlert("Lưu thay đổi thành công!", false, 2000);
    } catch (error) {
        console.error("Lỗi khi lưu thay đổi:", error);
        hideFloatingAlert();
        showFloatingAlert(
            "Lỗi khi lưu thay đổi: " + error.message,
            false,
            3000,
        );
    }
}

async function uploadImageToFirebaseStorage(file, folder) {
    try {
        // Create a storage reference
        const storageRef = firebase.storage().ref();
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const imageRef = storageRef.child(fileName);

        console.log(`Uploading image to: ${fileName}`);

        // Upload file
        const snapshot = await imageRef.put(file);
        console.log("Upload completed:", snapshot);

        // Get download URL
        const downloadURL = await snapshot.ref.getDownloadURL();
        console.log("Download URL:", downloadURL);

        return downloadURL;
    } catch (error) {
        console.error("Error uploading image to Firebase Storage:", error);
        throw error;
    }
}

async function updateOrderInventoryData(orderId, updateData) {
    try {
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

        // Find the order by ID
        const orderIndex = orderData.findIndex((order) => order.id === orderId);

        if (orderIndex !== -1) {
            orderData[orderIndex] = {
                ...orderData[orderIndex],
                ...updateData,
            };
            console.log("Updated order data:", orderData[orderIndex]);
        } else {
            throw new Error("Không tìm thấy đơn hàng để cập nhật");
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });
        console.log("Successfully updated Firebase with order data");
    } catch (error) {
        console.error("Error updating order data:", error);
        throw error;
    }
}

async function deleteInventoryItem(event) {
    const auth = getAuthState();
    // Allow both permission level 0 and 3 to delete
    if (
        !auth ||
        (parseInt(auth.checkLogin) > 0 && parseInt(auth.checkLogin) !== 3)
    ) {
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

    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    const confirmMessage = `Bạn có chắc chắn muốn xóa sản phẩm "${itemInfo}"?\nID: ${inventoryId}`;

    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) return;

    showFloatingAlert("Đang xóa sản phẩm...", true);

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
            }
        }

        // Remove from Firebase
        await removeItemFromFirebase(inventoryId);

        // IMPROVED: Update cached data and refresh table immediately
        await refreshCachedDataAndTable();

        // Log action
        logAction(
            "delete",
            `Xóa sản phẩm "${itemInfo}" - ID: ${inventoryId}`,
            oldItemData,
            null,
        );

        hideFloatingAlert();
        showFloatingAlert("Đã xóa sản phẩm thành công!", false, 2000);
    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xóa:", error);
        showFloatingAlert("Lỗi khi xóa: " + error.message, false, 3000);
    }
}

async function removeItemFromFirebase(itemId) {
    try {
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

        // Filter out the item to delete
        const filteredData = orderData.filter((order) => order.id !== itemId);

        if (filteredData.length === orderData.length) {
            throw new Error("Không tìm thấy sản phẩm để xóa");
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: filteredData });
        console.log("Successfully removed item from Firebase");
    } catch (error) {
        console.error("Error removing item from Firebase:", error);
        throw error;
    }
}

// NEW: Function to refresh cached data and table without full page reload
async function refreshCachedDataAndTable() {
    try {
        // Clear cache to force fresh data load
        invalidateCache();

        // Use existing loadInventoryData function which already handles all the logic
        await loadInventoryData();

        console.log("Table refreshed successfully using loadInventoryData()");
    } catch (error) {
        console.error("Error refreshing cached data and table:", error);

        // Fallback: try manual refresh
        try {
            // Load fresh data from Firebase
            const doc = await collectionRef.doc("dathang").get();
            let orderData = [];

            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    orderData = data.data;
                    console.log(
                        `Fallback: Refreshed ${orderData.length} orders from Firebase`,
                    );
                }
            }

            if (orderData.length > 0) {
                // Transform data to inventory format
                const inventoryData = transformOrderDataToInventory(orderData);

                // Sort by upload time (newest first)
                const sortedData = inventoryData.sort((a, b) => {
                    const dateA = parseVietnameseDate(a.thoiGianUpload);
                    const dateB = parseVietnameseDate(b.thoiGianUpload);
                    if (dateA && dateB) {
                        return dateB - dateA;
                    }
                    return 0;
                });

                // Update global state
                globalState.inventoryData = sortedData;

                // Update cache
                setCachedData(sortedData);

                // Re-render table with fresh data
                renderInventoryTable(sortedData);

                // Update filter options
                updateFilterOptions(sortedData);

                console.log(
                    "Fallback refresh successful with",
                    sortedData.length,
                    "items",
                );
            }
        } catch (fallbackError) {
            console.error("Fallback refresh also failed:", fallbackError);
            throw fallbackError;
        }
    }
}

// Make functions globally available
window.closeEditModal = closeEditModal;
window.saveFullEditChanges = saveFullEditChanges;
window.refreshCachedDataAndTable = refreshCachedDataAndTable;

console.log("Improved CRUD operations with auto table refresh loaded");
