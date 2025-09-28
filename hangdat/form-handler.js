// =====================================================
// FORM HANDLER WITH PASTE FUNCTIONALITY AND AUTO TABLE REFRESH
// =====================================================

let formState = {
    orderCounter: 0,
    productCounter: 0,
    isFormView: false,
    currentEditingOrder: null,
};

// Initialize form functionality
function initializeFormSystem() {
    setupFormEventListeners();
    loadFormCounters();
    addProductRow();
    setupPasteHandlers();
}

function setupFormEventListeners() {
    // Toggle view button
    const toggleBtn = document.getElementById("toggleViewBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", toggleView);
    }

    // Form submission
    const orderForm = document.getElementById("orderForm");
    if (orderForm) {
        orderForm.addEventListener("submit", handleFormSubmit);
    }

    // Add product button
    const addProductBtn = document.getElementById("addProductBtn");
    if (addProductBtn) {
        addProductBtn.addEventListener("click", addProductRow);
    }
}

function setupPasteHandlers() {
    // Setup paste handler for invoice image
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea) {
        setupPasteArea(invoicePasteArea, "invoicePreview");
    }
}

function setupPasteArea(pasteArea, previewId) {
    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        pasteArea.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop area when item is dragged over it
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
        handlePaste(e, pasteArea, previewId);
    });

    // Handle drop event
    pasteArea.addEventListener("drop", function (e) {
        e.preventDefault();
        handleDrop(e, pasteArea, previewId);
    });

    // Make area focusable for paste
    pasteArea.setAttribute("tabindex", "0");

    // Focus on click
    pasteArea.addEventListener("click", function () {
        this.focus();
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handlePaste(e, pasteArea, previewId) {
    const items = e.clipboardData?.items;
    if (!items) return;

    pasteArea.classList.add("pasting");

    for (let item of items) {
        if (item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            if (file) {
                displayPastedImage(file, pasteArea, previewId);
                break;
            }
        }
    }

    setTimeout(() => {
        pasteArea.classList.remove("pasting");
    }, 300);
}

function handleDrop(e, pasteArea, previewId) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type.indexOf("image") !== -1) {
        displayPastedImage(file, pasteArea, previewId);
    }
}

function displayPastedImage(file, pasteArea, previewId) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = e.target.result;
            preview.style.display = "block";
            pasteArea.classList.add("has-image");

            // Store file data for form submission
            pasteArea._pastedFile = file;

            // Add click to view full size
            preview.onclick = () => openImageModal(e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

function setupProductPasteArea(pasteArea, previewClass) {
    pasteArea.className = "paste-area product-paste-area";

    // Create preview image
    const preview = document.createElement("img");
    preview.className = `${previewClass} image-preview`;
    preview.style.display = "none";
    pasteArea.appendChild(preview);

    // Setup paste functionality
    setupPasteArea(pasteArea, null);

    // Custom paste handler for product areas
    pasteArea.addEventListener("paste", function (e) {
        e.preventDefault();
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {
            if (item.type.indexOf("image") !== -1) {
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        preview.src = e.target.result;
                        preview.style.display = "block";
                        pasteArea.classList.add("has-image");
                        pasteArea._pastedFile = file;
                        preview.onclick = () => openImageModal(e.target.result);
                    };
                    reader.readAsDataURL(file);
                    break;
                }
            }
        }
    });
}

function toggleView() {
    const formContainer = document.getElementById("formContainer");
    const inventoryContainer = document.getElementById("inventoryContainer");
    const toggleBtn = document.getElementById("toggleViewBtn");

    if (!formState.isFormView) {
        // Switch to form view
        formContainer.style.display = "block";
        inventoryContainer.style.display = "none";
        toggleBtn.textContent = "Ẩn biểu mẫu";
        toggleBtn.setAttribute("data-icon", "➖");
        formContainer.classList.add("fade-in");
        formState.isFormView = true;
    } else {
        // Switch to inventory view
        formContainer.style.display = "none";
        inventoryContainer.style.display = "block";
        toggleBtn.textContent = "Hiện biểu mẫu";
        toggleBtn.setAttribute("data-icon", "➕");
        inventoryContainer.classList.add("fade-in");
        formState.isFormView = false;
    }

    // Remove animation class after animation completes
    setTimeout(() => {
        formContainer.classList.remove("fade-in");
        inventoryContainer.classList.remove("fade-in");
    }, 500);
}

function addProductRow() {
    const tbody = document.getElementById("productsTableBody");
    if (!tbody) return;

    const row = document.createElement("tr");
    row.innerHTML = `
        <td><input type="text" name="productName[]" placeholder="Tên sản phẩm" required></td>
        <td><input type="text" name="productCode[]" placeholder="Mã sản phẩm"></td>
        <td><input type="text" name="variant[]" placeholder="Biến thể"></td>
        <td><input type="number" name="quantity[]" placeholder="0" min="1" required></td>
        <td><input type="number" name="buyPrice[]" placeholder="0" step="0.01" min="0"></td>
        <td><input type="number" name="sellPrice[]" placeholder="0" step="0.01" min="0"></td>
        <td>
            <div class="paste-area product-paste-area" tabindex="0">
                <div class="paste-text">Dán ảnh sản phẩm</div>
            </div>
        </td>
        <td>
            <div class="paste-area product-paste-area" tabindex="0">
                <div class="paste-text">Dán ảnh giá</div>
            </div>
        </td>
        <td><input type="text" name="notes[]" placeholder="Ghi chú"></td>
        <td><button type="button" class="delete-button" onclick="removeProductRow(this)"></button></td>
    `;

    tbody.appendChild(row);

    // Setup paste areas for this row
    const pasteAreas = row.querySelectorAll(".paste-area");
    pasteAreas[0] && setupProductPasteArea(pasteAreas[0], "product-preview");
    pasteAreas[1] && setupProductPasteArea(pasteAreas[1], "price-preview");
}

function removeProductRow(button) {
    const tbody = document.getElementById("productsTableBody");
    if (tbody.children.length > 1) {
        button.closest("tr").remove();
    } else {
        showFloatingAlert("Phải có ít nhất một sản phẩm!", false, 3000);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    try {
        showFloatingAlert("Đang xử lý đơn hàng...", true);

        const formData = new FormData(e.target);
        const order = await buildOrderFromForm(formData);

        if (order.products.length === 0) {
            hideFloatingAlert();
            showFloatingAlert(
                "Vui lòng thêm ít nhất một sản phẩm!",
                false,
                3000,
            );
            return;
        }

        // Save to Firebase
        await saveOrderToFirebase(order);

        // Reset form
        resetForm();

        // IMPROVED: Always refresh the table data after adding new order
        // This ensures the table shows the new data immediately
        try {
            await refreshCachedDataAndTable();
            console.log("Table refreshed successfully after adding new order");
        } catch (refreshError) {
            console.warn(
                "Failed to refresh table after adding order:",
                refreshError,
            );
            // Fallback: try to load fresh data
            try {
                await loadInventoryData();
            } catch (loadError) {
                console.error("Failed to load fresh data:", loadError);
            }
        }

        hideFloatingAlert();
        showFloatingAlert("Đơn đặt hàng đã được lưu thành công!", false, 3000);

        // Log action
        logAction(
            "create",
            `Tạo đơn đặt hàng mới - Nhà cung cấp: ${order.nhaCungCap}, Số sản phẩm: ${order.products.length}`,
            null,
            order,
        );

        // Auto-switch to inventory view to show the new data
        if (formState.isFormView) {
            setTimeout(() => {
                toggleView();
                showFloatingAlert(
                    "Đã chuyển sang xem danh sách sản phẩm mới!",
                    false,
                    2000,
                );
            }, 1000);
        }
    } catch (error) {
        console.error("Lỗi khi lưu đơn hàng:", error);
        hideFloatingAlert();
        showFloatingAlert(
            "Lỗi khi lưu đơn hàng: " + error.message,
            false,
            5000,
        );
    }
}

async function buildOrderFromForm(formData) {
    const order = {
        id: generateUniqueID(),
        ngayDatHang: formData.get("orderDate"),
        nhaCungCap: formData.get("supplier"),
        hoaDon: formData.get("invoice"),
        anhHoaDon: null,
        products: [],
        thoiGianUpload: getFormattedDateTime(),
        createdBy: getUserName(),
    };

    // Handle invoice image from paste
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea && invoicePasteArea._pastedFile) {
        try {
            order.anhHoaDon = await uploadImageToFirebase(
                invoicePasteArea._pastedFile,
                "invoices",
            );
        } catch (error) {
            console.warn("Không thể upload ảnh hóa đơn:", error);
        }
    }

    // Handle products
    const productNames = formData.getAll("productName[]");
    const productCodes = formData.getAll("productCode[]");
    const variants = formData.getAll("variant[]");
    const quantities = formData.getAll("quantity[]");
    const buyPrices = formData.getAll("buyPrice[]");
    const sellPrices = formData.getAll("sellPrice[]");
    const notes = formData.getAll("notes[]");

    const productRows = document.querySelectorAll("#productsTableBody tr");

    for (let i = 0; i < productNames.length; i++) {
        if (productNames[i].trim()) {
            const product = {
                id: generateUniqueID(),
                tenSanPham: productNames[i].trim(),
                maSanPham: productCodes[i] || "",
                bienThe: variants[i] || "",
                soLuong: parseInt(quantities[i]) || 0,
                giaMua: parseFloat(buyPrices[i]) || 0,
                giaBan: parseFloat(sellPrices[i]) || 0,
                anhSanPham: null,
                anhGiaMua: null,
                ghiChu: notes[i] || "",
            };

            // Get paste areas from this row
            const row = productRows[i];
            if (row) {
                const pasteAreas = row.querySelectorAll(".paste-area");

                // Handle product image
                if (pasteAreas[0] && pasteAreas[0]._pastedFile) {
                    try {
                        product.anhSanPham = await uploadImageToFirebase(
                            pasteAreas[0]._pastedFile,
                            "products",
                        );
                    } catch (error) {
                        console.warn("Không thể upload ảnh sản phẩm:", error);
                    }
                }

                // Handle price image
                if (pasteAreas[1] && pasteAreas[1]._pastedFile) {
                    try {
                        product.anhGiaMua = await uploadImageToFirebase(
                            pasteAreas[1]._pastedFile,
                            "prices",
                        );
                    } catch (error) {
                        console.warn("Không thể upload ảnh giá:", error);
                    }
                }
            }

            order.products.push(product);
        }
    }

    return order;
}

async function uploadImageToFirebase(file, folder) {
    // Create a storage reference
    const storageRef = firebase.storage().ref();
    const fileName = `${folder}/${Date.now()}_${file.name || "pasted_image.png"}`;
    const imageRef = storageRef.child(fileName);

    // Upload file
    const snapshot = await imageRef.put(file);

    // Get download URL
    const downloadURL = await snapshot.ref.getDownloadURL();
    return downloadURL;
}

async function saveOrderToFirebase(order) {
    try {
        // Get existing data
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        }

        // Transform order to match existing data structure and add each product as separate entry
        order.products.forEach((product) => {
            const orderEntry = {
                id: product.id,
                ngayDatHang: order.ngayDatHang,
                nhaCungCap: order.nhaCungCap,
                hoaDon: order.hoaDon,
                anhHoaDon: order.anhHoaDon,
                tenSanPham: product.tenSanPham,
                maSanPham: product.maSanPham,
                bienThe: product.bienThe,
                soLuong: product.soLuong,
                giaMua: product.giaMua,
                giaBan: product.giaBan,
                anhSanPham: product.anhSanPham,
                anhGiaMua: product.anhGiaMua,
                ghiChu: product.ghiChu,
                thoiGianUpload: order.thoiGianUpload,
                createdBy: order.createdBy,
            };
            orderData.push(orderEntry);
        });

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });

        // Invalidate cache so fresh data will be loaded
        invalidateCache();

        console.log("Đơn hàng đã được lưu thành công vào Firebase");
    } catch (error) {
        console.error("Lỗi khi lưu đơn hàng:", error);
        throw error;
    }
}

function resetForm() {
    const form = document.getElementById("orderForm");
    if (form) {
        form.reset();
    }

    // Clear image previews and paste areas
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea) {
        const preview = document.getElementById("invoicePreview");
        if (preview) {
            preview.style.display = "none";
        }
        invoicePasteArea.classList.remove("has-image");
        delete invoicePasteArea._pastedFile;
    }

    // Reset products table
    const tbody = document.getElementById("productsTableBody");
    if (tbody) {
        tbody.innerHTML = "";
        addProductRow();
    }

    // Set today's date as default
    const orderDate = document.getElementById("orderDate");
    if (orderDate) {
        orderDate.value = new Date().toISOString().split("T")[0];
    }
}

function loadFormCounters() {
    // Load counters from existing data to avoid ID conflicts
    const cachedData = getCachedData();
    if (cachedData && Array.isArray(cachedData)) {
        const existingIds = cachedData
            .map((item) => item.id || "")
            .filter((id) => id);
        if (existingIds.length > 0) {
            // Extract counter values from existing IDs
            const counterValues = existingIds
                .filter((id) => id.includes("inv_"))
                .map((id) => {
                    const parts = id.split("_");
                    return parts.length > 1 ? parseInt(parts[1], 36) : 0;
                })
                .filter((val) => !isNaN(val));

            if (counterValues.length > 0) {
                formState.orderCounter = Math.max(...counterValues);
                formState.productCounter = formState.orderCounter;
            }
        }
    }
}

// Make functions globally available
window.removeProductRow = removeProductRow;
window.toggleView = toggleView;

console.log("Enhanced form handler with auto table refresh loaded");
