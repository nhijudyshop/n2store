// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * KHO DI CHO v3 - Market Warehouse + TPOS Product Sync
 * =====================================================
 *
 * Full product catalog synced from TPOS + warehouse inventory.
 * Server-side pagination, SSE real-time, category filter.
 *
 * Features:
 * - Parent/child product grouping (expand/collapse)
 * - Server-side search, pagination, category filter
 * - Product images from TPOS
 * - Sync status + manual trigger
 * - SSE real-time updates
 * =====================================================
 */

(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/kho-di-cho';
    const SSE_URL = 'https://n2store-fallback.onrender.com/api/realtime/sse?keys=kho_di_cho';

    // State
    let allData = [];
    let filteredData = [];
    let expandedParents = new Set();
    let searchTimeout = null;
    let sseSource = null;

    // Pagination
    let currentPage = 1;
    let totalPages = 1;
    let totalCount = 0;
    const PAGE_SIZE = 200;

    // Filters
    let currentSearch = '';
    let currentCategory = '';
    let currentInventoryFilter = 'all'; // 'all' | 'has' | 'none'
    let currentSort = 'stt';
    let currentSortOrder = 'ASC';

    // =====================================================
    // INITIALIZATION
    // =====================================================

    document.addEventListener('DOMContentLoaded', () => {
        initEventListeners();
        loadData();
        loadSyncStatus();
        setupSSE();
    });

    function initEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        searchInput.addEventListener('input', () => {
            clearSearch.style.display = searchInput.value ? 'flex' : 'none';
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = searchInput.value;
                currentPage = 1;
                loadData();
            }, 300);
        });
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch.style.display = 'none';
            currentSearch = '';
            currentPage = 1;
            loadData();
        });

        // Buttons
        document.getElementById('btnRefresh').addEventListener('click', () => loadData());
        document.getElementById('btnExpandAll').addEventListener('click', expandAll);
        document.getElementById('btnCollapseAll').addEventListener('click', collapseAll);
        document.getElementById('btnClearAll').addEventListener('click', confirmClearAll);

        // Sync button
        const btnSync = document.getElementById('btnSync');
        if (btnSync) {
            btnSync.addEventListener('click', triggerSync);
        }

        // Inventory filter
        const inventoryFilter = document.getElementById('inventoryFilter');
        if (inventoryFilter) {
            inventoryFilter.addEventListener('change', () => {
                currentInventoryFilter = inventoryFilter.value;
                currentPage = 1;
                loadData();
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                currentCategory = categoryFilter.value;
                currentPage = 1;
                loadData();
            });
        }

        // Edit modal
        document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
        document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
        document.getElementById('saveEdit').addEventListener('click', saveEdit);

        // Confirm modal
        document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
        document.getElementById('cancelConfirm').addEventListener('click', closeConfirmModal);
    }

    // =====================================================
    // DATA LOADING (server-side pagination + filter)
    // =====================================================

    async function loadData() {
        showLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage,
                limit: PAGE_SIZE,
                sort_by: currentSort,
                sort_order: currentSortOrder,
            });

            if (currentSearch) params.set('search', currentSearch);
            if (currentCategory) params.set('category', currentCategory);

            if (currentInventoryFilter === 'has') {
                params.set('has_inventory', 'true');
            } else if (currentInventoryFilter === 'none') {
                params.set('has_inventory', 'false');
            }
            // 'all' → no filter, show active products
            params.set('active', 'true');

            const res = await fetch(`${API_BASE}?${params}`);
            const json = await res.json();

            if (json.success) {
                allData = json.data || [];
                filteredData = [...allData];
                totalCount = json.pagination?.total || allData.length;
                totalPages = json.pagination?.totalPages || 1;
                currentPage = json.pagination?.page || 1;

                renderTable();
                updateSummary();
                renderPagination();
            } else {
                showToast('Không tải được dữ liệu: ' + (json.error || ''), 'error');
            }
        } catch (err) {
            console.error('Load error:', err);
            showToast('Lỗi kết nối server', 'error');
        }
        showLoading(false);
    }

    // =====================================================
    // SSE REAL-TIME
    // =====================================================

    function setupSSE() {
        if (sseSource) { sseSource.close(); sseSource = null; }

        try {
            sseSource = new EventSource(SSE_URL);
            sseSource.addEventListener('update', () => loadData());
            sseSource.addEventListener('deleted', () => loadData());
            sseSource.onerror = () => console.warn('[KHO] SSE disconnected, auto-reconnect');
        } catch (e) {
            console.warn('[KHO] SSE setup failed:', e);
        }
    }

    // =====================================================
    // SYNC STATUS
    // =====================================================

    async function loadSyncStatus() {
        const el = document.getElementById('syncStatus');
        if (!el) return;

        try {
            const res = await fetch(`${API_BASE}/sync/status`);
            const json = await res.json();
            if (json.success && json.lastSync) {
                const last = json.lastSync;
                const ago = timeSince(new Date(last.finished_at || last.started_at));
                const stats = last.stats || {};
                const socketOk = json.socket?.connected;
            el.innerHTML = `
                    <span class="sync-dot ${last.status === 'success' ? 'green' : 'red'}"></span>
                    Sync ${ago} trước
                    ${stats.inserted > 0 || stats.updated > 0 ? `(+${stats.inserted || 0} mới, ${stats.updated || 0} cập nhật)` : ''}
                    — ${json.products?.total || 0} SP (${json.products?.with_inventory || 0} có hàng)
                    ${socketOk ? '<span class="sync-dot green" title="TPOS Socket connected"></span> RT' : '<span class="sync-dot grey" title="TPOS Socket disconnected"></span> RT'}
                `;
            } else {
                el.innerHTML = '<span class="sync-dot grey"></span> Chưa sync';
            }
        } catch (e) {
            if (el) el.innerHTML = '<span class="sync-dot red"></span> Không kết nối';
        }
    }

    async function triggerSync() {
        const btn = document.getElementById('btnSync');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang sync...'; }

        try {
            const res = await fetch(`${API_BASE}/sync?type=full`, { method: 'POST' });
            const json = await res.json();
            showToast(json.message || 'Sync started');

            // Poll status
            const poll = setInterval(async () => {
                const statusRes = await fetch(`${API_BASE}/sync/status`);
                const statusJson = await statusRes.json();
                if (!statusJson.isRunning) {
                    clearInterval(poll);
                    if (btn) { btn.disabled = false; btn.textContent = 'Sync TPOS'; }
                    loadSyncStatus();
                    loadData();
                }
            }, 5000);
        } catch (e) {
            showToast('Lỗi sync: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Sync TPOS'; }
        }
    }

    // =====================================================
    // RENDERING
    // =====================================================

    function renderTable() {
        const tbody = document.getElementById('tableBody');
        const emptyState = document.getElementById('emptyState');

        if (filteredData.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            tryInitIcons();
            return;
        }

        emptyState.style.display = 'none';

        const groups = groupByParent(filteredData);
        let html = '';

        groups.forEach(group => {
            if (group.children.length > 0) {
                const isExpanded = expandedParents.has(group.parentCode);
                const totalQty = group.children.reduce((s, c) => s + (c.quantity || 0), 0);
                const totalPrice = group.children.reduce((s, c) => s + (c.quantity || 0) * (parseFloat(c.purchase_price) || 0), 0);
                const firstChild = group.children[0];
                const imgUrl = firstChild.image_url;

                html += `
                    <tr class="parent-row" data-parent-code="${esc(group.parentCode)}">
                        <td class="col-stt text-right">${firstChild.stt}</td>
                        <td class="col-img">${imgUrl ? `<img src="${esc(imgUrl)}" class="product-thumb" loading="lazy" onerror="this.style.display='none'">` : '<span class="no-img">—</span>'}</td>
                        <td class="col-code">
                            <span class="expand-arrow ${isExpanded ? '' : 'collapsed'}">
                                <i data-lucide="chevron-down"></i>
                            </span>
                            <strong>${esc(group.parentCode)}</strong>
                        </td>
                        <td class="col-name">
                            ${esc(group.parentName)}
                            <span class="parent-badge">${group.children.length} biến thể</span>
                        </td>
                        <td class="col-variant"></td>
                        <td class="col-qty text-right"><span class="qty-badge">${totalQty}</span></td>
                        <td class="col-tpos-qty text-right">${formatNum(group.children.reduce((s, c) => s + (parseFloat(c.tpos_qty_available) || 0), 0))}</td>
                        <td class="col-price text-right"></td>
                        <td class="col-total text-right price">${formatCurrency(totalPrice)}</td>
                        <td class="col-actions"></td>
                    </tr>
                `;

                group.children.forEach(child => {
                    html += renderChildRow(child, group.parentCode, isExpanded);
                });
            } else {
                const item = group.item;
                html += renderStandaloneRow(item);
            }
        });

        tbody.innerHTML = html;
        tryInitIcons();
        bindTableEvents();
    }

    function renderChildRow(child, parentCode, isExpanded) {
        const imgUrl = child.image_url;
        return `
            <tr class="child-row" data-parent-code="${esc(parentCode)}" style="display: ${isExpanded ? '' : 'none'};">
                <td class="col-stt text-right">${child.stt}</td>
                <td class="col-img">${imgUrl ? `<img src="${esc(imgUrl)}" class="product-thumb" loading="lazy" onerror="this.style.display='none'">` : ''}</td>
                <td class="col-code"><span class="product-code">${esc(child.product_code)}</span></td>
                <td class="col-name">${esc(child.product_name)}</td>
                <td class="col-variant">${esc(child.variant || '')}</td>
                <td class="col-qty text-right ${(child.quantity || 0) === 0 ? 'zero-qty' : ''}">${child.quantity || 0}</td>
                <td class="col-tpos-qty text-right">${formatNum(parseFloat(child.tpos_qty_available) || 0)}</td>
                <td class="col-price text-right price">${formatCurrency(parseFloat(child.purchase_price) || 0)}</td>
                <td class="col-total text-right price">${formatCurrency((child.quantity || 0) * (parseFloat(child.purchase_price) || 0))}</td>
                <td class="col-actions">
                    <button class="action-btn edit" data-id="${child.id}" title="Sửa"><i data-lucide="pencil"></i></button>
                    <button class="action-btn delete" data-id="${child.id}" data-name="${esc(child.product_code)}" title="Xóa"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>
        `;
    }

    function renderStandaloneRow(item) {
        const imgUrl = item.image_url;
        return `
            <tr>
                <td class="col-stt text-right">${item.stt}</td>
                <td class="col-img">${imgUrl ? `<img src="${esc(imgUrl)}" class="product-thumb" loading="lazy" onerror="this.style.display='none'">` : '<span class="no-img">—</span>'}</td>
                <td class="col-code"><strong>${esc(item.product_code)}</strong></td>
                <td class="col-name">${esc(item.product_name)}</td>
                <td class="col-variant">${esc(item.variant || '')}</td>
                <td class="col-qty text-right ${(item.quantity || 0) === 0 ? 'zero-qty' : ''}">${item.quantity || 0}</td>
                <td class="col-tpos-qty text-right">${formatNum(parseFloat(item.tpos_qty_available) || 0)}</td>
                <td class="col-price text-right price">${formatCurrency(parseFloat(item.purchase_price) || 0)}</td>
                <td class="col-total text-right price">${formatCurrency((item.quantity || 0) * (parseFloat(item.purchase_price) || 0))}</td>
                <td class="col-actions">
                    <button class="action-btn edit" data-id="${item.id}" title="Sửa"><i data-lucide="pencil"></i></button>
                    <button class="action-btn delete" data-id="${item.id}" data-name="${esc(item.product_code)}" title="Xóa"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>
        `;
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function renderPagination() {
        const el = document.getElementById('pagination');
        if (!el) return;

        if (totalPages <= 1) {
            el.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
                if (i === 2 || i === totalPages - 1) html += '<span class="page-dots">…</span>';
                continue;
            }
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
        el.innerHTML = html;

        el.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page >= 1 && page <= totalPages) {
                    currentPage = page;
                    loadData();
                    window.scrollTo(0, 0);
                }
            });
        });
    }

    // =====================================================
    // GROUP & HELPERS (unchanged logic)
    // =====================================================

    function groupByParent(data) {
        const groups = [];
        const parentMap = new Map();

        data.forEach(item => {
            const parentCode = item.parent_product_code;
            if (parentCode) {
                const siblings = data.filter(d => d.parent_product_code === parentCode);
                if (siblings.length > 1) {
                    if (!parentMap.has(parentCode)) {
                        parentMap.set(parentCode, { parentCode, parentName: extractParentName(siblings), children: [] });
                        groups.push(parentMap.get(parentCode));
                    }
                    parentMap.get(parentCode).children.push(item);
                    return;
                }
            }
            groups.push({ children: [], item });
        });

        return groups;
    }

    function extractParentName(siblings) {
        if (siblings.length === 0) return '';
        const firstName = siblings[0].product_name || '';
        return firstName.replace(/\s*[-–]\s*(Trang|Den|Xam|Xanh|Do|Nau|Vang|Hong|Tim|Kem|Be|S|M|L|XL|XXL|XXXL|\d+)\s*$/i, '').trim() || firstName;
    }

    function bindTableEvents() {
        document.querySelectorAll('.parent-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return;
                toggleParent(row.dataset.parentCode);
            });
        });
        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(parseInt(btn.dataset.id)); });
        });
        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(parseInt(btn.dataset.id), btn.dataset.name); });
        });
    }

    function toggleParent(parentCode) {
        if (expandedParents.has(parentCode)) expandedParents.delete(parentCode);
        else expandedParents.add(parentCode);

        const children = document.querySelectorAll(`tr.child-row[data-parent-code="${parentCode}"]`);
        const parent = document.querySelector(`tr.parent-row[data-parent-code="${parentCode}"]`);
        const arrow = parent?.querySelector('.expand-arrow');
        const isExpanded = expandedParents.has(parentCode);

        children.forEach(row => row.style.display = isExpanded ? '' : 'none');
        if (arrow) arrow.classList.toggle('collapsed', !isExpanded);
    }

    function expandAll() {
        document.querySelectorAll('.parent-row').forEach(row => expandedParents.add(row.dataset.parentCode));
        document.querySelectorAll('.child-row').forEach(row => row.style.display = '');
        document.querySelectorAll('.expand-arrow').forEach(a => a.classList.remove('collapsed'));
    }

    function collapseAll() {
        expandedParents.clear();
        document.querySelectorAll('.child-row').forEach(row => row.style.display = 'none');
        document.querySelectorAll('.expand-arrow').forEach(a => a.classList.add('collapsed'));
    }

    // =====================================================
    // SUMMARY
    // =====================================================

    function updateSummary() {
        const totalProducts = totalCount;
        const totalQty = filteredData.reduce((s, d) => s + (d.quantity || 0), 0);
        const totalAmount = filteredData.reduce((s, d) => s + (d.quantity || 0) * (parseFloat(d.purchase_price) || 0), 0);

        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('totalQuantity').textContent = totalQty;
        document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    }

    // =====================================================
    // EDIT / DELETE (unchanged logic)
    // =====================================================

    let editingId = null;

    function openEditModal(id) {
        const item = allData.find(d => d.id === id);
        if (!item) return;

        editingId = id;
        document.getElementById('editProductCode').value = item.product_code;
        document.getElementById('editProductName').value = item.product_name;
        document.getElementById('editQuantity').value = item.quantity;
        document.getElementById('editPrice').value = parseFloat(item.purchase_price) || 0;
        document.getElementById('editModal').style.display = 'flex';
    }

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        editingId = null;
    }

    async function saveEdit() {
        if (!editingId) return;
        const quantity = parseInt(document.getElementById('editQuantity').value) || 0;
        const purchase_price = parseFloat(document.getElementById('editPrice').value) || 0;

        try {
            const res = await fetch(`${API_BASE}/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, purchase_price })
            });
            const json = await res.json();
            if (json.success) { showToast('Đã cập nhật'); closeEditModal(); loadData(); }
            else showToast('Lỗi: ' + (json.error || ''), 'error');
        } catch (err) { showToast('Lỗi kết nối server', 'error'); }
    }

    let pendingConfirmAction = null;

    function confirmDelete(id, name) {
        document.getElementById('confirmTitle').textContent = 'Xác nhận xóa';
        document.getElementById('confirmMessage').textContent = `Xóa "${name}" khỏi kho?`;
        document.getElementById('okConfirm').textContent = 'Xóa';
        document.getElementById('confirmModal').style.display = 'flex';
        pendingConfirmAction = async () => {
            try {
                const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) { showToast('Đã xóa'); loadData(); }
                else showToast('Lỗi: ' + (json.error || ''), 'error');
            } catch (err) { showToast('Lỗi kết nối server', 'error'); }
        };
        document.getElementById('okConfirm').onclick = () => { closeConfirmModal(); if (pendingConfirmAction) pendingConfirmAction(); };
    }

    function confirmClearAll() {
        if (allData.length === 0) { showToast('Kho đang trống', 'error'); return; }
        document.getElementById('confirmTitle').textContent = 'Xóa toàn bộ kho';
        document.getElementById('confirmMessage').textContent = `Xóa tất cả ${totalCount} sản phẩm? Không thể hoàn tác.`;
        document.getElementById('okConfirm').textContent = 'Xóa tất cả';
        document.getElementById('confirmModal').style.display = 'flex';
        pendingConfirmAction = async () => {
            try {
                const res = await fetch(API_BASE, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) { showToast('Đã xóa toàn bộ kho'); loadData(); }
                else showToast('Lỗi: ' + (json.error || ''), 'error');
            } catch (err) { showToast('Lỗi kết nối server', 'error'); }
        };
        document.getElementById('okConfirm').onclick = () => { closeConfirmModal(); if (pendingConfirmAction) pendingConfirmAction(); };
    }

    function closeConfirmModal() { document.getElementById('confirmModal').style.display = 'none'; pendingConfirmAction = null; }

    // =====================================================
    // UTILITIES
    // =====================================================

    function formatCurrency(v) { return new Intl.NumberFormat('vi-VN').format(Math.round(v)); }
    function formatNum(v) { return v ? new Intl.NumberFormat('vi-VN').format(v) : '0'; }

    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showLoading(show) {
        document.getElementById('loadingState').style.display = show ? 'block' : 'none';
        if (show) { document.getElementById('tableBody').innerHTML = ''; document.getElementById('emptyState').style.display = 'none'; }
    }

    function showToast(msg, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function tryInitIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

    function timeSince(date) {
        const s = Math.floor((Date.now() - date.getTime()) / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m} phút`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} giờ`;
        return `${Math.floor(h / 24)} ngày`;
    }
})();
