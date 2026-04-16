// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Row-based input: each row = [images] + [STT] + [NCC]
// Save matches rows to dotHang by STT/NCC
// =====================================================

const ImageManager = (() => {
    let _rows = []; // [{ id, uploadedUrls: [], stt: '', ncc: '' }]
    let _focusedRowId = null;
    let _isUploading = false;
    let _rowCounter = 0;

    /**
     * Create a new empty row
     */
    function _createRow() {
        return {
            id: `row_${++_rowCounter}`,
            uploadedUrls: [],
            stt: '',
            ncc: ''
        };
    }

    /**
     * Open image manager modal — load existing data from all dotHangs
     */
    function open() {
        _rows = [];

        // Load existing anhSanPham from all dotHangs
        const allDot = getAllDotHang();
        allDot.forEach(dot => {
            const anhSanPham = dot.anhSanPham || {};
            Object.entries(anhSanPham).forEach(([stt, urls]) => {
                if (urls && urls.length > 0) {
                    _rows.push({
                        id: `row_${++_rowCounter}`,
                        uploadedUrls: [...urls],
                        stt: stt,
                        ncc: String(dot.sttNCC || '')
                    });
                }
            });
        });

        // Always add one empty row at the end for new input
        _rows.push(_createRow());
        _focusedRowId = _rows[_rows.length - 1].id;

        _render();
        openModal('modalImageManager');
    }

    /**
     * Render modal content
     */
    function _render() {
        const body = document.getElementById('imageManagerBody');
        if (!body) return;

        body.innerHTML = `
            <div class="img-mgr-hint">
                <i data-lucide="info"></i>
                Chọn hàng, dán ảnh (Ctrl+V) hoặc chọn file, nhập STT và NCC (tùy chọn)
            </div>
            <div class="img-mgr-rows">
                ${_rows.map(row => _renderRow(row)).join('')}
            </div>
            <button class="btn btn-outline img-mgr-add-row-btn" onclick="ImageManager.addRow()">
                <i data-lucide="plus"></i> Thêm hàng
            </button>
        `;

        _setupPasteHandler();

        // Attach input listeners (must do after innerHTML)
        _rows.forEach(row => {
            const sttInput = body.querySelector(`#stt_${row.id}`);
            const nccInput = body.querySelector(`#ncc_${row.id}`);
            const hasImages = row.uploadedUrls.length > 0;

            if (sttInput) {
                sttInput.value = row.stt;
                sttInput.addEventListener('change', (e) => {
                    const newVal = e.target.value;
                    if (hasImages && row.stt && newVal !== row.stt) {
                        if (!confirm(`Đổi STT từ ${row.stt} sang ${newVal}?`)) {
                            e.target.value = row.stt;
                            return;
                        }
                    }
                    row.stt = newVal;
                });
            }
            if (nccInput) {
                nccInput.value = row.ncc;
                nccInput.addEventListener('change', (e) => {
                    const newVal = e.target.value;
                    if (hasImages && row.ncc && newVal !== row.ncc) {
                        if (!confirm(`Đổi NCC từ ${row.ncc} sang ${newVal}?`)) {
                            e.target.value = row.ncc;
                            return;
                        }
                    }
                    row.ncc = newVal;
                });
            }
        });

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render a single row
     */
    function _renderRow(row) {
        const isFocused = row.id === _focusedRowId;
        const hasImages = row.uploadedUrls.length > 0;

        return `
            <div class="img-mgr-entry ${isFocused ? 'img-mgr-entry-focused' : ''}"
                data-row-id="${row.id}" onclick="ImageManager.focusRow('${row.id}')">

                <div class="img-mgr-entry-top">
                    <div class="img-mgr-entry-images-area">
                        ${hasImages ? `
                            <div class="img-mgr-entry-thumbs">
                                ${row.uploadedUrls.map((url, idx) => `
                                    <div class="img-mgr-thumb" onclick="event.stopPropagation()">
                                        <img src="${url}" alt="Ảnh" onclick="openImageLightbox('${url}')">
                                        <button class="img-mgr-delete" onclick="event.stopPropagation(); ImageManager.removeImage('${row.id}', ${idx})" title="Xóa ảnh">
                                            <i data-lucide="x"></i>
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="img-mgr-entry-paste-zone ${isFocused ? 'img-mgr-paste-active' : ''}">
                                <i data-lucide="image-plus"></i>
                                <span>${isFocused ? 'Ctrl+V dán ảnh vào đây' : 'Click để chọn'}</span>
                            </div>
                        `}
                        <label class="img-mgr-file-label" onclick="event.stopPropagation()">
                            <i data-lucide="upload"></i>
                            <input type="file" multiple accept="image/*"
                                data-row-id="${row.id}" style="display:none"
                                onchange="ImageManager.handleFileSelect(this)">
                        </label>
                    </div>

                    <div class="img-mgr-entry-fields">
                        <div class="img-mgr-field">
                            <label>STT</label>
                            <input type="number" id="stt_${row.id}" class="img-mgr-input"
                                placeholder="VD: 1" min="1" autocomplete="off">
                        </div>
                        <div class="img-mgr-field">
                            <label>NCC</label>
                            <input type="number" id="ncc_${row.id}" class="img-mgr-input"
                                placeholder="Tùy chọn" min="1" autocomplete="off">
                        </div>
                    </div>

                    ${(_rows.length > 1 || hasImages) ? `
                        <button class="img-mgr-entry-remove" onclick="event.stopPropagation(); ImageManager.removeRow('${row.id}')" title="Xóa hàng">
                            <i data-lucide="trash-2"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Focus a row (for paste target)
     */
    function focusRow(rowId) {
        _focusedRowId = rowId;
        // Update UI without full re-render (just toggle classes)
        document.querySelectorAll('.img-mgr-entry').forEach(el => {
            const isFocused = el.dataset.rowId === rowId;
            el.classList.toggle('img-mgr-entry-focused', isFocused);
            const zone = el.querySelector('.img-mgr-paste-active, .img-mgr-entry-paste-zone');
            if (zone) {
                zone.classList.toggle('img-mgr-paste-active', isFocused);
                const span = zone.querySelector('span');
                if (span) span.textContent = isFocused ? 'Ctrl+V dán ảnh vào đây' : 'Click để chọn';
            }
        });
    }

    /**
     * Add a new row
     */
    function addRow() {
        const row = _createRow();
        _rows.push(row);
        _focusedRowId = row.id;
        _render();
    }

    /**
     * Remove a row (with confirm if has images)
     */
    function removeRow(rowId) {
        const row = _rows.find(r => r.id === rowId);
        if (row && row.uploadedUrls.length > 0) {
            if (!confirm(`Xóa hàng STT ${row.stt || '?'} và ${row.uploadedUrls.length} ảnh?`)) return;
        }
        _rows = _rows.filter(r => r.id !== rowId);
        if (_rows.length === 0) _rows.push(_createRow());
        if (_focusedRowId === rowId) _focusedRowId = _rows[0].id;
        _render();
    }

    /**
     * Setup Ctrl+V paste handler
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

            const targetRowId = _focusedRowId || _rows[0]?.id;
            if (!targetRowId) return;

            await _uploadToRow(targetRowId, imageFiles);
        };

        document.addEventListener('paste', document._imgMgrPasteHandler);
    }

    /**
     * Handle file input change
     */
    async function handleFileSelect(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        const rowId = input.dataset.rowId;
        await _uploadToRow(rowId, files);
        input.value = '';
    }

    /**
     * Convert files to base64 and add to a specific row (no Firebase upload)
     */
    async function _uploadToRow(rowId, files) {
        if (_isUploading) return;

        const row = _rows.find(r => r.id === rowId);
        if (!row) return;

        _isUploading = true;

        try {
            for (const file of files) {
                // Validate
                if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
                if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) continue;

                // Resize + convert to base64 (max 800px, compress JPEG)
                const base64 = await _resizeAndConvert(file, 800, 0.7);
                row.uploadedUrls.push(base64);
            }

            _render();
            if (files.length > 0) {
                window.notificationManager?.success(`Đã thêm ${files.length} ảnh`);
            }
        } catch (error) {
            console.error('[IMG-MGR] Convert error:', error);
            window.notificationManager?.error('Không thể xử lý ảnh');
        } finally {
            _isUploading = false;
        }
    }

    /**
     * Resize image and convert to compressed base64
     */
    function _resizeAndConvert(file, maxSize, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };

            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Remove an image from a row (with confirm)
     */
    function removeImage(rowId, imageIdx) {
        const row = _rows.find(r => r.id === rowId);
        if (!row || imageIdx >= row.uploadedUrls.length) return;

        if (!confirm('Xóa ảnh này?')) return;

        row.uploadedUrls.splice(imageIdx, 1);
        _render();
    }

    /**
     * Save: rebuild anhSanPham for each dotHang from rows
     */
    async function save() {
        // Filter rows that have images AND STT
        const validRows = _rows.filter(r => r.uploadedUrls.length > 0 && r.stt.trim());

        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        try {
            const allDotHang = getAllDotHang();

            // Build map: dotHangId → new anhSanPham (rebuilt from rows)
            // Start with empty for all dotHangs (to clear removed images)
            const updates = new Map();
            allDotHang.forEach(d => updates.set(d.id, {}));

            for (const row of validRows) {
                const sttKey = String(parseInt(row.stt));
                const nccFilter = row.ncc.trim() ? parseInt(row.ncc) : null;

                let targets;
                if (nccFilter !== null) {
                    targets = allDotHang.filter(d => d.sttNCC === nccFilter);
                } else {
                    targets = [...allDotHang];
                }

                if (targets.length === 0 && nccFilter !== null) {
                    window.notificationManager?.warning(`Không tìm thấy NCC ${nccFilter}`);
                    continue;
                }

                for (const dot of targets) {
                    const anhSanPham = updates.get(dot.id);
                    if (!anhSanPham[sttKey]) {
                        anhSanPham[sttKey] = [];
                    }
                    anhSanPham[sttKey].push(...row.uploadedUrls);
                }
            }

            // Save each dotHang that changed
            let savedCount = 0;
            for (const [dotId, newAnhSanPham] of updates) {
                const dot = allDotHang.find(d => d.id === dotId);
                const oldAnhSanPham = dot?.anhSanPham || {};

                // Skip if nothing changed
                if (JSON.stringify(oldAnhSanPham) === JSON.stringify(newAnhSanPham)) continue;

                await shipmentsApi.update(dotId, { anhSanPham: newAnhSanPham });

                // Update local state
                for (const ncc of globalState.nccList) {
                    const d = (ncc.dotHang || []).find(d => d.id === dotId);
                    if (d) { d.anhSanPham = newAnhSanPham; break; }
                }
                savedCount++;
            }

            window.notificationManager?.success(savedCount > 0 ? `Đã lưu ảnh vào ${savedCount} đợt hàng` : 'Không có thay đổi');
            closeModal('modalImageManager');

            // Re-build grouped shipments and re-render
            if (typeof flattenNCCData === 'function') flattenNCCData();
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();

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
        // Find dotHang from all sources
        const allDot = getAllDotHang();
        const dotHang = allDot.find(d => d.id === invoiceId);

        if (!dotHang) {
            // Fallback: search in grouped shipments
            for (const ship of (globalState.shipments || [])) {
                const hd = (ship.hoaDon || []).find(h => h.id === invoiceId);
                if (hd) {
                    const images = hd.anhSanPham?.[String(stt)] || [];
                    if (images.length > 0) {
                        _showImagesInViewer(stt, images);
                        return;
                    }
                }
            }
            open();
            return;
        }

        const images = dotHang.anhSanPham?.[String(stt)] || [];
        if (images.length === 0) {
            open();
            return;
        }

        _showImagesInViewer(stt, images);
    }

    /**
     * Show images in the viewer modal
     */
    function _showImagesInViewer(stt, images) {
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

    return {
        open,
        addRow,
        removeRow,
        focusRow,
        save,
        handleFileSelect,
        removeImage,
        viewSttImages
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
