/**
 * =====================================================
 * KHO DI CHO - Market Warehouse
 * =====================================================
 *
 * Tracks products purchased from suppliers via TPOS POs.
 * Data stored on Render (PostgreSQL).
 *
 * Features:
 * - Parent/child product grouping (expand/collapse)
 * - Search by name, code, variant
 * - STT (sequence number) per product
 * - Quantity merge when same product added again
 * =====================================================
 */

(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/kho-di-cho';

    // State
    let allData = [];
    let filteredData = [];
    let expandedParents = new Set();
    let searchTimeout = null;

    // =====================================================
    // INITIALIZATION
    // =====================================================

    document.addEventListener('DOMContentLoaded', () => {
        initEventListeners();
        loadData();
    });

    function initEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        searchInput.addEventListener('input', () => {
            clearSearch.style.display = searchInput.value ? 'flex' : 'none';
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => applySearch(searchInput.value), 200);
        });
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch.style.display = 'none';
            applySearch('');
        });

        // Buttons
        document.getElementById('btnRefresh').addEventListener('click', loadData);
        document.getElementById('btnExpandAll').addEventListener('click', expandAll);
        document.getElementById('btnCollapseAll').addEventListener('click', collapseAll);
        document.getElementById('btnClearAll').addEventListener('click', confirmClearAll);

        // Edit modal
        document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
        document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
        document.getElementById('saveEdit').addEventListener('click', saveEdit);

        // Confirm modal
        document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
        document.getElementById('cancelConfirm').addEventListener('click', closeConfirmModal);
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    async function loadData() {
        showLoading(true);
        try {
            const res = await fetch(`${API_BASE}?limit=1000&sort_by=stt&sort_order=ASC`);
            const json = await res.json();

            if (json.success) {
                allData = json.data || [];
                applySearch(document.getElementById('searchInput').value);
            } else {
                showToast('Khong tai duoc du lieu: ' + (json.error || ''), 'error');
            }
        } catch (err) {
            console.error('Load error:', err);
            showToast('Loi ket noi server', 'error');
        }
        showLoading(false);
    }

    // =====================================================
    // SEARCH & FILTER
    // =====================================================

    function applySearch(query) {
        const q = (query || '').toLowerCase().trim();

        if (!q) {
            filteredData = [...allData];
        } else {
            // Find matching items (both parent and child)
            const matchingCodes = new Set();
            const matchingParents = new Set();

            allData.forEach(item => {
                const searchable = [
                    item.product_code,
                    item.parent_product_code,
                    item.product_name,
                    item.variant
                ].filter(Boolean).join(' ').toLowerCase();

                if (searchable.includes(q)) {
                    matchingCodes.add(item.product_code);
                    if (item.parent_product_code) {
                        matchingParents.add(item.parent_product_code);
                    }
                }
            });

            // Include all children of matching parents
            filteredData = allData.filter(item => {
                if (matchingCodes.has(item.product_code)) return true;
                if (item.parent_product_code && matchingParents.has(item.parent_product_code)) return true;
                // If a parent matches, include its children
                if (matchingCodes.has(item.parent_product_code)) return true;
                return false;
            });

            // Auto-expand parents that have matches
            matchingParents.forEach(p => expandedParents.add(p));
        }

        renderTable();
        updateSummary();
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

        // Group by parent_product_code
        const groups = groupByParent(filteredData);
        let html = '';

        groups.forEach(group => {
            if (group.children.length > 0) {
                // Has children - render parent + children
                const isExpanded = expandedParents.has(group.parentCode);
                const totalQty = group.children.reduce((s, c) => s + (c.quantity || 0), 0);
                const totalPrice = group.children.reduce((s, c) => s + (c.quantity || 0) * (parseFloat(c.purchase_price) || 0), 0);
                const firstChild = group.children[0];
                const parentStt = firstChild.stt;

                html += `
                    <tr class="parent-row" data-parent-code="${esc(group.parentCode)}">
                        <td class="col-stt text-right">${parentStt}</td>
                        <td class="col-code">
                            <span class="expand-arrow ${isExpanded ? '' : 'collapsed'}">
                                <i data-lucide="chevron-down"></i>
                            </span>
                            <strong>${esc(group.parentCode)}</strong>
                        </td>
                        <td class="col-name">
                            ${esc(group.parentName)}
                            <span class="parent-badge">${group.children.length} bien the</span>
                        </td>
                        <td class="col-variant"></td>
                        <td class="col-qty text-right"><span class="qty-badge">${totalQty}</span></td>
                        <td class="col-price text-right"></td>
                        <td class="col-total text-right price">${formatCurrency(totalPrice)}</td>
                        <td class="col-actions"></td>
                    </tr>
                `;

                group.children.forEach(child => {
                    html += `
                        <tr class="child-row" data-parent-code="${esc(group.parentCode)}" style="display: ${isExpanded ? '' : 'none'};">
                            <td class="col-stt text-right">${child.stt}</td>
                            <td class="col-code"><span class="product-code">${esc(child.product_code)}</span></td>
                            <td class="col-name">${esc(child.product_name)}</td>
                            <td class="col-variant">${esc(child.variant || '')}</td>
                            <td class="col-qty text-right">${child.quantity || 0}</td>
                            <td class="col-price text-right price">${formatCurrency(parseFloat(child.purchase_price) || 0)}</td>
                            <td class="col-total text-right price">${formatCurrency((child.quantity || 0) * (parseFloat(child.purchase_price) || 0))}</td>
                            <td class="col-actions">
                                <button class="action-btn edit" data-id="${child.id}" title="Sua">
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="action-btn delete" data-id="${child.id}" data-name="${esc(child.product_code)}" title="Xoa">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                });
            } else {
                // Standalone product (no parent group)
                const item = group.item;
                html += `
                    <tr>
                        <td class="col-stt text-right">${item.stt}</td>
                        <td class="col-code"><strong>${esc(item.product_code)}</strong></td>
                        <td class="col-name">${esc(item.product_name)}</td>
                        <td class="col-variant">${esc(item.variant || '')}</td>
                        <td class="col-qty text-right">${item.quantity || 0}</td>
                        <td class="col-price text-right price">${formatCurrency(parseFloat(item.purchase_price) || 0)}</td>
                        <td class="col-total text-right price">${formatCurrency((item.quantity || 0) * (parseFloat(item.purchase_price) || 0))}</td>
                        <td class="col-actions">
                            <button class="action-btn edit" data-id="${item.id}" title="Sua">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="action-btn delete" data-id="${item.id}" data-name="${esc(item.product_code)}" title="Xoa">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;
        tryInitIcons();
        bindTableEvents();
    }

    function groupByParent(data) {
        const groups = [];
        const parentMap = new Map();

        data.forEach(item => {
            const parentCode = item.parent_product_code;

            // Count how many items share this parent code
            if (parentCode) {
                const siblings = data.filter(d => d.parent_product_code === parentCode);
                if (siblings.length > 1) {
                    // Multiple items with same parent → group them
                    if (!parentMap.has(parentCode)) {
                        parentMap.set(parentCode, {
                            parentCode,
                            parentName: extractParentName(siblings),
                            children: []
                        });
                        groups.push(parentMap.get(parentCode));
                    }
                    parentMap.get(parentCode).children.push(item);
                    return;
                }
            }

            // Standalone item
            groups.push({ children: [], item });
        });

        return groups;
    }

    function extractParentName(siblings) {
        // Use the common part of the product name
        if (siblings.length === 0) return '';
        const firstName = siblings[0].product_name || '';
        // Remove variant-specific suffixes
        return firstName.replace(/\s*[-–]\s*(Trang|Den|Xam|Xanh|Do|Nau|Vang|Hong|Tim|Kem|Be|S|M|L|XL|XXL|XXXL|\d+)\s*$/i, '').trim() || firstName;
    }

    function bindTableEvents() {
        // Parent row click → toggle expand
        document.querySelectorAll('.parent-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return;
                const parentCode = row.dataset.parentCode;
                toggleParent(parentCode);
            });
        });

        // Edit buttons
        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                openEditModal(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const name = btn.dataset.name;
                confirmDelete(id, name);
            });
        });
    }

    // =====================================================
    // EXPAND / COLLAPSE
    // =====================================================

    function toggleParent(parentCode) {
        if (expandedParents.has(parentCode)) {
            expandedParents.delete(parentCode);
        } else {
            expandedParents.add(parentCode);
        }

        // Toggle child visibility
        const children = document.querySelectorAll(`tr.child-row[data-parent-code="${parentCode}"]`);
        const parent = document.querySelector(`tr.parent-row[data-parent-code="${parentCode}"]`);
        const arrow = parent?.querySelector('.expand-arrow');
        const isExpanded = expandedParents.has(parentCode);

        children.forEach(row => {
            row.style.display = isExpanded ? '' : 'none';
        });

        if (arrow) {
            arrow.classList.toggle('collapsed', !isExpanded);
        }
    }

    function expandAll() {
        document.querySelectorAll('.parent-row').forEach(row => {
            expandedParents.add(row.dataset.parentCode);
        });
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
        const totalProducts = filteredData.length;
        const totalQty = filteredData.reduce((s, d) => s + (d.quantity || 0), 0);
        const totalAmount = filteredData.reduce((s, d) => s + (d.quantity || 0) * (parseFloat(d.purchase_price) || 0), 0);

        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('totalQuantity').textContent = totalQty;
        document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    }

    // =====================================================
    // EDIT
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

            if (json.success) {
                showToast('Da cap nhat thanh cong');
                closeEditModal();
                loadData();
            } else {
                showToast('Loi: ' + (json.error || ''), 'error');
            }
        } catch (err) {
            showToast('Loi ket noi server', 'error');
        }
    }

    // =====================================================
    // DELETE
    // =====================================================

    let pendingConfirmAction = null;

    function confirmDelete(id, name) {
        document.getElementById('confirmTitle').textContent = 'Xac nhan xoa';
        document.getElementById('confirmMessage').textContent = `Ban co chac muon xoa san pham "${name}" khoi kho?`;
        document.getElementById('okConfirm').textContent = 'Xoa';
        document.getElementById('confirmModal').style.display = 'flex';

        pendingConfirmAction = async () => {
            try {
                const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    showToast('Da xoa san pham');
                    loadData();
                } else {
                    showToast('Loi: ' + (json.error || ''), 'error');
                }
            } catch (err) {
                showToast('Loi ket noi server', 'error');
            }
        };

        document.getElementById('okConfirm').onclick = () => {
            closeConfirmModal();
            if (pendingConfirmAction) pendingConfirmAction();
        };
    }

    function confirmClearAll() {
        if (allData.length === 0) {
            showToast('Kho dang trong', 'error');
            return;
        }

        document.getElementById('confirmTitle').textContent = 'Xoa toan bo kho';
        document.getElementById('confirmMessage').textContent = `Ban co chac muon xoa tat ca ${allData.length} san pham khoi kho di cho? Hanh dong nay khong the hoan tac.`;
        document.getElementById('okConfirm').textContent = 'Xoa tat ca';
        document.getElementById('confirmModal').style.display = 'flex';

        pendingConfirmAction = async () => {
            try {
                const res = await fetch(API_BASE, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    showToast('Da xoa toan bo kho');
                    loadData();
                } else {
                    showToast('Loi: ' + (json.error || ''), 'error');
                }
            } catch (err) {
                showToast('Loi ket noi server', 'error');
            }
        };

        document.getElementById('okConfirm').onclick = () => {
            closeConfirmModal();
            if (pendingConfirmAction) pendingConfirmAction();
        };
    }

    function closeConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
        pendingConfirmAction = null;
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    function formatCurrency(value) {
        return new Intl.NumberFormat('vi-VN').format(Math.round(value));
    }

    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showLoading(show) {
        document.getElementById('loadingState').style.display = show ? 'block' : 'none';
        if (show) {
            document.getElementById('tableBody').innerHTML = '';
            document.getElementById('emptyState').style.display = 'none';
        }
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

    function tryInitIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
})();
