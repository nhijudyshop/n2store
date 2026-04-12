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

    // Shared utilities alias
    const WS = window.WarehouseShared;

    // State
    let allData = [];
    let filteredData = [];
    let expandedParents = new Set();
    let selectedIds = new Set();
    let searchTimeout = null;
    let sseCtrl = null; // SSE control object

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
        initSSE();
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

        // Select all checkbox
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.row-check, .parent-check').forEach(cb => cb.checked = checked);
            if (checked) {
                allData.forEach(d => selectedIds.add(d.id));
            } else {
                selectedIds.clear();
            }
            updateBulkBar();
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
    // SSE REAL-TIME (uses shared setupSSE)
    // =====================================================

    function initSSE() {
        sseCtrl = WS.setupSSE({
            sseUrl: SSE_URL,
            onReload: () => loadData(),
            ignoreActions: ['qty_change', 'update'],
            debounceMs: 2000,
        });
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
                        <td class="col-check"><input type="checkbox" class="parent-check" data-parent="${esc(group.parentCode)}"></td>
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
                        <td class="col-sell-price text-right"></td>
                        <td class="col-price text-right"></td>
                        <td class="col-total text-right price">${formatCurrency(totalPrice)}</td>
                        <td class="col-actions"></td>
                    </tr>
                `;

                group.children.forEach(child => {
                    html += renderProductRow(child, group.parentCode, true, isExpanded);
                });
            } else {
                html += renderProductRow(group.item, null, false, false);
            }
        });

        tbody.innerHTML = html;
        tryInitIcons();
        bindTableEvents();
    }

    function renderProductRow(item, parentCode, isChild, isExpanded) {
        const imgUrl = item.image_url;
        const qty = item.quantity || 0;
        const checked = selectedIds.has(item.id) ? 'checked' : '';
        const childClass = isChild ? `child-row" data-parent-code="${esc(parentCode)}" style="display: ${isExpanded ? '' : 'none'};` : '';
        const codeHtml = isChild
            ? `<span class="product-code">${esc(item.product_code)}</span>`
            : `<strong>${esc(item.product_code)}</strong>`;

        return `
            <tr class="${childClass}" data-id="${item.id}">
                <td class="col-check"><input type="checkbox" class="row-check" data-id="${item.id}" ${checked}></td>
                <td class="col-stt text-right">${item.stt}</td>
                <td class="col-img">${imgUrl ? `<img src="${esc(imgUrl)}" class="product-thumb" loading="lazy" onerror="this.style.display='none'">` : '<span class="no-img">—</span>'}</td>
                <td class="col-code">${codeHtml}</td>
                <td class="col-name">${esc(item.name_get || item.product_name)}</td>
                <td class="col-variant">${esc(item.variant || '')}</td>
                <td class="col-qty text-right">
                    <div class="qty-inline">
                        <button class="qty-btn minus" data-id="${item.id}" title="-1">−</button>
                        <span class="${qty === 0 ? 'zero-qty' : ''}">${qty}</span>
                        <button class="qty-btn plus" data-id="${item.id}" title="+1">+</button>
                    </div>
                </td>
                <td class="col-tpos-qty text-right">${formatNum(parseFloat(item.tpos_qty_available) || 0)}</td>
                <td class="col-sell-price text-right price">${formatCurrency(parseFloat(item.selling_price) || 0)}</td>
                <td class="col-price text-right price">${formatCurrency(parseFloat(item.purchase_price) || 0)}</td>
                <td class="col-total text-right price">${formatCurrency(qty * (parseFloat(item.purchase_price) || 0))}</td>
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
        // Parent row expand/collapse
        document.querySelectorAll('.parent-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn') || e.target.closest('.qty-btn') || e.target.closest('input')) return;
                toggleParent(row.dataset.parentCode);
            });
        });

        // Edit buttons
        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(parseInt(btn.dataset.id)); });
        });

        // Delete buttons
        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(parseInt(btn.dataset.id), btn.dataset.name); });
        });

        // Inline qty +/- buttons
        document.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const change = btn.classList.contains('plus') ? 1 : -1;
                await changeQty(id, change);
            });
        });

        // Row checkboxes
        document.querySelectorAll('.row-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = parseInt(cb.dataset.id);
                if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
                updateBulkBar();
            });
        });

        // Parent checkboxes → toggle all children
        document.querySelectorAll('.parent-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const parentCode = cb.dataset.parent;
                const children = allData.filter(d => d.parent_product_code === parentCode);
                children.forEach(c => {
                    if (cb.checked) selectedIds.add(c.id); else selectedIds.delete(c.id);
                });
                document.querySelectorAll(`.child-row[data-parent-code="${parentCode}"] .row-check`).forEach(rc => {
                    rc.checked = cb.checked;
                });
                updateBulkBar();
            });
        });
    }

    // Inline quantity change — optimistic UI update (no full re-render)
    async function changeQty(id, change) {
        // Mute SSE for 3s — our own action, don't re-render
        if (sseCtrl) sseCtrl.mute(3000);

        // Optimistic: update DOM immediately
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            const item = allData.find(d => d.id === id);
            if (item) {
                item.quantity = Math.max(0, (item.quantity || 0) + change);
                const qtySpan = row.querySelector('.qty-inline span');
                if (qtySpan) {
                    qtySpan.textContent = item.quantity;
                    qtySpan.className = item.quantity === 0 ? 'zero-qty' : '';
                }
                const totalCell = row.querySelector('.col-total');
                if (totalCell) {
                    totalCell.textContent = formatCurrency(item.quantity * (parseFloat(item.purchase_price) || 0));
                }
                updateSummary();
            }
        }

        try {
            const res = await fetch(`${API_BASE}/change-qty`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, change }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
            WS.showToast('Lỗi: ' + err.message, 'error');
            if (sseCtrl) sseCtrl.unmute();
            loadData(); // Revert on error
        }
    }

    // Bulk action bar
    function updateBulkBar() {
        let bar = document.getElementById('bulkBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'bulkBar';
            bar.className = 'bulk-bar';
            bar.innerHTML = `
                <span id="bulkCount">0</span> đã chọn
                <button class="btn btn-danger btn-sm" id="bulkDelete">Xóa</button>
                <button class="btn btn-secondary btn-sm" id="bulkDeselect">Bỏ chọn</button>
            `;
            document.querySelector('.table-container').prepend(bar);
            document.getElementById('bulkDelete').addEventListener('click', bulkDelete);
            document.getElementById('bulkDeselect').addEventListener('click', () => {
                selectedIds.clear();
                document.querySelectorAll('.row-check, .parent-check').forEach(cb => cb.checked = false);
                updateBulkBar();
            });
        }

        const count = selectedIds.size;
        document.getElementById('bulkCount').textContent = count;
        bar.style.display = count > 0 ? 'flex' : 'none';
    }

    async function bulkDelete() {
        if (selectedIds.size === 0) return;
        if (!confirm(`Xóa ${selectedIds.size} sản phẩm đã chọn?`)) return;

        try {
            const res = await fetch(`${API_BASE}/bulk-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Đã xóa ${json.deleted} sản phẩm`);
                selectedIds.clear();
                updateBulkBar();
                loadData();
            } else {
                showToast('Lỗi: ' + (json.error || ''), 'error');
            }
        } catch (err) {
            showToast('Lỗi: ' + err.message, 'error');
        }
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
        document.getElementById('editVariant').value = item.variant || '';
        document.getElementById('editQuantity').value = item.quantity;
        document.getElementById('editPurchasePrice').value = parseFloat(item.purchase_price) || 0;
        document.getElementById('editSellingPrice').value = parseFloat(item.selling_price) || 0;

        // Show image if available
        const imgEl = document.getElementById('editImage');
        if (imgEl) {
            if (item.image_url) {
                imgEl.src = item.image_url;
                imgEl.style.display = 'block';
            } else {
                imgEl.style.display = 'none';
            }
        }

        document.getElementById('editModal').style.display = 'flex';
    }

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        editingId = null;
    }

    async function saveEdit() {
        if (!editingId) return;

        const body = {
            quantity: parseInt(document.getElementById('editQuantity').value) || 0,
            purchase_price: parseFloat(document.getElementById('editPurchasePrice').value) || 0,
            selling_price: parseFloat(document.getElementById('editSellingPrice').value) || 0,
            variant: document.getElementById('editVariant').value || null,
            product_name: document.getElementById('editProductName').value,
        };

        try {
            const res = await fetch(`${API_BASE}/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
        document.getElementById('okConfirm').onclick = () => {
            const action = pendingConfirmAction;
            closeConfirmModal();
            if (action) action();
        };
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
        document.getElementById('okConfirm').onclick = () => {
            const action = pendingConfirmAction;
            closeConfirmModal();
            if (action) action();
        };
    }

    function closeConfirmModal() { document.getElementById('confirmModal').style.display = 'none'; pendingConfirmAction = null; }

    // =====================================================
    // UTILITIES (delegates to WarehouseShared)
    // =====================================================

    const formatCurrency = WS.formatCurrency;
    const formatNum = WS.formatNum;
    const esc = WS.escapeHtml;
    const showToast = WS.showToast;
    const tryInitIcons = WS.initIcons;
    const timeSince = WS.timeSince;

    function showLoading(show) {
        document.getElementById('loadingState').style.display = show ? 'block' : 'none';
        if (show) { document.getElementById('tableBody').innerHTML = ''; document.getElementById('emptyState').style.display = 'none'; }
    }
})();
