// Enhanced Goods Receipt Management System - Main Application
// Table rendering, filtering, and application initialization

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
        summaryTd.colSpan = 7; // Updated to 7 columns for new Bao bì column
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
            // Updated to 7 columns
            cells[j] = document.createElement("td");
        }

        // Tên người nhận
        cells[0].textContent = sanitizeInput(receipt.tenNguoiNhan || "");

        // Số kg
        cells[1].textContent = parseFloat(receipt.soKg);

        // Số kiện
        cells[2].textContent = parseFloat(receipt.soKien);

        // // Bao bì - NEW COLUMN
        // if (receipt.baoBi) {
        //     const packagingSpan = document.createElement("span");
        //     packagingSpan.textContent = getPackagingText(receipt.baoBi);
        //     packagingSpan.className = `packaging-status ${receipt.baoBi}`;
        //     packagingSpan.style.padding = "4px 8px";
        //     packagingSpan.style.borderRadius = "12px";
        //     packagingSpan.style.fontSize = "12px";
        //     packagingSpan.style.fontWeight = "600";
        //     packagingSpan.style.textTransform = "uppercase";
        //     packagingSpan.style.letterSpacing = "0.5px";

        //     if (receipt.baoBi === "co") {
        //         packagingSpan.style.backgroundColor = "rgba(40, 167, 69, 0.1)";
        //         packagingSpan.style.color = "#28a745";
        //         packagingSpan.style.border = "1px solid #28a745";
        //     } else {
        //         packagingSpan.style.backgroundColor = "rgba(220, 53, 69, 0.1)";
        //         packagingSpan.style.color = "#dc3545";
        //         packagingSpan.style.border = "1px solid #dc3545";
        //     }

        //     cells[3].appendChild(packagingSpan);
        // } else {
        //     cells[3].textContent = "Chưa xác định";
        //     cells[3].style.color = "#6c757d";
        //     cells[3].style.fontStyle = "italic";
        // }

        // Hình ảnh
        if (receipt.anhNhanHang) {
            const imgContainer = document.createElement("div");
            imgContainer.style.position = "relative";
            imgContainer.style.display = "inline-block";

            const img = document.createElement("img");
            img.dataset.src = receipt.anhNhanHang;
            img.src =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
            img.alt = "Đang tải...";
            img.className = "product-image";
            img.style.cursor = "pointer";
            totalImages++;
            imageObserver.observe(img);

            // Add packaging watermark to table image
            if (receipt.baoBi) {
                const watermark = document.createElement("div");
                watermark.className = `packaging-watermark ${receipt.baoBi}`;
                watermark.textContent = getPackagingText(receipt.baoBi);
                watermark.style.position = "absolute";
                watermark.style.top = "2px";
                watermark.style.right = "2px";
                watermark.style.fontSize = "8px";
                watermark.style.padding = "2px 4px";
                imgContainer.appendChild(watermark);
            }

            imgContainer.appendChild(img);
            cells[3].appendChild(imgContainer);
        } else {
            cells[3].textContent = "Không có ảnh";
        }

        // Ngày giờ nhận
        cells[4].textContent = receipt.thoiGianNhan || "Chưa nhập";

        // Thao tác
        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.setAttribute("data-receipt-id", receipt.id || "");
        deleteButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)} - ${receipt.baoBi ? getPackagingText(receipt.baoBi) : "Chưa xác định"}`,
        );
        deleteButton.addEventListener("click", deleteReceiptByID);

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.setAttribute("data-receipt-id", receipt.id || "");
        editButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)} - ${receipt.baoBi ? getPackagingText(receipt.baoBi) : "Chưa xác định"}`,
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
                [],
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
        warningTd.colSpan = 7;
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
// INITIALIZATION FUNCTIONS
// =====================================================

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

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener("click", function (e) {
            // Image zoom functionality
            if (e.target.classList.contains("product-image")) {
                const imgSrc = e.target.src;
                if (imgSrc && !imgSrc.includes("data:image/svg+xml")) {
                    showImageZoom(imgSrc);
                }
                return;
            }

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

// =====================================================
// IMAGE ZOOM FUNCTIONS
// =====================================================

function createImageZoomOverlay() {
    // Check if overlay already exists
    let overlay = document.getElementById("imageZoomOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "imageZoomOverlay";
        overlay.className = "image-zoom-overlay";

        const container = document.createElement("div");
        container.className = "image-zoom-container";

        const closeBtn = document.createElement("button");
        closeBtn.className = "image-zoom-close";
        closeBtn.innerHTML = "×";
        closeBtn.setAttribute("aria-label", "Đóng");

        const img = document.createElement("img");
        img.id = "zoomedImage";
        img.alt = "Ảnh phóng to";

        container.appendChild(img);
        overlay.appendChild(closeBtn);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                hideImageZoom();
            }
        });

        // Close on button click
        closeBtn.addEventListener("click", hideImageZoom);

        // Close on ESC key
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                hideImageZoom();
            }
        });
    }
    return overlay;
}

function showImageZoom(imgSrc) {
    const overlay = createImageZoomOverlay();
    const img = document.getElementById("zoomedImage");

    if (img && imgSrc) {
        img.src = imgSrc;
        overlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent scrolling
    }
}

function hideImageZoom() {
    const overlay = document.getElementById("imageZoomOverlay");
    if (overlay) {
        overlay.classList.remove("active");
        document.body.style.overflow = ""; // Restore scrolling
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
// MAIN APPLICATION INITIALIZATION
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

// =====================================================
// GLOBAL ERROR HANDLERS
// =====================================================

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    showError("Có lỗi xảy ra trong xử lý dữ liệu.");
});

// =====================================================
// CLEANUP & INITIALIZATION
// =====================================================

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

// =====================================================
// DEBUG FUNCTIONS (Optional)
// =====================================================

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
    getSelectedPackaging,
    getSelectedEditPackaging,
    setPackagingValue,
    setEditPackagingValue,
    getPackagingText,
    showImageZoom,
    hideImageZoom,
};

console.log(
    "Enhanced Goods Receipt Management System with Packaging Support loaded successfully",
);
console.log("Debug functions available at window.debugFunctions");
