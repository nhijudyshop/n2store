// =====================================================
// GLOBAL VARIABLES
// =====================================================
let allData = [];
let filteredData = [];
let displayedData = [];
let totalCount = 0;
let selectedCampaign = null;

// Search State
let searchQuery = "";
let searchTimeout = null;

// Tag Management State
let availableTags = [];
let currentEditingOrderId = null;

// Edit Modal State
let currentEditOrderData = null;
let currentChatOrderDetails = [];
let currentChatOrderId = null;
let currentChatProductsRef = null;
let currentOrderTags = [];

// =====================================================
// FIREBASE CONFIGURATION FOR NOTE TRACKING
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyD2izLYXLYWR8RtsIS7vvQWroPPtxi_50A",
    authDomain: "product-s-98d2c.firebaseapp.com",
    databaseURL: "https://product-s-98d2c-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "product-s-98d2c",
    storageBucket: "product-s-98d2c.firebasestorage.app",
    messagingSenderId: "694055453687",
    appId: "1:694055453687:web:1d0bc6c90d6d21088e0cbb",
    measurementId: "G-MXT4TJK349"
};

// Initialize Firebase
let database = null;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('[NOTE-TRACKER] Firebase initialized successfully');
    }
    database = firebase.database();
} catch (error) {
    console.error('[NOTE-TRACKER] Firebase initialization error:', error);
}

// =====================================================
// INITIALIZATION
// =====================================================
window.addEventListener("DOMContentLoaded", async function () {
    console.log("[CACHE] Clearing all cache on page load...");
    if (window.cacheManager) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
    }

    // ⚠️ QUAN TRỌNG: Set default dates TRƯỚC KHI load campaigns
    // Vì auto-load cần dates để fetch orders
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById("endDate").value = formatDateTimeLocal(now);
    document.getElementById("startDate").value =
        formatDateTimeLocal(thirtyDaysAgo);

    // Event listeners
    document
        .getElementById("loadCampaignsBtn")
        .addEventListener("click", handleLoadCampaigns);
    document
        .getElementById("clearCacheBtn")
        .addEventListener("click", handleClearCache);
    document
        .getElementById("selectAll")
        .addEventListener("change", handleSelectAll);
    document
        .getElementById("campaignFilter")
        .addEventListener("change", handleCampaignChange);
    document
        .getElementById("assignEmptyCartTagBtn")
        .addEventListener("click", assignEmptyCartTagToSelected);

    // Initialize TPOS Token Manager Firebase connection
    if (window.tokenManager) {
        console.log('[TOKEN] Retrying Firebase initialization for TokenManager...');
        if (window.tokenManager.retryFirebaseInit()) {
            console.log('[TOKEN] ✅ Firebase connection established');
        } else {
            console.warn('[TOKEN] ⚠️ Firebase still not available, using localStorage only');
        }
    }

    // Initialize Pancake Token Manager & Data Manager
    if (window.pancakeTokenManager && window.pancakeDataManager) {
        console.log('[PANCAKE] Initializing Pancake managers...');

        // Initialize token manager first
        window.pancakeTokenManager.initialize();

        // Then initialize data manager
        window.pancakeDataManager.initialize().then(success => {
            if (success) {
                console.log('[PANCAKE] ✅ PancakeDataManager initialized successfully');
                // Re-render table with unread info if orders already loaded
                if (allData.length > 0) {
                    performTableSearch();
                }
            } else {
                console.warn('[PANCAKE] ⚠️ PancakeDataManager initialization failed');
                console.warn('[PANCAKE] Please set JWT token in Pancake Settings');
            }
        }).catch(error => {
            console.error('[PANCAKE] ❌ Error initializing PancakeDataManager:', error);
        });
    } else {
        console.warn('[PANCAKE] ⚠️ Pancake managers not available');
    }
    // Initialize Realtime Manager
    if (window.RealtimeManager) {
        console.log('[REALTIME] Initializing RealtimeManager...');
        window.realtimeManager = new RealtimeManager();
        window.realtimeManager.initialize();
    } else {
        console.warn('[REALTIME] ⚠️ RealtimeManager class not found');
    }

    // Scroll to top button
    const scrollBtn = document.getElementById("scrollToTopBtn");
    const tableWrapper = document.getElementById("tableWrapper");

    tableWrapper.addEventListener("scroll", function () {
        if (tableWrapper.scrollTop > 300) {
            scrollBtn.classList.add("show");
        } else {
            scrollBtn.classList.remove("show");
        }
    });

    scrollBtn.addEventListener("click", function () {
        tableWrapper.scrollTo({ top: 0, behavior: "smooth" });
    });

    // 🎯 TỰ ĐỘNG TẢI 1000 ĐƠN HÀNG ĐẦU TIÊN VÀ CHIẾN DỊCH MỚI NHẤT
    // Tags sẽ được load SAU KHI load xong đơn hàng và hiển thị bảng
    console.log('[AUTO-LOAD] Tự động tải campaigns từ 1000 đơn hàng đầu tiên...');
    await loadCampaignList(0, document.getElementById("startDate").value, document.getElementById("endDate").value, true);

    // Search functionality
    const searchInput = document.getElementById("tableSearchInput");
    const searchClearBtn = document.getElementById("searchClearBtn");

    searchInput.addEventListener("input", function (e) {
        handleTableSearch(e.target.value);
    });

    searchClearBtn.addEventListener("click", function () {
        searchInput.value = "";
        handleTableSearch("");
        searchInput.focus();
    });

    // Clear search on Escape
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            searchInput.value = "";
            handleTableSearch("");
        }
    });
});

// =====================================================
// TAG MANAGEMENT FUNCTIONS
// =====================================================
async function loadAvailableTags() {
    try {
        const cached = window.cacheManager.get("tags", "tags");
        if (cached) {
            console.log("[TAG] Using cached tags");
            availableTags = cached;
            return;
        }

        console.log("[TAG] Loading tags from API...");
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=320&$count=true",
            {
                method: "GET",
                headers: {
                    ...headers,
                    accept: "application/json",
                    "content-type": "application/json",
                },
            },
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        availableTags = data.value || [];
        window.cacheManager.set("tags", availableTags, "tags");
        console.log(`[TAG] Loaded ${availableTags.length} tags from API`);
    } catch (error) {
        console.error("[TAG] Error loading tags:", error);
        availableTags = [];
    }
}

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    const order = allData.find((o) => o.Id === orderId);
    currentOrderTags = order && order.Tags ? JSON.parse(order.Tags) : [];

    document.querySelector(".tag-modal-header h3").innerHTML =
        `<i class="fas fa-tags"></i> Quản lý Tag - ${orderCode}`;

    renderTagList();
    updateSelectedTagsDisplay();
    document.getElementById("tagModal").classList.add("show");
}

function closeTagModal() {
    document.getElementById("tagModal").classList.remove("show");
    document.getElementById("tagSearchInput").value = "";
    currentEditingOrderId = null;
    currentOrderTags = [];
}

function renderTagList(searchQuery = "") {
    const tagList = document.getElementById("tagList");
    if (availableTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-exclamation-circle"></i><p>Không có tag nào</p></div>`;
        return;
    }

    const filteredTags = availableTags.filter((tag) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            tag.Name.toLowerCase().includes(query) ||
            tag.NameNosign.toLowerCase().includes(query)
        );
    });

    if (filteredTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-search"></i><p>Không tìm thấy tag phù hợp</p></div>`;
        return;
    }

    tagList.innerHTML = filteredTags
        .map((tag) => {
            const isSelected = currentOrderTags.some((t) => t.Id === tag.Id);
            return `
            <div class="tag-item ${isSelected ? "selected" : ""}" onclick="toggleTag(${tag.Id})" data-tag-id="${tag.Id}">
                <input type="checkbox" class="tag-item-checkbox" ${isSelected ? "checked" : ""} onclick="event.stopPropagation(); toggleTag(${tag.Id})">
                <div class="tag-item-color" style="background-color: ${tag.Color}"></div>
                <div class="tag-item-name">${tag.Name}</div>
            </div>`;
        })
        .join("");
}

function toggleTag(tagId) {
    const tag = availableTags.find((t) => t.Id === tagId);
    if (!tag) return;

    const existingIndex = currentOrderTags.findIndex((t) => t.Id === tagId);
    if (existingIndex >= 0) {
        currentOrderTags.splice(existingIndex, 1);
    } else {
        currentOrderTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
    }

    updateSelectedTagsDisplay();
    const tagItem = document.querySelector(`[data-tag-id="${tagId}"]`);
    if (tagItem) {
        tagItem.classList.toggle("selected");
        const checkbox = tagItem.querySelector(".tag-item-checkbox");
        if (checkbox) checkbox.checked = !checkbox.checked;
    }
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById("selectedTagsList");
    if (currentOrderTags.length === 0) {
        container.innerHTML =
            '<span style="color: #9ca3af; font-size: 12px">Chưa có tag nào được chọn</span>';
        return;
    }
    container.innerHTML = currentOrderTags
        .map(
            (tag) => `
        <span class="selected-tag-item" style="background-color: ${tag.Color}">
            ${tag.Name}
            <button class="selected-tag-remove" onclick="event.stopPropagation(); toggleTag(${tag.Id})">
                <i class="fas fa-times"></i>
            </button>
        </span>`,
        )
        .join("");
}

function filterTags() {
    renderTagList(document.getElementById("tagSearchInput").value);
}

async function saveOrderTags() {
    if (!currentEditingOrderId) return;
    try {
        showLoading(true);
        const payload = {
            Tags: currentOrderTags.map((tag) => ({
                Id: tag.Id,
                Color: tag.Color,
                Name: tag.Name,
            })),
            OrderId: currentEditingOrderId,
        };
        const headers = await window.tokenManager.getAuthHeader();
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
            },
        );
        if (!response.ok)
            throw new Error(
                `HTTP ${response.status}: ${await response.text()}`,
            );

        // 🔄 Cập nhật tags trong data
        const updatedData = { Tags: JSON.stringify(currentOrderTags) };
        updateOrderInTable(currentEditingOrderId, updatedData);

        window.cacheManager.clear("orders");
        showLoading(false);
        closeTagModal();

        if (window.notificationManager) {
            window.notificationManager.success(
                `Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
                2000
            );
        } else {
            showInfoBanner(
                `✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
            );
        }
    } catch (error) {
        console.error("[TAG] Error saving tags:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi khi lưu tag: ${error.message}`, 4000);
        } else {
            alert(`Lỗi khi lưu tag:\n${error.message}`);
        }
    }
}

// =====================================================
// TABLE SEARCH & FILTERING
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

    // Normalize phone numbers (remove spaces, dots, dashes)
    const normalizePhone = (phone) => {
        if (!phone) return '';
        return phone.replace(/[\s\.\-]/g, '').trim();
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
            const baseOrder = { ...groupOrders[0] };

            // Collect all unique values
            const allCodes = [];
            const allNames = new Set();
            const allAddresses = new Set();
            const allNotes = [];
            const allSTTs = [];
            let totalAmount = 0;
            let totalQuantity = 0;
            const allIds = [];
            let earliestDate = baseOrder.DateCreated;

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

            // Create merged order
            const mergedOrder = {
                ...baseOrder,
                Code: allCodes.join(' + '),
                Name: Array.from(allNames).join(' / '),
                Address: Array.from(allAddresses).join(' | '),
                Note: allNotes.length > 0 ? allNotes.join(' | ') : baseOrder.Note,
                TotalAmount: totalAmount,
                TotalQuantity: totalQuantity,
                DateCreated: earliestDate,
                Id: allIds.join('_'), // Combine IDs for checkbox handling
                OriginalIds: allIds, // Store original IDs for reference
                MergedCount: groupOrders.length, // Track how many orders were merged
                SessionIndex: allSTTs.length > 1 ? allSTTs.join(' + ') : (groupOrders[0].SessionIndex || ''),
                AllSTTs: allSTTs // Store all STT for reference
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

    // Apply conversation status filter (Merged Messages & Comments)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    if (window.pancakeDataManager && conversationFilter !== 'all') {
        tempData = tempData.filter(order => {
            const msgUnread = window.pancakeDataManager.getMessageUnreadInfoForOrder(order);
            const cmmUnread = window.pancakeDataManager.getCommentUnreadInfoForOrder(order);

            const hasUnreadMessage = msgUnread.hasUnread;
            const hasUnreadComment = cmmUnread.hasUnread;

            if (conversationFilter === 'unread') {
                // Show if EITHER has unread
                return hasUnreadMessage || hasUnreadComment;
            } else if (conversationFilter === 'read') {
                // Show if BOTH are read (or no unread)
                // Note: We consider "read" as NOT having unread.
                return !hasUnreadMessage && !hasUnreadComment;
            }
            return true;
        });
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

    // Merge orders with duplicate phone numbers
    filteredData = mergeOrdersByPhone(filteredData);

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
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, date range: ${startDateLocal} to ${endDateLocal}, autoLoad=${autoLoad}`);
        } else {
            // Fallback: không có date filter - Tải 3000 đơn hàng
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true`;

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
            const match = campaignName.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
            return match ? match[1] : null;
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
    campaigns.forEach((campaign, index) => {
        const option = document.createElement("option");
        // Sử dụng index làm value vì campaignId giờ là array
        option.value = index;
        option.textContent = campaign.displayName;
        option.dataset.campaign = JSON.stringify(campaign);
        select.appendChild(option);
    });

    if (campaigns.length > 0) {
        // Select first campaign by default
        select.value = 0;

        // Manually update selectedCampaign state without triggering search
        const selectedOption = select.options[select.selectedIndex];
        selectedCampaign = selectedOption?.dataset.campaign
            ? JSON.parse(selectedOption.dataset.campaign)
            : null;

        if (autoLoad) {
            // 🎯 TỰ ĐỘNG TẢI DỮ LIỆU NGAY LẬP TỨC
            console.log('[AUTO-LOAD] Tự động tải dữ liệu chiến dịch:', campaigns[0].displayName);

            // Hiển thị thông báo đang tải
            if (window.notificationManager) {
                window.notificationManager.info(
                    `Đang tải dữ liệu chiến dịch: ${campaigns[0].displayName}`,
                    2000,
                    'Tự động tải'
                );
            }

            // Trigger search explicitly
            await handleSearch();

            // 🎯 AUTO-CONNECT REALTIME SERVER
            if (window.realtimeManager) {
                console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
                window.realtimeManager.connectServerMode();
            }
        } else {
            console.log('[MANUAL-SELECT] Đã chọn chiến dịch đầu tiên (chờ người dùng bấm Tải):', campaigns[0].displayName);
        }
    }
}

async function handleCampaignChange() {
    const select = document.getElementById("campaignFilter");
    const selectedOption = select.options[select.selectedIndex];
    selectedCampaign = selectedOption?.dataset.campaign
        ? JSON.parse(selectedOption.dataset.campaign)
        : null;

    // Tự động load dữ liệu khi chọn chiến dịch
    if (selectedCampaign?.campaignId || selectedCampaign?.campaignIds) {
        await handleSearch();

        // 🎯 AUTO-CONNECT REALTIME SERVER
        if (window.realtimeManager) {
            console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
            window.realtimeManager.connectServerMode();
        }
    }
}

async function handleSearch() {
    if (!selectedCampaign?.campaignId && !selectedCampaign?.campaignIds) {
        alert("Vui lòng chọn chiến dịch");
        return;
    }

    // Validate dates
    const startDateValue = document.getElementById("startDate").value;
    const endDateValue = document.getElementById("endDate").value;

    if (!startDateValue || !endDateValue) {
        alert("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        return;
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
    await fetchOrders();
}

// Progressive loading state
let isLoadingInBackground = false;
let loadingAborted = false;

async function fetchOrders() {
    try {
        showLoading(true);
        loadingAborted = false;

        const startDate = convertToUTC(
            document.getElementById("startDate").value,
        );
        const endDate = convertToUTC(document.getElementById("endDate").value);

        // Xử lý campaignId có thể là array (nhiều campaigns cùng ngày) hoặc single value
        const campaignIds = selectedCampaign.campaignIds || (Array.isArray(selectedCampaign.campaignId) ? selectedCampaign.campaignId : [selectedCampaign.campaignId]);

        // Tạo filter cho nhiều campaign IDs
        let campaignFilter;
        if (campaignIds.length === 1) {
            campaignFilter = `LiveCampaignId eq ${campaignIds[0]}`;
        } else {
            // Tạo filter dạng: (LiveCampaignId eq 123 or LiveCampaignId eq 456 or ...)
            const campaignConditions = campaignIds.map(id => `LiveCampaignId eq ${id}`).join(' or ');
            campaignFilter = `(${campaignConditions})`;
        }

        const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate}) and ${campaignFilter}`;
        console.log(`[FETCH] Fetching orders for ${campaignIds.length} campaign(s): ${campaignIds.join(', ')}`);

        const PAGE_SIZE = 1000; // API fetch size
        const UPDATE_EVERY = 200; // Update UI every 200 orders
        let skip = 0;
        let hasMore = true;
        allData = [];
        const headers = await window.tokenManager.getAuthHeader();

        // ===== PHASE 1: Load first batch and show immediately =====
        console.log('[PROGRESSIVE] Loading first batch...');
        const firstUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const firstResponse = await fetch(firstUrl, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!firstResponse.ok) throw new Error(`HTTP ${firstResponse.status}`);
        const firstData = await firstResponse.json();
        const firstOrders = firstData.value || [];
        totalCount = firstData["@odata.count"] || 0;

        allData = firstOrders;
        filteredData = allData.filter((order) => order && order.Id);
        displayedData = filteredData;

        // Show UI immediately with first batch
        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");

        renderTable();
        updatePageInfo();
        updateStats();
        updateSearchResultCount();
        showInfoBanner(
            `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
        );
        sendDataToTab2();

        // Load conversations and comment conversations for first batch
        console.log('[PROGRESSIVE] Loading conversations for first batch...');
        if (window.chatDataManager) {
            // Collect unique channel IDs from orders (parse from Facebook_PostId)
            const channelIds = [...new Set(
                allData
                    .map(order => window.chatDataManager.parseChannelId(order.Facebook_PostId))
                    .filter(id => id) // Remove null/undefined
            )];
            console.log('[PROGRESSIVE] Found channel IDs:', channelIds);

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

            renderTable(); // Re-render with chat data and unread info
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

        // Detect edited notes using Firebase snapshots (fast, no API spam!)
        detectEditedNotes().then(() => {
            // Re-render table with noteEdited flags
            renderTable();
            console.log('[NOTE-TRACKER] Table re-rendered with edit indicators');
        }).catch(err => console.error('[NOTE-TRACKER] Error detecting edited notes:', err));

        // Hide loading overlay after first batch
        showLoading(false);

        // ===== PHASE 2: Continue loading remaining orders in background =====
        hasMore = firstOrders.length === PAGE_SIZE;
        skip += PAGE_SIZE;

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
                            filteredData = allData.filter((order) => order && order.Id);
                            displayedData = filteredData;

                            // Update table every UPDATE_EVERY orders OR if this is the last batch
                            const shouldUpdate =
                                allData.length - lastUpdateCount >= UPDATE_EVERY ||
                                orders.length < PAGE_SIZE;

                            if (shouldUpdate) {
                                console.log(`[PROGRESSIVE] Updating table: ${allData.length}/${totalCount} orders`);
                                renderTable();
                                updatePageInfo();
                                updateStats();
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
                        console.log('[PROGRESSIVE] Background loading completed');
                        renderTable();
                        updatePageInfo();
                        updateStats();
                        updateSearchResultCount();
                        showInfoBanner(
                            `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
                        );
                        sendDataToTab2();
                    }

                } catch (error) {
                    console.error('[PROGRESSIVE] Background loading error:', error);
                } finally {
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

// =====================================================
// RENDERING & UI UPDATES
// =====================================================

// 🔄 CẬP NHẬT ORDER TRONG BẢNG SAU KHI SAVE
function updateOrderInTable(orderId, updatedOrderData) {
    console.log('[UPDATE] Updating order in table:', orderId);

    // Lọc bỏ các trường undefined để tránh ghi đè dữ liệu có sẵn (như Tags)
    const cleanedData = Object.keys(updatedOrderData).reduce((acc, key) => {
        if (updatedOrderData[key] !== undefined) {
            acc[key] = updatedOrderData[key];
        }
        return acc;
    }, {});

    // 1. Tìm và cập nhật trong allData
    const indexInAll = allData.findIndex(order => order.Id === orderId);
    if (indexInAll !== -1) {
        allData[indexInAll] = { ...allData[indexInAll], ...cleanedData };
        console.log('[UPDATE] Updated in allData at index:', indexInAll);
    }

    // 2. Tìm và cập nhật trong filteredData
    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered] = { ...filteredData[indexInFiltered], ...cleanedData };
        console.log('[UPDATE] Updated in filteredData at index:', indexInFiltered);
    }

    // 3. Tìm và cập nhật trong displayedData
    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed] = { ...displayedData[indexInDisplayed], ...cleanedData };
        console.log('[UPDATE] Updated in displayedData at index:', indexInDisplayed);
    }

    // 4. Re-render bảng để hiển thị thay đổi
    renderTable();

    // 5. Cập nhật stats (nếu tổng tiền thay đổi)
    updateStats();

    // 6. Highlight row vừa được cập nhật
    highlightUpdatedRow(orderId);

    console.log('[UPDATE] ✓ Table updated successfully');
}

// 🌟 HIGHLIGHT ROW VỪA CẬP NHẬT
function highlightUpdatedRow(orderId) {
    setTimeout(() => {
        // Tìm row trong bảng
        const rows = document.querySelectorAll('#tableBody tr');
        rows.forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.value === orderId) {
                // Thêm class highlight
                row.classList.add('product-row-highlight');

                // Scroll vào view (nếu cần)
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Remove highlight sau 2 giây
                setTimeout(() => {
                    row.classList.remove('product-row-highlight');
                }, 2000);
            }
        });
    }, 100);
}

function renderTable() {
    const tbody = document.getElementById("tableBody");
    if (displayedData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="13" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }
    tbody.innerHTML = displayedData.map(createRowHTML).join("");

    // Apply column visibility after rendering
    if (window.columnVisibility) {
        window.columnVisibility.initialize();
    }
}

function createRowHTML(order) {
    if (!order || !order.Id) return "";
    let tagsCount = 0;
    let tagsHTML = "";
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                tagsCount = tags.length;
                tagsHTML = parseOrderTags(order.Tags);
            }
        } catch (e) { }
    }
    const partnerStatusHTML = formatPartnerStatus(order.PartnerStatusText);
    const highlight = (text) => highlightSearchText(text || "", searchQuery);

    // Get messages and comments columns
    const messagesHTML = renderMessagesColumn(order);
    const commentsHTML = renderCommentsColumn(order);

    // Add watermark class for edited notes
    const rowClass = order.noteEdited ? 'note-edited' : '';

    // Check for merged orders
    const isMerged = order.MergedCount && order.MergedCount > 1;
    const mergedClass = isMerged ? 'merged-order-row' : '';
    const mergedIcon = isMerged ? '<i class="fas fa-link merged-icon" title="Đơn gộp"></i>' : '';

    return `
        <tr class="${rowClass} ${mergedClass}">
            <td><input type="checkbox" value="${order.Id}" /></td>
            <td data-column="stt">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${order.SessionIndex || ""}</span>
                    ${mergedIcon}
                    ${order.noteEdited ? '<span class="note-edited-badge">✏️ ĐÃ SỬA</span>' : ''}
                    <button class="btn-edit-icon" onclick="openEditModal('${order.Id}')" title="Chỉnh sửa đơn hàng"><i class="fas fa-edit"></i></button>
                </div>
            </td>
            <td data-column="order-code" style="max-width: 120px; white-space: normal;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span>${highlight(order.Code)}</span>
                    <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}')" title="Quản lý tag" style="padding: 2px 6px;">
                        <i class="fas fa-tags"></i>
                        ${tagsCount > 0 ? `<span class="tag-count">${tagsCount}</span>` : ""}
                    </button>
                </div>
                ${tagsHTML}
            </td>
            <td data-column="customer"><div>${highlight(order.Name)}</div>${partnerStatusHTML}</td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="phone" style="max-width: 100px; white-space: normal;">${highlight(order.Telephone)}</td>
            <td data-column="address" style="max-width: 500px; white-space: normal;">${highlight(order.Address)}</td>
            <td data-column="notes" style="max-width: 200px; white-space: normal;">${highlight(order.Note)}</td>
            <td data-column="total">${(order.TotalAmount || 0).toLocaleString("vi-VN")}đ</td>
            <td data-column="quantity">${order.TotalQuantity || 0}</td>
            <td data-column="created-date">${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td data-column="status"><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}">${highlight(order.StatusText || order.Status)}</span></td>
            <td></td>
        </tr>`;
}

// Render messages column only (not comments)
function renderMessagesColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Get chat info for order
    const orderChatInfo = window.chatDataManager.getChatInfoForOrder(order);

    // Debug log first few orders
    if (order.SessionIndex && order.SessionIndex <= 3) {
        console.log(`[CHAT RENDER] Order ${order.Code}:`, {
            Facebook_ASUserId: order.Facebook_ASUserId,
            Facebook_PostId: order.Facebook_PostId,
            channelId: orderChatInfo.channelId,
            psid: orderChatInfo.psid,
            hasChat: orderChatInfo.hasChat
        });
    }

    // If no PSID or Channel ID, show dash
    if (!orderChatInfo.psid || !orderChatInfo.channelId) {
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    const messageInfo = window.chatDataManager.getLastMessageForOrder(order);
    const channelId = orderChatInfo.channelId;
    const psid = orderChatInfo.psid;

    // If no message, show dash
    if (!messageInfo.message && !messageInfo.hasUnread) {
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Render with message data
    return renderChatColumnWithData(order, messageInfo, channelId, psid, 'messages');
}

// Render comments column only (not messages)
function renderCommentsColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Get chat info for order
    const orderChatInfo = window.chatDataManager.getChatInfoForOrder(order);

    // If no PSID or Channel ID, show dash
    if (!orderChatInfo.psid || !orderChatInfo.channelId) {
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    const commentInfo = window.chatDataManager.getLastCommentForOrder(orderChatInfo.channelId, orderChatInfo.psid, order);
    const channelId = orderChatInfo.channelId;
    const psid = orderChatInfo.psid;

    // If no comment, show dash
    if (!commentInfo.message) {
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Render with comment data
    return renderChatColumnWithData(order, commentInfo, channelId, psid, 'comments');
}

// Helper function to render chat column with data (for both messages and comments)
// Helper function to render chat column with data (for both messages and comments)
function renderChatColumnWithData(order, chatInfo, channelId, psid, columnType = 'messages') {
    // Format message based on type
    let displayMessage = 'Emoji hoặc ảnh';
    let messageIcon = '';

    if (chatInfo.attachments && chatInfo.attachments.length > 0) {
        // Has attachments (images, files, etc.)
        const attachment = chatInfo.attachments[0];
        if (attachment.Type === 'image' || attachment.Type === 'photo') {
            displayMessage = 'Đã gửi ảnh';
            messageIcon = '📷';
        } else if (attachment.Type === 'video') {
            displayMessage = 'Đã gửi video';
            messageIcon = '🎥';
        } else if (attachment.Type === 'file') {
            displayMessage = 'Đã gửi file';
            messageIcon = '📎';
        } else if (attachment.Type === 'audio') {
            displayMessage = 'Đã gửi audio';
            messageIcon = '🎵';
        } else {
            displayMessage = 'Đã gửi tệp';
            messageIcon = '📎';
        }
    } else if (chatInfo.message) {
        // Text message
        displayMessage = chatInfo.message;
    }

    // Truncate message
    if (displayMessage.length > 30) {
        displayMessage = displayMessage.substring(0, 30) + '...';
    }

    // Styling based on unread status
    const isUnread = chatInfo.hasUnread;
    const fontWeight = isUnread ? '700' : '400';
    const color = isUnread ? '#111827' : '#6b7280';
    const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';

    // Click handler
    const clickHandler = columnType === 'messages'
        ? `openChatModal('${order.Id}', '${channelId}', '${psid}')`
        : `openChatModal('${order.Id}', '${channelId}', '${psid}', 'comment')`;

    const tooltipText = columnType === 'comments'
        ? 'Click để xem bình luận'
        : 'Click để xem toàn bộ tin nhắn';

    return `
        <td data-column="${columnType}" onclick="${clickHandler}" style="cursor: pointer;" title="${tooltipText}">
            <div style="display: flex; align-items: center; gap: 6px;">
                ${unreadBadge}
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${messageIcon} ${displayMessage}
                    </span>
                    ${chatInfo.unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${chatInfo.unreadCount} tin mới</span>` : ''}
                </div>
            </div>
        </td>`;
}

function parseOrderTags(tagsJson) {
    try {
        const tags = JSON.parse(tagsJson);
        if (!Array.isArray(tags) || tags.length === 0) return "";
        return tags
            .map(
                (tag) =>
                    `<span class="order-tag" style="background-color: ${tag.Color || "#6b7280"};">${tag.Name || ""}</span>`,
            )
            .join(" ");
    } catch (e) {
        return "";
    }
}

function formatPartnerStatus(statusText) {
    if (!statusText) return "";
    const statusColors = {
        "Bình thường": "#5cb85c",
        "Bom hàng": "#d1332e",
        "Cảnh báo": "#f0ad4e",
        "Khách sỉ": "#5cb85c",
        "Nguy hiểm": "#d9534f",
        "Thân thiết": "#5bc0de",
        Vip: "#337ab7",
        VIP: "#5bc0deff",
    };
    const color = statusColors[statusText] || "#6b7280";
    return `<span class="partner-status" style="background-color: ${color};">${statusText}</span>`;
}

function updateStats() {
    const totalAmount = displayedData.reduce(
        (sum, order) => sum + (order.TotalAmount || 0),
        0,
    );
    document.getElementById("totalOrdersCount").textContent =
        filteredData.length.toLocaleString("vi-VN");
    document.getElementById("displayedOrdersCount").textContent =
        displayedData.length.toLocaleString("vi-VN");
    document.getElementById("totalAmountSum").textContent =
        totalAmount.toLocaleString("vi-VN") + "đ";
    document.getElementById("loadingProgress").textContent = "100%";
}

function updatePageInfo() {
    const totalDisplayed = displayedData.length;
    const totalFiltered = filteredData.length;
    document.getElementById("pageInfo").textContent =
        `Hiển thị ${totalDisplayed.toLocaleString("vi-VN")} / ${totalFiltered.toLocaleString("vi-VN")}`;
    document.getElementById("scrollHint").textContent =
        totalDisplayed > 0 ? "✅ Đã hiển thị tất cả" : "";
}

// =====================================================
// EVENT HANDLERS & HELPERS
// =====================================================
function sendDataToTab2() {
    const filterData = {
        startDate: convertToUTC(document.getElementById("startDate").value),
        endDate: convertToUTC(document.getElementById("endDate").value),
        campaignId: selectedCampaign?.campaignId || null,
        campaignName: selectedCampaign?.displayName || "",
        data: allData,
        totalRecords: allData.length,
        timestamp: new Date().toISOString(),
    };
    if (window.parent)
        window.parent.postMessage(
            { type: "FILTER_CHANGED", filter: filterData },
            "*",
        );
    localStorage.setItem("tab1_filter_data", JSON.stringify(filterData));
}

// =====================================================
// HELPER: CHECK IF ORDER SHOULD BE SELECTABLE
// =====================================================
function isOrderSelectable(orderId) {
    // Tìm order trong data
    const order = allData.find(o => o.Id === orderId);
    if (!order) return true; // Nếu không tìm thấy, cho phép select

    // Kiểm tra số lượng = 0
    if (order.TotalQuantity === 0) {
        console.log(`[SELECT] Skipping order ${order.Code}: TotalQuantity = 0`);
        return false;
    }

    // Kiểm tra tag "GIỎ TRỐNG"
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                const hasEmptyCartTag = tags.some(tag =>
                    tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
                );
                if (hasEmptyCartTag) {
                    console.log(`[SELECT] Skipping order ${order.Code}: Has "GIỎ TRỐNG" tag`);
                    return false;
                }
            }
        } catch (e) {
            // Nếu parse lỗi, cho phép select
        }
    }

    return true;
}

function handleSelectAll() {
    const checkboxes = document.querySelectorAll(
        '#tableBody input[type="checkbox"]',
    );
    const isChecked = document.getElementById("selectAll").checked;

    // Check/uncheck TẤT CẢ checkbox
    checkboxes.forEach((cb) => {
        cb.checked = isChecked;
    });

    // Trigger update action buttons
    updateActionButtons();
}

// =====================================================
// UPDATE ACTION BUTTONS VISIBILITY
// =====================================================
function updateActionButtons() {
    const actionButtonsSection = document.getElementById('actionButtonsSection');
    const selectedCountSpan = document.getElementById('selectedOrdersCount');
    const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

    if (checkedCount > 0) {
        actionButtonsSection.style.display = 'flex';
        selectedCountSpan.textContent = checkedCount;
    } else {
        actionButtonsSection.style.display = 'none';
    }
}

function handleClearCache() {
    if (confirm("Bạn có chắc muốn xóa toàn bộ cache?")) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
        alert("Đã xóa cache");
        location.reload();
    }
}

function showLoading(show) {
    document.getElementById("loadingOverlay").classList.toggle("show", show);
}

function showInfoBanner(text) {
    const banner = document.getElementById("infoBanner");
    document.getElementById("infoText").textContent = text;
    banner.style.display = "flex";
    setTimeout(() => (banner.style.display = "none"), 5000);
}

function showSaveIndicator(type, message) {
    const indicator = document.getElementById("saveIndicator");
    const text = document.getElementById("saveIndicatorText");
    const icon = indicator.querySelector("i");
    indicator.className = "save-indicator " + type;
    text.textContent = message;
    icon.className =
        type === "success"
            ? "fas fa-check-circle"
            : "fas fa-exclamation-circle";
    indicator.classList.add("show");
    setTimeout(() => indicator.classList.remove("show"), 3000);
}

// ===============================================
// EDIT ORDER MODAL
// ===============================================
(function initEditModal() {
    if (document.getElementById("editOrderModal")) return;
    const modalHTML = `
        <div id="editOrderModal" class="edit-modal">
            <div class="edit-modal-content">
                <div class="edit-modal-header">
                    <h3><i class="fas fa-edit"></i> Sửa đơn hàng <span class="order-code" id="modalOrderCode">...</span></h3>
                    <button class="edit-modal-close" onclick="closeEditModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="edit-tabs">
                    <button class="edit-tab-btn active" onclick="switchEditTab('info')"><i class="fas fa-user"></i> Thông tin liên hệ</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('products')"><i class="fas fa-box"></i> Sản phẩm (<span id="productCount">0</span>)</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('delivery')"><i class="fas fa-shipping-fast"></i> Thông tin giao hàng</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('live')"><i class="fas fa-video"></i> Lịch sử đơn live</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoices')"><i class="fas fa-file-invoice"></i> Lịch sử hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('history')"><i class="fas fa-history"></i> Lịch sử chỉnh sửa</button>
                </div>
                <div class="edit-modal-body" id="editModalBody"><div class="loading-state"><div class="loading-spinner"></div></div></div>
                <div class="edit-modal-footer">
                    <div class="modal-footer-left"><i class="fas fa-info-circle"></i> Cập nhật lần cuối: <span id="lastUpdated">...</span></div>
                    <div class="modal-footer-right">
                        <button class="btn-modal btn-modal-print" onclick="printOrder()"><i class="fas fa-print"></i> In đơn</button>
                        <button class="btn-modal btn-modal-cancel" onclick="closeEditModal()"><i class="fas fa-times"></i> Đóng</button>
                        <button class="btn-modal btn-modal-save" onclick="saveAllOrderChanges()"><i class="fas fa-save"></i> Lưu tất cả thay đổi</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
})();

async function openEditModal(orderId) {
    currentEditOrderId = orderId;
    const modal = document.getElementById("editOrderModal");
    modal.classList.add("show");
    switchEditTab("info");
    document.getElementById("editModalBody").innerHTML =
        `<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Đang tải dữ liệu đơn hàng...</div></div>`;
    try {
        // Check if this is a merged order
        const order = allData.find(o => o.Id === orderId);
        if (order && order.OriginalIds && order.OriginalIds.length > 1) {
            // Merged order - fetch all original orders
            await fetchMergedOrderData(order);
        } else {
            // Single order
            await fetchOrderData(orderId);
        }
    } catch (error) {
        showErrorState(error.message);
    }
}

async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    currentEditOrderData = await response.json();
    updateModalWithData(currentEditOrderData);
}

async function fetchMergedOrderData(mergedOrder) {
    const headers = await window.tokenManager.getAuthHeader();

    // Fetch all original orders in parallel
    const fetchPromises = mergedOrder.OriginalIds.map(async (orderId) => {
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return await response.json();
    });

    const allOrders = await Promise.all(fetchPromises);

    // Find order with largest STT to use as base (products will move from smaller STT to larger STT)
    let baseOrder = allOrders[0];
    for (let i = 1; i < allOrders.length; i++) {
        const currentOrder = allOrders[i];
        const currentSTT = allData.find(o => o.Id === currentOrder.Id)?.SessionIndex;
        const baseSTT = allData.find(o => o.Id === baseOrder.Id)?.SessionIndex;

        if (currentSTT && baseSTT && parseInt(currentSTT) > parseInt(baseSTT)) {
            baseOrder = currentOrder;
        }
    }

    // Merge all orders data
    const mergedDetails = [];
    const allCodes = [];
    let totalAmount = 0;
    let totalQuantity = 0;
    let latestUpdate = baseOrder.LastUpdated;

    allOrders.forEach(order => {
        // Collect all products/details
        if (order.Details && Array.isArray(order.Details)) {
            mergedDetails.push(...order.Details);
        }

        // Collect order codes
        allCodes.push(order.Code);

        // Sum totals
        totalAmount += (order.TotalAmount || 0);
        totalQuantity += (order.TotalQuantity || 0);

        // Keep latest update time
        if (new Date(order.LastUpdated) > new Date(latestUpdate)) {
            latestUpdate = order.LastUpdated;
        }
    });

    // Create merged order data
    currentEditOrderData = {
        ...baseOrder,
        Code: allCodes.join(' + '),
        Details: mergedDetails,
        TotalAmount: totalAmount,
        TotalQuantity: totalQuantity,
        LastUpdated: latestUpdate,
        IsMerged: true,
        MergedOrdersData: allOrders // Keep all original orders for reference
    };

    updateModalWithData(currentEditOrderData);
}

function updateModalWithData(data) {
    document.getElementById("modalOrderCode").textContent = data.Code || "";
    document.getElementById("lastUpdated").textContent = new Date(
        data.LastUpdated,
    ).toLocaleString("vi-VN");
    document.getElementById("productCount").textContent =
        data.Details?.length || 0;
    switchEditTab("info");

    // 🔄 Refresh inline search UI after data is loaded
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        refreshInlineSearchUI();
    }, 100);
}

function switchEditTab(tabName) {
    document
        .querySelectorAll(".edit-tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeTab = document.querySelector(
        `.edit-tab-btn[onclick*="${tabName}"]`,
    );
    if (activeTab) activeTab.classList.add("active");
    renderTabContent(tabName);
    if (tabName === "products") initInlineSearchAfterRender();
}

function renderTabContent(tabName) {
    const body = document.getElementById("editModalBody");
    if (!currentEditOrderData) {
        body.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div></div>`;
        return;
    }
    const renderers = {
        info: renderInfoTab,
        products: renderProductsTab,
        delivery: renderDeliveryTab,
        live: renderLiveTab,
        invoices: renderInvoicesTab,
        history: renderHistoryTab,
    };
    body.innerHTML = renderers[tabName]
        ? renderers[tabName](currentEditOrderData)
        : `<div class="empty-state"><p>Tab không tồn tại</p></div>`;
}

function renderInfoTab(data) {
    return `
        <div class="info-card">
            <h4><i class="fas fa-user"></i> Thông tin khách hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Tên khách hàng</div><div class="info-value highlight">${data.Name || ""}</div></div>
                <div class="info-field"><div class="info-label">Điện thoại</div><div class="info-value highlight"><i class="fas fa-phone"></i> ${data.Telephone || ""}</div></div>
                <div class="info-field" style="grid-column: 1 / -1;"><div class="info-label">Địa chỉ đầy đủ</div><div class="info-value">${data.Address || ""}</div></div>
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-shopping-cart"></i> Thông tin đơn hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Mã đơn</div><div class="info-value highlight">${data.Code || ""}</div></div>
                <div class="info-field"><div class="info-label">Trạng thái</div><div class="info-value"><span class="status-badge-large ${data.Status === "Draft" ? "status-badge-draft" : "status-badge-order"}">${data.StatusText || data.Status || ""}</span></div></div>
                <div class="info-field"><div class="info-label">Tổng tiền</div><div class="info-value highlight">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</div></div>
            </div>
        </div>`;
}

function renderProductsTab(data) {
    const inlineSearchHTML = `
        <div class="product-search-inline">
            <div class="search-input-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="inlineProductSearch" class="inline-search-input" placeholder="Tìm sản phẩm theo tên hoặc mã..." autocomplete="off">
            </div>
            <div id="inlineSearchResults" class="inline-search-results"></div>
        </div>`;

    if (!data.Details || data.Details.length === 0) {
        return `<div class="info-card">${inlineSearchHTML}<div class="empty-state"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm</p></div></div>`;
    }

    const productsHTML = data.Details.map(
        (p, i) => `
        <tr class="product-row" data-index="${i}">
            <td>${i + 1}</td>
            <td>${p.ImageUrl ? `<img src="${p.ImageUrl}" class="product-image">` : ""}</td>
            <td><div>${p.ProductNameGet || p.ProductName}</div><div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || "N/A"}</div></td>
            <td style="text-align: center;"><div class="quantity-controls"><button onclick="updateProductQuantity(${i}, -1)" class="qty-btn"><i class="fas fa-minus"></i></button><input type="number" class="quantity-input" value="${p.Quantity || 1}" onchange="updateProductQuantity(${i}, 0, this.value)" min="1"><button onclick="updateProductQuantity(${i}, 1)" class="qty-btn"><i class="fas fa-plus"></i></button></div></td>
            <td style="text-align: right;">${(p.Price || 0).toLocaleString("vi-VN")}đ</td>
            <td style="text-align: right; font-weight: 600;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString("vi-VN")}đ</td>
            <td><input type="text" class="note-input" value="${p.Note || ""}" onchange="updateProductNote(${i}, this.value)"></td>
            <td style="text-align: center;"><div class="action-buttons"><button onclick="editProductDetail(${i})" class="btn-product-action btn-edit-item" title="Sửa"><i class="fas fa-edit"></i></button><button onclick="removeProduct(${i})" class="btn-product-action btn-delete-item" title="Xóa"><i class="fas fa-trash"></i></button></div></td>
        </tr>`,
    ).join("");

    return `
        <div class="info-card">
            ${inlineSearchHTML}
            <h4 style="margin-top: 24px;"><i class="fas fa-box"></i> Danh sách sản phẩm (${data.Details.length})</h4>
            <table class="products-table">
                <thead><tr><th>#</th><th>Ảnh</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th style="text-align: right;">Đơn giá</th><th style="text-align: right;">Thành tiền</th><th>Ghi chú</th><th style="text-align: center;">Thao tác</th></tr></thead>
                <tbody id="productsTableBody">${productsHTML}</tbody>
                <tfoot style="background: #f9fafb; font-weight: 600;"><tr><td colspan="3" style="text-align: right;">Tổng cộng:</td><td style="text-align: center;" id="totalQuantity">${data.TotalQuantity || 0}</td><td></td><td style="text-align: right; color: #3b82f6;" id="totalAmount">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</td><td colspan="2"></td></tr></tfoot>
            </table>
        </div>`;
}

function renderDeliveryTab(data) {
    return `<div class="empty-state"><p>Thông tin giao hàng</p></div>`;
}
function renderLiveTab(data) {
    // Display live stream information if available
    const liveInfo = data.CRMTeam || {};
    const hasLiveInfo = liveInfo && liveInfo.Name;

    if (!hasLiveInfo) {
        return `
            <div class="empty-state">
                <i class="fas fa-video" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có thông tin chiến dịch live</p>
                <p style="color: #9ca3af; font-size: 13px;">Đơn hàng này chưa được liên kết với chiến dịch live nào</p>
            </div>
        `;
    }

    return `
        <div class="info-card">
            <h4><i class="fas fa-video"></i> Thông tin Livestream</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Tên chiến dịch</div>
                    <div class="info-value highlight">${liveInfo.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Mã chiến dịch</div>
                    <div class="info-value">${liveInfo.Code || 'N/A'}</div>
                </div>
                ${liveInfo.Description ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Mô tả</div>
                    <div class="info-value">${liveInfo.Description}</div>
                </div>
                ` : ''}
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-info-circle"></i> Thông tin bổ sung</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Người phụ trách</div>
                    <div class="info-value">${data.User?.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Thời gian tạo đơn</div>
                    <div class="info-value">${data.CreatedDate ? new Date(data.CreatedDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
            </div>
        </div>
    `;
}
function renderInvoicesTab(data) {
    // Display invoice/payment information
    const hasInvoice = data.InvoiceNumber || data.InvoiceDate;

    return `
        <div class="info-card">
            <h4><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn & thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Số hóa đơn</div>
                    <div class="info-value highlight">${data.InvoiceNumber || 'Chưa xuất hóa đơn'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Ngày xuất hóa đơn</div>
                    <div class="info-value">${data.InvoiceDate ? new Date(data.InvoiceDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Tổng tiền</div>
                    <div class="info-value highlight" style="color: #059669; font-weight: 700;">
                        ${(data.TotalAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Đã thanh toán</div>
                    <div class="info-value" style="color: ${data.PaidAmount > 0 ? '#059669' : '#6b7280'};">
                        ${(data.PaidAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Còn lại</div>
                    <div class="info-value" style="color: ${(data.TotalAmount - (data.PaidAmount || 0)) > 0 ? '#ef4444' : '#059669'};">
                        ${((data.TotalAmount || 0) - (data.PaidAmount || 0)).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Trạng thái thanh toán</div>
                    <div class="info-value">
                        <span class="status-badge-large ${data.PaidAmount >= data.TotalAmount ? 'status-badge-paid' :
            data.PaidAmount > 0 ? 'status-badge-partial' : 'status-badge-unpaid'
        }">
                            ${data.PaidAmount >= data.TotalAmount ? 'Đã thanh toán' :
            data.PaidAmount > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán'
        }
                        </span>
                    </div>
                </div>
            </div>
        </div>
        
        ${data.PaymentMethod ? `
        <div class="info-card">
            <h4><i class="fas fa-credit-card"></i> Phương thức thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Phương thức</div>
                    <div class="info-value">${data.PaymentMethod}</div>
                </div>
                ${data.PaymentNote ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú thanh toán</div>
                    <div class="info-value">${data.PaymentNote}</div>
                </div>
                ` : ''}
            </div>
        </div>
        ` : ''}
        
        ${!hasInvoice ? `
        <div class="empty-state">
            <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
            <p style="color: #9ca3af; font-size: 13px;">Đơn hàng chưa có hóa đơn chi tiết</p>
        </div>
        ` : ''}
    `;
}
async function renderHistoryTab(data) {
    // Show loading state initially
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử chỉnh sửa...</div>
        </div>
    `;

    // Return loading first, then fetch data
    setTimeout(async () => {
        try {
            await fetchAndDisplayAuditLog(data.Id);
        } catch (error) {
            console.error('[AUDIT LOG] Error fetching audit log:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử chỉnh sửa</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

async function fetchAndDisplayAuditLog(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=SaleOnline_Order&entityId=${orderId}&skip=0&take=50`;

    console.log('[AUDIT LOG] Fetching audit log for order:', orderId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const auditData = await response.json();
    console.log('[AUDIT LOG] Received audit log:', auditData);

    // Display the audit log
    document.getElementById('editModalBody').innerHTML = renderAuditLogTimeline(auditData.value || []);
}

function renderAuditLogTimeline(auditLogs) {
    if (auditLogs.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-history" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Chưa có lịch sử chỉnh sửa</p>
                <p style="color: #9ca3af; font-size: 13px;">Các thay đổi trên đơn hàng sẽ được ghi lại tại đây</p>
            </div>
        `;
    }

    // Map action to icon and color
    const actionConfig = {
        'CREATE': { icon: 'plus-circle', color: '#3b82f6', label: 'Tạo mới' },
        'UPDATE': { icon: 'edit', color: '#8b5cf6', label: 'Cập nhật' },
        'DELETE': { icon: 'trash', color: '#ef4444', label: 'Xóa' },
        'APPROVE': { icon: 'check-circle', color: '#10b981', label: 'Phê duyệt' },
        'REJECT': { icon: 'x-circle', color: '#ef4444', label: 'Từ chối' }
    };

    return `
        <div class="history-timeline">
            <div class="timeline-header">
                <h4><i class="fas fa-history"></i> Lịch sử thay đổi</h4>
                <span class="timeline-count">${auditLogs.length} thay đổi</span>
            </div>
            <div class="timeline-content">
                ${auditLogs.map((log, index) => {
        const config = actionConfig[log.Action] || { icon: 'circle', color: '#6b7280', label: log.Action };
        const date = new Date(log.DateCreated);
        const description = formatAuditDescription(log.Description);

        return `
                        <div class="timeline-item ${index === 0 ? 'timeline-item-latest' : ''}">
                            <div class="timeline-marker" style="background: ${config.color};">
                                <i class="fas fa-${config.icon}"></i>
                            </div>
                            <div class="timeline-card">
                                <div class="timeline-card-header">
                                    <div>
                                        <div class="timeline-action">
                                            <span class="action-badge" style="background: ${config.color};">${config.label}</span>
                                            ${log.Code ? `<span class="action-code">${log.Code}</span>` : ''}
                                        </div>
                                        <div class="timeline-user">
                                            <i class="fas fa-user"></i> ${log.UserName || 'Hệ thống'}
                                        </div>
                                    </div>
                                    <div class="timeline-date">
                                        <i class="fas fa-clock"></i>
                                        ${date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}
                                    </div>
                                </div>
                                ${description ? `
                                <div class="timeline-details">
                                    ${description}
                                </div>
                                ` : ''}
                                ${log.TransactionId ? `
                                <div class="timeline-meta">
                                    <i class="fas fa-fingerprint"></i>
                                    <span style="font-family: monospace; font-size: 11px; color: #9ca3af;">
                                        ${log.TransactionId.substring(0, 8)}...
                                    </span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
        
        <div class="audit-summary">
            <h4><i class="fas fa-chart-bar"></i> Thống kê</h4>
            <div class="audit-stats">
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${auditLogs.length}</div>
                    <div class="audit-stat-label">Tổng thay đổi</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${[...new Set(auditLogs.map(l => l.UserName))].length}</div>
                    <div class="audit-stat-label">Người chỉnh sửa</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">
                        ${auditLogs.length > 0 ? new Date(auditLogs[0].DateCreated).toLocaleDateString('vi-VN') : 'N/A'}
                    </div>
                    <div class="audit-stat-label">Cập nhật cuối</div>
                </div>
            </div>
        </div>
    `;
}

function formatAuditDescription(description) {
    if (!description) return '';

    // Replace \r\n with <br> and format the text
    let formatted = description
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>');

    // Highlight changes with arrows (=>)
    formatted = formatted.replace(/(\d+(?:,\d+)*(?:\.\d+)?)\s*=>\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
        '<span class="change-from">$1</span> <i class="fas fa-arrow-right" style="color: #6b7280; font-size: 10px;"></i> <span class="change-to">$2</span>');

    // Highlight product codes and names (e.g., "0610 A3 ÁO TN HT")
    formatted = formatted.replace(/(\d{4}\s+[A-Z0-9]+\s+[^:]+):/g,
        '<strong style="color: #3b82f6;">$1</strong>:');

    // Highlight "Thêm chi tiết"
    formatted = formatted.replace(/Thêm chi tiết/g,
        '<span style="color: #10b981; font-weight: 600;"><i class="fas fa-plus-circle"></i> Thêm chi tiết</span>');

    // Highlight "Xóa chi tiết"  
    formatted = formatted.replace(/Xóa chi tiết/g,
        '<span style="color: #ef4444; font-weight: 600;"><i class="fas fa-minus-circle"></i> Xóa chi tiết</span>');

    return formatted;
}

function showErrorState(message) {
    document.getElementById("editModalBody").innerHTML =
        `<div class="empty-state" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i><p>Lỗi: ${message}</p><button class="btn-primary" onclick="fetchOrderData('${currentEditOrderId}')">Thử lại</button></div>`;
}

function closeEditModal() {
    document.getElementById("editOrderModal").classList.remove("show");
    currentEditOrderData = null;
    currentEditOrderId = null;
}

function printOrder() {
    window.print();
}

// =====================================================
// IN-MODAL PRODUCT EDITING (NEW FUNCTIONS)
// =====================================================
function updateProductQuantity(index, change, value = null) {
    const product = currentEditOrderData.Details[index];
    let newQty =
        value !== null ? parseInt(value, 10) : (product.Quantity || 0) + change;
    if (newQty < 1) newQty = 1;
    product.Quantity = newQty;

    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    if (row) {
        row.querySelector(".quantity-input").value = newQty;
        row.querySelector("td:nth-child(6)").textContent =
            (newQty * (product.Price || 0)).toLocaleString("vi-VN") + "đ";
    }
    recalculateTotals();
    showSaveIndicator("success", "Số lượng đã cập nhật");

    // 🔄 Refresh inline search UI to reflect quantity change
    refreshInlineSearchUI();
}

function updateProductNote(index, note) {
    currentEditOrderData.Details[index].Note = note;
    showSaveIndicator("success", "Ghi chú đã cập nhật");
}

function removeProduct(index) {
    const product = currentEditOrderData.Details[index];
    if (
        !confirm(
            `Xóa sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
        )
    )
        return;

    // Remove product from array
    currentEditOrderData.Details.splice(index, 1);

    // Recalculate totals BEFORE re-rendering
    recalculateTotals();

    // Re-render products tab with updated data
    switchEditTab("products");

    showSaveIndicator("success", "Đã xóa sản phẩm");

    // 🔄 Refresh inline search UI to remove green highlight and badge
    refreshInlineSearchUI();
}

function editProductDetail(index) {
    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    const product = currentEditOrderData.Details[index];
    const priceCell = row.querySelector("td:nth-child(5)");
    const actionCell = row.querySelector("td:nth-child(8) .action-buttons");
    priceCell.innerHTML = `<input type="number" class="edit-input" id="price-edit-${index}" value="${product.Price || 0}">`;
    actionCell.innerHTML = `
        <button onclick="saveProductDetail(${index})" class="btn-product-action btn-save-item" title="Lưu"><i class="fas fa-check"></i></button>
        <button onclick="cancelProductDetail(${index})" class="btn-product-action btn-cancel-item" title="Hủy"><i class="fas fa-times"></i></button>`;
    document.getElementById(`price-edit-${index}`).focus();
}

function saveProductDetail(index) {
    const product = currentEditOrderData.Details[index];
    const newPrice = parseInt(document.getElementById(`price-edit-${index}`).value, 10) || 0;

    // Update price
    product.Price = newPrice;

    // Recalculate totals BEFORE re-rendering
    recalculateTotals();

    // Re-render products tab with updated data
    switchEditTab("products");

    showSaveIndicator("success", "Giá đã cập nhật");

    // 🔄 Refresh inline search UI (in case price affects display)
    refreshInlineSearchUI();
}

function cancelProductDetail() {
    switchEditTab("products");
}

function recalculateTotals() {
    let totalQty = 0;
    let totalAmount = 0;
    currentEditOrderData.Details.forEach((p) => {
        totalQty += p.Quantity || 0;
        totalAmount += (p.Quantity || 0) * (p.Price || 0);
    });
    currentEditOrderData.TotalQuantity = totalQty;
    currentEditOrderData.TotalAmount = totalAmount;

    // Update DOM elements if they exist (may not exist if tab is not rendered yet)
    const totalQuantityEl = document.getElementById("totalQuantity");
    const totalAmountEl = document.getElementById("totalAmount");
    const productCountEl = document.getElementById("productCount");

    if (totalQuantityEl) {
        totalQuantityEl.textContent = totalQty;
    }
    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString("vi-VN") + "đ";
    }
    if (productCountEl) {
        productCountEl.textContent = currentEditOrderData.Details.length;
    }
}

async function saveAllOrderChanges() {
    if (!confirm("Lưu tất cả thay đổi cho đơn hàng này?")) return;

    let notifId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notifId = window.notificationManager.saving("Đang lưu đơn hàng...");
        }

        // Prepare payload
        const payload = prepareOrderPayload(currentEditOrderData);

        // Validate payload (optional but recommended)
        const validation = validatePayloadBeforePUT(payload);
        if (!validation.valid) {
            throw new Error(
                `Payload validation failed: ${validation.errors.join(", ")}`,
            );
        }

        console.log("[SAVE] Payload to send:", payload);
        console.log(
            "[SAVE] Payload size:",
            JSON.stringify(payload).length,
            "bytes",
        );

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // PUT request
        const response = await API_CONFIG.smartFetch(
            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentEditOrderId})`,
            {
                method: "PUT",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[SAVE] Error response:", errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Success
        if (window.notificationManager && notifId) {
            window.notificationManager.remove(notifId);
            window.notificationManager.success("Đã lưu thành công!", 2000);
        }

        // Clear cache và reload data từ API
        window.cacheManager.clear("orders");

        // 🔒 Preserve Tags từ dữ liệu cũ trước khi fetch
        const existingOrder = allData.find(order => order.Id === currentEditOrderId);
        const preservedTags = existingOrder ? existingOrder.Tags : null;

        await fetchOrderData(currentEditOrderId);

        // 🔄 Restore Tags nếu API không trả về
        if (currentEditOrderData && !currentEditOrderData.Tags && preservedTags) {
            currentEditOrderData.Tags = preservedTags;
        }

        // 🔄 CẬP NHẬT BẢNG CHÍNH VỚI DỮ LIỆU MỚI
        updateOrderInTable(currentEditOrderId, currentEditOrderData);

        // 🔄 Refresh inline search UI after save and reload
        refreshInlineSearchUI();

        console.log("[SAVE] Order saved successfully ✓");
    } catch (error) {
        console.error("[SAVE] Error:", error);

        if (window.notificationManager) {
            if (notifId) {
                window.notificationManager.remove(notifId);
            }
            window.notificationManager.error(
                `Lỗi khi lưu: ${error.message}`,
                5000,
            );
        }
    }
}

// =====================================================
// PREPARE PAYLOAD FOR PUT REQUEST
// =====================================================
function prepareOrderPayload(orderData) {
    console.log("[PAYLOAD] Preparing payload for PUT request...");

    // Clone dữ liệu để không ảnh hưởng original
    const payload = JSON.parse(JSON.stringify(orderData));

    // THÊM @odata.context
    if (!payload["@odata.context"]) {
        payload["@odata.context"] =
            "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        console.log("[PAYLOAD] ✓ Added @odata.context");
    }

    // ✅ CRITICAL FIX: XỬ LÝ DETAILS ARRAY
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map((detail, index) => {
            const cleaned = { ...detail };

            // ✅ XÓA Id nếu null/undefined
            if (
                !cleaned.Id ||
                cleaned.Id === null ||
                cleaned.Id === undefined
            ) {
                delete cleaned.Id;
                console.log(
                    `[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`,
                    cleaned.ProductId,
                );
            } else {
                console.log(
                    `[PAYLOAD] Detail[${index}]: Keeping existing Id:`,
                    cleaned.Id,
                );
            }

            // Đảm bảo OrderId match
            cleaned.OrderId = payload.Id;

            return cleaned;
        });
    }

    // Statistics
    const newDetailsCount = payload.Details?.filter((d) => !d.Id).length || 0;
    const existingDetailsCount =
        payload.Details?.filter((d) => d.Id).length || 0;

    const summary = {
        orderId: payload.Id,
        orderCode: payload.Code,
        topLevelFields: Object.keys(payload).length,
        detailsCount: payload.Details?.length || 0,
        newDetails: newDetailsCount,
        existingDetails: existingDetailsCount,
        hasContext: !!payload["@odata.context"],
        hasPartner: !!payload.Partner,
        hasUser: !!payload.User,
        hasCRMTeam: !!payload.CRMTeam,
        hasRowVersion: !!payload.RowVersion,
    };

    console.log("[PAYLOAD] ✓ Payload prepared successfully:", summary);

    // Validate critical fields
    if (!payload.RowVersion) {
        console.warn("[PAYLOAD] ⚠️ WARNING: Missing RowVersion!");
    }
    if (!payload["@odata.context"]) {
        console.error("[PAYLOAD] ❌ ERROR: Missing @odata.context!");
    }

    // ✅ VALIDATION: Check for Id: null
    const detailsWithNullId =
        payload.Details?.filter(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        ) || [];

    if (detailsWithNullId.length > 0) {
        console.error(
            "[PAYLOAD] ❌ ERROR: Found details with null Id:",
            detailsWithNullId,
        );
        throw new Error(
            "Payload contains details with null Id - this will cause API error",
        );
    }

    return payload;
}

// =====================================================
// INLINE PRODUCT SEARCH
// =====================================================
let inlineSearchTimeout = null;

function initInlineSearchAfterRender() {
    setTimeout(() => {
        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput && typeof initInlineProductSearch === "function") {
            initInlineProductSearch();
        }

        // 🔄 Refresh inline search UI when switching to products tab
        refreshInlineSearchUI();
    }, 100);
}

function initInlineProductSearch() {
    const searchInput = document.getElementById("inlineProductSearch");
    if (!searchInput) return;
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (inlineSearchTimeout) clearTimeout(inlineSearchTimeout);
        if (query.length < 2) {
            hideInlineResults();
            return;
        }
        inlineSearchTimeout = setTimeout(() => performInlineSearch(query), 500);
    });
}

async function performInlineSearch(query) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    const searchInput = document.getElementById("inlineProductSearch");
    searchInput.classList.add("searching");
    resultsDiv.className = "inline-search-results loading show";
    resultsDiv.innerHTML = `<div class="inline-search-loading"></div>`;
    try {
        if (!window.productSearchManager.isLoaded)
            await window.productSearchManager.fetchExcelProducts();
        const results = window.productSearchManager.search(query, 20);
        displayInlineResults(results);
    } catch (error) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div style="color: #ef4444;">Lỗi: ${error.message}</div>`;
    } finally {
        searchInput.classList.remove("searching");
    }
}

function displayInlineResults(results) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    if (!results || results.length === 0) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div>Không tìm thấy sản phẩm</div>`;
        return;
    }
    resultsDiv.className = "inline-search-results show";

    // Check which products are already in the order
    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    resultsDiv.innerHTML = results
        .map((p) => {
            const isInOrder = productsInOrder.has(p.Id);
            const currentQty = productsInOrder.get(p.Id) || 0;
            const itemClass = isInOrder ? 'inline-result-item in-order' : 'inline-result-item';
            const buttonIcon = isInOrder ? 'fa-check' : 'fa-plus';
            const buttonText = isInOrder ? 'Thêm nữa' : 'Thêm';

            return `
        <div class="${itemClass}" onclick="addProductToOrderFromInline(${p.Id})" data-product-id="${p.Id}">
            ${isInOrder ? `<div class="inline-result-quantity-badge"><i class="fas fa-shopping-cart"></i> SL: ${currentQty}</div>` : ''}
            ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="inline-result-image">` : `<div class="inline-result-image placeholder"><i class="fas fa-image"></i></div>`}
            <div class="inline-result-info">
                <div class="inline-result-name">${p.Name}</div>
                <div class="inline-result-code">Mã: ${p.Code}</div>
            </div>
            <div class="inline-result-price">${(p.Price || 0).toLocaleString("vi-VN")}đ</div>
            <button class="inline-result-add" onclick="event.stopPropagation(); addProductToOrderFromInline(${p.Id})">
                <i class="fas ${buttonIcon}"></i> ${buttonText}
            </button>
        </div>`;
        })
        .join("");
}

function hideInlineResults() {
    const resultsDiv = document.getElementById("inlineSearchResults");
    if (resultsDiv) resultsDiv.classList.remove("show");
}

// =====================================================
// HIGHLIGHT PRODUCT ROW AFTER UPDATE
// =====================================================
function highlightProductRow(index) {
    // Wait for DOM to update
    setTimeout(() => {
        const row = document.querySelector(
            `#productsTableBody tr[data-index="${index}"]`,
        );
        if (!row) return;

        // Add highlight class
        row.classList.add("product-row-highlight");

        // Scroll to the row
        row.scrollIntoView({ behavior: "smooth", block: "center" });

        // Remove highlight after animation
        setTimeout(() => {
            row.classList.remove("product-row-highlight");
        }, 2000);
    }, 100);
}

// =====================================================
// UPDATE PRODUCT ITEM UI AFTER ADDING TO ORDER
// =====================================================
function updateProductItemUI(productId) {
    // Find the product item in search results
    const productItem = document.querySelector(
        `.inline-result-item[data-product-id="${productId}"]`
    );

    if (!productItem) return;

    // Add animation
    productItem.classList.add("just-added");

    // Remove animation class after it completes
    setTimeout(() => {
        productItem.classList.remove("just-added");
    }, 500);

    // Get updated quantity from order
    let updatedQty = 0;
    if (currentEditOrderData && currentEditOrderData.Details) {
        const product = currentEditOrderData.Details.find(
            p => p.ProductId == productId
        );
        updatedQty = product ? (product.Quantity || 0) : 0;
    }

    // Update the item to show it's in order
    if (!productItem.classList.contains("in-order")) {
        productItem.classList.add("in-order");
    }

    // Update or add quantity badge
    let badge = productItem.querySelector(".inline-result-quantity-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.className = "inline-result-quantity-badge";
        productItem.insertBefore(badge, productItem.firstChild);
    }

    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${updatedQty}`;

    // Update button
    const button = productItem.querySelector(".inline-result-add");
    if (button) {
        const icon = button.querySelector("i");
        if (icon) {
            icon.className = "fas fa-check";
        }
        // Update button text
        const textNode = Array.from(button.childNodes).find(
            node => node.nodeType === Node.TEXT_NODE
        );
        if (textNode) {
            textNode.textContent = " Thêm nữa";
        }
    }

    console.log(`[UI UPDATE] Product ${productId} UI updated with quantity: ${updatedQty}`);
}

// =====================================================
// REFRESH INLINE SEARCH UI AFTER ANY DATA CHANGE
// =====================================================
function refreshInlineSearchUI() {
    // Get all product items currently displayed in search results
    const productItems = document.querySelectorAll('.inline-result-item');

    if (productItems.length === 0) {
        console.log('[REFRESH UI] No search results to refresh');
        return;
    }

    console.log(`[REFRESH UI] Refreshing ${productItems.length} items in search results`);

    // Create a map of current quantities
    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    // Update each product item
    productItems.forEach(item => {
        const productId = parseInt(item.getAttribute('data-product-id'));
        if (!productId) return;

        const isInOrder = productsInOrder.has(productId);
        const currentQty = productsInOrder.get(productId) || 0;

        // Update classes
        if (isInOrder) {
            if (!item.classList.contains('in-order')) {
                item.classList.add('in-order');
            }
        } else {
            item.classList.remove('in-order');
        }

        // Update or remove badge
        let badge = item.querySelector('.inline-result-quantity-badge');

        if (isInOrder && currentQty > 0) {
            // Product is in order - show/update badge
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'inline-result-quantity-badge';
                item.insertBefore(badge, item.firstChild);
            }
            badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${currentQty}`;
        } else if (badge) {
            // Product removed from order - remove badge
            badge.remove();
        }

        // Update button
        const button = item.querySelector('.inline-result-add');
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isInOrder ? 'fas fa-check' : 'fas fa-plus';
            }

            // Update button text
            const textNode = Array.from(button.childNodes).find(
                node => node.nodeType === Node.TEXT_NODE
            );
            if (textNode) {
                textNode.textContent = isInOrder ? ' Thêm nữa' : ' Thêm';
            }
        }
    });

    console.log('[REFRESH UI] UI refresh completed');
}

async function addProductToOrderFromInline(productId) {
    let notificationId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notificationId = window.notificationManager.show(
                "Đang tải thông tin sản phẩm...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "package",
                },
            );
        }

        // Get full product details from API
        console.log(
            "[INLINE ADD] Fetching full product details for ID:",
            productId,
        );
        const fullProduct =
            await window.productSearchManager.getFullProductDetails(productId);

        if (!fullProduct) {
            throw new Error("Không tìm thấy thông tin sản phẩm");
        }

        console.log("[INLINE ADD] Full product details:", fullProduct);

        // Close loading notification
        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        // Ensure Details is an array
        if (!currentEditOrderData.Details) {
            currentEditOrderData.Details = [];
        }

        // Check if product already exists in order
        const existingProductIndex = currentEditOrderData.Details.findIndex(
            (p) => p.ProductId == productId,
        );

        if (existingProductIndex > -1) {
            // Product exists - increase quantity
            const existingProduct =
                currentEditOrderData.Details[existingProductIndex];
            const oldQty = existingProduct.Quantity || 0;
            const newQty = oldQty + 1;

            updateProductQuantity(existingProductIndex, 1);

            console.log(
                `[INLINE ADD] Product already exists, increased quantity: ${oldQty} → ${newQty}`,
            );

            showSaveIndicator(
                "success",
                `${existingProduct.ProductNameGet || existingProduct.ProductName} (SL: ${oldQty} → ${newQty})`,
            );

            highlightProductRow(existingProductIndex);
        } else {
            // ============================================
            // QUAN TRỌNG: Product mới - THÊM ĐẦY ĐỦ COMPUTED FIELDS
            // ============================================
            const newProduct = {
                // ============================================
                // REQUIRED FIELDS
                // ============================================
                // ✅ KHÔNG có Id: null cho sản phẩm mới
                ProductId: fullProduct.Id,
                Quantity: 1,
                Price:
                    fullProduct.PriceVariant ||
                    fullProduct.ListPrice ||
                    fullProduct.StandardPrice ||
                    0,
                Note: null,
                UOMId: fullProduct.UOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentEditOrderData.Id,
                LiveCampaign_DetailId: null,
                ProductWeight: 0,

                // ============================================
                // COMPUTED FIELDS - PHẢI CÓ!
                // ============================================
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet:
                    fullProduct.NameGet ||
                    `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || "Cái",
                ImageUrl: fullProduct.ImageUrl,
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,

                // Creator ID
                CreatedById:
                    currentEditOrderData.UserId ||
                    currentEditOrderData.CreatedById,
            };

            currentEditOrderData.Details.push(newProduct);
            showSaveIndicator("success", "Đã thêm sản phẩm");
            console.log(
                "[INLINE ADD] Product added with computed fields:",
                newProduct,
            );
        }

        // ⚠️ QUAN TRỌNG: KHÔNG xóa input và KHÔNG ẩn results 
        // Điều này cho phép user tiếp tục thêm sản phẩm khác từ cùng danh sách gợi ý
        // document.getElementById("inlineProductSearch").value = "";
        // hideInlineResults();

        // Update UI to show product was added
        updateProductItemUI(productId);

        // Chỉ focus lại vào input để tiện thao tác
        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput) {
            searchInput.focus();
            // Select text để user có thể tiếp tục search hoặc giữ nguyên
            searchInput.select();
        }

        // Recalculate totals BEFORE re-rendering
        recalculateTotals();

        // ✅ FIX: Use switchEditTab instead of renderTabContent to re-init event listeners
        switchEditTab("products");
    } catch (error) {
        console.error("[INLINE ADD] Error:", error);

        // Close loading and show error
        if (window.notificationManager) {
            if (notificationId) {
                window.notificationManager.remove(notificationId);
            }
            window.notificationManager.error(
                "Không thể tải thông tin sản phẩm: " + error.message,
                4000,
            );
        } else {
            alert("Lỗi: " + error.message);
        }
    }
}

// ============================================
// 3. VALIDATION HELPER (Optional)
// ============================================
function validatePayloadBeforePUT(payload) {
    const errors = [];

    // Check @odata.context
    if (!payload["@odata.context"]) {
        errors.push("Missing @odata.context");
    }

    // Check required fields
    if (!payload.Id) errors.push("Missing Id");
    if (!payload.Code) errors.push("Missing Code");
    if (!payload.RowVersion) errors.push("Missing RowVersion");

    // Check Details
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details.forEach((detail, index) => {
            if (!detail.ProductId) {
                errors.push(`Detail[${index}]: Missing ProductId`);
            }

            // Check computed fields (should exist for all products)
            const requiredComputedFields = [
                "ProductName",
                "ProductCode",
                "UOMName",
            ];
            requiredComputedFields.forEach((field) => {
                if (!detail[field]) {
                    errors.push(
                        `Detail[${index}]: Missing computed field ${field}`,
                    );
                }
            });
        });
    }

    if (errors.length > 0) {
        console.error("[VALIDATE] Payload validation errors:", errors);
        return { valid: false, errors };
    }

    console.log("[VALIDATE] Payload is valid ✓");
    return { valid: true, errors: [] };
}

// Debug payload trước khi gửi API
function debugPayloadBeforeSend(payload) {
    console.group("🔍 PAYLOAD DEBUG");

    console.log("Order Info:", {
        id: payload.Id,
        code: payload.Code,
        detailsCount: payload.Details?.length || 0,
    });

    if (payload.Details) {
        console.log("\n📦 Details Analysis:");

        const detailsWithId = payload.Details.filter((d) => d.Id);
        const detailsWithoutId = payload.Details.filter((d) => !d.Id);
        const detailsWithNullId = payload.Details.filter(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        );

        console.log(`  ✅ Details with valid Id: ${detailsWithId.length}`);
        console.log(
            `  ✅ Details without Id (new): ${detailsWithoutId.length}`,
        );
        console.log(
            `  ${detailsWithNullId.length > 0 ? "❌" : "✅"} Details with null Id: ${detailsWithNullId.length}`,
        );

        if (detailsWithNullId.length > 0) {
            console.error("\n❌ FOUND DETAILS WITH NULL ID:");
            detailsWithNullId.forEach((d, i) => {
                console.error(
                    `  Detail[${i}]: ProductId=${d.ProductId}, Id=${d.Id}`,
                );
            });
        }

        console.log("\n📋 Details List:");
        payload.Details.forEach((d, i) => {
            console.log(
                `  [${i}] ${d.Id ? "✅" : "🆕"} ProductId=${d.ProductId}, Id=${d.Id || "N/A"}`,
            );
        });
    }

    console.groupEnd();

    // Return validation result
    const hasNullIds =
        payload.Details?.some(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        ) || false;

    return {
        valid: !hasNullIds,
        message: hasNullIds
            ? "Payload has details with null Id"
            : "Payload is valid",
    };
}

// =====================================================
// MESSAGE HANDLER FOR CROSS-TAB COMMUNICATION
// =====================================================
window.addEventListener("message", function (event) {
    // Handle request for orders data from product assignment tab
    if (event.data.type === "REQUEST_ORDERS_DATA") {
        console.log('📨 Nhận request orders data, allData length:', allData.length);

        // Check if data is loaded
        if (!allData || allData.length === 0) {
            console.log('⚠️ allData chưa có dữ liệu, sẽ retry sau 1s');
            // Retry after 1 second
            setTimeout(() => {
                if (allData && allData.length > 0) {
                    sendOrdersDataToTab3();
                } else {
                    console.log('❌ Vẫn chưa có dữ liệu sau khi retry');
                }
            }, 1000);
            return;
        }

        sendOrdersDataToTab3();
    }
});

function sendOrdersDataToTab3() {
    // Prepare orders data with STT (SessionIndex)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // Save to localStorage for persistence
    localStorage.setItem('ordersData', JSON.stringify(ordersDataToSend));

    // Send to product assignment tab via parent window forwarding
    // Updated to avoid "SecurityError: Blocked a frame with origin 'null'"
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE', // Changed to match main.html handler
            orders: ordersDataToSend
        }, '*');
        console.log(`📤 Đã gửi ${ordersDataToSend.length} đơn hàng về parent để forward sang tab 3`);
    }
}

// =====================================================
// CHAT MODAL FUNCTIONS
// =====================================================
let currentChatChannelId = null;
let currentChatPSID = null;
let currentChatType = null;
let currentChatCursor = null;
let allChatMessages = [];
let allChatComments = [];
let isLoadingMoreMessages = false;
let currentOrder = null;  // Lưu order hiện tại để gửi reply
let currentConversationId = null;  // Lưu conversation ID cho reply
let currentParentCommentId = null;  // Lưu parent comment ID
let currentPostId = null; // Lưu post ID của comment đang reply

window.openChatModal = async function (orderId, channelId, psid, type = 'message') {
    console.log('[CHAT] Opening modal:', { orderId, channelId, psid, type });
    if (!channelId || !psid) {
        alert('Không có thông tin tin nhắn cho đơn hàng này');
        return;
    }

    // Reset pagination state
    currentChatChannelId = channelId;
    currentChatPSID = psid;
    currentChatType = type;
    currentChatCursor = null;
    allChatMessages = [];
    allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Get order info
    const order = allData.find(o => o.Id === orderId);
    if (!order) {
        alert('Không tìm thấy đơn hàng');
        return;
    }

    // Lưu order hiện tại
    currentOrder = order;
    currentChatOrderId = orderId;

    // Update modal title based on type
    const titleText = type === 'comment' ? 'Bình luận' : 'Tin nhắn';
    document.getElementById('chatModalTitle').textContent = `${titleText} với ${order.Name}`;
    document.getElementById('chatModalSubtitle').textContent = `SĐT: ${order.Telephone || 'N/A'} • Mã ĐH: ${order.Code}`;

    // Show modal
    document.getElementById('chatModal').classList.add('show');

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Show/hide reply container and mark as read button
    // Show/hide reply container and mark as read button
    const replyContainer = document.getElementById('chatReplyContainer');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    // Always show reply container for both comment and message
    replyContainer.style.display = 'block';
    document.getElementById('chatReplyInput').value = '';

    if (type === 'comment') {
        markReadBtn.style.display = 'none';
    } else {
        markReadBtn.style.display = 'none'; // Keep hidden for now or show if needed
    }

    // Fetch messages or comments based on type
    try {
        if (type === 'comment') {
            // Lấy conversationId từ Pancake để dùng cho reply
            if (window.pancakeDataManager) {
                const pancakeCommentInfo = window.pancakeDataManager.getLastCommentForOrder(order);
                if (pancakeCommentInfo.conversationId) {
                    currentConversationId = pancakeCommentInfo.conversationId;
                    console.log(`[CHAT] Got conversationId from Pancake: ${currentConversationId}`);
                }
            }

            // Fetch initial comments with pagination support
            const response = await window.chatDataManager.fetchComments(channelId, psid);
            allChatComments = response.comments || [];
            currentChatCursor = response.after; // Store cursor for next page

            // Lấy parent comment ID từ comment đầu tiên (comment gốc)
            if (allChatComments.length > 0) {
                // Tìm comment gốc (parent comment) - thường là comment không có ParentId hoặc comment đầu tiên
                const rootComment = allChatComments.find(c => !c.ParentId) || allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                    console.log(`[CHAT] Got parent comment ID: ${currentParentCommentId} (from ${rootComment.Id})`);

                    // Debug log to help identify correct field
                    console.log('[CHAT] Root comment object:', rootComment);
                }
            }

            console.log(`[CHAT] Initial load: ${allChatComments.length} comments, cursor: ${currentChatCursor}`);

            renderComments(allChatComments, true);

            // Setup infinite scroll for comments
            setupChatInfiniteScroll();
        } else {
            // Fetch messages
            const chatInfo = window.chatDataManager.getLastMessageForOrder(order);

            // Try to get conversation ID from Pancake data manager if available
            if (window.pancakeDataManager) {
                // We might need a method to get conversation ID for messages too
                // For now, let's try to construct it or find it in chatInfo
                // Usually conversationId is pageId_psid
                currentConversationId = `${channelId}_${psid}`;
                console.log(`[CHAT] Constructed conversationId: ${currentConversationId}`);
            }

            if (chatInfo.hasUnread) {
                markReadBtn.style.display = 'inline-flex';
            }

            // Fetch initial messages with pagination support
            const response = await window.chatDataManager.fetchMessages(channelId, psid);
            allChatMessages = response.messages || [];
            currentChatCursor = response.after; // Store cursor for next page

            console.log(`[CHAT] Initial load: ${allChatMessages.length} messages, cursor: ${currentChatCursor}`);

            renderChatMessages(allChatMessages, true);

            // Setup infinite scroll for messages
            setupChatInfiniteScroll();
        }

        // Initialize Chat Product State
        initChatProductSearch();

        // Initialize ChatProductManager for history tracking
        if (window.chatProductManager) {
            await window.chatProductManager.init('shared');
            console.log('[CHAT] ChatProductManager initialized');
        }

        // Firebase Sync Logic - Shared products across all orders
        if (database) {
            currentChatProductsRef = database.ref('order_products/shared');
            currentChatProductsRef.on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    console.log('[CHAT-FIREBASE] Loaded shared products from Firebase:', data);
                    currentChatOrderDetails = data;
                    renderChatProductsPanel();
                } else {
                    console.log('[CHAT-FIREBASE] No shared data in Firebase, initializing from order details');
                    // If no data in Firebase, initialize from order and save to shared
                    currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
                    renderChatProductsPanel();
                    // Save initial state to shared Firebase path
                    saveChatProductsToFirebase('shared', currentChatOrderDetails);
                }
            });
        } else {
            // Fallback if no firebase
            currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
            renderChatProductsPanel();
        }



    } catch (error) {
        console.error(`[CHAT] Error loading ${type}:`, error);
        const errorText = type === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
}

window.closeChatModal = function () {
    document.getElementById('chatModal').classList.remove('show');

    // Clean up scroll listener
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleChatScroll);
    }

    // Reset pagination state
    currentChatChannelId = null;
    currentChatPSID = null;
    currentChatType = null;
    currentChatCursor = null;
    allChatMessages = [];
    allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    currentConversationId = null;
    currentParentCommentId = null;

    // Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}

/**
 * Gửi reply comment theo Pancake API
 * Flow: POST /conversations/{conversationId}/messages -> POST /sync_comments -> Refresh
 */
window.sendReplyComment = async function () {
    const messageInput = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const message = messageInput.value.trim();

    // Validate
    if (!message) {
        alert('Vui lòng nhập tin nhắn');
        return;
    }

    // Validate required info
    const isMessage = currentChatType === 'message';
    // Allow missing parentCommentId for top-level comments
    const missingInfo = !currentOrder || !currentConversationId || !currentChatChannelId;

    if (missingInfo) {
        alert('Thiếu thông tin để gửi tin nhắn. Vui lòng đóng và mở lại modal.');
        console.error('[SEND-REPLY] Missing required info:', {
            currentOrder: !!currentOrder,
            currentConversationId: !!currentConversationId,
            currentChatChannelId: !!currentChatChannelId,
            currentChatType
        });
        return;
    }

    // Disable button và hiển thị loading
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

    try {
        // Get Pancake token
        const token = await window.pancakeTokenManager.getToken();
        if (!token) {
            throw new Error('Không tìm thấy Pancake token. Vui lòng cài đặt token trong Settings.');
        }

        const pageId = currentChatChannelId;
        const conversationId = currentConversationId;

        // Use currentPostId if available (from specific comment reply), otherwise fallback to order's post ID
        const postId = currentPostId || currentOrder.Facebook_PostId; // Format: "pageId_postId"

        console.log('[SEND-REPLY] Sending reply comment...', {
            pageId,
            conversationId,
            postId,
            parentCommentId: currentParentCommentId,
            message
        });

        // Step 1: POST reply (comment or message)
        const replyUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${pageId}/conversations/${conversationId}/messages`,
            `access_token=${token}`
        );

        let replyBody;
        if (currentChatType === 'message') {
            // Payload for sending a message (reply_inbox)
            // Based on fetch1.txt
            replyBody = {
                action: "reply_inbox",
                message: message,
                send_by_platform: "web"
            };
        } else {
            // Payload for replying to a comment OR creating a new top-level comment
            if (currentParentCommentId) {
                // Reply to specific comment
                replyBody = {
                    action: "reply_comment",
                    message_id: currentParentCommentId,
                    parent_id: currentParentCommentId,
                    user_selected_reply_to: null,
                    post_id: postId,
                    message: message,
                    send_by_platform: "web"
                };
            } else {
                // Top-level comment (no parent)
                // Based on typical Pancake/Facebook API behavior for new comments on a post
                replyBody = {
                    action: "reply_comment", // Still use reply_comment action? Or maybe just "comment"? 
                    // Usually for top level, we just need post_id. 
                    // If Pancake requires "reply_comment" action even for new comments, we might need to omit parent_id.
                    // Let's assume we omit parent_id/message_id.
                    post_id: postId,
                    message: message,
                    send_by_platform: "web"
                };
                console.log('[SEND-REPLY] Sending top-level comment (no parent_id)');
            }
        }

        console.log('[SEND-REPLY] POST URL:', replyUrl);
        console.log('[SEND-REPLY] Request body:', replyBody);

        const replyResponse = await API_CONFIG.smartFetch(replyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(replyBody)
        });

        if (!replyResponse.ok) {
            const errorText = await replyResponse.text();
            console.error('[SEND-REPLY] Reply failed:', errorText);
            throw new Error(`Gửi tin nhắn thất bại: ${replyResponse.status} ${replyResponse.statusText}`);
        }

        const replyData = await replyResponse.json();
        console.log('[SEND-REPLY] Reply response:', replyData);

        if (!replyData.success) {
            throw new Error('Gửi tin nhắn thất bại: ' + (replyData.error || 'Unknown error'));
        }

        // Step 2: Sync comments (fetch3.txt)
        console.log('[SEND-REPLY] Syncing comments...');
        const syncUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${pageId}/sync_comments`,
            `access_token=${token}`
        );

        // Build multipart/form-data body
        const formData = new FormData();
        formData.append('post_id', postId);

        const syncResponse = await API_CONFIG.smartFetch(syncUrl, {
            method: 'POST',
            body: formData
        });

        if (!syncResponse.ok) {
            console.warn('[SEND-REPLY] Sync comments failed, but message was sent');
        } else {
            const syncData = await syncResponse.json();
            console.log('[SEND-REPLY] Sync response:', syncData);
        }

        // Optimistic Update: Show message immediately
        const now = new Date().toISOString();
        if (currentChatType === 'message') {
            const tempMessage = {
                id: `temp_${Date.now()}`,
                message: `<div>${message}</div>`, // Simple formatting
                from: {
                    name: 'Me', // Or get actual admin name if available
                    id: pageId
                },
                inserted_at: now,
                created_time: now,
                is_temp: true
            };
            allChatMessages.push(tempMessage);
            renderChatMessages(allChatMessages, true);
        } else {
            const tempComment = {
                Id: `temp_${Date.now()}`,
                Message: message,
                From: {
                    Name: 'Me',
                    Id: pageId
                },
                CreatedTime: now,
                is_temp: true,
                ParentId: currentParentCommentId
            };
            allChatComments.push(tempComment);
            renderComments(allChatComments, true);
        }

        // Step 3: Refresh data (Fetch latest from API)
        console.log(`[SEND-REPLY] Refreshing ${currentChatType}s...`);
        // Add a small delay to ensure backend has processed the message
        setTimeout(async () => {
            if (currentChatType === 'message') {
                // Force fetch latest
                const response = await window.chatDataManager.fetchMessages(currentChatChannelId, currentChatPSID);
                if (response.messages && response.messages.length > 0) {
                    // Merge or replace. For simplicity, let's replace if we got new data
                    // But we should be careful not to lose pagination. 
                    // Actually, fetchMessages appends? No, it returns a page.
                    // Let's just re-fetch the latest page.
                    allChatMessages = response.messages;
                    renderChatMessages(allChatMessages, true);
                }
            } else {
                const response = await window.chatDataManager.fetchComments(currentChatChannelId, currentChatPSID);
                if (response.comments && response.comments.length > 0) {
                    allChatComments = response.comments;
                    renderComments(allChatComments, true);
                }
            }
        }, 1000);

        // Clear input
        messageInput.value = '';

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn thành công!', 'success');
        }

        console.log('[SEND-REPLY] ✅ Reply sent successfully');

    } catch (error) {
        console.error('[SEND-REPLY] ❌ Error:', error);
        alert('❌ Lỗi khi gửi tin nhắn: ' + error.message);
    } finally {
        // Re-enable button
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi';
    }
}

/**
 * Handle click on "Trả lời" button in comment list
 * @param {string} commentId - ID of the comment being replied to
 * @param {string} postId - Post ID of the comment
 */
function handleReplyToComment(commentId, postId) {
    console.log(`[CHAT] Replying to comment: ${commentId}, post: ${postId}`);

    // Set current parent comment ID
    // Look up the comment in allChatComments to get the full object
    const comment = allChatComments.find(c => c.Id === commentId);

    if (comment) {
        // Use helper to get the correct ID (FacebookId, OriginalId, etc.)
        currentParentCommentId = getFacebookCommentId(comment);
        console.log(`[CHAT] Selected parent comment ID: ${currentParentCommentId} (from ${comment.Id})`);
    } else {
        // Fallback if comment not found in local list (shouldn't happen often)
        currentParentCommentId = commentId;
        console.warn(`[CHAT] Could not find comment object for ${commentId}, using raw ID`);
    }

    // Set current post ID (if available)
    if (postId && postId !== 'undefined' && postId !== 'null') {
        currentPostId = postId;
    } else {
        currentPostId = null;
    }

    // Focus input
    const input = document.getElementById('chatReplyInput');
    if (input) {
        input.focus();
        input.placeholder = `Đang trả lời bình luận...`;

        // Add visual feedback (optional)
        input.style.borderColor = '#3b82f6';
        setTimeout(() => {
            input.style.borderColor = '#d1d5db';
        }, 1000);
    }
}

function renderChatMessages(messages, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!messages || messages.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có tin nhắn</p>
            </div>`;
        return;
    }

    // Format time helper
    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return date.toLocaleDateString('vi-VN');
    };

    // Reverse messages to show oldest first
    const sortedMessages = messages.slice().reverse();

    const messagesHTML = sortedMessages.map(msg => {
        const isOwner = msg.IsOwner;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        let content = '';
        if (msg.Message) {
            content = `<p class="chat-message-text">${msg.Message}</p>`;
        }

        // Handle attachments (images)
        if (msg.Attachments && msg.Attachments.length > 0) {
            msg.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        return `
            <div class="chat-message ${alignClass}">
                <div class="chat-bubble ${bgClass}">
                    ${content}
                    <p class="chat-message-time">${formatTime(msg.CreatedTime)}</p>
                </div>
            </div>`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more messages to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm tin nhắn</span>
            </div>`;
    } else if (allChatMessages.length > 0 && !currentChatCursor) {
        // No more messages (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết tin nhắn cũ
            </div>`;
    }

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${messagesHTML}</div>`;

    // Auto scroll to bottom or preserve scroll position
    if (scrollToBottom) {
        setTimeout(() => {
            modalBody.scrollTop = modalBody.scrollHeight;
        }, 100);
    }
}

function renderComments(comments, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!comments || comments.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có bình luận</p>
            </div>`;
        return;
    }

    // Format time helper
    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return date.toLocaleDateString('vi-VN');
    };

    // Reverse comments to show oldest first
    const sortedComments = comments.slice().reverse();

    const commentsHTML = sortedComments.map(comment => {
        const isOwner = comment.IsOwner;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        let content = '';
        if (comment.Message) {
            content = `<p class="chat-message-text">${comment.Message}</p>`;
        }

        // Status badge for unread comments
        const statusBadge = comment.Status === 30
            ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Mới</span>'
            : '';

        // Render nested replies if any
        let repliesHTML = '';
        if (comment.Messages && comment.Messages.length > 0) {
            repliesHTML = comment.Messages.map(reply => {
                const replyIsOwner = reply.IsOwner;
                const replyAlignClass = replyIsOwner ? 'chat-message-right' : 'chat-message-left';
                const replyBgClass = replyIsOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px;">
                        <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                            <p class="chat-message-text">${reply.Message || ''}</p>
                            <p class="chat-message-time">${formatTime(reply.CreatedTime)}</p>
                        </div>
                    </div>`;
            }).join('');
        }

        return `
            <div class="chat-message ${alignClass}">
                <div class="chat-bubble ${bgClass}">
                    ${content}
                    <p class="chat-message-time">
                        ${formatTime(comment.CreatedTime)} ${statusBadge}
                        ${!isOwner ? `<span class="reply-btn" onclick="handleReplyToComment('${comment.Id}', '${comment.PostId || ''}')" style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">Trả lời</span>` : ''}
                    </p>
                </div>
            </div>
            ${repliesHTML}`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more comments to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm bình luận</span>
            </div>`;
    } else if (allChatComments.length > 0 && !currentChatCursor) {
        // No more comments (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết bình luận cũ
            </div>`;
    }

    // Add post/video context at the top if available
    let postContext = '';
    if (comments[0] && comments[0].Object) {
        const obj = comments[0].Object;
        postContext = `
            <div style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
                    <i class="fas fa-video"></i> ${obj.ObjectType === 1 ? 'Video' : 'Bài viết'} Live
                </div>
                <div style="font-size: 13px; font-weight: 500; color: #1f2937;">
                    ${obj.Description || obj.Title || 'Không có mô tả'}
                </div>
            </div>`;
    }

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Auto scroll to bottom or preserve scroll position
    if (scrollToBottom) {
        setTimeout(() => {
            modalBody.scrollTop = modalBody.scrollHeight;
        }, 100);
    }
}

// =====================================================
// INFINITE SCROLL FOR MESSAGES & COMMENTS
// =====================================================

function setupChatInfiniteScroll() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Remove existing listener to avoid duplicates
    modalBody.removeEventListener('scroll', handleChatScroll);

    // Add scroll listener
    modalBody.addEventListener('scroll', handleChatScroll);
}

async function handleChatScroll(event) {
    const modalBody = event.target;

    // Check if scrolled to top (or near top)
    const isNearTop = modalBody.scrollTop < 100;

    // Only load more if:
    // 1. Near the top of the scroll
    // 2. Not already loading
    // 3. Have a cursor for more data
    if (isNearTop && !isLoadingMoreMessages && currentChatCursor) {
        if (currentChatType === 'message') {
            await loadMoreMessages();
        } else if (currentChatType === 'comment') {
            await loadMoreComments();
        }
    }
}

async function loadMoreMessages() {
    if (!currentChatChannelId || !currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm tin nhắn...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more messages with cursor: ${currentChatCursor}`);

        // Fetch more messages using the cursor
        const response = await window.chatDataManager.fetchMessages(
            currentChatChannelId,
            currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older messages to the beginning of the array
        const newMessages = response.messages || [];
        if (newMessages.length > 0) {
            allChatMessages = [...allChatMessages, ...newMessages];
            console.log(`[CHAT] ✅ Loaded ${newMessages.length} more messages. Total: ${allChatMessages.length}`);
        } else {
            console.log(`[CHAT] ⚠️ No new messages loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more messages)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] 📄 Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] 🏁 No more messages. Reached the beginning of conversation.`);
        }

        // Re-render with all messages, don't scroll to bottom
        renderChatMessages(allChatMessages, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more messages:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

async function loadMoreComments() {
    if (!currentChatChannelId || !currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm bình luận...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more comments with cursor: ${currentChatCursor}`);

        // Fetch more comments using the cursor
        const response = await window.chatDataManager.fetchComments(
            currentChatChannelId,
            currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older comments to the beginning of the array
        const newComments = response.comments || [];
        if (newComments.length > 0) {
            allChatComments = [...allChatComments, ...newComments];
            console.log(`[CHAT] ✅ Loaded ${newComments.length} more comments. Total: ${allChatComments.length}`);
        } else {
            console.log(`[CHAT] ⚠️ No new comments loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more comments)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] 📄 Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] 🏁 No more comments. Reached the beginning.`);
        }

        // Re-render with all comments, don't scroll to bottom
        renderComments(allChatComments, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more comments:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

window.markChatAsRead = async function () {
    if (!currentChatChannelId || !currentChatPSID) return;

    try {
        const markReadBtn = document.getElementById('chatMarkReadBtn');
        markReadBtn.disabled = true;
        markReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

        await window.chatDataManager.markAsSeen(currentChatChannelId, currentChatPSID);

        // Hide button
        markReadBtn.style.display = 'none';
        markReadBtn.disabled = false;
        markReadBtn.innerHTML = '<i class="fas fa-check"></i> Đánh dấu đã đọc';

        // Re-render table to update UI
        renderTable();

        if (window.notificationManager) {
            window.notificationManager.success('Đã đánh dấu tin nhắn là đã đọc', 2000);
        }
    } catch (error) {
        console.error('[CHAT] Error marking as read:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi khi đánh dấu đã đọc: ' + error.message, 3000);
        }
    }
}

// =====================================================
// NOTE EDITED DETECTION VIA FIREBASE SNAPSHOT
// =====================================================

/**
 * Load all note snapshots from Firebase
 * @returns {Promise<Object>} - Map of orderId -> snapshot data
 */
async function loadNoteSnapshots() {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return {};
    }

    try {
        console.log('[NOTE-TRACKER] Loading note snapshots from Firebase...');
        const snapshot = await database.ref('order_notes_snapshot').once('value');
        const data = snapshot.val() || {};

        // Clean up expired snapshots (older than 30 days)
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const cleanedData = {};
        let expiredCount = 0;

        Object.keys(data).forEach(orderId => {
            const snapshot = data[orderId];
            if (snapshot.timestamp && snapshot.timestamp > thirtyDaysAgo) {
                cleanedData[orderId] = snapshot;
            } else {
                expiredCount++;
                // Delete expired snapshot
                database.ref(`order_notes_snapshot/${orderId}`).remove();
            }
        });

        console.log(`[NOTE-TRACKER] Loaded ${Object.keys(cleanedData).length} snapshots, cleaned ${expiredCount} expired`);
        return cleanedData;
    } catch (error) {
        console.error('[NOTE-TRACKER] Error loading snapshots:', error);
        return {};
    }
}

/**
 * Compare current notes with snapshots and detect edits
 * @param {Array} orders - Array of order objects
 * @param {Object} snapshots - Map of orderId -> snapshot
 * @returns {Promise<void>}
 */
async function compareAndUpdateNoteStatus(orders, snapshots) {
    if (!orders || orders.length === 0) return;

    console.log('[NOTE-TRACKER] Comparing notes with snapshots...');

    let editedCount = 0;
    let newSnapshotsToSave = {};

    orders.forEach(order => {
        const orderId = order.Id;
        const currentNote = (order.Note || '').trim();
        const snapshot = snapshots[orderId];

        if (snapshot) {
            // Compare with existing snapshot
            const savedNote = (snapshot.note || '').trim();

            if (currentNote !== savedNote) {
                // Note has been edited!
                order.noteEdited = true;
                editedCount++;
                console.log(`[NOTE-TRACKER] ✏️ Edited: STT ${order.SessionIndex}, "${savedNote}" → "${currentNote}"`);
            } else {
                order.noteEdited = false;
            }
        } else {
            // No snapshot exists - save current note as baseline
            order.noteEdited = false;
            newSnapshotsToSave[orderId] = {
                note: currentNote,
                code: order.Code,
                stt: order.SessionIndex,
                timestamp: Date.now()
            };
        }
    });

    // Save new snapshots in batch
    if (Object.keys(newSnapshotsToSave).length > 0) {
        await saveNoteSnapshots(newSnapshotsToSave);
    }

    console.log(`[NOTE-TRACKER] ✅ Found ${editedCount} edited notes out of ${orders.length} orders`);
}

/**
 * Save note snapshots to Firebase
 * @param {Object} snapshots - Map of orderId -> snapshot data
 * @returns {Promise<void>}
 */
async function saveNoteSnapshots(snapshots) {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return;
    }

    try {
        const updates = {};
        Object.keys(snapshots).forEach(orderId => {
            updates[`order_notes_snapshot/${orderId}`] = snapshots[orderId];
        });

        await database.ref().update(updates);
        console.log(`[NOTE-TRACKER] Saved ${Object.keys(snapshots).length} new snapshots to Firebase`);
    } catch (error) {
        console.error('[NOTE-TRACKER] Error saving snapshots:', error);
    }
}

/**
 * Main function to detect edited notes using Firebase snapshots
 * Call this after loading orders
 */
async function detectEditedNotes() {
    if (!allData || allData.length === 0) {
        console.log('[NOTE-TRACKER] No data to check');
        return;
    }

    console.log('[NOTE-TRACKER] Starting note edit detection for', allData.length, 'orders...');

    // Load snapshots from Firebase (1 call for all orders)
    const snapshots = await loadNoteSnapshots();

    // Compare and update note status
    await compareAndUpdateNoteStatus(allData, snapshots);

    console.log('[NOTE-TRACKER] Note edit detection completed');
}

/**
 * Helper to extract the correct Facebook Comment ID from a comment object
 * Prioritizes FacebookId, OriginalId, then checks if Id is not a Mongo ID
 */
function getFacebookCommentId(comment) {
    if (!comment) return null;

    // 1. Explicit fields
    if (comment.PlatformId) return comment.PlatformId;
    if (comment.FacebookId) return comment.FacebookId;
    if (comment.OriginalId) return comment.OriginalId;
    if (comment.SocialId) return comment.SocialId;

    // 2. Check if Id is NOT a Mongo ID (24 hex chars)
    // Facebook IDs are usually numeric or have underscores
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(comment.Id);
    if (comment.Id && !isMongoId) {
        return comment.Id;
    }

    // 3. Fallback to Id if nothing else found (might fail if it's internal)
    return comment.Id;
}
// =====================================================
// REALTIME UI UPDATES
// =====================================================
window.addEventListener('realtimeConversationUpdate', function (event) {
    const conversation = event.detail;
    if (!conversation) return;

    // console.log('[TAB1] Handling realtime update:', conversation);

    let psid = conversation.from_psid || (conversation.customers && conversation.customers[0]?.fb_id);
    let pageId = conversation.page_id;

    // Fallback: Extract from conversation.id (format: pageId_psid)
    if ((!psid || !pageId) && conversation.id && conversation.id.includes('_')) {
        const parts = conversation.id.split('_');
        if (parts.length === 2) {
            if (!pageId) pageId = parts[0];
            if (!psid) psid = parts[1];
        }
    }

    if (!psid) return;

    const message = conversation.snippet || '';
    const unreadCount = conversation.unread_count || 0;
    const isUnread = unreadCount > 0 || !conversation.seen;
    const type = conversation.type || 'INBOX'; // INBOX or COMMENT

    // Find matching orders in displayedData
    // Match both PSID and PageID (via Facebook_PostId which starts with PageID)
    const matchingOrders = displayedData.filter(o => {
        const matchesPsid = o.Facebook_ASUserId === psid;
        // If we have a pageId, check if Facebook_PostId starts with it
        const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
        return matchesPsid && matchesPage;
    });

    if (matchingOrders.length === 0) return;

    console.log(`[TAB1] Updating ${matchingOrders.length} rows for PSID ${psid} on Page ${pageId}`);

    matchingOrders.forEach(order => {
        // Find row
        const checkbox = document.querySelector(`input[value="${order.Id}"]`);
        if (!checkbox) return;
        const row = checkbox.closest('tr');
        if (!row) return;

        // Determine column based on type
        const colType = type === 'INBOX' ? 'messages' : 'comments';
        const cell = row.querySelector(`td[data-column="${colType}"]`);

        if (cell) {
            // Construct HTML directly
            const fontWeight = isUnread ? '700' : '400';
            const color = isUnread ? '#111827' : '#6b7280';
            const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';
            const unreadText = unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${unreadCount} tin mới</span>` : '';

            // Truncate message
            let displayMessage = message;
            if (displayMessage.length > 30) displayMessage = displayMessage.substring(0, 30) + '...';

            // Update innerHTML
            cell.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                            ${displayMessage}
                        </span>
                        ${unreadText}
                    </div>
                </div>
            `;

            // Highlight
            row.classList.add('product-row-highlight');
            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
        }
    });

    // 🔄 UPDATE ALL DATA & RE-FILTER IF NEEDED
    // Even if the order is not currently displayed (filtered out), we need to update its state in allData
    // and check if it should now be displayed based on current filters.

    // 1. Update PancakeDataManager Cache (Crucial for performTableSearch)
    if (window.pancakeDataManager) {
        // We need to manually update the cache because performTableSearch uses getMessageUnreadInfoForOrder
        // which reads from this cache.
        // The conversation object from the event has the structure we need.

        // We need to find where to put it. 
        // PancakeDataManager stores conversations in inboxMapByPSID and inboxMapByFBID
        // We can try to call a method to update it, or manually set it if exposed.
        // Looking at PancakeDataManager, it doesn't seem to have a public 'updateConversation' method 
        // that takes a raw payload easily without fetching.
        // However, we can try to update the map if we can access it, but it's better to rely on 
        // what we have.

        // Actually, let's just update the order's internal state if possible, OR
        // since performTableSearch calls window.pancakeDataManager.getMessageUnreadInfoForOrder(order),
        // and that function looks up in inboxMapByPSID.

        // Let's try to update the map directly if possible, or add a helper in PancakeDataManager.
        // Since we can't easily modify PancakeDataManager right now without switching files,
        // let's assume for now we can't easily update the private maps if they are not exposed.

        // WAIT: window.pancakeDataManager.inboxMapByPSID is likely accessible.
        if (window.pancakeDataManager.inboxMapByPSID) {
            window.pancakeDataManager.inboxMapByPSID.set(String(psid), conversation);
        }
    }

    // 2. Check if we need to refresh the table (if order was hidden but now matches filter)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    // Only care if we are filtering by 'unread'
    if (conversationFilter === 'unread') {
        // Check if any matching order is NOT in displayedData
        // We need to find orders in allData that match this PSID/PageID
        const allMatchingOrders = allData.filter(o => {
            const matchesPsid = o.Facebook_ASUserId === psid;
            const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
            return matchesPsid && matchesPage;
        });

        const hiddenOrders = allMatchingOrders.filter(o => !displayedData.includes(o));

        if (hiddenOrders.length > 0) {
            console.log(`[TAB1] Found ${hiddenOrders.length} hidden orders matching realtime update. Refreshing table...`);

            // We need to ensure the filter logic sees them as "unread".
            // Since we updated the PancakeDataManager cache above, performTableSearch should now
            // correctly identify them as unread.

            performTableSearch();

            // After refresh, highlight them
            setTimeout(() => {
                hiddenOrders.forEach(order => {
                    const checkbox = document.querySelector(`input[value="${order.Id}"]`);
                    if (checkbox) {
                        const row = checkbox.closest('tr');
                        if (row) {
                            row.classList.add('product-row-highlight');
                            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
                        }
                    }
                });
            }, 100);
        }
    }

    // 🔄 REALTIME CHAT MODAL UPDATE
    const chatModal = document.getElementById('chatModal');
    const isChatModalOpen = chatModal && chatModal.style.display !== 'none';

    if (isChatModalOpen) {
        // Check if current chat matches the incoming update
        // We need to match PSID and PageID (channelId)
        // currentChatPSID and currentChatChannelId are global variables set when opening modal

        // Normalize IDs for comparison (handle string/number differences)
        const isMatchingPsid = String(currentChatPSID) === String(psid);
        const isMatchingChannel = String(currentChatChannelId) === String(pageId);

        // Also check if the type matches (INBOX vs COMMENT)
        // currentChatType is 'message' or 'comment'
        // incoming type is 'INBOX' or 'COMMENT'
        const incomingType = type === 'INBOX' ? 'message' : 'comment';
        const isMatchingType = currentChatType === incomingType;

        if (isMatchingPsid && isMatchingChannel && isMatchingType) {
            console.log('[CHAT MODAL] Realtime update matches open chat. Fetching new message...');

            // Fetch latest messages to get the full message object
            // We use the existing fetchMessages function which handles API calls
            window.chatDataManager.fetchMessages(pageId, psid).then(response => {
                if (response && response.messages && response.messages.length > 0) {
                    const newestMessage = response.messages[0];

                    // Check if we already have this message to avoid duplicates
                    const exists = allChatMessages.some(m => m.Id === newestMessage.Id);

                    if (!exists) {
                        console.log('[CHAT MODAL] Appending new message:', newestMessage);

                        // Add to beginning of array (since renderChatMessages reverses it)
                        // Wait, renderChatMessages reverses the array passed to it.
                        // allChatMessages usually stores newest first (index 0).
                        // So we unshift it to the front.
                        allChatMessages.unshift(newestMessage);

                        // Re-render the chat
                        // Pass true to scrollToBottom
                        renderChatMessages(allChatMessages, true);

                        // Mark as read if needed (optional, but good UX)
                        // markAsRead(pageId, psid); 
                    } else {
                        console.log('[CHAT MODAL] Message already exists in view.');
                    }
                }
            }).catch(err => {
                console.error('[CHAT MODAL] Error fetching new message:', err);
            });
        }
    }
});
// =====================================================
// QUICK ADD PRODUCT LOGIC
// =====================================================
let quickAddSelectedProducts = [];
let quickAddSearchTimeout = null;

function openQuickAddProductModal() {
    // Update UI - Global List
    document.getElementById('targetOrdersCount').textContent = "Danh sách chung";

    // Reset state
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSuggestions').style.display = 'none';

    // Show modal
    document.getElementById('quickAddProductModal').style.display = 'block';
    document.getElementById('quickAddProductModal').classList.add('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'block';

    // Focus search
    setTimeout(() => {
        document.getElementById('quickProductSearch').focus();
    }, 100);

    // Initialize search manager if needed
    if (window.enhancedProductSearchManager && !window.enhancedProductSearchManager.isLoaded) {
        window.enhancedProductSearchManager.fetchExcelProducts();
    }
}

function closeQuickAddProductModal() {
    document.getElementById('quickAddProductModal').style.display = 'none';
    document.getElementById('quickAddProductModal').classList.remove('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'none';
}

// Search Input Handler
document.getElementById('quickProductSearch').addEventListener('input', function (e) {
    const query = e.target.value;

    if (quickAddSearchTimeout) clearTimeout(quickAddSearchTimeout);

    if (!query || query.trim().length < 2) {
        document.getElementById('quickProductSuggestions').style.display = 'none';
        return;
    }

    quickAddSearchTimeout = setTimeout(() => {
        if (window.enhancedProductSearchManager) {
            const results = window.enhancedProductSearchManager.search(query, 10);
            renderQuickAddSuggestions(results);
        }
    }, 300);
});

// Hide suggestions on click outside
document.addEventListener('click', function (e) {
    const suggestions = document.getElementById('quickProductSuggestions');
    const searchInput = document.getElementById('quickProductSearch');

    if (suggestions && e.target !== searchInput && !suggestions.contains(e.target)) {
        suggestions.style.display = 'none';
    }
});

function renderQuickAddSuggestions(products) {
    const suggestionsEl = document.getElementById('quickProductSuggestions');

    if (products.length === 0) {
        suggestionsEl.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-search" style="font-size: 20px; opacity: 0.5; margin-bottom: 8px;"></i>
                <p style="margin: 0; font-size: 13px;">Không tìm thấy sản phẩm</p>
            </div>
        `;
        suggestionsEl.style.display = 'block';
        return;
    }

    suggestionsEl.innerHTML = products.map(product => {
        const imageUrl = product.ImageUrl || (product.Thumbnails && product.Thumbnails[0]);
        return `
            <div class="suggestion-item" onclick="addQuickProduct(${product.Id})" style="
                display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #f3f4f6;
            " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.Name}</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                        ${product.Code ? `<span style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${product.Code}</span>` : ''}
                        <span style="font-size: 12px; font-weight: 600; color: #8b5cf6;">${(product.Price || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>
                <i class="fas fa-plus-circle" style="color: #8b5cf6; font-size: 18px;"></i>
            </div>
        `;
    }).join('');

    suggestionsEl.style.display = 'block';
}

async function addQuickProduct(productId) {
    // Check if already added
    const existing = quickAddSelectedProducts.find(p => p.Id === productId);
    if (existing) {
        existing.Quantity += 1;
        renderQuickAddSelectedProducts();
        document.getElementById('quickProductSuggestions').style.display = 'none';
        document.getElementById('quickProductSearch').value = '';
        return;
    }

    // Get product details
    let product = null;
    if (window.enhancedProductSearchManager) {
        // Try to get from Excel cache first
        product = window.enhancedProductSearchManager.getFromExcel(productId);

        // If not full details, try to fetch
        if (product && !product.HasFullDetails) {
            try {
                const fullProduct = await window.enhancedProductSearchManager.getFullProductDetails(productId);
                product = { ...product, ...fullProduct };
            } catch (e) {
                console.warn("Could not fetch full details", e);
            }
        }
    }

    if (!product) return;

    quickAddSelectedProducts.push({
        Id: product.Id,
        Name: product.Name,
        Code: product.Code || product.DefaultCode || '',
        Price: product.Price || 0,
        ImageUrl: product.ImageUrl,
        Quantity: 1
    });

    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSuggestions').style.display = 'none';
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSearch').focus();
}

function removeQuickProduct(index) {
    quickAddSelectedProducts.splice(index, 1);
    renderQuickAddSelectedProducts();
}

function updateQuickProductQuantity(index, change) {
    const product = quickAddSelectedProducts[index];
    const newQty = product.Quantity + change;

    if (newQty <= 0) {
        removeQuickProduct(index);
    } else {
        product.Quantity = newQty;
        renderQuickAddSelectedProducts();
    }
}

function clearSelectedProducts() {
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
}

function renderQuickAddSelectedProducts() {
    const container = document.getElementById('selectedProductsList');
    const countEl = document.getElementById('selectedProductsCount');
    const clearBtn = document.getElementById('clearAllProductsBtn');

    countEl.textContent = quickAddSelectedProducts.length;
    clearBtn.style.display = quickAddSelectedProducts.length > 0 ? 'block' : 'none';

    if (quickAddSelectedProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px 0; color: #9ca3af;">
                <i class="fas fa-basket-shopping" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                <p style="margin: 0; font-weight: 500;">Chưa có sản phẩm nào</p>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Tìm kiếm và chọn sản phẩm để thêm</p>
            </div>
        `;
        return;
    }

    container.innerHTML = quickAddSelectedProducts.map((product, index) => {
        const imageUrl = product.ImageUrl;
        const total = (product.Price * product.Quantity).toLocaleString('vi-VN');

        return `
            <div class="selected-product-item" style="
                display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #f3f4f6; background: white;
            ">
                <div style="width: 48px; height: 48px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; margin-bottom: 4px;">${product.Name}</div>
                    <div style="font-size: 12px; color: #6b7280;">${product.Code || 'No Code'}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <button onclick="updateQuickProductQuantity(${index}, -1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">-</button>
                        <span style="font-size: 13px; font-weight: 600; min-width: 24px; text-align: center;">${product.Quantity}</span>
                        <button onclick="updateQuickProductQuantity(${index}, 1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">+</button>
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: #374151; min-width: 80px; text-align: right;">
                        ${total}đ
                    </div>
                    <button onclick="removeQuickProduct(${index})" style="padding: 6px; background: none; border: none; cursor: pointer; color: #ef4444; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveSelectedProductsToOrders() {
    if (quickAddSelectedProducts.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning("Vui lòng chọn ít nhất một sản phẩm!");
        } else {
            alert("Vui lòng chọn ít nhất một sản phẩm!");
        }
        return;
    }

    showLoading(true);

    try {
        // Initialize Firebase if needed
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        const db = firebase.database();
        const ref = db.ref(`chat_products/shared`);

        // Get existing products first to merge quantities
        const snapshot = await ref.once('value');
        const existingProducts = snapshot.val() || {};

        // Merge new products
        quickAddSelectedProducts.forEach(newProduct => {
            if (existingProducts[newProduct.Id]) {
                // Update quantity
                existingProducts[newProduct.Id].Quantity = (existingProducts[newProduct.Id].Quantity || 0) + newProduct.Quantity;
            } else {
                // Add new
                existingProducts[newProduct.Id] = {
                    Id: newProduct.Id,
                    Name: newProduct.Name,
                    Code: newProduct.Code,
                    Price: newProduct.Price,
                    Quantity: newProduct.Quantity,
                    ImageUrl: newProduct.ImageUrl || '',
                    AddedAt: firebase.database.ServerValue.TIMESTAMP
                };
            }
        });

        // Save back to Firebase
        await ref.set(existingProducts);

        showLoading(false);
        closeQuickAddProductModal();

        if (window.notificationManager) {
            window.notificationManager.success(`Đã thêm sản phẩm vào danh sách chung!`);
        } else {
            alert(`✅ Đã thêm sản phẩm vào danh sách chung!`);
        }

    } catch (error) {
        console.error("Error saving products:", error);
        showLoading(false);
        if (window.notificationManager) {
            window.notificationManager.error("Lỗi khi lưu sản phẩm: " + error.message);
        } else {
            alert("❌ Lỗi khi lưu sản phẩm: " + error.message);
        }
    }
}
// =====================================================
// CHAT SHOPPING CART LOGIC
// =====================================================

function renderChatProductsPanel() {
    const listContainer = document.getElementById("chatProductList");
    const countBadge = document.getElementById("chatProductCountBadge");
    const totalEl = document.getElementById("chatOrderTotal");

    if (!listContainer) return;

    // Update Count & Total
    const totalQty = currentChatOrderDetails.reduce((sum, p) => sum + (p.Quantity || 0), 0);
    const totalAmount = currentChatOrderDetails.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

    if (countBadge) countBadge.textContent = `${totalQty} sản phẩm`;
    if (totalEl) totalEl.textContent = `${totalAmount.toLocaleString("vi-VN")}đ`;

    // Empty State
    if (currentChatOrderDetails.length === 0) {
        listContainer.innerHTML = `
            <div class="chat-empty-cart" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                <p style="font-size: 14px; margin: 0;">Chưa có sản phẩm nào</p>
                <p style="font-size: 12px; margin-top: 4px;">Tìm kiếm để thêm sản phẩm vào đơn</p>
            </div>`;
        return;
    }

    // Render List
    listContainer.innerHTML = currentChatOrderDetails.map((p, index) => `
        <div class="chat-product-card" style="
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            gap: 12px;
            transition: all 0.2s;
        ">
            <!-- Image -->
            <div style="
                width: 48px;
                height: 48px;
                border-radius: 6px;
                background: #f1f5f9;
                overflow: hidden;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                ${p.ImageUrl
            ? `<img src="${p.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<i class="fas fa-image" style="color: #cbd5e1;"></i>`}
            </div>

            <!-- Content -->
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${p.ProductName || p.Name || 'Sản phẩm'}
                    </div>
                    <button onclick="removeChatProduct(${index})" style="
                        background: none;
                        border: none;
                        color: #ef4444;
                        cursor: pointer;
                        padding: 4px;
                        margin-top: -4px;
                        margin-right: -4px;
                        opacity: 0.6;
                        transition: opacity 0.2s;
                    " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                    Mã: ${p.ProductCode || p.Code || 'N/A'}
                </div>

                <!-- Controls -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 13px; font-weight: 700; color: #3b82f6;">
                        ${(p.Price || 0).toLocaleString("vi-VN")}đ
                    </div>
                    
                    <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                        <button onclick="updateChatProductQuantity(${index}, -1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-minus"></i></button>
                        <input type="number" value="${p.Quantity || 1}" onchange="updateChatProductQuantity(${index}, 0, this.value)" style="
                            width: 32px;
                            height: 24px;
                            border: none;
                            border-left: 1px solid #e2e8f0;
                            border-right: 1px solid #e2e8f0;
                            text-align: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: #1e293b;
                            -moz-appearance: textfield;
                        ">
                        <button onclick="updateChatProductQuantity(${index}, 1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join("");
}

// --- Search Logic ---
var chatSearchTimeout = null;

function initChatProductSearch() {
    const input = document.getElementById("chatProductSearchInput");
    console.log("[CHAT-SEARCH] Initializing search. Input found:", !!input);

    if (!input) {
        console.error("[CHAT-SEARCH] Search input not found!");
        return;
    }

    // Prevent duplicate listeners using a custom flag
    if (input.dataset.searchInitialized === "true") {
        console.log("[CHAT-SEARCH] Search already initialized for this input");
        return;
    }

    input.dataset.searchInitialized = "true";

    input.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        console.log("[CHAT-SEARCH] Input event:", query);

        if (chatSearchTimeout) clearTimeout(chatSearchTimeout);

        if (query.length < 2) {
            const resultsDiv = document.getElementById("chatProductSearchResults");
            if (resultsDiv) resultsDiv.style.display = "none";
            return;
        }

        chatSearchTimeout = setTimeout(() => performChatProductSearch(query), 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("chatProductSearchResults");
        const searchContainer = input.closest('.chat-panel-search');
        if (dropdown && searchContainer && !searchContainer.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}

async function performChatProductSearch(query) {
    console.log("[CHAT-SEARCH] Performing search for:", query);
    const resultsDiv = document.getElementById("chatProductSearchResults");
    if (!resultsDiv) {
        console.error("[CHAT-SEARCH] Results div not found!");
        return;
    }

    // Force styles to ensure visibility
    resultsDiv.style.display = "block";
    resultsDiv.style.zIndex = "1000";
    resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #64748b; font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>`;

    try {
        if (!window.productSearchManager) {
            throw new Error("ProductSearchManager not available");
        }

        if (!window.productSearchManager.isLoaded) {
            console.log("[CHAT-SEARCH] Loading products...");
            await window.productSearchManager.fetchExcelProducts();
        }

        const results = window.productSearchManager.search(query, 10);
        console.log("[CHAT-SEARCH] Results found:", results.length);
        displayChatSearchResults(results);
    } catch (error) {
        console.error("[CHAT-SEARCH] Error:", error);
        resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444; font-size: 13px;">Lỗi: ${error.message}</div>`;
    }
}

function displayChatSearchResults(results) {
    const resultsDiv = document.getElementById("chatProductSearchResults");
    if (!resultsDiv) return;

    // Ensure visibility and styling
    resultsDiv.style.display = "block";
    resultsDiv.style.zIndex = "1000";
    resultsDiv.style.maxHeight = "400px";
    resultsDiv.style.overflowY = "auto";
    resultsDiv.style.width = "600px"; // Make it wider like the screenshot
    resultsDiv.style.left = "-16px"; // Align with container padding
    resultsDiv.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";

    if (!results || results.length === 0) {
        resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 14px;">Không tìm thấy sản phẩm phù hợp</div>`;
        return;
    }

    // Check existing products
    const productsInOrder = new Map();
    currentChatOrderDetails.forEach(d => {
        productsInOrder.set(d.ProductId, d.Quantity || 0);
    });

    resultsDiv.innerHTML = results.map(p => {
        const isInOrder = productsInOrder.has(p.Id);
        const currentQty = productsInOrder.get(p.Id) || 0;

        return `
        <div class="chat-search-item ${isInOrder ? 'in-order' : ''}" data-product-id="${p.Id}" onclick="window.chatProductManager?.addProductFromSearch(${p.Id})" style="
            padding: 12px 16px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            gap: 16px;
            background: white;
            transition: background 0.2s;
            cursor: pointer;
            position: relative; /* For badge positioning */
        " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
            
            ${isInOrder ? `
            <div class="chat-search-qty-badge" style="
                position: absolute;
                top: 4px;
                right: 4px;
                background: #10b981;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                font-weight: 600;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            "><i class="fas fa-shopping-cart"></i> SL: ${currentQty}</div>
            ` : ''}

            <!-- Image -->
            <div style="
                width: 48px; 
                height: 48px; 
                border-radius: 6px; 
                background: #f1f5f9; 
                overflow: hidden; 
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid #e2e8f0;
            ">
                ${(p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl)
                ? `<img src="${p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<i class="fas fa-image" style="color: #cbd5e1; font-size: 20px;"></i>`}
            </div>

            <!-- Info -->
            <div style="flex: 1; min-width: 0;">
                <div style="
                    font-size: 14px; 
                    font-weight: 600; 
                    color: #1e293b; 
                    margin-bottom: 4px;
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;
                ">${p.Name}</div>
                <div style="font-size: 12px; color: #64748b;">
                    Mã: <span style="font-family: monospace; color: #475569;">${p.Code || 'N/A'}</span>
                </div>
            </div>

            <!-- Price -->
            <div style="
                font-size: 14px; 
                font-weight: 700; 
                color: #10b981; 
                text-align: right;
                min-width: 80px;
            ">
                ${(p.Price || 0).toLocaleString("vi-VN")}đ
            </div>

            <!-- Add Button -->
            <button style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: ${isInOrder ? '#dcfce7' : '#f1f5f9'};
                color: ${isInOrder ? '#10b981' : '#64748b'};
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            " onmouseover="this.style.background='${isInOrder ? '#dcfce7' : '#e2e8f0'}'" onmouseout="this.style.background='${isInOrder ? '#dcfce7' : '#f1f5f9'}'">
                <i class="fas ${isInOrder ? 'fa-check' : 'fa-plus'}"></i>
            </button>
        </div>`;
    }).join("");
}

function updateChatProductItemUI(productId) {
    const item = document.querySelector(`.chat-search-item[data-product-id="${productId}"]`);
    if (!item) return;

    // Add animation class (assuming CSS exists or we add inline style for animation)
    item.style.transition = "background 0.3s";
    item.style.background = "#dcfce7";
    setTimeout(() => {
        item.style.background = "white";
    }, 500);

    // Update quantity badge
    const existing = currentChatOrderDetails.find(d => d.ProductId == productId);
    const qty = existing ? existing.Quantity : 0;

    let badge = item.querySelector('.chat-search-qty-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'chat-search-qty-badge';
        badge.style.cssText = `
            position: absolute;
            top: 4px;
            right: 4px;
            background: #10b981;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 600;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        item.appendChild(badge);
    }
    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${qty}`;

    // Update button
    const btn = item.querySelector('button');
    if (btn) {
        btn.style.background = '#dcfce7';
        btn.style.color = '#10b981';
        btn.innerHTML = '<i class="fas fa-check"></i>';
    }

    if (!item.classList.contains('in-order')) {
        item.classList.add('in-order');
    }
}

// =====================================================
// FIREBASE SYNC HELPER
// =====================================================
function saveChatProductsToFirebase(orderId, products) {
    if (!database || !orderId) return;
    const ref = database.ref('order_products/' + orderId);
    ref.set(products).catch(err => console.error("[CHAT-FIREBASE] Save error:", err));
}

async function addChatProductFromSearch(productId) {
    // Show loading state on the clicked item
    const searchItem = document.querySelector(`.chat-search-item[onclick*="${productId}"]`);
    const originalContent = searchItem ? searchItem.innerHTML : '';
    if (searchItem) {
        searchItem.innerHTML = `<div style="text-align: center; width: 100%; color: #6366f1;"><i class="fas fa-spinner fa-spin"></i> Đang tải thông tin...</div>`;
        searchItem.style.pointerEvents = 'none';
    }

    try {
        // 1. Fetch full details from TPOS (Required)
        const fullProduct = await window.productSearchManager.getFullProductDetails(productId);
        if (!fullProduct) throw new Error("Không tìm thấy thông tin sản phẩm");

        // Logic to inherit image from Product Template if missing (Variant logic)
        if ((!fullProduct.ImageUrl || fullProduct.ImageUrl === "") && (!fullProduct.Thumbnails || fullProduct.Thumbnails.length === 0)) {
            if (fullProduct.ProductTmplId) {
                try {
                    console.log(`[CHAT-ADD] Fetching product template ${fullProduct.ProductTmplId} for image fallback`);
                    // Construct Template URL
                    const templateApiUrl = window.productSearchManager.PRODUCT_API_BASE.replace('/Product', '/ProductTemplate');
                    const url = `${templateApiUrl}(${fullProduct.ProductTmplId})?$expand=Images`;

                    const headers = await window.tokenManager.getAuthHeader();
                    const response = await fetch(url, {
                        method: "GET",
                        headers: headers,
                    });

                    if (response.ok) {
                        const templateData = await response.json();
                        if (templateData.ImageUrl) fullProduct.ImageUrl = templateData.ImageUrl;
                    }
                } catch (e) {
                    console.warn(`[CHAT-ADD] Failed to fetch product template ${fullProduct.ProductTmplId}`, e);
                }
            }
        }

        // 2. Check if already exists
        const existingIndex = currentChatOrderDetails.findIndex(p => p.ProductId === productId);

        if (existingIndex >= 0) {
            // Increase quantity
            currentChatOrderDetails[existingIndex].Quantity = (currentChatOrderDetails[existingIndex].Quantity || 0) + 1;
        } else {
            // 3. Create new product object using EXACT logic from addProductToOrderFromInline
            const newProduct = {
                ProductId: fullProduct.Id,
                Quantity: 1,
                Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,
                Note: null,
                UOMId: fullProduct.UOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentChatOrderId, // Use current chat order ID
                LiveCampaign_DetailId: null,
                ProductWeight: 0,

                // COMPUTED FIELDS
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || "Cái",
                ImageUrl: fullProduct.ImageUrl || (fullProduct.Thumbnails && fullProduct.Thumbnails[0]) || fullProduct.Parent?.ImageUrl || '',
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,

                // Additional fields for chat UI compatibility if needed
                Name: fullProduct.Name,
                Code: fullProduct.DefaultCode || fullProduct.Barcode
            };

            currentChatOrderDetails.push(newProduct);
        }

        renderChatProductsPanel();
        saveChatProductsToFirebase('shared', currentChatOrderDetails);

        // Update UI for the added item
        updateChatProductItemUI(productId);

        // Clear search input and keep focus
        const searchInput = document.getElementById("chatProductSearchInput");
        if (searchInput) {
            searchInput.value = ''; // Clear input
            searchInput.focus();
        }

    } catch (error) {
        console.error("Error adding product:", error);
        if (searchItem) {
            searchItem.innerHTML = originalContent;
            searchItem.style.pointerEvents = 'auto';
        }
        alert("Lỗi khi thêm sản phẩm: " + error.message);
    }
}

// --- Action Logic ---

function updateChatProductQuantity(index, delta, specificValue = null) {
    if (index < 0 || index >= currentChatOrderDetails.length) return;

    if (specificValue !== null) {
        const val = parseInt(specificValue);
        if (val > 0) currentChatOrderDetails[index].Quantity = val;
    } else {
        const newQty = (currentChatOrderDetails[index].Quantity || 0) + delta;
        if (newQty > 0) currentChatOrderDetails[index].Quantity = newQty;
    }

    renderChatProductsPanel();
    saveChatProductsToFirebase('shared', currentChatOrderDetails);
}

function removeChatProduct(index) {
    if (confirm("Bạn có chắc muốn xóa sản phẩm này?")) {
        currentChatOrderDetails.splice(index, 1);
        renderChatProductsPanel();
        saveChatProductsToFirebase('shared', currentChatOrderDetails);
    }
}


