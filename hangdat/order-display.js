// Order Management System - Display and Filtering
// Functions for rendering data and applying filters

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
        summaryTd.colSpan = 12;
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

                // Invoice cell with images
                const invoiceContainer = document.createElement("div");
                invoiceContainer.textContent = sanitizeInput(
                    order.hoaDon || "",
                );

                if (order.anhHoaDon) {
                    const invoiceImgs = Array.isArray(order.anhHoaDon)
                        ? order.anhHoaDon
                        : [order.anhHoaDon];
                    const imageContainer = document.createElement("div");
                    imageContainer.className = "product-row";
                    invoiceImgs.forEach((imgUrl) => {
                        const img = document.createElement("img");
                        img.dataset.src = imgUrl;
                        img.src =
                            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
                        img.alt = "Đang tải...";
                        img.className = "product-image";
                        totalImages++;
                        imageObserver.observe(img);
                        imageContainer.appendChild(img);
                    });
                    invoiceContainer.appendChild(imageContainer);
                }

                cells[2].appendChild(invoiceContainer);
                cells[2].rowSpan = groupSize;
                cells[2].classList.add("merged-cell");
            } else {
                // Skip shared data cells for subsequent rows in group
                cells.splice(0, 3);
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

            // Price buy input
            const priceBuyInput = document.createElement("input");
            priceBuyInput.type = "number";
            priceBuyInput.value = order.giaMua * 1000 || order.giaNhap || 0;
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
            priceSellInput.value = order.giaBan * 1000 || 0;
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
                    [quantityInput],
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
        warningTd.colSpan = 12;
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
                // Migrate old price data
                const migratedData = migrateOldPriceData(data.data);
                const sortedData = sortDataByNewest(migratedData);
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
        if (order.anhGiaMua || order.anhGiaNhap) {
            const priceImg = order.anhGiaMua || order.anhGiaNhap;
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

        const excelData = filteredData.map((order, index) => ({
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

console.log("Order Management System - Display Functions loaded");
