// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Hàng QQ - Quản lý hàng Quảng Châu
 * Data stored in Firestore collection: hang_qq
 * localStorage key: hangQQ_data (cache only)
 */

(function () {
    'use strict';

    // ===== Constants =====
    const LS_KEY = 'hangQQ_data';
    const FIRESTORE_COLLECTION = 'hang_qq';
    const PAGE_SIZE = 50;

    // ===== State =====
    let allData = [];
    let filteredData = [];
    let currentPage = 1;
    let sortField = 'ngayDiHang';
    let sortDir = 'desc';
    let editingId = null;
    let productImages = [];
    let invoiceImages = [];
    let db = null;

    // ===== DOM refs =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        tableBody: null,
        emptyState: null,
        pagination: null,
        searchInput: null,
        filterMonth: null,
        filterStatus: null,
        modalOverlay: null,
        importOverlay: null,
        imageViewerOverlay: null,
    };

    // ===== Init =====
    document.addEventListener('DOMContentLoaded', async () => {
        cacheElements();
        bindEvents();
        await initFirestore();
        await loadData();
        renderAll();
        initLucide();
    });

    function cacheElements() {
        els.tableBody = $('#tableBody');
        els.emptyState = $('#emptyState');
        els.pagination = $('#pagination');
        els.searchInput = $('#searchInput');
        els.filterMonth = $('#filterMonth');
        els.filterStatus = $('#filterStatus');
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

    // ===== Firestore =====
    async function initFirestore() {
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                db = firebase.firestore();
            }
        } catch (e) {
            console.warn('Firestore not available, using localStorage only:', e.message);
        }
    }

    async function loadData() {
        // Try Firestore first
        if (db) {
            try {
                const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
                allData = [];
                snapshot.forEach((doc) => {
                    allData.push({ id: doc.id, ...doc.data() });
                });
                saveToLocalStorage();
                return;
            } catch (e) {
                console.warn('Firestore load failed, using localStorage:', e.message);
            }
        }

        // Fallback to localStorage
        const cached = localStorage.getItem(LS_KEY);
        if (cached) {
            try {
                allData = JSON.parse(cached);
            } catch (e) {
                allData = [];
            }
        }
    }

    function saveToLocalStorage() {
        localStorage.setItem(LS_KEY, JSON.stringify(allData));
    }

    async function saveEntry(entry) {
        if (db) {
            try {
                if (entry.id) {
                    await db.collection(FIRESTORE_COLLECTION).doc(entry.id).set(entry, { merge: true });
                } else {
                    const docRef = await db.collection(FIRESTORE_COLLECTION).add(entry);
                    entry.id = docRef.id;
                }
            } catch (e) {
                console.error('Firestore save error:', e);
                // Generate local ID as fallback
                if (!entry.id) {
                    entry.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                }
            }
        } else if (!entry.id) {
            entry.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        }
        return entry;
    }

    async function deleteEntry(id) {
        if (db) {
            try {
                await db.collection(FIRESTORE_COLLECTION).doc(id).delete();
            } catch (e) {
                console.error('Firestore delete error:', e);
            }
        }
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
                closeModal();
                closeImportModal();
                closeImageViewer();
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

        filteredData = allData.filter((item) => {
            // Search
            if (search) {
                const searchableText = [item.moTa, item.ghiChu, item.stt, item.ngayDiHang]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!searchableText.includes(search)) return false;
            }

            // Month filter
            if (month && item.ngayDiHang) {
                const itemMonth = item.ngayDiHang.slice(0, 7); // YYYY-MM
                if (itemMonth !== month) return false;
            }

            // Status filter
            if (status) {
                const paid = parseNum(item.soTienTT);
                const total = parseNum(item.soTien);
                if (status === 'paid' && (paid <= 0 || paid < total)) return false;
                if (status === 'unpaid' && paid > 0) return false;
                if (status === 'partial' && (paid <= 0 || paid >= total)) return false;
            }

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
            return 0;
        });
    }

    function renderTable() {
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageData = filteredData.slice(start, start + PAGE_SIZE);

        if (pageData.length === 0) {
            els.tableBody.innerHTML = '';
            els.emptyState.style.display = allData.length === 0 ? 'block' : 'block';
            $('.table-wrapper').style.display = allData.length === 0 ? 'none' : 'block';
            if (allData.length > 0 && filteredData.length === 0) {
                els.emptyState.querySelector('p').innerHTML = 'Không tìm thấy kết quả phù hợp.';
            }
            lucideRefresh();
            return;
        }

        els.emptyState.style.display = 'none';
        $('.table-wrapper').style.display = 'block';

        els.tableBody.innerHTML = pageData.map((item, idx) => {
            const globalIdx = start + idx + 1;
            const productImgs = item.productImages || [];
            const invoiceImgs = item.invoiceImages || [];

            return `<tr data-id="${item.id}">
                <td class="col-stt">${globalIdx}</td>
                <td class="col-date">${formatDate(item.ngayDiHang)}</td>
                <td class="col-num">${item.soLuong || ''}</td>
                <td class="col-num">${item.soKg || ''}</td>
                <td class="col-desc">${escHtml(item.moTa || '')}</td>
                <td class="col-money money-cell">${formatMoney(item.soTien)}</td>
                <td class="col-num">${item.slNhan || ''}</td>
                <td class="col-num ${item.thieu ? 'shortage-cell' : ''}">${item.thieu || ''}</td>
                <td class="col-money money-cell">${formatMoney(item.chiPhi)}</td>
                <td class="col-note">${escHtml(item.ghiChu || '')}</td>
                <td class="col-date">${formatDate(item.ngayTT)}</td>
                <td class="col-money money-cell">${formatMoney(item.soTienTT)}</td>
                <td class="col-money money-cell">${formatMoney(item.soTienVND)}</td>
                <td class="col-img">${renderImgThumb(productImgs, 'product')}</td>
                <td class="col-img">${renderImgThumb(invoiceImgs, 'invoice')}</td>
                <td class="col-actions">
                    <div class="action-btns">
                        <button class="btn-icon" onclick="HangQQ.edit('${item.id}')" title="Sửa">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon danger" onclick="HangQQ.del('${item.id}')" title="Xóa">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        lucideRefresh();
    }

    function renderImgThumb(images, type) {
        if (!images || images.length === 0) {
            return '<span class="no-img">—</span>';
        }
        const first = images[0];
        const extra = images.length > 1 ? ` <span class="img-count-badge" data-count="+${images.length - 1}"></span>` : '';
        return `<div class="img-thumb-group">
            <img class="img-thumb" src="${first}" onclick="HangQQ.viewImg('${escAttr(first)}')" alt="${type}">
            ${extra}
        </div>`;
    }

    function renderPagination() {
        const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
        if (totalPages <= 1) {
            els.pagination.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="HangQQ.goPage(${currentPage - 1})">‹</button>`;

        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
                if (i === currentPage - 3 || i === currentPage + 3) html += '<button disabled>…</button>';
                continue;
            }
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="HangQQ.goPage(${i})">${i}</button>`;
        }

        html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="HangQQ.goPage(${currentPage + 1})">›</button>`;
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
            updatedAt: Date.now(),
        };

        if (editingId) {
            entry.id = editingId;
            const idx = allData.findIndex((d) => d.id === editingId);
            if (idx !== -1) {
                allData[idx] = { ...allData[idx], ...entry };
            }
        } else {
            entry.createdAt = Date.now();
        }

        const saved = await saveEntry(entry);

        if (!editingId) {
            allData.push(saved);
        }

        saveToLocalStorage();
        closeModal();
        renderAll();
        showToast(editingId ? 'Đã cập nhật đơn hàng' : 'Đã thêm đơn hàng', 'success');
    }

    // ===== Image Handling =====
    function handleImageSelect(e, type) {
        const files = e.target.files;
        if (!files.length) return;

        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                if (type === 'product') {
                    productImages.push(dataUrl);
                } else {
                    invoiceImages.push(dataUrl);
                }
                renderImagePreviews();
            };
            reader.readAsDataURL(file);
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
        if (type === 'product') {
            productImages.splice(idx, 1);
        } else {
            invoiceImages.splice(idx, 1);
        }
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

                // Parse the data based on known column structure
                pendingImportData = parseExcelData(rawData);

                // Show preview
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
        // Skip header rows (first 2 rows are headers based on the Excel structure)
        const dataRows = rawRows.slice(2);
        const entries = [];

        let currentDate = '';

        dataRows.forEach((row) => {
            // Column mapping from Excel:
            // A=0: NGÀY ĐI HÀNG, B=1: SL, C=2: SỐ KG, D=3: X, E=4: STT
            // F=5: SỐ HÓA ĐƠN, G=6: SỐ TIỀN, H=7: SL nhận, I=8: THIẾU
            // J=9: CHI PHÍ HÀNG VỀ, K=10: Ghi chú
            // M=12: NGÀY TT, N=13: SỐ TIỀN TT, O=14: SỐ TIỀN VND

            const dateVal = row[0];
            const moTa = (row[5] || '').toString().trim();
            const soTien = parseNum(row[6]);

            // Track current shipping date
            if (dateVal) {
                currentDate = parseExcelDate(dateVal);
            }

            // Skip rows without description and amount
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
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        return entries;
    }

    function parseExcelDate(val) {
        if (!val) return '';

        // Already a date string like "27/12"
        if (typeof val === 'string') {
            const match = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const year = match[3] ? (match[3].length === 2 ? '20' + match[3] : match[3]) : new Date().getFullYear().toString();
                return `${year}-${month}-${day}`;
            }
            // Might be text like "CÒN LẠI", "KM" etc — not a date
            return '';
        }

        // Excel serial date number
        if (typeof val === 'number' && val > 40000) {
            const date = new Date((val - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
                return date.toISOString().slice(0, 10);
            }
        }

        return '';
    }

    function renderImportPreview(data) {
        const thead = $('#importTableHead');
        const tbody = $('#importTableBody');

        thead.innerHTML = `<tr>
            <th>#</th><th>Ngày</th><th>SL</th><th>Kg</th><th>Mô tả</th>
            <th>Tiền (¥)</th><th>SL nhận</th><th>CP hàng về</th><th>Ghi chú</th>
            <th>Ngày TT</th><th>Tiền TT</th><th>Tiền VND</th>
        </tr>`;

        tbody.innerHTML = data.map((d, i) => `<tr>
            <td>${i + 1}</td>
            <td>${formatDate(d.ngayDiHang)}</td>
            <td>${d.soLuong}</td>
            <td>${d.soKg}</td>
            <td>${escHtml(d.moTa)}</td>
            <td>${formatMoney(d.soTien)}</td>
            <td>${d.slNhan}</td>
            <td>${formatMoney(d.chiPhi)}</td>
            <td>${escHtml(d.ghiChu)}</td>
            <td>${formatDate(d.ngayTT)}</td>
            <td>${formatMoney(d.soTienTT)}</td>
            <td>${formatMoney(d.soTienVND)}</td>
        </tr>`).join('');
    }

    async function confirmImport() {
        if (pendingImportData.length === 0) return;

        $('#btnConfirmImport').disabled = true;
        $('#btnConfirmImport').textContent = 'Đang import...';

        let imported = 0;
        for (const entry of pendingImportData) {
            const saved = await saveEntry(entry);
            allData.push(saved);
            imported++;
        }

        saveToLocalStorage();
        closeImportModal();
        renderAll();
        showToast(`Đã import ${imported} đơn hàng thành công`, 'success');
    }

    // ===== Export =====
    function exportToExcel() {
        if (typeof XLSX === 'undefined') {
            showToast('Thư viện SheetJS chưa được tải', 'error');
            return;
        }

        const exportData = filteredData.map((d, i) => ({
            'STT': i + 1,
            'Ngày đi hàng': formatDate(d.ngayDiHang),
            'SL': d.soLuong,
            'Số Kg': d.soKg,
            'STT đơn': d.stt,
            'Mô tả hóa đơn': d.moTa,
            'Số tiền (¥)': d.soTien,
            'SL nhận': d.slNhan,
            'Thiếu': d.thieu,
            'CP hàng về': d.chiPhi,
            'Ghi chú': d.ghiChu,
            'Ngày TT': formatDate(d.ngayTT),
            'Số tiền TT (¥)': d.soTienTT,
            'Số tiền VND': d.soTienVND,
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
        if (n === 0) return '';
        return n.toLocaleString('vi-VN');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        // YYYY-MM-DD to DD/MM/YYYY
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    function formatMonth(monthStr) {
        // YYYY-MM to "Tháng M/YYYY"
        const [y, m] = monthStr.split('-');
        return `Tháng ${parseInt(m)}/${y}`;
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escAttr(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
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

    // ===== Public API (for onclick handlers) =====
    window.HangQQ = {
        edit(id) {
            const entry = allData.find((d) => d.id === id);
            if (entry) openModal(entry);
        },

        del(id) {
            if (!confirm('Bạn có chắc muốn xóa đơn hàng này?')) return;
            deleteEntry(id).then(() => {
                renderAll();
                showToast('Đã xóa đơn hàng', 'success');
            });
        },

        goPage(page) {
            currentPage = page;
            renderTable();
            renderPagination();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        viewImg(src) {
            openImageViewer(src);
        },

        removeImg(type, idx) {
            removeImage(type, idx);
        },
    };
})();
