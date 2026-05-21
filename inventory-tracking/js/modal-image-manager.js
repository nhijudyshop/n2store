// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Row-based input: each row = [images] + [NCC] + [đợt].
// Đợt is a plain integer (1, 2, 3, ...) — user can type a
// custom đợt even if no shipment exists yet for that đợt.
// Server stores by (ngay_di_hang, dot_so, ncc); the client
// picks a canonical date per đợt at save time (earliest
// shipment date for that đợt, else today).
// =====================================================

const ImageManager = (() => {
    const GLOBAL_LEGACY_DATE = '2026-04-10'; // canonical default date from migration 058
    let _rows = []; // [{ id, uploadedUrls, ncc, dotSo, mapped }]
    let _focusedRowId = null;
    let _isUploading = false;
    let _rowCounter = 0;
    let _searchNcc = ''; // NCC search filter
    let _activeDotSo = null; // active tab — only one đợt shown at a time
    let _knownDotSos = []; // distinct đợt numbers from shipments (DESC) — for "Đợt mới nhất" default
    let _initialKey = new Set(); // (dotSo, originalNgay) loaded at open — used to send empty PUT on clear

    function _todayVN() {
        if (typeof todayVN === 'function') return todayVN();
        return new Date().toISOString().slice(0, 10);
    }

    /**
     * Pick the canonical save date for a given đợt:
     * - First, the most-recent shipment date that uses this dotSo
     * - Else, the most-recent existing image entry for this dotSo
     * - Else, today (Vietnam tz)
     */
    function _canonicalDateForDot(dotSo) {
        const n = parseInt(dotSo, 10);
        if (!n) return _todayVN();

        if (typeof getAllDotHangAsShipments === 'function') {
            const ship = getAllDotHangAsShipments().find((s) => (s.dotSo || 1) === n);
            if (ship?.ngayDiHang) return ship.ngayDiHang;
        }
        const img = (globalState.productImages || []).find((i) => (i.dotSo || 1) === n);
        if (img?.ngayDiHang) return img.ngayDiHang;

        return _todayVN();
    }

    function _buildKnownDotSos() {
        const set = new Set();
        if (typeof getAllDotHangAsShipments === 'function') {
            getAllDotHangAsShipments().forEach((s) => set.add(s.dotSo || 1));
        }
        (globalState.productImages || []).forEach((img) => set.add(img.dotSo || 1));
        return Array.from(set).sort((a, b) => b - a); // DESC
    }

    function _defaultDotSo() {
        return _knownDotSos.length > 0 ? _knownDotSos[0] : 1;
    }

    /**
     * Create a new empty row in the given đợt (or default đợt)
     */
    function _createRow(dotSo) {
        const row = {
            id: `row_${++_rowCounter}`,
            uploadedUrls: [],
            ncc: '',
            dotSo: dotSo || _defaultDotSo(),
        };

        // Auto-fill NCC = last NCC in same đợt + 1
        const lastNcc = [..._rows]
            .reverse()
            .find((r) => r.dotSo === row.dotSo && r.ncc && !isNaN(parseInt(r.ncc)));
        if (lastNcc) {
            row.ncc = String(parseInt(lastNcc.ncc) + 1);
        }

        return row;
    }

    /**
     * Open image manager modal — load existing data and group by đợt
     */
    async function open() {
        _rows = [];
        _searchNcc = '';
        _activeDotSo = null;
        _initialKey = new Set();

        try {
            const images = globalState.productImages || [];
            _knownDotSos = _buildKnownDotSos();

            // Collect (đợt, ncc) keys mapped by current shipments (visual hint only)
            const mappedKeys = new Set();
            if (typeof getAllDotHang === 'function') {
                getAllDotHang().forEach((dot) => {
                    if (dot.sttNCC) {
                        mappedKeys.add(`${dot.dotSo || 1}__${dot.sttNCC}`);
                    }
                });
            }

            images.forEach((img) => {
                const urls = typeof img.urls === 'string' ? JSON.parse(img.urls) : img.urls || [];
                if (urls.length === 0) return;

                const dotSo = img.dotSo || 1;
                const nccNum = img.ncc ? parseInt(img.ncc) : null;
                const isMapped = nccNum !== null && mappedKeys.has(`${dotSo}__${nccNum}`);

                // Snapshot original (date, dotSo, ncc) so save can detect cleared entries
                _initialKey.add(`${img.ngayDiHang || GLOBAL_LEGACY_DATE}__${dotSo}__${nccNum}`);

                _rows.push({
                    id: `row_${++_rowCounter}`,
                    uploadedUrls: [...urls],
                    ncc: img.ncc ? String(img.ncc) : '',
                    dotSo,
                    originalDate: img.ngayDiHang || GLOBAL_LEGACY_DATE,
                    mapped: isMapped,
                });
            });

            // Sort: đợt DESC, NCC ASC
            _rows.sort((a, b) => {
                if (a.dotSo !== b.dotSo) return b.dotSo - a.dotSo;
                return (parseInt(a.ncc) || 0) - (parseInt(b.ncc) || 0);
            });
        } catch (error) {
            console.error('[IMG-MGR] Error loading product images:', error);
            _knownDotSos = _buildKnownDotSos();
        }

        // Pick the active tab — latest đợt with data, or latest known shipment đợt, or 1
        const dotsWithRows = [...new Set(_rows.map((r) => r.dotSo))].sort((a, b) => b - a);
        _activeDotSo = dotsWithRows[0] || _defaultDotSo();

        // Always add one empty row in the active đợt for new input
        const newRow = _createRow(_activeDotSo);
        _rows.push(newRow);
        _focusedRowId = newRow.id;

        _render();
        openModal('modalImageManager');
    }

    /**
     * Collect distinct đợt numbers from current rows, sorted ASC.
     * Used to render the tab bar.
     */
    function _allDotSos() {
        const set = new Set(_rows.map((r) => r.dotSo));
        return Array.from(set).sort((a, b) => a - b);
    }

    /**
     * Count rows (NCC entries) in a given đợt — shown as a badge on each tab.
     */
    function _countRowsInDot(dotSo) {
        return _rows.filter((r) => r.dotSo === dotSo).length;
    }

    /**
     * Render modal content
     */
    function _render() {
        const body = document.getElementById('imageManagerBody');
        if (!body) return;

        // Ensure active tab exists; pick first available if not
        const dots = _allDotSos();
        if (!dots.includes(_activeDotSo)) {
            _activeDotSo = dots[0] || _defaultDotSo();
        }

        // Rows for active tab, optionally narrowed by NCC search
        const visibleRows = _rows.filter(
            (r) =>
                r.dotSo === _activeDotSo && (!_searchNcc || (r.ncc && r.ncc.includes(_searchNcc)))
        );

        const activeGroup = { dotSo: _activeDotSo, rows: visibleRows };

        body.innerHTML = `
            <div class="img-mgr-toolbar">
                <div class="img-mgr-hint">
                    <i data-lucide="info"></i>
                    Chọn tab Đợt → chọn hàng → dán ảnh (Ctrl+V) hoặc chọn file → nhập NCC.
                </div>
                ${_renderTabBar(dots)}
                <div class="img-mgr-filter-row">
                    <div class="img-mgr-search">
                        <i data-lucide="search"></i>
                        <input type="number" id="imgMgrSearchNcc" class="img-mgr-search-input"
                            placeholder="Tìm NCC trong Đợt ${_activeDotSo}..."
                            value="${_searchNcc}" min="1" autocomplete="off">
                    </div>
                </div>
            </div>
            <div class="img-mgr-rows">
                ${visibleRows.length > 0 ? _renderGroup(activeGroup) : _renderEmptyTab(_activeDotSo)}
            </div>
        `;

        // Search listener — NCC
        const searchInput = body.querySelector('#imgMgrSearchNcc');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                _searchNcc = e.target.value.trim();
                _render();
                document.getElementById('imgMgrSearchNcc')?.focus();
            });
        }

        _setupPasteHandler();

        // Wire input listeners (must do after innerHTML)
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

            const dotInput = body.querySelector(`#dot_${row.id}`);
            if (dotInput) {
                dotInput.value = row.dotSo;
                dotInput.addEventListener('change', (e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!n || n < 1) {
                        e.target.value = row.dotSo;
                        return;
                    }
                    row.dotSo = n;
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
     * Render a đợt group (header + its rows + add-row button)
     */
    function _renderGroup(group) {
        const isKnown = _knownDotSos.includes(group.dotSo);
        const badge = isKnown
            ? ''
            : ' <span class="img-mgr-dot-custom" title="Đợt tự nhập">tùy chỉnh</span>';

        return `
            <div class="img-mgr-group" data-dot-so="${group.dotSo}">
                <div class="img-mgr-group-header">
                    <i data-lucide="layers"></i>
                    <strong>Đợt ${group.dotSo}</strong>${badge}
                    <span class="img-mgr-group-count">${group.rows.length} NCC</span>
                </div>
                ${group.rows.map((row) => _renderRow(row)).join('')}
                <div class="img-mgr-group-footer">
                    <button class="img-mgr-group-add"
                            onclick="ImageManager.addRowInDot(${group.dotSo})"
                            title="Thêm NCC vào đợt ${group.dotSo}">
                        <i data-lucide="plus"></i> Thêm NCC vào Đợt ${group.dotSo}
                    </button>
                </div>
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
                            <label>Đợt</label>
                            <input type="number" id="dot_${row.id}" class="img-mgr-input"
                                placeholder="VD: 1" min="1" autocomplete="off"
                                title="Nhập số đợt — có thể tự đặt đợt mới">
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
     * Add a new row (default to latest đợt)
     */
    function addRow() {
        const row = _createRow();
        _rows.push(row);
        _focusedRowId = row.id;
        _render();
    }

    /**
     * Add a new row in a specific đợt (called from section header "Thêm NCC")
     */
    function addRowInDot(dotSo) {
        const row = _createRow(parseInt(dotSo, 10) || _defaultDotSo());
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
     * Save: group rows by đợt → PUT per đợt with {date=canonical, dotSo}.
     * Also clear stale (date, dotSo) entries whose rows have been moved/removed.
     *
     * For each đợt N we PUT all its rows to the canonical date for N. Server's
     * scoped DELETE removes rows for (canonicalDate, N) before INSERT — so prior
     * canonical-date rows are replaced cleanly.
     *
     * If a row was originally at (date X, dotSo N) but X != canonicalDate(N) — for
     * example legacy ảnh ngày 2026-04-10 mà giờ user move sang đợt 2 — we also send
     * a clear PUT for (X, originalDotSo) so the old slot doesn't leave a duplicate
     * behind.
     */
    async function save() {
        const loadingToast = window.notificationManager?.loading('Đang lưu...');

        try {
            // Group rows by dotSo
            const buckets = new Map(); // dotSo -> [{ncc, urls}]
            const seenInRows = new Set(); // `${date}__${dotSo}__${ncc}` for survivors

            _rows.forEach((r) => {
                if (r.uploadedUrls.length === 0) return;
                const nccNum = parseInt(r.ncc);
                if (!nccNum) return;
                const dotSo = parseInt(r.dotSo, 10) || _defaultDotSo();
                if (!buckets.has(dotSo)) buckets.set(dotSo, []);
                buckets.get(dotSo).push({ ncc: nccNum, urls: r.uploadedUrls });

                // Track survivor under (canonical date for dotSo, dotSo, ncc)
                const canonicalDate = _canonicalDateForDot(dotSo);
                seenInRows.add(`${canonicalDate}__${dotSo}__${nccNum}`);
            });

            // Issue one PUT per đợt (parallel; usually small number)
            const calls = [];
            buckets.forEach((rows, dotSo) => {
                const canonicalDate = _canonicalDateForDot(dotSo);
                calls.push(
                    productImagesApi.bulkSave(rows, { date: canonicalDate, dotSo }).catch((err) => {
                        console.error(`[IMG-MGR] Save đợt ${dotSo} failed:`, err);
                        throw err;
                    })
                );
            });

            // Clear original (date, dotSo) slots whose contents are no longer survivors
            // — but only if the canonical PUT above isn't already doing it.
            const orphanSlots = new Map(); // `${date}__${dotSo}` -> {date, dotSo}
            _initialKey.forEach((key) => {
                const [date, dotSoStr, _nccStr] = key.split('__');
                const dotSo = parseInt(dotSoStr, 10);
                const canonicalDate = _canonicalDateForDot(dotSo);
                // Already covered by the bucket PUT for this dotSo at canonicalDate
                if (date === canonicalDate && buckets.has(dotSo)) return;
                const slotKey = `${date}__${dotSo}`;
                if (!orphanSlots.has(slotKey)) {
                    orphanSlots.set(slotKey, { date, dotSo });
                }
            });
            orphanSlots.forEach(({ date, dotSo }) => {
                // For an orphan slot we don't have a list of surviving NCCs at (date, dotSo),
                // because rows now live elsewhere. Send empty rows[] → server clears the slot.
                calls.push(
                    productImagesApi.bulkSave([], { date, dotSo }).catch((err) => {
                        console.error(`[IMG-MGR] Clear slot ${date}/${dotSo} failed:`, err);
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

            // Refresh snapshot so next save doesn't re-clear
            _initialKey = seenInRows;
            // Update each row's originalDate to canonical (since DB now has them there)
            _rows.forEach((r) => {
                if (r.uploadedUrls.length === 0 || !parseInt(r.ncc)) return;
                r.originalDate = _canonicalDateForDot(parseInt(r.dotSo, 10) || _defaultDotSo());
            });

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
        addRowInDot,
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
