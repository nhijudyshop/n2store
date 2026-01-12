/**
 * Tab1 Orders - Campaign & Data Fetching Module
 * Campaign loading, date filtering, and order fetching
 *
 * Dependencies: tab1-core.js, tab1-firebase.js, tab1-employee.js, tab1-search.js
 * Exports: Campaign and fetch functions via window object
 */

// =====================================================
// PROGRESSIVE LOADING STATE
// =====================================================

let isLoadingInBackground = false;
let isLoadingConversations = false;
let isFetchingOrders = false;
// Note: loadingAborted is defined in tab1-core.js

// =====================================================
// DATE HELPERS
// =====================================================

function convertToUTC(dateTimeLocal) {
    if (!dateTimeLocal) {
        console.error("[DATE] Empty date value provided to convertToUTC");
        throw new Error("Date value is required");
    }

    const date = new Date(dateTimeLocal);

    if (isNaN(date.getTime())) {
        console.error("[DATE] Invalid date value:", dateTimeLocal);
        throw new Error(`Invalid date value: ${dateTimeLocal}`);
    }

    return date.toISOString();
}

// =====================================================
// CAMPAIGN LOADING
// =====================================================

async function handleLoadCampaigns() {
    const startDateValue = document.getElementById("startDate").value;
    const endDateValue = document.getElementById("endDate").value;

    if (!startDateValue || !endDateValue) {
        if (window.notificationManager) {
            window.notificationManager.error("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)", 3000);
        } else {
            alert("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        }
        return;
    }

    const skip = parseInt(document.getElementById("skipRangeFilter").value) || 0;
    await loadCampaignList(skip, startDateValue, endDateValue);
}

async function loadCampaignList(skip = 0, startDateLocal = null, endDateLocal = null, autoLoad = false) {
    try {
        showLoading(true);

        let url;
        if (startDateLocal && endDateLocal) {
            const startDate = convertToUTC(startDateLocal);
            const endDate = convertToUTC(endDateLocal);
            const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate})`;
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, date range: ${startDateLocal} to ${endDateLocal}, autoLoad=${autoLoad}`);
        } else {
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, no date filter, autoLoad=${autoLoad}`);
        }

        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(url, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const orders = data.value || [];
        const totalCount = data["@odata.count"] || 0;

        console.log(`[CAMPAIGNS] Loaded ${orders.length} orders out of ${totalCount} total`);

        // Group campaigns by LiveCampaignId
        const campaignsByCampaignId = new Map();

        orders.forEach((order) => {
            if (!order.LiveCampaignId) return;

            const dateCreated = new Date(order.DateCreated);
            const dateKey = `${dateCreated.getFullYear()}-${String(dateCreated.getMonth() + 1).padStart(2, '0')}-${String(dateCreated.getDate()).padStart(2, '0')}`;

            if (!campaignsByCampaignId.has(order.LiveCampaignId)) {
                campaignsByCampaignId.set(order.LiveCampaignId, {
                    campaignId: order.LiveCampaignId,
                    campaignName: order.LiveCampaignName || "Không có tên",
                    dates: new Set(),
                    latestDate: order.DateCreated
                });
            }

            const campaign = campaignsByCampaignId.get(order.LiveCampaignId);
            campaign.dates.add(dateKey);

            if (new Date(order.DateCreated) > new Date(campaign.latestDate)) {
                campaign.latestDate = order.DateCreated;
            }
        });

        // Parse campaign date from name
        function extractCampaignDate(campaignName) {
            const match = campaignName.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (!match) return null;

            let day = match[1].padStart(2, '0');
            let month = match[2].padStart(2, '0');
            let year = match[3];

            if (year.length === 2) {
                year = '20' + year;
            }

            return `${day}/${month}/${year}`;
        }

        // Group campaigns by date in name
        const campaignsByDateKey = new Map();

        Array.from(campaignsByCampaignId.values()).forEach(campaign => {
            const dateKey = extractCampaignDate(campaign.campaignName);
            const groupKey = dateKey || campaign.campaignName;

            if (!campaignsByDateKey.has(groupKey)) {
                campaignsByDateKey.set(groupKey, {
                    campaignIds: [],
                    campaignNames: [],
                    dates: new Set(),
                    latestDate: campaign.latestDate,
                    dateKey: dateKey
                });
            }

            const merged = campaignsByDateKey.get(groupKey);
            merged.campaignIds.push(campaign.campaignId);
            merged.campaignNames.push(campaign.campaignName);
            campaign.dates.forEach(d => merged.dates.add(d));

            if (new Date(campaign.latestDate) > new Date(merged.latestDate)) {
                merged.latestDate = campaign.latestDate;
            }
        });

        // Create merged campaigns list
        const mergedCampaigns = [];

        const sortedCampaigns = Array.from(campaignsByDateKey.values())
            .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

        sortedCampaigns.forEach(campaign => {
            const dates = Array.from(campaign.dates).sort((a, b) => b.localeCompare(a));

            let displayName;
            const uniqueNames = [...new Set(campaign.campaignNames)];

            if (campaign.dateKey) {
                const types = uniqueNames.map(name => {
                    const prefix = name.split(' ')[0];
                    return prefix;
                }).filter((v, i, a) => a.indexOf(v) === i);

                const typeStr = types.join(' + ');

                if (dates.length === 1) {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates[0]})`;
                } else {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            } else {
                if (dates.length === 1) {
                    displayName = `${uniqueNames[0]} (${dates[0]})`;
                } else {
                    displayName = `${uniqueNames[0]} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            }

            mergedCampaigns.push({
                campaignId: campaign.campaignIds[0],
                campaignIds: campaign.campaignIds,
                displayName: displayName,
                dates: dates,
                latestDate: campaign.latestDate,
                count: dates.length
            });
        });

        console.log(`[CAMPAIGNS] Found ${mergedCampaigns.length} unique campaigns (merged from ${orders.length} orders)`);

        showLoading(false);

        await populateCampaignFilter(mergedCampaigns, autoLoad);

        if (!autoLoad) {
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Tải thành công ${mergedCampaigns.length} chiến dịch từ ${orders.length} đơn hàng (${skip + 1}-${skip + orders.length}/${totalCount})`,
                    3000
                );
            } else {
                showInfoBanner(`✅ Tải thành công ${mergedCampaigns.length} chiến dịch từ ${orders.length} đơn hàng`);
            }
        }

    } catch (error) {
        console.error("[CAMPAIGNS] Error loading campaigns:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi khi tải danh sách chiến dịch: ${error.message}`, 4000);
        } else {
            alert("Lỗi khi tải danh sách chiến dịch: " + error.message);
        }
    }
}

async function populateCampaignFilter(campaigns, autoLoad = false) {
    const select = document.getElementById("campaignFilter");
    select.innerHTML = '<option value="">-- Chọn chiến dịch --</option>';

    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "🔮 Custom (lọc theo ngày tạo đơn)";
    customOption.dataset.campaign = JSON.stringify({ isCustom: true });
    select.appendChild(customOption);

    campaigns.forEach((campaign, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = campaign.displayName;
        option.dataset.campaign = JSON.stringify(campaign);
        select.appendChild(option);
    });

    if (campaigns.length > 0) {
        const savedPrefs = await loadFilterPreferencesFromFirebase();
        const customDateContainer = document.getElementById("customDateFilterContainer");
        const customStartDateInput = document.getElementById("customStartDate");

        if (savedPrefs && savedPrefs.isCustomMode) {
            console.log('[FILTER-PREFS] Restoring CUSTOM mode from Firebase');
            select.value = 'custom';

            if (savedPrefs.customStartDate) {
                customStartDateInput.value = savedPrefs.customStartDate;
            }
            customDateContainer.style.display = "flex";

            selectedCampaign = { isCustom: true };

            console.log('[EMPLOYEE] Loading general employee ranges for restored custom mode');
            await loadEmployeeRangesForCampaign(null);

            if (autoLoad && savedPrefs.customStartDate) {
                console.log('[AUTO-LOAD] Tự động tải dữ liệu với custom date:', savedPrefs.customStartDate);

                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải đơn hàng từ ngày: ${new Date(savedPrefs.customStartDate).toLocaleString('vi-VN')}`,
                        2000,
                        'Khôi phục từ Firebase'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
                    window.realtimeManager.connectServerMode();
                }
            }
        } else if (savedPrefs && savedPrefs.selectedCampaignValue !== undefined && savedPrefs.selectedCampaignValue !== 'custom') {
            const savedValue = savedPrefs.selectedCampaignValue;
            const savedName = savedPrefs.selectedCampaignName;

            let foundOptionIndex = -1;

            if (savedName) {
                for (let i = 0; i < select.options.length; i++) {
                    const optionCampaign = select.options[i].dataset.campaign;
                    if (optionCampaign) {
                        try {
                            const campaign = JSON.parse(optionCampaign);
                            if (campaign.displayName === savedName) {
                                foundOptionIndex = i;
                                console.log('[FILTER-PREFS] ✅ Found campaign by displayName:', savedName, '→ index:', i);
                                break;
                            }
                        } catch (e) { }
                    }
                }
            }

            if (foundOptionIndex === -1) {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === String(savedValue)) {
                        foundOptionIndex = i;
                        console.log('[FILTER-PREFS] Found campaign by index (fallback):', savedValue);
                        break;
                    }
                }
            }

            if (foundOptionIndex !== -1) {
                console.log('[FILTER-PREFS] Restoring saved campaign selection:', savedName || savedValue);
                select.selectedIndex = foundOptionIndex;
                customDateContainer.style.display = "none";
            } else {
                console.log('[FILTER-PREFS] Saved campaign not found, using first campaign');
                select.value = 0;
                customDateContainer.style.display = "none";
            }

            const selectedOption = select.options[select.selectedIndex];
            selectedCampaign = selectedOption?.dataset.campaign
                ? JSON.parse(selectedOption.dataset.campaign)
                : null;

            if (selectedCampaign?.displayName) {
                console.log(`[EMPLOYEE] Auto-loading employee ranges for: ${selectedCampaign.displayName}`);
                await loadEmployeeRangesForCampaign(selectedCampaign.displayName);

                if (allData.length > 0) {
                    console.log(`[EMPLOYEE] Re-rendering table with ${employeeRanges.length} employee ranges`);
                    performTableSearch();
                }
            }

            if (autoLoad) {
                console.log('[AUTO-LOAD] Tự động tải dữ liệu chiến dịch:', selectedCampaign?.displayName || campaigns[0].displayName);

                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải dữ liệu chiến dịch: ${selectedCampaign?.displayName || campaigns[0].displayName}`,
                        2000,
                        'Khôi phục từ Firebase'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
                    window.realtimeManager.connectServerMode();
                }
            }
        } else {
            select.value = 0;
            customDateContainer.style.display = "none";

            const selectedOption = select.options[select.selectedIndex];
            selectedCampaign = selectedOption?.dataset.campaign
                ? JSON.parse(selectedOption.dataset.campaign)
                : null;

            if (selectedCampaign?.displayName) {
                console.log(`[EMPLOYEE] Auto-loading employee ranges for: ${selectedCampaign.displayName}`);
                await loadEmployeeRangesForCampaign(selectedCampaign.displayName);

                if (allData.length > 0) {
                    console.log(`[EMPLOYEE] Re-rendering table with ${employeeRanges.length} employee ranges`);
                    performTableSearch();
                }
            }

            if (autoLoad) {
                console.log('[AUTO-LOAD] Tự động tải dữ liệu chiến dịch:', campaigns[0].displayName);

                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải dữ liệu chiến dịch: ${campaigns[0].displayName}`,
                        2000,
                        'Tự động tải'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
                    window.realtimeManager.connectServerMode();
                }
            } else {
                console.log('[MANUAL-SELECT] Đã chọn chiến dịch đầu tiên (chờ người dùng bấm Tải):', campaigns[0].displayName);
            }
        }
    }
}

async function handleCampaignChange() {
    const select = document.getElementById("campaignFilter");
    const selectedOption = select.options[select.selectedIndex];
    selectedCampaign = selectedOption?.dataset.campaign
        ? JSON.parse(selectedOption.dataset.campaign)
        : null;

    const customDateContainer = document.getElementById("customDateFilterContainer");
    if (selectedCampaign?.isCustom) {
        customDateContainer.style.display = "flex";
        console.log('[CUSTOM-FILTER] Custom mode selected - showing custom date input');

        const customStartDateInput = document.getElementById("customStartDate");
        if (!customStartDateInput.value) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            customStartDateInput.value = formatDateTimeLocal(today);
        }

        saveFilterPreferencesToFirebase({
            selectedCampaignValue: 'custom',
            isCustomMode: true,
            customStartDate: customStartDateInput.value
        });

        console.log('[EMPLOYEE] Loading general employee ranges for custom mode');
        await loadEmployeeRangesForCampaign(null);

        return;
    } else {
        customDateContainer.style.display = "none";

        if (select.value && select.value !== '' && selectedCampaign?.displayName) {
            saveFilterPreferencesToFirebase({
                selectedCampaignValue: select.value,
                selectedCampaignName: selectedCampaign.displayName,
                isCustomMode: false,
                customStartDate: null
            });
        }
    }

    cleanupTagRealtimeListeners();

    if (selectedCampaign?.displayName) {
        console.log(`[EMPLOYEE] Loading employee ranges for campaign: ${selectedCampaign.displayName}`);
        await loadEmployeeRangesForCampaign(selectedCampaign.displayName);
    } else {
        console.log('[EMPLOYEE] Loading general employee ranges (no campaign selected)');
        await loadEmployeeRangesForCampaign(null);
    }

    if (selectedCampaign?.campaignId || selectedCampaign?.campaignIds) {
        await handleSearch();

        if (window.realtimeManager) {
            console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
            window.realtimeManager.connectServerMode();
        }

        setupTagRealtimeListeners();
    }
}

// =====================================================
// CUSTOM DATE HANDLING
// =====================================================

async function handleCustomDateChange() {
    const customStartDateInput = document.getElementById("customStartDate");
    const customEndDateInput = document.getElementById("customEndDate");

    if (!customStartDateInput.value) {
        console.log('[CUSTOM-FILTER] Start date cleared, waiting for valid date...');
        return;
    }

    const startDate = new Date(customStartDateInput.value);
    const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    endDate.setHours(0, 0, 0, 0);
    customEndDateInput.value = formatDateTimeLocal(endDate);

    console.log(`[CUSTOM-FILTER] Date range: ${customStartDateInput.value} -> ${customEndDateInput.value}`);

    selectedCampaign = { isCustom: true };

    saveFilterPreferencesToFirebase({
        selectedCampaignValue: 'custom',
        isCustomMode: true,
        customStartDate: customStartDateInput.value,
        customEndDate: customEndDateInput.value
    });

    cleanupTagRealtimeListeners();

    if (window.notificationManager) {
        const startDisplay = new Date(customStartDateInput.value).toLocaleDateString('vi-VN');
        const endDisplay = new Date(customEndDateInput.value).toLocaleDateString('vi-VN');
        window.notificationManager.info(
            `Đang tải đơn hàng: ${startDisplay} - ${endDisplay}`,
            2000
        );
    }

    await handleSearch();

    setupTagRealtimeListeners();
}

async function handleCustomEndDateChange() {
    const customStartDateInput = document.getElementById("customStartDate");
    const customEndDateInput = document.getElementById("customEndDate");

    if (!customStartDateInput.value || !customEndDateInput.value) {
        console.log('[CUSTOM-FILTER] Missing start or end date...');
        return;
    }

    console.log(`[CUSTOM-FILTER] End date changed: ${customStartDateInput.value} -> ${customEndDateInput.value}`);

    selectedCampaign = { isCustom: true };

    saveFilterPreferencesToFirebase({
        selectedCampaignValue: 'custom',
        isCustomMode: true,
        customStartDate: customStartDateInput.value,
        customEndDate: customEndDateInput.value
    });

    cleanupTagRealtimeListeners();

    await handleSearch();

    setupTagRealtimeListeners();
}

// =====================================================
// DATA FETCHING
// =====================================================

async function reloadTableData() {
    const btn = document.getElementById('reloadTableBtn');
    const icon = btn ? btn.querySelector('i') : null;

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        await handleSearch();

        if (window.notificationManager) {
            window.notificationManager.success("Đã tải lại dữ liệu bảng thành công");
        }
    } catch (error) {
        console.error("Error reloading table:", error);
        if (window.notificationManager) {
            window.notificationManager.error("Lỗi khi tải lại dữ liệu: " + error.message);
        } else {
            alert("Lỗi khi tải lại dữ liệu: " + error.message);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

async function handleSearch() {
    const customStartDateValue = document.getElementById("customStartDate").value;
    const customEndDateValue = document.getElementById("customEndDate").value;

    if (!customStartDateValue) {
        if (window.notificationManager) {
            window.notificationManager.error("Vui lòng chọn Từ ngày", 3000);
        } else {
            alert("Vui lòng chọn Từ ngày");
        }
        return;
    }

    if (!customEndDateValue) {
        if (window.notificationManager) {
            window.notificationManager.error("Vui lòng chọn Đến ngày", 3000);
        } else {
            alert("Vui lòng chọn Đến ngày");
        }
        return;
    }

    selectedCampaign = { isCustom: true };

    const activeCampaignLabel = document.getElementById('activeCampaignLabel');
    if (activeCampaignLabel) {
        const startDisplay = new Date(customStartDateValue).toLocaleDateString('vi-VN');
        const endDisplay = new Date(customEndDateValue).toLocaleDateString('vi-VN');
        activeCampaignLabel.innerHTML = `<i class="fas fa-calendar-check"></i> ${startDisplay} - ${endDisplay}`;
    }

    if (isLoadingInBackground) {
        console.log('[PROGRESSIVE] Aborting background loading for new search...');
        loadingAborted = true;
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    window.cacheManager.clear("orders");
    searchQuery = "";
    document.getElementById("tableSearchInput").value = "";
    document.getElementById("searchClearBtn").classList.remove("active");
    allData = [];
    renderedCount = 0;
    await fetchOrders();
}

async function fetchOrders() {
    if (isFetchingOrders) {
        console.log('[FETCH-ORDERS] Already fetching, skipping duplicate call...');
        return;
    }
    isFetchingOrders = true;

    try {
        showLoading(true);
        loadingAborted = false;

        const customStartDateValue = document.getElementById("customStartDate").value;
        const customEndDateValue = document.getElementById("customEndDate").value || document.getElementById("endDate").value;

        if (!customStartDateValue || !customEndDateValue) {
            throw new Error("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        }

        const customStartDate = convertToUTC(customStartDateValue);
        const customEndDate = convertToUTC(customEndDateValue);
        const filter = `(DateCreated ge ${customStartDate} and DateCreated le ${customEndDate})`;
        console.log(`[FETCH-CUSTOM] Fetching orders: ${customStartDateValue} -> ${customEndDateValue}`);

        const PAGE_SIZE = 1000;
        const INITIAL_PAGE_SIZE = 50;
        const UPDATE_EVERY = 200;
        let skip = 0;
        let hasMore = true;
        allData = [];
        renderedCount = 0;
        const headers = await window.tokenManager.getAuthHeader();

        // Phase 1: Load first batch
        console.log('[PROGRESSIVE] Loading first batch...');
        const firstUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${INITIAL_PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const firstResponse = await fetch(firstUrl, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!firstResponse.ok) throw new Error(`HTTP ${firstResponse.status}`);
        const firstData = await firstResponse.json();
        const firstOrders = firstData.value || [];
        totalCount = firstData["@odata.count"] || 0;

        allData = firstOrders;

        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");

        performTableSearch();
        updateSearchResultCount();
        showInfoBanner(
            `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
        );
        sendDataToTab2();
        sendOrdersDataToOverview();

        // Load conversations in background
        console.log('[PROGRESSIVE] Loading conversations in background...');
        if (window.chatDataManager) {
            isLoadingConversations = true;
            performTableSearch();

            const channelIds = [...new Set(
                allData
                    .map(order => window.chatDataManager.parseChannelId(order.Facebook_PostId))
                    .filter(id => id)
            )];
            console.log('[PROGRESSIVE] Found channel IDs:', channelIds);

            (async () => {
                try {
                    await window.chatDataManager.fetchConversations(true, channelIds);

                    if (window.pancakeDataManager) {
                        console.log('[PANCAKE] Fetching conversations for unread info...');
                        await window.pancakeDataManager.fetchConversations(true);
                        console.log('[PANCAKE] ✅ Conversations fetched');
                    }

                    isLoadingConversations = false;
                    console.log('[PROGRESSIVE] ✅ Conversations loaded (background)');

                    performTableSearch();
                } catch (err) {
                    console.error('[PROGRESSIVE] ❌ Conversations loading error:', err);
                    isLoadingConversations = false;
                }
            })();
        } else {
            console.log('[PROGRESSIVE] chatDataManager not ready, skipping conversations for now');
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

        // Load user identifier for quick tag feature
        loadCurrentUserIdentifier().catch(err => console.error('[QUICK-TAG] Error loading identifier:', err));

        // Detect edited notes
        if (typeof detectEditedNotes === 'function') {
            detectEditedNotes().then(() => {
                performTableSearch();
                console.log('[NOTE-TRACKER] Table re-rendered with edit indicators');
            }).catch(err => console.error('[NOTE-TRACKER] Error detecting edited notes:', err));
        }

        showLoading(false);

        // Phase 2: Background loading
        hasMore = firstOrders.length === INITIAL_PAGE_SIZE;
        skip += INITIAL_PAGE_SIZE;

        if (hasMore) {
            isLoadingInBackground = true;
            console.log('[PROGRESSIVE] Starting background loading...');

            (async () => {
                try {
                    let lastUpdateCount = allData.length;

                    while (hasMore && !loadingAborted) {
                        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}`;
                        const response = await API_CONFIG.smartFetch(url, {
                            headers: { ...headers, accept: "application/json" },
                        });
                        if (!response.ok) {
                            console.error(`[PROGRESSIVE] Error fetching batch at skip=${skip}`);
                            break;
                        }

                        const data = await response.json();
                        const orders = data.value || [];

                        if (orders.length > 0) {
                            allData = allData.concat(orders);

                            const shouldUpdate =
                                allData.length - lastUpdateCount >= UPDATE_EVERY ||
                                orders.length < PAGE_SIZE;

                            if (shouldUpdate) {
                                console.log(`[PROGRESSIVE] Updating table: ${allData.length}/${totalCount} orders`);
                                performTableSearch();
                                updateSearchResultCount();
                                showInfoBanner(
                                    `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
                                );
                                sendDataToTab2();
                                lastUpdateCount = allData.length;
                            }
                        }

                        hasMore = orders.length === PAGE_SIZE;
                        skip += PAGE_SIZE;

                        if (hasMore) {
                            await new Promise((resolve) => setTimeout(resolve, 100));
                        }
                    }

                    if (!loadingAborted) {
                        isLoadingInBackground = false;
                        console.log('[PROGRESSIVE] Background loading completed');
                        performTableSearch();
                        updateSearchResultCount();
                        showInfoBanner(
                            `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
                        );
                        sendDataToTab2();
                        if (typeof sendOrdersDataToTab3 === 'function') sendOrdersDataToTab3();
                        sendOrdersDataToOverview();
                    }

                } catch (error) {
                    console.error('[PROGRESSIVE] Background loading error:', error);
                } finally {
                    isLoadingInBackground = false;
                }
            })();
        } else {
            showInfoBanner(
                `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
            );
        }

    } catch (error) {
        console.error("Error fetching data:", error);

        let errorMessage = "Lỗi khi tải dữ liệu: ";
        if (error.message.includes("Invalid date")) {
            errorMessage += "Ngày tháng không hợp lệ. Vui lòng kiểm tra lại khoảng thời gian.";
        } else if (error.message.includes("Date value is required")) {
            errorMessage += "Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày).";
        } else {
            errorMessage += error.message;
        }

        if (window.notificationManager) {
            window.notificationManager.error(errorMessage, 4000);
        } else {
            alert(errorMessage);
        }

        showLoading(false);
    } finally {
        isFetchingOrders = false;
    }
}

// =====================================================
// UPDATE ORDER IN TABLE
// =====================================================

function updateOrderInTable(orderId, updatedOrderData) {
    console.log('[UPDATE] Updating order in table:', orderId);

    const cleanedData = Object.keys(updatedOrderData).reduce((acc, key) => {
        if (updatedOrderData[key] !== undefined) {
            acc[key] = updatedOrderData[key];
        }
        return acc;
    }, {});

    const indexInAll = allData.findIndex(order => order.Id === orderId);
    if (indexInAll !== -1) {
        allData[indexInAll] = { ...allData[indexInAll], ...cleanedData };
        console.log('[UPDATE] Updated in allData at index:', indexInAll);
    }

    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered] = { ...filteredData[indexInFiltered], ...cleanedData };
        console.log('[UPDATE] Updated in filteredData at index:', indexInFiltered);
    }

    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed] = { ...displayedData[indexInDisplayed], ...cleanedData };
        console.log('[UPDATE] Updated in displayedData at index:', indexInDisplayed);
    }

    performTableSearch();
    updateStats();

    console.log('[UPDATE] ✓ Table updated successfully');
}

// =====================================================
// EXPORTS
// =====================================================

window.isLoadingInBackground = isLoadingInBackground;
window.isLoadingConversations = isLoadingConversations;
window.isFetchingOrders = isFetchingOrders;
window.loadingAborted = loadingAborted;

window.convertToUTC = convertToUTC;
window.handleLoadCampaigns = handleLoadCampaigns;
window.loadCampaignList = loadCampaignList;
window.populateCampaignFilter = populateCampaignFilter;
window.handleCampaignChange = handleCampaignChange;
window.handleCustomDateChange = handleCustomDateChange;
window.handleCustomEndDateChange = handleCustomEndDateChange;
window.reloadTableData = reloadTableData;
window.handleSearch = handleSearch;
window.fetchOrders = fetchOrders;
window.updateOrderInTable = updateOrderInTable;

/**
 * Update active campaign label in UI
 * @param {string} name - Campaign name to display
 */
function updateActiveCampaignLabel(name) {
    const label = document.getElementById('activeCampaignLabel');
    if (label) {
        label.innerHTML = `<i class="fas fa-bullhorn"></i> ${name}`;
    }
}
window.updateActiveCampaignLabel = updateActiveCampaignLabel;

/**
 * Send data to Tab2 (overview) via postMessage and localStorage
 */
function sendDataToTab2() {
    const filterData = {
        startDate: convertToUTC(document.getElementById("customStartDate")?.value || document.getElementById("startDate")?.value),
        endDate: convertToUTC(document.getElementById("customEndDate")?.value || document.getElementById("endDate")?.value),
        campaignId: selectedCampaign?.campaignId || null,
        campaignName: selectedCampaign?.displayName || "",
        data: allData,
        totalRecords: allData.length,
        timestamp: new Date().toISOString(),
    };
    if (window.parent) {
        window.parent.postMessage(
            { type: "FILTER_CHANGED", filter: filterData },
            "*"
        );
    }
    localStorage.setItem("tab1_filter_data", JSON.stringify(filterData));
}
window.sendDataToTab2 = sendDataToTab2;

console.log('[TAB1-CAMPAIGN] Module loaded');
