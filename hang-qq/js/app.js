// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Hàng QQ - Quản lý hàng Hương Châu
 * Data stored in PostgreSQL via Render API
 * localStorage key: hangQQ_data (cache only)
 */

(function () {
    'use strict';

    // ===== Constants =====
    const LS_KEY = 'hangQQ_data';
    const API_BASE = 'https://n2store-fallback.onrender.com/api/hang-qq';
    const PAGE_SIZE = 50;

    // ===== Editable field config =====
    const EDITABLE_FIELDS = [
        { key: 'ngayDiHang', type: 'date', label: 'Ngày đi hàng' },
        { key: 'soLuong', type: 'number', label: 'SL' },
        { key: 'soKg', type: 'number', label: 'Kg', step: '0.1' },
        { key: 'moTa', type: 'text', label: 'Mô tả' },
        { key: 'soTien', type: 'number', label: 'Tiền ¥', step: '0.01' },
        { key: 'slNhan', type: 'number', label: 'SL nhận' },
        { key: 'thieu', type: 'number', label: 'Thiếu' },
        { key: 'chiPhi', type: 'number', label: 'CP hàng về', step: '0.01' },
        { key: 'ghiChu', type: 'text', label: 'Ghi chú' },
        { key: 'ngayTT', type: 'date', label: 'Ngày TT' },
        { key: 'soTienTT', type: 'number', label: 'Tiền TT', step: '0.01' },
        { key: 'soTienVND', type: 'number', label: 'Tiền VND' },
    ];

    // ===== State =====
    let allData = [];
    let filteredData = [];
    let currentPage = 1;
    let sortField = 'ngayDiHang';
    let sortDir = 'desc';
    let editingId = null;
    let productImages = [];
    let invoiceImages = [];
    let activeInlineCell = null; // track currently editing cell

    // ===== DOM refs =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        emptyState: null,
        pagination: null,
        searchInput: null,
        filterMonth: null,
        filterStatus: null,
        filterDone: null,
        modalOverlay: null,
        importOverlay: null,
        imageViewerOverlay: null,
    };

    // ===== Init =====
    document.addEventListener('DOMContentLoaded', async () => {
        cacheElements();
        bindEvents();
        initPasteSupport();
        await loadData();
        renderAll();
    });

    function cacheElements() {
        els.emptyState = $('#emptyState');
        els.pagination = $('#pagination');
        els.searchInput = $('#searchInput');
        els.filterMonth = $('#filterMonth');
        els.filterStatus = $('#filterStatus');
        els.filterDone = $('#filterDone');
        els.modalOverlay = $('#modalOverlay');
        els.importOverlay = $('#importOverlay');
        els.imageViewerOverlay = $('#imageViewerOverlay');
    }

    function initLucide() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            setTimeout(initLucide, 200);
        }
    }

    // ===== API =====
    async function apiRequest(method, path = '', body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(`${API_BASE}${path}`, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || res.statusText);
        }
        return res.json();
    }

    async function loadData() {
        try {
            const result = await apiRequest('GET');
            allData = result.data || [];
            saveToLocalStorage();
        } catch (e) {
            console.warn('API load failed, using localStorage:', e.message);
            const cached = localStorage.getItem(LS_KEY);
            if (cached) {
                try { allData = JSON.parse(cached); } catch (_) { allData = []; }
            }
        }
    }

    function saveToLocalStorage() {
        localStorage.setItem(LS_KEY, JSON.stringify(allData));
    }

    async function saveEntry(entry) {
        if (entry.id) {
            const result = await apiRequest('PUT', `/${entry.id}`, entry);
            return result.data;
        }
        const result = await apiRequest('POST', '', entry);
        return result.data;
    }

    async function patchEntry(id, fields) {
        const result = await apiRequest('PATCH', `/${id}`, fields);
        return result.data;
    }

    async function deleteEntry(id) {
        await apiRequest('DELETE', `/${id}`);
        allData = allData.filter((d) => d.id !== id);
        saveToLocalStorage();
    }

    // ===== Event Bindings =====
    function bindEvents() {
        // Header buttons
        $('#btnAdd').addEventListener('click', () => openModal());
        $('#btnImportExcel').addEventListener('click', () => openImportModal());
        $('#btnExport').addEventListener('click', exportToExcel);
        $('#btnRefresh').addEventListener('click', async () => {
            await loadData();
            renderAll();
            showToast('Đã tải lại dữ liệu', 'success');
        });

        // Search & filter
        els.searchInput.addEventListener('input', debounce(() => { currentPage = 1; renderAll(); }, 300));
        els.filterMonth.addEventListener('change', () => { currentPage = 1; renderAll(); });
        els.filterStatus.addEventListener('change', () => { currentPage = 1; renderAll(); });
        els.filterDone.addEventListener('change', () => { currentPage = 1; renderAll(); });

        // Sorting
        $$('.sortable').forEach((th) => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (sortField === field) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortField = field;
                    sortDir = 'asc';
                }
                renderAll();
            });
        });

        // Modal: Add/Edit
        $('#btnCloseModal').addEventListener('click', closeModal);
        $('#btnCancelModal').addEventListener('click', closeModal);
        $('#btnSaveEntry').addEventListener('click', handleSave);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });

        // Image uploads
        $('#fImgProduct').addEventListener('change', (e) => handleImageSelect(e, 'product'));
        $('#fImgInvoice').addEventListener('change', (e) => handleImageSelect(e, 'invoice'));

        // Import modal
        $('#btnCloseImport').addEventListener('click', closeImportModal);
        $('#btnCancelImport').addEventListener('click', closeImportModal);
        els.importOverlay.addEventListener('click', (e) => {
            if (e.target === els.importOverlay) closeImportModal();
        });

        // Import dropzone
        const dropzone = $('#importDropzone');
        dropzone.addEventListener('click', () => $('#importFileInput').click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleImportFile(file);
        });
        $('#importFileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) handleImportFile(e.target.files[0]);
        });

        $('#btnConfirmImport').addEventListener('click', confirmImport);

        // Image viewer
        $('#btnCloseViewer').addEventListener('click', closeImageViewer);
        els.imageViewerOverlay.addEventListener('click', (e) => {
            if (e.target === els.imageViewerOverlay) closeImageViewer();
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (activeInlineCell) { cancelInlineEdit(); return; }
                closeModal();
                closeImportModal();
                closeImageViewer();
            }
        });

        // Click outside inline edit to save
        document.addEventListener('click', (e) => {
            if (activeInlineCell && !e.target.closest('.inline-editing') && !e.target.closest('.inline-input')) {
                commitInlineEdit();
            }
        });
    }

    // ===== Render =====
    function renderAll() {
        applyFilters();
        applySorting();
        renderTable();
        renderPagination();
        renderStats();
        updateSortHeaders();
        populateMonthFilter();
    }

    function applyFilters() {
        const search = (els.searchInput.value || '').toLowerCase().trim();
        const month = els.filterMonth.value;
        const status = els.filterStatus.value;
        const doneFilter = els.filterDone.value;

        filteredData = allData.filter((item) => {
            if (search) {
                const searchableText = [item.moTa, item.ghiChu, item.stt, item.ngayDiHang]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!searchableText.includes(search)) return false;
            }
            if (month && item.ngayDiHang) {
                if (item.ngayDiHang.slice(0, 7) !== month) return false;
            }
            if (status) {
                const paid = parseNum(item.soTienTT);
                const total = parseNum(item.soTien);
                if (status === 'paid' && (paid <= 0 || paid < total)) return false;
                if (status === 'unpaid' && paid > 0) return false;
                if (status === 'partial' && (paid <= 0 || paid >= total)) return false;
            }
            if (doneFilter === 'done' && !item.done) return false;
            if (doneFilter === 'undone' && item.done) return false;
            return true;
        });
    }

    function applySorting() {
        filteredData.sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];
            if (['soTien', 'chiPhi', 'soTienTT', 'soTienVND', 'soLuong', 'soKg'].includes(sortField)) {
                valA = parseNum(valA);
                valB = parseNum(valB);
            } else {
                valA = (valA || '').toString();
                valB = (valB || '').toString();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            // Secondary sort: by id ascending (keep insert order within same date)
            return (a.id || 0) - (b.id || 0);
        });
    }

    // Track collapsed date groups (default = all expanded)
    const collapsedDates = new Set();

    function makeDateId(dateKey) {
        return 'dg_' + dateKey.replace(/[^a-zA-Z0-9]/g, '_');
    }

    function renderTable() {
        const listEl = $('#dateGroupList');
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageData = filteredData.slice(start, start + PAGE_SIZE);

        if (pageData.length === 0) {
            listEl.innerHTML = '';
            els.emptyState.style.display = 'block';
            if (allData.length > 0 && filteredData.length === 0) {
                els.emptyState.querySelector('p').innerHTML = 'Không tìm thấy kết quả phù hợp.';
            }
            return;
        }

        els.emptyState.style.display = 'none';

        // Pagination info
        const end = Math.min(start + PAGE_SIZE, filteredData.length);
        const infoEl = $('#paginationInfo');
        if (infoEl) {
            infoEl.innerHTML = `Hiển thị <strong>${start + 1} - ${end}</strong> trên <strong>${filteredData.length}</strong> vận đơn`;
        }

        // Group by date
        const groups = [];
        let lastDate = null;
        pageData.forEach((item, idx) => {
            const dateKey = item.ngayDiHang || '_nodate';
            if (dateKey !== lastDate) {
                groups.push({ date: dateKey, items: [] });
                lastDate = dateKey;
            }
            groups[groups.length - 1].items.push({ item, globalIdx: start + idx + 1 });
        });

        let html = '';

        groups.forEach((group) => {
            const dateId = makeDateId(group.date);
            const isCollapsed = collapsedDates.has(group.date);
            const dateDisplay = group.date === '_nodate' ? 'Không có ngày' : formatDate(group.date);
            const count = group.items.length;
            const groupTotal = group.items.reduce((s, g) => s + parseNum(g.item.soTien), 0);

            html += `<div class="dg-section" id="${dateId}">`;

            // Header
            html += `<div class="dg-header" data-datekey="${group.date}">
                <span class="material-symbols-outlined dg-arrow ${isCollapsed ? '' : 'dg-expanded'}">chevron_right</span>
                <span class="dg-date">${dateDisplay}</span>
                <span class="dg-count">${count} đơn</span>
                <span class="dg-total">¥ ${formatMoney(groupTotal)}</span>
                <button class="dg-add-btn" data-date="${group.date}" title="Thêm dòng vào ${dateDisplay}">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>`;

            // Column header row
            html += `<div class="dg-items ${isCollapsed ? 'collapsed' : ''}">`;
            html += `<div class="dg-item dg-col-header">
                <div class="col-sl">SL</div>
                <div class="col-kg">SỐ KG</div>
                <div class="col-x">X</div>
                <div class="col-stt">STT</div>
                <div class="col-product">SẢN PHẨM</div>
                <div class="col-money">SỐ TIỀN</div>
                <div class="col-slnhan">SL</div>
                <div class="col-thieu">THIẾU</div>
                <div class="col-cp">CP HÀNG VỀ</div>
                <div class="col-note">GHI CHÚ</div>
                <div class="col-actions"></div>
            </div>`;

            group.items.forEach(({ item, globalIdx }) => {
                const id = item.id;
                const thieuVal = parseNum(item.thieu);
                const cpVal = parseNum(item.chiPhi);
                const slNhan = parseNum(item.slNhan);

                html += `<div class="dg-item ${item.done ? 'row-done' : ''}" data-id="${id}">
                    <div class="col-sl editable-cell" data-id="${id}" data-field="soLuong">${item.soLuong || ''}</div>
                    <div class="col-kg editable-cell" data-id="${id}" data-field="soKg">${item.soKg || ''}</div>
                    <div class="col-x"><input type="checkbox" class="done-check" data-id="${id}" ${item.done ? 'checked' : ''}></div>
                    <div class="col-stt editable-cell" data-id="${id}" data-field="stt">${escHtml(item.stt || '')}</div>
                    <div class="col-product editable-cell" data-id="${id}" data-field="moTa">${escHtml(item.moTa || '')}</div>
                    <div class="col-money editable-cell" data-id="${id}" data-field="soTien">${formatMoney(item.soTien)}</div>
                    <div class="col-slnhan editable-cell" data-id="${id}" data-field="slNhan">${slNhan || ''}</div>
                    <div class="col-thieu editable-cell" data-id="${id}" data-field="thieu">${thieuVal || ''}</div>
                    <div class="col-cp editable-cell" data-id="${id}" data-field="chiPhi">${cpVal ? formatMoney(item.chiPhi) : ''}</div>
                    <div class="col-note editable-cell" data-id="${id}" data-field="ghiChu">${escHtml(item.ghiChu || '')}</div>
                    <div class="col-actions">
                        <button class="row-del-btn" onclick="HangQQ.del('${id}')" title="Xóa">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>`;
            });

            html += `</div></div>`; // close dg-items + dg-section
        });

        listEl.innerHTML = html;

        // Bind date group toggles + add buttons
        listEl.querySelectorAll('.dg-header').forEach((hdr) => {
            hdr.addEventListener('click', (e) => {
                const addBtn = e.target.closest('.dg-add-btn');
                if (addBtn) {
                    e.stopPropagation();
                    addRowInGroup(addBtn.getAttribute('data-date'));
                    return;
                }
                toggleDateGroup(hdr.getAttribute('data-datekey'));
            });
        });

        // Bind inline edit
        listEl.querySelectorAll('.editable-cell').forEach((cell) => {
            cell.addEventListener('dblclick', () => startInlineEdit(cell));
        });

        // Bind done checkboxes
        listEl.querySelectorAll('.done-check').forEach((cb) => {
            cb.addEventListener('change', () => toggleDone(cb.dataset.id, cb.checked));
        });
    }

    let addingRow = false;
    async function addRowInGroup(dateKey) {
        if (addingRow) return;
        addingRow = true;

        // Ensure group stays expanded
        collapsedDates.delete(dateKey);

        const entry = {
            ngayDiHang: dateKey === '_nodate' ? null : dateKey,
            soLuong: null, soKg: null, stt: '', moTa: '', soTien: 0,
            slNhan: null, thieu: null, chiPhi: 0, ghiChu: '',
            ngayTT: null, soTienTT: 0, soTienVND: 0,
            productImages: [], invoiceImages: [],
        };

        try {
            const saved = await saveEntry(entry);
            allData.push(saved);
            saveToLocalStorage();
            renderAll();

            // Scroll to new row, highlight it, and auto-focus product field
            requestAnimationFrame(() => {
                const newRow = document.querySelector(`.dg-item[data-id="${saved.id}"]`);
                if (newRow) {
                    newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    newRow.classList.add('row-new');
                    setTimeout(() => newRow.classList.remove('row-new'), 2000);

                    // Auto start inline edit on product (moTa) cell
                    const moTaCell = newRow.querySelector('[data-field="moTa"]');
                    if (moTaCell) {
                        setTimeout(() => startInlineEdit(moTaCell), 300);
                    }
                }
            });
        } catch (e) {
            console.error('addRowInGroup error:', e);
            showToast('Lỗi thêm dòng: ' + e.message, 'error');
        } finally {
            addingRow = false;
        }
    }

    function toggleDateGroup(dateKey) {
        const dateId = makeDateId(dateKey);
        const isCollapsed = collapsedDates.has(dateKey);

        if (isCollapsed) {
            collapsedDates.delete(dateKey);
        } else {
            collapsedDates.add(dateKey);
        }
        const nowCollapsed = !isCollapsed;

        const section = document.getElementById(dateId);
        if (!section) return;

        const items = section.querySelector('.dg-items');
        if (items) items.classList.toggle('collapsed', nowCollapsed);

        const arrow = section.querySelector('.dg-arrow');
        if (arrow) arrow.classList.toggle('dg-expanded', !nowCollapsed);
    }

    // ===== Inline Edit =====
    function startInlineEdit(cell) {
        if (activeInlineCell) commitInlineEdit();

        const id = cell.dataset.id;
        const field = cell.dataset.field;
        const item = allData.find((d) => String(d.id) === String(id));
        if (!item) return;

        const fieldConfig = EDITABLE_FIELDS.find((f) => f.key === field);
        if (!fieldConfig) return;

        activeInlineCell = { cell, id, field, originalValue: item[field] };
        cell.classList.add('inline-editing');

        const rawValue = item[field] || '';
        let inputHtml;

        if (fieldConfig.type === 'date') {
            inputHtml = `<input type="date" class="inline-input" value="${rawValue}">`;
        } else if (fieldConfig.type === 'number') {
            const step = fieldConfig.step || '1';
            inputHtml = `<input type="number" class="inline-input" value="${parseNum(rawValue) || ''}" step="${step}">`;
        } else {
            inputHtml = `<input type="text" class="inline-input" value="${escAttr(String(rawValue))}">`;
        }

        cell.innerHTML = inputHtml;
        const input = cell.querySelector('.inline-input');
        input.focus();
        if (fieldConfig.type === 'text') input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); }
            if (e.key === 'Tab') {
                e.preventDefault();
                commitInlineEdit();
                // Move to next editable cell
                const allCells = [...els.tableBody.querySelectorAll('.editable-cell')];
                const currentIdx = allCells.indexOf(cell);
                const nextCell = allCells[e.shiftKey ? currentIdx - 1 : currentIdx + 1];
                if (nextCell) startInlineEdit(nextCell);
            }
        });
    }

    async function commitInlineEdit() {
        if (!activeInlineCell) return;

        const { cell, id, field, originalValue } = activeInlineCell;
        const input = cell.querySelector('.inline-input');
        if (!input) { cancelInlineEdit(); return; }

        let newValue = input.value;
        const fieldConfig = EDITABLE_FIELDS.find((f) => f.key === field);

        // Convert to number for number fields
        if (fieldConfig && fieldConfig.type === 'number') {
            newValue = newValue ? parseFloat(newValue) : '';
        }

        activeInlineCell = null;
        cell.classList.remove('inline-editing');

        // If unchanged, just restore display
        if (String(newValue) === String(originalValue || '')) {
            restoreCellDisplay(cell, field, originalValue);
            return;
        }

        // Optimistic update
        const item = allData.find((d) => String(d.id) === String(id));
        if (item) item[field] = newValue;
        restoreCellDisplay(cell, field, newValue);
        cell.classList.add('cell-saving');

        try {
            const updated = await patchEntry(id, { [field]: newValue === '' ? null : newValue });
            // Sync returned data
            if (item) Object.assign(item, updated);
            saveToLocalStorage();
            cell.classList.remove('cell-saving');
            cell.classList.add('cell-saved');
            setTimeout(() => cell.classList.remove('cell-saved'), 800);
            renderStats();
        } catch (e) {
            // Revert on error
            if (item) item[field] = originalValue;
            restoreCellDisplay(cell, field, originalValue);
            cell.classList.remove('cell-saving');
            cell.classList.add('cell-error');
            setTimeout(() => cell.classList.remove('cell-error'), 1500);
            showToast('Lỗi lưu: ' + e.message, 'error');
        }
    }

    function cancelInlineEdit() {
        if (!activeInlineCell) return;
        const { cell, field, originalValue } = activeInlineCell;
        activeInlineCell = null;
        cell.classList.remove('inline-editing');
        restoreCellDisplay(cell, field, originalValue);
    }

    function restoreCellDisplay(cell, field, value) {
        const fieldConfig = EDITABLE_FIELDS.find((f) => f.key === field);
        if (!fieldConfig) { cell.textContent = value || ''; return; }

        if (fieldConfig.type === 'date') {
            cell.textContent = formatDate(value);
        } else if (fieldConfig.type === 'number' && ['soTien', 'chiPhi', 'soTienTT', 'soTienVND'].includes(field)) {
            cell.textContent = formatMoney(value);
        } else {
            cell.textContent = value || '';
        }
    }

    // ===== Toggle Done =====
    async function toggleDone(id, done) {
        const item = allData.find((d) => String(d.id) === String(id));
        if (!item) return;

        item.done = done;
        const row = document.querySelector(`.dg-item[data-id="${id}"]`);
        if (row) row.classList.toggle('row-done', done);

        try {
            await patchEntry(id, { done });
            saveToLocalStorage();
        } catch (e) {
            item.done = !done;
            if (row) row.classList.toggle('row-done', !done);
            const cb = row ? row.querySelector('.done-check') : null;
            if (cb) cb.checked = !done;
            showToast('Lỗi: ' + e.message, 'error');
        }
    }

    function renderImgThumb(images, type, id) {
        if (!images || images.length === 0) return '';
        const first = images[0];
        let html = `<div class="meta-media">`;
        html += `<div class="meta-media-thumb" onclick="HangQQ.viewImg('${escAttr(first)}')"><img src="${first}" alt="${type}"></div>`;
        if (images.length > 1) {
            html += `<div class="meta-media-more" onclick="HangQQ.viewImg('${escAttr(images[1])}')">+${images.length - 1}</div>`;
        }
        html += `</div>`;
        return html;
    }

    function renderPagination() {
        const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
        const footer = $('#paginationFooter');
        if (totalPages <= 1) {
            els.pagination.innerHTML = '';
            if (footer) footer.style.display = filteredData.length > 0 ? 'flex' : 'none';
            return;
        }
        if (footer) footer.style.display = 'flex';

        let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="HangQQ.goPage(${currentPage - 1})"><span class="material-symbols-outlined text-sm">chevron_left</span></button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
                if (i === currentPage - 3 || i === currentPage + 3) html += '<button disabled>…</button>';
                continue;
            }
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="HangQQ.goPage(${i})">${i}</button>`;
        }
        html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="HangQQ.goPage(${currentPage + 1})"><span class="material-symbols-outlined text-sm">chevron_right</span></button>`;
        els.pagination.innerHTML = html;
    }

    function renderStats() {
        const totalOrders = filteredData.filter((d) => d.moTa).length;
        const totalCNY = filteredData.reduce((s, d) => s + parseNum(d.soTien), 0);
        const totalPaid = filteredData.reduce((s, d) => s + parseNum(d.soTienTT), 0);
        const totalVND = filteredData.reduce((s, d) => s + parseNum(d.soTienVND), 0);
        const totalCostVND = filteredData.reduce((s, d) => s + parseNum(d.chiPhi), 0);

        $('#statTotalOrders').textContent = totalOrders.toLocaleString('vi-VN');
        $('#statTotalCNY').textContent = '¥' + totalCNY.toLocaleString('vi-VN');
        $('#statTotalPaid').textContent = '¥' + totalPaid.toLocaleString('vi-VN');
        const remaining = totalVND - totalCostVND;
        $('#statRemaining').textContent = remaining.toLocaleString('vi-VN') + 'đ';
    }

    function updateSortHeaders() {
        $$('.sortable').forEach((th) => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === sortField) {
                th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    function populateMonthFilter() {
        const months = new Set();
        allData.forEach((d) => {
            if (d.ngayDiHang) {
                const m = d.ngayDiHang.slice(0, 7);
                if (m) months.add(m);
            }
        });

        const current = els.filterMonth.value;
        const sorted = [...months].sort().reverse();
        els.filterMonth.innerHTML = '<option value="">Tất cả tháng</option>' +
            sorted.map((m) => `<option value="${m}" ${m === current ? 'selected' : ''}>${formatMonth(m)}</option>`).join('');
    }

    // ===== Modal: Add/Edit =====
    function openModal(entry = null) {
        editingId = entry ? entry.id : null;
        productImages = entry ? (entry.productImages || []).slice() : [];
        invoiceImages = entry ? (entry.invoiceImages || []).slice() : [];

        $('#modalTitle').textContent = entry ? 'Sửa đơn hàng' : 'Thêm đơn hàng';
        $('#entryId').value = editingId || '';
        $('#fNgayDiHang').value = entry ? entry.ngayDiHang || '' : '';
        $('#fSoLuong').value = entry ? entry.soLuong || '' : '';
        $('#fSoKg').value = entry ? entry.soKg || '' : '';
        $('#fStt').value = entry ? entry.stt || '' : '';
        $('#fMoTa').value = entry ? entry.moTa || '' : '';
        $('#fSoTien').value = entry ? entry.soTien || '' : '';
        $('#fSlNhan').value = entry ? entry.slNhan || '' : '';
        $('#fThieu').value = entry ? entry.thieu || '' : '';
        $('#fChiPhi').value = entry ? entry.chiPhi || '' : '';
        $('#fGhiChu').value = entry ? entry.ghiChu || '' : '';
        $('#fNgayTT').value = entry ? entry.ngayTT || '' : '';
        $('#fSoTienTT').value = entry ? entry.soTienTT || '' : '';
        $('#fSoTienVND').value = entry ? entry.soTienVND || '' : '';

        renderImagePreviews();
        els.modalOverlay.classList.add('active');
        setTimeout(() => $('#fNgayDiHang').focus(), 250);
    }

    function closeModal() {
        els.modalOverlay.classList.remove('active');
        editingId = null;
        productImages = [];
        invoiceImages = [];
        $('#formEntry').reset();
        $('#previewProduct').innerHTML = '';
        $('#previewInvoice').innerHTML = '';
    }

    async function handleSave() {
        const entry = {
            ngayDiHang: $('#fNgayDiHang').value || '',
            soLuong: parseNum($('#fSoLuong').value) || '',
            soKg: parseNum($('#fSoKg').value) || '',
            stt: $('#fStt').value.trim(),
            moTa: $('#fMoTa').value.trim(),
            soTien: parseNum($('#fSoTien').value) || '',
            slNhan: parseNum($('#fSlNhan').value) || '',
            thieu: parseNum($('#fThieu').value) || '',
            chiPhi: parseNum($('#fChiPhi').value) || '',
            ghiChu: $('#fGhiChu').value.trim(),
            ngayTT: $('#fNgayTT').value || '',
            soTienTT: parseNum($('#fSoTienTT').value) || '',
            soTienVND: parseNum($('#fSoTienVND').value) || '',
            productImages: productImages,
            invoiceImages: invoiceImages,
        };

        if (editingId) entry.id = editingId;

        try {
            const saved = await saveEntry(entry);

            if (editingId) {
                const idx = allData.findIndex((d) => String(d.id) === String(editingId));
                if (idx !== -1) allData[idx] = saved;
            } else {
                allData.push(saved);
            }

            saveToLocalStorage();
            closeModal();
            renderAll();
            showToast(editingId ? 'Đã cập nhật' : 'Đã thêm đơn hàng', 'success');
        } catch (e) {
            showToast('Lỗi lưu: ' + e.message, 'error');
        }
    }

    // ===== Image Handling =====
    function handleImageSelect(e, type) {
        const files = e.target.files;
        if (!files.length) return;
        addImageFiles(Array.from(files), type);
    }

    function addImageFiles(files, type) {
        files.forEach((file) => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (type === 'product') { productImages.push(ev.target.result); }
                else { invoiceImages.push(ev.target.result); }
                renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
    }

    // Paste images from clipboard
    let pasteTarget = 'product'; // which upload area was last focused

    function initPasteSupport() {
        // Track which upload area user interacted with last
        const productUpload = $('#uploadProductImg');
        const invoiceUpload = $('#uploadInvoiceImg');
        if (productUpload) productUpload.addEventListener('click', () => { pasteTarget = 'product'; });
        if (invoiceUpload) invoiceUpload.addEventListener('click', () => { pasteTarget = 'invoice'; });

        // Global paste listener
        document.addEventListener('paste', (e) => {
            // Only handle when modal is open
            if (!els.modalOverlay.classList.contains('active')) return;

            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;

            const imageFiles = [];
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault();
                addImageFiles(imageFiles, pasteTarget);
                showToast(`Đã dán ${imageFiles.length} ảnh vào ${pasteTarget === 'product' ? 'Ảnh SP' : 'Ảnh HĐ'}`, 'success');
            }
        });
    }

    function renderImagePreviews() {
        $('#previewProduct').innerHTML = productImages.map((src, i) =>
            `<div class="preview-item">
                <img src="${src}" alt="SP ${i + 1}">
                <button class="remove-img" onclick="HangQQ.removeImg('product', ${i})">×</button>
            </div>`
        ).join('');

        $('#previewInvoice').innerHTML = invoiceImages.map((src, i) =>
            `<div class="preview-item">
                <img src="${src}" alt="HĐ ${i + 1}">
                <button class="remove-img" onclick="HangQQ.removeImg('invoice', ${i})">×</button>
            </div>`
        ).join('');
    }

    function removeImage(type, idx) {
        if (type === 'product') productImages.splice(idx, 1);
        else invoiceImages.splice(idx, 1);
        renderImagePreviews();
    }

    // ===== Image Viewer =====
    function openImageViewer(src) {
        $('#viewerImage').src = src;
        els.imageViewerOverlay.classList.add('active');
    }

    function closeImageViewer() {
        els.imageViewerOverlay.classList.remove('active');
        $('#viewerImage').src = '';
    }

    // ===== Import Excel =====
    let pendingImportData = [];

    function openImportModal() {
        pendingImportData = [];
        $('#importPreview').style.display = 'none';
        $('#importDropzone').style.display = 'block';
        $('#btnConfirmImport').disabled = true;
        els.importOverlay.classList.add('active');
        lucideRefresh();
    }

    function closeImportModal() {
        els.importOverlay.classList.remove('active');
        pendingImportData = [];
    }

    function handleImportFile(file) {
        if (!file.name.match(/\.xlsx?$/i)) {
            showToast('Chỉ hỗ trợ file .xlsx hoặc .xls', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                pendingImportData = parseExcelData(rawData);

                $('#importDropzone').style.display = 'none';
                $('#importPreview').style.display = 'block';
                $('#importFileName').textContent = file.name;
                $('#importRowCount').textContent = `${pendingImportData.length} dòng dữ liệu`;
                $('#btnConfirmImport').disabled = false;

                renderImportPreview(pendingImportData.slice(0, 20));
            } catch (err) {
                showToast('Lỗi đọc file Excel: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function parseExcelData(rawRows) {
        const dataRows = rawRows.slice(2);
        const entries = [];
        let currentDate = '';

        dataRows.forEach((row) => {
            const dateVal = row[0];
            const moTa = (row[5] || '').toString().trim();
            const soTien = parseNum(row[6]);

            if (dateVal) currentDate = parseExcelDate(dateVal);
            if (!moTa && !soTien) return;

            entries.push({
                ngayDiHang: currentDate,
                soLuong: parseNum(row[1]) || '',
                soKg: parseNum(row[2]) || '',
                stt: (row[4] || '').toString().trim(),
                moTa: moTa,
                soTien: soTien || '',
                slNhan: parseNum(row[7]) || '',
                thieu: parseNum(row[8]) || '',
                chiPhi: parseNum(row[9]) || '',
                ghiChu: (row[10] || '').toString().trim(),
                ngayTT: parseExcelDate(row[12]),
                soTienTT: parseNum(row[13]) || '',
                soTienVND: parseNum(row[14]) || '',
                productImages: [],
                invoiceImages: [],
            });
        });
        return entries;
    }

    function parseExcelDate(val) {
        if (!val) return '';
        if (typeof val === 'string') {
            const match = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const year = match[3] ? (match[3].length === 2 ? '20' + match[3] : match[3]) : new Date().getFullYear().toString();
                return `${year}-${month}-${day}`;
            }
            return '';
        }
        if (typeof val === 'number' && val > 40000) {
            const date = new Date((val - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
        }
        return '';
    }

    function renderImportPreview(data) {
        $('#importTableHead').innerHTML = `<tr>
            <th>#</th><th>Ngày</th><th>SL</th><th>Kg</th><th>Mô tả</th>
            <th>Tiền (¥)</th><th>SL nhận</th><th>CP hàng về</th><th>Ghi chú</th>
            <th>Ngày TT</th><th>Tiền TT</th><th>Tiền VND</th>
        </tr>`;

        $('#importTableBody').innerHTML = data.map((d, i) => `<tr>
            <td>${i + 1}</td>
            <td>${formatDate(d.ngayDiHang)}</td><td>${d.soLuong}</td><td>${d.soKg}</td>
            <td>${escHtml(d.moTa)}</td><td>${formatMoney(d.soTien)}</td>
            <td>${d.slNhan}</td><td>${formatMoney(d.chiPhi)}</td>
            <td>${escHtml(d.ghiChu)}</td><td>${formatDate(d.ngayTT)}</td>
            <td>${formatMoney(d.soTienTT)}</td><td>${formatMoney(d.soTienVND)}</td>
        </tr>`).join('');
    }

    async function confirmImport() {
        if (pendingImportData.length === 0) return;

        $('#btnConfirmImport').disabled = true;
        $('#btnConfirmImport').textContent = 'Đang import...';

        try {
            const result = await apiRequest('POST', '/bulk', { entries: pendingImportData });
            await loadData();
            closeImportModal();
            renderAll();
            showToast(`Đã import ${result.imported} đơn hàng`, 'success');
        } catch (e) {
            showToast('Lỗi import: ' + e.message, 'error');
            $('#btnConfirmImport').disabled = false;
            $('#btnConfirmImport').textContent = 'Import dữ liệu';
        }
    }

    // ===== Export =====
    function exportToExcel() {
        if (typeof XLSX === 'undefined') { showToast('SheetJS chưa tải', 'error'); return; }

        const exportData = filteredData.map((d, i) => ({
            'STT': i + 1,
            'Ngày đi hàng': formatDate(d.ngayDiHang),
            'SL': d.soLuong, 'Số Kg': d.soKg, 'STT đơn': d.stt,
            'Mô tả hóa đơn': d.moTa, 'Số tiền (¥)': d.soTien,
            'SL nhận': d.slNhan, 'Thiếu': d.thieu,
            'CP hàng về': d.chiPhi, 'Ghi chú': d.ghiChu,
            'Ngày TT': formatDate(d.ngayTT),
            'Số tiền TT (¥)': d.soTienTT, 'Số tiền VND': d.soTienVND,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hàng QQ');
        XLSX.writeFile(wb, `Hang_QQ_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Đã xuất file Excel', 'success');
    }

    // ===== Utilities =====
    function parseNum(val) {
        if (val === null || val === undefined || val === '') return 0;
        const n = parseFloat(String(val).replace(/[,\s]/g, ''));
        return isNaN(n) ? 0 : n;
    }

    function formatMoney(val) {
        const n = parseNum(val);
        return n === 0 ? '' : n.toLocaleString('vi-VN');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    }

    function formatMonth(monthStr) {
        const [y, m] = monthStr.split('-');
        return `Tháng ${parseInt(m)}/${y}`;
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escAttr(str) {
        return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function lucideRefresh() {
        requestAnimationFrame(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    // ===== Toast =====
    function showToast(message, type = 'info') {
        let container = $('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== Public API =====
    window.HangQQ = {
        edit(id) {
            const entry = allData.find((d) => String(d.id) === String(id));
            if (entry) openModal(entry);
        },
        del(id) {
            if (!confirm('Xóa dòng này?')) return;
            deleteEntry(id).then(() => { renderAll(); showToast('Đã xóa', 'success'); })
                .catch((e) => showToast('Lỗi xóa: ' + e.message, 'error'));
        },
        goPage(page) {
            currentPage = page;
            renderTable();
            renderPagination();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        viewImg(src) { openImageViewer(src); },
        removeImg(type, idx) { removeImage(type, idx); },
    };

    // FAB for mobile
    const fab = $('#btnAddFab');
    if (fab) fab.addEventListener('click', () => openModal());
})();
