/* =====================================================
   BÁN HÀNG - SALES FUNCTIONALITY
   Excel Import & Firebase Storage
   ===================================================== */

// Bán Hàng Module - Firebase version
const BanHangModule = (function() {
    'use strict';

    // Firebase Configuration (same as hanghoan.js)
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    };

    // Firebase references (use existing app if available)
    let db = null;
    let banHangCollectionRef = null;

    // State
    let banHangData = [];
    let filteredData = [];
    let isLoading = false;

    // Pagination state
    let currentPage = 1;
    let pageSize = 50;

    // DOM Elements cache
    const elements = {
        tableBody: null,
        emptyState: null,
        loadingState: null,
        searchInput: null,
        statusFilter: null,
        startDate: null,
        endDate: null,
        pageSize: null,
        statTotal: null,
        statConfirmed: null,
        statPaid: null,
        statTotalAmount: null,
        // Pagination elements
        pagination: null,
        showingFrom: null,
        showingTo: null,
        totalRecords: null,
        currentPageEl: null,
        totalPages: null,
        firstPage: null,
        prevPage: null,
        nextPage: null,
        lastPage: null
    };

    // Initialize Firebase
    function initFirebase() {
        try {
            // Check if Firebase is already initialized
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            banHangCollectionRef = db.collection("ban_hang");
            console.log('✅ BanHang Firebase initialized');
            return true;
        } catch (error) {
            console.error('❌ Error initializing Firebase for BanHang:', error);
            return false;
        }
    }

    // Initialize
    function init() {
        initFirebase();
        cacheElements();
        bindEvents();
        setDefaultDates();
        // Load data from Firebase on init
        loadFromFirebase();
        console.log('BanHangModule initialized (Firebase version)');
    }

    // Cache DOM elements
    function cacheElements() {
        elements.tableBody = document.getElementById('banhangTableBody');
        elements.emptyState = document.getElementById('banhangEmptyState');
        elements.loadingState = document.getElementById('banhangLoadingState');
        elements.searchInput = document.getElementById('banhangSearchInput');
        elements.statusFilter = document.getElementById('banhangStatusFilter');
        elements.startDate = document.getElementById('banhangStartDate');
        elements.endDate = document.getElementById('banhangEndDate');
        elements.pageSize = document.getElementById('banhangPageSize');
        elements.statTotal = document.getElementById('banhangStatTotal');
        elements.statConfirmed = document.getElementById('banhangStatConfirmed');
        elements.statPaid = document.getElementById('banhangStatPaid');
        elements.statTotalAmount = document.getElementById('banhangStatTotalAmount');
        // Pagination elements
        elements.pagination = document.getElementById('banhangPagination');
        elements.showingFrom = document.getElementById('banhangShowingFrom');
        elements.showingTo = document.getElementById('banhangShowingTo');
        elements.totalRecords = document.getElementById('banhangTotalRecords');
        elements.currentPageEl = document.getElementById('banhangCurrentPage');
        elements.totalPages = document.getElementById('banhangTotalPages');
        elements.firstPage = document.getElementById('banhangFirstPage');
        elements.prevPage = document.getElementById('banhangPrevPage');
        elements.nextPage = document.getElementById('banhangNextPage');
        elements.lastPage = document.getElementById('banhangLastPage');
    }

    // Set default dates (1 month ago to today)
    function setDefaultDates() {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        if (elements.startDate) {
            elements.startDate.value = formatDateForInput(oneMonthAgo);
        }
        if (elements.endDate) {
            elements.endDate.value = formatDateForInput(today);
        }
    }

    // Format date for input[type="date"]
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Bind events
    function bindEvents() {
        // Search input
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Status filter
        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }

        // Date filters
        if (elements.startDate) {
            elements.startDate.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }
        if (elements.endDate) {
            elements.endDate.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }

        // Page size
        if (elements.pageSize) {
            elements.pageSize.addEventListener('change', (e) => {
                pageSize = parseInt(e.target.value) || 50;
                currentPage = 1;
                renderCurrentPage();
            });
        }

        // Pagination buttons
        if (elements.firstPage) {
            elements.firstPage.addEventListener('click', () => goToPage(1));
        }
        if (elements.prevPage) {
            elements.prevPage.addEventListener('click', () => goToPage(currentPage - 1));
        }
        if (elements.nextPage) {
            elements.nextPage.addEventListener('click', () => goToPage(currentPage + 1));
        }
        if (elements.lastPage) {
            elements.lastPage.addEventListener('click', () => goToPage(getTotalPages()));
        }
    }

    // Get total pages
    function getTotalPages() {
        return Math.ceil(filteredData.length / pageSize) || 1;
    }

    // Go to specific page
    function goToPage(page) {
        const totalPages = getTotalPages();
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPage = page;
        renderCurrentPage();
    }

    // Render current page
    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredData.length);
        const pageData = filteredData.slice(startIndex, endIndex);

        renderTable(pageData, startIndex);
        updatePagination();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Update pagination UI
    function updatePagination() {
        const totalPages = getTotalPages();
        const totalRecords = filteredData.length;
        const startIndex = (currentPage - 1) * pageSize + 1;
        const endIndex = Math.min(currentPage * pageSize, totalRecords);

        if (elements.showingFrom) elements.showingFrom.textContent = totalRecords > 0 ? startIndex : 0;
        if (elements.showingTo) elements.showingTo.textContent = endIndex;
        if (elements.totalRecords) elements.totalRecords.textContent = totalRecords;
        if (elements.currentPageEl) elements.currentPageEl.textContent = currentPage;
        if (elements.totalPages) elements.totalPages.textContent = totalPages;

        // Update button states
        if (elements.firstPage) elements.firstPage.disabled = currentPage <= 1;
        if (elements.prevPage) elements.prevPage.disabled = currentPage <= 1;
        if (elements.nextPage) elements.nextPage.disabled = currentPage >= totalPages;
        if (elements.lastPage) elements.lastPage.disabled = currentPage >= totalPages;
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Show loading state
    function showLoading() {
        isLoading = true;
        if (elements.loadingState) {
            elements.loadingState.classList.add('show');
        }
        if (elements.tableBody) {
            elements.tableBody.innerHTML = '';
        }
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Hide loading state
    function hideLoading() {
        isLoading = false;
        if (elements.loadingState) {
            elements.loadingState.classList.remove('show');
        }
    }

    // Show empty state
    function showEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.add('show');
        }
    }

    // Hide empty state
    function hideEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Format currency
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    // Constants
    const MAX_RECORDS_PER_DOC = 500; // Firebase document size limit workaround

    /**
     * Map TPOS API response item to internal format
     */
    function mapTPOSToInternal(item, index) {
        return {
            id: `tpos_${item.Id || Date.now()}_${index}`,
            tposId: item.Id, // Keep TPOS ID for reference
            stt: index + 1,
            khachHang: item.PartnerDisplayName || item.FacebookName || '',
            email: item.PartnerEmail || '',
            facebook: item.FacebookName || item.DisplayFacebookName || '',
            dienThoai: String(item.Phone || ''),
            diaChi: item.FullAddress || item.Address || '',
            so: item.Number || '', // Invoice number - used for duplicate detection
            ngayBan: item.DateInvoice || null,
            ngayXacNhan: item.DateCreated || null,
            tongTien: parseFloat(item.AmountTotal || 0),
            conNo: parseFloat(item.Residual || 0),
            trangThai: item.ShowState || '',
            doiTacGH: item.CarrierName || '',
            maVanDon: item.TrackingRef || '',
            cod: parseFloat(item.CashOnDelivery || 0),
            phiShipGH: item.DeliveryPrice ? formatCurrency(item.DeliveryPrice) : '',
            tienCoc: parseFloat(item.AmountDeposit || 0),
            traTruoc: parseFloat(item.PaymentAmount || 0),
            khoiLuongShip: item.ShipWeight || '',
            trangThaiGH: item.ShowShipStatus || '',
            doiSoatGH: item.ShipPaymentStatus || '',
            ghiChuGH: item.DeliveryNote || '',
            ghiChu: item.Comment || '',
            nguoiBan: item.UserName || item.CreateByName || '',
            nguon: item.Source || '',
            kenh: item.CRMTeamName || '',
            congTy: item.CompanyName || '',
            thamChieu: item.Reference || '',
            phiGiaoHang: item.CustomerDeliveryPrice ? formatCurrency(item.CustomerDeliveryPrice) : '',
            nhan: item.Tags || '',
            tienGiam: parseFloat(item.DecreaseAmount || 0),
            chietKhau: parseFloat(item.Discount || 0),
            thanhTienChietKhau: parseFloat(item.DiscountAmount || 0),
            importedAt: new Date().toISOString(),
            source: 'tpos' // Mark source for tracking
        };
    }

    /**
     * Merge new data with existing data, handling duplicates
     * Strategy: Use invoice number (so) as unique key
     * - If duplicate found: UPDATE the existing record with new data
     * - If new: ADD to the list
     */
    function mergeDataWithDedup(newData, existingData) {
        // Create a map of existing data by invoice number (so)
        const existingMap = new Map();
        existingData.forEach(item => {
            if (item.so) {
                existingMap.set(item.so, item);
            }
        });

        let updatedCount = 0;
        let newCount = 0;
        const resultMap = new Map(existingMap);

        // Process new data
        newData.forEach(item => {
            if (item.so) {
                if (existingMap.has(item.so)) {
                    // Duplicate found - update with new data but keep original id
                    const existing = existingMap.get(item.so);
                    resultMap.set(item.so, {
                        ...item,
                        id: existing.id, // Keep original ID
                        importedAt: existing.importedAt // Keep original import time
                    });
                    updatedCount++;
                } else {
                    // New record
                    resultMap.set(item.so, item);
                    newCount++;
                }
            } else {
                // No invoice number - add with unique key
                const uniqueKey = `no_invoice_${item.id || Date.now()}_${Math.random()}`;
                resultMap.set(uniqueKey, item);
                newCount++;
            }
        });

        // Also add existing items without invoice number
        existingData.forEach(item => {
            if (!item.so) {
                const uniqueKey = `existing_no_invoice_${item.id || Date.now()}_${Math.random()}`;
                if (!resultMap.has(uniqueKey)) {
                    resultMap.set(uniqueKey, item);
                }
            }
        });

        return {
            data: Array.from(resultMap.values()),
            updatedCount,
            newCount,
            duplicateCount: updatedCount
        };
    }

    /**
     * Fetch new TPOS token using credentials (same as TokenManager)
     */
    async function fetchNewTPOSToken() {
        const TOKEN_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';
        const credentials = {
            grant_type: 'password',
            username: 'nvkt',
            password: 'Aa@123456789',
            client_id: 'tmtWebApp'
        };

        console.log('[BANHANG] Fetching new TPOS token...');

        const formData = new URLSearchParams();
        formData.append('grant_type', credentials.grant_type);
        formData.append('username', credentials.username);
        formData.append('password', credentials.password);
        formData.append('client_id', credentials.client_id);

        const response = await fetch(TOKEN_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`Token API error: ${response.status} ${response.statusText}`);
        }

        const tokenData = await response.json();

        if (!tokenData.access_token) {
            throw new Error('Invalid token response: missing access_token');
        }

        // Calculate expiry and save to localStorage (same format as TokenManager)
        const expiresAt = Date.now() + (tokenData.expires_in * 1000);
        const dataToSave = {
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_in: tokenData.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };

        localStorage.setItem('bearer_token_data', JSON.stringify(dataToSave));
        console.log('[BANHANG] ✅ New token saved, expires:', new Date(expiresAt).toLocaleString());

        return tokenData.access_token;
    }

    /**
     * Get valid TPOS token (from localStorage or fetch new one)
     */
    async function getTPOSToken() {
        const tokenData = localStorage.getItem('bearer_token_data');

        if (tokenData) {
            try {
                const parsed = JSON.parse(tokenData);
                // Check if token is still valid (with 5 min buffer)
                const bufferTime = 5 * 60 * 1000;
                if (parsed.access_token && parsed.expires_at && Date.now() < (parsed.expires_at - bufferTime)) {
                    return parsed.access_token;
                }
                console.log('[BANHANG] Token expired, fetching new one...');
            } catch (e) {
                console.warn('[BANHANG] Error parsing token data:', e);
            }
        }

        // No valid token, fetch new one
        return await fetchNewTPOSToken();
    }

    /**
     * Fetch data from TPOS API via Cloudflare Worker proxy
     * @param {Date} startDate - Start date filter
     * @param {Date} endDate - End date filter
     */
    async function fetchFromTPOS(startDate, endDate) {
        // Get or fetch token
        const authToken = await getTPOSToken();

        // Format dates for API
        const formatDateForAPI = (date) => {
            return date.toISOString().replace('.000Z', '+00:00');
        };

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
        const end = endDate || new Date();
        end.setHours(23, 59, 59, 999);

        const startISO = formatDateForAPI(start);
        const endISO = formatDateForAPI(end);

        // Use Cloudflare Worker proxy to bypass CORS
        const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const apiUrl = `${PROXY_URL}/api/odata/FastSaleOrder/ODataService.GetView?&$top=1000&$orderby=DateInvoice+desc&$filter=(Type+eq+'invoice'+and+DateInvoice+ge+${startISO}+and+DateInvoice+le+${endISO}+and+IsMergeCancel+ne+true)&$count=true`;

        console.log('Fetching from TPOS via proxy:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Token đã hết hạn. Vui lòng vào Orders Report để refresh token.');
            }
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`TPOS returned ${result['@odata.count'] || 0} total records, fetched ${result.value?.length || 0}`);

        return result.value || [];
    }

    /**
     * Refresh data from TPOS API and merge with existing
     * Uses token from bearer_token_data (shared with other modules)
     */
    async function refreshFromTPOS() {
        showLoading();

        if (typeof showNotification === 'function') {
            showNotification('Đang fetch dữ liệu từ TPOS...', 'info');
        }

        try {
            // Get date range from filters
            const startDate = elements.startDate?.value ? new Date(elements.startDate.value) : null;
            const endDate = elements.endDate?.value ? new Date(elements.endDate.value) : null;

            // Fetch from TPOS (uses bearer_token_data from localStorage)
            const tposData = await fetchFromTPOS(startDate, endDate);

            if (tposData.length === 0) {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('Không có dữ liệu mới từ TPOS', 'info');
                }
                return;
            }

            // Map to internal format
            const mappedData = tposData.map((item, index) => mapTPOSToInternal(item, index));

            // Merge with existing data, handling duplicates
            const mergeResult = mergeDataWithDedup(mappedData, banHangData);

            if (typeof showNotification === 'function') {
                showNotification('Đang lưu lên Firebase...', 'info');
            }

            // Save to Firebase
            const saveSuccess = await saveToFirebase(mergeResult.data);

            if (saveSuccess) {
                // Update local state
                banHangData = mergeResult.data;
                filteredData = [...banHangData];

                hideLoading();
                currentPage = 1;
                renderCurrentPage();
                updateStats();

                let message = `TPOS: +${mergeResult.newCount} mới`;
                if (mergeResult.duplicateCount > 0) {
                    message += `, cập nhật ${mergeResult.duplicateCount} trùng`;
                }
                message += `. Tổng: ${banHangData.length} đơn`;

                if (typeof showNotification === 'function') {
                    showNotification(message, 'success');
                }
            } else {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('Lỗi khi lưu lên Firebase', 'error');
                }
            }

        } catch (error) {
            console.error('Error fetching from TPOS:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi: ' + error.message, 'error');
            }
        }
    }

    /**
     * Load data from Firebase on page init
     */
    async function loadFromFirebase() {
        if (!banHangCollectionRef) {
            console.error('Firebase not initialized');
            return;
        }

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang tải dữ liệu từ Firebase...', 'info');
        }

        try {
            // Load all chunks
            const snapshot = await banHangCollectionRef.get();
            let allOrders = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.orders && Array.isArray(data.orders)) {
                    allOrders = allOrders.concat(data.orders);
                }
            });

            banHangData = allOrders;
            filteredData = [...banHangData];

            console.log(`✅ Loaded ${banHangData.length} records from Firebase`);

            hideLoading();
            currentPage = 1;
            renderCurrentPage();
            updateStats();

            if (typeof showNotification === 'function' && banHangData.length > 0) {
                showNotification(`Đã tải ${banHangData.length} đơn hàng từ Firebase`, 'success');
            }

            if (banHangData.length === 0) {
                showEmptyState();
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi tải dữ liệu: ' + error.message, 'error');
            }
        }
    }

    /**
     * Save data to Firebase - split into chunks to avoid size limit
     */
    async function saveToFirebase(data) {
        if (!banHangCollectionRef) {
            console.error('Firebase not initialized');
            return false;
        }

        try {
            // Delete all existing documents first
            const snapshot = await banHangCollectionRef.get();
            const deletePromises = [];
            snapshot.forEach(doc => {
                deletePromises.push(doc.ref.delete());
            });
            await Promise.all(deletePromises);

            // Split data into chunks
            const chunks = [];
            for (let i = 0; i < data.length; i += MAX_RECORDS_PER_DOC) {
                chunks.push(data.slice(i, i + MAX_RECORDS_PER_DOC));
            }

            // Save each chunk as a separate document
            const savePromises = chunks.map((chunk, index) => {
                return banHangCollectionRef.doc(`chunk_${index}`).set({
                    orders: chunk,
                    chunkIndex: index,
                    lastUpdated: new Date().toISOString(),
                    count: chunk.length
                });
            });

            // Also save metadata
            savePromises.push(banHangCollectionRef.doc('_metadata').set({
                totalCount: data.length,
                chunkCount: chunks.length,
                lastUpdated: new Date().toISOString()
            }));

            await Promise.all(savePromises);
            console.log(`✅ Saved ${data.length} records to Firebase in ${chunks.length} chunks`);
            return true;
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            return false;
        }
    }

    // Get status class
    function getStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('thanh toán') || statusLower === 'paid') {
            return 'paid';
        } else if (statusLower.includes('xác nhận') || statusLower === 'confirmed') {
            return 'confirmed';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'draft';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled') {
            return 'cancelled';
        }
        return 'draft';
    }

    // Render table - match Excel structure
    function renderTable(data, startIndex = 0) {
        if (!elements.tableBody) return;

        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '';
            if (filteredData.length === 0) {
                showEmptyState();
            }
            return;
        }

        hideEmptyState();

        const html = data.map((item, index) => `
            <tr data-index="${startIndex + index}" data-id="${item.id || ''}">
                <td class="text-center">${startIndex + index + 1}</td>
                <td>${escapeHtml(item.khachHang || '')}</td>
                <td>${escapeHtml(item.email || '')}</td>
                <td>${escapeHtml(item.facebook || '')}</td>
                <td><a href="tel:${item.dienThoai || ''}" class="phone-link">${escapeHtml(item.dienThoai || '')}</a></td>
                <td class="col-address">${escapeHtml(item.diaChi || '')}</td>
                <td>${escapeHtml(item.so || '')}</td>
                <td class="text-center">${formatDate(item.ngayBan)}</td>
                <td class="text-center">${formatDate(item.ngayXacNhan)}</td>
                <td class="text-right">${formatCurrency(item.tongTien)}</td>
                <td class="text-right">${formatCurrency(item.conNo)}</td>
                <td class="text-center">
                    <span class="banhang-status ${getStatusClass(item.trangThai)}">${escapeHtml(item.trangThai || '')}</span>
                </td>
                <td>${escapeHtml(item.doiTacGH || '')}</td>
                <td>${escapeHtml(item.maVanDon || '')}</td>
                <td class="text-right">${formatCurrency(item.cod)}</td>
                <td class="text-right">${escapeHtml(item.phiShipGH || '')}</td>
                <td class="text-right">${formatCurrency(item.tienCoc)}</td>
                <td class="text-right">${formatCurrency(item.traTruoc)}</td>
                <td class="text-center">${escapeHtml(item.khoiLuongShip || '')}</td>
                <td class="text-center">
                    <span class="banhang-status-gh ${getDeliveryStatusClass(item.trangThaiGH)}">${escapeHtml(item.trangThaiGH || '')}</span>
                </td>
                <td>${escapeHtml(item.doiSoatGH || '')}</td>
                <td class="col-note">${escapeHtml(item.ghiChuGH || '')}</td>
                <td class="col-note">${escapeHtml(item.ghiChu || '')}</td>
                <td>${escapeHtml(item.nguoiBan || '')}</td>
                <td>${escapeHtml(item.nguon || '')}</td>
                <td>${escapeHtml(item.kenh || '')}</td>
                <td>${escapeHtml(item.congTy || '')}</td>
                <td>${escapeHtml(item.thamChieu || '')}</td>
                <td class="text-right">${escapeHtml(item.phiGiaoHang || '')}</td>
                <td>${escapeHtml(item.nhan || '')}</td>
                <td class="text-right">${formatCurrency(item.tienGiam)}</td>
                <td class="text-right">${item.chietKhau || 0}%</td>
                <td class="text-right">${formatCurrency(item.thanhTienChietKhau)}</td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Get delivery status class
    function getDeliveryStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('giao thành công') || statusLower.includes('hoàn tất')) {
            return 'delivered';
        } else if (statusLower.includes('đang giao') || statusLower.includes('đã tiếp nhận')) {
            return 'shipping';
        } else if (statusLower.includes('chưa tiếp nhận')) {
            return 'pending';
        } else if (statusLower.includes('hoàn') || statusLower.includes('thất bại')) {
            return 'failed';
        }
        return 'pending';
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle search
    function handleSearch() {
        currentPage = 1;
        applyFilters();
    }

    // Apply filters
    function applyFilters() {
        let result = [...banHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.khachHang || '').toLowerCase().includes(searchTerm) ||
                    (item.dienThoai || '').toLowerCase().includes(searchTerm) ||
                    (item.so || '').toLowerCase().includes(searchTerm) ||
                    (item.maVanDon || '').toLowerCase().includes(searchTerm) ||
                    (item.diaChi || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Status filter
        const statusValue = elements.statusFilter?.value || 'all';
        if (statusValue !== 'all') {
            result = result.filter(item => {
                const statusClass = getStatusClass(item.trangThai);
                return statusClass === statusValue;
            });
        }

        // Date range filter
        const startDate = elements.startDate?.value;
        const endDate = elements.endDate?.value;

        if (startDate || endDate) {
            result = result.filter(item => {
                if (!item.ngayBan) return false;

                const itemDate = new Date(item.ngayBan);
                if (isNaN(itemDate.getTime())) return false;

                if (startDate) {
                    const start = new Date(startDate);
                    if (itemDate < start) return false;
                }

                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (itemDate > end) return false;
                }

                return true;
            });
        }

        filteredData = result;
        renderCurrentPage();
        updateStats();
    }

    // Update stats
    function updateStats() {
        const total = filteredData.length;
        const confirmed = filteredData.filter(item => getStatusClass(item.trangThai) === 'confirmed').length;
        const paid = filteredData.filter(item => getStatusClass(item.trangThai) === 'paid').length;
        const totalAmount = filteredData.reduce((sum, item) => sum + (parseFloat(item.tongTien) || 0), 0);

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statPaid) elements.statPaid.textContent = paid;
        if (elements.statTotalAmount) elements.statTotalAmount.textContent = formatCurrency(totalAmount);
    }

    /**
     * Import Excel file and save to Firebase
     */
    async function importExcel(file) {
        if (!file) return;

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang đọc file Excel...', 'info');
        }

        try {
            // Load XLSX library if not already loaded
            if (typeof XLSX === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                document.head.appendChild(script);
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
            }

            // Read Excel file
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Read with header row starting at row 3 (skip title rows)
            const rows = XLSX.utils.sheet_to_json(firstSheet, {
                range: 2, // Start from row 3 (0-indexed, so 2)
                defval: null // Default value for empty cells
            });

            console.log(`Read ${rows.length} rows from Excel`);

            if (rows.length === 0) {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('File Excel không có dữ liệu', 'warning');
                }
                return;
            }

            // Map Excel rows - match exact column names from Excel file
            // Excel structure: STT, Khách hàng, Email, Facebook, Điện thoại, Địa chỉ, Số, Ngày bán, Ngày xác nhận, Tổng tiền, Còn nợ, Trạng thái, Đối tác giao hàng, Mã vận đơn, COD, ...
            const importedData = rows.map((row, index) => ({
                id: `${Date.now()}_${index}`, // Unique ID for each record
                stt: row['STT'] || index + 1,
                khachHang: row['Khách hàng'] || '',
                email: row['Email'] || '',
                facebook: row['Facebook'] || '',
                dienThoai: String(row['Điện thoại'] || ''),
                diaChi: row['Địa chỉ'] || '',
                so: row['Số'] || '',
                ngayBan: row['Ngày bán'] || null,
                ngayXacNhan: row['Ngày xác nhận'] || null,
                tongTien: parseFloat(row['Tổng tiền'] || 0),
                conNo: parseFloat(row['Còn nợ'] || 0),
                trangThai: row['Trạng thái'] || 'Nháp',
                doiTacGH: row['Đối tác giao hàng'] || '',
                maVanDon: row['Mã vận đơn'] || '',
                cod: parseFloat(row['COD'] || 0),
                phiShipGH: row['Phí ship giao hàng'] || '',
                tienCoc: parseFloat(row['Tiền cọc'] || 0),
                traTruoc: parseFloat(row['Trả trước'] || 0),
                khoiLuongShip: row['Khối lượng ship (g)'] || '',
                trangThaiGH: row['Trạng thái GH'] || '',
                doiSoatGH: row['Đối soát GH'] || '',
                ghiChuGH: row['Ghi chú giao hàng'] || '',
                ghiChu: row['Ghi chú'] || '',
                nguoiBan: row['Người bán'] || '',
                nguon: row['Nguồn'] || '',
                kenh: row['Kênh'] || '',
                congTy: row['Công ty'] || '',
                thamChieu: row['Tham chiếu'] || '',
                phiGiaoHang: row['Phí giao hàng'] || '',
                nhan: row['Nhãn'] || '',
                tienGiam: parseFloat(row['Tiền giảm'] || 0),
                chietKhau: parseFloat(row['Chiết khấu (%)'] || 0),
                thanhTienChietKhau: parseFloat(row['Thành tiền chiết khấu'] || 0),
                importedAt: new Date().toISOString()
            }));

            if (typeof showNotification === 'function') {
                showNotification('Đang lưu lên Firebase...', 'info');
            }

            // Merge with existing data using dedup function
            const mergeResult = mergeDataWithDedup(importedData, banHangData);

            // Save to Firebase
            const saveSuccess = await saveToFirebase(mergeResult.data);

            if (saveSuccess) {
                // Update local state
                banHangData = mergeResult.data;
                filteredData = [...banHangData];

                hideLoading();
                currentPage = 1;
                renderCurrentPage();
                updateStats();

                let message = `Excel: +${mergeResult.newCount} mới`;
                if (mergeResult.duplicateCount > 0) {
                    message += `, cập nhật ${mergeResult.duplicateCount} trùng`;
                }
                message += `. Tổng: ${banHangData.length} đơn`;

                if (typeof showNotification === 'function') {
                    showNotification(message, 'success');
                }
            } else {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('Lỗi khi lưu lên Firebase', 'error');
                }
            }

        } catch (error) {
            console.error('Error importing Excel:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi nhập Excel: ' + error.message, 'error');
            }
        }
    }

    /**
     * Refresh data from Firebase
     */
    async function refreshData() {
        await loadFromFirebase();
    }

    /**
     * Delete a record by ID
     */
    async function deleteRecord(id) {
        if (!id) return false;

        try {
            const updatedData = banHangData.filter(item => item.id !== id);
            const saveSuccess = await saveToFirebase(updatedData);

            if (saveSuccess) {
                banHangData = updatedData;
                filteredData = [...banHangData];
                renderCurrentPage();
                updateStats();

                if (typeof showNotification === 'function') {
                    showNotification('Đã xóa thành công', 'success');
                }
                return true;
            }
        } catch (error) {
            console.error('Error deleting record:', error);
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi xóa: ' + error.message, 'error');
            }
        }
        return false;
    }

    /**
     * Clear all data
     */
    async function clearAllData() {
        if (!confirm('Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu bán hàng?')) {
            return false;
        }

        try {
            const saveSuccess = await saveToFirebase([]);

            if (saveSuccess) {
                banHangData = [];
                filteredData = [];
                renderTable([]);
                updateStats();

                if (typeof showNotification === 'function') {
                    showNotification('Đã xóa tất cả dữ liệu', 'success');
                }
                return true;
            }
        } catch (error) {
            console.error('Error clearing data:', error);
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi xóa dữ liệu: ' + error.message, 'error');
            }
        }
        return false;
    }

    // Public API
    return {
        init,
        importExcel,
        refreshData,
        refreshFromTPOS,
        loadFromFirebase,
        deleteRecord,
        clearAllData,
        getData: () => banHangData,
        getFilteredData: () => filteredData
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on the correct page
    if (document.getElementById('banhangTableBody')) {
        BanHangModule.init();

        // Import Excel button
        const btnImportExcel = document.getElementById('btnImportExcelBanHang');
        const excelFileInput = document.getElementById('excelFileInputBanHang');

        if (btnImportExcel && excelFileInput) {
            btnImportExcel.addEventListener('click', () => {
                excelFileInput.click();
            });

            excelFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    btnImportExcel.disabled = true;
                    try {
                        await BanHangModule.importExcel(file);
                    } finally {
                        btnImportExcel.disabled = false;
                        excelFileInput.value = ''; // Reset file input
                        // Reinitialize Lucide icons
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    }
                }
            });
        }

        // Refresh button
        const btnRefreshBanHang = document.getElementById('btnRefreshBanHang');
        if (btnRefreshBanHang) {
            btnRefreshBanHang.addEventListener('click', async () => {
                btnRefreshBanHang.disabled = true;
                try {
                    await BanHangModule.refreshData();
                } finally {
                    btnRefreshBanHang.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }

        // Clear all button
        const btnClearBanHang = document.getElementById('btnClearBanHang');
        if (btnClearBanHang) {
            btnClearBanHang.addEventListener('click', async () => {
                await BanHangModule.clearAllData();
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }

        // Fetch TPOS button
        const btnFetchTPOS = document.getElementById('btnFetchTPOS');
        if (btnFetchTPOS) {
            btnFetchTPOS.addEventListener('click', async () => {
                btnFetchTPOS.disabled = true;
                try {
                    await BanHangModule.refreshFromTPOS();
                } finally {
                    btnFetchTPOS.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }
    }
});
