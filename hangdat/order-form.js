// Order Management System - Form Management
// Enhanced form handling with simplified image upload

// =====================================================
// FORM MANAGEMENT
// =====================================================

function initializeEnhancedForm() {
    // Add product button
    document
        .getElementById("addProductBtn")
        .addEventListener("click", addProductRow);

    // Clear button
    document
        .getElementById("clearFormBtn")
        .addEventListener("click", clearForm);

    // Submit button
    document
        .getElementById("submitOrderBtn")
        .addEventListener("click", submitOrder);

    // Invoice image handling
    initializeInvoiceImageHandling();

    // Supplier suggestions
    initializeSupplierSuggestions();

    // Input validation
    initializeInputValidation();
}

function addInitialProductRow() {
    addProductRow();
}

function addProductRow() {
    productCounter++;
    const tbody = document.getElementById("productsTableBody");
    const row = document.createElement("tr");
    row.id = `product-row-${productCounter}`;

    row.innerHTML = `
        <td>
            <input type="text" class="product-name" placeholder="Tên sản phẩm..." required />
        </td>
        <td>
            <input type="text" class="product-code" placeholder="Mã sản phẩm..." />
        </td>
        <td>
            <input type="text" class="product-variant" placeholder="Biến thể..." />
        </td>
        <td>
            <input type="number" class="product-quantity" min="1" value="1" required />
        </td>
        <td>
            <input type="number" class="product-buy-price" min="0" step="any" placeholder="0" required />
        </td>
        <td>
            <input type="number" class="product-sell-price" min="0" step="any" placeholder="0" />
        </td>
        <td class="product-images">
            <div class="image-upload-cell">
                <div class="mini-upload" data-type="product" data-row="${productCounter}">
                    <p>Dán/Chọn ảnh</p>
                </div>
                <input class="hidden-upload product-image-file" multiple accept="image/*" style="display:none;" />
            </div>
        </td>
        <td class="price-images">
            <div class="image-upload-cell">
                <div class="mini-upload" data-type="price" data-row="${productCounter}">
                    <p>Dán/Chọn ảnh</p>
                </div>
                <input class="hidden-upload price-image-file" multiple accept="image/*" style="display:none;" />
            </div>
        </td>
        <td class="notes-col">
            <textarea class="product-notes" placeholder="Ghi chú..."></textarea>
        </td>
        <td>
            <button type="button" class="remove-product-btn" onclick="removeProductRow('${productCounter}')">
                🗑️
            </button>
        </td>
    `;

    tbody.appendChild(row);

    // Initialize image upload for this row
    initializeRowImageHandling(productCounter);

    // Show remove button only if more than 1 row
    updateRemoveButtons();
}

function removeProductRow(productId) {
    const row = document.getElementById(`product-row-${productId}`);
    if (row) {
        row.remove();
        updateRemoveButtons();
    }
}

function updateRemoveButtons() {
    const rows = document.querySelectorAll("#productsTableBody tr");
    const removeButtons = document.querySelectorAll(".remove-product-btn");

    removeButtons.forEach((btn) => {
        btn.style.display = rows.length > 1 ? "inline-block" : "none";
    });
}

// =====================================================
// IMAGE HANDLING - SIMPLIFIED FOR CLIPBOARD ONLY
// =====================================================

function initializeInvoiceImageHandling() {
    const container = invoiceClipboardContainer;

    container.addEventListener("paste", async function (e) {
        invoiceImgArray = [];
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (
            text &&
            (text.startsWith("http") ||
                text.includes("firebasestorage.googleapis.com"))
        ) {
            try {
                container.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Invoice URL loaded");
                imgElement.onerror = () =>
                    console.error("Invoice URL load failed");
                container.appendChild(imgElement);
                container.classList.add("has-content");
                container.urlData = text;
                return;
            } catch (error) {
                console.error("Error handling invoice image URL:", error);
            }
        }

        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                var blob = items[i].getAsFile();
                var file = new File([blob], "invoice.jpg", { type: blob.type });

                container.innerHTML = "";
                var imgElement = document.createElement("img");
                imgElement.src = URL.createObjectURL(file);
                imgElement.onload = () => URL.revokeObjectURL(imgElement.src);
                container.appendChild(imgElement);
                container.classList.add("has-content");

                const compressedFile = await compressImage(file);
                invoiceImgArray.push(compressedFile);
                container.fileData = compressedFile;
                break;
            }
        }
    });
}

function initializeRowImageHandling(rowId) {
    const row = document.getElementById(`product-row-${rowId}`);

    // Product image upload
    const productUpload = row.querySelector(
        '.mini-upload[data-type="product"]',
    );
    const productFileInput = row.querySelector(".product-image-file");

    productUpload.addEventListener("click", () => productFileInput.click());
    productFileInput.addEventListener("change", (e) =>
        handleFileUpload(e, productUpload),
    );
    productUpload.addEventListener("paste", (e) =>
        handlePaste(e, productUpload),
    );

    // Price image upload
    const priceUpload = row.querySelector('.mini-upload[data-type="price"]');
    const priceFileInput = row.querySelector(".price-image-file");

    priceUpload.addEventListener("click", () => priceFileInput.click());
    priceFileInput.addEventListener("change", (e) =>
        handleFileUpload(e, priceUpload),
    );
    priceUpload.addEventListener("paste", (e) => handlePaste(e, priceUpload));
}

function handleFileUpload(event, container) {
    const files = event.target.files;
    if (files && files.length > 0) {
        const file = files[0];
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);

        container.innerHTML = "";
        container.appendChild(img);
        container.classList.add("has-content");

        // Store file data
        container.fileData = file;
    }
}

async function handlePaste(event, container) {
    event.preventDefault();
    const items = (event.clipboardData || event.originalEvent.clipboardData)
        .items;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            const img = document.createElement("img");
            img.src = URL.createObjectURL(blob);
            img.onload = () => URL.revokeObjectURL(img.src);

            container.innerHTML = "";
            container.appendChild(img);
            container.classList.add("has-content");

            // Store file data
            const file = new File([blob], "pasted-image.jpg", {
                type: blob.type,
            });
            const compressedFile = await compressImage(file);
            container.fileData = compressedFile;
            break;
        }
    }
}

// =====================================================
// OPTIMIZED IMAGE COMPRESSION
// =====================================================

async function compressImage(file, maxWidth = 400, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                // Calculate optimal dimensions
                let { width, height } = calculateOptimalSize(
                    img.width,
                    img.height,
                    maxWidth,
                );

                canvas.width = width;
                canvas.height = height;

                // Improved rendering quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    function (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg", // Force JPEG for better compression
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    "image/jpeg",
                    quality,
                );
            };
        };
    });
}

function calculateOptimalSize(originalWidth, originalHeight, maxWidth) {
    if (originalWidth <= maxWidth && originalHeight <= maxWidth) {
        return { width: originalWidth, height: originalHeight };
    }

    const aspectRatio = originalWidth / originalHeight;

    if (originalWidth > originalHeight) {
        return {
            width: maxWidth,
            height: Math.round(maxWidth / aspectRatio),
        };
    } else {
        return {
            width: Math.round(maxWidth * aspectRatio),
            height: maxWidth,
        };
    }
}

// =====================================================
// OPTIMIZED FIREBASE UPLOAD WITH RETRY
// =====================================================

async function uploadImageToFirebase(file, type, retries = 3) {
    if (!file) return null;

    // Additional compression for different image types
    const compressionSettings = {
        invoice: { maxWidth: 600, quality: 0.8 },
        product: { maxWidth: 400, quality: 0.7 },
        price: { maxWidth: 400, quality: 0.7 },
    };

    const settings = compressionSettings[type] || {
        maxWidth: 400,
        quality: 0.7,
    };
    const compressedFile = await compressImage(
        file,
        settings.maxWidth,
        settings.quality,
    );

    console.log(
        `Original size: ${(file.size / 1024).toFixed(2)}KB, Compressed: ${(compressedFile.size / 1024).toFixed(2)}KB`,
    );

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await uploadToFirebaseStorage(compressedFile, type);
        } catch (error) {
            console.warn(`Upload attempt ${attempt + 1} failed:`, error);
            if (attempt === retries - 1) throw error;

            // Exponential backoff
            await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, attempt) * 1000),
            );
        }
    }
}

function uploadToFirebaseStorage(file, type) {
    return new Promise((resolve, reject) => {
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
        const imageRef = storageRef.child(`dathang/${type}/${fileName}`);

        const uploadTask = imageRef.put(file, {
            cacheControl: "public,max-age=2592000", // 30 days cache
            contentType: "image/jpeg",
        });

        uploadTask.on(
            "state_changed",
            function (snapshot) {
                const progress =
                    (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (progress % 25 === 0) {
                    // Log every 25%
                    console.log(`Upload ${type}: ${progress.toFixed(0)}%`);
                }
            },
            function (error) {
                console.error(`Error uploading ${type} image:`, error);
                reject(error);
            },
            function () {
                uploadTask.snapshot.ref
                    .getDownloadURL()
                    .then(function (downloadURL) {
                        console.log(
                            `${type} image uploaded successfully: ${fileName}`,
                        );
                        resolve(downloadURL);
                    })
                    .catch(reject);
            },
        );
    });
}

// =====================================================
// FORM DATA COLLECTION
// =====================================================

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

function getInvoiceImageData() {
    try {
        const container = document.getElementById("invoiceClipboardContainer");
        return container
            ? container.fileData || container.urlData || null
            : null;
    } catch (error) {
        console.warn("Error getting invoice image data:", error);
        return null;
    }
}

function getRowImageData(row, type) {
    try {
        const upload = row.querySelector(`.mini-upload[data-type="${type}"]`);
        return upload ? upload.fileData || null : null;
    } catch (error) {
        console.warn(`Error getting ${type} image data:`, error);
        return null;
    }
}

// =====================================================
// OPTIMIZED FORM SUBMISSION WITH PARALLEL UPLOADS
// =====================================================

async function submitOrder() {
    try {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == "777") {
            showError("Không có quyền thêm đơn hàng");
            return;
        }

        const submitBtn = document.getElementById("submitOrderBtn");
        submitBtn.disabled = true;
        submitBtn.textContent = "Đang xử lý...";

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

        // OPTIMIZED: Upload all images in parallel
        await processImagesOptimized(orders, formData.sharedData);

        // OPTIMIZED: Upload all orders in batches
        await uploadOrdersBatch(orders);

        hideFloatingAlert();
        showSuccess("Thêm đơn hàng thành công!");

        // Clear form and reload data
        clearForm();

        // RELOAD TABLE: Force refresh display
        invalidateCache();
        await displayOrderData();
    } catch (error) {
        console.error("Error submitting order:", error);
        showError("Lỗi: " + error.message);
        hideFloatingAlert();
    } finally {
        const submitBtn = document.getElementById("submitOrderBtn");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Thêm đơn hàng";
        }
    }
}

// OPTIMIZED: Process all images in parallel for faster upload
async function processImagesOptimized(orders, sharedData) {
    const uploadPromises = [];

    // Shared invoice image (upload once, use for all orders)
    let sharedInvoiceUrl = null;
    if (sharedData.invoiceImage) {
        if (typeof sharedData.invoiceImage !== "string") {
            uploadPromises.push(
                uploadImageToFirebase(sharedData.invoiceImage, "invoice").then(
                    (url) => {
                        sharedInvoiceUrl = url;
                    },
                ),
            );
        } else {
            sharedInvoiceUrl = sharedData.invoiceImage;
        }
    }

    // Product-specific images (parallel upload)
    orders.forEach((order, index) => {
        if (order.productImage) {
            uploadPromises.push(
                uploadImageToFirebase(order.productImage, "product").then(
                    (url) => {
                        orders[index].anhSanPham = url;
                    },
                ),
            );
        }

        if (order.priceImage) {
            uploadPromises.push(
                uploadImageToFirebase(order.priceImage, "price").then((url) => {
                    orders[index].anhGiaMua = url;
                }),
            );
        }
    });

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Apply shared invoice URL to all orders
    if (sharedInvoiceUrl) {
        orders.forEach((order) => {
            order.anhHoaDon = sharedInvoiceUrl;
        });
    }

    // Clean up file references
    orders.forEach((order) => {
        delete order.productImage;
        delete order.priceImage;
    });

    updateUploadProgress(orders.length);
}

// OPTIMIZED: Upload orders using batch method for better performance
async function uploadOrdersBatch(orders) {
    try {
        // Use optimized batch upload method
        await uploadOrdersBatchToFirestore(orders);

        // Single invalidate cache call after all uploads
        invalidateCache();

        showLoading(`Đã lưu thành công ${orders.length} đơn hàng`);
    } catch (error) {
        // If batch fails, fallback to individual uploads
        console.warn(
            "Batch upload failed, falling back to individual uploads:",
            error,
        );
        await uploadOrdersIndividually(orders);
    }
}

// Fallback method for individual uploads
async function uploadOrdersIndividually(orders) {
    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        await uploadToFirestore(order);

        // Update progress
        showLoading(`Đang lưu đơn hàng... ${i + 1}/${orders.length}`);
    }

    // Single invalidate cache call after all uploads
    invalidateCache();
}

// Progress indicator for uploads
function updateUploadProgress(totalOrders) {
    showLoading(`Đang tải ${totalOrders} ảnh lên Firebase...`);
}

// =====================================================
// FORM CLEARING
// =====================================================

function clearForm() {
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
        invoiceContainer.innerHTML = "<p>Dán ảnh hóa đơn ở đây (Ctrl+V)...</p>";
        invoiceContainer.classList.remove("has-content");
        invoiceContainer.fileData = null;
        invoiceContainer.urlData = null;
    }

    // Clear all products and reset to one row
    const productsTableBody = document.getElementById("productsTableBody");
    if (productsTableBody) {
        productsTableBody.innerHTML = "";
        productCounter = 0;
        addInitialProductRow();
    }

    // Hide supplier suggestions
    const supplierSuggestions = document.getElementById("supplierSuggestions");
    if (supplierSuggestions) {
        supplierSuggestions.style.display = "none";
    }
}

// =====================================================
// INPUT VALIDATION
// =====================================================

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

// =====================================================
// SUPPLIER SUGGESTIONS
// =====================================================

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

console.log("Order Management System - Form Management loaded");
