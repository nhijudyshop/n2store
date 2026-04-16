// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Manage product images mapped by STT (product index)
// Data structure: anhSanPham = { "1": ["url1", "url2"], "2": ["url3"] }
// =====================================================

const ImageManager = (() => {
    let _currentShipmentId = null;
    let _currentInvoiceId = null;
    let _anhSanPham = {}; // Working copy: { "1": ["url1"], "2": ["url2", "url3"] }
    let _productList = []; // [{stt, maSP}] for reference
    let _isUploading = false;

    /**
     * Open image manager modal for a specific invoice
     */
    function open(shipmentId, invoiceId) {
        const shipment = globalState.shipments.find(s => s.id === shipmentId);
        if (!shipment) {
            window.notificationManager?.error('Không tìm thấy đợt hàng');
            return;
        }

        // Find the invoice (hoaDon) within the grouped shipment
        const groupedShipments = getAllDotHangAsShipments();
        let invoice = null;
        let dotHang = null;

        // Find the actual dotHang (flat shipment) by invoiceId
        dotHang = globalState.shipments.find(s => s.id === invoiceId);
        if (!dotHang) {
            // Try finding by index in grouped shipment
            for (const gs of groupedShipments) {
                const hd = gs.hoaDon?.find(h => h.id === invoiceId);
                if (hd) { invoice = hd; break; }
            }
            if (!invoice) {
                window.notificationManager?.error('Không tìm thấy hóa đơn');
                return;
            }
        } else {
            invoice = {
                id: dotHang.id,
                sanPham: dotHang.sanPham || [],
                anhSanPham: dotHang.anhSanPham || {}
            };
        }

        _currentShipmentId = shipmentId;
        _currentInvoiceId = invoiceId;
        _anhSanPham = JSON.parse(JSON.stringify(invoice.anhSanPham || {}));
        _productList = (invoice.sanPham || []).map((p, idx) => ({
            stt: idx + 1,
            maSP: p.maSP || '-'
        }));

        _render();
        openModal('modalImageManager');
    }

    /**
     * Render modal content
     */
    function _render() {
        const body = document.getElementById('imageManagerBody');
        if (!body) return;

        // Get all STTs that have images or exist in product list
        const allStts = new Set();
        _productList.forEach(p => allStts.add(String(p.stt)));
        Object.keys(_anhSanPham).forEach(stt => allStts.add(stt));

        const sortedStts = Array.from(allStts).sort((a, b) => parseInt(a) - parseInt(b));

        if (sortedStts.length === 0) {
            body.innerHTML = `
                <div class="img-mgr-empty">
                    <i data-lucide="image-off"></i>
                    <p>Chưa có sản phẩm nào</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        body.innerHTML = sortedStts.map(stt => {
            const product = _productList.find(p => String(p.stt) === stt);
            const images = _anhSanPham[stt] || [];
            const maSP = product ? product.maSP : `STT ${stt}`;

            return `
                <div class="img-mgr-row" data-stt="${stt}">
                    <div class="img-mgr-row-header">
                        <div class="img-mgr-stt-info">
                            <span class="img-mgr-stt-badge">${stt}</span>
                            <span class="img-mgr-sku">${maSP}</span>
                            <span class="img-mgr-count">${images.length} ảnh</span>
                        </div>
                        <div class="img-mgr-row-actions">
                            <label class="btn btn-sm btn-outline img-mgr-add-btn" title="Thêm ảnh">
                                <i data-lucide="plus"></i> Thêm ảnh
                                <input type="file" multiple accept="image/*" class="img-mgr-file-input"
                                    data-stt="${stt}" style="display:none" onchange="ImageManager.handleFileSelect(this)">
                            </label>
                        </div>
                    </div>
                    <div class="img-mgr-images" data-stt="${stt}">
                        ${images.length > 0 ? images.map((url, idx) => `
                            <div class="img-mgr-thumb">
                                <img src="${url}" alt="STT ${stt}" onclick="openImageLightbox('${url}')">
                                <button class="img-mgr-delete" onclick="ImageManager.removeImage('${stt}', ${idx})" title="Xóa ảnh">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                        `).join('') : '<span class="img-mgr-no-images">Chưa có ảnh</span>'}
                    </div>
                </div>
            `;
        }).join('');

        // Setup paste handler
        _setupPasteHandler(body);

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Setup Ctrl+V paste handler
     */
    function _setupPasteHandler(container) {
        // Remove old listener if any
        const modal = document.getElementById('modalImageManager');
        if (modal._pasteHandler) {
            modal.removeEventListener('paste', modal._pasteHandler);
        }

        modal._pasteHandler = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            const imageFiles = [];
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }

            if (imageFiles.length === 0) return;
            e.preventDefault();

            // Find which STT row is focused or use the first one
            const focusedRow = document.activeElement?.closest('.img-mgr-row');
            const stt = focusedRow?.dataset.stt || _productList[0]?.stt?.toString() || '1';

            await _uploadAndAddImages(stt, imageFiles);
        };

        modal.addEventListener('paste', modal._pasteHandler);
    }

    /**
     * Handle file input change
     */
    async function handleFileSelect(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        const stt = input.dataset.stt;
        await _uploadAndAddImages(stt, files);
        input.value = '';
    }

    /**
     * Upload files and add to STT mapping
     */
    async function _uploadAndAddImages(stt, files) {
        if (_isUploading) return;
        _isUploading = true;

        const loadingToast = window.notificationManager?.loading(`Đang tải ${files.length} ảnh...`);

        try {
            const path = `inventory/${_currentInvoiceId}/stt_${stt}`;
            const urls = await uploadMultipleImages(files, path);

            if (urls.length > 0) {
                if (!_anhSanPham[stt]) {
                    _anhSanPham[stt] = [];
                }
                _anhSanPham[stt].push(...urls);
                _render();
                window.notificationManager?.success(`Đã tải ${urls.length} ảnh cho STT ${stt}`);
            }
        } catch (error) {
            console.error('[IMG-MGR] Upload error:', error);
            window.notificationManager?.error('Không thể tải ảnh lên');
        } finally {
            _isUploading = false;
            window.notificationManager?.remove(loadingToast);
        }
    }

    /**
     * Remove an image from STT
     */
    function removeImage(stt, imageIdx) {
        const images = _anhSanPham[stt];
        if (!images || imageIdx >= images.length) return;

        images.splice(imageIdx, 1);

        // Remove STT key if no images left
        if (images.length === 0) {
            delete _anhSanPham[stt];
        }

        _render();
    }

    /**
     * Save anhSanPham to server
     */
    async function save() {
        if (!_currentInvoiceId) return;

        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        try {
            // Update via API - the invoiceId IS the dotHang id
            await shipmentsApi.update(_currentInvoiceId, { anhSanPham: _anhSanPham });

            // Update local state
            const dotHang = globalState.shipments.find(s => s.id === _currentInvoiceId);
            if (dotHang) {
                dotHang.anhSanPham = JSON.parse(JSON.stringify(_anhSanPham));
            }

            window.notificationManager?.success('Đã lưu ảnh sản phẩm');
            closeModal('modalImageManager');

            // Re-render table
            if (typeof applyFiltersAndRender === 'function') {
                applyFiltersAndRender();
            }
        } catch (error) {
            console.error('[IMG-MGR] Save error:', error);
            window.notificationManager?.error('Không thể lưu: ' + error.message);
        } finally {
            window.notificationManager?.remove(loadingToast);
        }
    }

    /**
     * View images for a specific STT (called from table cell click)
     */
    function viewSttImages(shipmentId, invoiceId, stt) {
        const dotHang = globalState.shipments.find(s => s.id === invoiceId);
        if (!dotHang) return;

        const images = dotHang.anhSanPham?.[String(stt)] || [];
        if (images.length === 0) {
            // Open the manager modal instead if no images
            open(shipmentId, invoiceId);
            return;
        }

        // Use existing image viewer modal
        const modal = document.getElementById('modalImageViewer');
        const body = document.getElementById('imageViewerBody');

        if (body) {
            const product = dotHang.sanPham?.[stt - 1];
            const maSP = product?.maSP || `STT ${stt}`;

            body.innerHTML = `
                <div class="img-viewer-header-info">
                    <strong>STT ${stt} — ${maSP}</strong>
                    <span>${images.length} ảnh</span>
                </div>
                ${images.map((url, index) => `
                    <div class="image-item" style="position: relative;">
                        <img src="${url}" alt="STT ${stt}" onclick="openImageLightbox('${url}')" style="cursor: pointer;">
                    </div>
                `).join('')}
            `;
        }

        openModal('modalImageViewer');
    }

    /**
     * Open picker modal to choose which shipment/invoice to manage images
     */
    function openPicker() {
        const shipments = getAllDotHangAsShipments();
        const body = document.getElementById('imagePickerBody');
        if (!body) return;

        if (shipments.length === 0) {
            body.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">Chưa có đợt hàng nào</p>';
            openModal('modalImagePicker');
            return;
        }

        body.innerHTML = shipments.map(ship => {
            const invoices = ship.hoaDon || [];
            return `
                <div class="img-picker-group">
                    <div class="img-picker-date">
                        <i data-lucide="calendar"></i>
                        Ngày giao: ${formatDateDisplay(ship.ngayDiHang)}
                    </div>
                    ${invoices.map(hd => {
                        const products = hd.sanPham || [];
                        const anhSanPham = hd.anhSanPham || {};
                        const totalImages = Object.values(anhSanPham).reduce((sum, arr) => sum + arr.length, 0);
                        const productNames = products.slice(0, 3).map(p => p.maSP || '-').join(', ');
                        const moreProducts = products.length > 3 ? ` +${products.length - 3}` : '';

                        return `
                            <div class="img-picker-item" onclick="ImageManager.selectFromPicker('${ship.id}', '${hd.id}')">
                                <div class="img-picker-info">
                                    <span class="img-picker-ncc">NCC ${hd.sttNCC}</span>
                                    <span class="img-picker-products">${productNames}${moreProducts}</span>
                                </div>
                                <div class="img-picker-meta">
                                    <span class="img-picker-count">${totalImages > 0 ? totalImages + ' ảnh' : 'Chưa có ảnh'}</span>
                                    <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--gray-400)"></i>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
        openModal('modalImagePicker');
    }

    /**
     * Called when user selects a shipment from picker
     */
    function selectFromPicker(shipmentId, invoiceId) {
        closeModal('modalImagePicker');
        // Small delay so modal close animation finishes
        setTimeout(() => open(shipmentId, invoiceId), 200);
    }

    return {
        open,
        openPicker,
        selectFromPicker,
        save,
        handleFileSelect,
        removeImage,
        viewSttImages
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
