// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL IMAGE MANAGER - INVENTORY TRACKING
// Row-based input: each row = [images] + [NCC] + [đợt].
// Đợt is a plain integer (1, 2, 3, ...) — user can type a
// custom đợt even if no shipment exists yet for that đợt.
//
// Storage: server keys rows by (ngay_di_hang, dot_so, ncc).
// Client always uses GLOBAL_LEGACY_DATE for ngay_di_hang —
// it's a dead column kept for schema compat. Logical identity
// is (dot_so, ncc). See _canonicalDateForDot for rationale.
// =====================================================

const ImageManager = (() => {
    const GLOBAL_LEGACY_DATE = '2026-04-10'; // canonical save date — all rows live here
    let _rows = []; // [{ id, uploadedUrls, ncc, dotSo, mapped }]
    let _focusedRowId = null;
    let _isUploading = false;
    let _rowCounter = 0;
    let _searchNcc = ''; // NCC search filter
    let _activeDotSo = null; // active tab — only one đợt shown at a time
    let _knownDotSos = []; // distinct đợt numbers from shipments (DESC) — for "Đợt mới nhất" default
    let _initialKey = new Set(); // (dotSo, originalNgay) loaded at open — used to send empty PUT on clear
    let _modalOpen = false; // true between open() and modal-close
    let _saveInProgress = false; // true during save() — used to distinguish own SSE vs external
    let _externalChangeDetected = false; // set when SSE arrives while modal open AND not from our save
    let _originalDotContent = new Map(); // dotSo -> canonical content at open() — for dirty detection (skip unchanged đợt on save)

    /**
     * Canonical, order-independent serialization of one đợt's content
     * (NCCs + their image URLs). Used to detect whether a đợt actually changed
     * since the modal opened, so save() only re-PUTs đợt that were modified
     * instead of re-uploading the entire table on every save.
     */
    function _canonicalDotContent(entries) {
        return (entries || [])
            .map((e) => ({ ncc: parseInt(e.ncc, 10) || 0, urls: e.urls || [] }))
            .filter((e) => e.ncc > 0 && e.urls.length > 0)
            .sort((a, b) => a.ncc - b.ncc)
            .map((e) => e.ncc + '=' + e.urls.join(''))
            .join('');
    }

    /**
     * Canonical save date for a given đợt.
     *
     * Historically this picked "most-recent shipment date" per đợt, but that
     * created date drift: adding a new shipment between modal-open and save
     * shifted the canonical date, which made orphan-slot detection fragile
     * (mismatch could wipe untouched entries). The `ngay_di_hang` column is
     * just a storage detail — there's no business semantic for it beyond
     * keying rows. Locking it to one constant makes save logic deterministic.
     *
     * `dotSo` arg kept for API compat with existing callers but ignored.
     */
    function _canonicalDateForDot(/* dotSo */) {
        return GLOBAL_LEGACY_DATE;
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
        _modalOpen = true;
        _externalChangeDetected = false;

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

            // Snapshot each đợt's loaded content so save() can skip đợt that
            // weren't modified (instead of re-uploading the whole table).
            _originalDotContent = new Map();
            const _byDot = {};
            _rows.forEach((r) => {
                (_byDot[r.dotSo] = _byDot[r.dotSo] || []).push({
                    ncc: r.ncc,
                    urls: r.uploadedUrls,
                });
            });
            Object.keys(_byDot).forEach((d) => {
                _originalDotContent.set(parseInt(d, 10), _canonicalDotContent(_byDot[d]));
            });
        } catch (error) {
            console.error('[IMG-MGR] Error loading product images:', error);
            _knownDotSos = _buildKnownDotSos();
            // Leave _originalDotContent empty → save() treats every đợt as dirty
            // (safe fallback: behaves like the old full-save).
            _originalDotContent = new Map();
        }

        // Pick the active tab. Prefer the đợt currently selected in the
        // order-tracking view so the modal opens on the same đợt the user is
        // looking at (e.g. open from Đợt 3 → modal lands on Đợt 3). Fall back to
        // the latest đợt that has image rows, then the latest known đợt.
        const dotsWithRows = [...new Set(_rows.map((r) => r.dotSo))].sort((a, b) => b - a);
        const orderTrackingDot = parseInt(window.UIState?.getActiveDotTab?.(), 10);
        if (Number.isFinite(orderTrackingDot) && orderTrackingDot > 0) {
            _activeDotSo = orderTrackingDot;
        } else {
            _activeDotSo = dotsWithRows[0] || _defaultDotSo();
        }

        // Always add one empty row in the active đợt for new input
        const newRow = _createRow(_activeDotSo);
        _rows.push(newRow);
        _focusedRowId = newRow.id;

        _render();
        openModal('modalImageManager');
    }

    /**
     * Collect distinct đợt numbers for the tab bar, sorted ASC.
     *
     * Union of đợt that currently have rows + all known đợt (`_knownDotSos` =
     * shipments + saved product images). This keeps the image-manager tabs in
     * sync with the order-tracking đợt tabs: a đợt that has a shipment but no
     * images yet (e.g. a freshly-created Đợt 3) still shows up here so the user
     * can add images to it.
     */
    function _allDotSos() {
        const set = new Set(_rows.map((r) => r.dotSo));
        (_knownDotSos || []).forEach((d) => {
            const n = parseInt(d, 10);
            if (Number.isFinite(n) && n > 0) set.add(n);
        });
        return Array.from(set)
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
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
                    // Follow the row to its new đợt — otherwise it would disappear from view.
                    _activeDotSo = n;
                    _render();
                });
            }
        });

        if (window.lucide) lucide.createIcons();
        window.ImageCache?.applyTo?.(body);
    }

    /**
     * Render the horizontal tab bar with one tab per đợt + "+ Đợt mới" button.
     */
    function _renderTabBar(dots) {
        const tabs = dots
            .map((d) => {
                const isActive = d === _activeDotSo;
                const isKnown = _knownDotSos.includes(d);
                const count = _countRowsInDot(d);
                const customBadge = isKnown
                    ? ''
                    : '<span class="img-mgr-dot-custom" title="Đợt tùy chỉnh">★</span>';
                return `
                    <button class="img-mgr-tab ${isActive ? 'img-mgr-tab-active' : ''}"
                            onclick="ImageManager.switchTab(${d})"
                            title="Đợt ${d}">
                        <span>Đợt ${d}</span>
                        ${customBadge}
                        <span class="img-mgr-tab-count">${count}</span>
                    </button>
                `;
            })
            .join('');

        return `
            <div class="img-mgr-tabs" role="tablist">
                ${tabs}
                <button class="img-mgr-tab-new"
                        onclick="ImageManager.promptNewDot()"
                        title="Tạo đợt mới">
                    <i data-lucide="plus"></i> <span>Đợt mới</span>
                </button>
            </div>
        `;
    }

    /**
     * Empty state for the currently-active tab (no rows match filters or
     * the đợt has no entries yet).
     */
    function _renderEmptyTab(dotSo) {
        const hasSearch = !!_searchNcc;
        return `
            <div class="img-mgr-empty">
                <i data-lucide="image-off"></i>
                <div>
                    ${
                        hasSearch
                            ? `Không có NCC nào khớp <strong>"${_searchNcc}"</strong> trong Đợt ${dotSo}`
                            : `Đợt ${dotSo} chưa có NCC nào`
                    }
                </div>
                <button class="btn btn-outline" style="margin-top:12px"
                        onclick="ImageManager.addRowInDot(${dotSo})">
                    <i data-lucide="plus"></i> Thêm NCC vào Đợt ${dotSo}
                </button>
            </div>
        `;
    }

    /**
     * Switch active tab — called from tab button click.
     */
    function switchTab(dotSo) {
        const n = parseInt(dotSo, 10);
        if (!n || n < 1) return;
        if (n === _activeDotSo) return;
        _activeDotSo = n;
        _searchNcc = ''; // reset NCC filter when changing đợt
        _render();
    }

    /**
     * Prompt for a brand-new đợt number, then create an empty row in it
     * and switch the active tab there.
     */
    function promptNewDot() {
        const existing = _allDotSos();
        const suggested = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        const raw = prompt(`Tạo đợt mới (gợi ý: ${suggested}):`, String(suggested));
        if (raw === null) return;
        const n = parseInt(String(raw).trim(), 10);
        if (!n || n < 1) {
            window.notificationManager?.error('Số đợt phải là số nguyên >= 1');
            return;
        }
        if (existing.includes(n)) {
            _activeDotSo = n; // just switch
            _render();
            return;
        }
        const row = _createRow(n);
        _rows.push(row);
        _focusedRowId = row.id;
        _activeDotSo = n;
        _render();
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
     * Add a new row in the currently active đợt tab.
     */
    function addRow() {
        const row = _createRow(_activeDotSo || _defaultDotSo());
        _rows.push(row);
        _focusedRowId = row.id;
        _render();
    }

    /**
     * Add a new row in a specific đợt (called from group footer button or
     * empty-tab CTA). Also switches the active tab to that đợt.
     */
    function addRowInDot(dotSo) {
        const n = parseInt(dotSo, 10) || _defaultDotSo();
        const row = _createRow(n);
        _rows.push(row);
        _focusedRowId = row.id;
        _activeDotSo = n;
        _render();
    }

    /**
     * Remove a row (with confirm if has images)
     */
    async function removeRow(rowId) {
        const row = _rows.find((r) => r.id === rowId);
        if (row && row.uploadedUrls.length > 0) {
            if (
                !(await window.notificationManager.confirm(
                    `Xóa NCC ${row.ncc || '?'} và ${row.uploadedUrls.length} ảnh?`,
                    'Xóa NCC'
                ))
            )
                return;
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
        // Hard limit on source image area to avoid OOM/tab crash when user
        // pastes screenshots from ultra-high-res displays. Above this we
        // reject — drawImage can't safely render a > ~268M-pixel source
        // anyway, and the resized output wouldn't gain quality.
        const MAX_SOURCE_PIXELS = 60_000_000; // ~7745 × 7745, plenty for any phone/DSLR.

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                const srcPixels = img.width * img.height;
                if (srcPixels > MAX_SOURCE_PIXELS) {
                    reject(
                        new Error(
                            `Ảnh quá lớn (${img.width}x${img.height} = ${(srcPixels / 1e6).toFixed(0)}MP), giới hạn 60MP`
                        )
                    );
                    return;
                }

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

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Không decode được ảnh'));
            };
            img.src = url;
        });
    }

    /**
     * Remove an image from a row (with confirm)
     */
    async function removeImage(rowId, imageIdx) {
        const row = _rows.find((r) => r.id === rowId);
        if (!row || imageIdx >= row.uploadedUrls.length) return;

        if (!(await window.notificationManager.confirm('Xóa ảnh này?', 'Xóa ảnh'))) return;

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
        // Guard 1: don't save while paste/upload encoding is mid-flight.
        // Image base64 conversion is async; if user clicks Save during a paste of
        // many images, the row.uploadedUrls array is still growing — saving now
        // would drop the not-yet-encoded images.
        if (_isUploading) {
            window.notificationManager?.warning('Đang xử lý ảnh paste — đợi xong rồi bấm Lưu lại');
            return;
        }

        // Guard 2: if SSE detected a concurrent update from another user/tab,
        // refuse to save and force a reload first — otherwise this save would
        // overwrite the other user's changes (last-write-wins lost-update race).
        if (_externalChangeDetected) {
            const ok = confirm(
                '⚠ User khác vừa cập nhật ảnh sản phẩm trong lúc bạn đang mở modal.\n\n' +
                    'Nếu Lưu bây giờ, cập nhật của họ sẽ bị ghi đè.\n\n' +
                    'OK = Đóng modal + reload (an toàn)\nCancel = Tiếp tục Lưu (ghi đè)'
            );
            if (ok) {
                _modalOpen = false;
                closeModal('modalImageManager');
                if (typeof loadProductImages === 'function') await loadProductImages();
                if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
                return;
            }
            // User insists — clear flag and proceed.
            _externalChangeDetected = false;
        }

        _saveInProgress = true;
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

            // Issue one PUT per đợt — but ONLY for đợt that actually changed since
            // open(). Re-uploading an unchanged đợt (all its NCC base64) just to
            // have the server DELETE+INSERT identical rows is the main reason save
            // felt slow. Skipping them means editing 1 image in 1 đợt no longer
            // re-writes every other đợt.
            const calls = [];
            let changedDotCount = 0;
            buckets.forEach((rows, dotSo) => {
                const currentContent = _canonicalDotContent(rows);
                const originalContent = _originalDotContent.get(dotSo);
                if (originalContent !== undefined && currentContent === originalContent) {
                    return; // unchanged — skip the PUT entirely
                }
                changedDotCount++;
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

            await Promise.all(calls);

            // Rebuild globalState.productImages from in-memory rows instead of a
            // server response. _rows holds every đợt loaded at open() minus
            // removed/moved rows, so the survivors below are exactly the post-save
            // DB state. This avoids downloading + parsing the whole image table
            // (all base64) on every save — the other half of the slowness.
            globalState.productImages = _rows
                .filter((r) => r.uploadedUrls.length > 0 && parseInt(r.ncc))
                .map((r) => ({
                    ngayDiHang: GLOBAL_LEGACY_DATE,
                    dotSo: parseInt(r.dotSo, 10) || _defaultDotSo(),
                    ncc: parseInt(r.ncc),
                    urls: [...r.uploadedUrls],
                }));

            const totalRows = Array.from(buckets.values()).reduce((s, b) => s + b.length, 0);
            if (calls.length === 0) {
                window.notificationManager?.success('Không có thay đổi để lưu');
            } else {
                window.notificationManager?.success(
                    totalRows > 0
                        ? `Đã lưu ${changedDotCount} đợt (${totalRows} NCC tổng)`
                        : 'Đã xóa tất cả ảnh sản phẩm'
                );
            }

            // Refresh snapshot so next save doesn't re-clear
            _initialKey = seenInRows;
            // Refresh per-đợt content snapshot so a second save in the same
            // session correctly detects only the newly-changed đợt.
            _originalDotContent = new Map();
            const _byDotAfter = {};
            _rows.forEach((r) => {
                if (r.uploadedUrls.length === 0 || !parseInt(r.ncc)) return;
                const d = parseInt(r.dotSo, 10) || _defaultDotSo();
                (_byDotAfter[d] = _byDotAfter[d] || []).push({ ncc: r.ncc, urls: r.uploadedUrls });
            });
            Object.keys(_byDotAfter).forEach((d) => {
                _originalDotContent.set(parseInt(d, 10), _canonicalDotContent(_byDotAfter[d]));
            });
            // Update each row's originalDate to canonical (since DB now has them there)
            // Refresh each surviving row's originalDate to the canonical date
            // (now constant). Future calls to `removeRow` / `removeImage` that
            // happen before modal close still need a consistent originalDate
            // so the next save's orphan logic compares cleanly.
            _rows.forEach((r) => {
                if (r.uploadedUrls.length === 0 || !parseInt(r.ncc)) return;
                r.originalDate = GLOBAL_LEGACY_DATE;
            });

            // Rebuild the order-tracking đợt tabs so a đợt created here (image-only,
            // no shipment yet) shows up there too (two-way sync). applyFiltersAndRender
            // alone doesn't rebuild the tab bar.
            if (window.DotTabs?.render) window.DotTabs.render();
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        } catch (error) {
            console.error('[IMG-MGR] Save error:', error);
            window.notificationManager?.error('Không thể lưu: ' + error.message);
        } finally {
            window.notificationManager?.remove(loadingToast);
            // Give the SSE event a brief grace window to flush before clearing
            // the flag — otherwise our own save's notify might be misclassified
            // as "external" and re-trigger the concurrent-edit guard.
            setTimeout(() => {
                _saveInProgress = false;
            }, 1500);
        }
    }

    /**
     * Called by data-loader SSE handler when product_images update arrives.
     * If the modal is open AND the update did NOT originate from our own save,
     * flag it so the next save() can warn the user about lost-update risk.
     */
    function _onExternalUpdate() {
        if (!_modalOpen) return;
        if (_saveInProgress) return; // our own save just echoed back via SSE
        if (_externalChangeDetected) return; // already warned, skip toast spam
        _externalChangeDetected = true;
        window.notificationManager?.warning(
            'User khác vừa sửa ảnh sản phẩm. Bấm Lưu sẽ ghi đè — nên Đóng modal và mở lại.',
            { duration: 0 }
        );
    }

    /**
     * Called when the modal is closed (any reason). Resets state so the next
     * open() starts clean and SSE handler stops calling _onExternalUpdate.
     */
    function _onClose() {
        _modalOpen = false;
        _externalChangeDetected = false;
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
        switchTab,
        promptNewDot,
        _onExternalUpdate,
        _onClose,
        _openLightbox,
        _closeLightbox,
        _navLightbox,
    };
})();

console.log('[IMG-MGR] Image Manager initialized');
