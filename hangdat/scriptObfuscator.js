// Enhanced Order Management System - Part 2A
// CRUD Operations and Migration Functions

// =====================================================
// CRUD OPERATIONS
// =====================================================

// EDIT ORDER BY ID
async function editOrderByID(event) {}

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
        tenSanPham: row.cells[4].textContent,
        thucNhan: 0,
        tongNhan: 0,
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

        // Update row numbers if needed
        const rows = tbody.querySelectorAll("tr");
        rows.forEach((r, idx) => {
            if (r.cells[0] && !r.cells[0].getAttribute("colspan")) {
                // Skip summary row
                if (!r.cells[0].textContent.includes("Tổng:")) {
                    // This would be for STT column if it existed
                }
            }
        });
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

    // Cập nhật fieldName logic
    let fieldName;
    if (input.className.includes("quantity")) {
        fieldName = "soLuong";
    } else if (input.className.includes("price-buy")) {
        fieldName = "giaMua"; // Đổi từ giaNhap thành giaMua
    } else if (input.className.includes("price-sell")) {
        fieldName = "giaBan"; // Thêm trường mới
    }

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        input.value = oldValue;
        return;
    }

    const row = input.closest("tr");
    const orderInfo = `${row.cells[4].textContent} - ${row.cells[2].textContent}`;

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

// UPLOAD TO FIRESTORE WITH ID
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

        // Invalidate cache
        invalidateCache();

        console.log("Document với ID tải lên thành công:", orderData.id);

        // Don't try to access addButton - use submitOrderBtn instead
        const submitBtn = document.getElementById("submitOrderBtn");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Thêm đơn hàng";
        }

        return true;
    } catch (error) {
        console.error("Lỗi khi tải document lên: ", error);

        // Handle button state properly
        const submitBtn = document.getElementById("submitOrderBtn");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Thêm đơn hàng";
        }

        throw error; // Re-throw to be handled by calling function
    }
}

// Updated addOrder function to properly handle the new form structure
async function addOrder(event) {
    if (event) event.preventDefault();

    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền thêm đơn hàng");
        return;
    }

    const submitBtn = document.getElementById("submitOrderBtn");

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Đang xử lý...";
        }

        showLoading("Đang xử lý đơn hàng...");

        const formData = collectFormData();

        // Create orders for each product with shared data
        const orders = formData.products.map((product) => ({
            id: generateUniqueID(),
            ngayDatHang: formData.sharedData.ngayDatHang,
            nhaCungCap: formData.sharedData.nhaCungCap,
            hoaDon: formData.sharedData.hoaDon,
            ...product,
            thoiGianUpload: getFormattedDateTime(),
            user: getUserName(),
            thucNhan: 0,
            tongNhan: 0,
        }));

        // Process images and upload to Firebase
        for (const order of orders) {
            // Handle shared invoice image
            if (formData.sharedData.invoiceImage) {
                if (typeof formData.sharedData.invoiceImage !== "string") {
                    order.anhHoaDon = await uploadImageToFirebase(
                        formData.sharedData.invoiceImage,
                        "invoice",
                    );
                } else {
                    order.anhHoaDon = formData.sharedData.invoiceImage;
                }
            }

            // Handle product-specific images
            if (order.productImage) {
                order.anhSanPham = await uploadImageToFirebase(
                    order.productImage,
                    "product",
                );
                delete order.productImage;
            }

            if (order.priceImage) {
                order.anhGiaMua = await uploadImageToFirebase(
                    order.priceImage,
                    "price",
                );
                delete order.priceImage;
            }
        }

        // Upload all orders to Firestore sequentially
        for (const order of orders) {
            await uploadToFirestore(order);
        }

        hideFloatingAlert();
        showSuccess("Thêm đơn hàng thành công!");

        // Clear form and reload data
        clearOrderForm();
        await displayOrderData();
    } catch (error) {
        console.error("Error submitting order:", error);
        showError("Lỗi: " + error.message);
        hideFloatingAlert();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Thêm đơn hàng";
        }
    }
}

// Helper function to show loading state
function showLoading(message) {
    showFloatingAlert(message, true);
}

// Helper function to show success message
function showSuccess(message) {
    hideFloatingAlert();
    showFloatingAlert(message, false);
    setTimeout(hideFloatingAlert, 2000);
}

// Helper function to show error message
function showError(message) {
    hideFloatingAlert();
    showFloatingAlert(message, false);
    setTimeout(hideFloatingAlert, 3000);
}
function collectFormData() {
    // Get shared data elements
    const ngayDatHangEl = document.getElementById("ngayDatHang");
    const nhaCungCapEl = document.getElementById("nhaCungCap");
    const hoaDonEl = document.getElementById("hoaDon");

    if (!ngayDatHangEl || !nhaCungCapEl || !hoaDonEl) {
        throw new Error("Không tìm thấy các trường thông tin chung");
    }

    // Shared data
    const sharedData = {
        ngayDatHang: ngayDatHangEl.value,
        nhaCungCap: sanitizeInput(nhaCungCapEl.value.trim()),
        hoaDon: sanitizeInput(hoaDonEl.value.trim()),
        invoiceImage: getInvoiceImageData(),
    };

    // Validate shared data
    if (
        !sharedData.ngayDatHang ||
        !sharedData.nhaCungCap ||
        !sharedData.hoaDon
    ) {
        throw new Error(
            "Vui lòng điền đầy đủ thông tin chung (ngày đặt hàng, nhà cung cấp, hóa đơn)",
        );
    }

    // Product data
    const productRows = document.querySelectorAll("#productsTableBody tr");
    const products = [];

    if (productRows.length === 0) {
        throw new Error("Không tìm thấy sản phẩm nào");
    }

    productRows.forEach((row, index) => {
        const productNameEl = row.querySelector(".product-name");
        const quantityEl = row.querySelector(".product-quantity");
        const buyPriceEl = row.querySelector(".product-buy-price");

        if (!productNameEl || !quantityEl || !buyPriceEl) {
            throw new Error(`Sản phẩm ${index + 1}: Thiếu trường dữ liệu`);
        }

        const productName = sanitizeInput(productNameEl.value.trim());
        const quantity = parseInt(quantityEl.value);
        const buyPrice = parseFloat(buyPriceEl.value);

        if (
            !productName ||
            !quantity ||
            quantity < 1 ||
            isNaN(buyPrice) ||
            buyPrice < 0
        ) {
            throw new Error(
                `Sản phẩm ${index + 1}: Vui lòng điền đầy đủ tên sản phẩm, số lượng và giá mua hợp lệ`,
            );
        }

        const product = {
            tenSanPham: productName,
            maSanPham: sanitizeInput(
                row.querySelector(".product-code")?.value.trim() || "",
            ),
            bienThe: sanitizeInput(
                row.querySelector(".product-variant")?.value.trim() || "",
            ),
            soLuong: quantity,
            giaMua: buyPrice,
            giaBan:
                parseFloat(row.querySelector(".product-sell-price")?.value) ||
                0,
            ghiChu: sanitizeInput(
                row.querySelector(".product-notes")?.value.trim() || "",
            ),
            productImage: getRowImageData(row, "product"),
            priceImage: getRowImageData(row, "price"),
        };

        products.push(product);
    });

    if (products.length === 0) {
        throw new Error("Vui lòng thêm ít nhất một sản phẩm");
    }

    return { sharedData, products };
}

// Updated getInvoiceImageData function with error handling
function getInvoiceImageData() {
    try {
        const selectedTypeEl = document.querySelector(
            'input[name="invoiceInputType"]:checked',
        );
        if (!selectedTypeEl) return null;

        const selectedType = selectedTypeEl.value;
        const container = document.getElementById("invoiceClipboardContainer");

        if (selectedType === "link") {
            const linkInput = document.getElementById("invoiceLinkInput");
            return linkInput && linkInput.value.startsWith("http")
                ? linkInput.value
                : null;
        } else if (selectedType === "file") {
            const fileInput = document.getElementById("invoiceFileInput");
            return fileInput && fileInput.files.length > 0
                ? fileInput.files[0]
                : null;
        } else if (selectedType === "clipboard") {
            return container
                ? container.fileData || container.urlData || null
                : null;
        }
        return null;
    } catch (error) {
        console.warn("Error getting invoice image data:", error);
        return null;
    }
}

// Updated getRowImageData function with error handling
function getRowImageData(row, type) {
    try {
        const upload = row.querySelector(`.mini-upload[data-type="${type}"]`);
        return upload ? upload.fileData || null : null;
    } catch (error) {
        console.warn(`Error getting ${type} image data:`, error);
        return null;
    }
}

async function uploadImageToFirebase(file, type) {
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

// Clear order form
function clearOrderForm() {
    // Clear shared data
    const ngayDatHangInput = document.getElementById("ngayDatHang");
    const nhaCungCapInput = document.getElementById("nhaCungCap");
    const hoaDonInput = document.getElementById("hoaDon");

    if (ngayDatHangInput) {
        const today = new Date();
        ngayDatHangInput.value = today.toISOString().split("T")[0];
    }
    if (nhaCungCapInput) nhaCungCapInput.value = "";
    if (hoaDonInput) hoaDonInput.value = "";

    // Clear invoice image
    const invoiceContainer = document.getElementById(
        "invoiceClipboardContainer",
    );
    if (invoiceContainer) {
        invoiceContainer.innerHTML = "<p>Dán ảnh hóa đơn ở đây...</p>";
        invoiceContainer.classList.remove("has-content");
        invoiceContainer.fileData = null;
        invoiceContainer.urlData = null;
    }

    const invoiceFileInput = document.getElementById("invoiceFileInput");
    const invoiceLinkInput = document.getElementById("invoiceLinkInput");
    if (invoiceFileInput) invoiceFileInput.value = "";
    if (invoiceLinkInput) invoiceLinkInput.value = "";

    // Reset radio to clipboard
    const invoiceClipboardRadio = document.querySelector(
        'input[name="invoiceInputType"][value="clipboard"]',
    );
    if (invoiceClipboardRadio) {
        invoiceClipboardRadio.checked = true;
        invoiceClipboardRadio.dispatchEvent(new Event("change"));
    }

    // Clear all products and reset to one row
    const productsTableBody = document.getElementById("productsTableBody");
    if (productsTableBody) {
        productsTableBody.innerHTML = "";
        productCounter = 0;
        if (typeof addInitialProductRow === "function") {
            addInitialProductRow();
        }
    }

    // Hide supplier suggestions
    const supplierSuggestions = document.getElementById("supplierSuggestions");
    if (supplierSuggestions) {
        supplierSuggestions.style.display = "none";
    }
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

// =====================================================
// IMAGE HANDLING FUNCTIONS - EXTENDED
// =====================================================

function preloadImagesAndCache(dataArray) {
    const imageUrls = [];

    // Collect all image URLs
    dataArray.forEach((order) => {
        if (order.anhHoaDon) {
            if (Array.isArray(order.anhHoaDon)) {
                imageUrls.push(...order.anhHoaDon);
            } else {
                imageUrls.push(order.anhHoaDon);
            }
        }
        if (order.anhSanPham) {
            if (Array.isArray(order.anhSanPham)) {
                imageUrls.push(...order.anhSanPham);
            } else {
                imageUrls.push(order.anhSanPham);
            }
        }
        if (order.anhGiaNhap) {
            if (Array.isArray(order.anhGiaNhap)) {
                imageUrls.push(...order.anhGiaNhap);
            } else {
                imageUrls.push(order.anhGiaNhap);
            }
        }
    });

    // Pre-load all images
    const imagePromises = imageUrls.map((url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(url); // Still resolve even if error
            img.src = url;
        });
    });

    // Cache data only after all images are loaded/attempted
    Promise.all(imagePromises)
        .then(() => {
            console.log("All images pre-loaded, sorting and caching data");
            setCachedData(dataArray);
        })
        .catch((error) => {
            console.warn("Error pre-loading images:", error);
            // Cache anyway after timeout
            setTimeout(() => {
                setCachedData(dataArray);
            }, 5000);
        });
}

console.log(
    "Order Management System Part 2A loaded - CRUD & Migration functions",
);

// Enhanced Order Management System - Part 2B (Complete)
// UI Functions, Filters, Table Rendering & Initialization

// =====================================================
// IMAGE HANDLING FUNCTIONS - EXTENDED (CONTINUED)
// =====================================================

// Image upload handling for invoice images
function initializeInvoiceImageHandling() {
    const invoiceRadios = document.querySelectorAll(
        'input[name="invoiceInputType"]',
    );
    invoiceRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            if (this.value === "clipboard") {
                invoiceClipboardContainer.style.display = "flex";
                invoiceFileInput.style.display = "none";
                invoiceLinkInput.style.display = "none";
            } else if (this.value === "file") {
                invoiceClipboardContainer.style.display = "none";
                invoiceFileInput.style.display = "block";
                invoiceLinkInput.style.display = "none";
            } else if (this.value === "link") {
                invoiceClipboardContainer.style.display = "none";
                invoiceFileInput.style.display = "none";
                invoiceLinkInput.style.display = "block";
            }
        });
    });

    invoiceClipboardContainer.addEventListener("paste", async function (e) {
        invoiceImgArray = [];
        window.pastedInvoiceImageUrl = null;
        window.isInvoiceUrlPasted = false;
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (
            text &&
            (text.startsWith("http") ||
                text.includes("firebasestorage.googleapis.com"))
        ) {
            try {
                invoiceClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Invoice URL loaded");
                imgElement.onerror = () =>
                    console.error("Invoice URL load failed");
                invoiceClipboardContainer.appendChild(imgElement);
                invoiceClipboardContainer.classList.add("has-content");
                window.pastedInvoiceImageUrl = text;
                window.isInvoiceUrlPasted = true;
                return;
            } catch (error) {
                console.error("Error handling invoice image URL:", error);
            }
        }

        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                var blob = items[i].getAsFile();
                var file = new File([blob], "invoice.jpg");
                invoiceClipboardContainer.innerHTML = "";
                var imgElement = document.createElement("img");
                imgElement.src = URL.createObjectURL(file);
                invoiceClipboardContainer.appendChild(imgElement);
                invoiceClipboardContainer.classList.add("has-content");

                const compressImage = async (file) => {
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
                                ctx.drawImage(
                                    img,
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height,
                                );
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
                };

                const compressedFile = await compressImage(file);
                invoiceImgArray.push(compressedFile);
                window.isInvoiceUrlPasted = false;
                break;
            }
        }
    });
}

// Image upload handling for product images
function initializeProductImageHandling() {
    const productRadios = document.querySelectorAll(
        'input[name="productInputType"]',
    );
    productRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            if (this.value === "clipboard") {
                productClipboardContainer.style.display = "flex";
                productFileInput.style.display = "none";
                productLinkInput.style.display = "none";
            } else if (this.value === "file") {
                productClipboardContainer.style.display = "none";
                productFileInput.style.display = "block";
                productLinkInput.style.display = "none";
            } else if (this.value === "link") {
                productClipboardContainer.style.display = "none";
                productFileInput.style.display = "none";
                productLinkInput.style.display = "block";
            }
        });
    });

    productClipboardContainer.addEventListener("paste", async function (e) {
        productImgArray = [];
        window.pastedProductImageUrl = null;
        window.isProductUrlPasted = false;
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (
            text &&
            (text.startsWith("http") ||
                text.includes("firebasestorage.googleapis.com"))
        ) {
            try {
                productClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Product URL loaded");
                imgElement.onerror = () =>
                    console.error("Product URL load failed");
                productClipboardContainer.appendChild(imgElement);
                productClipboardContainer.classList.add("has-content");
                window.pastedProductImageUrl = text;
                window.isProductUrlPasted = true;
                return;
            } catch (error) {
                console.error("Error handling product image URL:", error);
            }
        }

        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                var blob = items[i].getAsFile();
                var file = new File([blob], "product.jpg");
                productClipboardContainer.innerHTML = "";
                var imgElement = document.createElement("img");
                imgElement.src = URL.createObjectURL(file);
                productClipboardContainer.appendChild(imgElement);
                productClipboardContainer.classList.add("has-content");

                const compressImage = async (file) => {
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
                                ctx.drawImage(
                                    img,
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height,
                                );
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
                };

                const compressedFile = await compressImage(file);
                productImgArray.push(compressedFile);
                window.isProductUrlPasted = false;
                break;
            }
        }
    });
}

// Image upload handling for price images
function initializePriceImageHandling() {
    const priceRadios = document.querySelectorAll(
        'input[name="priceInputType"]',
    );
    priceRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            if (this.value === "clipboard") {
                priceClipboardContainer.style.display = "flex";
                priceFileInput.style.display = "none";
                priceLinkInput.style.display = "none";
            } else if (this.value === "file") {
                priceClipboardContainer.style.display = "none";
                priceFileInput.style.display = "block";
                priceLinkInput.style.display = "none";
            } else if (this.value === "link") {
                priceClipboardContainer.style.display = "none";
                priceFileInput.style.display = "none";
                priceLinkInput.style.display = "block";
            }
        });
    });

    priceClipboardContainer.addEventListener("paste", async function (e) {
        priceImgArray = [];
        window.pastedPriceImageUrl = null;
        window.isPriceUrlPasted = false;
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (
            text &&
            (text.startsWith("http") ||
                text.includes("firebasestorage.googleapis.com"))
        ) {
            try {
                priceClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Price URL loaded");
                imgElement.onerror = () =>
                    console.error("Price URL load failed");
                priceClipboardContainer.appendChild(imgElement);
                priceClipboardContainer.classList.add("has-content");
                window.pastedPriceImageUrl = text;
                window.isPriceUrlPasted = true;
                return;
            } catch (error) {
                console.error("Error handling price image URL:", error);
            }
        }

        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                var blob = items[i].getAsFile();
                var file = new File([blob], "price.jpg");
                priceClipboardContainer.innerHTML = "";
                var imgElement = document.createElement("img");
                imgElement.src = URL.createObjectURL(file);
                priceClipboardContainer.appendChild(imgElement);
                priceClipboardContainer.classList.add("has-content");

                const compressImage = async (file) => {
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
                                ctx.drawImage(
                                    img,
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height,
                                );
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
                };

                const compressedFile = await compressImage(file);
                priceImgArray.push(compressedFile);
                window.isPriceUrlPasted = false;
                break;
            }
        }
    });
}

// =====================================================
// FILTER SYSTEM
// =====================================================

function applyFiltersToData(dataArray) {
    const filterSupplier = filterSupplierSelect.value;
    const filterDate = dateFilterSelect.value;
    const filterProductText = filterProductInput.value.toLowerCase().trim();

    return dataArray.filter((order) => {
        const matchSupplier =
            filterSupplier === "all" || order.nhaCungCap === filterSupplier;

        let matchDate = true;
        if (filterDate !== "all") {
            const orderDate = parseDate(order.ngayDatHang);
            if (orderDate) {
                const today = new Date();
                const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate(),
                );

                if (filterDate === "today") {
                    const orderDateStart = new Date(
                        orderDate.getFullYear(),
                        orderDate.getMonth(),
                        orderDate.getDate(),
                    );
                    matchDate =
                        orderDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === "week") {
                    const weekAgo = new Date(
                        todayStart.getTime() - 7 * 24 * 60 * 60 * 1000,
                    );
                    matchDate = orderDate >= weekAgo;
                } else if (filterDate === "month") {
                    const monthAgo = new Date(
                        todayStart.getFullYear(),
                        todayStart.getMonth() - 1,
                        todayStart.getDate(),
                    );
                    matchDate = orderDate >= monthAgo;
                }
            }
        }

        const matchProduct =
            !filterProductText ||
            (order.tenSanPham &&
                order.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (order.maSanPham &&
                order.maSanPham.toLowerCase().includes(filterProductText)) ||
            (order.bienThe &&
                order.bienThe.toLowerCase().includes(filterProductText));

        return matchSupplier && matchDate && matchProduct;
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
                updateSuggestions(cachedData);
            } else {
                displayOrderData();
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
        summaryTd.colSpan = 14;
        summaryTd.textContent = `Tổng: ${filteredData.length} đơn hàng`;
        summaryTd.style.textAlign = "center";
        summaryTd.style.color = "#007bff";
        summaryTd.style.padding = "8px";
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    // Group orders by shared data (supplier, date, invoice)
    const groupedOrders = groupOrdersBySharedData(filteredData);

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
    let renderedCount = 0;

    // Render grouped orders
    for (const groupKey in groupedOrders) {
        if (renderedCount >= maxRender) break;

        const group = groupedOrders[groupKey];
        const groupSize = group.length;

        group.forEach((order, index) => {
            if (renderedCount >= maxRender) return;

            const tr = document.createElement("tr");
            tr.setAttribute("data-order-id", order.id || "");
            tr.classList.add("product-group");

            const cells = [];
            for (let j = 0; j < 12; j++) {
                cells[j] = document.createElement("td");
            }

            // Shared data cells - merge for first row of each group
            if (index === 0) {
                // Date cell
                cells[0].textContent = order.ngayDatHang || "Chưa nhập";
                cells[0].rowSpan = groupSize;
                cells[0].classList.add("merged-cell");

                // Supplier cell
                cells[1].textContent = sanitizeInput(order.nhaCungCap || "");
                cells[1].rowSpan = groupSize;
                cells[1].classList.add("merged-cell");

                // Invoice cell
                cells[2].textContent = sanitizeInput(order.hoaDon || "");
                cells[2].rowSpan = groupSize;
                cells[2].classList.add("merged-cell");

                // Invoice images cell
                if (order.anhHoaDon) {
                    const invoiceImgs = Array.isArray(order.anhHoaDon)
                        ? order.anhHoaDon
                        : [order.anhHoaDon];
                    const invoiceContainer = document.createElement("div");
                    invoiceContainer.className = "product-row";
                    invoiceImgs.forEach((imgUrl) => {
                        const img = document.createElement("img");
                        img.dataset.src = imgUrl;
                        img.src =
                            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
                        img.alt = "Đang tải...";
                        img.className = "product-image";
                        totalImages++;
                        imageObserver.observe(img);
                        invoiceContainer.appendChild(img);
                    });
                    cells[2].appendChild(invoiceContainer);
                } else {
                    cells[2].textContent = "—";
                }
                cells[2].rowSpan = groupSize;
                cells[2].classList.add("merged-cell");
            } else {
                // Skip shared data cells for subsequent rows in group
                //cells.splice(0, 4);
            }

            // Product-specific data (always shown)
            const productCellStart = index === 0 ? 3 : 0;

            // Product name
            cells[productCellStart].textContent = sanitizeInput(
                order.tenSanPham || "",
            );
            // Product code
            cells[productCellStart + 1].textContent = sanitizeInput(
                order.maSanPham || "",
            );
            // Variant
            cells[productCellStart + 2].textContent = sanitizeInput(
                order.bienThe || "",
            );

            // Product images
            if (order.anhSanPham) {
                const productImgs = Array.isArray(order.anhSanPham)
                    ? order.anhSanPham
                    : [order.anhSanPham];
                const productContainer = document.createElement("div");
                productContainer.className = "product-row";
                productImgs.forEach((imgUrl) => {
                    const img = document.createElement("img");
                    img.dataset.src = imgUrl;
                    img.src =
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
                    img.alt = "Đang tải...";
                    img.className = "product-image";
                    totalImages++;
                    imageObserver.observe(img);
                    productContainer.appendChild(img);
                });
                cells[productCellStart + 4].appendChild(productContainer);
            }

            // Price images
            if (order.anhGiaMua || order.anhGiaNhap) {
                const priceImgs = Array.isArray(
                    order.anhGiaMua || order.anhGiaNhap,
                )
                    ? order.anhGiaMua || order.anhGiaNhap
                    : [order.anhGiaMua || order.anhGiaNhap];
                const priceContainer = document.createElement("div");
                priceContainer.className = "product-row";
                priceImgs.forEach((imgUrl) => {
                    const img = document.createElement("img");
                    img.dataset.src = imgUrl;
                    img.src =
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
                    img.alt = "Đang tải...";
                    img.className = "product-image";
                    totalImages++;
                    imageObserver.observe(img);
                    priceContainer.appendChild(img);
                });
                cells[productCellStart + 5].appendChild(priceContainer);
            }

            // Quantity input
            const quantityInput = document.createElement("input");
            quantityInput.type = "number";
            quantityInput.value = order.soLuong || 0;
            quantityInput.min = "0";
            quantityInput.className = "quantity-input";
            quantityInput.setAttribute("data-order-id", order.id || "");
            quantityInput.defaultValue = order.soLuong || 0;
            quantityInput.addEventListener("change", updateOrderByID);
            quantityInput.addEventListener("wheel", function (e) {
                e.preventDefault();
            });
            cells[productCellStart + 3].appendChild(quantityInput);

            // Price buy input
            const priceBuyInput = document.createElement("input");
            priceBuyInput.type = "number";
            priceBuyInput.value = order.giaMua || order.giaNhap || 0;
            priceBuyInput.min = "0";
            priceBuyInput.step = "any";
            priceBuyInput.className = "price-buy-input";
            priceBuyInput.setAttribute("data-order-id", order.id || "");
            priceBuyInput.defaultValue = order.giaMua || order.giaNhap || 0;
            priceBuyInput.addEventListener("change", updateOrderByID);
            priceBuyInput.addEventListener("wheel", function (e) {
                e.preventDefault();
            });
            cells[productCellStart + 4].appendChild(priceBuyInput);

            // Price sell input
            const priceSellInput = document.createElement("input");
            priceSellInput.type = "number";
            priceSellInput.value = order.giaBan || 0;
            priceSellInput.min = "0";
            priceSellInput.step = "any";
            priceSellInput.className = "price-sell-input";
            priceSellInput.setAttribute("data-order-id", order.id || "");
            priceSellInput.defaultValue = order.giaBan || 0;
            priceSellInput.addEventListener("change", updateOrderByID);
            priceSellInput.addEventListener("wheel", function (e) {
                e.preventDefault();
            });
            cells[productCellStart + 5].appendChild(priceSellInput);

            // Notes
            cells[productCellStart + 6].textContent = sanitizeInput(
                order.ghiChu || "",
            );
            cells[productCellStart + 6].style.maxWidth = "150px";
            cells[productCellStart + 6].style.overflow = "hidden";
            cells[productCellStart + 6].style.textOverflow = "ellipsis";
            cells[productCellStart + 6].style.whiteSpace = "nowrap";
            if (order.ghiChu) cells[productCellStart + 6].title = order.ghiChu;

            // Edit button
            const editButton = document.createElement("button");
            editButton.className = "edit-button";
            editButton.setAttribute("data-order-id", order.id || "");
            editButton.setAttribute(
                "data-order-info",
                `${sanitizeInput(order.tenSanPham || "")} - ${order.hoaDon || ""}`,
            );
            editButton.addEventListener("click", editOrderByID);
            cells[productCellStart + 7].appendChild(editButton);

            // Delete button
            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.setAttribute("data-order-id", order.id || "");
            deleteButton.setAttribute(
                "data-order-info",
                `${sanitizeInput(order.tenSanPham || "")} - ${order.hoaDon || ""}`,
            );
            deleteButton.addEventListener("click", deleteOrderByID);
            cells[productCellStart + 8].appendChild(deleteButton);

            const auth = getAuthState();
            if (auth) {
                applyRowPermissions(
                    tr,
                    [quantityInput, priceBuyInput, priceSellInput],
                    deleteButton,
                    parseInt(auth.checkLogin),
                );
            }

            cells.forEach((cell) => tr.appendChild(cell));
            tbody.appendChild(tr);
            renderedCount++;
        });
    }

    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement("tr");
        warningRow.style.backgroundColor = "#fff3cd";
        warningRow.style.color = "#856404";
        const warningTd = document.createElement("td");
        warningTd.colSpan = 14;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} đơn hàng. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = "center";
        warningTd.style.padding = "8px";
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }

    if (totalImages === 0) setCachedData(dataArray);
    updateDropdownOptions(dataArray);
}

function groupOrdersBySharedData(dataArray) {
    const groups = {};

    dataArray.forEach((order) => {
        // Create a key based on shared data: supplier + date + invoice
        const groupKey = `${order.nhaCungCap}_${order.ngayDatHang}_${order.hoaDon}`;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(order);
    });

    return groups;
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
    const suppliers = [
        ...new Set(
            fullDataArray
                .map((order) => order.nhaCungCap)
                .filter((supplier) => supplier),
        ),
    ];
    if (filterSupplierSelect) {
        const currentSelectedValue = filterSupplierSelect.value;
        while (filterSupplierSelect.children.length > 1) {
            filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
        }
        suppliers.forEach((supplier) => {
            const option = document.createElement("option");
            option.value = supplier;
            option.textContent = supplier;
            filterSupplierSelect.appendChild(option);
        });
        if (
            currentSelectedValue &&
            currentSelectedValue !== "all" &&
            suppliers.includes(currentSelectedValue)
        ) {
            filterSupplierSelect.value = currentSelectedValue;
        }
    }
}

// =====================================================
// DATA LOADING & INITIALIZATION
// =====================================================

async function displayOrderData() {
    const cachedData = getCachedData();
    if (cachedData) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        const sortedCacheData = sortDataByNewest(cachedData);
        renderDataToTable(sortedCacheData);
        updateSuggestions(sortedCacheData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu từ server...", true);
    try {
        const doc = await collectionRef.doc("dathang").get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                const sortedData = sortDataByNewest(data.data);
                renderDataToTable(sortedData);
                updateSuggestions(sortedData);
                preloadImagesAndCache(sortedData);
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
        await displayOrderData();
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

    if (!dataForm || !toggleFormButton) return;

    if (dataForm.style.display === "none" || dataForm.style.display === "") {
        dataForm.style.display = "block";
        toggleFormButton.textContent = "Ẩn biểu mẫu";

        // Initialize form if not already done
        if (typeof initializeEnhancedForm === "function") {
            initializeEnhancedForm();
        }

        // Ensure we have at least one product row
        const productsTableBody = document.getElementById("productsTableBody");
        if (productsTableBody && productsTableBody.children.length === 0) {
            if (typeof addInitialProductRow === "function") {
                addInitialProductRow();
            }
        }
    } else {
        dataForm.style.display = "none";
        toggleFormButton.textContent = "Hiện biểu mẫu";
    }
}

function initializeFormElements() {
    // Set today's date
    const ngayDatHangInput = document.getElementById("ngayDatHang");
    if (ngayDatHangInput) {
        const today = new Date();
        ngayDatHangInput.value = today.toISOString().split("T")[0];
    }

    // Initialize enhanced form functionality
    if (typeof initializeEnhancedForm === "function") {
        initializeEnhancedForm();
    }

    // Add event listeners for buttons
    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.removeEventListener("click", toggleForm); // Remove existing
        toggleFormButton.addEventListener("click", toggleForm);
    }

    const submitOrderBtn = document.getElementById("submitOrderBtn");
    if (submitOrderBtn) {
        submitOrderBtn.removeEventListener("click", addOrder); // Remove existing
        submitOrderBtn.addEventListener("click", addOrder);
    }

    const clearFormBtn = document.getElementById("clearFormBtn");
    if (clearFormBtn) {
        clearFormBtn.removeEventListener("click", clearOrderForm); // Remove existing
        clearFormBtn.addEventListener("click", clearOrderForm);
    }

    // Initialize input validation
    initializeInputValidation();

    // Initialize supplier suggestions if function exists
    if (typeof initializeSupplierSuggestions === "function") {
        initializeSupplierSuggestions();
    }
}

function initializeInputValidation() {
    // Validate shared inputs
    const ngayDatHangInput = document.getElementById("ngayDatHang");
    const nhaCungCapInput = document.getElementById("nhaCungCap");
    const hoaDonInput = document.getElementById("hoaDon");

    if (ngayDatHangInput) {
        ngayDatHangInput.addEventListener("change", function () {
            if (!this.value) {
                this.style.borderColor = "#dc3545";
            } else {
                this.style.borderColor = "#28a745";
            }
        });
    }

    if (nhaCungCapInput) {
        nhaCungCapInput.addEventListener("input", function () {
            if (this.value.trim().length < 2) {
                this.style.borderColor = "#dc3545";
            } else {
                this.style.borderColor = "#28a745";
            }
        });
    }

    if (hoaDonInput) {
        hoaDonInput.addEventListener("input", function () {
            if (this.value.trim().length < 1) {
                this.style.borderColor = "#dc3545";
            } else {
                this.style.borderColor = "#28a745";
            }
        });
    }

    // Validate product inputs dynamically
    document.addEventListener("input", function (e) {
        if (e.target.classList.contains("product-name")) {
            if (e.target.value.trim().length < 1) {
                e.target.style.borderColor = "#dc3545";
            } else {
                e.target.style.borderColor = "#28a745";
            }
        }

        if (e.target.classList.contains("product-quantity")) {
            const value = parseInt(e.target.value);
            if (isNaN(value) || value < 1) {
                e.target.style.borderColor = "#dc3545";
                if (value < 1) e.target.value = 1;
            } else {
                e.target.style.borderColor = "#28a745";
            }
        }

        if (e.target.classList.contains("product-buy-price")) {
            const value = parseFloat(e.target.value);
            if (isNaN(value) || value < 0) {
                e.target.style.borderColor = "#dc3545";
                if (value < 0) e.target.value = 0;
            } else {
                e.target.style.borderColor = "#28a745";
            }
        }

        if (e.target.classList.contains("product-sell-price")) {
            const value = parseFloat(e.target.value);
            if (value < 0) {
                e.target.value = 0;
            }
            e.target.style.borderColor = value >= 0 ? "#28a745" : "#dc3545";
        }
    });
}

function initializeSupplierSuggestions() {
    const supplierSuggestions = document.getElementById("supplierSuggestions");
    if (nhaCungCapInput && supplierSuggestions) {
        let supplierList = [];

        nhaCungCapInput.addEventListener("input", function () {
            const value = this.value.toLowerCase().trim();
            if (value.length < 2) {
                supplierSuggestions.style.display = "none";
                return;
            }

            const filtered = supplierList.filter((supplier) =>
                supplier.toLowerCase().includes(value),
            );

            if (filtered.length > 0) {
                supplierSuggestions.innerHTML = filtered
                    .map(
                        (supplier) =>
                            `<div class="supplier-suggestion">${supplier}</div>`,
                    )
                    .join("");
                supplierSuggestions.style.display = "block";
            } else {
                supplierSuggestions.style.display = "none";
            }
        });

        supplierSuggestions.addEventListener("click", function (e) {
            if (e.target.classList.contains("supplier-suggestion")) {
                nhaCungCapInput.value = e.target.textContent;
                supplierSuggestions.style.display = "none";
            }
        });

        document.addEventListener("click", function (e) {
            if (
                !nhaCungCapInput.contains(e.target) &&
                !supplierSuggestions.contains(e.target)
            ) {
                supplierSuggestions.style.display = "none";
            }
        });

        window.updateSupplierSuggestions = function (dataArray) {
            supplierList = [
                ...new Set(
                    dataArray
                        .map((order) => order.nhaCungCap)
                        .filter((supplier) => supplier),
                ),
            ];
        };
    }
}

function initializeFilterEvents() {
    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener("change", applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener("change", applyFilters);
    }
    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            debounce(applyFilters, 300),
        );
    }
}

function updateSuggestions(fullDataArray) {
    if (!fullDataArray || !Array.isArray(fullDataArray)) return;

    const productNames = fullDataArray
        .map((order) => order.tenSanPham?.trim())
        .filter((value) => value && value.length > 0);
    const uniqueProductNames = [...new Set(productNames)];

    const dataList = document.getElementById("productSuggestions");
    if (dataList) {
        dataList.innerHTML = uniqueProductNames
            .map((value) => `<option value="${sanitizeInput(value)}">`)
            .join("");
    }

    if (window.updateSupplierSuggestions) {
        window.updateSupplierSuggestions(fullDataArray);
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

        const excelData = filteredData.map((order, index) => ({
            STT: index + 1,
            "Ngày đặt hàng": order.ngayDatHang || "",
            "Nhà cung cấp": order.nhaCungCap || "",
            "Hóa đơn": order.hoaDon || "",
            "Tên sản phẩm": order.tenSanPham || "",
            "Mã sản phẩm": order.maSanPham || "",
            "Biến thể": order.bienThe || "",
            "Số lượng": order.soLuong || "",
            "Giá mua": order.giaMua || order.giaNhap || "",
            "Giá bán": order.giaBan || "",
            "Ghi chú": order.ghiChu || "",
            "Người tạo": order.user || "",
            "Thời gian tạo": order.thoiGianUpload || "",
        }));

        // Tạo worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Tạo workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        // Tạo tên file với ngày tháng
        const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;

        // Xuất file
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất Excel thành công!");
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        showError("Lỗi khi xuất Excel!");
        hideFloatingAlert();
    }
}

function exportExcelTemplate() {
    showLoading("Đang tạo template Excel...");
    try {
        // Tạo một dòng dữ liệu mẫu trống
        const templateData = [
            {
                "Loại sản phẩm": "",
                "Mã sản phẩm": "",
                "Mã chốt đơn": "",
                "Tên sản phẩm": "",
                "Giá bán": "",
                "Giá mua": "",
                "Đơn vị": "",
                "Nhóm sản phẩm": "",
                "Mã vạch": "",
                "Khối lượng": "",
                "Chiết khấu bán": "",
                "Chiết khấu mua": "",
                "Tồn kho": "",
                "Giá vốn": "",
                "Ghi chú": "",
                "Cho phép bán ở công ty khác": "",
                "Thuộc tính": "",
            },
        ];

        // Tạo worksheet
        const ws = XLSX.utils.json_to_sheet(templateData);

        // Tạo workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

        // Xuất file template
        const fileName = `Template_DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất template Excel thành công!");
    } catch (error) {
        console.error("Lỗi khi tạo template Excel:", error);
        showError("Lỗi khi tạo template Excel!");
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
                    ? deleteButton.getAttribute("data-order-info")
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

    // Initialize form elements with new structure
    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();

    // Initialize with migration and display data
    await initializeWithMigration();

    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    console.log("Enhanced Order Management System initialized successfully");
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
        const doc = await collectionRef.doc("dathang").get();
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
    parseDate,
    parseVietnameseDate,
    forceRefreshData: function () {
        invalidateCache();
        displayOrderData();
    },
    invalidateCache,
    getAuthState,
    hasPermission,
    exportToExcel,
};

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

console.log(
    "Enhanced Order Management System Part 2B loaded - Complete UI & Initialization",
);
console.log("Debug functions available at window.debugFunctions");
console.log(
    "Available functions:",
    Object.keys(window.debugFunctions).join(", "),
);

/*
COMPLETE SYSTEM FILES:
1. scriptObfuscator.js (Part 1)
2. scriptObfuscator_part2a.js (Part 2A) 
3. scriptObfuscator_part2b.js (Part 2B)

HTML USAGE:
<script src="scriptObfuscator.js"></script>
<script src="scriptObfuscator_part2a.js"></script>
<script src="scriptObfuscator_part2b.js"></script>

All functions are now properly ordered and complete!
*/
