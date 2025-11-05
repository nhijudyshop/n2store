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
let currentOrderTags = [];

// =====================================================
// INITIALIZATION
// =====================================================
window.addEventListener("DOMContentLoaded", async function () {
    console.log("[CACHE] Clearing all cache on page load...");
    if (window.cacheManager) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
    }

    await loadCampaignList();

    // Set default dates (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById("endDate").value = formatDateTimeLocal(now);
    document.getElementById("startDate").value =
        formatDateTimeLocal(thirtyDaysAgo);

    // Event listeners
    document
        .getElementById("searchBtn")
        .addEventListener("click", handleSearch);
    document
        .getElementById("clearCacheBtn")
        .addEventListener("click", handleClearCache);
    document
        .getElementById("selectAll")
        .addEventListener("change", handleSelectAll);
    document
        .getElementById("campaignFilter")
        .addEventListener("change", handleCampaignChange);

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

    // Load tags
    await loadAvailableTags();

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

        const response = await fetch(
            "https://tomato.tpos.vn/odata/Tag?$top=320&$count=true",
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
        const response = await fetch(
            "https://tomato.tpos.vn/odata/TagSaleOnlineOrder/ODataService.AssignTag",
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

        const order = allData.find((o) => o.Id === currentEditingOrderId);
        if (order) order.Tags = JSON.stringify(currentOrderTags);

        renderTable();
        window.cacheManager.clear("orders");
        showLoading(false);
        closeTagModal();
        showInfoBanner(
            `✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
        );
    } catch (error) {
        console.error("[TAG] Error saving tags:", error);
        showLoading(false);
        alert(`Lỗi khi lưu tag:\n${error.message}`);
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

function performTableSearch() {
    filteredData = searchQuery
        ? allData.filter((order) => matchesSearchQuery(order, searchQuery))
        : [...allData];
    displayedData = filteredData;
    renderTable();
    updateStats();
    updatePageInfo();
    updateSearchResultCount();
}

function matchesSearchQuery(order, query) {
    const searchableText = [
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
    return new Date(dateTimeLocal).toISOString();
}

async function loadCampaignList() {
    try {
        showLoading(true);
        // The date filter was causing a 500 error, likely due to a system clock issue.
        // Fetching the 2000 most recent orders is a more robust way to get recent campaigns.
        const url = `https://tomato.tpos.vn/odata/SaleOnline_Order/ODataService.GetView?$top=2000&$orderby=DateCreated desc&$count=true`;

        const headers = await window.tokenManager.getAuthHeader();
        const response = await fetch(url, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const orders = data.value || [];
        const campaignMap = new Map();
        orders.forEach((order) => {
            if (
                order.LiveCampaignId &&
                !campaignMap.has(order.LiveCampaignId)
            ) {
                campaignMap.set(order.LiveCampaignId, {
                    campaignId: order.LiveCampaignId,
                    displayName: order.LiveCampaignName || "Không có tên",
                    latestDate: order.DateCreated,
                });
            }
        });
        const campaigns = Array.from(campaignMap.values()).sort(
            (a, b) => new Date(b.latestDate) - new Date(a.latestDate),
        );
        populateCampaignFilter(campaigns);
    } catch (error) {
        console.error("Error loading campaigns:", error);
        alert("Lỗi khi tải danh sách chiến dịch: " + error.message);
    } finally {
        showLoading(false);
    }
}

function populateCampaignFilter(campaigns) {
    const select = document.getElementById("campaignFilter");
    select.innerHTML = '<option value="">-- Chọn chiến dịch --</option>';
    campaigns.forEach((campaign) => {
        const option = document.createElement("option");
        option.value = campaign.campaignId;
        option.textContent = campaign.displayName;
        option.dataset.campaign = JSON.stringify(campaign);
        select.appendChild(option);
    });
    if (campaigns.length > 0) {
        select.value = campaigns[0].campaignId;
        handleCampaignChange();
    }
}

function handleCampaignChange() {
    const select = document.getElementById("campaignFilter");
    const selectedOption = select.options[select.selectedIndex];
    selectedCampaign = selectedOption?.dataset.campaign
        ? JSON.parse(selectedOption.dataset.campaign)
        : null;
}

async function handleSearch() {
    if (!selectedCampaign?.campaignId) {
        alert("Vui lòng chọn chiến dịch");
        return;
    }
    window.cacheManager.clear("orders");
    searchQuery = "";
    document.getElementById("tableSearchInput").value = "";
    document.getElementById("searchClearBtn").classList.remove("active");
    allData = [];
    await fetchOrders();
}

async function fetchOrders() {
    try {
        showLoading(true);
        const startDate = convertToUTC(
            document.getElementById("startDate").value,
        );
        const endDate = convertToUTC(document.getElementById("endDate").value);
        const campaignId = selectedCampaign.campaignId;
        const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate}) and LiveCampaignId eq ${campaignId}`;
        const PAGE_SIZE = 1000;
        let skip = 0;
        let hasMore = true;
        allData = [];
        const headers = await window.tokenManager.getAuthHeader();

        while (hasMore) {
            const url = `https://tomato.tpos.vn/odata/SaleOnline_Order/ODataService.GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;
            const response = await fetch(url, {
                headers: { ...headers, accept: "application/json" },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const orders = data.value || [];
            if (skip === 0) totalCount = data["@odata.count"] || 0;
            allData = allData.concat(orders);
            document.querySelector(
                ".loading-overlay .loading-text",
            ).textContent = `Đang tải dữ liệu... (${allData.length} đơn hàng)`;
            hasMore = orders.length === PAGE_SIZE;
            skip += PAGE_SIZE;
            if (hasMore)
                await new Promise((resolve) => setTimeout(resolve, 300));
        }

        filteredData = allData.filter((order) => order && order.Id);
        displayedData = filteredData;

        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");

        renderTable();
        updatePageInfo();
        updateStats();
        updateSearchResultCount();
        showInfoBanner(
            `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
        );
        sendDataToTab2();
    } catch (error) {
        console.error("Error fetching data:", error);
        alert("Lỗi khi tải dữ liệu: " + error.message);
    } finally {
        showLoading(false);
    }
}

// =====================================================
// RENDERING & UI UPDATES
// =====================================================
function renderTable() {
    const tbody = document.getElementById("tableBody");
    if (displayedData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="11" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }
    tbody.innerHTML = displayedData.map(createRowHTML).join("");
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
        } catch (e) {}
    }
    const partnerStatusHTML = formatPartnerStatus(order.PartnerStatusText);
    const highlight = (text) => highlightSearchText(text || "", searchQuery);

    return `
        <tr>
            <td><input type="checkbox" value="${order.Id}" /></td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${order.SessionIndex || ""}</span>
                    <button class="btn-edit-icon" onclick="openEditModal('${order.Id}')" title="Chỉnh sửa đơn hàng"><i class="fas fa-edit"></i></button>
                </div>
            </td>
            <td style="max-width: 120px; white-space: normal;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span>${highlight(order.Code)}</span>
                    <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}')" title="Quản lý tag" style="padding: 2px 6px;">
                        <i class="fas fa-tags"></i>
                        ${tagsCount > 0 ? `<span class="tag-count">${tagsCount}</span>` : ""}
                    </button>
                </div>
                ${tagsHTML}
            </td>
            <td><div>${highlight(order.Name)}</div>${partnerStatusHTML}</td>
            <td style="max-width: 100px; white-space: normal;">${highlight(order.Telephone)}</td>
            <td style="max-width: 500px; white-space: normal;">${highlight(order.Address)}</td>
            <td style="max-width: 200px; white-space: normal;">${highlight(order.Note)}</td>
            <td>${(order.TotalAmount || 0).toLocaleString("vi-VN")}đ</td>
            <td>${order.TotalQuantity || 0}</td>
            <td>${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}">${highlight(order.StatusText || order.Status)}</span></td>
        </tr>`;
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

function handleSelectAll() {
    const checkboxes = document.querySelectorAll(
        '#tableBody input[type="checkbox"]',
    );
    checkboxes.forEach(
        (cb) => (cb.checked = document.getElementById("selectAll").checked),
    );
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
        await fetchOrderData(orderId);
    } catch (error) {
        showErrorState(error.message);
    }
}

async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
    const response = await fetch(apiUrl, {
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

function updateModalWithData(data) {
    document.getElementById("modalOrderCode").textContent = data.Code || "";
    document.getElementById("lastUpdated").textContent = new Date(
        data.LastUpdated,
    ).toLocaleString("vi-VN");
    document.getElementById("productCount").textContent =
        data.Details?.length || 0;
    switchEditTab("info");
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
    return `<div class="empty-state"><p>Lịch sử đơn live</p></div>`;
}
function renderInvoicesTab(data) {
    return `<div class="empty-state"><p>Lịch sử hóa đơn</p></div>`;
}
function renderHistoryTab(data) {
    return `<div class="empty-state"><p>Lịch sử chỉnh sửa</p></div>`;
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
    currentEditOrderData.Details.splice(index, 1);
    renderTabContent("products");
    recalculateTotals();
    showSaveIndicator("success", "Đã xóa sản phẩm");
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
    product.Price =
        parseInt(document.getElementById(`price-edit-${index}`).value, 10) || 0;
    renderTabContent("products");
    recalculateTotals();
    showSaveIndicator("success", "Giá đã cập nhật");
}

function cancelProductDetail() {
    renderTabContent("products");
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
    document.getElementById("totalQuantity").textContent = totalQty;
    document.getElementById("totalAmount").textContent =
        totalAmount.toLocaleString("vi-VN") + "đ";
    document.getElementById("productCount").textContent =
        currentEditOrderData.Details.length;
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
        const response = await fetch(
            `https://tomato.tpos.vn/odata/SaleOnline_Order(${currentEditOrderId})`,
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

        // Clear cache và reload data
        window.cacheManager.clear("orders");
        await fetchOrderData(currentEditOrderId);

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
    resultsDiv.innerHTML = results
        .map(
            (p) => `
        <div class="inline-result-item" onclick="addProductToOrderFromInline(${p.Id})">
            ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="inline-result-image">` : `<div class="inline-result-image placeholder"><i class="fas fa-image"></i></div>`}
            <div class="inline-result-info"><div class="inline-result-name">${p.Name}</div><div class="inline-result-code">Mã: ${p.Code}</div></div>
            <div class="inline-result-price">${(p.Price || 0).toLocaleString("vi-VN")}đ</div>
            <button class="inline-result-add"><i class="fas fa-plus"></i> Thêm</button>
        </div>`,
        )
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

        document.getElementById("inlineProductSearch").value = "";
        hideInlineResults();
        renderTabContent("products");
        recalculateTotals();
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
