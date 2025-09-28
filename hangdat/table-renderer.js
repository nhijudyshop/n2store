// =====================================================
// FIXED TABLE RENDERING WITH IMAGE DISPLAY DEBUG
// =====================================================

function renderInventoryTable(inventoryData) {
    const tbody = document.getElementById("orderTableBody");
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    const filteredData = applyFiltersToInventory(inventoryData);
    tbody.innerHTML = "";

    // Debug: Log first item to check data structure
    if (filteredData.length > 0) {
        console.log("Sample data structure for debugging:", filteredData[0]);
        console.log("Available image fields:", {
            anhHoaDon: filteredData[0].anhHoaDon,
            anhSanPham: filteredData[0].anhSanPham,
            anhGiaMua: filteredData[0].anhGiaMua,
            // Also check alternative field names
            invoiceImage: filteredData[0].invoiceImage,
            productImage: filteredData[0].productImage,
            priceImage: filteredData[0].priceImage,
        });
    }

    // Add summary row
    if (filteredData.length > 0) {
        const summaryRow = document.createElement("tr");
        summaryRow.className = "summary-row";
        const summaryTd = document.createElement("td");
        summaryTd.colSpan = 11;
        summaryTd.innerHTML = `Hiển thị: <strong>${filteredData.length}</strong> sản phẩm`;
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    // Group data by supplier and order date
    const groupedData = groupBySupplierAndDate(filteredData);
    renderGroupedDataWithImageFix(groupedData, tbody);

    updateStatistics(filteredData);
}

function groupBySupplierAndDate(data) {
    const grouped = new Map();

    data.forEach((item) => {
        const key = `${item.nhaCungCap}_${item.ngayDatHang}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                supplier: item.nhaCungCap,
                orderDate: item.ngayDatHang,
                items: [],
            });
        }
        grouped.get(key).items.push(item);
    });

    return Array.from(grouped.values());
}

function renderGroupedDataWithImageFix(groupedData, tbody) {
    groupedData.forEach((group) => {
        const itemCount = group.items.length;

        group.items.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.className = "inventory-row supplier-group";
            tr.setAttribute("data-inventory-id", item.id || "");

            // Create cells array
            const cells = [];
            for (let j = 0; j < 11; j++) {
                cells[j] = document.createElement("td");
            }

            // 1. Ngày đặt hàng - merge cells for same supplier+date
            if (index === 0) {
                cells[0].textContent = item.ngayDatHang || "Chưa nhập";
                cells[0].rowSpan = itemCount;
                cells[0].className = "date-cell";
                tr.appendChild(cells[0]);
            }

            // 2. Nhà cung cấp - merge cells for same supplier+date
            if (index === 0) {
                cells[1].textContent = sanitizeInput(item.nhaCungCap || "");
                cells[1].rowSpan = itemCount;
                cells[1].className = "supplier-cell";
                tr.appendChild(cells[1]);
            }

            // 3. Hóa đơn (combined: image on top, text below)
            if (index === 0) {
                const invoiceContainer = document.createElement("div");
                invoiceContainer.className = "combined-cell";

                // Check multiple possible field names for invoice image
                const invoiceImageUrl =
                    item.anhHoaDon || item.invoiceImage || item.invoice_image;

                if (invoiceImageUrl) {
                    console.log("Found invoice image:", invoiceImageUrl);
                    const invoiceImg = document.createElement("img");
                    invoiceImg.src = invoiceImageUrl;
                    invoiceImg.className = "cell-image";
                    invoiceImg.alt = "Hóa đơn";
                    invoiceImg.style.cursor = "pointer";
                    invoiceImg.onclick = () => openImageModal(invoiceImageUrl);

                    // Add error handling for image loading
                    invoiceImg.onerror = function () {
                        console.error(
                            "Failed to load invoice image:",
                            invoiceImageUrl,
                        );
                        this.style.display = "none";
                    };

                    invoiceContainer.appendChild(invoiceImg);
                } else {
                    console.log("No invoice image found for item:", item.id);
                }

                const invoiceText = document.createElement("div");
                invoiceText.className = "cell-text";
                invoiceText.textContent =
                    item.hoaDon || item.invoice || "Chưa có";
                invoiceContainer.appendChild(invoiceText);

                cells[2].appendChild(invoiceContainer);
                cells[2].rowSpan = itemCount;
                tr.appendChild(cells[2]);
            }

            // 4. Tên sản phẩm
            cells[3].textContent = sanitizeInput(item.tenSanPham || "");
            tr.appendChild(cells[3]);

            // 5. Mã sản phẩm
            cells[4].textContent = sanitizeInput(item.maSanPham || "");
            tr.appendChild(cells[4]);

            // 6. Biến thể
            cells[5].textContent = sanitizeInput(item.bienThe || "");
            tr.appendChild(cells[5]);

            // 7. Số lượng (simple label, no editing)
            const quantityContainer = document.createElement("div");
            const quantityLabel = document.createElement("span");
            quantityLabel.className = "quantity-label";
            quantityLabel.textContent = item.soLuong || 0;
            quantityContainer.appendChild(quantityLabel);
            cells[6].appendChild(quantityContainer);
            tr.appendChild(cells[6]);

            // 8. Ảnh sản phẩm (combined: image on top, buy price below)
            const productContainer = document.createElement("div");
            productContainer.className = "combined-cell";

            // Check multiple possible field names for product image
            const productImageUrl =
                item.anhSanPham || item.productImage || item.product_image;

            if (productImageUrl) {
                console.log("Found product image:", productImageUrl);
                const productImg = document.createElement("img");
                productImg.src = productImageUrl;
                productImg.className = "cell-image";
                productImg.alt = "Sản phẩm";
                productImg.style.cursor = "pointer";
                productImg.onclick = () => openImageModal(productImageUrl);

                // Add error handling for image loading
                productImg.onerror = function () {
                    console.error(
                        "Failed to load product image:",
                        productImageUrl,
                    );
                    this.style.display = "none";
                };

                productContainer.appendChild(productImg);
            } else {
                console.log("No product image found for item:", item.id);
            }

            const buyPriceText = document.createElement("div");
            buyPriceText.className = "cell-text";
            buyPriceText.textContent =
                item.giaMua > 0 ? formatCurrency(item.giaMua) : "Chưa có";
            productContainer.appendChild(buyPriceText);

            cells[7].appendChild(productContainer);
            tr.appendChild(cells[7]);

            // 9. Giá bán (combined: price image on top, sell price below)
            const priceContainer = document.createElement("div");
            priceContainer.className = "combined-cell";

            // Check multiple possible field names for price image
            const priceImageUrl =
                item.anhGiaMua ||
                item.priceImage ||
                item.price_image ||
                item.anhGiaBan;

            if (priceImageUrl) {
                console.log("Found price image:", priceImageUrl);
                const priceImg = document.createElement("img");
                priceImg.src = priceImageUrl;
                priceImg.className = "cell-image";
                priceImg.alt = "Giá bán";
                priceImg.style.cursor = "pointer";
                priceImg.onclick = () => openImageModal(priceImageUrl);

                // Add error handling for image loading
                priceImg.onerror = function () {
                    console.error("Failed to load price image:", priceImageUrl);
                    this.style.display = "none";
                };

                priceContainer.appendChild(priceImg);
            } else {
                console.log("No price image found for item:", item.id);
            }

            const sellPriceText = document.createElement("div");
            sellPriceText.className = "cell-text";
            sellPriceText.textContent =
                item.giaBan > 0 ? formatCurrency(item.giaBan) : "Chưa có";
            priceContainer.appendChild(sellPriceText);

            cells[8].appendChild(priceContainer);
            tr.appendChild(cells[8]);

            // 10. Ghi chú
            cells[9].textContent = sanitizeInput(item.ghiChu || "");
            cells[9].style.maxWidth = "150px";
            cells[9].style.wordWrap = "break-word";
            tr.appendChild(cells[9]);

            // 11. Thao tác (Edit & Delete buttons)
            const actionContainer = document.createElement("div");
            actionContainer.className = "action-buttons";

            const editButton = document.createElement("button");
            editButton.className = "action-btn edit-btn";
            editButton.setAttribute("data-inventory-id", item.id || "");
            editButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            editButton.addEventListener("click", editInventoryItem);

            const deleteButton = document.createElement("button");
            deleteButton.className = "action-btn delete-btn";
            deleteButton.setAttribute("data-inventory-id", item.id || "");
            deleteButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            deleteButton.addEventListener("click", deleteInventoryItem);

            actionContainer.appendChild(editButton);
            actionContainer.appendChild(deleteButton);
            cells[10].appendChild(actionContainer);
            tr.appendChild(cells[10]);

            // Apply permissions
            const auth = getAuthState();
            if (auth) {
                applyRowPermissions(
                    tr,
                    [],
                    [editButton, deleteButton],
                    parseInt(auth.checkLogin),
                );
            }

            tbody.appendChild(tr);
        });
    });
}

function applyRowPermissions(row, editableElements, buttons, userRole) {
    if (userRole !== 0) {
        editableElements.forEach((element) => {
            element.style.opacity = "0.6";
            element.style.cursor = "not-allowed";
            element.disabled = true;
        });
        buttons.forEach((button) => (button.style.display = "none"));
        row.style.opacity = "0.7";
    } else {
        editableElements.forEach((element) => {
            element.style.opacity = "1";
            element.style.cursor = "pointer";
            element.disabled = false;
        });
        buttons.forEach((button) => (button.style.display = ""));
        row.style.opacity = "1";
    }
}

// Open image in modal for better viewing
function openImageModal(imageSrc) {
    // Remove existing modal if any
    const existingModal = document.querySelector(".image-modal-overlay");
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div class="image-modal-overlay" onclick="closeImageModal()">
            <div class="image-modal-content" onclick="event.stopPropagation()">
                <span class="image-modal-close" onclick="closeImageModal()">&times;</span>
                <img src="${imageSrc}" class="image-modal-img" alt="Xem ảnh">
            </div>
        </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Add escape key listener
    document.addEventListener("keydown", handleImageModalEscape);
}

function closeImageModal() {
    const modal = document.querySelector(".image-modal-overlay");
    if (modal) {
        modal.remove();
    }
    document.removeEventListener("keydown", handleImageModalEscape);
}

function handleImageModalEscape(event) {
    if (event.key === "Escape") {
        closeImageModal();
    }
}

// Format currency helper
function formatCurrency(amount) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
    }).format(amount);
}

// Simplified statistics
function updateStatistics(inventoryData) {
    const totalProducts = document.getElementById("totalProducts");
    const completedProducts = document.getElementById("completedProducts");
    const partialProducts = document.getElementById("partialProducts");
    const pendingProducts = document.getElementById("pendingProducts");

    if (!inventoryData || !Array.isArray(inventoryData)) return;

    let total = inventoryData.length;
    let withImages = 0;
    let withPrices = 0;
    let basic = 0;

    inventoryData.forEach((item) => {
        const hasImages =
            item.anhSanPham ||
            item.anhGiaMua ||
            item.productImage ||
            item.priceImage;
        const hasPrices = item.giaMua > 0 || item.giaBan > 0;

        if (hasImages) {
            withImages++;
        }
        if (hasPrices) {
            withPrices++;
        }
        if (!hasImages && !hasPrices) {
            basic++;
        }
    });

    if (totalProducts) totalProducts.textContent = total;
    if (completedProducts) completedProducts.textContent = withImages;
    if (partialProducts) partialProducts.textContent = withPrices;
    if (pendingProducts) pendingProducts.textContent = basic;

    // Update labels
    const labels = document.querySelectorAll(".stat-label");
    if (labels[1]) labels[1].textContent = "Có ảnh";
    if (labels[2]) labels[2].textContent = "Có giá";
    if (labels[3]) labels[3].textContent = "Chưa đầy đủ";
}

// Debug function to inspect data structure
function debugDataStructure() {
    const cachedData = getCachedData();
    if (cachedData && cachedData.length > 0) {
        console.log("=== DATA STRUCTURE DEBUG ===");
        console.log("Total items:", cachedData.length);
        console.log("First item keys:", Object.keys(cachedData[0]));
        console.log("Sample item:", cachedData[0]);

        // Check for image fields
        const imageFields = [
            "anhHoaDon",
            "anhSanPham",
            "anhGiaMua",
            "invoiceImage",
            "productImage",
            "priceImage",
        ];
        imageFields.forEach((field) => {
            const hasField = cachedData.some((item) => item[field]);
            console.log(`Field '${field}' exists:`, hasField);
            if (hasField) {
                const sampleValue = cachedData.find((item) => item[field])?.[
                    field
                ];
                console.log(`Sample ${field}:`, sampleValue);
            }
        });
    } else {
        console.log("No cached data available for debugging");
    }
}

// Make functions globally available
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.debugDataStructure = debugDataStructure;

console.log("Fixed table renderer with image display debug loaded");
console.log("Use debugDataStructure() to inspect your data structure");
