/* =====================================================
   KHO SẢN PHẨM - PRODUCT WAREHOUSE
   Main JS - UI with all columns, column visibility,
   search, filter, sort, pagination
   ===================================================== */

(function () {
    'use strict';

    // =====================================================
    // COLUMN DEFINITIONS (order matches screenshot)
    // Bỏ cột Thuế % theo yêu cầu
    // =====================================================
    const COLUMNS = [
        { key: 'code',           label: 'Mã',                  visible: true,  locked: false },
        { key: 'name',           label: 'Tên',                 visible: true,  locked: false },
        { key: 'group',          label: 'Nhóm sản phẩm',      visible: true,  locked: false },
        { key: 'price',          label: 'Giá bán',             visible: true,  locked: false },
        { key: 'defaultBuyPrice',label: 'Giá mua mặc định',   visible: true,  locked: false },
        { key: 'costPrice',      label: 'Giá vốn',            visible: true,  locked: false },
        { key: 'qtyActual',      label: 'Số lượng thực tế',   visible: true,  locked: false },
        { key: 'qtyForecast',    label: 'Số lượng dự báo',    visible: true,  locked: false },
        { key: 'unit',           label: 'Đơn vị',             visible: true,  locked: false },
        { key: 'label',          label: 'Nhãn',               visible: true,  locked: false },
        { key: 'active',         label: 'Hiệu lực',           visible: true,  locked: false },
        { key: 'allCompany',     label: 'All company',         visible: true,  locked: false },
        { key: 'note',           label: 'Ghi chú',            visible: true,  locked: false },
        { key: 'createdAt',      label: 'Ngày tạo',           visible: true,  locked: false },
        { key: 'company',        label: 'Công ty',            visible: true,  locked: false },
        { key: 'creator',        label: 'Người tạo',          visible: true,  locked: false },
    ];

    const STORAGE_KEY = 'n2store_warehouse_columns';

    // =====================================================
    // MOCK DATA - full fields
    // =====================================================
    const MOCK_PRODUCTS = [
        { id:1,  code:'B146', name:'B1 1103 ÁO SMI KẺ BBR NÂU 2665',                  group:'Có thể bán', price:340000, defaultBuyPrice:230000, costPrice:230000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:true,  note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:2,  code:'B147', name:'B1 1103 ÁO SMI ONG THÊU TRẮNG 2667',              group:'Có thể bán', price:320000, defaultBuyPrice:210000, costPrice:210000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:3,  code:'B149', name:'B1 1103 ÁO TD LAI REN NÚT TÍM TRẮNG 88083',      group:'Có thể bán', price:390000, defaultBuyPrice:240000, costPrice:240000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:4,  code:'B148', name:'B1 1103 ÁO SMI TAY REN DỌC TRẮNG 85110',          group:'Có thể bán', price:390000, defaultBuyPrice:290000, costPrice:290000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:5,  code:'B145', name:'B1 1103 ÁO SMI NÚT VÀNG LAI REN TRẮNG 9518',     group:'Có thể bán', price:380000, defaultBuyPrice:260000, costPrice:260000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:6,  code:'B164', name:'B27 1103 ÁO THUN DR NGỰA HOA VĂN NỮ SIZE',       group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:7,  code:'B165', name:'B27 1103 ÁO THUN NGỰA PHI CÁNH HOA HỒNG SIZE',   group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:8,  code:'B162', name:'B27 1103 ÁO THUN DR THÀNH PHỐ HOA NỮ SIZE',       group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:9,  code:'B161', name:'B27 1103 ÁO THUN DR NGỰA LÂU ĐÀI TRẮNG SIZE',   group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:10, code:'B150', name:'B1 1103 ÁO SMI REN CÚC TRẮNG 72015',              group:'Có thể bán', price:360000, defaultBuyPrice:220000, costPrice:220000, qtyActual:3,    qtyForecast:3,    unit:'Cái', label:true,  active:true,  allCompany:true,  note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:11, code:'B151', name:'B1 1103 ÁO SMI TAY BÈO HOA NHÍ TRẮNG 6892',      group:'Có thể bán', price:350000, defaultBuyPrice:210000, costPrice:210000, qtyActual:0,    qtyForecast:0,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'Hết hàng', createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:12, code:'B152', name:'B1 1103 ÁO SMI CÚC NGỌC TAY ĐƠN TRẮNG 5524',    group:'Có thể bán', price:370000, defaultBuyPrice:230000, costPrice:230000, qtyActual:5,    qtyForecast:5,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:13, code:'B153', name:'B1 1103 ÁO SMI DÁNG DÀI TAY BÈO TRẮNG 8823',     group:'Có thể bán', price:340000, defaultBuyPrice:200000, costPrice:200000, qtyActual:0,    qtyForecast:0,    unit:'Cái', label:true,  active:false, allCompany:false, note:'Ngừng kinh doanh', createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:14, code:'B160', name:'B27 1103 ÁO THUN DR NGỰA HOA SEN NỮ SIZE',        group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:4,    qtyForecast:4,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:15, code:'B163', name:'B27 1103 ÁO THUN DR NGỰA CÁNH BƯỚM SIZE',         group:'Có thể bán', price:190000, defaultBuyPrice:110000, costPrice:0,      qtyActual:3,    qtyForecast:3,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:16, code:'B170', name:'B28 1103 ÁO KIỂU NỮ TAY LOÈ REN TRẮNG 4421',     group:'Có thể bán', price:280000, defaultBuyPrice:170000, costPrice:170000, qtyActual:7,    qtyForecast:7,    unit:'Cái', label:true,  active:true,  allCompany:true,  note:'Best seller', createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:17, code:'B171', name:'B28 1103 ÁO KIỂU NỮ CỔ TIM THÊU HOA 3356',       group:'Có thể bán', price:290000, defaultBuyPrice:180000, costPrice:180000, qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:18, code:'B172', name:'B28 1103 ÁO KIỂU NỮ DÁNG RỘNG TAY DÀI 5578',     group:'Có thể bán', price:310000, defaultBuyPrice:190000, costPrice:190000, qtyActual:0,    qtyForecast:0,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Admin', image:'' },
        { id:19, code:'B180', name:'B30 1103 ĐẦM NỮ HOA NHÍ CỔ TRÒN TRẮNG SIZE',     group:'Có thể bán', price:450000, defaultBuyPrice:280000, costPrice:280000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Admin', image:'' },
        { id:20, code:'B181', name:'B30 1103 ĐẦM NỮ HOA TULIP VÀNG KEM SIZE',         group:'Có thể bán', price:460000, defaultBuyPrice:290000, costPrice:290000, qtyActual:6,    qtyForecast:6,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Admin', image:'' },
        { id:21, code:'B182', name:'B30 1103 ĐẦM NỮ SỌC CA RÔ ĐEN TRẮNG SIZE',       group:'Có thể bán', price:420000, defaultBuyPrice:260000, costPrice:260000, qtyActual:3,    qtyForecast:3,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Hạnh', image:'' },
        { id:22, code:'B183', name:'B30 1103 ĐẦM NỮ THÊU HOA LAVENDER TÍM SIZE',      group:'Có thể bán', price:480000, defaultBuyPrice:300000, costPrice:300000, qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:true,  note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Hạnh', image:'' },
        { id:23, code:'B190', name:'B32 1103 QUẦN NỮ SUÔNG ỐNG RỘNG ĐEN SIZE',        group:'Có thể bán', price:250000, defaultBuyPrice:150000, costPrice:150000, qtyActual:8,    qtyForecast:8,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Hạnh', image:'' },
        { id:24, code:'B191', name:'B32 1103 QUẦN NỮ ỐNG ĐỨNG NÂU BÊ SIZE',           group:'Có thể bán', price:260000, defaultBuyPrice:160000, costPrice:160000, qtyActual:4,    qtyForecast:4,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Hạnh', image:'' },
        { id:25, code:'B192', name:'B32 1103 QUẦN NỮ LƯNG CAO CO GIÃN ĐEN SIZE',      group:'Có thể bán', price:270000, defaultBuyPrice:170000, costPrice:170000, qtyActual:0,    qtyForecast:0,    unit:'Cái', label:true,  active:false, allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD SHOP', creator:'Hạnh', image:'' },
        { id:26, code:'B200', name:'B35 1103 SET BỘ ÁO CHÂN VÁY HOA HỒNG SIZE',       group:'Có thể bán', price:520000, defaultBuyPrice:320000, costPrice:320000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:27, code:'B201', name:'B35 1103 SET BỘ ÁO VEST + QUẦN DÀI ĐEN SIZE',     group:'Có thể bán', price:580000, defaultBuyPrice:360000, costPrice:360000, qtyActual:3,    qtyForecast:3,    unit:'Cái', label:true,  active:true,  allCompany:true,  note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:28, code:'B202', name:'B35 1103 SET BỘ ÁO CROPTOP + CHÂN VÁY TRẮNG',     group:'Có thể bán', price:490000, defaultBuyPrice:300000, costPrice:300000, qtyActual:2,    qtyForecast:2,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:29, code:'B210', name:'B38 1103 ÁO BLAZER NỮ FORM RỘNG KEM SIZE',         group:'Có thể bán', price:550000, defaultBuyPrice:340000, costPrice:340000, qtyActual:1,    qtyForecast:1,    unit:'Cái', label:true,  active:true,  allCompany:false, note:'',  createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
        { id:30, code:'B211', name:'B38 1103 ÁO BLAZER NỮ 2 LỚP ĐEN SIZE',            group:'Có thể bán', price:580000, defaultBuyPrice:360000, costPrice:360000, qtyActual:0,    qtyForecast:0,    unit:'Cái', label:true,  active:false, allCompany:false, note:'Ngừng kinh doanh', createdAt:'2024-11-03', company:'NJD LIVE', creator:'Admin', image:'' },
    ];

    // =====================================================
    // STATE
    // =====================================================
    let allProducts = [...MOCK_PRODUCTS];
    let filteredProducts = [];
    let currentPage = 1;
    let pageSize = 50;
    let sortField = null;
    let sortDirection = 'asc';
    let columnVisibility = {};
    let selectedIds = new Set();

    // =====================================================
    // DOM REFS
    // =====================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // =====================================================
    // HELPERS
    // =====================================================
    function formatPrice(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN');
    }

    function formatQty(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getQtyClass(qty) {
        if (qty <= 0) return 'qty-out-of-stock';
        if (qty <= 5) return 'qty-low-stock';
        return 'qty-in-stock';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        if (!query || !text) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    // =====================================================
    // COLUMN VISIBILITY
    // =====================================================
    function loadColumnVisibility() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                COLUMNS.forEach(col => {
                    if (parsed[col.key] !== undefined) {
                        col.visible = parsed[col.key];
                    }
                });
            }
        } catch (e) {
            console.warn('[Warehouse] Error loading column settings:', e);
        }
        syncColumnVisibilityToDOM();
    }

    function saveColumnVisibility() {
        const data = {};
        COLUMNS.forEach(col => { data[col.key] = col.visible; });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }

    function syncColumnVisibilityToDOM() {
        COLUMNS.forEach(col => {
            // Hide/show header th
            const th = $(`th[data-col="${col.key}"]`);
            if (th) th.style.display = col.visible ? '' : 'none';

            // Hide/show body tds
            $$(`td[data-col="${col.key}"]`).forEach(td => {
                td.style.display = col.visible ? '' : 'none';
            });
        });
    }

    function openColumnSettings() {
        const modal = $('#columnSettingsModal');
        const list = $('#columnSettingsList');
        if (!modal || !list) return;

        list.innerHTML = COLUMNS.map(col => `
            <label class="column-setting-item ${col.visible ? 'checked' : ''}">
                <input type="checkbox" data-col-key="${col.key}" ${col.visible ? 'checked' : ''}>
                <span>${col.label}</span>
            </label>
        `).join('');

        // Toggle checked class on change
        list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.column-setting-item').classList.toggle('checked', cb.checked);
            });
        });

        modal.classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function closeColumnSettingsModal() {
        $('#columnSettingsModal')?.classList.remove('show');
    }

    function saveColumnSettingsFromModal() {
        const checkboxes = $$('#columnSettingsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const key = cb.dataset.colKey;
            const col = COLUMNS.find(c => c.key === key);
            if (col) col.visible = cb.checked;
        });
        saveColumnVisibility();
        syncColumnVisibilityToDOM();
        closeColumnSettingsModal();
    }

    function resetColumnDefaults() {
        COLUMNS.forEach(col => { col.visible = true; });
        // Re-render settings list
        const list = $('#columnSettingsList');
        if (list) {
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
                cb.closest('.column-setting-item').classList.add('checked');
            });
        }
    }

    // =====================================================
    // FILTER & SORT
    // =====================================================
    function applyFiltersAndSort() {
        const searchQuery = ($('#searchInput')?.value || '').trim().toLowerCase();
        const stockFilter = $('#filterStock')?.value || 'all';
        const statusFilter = $('#filterStatus')?.value || 'all';
        const codeFilter = ($('[data-filter="code"]')?.value || '').trim().toLowerCase();
        const nameFilter = ($('[data-filter="name"]')?.value || '').trim().toLowerCase();

        filteredProducts = allProducts.filter(p => {
            // Global search
            if (searchQuery) {
                const match = p.code.toLowerCase().includes(searchQuery) ||
                              p.name.toLowerCase().includes(searchQuery) ||
                              (p.note || '').toLowerCase().includes(searchQuery);
                if (!match) return false;
            }

            // Column filters
            if (codeFilter && !p.code.toLowerCase().includes(codeFilter)) return false;
            if (nameFilter && !p.name.toLowerCase().includes(nameFilter)) return false;

            // Stock filter
            if (stockFilter === 'in-stock' && p.qtyActual <= 0) return false;
            if (stockFilter === 'low-stock' && (p.qtyActual <= 0 || p.qtyActual > 5)) return false;
            if (stockFilter === 'out-of-stock' && p.qtyActual > 0) return false;

            // Status filter
            if (statusFilter === 'active' && !p.active) return false;
            if (statusFilter === 'inactive' && p.active) return false;

            return true;
        });

        // Sort
        if (sortField) {
            filteredProducts.sort((a, b) => {
                let valA = a[sortField], valB = b[sortField];
                if (valA === undefined) valA = '';
                if (valB === undefined) valB = '';
                if (typeof valA === 'boolean') { valA = valA ? 1 : 0; valB = valB ? 1 : 0; }
                if (typeof valA === 'string') {
                    const cmp = valA.localeCompare(valB, 'vi');
                    return sortDirection === 'asc' ? cmp : -cmp;
                }
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            });
        }

        currentPage = 1;
        render();
    }

    // =====================================================
    // RENDER
    // =====================================================
    function render() {
        const total = filteredProducts.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, total);
        const pageProducts = filteredProducts.slice(start, end);

        // Update count
        const countEl = $('#productCount');
        if (countEl) countEl.innerHTML = `<i data-lucide="package"></i> <strong>${total}</strong> sản phẩm`;

        // Loading / empty
        const loadingState = $('#loadingState');
        const emptyState = $('#emptyState');
        if (loadingState) loadingState.classList.add('hidden');
        if (emptyState) emptyState.classList.toggle('hidden', total > 0);

        const searchQuery = ($('#searchInput')?.value || '').trim();
        const tableBody = $('#productTableBody');

        if (tableBody) {
            if (total === 0) {
                tableBody.innerHTML = '';
            } else {
                tableBody.innerHTML = pageProducts.map(p => {
                    const imageHtml = p.image
                        ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.code)}" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`
                        : `<div class="product-thumb-placeholder"><i data-lucide="image-off"></i></div>`;

                    const checked = selectedIds.has(p.id) ? 'checked' : '';
                    const rowClass = selectedIds.has(p.id) ? ' selected' : '';

                    return `<tr class="${rowClass}">
                        <td class="col-checkbox"><input type="checkbox" class="row-checkbox" data-id="${p.id}" ${checked}></td>
                        <td class="col-actions">
                            <div class="action-btns">
                                <button class="btn-action btn-action-edit" title="Sửa"><i data-lucide="pencil"></i></button>
                                <button class="btn-action btn-action-delete" title="Xóa"><i data-lucide="trash-2"></i></button>
                            </div>
                        </td>
                        <td class="product-image-cell">${imageHtml}</td>
                        <td data-col="code"><span class="product-code">${highlightMatch(p.code, searchQuery)}</span></td>
                        <td data-col="name" class="td-name"><span class="product-name">${highlightMatch(p.name, searchQuery)}</span></td>
                        <td data-col="group" class="td-group"><span class="product-group-text">${escapeHtml(p.group)}</span></td>
                        <td data-col="price" class="td-price">${formatPrice(p.price)}</td>
                        <td data-col="defaultBuyPrice" class="td-price">${formatPrice(p.defaultBuyPrice)}</td>
                        <td data-col="costPrice" class="td-price">${formatPrice(p.costPrice)}</td>
                        <td data-col="qtyActual" class="td-qty ${getQtyClass(p.qtyActual)}">${formatQty(p.qtyActual)}</td>
                        <td data-col="qtyForecast" class="td-qty">${formatQty(p.qtyForecast)}</td>
                        <td data-col="unit">${escapeHtml(p.unit)}</td>
                        <td data-col="label">${p.label ? '<span class="label-badge"><i data-lucide="tag"></i></span>' : '-'}</td>
                        <td data-col="active">${p.active
                            ? '<span class="status-active"><i data-lucide="check-circle-2"></i></span>'
                            : '<span class="status-inactive"><i data-lucide="x"></i></span>'}</td>
                        <td data-col="allCompany">${p.allCompany
                            ? '<span class="company-check"><i data-lucide="check"></i></span>'
                            : '<span class="company-cross"><i data-lucide="x"></i></span>'}</td>
                        <td data-col="note" class="td-note" title="${escapeHtml(p.note)}">${escapeHtml(p.note) || ''}</td>
                        <td data-col="createdAt" class="td-date">${p.createdAt || '-'}</td>
                        <td data-col="company" class="td-creator">${escapeHtml(p.company)}</td>
                        <td data-col="creator" class="td-creator">${escapeHtml(p.creator)}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Pagination
        renderPagination(total, totalPages, start, end);

        // Column visibility
        syncColumnVisibilityToDOM();

        // Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderPagination(total, totalPages, start, end) {
        const info = $('#paginationInfo');
        if (info) {
            info.textContent = total > 0
                ? `Hiển thị ${start + 1} - ${end} / ${total} sản phẩm`
                : 'Không có sản phẩm';
        }

        const btnPrev = $('#btnPrevPage');
        const btnNext = $('#btnNextPage');
        if (btnPrev) btnPrev.disabled = currentPage <= 1;
        if (btnNext) btnNext.disabled = currentPage >= totalPages;

        const pageNums = $('#pageNumbers');
        if (pageNums) {
            const pages = [];
            const maxVisible = 5;
            let sp = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let ep = Math.min(totalPages, sp + maxVisible - 1);
            if (ep - sp < maxVisible - 1) sp = Math.max(1, ep - maxVisible + 1);

            for (let i = sp; i <= ep; i++) {
                pages.push(`<button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
            pageNums.innerHTML = pages.join('');
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================
    function setupEventListeners() {
        // Search
        let searchTimeout;
        $('#searchInput')?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFiltersAndSort, 250);
        });

        $('#searchBtn')?.addEventListener('click', applyFiltersAndSort);

        // Filters
        $('#filterStock')?.addEventListener('change', applyFiltersAndSort);
        $('#filterStatus')?.addEventListener('change', applyFiltersAndSort);
        $('#filterGroup')?.addEventListener('change', applyFiltersAndSort);

        // Column filter toggle
        $$('.th-filter-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const th = e.target.closest('th');
                const input = th?.querySelector('.th-filter-input');
                if (input) {
                    const wasActive = input.classList.contains('active');
                    // Close all others
                    $$('.th-filter-input').forEach(i => i.classList.remove('active'));
                    $$('.th-filter-icon').forEach(i => i.classList.remove('active'));
                    if (!wasActive) {
                        input.classList.add('active');
                        icon.classList.add('active');
                        input.focus();
                    }
                }
            });
        });

        // Column filter inputs
        let colFilterTimeout;
        $$('.th-filter-input').forEach(input => {
            input.addEventListener('input', () => {
                clearTimeout(colFilterTimeout);
                colFilterTimeout = setTimeout(applyFiltersAndSort, 250);
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Sort
        $$('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                if (e.target.closest('.th-filter-input') || e.target.closest('.th-filter-icon')) return;
                const field = th.dataset.sort;
                if (sortField === field) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortField = field;
                    sortDirection = 'asc';
                }
                $$('.sortable').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
                th.classList.add(`sort-${sortDirection}`);
                applyFiltersAndSort();
            });
        });

        // Select all checkbox
        $('#selectAll')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            $$('.row-checkbox').forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.dataset.id, 10);
                if (checked) selectedIds.add(id); else selectedIds.delete(id);
                cb.closest('tr')?.classList.toggle('selected', checked);
            });
        });

        // Row checkbox delegation
        $('#productTableBody')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const id = parseInt(e.target.dataset.id, 10);
                if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
                e.target.closest('tr')?.classList.toggle('selected', e.target.checked);
            }
        });

        // Pagination
        $('#btnPrevPage')?.addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; render(); }
        });

        $('#btnNextPage')?.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredProducts.length / pageSize);
            if (currentPage < totalPages) { currentPage++; render(); }
        });

        $('#pageNumbers')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) { currentPage = parseInt(btn.dataset.page, 10); render(); }
        });

        $('#pageSize')?.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value, 10);
            currentPage = 1;
            render();
        });

        // Refresh
        $('#refreshButton')?.addEventListener('click', () => {
            const loadingState = $('#loadingState');
            const tableBody = $('#productTableBody');
            if (loadingState) loadingState.classList.remove('hidden');
            if (tableBody) tableBody.innerHTML = '';
            setTimeout(() => {
                allProducts = [...MOCK_PRODUCTS];
                applyFiltersAndSort();
            }, 500);
        });

        // Column settings modal
        $('#btnColumnSettings')?.addEventListener('click', openColumnSettings);
        $('#closeColumnSettings')?.addEventListener('click', closeColumnSettingsModal);
        $('#cancelColumnSettings')?.addEventListener('click', closeColumnSettingsModal);
        $('#saveColumnSettings')?.addEventListener('click', saveColumnSettingsFromModal);
        $('#resetColumns')?.addEventListener('click', resetColumnDefaults);

        // Close modal on overlay click
        $('#columnSettingsModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeColumnSettingsModal();
        });

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeColumnSettingsModal();
        });
    }

    // =====================================================
    // IMAGE VIEWER
    // =====================================================
    function showImage(src) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="Ảnh sản phẩm">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // =====================================================
    // INIT
    // =====================================================
    function init() {
        console.log('[ProductWarehouse] Initializing...');

        const pageSizeSelect = $('#pageSize');
        if (pageSizeSelect) pageSize = parseInt(pageSizeSelect.value, 10);

        loadColumnVisibility();
        applyFiltersAndSort();
        setupEventListeners();

        if (typeof lucide !== 'undefined') lucide.createIcons();

        console.log('[ProductWarehouse] Initialized with', allProducts.length, 'products,', COLUMNS.length, 'columns');
    }

    window.warehouseApp = { showImage };

    document.addEventListener('DOMContentLoaded', init);
})();
