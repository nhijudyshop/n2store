// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// OVERVIEW - FETCH: TPOS Excel & API Data Fetching
// =====================================================

// TPOS EXCEL AUTO-FETCH FUNCTIONS
// =====================================================

// Store campaign info received from Tab1
let campaignInfoFromTab1 = null;

/**
 * Extract date (dd/mm/yyyy) from campaign name
 * Example: "Live 30/12/2025" → "30/12/2025"
 * @param {string} campaignName - Campaign name
 * @returns {string|null} - Date string or null if not found
 */
function extractDateFromCampaignName(campaignName) {
    if (!campaignName) return null;
    // Match dd/mm/yyyy pattern
    const match = campaignName.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    return match ? match[1] : null;
}

/**
 * ⚡ NEW: Request authentication token from Tab1 via postMessage
 * This solves the cross-origin security error when accessing window.parent.tokenManager
 * @returns {Promise<string>} - Authentication token
 * @throws {Error} - If token request fails or times out
 */
function requestTokenFromTab1() {
    return new Promise((resolve, reject) => {
        const requestId = Date.now() + '_' + Math.random();

        const messageHandler = (event) => {
            if (event.data.type === 'TOKEN_RESPONSE' && event.data.requestId === requestId) {
                window.removeEventListener('message', messageHandler);
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data.token);
                }
            }
        };

        window.addEventListener('message', messageHandler);

        // Send request via parent (main.html will route to Tab1)
        window.parent.postMessage(
            {
                type: 'REQUEST_TOKEN_FROM_OVERVIEW',
                requestId: requestId,
            },
            '*'
        );

        console.log('[REPORT] 🔑 Requesting token from Tab1 via postMessage...');

        // Timeout after 5 seconds
        setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            reject(new Error('Token request timeout after 5 seconds'));
        }, 5000);
    });
}

/**
 * Fetch campaigns from TPOS OData API by date filter
 * @param {string} dateFilter - Date string "dd/mm/yyyy" to filter campaigns
 * @returns {Promise<Array<{id: number, name: string}>>} - List of campaigns from TPOS
 */
async function fetchCampaignsFromTPOS(dateFilter) {
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // ⚡ FIXED: Get token via postMessage to avoid cross-origin security error
    let token;
    try {
        token = await requestTokenFromTab1();
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
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[REPORT] ❌ TPOS campaigns API error:', response.status, errorText);
        throw new Error(`TPOS API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract campaigns from OData response
    const campaigns = (data.value || []).map((c) => ({
        id: c.Id, // TPOS campaign Id (number)
        name: c.Name, // Campaign name
        dateCreated: c.DateCreated, // Date created
    }));

    console.log(
        `[REPORT] ✅ Found ${campaigns.length} campaigns from TPOS for date ${dateFilter}:`,
        campaigns.map((c) => `${c.name} (Id: ${c.id})`)
    );

    return campaigns;
}

/**
 * Request campaign info from Tab1 via postMessage
 * @returns {Promise<Object>} - Campaign manager data from Tab1
 */
function requestCampaignInfoFromTab1() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[REPORT] ⚠️ Timeout waiting for campaign info from Tab1');
            resolve(null);
        }, 3000);

        const handler = (event) => {
            if (event.data.type === 'CAMPAIGN_INFO_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                campaignInfoFromTab1 = event.data.campaignInfo;
                console.log('[REPORT] ✅ Received campaign info from Tab1:', campaignInfoFromTab1);
                resolve(event.data.campaignInfo);
            }
        };

        window.addEventListener('message', handler);

        // Request campaign info from Tab1 via parent
        window.parent.postMessage(
            {
                type: 'REQUEST_CAMPAIGN_INFO',
            },
            '*'
        );
    });
}

/**
 * Get all campaignIds for the current session from TPOS API
 * Flow:
 * 1. Get active campaign name from Tab1 (e.g., "Live 30/12/2025")
 * 2. Extract date from name (e.g., "30/12/2025")
 * 3. Call TPOS API to get campaigns with that date in name
 * 4. Return campaigns with TPOS Id (number) for ExportFile API
 *
 * @returns {Promise<Array<{id: number, name: string}>>} - List of campaigns with TPOS Ids
 */
async function getCurrentSessionCampaigns() {
    console.log('[REPORT] 🔍 getCurrentSessionCampaigns() called');
    console.log('[REPORT] 📋 currentTableName (dropdown):', currentTableName || 'null');

    if (!currentTableName) {
        console.warn('[REPORT] ⚠️ No table selected in dropdown');
        return [];
    }

    // Strategy 1: Extract date directly from dropdown campaign name (e.g., "Live 30/12/2025")
    let dateFilter = extractDateFromCampaignName(currentTableName);

    // Strategy 2: Look up campaign's customStartDate from CampaignAPI
    if (!dateFilter) {
        console.log(
            '[REPORT] 📡 No date in campaign name, looking up customStartDate from CampaignAPI...'
        );
        try {
            const allCampaigns = await window.CampaignAPI.loadAll();
            const matchedCampaign = allCampaigns.find((c) => c.name === currentTableName);

            if (matchedCampaign && matchedCampaign.customStartDate) {
                // Convert ISO date "2025-12-30T10:00:00" to "30/12/2025"
                const isoDate = matchedCampaign.customStartDate.split('T')[0]; // "2025-12-30"
                const [year, month, day] = isoDate.split('-');
                dateFilter = `${day}/${month}/${year}`;
                console.log(
                    `[REPORT] 📅 Found customStartDate for "${currentTableName}": ${dateFilter}`
                );
            } else {
                console.warn(
                    `[REPORT] ⚠️ Campaign "${currentTableName}" not found or has no customStartDate`
                );
            }
        } catch (error) {
            console.error('[REPORT] ❌ Error looking up campaign from API:', error);
        }
    }

    // Strategy 3: Fallback to Tab1's active campaign info
    if (!dateFilter) {
        console.log('[REPORT] 📡 Falling back to Tab1 campaign info...');
        if (!campaignInfoFromTab1) {
            await requestCampaignInfoFromTab1();
        }
        if (campaignInfoFromTab1?.activeCampaign?.customStartDate) {
            const isoDate = campaignInfoFromTab1.activeCampaign.customStartDate.split('T')[0];
            const [year, month, day] = isoDate.split('-');
            dateFilter = `${day}/${month}/${year}`;
            console.log(`[REPORT] 📅 Using Tab1 fallback customStartDate: ${dateFilter}`);
        }
    }

    if (!dateFilter) {
        console.warn('[REPORT] ⚠️ Could not determine date for campaign:', currentTableName);
        return [];
    }

    console.log(`[REPORT] 📅 Fetching TPOS campaigns with date filter: ${dateFilter}`);

    // Fetch campaigns from TPOS API
    try {
        const campaigns = await fetchCampaignsFromTPOS(dateFilter);
        return campaigns;
    } catch (error) {
        console.error('[REPORT] ❌ Error fetching campaigns from TPOS:', error);
        return [];
    }
}

/**
 * Fetch order details from TPOS ExportFile API
 * @param {number|string} campaignId - TPOS Campaign Id (number from SaleOnline_LiveCampaign API)
 * @returns {Promise<Array>} - Array of parsed orders from Excel
 */
async function fetchOrdersFromTPOS(campaignId) {
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const endpoint = `/api/SaleOnline_Order/ExportFile?campaignId=${campaignId}&sort=date`;

    // ⚡ FIXED: Get token via postMessage to avoid cross-origin security error
    let token;
    try {
        token = await requestTokenFromTab1();
    } catch (error) {
        console.error('[REPORT] ❌ Error getting token:', error);
        throw new Error('Could not get authentication token: ' + error.message);
    }

    console.log(`[REPORT] 📥 Fetching Excel from TPOS for campaign: ${campaignId}`);

    const response = await fetch(`${WORKER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: '{}' }),
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
    const productLines = productsStr.split(/[\n\r]+/).filter((line) => line.trim());

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
        const totalFromDetails = details.reduce((sum, d) => sum + d.Price * d.Quantity, 0);
        const totalAmount =
            parseFloat(
                String(row['Tổng tiền'] || row['Total'] || 0)
                    .replace(/\./g, '')
                    .replace(',', '.')
            ) || totalFromDetails;

        // Get customer name from various possible columns
        const customerName = row['Tên'] || row['Tên khách'] || row['Customer'] || '';

        // Get phone from various possible columns
        const phone = String(row['Điện thoại'] || row['Phone'] || row['SĐT'] || '');

        // Get status from various possible columns
        const status = row['Trạng thái'] || row['Status'] || '';

        return {
            // Core order fields - mapped from Excel columns
            Id: row['Mã'] || row['###'] || index + 1,
            Code: String(row['Mã'] || ''), // Cột D - Mã đơn hàng

            // Customer name - render uses Name || PartnerName fallback
            Name: customerName, // Cột G - Tên khách

            // Phone - render uses Telephone
            Telephone: phone, // Cột I

            // Address
            FullAddress: row['Địa chỉ'] || '', // Cột K - Địa chỉ

            // Amount
            TotalAmount: totalAmount, // Cột L - Tổng tiền
            CashOnDelivery: totalAmount, // Same as TotalAmount for Excel data

            // Status - render uses Status || State fallback
            Status: status, // Cột M - Trạng thái

            // Date
            DateCreated: parseDateToISO(row['Ngày tạo']), // Cột N - Ngày tạo

            // Note
            Note: row['Ghi chú'] || '', // Cột R - Ghi chú

            // Facebook ID
            Facebook_ASUserId: String(row['Facebook'] || ''), // Cột E - Facebook ID

            // Customer status
            CustomerStatus: row['Trạng thái khách hàng'] || '', // Cột H

            // Carrier info
            Carrier: row['Nhà mạng'] || '', // Cột J

            // Product details - parsed from Cột O (lean: no null/zero fields)
            Details: details,

            // Quantity summary
            QuantityTotal:
                parseInt(row['Tổng số lượng SP'] || 0) ||
                details.reduce((sum, d) => sum + d.Quantity, 0), // Cột P

            // User/Employee - Cột Q
            User: {
                Name: row['Nhân viên'] || '',
            },

            // CRMTeam/Channel - Cột C
            CRMTeam: {
                Name: row['Kênh'] || '',
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
    const fetchPromises = campaigns.map((campaign) =>
        fetchOrdersFromTPOS(campaign.id)
            .then((orders) => orders.map((o) => ({ ...o, _campaign: campaign.name })))
            .catch((err) => {
                console.error(`[REPORT] ❌ Error fetching ${campaign.name}:`, err);
                return [];
            })
    );

    const results = await Promise.allSettled(fetchPromises);

    // Merge all orders
    const allOrders = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);

    console.log(
        `[REPORT] ✅ Fetched total ${allOrders.length} orders from ${campaigns.length} campaigns`
    );
    return allOrders;
}

// Broadcast table status to parent (main.html)
function broadcastTableStatus() {
    const isMatching =
        currentTableName && firebaseTableName && currentTableName === firebaseTableName;

    window.parent.postMessage(
        {
            type: 'TABLE_STATUS_UPDATE',
            currentTable: currentTableName,
            firebaseTable: firebaseTableName,
            firebaseFetchedAt: firebaseDataFetchedAt,
            isMatching: isMatching,
        },
        '*'
    );

    console.log(
        `[REPORT] 📡 Broadcast table status: current=${currentTableName}, firebase=${firebaseTableName}, match=${isMatching}`
    );

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
