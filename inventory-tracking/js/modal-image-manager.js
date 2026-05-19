// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Row-based input: each row = [images] + [NCC] + [batchKey]
// Images stored in inventory_product_images table keyed by
// (ngay_di_hang, dot_so, ncc). Adding a row asks which đợt/ngày
// it belongs to so NCC duplicates across shipments map correctly.
// =====================================================

const ImageManager = (() => {
    const GLOBAL_BATCH = '2026-04-10__1'; // canonical default batch from migration 058
    let _rows = []; // [{ id, uploadedUrls, ncc, batchKey, mapped }]
    let _focusedRowId = null;
    let _isUploading = false;
    let _rowCounter = 0;
    let _searchNcc = ''; // NCC search filter
    let _filterBatchKey = ''; // batch filter ('' = all)
    let _batchOptions = []; // [{ batchKey, ngayDiHang, dotSo, label }]
    let _initialBatchKeys = new Set(); // batches loaded at open() — used to send empty PUT on clear

    function _splitBatchKey(batchKey) {
        if (!batchKey) return { ngayDiHang: null, dotSo: null };
        const [ngayDiHang, dotSoStr] = batchKey.split('__');
        return { ngayDiHang, dotSo: parseInt(dotSoStr, 10) || 1 };
    }

    function _formatBatchLabel(ngayDiHang, dotSo) {
        const dateLabel =
            typeof formatDateDisplay === 'function' ? formatDateDisplay(ngayDiHang) : ngayDiHang;
        return `${dateLabel} — Đợt ${dotSo}`;
    }

    function _buildBatchOptions() {
        const seen = new Map();

        // Real shipments from data (latest first)
        if (typeof getAllDotHangAsShipments === 'function') {
            getAllDotHangAsShipments().forEach((s) => {
                if (!s.ngayDiHang) return;
                const dotSo = s.dotSo || 1;
                const key = `${s.ngayDiHang}__${dotSo}`;
                if (!seen.has(key)) {
                    seen.set(key, {
                        batchKey: key,
                        ngayDiHang: s.ngayDiHang,
                        dotSo,
                        label: _formatBatchLabel(s.ngayDiHang, dotSo),
                    });
                }
            });
        }

        // Also include batches that exist in productImages but not in shipments
        // (orphan images, e.g. canonical 2026-04-10/1 legacy)
        (globalState.productImages || []).forEach((img) => {
            if (!img.ngayDiHang) return;
            const dotSo = img.dotSo || 1;
            const key = `${img.ngayDiHang}__${dotSo}`;
            if (!seen.has(key)) {
                const isLegacy = key === GLOBAL_BATCH;
                seen.set(key, {
                    batchKey: key,
                    ngayDiHang: img.ngayDiHang,
                    dotSo,
                    label: isLegacy
                        ? `${_formatBatchLabel(img.ngayDiHang, dotSo)} (ảnh cũ)`
                        : _formatBatchLabel(img.ngayDiHang, dotSo),
                });
            }
        });

        return Array.from(seen.values()).sort((a, b) => {
            // Date DESC, then dotSo DESC
            if (a.ngayDiHang !== b.ngayDiHang) {
                return a.ngayDiHang < b.ngayDiHang ? 1 : -1;
            }
            return b.dotSo - a.dotSo;
        });
    }

    function _defaultBatchKey() {
        // Prefer top of batch options (latest shipment); fall back to canonical global
        return _batchOptions.length > 0 ? _batchOptions[0].batchKey : GLOBAL_BATCH;
    }

    /**
     * Create a new empty row in the given batch (or default batch)
     */
    function _createRow(batchKey) {
        const row = {
            id: `row_${++_rowCounter}`,
            uploadedUrls: [],
            ncc: '',
            batchKey: batchKey || _defaultBatchKey(),
        };

        // Auto-fill NCC = last NCC in same batch + 1
        const lastNcc = [..._rows]
            .reverse()
            .find((r) => r.batchKey === row.batchKey && r.ncc && !isNaN(parseInt(r.ncc)));
        if (lastNcc) {
            row.ncc = String(parseInt(lastNcc.ncc) + 1);
        }

        return row;
    }

    /**
     * Open image manager modal — load existing data and group by batch
     */
    async function open() {
        _rows = [];
        _searchNcc = '';
        _filterBatchKey = '';
        _initialBatchKeys = new Set();

        try {
            const images = globalState.productImages || [];

            // Build batch options (real shipments + orphan batches)
            _batchOptions = _buildBatchOptions();

            // Collect NCCs that exist in current shipments table (for mapped flag — visual hint)
            const mappedKeys = new Set();
            if (typeof getAllDotHang === 'function') {
                getAllDotHang().forEach((dot) => {
                    if (dot.sttNCC && dot.ngayDiHang) {
                        mappedKeys.add(`${dot.ngayDiHang}__${dot.dotSo || 1}__${dot.sttNCC}`);
                    }
                });
            }

            images.forEach((img) => {
                const urls = typeof img.urls === 'string' ? JSON.parse(img.urls) : img.urls || [];
                if (urls.length === 0) return;

                const dotSo = img.dotSo || 1;
                const batchKey = img.ngayDiHang ? `${img.ngayDiHang}__${dotSo}` : GLOBAL_BATCH;
                const nccNum = img.ncc ? parseInt(img.ncc) : null;
                const isMapped =
                    nccNum !== null && img.ngayDiHang && mappedKeys.has(`${batchKey}__${nccNum}`);

                _initialBatchKeys.add(batchKey);
                _rows.push({
                    id: `row_${++_rowCounter}`,
                    uploadedUrls: [...urls],
                    ncc: img.ncc ? String(img.ncc) : '',
                    batchKey,
                    mapped: isMapped,
                });
            });

            // Sort: batchKey DESC (newest đợt first), then NCC ASC
            _rows.sort((a, b) => {
                if (a.batchKey !== b.batchKey) return a.batchKey < b.batchKey ? 1 : -1;
                return (parseInt(a.ncc) || 0) - (parseInt(b.ncc) || 0);
            });
        } catch (error) {
            console.error('[IMG-MGR] Error loading product images:', error);
            _batchOptions = _buildBatchOptions();
        }

        // Always add one empty row at the end in the latest batch for new input
        const newRow = _createRow();
        _rows.push(newRow);
        _focusedRowId = newRow.id;

        _render();
        openModal('modalImageManager');
    }

    /**
     * Render modal content
     */
    function _render() {
        const body = document.getElementById('imageManagerBody');
        if (!body) return;

        // Apply filters
        const visibleRows = _rows.filter((r) => {
            if (_filterBatchKey && r.batchKey !== _filterBatchKey) return false;
            if (_searchNcc && r.ncc && !r.ncc.includes(_searchNcc)) return false;
            return true;
        });

        // Group visible rows by batchKey (preserve current order)
        const groups = []; // [{ batchKey, rows: [] }]
        const groupIdx = new Map();
        visibleRows.forEach((row) => {
            if (!groupIdx.has(row.batchKey)) {
                groupIdx.set(row.batchKey, groups.length);
                groups.push({ batchKey: row.batchKey, rows: [] });
            }
            groups[groupIdx.get(row.batchKey)].rows.push(row);
        });

        const batchFilterOptions = _batchOptions
            .map(
                (b) =>
                    `<option value="${b.batchKey}" ${b.batchKey === _filterBatchKey ? 'selected' : ''}>${b.label}</option>`
            )
            .join('');

        body.innerHTML = `
            <div class="img-mgr-toolbar">
                <div class="img-mgr-hint">
                    <i data-lucide="info"></i>
                    Chọn hàng → dán ảnh (Ctrl+V) hoặc chọn file → nhập NCC → chọn Đợt giao
                </div>
                <div class="img-mgr-filter-row">
                    <div class="img-mgr-search">
                        <i data-lucide="search"></i>
                        <input type="number" id="imgMgrSearchNcc" class="img-mgr-search-input"
                            placeholder="Tìm NCC..." value="${_searchNcc}" min="1" autocomplete="off">
                    </div>
                    <select id="imgMgrFilterBatch" class="img-mgr-filter-select" title="Lọc theo đợt">
                        <option value="">Tất cả đợt</option>
                        ${batchFilterOptions}
                    </select>
                </div>
            </div>
            <div class="img-mgr-rows">
                ${groups.length > 0 ? groups.map((g) => _renderGroup(g)).join('') : _renderEmptyState()}
            </div>
        `;

        // Search listener
        const searchInput = body.querySelector('#imgMgrSearchNcc');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                _searchNcc = e.target.value.trim();
                _render();
                const next = document.getElementById('imgMgrSearchNcc');
                if (next) next.focus();
            });
        }
        const batchFilter = body.querySelector('#imgMgrFilterBatch');
        if (batchFilter) {
            batchFilter.addEventListener('change', (e) => {
                _filterBatchKey = e.target.value;
                _render();
            });
        }

        _setupPasteHandler();

        // Wire input/select listeners (must do after innerHTML)
        _rows.forEach((row) => {
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

            const batchSel = body.querySelector(`#batch_${row.id}`);
            if (batchSel) {
                batchSel.value = row.batchKey;
                batchSel.addEventListener('change', (e) => {
                    row.batchKey = e.target.value;
                    // Re-render so row regroups visually
                    _render();
                });
            }
        });

        if (window.lucide) lucide.createIcons();
        window.ImageCache?.applyTo?.(body);
    }

    function _renderEmptyState() {
        return `
            <div class="img-mgr-empty">
                <i data-lucide="image-off"></i>
                <div>Chưa có ảnh — thêm hàng để bắt đầu</div>
                <button class="btn btn-outline" style="margin-top:12px"
                        onclick="ImageManager.addRow()">
                    <i data-lucide="plus"></i> Thêm NCC
                </button>
            </div>
        `;
    }

    /**
     * Render a batch section (header + its rows + add-row button)
     */
    function _renderGroup(group) {
        const opt = _batchOptions.find((b) => b.batchKey === group.batchKey);
        const label = opt ? opt.label : group.batchKey;

        return `
            <div class="img-mgr-group" data-batch-key="${group.batchKey}">
                <div class="img-mgr-group-header">
                    <i data-lucide="calendar"></i>
                    <strong>${label}</strong>
                    <span class="img-mgr-group-count">${group.rows.length} NCC</span>
                    <button class="img-mgr-group-add"
                            onclick="ImageManager.addRowInBatch('${group.batchKey}')"
                            title="Thêm NCC vào đợt này">
                        <i data-lucide="plus"></i> Thêm NCC
                    </button>
                </div>
                ${group.rows.map((row) => _renderRow(row)).join('')}
            </div>
        `;
    }

    /**
     * Render a single row
     */
    function _renderRow(row) {
        const isFocused = row.id === _focusedRowId;
        const hasImages = row.uploadedUrls.length > 0;
        const mappedClass = row.mapped ? 'img-mgr-entry-mapped' : '';

        const batchOpts = _batchOptions
            .map(
                (b) =>
                    `<option value="${b.batchKey}" ${b.batchKey === row.batchKey ? 'selected' : ''}>${b.label}</option>`
            )
            .join('');

        // If current batchKey is not in options (e.g. orphan), add it inline
        const hasCurrent = _batchOptions.some((b) => b.batchKey === row.batchKey);
        const fallbackOpt = hasCurrent
            ? ''
            : `<option value="${row.batchKey}" selected>${row.batchKey}</option>`;

        return `
            <div class="img-mgr-entry ${isFocused ? 'img-mgr-entry-focused' : ''} ${mappedClass}"
                data-row-id="${row.id}" onclick="ImageManager.focusRow('${row.id}')">

                <div class="img-mgr-entry-top">
                    <div class="img-mgr-entry-images-area">
                        ${
                            hasImages
                                ? `
                            <div class="img-mgr-entry-thumbs">
                                ${row.uploadedUrls
                                    .map(
                                        (url, idx) => `
                                    <div class="img-mgr-thumb" onclick="event.stopPropagation()">
                                        <img src="${url}" data-cache-src="${url}" alt="Ảnh" onclick="openImageLightbox('${url}')">
                                        <button class="img-mgr-delete" onclick="event.stopPropagation(); ImageManager.removeImage('${row.id}', ${idx})" title="Xóa ảnh">
                                            <i data-lucide="x"></i>
                                        </button>
                                    </div>
                                `
                                    )
                                    .join('')}
                            </div>
                        `
                                : `
                            <div class="img-mgr-entry-paste-zone ${isFocused ? 'img-mgr-paste-active' : ''}">
                                <i data-lucide="image-plus"></i>
                                <span>${isFocused ? 'Ctrl+V dán ảnh vào đây' : 'Click để chọn'}</span>
                            </div>
                        `
                        }
                        <label class="img-mgr-file-label" onclick="event.stopPropagation()">
                            <i data-lucide="upload"></i>
                            <input type="file" multiple accept="image/*"
                                data-row-id="${row.id}" style="display:none"
                                onchange="ImageManager.handleFileSelect(this)">
                        </label>
                    </div>

                    <div class="img-mgr-entry-fields" onclick="event.stopPropagation()">
                        <div class="img-mgr-field">
                            <label>NCC</label>
                            <input type="number" id="ncc_${row.id}" class="img-mgr-input"
                                placeholder="VD: 1" min="1" autocomplete="off">
                        </div>
                        <div class="img-mgr-field">
                            <label>Đợt giao</label>
                            <select id="batch_${row.id}" class="img-mgr-input img-mgr-batch-select"
                                title="Chọn đợt mà ảnh thuộc về">
                                ${fallbackOpt}${batchOpts}
                            </select>
                        </div>
                    </div>

                    <button class="img-mgr-entry-remove" onclick="event.stopPropagation(); ImageManager.removeRow('${row.id}')" title="Xóa hàng">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Focus a row (for paste target)
     */
    function focusRow(rowId) {
        _focusedRowId = rowId;
        document.querySelectorAll('.img-mgr-entry').forEach((el) => {
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
     * Add a new row (default to latest batch)
     */
    function addRow() {
        const row = _createRow();
        _rows.push(row);
        _focusedRowId = row.id;
        _render();
    }

    /**
     * Add a new row in a specific batch (called from section header "Thêm NCC")
     */
    function addRowInBatch(batchKey) {
        const row = _createRow(batchKey);
        _rows.push(row);
        _focusedRowId = row.id;
        _render();
    }

    /**
     * Remove a row (with confirm if has images)
     */
    function removeRow(rowId) {
        const row = _rows.find((r) => r.id === rowId);
        if (row && row.uploadedUrls.length > 0) {
            if (!confirm(`Xóa NCC ${row.ncc || '?'} và ${row.uploadedUrls.length} ảnh?`)) return;
        }
        _rows = _rows.filter((r) => r.id !== rowId);
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

        const row = _rows.find((r) => r.id === rowId);
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
        const row = _rows.find((r) => r.id === rowId);
        if (!row || imageIdx >= row.uploadedUrls.length) return;

        if (!confirm('Xóa ảnh này?')) return;

        row.uploadedUrls.splice(imageIdx, 1);
        _render();
    }

    /**
     * Save: group rows by batchKey → PUT per batch with {date, dotSo}.
     * Also send empty PUT for any batch that was loaded initially but now has 0 rows
     * (so deletions stick).
     */
    async function save() {
        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        try {
            // Build batch buckets: only rows with images + NCC
            const buckets = new Map(); // batchKey -> [{ncc, urls}]
            _rows.forEach((r) => {
                if (r.uploadedUrls.length === 0) return;
                const nccNum = parseInt(r.ncc);
                if (!nccNum) return;
                const key = r.batchKey || _defaultBatchKey();
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push({ ncc: nccNum, urls: r.uploadedUrls });
            });

            // Initial batches that are now empty — send empty PUT so server deletes them
            const clearedBatches = [];
            _initialBatchKeys.forEach((key) => {
                if (!buckets.has(key)) clearedBatches.push(key);
            });

            const allBatchKeys = new Set([...buckets.keys(), ...clearedBatches]);

            // Issue one PUT per batch (parallel; usually small number)
            const calls = [];
            allBatchKeys.forEach((key) => {
                const { ngayDiHang, dotSo } = _splitBatchKey(key);
                const rows = buckets.get(key) || [];
                calls.push(
                    productImagesApi.bulkSave(rows, { date: ngayDiHang, dotSo }).catch((err) => {
                        console.error(`[IMG-MGR] Save batch ${key} failed:`, err);
                        throw err;
                    })
                );
            });

            const results = await Promise.all(calls);

            // Server returns full table on each call — use the last response
            const latest = results[results.length - 1];
            if (latest) {
                globalState.productImages = latest.map((img) => ({
                    ...img,
                    ngayDiHang: img.ngay_di_hang ? String(img.ngay_di_hang).split('T')[0] : null,
                    dotSo: img.dot_so || 1,
                    urls: typeof img.urls === 'string' ? JSON.parse(img.urls) : img.urls || [],
                }));
            }

            const totalRows = Array.from(buckets.values()).reduce((s, b) => s + b.length, 0);
            window.notificationManager?.success(
                totalRows > 0
                    ? `Đã lưu ${totalRows} NCC trong ${buckets.size} đợt`
                    : 'Đã xóa tất cả ảnh sản phẩm'
            );

            // Refresh initial batch set so subsequent saves don't re-clear
            _initialBatchKeys = new Set(buckets.keys());

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
    function viewNccImages(ncc, ngayDiHang, dotSo) {
        const images =
            typeof getProductImagesForNcc === 'function'
                ? getProductImagesForNcc(ncc, ngayDiHang, dotSo)
                : [];

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
                ${images
                    .map(
                        (url, idx) => `
                    <div class="img-gallery-item" onclick="ImageManager._openLightbox(${idx})">
                        <img src="${url}" data-cache-src="${url}" alt="Ảnh ${idx + 1}">
                    </div>
                `
                    )
                    .join('')}
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
        window.ImageCache?.applyTo?.(body);
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
            if (window.ImageCache?.setImgSrc) window.ImageCache.setImgSrc(img, images[idx]);
            else img.src = images[idx];
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
        addRowInBatch,
        removeRow,
        focusRow,
        save,
        handleFileSelect,
        removeImage,
        viewNccImages,
        _openLightbox,
        _closeLightbox,
        _navLightbox,
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
