// Enhanced Inventory Management System - Main Script
// Handles inventory tracking from order data with edit capabilities

// =====================================================
// INVENTORY DATA PROCESSING
// =====================================================

// Transform order data into inventory records
function transformOrderDataToInventory(orderData) {
    if (!Array.isArray(orderData)) return [];
    
    const inventoryMap = new Map();
    
    orderData.forEach(order => {
        if (!order.maSanPham && !order.tenSanPham) return; // Skip if no product identifier
        
        // Use product code as primary key, fallback to product name
        const productKey = order.maSanPham || order.tenSanPham;
        
        if (inventoryMap.has(productKey)) {
            // Update existing inventory record
            const existing = inventoryMap.get(productKey);
            existing.soLuong += (order.soLuong || 0);
            
            // Update received date if this order is newer
            const existingDate = parseVietnameseDate(existing.ngayNhan);
            const orderDate = parseVietnameseDate(order.thoiGianUpload);
            
            if (orderDate && (!existingDate || orderDate > existingDate)) {
                existing.ngayNhan = order.thoiGianUpload;
            }
        } else {
            // Create new inventory record
            const inventoryRecord = {
                id: generateUniqueID(),
                ngayDatHang: order.ngayDatHang,
                ngayNhan: order.thoiGianUpload, // Use upload time as received date
                nhaCungCap: order.nhaCungCap,
                maSanPham: order.maSanPham || '',
                tenSanPham: order.tenSanPham || '',
                soLuong: order.soLuong || 0,
                thucNhan: null, // To be filled later
                tongNhan: null, // To be filled later
                originalOrderId: order.id,
                lastUpdated: getFormattedDateTime(),
                updatedBy: getUserName()
            };
            
            inventoryMap.set(productKey, inventoryRecord);
        }
    });
    
    return Array.from(inventoryMap.values());
}

// Load and process order data for inventory
async function loadInventoryData() {
    const cachedData = getCachedData();
    if (cachedData) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        renderInventoryTable(cachedData);
        updateFilterOptions(cachedData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu đặt hàng...", true);
    
    try {
        // Load order data from 'dathang' collection
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];
        
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        }
        
        // Transform order data to inventory format
        const inventoryData = transformOrderDataToInventory(orderData);
        
        // Try to load existing inventory data and merge
        const inventoryDoc = await inventoryCollectionRef.doc("inventory_data").get();
        let existingInventoryData = [];
        
        if (inventoryDoc.exists) {
            const inventoryInfo = inventoryDoc.data();
            if (inventoryInfo && Array.isArray(inventoryInfo.data)) {
                existingInventoryData = inventoryInfo.data;
            }
        }
        
        // Merge existing inventory data with new order data
        const mergedInventoryData = mergeInventoryData(inventoryData, existingInventoryData);
        
        // Sort by newest first
        const sortedData = mergedInventoryData.sort((a, b) => {
            const dateA = parseVietnameseDate(a.ngayNhan);
            const dateB = parseVietnameseDate(b.ngayNhan);
            
            if (dateA && dateB) {
                return dateB - dateA;
            }
            
            return 0;
        });
        
        renderInventoryTable(sortedData);
        updateFilterOptions(sortedData);
        setCachedData(sortedData);
        
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu hoàn tất!", false, 2000);
        
    } catch (error) {
        console.error("Error loading inventory data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi tải dữ liệu!", false, 3000);
    }
}

// Merge inventory data to avoid duplicates
function mergeInventoryData(newInventoryData, existingInventoryData) {
    const merged = new Map();
    
    // Add existing data first
    existingInventoryData.forEach(item => {
        const key = item.maSanPham || item.tenSanPham;
        if (key) {
            merged.set(key, { ...item });
        }
    });
    
    // Update with new data
    newInventoryData.forEach(item => {
        const key = item.maSanPham || item.tenSanPham;
        if (key) {
            if (merged.has(key)) {
                // Update existing record
                const existing = merged.get(key);
                existing.soLuong = item.soLuong; // Update quantity from orders
                existing.ngayDatHang = item.ngayDatHang;
                existing.ngayNhan = item.ngayNhan;
                existing.nhaCungCap = item.nhaCungCap;
                existing.lastUpdated = getFormattedDateTime();
            } else {
                // Add new record
                merged.set(key, { ...item });
            }
        }
    });
    
    return Array.from(merged.values());
}

// =====================================================
// FILTER SYSTEM
// =====================================================

function applyFiltersToInventory(dataArray) {
    const filterSupplier = filterSupplierSelect ? filterSupplierSelect.value : 'all';
    const filterDate = dateFilterSelect ? dateFilterSelect.value : 'all';
    const filterProductText = filterProductInput ? filterProductInput.value.toLowerCase().trim() : '';
    
    return dataArray.filter(item => {
        const matchSupplier = (filterSupplier === 'all' || item.nhaCungCap === filterSupplier);
        
        let matchDate = true;
        if (filterDate !== 'all') {
            const itemDate = parseVietnameseDate(item.ngayNhan) || parseDate(item.ngayDatHang);
            if (itemDate) {
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                if (filterDate === 'today') {
                    const itemDateStart = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                    matchDate = itemDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === 'week') {
                    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
                    matchDate = itemDate >= weekAgo;
                } else if (filterDate === 'month') {
                    const monthAgo = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, todayStart.getDate());
                    matchDate = itemDate >= monthAgo;
                }
            }
        }
        
        const matchProduct = !filterProductText ||
            (item.tenSanPham && item.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (item.maSanPham && item.maSanPham.toLowerCase().includes(filterProductText));
        
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
                renderInventoryTable(cachedData);
            } else {
                loadInventoryData();
            }
            hideFloatingAlert();
            showSuccess("Lọc dữ liệu hoàn tất!");
        } catch (error) {
            console.error('Error during filtering:', error);
            showError('Có lỗi xảy ra khi lọc dữ liệu');
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

function renderInventoryTable(inventoryData) {
    if (!tbody) {
        console.error("Table body not found");
        return;
    }
    
    const filteredData = applyFiltersToInventory(inventoryData);
    tbody.innerHTML = '';
    
    // Add summary row
    if (filteredData.length > 0) {
        const summaryRow = document.createElement('tr');
        summaryRow.style.backgroundColor = '#f8f9fa';
        summaryRow.style.fontWeight = 'bold';
        const summaryTd = document.createElement('td');
        summaryTd.colSpan = 8;
        summaryTd.textContent = `Tổng: ${filteredData.length} sản phẩm`;
        summaryTd.style.textAlign = 'center';
        summaryTd.style.color = '#007bff';
        summaryTd.style.padding = '8px';
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }
    
    // Render inventory rows
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);
    
    for (let i = 0; i < maxRender; i++) {
        const item = filteredData[i];
        const tr = document.createElement('tr');
        tr.className = 'inventory-row';
        tr.setAttribute('data-inventory-id', item.id || '');
        
        // Create cells
        const cells = [];
        for (let j = 0; j < 8; j++) {
            cells[j] = document.createElement('td');
        }
        
        // Ngày đặt hàng
        cells[0].textContent = item.ngayDatHang || "Chưa nhập";
        
        // Ngày nhận hàng (từ thời gian upload)
        const receivedDate = parseVietnameseDate(item.ngayNhan);
        if (receivedDate) {
            cells[1].textContent = formatDate(receivedDate);
        } else {
            cells[1].textContent = item.ngayNhan || "Chưa nhập";
        }
        
        // Nhà cung cấp
        cells[2].textContent = sanitizeInput(item.nhaCungCap || '');
        
        // Mã sản phẩm
        cells[3].textContent = sanitizeInput(item.maSanPham || '');
        
        // Số lượng (readonly)
        const quantityDiv = document.createElement('div');
        quantityDiv.textContent = item.soLuong || 0;
        quantityDiv.style.textAlign = 'center';
        quantityDiv.style.fontWeight = 'bold';
        cells[4].appendChild(quantityDiv);
        
        // Thực nhận (displayed as label, becomes input when editing)
        const receivedContainer = document.createElement('div');
        const receivedLabel = document.createElement('span');
        receivedLabel.className = 'received-label';
        if (item.thucNhan || item.thucNhan === 0) {
            receivedLabel.textContent = item.thucNhan;
        } else {
            receivedLabel.textContent = 'Chưa nhập';
            receivedLabel.classList.add('empty');
        }
        receivedLabel.setAttribute('data-field', 'thucNhan');
        receivedLabel.setAttribute('data-inventory-id', item.id || '');
        receivedContainer.appendChild(receivedLabel);
        cells[5].appendChild(receivedContainer);
        
        // Tổng nhận (displayed as label, becomes input when editing)
        const totalContainer = document.createElement('div');
        const totalLabel = document.createElement('span');
        totalLabel.className = 'total-label';
        if (item.tongNhan || item.tongNhan === 0) {
            totalLabel.textContent = item.tongNhan;
        } else {
            totalLabel.textContent = 'Chưa nhập';
            totalLabel.classList.add('empty');
        }
        totalLabel.setAttribute('data-field', 'tongNhan');
        totalLabel.setAttribute('data-inventory-id', item.id || '');
        totalContainer.appendChild(totalLabel);
        cells[6].appendChild(totalContainer);
        
        // Buttons (Edit and Delete)
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';
        
        const editButton = document.createElement('button');
        editButton.className = 'edit-button';
        editButton.setAttribute('data-inventory-id', item.id || '');
        editButton.setAttribute('data-inventory-info', `${sanitizeInput(item.tenSanPham || item.maSanPham || 'Unknown')}`);
        editButton.addEventListener('click', editInventoryItem);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.setAttribute('data-inventory-id', item.id || '');
        deleteButton.setAttribute('data-inventory-info', `${sanitizeInput(item.tenSanPham || item.maSanPham || 'Unknown')}`);
        deleteButton.addEventListener('click', deleteInventoryItem);
        
        buttonGroup.appendChild(editButton);
        buttonGroup.appendChild(deleteButton);
        cells[7].appendChild(buttonGroup);
        
        // Apply permissions - now for labels instead of inputs
        const auth = getAuthState();
        if (auth) {
            const editableElements = [receivedLabel, totalLabel];
            applyRowPermissions(tr, editableElements, [editButton, deleteButton], parseInt(auth.checkLogin));
        }
        
        // Append cells to row
        cells.forEach(cell => tr.appendChild(cell));
        tbody.appendChild(tr);
    }
    
    // Show warning if more data available
    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement('tr');
        warningRow.style.backgroundColor = '#fff3cd';
        warningRow.style.color = '#856404';
        const warningTd = document.createElement('td');
        warningTd.colSpan = 8;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} sản phẩm. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = 'center';
        warningTd.style.padding = '8px';
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }
    
    updateFilterOptions(inventoryData);
}

function applyRowPermissions(row, editableElements, buttons, userRole) {
    if (userRole !== 0) {
        // Disable editing for non-admin users
        editableElements.forEach(element => {
            element.style.opacity = '0.6';
            element.style.cursor = 'not-allowed';
        });
        buttons.forEach(button => button.style.display = 'none');
        row.style.opacity = '0.7';
    } else {
        // Enable editing for admin users
        editableElements.forEach(element => {
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
        });
        buttons.forEach(button => button.style.display = '');
        row.style.opacity = '1';
    }
}

function updateFilterOptions(fullDataArray) {
    if (!filterSupplierSelect) return;
    
    const suppliers = [...new Set(fullDataArray.map(item => item.nhaCungCap).filter(supplier => supplier))];
    const currentSelectedValue = filterSupplierSelect.value;
    
    while (filterSupplierSelect.children.length > 1) {
        filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
    }
    
    suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier;
        option.textContent = supplier;
        filterSupplierSelect.appendChild(option);
    });
    
    if (currentSelectedValue && currentSelectedValue !== 'all' && suppliers.includes(currentSelectedValue)) {
        filterSupplierSelect.value = currentSelectedValue;
    }
}

// =====================================================
// CRUD OPERATIONS
// =====================================================

// Edit inventory item
async function editInventoryItem(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không có quyền chỉnh sửa', false, 3000);
        return;
    }
    
    const button = event.currentTarget;
    const inventoryId = button.getAttribute('data-inventory-id');
    const itemInfo = button.getAttribute('data-inventory-info');
    
    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }
    
    const row = button.closest('tr');
    
    if (row.classList.contains('editing')) {
        // Save changes
        await saveInventoryChanges(row, inventoryId, itemInfo);
    } else {
        // Start editing
        startEditingInventory(row, button);
    }
}

function startEditingInventory(row, button) {
    // Mark row as editing
    row.classList.add('editing');
    
    // Change button text and style
    button.textContent = 'Lưu';
    button.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
    
    // Convert labels to inputs
    const receivedLabel = row.querySelector('.received-label');
    const totalLabel = row.querySelector('.total-label');
    
    if (receivedLabel) {
        const currentValue = receivedLabel.classList.contains('empty') ? '' : receivedLabel.textContent;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'received-input';
        input.value = currentValue === 'Chưa nhập' ? '' : currentValue;
        input.min = '0';
        input.step = 'any';
        input.placeholder = '0';
        input.setAttribute('data-field', 'thucNhan');
        input.setAttribute('data-inventory-id', receivedLabel.getAttribute('data-inventory-id'));
        input.addEventListener('wheel', function(e) { e.preventDefault(); });
        
        // Replace label with input
        receivedLabel.parentNode.replaceChild(input, receivedLabel);
        
        // Focus and select
        input.focus();
        input.select();
    }
    
    if (totalLabel) {
        const currentValue = totalLabel.classList.contains('empty') ? '' : totalLabel.textContent;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'total-input';
        input.value = currentValue === 'Chưa nhập' ? '' : currentValue;
        input.min = '0';
        input.step = 'any';
        input.placeholder = '0';
        input.setAttribute('data-field', 'tongNhan');
        input.setAttribute('data-inventory-id', totalLabel.getAttribute('data-inventory-id'));
        input.addEventListener('wheel', function(e) { e.preventDefault(); });
        
        // Replace label with input
        totalLabel.parentNode.replaceChild(input, totalLabel);
    }
}

async function saveInventoryChanges(row, inventoryId, itemInfo) {
    try {
        showFloatingAlert("Đang lưu thay đổi...", true);
        
        // Get current values from inputs
        const receivedInput = row.querySelector('.received-input');
        const totalInput = row.querySelector('.total-input');
        
        const receivedValue = receivedInput ? (parseFloat(receivedInput.value) || 0) : 0;
        const totalValue = totalInput ? (parseFloat(totalInput.value) || 0) : 0;
        
        const updateData = {
            thucNhan: receivedValue,
            tongNhan: totalValue,
            lastUpdated: getFormattedDateTime(),
            updatedBy: getUserName()
        };
        
        // Update in Firebase
        await updateInventoryInFirestore(inventoryId, updateData);
        
        // Update cached data
        const cachedData = getCachedData();
        if (cachedData) {
            const index = cachedData.findIndex(item => item.id === inventoryId);
            if (index !== -1) {
                Object.assign(cachedData[index], updateData);
                setCachedData(cachedData);
            }
        }
        
        // Log action
        logAction('edit', `Chỉnh sửa thông tin kiểm hàng "${itemInfo}" - Thực nhận: ${receivedValue}, Tổng nhận: ${totalValue} - ID: ${inventoryId}`, null, updateData);
        
        // Convert inputs back to labels
        if (receivedInput) {
            const label = document.createElement('span');
            label.className = 'received-label';
            if (receivedValue || receivedValue === 0) {
                label.textContent = receivedValue;
            } else {
                label.textContent = 'Chưa nhập';
                label.classList.add('empty');
            }
            label.setAttribute('data-field', 'thucNhan');
            label.setAttribute('data-inventory-id', inventoryId);
            receivedInput.parentNode.replaceChild(label, receivedInput);
        }
        
        if (totalInput) {
            const label = document.createElement('span');
            label.className = 'total-label';
            if (totalValue || totalValue === 0) {
                label.textContent = totalValue;
            } else {
                label.textContent = 'Chưa nhập';
                label.classList.add('empty');
            }
            label.setAttribute('data-field', 'tongNhan');
            label.setAttribute('data-inventory-id', inventoryId);
            totalInput.parentNode.replaceChild(label, totalInput);
        }
        
        // Reset row state
        row.classList.remove('editing');
        
        // Reset button
        const editButton = row.querySelector('.edit-button');
        
        showFloatingAlert("Lưu thay đổi thành công!", false, 2000);
        
    } catch (error) {
        console.error("Lỗi khi lưu thay đổi:", error);
        showFloatingAlert("Lỗi khi lưu thay đổi: " + error.message, false, 3000);
        
        // If error, revert inputs back to labels with old values
        const cachedData = getCachedData();
        if (cachedData) {
            const item = cachedData.find(item => item.id === inventoryId);
            if (item) {
                const receivedInput = row.querySelector('.received-input');
                const totalInput = row.querySelector('.total-input');
                
                if (receivedInput) {
                    const label = document.createElement('span');
                    label.className = 'received-label';
                    if (item.thucNhan || item.thucNhan === 0) {
                        label.textContent = item.thucNhan;
                    } else {
                        label.textContent = 'Chưa nhập';
                        label.classList.add('empty');
                    }
                    label.setAttribute('data-field', 'thucNhan');
                    label.setAttribute('data-inventory-id', inventoryId);
                    receivedInput.parentNode.replaceChild(label, receivedInput);
                }
                
                if (totalInput) {
                    const label = document.createElement('span');
                    label.className = 'total-label';
                    if (item.tongNhan || item.tongNhan === 0) {
                        label.textContent = item.tongNhan;
                    } else {
                        label.textContent = 'Chưa nhập';
                        label.classList.add('empty');
                    }
                    label.setAttribute('data-field', 'tongNhan');
                    label.setAttribute('data-inventory-id', inventoryId);
                    totalInput.parentNode.replaceChild(label, totalInput);
                }
                
                // Reset row and button
                row.classList.remove('editing');
                const editButton = row.querySelector('.edit-button');
            }
        }
    }
}

// Delete inventory item
async function deleteInventoryItem(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không đủ quyền thực hiện chức năng này.', false, 3000);
        return;
    }
    
    const button = event.currentTarget;
    const inventoryId = button.getAttribute('data-inventory-id');
    const itemInfo = button.getAttribute('data-inventory-info');
    
    if (!inventoryId) {
        showFloatingAlert("Không tìm thấy ID sản phẩm!", false, 3000);
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${itemInfo}" khỏi danh sách kiểm hàng?\nID: ${inventoryId}`);
    if (!confirmDelete) return;

    const row = button.closest("tr");
    
    showFloatingAlert("Đang xóa...", true);

    try {
        // Remove from cached data first
        const cachedData = getCachedData();
        let oldItemData = null;
        
        if (cachedData) {
            const index = cachedData.findIndex(item => item.id === inventoryId);
            if (index !== -1) {
                oldItemData = { ...cachedData[index] };
                cachedData.splice(index, 1);
                setCachedData(cachedData);
            }
        }
        
        // Remove from Firebase
        await deleteInventoryFromFirestore(inventoryId);

        // Log action
        logAction('delete', `Xóa sản phẩm kiểm hàng "${itemInfo}" - ID: ${inventoryId}`, oldItemData, null);
        
        hideFloatingAlert();
        showFloatingAlert("Đã xóa thành công!", false, 2000);

        // Remove row from table
        if (row) row.remove();

    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xóa:", error);
        showFloatingAlert("Lỗi khi xóa: " + error.message, false, 3000);
        
        // Restore cached data on error
        if (cachedData && oldItemData) {
            cachedData.push(oldItemData);
            setCachedData(cachedData);
        }
    }
}

// =====================================================
// FIREBASE OPERATIONS
// =====================================================

async function updateInventoryInFirestore(inventoryId, updateData) {
    try {
        const doc = await inventoryCollectionRef.doc("inventory_data").get();
        let inventoryData = [];
        
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                inventoryData = data.data;
            }
        }
        
        const index = inventoryData.findIndex(item => item.id === inventoryId);
        
        if (index !== -1) {
            // Update existing item
            Object.assign(inventoryData[index], updateData);
        } else {
            // This shouldn't happen, but handle gracefully
            throw new Error("Không tìm thấy sản phẩm để cập nhật");
        }
        
        await inventoryCollectionRef.doc("inventory_data").update({ data: inventoryData });
        
    } catch (error) {
        console.error("Error updating inventory in Firestore:", error);
        throw error;
    }
}

async function deleteInventoryFromFirestore(inventoryId) {
    try {
        const doc = await inventoryCollectionRef.doc("inventory_data").get();
        let inventoryData = [];
        
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                inventoryData = data.data;
            }
        }
        
        const index = inventoryData.findIndex(item => item.id === inventoryId);
        
        if (index !== -1) {
            inventoryData.splice(index, 1);
            await inventoryCollectionRef.doc("inventory_data").update({ data: inventoryData });
        } else {
            throw new Error("Không tìm thấy sản phẩm để xóa");
        }
        
    } catch (error) {
        console.error("Error deleting inventory from Firestore:", error);
        throw error;
    }
}

async function saveInventoryDataToFirestore(inventoryData) {
    try {
        await inventoryCollectionRef.doc("inventory_data").set({
            data: inventoryData,
            lastUpdated: new Date(),
            updatedBy: getUserName()
        });
        console.log("Inventory data saved to Firestore successfully");
    } catch (error) {
        console.error("Error saving inventory data:", error);
        throw error;
    }
}

// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showError('Không có dữ liệu để xuất');
        return;
    }
    
    showLoading('Đang tạo file Excel...');
    try {
        const filteredData = applyFiltersToInventory(cachedData);
        const excelData = filteredData.map((item, index) => ({
            'STT': index + 1,
            'Ngày đặt hàng': item.ngayDatHang || '',
            'Ngày nhận hàng': (() => {
                const date = parseVietnameseDate(item.ngayNhan);
                return date ? formatDate(date) : item.ngayNhan || '';
            })(),
            'Nhà cung cấp': item.nhaCungCap || '',
            'Mã sản phẩm': item.maSanPham || '',
            'Tên sản phẩm': item.tenSanPham || '',
            'Số lượng đặt': item.soLuong || 0,
            'Thực nhận': item.thucNhan || '',
            'Tổng nhận': item.tongNhan || '',
            'Cập nhật lần cuối': item.lastUpdated || '',
            'Người cập nhật': item.updatedBy || '',
            'ID': item.id || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kiểm Hàng');
        const fileName = `KiemHang_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        hideFloatingAlert();
        showSuccess('Xuất Excel thành công!');
    } catch (error) {
        console.error('Lỗi khi xuất Excel:', error);
        showError('Lỗi khi xuất Excel!');
    }
}

// =====================================================
// FILTER EVENT HANDLERS
// =====================================================

function initializeFilterEvents() {
    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener('change', applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener('change', applyFilters);
    }
    if (filterProductInput) {
        filterProductInput.addEventListener('input', debounce(applyFilters, 300));
    }
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeInventorySystem() {
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
        window.location.href = '../index.html';
        return;
    }

    if (auth.userType) {
        const titleElement = document.querySelector('.tieude');
        if (titleElement) {
            titleElement.textContent += ' - ' + auth.displayName;
        }
    }

    const parentContainer = document.getElementById('parentContainer');
    if (parentContainer) {
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
    }

    initializeFilterEvents();
    await loadInventoryData();
    
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    // Add toggle form functionality (hide it for inventory)
    const toggleFormButton = document.getElementById('toggleFormButton');
    if (toggleFormButton) {
        toggleFormButton.textContent = 'Làm mới dữ liệu';
        toggleFormButton.addEventListener('click', function() {
            invalidateCache();
            loadInventoryData();
        });
    }

    console.log('Inventory Management System initialized successfully');
}

function handleLogout() {
    const confirmLogout = confirm('Bạn có chắc muốn đăng xuất?');
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = '../index.html';
    }
}

// Global error handlers
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showError('Có lỗi xảy ra. Vui lòng tải lại trang.');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showError('Có lỗi xảy ra trong xử lý dữ liệu.');
});

// Debug functions
window.debugInventoryFunctions = {
    loadInventoryData,
    transformOrderDataToInventory,
    mergeInventoryData,
    exportToExcel,
    invalidateCache,
    getAuthState,
    hasPermission
};

// DOM initialization
document.addEventListener('DOMContentLoaded', function() {
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }
    initializeInventorySystem();
});

console.log("Inventory Management System loaded successfully");
console.log("Debug functions available at window.debugInventoryFunctions");
console.log("Available functions:", Object.keys(window.debugInventoryFunctions).join(', '));
