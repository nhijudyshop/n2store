// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Row-based input: each row = [images] + [NCC]
// Images stored independently in inventory_product_images table
// Auto-mapped to shipments by NCC at render time
// =====================================================

const ImageManager = (() => {
    let _rows = []; // [{ id, uploadedUrls: [], ncc: '' }]
    let _focusedRowId = null;
    let _isUploading = false;
    let _rowCounter = 0;
    let _searchNcc = ''; // NCC search filter
    let _batchNgay = null;  // Current shipment date (YYYY-MM-DD)
    let _batchDotSo = 1;    // Current đợt number

    /**
     * Create a new empty row
     */
    function _createRow() {
        const row = {
            id: `row_${++_rowCounter}`,
            uploadedUrls: [],
            ncc: ''
        };

        // Auto-fill NCC = last NCC + 1
        const lastNcc = [..._rows].reverse().find(r => r.ncc && !isNaN(parseInt(r.ncc)));
        if (lastNcc) {
            row.ncc = String(parseInt(lastNcc.ncc) + 1);
        }

        return row;
    }

    /**
     * Open image manager modal — load existing data from product images table
     */
    async function open() {
        _rows = [];
        _searchNcc = '';

        try {
            const images = globalState.productImages || [];

            // Collect NCCs that exist in current shipments table
            const mappedNCCs = new Set();
            if (typeof getAllDotHang === 'function') {
                getAllDotHang().forEach(dot => {
                    if (dot.sttNCC) mappedNCCs.add(dot.sttNCC);
                });
            }

            images.forEach(img => {
                const urls = typeof img.urls === 'string' ? JSON.parse(img.urls) : (img.urls || []);
                if (urls.length === 0) return;

                const nccNum = img.ncc ? parseInt(img.ncc) : null;
                _rows.push({
                    id: `row_${++_rowCounter}`,
                    uploadedUrls: [...urls],
                    ncc: img.ncc ? String(img.ncc) : '',
                    mapped: nccNum !== null && mappedNCCs.has(nccNum)
                });
            });

            // Sort: unmapped first, mapped last
            _rows.sort((a, b) => (a.mapped ? 1 : 0) - (b.mapped ? 1 : 0));
        } catch (error) {
            console.error('[IMG-MGR] Error loading product images:', error);
        }

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

        // Filter rows by NCC search
        const visibleRows = _searchNcc
            ? _rows.filter(r => r.ncc.includes(_searchNcc) || !r.ncc)
            : _rows;

        body.innerHTML = `
            <div class="img-mgr-toolbar">
                <div class="img-mgr-hint">
                    <i data-lucide="info"></i>
                    Chọn hàng, dán ảnh (Ctrl+V) hoặc chọn file, nhập NCC
                </div>
                <div class="img-mgr-search">
                    <i data-lucide="search"></i>
                    <input type="number" id="imgMgrSearchNcc" class="img-mgr-search-input"
                        placeholder="Tìm NCC..." value="${_searchNcc}" min="1" autocomplete="off">
                </div>
            </div>
            <div class="img-mgr-rows">
                ${visibleRows.map(row => _renderRow(row)).join('')}
            </div>
            <button class="btn btn-outline img-mgr-add-row-btn" onclick="ImageManager.addRow()">
                <i data-lucide="plus"></i> Thêm NCC
            </button>
        `;

        // Search listener
        const searchInput = body.querySelector('#imgMgrSearchNcc');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                _searchNcc = e.target.value.trim();
                _render();
                // Re-focus search input after re-render
                const newInput = document.getElementById('imgMgrSearchNcc');
                if (newInput) { newInput.focus(); }
            });
        }

        _setupPasteHandler();

        // Attach input listeners (must do after innerHTML)
        _rows.forEach(row => {
            const nccInput = body.querySelector(`#ncc_${row.id}`);
            const hasImages = row.uploadedUrls.length > 0;

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
        const mappedClass = row.mapped ? 'img-mgr-entry-mapped' : '';

        return `
            <div class="img-mgr-entry ${isFocused ? 'img-mgr-entry-focused' : ''} ${mappedClass}"
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
                            <label>NCC</label>
                            <input type="number" id="ncc_${row.id}" class="img-mgr-input"
                                placeholder="VD: 1" min="1" autocomplete="off">
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
            if (!confirm(`Xóa NCC ${row.ncc || '?'} và ${row.uploadedUrls.length} ảnh?`)) return;
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
     * Convert files to base64 and add to a specific row
     */
    async function _uploadToRow(rowId, files) {
        if (_isUploading) return;

        const row = _rows.find(r => r.id === rowId);
        if (!row) return;

        _isUploading = true;

        try {
            for (const file of files) {
                if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) continue;
                if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) continue;

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
     * Save: store rows independently in product_images table (keyed by NCC)
     * Mapping to shipments happens at render time via getProductImagesForNcc()
     */
    async function save() {
        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        try {
            // Build rows for API: only rows with images AND NCC
            const apiRows = _rows
                .filter(r => r.uploadedUrls.length > 0 && r.ncc.trim())
                .map(r => ({
                    ncc: parseInt(r.ncc),
                    urls: r.uploadedUrls
                }));

            // Bulk save to product_images table
            const saved = await productImagesApi.bulkSave(apiRows);

            // Update local state
            globalState.productImages = saved;

            window.notificationManager?.success(
                apiRows.length > 0
                    ? `Đã lưu ảnh cho ${apiRows.length} NCC`
                    : 'Đã xóa tất cả ảnh sản phẩm'
            );

            // Re-render table to reflect new image mapping (keep modal open for continued editing)
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();

        } catch (error) {
            console.error('[IMG-MGR] Save error:', error);
            window.notificationManager?.error('Không thể lưu: ' + error.message);
        } finally {
            window.notificationManager?.remove(loadingToast);
        }
    }

    /**
     * View images for a specific NCC (called from table cell click)
     */
    function viewNccImages(ncc) {
        const images = getProductImagesForNcc(ncc);

        if (images.length === 0) {
            open();
            return;
        }

        _showImagesInViewer(ncc, images);
    }

    /**
     * Show images in the viewer modal
     */
    function _showImagesInViewer(ncc, images) {
        const body = document.getElementById('imageViewerBody');
        if (!body) return;

        body.innerHTML = `
            <div class="img-viewer-header-info">
                <strong>NCC ${ncc}</strong>
                <span>${images.length} ảnh</span>
            </div>
            <div class="img-gallery-grid">
                ${images.map((url, idx) => `
                    <div class="img-gallery-item" onclick="ImageManager._openLightbox(${idx})">
                        <img src="${url}" alt="Ảnh ${idx + 1}">
                    </div>
                `).join('')}
            </div>
            <div class="img-lightbox" id="imgLightbox" style="display:none">
                <div class="img-lightbox-overlay" onclick="ImageManager._closeLightbox()"></div>
                <button class="img-lightbox-nav img-lightbox-prev" onclick="ImageManager._navLightbox(-1)">
                    <i data-lucide="chevron-left"></i>
                </button>
                <div class="img-lightbox-content">
                    <img id="imgLightboxImg" src="" alt="">
                    <div class="img-lightbox-counter" id="imgLightboxCounter"></div>
                </div>
                <button class="img-lightbox-nav img-lightbox-next" onclick="ImageManager._navLightbox(1)">
                    <i data-lucide="chevron-right"></i>
                </button>
                <button class="img-lightbox-close" onclick="ImageManager._closeLightbox()">
                    <i data-lucide="x"></i>
                </button>
            </div>
        `;

        body._galleryImages = images;
        body._galleryIdx = 0;

        if (window.lucide) lucide.createIcons();
        openModal('modalImageViewer');
    }

    function _openLightbox(idx) {
        const body = document.getElementById('imageViewerBody');
        const images = body?._galleryImages || [];
        if (idx < 0 || idx >= images.length) return;

        body._galleryIdx = idx;
        const lb = document.getElementById('imgLightbox');
        const img = document.getElementById('imgLightboxImg');
        const counter = document.getElementById('imgLightboxCounter');

        if (lb && img) {
            img.src = images[idx];
            counter.textContent = `${idx + 1} / ${images.length}`;
            lb.style.display = 'flex';
        }
    }

    function _closeLightbox() {
        const lb = document.getElementById('imgLightbox');
        if (lb) lb.style.display = 'none';
    }

    function _navLightbox(dir) {
        const body = document.getElementById('imageViewerBody');
        const images = body?._galleryImages || [];
        let idx = (body._galleryIdx || 0) + dir;
        if (idx < 0) idx = images.length - 1;
        if (idx >= images.length) idx = 0;
        _openLightbox(idx);
    }

    return {
        open,
        addRow,
        removeRow,
        focusRow,
        save,
        handleFileSelect,
        removeImage,
        viewNccImages,
        _openLightbox,
        _closeLightbox,
        _navLightbox
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
