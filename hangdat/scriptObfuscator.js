// Enhanced Order Management System - Part 2A
// CRUD Operations and Migration Functions

// =====================================================
// CRUD OPERATIONS
// =====================================================

// DELETE ORDER BY ID
async function deleteOrderByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không đủ quyền thực hiện chức năng này.', false, 3000);
        return;
    }
    
    const button = event.currentTarget;
    const orderId = button.getAttribute("data-order-id");
    const orderInfo = button.getAttribute("data-order-info");
    
    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa đơn hàng "${orderInfo}"?\nID: ${orderId}`);
    if (!confirmDelete) return;

    const row = button.closest("tr");
    
    // Get old data for logging
    const oldOrderData = {
        id: orderId,
        info: orderInfo,
        ngayDatHang: row.cells[0].textContent,
        nhaCungCap: row.cells[1].textContent,
        hoaDon: row.cells[2].textContent,
        tenSanPham: row.cells[4].textContent
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
        const index = data.data.findIndex(item => item.id === orderId);

        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        // Remove item by index
        data.data.splice(index, 1);

        await collectionRef.doc("dathang").update({ data: data.data });

        // Log action
        logAction('delete', `Xóa đơn hàng "${orderInfo}" - ID: ${orderId}`, oldOrderData, null);
        
        // Invalidate cache
        invalidateCache();
        
        hideFloatingAlert();
        showFloatingAlert("Đã xóa thành công!", false, 2000);

        // Remove row
        if (row) row.remove();

        // Update row numbers if needed
        const rows = tbody.querySelectorAll("tr");
        rows.forEach((r, idx) => {
            if (r.cells[0] && !r.cells[0].getAttribute('colspan')) {
                // Skip summary row
                if (!r.cells[0].textContent.includes('Tổng:')) {
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
    if (!auth || auth.checkLogin == '777') {
        showFloatingAlert('Không đủ quyền thực hiện chức năng này.', false, 3000);
        event.target.value = event.target.defaultValue;
        return;
    }
    
    const input = event.target;
    const orderId = input.getAttribute("data-order-id");
    const newValue = input.type === 'number' ? parseFloat(input.value) : input.value;
    const oldValue = input.type === 'number' ? parseFloat(input.defaultValue) : input.defaultValue;
    const fieldName = input.className.includes('quantity') ? 'soLuong' : 'giaNhap';
    
    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        input.value = oldValue;
        return;
    }

    const row = input.closest("tr");
    const orderInfo = `${row.cells[4].textContent} - ${row.cells[2].textContent}`;

    // Confirm change
    if (newValue !== oldValue) {
        const fieldDisplayName = fieldName === 'soLuong' ? 'số lượng' : 'giá nhập';
        const valueDisplay = fieldName === 'giaNhap' ? formatCurrency(newValue) : newValue;
        const oldValueDisplay = fieldName === 'giaNhap' ? formatCurrency(oldValue) : oldValue;
        
        const confirmMessage = `Bạn có chắc chắn muốn thay đổi ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay}?\nID: ${orderId}`;
        
        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldValue;
            return;
        }
    }

    if (fieldName === 'soLuong' && newValue < 1) {
        showFloatingAlert('Số lượng phải lớn hơn 0', false, 3000);
        input.value = oldValue;
        return;
    }

    if (fieldName === 'giaNhap' && newValue < 0) {
        showFloatingAlert('Giá nhập phải lớn hơn hoặc bằng 0', false, 3000);
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
        const index = data.data.findIndex(item => item.id === orderId);
        
        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        data.data[index][fieldName] = newValue;
        
        await collectionRef.doc("dathang").update({ data: data.data });

        const fieldDisplayName = fieldName === 'soLuong' ? 'số lượng' : 'giá nhập';
        const valueDisplay = fieldName === 'giaNhap' ? formatCurrency(newValue) : newValue;
        const oldValueDisplay = fieldName === 'giaNhap' ? formatCurrency(oldValue) : oldValue;

        // Log action
        logAction('update', `Cập nhật ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay} - ID: ${orderId}`, oldData, newData);
        
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
                data: firebase.firestore.FieldValue.arrayUnion(orderData)
            });
        } else {
            await collectionRef.doc("dathang").set({
                data: firebase.firestore.FieldValue.arrayUnion(orderData)
            });
        }

        // Log action with ID
        logAction('add', `Thêm đơn hàng mới "${orderData.tenSanPham}" - Hóa đơn: ${orderData.hoaDon} - ID: ${orderData.id}`, null, orderData);
        
        // Invalidate cache
        invalidateCache();
        
        console.log("Document với ID tải lên thành công:", orderData.id);
        showSuccess("Thành công!");
        
        // Reload table to show new item
        await displayOrderData();
        
        document.getElementById("addButton").disabled = false;
        clearOrderForm();
        
    } catch (error) {
        showError("Lỗi khi tải lên...");
        console.error("Lỗi khi tải document lên: ", error);
        document.getElementById("addButton").disabled = false;
    }
}

// ADD ORDER
async function addOrder(event) {
    event.preventDefault();
    
    const auth = getAuthState();
    if (!auth || auth.checkLogin == '777') {
        showError('Không có quyền thêm đơn hàng');
        return;
    }
    
    document.getElementById("addButton").disabled = true;
    
    // Get form values
    const ngayDatHang = ngayDatHangInput.value;
    const nhaCungCap = sanitizeInput(nhaCungCapInput.value.trim());
    const hoaDon = sanitizeInput(hoaDonInput.value.trim());
    const tenSanPham = sanitizeInput(tenSanPhamInput.value.trim());
    const maSanPham = sanitizeInput(maSanPhamInput.value.trim());
    const bienThe = sanitizeInput(bienTheInput.value.trim());
    const soLuong = parseInt(soLuongInput.value);
    const giaNhap = parseInt(giaNhapInput.value);
    const ghiChu = sanitizeInput(ghiChuInput.value.trim());

    // Validation
    if (!ngayDatHang) {
        showError('Vui lòng chọn ngày đặt hàng');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (!nhaCungCap) {
        showError('Vui lòng nhập tên nhà cung cấp');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (!hoaDon) {
        showError('Vui lòng nhập số hóa đơn');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (!tenSanPham) {
        showError('Vui lòng nhập tên sản phẩm');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (isNaN(soLuong) || soLuong < 1) {
        showError('Số lượng phải lớn hơn hoặc bằng 1');
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (isNaN(giaNhap) || giaNhap < 0) {
        showError('Giá nhập phải lớn hơn hoặc bằng 0');
        document.getElementById("addButton").disabled = false;
        return;
    }

    const thoiGianUpload = getFormattedDateTime();
    const orderId = generateUniqueID();

    // Order data with ID
    const newOrderData = {
        id: orderId,
        ngayDatHang: ngayDatHang,
        thoiGianUpload: thoiGianUpload,
        nhaCungCap: nhaCungCap,
        hoaDon: hoaDon,
        tenSanPham: tenSanPham,
        maSanPham: maSanPham,
        bienThe: bienThe,
        soLuong: soLuong,
        giaNhap: giaNhap,
        ghiChu: ghiChu,
        user: getUserName()
    };

    try {
        showLoading("Đang xử lý đơn hàng...");

        // Handle invoice images (optional)
        const invoiceImageUrl = await handleInvoiceImageUpload(newOrderData);
        if (invoiceImageUrl) {
            newOrderData.anhHoaDon = invoiceImageUrl;
        }

        // Handle product images (optional)
        const productImageUrl = await handleProductImageUpload(newOrderData);
        if (productImageUrl) {
            newOrderData.anhSanPham = productImageUrl;
        }
        
        // Handle price images (optional)
        const priceImageUrl = await handlePriceImageUpload(newOrderData);
        if (priceImageUrl) {
            newOrderData.anhGiaNhap = priceImageUrl;
        }

        // Upload to Firestore
        await uploadToFirestore(newOrderData);

    } catch (error) {
        console.error("Lỗi trong quá trình thêm đơn hàng:", error);
        showError("Lỗi khi thêm đơn hàng: " + error.message);
        document.getElementById("addButton").disabled = false;
    }
}

// Clear order form
function clearOrderForm() {
    invoiceImgArray = [];
    productImgArray = [];
    priceImgArray = [];
    invoiceImageUrls = [];
    productImageUrls = [];
    priceImageUrls = [];
    window.pastedInvoiceImageUrl = null;
    window.pastedProductImageUrl = null;
    window.pastedPriceImageUrl = null;
    window.isInvoiceUrlPasted = false;
    window.isProductUrlPasted = false;
    window.isPriceUrlPasted = false;

    // Clear all form inputs
    if (orderForm) orderForm.reset();
    
    // Set today's date again
    setTodayDate();

    // Clear image containers
    if (invoiceClipboardContainer) {
        invoiceClipboardContainer.innerHTML = '<p>Dán ảnh hóa đơn ở đây...</p>';
        invoiceClipboardContainer.classList.remove('has-content');
    }
    
    if (productClipboardContainer) {
        productClipboardContainer.innerHTML = '<p>Dán ảnh sản phẩm ở đây...</p>';
        productClipboardContainer.classList.remove('has-content');
    }
    
    if (priceClipboardContainer) {
        priceClipboardContainer.innerHTML = '<p>Dán ảnh giá nhập ở đây...</p>';
        priceClipboardContainer.classList.remove('has-content');
    }

    // Clear file inputs
    if (invoiceFileInput) invoiceFileInput.value = '';
    if (productFileInput) productFileInput.value = '';
    if (priceFileInput) priceFileInput.value = '';
    if (invoiceLinkInput) invoiceLinkInput.value = '';
    if (productLinkInput) productLinkInput.value = '';
    if (priceLinkInput) priceLinkInput.value = '';

    // Reset radio buttons to clipboard
    const invoiceClipboardRadio = document.querySelector('input[name="invoiceInputType"][value="clipboard"]');
    const productClipboardRadio = document.querySelector('input[name="productInputType"][value="clipboard"]');
    const priceClipboardRadio = document.querySelector('input[name="priceInputType"][value="clipboard"]');
    if (invoiceClipboardRadio) invoiceClipboardRadio.checked = true;
    if (productClipboardRadio) productClipboardRadio.checked = true;
    if (priceClipboardRadio) priceClipboardRadio.checked = true;

    // Trigger change events to show/hide appropriate containers
    if (invoiceClipboardRadio) invoiceClipboardRadio.dispatchEvent(new Event('change'));
    if (productClipboardRadio) productClipboardRadio.dispatchEvent(new Event('change'));
    if (priceClipboardRadio) priceClipboardRadio.dispatchEvent(new Event('change'));
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
        const migratedData = data.data.map(item => {
            // Only add ID if not present
            if (!item.id) {
                hasChanges = true;
                return {
                    ...item,
                    id: generateUniqueID()
                };
            }
            return item;
        });
        
        if (hasChanges) {
            // Sort data after migration (newest first)
            const sortedMigratedData = sortDataByNewest(migratedData);
            
            // Update data with new IDs and sorted
            await collectionRef.doc("dathang").update({
                data: sortedMigratedData
            });
            
            // Log migration
            logAction('migration', `Migration hoàn tất: Thêm ID cho ${migratedData.filter(item => item.id).length} đơn hàng và sắp xếp theo thời gian`, null, null);
            
            console.log(`Migration hoàn tất: Đã thêm ID cho ${migratedData.length} đơn hàng và sắp xếp theo thời gian`);
            showFloatingAlert("Migration hoàn tất!", false, 3000);
        } else {
            // If no ID changes, just sort again
            const sortedData = sortDataByNewest(data.data);
            
            // Check if order changed
            const orderChanged = JSON.stringify(data.data) !== JSON.stringify(sortedData);
            
            if (orderChanged) {
                await collectionRef.doc("dathang").update({
                    data: sortedData
                });
                
                logAction('sort', 'Sắp xếp lại dữ liệu theo thời gian mới nhất', null, null);
                console.log("Đã sắp xếp lại dữ liệu theo thời gian");
                showFloatingAlert("Đã sắp xếp dữ liệu theo thời gian mới nhất!", false, 2000);
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

// =====================================================
// IMAGE HANDLING FUNCTIONS - EXTENDED
// =====================================================

function preloadImagesAndCache(dataArray) {
    const imageUrls = [];
    
    // Collect all image URLs
    dataArray.forEach(order => {
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
    const imagePromises = imageUrls.map(url => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(url); // Still resolve even if error
            img.src = url;
        });
    });
    
    // Cache data only after all images are loaded/attempted
    Promise.all(imagePromises).then(() => {
        console.log('All images pre-loaded, sorting and caching data');
        setCachedData(dataArray);
    }).catch(error => {
        console.warn('Error pre-loading images:', error);
        // Cache anyway after timeout
        setTimeout(() => {
            setCachedData(dataArray);
        }, 5000);
    });
}

console.log("Order Management System Part 2A loaded - CRUD & Migration functions");

// Enhanced Order Management System - Part 2B (Complete)
// UI Functions, Filters, Table Rendering & Initialization

// =====================================================
// IMAGE HANDLING FUNCTIONS - EXTENDED (CONTINUED)
// =====================================================

// Image upload handling for invoice images
function initializeInvoiceImageHandling() {
    const invoiceRadios = document.querySelectorAll('input[name="invoiceInputType"]');
    invoiceRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'clipboard') {
                invoiceClipboardContainer.style.display = 'flex';
                invoiceFileInput.style.display = 'none';
                invoiceLinkInput.style.display = 'none';
            } else if (this.value === 'file') {
                invoiceClipboardContainer.style.display = 'none';
                invoiceFileInput.style.display = 'block';
                invoiceLinkInput.style.display = 'none';
            } else if (this.value === 'link') {
                invoiceClipboardContainer.style.display = 'none';
                invoiceFileInput.style.display = 'none';
                invoiceLinkInput.style.display = 'block';
            }
        });
    });

    invoiceClipboardContainer.addEventListener('paste', async function(e) {
        invoiceImgArray = [];
        window.pastedInvoiceImageUrl = null;
        window.isInvoiceUrlPasted = false;
        e.preventDefault();
        
        const text = e.clipboardData.getData('text');
        if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
            try {
                invoiceClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Invoice URL loaded");
                imgElement.onerror = () => console.error("Invoice URL load failed");
                invoiceClipboardContainer.appendChild(imgElement);
                invoiceClipboardContainer.classList.add('has-content');
                window.pastedInvoiceImageUrl = text;
                window.isInvoiceUrlPasted = true;
                return;
            } catch (error) {
                console.error('Error handling invoice image URL:', error);
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
                invoiceClipboardContainer.classList.add('has-content');

                const compressImage = async (file) => {
                    return new Promise((resolve) => {
                        const maxWidth = 500;
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = function(event) {
                            const img = new Image();
                            img.src = event.target.result;
                            img.onload = function() {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
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
                                canvas.toBlob(function(blob) {
                                    resolve(new File([blob], file.name, {type: file.type, lastModified: Date.now()}));
                                }, file.type, 0.8);
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
    const productRadios = document.querySelectorAll('input[name="productInputType"]');
    productRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'clipboard') {
                productClipboardContainer.style.display = 'flex';
                productFileInput.style.display = 'none';
                productLinkInput.style.display = 'none';
            } else if (this.value === 'file') {
                productClipboardContainer.style.display = 'none';
                productFileInput.style.display = 'block';
                productLinkInput.style.display = 'none';
            } else if (this.value === 'link') {
                productClipboardContainer.style.display = 'none';
                productFileInput.style.display = 'none';
                productLinkInput.style.display = 'block';
            }
        });
    });

    productClipboardContainer.addEventListener('paste', async function(e) {
        productImgArray = [];
        window.pastedProductImageUrl = null;
        window.isProductUrlPasted = false;
        e.preventDefault();
        
        const text = e.clipboardData.getData('text');
        if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
            try {
                productClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Product URL loaded");
                imgElement.onerror = () => console.error("Product URL load failed");
                productClipboardContainer.appendChild(imgElement);
                productClipboardContainer.classList.add('has-content');
                window.pastedProductImageUrl = text;
                window.isProductUrlPasted = true;
                return;
            } catch (error) {
                console.error('Error handling product image URL:', error);
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
                productClipboardContainer.classList.add('has-content');

                const compressImage = async (file) => {
                    return new Promise((resolve) => {
                        const maxWidth = 500;
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = function(event) {
                            const img = new Image();
                            img.src = event.target.result;
                            img.onload = function() {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
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
                                canvas.toBlob(function(blob) {
                                    resolve(new File([blob], file.name, {type: file.type, lastModified: Date.now()}));
                                }, file.type, 0.8);
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
    const priceRadios = document.querySelectorAll('input[name="priceInputType"]');
    priceRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'clipboard') {
                priceClipboardContainer.style.display = 'flex';
                priceFileInput.style.display = 'none';
                priceLinkInput.style.display = 'none';
            } else if (this.value === 'file') {
                priceClipboardContainer.style.display = 'none';
                priceFileInput.style.display = 'block';
                priceLinkInput.style.display = 'none';
            } else if (this.value === 'link') {
                priceClipboardContainer.style.display = 'none';
                priceFileInput.style.display = 'none';
                priceLinkInput.style.display = 'block';
            }
        });
    });

    priceClipboardContainer.addEventListener('paste', async function(e) {
        priceImgArray = [];
        window.pastedPriceImageUrl = null;
        window.isPriceUrlPasted = false;
        e.preventDefault();
        
        const text = e.clipboardData.getData('text');
        if (text && (text.startsWith('http') || text.includes('firebasestorage.googleapis.com'))) {
            try {
                priceClipboardContainer.innerHTML = "";
                const imgElement = document.createElement("img");
                imgElement.src = text;
                imgElement.onload = () => console.log("Price URL loaded");
                imgElement.onerror = () => console.error("Price URL load failed");
                priceClipboardContainer.appendChild(imgElement);
                priceClipboardContainer.classList.add('has-content');
                window.pastedPriceImageUrl = text;
                window.isPriceUrlPasted = true;
                return;
            } catch (error) {
                console.error('Error handling price image URL:', error);
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
                priceClipboardContainer.classList.add('has-content');

                const compressImage = async (file) => {
                    return new Promise((resolve) => {
                        const maxWidth = 500;
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = function(event) {
                            const img = new Image();
                            img.src = event.target.result;
                            img.onload = function() {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
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
                                canvas.toBlob(function(blob) {
                                    resolve(new File([blob], file.name, {type: file.type, lastModified: Date.now()}));
                                }, file.type, 0.8);
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
    
    return dataArray.filter(order => {
        const matchSupplier = (filterSupplier === 'all' || order.nhaCungCap === filterSupplier);
        
        let matchDate = true;
        if (filterDate !== 'all') {
            const orderDate = parseDate(order.ngayDatHang);
            if (orderDate) {
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                if (filterDate === 'today') {
                    const orderDateStart = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
                    matchDate = orderDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === 'week') {
                    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
                    matchDate = orderDate >= weekAgo;
                } else if (filterDate === 'month') {
                    const monthAgo = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, todayStart.getDate());
                    matchDate = orderDate >= monthAgo;
                }
            }
        }
        
        const matchProduct = !filterProductText || 
            (order.tenSanPham && order.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (order.maSanPham && order.maSanPham.toLowerCase().includes(filterProductText)) ||
            (order.bienThe && order.bienThe.toLowerCase().includes(filterProductText));
        
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

function renderDataToTable(dataArray) {
    const filteredData = applyFiltersToData(dataArray);
    tbody.innerHTML = '';
    
    if (filteredData.length > 0) {
        var summaryRow = document.createElement('tr');
        summaryRow.style.backgroundColor = '#f8f9fa';
        summaryRow.style.fontWeight = 'bold';
        var summaryTd = document.createElement('td');
        summaryTd.colSpan = 13;
        summaryTd.textContent = `Tổng: ${filteredData.length} đơn hàng`;
        summaryTd.style.textAlign = 'center';
        summaryTd.style.color = '#007bff';
        summaryTd.style.padding = '8px';
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }
    
    let totalImages = 0;
    let loadedImages = 0;
    
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const actualSrc = img.dataset.src;
                if (actualSrc) {
                    img.onload = () => {
                        loadedImages++;
                        if (loadedImages === totalImages) setCachedData(dataArray);
                    };
                    img.onerror = () => {
                        loadedImages++;
                        if (loadedImages === totalImages) setCachedData(dataArray);
                    };
                    img.src = actualSrc;
                    img.removeAttribute('data-src');
                }
                imageObserver.unobserve(img);
            }
        });
    }, { rootMargin: '50px' });
    
    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);
    
    for (let i = 0; i < maxRender; i++) {
        const order = filteredData[i];
        var tr = document.createElement('tr');
        tr.setAttribute('data-order-id', order.id || '');
        
        var cells = [];
        for (let j = 0; j < 13; j++) {
            cells[j] = document.createElement('td');
        }
        
        cells[0].textContent = order.ngayDatHang || "Chưa nhập";
        cells[1].textContent = sanitizeInput(order.nhaCungCap || '');
        cells[2].textContent = sanitizeInput(order.hoaDon || '');
        
        if (order.anhHoaDon) {
            const invoiceImgs = Array.isArray(order.anhHoaDon) ? order.anhHoaDon : [order.anhHoaDon];
            const invoiceContainer = document.createElement('div');
            invoiceContainer.className = 'product-row';
            invoiceImgs.forEach(imgUrl => {
                const img = document.createElement('img');
                img.dataset.src = imgUrl;
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K';
                img.alt = 'Đang tải...';
                img.className = 'product-image';
                totalImages++;
                imageObserver.observe(img);
                invoiceContainer.appendChild(img);
            });
            cells[3].appendChild(invoiceContainer);
        }
        
        cells[4].textContent = sanitizeInput(order.tenSanPham || '');
        cells[5].textContent = sanitizeInput(order.maSanPham || '');
        cells[6].textContent = sanitizeInput(order.bienThe || '');
        
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.value = order.soLuong || 0;
        quantityInput.min = '0';
        quantityInput.className = 'quantity-input';
        quantityInput.setAttribute('data-order-id', order.id || '');
        quantityInput.defaultValue = order.soLuong || 0;
        quantityInput.addEventListener('change', updateOrderByID);
        quantityInput.addEventListener('wheel', function(e) { e.preventDefault(); });
        cells[7].appendChild(quantityInput);
        
        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.value = order.giaNhap || 0;
        priceInput.min = '0';
        priceInput.step = 'any';
        priceInput.className = 'price-input';
        priceInput.setAttribute('data-order-id', order.id || '');
        priceInput.defaultValue = order.giaNhap || 0;
        priceInput.addEventListener('change', updateOrderByID);
        priceInput.addEventListener('wheel', function(e) { e.preventDefault(); });
        cells[8].appendChild(priceInput);
        
        if (order.anhSanPham) {
            const productImgs = Array.isArray(order.anhSanPham) ? order.anhSanPham : [order.anhSanPham];
            const productContainer = document.createElement('div');
            productContainer.className = 'product-row';
            productImgs.forEach(imgUrl => {
                const img = document.createElement('img');
                img.dataset.src = imgUrl;
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K';
                img.alt = 'Đang tải...';
                img.className = 'product-image';
                totalImages++;
                imageObserver.observe(img);
                productContainer.appendChild(img);
            });
            cells[9].appendChild(productContainer);
        }
        
        if (order.anhGiaNhap) {
            const priceImgs = Array.isArray(order.anhGiaNhap) ? order.anhGiaNhap : [order.anhGiaNhap];
            const priceContainer = document.createElement('div');
            priceContainer.className = 'product-row';
            priceImgs.forEach(imgUrl => {
                const img = document.createElement('img');
                img.dataset.src = imgUrl;
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K';
                img.alt = 'Đang tải...';
                img.className = 'product-image';
                totalImages++;
                imageObserver.observe(img);
                priceContainer.appendChild(img);
            });
            cells[10].appendChild(priceContainer);
        }
        
        cells[11].textContent = sanitizeInput(order.ghiChu || '');
        cells[11].style.maxWidth = '150px';
        cells[11].style.overflow = 'hidden';
        cells[11].style.textOverflow = 'ellipsis';
        cells[11].style.whiteSpace = 'nowrap';
        if (order.ghiChu) cells[11].title = order.ghiChu;
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.setAttribute("data-order-id", order.id || '');
        deleteButton.setAttribute("data-order-info", `${sanitizeInput(order.tenSanPham || '')} - ${order.hoaDon || ''}`);
        deleteButton.textContent = 'Xóa';
        deleteButton.addEventListener('click', deleteOrderByID);
        cells[12].appendChild(deleteButton);

        const auth = getAuthState();
        if (auth) {
            applyRowPermissions(tr, [quantityInput, priceInput], deleteButton, parseInt(auth.checkLogin));
        }

        cells.forEach(cell => tr.appendChild(cell));
        tbody.appendChild(tr);
    }
    
    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement('tr');
        warningRow.style.backgroundColor = '#fff3cd';
        warningRow.style.color = '#856404';
        const warningTd = document.createElement('td');
        warningTd.colSpan = 13;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} đơn hàng. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = 'center';
        warningTd.style.padding = '8px';
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }
    
    if (totalImages === 0) setCachedData(dataArray);
    updateDropdownOptions(dataArray);
}

function applyRowPermissions(row, inputs, button, userRole) {
    if (userRole !== 0) {
        inputs.forEach(input => input.disabled = true);
        button.style.display = 'none';
    } else {
        inputs.forEach(input => input.disabled = false);
        button.style.display = '';
    }
}

function updateDropdownOptions(fullDataArray) {
    const suppliers = [...new Set(fullDataArray.map(order => order.nhaCungCap).filter(supplier => supplier))];
    if (filterSupplierSelect) {
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
    if (!auth || auth.checkLogin == '777') {
        showError('Không có quyền truy cập biểu mẫu');
        return;
    }
    const dataForm = document.getElementById('dataForm');
    const toggleFormButton = document.getElementById('toggleFormButton');
    if (dataForm.style.display === 'none' || dataForm.style.display === '') {
        dataForm.style.display = 'block';
        toggleFormButton.textContent = 'Ẩn biểu mẫu';
    } else {
        dataForm.style.display = 'none';
        toggleFormButton.textContent = 'Hiện biểu mẫu';
    }
}

function initializeFormElements() {
    setTodayDate();
    initializeInvoiceImageHandling();
    initializeProductImageHandling();
    initializePriceImageHandling();
    initializeInputValidation();

    if (orderForm) {
        orderForm.addEventListener('submit', addOrder);
    }

    const clearDataButton = document.getElementById('clearDataButton');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', clearOrderForm);
    }

    const toggleFormButton = document.getElementById('toggleFormButton');
    if (toggleFormButton) {
        toggleFormButton.addEventListener('click', toggleForm);
    }

    initializeSupplierSuggestions();
}

function initializeSupplierSuggestions() {
    const supplierSuggestions = document.getElementById('supplierSuggestions');
    if (nhaCungCapInput && supplierSuggestions) {
        let supplierList = [];
        
        nhaCungCapInput.addEventListener('input', function() {
            const value = this.value.toLowerCase().trim();
            if (value.length < 2) {
                supplierSuggestions.style.display = 'none';
                return;
            }
            
            const filtered = supplierList.filter(supplier => 
                supplier.toLowerCase().includes(value)
            );
            
            if (filtered.length > 0) {
                supplierSuggestions.innerHTML = filtered.map(supplier => 
                    `<div class="supplier-suggestion">${supplier}</div>`
                ).join('');
                supplierSuggestions.style.display = 'block';
            } else {
                supplierSuggestions.style.display = 'none';
            }
        });
        
        supplierSuggestions.addEventListener('click', function(e) {
            if (e.target.classList.contains('supplier-suggestion')) {
                nhaCungCapInput.value = e.target.textContent;
                supplierSuggestions.style.display = 'none';
            }
        });
        
        document.addEventListener('click', function(e) {
            if (!nhaCungCapInput.contains(e.target) && !supplierSuggestions.contains(e.target)) {
                supplierSuggestions.style.display = 'none';
            }
        });
        
        window.updateSupplierSuggestions = function(dataArray) {
            supplierList = [...new Set(dataArray.map(order => order.nhaCungCap).filter(supplier => supplier))];
        };
    }
}

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

function updateSuggestions(fullDataArray) {
    if (!fullDataArray || !Array.isArray(fullDataArray)) return;

    const productNames = fullDataArray
        .map(order => order.tenSanPham?.trim())
        .filter(value => value && value.length > 0);
    const uniqueProductNames = [...new Set(productNames)];

    const dataList = document.getElementById('productSuggestions');
    if (dataList) {
        dataList.innerHTML = uniqueProductNames.map(value => `<option value="${sanitizeInput(value)}">`).join('');
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
        showError('Không có dữ liệu để xuất');
        return;
    }
    
    showLoading('Đang tạo file Excel...');
    try {
        const filteredData = applyFiltersToData(cachedData);
        const excelData = filteredData.map((order, index) => ({
            'STT': index + 1,
            'Ngày đặt hàng': order.ngayDatHang || '',
            'Thời gian upload': order.thoiGianUpload || '',
            'Nhà cung cấp': order.nhaCungCap || '',
            'Hóa đơn': order.hoaDon || '',
            'Tên sản phẩm': order.tenSanPham || '',
            'Mã sản phẩm': order.maSanPham || '',
            'Biến thể': order.bienThe || '',
            'Số lượng': order.soLuong || 0,
            'Giá nhập': order.giaNhap || 0,
            'Tổng tiền': (order.soLuong || 0) * (order.giaNhap || 0),
            'Ghi chú': order.ghiChu || '',
            'Người tạo': order.user || '',
            'ID': order.id || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đặt Hàng');
        const fileName = `DatHang_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        hideFloatingAlert();
        showSuccess('Xuất Excel thành công!');
    } catch (error) {
        console.error('Lỗi khi xuất Excel:', error);
        showError('Lỗi khi xuất Excel!');
    }
}

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener('click', function(e) {
            const auth = getAuthState();
            if (auth && auth.checkLogin == '0') {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton ? deleteButton.getAttribute('data-order-info') : "Không có nút xóa";

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

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyNotification();
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopyNotification();
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

function showCopyNotification() {
    const notification = document.getElementById('copyNotification');
    if (notification) {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    }
}

function handleLogout() {
    const confirmLogout = confirm('Bạn có chắc muốn đăng xuất?');
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = '../index.html';
    }
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeApplication() {
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

    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();
    await initializeWithMigration();
    
    const toggleLogoutButton = document.getElementById('toggleLogoutButton');
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener('click', handleLogout);
    }

    console.log('Enhanced Order Management System initialized successfully');
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
window.debugFunctions = {
    checkDataIntegrity: async function() {
        const doc = await collectionRef.doc("dathang").get();
        if (doc.exists) {
            const data = doc.data();
            console.log('Data integrity check:', {
                total: data.data.length,
                withId: data.data.filter(item => item.id).length,
                withoutId: data.data.filter(item => !item.id).length
            });
        }
    },
    generateUniqueID,
    sortDataByNewest,
    parseDate,
    parseVietnameseDate,
    forceRefreshData: function() {
        invalidateCache();
        displayOrderData();
    },
    invalidateCache,
    getAuthState,
    hasPermission,
    exportToExcel
};

// DOM initialization
document.addEventListener('DOMContentLoaded', function() {
    const adsElement = document.querySelector('div[style*="position: fixed"][style*="z-index:9999999"]');
    if (adsElement) {
        adsElement.remove();
    }
    initializeApplication();
});

console.log("Enhanced Order Management System Part 2B loaded - Complete UI & Initialization");
console.log("Debug functions available at window.debugFunctions");
console.log("Available functions:", Object.keys(window.debugFunctions).join(', '));

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