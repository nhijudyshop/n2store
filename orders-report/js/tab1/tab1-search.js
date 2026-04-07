// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 7: TABLE SEARCH & FILTERING                       ║
// ║                            search: #SEARCH                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// TABLE SEARCH & FILTERING #SEARCH
// =====================================================
function handleTableSearch(query) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = query.trim().toLowerCase();
        document
            .getElementById("searchClearBtn")
            .classList.toggle("active", !!searchQuery);
        performTableSearch();
        // Sync to sticky search
        if (typeof syncMainToStickySearch === 'function') {
            syncMainToStickySearch();
        }
    }, 300);
}

// =====================================================
// MERGE ORDERS BY PHONE NUMBER
// =====================================================
function mergeOrdersByPhone(orders) {
    if (!orders || orders.length === 0) return orders;

    // Normalize phone numbers (remove spaces, dots, dashes, country code)
    const normalizePhone = (phone) => {
        if (!phone) return '';
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        // Handle Vietnam country code: replace leading 84 with 0
        if (cleaned.startsWith('84')) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    };

    // Group orders by normalized phone number
    const phoneGroups = new Map();

    orders.forEach(order => {
        const normalizedPhone = normalizePhone(order.Telephone);
        if (!normalizedPhone) {
            // If no phone number, treat as individual order
            if (!phoneGroups.has(`no_phone_${order.Id}`)) {
                phoneGroups.set(`no_phone_${order.Id}`, []);
            }
            phoneGroups.get(`no_phone_${order.Id}`).push(order);
        } else {
            if (!phoneGroups.has(normalizedPhone)) {
                phoneGroups.set(normalizedPhone, []);
            }
            phoneGroups.get(normalizedPhone).push(order);
        }
    });

    // Merge orders in each group
    const mergedOrders = [];

    phoneGroups.forEach((groupOrders, phone) => {
        if (groupOrders.length === 1) {
            // Only one order with this phone, no merging needed
            mergedOrders.push(groupOrders[0]);
        } else {
            // Multiple orders with same phone number - merge them
            // Sort by SessionIndex (STT) to find the order with largest STT
            const sortedOrders = [...groupOrders].sort((a, b) => {
                const sttA = parseInt(a.SessionIndex) || 0;
                const sttB = parseInt(b.SessionIndex) || 0;
                return sttB - sttA; // Descending order (largest first)
            });

            // Order with largest STT becomes the target (will receive all products)
            const targetOrder = sortedOrders[0];
            const sourceOrders = sortedOrders.slice(1); // Orders with smaller STT (will lose products)

            // Collect all unique values
            const allCodes = [];
            const allNames = new Set();
            const allAddresses = new Set();
            const allNotes = [];
            const allSTTs = [];
            let totalAmount = 0;
            let totalQuantity = 0;
            const allIds = [];
            let earliestDate = targetOrder.DateCreated;

            groupOrders.forEach(order => {
                allCodes.push(order.Code);
                if (order.Name && order.Name.trim()) allNames.add(order.Name.trim());
                if (order.Address && order.Address.trim()) allAddresses.add(order.Address.trim());
                if (order.Note && order.Note.trim()) allNotes.push(order.Note.trim());
                if (order.SessionIndex) allSTTs.push(order.SessionIndex);
                totalAmount += (order.TotalAmount || 0);
                totalQuantity += (order.TotalQuantity || 0);
                allIds.push(order.Id);

                // Keep earliest date
                if (new Date(order.DateCreated) < new Date(earliestDate)) {
                    earliestDate = order.DateCreated;
                }
            });

            // Group orders by customer name to handle single vs multi-customer scenarios
            const customerGroups = new Map();
            groupOrders.forEach(order => {
                const name = order.Name?.trim() || 'Unknown';
                if (!customerGroups.has(name)) {
                    customerGroups.set(name, []);
                }
                customerGroups.get(name).push(order);
            });

            // Determine if single or multi-customer
            const uniqueCustomerCount = customerGroups.size;
            const isSingleCustomer = uniqueCustomerCount === 1;

            // Store original orders with necessary chat info AND amount/quantity for display
            const originalOrders = groupOrders.map(order => ({
                Id: order.Id,
                Name: order.Name,
                Code: order.Code,
                SessionIndex: order.SessionIndex,
                Facebook_ASUserId: order.Facebook_ASUserId,
                Facebook_PostId: order.Facebook_PostId,
                Telephone: order.Telephone,
                TotalAmount: order.TotalAmount || 0,
                TotalQuantity: order.TotalQuantity || 0
            }));

            // Create customer groups info for rendering
            const customerGroupsInfo = Array.from(customerGroups.entries()).map(([name, orders]) => {
                // Sort orders by STT to get largest
                const sortedOrders = [...orders].sort((a, b) => {
                    const sttA = parseInt(a.SessionIndex) || 0;
                    const sttB = parseInt(b.SessionIndex) || 0;
                    return sttB - sttA; // Descending order (largest first)
                });

                return {
                    name,
                    orderCount: orders.length,
                    orders: sortedOrders.map(o => ({
                        id: o.Id,
                        stt: o.SessionIndex,
                        psid: o.Facebook_ASUserId,
                        channelId: window.chatDataManager ? window.chatDataManager.parseChannelId(o.Facebook_PostId) : null,
                        code: o.Code
                    }))
                };
            });

            // Create merged order
            const mergedOrder = {
                ...targetOrder, // Use target order as base
                Code: allCodes.join(' + '),
                Name: Array.from(allNames).join(' / '),
                Address: Array.from(allAddresses).join(' | '),
                Note: allNotes.length > 0 ? allNotes.join(' | ') : targetOrder.Note,
                TotalAmount: totalAmount,
                TotalQuantity: totalQuantity,
                DateCreated: earliestDate,
                Id: allIds.join('_'), // Combine IDs for checkbox handling
                OriginalIds: allIds, // Store original IDs for reference
                MergedCount: groupOrders.length, // Track how many orders were merged
                SessionIndex: allSTTs.length > 1 ? allSTTs.join(' + ') : (targetOrder.SessionIndex || ''),
                AllSTTs: allSTTs, // Store all STT for reference
                // NEW: Store merge info for product transfer
                TargetOrderId: targetOrder.Id, // Order with largest STT (will receive products)
                SourceOrderIds: sourceOrders.map(o => o.Id), // Orders with smaller STT (will lose products)
                TargetSTT: targetOrder.SessionIndex,
                SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                IsMerged: true, // Flag to identify merged orders
                // NEW: Customer grouping info for message/comment rendering
                OriginalOrders: originalOrders, // Store original orders with chat info
                IsSingleCustomer: isSingleCustomer, // true if all orders have same customer name
                UniqueCustomerCount: uniqueCustomerCount, // Number of unique customers
                CustomerGroups: customerGroupsInfo // Grouped by customer with sorted orders
            };

            mergedOrders.push(mergedOrder);
        }
    });

    return mergedOrders;
}

// Expose to window for access from other modules (e.g., tab1-tags.js)
window.performTableSearch = performTableSearch;

function performTableSearch() {
    // Apply search filter
    let tempData = searchQuery
        ? allData.filter((order) => matchesSearchQuery(order, searchQuery))
        : [...allData];

    // Apply Employee STT Range Filter for assigned users (non-admin only)
    const isAdmin = window.authManager?.isAdminTemplate?.() || false;
    if (!isAdmin && employeeRanges.length > 0) {
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const currentUserId = auth?.id || null;
        const currentDisplayName = auth?.displayName || null;
        const currentUserType = auth?.userType || null;

        let userRange = null;
        if (currentUserId) userRange = employeeRanges.find(r => r.id === currentUserId);
        if (!userRange && currentDisplayName) userRange = employeeRanges.find(r => r.name === currentDisplayName);
        if (!userRange && currentUserType) userRange = employeeRanges.find(r => r.name === currentUserType);
        if (!userRange && currentUserType) {
            const shortName = currentUserType.split('-')[0].trim();
            userRange = employeeRanges.find(r => r.name === shortName);
        }

        if (userRange) {
            tempData = tempData.filter(order => {
                const stt = parseInt(order.SessionIndex);
                return !isNaN(stt) && stt >= userRange.start && stt <= userRange.end;
            });

            // Disable toggle button — user already sees only their assigned orders
            if (typeof _setEmployeeToggleBtnDisabled === 'function') _setEmployeeToggleBtnDisabled(true);
        } else {
            // User not in any range → show all, enable toggle
            if (typeof _setEmployeeToggleBtnDisabled === 'function') _setEmployeeToggleBtnDisabled(false);
        }
    } else {
        // Admin or no ranges configured → enable toggle button
        if (typeof _setEmployeeToggleBtnDisabled === 'function') _setEmployeeToggleBtnDisabled(false);
    }

    // Apply conversation status filter (Merged Messages & Comments)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    if (window.pancakeDataManager && conversationFilter !== 'all') {
        tempData = tempData.filter(order => {
            const msgUnread = window.pancakeDataManager.getMessageUnreadInfoForOrder(order);
            const cmmUnread = window.pancakeDataManager.getCommentUnreadInfoForOrder(order);

            const hasUnreadMessage = msgUnread.hasUnread;
            const hasUnreadComment = cmmUnread.hasUnread;

            if (conversationFilter === 'unread') {
                return hasUnreadMessage || hasUnreadComment;
            } else if (conversationFilter === 'read') {
                return !hasUnreadMessage && !hasUnreadComment;
            }
            return true;
        });
    }

    // Apply Status Filter
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    if (statusFilter !== 'all') {
        tempData = tempData.filter(order => {
            const status = order.StatusText || order.Status;
            return status === statusFilter;
        });
    }

    // Apply Fulfillment (Ra đơn) Filter
    const fulfillmentFilter = document.getElementById('fulfillmentFilter')?.value || 'all';
    if (fulfillmentFilter !== 'all') {
        const fd = window.parent?.FulfillmentData || window.FulfillmentData;
        if (fd && fd.isReady()) {
            tempData = tempData.filter(order => {
                const orderId = order.Id || order.id;
                if (!orderId) return false;
                const { status } = fd.getStatus(orderId);
                return status === fulfillmentFilter;
            });
        }
    }

    // Apply TAG filter (Multi-select)
    const selectedTags = window.getSelectedTagFilters ? window.getSelectedTagFilters() : [];

    if (selectedTags.length > 0) {
        tempData = tempData.filter(order => {
            if (!order.Tags) return false;

            try {
                const orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags) || orderTags.length === 0) return false;

                // Check if the order has ALL of the selected tags (AND logic)
                const orderTagIds = orderTags.map(tag => String(tag.Id));
                return selectedTags.every(selectedId => orderTagIds.includes(selectedId));
            } catch (e) {
                return false;
            }
        });
    }

    // Apply Excluded Tags filter (hide orders with certain tags)
    const excludedTags = window.getExcludedTagFilters ? window.getExcludedTagFilters() : [];
    if (excludedTags.length > 0) {
        tempData = tempData.filter(order => {
            if (!order.Tags) return true; // Orders without tags are not excluded

            try {
                const orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags) || orderTags.length === 0) return true;

                // Check if the order has ANY of the excluded tags
                const hasExcludedTag = orderTags.some(tag => excludedTags.includes(String(tag.Id)));
                return !hasExcludedTag; // Return false if order has excluded tag (to hide it)
            } catch (e) {
                return true;
            }
        });
    }


    // Apply Stock Status filter
    if (window.StockStatusEngine?._checked && window.StockStatusEngine._activeFilter) {
        tempData = tempData.filter(order => window.StockStatusEngine.passesStockFilter(String(order.Id)));
    }

    // Apply Processing Tag filter (base filter OR flag checkboxes)
    // Use order.Code (orderCode) as primary key since ProcessingTagState is keyed by orderCode,
    // fallback to order.Id for backward compatibility with old data
    if (typeof window.hasActiveProcessingTagFilters === 'function' && window.hasActiveProcessingTagFilters()) {
        tempData = tempData.filter(order => window.orderPassesProcessingTagFilter(String(order.Code || order.Id)));
    }

    filteredData = tempData;

    // Priority sorting: STT → Phone → Name
    if (searchQuery) {
        filteredData.sort((a, b) => {
            const searchLower = searchQuery.toLowerCase();
            const aStt = String(a.SessionIndex || '').toLowerCase();
            const bStt = String(b.SessionIndex || '').toLowerCase();
            const aPhone = (a.Telephone || '').toLowerCase();
            const bPhone = (b.Telephone || '').toLowerCase();
            const aName = (a.Name || '').toLowerCase();
            const bName = (b.Name || '').toLowerCase();

            // Priority 1: STT exact match
            const aSttMatch = aStt === searchLower;
            const bSttMatch = bStt === searchLower;
            if (aSttMatch && !bSttMatch) return -1;
            if (!aSttMatch && bSttMatch) return 1;

            // Priority 2: STT starts with
            const aSttStarts = aStt.startsWith(searchLower);
            const bSttStarts = bStt.startsWith(searchLower);
            if (aSttStarts && !bSttStarts) return -1;
            if (!aSttStarts && bSttStarts) return 1;

            // Priority 3: STT contains
            const aSttContains = aStt.includes(searchLower);
            const bSttContains = bStt.includes(searchLower);
            if (aSttContains && !bSttContains) return -1;
            if (!aSttContains && bSttContains) return 1;

            // Priority 4: Phone starts with
            const aPhoneStarts = aPhone.startsWith(searchLower);
            const bPhoneStarts = bPhone.startsWith(searchLower);
            if (aPhoneStarts && !bPhoneStarts) return -1;
            if (!aPhoneStarts && bPhoneStarts) return 1;

            // Priority 5: Phone contains
            const aPhoneContains = aPhone.includes(searchLower);
            const bPhoneContains = bPhone.includes(searchLower);
            if (aPhoneContains && !bPhoneContains) return -1;
            if (!aPhoneContains && bPhoneContains) return 1;

            // Priority 6: Name starts with
            const aNameStarts = aName.startsWith(searchLower);
            const bNameStarts = bName.startsWith(searchLower);
            if (aNameStarts && !bNameStarts) return -1;
            if (!aNameStarts && bNameStarts) return 1;

            // Priority 7: Name contains
            const aNameContains = aName.includes(searchLower);
            const bNameContains = bName.includes(searchLower);
            if (aNameContains && !bNameContains) return -1;
            if (!aNameContains && bNameContains) return 1;

            // Default: keep original order
            return 0;
        });
    }

    // NOTE: Visual merging disabled - each order shows as separate row
    // Merge products button (mergeProductsBtn) still works independently
    // filteredData = mergeOrdersByPhone(filteredData);

    // Reset sorting when filters change
    resetSorting();

    displayedData = filteredData;
    renderTable();
    updateStats();
    updatePageInfo();
    updateSearchResultCount();
}

// Returns orders filtered by employee assignment (for non-admin users)
// Used by sidebar panel to show correct counts per user
window.getEmployeeFilteredOrders = function() {
    const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
    const isAdmin = window.authManager?.isAdminTemplate?.() || false;
    if (!isAdmin && employeeRanges.length > 0) {
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const currentUserId = auth?.id || null;
        const currentDisplayName = auth?.displayName || null;
        const currentUserType = auth?.userType || null;

        let userRange = null;
        if (currentUserId) userRange = employeeRanges.find(r => r.id === currentUserId);
        if (!userRange && currentDisplayName) userRange = employeeRanges.find(r => r.name === currentDisplayName);
        if (!userRange && currentUserType) userRange = employeeRanges.find(r => r.name === currentUserType);
        if (!userRange && currentUserType) {
            const shortName = currentUserType.split('-')[0].trim();
            userRange = employeeRanges.find(r => r.name === shortName);
        }

        if (userRange) {
            return allOrders.filter(order => {
                const stt = parseInt(order.SessionIndex);
                return !isNaN(stt) && stt >= userRange.start && stt <= userRange.end;
            });
        }
    }
    return allOrders;
};

function matchesSearchQuery(order, query) {
    const searchableText = [
        String(order.SessionIndex || ''), // STT - Priority field
        order.Code,
        order.Name,
        order.Telephone,
        order.Address,
        order.Note,
        order.StatusText,
    ]
        .join(" ")
        .toLowerCase();
    const normalizedText = removeVietnameseTones(searchableText);
    const normalizedQuery = removeVietnameseTones(query);
    return (
        searchableText.includes(query) ||
        normalizedText.includes(normalizedQuery)
    );
}

function removeVietnameseTones(str) {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

function updateSearchResultCount() {
    document.getElementById("searchResultCount").textContent =
        filteredData.length.toLocaleString("vi-VN");
}

// Copy phone number to clipboard
function copyPhoneNumber(phone) {
    if (!phone) return;
    navigator.clipboard.writeText(phone).catch(err => {
        console.error('Failed to copy phone number:', err);
    });
}

function highlightSearchText(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =====================================================
// DATA FETCHING & CAMPAIGN LOADING
// =====================================================
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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

async function handleLoadCampaigns() {
    // Validate dates
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
            // Sử dụng date filter với skip - Tải 3000 đơn hàng
            const startDate = convertToUTC(startDateLocal);
            const endDate = convertToUTC(endDateLocal);
            const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate})`;
            // OPTIMIZATION: Only fetch necessary fields for campaign list
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

        } else {
            // Fallback: không có date filter - Tải 3000 đơn hàng
            // OPTIMIZATION: Only fetch necessary fields for campaign list
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

        }

        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(url, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const orders = data.value || [];
        const totalCount = data["@odata.count"] || 0;


        // 🎯 BƯỚC 1: GỘP CÁC CHIẾN DỊCH THEO LiveCampaignId
        const campaignsByCampaignId = new Map(); // key: LiveCampaignId, value: { name, dates: Set }

        orders.forEach((order) => {
            if (!order.LiveCampaignId) return;

            // Lấy ngày từ DateCreated (bỏ phần giờ)
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

            // Keep latest date for sorting
            if (new Date(order.DateCreated) > new Date(campaign.latestDate)) {
                campaign.latestDate = order.DateCreated;
            }
        });

        // 🎯 HÀM PARSE NGÀY TỪ TÊN CHIẾN DỊCH
        function extractCampaignDate(campaignName) {
            // Tìm pattern: DD/MM/YY hoặc DD/MM/YYYY (ví dụ: "11/11/25", "15/11/2025")
            const match = campaignName.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (!match) return null;

            let day = match[1].padStart(2, '0');
            let month = match[2].padStart(2, '0');
            let year = match[3];

            // Normalize year: convert YY → YYYY (assume 20YY)
            if (year.length === 2) {
                year = '20' + year;
            }

            // Return normalized format: DD/MM/YYYY
            return `${day}/${month}/${year}`;
        }

        // 🎯 BƯỚC 2: GỘP CÁC CHIẾN DỊCH THEO NGÀY TRONG TÊN
        // Ví dụ: "HOUSE 11/11/25" + "STORE 11/11/25" → "11/11/25 - HOUSE + STORE"
        const campaignsByDateKey = new Map(); // key: ngày từ tên (ví dụ: "11/11/25")

        Array.from(campaignsByCampaignId.values()).forEach(campaign => {
            const dateKey = extractCampaignDate(campaign.campaignName);

            // Sử dụng dateKey hoặc tên gốc nếu không parse được
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

            // Keep latest date
            if (new Date(campaign.latestDate) > new Date(merged.latestDate)) {
                merged.latestDate = campaign.latestDate;
            }
        });

        // 🎯 BƯỚC 3: TẠO DANH SÁCH CAMPAIGNS ĐÃ GỘP
        const mergedCampaigns = [];

        // Sort by latest date descending
        const sortedCampaigns = Array.from(campaignsByDateKey.values())
            .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

        sortedCampaigns.forEach(campaign => {
            const dates = Array.from(campaign.dates).sort((a, b) => b.localeCompare(a));

            // Tạo display name
            let displayName;
            const uniqueNames = [...new Set(campaign.campaignNames)];

            if (campaign.dateKey) {
                // Có ngày từ tên → hiển thị ngày + danh sách loại chiến dịch
                const types = uniqueNames.map(name => {
                    // Extract prefix (HOUSE, STORE, etc.) - lấy phần trước dấu cách đầu tiên
                    const prefix = name.split(' ')[0];
                    return prefix;
                }).filter((v, i, a) => a.indexOf(v) === i); // unique types

                const typeStr = types.join(' + ');

                if (dates.length === 1) {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates[0]})`;
                } else {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            } else {
                // Không parse được ngày → giữ tên gốc
                if (dates.length === 1) {
                    displayName = `${uniqueNames[0]} (${dates[0]})`;
                } else {
                    displayName = `${uniqueNames[0]} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            }

            mergedCampaigns.push({
                campaignId: campaign.campaignIds[0], // For backward compatibility
                campaignIds: campaign.campaignIds, // Array of all merged campaign IDs
                campaignNames: campaign.campaignNames, // Raw Shopify campaign names (for sync matching)
                displayName: displayName,
                dates: dates,
                latestDate: campaign.latestDate,
                count: dates.length
            });
        });


        showLoading(false);

        // Populate dropdown với autoLoad parameter
        await populateCampaignFilter(mergedCampaigns, autoLoad);

        // Hiển thị thông báo (chỉ khi không auto-load để tránh spam)
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

    // 🎯 Add Custom option for filtering by order creation date
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "🔮 Custom (lọc theo ngày tạo đơn)";
    customOption.dataset.campaign = JSON.stringify({ isCustom: true });
    select.appendChild(customOption);

    campaigns.forEach((campaign, index) => {
        const option = document.createElement("option");
        // Sử dụng index làm value vì campaignId giờ là array
        option.value = index;
        option.textContent = campaign.displayName;
        option.dataset.campaign = JSON.stringify(campaign);
        select.appendChild(option);
    });

    if (campaigns.length > 0) {
        // 🔥 Load saved preferences from PostgreSQL
        const savedPrefs = await loadFilterPreferencesFromFirebase();
        const customDateContainer = document.getElementById("customDateFilterContainer");
        const customStartDateInput = document.getElementById("customStartDate");

        if (savedPrefs && savedPrefs.isCustomMode) {
            // 🎯 Restore CUSTOM mode from Firebase
            select.value = 'custom';

            // Set custom date from Firebase
            if (savedPrefs.customStartDate) {
                customStartDateInput.value = savedPrefs.customStartDate;
            }
            customDateContainer.style.display = "flex";

            // Update selectedCampaign
            selectedCampaign = { isCustom: true };

            // Custom mode: no campaign selected, clear employee ranges
            await loadEmployeeRangesForCampaign(null);

            if (autoLoad && savedPrefs.customStartDate) {
                // 🎯 Auto-load data with saved custom date

                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải đơn hàng từ ngày: ${new Date(savedPrefs.customStartDate).toLocaleString('vi-VN')}`,
                        2000,
                        'Khôi phục từ Firebase'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    window.realtimeManager.connectServerMode();
                }
            }
        } else if (savedPrefs && savedPrefs.selectedCampaignValue !== undefined && savedPrefs.selectedCampaignValue !== 'custom') {
            // 🎯 Restore saved campaign selection from Firebase
            // ⭐ FIX: Ưu tiên tìm theo displayName thay vì index để tránh lỗi khi thứ tự campaigns thay đổi
            const savedValue = savedPrefs.selectedCampaignValue;
            const savedName = savedPrefs.selectedCampaignName;

            let foundOptionIndex = -1;

            // ⭐ Ưu tiên 1: Tìm theo displayName (chính xác hơn)
            if (savedName) {
                for (let i = 0; i < select.options.length; i++) {
                    const optionCampaign = select.options[i].dataset.campaign;
                    if (optionCampaign) {
                        try {
                            const campaign = JSON.parse(optionCampaign);
                            if (campaign.displayName === savedName) {
                                foundOptionIndex = i;
                                break;
                            }
                        } catch (e) { }
                    }
                }
            }

            // ⭐ Fallback: Tìm theo index (cách cũ)
            if (foundOptionIndex === -1) {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === String(savedValue)) {
                        foundOptionIndex = i;
                        break;
                    }
                }
            }

            if (foundOptionIndex !== -1) {
                select.selectedIndex = foundOptionIndex;
                customDateContainer.style.display = "none";
            } else {
                // Saved campaign not in current list, use first campaign
                select.value = 0;
                customDateContainer.style.display = "none";
            }

            // Manually update selectedCampaign state
            const selectedOption = select.options[select.selectedIndex];
            selectedCampaign = selectedOption?.dataset.campaign
                ? JSON.parse(selectedOption.dataset.campaign)
                : null;

            // ⭐ Load employee ranges for the selected campaign
            if (selectedCampaign?.displayName) {
                await loadEmployeeRangesForCampaign(selectedCampaign.displayName);

                if (allData.length > 0) {
                    performTableSearch();
                }
            }

            if (autoLoad) {

                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải dữ liệu chiến dịch: ${selectedCampaign?.displayName || campaigns[0].displayName}`,
                        2000,
                        'Khôi phục từ Firebase'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    window.realtimeManager.connectServerMode();
                }
            }
        } else {
            // 🔄 No saved preferences - try activeCampaignId, fallback to first campaign
            let autoSelectedIndex = -1;

            // Try to find option matching activeCampaignId
            const activeCampaign = window.campaignManager?.activeCampaign;
            if (activeCampaign?.name) {
                autoSelectedIndex = _findFilterOptionByDbCampaignName(activeCampaign.name);
                if (autoSelectedIndex !== -1) {
                    console.log(`[SYNC] 🔄 Auto-selected campaignFilter from activeCampaign: "${activeCampaign.name}"`);
                }
            }

            if (autoSelectedIndex !== -1) {
                select.selectedIndex = autoSelectedIndex;
            } else {
                select.value = 0;
            }
            customDateContainer.style.display = "none";

            // Manually update selectedCampaign state
            const selectedOption = select.options[select.selectedIndex];
            selectedCampaign = selectedOption?.dataset.campaign
                ? JSON.parse(selectedOption.dataset.campaign)
                : null;

            // ⭐ Load employee ranges for the selected campaign
            if (selectedCampaign?.displayName) {
                await loadEmployeeRangesForCampaign(selectedCampaign.displayName);

                if (allData.length > 0) {
                    performTableSearch();
                }
            }

            if (autoLoad) {
                if (window.notificationManager) {
                    window.notificationManager.info(
                        `Đang tải dữ liệu chiến dịch: ${selectedCampaign?.displayName || campaigns[0].displayName}`,
                        2000,
                        'Tự động tải'
                    );
                }

                await handleSearch();

                if (window.realtimeManager) {
                    window.realtimeManager.connectServerMode();
                }
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

    // 🎯 Handle Custom mode - show/hide custom date input
    const customDateContainer = document.getElementById("customDateFilterContainer");
    if (selectedCampaign?.isCustom) {
        customDateContainer.style.display = "flex";

        // Set default custom date to start of today if empty
        const customStartDateInput = document.getElementById("customStartDate");
        if (!customStartDateInput.value) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            customStartDateInput.value = formatDateTimeLocal(today);
        }

        // 🔥 Save custom mode preference to Firebase
        saveFilterPreferencesToFirebase({
            selectedCampaignValue: 'custom',
            isCustomMode: true,
            customStartDate: customStartDateInput.value
        });

        // Custom mode: no campaign selected, clear employee ranges
        await loadEmployeeRangesForCampaign(null);

        // Don't auto-search yet, wait for user to confirm custom date
        return;
    } else {
        customDateContainer.style.display = "none";

        // 🔥 Save campaign selection + sync activeCampaignId
        if (select.value && select.value !== '' && selectedCampaign?.displayName) {
            saveFilterPreferencesToFirebase({
                selectedCampaignValue: select.value,
                selectedCampaignName: selectedCampaign.displayName,
                isCustomMode: false,
                customStartDate: null
            });

            // 🔄 SYNC: Update activeCampaignId to match selected Shopify campaign
            _syncActiveCampaignFromFilter(selectedCampaign);
        }
    }

    // 🔥 Cleanup old Firebase TAG listeners
    cleanupTagRealtimeListeners();

    // ⭐ QUAN TRỌNG: Load employee ranges TRƯỚC KHI load dữ liệu
    // để đảm bảo bảng được phân chia đúng ngay từ đầu

    if (selectedCampaign?.displayName) {
        await loadEmployeeRangesForCampaign(selectedCampaign.displayName);
    } else {
        await loadEmployeeRangesForCampaign(null);
    }

    // Tự động load dữ liệu khi chọn chiến dịch
    if (selectedCampaign?.campaignId || selectedCampaign?.campaignIds) {
        await handleSearch();

        // 🎯 AUTO-CONNECT REALTIME SERVER
        if (window.realtimeManager) {
            window.realtimeManager.connectServerMode();
        }

        // 🔥 Setup new Firebase TAG listeners for this campaign
        setupTagRealtimeListeners();

        // Notify Tab 3 about campaign change
        window.parent.postMessage({
            type: 'CAMPAIGN_CHANGED_FOR_TAB3',
            campaignNames: selectedCampaign?.campaignNames || []
        }, '*');
    }
}

// 🔄 SYNC HELPERS: Match between Shopify campaigns and DB campaigns
// Normalize name for fuzzy matching (remove dates, special chars)
function _normalizeCampaignName(name) {
    return name.replace(/[\d\/\\_.\-]+/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Find DB campaign ID that matches Shopify campaign names
function _findMatchingDbCampaignId(shopifyCampaignNames) {
    const allCampaigns = window.campaignManager?.allCampaigns || {};
    for (const [id, campaign] of Object.entries(allCampaigns)) {
        const dbNorm = _normalizeCampaignName(campaign.name);
        if (!dbNorm) continue;
        for (const shopifyName of (shopifyCampaignNames || [])) {
            const shopNorm = _normalizeCampaignName(shopifyName);
            if (dbNorm === shopNorm || dbNorm.includes(shopNorm) || shopNorm.includes(dbNorm)) {
                return id;
            }
        }
    }
    return null;
}

// Find campaignFilter option index matching a DB campaign name
function _findFilterOptionByDbCampaignName(dbCampaignName) {
    const select = document.getElementById('campaignFilter');
    if (!select || !dbCampaignName) return -1;
    const dbNorm = _normalizeCampaignName(dbCampaignName);
    if (!dbNorm) return -1;

    for (let i = 0; i < select.options.length; i++) {
        const optData = select.options[i].dataset.campaign;
        if (!optData) continue;
        try {
            const c = JSON.parse(optData);
            for (const name of (c.campaignNames || [])) {
                const shopNorm = _normalizeCampaignName(name);
                if (dbNorm === shopNorm || dbNorm.includes(shopNorm) || shopNorm.includes(dbNorm)) {
                    return i;
                }
            }
        } catch (e) { }
    }
    return -1;
}

// Sync activeCampaignId when user changes campaignFilter (#4 → #3)
async function _syncActiveCampaignFromFilter(campaign) {
    if (!campaign?.campaignNames || !window.campaignManager?.currentUserId) return;
    const matchedId = _findMatchingDbCampaignId(campaign.campaignNames);
    if (matchedId && matchedId !== window.campaignManager.activeCampaignId) {
        window.campaignManager.activeCampaignId = matchedId;
        window.campaignManager.activeCampaign = window.campaignManager.allCampaigns[matchedId];
        try {
            await window.CampaignAPI.setActiveCampaign(window.campaignManager.currentUserId, matchedId);
            console.log(`[SYNC] 🔄 activeCampaignId updated to "${matchedId}" from campaignFilter`);
        } catch (e) {
            console.warn('[SYNC] Failed to save activeCampaignId:', e);
        }
    }
}

// 🎯 Handle custom start date change - auto-fill end date (+3 days) and trigger search
async function handleCustomDateChange() {
    const customStartDateInput = document.getElementById("customStartDate");
    const customEndDateInput = document.getElementById("customEndDate");

    if (!customStartDateInput.value) {
        return;
    }

    // Auto-fill end date = start date + 3 days at 00:00
    const startDate = new Date(customStartDateInput.value);
    const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    endDate.setHours(0, 0, 0, 0);
    customEndDateInput.value = formatDateTimeLocal(endDate);


    // Ensure custom mode is set
    selectedCampaign = { isCustom: true };

    // 🔥 Save custom dates to Firebase
    saveFilterPreferencesToFirebase({
        selectedCampaignValue: 'custom',
        isCustomMode: true,
        customStartDate: customStartDateInput.value,
        customEndDate: customEndDateInput.value
    });

    // Cleanup old listeners and data
    cleanupTagRealtimeListeners();

    // Notify user
    if (window.notificationManager) {
        const startDisplay = new Date(customStartDateInput.value).toLocaleDateString('vi-VN');
        const endDisplay = new Date(customEndDateInput.value).toLocaleDateString('vi-VN');
        window.notificationManager.info(
            `Đang tải đơn hàng: ${startDisplay} - ${endDisplay}`,
            2000
        );
    }

    // Trigger search
    await handleSearch();

    // Setup new TAG listeners
    setupTagRealtimeListeners();
}

// 🎯 Handle custom end date change - just trigger search (no auto-fill)
async function handleCustomEndDateChange() {
    const customStartDateInput = document.getElementById("customStartDate");
    const customEndDateInput = document.getElementById("customEndDate");

    if (!customStartDateInput.value || !customEndDateInput.value) {
        return;
    }


    // Ensure custom mode is set
    selectedCampaign = { isCustom: true };

    // 🔥 Save custom dates to Firebase
    saveFilterPreferencesToFirebase({
        selectedCampaignValue: 'custom',
        isCustomMode: true,
        customStartDate: customStartDateInput.value,
        customEndDate: customEndDateInput.value
    });

    // Cleanup old listeners and data
    cleanupTagRealtimeListeners();

    // Trigger search
    await handleSearch();

    // Setup new TAG listeners
    setupTagRealtimeListeners();
}

async function reloadTableData() {
    const btn = document.getElementById('reloadTableBtn');
    const icon = btn ? btn.querySelector('i') : null;

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        // 🎯 SIMPLIFIED: Always use Custom Mode - just reload with current date range
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
    // 🎯 SIMPLIFIED: Always use Custom Mode
    // Validate custom date range
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

    // Ensure selectedCampaign is set to custom mode
    selectedCampaign = { isCustom: true };

    // Update UI label with date range
    const activeCampaignLabel = document.getElementById('activeCampaignLabel');
    if (activeCampaignLabel) {
        const startDisplay = new Date(customStartDateValue).toLocaleDateString('vi-VN');
        const endDisplay = new Date(customEndDateValue).toLocaleDateString('vi-VN');
        activeCampaignLabel.innerHTML = `<i class="fas fa-calendar-check"></i> ${startDisplay} - ${endDisplay}`;
    }

    // Abort any ongoing background loading
    if (isLoadingInBackground) {
        loadingAborted = true;
        // Wait a bit for background loading to stop
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    window.cacheManager.clear("orders");
    searchQuery = "";
    document.getElementById("tableSearchInput").value = "";
    document.getElementById("searchClearBtn").classList.remove("active");
    allData = [];
    renderedCount = 0; // Reset rendered count to prevent duplicate rows
    await fetchOrders();
}

// Progressive loading state
let isLoadingInBackground = false;

// Track if conversations are being fetched (for loading indicator in messages column)
let isLoadingConversations = false;

// Guard flag to prevent duplicate fetchOrders calls
let isFetchingOrders = false;

// ═══════════════════════════════════════════════════════════════════
// PHASE C: Debounced Render - Giảm từ 12 lần render xuống còn 1 lần
// Thay vì render mỗi 200 đơn, gom lại render 1 lần sau khi tải xong batch
// ═══════════════════════════════════════════════════════════════════
let pendingRenderTimeout = null;
const RENDER_DEBOUNCE_MS = 500; // Đợi 500ms không có data mới thì mới render

/**
 * Debounced render - gom nhiều lần render thành 1
 * @param {boolean} isFinalRender - true nếu là lần render cuối (tải xong hoàn toàn)
 */
function scheduleRender(isFinalRender = false) {
    // Nếu là final render, cancel pending và render ngay
    if (isFinalRender) {
        if (pendingRenderTimeout) {
            clearTimeout(pendingRenderTimeout);
            pendingRenderTimeout = null;
        }
        performTableSearch();
        updateSearchResultCount();
        return;
    }

    // Clear pending timeout nếu có
    if (pendingRenderTimeout) {
        clearTimeout(pendingRenderTimeout);
    }

    // Schedule render sau RENDER_DEBOUNCE_MS
    pendingRenderTimeout = setTimeout(() => {
        performTableSearch();
        updateSearchResultCount();
        pendingRenderTimeout = null;
    }, RENDER_DEBOUNCE_MS);
}

async function fetchOrders() {
    // Prevent duplicate calls
    if (isFetchingOrders) {
        return;
    }
    isFetchingOrders = true;

    try {
        showLoading(true);
        loadingAborted = false;

        // 🎯 Check for custom mode
        const isCustomMode = selectedCampaign?.isCustom;
        let filter;

        // 🎯 SIMPLIFIED: Always use Custom Mode with customStartDate and customEndDate
        const customStartDateValue = document.getElementById("customStartDate").value;
        const customEndDateValue = document.getElementById("customEndDate").value || document.getElementById("endDate").value;

        if (!customStartDateValue || !customEndDateValue) {
            throw new Error("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        }

        const customStartDate = convertToUTC(customStartDateValue);
        const customEndDate = convertToUTC(customEndDateValue);
        filter = `(DateCreated ge ${customStartDate} and DateCreated le ${customEndDate})`;

        const PAGE_SIZE = 200; // Batch size for parallel fetching (smaller = faster response)
        // With 1090 orders: ceil(1090/200) = 6 parallel requests
        allData = [];
        renderedCount = 0; // Reset rendered count to prevent duplicate rows on new fetch

        // ═══════════════════════════════════════════════════════════════════
        // PHASE A: Sync OrderStore khi reset allData
        // ═══════════════════════════════════════════════════════════════════
        if (window.OrderStore) {
            window.OrderStore.clear();
        }

        const headers = await window.tokenManager.getAuthHeader();

        // ===== PHASE 1: Quick count request (top=1) =====
        const countUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=1&$skip=0&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const countResponse = await fetch(countUrl, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!countResponse.ok) throw new Error(`HTTP ${countResponse.status}`);
        const countData = await countResponse.json();
        totalCount = countData["@odata.count"] || 0;


        // Show UI with loading state
        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");
        showInfoBanner(`⏳ Đang tải ${totalCount} đơn hàng...`);

        // ===== PHASE 2: Parallel fetch ALL batches =====
        const batches = [];
        for (let skipOffset = 0; skipOffset < totalCount; skipOffset += PAGE_SIZE) {
            batches.push(skipOffset);
        }

        // Hàm fetch 1 batch với retry (tự động retry khi 429/502/503/network error)
        async function fetchBatchWithRetry(batchUrl, batchHeaders, skipValue, index, maxRetries = 2) {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // Nếu retry, lấy token mới phòng trường hợp token expire
                    const fetchHeaders = attempt > 0
                        ? { ...(await window.tokenManager.getAuthHeader()), accept: "application/json" }
                        : { ...batchHeaders, accept: "application/json" };

                    const response = await API_CONFIG.smartFetch(batchUrl, { headers: fetchHeaders });

                    if (response.status === 429) {
                        if (attempt < maxRetries) {
                            const waitMs = 1000 * (attempt + 1);
                            console.warn(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) got 429, retry sau ${waitMs}ms...`);
                            await new Promise(r => setTimeout(r, waitMs));
                            continue;
                        }
                        console.error(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) FAILED: 429 sau ${maxRetries} retries`);
                        return { skipValue, orders: [], error: true, status: 429 };
                    }

                    if (response.status === 502 || response.status === 503) {
                        if (attempt < maxRetries) {
                            const waitMs = 1500 * (attempt + 1);
                            console.warn(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) got ${response.status}, retry sau ${waitMs}ms...`);
                            await new Promise(r => setTimeout(r, waitMs));
                            continue;
                        }
                        console.error(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) FAILED: ${response.status} sau ${maxRetries} retries`);
                        return { skipValue, orders: [], error: true, status: response.status };
                    }

                    if (!response.ok) {
                        console.error(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) failed: HTTP ${response.status}`);
                        return { skipValue, orders: [], error: true, status: response.status };
                    }

                    const data = await response.json();
                    const orders = data.value || [];
                    return { skipValue, orders, error: false };

                } catch (err) {
                    if (attempt < maxRetries) {
                        console.warn(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) error, retry #${attempt + 1}:`, err.message);
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    console.error(`[PARALLEL] Batch ${index + 1} (skip=${skipValue}) FAILED sau ${maxRetries} retries:`, err);
                    return { skipValue, orders: [], error: true };
                }
            }
            return { skipValue, orders: [], error: true };
        }

        // Fetch với concurrency limit để tránh 429 Too Many Requests
        const CONCURRENCY_LIMIT = 3;
        const tasks = batches.map((skipValue, index) => {
            const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${PAGE_SIZE}&$skip=${skipValue}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}`;
            return () => fetchBatchWithRetry(url, headers, skipValue, index);
        });

        // Chạy tối đa CONCURRENCY_LIMIT request cùng lúc
        const resultPromises = [];
        const executing = new Set();
        for (const task of tasks) {
            const p = task().then(result => {
                executing.delete(p);
                return result;
            });
            executing.add(p);
            resultPromises.push(p);
            if (executing.size >= CONCURRENCY_LIMIT) {
                await Promise.race(executing);
            }
        }
        const results = await Promise.all(resultPromises);

        // Sort by skipValue and combine (maintains DateCreated desc order)
        results.sort((a, b) => a.skipValue - b.skipValue);
        allData = [];
        const failedBatches = [];
        for (const result of results) {
            if (result.error) {
                failedBatches.push(result);
            }
            if (result.orders.length > 0) {
                allData = allData.concat(result.orders);
            }
        }

        // ===== LOG CHI TIẾT ĐỂ DEBUG =====
        for (const result of results) {
            const status = result.error ? '❌ FAIL' : '✅ OK';
        }
        if (allData.length < totalCount) {
            console.warn(`[PARALLEL] ⚠️ THIẾU ${totalCount - allData.length} ĐƠN HÀNG!`);
        }

        // Cảnh báo user nếu có batch fail sau retry
        if (failedBatches.length > 0 && window.notificationManager) {
            window.notificationManager.warning(
                `⚠️ Tải thiếu dữ liệu: ${allData.length}/${totalCount} đơn. Nhấn "Tải lại" để thử lại.`,
                6000
            );
        }

        // Initialize OrderStore with all data
        if (window.OrderStore) {
            window.OrderStore.setAll(allData);
        }

        // Save to IndexedDB for cross-tab access (Tab3, Overview, etc.)
        // Transform to Tab3-compatible format (stt, customerName, etc.)
        if (window.indexedDBStorage) {
            const ordersForTabs = allData.map((order, index) => ({
                stt: order.SessionIndex || (index + 1).toString(),
                orderId: order.Id,
                orderCode: order.Code,
                customerName: order.PartnerName || order.Name,
                phone: order.PartnerPhone || order.Telephone,
                address: order.PartnerAddress || order.Address,
                totalAmount: order.TotalAmount || order.AmountTotal || 0,
                quantity: order.TotalQuantity || 0,
                note: order.Note,
                state: order.Status || order.State,
                dateOrder: order.DateCreated || order.DateOrder,
                Tags: order.Tags,
                liveCampaignName: order.LiveCampaignName
            }));
            await Promise.all([
                window.indexedDBStorage.setItem('allOrders', {
                    orders: ordersForTabs,
                    timestamp: Date.now(),
                    activeCampaignNames: selectedCampaign?.campaignNames || []
                }),
                // Also save raw data for Overview tab (uses raw API field names)
                window.indexedDBStorage.setItem('allOrdersRaw', {
                    orders: allData,
                    timestamp: Date.now()
                })
            ]).catch(err => console.error('[TAB1] IndexedDB save error:', err));
        }

        // Render table with all data
        performTableSearch();
        updateSearchResultCount();
        showInfoBanner(`✅ Đã tải ${allData.length} đơn hàng.`);

        // Init Processing Tags (Tag Xử Lý)
        if (window.loadProcessingTags) {
            window.loadProcessingTags();
            if (window.setupProcessingTagSSE) window.setupProcessingTagSSE();
            if (window.initProcessingTagPanel) window.initProcessingTagPanel();
        }

        // Auto-sync GIỎ TRỐNG tag (server quyết theo SL)
        if (typeof window.batchEmptyCartSync === 'function') {
            // Fire-and-forget — server xử lý dedupe
            window.batchEmptyCartSync(allData);
        }

        // NOTE: Removed cross-tab sync (sendDataToTab2, sendOrdersDataToOverview, sendOrdersDataToTab3)
        // Each tab now fetches its own data independently when user switches to it

        // ⚡ Load conversations in BACKGROUND (non-blocking)
        // Chat columns will update incrementally, no full table re-render
        if (window.chatDataManager) {
            const channelIds = [...new Set(
                allData
                    .map(order => window.chatDataManager.parseChannelId(order.Facebook_PostId))
                    .filter(id => id)
            )];

            // Run in background - no await, no re-render
            (async () => {
                try {
                    await window.chatDataManager.fetchConversations(true, channelIds);
                    if (window.pancakeDataManager) {
                        await window.pancakeDataManager.fetchConversations(true);
                    }

                    // Update chat columns without full re-render (use setTimeout to not block)
                    setTimeout(() => updateChatColumnsOnly(), 0);
                } catch (err) {
                    console.error('[CHAT] ❌ Error:', err);
                }
            })();
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

        // Load user identifier for quick tag feature
        loadCurrentUserIdentifier().catch(err => console.error('[QUICK-TAG] Error loading identifier:', err));

        // NOTE-TRACKER disabled - uncomment to re-enable
        // detectEditedNotes().then(() => {
        //     performTableSearch();
        //     console.log('[NOTE-TRACKER] Table re-rendered with edit indicators');
        // }).catch(err => console.error('[NOTE-TRACKER] Error detecting edited notes:', err));

        // Hide loading overlay
        showLoading(false);

    } catch (error) {
        console.error("Error fetching data:", error);

        // Better error messages
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
        // Reset fetching flag to allow subsequent calls
        isFetchingOrders = false;
    }
}


