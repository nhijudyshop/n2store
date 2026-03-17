// =====================================================
// OVERVIEW - FETCH: TPOS Excel & API Data Fetching
// =====================================================

// TPOS EXCEL AUTO-FETCH FUNCTIONS
// =====================================================

/**
 * Extract date from campaign name
 * Supports: "Live 30/12/2025" → "30/12/2025", "DŨNG DŨNG 15/03" → "15/03/2026"
 * @param {string} campaignName - Campaign name
 * @returns {string|null} - Date string dd/mm/yyyy or null if not found
 */
function extractDateFromCampaignName(campaignName) {
    if (!campaignName) return null;
    // First try dd/mm/yyyy (full date)
    const fullMatch = campaignName.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (fullMatch) return fullMatch[1];
    // Then try dd/mm (short date without year) - append current year
    const shortMatch = campaignName.match(/(\d{1,2}\/\d{1,2})(?!\d)/);
    if (shortMatch) {
        const currentYear = new Date().getFullYear();
        return `${shortMatch[1]}/${currentYear}`;
    }
    return null;
}

/**
 * Get authentication token independently (no Tab1 dependency)
 * Uses window.tokenManager or falls back to localStorage
 * @returns {Promise<string>} - Authentication token
 */
async function getToken() {
    if (window.tokenManager) {
        return await window.tokenManager.getToken();
    }
    // Fallback: read directly from localStorage
    const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    const stored = localStorage.getItem(`bearer_token_data_${companyId}`);
    if (stored) {
        const data = JSON.parse(stored);
        return data.access_token;
    }
    throw new Error('No token available');
}

/**
 * Fetch campaigns from TPOS OData API by date filter
 * @param {string} dateFilter - Date string "dd/mm/yyyy" to filter campaigns
 * @returns {Promise<Array<{id: number, name: string}>>} - List of campaigns from TPOS
 */
async function fetchCampaignsFromTPOS(dateFilter) {
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    let token;
    try {
        token = await getToken();
    } catch (error) {
        console.error('[REPORT] ❌ Error getting token for campaigns fetch:', error);
        throw new Error('Could not get authentication token: ' + error.message);
    }

    // Encode date for OData filter (30/12/2025 → 30%2F12%2F2025)
    const dateEncoded = encodeURIComponent(dateFilter);

    // Build OData query URL
    // Worker will forward /api/odata/SaleOnline_LiveCampaign to https://tomato.tpos.vn/odata/SaleOnline_LiveCampaign
    const url = `${WORKER_URL}/api/odata/SaleOnline_LiveCampaign?$top=20&$orderby=DateCreated+desc&$filter=contains(Name%2C%27${dateEncoded}%27)&$count=true`;

    console.log(`[REPORT] 📡 Fetching campaigns from TPOS with date filter: ${dateFilter}`);
    console.log(`[REPORT] 🔗 URL: ${url}`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[REPORT] ❌ TPOS campaigns API error:', response.status, errorText);
        throw new Error(`TPOS API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract campaigns from OData response
    const campaigns = (data.value || []).map(c => ({
        id: c.Id,                    // TPOS campaign Id (number)
        name: c.Name,                // Campaign name
        dateCreated: c.DateCreated   // Date created
    }));

    console.log(`[REPORT] ✅ Found ${campaigns.length} campaigns from TPOS for date ${dateFilter}:`,
        campaigns.map(c => `${c.name} (Id: ${c.id})`));

    return campaigns;
}

/**
 * Get all campaignIds for the current session from TPOS API
 * Flow:
 * 1. Load active campaign from Firebase (independent, no Tab1)
 * 2. Extract date from campaign name (e.g., "30/12/2025")
 * 3. Call TPOS API to get campaigns with that date in name
 * 4. Return campaigns with TPOS Id (number) for ExportFile API
 *
 * @returns {Promise<Array<{id: number, name: string}>>} - List of campaigns with TPOS Ids
 */
async function getCurrentSessionCampaigns() {
    console.log('[REPORT] 🔍 getCurrentSessionCampaigns() called');

    // Helper: extract short date (dd/mm) for TPOS name filter
    function extractShortDate(name) {
        if (!name) return null;
        // Match dd/mm (with or without /yyyy)
        const match = name.match(/(\d{1,2}\/\d{1,2})(?:\/\d{4})?/);
        return match ? match[1] : null;
    }

    // Helper: try fetching campaigns using a campaign name as filter
    async function tryFetchByName(campaignName) {
        // Use short date (dd/mm) for TPOS filter since campaign names may not have year
        const shortDate = extractShortDate(campaignName);
        if (shortDate) {
            console.log('[REPORT] 📅 Using short date filter for TPOS:', shortDate);
            try {
                return await fetchCampaignsFromTPOS(shortDate);
            } catch (error) {
                console.error('[REPORT] ❌ Error fetching campaigns:', error);
            }
        }
        return null;
    }

    // Load campaign info from Firebase (independent of Tab1)
    const campaignInfo = await loadActiveCampaignFromFirebase();

    if (!campaignInfo?.activeCampaign) {
        // Fallback: try extracting date from currentTableName
        if (currentTableName) {
            const result = await tryFetchByName(currentTableName);
            if (result && result.length > 0) return result;
        }
        console.warn('[REPORT] ⚠️ No campaign info available');
        return [];
    }

    const activeCampaign = campaignInfo.activeCampaign;
    console.log('[REPORT] 📋 activeCampaign:', `"${activeCampaign.name}"`);

    // Try fetching by campaign name (uses short date dd/mm for broader match)
    const result = await tryFetchByName(activeCampaign.name);
    if (result && result.length > 0) return result;

    // Fallback: try to extract from customStartDate
    if (activeCampaign.customStartDate) {
        const isoDate = activeCampaign.customStartDate.split('T')[0];
        const [year, month, day] = isoDate.split('-');
        const fallbackDate = `${day}/${month}`;
        console.log('[REPORT] 📅 Using fallback date from customStartDate:', fallbackDate);

        try {
            return await fetchCampaignsFromTPOS(fallbackDate);
        } catch (error) {
            console.error('[REPORT] ❌ Error fetching campaigns with fallback date:', error);
            return [];
        }
    }

    console.warn('[REPORT] ⚠️ Could not extract date from campaign:', activeCampaign.name);
    return [];
}

/**
 * Fetch order details from TPOS ExportFile API
 * @param {number|string} campaignId - TPOS Campaign Id (number from SaleOnline_LiveCampaign API)
 * @returns {Promise<Array>} - Array of parsed orders from Excel
 */
async function fetchOrdersFromTPOS(campaignId) {
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const endpoint = `/api/SaleOnline_Order/ExportFile?campaignId=${campaignId}&sort=date`;

    let token;
    try {
        token = await getToken();
    } catch (error) {
        console.error('[REPORT] ❌ Error getting token:', error);
        throw new Error('Could not get authentication token: ' + error.message);
    }

    console.log(`[REPORT] 📥 Fetching Excel from TPOS for campaign: ${campaignId}`);

    const response = await fetch(`${WORKER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: '{}' })
    });

    if (!response.ok) {
        throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
    }

    // Parse Excel from response
    const arrayBuffer = await response.arrayBuffer();

    // Check if XLSX is available
    if (typeof XLSX === 'undefined') {
        throw new Error('XLSX library not loaded');
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON - IMPORTANT: Use range:2 to skip the first 2 empty rows
    // Row 1: Empty (with "DANH SÁCH SALE ONLINE" text at far right)
    // Row 2: Empty
    // Row 3: Headers (STT, ###, Kênh, Mã, Facebook, Email, Tên, etc.)
    // Row 4+: Data
    const orders = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

    console.log(`[REPORT] ✅ Fetched ${orders.length} orders from TPOS Excel`);
    if (orders.length > 0) {
        console.log('[REPORT] 📋 Excel headers (row 3):', Object.keys(orders[0]));
    }
    return orders;
}

/**
 * Parse products string from Excel column "Sản phẩm" into Details array
 * Example input: "[LLQU51A1] A16 QUẦN SUÔNG LƯNG M2 2 DÂY 90151(1) SL: 1 Giá: 230.000"
 * Can have multiple products separated by newlines
 * @param {string} productsStr - Raw products string from Excel
 * @returns {Array} - Array of product detail objects
 */
function parseProductsFromExcel(productsStr) {
    if (!productsStr || typeof productsStr !== 'string') {
        return [];
    }

    const details = [];
    // Split by newlines or common separators
    const productLines = productsStr.split(/[\n\r]+/).filter(line => line.trim());

    for (const line of productLines) {
        try {
            // Extract ProductCode from [CODE] pattern
            const codeMatch = line.match(/\[([^\]]+)\]/);
            const productCode = codeMatch ? codeMatch[1] : '';

            // Extract quantity from "SL: X" or "SL:X" pattern
            const qtyMatch = line.match(/SL:\s*(\d+)/i);
            const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

            // Extract price from "Giá: X" or "Giá:X" pattern (handles 230.000 format)
            const priceMatch = line.match(/Giá:\s*([\d.,]+)/i);
            let price = 0;
            if (priceMatch) {
                // Remove dots (thousand separator) and parse
                price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
            }

            // ProductNameGet is everything before "SL:" (or the whole line if no SL:)
            const slIndex = line.search(/SL:/i);
            const productNameGet = slIndex > 0 ? line.substring(0, slIndex).trim() : line.trim();

            // ProductName is ProductNameGet without the [CODE] part
            const productName = productNameGet.replace(/\[[^\]]+\]\s*/, '').trim();

            details.push({
                ProductCode: productCode,
                ProductName: productName,
                ProductNameGet: productNameGet,
                Quantity: quantity,
                Price: price,
                Note: null,
                // Additional fields set to null for compatibility
                ProductId: null,
                UOMId: null,
                UOMName: null,
                Discount: 0,
                DiscountPercent: 0
            });
        } catch (e) {
            console.warn('[REPORT] Error parsing product line:', line, e);
        }
    }

    return details;
}

/**
 * Parse date from Excel to ISO format
 * Input can be: "30/12/2025 22:06" string or Excel serial number (e.g. 45656.123)
 * @param {string|number|Date} dateValue - Date from Excel (can be string, number serial, or Date)
 * @returns {string} - ISO date string
 */
function parseDateToISO(dateValue) {
    if (!dateValue) return null;

    // Handle Excel serial date (number)
    // Excel dates are number of days since 1900-01-01 (with 1900 leap year bug)
    if (typeof dateValue === 'number') {
        // Excel epoch is Jan 1, 1900, but JavaScript epoch is Jan 1, 1970
        // Also Excel incorrectly treats 1900 as a leap year
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's day 0)
        const jsDate = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
        return jsDate.toISOString();
    }

    // Handle Date object
    if (dateValue instanceof Date) {
        return dateValue.toISOString();
    }

    // Handle string - try to parse "dd/mm/yyyy HH:mm" format
    if (typeof dateValue === 'string') {
        const match = dateValue.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})?:?(\d{1,2})?/);
        if (match) {
            const [, day, month, year, hour = '00', minute = '00'] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00.000Z`;
        }
        return dateValue;
    }

    // Return null for unknown types
    return null;
}

/**
 * Parse and normalize data from TPOS Excel to Firebase-compatible format
 * Maps Excel columns to Firebase order structure
 * IMPORTANT: Field names must match what renderCachedDetailsTab() expects!
 * @param {Array} orders - Raw orders from Excel (sheet_to_json output)
 * @returns {Array} - Normalized order data matching Firebase structure
 */
function parseExcelOrderData(orders) {
    console.log('[REPORT] 📊 parseExcelOrderData called with', orders.length, 'orders');
    if (orders.length > 0) {
        console.log('[REPORT] 📋 Sample Excel row keys:', Object.keys(orders[0]));
        console.log('[REPORT] 📋 Sample Excel row:', orders[0]);
    }

    return orders.map((row, index) => {
        // Parse products column into Details array
        const productsStr = row['Sản phẩm'] || row['Products'] || '';
        const details = parseProductsFromExcel(productsStr);

        // Calculate total from Details if TotalAmount is missing
        const totalFromDetails = details.reduce((sum, d) => sum + (d.Price * d.Quantity), 0);
        const totalAmount = parseFloat(String(row['Tổng tiền'] || row['Total'] || 0).replace(/\./g, '').replace(',', '.')) || totalFromDetails;

        // Get customer name from various possible columns
        const customerName = row['Tên'] || row['Tên khách'] || row['Customer'] || '';

        // Get phone from various possible columns
        const phone = String(row['Điện thoại'] || row['Phone'] || row['SĐT'] || '');

        // Get status from various possible columns
        const status = row['Trạng thái'] || row['Status'] || '';

        return {
            // Core order fields - mapped from Excel columns
            Id: row['Mã'] || row['###'] || index + 1,
            Code: String(row['Mã'] || ''),              // Cột D - Mã đơn hàng

            // Customer name - MUST use "Name" for render compatibility
            Name: customerName,                         // Cột G - Tên khách (render uses this!)
            PartnerName: customerName,                  // Alias for compatibility

            // Phone - MUST use "Telephone" for render compatibility
            Phone: phone,                               // Cột I
            Telephone: phone,                           // Alias (render uses this!)

            // Address
            FullAddress: row['Địa chỉ'] || '',         // Cột K - Địa chỉ

            // Amount
            TotalAmount: totalAmount,                   // Cột L - Tổng tiền
            CashOnDelivery: totalAmount,                // Same as TotalAmount for Excel data

            // Status - MUST use "Status" for render compatibility
            StatusText: status,                         // Cột M - Trạng thái
            Status: status,                             // Alias (render uses this!)
            State: status,                              // Alias for compatibility

            // Date
            DateCreated: parseDateToISO(row['Ngày tạo']), // Cột N - Ngày tạo

            // Note
            Note: row['Ghi chú'] || '',                // Cột R - Ghi chú

            // Facebook fields
            Facebook_UserName: customerName,            // Cột G - Tên khách
            Facebook_ASUserId: String(row['Facebook'] || ''), // Cột E - Facebook ID

            // Customer status
            CustomerStatus: row['Trạng thái khách hàng'] || '', // Cột H

            // Carrier info
            Carrier: row['Nhà mạng'] || '',            // Cột J

            // Product details - parsed from Cột O
            Details: details,

            // Quantity summary
            QuantityTotal: parseInt(row['Tổng số lượng SP'] || 0) || details.reduce((sum, d) => sum + d.Quantity, 0), // Cột P

            // User/Employee - Cột Q
            User: {
                Name: row['Nhân viên'] || ''
            },

            // CRMTeam/Channel - Cột C
            CRMTeam: {
                Name: row['Kênh'] || ''
            },

            // Tags - Cột S (Nhãn)
            Tags: row['Nhãn'] || row['Tags'] || '',

            // Session index - Cột B (###) or Cột A (STT)
            SessionIndex: parseInt(row['###'] || row['STT'] || index + 1) || index + 1,

            // Email - Cột F
            Email: row['Email'] || '',

            // Source marker
            _source: 'excel',
            _campaign: row._campaign || '',
            _originalRow: row
        };
    });
}

/**
 * Fetch and merge orders from all campaigns in the current session
 * @returns {Promise<Array>} - Merged orders from all campaigns
 */
async function fetchAllCampaignsExcel() {
    const campaigns = await getCurrentSessionCampaigns();

    if (!campaigns || campaigns.length === 0) {
        console.warn('[REPORT] ⚠️ No campaigns found');
        return [];
    }

    console.log(`[REPORT] 📊 Fetching Excel from ${campaigns.length} campaigns...`);

    // Fetch from all campaigns in parallel
    const fetchPromises = campaigns.map(campaign =>
        fetchOrdersFromTPOS(campaign.id)
            .then(orders => orders.map(o => ({ ...o, _campaign: campaign.name })))
            .catch(err => {
                console.error(`[REPORT] ❌ Error fetching ${campaign.name}:`, err);
                return [];
            })
    );

    const results = await Promise.allSettled(fetchPromises);

    // Merge all orders
    const allOrders = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

    console.log(`[REPORT] ✅ Fetched total ${allOrders.length} orders from ${campaigns.length} campaigns`);
    return allOrders;
}

// Broadcast table status to parent (main.html)
function broadcastTableStatus() {
    const isMatching = currentTableName && firebaseTableName &&
        currentTableName === firebaseTableName;

    window.parent.postMessage({
        type: 'TABLE_STATUS_UPDATE',
        currentTable: currentTableName,
        firebaseTable: firebaseTableName,
        firebaseFetchedAt: firebaseDataFetchedAt,
        isMatching: isMatching
    }, '*');

    console.log(`[REPORT] 📡 Broadcast table status: current=${currentTableName}, firebase=${firebaseTableName}, match=${isMatching}`);

    // Update UI helper based on matching status
    updateTableHelperUI(!isMatching && currentTableName);
}

// Update helper message and highlight fetch button
function updateTableHelperUI(showHelper) {
    const helperMessage = document.getElementById('tableHelperMessage');
    const helperText = document.getElementById('tableHelperText');
    const fetchBtn = document.getElementById('btnBatchFetch');

    if (showHelper && currentTableName) {
        // Show helper message
        helperMessage.style.display = 'block';
        helperText.textContent = `Bảng "${currentTableName}" chưa có dữ liệu chi tiết. Nhấn "Lấy chi tiết đơn hàng" để tải.`;

        // Highlight fetch button
        fetchBtn.classList.add('highlight-pulse');

        console.log(`[REPORT] 🔔 Showing helper: table "${currentTableName}" not in Firebase`);
    } else {
        // Hide helper message
        helperMessage.style.display = 'none';

        // Remove highlight
        fetchBtn.classList.remove('highlight-pulse');

        console.log(`[REPORT] ✅ Helper hidden: table "${currentTableName}" exists in Firebase`);
    }
}

// Load cached data from localStorage
function loadCachedData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            cachedOrderDetails = JSON.parse(stored);
            console.log('[REPORT] Loaded cached data:', Object.keys(cachedOrderDetails));
            updateCachedCountBadge();
        }
    } catch (e) {
        console.error('[REPORT] Error loading cached data:', e);
        cachedOrderDetails = {};
    }
}

// =====================================================
