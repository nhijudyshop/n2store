// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Manage product images mapped by STT (free-form input)
// Data structure: anhSanPham = { "1": ["url1", "url2"], "23": ["url3"] }
// =====================================================

const ImageManager = (() => {
    let _currentShipmentId = null;
    let _currentInvoiceId = null;
    let _anhSanPham = {}; // Working copy
    let _isUploading = false;
    let _selectedStt = null; // Currently selected STT for paste

    /**
     * Open image manager modal for a specific invoice
     */
    function open(shipmentId, invoiceId) {
        // Find the actual dotHang (flat shipment) by invoiceId
        const dotHang = globalState.shipments.find(s => s.id === invoiceId);
        if (!dotHang) {
            window.notificationManager?.error('Không tìm thấy đợt hàng');
            return;
        }

        _currentShipmentId = shipmentId;
        _currentInvoiceId = invoiceId;
        _anhSanPham = JSON.parse(JSON.stringify(dotHang.anhSanPham || {}));
        _selectedStt = null;

        _render();
        openModal('modalImageManager');
    }

    /**
     * Render modal content
     */
    function _render() {
        const body = document.getElementById('imageManagerBody');
        if (!body) return;

        const sortedStts = Object.keys(_anhSanPham)
            .sort((a, b) => parseInt(a) - parseInt(b));

        // Auto-select first STT if none selected
        if (!_selectedStt && sortedStts.length > 0) {
            _selectedStt = sortedStts[0];
        }

        body.innerHTML = `
            <div class="img-mgr-add-stt-bar">
                <input type="number" class="img-mgr-stt-input" id="imgMgrSttInput"
                    placeholder="Nhập STT..." min="1" autocomplete="off">
                <button class="btn btn-primary btn-sm" onclick="ImageManager.addStt()">
                    <i data-lucide="plus"></i> Thêm STT
                </button>
                <span class="img-mgr-paste-hint-inline">
                    <i data-lucide="clipboard"></i> Ctrl+V dán ảnh vào STT đang chọn
                </span>
            </div>
            <div class="img-mgr-list">
                ${sortedStts.length === 0 ? `
                    <div class="img-mgr-empty">
                        <i data-lucide="image-off"></i>
                        <p>Nhập STT và thêm ảnh để bắt đầu</p>
                    </div>
                ` : sortedStts.map(stt => _renderSttRow(stt)).join('')}
            </div>
        `;

        // Focus input & setup enter key
        const input = document.getElementById('imgMgrSttInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addStt();
                }
            });
        }

        _setupPasteHandler();
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render a single STT row
     */
    function _renderSttRow(stt) {
        const images = _anhSanPham[stt] || [];
        const isSelected = stt === _selectedStt;

        return `
            <div class="img-mgr-row ${isSelected ? 'img-mgr-row-selected' : ''}" data-stt="${stt}"
                onclick="ImageManager.selectStt('${stt}')">
                <div class="img-mgr-row-header">
                    <div class="img-mgr-stt-info">
                        <span class="img-mgr-stt-badge">${stt}</span>
                        <span class="img-mgr-label">STT ${stt}</span>
                        <span class="img-mgr-count">${images.length} ảnh</span>
                        ${isSelected ? '<span class="img-mgr-paste-tag">Ctrl+V dán vào đây</span>' : ''}
                    </div>
                    <div class="img-mgr-row-actions" onclick="event.stopPropagation()">
                        <label class="btn btn-sm btn-outline img-mgr-add-btn" title="Chọn file ảnh">
                            <i data-lucide="plus"></i> Thêm ảnh
                            <input type="file" multiple accept="image/*" class="img-mgr-file-input"
                                data-stt="${stt}" style="display:none" onchange="ImageManager.handleFileSelect(this)">
                        </label>
                        <button class="btn btn-sm btn-outline img-mgr-remove-stt" onclick="ImageManager.removeStt('${stt}')" title="Xóa STT ${stt}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="img-mgr-images" data-stt="${stt}">
                    ${images.length > 0 ? images.map((url, idx) => `
                        <div class="img-mgr-thumb" onclick="event.stopPropagation()">
                            <img src="${url}" alt="STT ${stt}" onclick="openImageLightbox('${url}')">
                            <button class="img-mgr-delete" onclick="event.stopPropagation(); ImageManager.removeImage('${stt}', ${idx})" title="Xóa ảnh">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                    `).join('') : '<span class="img-mgr-no-images">Chưa có ảnh — chọn file hoặc Ctrl+V</span>'}
                </div>
            </div>
        `;
    }

    /**
     * Add a new STT from input
     */
    function addStt() {
        const input = document.getElementById('imgMgrSttInput');
        if (!input) return;

        const stt = input.value.trim();
        if (!stt || isNaN(parseInt(stt)) || parseInt(stt) < 1) {
            window.notificationManager?.warning('Vui lòng nhập số STT hợp lệ');
            return;
        }

        const sttKey = String(parseInt(stt));

        if (_anhSanPham[sttKey]) {
            // Already exists, just select it
            _selectedStt = sttKey;
            _render();
            window.notificationManager?.info(`STT ${sttKey} đã tồn tại — đã chọn`);
            return;
        }

        _anhSanPham[sttKey] = [];
        _selectedStt = sttKey;
        _render();

        // Focus input again for quick consecutive adds
        setTimeout(() => {
            const newInput = document.getElementById('imgMgrSttInput');
            if (newInput) { newInput.value = ''; newInput.focus(); }
        }, 50);
    }

    /**
     * Remove an entire STT and its images
     */
    function removeStt(stt) {
        const images = _anhSanPham[stt] || [];
        const msg = images.length > 0
            ? `Xóa STT ${stt} và ${images.length} ảnh?`
            : `Xóa STT ${stt}?`;

        if (!confirm(msg)) return;

        delete _anhSanPham[stt];
        if (_selectedStt === stt) _selectedStt = null;
        _render();
    }

    /**
     * Setup Ctrl+V paste handler on document (only active when modal is open)
     */
    function _setupPasteHandler() {
        if (document._imgMgrPasteHandler) {
            document.removeEventListener('paste', document._imgMgrPasteHandler);
        }

        document._imgMgrPasteHandler = async (e) => {
            const modal = document.getElementById('modalImageManager');
            if (!modal || !modal.classList.contains('active')) return;

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

            if (!_selectedStt) {
                window.notificationManager?.warning('Chọn STT trước khi dán ảnh');
                return;
            }

            await _uploadAndAddImages(_selectedStt, imageFiles);
        };

        document.addEventListener('paste', document._imgMgrPasteHandler);
    }

    /**
     * Select STT for paste target
     */
    function selectStt(stt) {
        _selectedStt = stt;
        _render();
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
            await shipmentsApi.update(_currentInvoiceId, { anhSanPham: _anhSanPham });

            const dotHang = globalState.shipments.find(s => s.id === _currentInvoiceId);
            if (dotHang) {
                dotHang.anhSanPham = JSON.parse(JSON.stringify(_anhSanPham));
            }

            window.notificationManager?.success('Đã lưu ảnh sản phẩm');
            closeModal('modalImageManager');

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
            open(shipmentId, invoiceId);
            return;
        }

        const modal = document.getElementById('modalImageViewer');
        const body = document.getElementById('imageViewerBody');

        if (body) {
            body.innerHTML = `
                <div class="img-viewer-header-info">
                    <strong>STT ${stt}</strong>
                    <span>${images.length} ảnh</span>
                </div>
                ${images.map((url) => `
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
                        const anhSanPham = hd.anhSanPham || {};
                        const totalImages = Object.values(anhSanPham).reduce((sum, arr) => sum + arr.length, 0);
                        const sttCount = Object.keys(anhSanPham).length;

                        return `
                            <div class="img-picker-item" onclick="ImageManager.selectFromPicker('${ship.id}', '${hd.id}')">
                                <div class="img-picker-info">
                                    <span class="img-picker-ncc">NCC ${hd.sttNCC}</span>
                                </div>
                                <div class="img-picker-meta">
                                    <span class="img-picker-count">${totalImages > 0 ? `${totalImages} ảnh (${sttCount} STT)` : 'Chưa có ảnh'}</span>
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
        setTimeout(() => open(shipmentId, invoiceId), 200);
    }

    return {
        open,
        openPicker,
        selectFromPicker,
        selectStt,
        addStt,
        removeStt,
        save,
        handleFileSelect,
        removeImage,
        viewSttImages
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
