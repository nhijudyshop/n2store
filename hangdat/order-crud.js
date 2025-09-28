// Order Management System - CRUD Operations
// Create, Read, Update, Delete operations for orders

// =====================================================
// CRUD OPERATIONS
// =====================================================

// UPLOAD TO FIRESTORE WITH ID - OPTIMIZED
async function uploadToFirestore(orderData) {
    try {
        const doc = await collectionRef.doc("dathang").get();

        if (doc.exists) {
            await collectionRef.doc("dathang").update({
                data: firebase.firestore.FieldValue.arrayUnion(orderData),
            });
        } else {
            await collectionRef.doc("dathang").set({
                data: firebase.firestore.FieldValue.arrayUnion(orderData),
            });
        }

        // Log action with ID
        logAction(
            "add",
            `Thêm đơn hàng mới "${orderData.tenSanPham}" - Hóa đơn: ${orderData.hoaDon} - ID: ${orderData.id}`,
            null,
            orderData,
        );

        console.log("Document với ID tải lên thành công:", orderData.id);
        return true;
    } catch (error) {
        console.error("Lỗi khi tải document lên: ", error);
        throw error;
    }
}

// OPTIMIZED BATCH UPLOAD TO FIRESTORE
async function uploadOrdersBatchToFirestore(orders) {
    try {
        const doc = await collectionRef.doc("dathang").get();
        const currentData = doc.exists ? doc.data().data || [] : [];

        // Add all new orders to existing data
        const updatedData = [...currentData, ...orders];

        // Single update operation for all orders
        await collectionRef.doc("dathang").set({
            data: updatedData,
        });

        // Log batch action
        logAction(
            "batch_add",
            `Thêm ${orders.length} đơn hàng mới (batch upload)`,
            null,
            { count: orders.length, orders: orders.map((o) => o.id) },
        );

        console.log(`Batch upload thành công: ${orders.length} đơn hàng`);
        return true;
    } catch (error) {
        console.error("Lỗi khi batch upload: ", error);
        throw error;
    }
}

// DELETE ORDER BY ID
async function deleteOrderByID(event) {
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
    const orderId = button.getAttribute("data-order-id");
    const orderInfo = button.getAttribute("data-order-info");

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        return;
    }

    const confirmDelete = confirm(
        `Bạn có chắc chắn muốn xóa đơn hàng "${orderInfo}"?\nID: ${orderId}`,
    );
    if (!confirmDelete) return;

    const row = button.closest("tr");

    // Get old data for logging
    const oldOrderData = {
        id: orderId,
        info: orderInfo,
        ngayDatHang: row.cells[0].textContent,
        nhaCungCap: row.cells[1].textContent,
        hoaDon: row.cells[2].textContent,
        tenSanPham: row.cells[3].textContent,
    };

    showFloatingAlert("Đang xóa...", true);

    try {
        const doc = await collectionRef.doc("dathang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'dathang'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        // Find and delete by ID
        const index = data.data.findIndex((item) => item.id === orderId);

        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        // Remove item by index
        data.data.splice(index, 1);

        await collectionRef.doc("dathang").update({ data: data.data });

        // Log action
        logAction(
            "delete",
            `Xóa đơn hàng "${orderInfo}" - ID: ${orderId}`,
            oldOrderData,
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

// UPDATE ORDER BY ID
async function updateOrderByID(event) {
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
    const orderId = input.getAttribute("data-order-id");
    const newValue =
        input.type === "number" ? parseFloat(input.value) : input.value;
    const oldValue =
        input.type === "number"
            ? parseFloat(input.defaultValue)
            : input.defaultValue;

    // Determine field name
    let fieldName;
    if (input.className.includes("quantity")) {
        fieldName = "soLuong";
    } else if (input.className.includes("price-buy")) {
        fieldName = "giaMua";
    } else if (input.className.includes("price-sell")) {
        fieldName = "giaBan";
    }

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        input.value = oldValue;
        return;
    }

    const row = input.closest("tr");
    const orderInfo = `${row.cells[3].textContent} - ${row.cells[2].textContent}`;

    // Confirm change
    if (newValue !== oldValue) {
        let fieldDisplayName;
        if (fieldName === "soLuong") {
            fieldDisplayName = "số lượng";
        } else if (fieldName === "giaMua") {
            fieldDisplayName = "giá mua";
        } else if (fieldName === "giaBan") {
            fieldDisplayName = "giá bán";
        }

        const valueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(newValue)
                : newValue;
        const oldValueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(oldValue)
                : oldValue;

        const confirmMessage = `Bạn có chắc chắn muốn thay đổi ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay}?\nID: ${orderId}`;

        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldValue;
            return;
        }
    }

    if (fieldName === "soLuong" && newValue < 1) {
        showFloatingAlert("Số lượng phải lớn hơn 0", false, 3000);
        input.value = oldValue;
        return;
    }

    if ((fieldName === "giaMua" || fieldName === "giaBan") && newValue < 0) {
        showFloatingAlert(
            `${fieldName === "giaMua" ? "Giá mua" : "Giá bán"} phải lớn hơn hoặc bằng 0`,
            false,
            3000,
        );
        input.value = oldValue;
        return;
    }

    showFloatingAlert("Đang cập nhật...", true);

    const oldData = { id: orderId, [fieldName]: oldValue };
    const newData = { id: orderId, [fieldName]: newValue };

    try {
        const doc = await collectionRef.doc("dathang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Find and update by ID
        const index = data.data.findIndex((item) => item.id === orderId);

        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        data.data[index][fieldName] = newValue;

        await collectionRef.doc("dathang").update({ data: data.data });

        let fieldDisplayName;
        if (fieldName === "soLuong") {
            fieldDisplayName = "số lượng";
        } else if (fieldName === "giaMua") {
            fieldDisplayName = "giá mua";
        } else if (fieldName === "giaBan") {
            fieldDisplayName = "giá bán";
        }

        const valueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(newValue)
                : newValue;
        const oldValueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(oldValue)
                : oldValue;

        // Log action
        logAction(
            "update",
            `Cập nhật ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay} - ID: ${orderId}`,
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

// EDIT ORDER BY ID - Complete implementation
async function editOrderByID(event) {
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
    const orderId = button.getAttribute("data-order-id");
    const orderInfo = button.getAttribute("data-order-info");

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        return;
    }

    try {
        // Get current data
        const doc = await collectionRef.doc("dathang").get();
        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        const orderIndex = data.data.findIndex((item) => item.id === orderId);

        if (orderIndex === -1) {
            throw new Error("Không tìm thấy đơn hàng");
        }

        const currentOrder = data.data[orderIndex];

        // Create edit modal
        createEditModal(currentOrder, async (updatedOrder) => {
            try {
                showLoading("Đang cập nhật...");

                // Update the order
                data.data[orderIndex] = { ...currentOrder, ...updatedOrder };
                await collectionRef.doc("dathang").update({ data: data.data });

                // Log action
                logAction(
                    "edit",
                    `Chỉnh sửa đơn hàng "${orderInfo}" - ID: ${orderId}`,
                    currentOrder,
                    updatedOrder,
                );

                invalidateCache();
                await displayOrderData(); // Reload table

                hideFloatingAlert();
                showSuccess("Cập nhật thành công!");
            } catch (error) {
                console.error("Error updating order:", error);
                showError("Lỗi khi cập nhật: " + error.message);
            }
        });
    } catch (error) {
        console.error("Error editing order:", error);
        showError("Lỗi khi lấy dữ liệu: " + error.message);
    }
}

// Create edit modal
function createEditModal(order, onSave) {
    // Remove existing modal if any
    const existingModal = document.getElementById("editModal");
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modal = document.createElement("div");
    modal.id = "editModal";
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <h3>Chỉnh sửa đơn hàng</h3>
                    <button class="modal-close" onclick="closeEditModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="edit-grid">
                        <div class="edit-group">
                            <label>Ngày đặt hàng:</label>
                            <input type="date" id="editNgayDatHang" value="${order.ngayDatHang || ""}" />
                        </div>
                        <div class="edit-group">
                            <label>Nhà cung cấp:</label>
                            <input type="text" id="editNhaCungCap" value="${sanitizeInput(order.nhaCungCap || "")}" />
                        </div>
                        <div class="edit-group">
                            <label>Hóa đơn:</label>
                            <input type="text" id="editHoaDon" value="${sanitizeInput(order.hoaDon || "")}" />
                        </div>
                        <div class="edit-group">
                            <label>Tên sản phẩm:</label>
                            <input type="text" id="editTenSanPham" value="${sanitizeInput(order.tenSanPham || "")}" />
                        </div>
                        <div class="edit-group">
                            <label>Mã sản phẩm:</label>
                            <input type="text" id="editMaSanPham" value="${sanitizeInput(order.maSanPham || "")}" />
                        </div>
                        <div class="edit-group">
                            <label>Biến thể:</label>
                            <input type="text" id="editBienThe" value="${sanitizeInput(order.bienThe || "")}" />
                        </div>
                        <div class="edit-group full-width">
                            <label>Ghi chú:</label>
                            <textarea id="editGhiChu" rows="3">${sanitizeInput(order.ghiChu || "")}</textarea>
                        </div>
                    </div>
                    
                    <!-- Image Edit Section -->
                    <div class="image-edit-section">
                        <h4>Chỉnh sửa ảnh</h4>
                        <div class="image-edit-grid">
                            <div class="image-edit-group">
                                <label>Ảnh hóa đơn:</label>
                                <div class="image-paste-container" id="invoiceImagePreview" data-type="invoice">
                                    ${createImagePreview(order.anhHoaDon, "invoice")}
                                    <div class="paste-hint">Dán ảnh ở đây (Ctrl+V)</div>
                                </div>
                            </div>
                            
                            <div class="image-edit-group">
                                <label>Ảnh sản phẩm:</label>
                                <div class="image-paste-container" id="productImagePreview" data-type="product">
                                    ${createImagePreview(order.anhSanPham, "product")}
                                    <div class="paste-hint">Dán ảnh ở đây (Ctrl+V)</div>
                                </div>
                            </div>
                            
                            <div class="image-edit-group">
                                <label>Ảnh giá mua:</label>
                                <div class="image-paste-container" id="priceImagePreview" data-type="price">
                                    ${createImagePreview(order.anhGiaMua || order.anhGiaNhap, "price")}
                                    <div class="paste-hint">Dán ảnh ở đây (Ctrl+V)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="closeEditModal()">Hủy</button>
                    <button class="btn-save" onclick="saveEditModal()">Lưu</button>
                </div>
            </div>
        </div>
    `;

    // Add modal styles
    const style = document.createElement("style");
    style.textContent = `
        #editModal .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        }
        
        #editModal .modal-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 16px 64px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            width: 90%;
            max-height: 90vh;
            overflow: hidden;
        }
        
        #editModal .modal-header {
            background: var(--primary-gradient);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        #editModal .modal-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
        }
        
        #editModal .modal-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.3s ease;
        }
        
        #editModal .modal-close:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        #editModal .modal-body {
            padding: 20px;
            max-height: 70vh;
            overflow-y: auto;
        }
        
        #editModal .edit-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
        }
        
        #editModal .edit-group {
            display: flex;
            flex-direction: column;
        }
        
        #editModal .edit-group.full-width {
            grid-column: 1 / -1;
        }
        
        #editModal .edit-group label {
            font-weight: 600;
            margin-bottom: 8px;
            color: #495057;
            font-size: 14px;
        }
        
        #editModal .edit-group input,
        #editModal .edit-group textarea {
            padding: 12px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }
        
        #editModal .edit-group input:focus,
        #editModal .edit-group textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        #editModal .image-edit-section {
            border-top: 1px solid #e9ecef;
            padding-top: 20px;
            margin-top: 20px;
        }
        
        #editModal .image-edit-section h4 {
            margin: 0 0 16px 0;
            color: #495057;
            font-size: 16px;
            font-weight: 600;
        }
        
        #editModal .image-edit-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        
        #editModal .image-edit-group {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        
        #editModal .image-edit-group label {
            align-self: flex-start;
            margin-bottom: 8px;
        }
        
        #editModal .image-paste-container {
            width: 100%;
            min-height: 120px;
            border: 3px dashed #ddd;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            padding: 16px;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 249, 250, 0.6) 100%);
            position: relative;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        #editModal .image-paste-container:hover {
            border-color: #667eea;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(248, 249, 250, 0.8) 100%);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.15);
        }
        
        #editModal .image-paste-container.has-content {
            border-color: #28a745;
            background: linear-gradient(135deg, rgba(40, 167, 69, 0.08) 0%, rgba(248, 255, 249, 0.9) 100%);
        }
        
        #editModal .image-paste-container img {
            max-width: 100%;
            max-height: 100px;
            object-fit: cover;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 2px solid white;
        }
        
        #editModal .paste-hint {
            color: #6c757d;
            font-style: italic;
            font-size: 13px;
            font-weight: 500;
            text-align: center;
            margin-top: 8px;
            position: relative;
            z-index: 2;
        }
        
        #editModal .image-paste-container.has-content .paste-hint {
            display: none;
        }
        
        #editModal .image-paste-container::before {
            content: "";
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.1), transparent);
            transition: left 0.6s ease;
        }
        
        #editModal .image-paste-container:hover::before {
            left: 100%;
        }
        
        #editModal .modal-footer {
            padding: 20px;
            border-top: 1px solid #e9ecef;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        
        #editModal .btn-cancel,
        #editModal .btn-save {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        #editModal .btn-cancel {
            background: #6c757d;
            color: white;
        }
        
        #editModal .btn-cancel:hover {
            background: #5a6268;
        }
        
        #editModal .btn-save {
            background: var(--primary-gradient);
            color: white;
        }
        
        #editModal .btn-save:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
        }
        
        @media (max-width: 768px) {
            #editModal .edit-grid,
            #editModal .image-edit-grid {
                grid-template-columns: 1fr;
            }
            
            #editModal .modal-container {
                width: 95%;
                max-height: 95vh;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    // Store callback and order data for later use
    window.editModalCallback = onSave;
    window.editModalOrder = order;

    // Initialize image upload handlers
    initializeImageUploadHandlers();
}

function createImagePreview(imageData, type) {
    if (!imageData) {
        return "";
    }

    const images = Array.isArray(imageData) ? imageData : [imageData];
    return images
        .map((url) => `<img src="${url}" alt="${type} image" />`)
        .join("");
}

function initializeImageUploadHandlers() {
    const containers = document.querySelectorAll(".image-paste-container");

    containers.forEach((container) => {
        const type = container.getAttribute("data-type");

        // Add paste event listener
        container.addEventListener("paste", (e) => handleImagePaste(e, type));

        // Add click to focus for paste
        container.addEventListener("click", () => {
            container.focus();
        });

        // Make container focusable
        container.setAttribute("tabindex", "0");

        // Add focus styling
        container.addEventListener("focus", () => {
            container.style.borderColor = "#667eea";
            container.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.15)";
        });

        container.addEventListener("blur", () => {
            container.style.borderColor = "#ddd";
            container.style.boxShadow = "none";
        });
    });
}

async function handleImagePaste(event, type) {
    event.preventDefault();

    const items = (event.clipboardData || event.originalEvent.clipboardData)
        .items;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            const file = new File([blob], `${type}.jpg`, { type: blob.type });

            try {
                showLoading(`Đang xử lý ảnh ${type}...`);

                // Compress image
                const compressedFile = await compressImageInModal(file);

                // Create preview
                const container = document.getElementById(
                    `${type}ImagePreview`,
                );
                const img = document.createElement("img");
                img.src = URL.createObjectURL(compressedFile);
                img.onload = () => URL.revokeObjectURL(img.src);

                // Clear container and add new image
                container.innerHTML = "";
                container.appendChild(img);
                container.classList.add("has-content");

                // Store file for later upload
                if (!window.editModalImages) {
                    window.editModalImages = {};
                }
                window.editModalImages[type] = compressedFile;

                hideFloatingAlert();
                showSuccess(`Ảnh ${type} đã được dán thành công!`);
            } catch (error) {
                console.error("Error handling image paste:", error);
                showError("Lỗi khi xử lý ảnh!");
            }
            break;
        }
    }
}

async function compressImageInModal(file) {
    return new Promise((resolve) => {
        const maxWidth = 500;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const width = img.width;
                const height = img.height;

                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    canvas.width = maxWidth;
                    canvas.height = height * ratio;
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                    function (blob) {
                        resolve(
                            new File([blob], file.name, {
                                type: file.type,
                                lastModified: Date.now(),
                            }),
                        );
                    },
                    file.type,
                    0.8,
                );
            };
        };
    });
}

// Global functions for modal
window.closeEditModal = function () {
    const modal = document.getElementById("editModal");
    if (modal) {
        modal.remove();
    }
    window.editModalCallback = null;
    window.editModalOrder = null;
    window.editModalImages = null;
};

window.saveEditModal = async function () {
    if (!window.editModalCallback) return;

    try {
        showLoading("Đang lưu thông tin...");

        const updatedOrder = {
            ngayDatHang: document.getElementById("editNgayDatHang").value,
            nhaCungCap: sanitizeInput(
                document.getElementById("editNhaCungCap").value.trim(),
            ),
            hoaDon: sanitizeInput(
                document.getElementById("editHoaDon").value.trim(),
            ),
            tenSanPham: sanitizeInput(
                document.getElementById("editTenSanPham").value.trim(),
            ),
            maSanPham: sanitizeInput(
                document.getElementById("editMaSanPham").value.trim(),
            ),
            bienThe: sanitizeInput(
                document.getElementById("editBienThe").value.trim(),
            ),
            ghiChu: sanitizeInput(
                document.getElementById("editGhiChu").value.trim(),
            ),
        };

        // Validate required fields
        if (
            !updatedOrder.ngayDatHang ||
            !updatedOrder.nhaCungCap ||
            !updatedOrder.hoaDon ||
            !updatedOrder.tenSanPham
        ) {
            showError("Vui lòng điền đầy đủ các trường bắt buộc");
            return;
        }

        // Upload new images if any
        if (window.editModalImages) {
            for (const [type, file] of Object.entries(window.editModalImages)) {
                if (file) {
                    showLoading(`Đang tải ảnh ${type} lên...`);
                    const imageUrl = await uploadImageToFirebaseFromModal(
                        file,
                        type,
                    );

                    // Map type to field name
                    if (type === "invoice") {
                        updatedOrder.anhHoaDon = imageUrl;
                    } else if (type === "product") {
                        updatedOrder.anhSanPham = imageUrl;
                    } else if (type === "price") {
                        updatedOrder.anhGiaMua = imageUrl;
                    }
                }
            }
        }

        await window.editModalCallback(updatedOrder);
        closeEditModal();
    } catch (error) {
        console.error("Error saving modal:", error);
        showError("Lỗi khi lưu: " + error.message);
    }
};

async function uploadImageToFirebaseFromModal(file, type) {
    if (!file) return null;

    return new Promise((resolve, reject) => {
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const imageRef = storageRef.child(`dathang/${type}/${fileName}`);

        const uploadTask = imageRef.put(file, {
            cacheControl: "public,max-age=31536000",
        });

        uploadTask.on(
            "state_changed",
            function (snapshot) {
                // Progress tracking if needed
            },
            function (error) {
                console.error(`Error uploading ${type} image:`, error);
                reject(error);
            },
            function () {
                uploadTask.snapshot.ref
                    .getDownloadURL()
                    .then(function (downloadURL) {
                        console.log(`${type} image uploaded successfully`);
                        resolve(downloadURL);
                    })
                    .catch(reject);
            },
        );
    });
}

// =====================================================
// MIGRATION FUNCTION
// =====================================================

// MIGRATION FUNCTION (Run once only)
async function migrateDataWithIDs() {
    try {
        showFloatingAlert("Đang kiểm tra và migration dữ liệu...", true);

        const doc = await collectionRef.doc("dathang").get();

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
            await collectionRef.doc("dathang").update({
                data: sortedMigratedData,
            });

            // Log migration
            logAction(
                "migration",
                `Migration hoàn tất: Thêm ID cho ${migratedData.filter((item) => item.id).length} đơn hàng và sắp xếp theo thời gian`,
                null,
                null,
            );

            console.log(
                `Migration hoàn tất: Đã thêm ID cho ${migratedData.length} đơn hàng và sắp xếp theo thời gian`,
            );
            showFloatingAlert("Migration hoàn tất!", false, 3000);
        } else {
            // If no ID changes, just sort again
            const sortedData = sortDataByNewest(data.data);

            // Check if order changed
            const orderChanged =
                JSON.stringify(data.data) !== JSON.stringify(sortedData);

            if (orderChanged) {
                await collectionRef.doc("dathang").update({
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

function migrateOldPriceData(dataArray) {
    return dataArray.map((order) => {
        // Nếu có giaNhap nhưng không có giaMua, copy giaNhap sang giaMua
        if (order.giaNhap && !order.giaMua) {
            order.giaMua = order.giaNhap;
        }

        // Nếu có anhGiaNhap nhưng không có anhGiaMua, copy sang anhGiaMua
        if (order.anhGiaNhap && !order.anhGiaMua) {
            order.anhGiaMua = order.anhGiaNhap;
        }

        // Nếu không có giaBan, set default = 0
        if (order.giaBan === undefined) {
            order.giaBan = 0;
        }

        return order;
    });
}

console.log("Order Management System - CRUD Operations loaded");
