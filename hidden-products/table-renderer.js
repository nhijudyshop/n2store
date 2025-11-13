// =====================================================
// TABLE RENDERER FOR HIDDEN PRODUCTS
// =====================================================

function renderHiddenProductsTable(products) {
    const tbody = document.getElementById("hiddenProductsTableBody");
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    // Clear table
    tbody.innerHTML = "";

    // Show empty state if no products
    if (!products || products.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
            <td colspan="9" style="text-align: center; padding: 40px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-secondary);">
                    <i data-lucide="eye-off" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                    <span style="font-size: 16px;">Không có sản phẩm nào đã ẩn</span>
                    <span style="font-size: 14px; opacity: 0.7;">Các sản phẩm bạn ẩn sẽ xuất hiện ở đây</span>
                </div>
            </td>
        `;
        tbody.appendChild(emptyRow);
        lucide.createIcons();
        return;
    }

    // Add summary row
    const summaryRow = document.createElement("tr");
    summaryRow.className = "summary-row";
    summaryRow.innerHTML = `
        <td colspan="9" style="padding: 12px; background: #f5f5f5; font-weight: 500;">
            Hiển thị: <strong style="color: #ff6b35;">${products.length}</strong> sản phẩm đã ẩn
        </td>
    `;
    tbody.appendChild(summaryRow);

    // Render each product
    products.forEach((product, index) => {
        const tr = document.createElement("tr");
        tr.className = "inventory-row";
        tr.setAttribute("data-product-id", product.Id || "");

        // 1. STT
        const sttCell = document.createElement("td");
        sttCell.textContent = index + 1;
        sttCell.style.textAlign = "center";
        tr.appendChild(sttCell);

        // 2. Tên sản phẩm
        const nameCell = document.createElement("td");
        nameCell.textContent = Utils.sanitizeInput(product.Name || product.NameGet || "Không có tên");
        tr.appendChild(nameCell);

        // 3. Mã sản phẩm
        const codeCell = document.createElement("td");
        codeCell.textContent = Utils.sanitizeInput(product.Code || "N/A");
        tr.appendChild(codeCell);

        // 4. Biến thể
        const variantCell = document.createElement("td");
        variantCell.textContent = Utils.sanitizeInput(product.Variant || "-");
        tr.appendChild(variantCell);

        // 5. Tồn kho (On Hand qty)
        const qtyCell = document.createElement("td");
        qtyCell.style.textAlign = "center";
        const onHandQty = product.OnHandQty || product.onHandQty || 0;
        qtyCell.innerHTML = `<strong>${Utils.formatNumber(onHandQty)}</strong>`;

        // Color code based on quantity
        if (onHandQty > 0) {
            qtyCell.style.color = "#4caf50"; // Green for in stock
        } else {
            qtyCell.style.color = "#f44336"; // Red for out of stock
        }
        tr.appendChild(qtyCell);

        // 6. Ngày ẩn
        const hiddenDateCell = document.createElement("td");
        const hiddenAt = product.hiddenAt || product.addedAt;
        hiddenDateCell.textContent = Utils.formatDate(hiddenAt);
        tr.appendChild(hiddenDateCell);

        // 7. Ẩn từ (ngày)
        const daysAgoCell = document.createElement("td");
        daysAgoCell.style.textAlign = "center";
        const days = Utils.daysAgo(hiddenAt);
        daysAgoCell.innerHTML = `<span class="hidden-badge">${days} ngày</span>`;
        tr.appendChild(daysAgoCell);

        // 8. Ảnh sản phẩm
        const imageCell = document.createElement("td");
        imageCell.style.textAlign = "center";

        const imageUrl = product.imageUrl || product.ImageUrl;
        if (imageUrl) {
            const img = document.createElement("img");
            img.src = imageUrl;
            img.alt = product.Name || "Product";
            img.className = "product-image";
            img.style.cssText = `
                width: 60px;
                height: 60px;
                object-fit: cover;
                border-radius: 6px;
                cursor: pointer;
                transition: transform 0.2s;
            `;
            img.onmouseover = function() {
                this.style.transform = "scale(1.1)";
            };
            img.onmouseout = function() {
                this.style.transform = "scale(1)";
            };
            img.onclick = () => Utils.openImageModal(imageUrl);
            img.onerror = function() {
                this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect fill='%23f0f0f0' width='60' height='60'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
            };
            imageCell.appendChild(img);
        } else {
            imageCell.innerHTML = `<span style="color: #999; font-size: 12px;">Không có ảnh</span>`;
        }
        tr.appendChild(imageCell);

        // 9. Thao tác
        const actionCell = document.createElement("td");
        actionCell.style.textAlign = "center";

        const actionContainer = document.createElement("div");
        actionContainer.style.cssText = "display: flex; gap: 4px; justify-content: center;";

        // Restore button
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "restore-button";
        restoreBtn.innerHTML = '<i data-lucide="eye" style="width: 14px; height: 14px;"></i> Khôi phục';
        restoreBtn.onclick = () => restoreProduct(product.Id);
        actionContainer.appendChild(restoreBtn);

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-button";
        deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Xóa';
        deleteBtn.onclick = () => deleteProduct(product.Id);
        actionContainer.appendChild(deleteBtn);

        actionCell.appendChild(actionContainer);
        tr.appendChild(actionCell);

        tbody.appendChild(tr);
    });

    // Reinitialize Lucide icons for the table
    lucide.createIcons();

    console.log(`✅ Rendered ${products.length} hidden products`);
}

// Restore a single product
async function restoreProduct(productId) {
    if (!productId) {
        Utils.showNotification("Không tìm thấy ID sản phẩm", "error");
        return;
    }

    if (!confirm("Bạn có chắc muốn khôi phục sản phẩm này không?")) {
        return;
    }

    try {
        // Find product in savedProducts
        const productIndex = window.savedProducts.findIndex(p => p.Id === productId);
        if (productIndex === -1) {
            Utils.showNotification("Không tìm thấy sản phẩm", "error");
            return;
        }

        // Update isHidden flag
        window.savedProducts[productIndex].isHidden = false;
        delete window.savedProducts[productIndex].hiddenAt;

        // Sync to Firebase
        await database.ref('savedProducts').set(window.savedProducts);

        Utils.showNotification("✅ Đã khôi phục sản phẩm thành công!", "success");

        // Reload data
        loadHiddenProducts();
    } catch (error) {
        console.error("Error restoring product:", error);
        Utils.showNotification("❌ Lỗi khi khôi phục sản phẩm: " + error.message, "error");
    }
}

// Delete a single product permanently
async function deleteProduct(productId) {
    if (!productId) {
        Utils.showNotification("Không tìm thấy ID sản phẩm", "error");
        return;
    }

    if (!confirm("⚠️ Bạn có chắc muốn XÓA VĨNH VIỄN sản phẩm này không?\n\nHành động này không thể hoàn tác!")) {
        return;
    }

    try {
        // Remove product from savedProducts
        window.savedProducts = window.savedProducts.filter(p => p.Id !== productId);

        // Sync to Firebase
        await database.ref('savedProducts').set(window.savedProducts);

        Utils.showNotification("✅ Đã xóa sản phẩm thành công!", "success");

        // Reload data
        loadHiddenProducts();
    } catch (error) {
        console.error("Error deleting product:", error);
        Utils.showNotification("❌ Lỗi khi xóa sản phẩm: " + error.message, "error");
    }
}

// Restore all hidden products
async function restoreAllProducts() {
    if (globalState.hiddenProducts.length === 0) {
        Utils.showNotification("Không có sản phẩm nào để khôi phục", "warning");
        return;
    }

    if (!confirm(`Bạn có chắc muốn khôi phục TẤT CẢ ${globalState.hiddenProducts.length} sản phẩm đã ẩn không?`)) {
        return;
    }

    try {
        // Update all hidden products
        window.savedProducts.forEach(product => {
            if (product.isHidden) {
                product.isHidden = false;
                delete product.hiddenAt;
            }
        });

        // Sync to Firebase
        await database.ref('savedProducts').set(window.savedProducts);

        Utils.showNotification(`✅ Đã khôi phục ${globalState.hiddenProducts.length} sản phẩm!`, "success");

        // Reload data
        loadHiddenProducts();
    } catch (error) {
        console.error("Error restoring all products:", error);
        Utils.showNotification("❌ Lỗi khi khôi phục sản phẩm: " + error.message, "error");
    }
}

// Update statistics
function updateStatistics() {
    const totalHidden = globalState.hiddenProducts.length;
    const filtered = globalState.filteredProducts.length;

    // Count hidden today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const hiddenToday = globalState.hiddenProducts.filter(p => {
        const hiddenAt = p.hiddenAt || p.addedAt;
        if (!hiddenAt) return false;
        const hiddenDate = new Date(hiddenAt);
        const hiddenDateStart = new Date(
            hiddenDate.getFullYear(),
            hiddenDate.getMonth(),
            hiddenDate.getDate(),
            0, 0, 0, 0
        );
        return hiddenDateStart.getTime() === todayStart.getTime();
    }).length;

    // Find oldest hidden date
    let oldestDays = 0;
    if (totalHidden > 0) {
        const oldestProduct = globalState.hiddenProducts.reduce((oldest, current) => {
            const currentHiddenAt = current.hiddenAt || current.addedAt || Date.now();
            const oldestHiddenAt = oldest.hiddenAt || oldest.addedAt || Date.now();
            return currentHiddenAt < oldestHiddenAt ? current : oldest;
        });
        oldestDays = Utils.daysAgo(oldestProduct.hiddenAt || oldestProduct.addedAt);
    }

    // Update UI
    const totalEl = document.getElementById("totalHiddenProducts");
    const filteredEl = document.getElementById("filteredCount");
    const todayEl = document.getElementById("hiddenToday");
    const oldestEl = document.getElementById("oldestHiddenDays");

    if (totalEl) totalEl.textContent = totalHidden;
    if (filteredEl) filteredEl.textContent = filtered;
    if (todayEl) todayEl.textContent = hiddenToday;
    if (oldestEl) oldestEl.textContent = oldestDays;
}

// Export functions
window.renderHiddenProductsTable = renderHiddenProductsTable;
window.restoreProduct = restoreProduct;
window.deleteProduct = deleteProduct;
window.restoreAllProducts = restoreAllProducts;
window.updateStatistics = updateStatistics;

console.log("✅ Table renderer loaded");
