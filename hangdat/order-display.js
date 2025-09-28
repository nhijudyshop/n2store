// Order Management System - Display and Filtering
// Functions for rendering data and applying filters

// =====================================================
// FILTER SYSTEM WITH DATE RANGE
// =====================================================

function applyFiltersToData(dataArray) {
    const filterSupplier = filterSupplierSelect
        ? filterSupplierSelect.value
        : "all";
    const dateFrom = document.getElementById("dateFrom")?.value;
    const dateTo = document.getElementById("dateTo")?.value;
    const filterProductText = filterProductInput
        ? filterProductInput.value.toLowerCase().trim()
        : "";

    return dataArray.filter((order) => {
        // Supplier filter
        const matchSupplier =
            filterSupplier === "all" || order.nhaCungCap === filterSupplier;

        // Date range filter
        let matchDate = true;
        if (dateFrom || dateTo) {
            const orderDate = parseDate(order.ngayDatHang);
            if (orderDate) {
                if (dateFrom) {
                    const fromDate = new Date(dateFrom);
                    matchDate = matchDate && orderDate >= fromDate;
                }
                if (dateTo) {
                    const toDate = new Date(dateTo);
                    toDate.setHours(23, 59, 59, 999); // Include the whole day
                    matchDate = matchDate && orderDate <= toDate;
                }
            } else {
                matchDate = false; // If no valid date, exclude from date filtering
            }
        }

        // Product filter
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

function updateFilterResultsCount(filteredData, totalData) {
    const existingCount = document.querySelector(".filter-results-count");
    if (existingCount) {
        existingCount.remove();
    }

    if (filteredData.length < totalData.length) {
        const filterActions = document.querySelector(".filter-actions");
        const countElement = document.createElement("div");
        countElement.className = "filter-results-count";
        countElement.textContent = `Hiển thị ${filteredData.length}/${totalData.length} đơn hàng`;

        filterActions.insertBefore(countElement, filterActions.firstChild);

        // Enable/disable delete button based on filter results
        const deleteBtn = document.getElementById("deleteFilteredBtn");
        if (deleteBtn) {
            deleteBtn.disabled = filteredData.length === 0;
            deleteBtn.textContent =
                filteredData.length > 0
                    ? `Xóa ${filteredData.length} đơn hàng`
                    : "Xóa theo lọc";
        }
    } else {
        // Disable delete button when no filter applied
        const deleteBtn = document.getElementById("deleteFilteredBtn");
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = "Xóa theo lọc";
        }
    }
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                const filteredData = applyFiltersToData(cachedData);
                renderDataToTable(cachedData);
                updateSuggestions(cachedData);
                updateFilterResultsCount(filteredData, cachedData);
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

function clearFilters() {
    // Clear all filter inputs
    if (filterSupplierSelect) filterSupplierSelect.value = "all";

    const dateFrom = document.getElementById("dateFrom");
    const dateTo = document.getElementById("dateTo");
    if (dateFrom) dateFrom.value = "";
    if (dateTo) dateTo.value = "";

    if (filterProductInput) filterProductInput.value = "";

    // Remove results count
    const existingCount = document.querySelector(".filter-results-count");
    if (existingCount) {
        existingCount.remove();
    }

    // Disable delete button
    const deleteBtn = document.getElementById("deleteFilteredBtn");
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Xóa theo lọc";
    }

    // Reapply filters (which will show all data)
    applyFilters();

    showSuccess("Đã xóa tất cả bộ lọc!");
}

// =====================================================
// DELETE BY FILTER FUNCTIONALITY
// =====================================================

async function deleteByFilter() {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền xóa đơn hàng");
        return;
    }

    const cachedData = getCachedData();
    if (!cachedData) {
        showError("Không có dữ liệu để xóa");
        return;
    }

    const filteredData = applyFiltersToData(cachedData);
    const unfilteredData = cachedData.filter(
        (item) => !filteredData.includes(item),
    );

    if (filteredData.length === 0) {
        showError("Không có đơn hàng nào phù hợp với bộ lọc");
        return;
    }

    if (filteredData.length === cachedData.length) {
        showError(
            "Không thể xóa tất cả dữ liệu. Vui lòng áp dụng bộ lọc trước",
        );
        return;
    }

    // Get filter description for confirmation
    const filterDescription = getFilterDescription();
    const confirmMessage = `Bạn có chắc chắn muốn xóa ${filteredData.length} đơn hàng theo bộ lọc?\n\nBộ lọc: ${filterDescription}\n\nHành động này không thể hoàn tác!`;

    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) return;

    try {
        showLoading(`Đang xóa ${filteredData.length} đơn hàng...`);

        // Update database with remaining data
        await collectionRef.doc("dathang").update({
            data: unfilteredData,
        });

        // Log the mass deletion
        logAction(
            "bulk_delete",
            `Xóa hàng loạt ${filteredData.length} đơn hàng theo bộ lọc: ${filterDescription}`,
            { deletedCount: filteredData.length, filter: filterDescription },
            { remainingCount: unfilteredData.length },
        );

        // Clear cache and reload data
        invalidateCache();
        await displayOrderData(true);

        // Clear filters after deletion
        clearFilters();

        hideFloatingAlert();
        showSuccess(`Đã xóa thành công ${filteredData.length} đơn hàng!`);
    } catch (error) {
        console.error("Error deleting filtered data:", error);
        showError("Lỗi khi xóa dữ liệu: " + error.message);
    }
}

function getFilterDescription() {
    const filters = [];

    const supplier = filterSupplierSelect?.value;
    if (supplier && supplier !== "all") {
        filters.push(`Nhà cung cấp: ${supplier}`);
    }

    const dateFrom = document.getElementById("dateFrom")?.value;
    const dateTo = document.getElementById("dateTo")?.value;

    if (dateFrom && dateTo) {
        filters.push(`Từ ${dateFrom} đến ${dateTo}`);
    } else if (dateFrom) {
        filters.push(`Từ ${dateFrom}`);
    } else if (dateTo) {
        filters.push(`Đến ${dateTo}`);
    }

    const product = filterProductInput?.value?.trim();
    if (product) {
        filters.push(`Sản phẩm: "${product}"`);
    }

    return filters.length > 0 ? filters.join(", ") : "Không có bộ lọc";
}

// =====================================================
// TABLE RENDERING
// =====================================================

function renderDataToTable(dataArray) {
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    const filteredData = applyFiltersToData(dataArray);
    tbody.innerHTML = "";

    // Add summary row
    if (filteredData.length > 0) {
        const summaryRow = createSummaryRow(filteredData.length);
        tbody.appendChild(summaryRow);
    }

    // Group orders by shared data
    const groupedOrders = groupOrdersBySharedData(filteredData);

    // Image loading management
    let totalImages = 0;
    let loadedImages = 0;
    const imageObserver = createImageObserver(() => {
        loadedImages++;
        if (loadedImages === totalImages) {
            setCachedData(dataArray);
        }
    });

    // Render groups
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);
    let renderedCount = 0;

    for (const groupKey in groupedOrders) {
        if (renderedCount >= maxRender) break;

        const group = groupedOrders[groupKey];
        renderedCount += renderOrderGroup(
            group,
            imageObserver,
            () => totalImages++,
        );

        if (renderedCount >= maxRender) break;
    }

    // Add warning row if data is truncated
    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = createWarningRow(filteredData.length);
        tbody.appendChild(warningRow);
    }

    // Cache data if no images to load
    if (totalImages === 0) {
        setCachedData(dataArray);
    }

    // Update dropdowns and suggestions
    updateDropdownOptions(dataArray);
}

function createSummaryRow(count) {
    const summaryRow = document.createElement("tr");
    summaryRow.className = "summary-row";
    summaryRow.style.backgroundColor = "#f8f9fa";
    summaryRow.style.fontWeight = "bold";

    const summaryTd = document.createElement("td");
    summaryTd.colSpan = 12; // Updated to match new column count (12 columns)
    summaryTd.textContent = `Tổng: ${count} đơn hàng`;
    summaryTd.style.textAlign = "center";
    summaryTd.style.color = "#007bff";
    summaryTd.style.padding = "8px";

    summaryRow.appendChild(summaryTd);
    return summaryRow;
}

function createWarningRow(totalCount) {
    const warningRow = document.createElement("tr");
    warningRow.className = "warning-row";
    warningRow.style.backgroundColor = "#fff3cd";
    warningRow.style.color = "#856404";

    const warningTd = document.createElement("td");
    warningTd.colSpan = 12; // Updated to match new column count (12 columns)
    warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${totalCount} đơn hàng. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
    warningTd.style.textAlign = "center";
    warningTd.style.padding = "8px";

    warningRow.appendChild(warningTd);
    return warningRow;
}

// =====================================================
// OPTIMIZED IMAGE LOADING & CACHING
// =====================================================

// Image cache with size limit
const imageCache = new Map();
const MAX_CACHE_SIZE = 50; // Maximum cached images
const CACHE_CLEANUP_THRESHOLD = 40; // Clean up when reaching this threshold

function cacheImage(url, blob) {
    if (imageCache.size >= MAX_CACHE_SIZE) {
        cleanupImageCache();
    }
    imageCache.set(url, {
        blob: blob,
        timestamp: Date.now(),
        accessed: Date.now(),
    });
}

function getCachedImage(url) {
    const cached = imageCache.get(url);
    if (cached) {
        cached.accessed = Date.now(); // Update access time
        return cached.blob;
    }
    return null;
}

function cleanupImageCache() {
    // Remove oldest accessed images
    const entries = Array.from(imageCache.entries()).sort(
        (a, b) => a[1].accessed - b[1].accessed,
    );

    const toRemove = entries.slice(
        0,
        imageCache.size - CACHE_CLEANUP_THRESHOLD,
    );
    toRemove.forEach(([url]) => imageCache.delete(url));

    console.log(`Image cache cleaned up: removed ${toRemove.length} images`);
}

function createOptimizedImageObserver(onImageLoad) {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const actualSrc = img.dataset.src;
                    if (actualSrc) {
                        loadImageOptimized(img, actualSrc, onImageLoad);
                    }
                    observer.unobserve(img);
                }
            });
        },
        {
            rootMargin: "100px", // Load images 100px before they come into view
            threshold: 0.1,
        },
    );
    return observer;
}

async function loadImageOptimized(img, src, onImageLoad) {
    try {
        // Check cache first
        const cachedBlob = getCachedImage(src);
        if (cachedBlob) {
            img.src = URL.createObjectURL(cachedBlob);
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                onImageLoad();
            };
            return;
        }

        // Load with progressive enhancement
        img.onload = () => {
            // Cache the loaded image
            fetch(src)
                .then((response) => response.blob())
                .then((blob) => cacheImage(src, blob))
                .catch((err) => console.warn("Failed to cache image:", err));

            onImageLoad();
        };

        img.onerror = () => {
            img.src = createPlaceholderImage(90, 90, "Lỗi tải ảnh");
            onImageLoad();
        };

        img.src = src;
        img.removeAttribute("data-src");
    } catch (error) {
        console.warn("Error loading image:", error);
        img.src = createPlaceholderImage(90, 90, "Lỗi");
        onImageLoad();
    }
}

function createPlaceholderImage(width, height, text = "...") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#f8f9fa");
    gradient.addColorStop(1, "#e9ecef");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = "#dee2e6";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Text
    ctx.fillStyle = "#6c757d";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2);

    return canvas.toDataURL();
}

function createImageObserver(onImageLoad) {
    return createOptimizedImageObserver(onImageLoad);
}

function createOptimizedImageContainer(
    images,
    imageObserver,
    incrementImageCount,
) {
    const container = document.createElement("div");
    container.className = "product-row";

    const imageArray = Array.isArray(images) ? images : [images];

    imageArray.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.dataset.src = imgUrl;

        // Use optimized placeholder
        img.src = createPlaceholderImage(90, 90);
        img.alt = "Đang tải...";
        img.className = "product-image";

        // Add loading attribute for modern browsers
        img.loading = "lazy";

        incrementImageCount();
        imageObserver.observe(img);
        container.appendChild(img);
    });

    return container;
}

// Update existing function to use optimized version
function createImageContainer(images, imageObserver, incrementImageCount) {
    return createOptimizedImageContainer(
        images,
        imageObserver,
        incrementImageCount,
    );
}

function renderOrderGroup(group, imageObserver, incrementImageCount) {
    const groupSize = group.length;
    let renderedInGroup = 0;

    group.forEach((order, index) => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-order-id", order.id || "");
        tr.classList.add("product-group");

        const cells = createOrderRowCells(
            order,
            index,
            groupSize,
            imageObserver,
            incrementImageCount,
        );
        cells.forEach((cell) => tr.appendChild(cell));

        tbody.appendChild(tr);
        renderedInGroup++;
    });

    return renderedInGroup;
}

function createOrderRowCells(
    order,
    index,
    groupSize,
    imageObserver,
    incrementImageCount,
) {
    const cells = [];
    const isFirstRowInGroup = index === 0;

    // Shared data cells (only for first row in group)
    if (isFirstRowInGroup) {
        // Date cell
        const dateCell = document.createElement("td");
        dateCell.textContent = order.ngayDatHang || "Chưa nhập";
        dateCell.rowSpan = groupSize;
        dateCell.classList.add("merged-cell");
        cells.push(dateCell);

        // Supplier cell
        const supplierCell = document.createElement("td");
        supplierCell.textContent = sanitizeInput(order.nhaCungCap || "");
        supplierCell.rowSpan = groupSize;
        supplierCell.classList.add("merged-cell");
        cells.push(supplierCell);

        // Invoice cell with images
        const invoiceCell = document.createElement("td");
        invoiceCell.appendChild(
            createInvoiceContent(order, imageObserver, incrementImageCount),
        );
        invoiceCell.rowSpan = groupSize;
        invoiceCell.classList.add("merged-cell");
        cells.push(invoiceCell);
    }

    // Product-specific cells
    const productNameCell = document.createElement("td");
    productNameCell.textContent = sanitizeInput(order.tenSanPham || "");
    cells.push(productNameCell);

    const productCodeCell = document.createElement("td");
    productCodeCell.textContent = sanitizeInput(order.maSanPham || "");
    cells.push(productCodeCell);

    const variantCell = document.createElement("td");
    variantCell.textContent = sanitizeInput(order.bienThe || "");
    cells.push(variantCell);

    // Quantity input cell
    const quantityCell = document.createElement("td");
    quantityCell.appendChild(createQuantityInput(order));
    cells.push(quantityCell);

    // Product images cell with sell price input below
    const productImagesCell = document.createElement("td");
    const productImageContainer = createProductImageWithSellPrice(
        order,
        imageObserver,
        incrementImageCount,
    );
    productImagesCell.appendChild(productImageContainer);
    cells.push(productImagesCell);

    // Price images cell with buy price input below
    const priceImagesCell = document.createElement("td");
    const priceImageContainer = createPriceImageWithBuyPrice(
        order,
        imageObserver,
        incrementImageCount,
    );
    priceImagesCell.appendChild(priceImageContainer);
    cells.push(priceImagesCell);

    // Notes cell
    const notesCell = document.createElement("td");
    notesCell.textContent = sanitizeInput(order.ghiChu || "");
    notesCell.style.maxWidth = "150px";
    notesCell.style.overflow = "hidden";
    notesCell.style.textOverflow = "ellipsis";
    notesCell.style.whiteSpace = "nowrap";
    if (order.ghiChu) {
        notesCell.title = order.ghiChu;
    }
    cells.push(notesCell);

    // Edit button cell
    const editCell = document.createElement("td");
    editCell.appendChild(createEditButton(order));
    cells.push(editCell);

    // Delete button cell
    const deleteCell = document.createElement("td");
    deleteCell.appendChild(createDeleteButton(order));
    cells.push(deleteCell);

    // Apply permissions
    const auth = getAuthState();
    if (auth) {
        const quantityInput = quantityCell.querySelector("input");
        const sellPriceInput =
            productImagesCell.querySelector(".price-sell-input");
        const buyPriceInput = priceImagesCell.querySelector(".price-buy-input");
        applyRowPermissions(
            [quantityInput, sellPriceInput, buyPriceInput],
            deleteCell.querySelector("button"),
            parseInt(auth.checkLogin),
        );
    }

    return cells;
}

function createProductImageWithSellPrice(
    order,
    imageObserver,
    incrementImageCount,
) {
    const container = document.createElement("div");
    container.className = "image-with-price-container";

    // Add product images if they exist
    if (order.anhSanPham) {
        const imageContainer = createImageContainer(
            order.anhSanPham,
            imageObserver,
            incrementImageCount,
        );
        imageContainer.style.marginBottom = "8px";
        container.appendChild(imageContainer);
    }

    // Add sell price input below images
    const sellPriceInput = createSellPriceInput(order);
    sellPriceInput.style.width = "100%";
    sellPriceInput.style.fontSize = "12px";
    sellPriceInput.style.padding = "6px 8px";
    sellPriceInput.placeholder = "Giá bán";
    container.appendChild(sellPriceInput);

    return container;
}

function createPriceImageWithBuyPrice(
    order,
    imageObserver,
    incrementImageCount,
) {
    const container = document.createElement("div");
    container.className = "image-with-price-container";

    // Add price images if they exist
    if (order.anhGiaMua || order.anhGiaNhap) {
        const priceImage = order.anhGiaMua || order.anhGiaNhap;
        const imageContainer = createImageContainer(
            priceImage,
            imageObserver,
            incrementImageCount,
        );
        imageContainer.style.marginBottom = "8px";
        container.appendChild(imageContainer);
    }

    // Add buy price input below images
    const buyPriceInput = createBuyPriceInput(order);
    buyPriceInput.style.width = "100%";
    buyPriceInput.style.fontSize = "12px";
    buyPriceInput.style.padding = "6px 8px";
    buyPriceInput.placeholder = "Giá mua";
    container.appendChild(buyPriceInput);

    return container;
}

function createInvoiceContent(order, imageObserver, incrementImageCount) {
    const container = document.createElement("div");
    container.textContent = sanitizeInput(order.hoaDon || "");

    if (order.anhHoaDon) {
        const invoiceImgs = Array.isArray(order.anhHoaDon)
            ? order.anhHoaDon
            : [order.anhHoaDon];
        const imageContainer = createImageContainer(
            invoiceImgs,
            imageObserver,
            incrementImageCount,
        );
        container.appendChild(imageContainer);
    }

    return container;
}

function createImageContainer(images, imageObserver, incrementImageCount) {
    const container = document.createElement("div");
    container.className = "product-row";

    const imageArray = Array.isArray(images) ? images : [images];

    imageArray.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.dataset.src = imgUrl;
        img.src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
        img.alt = "Đang tải...";
        img.className = "product-image";

        incrementImageCount();
        imageObserver.observe(img);
        container.appendChild(img);
    });

    return container;
}

function createQuantityInput(order) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = order.soLuong || 0;
    input.min = "0";
    input.className = "quantity-input";
    input.setAttribute("data-order-id", order.id || "");
    input.defaultValue = order.soLuong || 0;
    input.addEventListener("change", updateOrderByID);
    input.addEventListener("wheel", function (e) {
        e.preventDefault();
    });
    return input;
}

function createBuyPriceInput(order) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = order.giaMua || order.giaNhap || 0; // Normal number format
    input.min = "0";
    input.step = "any";
    input.className = "price-buy-input";
    input.setAttribute("data-order-id", order.id || "");
    input.defaultValue = order.giaMua || order.giaNhap || 0;
    input.addEventListener("change", updateOrderByID);
    input.addEventListener("wheel", function (e) {
        e.preventDefault();
    });
    return input;
}

function createSellPriceInput(order) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = order.giaBan || 0; // Normal number format
    input.min = "0";
    input.step = "any";
    input.className = "price-sell-input";
    input.setAttribute("data-order-id", order.id || "");
    input.defaultValue = order.giaBan || 0;
    input.addEventListener("change", updateOrderByID);
    input.addEventListener("wheel", function (e) {
        e.preventDefault();
    });
    return input;
}

function createEditableImageContainer(
    images,
    imageObserver,
    incrementImageCount,
    imageType,
    orderId,
) {
    const container = document.createElement("div");
    container.className = "product-row";

    const imageArray = Array.isArray(images) ? images : [images];

    imageArray.forEach((imgUrl, index) => {
        const imageEditContainer = document.createElement("div");
        imageEditContainer.className = "image-edit-container";

        const img = document.createElement("img");
        img.dataset.src = imgUrl;
        img.src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
        img.alt = "Đang tải...";
        img.className = "product-image";

        const overlay = document.createElement("div");
        overlay.className = "image-edit-overlay";

        const editButton = document.createElement("button");
        editButton.className = "image-edit-button";
        editButton.textContent = "Sửa ảnh";
        editButton.setAttribute("data-order-id", orderId);
        editButton.setAttribute("data-image-type", imageType);
        editButton.setAttribute("data-image-index", index);
        editButton.addEventListener("click", (e) => {
            e.stopPropagation();
            editImage(orderId, imageType, index);
        });

        overlay.appendChild(editButton);
        imageEditContainer.appendChild(img);
        imageEditContainer.appendChild(overlay);

        incrementImageCount();
        imageObserver.observe(img);
        container.appendChild(imageEditContainer);
    });

    return container;
}

function createProductImageWithSellPrice(
    order,
    imageObserver,
    incrementImageCount,
) {
    const container = document.createElement("div");
    container.className = "image-with-price-container";

    // Add product images if they exist
    if (order.anhSanPham) {
        const imageContainer = createEditableImageContainer(
            order.anhSanPham,
            imageObserver,
            incrementImageCount,
            "product",
            order.id,
        );
        imageContainer.style.marginBottom = "8px";
        container.appendChild(imageContainer);
    }

    // Add sell price input below images
    const sellPriceInput = createSellPriceInput(order);
    sellPriceInput.style.width = "100%";
    sellPriceInput.placeholder = "Giá bán";
    container.appendChild(sellPriceInput);

    return container;
}

function createPriceImageWithBuyPrice(
    order,
    imageObserver,
    incrementImageCount,
) {
    const container = document.createElement("div");
    container.className = "image-with-price-container";

    // Add price images if they exist
    if (order.anhGiaMua || order.anhGiaNhap) {
        const priceImage = order.anhGiaMua || order.anhGiaNhap;
        const imageContainer = createEditableImageContainer(
            priceImage,
            imageObserver,
            incrementImageCount,
            "price",
            order.id,
        );
        imageContainer.style.marginBottom = "8px";
        container.appendChild(imageContainer);
    }

    // Add buy price input below images
    const buyPriceInput = createBuyPriceInput(order);
    buyPriceInput.style.width = "100%";
    buyPriceInput.placeholder = "Giá mua";
    container.appendChild(buyPriceInput);

    return container;
}

function createInvoiceContent(order, imageObserver, incrementImageCount) {
    const container = document.createElement("div");

    // Invoice number
    const invoiceText = document.createElement("div");
    invoiceText.textContent = sanitizeInput(order.hoaDon || "");
    invoiceText.style.marginBottom = "8px";
    invoiceText.style.fontWeight = "600";
    container.appendChild(invoiceText);

    if (order.anhHoaDon) {
        const invoiceImgs = Array.isArray(order.anhHoaDon)
            ? order.anhHoaDon
            : [order.anhHoaDon];
        const imageContainer = createEditableImageContainer(
            invoiceImgs,
            imageObserver,
            incrementImageCount,
            "invoice",
            order.id,
        );
        container.appendChild(imageContainer);
    }

    return container;
}

// Image editing functionality
async function editImage(orderId, imageType, imageIndex) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền chỉnh sửa ảnh");
        return;
    }

    // Create file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    fileInput.addEventListener("change", async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            await updateImageInDatabase(orderId, imageType, imageIndex, file);
        }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

async function updateImageInDatabase(orderId, imageType, imageIndex, file) {
    try {
        showLoading("Đang cập nhật ảnh...");

        // Compress image
        const compressedFile = await compressImage(file);

        // Upload to Firebase
        const imageUrl = await uploadImageToFirebase(compressedFile, imageType);

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

        // Update image field
        const fieldName = getImageFieldName(imageType);
        const currentOrder = data.data[orderIndex];
        const oldImageData = currentOrder[fieldName];

        if (Array.isArray(oldImageData)) {
            currentOrder[fieldName][imageIndex] = imageUrl;
        } else {
            currentOrder[fieldName] = imageUrl;
        }

        // Save to database
        await collectionRef.doc("dathang").update({ data: data.data });

        // Log action
        logAction(
            "update_image",
            `Cập nhật ảnh ${imageType} cho đơn hàng ID: ${orderId}`,
            { [fieldName]: oldImageData },
            { [fieldName]: currentOrder[fieldName] },
        );

        invalidateCache();
        await displayOrderData(true); // Force reload

        hideFloatingAlert();
        showSuccess("Cập nhật ảnh thành công!");
    } catch (error) {
        console.error("Error updating image:", error);
        showError("Lỗi khi cập nhật ảnh: " + error.message);
    }
}

function getImageFieldName(imageType) {
    switch (imageType) {
        case "invoice":
            return "anhHoaDon";
        case "product":
            return "anhSanPham";
        case "price":
            return "anhGiaMua";
        default:
            return "anhSanPham";
    }
}

// Compress image function (reused from form)
async function compressImage(file) {
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

function createEditButton(order) {
    const button = document.createElement("button");
    button.className = "edit-button";
    button.setAttribute("data-order-id", order.id || "");
    button.setAttribute(
        "data-order-info",
        `${sanitizeInput(order.tenSanPham || "")} - ${order.hoaDon || ""}`,
    );
    button.addEventListener("click", editOrderByID);
    return button;
}

function createDeleteButton(order) {
    const button = document.createElement("button");
    button.className = "delete-button";
    button.setAttribute("data-order-id", order.id || "");
    button.setAttribute(
        "data-order-info",
        `${sanitizeInput(order.tenSanPham || "")} - ${order.hoaDon || ""}`,
    );
    button.addEventListener("click", deleteOrderByID);
    return button;
}

function groupOrdersBySharedData(dataArray) {
    const groups = {};

    dataArray.forEach((order) => {
        const groupKey = `${order.nhaCungCap}_${order.ngayDatHang}_${order.hoaDon}`;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(order);
    });

    return groups;
}

function applyRowPermissions(inputs, deleteButton, userRole) {
    if (userRole !== 0) {
        inputs.forEach((input) => {
            if (input) input.disabled = true;
        });
        if (deleteButton) deleteButton.style.display = "none";
    } else {
        inputs.forEach((input) => {
            if (input) input.disabled = false;
        });
        if (deleteButton) deleteButton.style.display = "";
    }
}

function updateDropdownOptions(fullDataArray) {
    if (!filterSupplierSelect) return;

    const suppliers = [
        ...new Set(
            fullDataArray
                .map((order) => order.nhaCungCap)
                .filter((supplier) => supplier),
        ),
    ];

    const currentSelectedValue = filterSupplierSelect.value;

    // Clear existing options except "All"
    while (filterSupplierSelect.children.length > 1) {
        filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
    }

    // Add supplier options
    suppliers.forEach((supplier) => {
        const option = document.createElement("option");
        option.value = supplier;
        option.textContent = supplier;
        filterSupplierSelect.appendChild(option);
    });

    // Restore selection if valid
    if (
        currentSelectedValue &&
        currentSelectedValue !== "all" &&
        suppliers.includes(currentSelectedValue)
    ) {
        filterSupplierSelect.value = currentSelectedValue;
    }
}

// =====================================================
// DATA LOADING & INITIALIZATION WITH AUTO-RELOAD
// =====================================================

async function displayOrderData(forceReload = false) {
    try {
        const cachedData = getCachedData();
        if (cachedData && !forceReload) {
            showFloatingAlert("Sử dụng dữ liệu cache...", true);
            const sortedCacheData = sortDataByNewest(cachedData);
            renderDataToTable(sortedCacheData);
            updateSuggestions(sortedCacheData);
            hideFloatingAlert();
            showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
            return;
        }

        showFloatingAlert("Đang tải dữ liệu từ server...", true);

        const doc = await collectionRef.doc("dathang").get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                // Migrate old price data
                const migratedData = migrateOldPriceData(data.data);
                const sortedData = sortDataByNewest(migratedData);

                renderDataToTable(sortedData);
                updateSuggestions(sortedData);
                preloadImagesAndCache(sortedData);

                // Update UI indicators
                updateDataCountIndicator(sortedData.length);
            }
        }

        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu hoàn tất!", false, 2000);
    } catch (error) {
        console.error("Error loading data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi tải dữ liệu!", false, 3000);
    }
}

// Auto-reload functionality
function setupAutoReload() {
    if (window.enableRealTimeUpdates) {
        collectionRef.doc("dathang").onSnapshot((doc) => {
            if (doc.exists) {
                console.log("Data changed, auto-reloading...");
                invalidateCache();
                displayOrderData(true);
            }
        });
    }
}

// Update data count indicator
function updateDataCountIndicator(count) {
    const titleElement = document.querySelector(".page-title");
    if (titleElement) {
        titleElement.textContent += " - " + auth.displayName;
    }

    document.title = `Đặt Hàng (${count})`;
}

function preloadImagesAndCache(dataArray) {
    const imageUrls = [];

    // Collect all image URLs
    dataArray.forEach((order) => {
        // Invoice images
        if (order.anhHoaDon) {
            if (Array.isArray(order.anhHoaDon)) {
                imageUrls.push(...order.anhHoaDon);
            } else {
                imageUrls.push(order.anhHoaDon);
            }
        }

        // Product images
        if (order.anhSanPham) {
            if (Array.isArray(order.anhSanPham)) {
                imageUrls.push(...order.anhSanPham);
            } else {
                imageUrls.push(order.anhSanPham);
            }
        }

        // Price images (both old and new field names)
        const priceImg = order.anhGiaMua || order.anhGiaNhap;
        if (priceImg) {
            if (Array.isArray(priceImg)) {
                imageUrls.push(...priceImg);
            } else {
                imageUrls.push(priceImg);
            }
        }
    });

    // Pre-load all images
    const imagePromises = imageUrls.map((url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(url); // Still resolve on error
            img.src = url;
        });
    });

    // Cache data after images load
    Promise.all(imagePromises)
        .then(() => {
            console.log("All images pre-loaded, caching data");
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

// Force reload function for external calls
async function forceReloadTable() {
    invalidateCache();
    await displayOrderData(true);
    showSuccess("Đã làm mới dữ liệu!");
}

// Smart reload - only reload if data actually changed
async function smartReload() {
    try {
        const doc = await collectionRef.doc("dathang").get();
        if (doc.exists) {
            const serverData = doc.data().data || [];
            const cachedData = getCachedData();

            // Compare data lengths and timestamps
            if (!cachedData || serverData.length !== cachedData.length) {
                console.log("Data changes detected, reloading...");
                await displayOrderData(true);
            } else {
                console.log("No changes detected");
            }
        }
    } catch (error) {
        console.error("Error in smart reload:", error);
    }
}

// =====================================================
// EXPORT FUNCTIONS
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

        const excelData = filteredData.map((order) => ({
            "Loại sản phẩm": "Có thể lưu trữ",
            "Mã sản phẩm": order.maSanPham?.toString() || "",
            "Mã chốt đơn": "",
            "Tên sản phẩm": order.tenSanPham?.toString() || "",
            "Giá bán": (order.giaBan || 0) * 1000,
            "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
            "Đơn vị": "CÁI",
            "Nhóm sản phẩm": "QUẦN ÁO",
            "Mã vạch": order.maSanPham?.toString() || "",
            "Khối lượng": "",
            "Chiết khấu bán": "",
            "Chiết khấu mua": "",
            "Tồn kho": "",
            "Giá vốn": "",
            "Ghi chú": order.ghiChu || "",
            "Cho phép bán ở công ty khác": "FALSE",
            "Thuộc tính": "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất Excel thành công!");
    } catch (error) {
        console.error("Error exporting Excel:", error);
        showError("Lỗi khi xuất Excel!");
        hideFloatingAlert();
    }
}

// Upload image to Firebase (reused from form)
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

// Expose functions globally
window.forceReloadTable = forceReloadTable;
window.smartReload = smartReload;

console.log("Order Management System - Display Functions loaded");
