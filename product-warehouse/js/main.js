/* =====================================================
   KHO SAN PHAM - PRODUCT WAREHOUSE
   Main JS - UI only (mock data, search, filter, sort, pagination)
   ===================================================== */

(function () {
    'use strict';

    // =====================================================
    // MOCK DATA
    // =====================================================
    const MOCK_PRODUCTS = [
        { id: 1, code: 'B146', name: 'B1 1103 AO SMI KE BBR NAU 2665', price: 340000, qty: 1, image: '' },
        { id: 2, code: 'B147', name: 'B1 1103 AO SMI ONG THEU TRANG 2667', price: 320000, qty: 1, image: '' },
        { id: 3, code: 'B149', name: 'B1 1103 AO TD LAI REN NUT TIM TRANG 88083', price: 390000, qty: 1, image: '' },
        { id: 4, code: 'B148', name: 'B1 1103 AO SMI TAY REN DOC TRANG 85110', price: 390000, qty: 1, image: '' },
        { id: 5, code: 'B145', name: 'B1 1103 AO SMI NUT VANG LAI REN TRANG 9518', price: 380000, qty: 1, image: '' },
        { id: 6, code: 'B164', name: 'B27 1103 AO THUN DR NGUA HOA VAN NU SIZE', price: 190000, qty: 1, image: '' },
        { id: 7, code: 'B165', name: 'B27 1103 AO THUN NGUA PHI CANH HOA HONG SIZE', price: 190000, qty: 2, image: '' },
        { id: 8, code: 'B162', name: 'B27 1103 AO THUN DR THANH PHO HOA NU SIZE', price: 190000, qty: 2, image: '' },
        { id: 9, code: 'B161', name: 'B27 1103 AO THUN DR NGUA LAU DAI TRANG SIZE', price: 190000, qty: 2, image: '' },
        { id: 10, code: 'B150', name: 'B1 1103 AO SMI REN CUC TRANG 72015', price: 360000, qty: 3, image: '' },
        { id: 11, code: 'B151', name: 'B1 1103 AO SMI TAY BEO HOA NHI TRANG 6892', price: 350000, qty: 0, image: '' },
        { id: 12, code: 'B152', name: 'B1 1103 AO SMI CUC NGOC TAY DON TRANG 5524', price: 370000, qty: 5, image: '' },
        { id: 13, code: 'B153', name: 'B1 1103 AO SMI DANG DAI TAY BEO TRANG 8823', price: 340000, qty: 0, image: '' },
        { id: 14, code: 'B160', name: 'B27 1103 AO THUN DR NGUA HOA SEN NU SIZE', price: 190000, qty: 4, image: '' },
        { id: 15, code: 'B163', name: 'B27 1103 AO THUN DR NGUA CANH BUOM SIZE', price: 190000, qty: 3, image: '' },
        { id: 16, code: 'B170', name: 'B28 1103 AO KIEU NU TAY LOE REN TRANG 4421', price: 280000, qty: 7, image: '' },
        { id: 17, code: 'B171', name: 'B28 1103 AO KIEU NU CO TIM THEU HOA 3356', price: 290000, qty: 2, image: '' },
        { id: 18, code: 'B172', name: 'B28 1103 AO KIEU NU DANG RONG TAY DAI 5578', price: 310000, qty: 0, image: '' },
        { id: 19, code: 'B180', name: 'B30 1103 DAM NU HOA NHI CO TRON TRANG SIZE', price: 450000, qty: 1, image: '' },
        { id: 20, code: 'B181', name: 'B30 1103 DAM NU HOA TULIP VANG KEM SIZE', price: 460000, qty: 6, image: '' },
        { id: 21, code: 'B182', name: 'B30 1103 DAM NU SOC CA RO DEN TRANG SIZE', price: 420000, qty: 3, image: '' },
        { id: 22, code: 'B183', name: 'B30 1103 DAM NU THEU HOA LAVENDER TIM SIZE', price: 480000, qty: 2, image: '' },
        { id: 23, code: 'B190', name: 'B32 1103 QUAN NU SUONG ONG RONG DEN SIZE', price: 250000, qty: 8, image: '' },
        { id: 24, code: 'B191', name: 'B32 1103 QUAN NU ONG DUNG NAU BE SIZE', price: 260000, qty: 4, image: '' },
        { id: 25, code: 'B192', name: 'B32 1103 QUAN NU LUNG CAO CO GIAN DEN SIZE', price: 270000, qty: 0, image: '' },
        { id: 26, code: 'B200', name: 'B35 1103 SET BO AO CHAN VAY HOA HONG SIZE', price: 520000, qty: 1, image: '' },
        { id: 27, code: 'B201', name: 'B35 1103 SET BO AO VEST + QUAN DAI DEN SIZE', price: 580000, qty: 3, image: '' },
        { id: 28, code: 'B202', name: 'B35 1103 SET BO AO CROPTOP + CHAN VAY TRANG', price: 490000, qty: 2, image: '' },
        { id: 29, code: 'B210', name: 'B38 1103 AO BLAZER NU FORM RONG KEM SIZE', price: 550000, qty: 1, image: '' },
        { id: 30, code: 'B211', name: 'B38 1103 AO BLAZER NU 2 LOP DEN SIZE', price: 580000, qty: 0, image: '' },
    ];

    // =====================================================
    // STATE
    // =====================================================
    let allProducts = [...MOCK_PRODUCTS];
    let filteredProducts = [];
    let currentPage = 1;
    let pageSize = 50;
    let sortField = null;
    let sortDirection = 'asc'; // 'asc' | 'desc'

    // =====================================================
    // DOM REFS
    // =====================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const searchInput = $('#searchInput');
    const searchClear = $('#searchClear');
    const filterStock = $('#filterStock');
    const filterCode = $('#filterCode');
    const filterName = $('#filterName');
    const productCount = $('#productCount');
    const tableBody = $('#productTableBody');
    const loadingState = $('#loadingState');
    const emptyState = $('#emptyState');
    const paginationInfo = $('#paginationInfo');
    const pageNumbers = $('#pageNumbers');
    const btnPrevPage = $('#btnPrevPage');
    const btnNextPage = $('#btnNextPage');
    const pageSizeSelect = $('#pageSize');

    // =====================================================
    // FORMAT HELPERS
    // =====================================================
    function formatPrice(price) {
        if (!price && price !== 0) return '-';
        return price.toLocaleString('vi-VN');
    }

    function formatQty(qty) {
        if (qty === null || qty === undefined) return '-';
        return qty.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getQtyClass(qty) {
        if (qty <= 0) return 'qty-out-of-stock';
        if (qty <= 5) return 'qty-low-stock';
        return 'qty-in-stock';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    // =====================================================
    // FILTER & SORT
    // =====================================================
    function applyFiltersAndSort() {
        const searchQuery = (searchInput?.value || '').trim().toLowerCase();
        const stockFilter = filterStock?.value || 'all';
        const codeFilter = (filterCode?.value || '').trim().toLowerCase();
        const nameFilter = (filterName?.value || '').trim().toLowerCase();

        filteredProducts = allProducts.filter(p => {
            // Global search
            if (searchQuery) {
                const matchCode = p.code.toLowerCase().includes(searchQuery);
                const matchName = p.name.toLowerCase().includes(searchQuery);
                if (!matchCode && !matchName) return false;
            }

            // Column filters
            if (codeFilter && !p.code.toLowerCase().includes(codeFilter)) return false;
            if (nameFilter && !p.name.toLowerCase().includes(nameFilter)) return false;

            // Stock filter
            if (stockFilter === 'in-stock' && p.qty <= 0) return false;
            if (stockFilter === 'low-stock' && (p.qty <= 0 || p.qty > 5)) return false;
            if (stockFilter === 'out-of-stock' && p.qty > 0) return false;

            return true;
        });

        // Sort
        if (sortField) {
            filteredProducts.sort((a, b) => {
                let valA, valB;
                switch (sortField) {
                    case 'code': valA = a.code; valB = b.code; break;
                    case 'name': valA = a.name; valB = b.name; break;
                    case 'price': valA = a.price; valB = b.price; break;
                    case 'qty': valA = a.qty; valB = b.qty; break;
                    default: return 0;
                }
                if (typeof valA === 'string') {
                    const cmp = valA.localeCompare(valB, 'vi');
                    return sortDirection === 'asc' ? cmp : -cmp;
                }
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            });
        }

        // Reset to page 1 when filters change
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
        if (productCount) {
            productCount.textContent = `${total} san pham`;
        }

        // Hide loading
        if (loadingState) loadingState.classList.add('hidden');

        // Show/hide empty state
        if (emptyState) {
            emptyState.classList.toggle('hidden', total > 0);
        }

        // Build table rows
        const searchQuery = (searchInput?.value || '').trim();

        if (tableBody) {
            if (total === 0) {
                tableBody.innerHTML = '';
            } else {
                tableBody.innerHTML = pageProducts.map(p => {
                    const imageHtml = p.image
                        ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.code)}" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`
                        : `<div class="product-thumb-placeholder"><i data-lucide="image-off"></i></div>`;

                    return `<tr>
                        <td class="product-image-cell">${imageHtml}</td>
                        <td><span class="product-code">${highlightMatch(p.code, searchQuery)}</span></td>
                        <td><span class="product-name">${highlightMatch(p.name, searchQuery)}</span></td>
                        <td class="product-price">${formatPrice(p.price)}</td>
                        <td class="product-qty ${getQtyClass(p.qty)}">${formatQty(p.qty)}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Render pagination
        renderPagination(total, totalPages, start, end);

        // Re-init Lucide icons for new content
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function renderPagination(total, totalPages, start, end) {
        if (paginationInfo) {
            paginationInfo.textContent = total > 0
                ? `Hien thi ${start + 1} - ${end} / ${total} san pham`
                : 'Khong co san pham';
        }

        if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
        if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages;

        if (pageNumbers) {
            const pages = [];
            const maxVisible = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage < maxVisible - 1) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                pages.push(`<button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
            pageNumbers.innerHTML = pages.join('');
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================
    function setupEventListeners() {
        // Search
        let searchTimeout;
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFiltersAndSort();
                toggleSearchClear();
            }, 250);
        });

        searchClear?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            toggleSearchClear();
            applyFiltersAndSort();
        });

        // Stock filter
        filterStock?.addEventListener('change', applyFiltersAndSort);

        // Column filters - toggle input on filter icon click
        $$('.filter-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const input = e.target.closest('.th-filter')?.querySelector('.th-filter-input');
                if (input) {
                    input.classList.toggle('active');
                    if (input.classList.contains('active')) {
                        input.focus();
                    }
                }
            });
        });

        // Column filter inputs
        let colFilterTimeout;
        [filterCode, filterName].forEach(input => {
            input?.addEventListener('input', () => {
                clearTimeout(colFilterTimeout);
                colFilterTimeout = setTimeout(applyFiltersAndSort, 250);
            });
        });

        // Sort
        $$('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                // Don't sort when clicking filter inputs
                if (e.target.closest('.th-filter')) return;

                const field = th.dataset.sort;
                if (sortField === field) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortField = field;
                    sortDirection = 'asc';
                }

                // Update sort UI
                $$('.sortable').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
                th.classList.add(`sort-${sortDirection}`);

                applyFiltersAndSort();
            });
        });

        // Pagination
        btnPrevPage?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                render();
            }
        });

        btnNextPage?.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredProducts.length / pageSize);
            if (currentPage < totalPages) {
                currentPage++;
                render();
            }
        });

        pageNumbers?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) {
                currentPage = parseInt(btn.dataset.page, 10);
                render();
            }
        });

        pageSizeSelect?.addEventListener('change', () => {
            pageSize = parseInt(pageSizeSelect.value, 10);
            currentPage = 1;
            render();
        });

        // Refresh button
        $('#refreshButton')?.addEventListener('click', () => {
            // TODO: Replace with real data fetch
            if (loadingState) loadingState.classList.remove('hidden');
            if (tableBody) tableBody.innerHTML = '';
            setTimeout(() => {
                allProducts = [...MOCK_PRODUCTS];
                applyFiltersAndSort();
            }, 500);
        });
    }

    function toggleSearchClear() {
        if (searchClear) {
            searchClear.classList.toggle('hidden', !searchInput?.value);
        }
    }

    // =====================================================
    // IMAGE VIEWER
    // =====================================================
    function showImage(src) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="Product Image">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // =====================================================
    // INIT
    // =====================================================
    function init() {
        console.log('[ProductWarehouse] Initializing...');

        // Set page size from select
        if (pageSizeSelect) {
            pageSize = parseInt(pageSizeSelect.value, 10);
        }

        // Apply initial filters & render
        applyFiltersAndSort();

        // Setup events
        setupEventListeners();

        // Init Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        console.log('[ProductWarehouse] Initialized with', allProducts.length, 'products');
    }

    // Expose for image viewer
    window.warehouseApp = { showImage };

    // Start
    document.addEventListener('DOMContentLoaded', init);
})();
