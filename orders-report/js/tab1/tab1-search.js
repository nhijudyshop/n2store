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

function performTableSearch() {
    // Apply search filter
    let tempData = searchQuery
        ? allData.filter((order) => matchesSearchQuery(order, searchQuery))
        : [...allData];

    // Apply Employee STT Range Filter
    // Check if user has admin access via checkLogin level (0 = admin)
    const auth = window.authManager ? window.authManager.getAuthState() : null;
    let isAdmin = window.authManager?.hasPermission(0) || false;

    const currentUserType = auth && auth.userType ? auth.userType : null;
    const currentDisplayName = auth && auth.displayName ? auth.displayName : null;
    const currentUserId = auth && auth.id ? auth.id : null;

    if (!isAdmin && employeeRanges.length > 0) {
        console.log('[FILTER] Current user:', currentDisplayName || currentUserType, 'ID:', currentUserId);

        let userRange = null;

        // 1. Try matching by ID first (most reliable)
        if (currentUserId) {
            userRange = employeeRanges.find(r => r.id === currentUserId);
            if (userRange) console.log('[FILTER] Matched by ID');
        }

        // 2. If not found, try matching by Display Name (Exact match)
        if (!userRange && currentDisplayName) {
            userRange = employeeRanges.find(r => r.name === currentDisplayName);
            if (userRange) console.log('[FILTER] Matched by Display Name');
        }

        // 3. If not found, try matching by User Type (Legacy)
        if (!userRange && currentUserType) {
            userRange = employeeRanges.find(r => r.name === currentUserType);
            if (userRange) console.log('[FILTER] Matched by User Type');
        }

        // 4. If not found, try matching by short name (before "-")
        if (!userRange && currentUserType) {
            const shortName = currentUserType.split('-')[0].trim();
            userRange = employeeRanges.find(r => r.name === shortName);
            if (userRange) console.log('[FILTER] Matched by Short Name:', shortName);
        }

        if (userRange) {
            const debugInfo = `
🔍 THÔNG TIN DEBUG:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Tài khoản hiện tại: ${currentDisplayName || currentUserType}
🆔 User ID: ${currentUserId || 'Không có'}
🔐 Là Admin? ${isAdmin ? 'CÓ' : 'KHÔNG'}
📊 STT được phân: ${userRange.start} - ${userRange.end}
👥 Tên trong setting: ${userRange.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Đang áp dụng filter cho bạn!
            `.trim();

            console.log(debugInfo);

            // Alert removed as per user request
            // if (!window._filterDebugShown) {
            //     alert(debugInfo);
            //     window._filterDebugShown = true;
            // }

            tempData = tempData.filter(order => {
                const stt = parseInt(order.SessionIndex);
                if (isNaN(stt)) return false;
                return stt >= userRange.start && stt <= userRange.end;
            });
            console.log(`[FILTER] Applied STT range ${userRange.start}-${userRange.end} for ${currentDisplayName || currentUserType}`);
        } else {
            console.log('[FILTER] No range found for user:', currentDisplayName || currentUserType);
        }
    } else if (isAdmin) {
        console.log('[FILTER] User is Admin - NO FILTER APPLIED');
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
            if (statusFilter === 'Draft') {
                return order.Status === 'Draft';
            } else if (statusFilter === 'Confirmed') {
                return order.Status !== 'Draft';
            }
            return true;
        });
    }

    // Apply TAG filter
    const tagFilter = document.getElementById('tagFilter')?.value || 'all';

    if (tagFilter !== 'all') {
        tempData = tempData.filter(order => {
            if (!order.Tags) return false;

            try {
                const orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags) || orderTags.length === 0) return false;

                // Check if the order has the selected tag
                return orderTags.some(tag => String(tag.Id) === String(tagFilter));
            } catch (e) {
                return false;
            }
        });
    }

    // Apply Excluded Tags filter (hide orders with certain tags)
    const excludedTags = window.columnVisibility ? window.columnVisibility.loadExcludedTags() : [];
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
        console.log(`[FILTER] Excluded ${excludedTags.length} tags, remaining orders: ${tempData.length}`);
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

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, date range: ${startDateLocal} to ${endDateLocal}, autoLoad=${autoLoad}`);
        } else {
            // Fallback: không có date filter - Tải 3000 đơn hàng
            // OPTIMIZATION: Only fetch necessary fields for campaign list
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
                displayName: displayName,
                dates: dates,
                latestDate: campaign.latestDate,
                count: dates.length
            });
        });

        console.log(`[CAMPAIGNS] Found ${mergedCampaigns.length} unique campaigns (merged from ${orders.length} orders)`);

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
        // 🔥 Load saved preferences from Firebase
        const savedPrefs = await loadFilterPreferencesFromFirebase();
        const customDateContainer = document.getElementById("customDateFilterContainer");
        const customStartDateInput = document.getElementById("customStartDate");

        if (savedPrefs && savedPrefs.isCustomMode) {
            // 🎯 Restore CUSTOM mode from Firebase
            console.log('[FILTER-PREFS] Restoring CUSTOM mode from Firebase');
            select.value = 'custom';

            // Set custom date from Firebase
            if (savedPrefs.customStartDate) {
                customStartDateInput.value = savedPrefs.customStartDate;
            }
            customDateContainer.style.display = "flex";

            // Update selectedCampaign
            selectedCampaign = { isCustom: true };

            // Load general employee ranges for custom mode
            console.log('[EMPLOYEE] Loading general employee ranges for restored custom mode');
            await loadEmployeeRangesForCampaign(null);

            if (autoLoad && savedPrefs.customStartDate) {
                // 🎯 Auto-load data with saved custom date
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
                                console.log('[FILTER-PREFS] ✅ Found campaign by displayName:', savedName, '→ index:', i);
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
                // Saved campaign not in current list, use first campaign
                console.log('[FILTER-PREFS] Saved campaign not found, using first campaign');
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
            // 🎯 No saved preferences - use default (first campaign)
            select.value = 0;
            customDateContainer.style.display = "none";

            // Manually update selectedCampaign state
            const selectedOption = select.options[select.selectedIndex];
            selectedCampaign = selectedOption?.dataset.campaign
                ? JSON.parse(selectedOption.dataset.campaign)
                : null;

            // ⭐ Load employee ranges for the selected campaign
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

    // 🎯 Handle Custom mode - show/hide custom date input
    const customDateContainer = document.getElementById("customDateFilterContainer");
    if (selectedCampaign?.isCustom) {
        customDateContainer.style.display = "flex";
        console.log('[CUSTOM-FILTER] Custom mode selected - showing custom date input');

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

        // Load employee ranges (general, no campaign)
        console.log('[EMPLOYEE] Loading general employee ranges for custom mode');
        await loadEmployeeRangesForCampaign(null);

        // Don't auto-search yet, wait for user to confirm custom date
        return;
    } else {
        customDateContainer.style.display = "none";

        // 🔥 Save campaign selection to Firebase (not custom mode)
        // ⭐ FIX: Lưu displayName thay vì index để tránh lỗi khi thứ tự campaigns thay đổi
        if (select.value && select.value !== '' && selectedCampaign?.displayName) {
            saveFilterPreferencesToFirebase({
                selectedCampaignValue: select.value,
                selectedCampaignName: selectedCampaign.displayName, // ⭐ Lưu tên campaign
                isCustomMode: false,
                customStartDate: null
            });
        }
    }

    // 🔥 Cleanup old Firebase TAG listeners
    cleanupTagRealtimeListeners();

    // ⭐ QUAN TRỌNG: Load employee ranges TRƯỚC KHI load dữ liệu
    // để đảm bảo bảng được phân chia đúng ngay từ đầu
    if (selectedCampaign?.displayName) {
        console.log(`[EMPLOYEE] Loading employee ranges for campaign: ${selectedCampaign.displayName}`);
        await loadEmployeeRangesForCampaign(selectedCampaign.displayName);
    } else {
        console.log('[EMPLOYEE] Loading general employee ranges (no campaign selected)');
        await loadEmployeeRangesForCampaign(null);
    }

    // Tự động load dữ liệu khi chọn chiến dịch
    if (selectedCampaign?.campaignId || selectedCampaign?.campaignIds) {
        await handleSearch();

        // 🎯 AUTO-CONNECT REALTIME SERVER
        if (window.realtimeManager) {
            console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
            window.realtimeManager.connectServerMode();
        }

        // 🔥 Setup new Firebase TAG listeners for this campaign
        setupTagRealtimeListeners();
    }
}

// 🎯 Handle custom start date change - auto-fill end date (+3 days) and trigger search
async function handleCustomDateChange() {
    const customStartDateInput = document.getElementById("customStartDate");
    const customEndDateInput = document.getElementById("customEndDate");

    if (!customStartDateInput.value) {
        console.log('[CUSTOM-FILTER] Start date cleared, waiting for valid date...');
        return;
    }

    // Auto-fill end date = start date + 3 days at 00:00
    const startDate = new Date(customStartDateInput.value);
    const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    endDate.setHours(0, 0, 0, 0);
    customEndDateInput.value = formatDateTimeLocal(endDate);

    console.log(`[CUSTOM-FILTER] Date range: ${customStartDateInput.value} -> ${customEndDateInput.value}`);

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
        console.log('[CUSTOM-FILTER] Missing start or end date...');
        return;
    }

    console.log(`[CUSTOM-FILTER] End date changed: ${customStartDateInput.value} -> ${customEndDateInput.value}`);

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
        console.log('[PROGRESSIVE] Aborting background loading for new search...');
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

async function fetchOrders() {
    // Prevent duplicate calls
    if (isFetchingOrders) {
        console.log('[FETCH-ORDERS] Already fetching, skipping duplicate call...');
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
        console.log(`[FETCH-CUSTOM] Fetching orders: ${customStartDateValue} -> ${customEndDateValue}`);

        const PAGE_SIZE = 1000; // API fetch size for background loading
        const INITIAL_PAGE_SIZE = 50; // Smaller size for instant first load
        const UPDATE_EVERY = 200; // Update UI every 200 orders
        let skip = 0;
        let hasMore = true;
        allData = [];
        renderedCount = 0; // Reset rendered count to prevent duplicate rows on new fetch
        const headers = await window.tokenManager.getAuthHeader();

        // ===== PHASE 1: Load first batch and show immediately =====
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
        // Show UI immediately with first batch
        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");

        performTableSearch(); // Apply merging and filters immediately
        updateSearchResultCount();
        showInfoBanner(
            `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
        );
        sendDataToTab2();
        // Also update Overview tab with first batch
        sendOrdersDataToOverview();

        // ⚡ PHASE 2 OPTIMIZATION: Load conversations in BACKGROUND (non-blocking)
        // This allows users to interact with the table immediately
        // Chat columns will show loading spinners, then update when data arrives
        console.log('[PROGRESSIVE] Loading conversations in background...');
        if (window.chatDataManager) {
            // Set loading state for messages column indicator (shows spinner)
            isLoadingConversations = true;

            // Re-render to show loading spinners in chat columns
            performTableSearch();

            // Collect unique channel IDs from orders (parse from Facebook_PostId)
            const channelIds = [...new Set(
                allData
                    .map(order => window.chatDataManager.parseChannelId(order.Facebook_PostId))
                    .filter(id => id) // Remove null/undefined
            )];
            console.log('[PROGRESSIVE] Found channel IDs:', channelIds);

            // ⚡ Run conversations loading in BACKGROUND (no await!)
            (async () => {
                try {
                    // FIX: fetchConversations now uses Type="all" to fetch both messages and comments in 1 request
                    // No need to call both methods anymore - this reduces API calls by 50%!
                    // Force refresh (true) to always fetch fresh data when searching
                    await window.chatDataManager.fetchConversations(true, channelIds);

                    // Fetch Pancake conversations for unread info
                    if (window.pancakeDataManager) {
                        console.log('[PANCAKE] Fetching conversations for unread info...');
                        await window.pancakeDataManager.fetchConversations(true);
                        console.log('[PANCAKE] ✅ Conversations fetched');
                    }

                    // Clear loading state
                    isLoadingConversations = false;
                    console.log('[PROGRESSIVE] ✅ Conversations loaded (background)');

                    // Re-render with actual chat data
                    performTableSearch();
                } catch (err) {
                    console.error('[PROGRESSIVE] ❌ Conversations loading error:', err);
                    isLoadingConversations = false;
                }
            })();
        } else {
            // chatDataManager not ready yet - will be handled by Phase 1 re-render
            console.log('[PROGRESSIVE] chatDataManager not ready, skipping conversations for now');
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

        // Load user identifier for quick tag feature
        loadCurrentUserIdentifier().catch(err => console.error('[QUICK-TAG] Error loading identifier:', err));

        // Detect edited notes using Firebase snapshots (fast, no API spam!)
        detectEditedNotes().then(() => {
            // Re-apply filters and merge with noteEdited flags
            performTableSearch();
            console.log('[NOTE-TRACKER] Table re-rendered with edit indicators');
        }).catch(err => console.error('[NOTE-TRACKER] Error detecting edited notes:', err));

        // Hide loading overlay after first batch
        showLoading(false);

        // ===== PHASE 2: Continue loading remaining orders in background =====
        hasMore = firstOrders.length === INITIAL_PAGE_SIZE;
        skip += INITIAL_PAGE_SIZE;

        if (hasMore) {
            isLoadingInBackground = true;
            console.log('[PROGRESSIVE] Starting background loading...');

            // Run background loading
            (async () => {
                try {
                    let lastUpdateCount = allData.length; // Track when we last updated

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

                            // Update table every UPDATE_EVERY orders OR if this is the last batch
                            const shouldUpdate =
                                allData.length - lastUpdateCount >= UPDATE_EVERY ||
                                orders.length < PAGE_SIZE;

                            if (shouldUpdate) {
                                console.log(`[PROGRESSIVE] Updating table: ${allData.length}/${totalCount} orders`);
                                performTableSearch(); // Apply merging, employee filtering, and all other filters
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

                        // Small delay to allow UI interaction
                        if (hasMore) {
                            await new Promise((resolve) => setTimeout(resolve, 100));
                        }
                    }

                    // Final update
                    if (!loadingAborted) {
                        // Set flag to false BEFORE calling performTableSearch
                        // so renderByEmployee() knows loading is complete
                        isLoadingInBackground = false;
                        console.log('[PROGRESSIVE] Background loading completed');
                        performTableSearch(); // Final merge and render
                        updateSearchResultCount();
                        showInfoBanner(
                            `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
                        );
                        sendDataToTab2();
                        // Auto-update Tab3 with full data after background loading completes
                        sendOrdersDataToTab3();
                        // Auto-update Overview tab with full data after background loading completes
                        sendOrdersDataToOverview();
                    }

                } catch (error) {
                    console.error('[PROGRESSIVE] Background loading error:', error);
                } finally {
                    // Ensure flag is always reset even on error or abort
                    isLoadingInBackground = false;
                }
            })();
        } else {
            // No more data, we're done
            showInfoBanner(
                `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
            );
        }

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

// =====================================================
// MANUAL ASSIGN "GIỎ TRỐNG" TAG (FOR SELECTED ORDERS)
// =====================================================
async function assignEmptyCartTagToSelected() {
    try {
        // Lấy danh sách đơn hàng đã được chọn
        const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]:checked');
        const selectedOrderIds = Array.from(checkboxes).map(cb => cb.value);

        if (selectedOrderIds.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng', 3000);
            } else {
                alert('Vui lòng chọn ít nhất 1 đơn hàng');
            }
            return;
        }

        console.log(`[ASSIGN-TAG] Processing ${selectedOrderIds.length} selected orders...`);

        // Load tags nếu chưa có
        if (availableTags.length === 0) {
            console.log('[ASSIGN-TAG] Loading tags...');
            await loadAvailableTags();
        }

        // Tìm tag "GIỎ TRỐNG" trong availableTags
        const emptyCartTag = availableTags.find(tag =>
            tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
        );

        if (!emptyCartTag) {
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy tag "GIỎ TRỐNG" trong hệ thống', 4000);
            } else {
                alert('Không tìm thấy tag "GIỎ TRỐNG" trong hệ thống');
            }
            return;
        }

        console.log('[ASSIGN-TAG] Found "GIỎ TRỐNG" tag:', emptyCartTag);

        // Lọc các đơn hàng có TotalQuantity = 0 và chưa có tag "GIỎ TRỐNG"
        const ordersNeedingTag = allData.filter(order => {
            // Phải nằm trong danh sách selected
            if (!selectedOrderIds.includes(order.Id)) return false;

            // Check TotalQuantity = 0
            if (order.TotalQuantity !== 0) return false;

            // Check xem đã có tag "GIỎ TRỐNG" chưa
            if (order.Tags) {
                try {
                    const tags = JSON.parse(order.Tags);
                    if (Array.isArray(tags)) {
                        const hasEmptyCartTag = tags.some(tag =>
                            tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
                        );
                        if (hasEmptyCartTag) return false; // Đã có tag rồi
                    }
                } catch (e) {
                    // Parse error, coi như chưa có tag
                }
            }

            return true; // Cần thêm tag
        });

        if (ordersNeedingTag.length === 0) {
            console.log('[ASSIGN-TAG] No selected orders with TotalQuantity = 0 need "GIỎ TRỐNG" tag');

            // Đếm số đơn có số lượng > 0
            const nonZeroCount = allData.filter(order =>
                selectedOrderIds.includes(order.Id) && order.TotalQuantity > 0
            ).length;

            let message = '';
            if (nonZeroCount > 0) {
                message = `${nonZeroCount} đơn đã chọn có số lượng > 0, không cần gán tag "GIỎ TRỐNG"`;
            } else {
                message = 'Các đơn đã chọn đã có tag "GIỎ TRỐNG" rồi';
            }

            if (window.notificationManager) {
                window.notificationManager.info(message, 3000);
            } else {
                alert(message);
            }
            return;
        }

        console.log(`[ASSIGN-TAG] Found ${ordersNeedingTag.length} orders needing "GIỎ TRỐNG" tag`);

        // Thông báo cho user
        if (window.notificationManager) {
            window.notificationManager.info(
                `Đang gán tag "GIỎ TRỐNG" cho ${ordersNeedingTag.length} đơn hàng...`,
                3000
            );
        }

        // Gán tag cho từng order (với delay để tránh spam API)
        let successCount = 0;
        let failCount = 0;

        for (const order of ordersNeedingTag) {
            try {
                // Lấy tags hiện tại của order
                let currentTags = [];
                if (order.Tags) {
                    try {
                        currentTags = JSON.parse(order.Tags);
                    } catch (e) {
                        currentTags = [];
                    }
                }

                // Thêm tag "GIỎ TRỐNG"
                const newTags = [
                    ...currentTags,
                    {
                        Id: emptyCartTag.Id,
                        Name: emptyCartTag.Name,
                        Color: emptyCartTag.Color
                    }
                ];

                // Call API để gán tag
                const headers = await window.tokenManager.getAuthHeader();
                const payload = {
                    Tags: newTags.map(tag => ({
                        Id: tag.Id,
                        Color: tag.Color,
                        Name: tag.Name,
                    })),
                    OrderId: order.Id,
                };

                const response = await API_CONFIG.smartFetch(
                    "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                    {
                        method: "POST",
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                        body: JSON.stringify(payload),
                    }
                );

                if (response.ok) {
                    // Cập nhật tags trong allData
                    const updatedData = { Tags: JSON.stringify(newTags) };
                    updateOrderInTable(order.Id, updatedData);
                    successCount++;
                    console.log(`[ASSIGN-TAG] ✓ Tagged order ${order.Code}`);
                } else {
                    failCount++;
                    console.error(`[ASSIGN-TAG] ✗ Failed to tag order ${order.Code}: HTTP ${response.status}`);
                }

                // Delay 500ms giữa các requests để tránh spam API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                failCount++;
                console.error(`[ASSIGN-TAG] ✗ Error tagging order ${order.Code}:`, error);
            }
        }

        // Thông báo kết quả
        console.log(`[ASSIGN-TAG] Completed: ${successCount} success, ${failCount} failed`);

        if (window.notificationManager) {
            if (successCount > 0) {
                window.notificationManager.success(
                    `Đã gán tag "GIỎ TRỐNG" cho ${successCount} đơn hàng${failCount > 0 ? ` (${failCount} lỗi)` : ''}`,
                    4000
                );
            }
            if (failCount > 0 && successCount === 0) {
                window.notificationManager.error(
                    `Không thể gán tag cho ${failCount} đơn hàng`,
                    4000
                );
            }
        }

        // Clear cache và refresh UI
        if (successCount > 0) {
            window.cacheManager.clear("orders");
            renderTable();
        }

    } catch (error) {
        console.error('[ASSIGN-TAG] Error in assignEmptyCartTagToSelected:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 4000);
        }
    }
}

