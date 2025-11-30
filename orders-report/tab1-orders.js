// =====================================================
// GLOBAL VARIABLES
// =====================================================// Global variables
let allData = [];
let filteredData = [];
let displayedData = [];
let currentPage = 1;
const itemsPerPage = 50;
let selectedOrderIds = new Set();
let isLoading = false;
let loadingAborted = false;
let employeeRanges = []; // Employee STT ranges

// Expose data for other modules
window.getAllOrders = () => allData;

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
let pendingDeleteTagIndex = -1; // Track which tag is pending deletion on backspace
let currentPastedImage = null; // Track pasted image for chat reply

// =====================================================
// FIREBASE CONFIGURATION FOR NOTE TRACKING
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
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

    // Load employee table from Firestore
    // loadAndRenderEmployeeTable(); // Moved to syncEmployeeRanges

    // Check admin permission
    checkAdminPermission();

    // Sync employee ranges from Firebase
    syncEmployeeRanges();

    // Close modals when clicking outside
    window.addEventListener('click', function (event) {
        const tagModal = document.getElementById('tagModal');
        if (event.target === tagModal) {
            closeTagModal();
            if (window.quickTagManager) {
                window.quickTagManager.closeAllDropdowns();
            }
        }
    });

    // Keyboard shortcuts for tag modal
    document.addEventListener('keydown', function (event) {
        const tagModal = document.getElementById('tagModal');
        if (tagModal && tagModal.classList.contains('show')) {
            // Ctrl+Enter to save tags
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                saveOrderTags();
            }
            // ESC to close without saving
            else if (event.key === 'Escape') {
                event.preventDefault();
                closeTagModal();
            }
            // Tab to save and close
            else if (event.key === 'Tab') {
                const tagSearchInput = document.getElementById('tagSearchInput');
                // Only trigger if we're at the input and no dropdown is focused
                if (document.activeElement === tagSearchInput || !document.activeElement || document.activeElement === document.body) {
                    event.preventDefault();
                    saveOrderTags();
                }
            }
        }
    });
});

// =====================================================
// EMPLOYEE RANGE MANAGEMENT FUNCTIONS
// =====================================================
async function loadAndRenderEmployeeTable() {
    try {
        // Initialize user loader
        if (window.userEmployeeLoader) {
            await window.userEmployeeLoader.initialize();
            const users = await window.userEmployeeLoader.loadUsers();

            if (users.length > 0) {
                renderEmployeeTable(users);
            } else {
                console.warn('[EMPLOYEE] No users found');
                const tbody = document.getElementById('employeeAssignmentBody');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy nhân viên nào</td></tr>';
            }
        } else {
            console.error('[EMPLOYEE] userEmployeeLoader not available');
        }
    } catch (error) {
        console.error('[EMPLOYEE] Error loading employee table:', error);
        const tbody = document.getElementById('employeeAssignmentBody');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải danh sách nhân viên</td></tr>';
    }
}

function renderEmployeeTable(users) {
    const tbody = document.getElementById('employeeAssignmentBody');

    // Use global employeeRanges which is synced from Firebase
    let savedRanges = {};
    if (employeeRanges && employeeRanges.length > 0) {
        employeeRanges.forEach(range => {
            savedRanges[range.name] = { start: range.start, end: range.end };
        });
    }

    // Render table rows
    let html = '';
    users.forEach(user => {
        const savedRange = savedRanges[user.displayName] || { start: '', end: '' };

        html += `
            <tr>
                <td style="padding: 8px;">${user.displayName}</td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="start"
                        value="${savedRange.start}"
                        placeholder="Từ"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="end"
                        value="${savedRange.end}"
                        placeholder="Đến"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function applyEmployeeRanges() {
    const inputs = document.querySelectorAll('.employee-range-input');
    const rangesMap = {};

    // Collect ranges from inputs
    inputs.forEach(input => {
        const userName = input.getAttribute('data-user-name');
        const field = input.getAttribute('data-field');
        const value = input.value.trim();

        if (!rangesMap[userName]) {
            rangesMap[userName] = {};
        }

        rangesMap[userName][field] = value ? parseInt(value) : null;
    });

    // Build employee ranges array
    const newRanges = [];

    Object.keys(rangesMap).forEach(userName => {
        const range = rangesMap[userName];

        // Only include if both start and end are filled
        if (range.start !== null && range.end !== null && range.start > 0 && range.end > 0) {
            // Find user ID from input attribute
            const input = document.querySelector(`.employee-range-input[data-user-name="${userName}"]`);
            const userId = input ? input.getAttribute('data-user-id') : null;

            newRanges.push({
                id: userId,
                name: userName,
                start: range.start,
                end: range.end
            });
        }
    });

    // Save to Firebase
    if (database) {
        database.ref('settings/employee_ranges').set(newRanges)
            .then(() => {
                if (window.notificationManager) {
                    window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên lên Firebase`, 'success');
                } else {
                    alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên lên Firebase`);
                }
                toggleEmployeeDrawer();
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error saving ranges to Firebase:', error);
                alert('❌ Lỗi khi lưu lên Firebase: ' + error.message);
            });
    } else {
        alert('❌ Lỗi: Không thể kết nối Firebase');
    }
}

function getEmployeeName(stt) {
    if (!stt || employeeRanges.length === 0) return null;

    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }

    return null;
}

function toggleEmployeeDrawer() {
    const drawer = document.getElementById('employeeDrawer');
    const overlay = document.getElementById('employeeDrawerOverlay');

    if (drawer && overlay) {
        const isActive = drawer.classList.contains('active');

        if (isActive) {
            // Close drawer
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // Open drawer - Reload table to show latest data
            loadAndRenderEmployeeTable();
            drawer.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

function toggleControlBar() {
    const controlBar = document.getElementById('controlBar');
    const btn = document.getElementById('toggleControlBarBtn');

    if (controlBar && btn) {
        const isHidden = controlBar.style.display === 'none';

        if (isHidden) {
            controlBar.style.display = 'flex'; // Or 'block' depending on layout, but flex is used in inline style in html sometimes. Let's check original css. 
            // The original div.filter-section likely has display: flex in CSS. 
            // Let's assume removing style.display will revert to CSS class definition, or set to '' to clear inline style.
            controlBar.style.display = '';

            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Ẩn bộ lọc';
        } else {
            controlBar.style.display = 'none';
            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Hiển thị bộ lọc';
        }
    }
}

function checkAdminPermission() {
    const btn = document.getElementById('employeeSettingsBtn');
    if (btn) {
        // Check if user is admin (checkLogin === 0)
        const isAdmin = window.authManager && window.authManager.hasPermission(0);
        if (!isAdmin) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'inline-flex';
        }
    }
}

function syncEmployeeRanges() {
    if (!database) return;

    const rangesRef = database.ref('settings/employee_ranges');
    rangesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        employeeRanges = data || [];
        console.log(`[EMPLOYEE] Synced ${employeeRanges.length} ranges from Firebase`);

        // Re-apply filter to current view
        performTableSearch();
    });
}

// =====================================================
// TAG MANAGEMENT FUNCTIONS
// =====================================================
async function loadAvailableTags() {
    try {
        const cached = window.cacheManager.get("tags", "tags");
        if (cached) {
            console.log("[TAG] Using cached tags");
            availableTags = cached;
            window.availableTags = availableTags; // Export to window
            populateTagFilter(); // Populate filter dropdown
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
        window.availableTags = availableTags; // Export to window
        window.cacheManager.set("tags", availableTags, "tags");
        console.log(`[TAG] Loaded ${availableTags.length} tags from API`);
        populateTagFilter(); // Populate filter dropdown
    } catch (error) {
        console.error("[TAG] Error loading tags:", error);
        availableTags = [];
        window.availableTags = availableTags; // Export to window
    }
}

async function refreshTags() {
    const btn = document.querySelector('.tag-btn-refresh');
    const icon = btn ? btn.querySelector('i') : null;

    try {
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');

        console.log("[TAG] Refreshing tags from TPOS...");
        const headers = await window.tokenManager.getAuthHeader();

        // Use $top=1000 to ensure we get all tags (current count ~302)
        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$format=json&$count=true&$top=1000",
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
        const newTags = data.value || [];

        console.log(`[TAG] Fetched ${newTags.length} tags from TPOS`);

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(newTags);
            console.log('[TAG] Saved tags to Firebase settings/tags');
        }

        // Update local state
        availableTags = newTags;
        window.availableTags = availableTags;
        window.cacheManager.set("tags", availableTags, "tags");

        // Update UI
        populateTagFilter();
        renderTagList(document.getElementById("tagSearchInput").value);

        if (window.notificationManager) {
            window.notificationManager.success(`Đã cập nhật ${newTags.length} tags thành công!`);
        } else {
            alert(`✅ Đã cập nhật ${newTags.length} tags thành công!`);
        }

    } catch (error) {
        console.error("[TAG] Error refreshing tags:", error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi cập nhật tags: ${error.message}`);
        } else {
            alert(`❌ Lỗi cập nhật tags: ${error.message}`);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

function populateTagFilter() {
    const tagFilterOptions = document.getElementById('tagFilterOptions');
    if (!tagFilterOptions) {
        console.log('[TAG-FILTER] tagFilterOptions element not found');
        return;
    }

    // Clear existing options
    tagFilterOptions.innerHTML = '';

    // Add "Tất cả" option
    const allOption = document.createElement('div');
    allOption.className = 'dropdown-option selected';
    allOption.dataset.value = 'all';
    allOption.innerHTML = '<span>Tất cả</span>';
    allOption.onclick = () => selectTagFilter('all', 'Tất cả');
    tagFilterOptions.appendChild(allOption);

    // Add tag options
    if (availableTags && availableTags.length > 0) {
        availableTags.forEach(tag => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = tag.Id;

            // Create color dot
            const colorDot = tag.Color ? `<span style="width: 10px; height: 10px; background-color: ${tag.Color}; border-radius: 50%; display: inline-block;"></span>` : '';

            option.innerHTML = `${colorDot} <span>${tag.Name || 'Unnamed Tag'}</span>`;
            option.onclick = () => selectTagFilter(tag.Id, tag.Name);
            tagFilterOptions.appendChild(option);
        });
        console.log(`[TAG-FILTER] Populated ${availableTags.length} tags in filter dropdown`);
    } else {
        console.log('[TAG-FILTER] No tags available to populate');
    }
}

// --- Searchable Dropdown Functions ---

function toggleTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    const input = document.getElementById('tagFilterInput');
    if (container) {
        container.classList.toggle('show');
        if (container.classList.contains('show') && input) {
            input.focus();
        }
    }
}

function showTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    if (container) container.classList.add('show');
}

function hideTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    if (container) container.classList.remove('show');
}

function filterTagDropdown() {
    const input = document.getElementById('tagFilterInput');
    const filter = input.value.toLowerCase();
    const options = document.getElementById('tagFilterOptions').getElementsByClassName('dropdown-option');

    for (let i = 0; i < options.length; i++) {
        const span = options[i].getElementsByTagName("span")[0];
        if (span) {
            const txtValue = span.textContent || span.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                options[i].style.display = "";
            } else {
                options[i].style.display = "none";
            }
        }
    }
}

function selectTagFilter(value, name) {
    // Update hidden input
    const hiddenInput = document.getElementById('tagFilter');
    if (hiddenInput) hiddenInput.value = value;

    // Update selected display
    const selectedDisplay = document.getElementById('tagFilterSelected');
    if (selectedDisplay) {
        selectedDisplay.innerHTML = `<span>${name || 'Tất cả'}</span> <i class="fas fa-chevron-down"></i>`;
    }

    // Update selected class in options
    const options = document.getElementById('tagFilterOptions').getElementsByClassName('dropdown-option');
    for (let i = 0; i < options.length; i++) {
        if (options[i].dataset.value == value) {
            options[i].classList.add('selected');
        } else {
            options[i].classList.remove('selected');
        }
    }

    // Hide dropdown
    hideTagDropdown();

    // Trigger search
    performTableSearch();
}

// Close dropdown when clicking outside
window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('tagFilterDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        hideTagDropdown();
    }
});

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    const order = allData.find((o) => o.Id === orderId);
    currentOrderTags = order && order.Tags ? JSON.parse(order.Tags) : [];

    renderTagList();
    updateSelectedTagsDisplay();
    document.getElementById("tagModal").classList.add("show");

    // Focus on search input
    setTimeout(() => {
        document.getElementById("tagSearchInput").focus();
    }, 100);
}

function closeTagModal() {
    document.getElementById("tagModal").classList.remove("show");
    document.getElementById("tagSearchInput").value = "";
    currentEditingOrderId = null;
    currentOrderTags = [];
    pendingDeleteTagIndex = -1;
}

function renderTagList(searchQuery = "") {
    const tagList = document.getElementById("tagList");
    if (availableTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-exclamation-circle"></i><p>Không có tag nào</p></div>`;
        return;
    }

    // Filter out selected tags and apply search query
    const filteredTags = availableTags.filter((tag) => {
        // Don't show already selected tags
        const isSelected = currentOrderTags.some((t) => t.Id === tag.Id);
        if (isSelected) return false;

        // Apply search filter
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
        .map((tag, index) => {
            const isFirstItem = index === 0;
            return `
            <div class="tag-dropdown-item ${isFirstItem ? 'highlighted' : ''}" onclick="toggleTag(${tag.Id})" data-tag-id="${tag.Id}">
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
    renderTagList(document.getElementById("tagSearchInput").value);
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById("selectedTagsPills");
    if (currentOrderTags.length === 0) {
        container.innerHTML = '';
        pendingDeleteTagIndex = -1;
        return;
    }
    container.innerHTML = currentOrderTags
        .map(
            (tag, index) => {
                const isPendingDelete = index === pendingDeleteTagIndex;
                const bgColor = isPendingDelete ? '#ef4444' : '#3b82f6'; // Red if pending delete, blue otherwise
                return `
        <span class="selected-tag-pill ${isPendingDelete ? 'deletion-pending' : ''}" style="background-color: ${bgColor}" data-tag-index="${index}">
            ${tag.Name}
            <button class="selected-tag-remove" onclick="event.stopPropagation(); removeTag(${index})" title="Xóa tag">
                ✕
            </button>
        </span>`;
            }
        )
        .join("");
}

function filterTags() {
    renderTagList(document.getElementById("tagSearchInput").value);
}

function removeTag(index) {
    if (index >= 0 && index < currentOrderTags.length) {
        currentOrderTags.splice(index, 1);
        pendingDeleteTagIndex = -1;
        updateSelectedTagsDisplay();
        renderTagList(document.getElementById("tagSearchInput").value);
    }
}

function handleTagInputKeydown(event) {
    const inputValue = document.getElementById("tagSearchInput").value;

    if (event.key === 'Enter') {
        event.preventDefault();

        // Find the highlighted tag (first one in the list)
        const highlightedTag = document.querySelector('.tag-dropdown-item.highlighted');
        if (highlightedTag) {
            const tagId = highlightedTag.getAttribute('data-tag-id');
            if (tagId) {
                toggleTag(parseInt(tagId));
                // Clear search input after selecting
                document.getElementById("tagSearchInput").value = "";
                // Re-render to show all available tags again
                renderTagList("");
                pendingDeleteTagIndex = -1;
            }
        }
    } else if (event.key === 'Backspace' && inputValue === '') {
        event.preventDefault();

        if (currentOrderTags.length === 0) return;

        if (pendingDeleteTagIndex >= 0) {
            // Second backspace - delete the tag
            removeTag(pendingDeleteTagIndex);
        } else {
            // First backspace - mark last tag for deletion
            pendingDeleteTagIndex = currentOrderTags.length - 1;
            updateSelectedTagsDisplay();
        }
    } else {
        // Any other key resets the pending delete
        if (pendingDeleteTagIndex >= 0) {
            pendingDeleteTagIndex = -1;
            updateSelectedTagsDisplay();
        }
    }
}

function toggleQuickAccess(tagName, buttonElement) {
    if (!window.quickTagManager) {
        console.error('[TAG] Quick tag manager not available');
        return;
    }

    const isActive = window.quickTagManager.toggleQuickTag(tagName);

    // Update button state
    if (isActive) {
        buttonElement.classList.add('active');
        buttonElement.title = 'Bỏ khỏi chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`⭐ Đã thêm "${tagName}" vào chọn nhanh`, 'success');
        }
    } else {
        buttonElement.classList.remove('active');
        buttonElement.title = 'Thêm vào chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`Đã bỏ "${tagName}" khỏi chọn nhanh`, 'info');
        }
    }

    console.log(`[TAG] Quick access toggled for "${tagName}": ${isActive ? 'ADDED' : 'REMOVED'}`);
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

            // Store original orders with necessary chat info
            const originalOrders = groupOrders.map(order => ({
                Id: order.Id,
                Name: order.Name,
                Code: order.Code,
                SessionIndex: order.SessionIndex,
                Facebook_ASUserId: order.Facebook_ASUserId,
                Facebook_PostId: order.Facebook_PostId,
                Telephone: order.Telephone
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
    // Check if user is admin (checkLogin === 0)
    let isAdmin = window.authManager && window.authManager.hasPermission(0);

    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUserType = auth && auth.userType ? auth.userType : null;
    const currentDisplayName = auth && auth.displayName ? auth.displayName : null;
    const currentUserId = auth && auth.id ? auth.id : null;

    // Fallback: Check username string for Admin
    if (!isAdmin && currentUserType) {
        const lowerName = currentUserType.toLowerCase();
        if (lowerName.includes('admin') || lowerName.includes('quản trị') || lowerName.includes('administrator')) {
            isAdmin = true;
            console.log('[FILTER] User identified as Admin by name check');
        }
    }

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
                // Convert both to string to handle type mismatch (tagFilter is string, tag.Id might be number)
                return orderTags.some(tag => String(tag.Id) === String(tagFilter));
            } catch (e) {
                return false;
            }
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

async function reloadTableData() {
    const btn = document.getElementById('reloadTableBtn');
    const icon = btn ? btn.querySelector('i') : null;

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        if (!selectedCampaign?.campaignId && !selectedCampaign?.campaignIds) {
            if (window.notificationManager) {
                window.notificationManager.warning("Vui lòng chọn chiến dịch trước khi tải lại");
            } else {
                alert("Vui lòng chọn chiến dịch trước khi tải lại");
            }
            return;
        }

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

        const PAGE_SIZE = 1000; // API fetch size for background loading
        const INITIAL_PAGE_SIZE = 50; // Smaller size for instant first load
        const UPDATE_EVERY = 200; // Update UI every 200 orders
        let skip = 0;
        let hasMore = true;
        allData = [];
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

            performTableSearch(); // Re-apply filters and merge with new chat data
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

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
                        console.log('[PROGRESSIVE] Background loading completed');
                        performTableSearch(); // Final merge and render
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

    // 4. Re-apply all filters and re-render table
    // This ensures realtime filter updates (e.g., removing a tag will hide the order if filtering by that tag)
    performTableSearch();

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
    if (displayedData.length === 0) {
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML =
            '<tr><td colspan="16" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }

    // Check if user is admin
    let isAdmin = window.authManager && window.authManager.hasPermission(0);

    // Fallback: Check username string for Admin
    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUserType = auth && auth.userType ? auth.userType : null;
    if (!isAdmin && currentUserType) {
        const lowerName = currentUserType.toLowerCase();
        if (lowerName.includes('admin') || lowerName.includes('quản trị') || lowerName.includes('administrator')) {
            isAdmin = true;
        }
    }

    // Group by employee if ranges are configured AND user is NOT admin
    if (!isAdmin && employeeRanges.length > 0) {
        renderByEmployee();
    } else {
        renderAllOrders();
    }

    // Apply column visibility after rendering
    if (window.columnVisibility) {
        window.columnVisibility.initialize();
    }
}

function renderAllOrders() {
    const tableContainer = document.getElementById('tableContainer');

    // Show the default table wrapper
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'block';
    }

    // Remove any existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // Render all orders in the default table
    // Render all orders in the default table
    const tbody = document.getElementById("tableBody");

    // INFINITE SCROLL: Render only first batch
    renderedCount = INITIAL_RENDER_COUNT;
    const initialData = displayedData.slice(0, renderedCount);
    tbody.innerHTML = initialData.map(createRowHTML).join("");

    // Add spacer if there are more items
    if (displayedData.length > renderedCount) {
        const spacer = document.createElement('tr');
        spacer.id = 'table-spacer';
        spacer.innerHTML = `<td colspan="16" style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i> Đang tải thêm...
        </td>`;
        tbody.appendChild(spacer);
    }
}

// =====================================================
// INFINITE SCROLL LOGIC
// =====================================================
const INITIAL_RENDER_COUNT = 50;
const LOAD_MORE_COUNT = 50;
let renderedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    const tableWrapper = document.getElementById("tableWrapper");
    if (tableWrapper) {
        tableWrapper.addEventListener('scroll', handleTableScroll);
    }
});

function handleTableScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;

    // Check if scrolled near bottom (within 200px)
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        loadMoreRows();
    }
}

function loadMoreRows() {
    // Check if we have more data to render
    if (renderedCount >= displayedData.length) return;

    const tbody = document.getElementById("tableBody");
    const spacer = document.getElementById("table-spacer");

    // Remove spacer temporarily
    if (spacer) spacer.remove();

    // Calculate next batch
    const nextBatch = displayedData.slice(renderedCount, renderedCount + LOAD_MORE_COUNT);
    renderedCount += nextBatch.length;

    // Append new rows
    const fragment = document.createDocumentFragment();
    nextBatch.forEach(order => {
        const tr = document.createElement('tr');
        // Use a temporary container to parse HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${createRowHTML(order)}</tbody></table>`;
        const newRow = tempDiv.querySelector('tr');
        if (newRow) {
            fragment.appendChild(newRow);
        }
    });

    tbody.appendChild(fragment);

    // Apply column visibility to newly added rows
    if (window.columnVisibility) {
        const settings = window.columnVisibility.load();
        window.columnVisibility.apply(settings);
    }

    // Add spacer back if still have more
    if (renderedCount < displayedData.length) {
        const newSpacer = document.createElement('tr');
        newSpacer.id = 'table-spacer';
        newSpacer.innerHTML = `<td colspan="16" style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i> Đang tải thêm...
        </td>`;
        tbody.appendChild(newSpacer);
    }
}

function renderByEmployee() {
    // Group data by employee
    const dataByEmployee = {};

    // Initialize groups for each employee
    employeeRanges.forEach(range => {
        dataByEmployee[range.name] = [];
    });

    // Add "Khác" category for orders without employee
    dataByEmployee['Khác'] = [];

    // Group orders by employee
    displayedData.forEach(order => {
        const employeeName = getEmployeeName(order.SessionIndex) || 'Khác';
        if (!dataByEmployee[employeeName]) {
            dataByEmployee[employeeName] = [];
        }
        dataByEmployee[employeeName].push(order);
    });

    // Get ordered list of employees
    const orderedEmployees = employeeRanges.map(r => r.name).filter(name => dataByEmployee[name].length > 0);

    // Add "Khác" at the end if it has data
    if (dataByEmployee['Khác'].length > 0) {
        orderedEmployees.push('Khác');
    }

    // Hide the default table container
    const tableContainer = document.getElementById('tableContainer');
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'none';
    }

    // Remove existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // Render each employee section
    orderedEmployees.forEach(employeeName => {
        const orders = dataByEmployee[employeeName];
        const totalAmount = orders.reduce((sum, order) => sum + (order.TotalAmount || 0), 0);
        const totalQuantity = orders.reduce((sum, order) => sum + (order.TotalQuantity || 0), 0);

        const section = document.createElement('div');
        section.className = 'employee-section';

        section.innerHTML = `
            <div class="employee-header">
                <div>
                    <div class="employee-name">
                        <i class="fas fa-user-circle"></i> ${employeeName}
                    </div>
                    <div class="employee-stats">
                        ${orders.length} đơn hàng • ${totalQuantity} sản phẩm • ${totalAmount.toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="employee-total">
                    ${orders.length} đơn
                </div>
            </div>
            <div class="employee-table-wrapper">
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" class="employee-select-all" data-employee="${employeeName}" /></th>
                                <th data-column="stt">STT</th>
                                <th data-column="employee" style="width: 90px;">Nhân viên</th>
                                <th data-column="tag">TAG</th>
                                <th data-column="order-code">Mã ĐH</th>
                                <th data-column="customer">Khách hàng</th>
                                <th data-column="messages">Tin nhắn</th>
                                <th data-column="comments">Bình luận</th>
                                <th data-column="phone">SĐT</th>
                                <th data-column="address">Địa chỉ</th>
                                <th data-column="notes">Ghi chú</th>
                                <th data-column="total">Tổng tiền</th>
                                <th data-column="quantity">SL</th>
                                <th data-column="created-date">Ngày tạo</th>
                                <th data-column="status">Trạng thái</th>
                                <th data-column="actions">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.map(createRowHTML).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        tableContainer.appendChild(section);
    });

    // Add event listeners for employee select all checkboxes
    const employeeSelectAlls = tableContainer.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const section = this.closest('.employee-section');
            const checkboxes = section.querySelectorAll('tbody input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = this.checked);
            updateActionButtons();
        });
    });
}

function createRowHTML(order) {
    if (!order || !order.Id) return "";
    let tagsHTML = "";
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                tagsHTML = parseOrderTags(order.Tags, order.Id, order.Code);
            }
        } catch (e) { }
    }
    const partnerStatusHTML = formatPartnerStatus(order.PartnerStatusText, order.PartnerId);
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

    // Get employee name for STT
    const employeeName = getEmployeeName(order.SessionIndex);
    const employeeHTML = employeeName
        ? `<span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${employeeName}</span>`
        : '<span style="color: #9ca3af;">−</span>';

    return `
        <tr class="${rowClass} ${mergedClass}">
            <td><input type="checkbox" value="${order.Id}" ${selectedOrderIds.has(order.Id) ? 'checked' : ''} /></td>
            <td data-column="stt">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span>${order.SessionIndex || ""}</span>
                    ${mergedIcon}
                </div>
            </td>
            <td data-column="employee" style="text-align: center;">${employeeHTML}</td>
            <td data-column="tag">
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                    <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                        <i class="fas fa-tags"></i>
                    </button>
                    ${tagsHTML}
                </div>
            </td>
            <td data-column="order-code">
                <span>${highlight(order.Code)}</span>
            </td>
            <td data-column="customer"><div>${highlight(order.Name)}</div>${partnerStatusHTML}</td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="phone">${highlight(order.Telephone)}</td>
            <td data-column="address">${highlight(order.Address)}</td>
            <td data-column="notes">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(order.Note) : highlight(order.Note)}</td>
            <td data-column="total">${(order.TotalAmount || 0).toLocaleString("vi-VN")}đ</td>
            <td data-column="quantity">${order.TotalQuantity || 0}</td>
            <td data-column="created-date">${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td data-column="status"><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}" style="cursor: pointer;" onclick="openOrderStatusModal('${order.Id}', '${order.Status}')" data-order-id="${order.Id}" title="Click để thay đổi trạng thái">${highlight(order.StatusText || order.Status)}</span></td>
            <td data-column="actions">
                <button class="btn-edit-icon" onclick="openEditModal('${order.TargetOrderId || order.Id}')" title="Chỉnh sửa đơn hàng ${isMerged ? '(STT ' + order.TargetSTT + ')' : ''}">
                    <i class="fas fa-edit"></i>
                </button>
                ${order.noteEdited ? '<span class="note-edited-badge" style="margin-left: 4px;" title="Ghi chú đã được sửa">✏️</span>' : ''}
            </td>
        </tr>`;
}

// Helper: Format message preview with icon
function formatMessagePreview(chatInfo) {
    let displayMessage = '−'; // Default to dash
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

    // Return formatted message with icon
    return messageIcon ? `${messageIcon} ${displayMessage}` : displayMessage;
}

// Helper: Render multi-customer messages/comments (merged order with different customers)
// Shows multiple lines, one per customer with their largest STT
function renderMultiCustomerMessages(order, columnType = 'messages') {
    const rows = [];

    // For each customer group, find order with largest STT and get its message
    order.CustomerGroups.forEach(customerGroup => {
        // Get the order with largest STT (already sorted in customerGroups)
        const largestSTTOrder = customerGroup.orders[0]; // First order is largest STT

        // Find full order object from OriginalOrders
        const fullOrder = order.OriginalOrders.find(o => o.Id === largestSTTOrder.id);
        if (!fullOrder || !largestSTTOrder.psid || !largestSTTOrder.channelId) {
            return; // Skip this customer if no valid data
        }

        // Get message or comment
        const messageInfo = columnType === 'messages'
            ? window.chatDataManager.getLastMessageForOrder(fullOrder)
            : window.chatDataManager.getLastCommentForOrder(largestSTTOrder.channelId, largestSTTOrder.psid, fullOrder);

        // Format message preview
        const displayMessage = formatMessagePreview(messageInfo);
        const unreadBadge = messageInfo.hasUnread ? '<span class="unread-badge"></span>' : '';
        const fontWeight = messageInfo.hasUnread ? '700' : '400';
        const color = messageInfo.hasUnread ? '#111827' : '#6b7280';

        // Create click handler - use 'message' or 'comment' as type param
        const typeParam = columnType === 'messages' ? 'message' : 'comment';
        const clickHandler = `openChatModal('${largestSTTOrder.id}', '${largestSTTOrder.channelId}', '${largestSTTOrder.psid}', '${typeParam}')`;

        rows.push(`
            <div class="multi-customer-message-row" onclick="${clickHandler}" style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; cursor: pointer; transition: background-color 0.2s;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 3px; font-weight: 500;">
                    ${customerGroup.name} • STT ${largestSTTOrder.stt}
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${displayMessage}
                    </span>
                </div>
                ${messageInfo.unreadCount > 0 ? `<div style="font-size: 11px; color: #ef4444; font-weight: 600; margin-top: 2px;">${messageInfo.unreadCount} tin mới</div>` : ''}
            </div>
        `);
    });

    // If no rows, show dash
    if (rows.length === 0) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    return `
        <td data-column="${columnType}" style="padding: 0; vertical-align: top;">
            <div style="max-height: 200px; overflow-y: auto;">
                ${rows.join('')}
            </div>
        </td>
    `;
}

// Helper: Render single customer message/comment (merged order with same customer)
// Shows only the message/comment from the order with largest STT
function renderSingleCustomerMessage(order, columnType = 'messages') {
    // Get the order with largest STT (stored in TargetOrderId)
    const targetOrder = order.OriginalOrders.find(o => o.Id === order.TargetOrderId);

    if (!targetOrder || !targetOrder.Facebook_ASUserId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get chat info for this specific order
    const chatInfo = window.chatDataManager.getChatInfoForOrder(targetOrder);

    if (!chatInfo.psid || !chatInfo.channelId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get message or comment based on type
    const messageInfo = columnType === 'messages'
        ? window.chatDataManager.getLastMessageForOrder(targetOrder)
        : window.chatDataManager.getLastCommentForOrder(chatInfo.channelId, chatInfo.psid, targetOrder);

    // Render using the existing renderChatColumnWithData function
    // But we need to pass the targetOrder ID for the click handler
    return renderChatColumnWithData(targetOrder, messageInfo, chatInfo.channelId, chatInfo.psid, columnType);
}

// Render messages column only (not comments)
function renderMessagesColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Check if this is a merged order with customer grouping info
    if (order.IsMerged && order.CustomerGroups) {
        if (order.IsSingleCustomer) {
            // Single customer: show only message from order with largest STT
            return renderSingleCustomerMessage(order, 'messages');
        } else {
            // Multiple customers: show multiple lines
            return renderMultiCustomerMessages(order, 'messages');
        }
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

    // If no message, show dash but keep it clickable (via renderChatColumnWithData)
    // if (!messageInfo.message && !messageInfo.hasUnread) {
    //    return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    // }

    // Render with message data
    return renderChatColumnWithData(order, messageInfo, channelId, psid, 'messages');
}

// Render comments column only (not messages)
function renderCommentsColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Check if this is a merged order with customer grouping info
    if (order.IsMerged && order.CustomerGroups) {
        if (order.IsSingleCustomer) {
            // Single customer: show only comment from order with largest STT
            return renderSingleCustomerMessage(order, 'comments');
        } else {
            // Multiple customers: show multiple lines
            return renderMultiCustomerMessages(order, 'comments');
        }
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

    // If no comment, show dash but keep it clickable
    // if (!commentInfo.message) {
    //    return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    // }

    // Render with comment data
    return renderChatColumnWithData(order, commentInfo, channelId, psid, 'comments');
}

// Helper function to render chat column with data (for both messages and comments)
function renderChatColumnWithData(order, chatInfo, channelId, psid, columnType = 'messages') {
    // Format message based on type
    let displayMessage = '−'; // Default to dash
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
    // For merged orders, use the TargetOrderId (order with largest STT) instead of the combined Id
    const orderIdToUse = order.IsMerged && order.TargetOrderId ? order.TargetOrderId : order.Id;
    const clickHandler = columnType === 'messages'
        ? `openChatModal('${orderIdToUse}', '${channelId}', '${psid}')`
        : `openChatModal('${orderIdToUse}', '${channelId}', '${psid}', 'comment')`;

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

function parseOrderTags(tagsJson, orderId, orderCode) {
    try {
        const tags = JSON.parse(tagsJson);
        if (!Array.isArray(tags) || tags.length === 0) return "";
        return tags
            .map(
                (tag) =>
                    `<div style="margin-bottom: 2px;"><span class="order-tag" style="background-color: ${tag.Color || "#6b7280"}; cursor: pointer;" onclick="openTagModal('${orderId}', '${orderCode}'); event.stopPropagation();" title="Quản lý tag">${tag.Name || ""}</span></div>`,
            )
            .join("");
    } catch (e) {
        return "";
    }
}

function formatPartnerStatus(statusText, partnerId) {
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
    const cursorStyle = partnerId ? 'cursor: pointer;' : '';
    const onclickAttr = partnerId ? `onclick="openPartnerStatusModal('${partnerId}', '${statusText}')"` : '';
    const titleAttr = partnerId ? 'title="Click để thay đổi trạng thái"' : '';
    const dataAttr = partnerId ? `data-partner-id="${partnerId}"` : '';

    return `<span class="partner-status" style="background-color: ${color}; ${cursorStyle}" ${onclickAttr} ${titleAttr} ${dataAttr}>${statusText}</span>`;
}

// --- Partner Status Modal Logic ---

const PARTNER_STATUS_OPTIONS = [
    { value: "#5cb85c", text: "Bình thường" },
    { value: "#d1332e", text: "Bom hàng" },
    { value: "#f0ad4e", text: "Cảnh báo" },
    { value: "#5cb85c", text: "Khách sỉ" },
    { value: "#d9534f", text: "Nguy hiểm" },
    { value: "#5bc0de", text: "Thân thiết" },
    { value: "#337ab7", text: "Vip" },
    { value: "#5bc0deff", text: "VIP" }
];

function openPartnerStatusModal(partnerId, currentStatus) {
    const modal = document.getElementById('partnerStatusModal');
    const container = document.getElementById('partnerStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    PARTNER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.text === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.value};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updatePartnerStatus(partnerId, option.value, option.text);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closePartnerStatusModal() {
    const modal = document.getElementById('partnerStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updatePartnerStatus(partnerId, color, text) {
    closePartnerStatusModal();

    // Optimistic update (optional, but good for UX)
    // For now, we'll wait for API success to ensure consistency

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/Partner(${partnerId})/ODataService.UpdateStatus`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=UTF-8',
                'accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({ status: `${color}_${text}` })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.PartnerId) === String(partnerId)) {
                order.PartnerStatus = text;
                order.PartnerStatusText = text;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.partner-status[data-partner-id="${partnerId}"]`);
        badges.forEach(badge => {
            badge.style.backgroundColor = color;
            badge.innerText = text;
            badge.setAttribute('onclick', `openPartnerStatusModal('${partnerId}', '${text}')`);
        });

    } catch (error) {
        console.error('[PARTNER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

// --- Order Status Modal Logic ---

const ORDER_STATUS_OPTIONS = [
    { value: "Đơn hàng", text: "Đơn hàng", color: "#5cb85c" },
    { value: "Hủy", text: "Huỷ bỏ", color: "#d1332e" },
    { value: "Nháp", text: "Nháp", color: "#f0ad4e" }
];

function openOrderStatusModal(orderId, currentStatus) {
    const modal = document.getElementById('orderStatusModal');
    const container = document.getElementById('orderStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    ORDER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.value === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.color};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updateOrderStatus(orderId, option.value, option.text, option.color);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closeOrderStatusModal() {
    const modal = document.getElementById('orderStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updateOrderStatus(orderId, newValue, newText, newColor) {
    closeOrderStatusModal();

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${orderId}&Status=${encodeURIComponent(newValue)}`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=utf-8',
                'accept': '*/*'
            },
            body: null
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái đơn hàng thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.Id) === String(orderId)) {
                order.Status = newValue;
                order.StatusText = newText;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.status-badge[data-order-id="${orderId}"]`);
        badges.forEach(badge => {
            badge.className = `status-badge ${newValue === "Draft" ? "status-draft" : "status-order"}`;
            // Update color manually if needed, or rely on class. 
            // The existing logic uses classes, but we might want to force the color if it's custom.
            // For now, let's just update the text and rely on re-render or class.
            // Actually, the user provided specific colors for the options.
            // Let's apply the color directly for immediate feedback.
            badge.style.backgroundColor = newColor; // This might override class styles
            badge.innerText = newText || newValue;
            badge.setAttribute('onclick', `openOrderStatusModal('${orderId}', '${newValue}')`);
        });

        // If we want to be safe and consistent with filters:
        // performTableSearch(); // Optional, but inline is faster.

    } catch (error) {
        console.error('[ORDER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

function updateStats() {
    const totalAmount = displayedData.reduce(
        (sum, order) => sum + (order.TotalAmount || 0),
        0,
    );

    // Calculate merged order statistics
    const mergedOrders = displayedData.filter(order => order.IsMerged === true);
    const totalOriginalOrders = displayedData.reduce((sum, order) => {
        return sum + (order.MergedCount || 1);
    }, 0);

    // Update total orders count
    document.getElementById("totalOrdersCount").textContent =
        filteredData.length.toLocaleString("vi-VN");

    // Update merged orders info
    const mergedInfoElement = document.getElementById("mergedOrdersInfo");
    if (mergedOrders.length > 0) {
        mergedInfoElement.textContent =
            `${mergedOrders.length} đơn gộp (${totalOriginalOrders} đơn gốc)`;
        mergedInfoElement.style.color = "#f59e0b"; // Orange color for emphasis
    } else {
        mergedInfoElement.textContent = "-";
        mergedInfoElement.style.color = "#9ca3af"; // Gray color
    }

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
// =====================================================
// HELPER: CHECK IF ORDER SHOULD BE SELECTABLE
// =====================================================
// SELECTION MANAGEMENT (STATE-BASED)
// =====================================================


function isOrderSelectable(orderId) {
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
    const isChecked = document.getElementById("selectAll").checked;

    if (isChecked) {
        // Select ALL displayed data (not just visible rows)
        displayedData.forEach(order => {
            selectedOrderIds.add(order.Id);
        });
    } else {
        // Deselect ALL
        selectedOrderIds.clear();
    }

    // Update visible checkboxes
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
    checkboxes.forEach((cb) => {
        cb.checked = isChecked;
    });

    // Also update employee select all checkboxes
    const employeeSelectAlls = document.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(cb => {
        cb.checked = isChecked;
    });

    // Trigger update action buttons
    updateActionButtons();
}

// Global event listener for checkbox changes (Delegation)
document.addEventListener('change', function (e) {
    if (e.target.matches('tbody input[type="checkbox"]')) {
        const orderId = e.target.value;
        if (e.target.checked) {
            selectedOrderIds.add(orderId);
        } else {
            selectedOrderIds.delete(orderId);
            // Uncheck "Select All" if one is unchecked
            document.getElementById("selectAll").checked = false;
        }
        updateActionButtons();
    }
});

// =====================================================
// UPDATE ACTION BUTTONS VISIBILITY
// =====================================================
function updateActionButtons() {
    const actionButtonsSection = document.getElementById('actionButtonsSection');
    const selectedCountSpan = document.getElementById('selectedOrdersCount');
    const checkedCount = selectedOrderIds.size;

    if (checkedCount > 0) {
        actionButtonsSection.style.display = 'flex';
        selectedCountSpan.textContent = checkedCount.toLocaleString('vi-VN');
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
                    <button class="edit-tab-btn" onclick="switchEditTab('invoices')"><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoice_history')"><i class="fas fa-history"></i> Lịch sử hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('history')"><i class="fas fa-clock"></i> Lịch sử chỉnh sửa</button>
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

let hasUnsavedOrderChanges = false;

async function openEditModal(orderId) {
    currentEditOrderId = orderId;
    hasUnsavedOrderChanges = false; // Reset dirty flag
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
        invoice_history: renderInvoiceHistoryTab,
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
                <div class="info-field">
                    <div class="info-label">Điện thoại</div>
                    <div class="info-value">
                        <input type="text" class="form-control" value="${data.Telephone || ""}" 
                            onchange="updateOrderInfo('Telephone', this.value)" 
                            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Địa chỉ đầy đủ</div>
                    <div class="info-value">
                        <textarea class="form-control" 
                            onchange="updateOrderInfo('Address', this.value)" 
                            style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; min-height: 60px; resize: vertical;">${data.Address || ""}</textarea>
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1; margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <div class="info-label" style="color: #2563eb; font-weight: 600;">Tra cứu địa chỉ</div>
                    <div class="info-value">
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" id="fullAddressLookupInput" class="form-control" placeholder="Nhập địa chỉ đầy đủ (VD: 28/6 phạm văn chiêu...)" 
                                style="flex: 1; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px;"
                                onkeydown="if(event.key === 'Enter') handleFullAddressLookup()">
                            <button type="button" class="btn-primary" onclick="handleFullAddressLookup()" style="padding: 6px 12px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-magic"></i> Tìm Full
                            </button>
                        </div>
                        <div id="addressLookupResults" style="display: none; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 400px; overflow-y: auto; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <!-- Results will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-shopping-cart"></i> Thông tin đơn hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Mã đơn</div><div class="info-value highlight">${data.Code || ""}</div></div>
                <div class="info-field"><div class="info-label">Trạng thái</div><div class="info-value"><span class="status-badge-large ${data.Status === "Draft" ? "status-badge-draft" : "status-badge-order"}">${data.StatusText || data.Status || ""}</span></div></div>
                <div class="info-field"><div class="info-label">Tổng tiền</div><div class="info-value highlight">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</div></div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú</div>
                    <div class="info-value">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(data.Note || "") : (data.Note || "")}</div>
                </div>
            </div>
        </div>`;
}

function updateOrderInfo(field, value) {
    if (!currentEditOrderData) return;
    currentEditOrderData[field] = value;
    hasUnsavedOrderChanges = true; // Set dirty flag

    // Show quick feedback
    if (window.showSaveIndicator) {
        showSaveIndicator("success", "Đã cập nhật thông tin (chưa lưu)");
    } else if (window.notificationManager) {
        window.notificationManager.show("Đã cập nhật thông tin (chưa lưu)", "info");
    }
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

async function renderInvoiceHistoryTab(data) {
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử hóa đơn...</div>
        </div>
    `;

    // Return loading first, then fetch data
    setTimeout(async () => {
        try {
            const partnerId = data.PartnerId || (data.Partner && data.Partner.Id);
            if (!partnerId) {
                throw new Error("Không tìm thấy thông tin khách hàng (PartnerId)");
            }
            await fetchAndDisplayInvoiceHistory(partnerId);
        } catch (error) {
            console.error('[INVOICE HISTORY] Error:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử hóa đơn</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('invoice_history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

async function fetchAndDisplayInvoiceHistory(partnerId) {
    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId?partnerId=${partnerId}&fromDate=${startDate.toISOString()}&toDate=${endDate.toISOString()}`;

    console.log('[INVOICE HISTORY] Fetching history for partner:', partnerId);

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

    const data = await response.json();
    console.log('[INVOICE HISTORY] Received data:', data);
    document.getElementById('editModalBody').innerHTML = renderInvoiceHistoryTable(data.value || []);
}

function renderInvoiceHistoryTable(invoices) {
    if (invoices.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có lịch sử hóa đơn</p>
                <p style="color: #9ca3af; font-size: 13px;">Khách hàng chưa có đơn hàng nào trong 30 ngày qua</p>
            </div>
        `;
    }

    const rows = invoices.map((inv, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><a href="https://tomato.tpos.vn/#/app/fastsaleorder/invoiceform1?id=${inv.Id}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">${inv.Number || 'N/A'}</a></td>
            <td style="text-align: right; font-weight: 600;">${(inv.AmountTotal || 0).toLocaleString('vi-VN')}đ</td>
            <td style="text-align: center;">
                <span class="status-badge-large ${inv.State === 'completed' ? 'status-badge-paid' : 'status-badge-order'}">
                    ${inv.ShowState || inv.State || 'N/A'}
                </span>
            </td>
            <td>${inv.DateInvoice ? new Date(inv.DateInvoice).toLocaleString('vi-VN') : 'N/A'}</td>
        </tr>
    `).join('');

    return `
        <div class="info-card">
            <h4><i class="fas fa-history"></i> Lịch sử hóa đơn (30 ngày gần nhất)</h4>
            <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                <table class="table" style="margin-top: 16px; width: 100%;">
                    <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                        <tr>
                            <th style="width: 50px;">#</th>
                            <th>Mã hóa đơn</th>
                            <th style="text-align: right;">Tổng tiền</th>
                            <th style="text-align: center;">Trạng thái</th>
                            <th>Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
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

    // Try to decode encoded strings first
    if (window.DecodingUtility) {
        // Find potential encoded strings (long, no spaces, Base64URL chars)
        description = description.replace(/\b([A-Za-z0-9\-_=]{20,})\b/g, (match) => {
            // Check if it can be decoded
            const decoded = window.DecodingUtility.decodeProductLine(match);
            if (decoded) {
                // Use the utility to format it
                return window.DecodingUtility.formatNoteWithDecodedData(match);
            }
            return match;
        });
    }

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
    if (hasUnsavedOrderChanges) {
        const confirmClose = window.CustomPopup ?
            window.CustomPopup.confirm("Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng không?", "Cảnh báo") :
            confirm("Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng không?");

        // Handle promise if CustomPopup returns one, or boolean from native confirm
        if (confirmClose instanceof Promise) {
            confirmClose.then(result => {
                if (result) {
                    forceCloseEditModal();
                }
            });
            return;
        } else if (!confirmClose) {
            return;
        }
    }
    forceCloseEditModal();
}

function forceCloseEditModal() {
    document.getElementById("editOrderModal").classList.remove("show");
    currentEditOrderData = null;
    currentEditOrderId = null;
    hasUnsavedOrderChanges = false;
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

        hasUnsavedOrderChanges = false; // Reset dirty flag after save

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
// Make these global so they can be accessed from other modules (e.g., chat-modal-products.js)
window.currentChatChannelId = null;
window.currentChatPSID = null;
window.currentConversationId = null;  // Lưu conversation ID cho reply

// Module-scoped variables (not needed externally)
let currentChatType = null;
let currentChatCursor = null;
let allChatMessages = [];
let skipWebhookUpdate = false; // Flag to skip webhook updates right after sending message
let isSendingMessage = false; // Flag to prevent double message sending
let allChatComments = [];
let isLoadingMoreMessages = false;
let currentOrder = null;  // Lưu order hiện tại để gửi reply
let currentParentCommentId = null;  // Lưu parent comment ID
let currentPostId = null; // Lưu post ID của comment đang reply

window.openChatModal = async function (orderId, channelId, psid, type = 'message') {
    console.log('[CHAT] Opening modal:', { orderId, channelId, psid, type });
    if (!channelId || !psid) {
        alert('Không có thông tin tin nhắn cho đơn hàng này');
        return;
    }

    // Reset pagination state
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    currentChatType = type;
    currentChatCursor = null;
    allChatMessages = [];
    allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Get order info
    // First try to find order by exact ID match
    let order = allData.find(o => o.Id === orderId);
    // If not found, check if this orderId is in a merged order's OriginalIds
    if (!order) {
        order = allData.find(o => o.IsMerged && o.OriginalIds && o.OriginalIds.includes(orderId));
    }
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

    // Initialize chat modal products with order data
    // Fetch full order data with product details
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        if (response.ok) {
            const fullOrderData = await response.json();
            // Initialize products panel with full order data
            if (typeof window.initChatModalProducts === 'function') {
                window.initChatModalProducts(fullOrderData);
            }
        }
    } catch (error) {
        console.error('[CHAT] Error loading order details:', error);
        // Continue with basic order data
        if (typeof window.initChatModalProducts === 'function') {
            window.initChatModalProducts(order);
        }
    }

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
    const chatInput = document.getElementById('chatReplyInput');
    chatInput.value = '';

    // Reset pasted image
    currentPastedImage = null;
    window.currentPastedImage = null;
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
    }

    // Remove old listener to avoid duplicates (if any) and add new one
    chatInput.removeEventListener('paste', handleChatInputPaste);
    chatInput.addEventListener('paste', handleChatInputPaste);

    // Remove old Enter key listener and add new one with proper event handling
    chatInput.removeEventListener('keydown', handleChatInputKeyDown);
    chatInput.addEventListener('keydown', handleChatInputKeyDown);

    // Add input event listener for auto-resize
    chatInput.removeEventListener('input', handleChatInputInput);
    chatInput.addEventListener('input', handleChatInputInput);

    if (type === 'comment') {
        markReadBtn.style.display = 'none';

        // Disable input and send button by default for comments
        // Only enable when replying to a specific comment
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        chatInput.style.background = '#f3f4f6';
        chatInput.style.cursor = 'not-allowed';
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
    } else {
        markReadBtn.style.display = 'none'; // Keep hidden for now or show if needed
    }

    // Fetch messages or comments based on type
    try {
        if (type === 'comment') {
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

            // Construct conversationId from postId and parentCommentId
            // Format: postId_commentId (e.g., "1382798016618291_817929370998475")
            const facebookPostId = order.Facebook_PostId || currentPostId;
            if (facebookPostId && currentParentCommentId) {
                // Extract just the post ID (without pageId prefix)
                const postId = extractPostId(facebookPostId);
                window.currentConversationId = `${postId}_${currentParentCommentId}`;
                console.log(`[CHAT] Constructed conversationId for comment: ${window.currentConversationId} (from ${facebookPostId})`);
            } else {
                // Fallback: Try to get from Pancake data manager
                if (window.pancakeDataManager) {
                    const pancakeCommentInfo = window.pancakeDataManager.getLastCommentForOrder(order);
                    if (pancakeCommentInfo && pancakeCommentInfo.conversationId) {
                        window.currentConversationId = pancakeCommentInfo.conversationId;
                        console.log(`[CHAT] Got conversationId from Pancake: ${window.currentConversationId}`);
                    }
                }
            }

            console.log(`[CHAT] Initial load: ${allChatComments.length} comments, cursor: ${currentChatCursor}`);

            renderComments(allChatComments, true);

            // Setup infinite scroll for comments
            setupChatInfiniteScroll();

            // Setup new message indicator listener
            setupNewMessageIndicatorListener();
        } else {
            // Fetch messages
            const chatInfo = window.chatDataManager.getLastMessageForOrder(order);

            // Try to get conversation ID from Pancake data manager if available
            if (window.pancakeDataManager) {
                // We might need a method to get conversation ID for messages too
                // For now, let's try to construct it or find it in chatInfo
                // Usually conversationId is pageId_psid
                window.currentConversationId = `${channelId}_${psid}`;
                console.log(`[CHAT] Constructed conversationId: ${window.currentConversationId}`);
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

            // Setup new message indicator listener
            setupNewMessageIndicatorListener();
        }

        /* LEGACY CODE REMOVED
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
        */



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

window.closeChatModal = async function () {
    // Cleanup unsaved held products
    if (typeof window.cleanupHeldProducts === 'function') {
        await window.cleanupHeldProducts();
    }

    document.getElementById('chatModal').classList.remove('show');

    // Clean up scroll listener
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleChatScroll);
    }

    // Reset pagination state
    window.currentChatChannelId = null;
    window.currentChatPSID = null;
    currentChatType = null;
    currentChatCursor = null;
    allChatMessages = [];
    allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Hide reply preview
    const replyPreviewContainer = document.getElementById('chatReplyPreviewContainer');
    if (replyPreviewContainer) {
        replyPreviewContainer.style.display = 'none';
    }

    // Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}

/**
 * Handle paste event on chat input
 */
function handleChatInputPaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let hasImage = false;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            hasImage = true;
            event.preventDefault(); // Prevent default paste to avoid clearing text input

            const blob = item.getAsFile();
            currentPastedImage = blob;

            // Disable text input when image is present
            const chatInput = document.getElementById('chatReplyInput');
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.style.opacity = '0.6';
                chatInput.style.cursor = 'not-allowed';
                chatInput.placeholder = 'Xóa hoặc gửi ảnh để nhập tin nhắn...';
            }

            // Show preview
            const reader = new FileReader();
            reader.onload = function (e) {
                const previewContainer = document.getElementById('chatImagePreviewContainer');
                if (previewContainer) {
                    previewContainer.style.display = 'flex';
                    previewContainer.style.alignItems = 'center';
                    previewContainer.style.justifyContent = 'space-between';

                    previewContainer.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${e.target.result}" style="height: 50px; border-radius: 4px; border: 1px solid #ddd;">
                            <span style="font-size: 12px; color: #666;">${blob.name || 'Image'} (${Math.round(blob.size / 1024)} KB)</span>
                        </div>
                        <button onclick="clearPastedImage()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px;">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                }
            };
            reader.readAsDataURL(blob);
            break; // Only handle first image
        }
    }
}

/**
 * Clear pasted image
 */
window.clearPastedImage = function () {
    currentPastedImage = null;
    window.currentPastedImage = null;
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
    }

    // Re-enable text input when image is cleared
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.style.opacity = '1';
        chatInput.style.cursor = 'text';
        chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        chatInput.focus();
    }
}

// Message Queue Management
window.chatMessageQueue = window.chatMessageQueue || [];
window.chatIsProcessingQueue = false;

// Reply Message State
window.currentReplyingToMessage = null; // Stores the message being replied to

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scrollHeight, but don't exceed max-height
    const maxHeight = 120; // matches max-height in CSS
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
}

/**
 * Handle Enter key in chat input - prevent double submission, allow Shift+Enter for newlines
 */
function handleChatInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default form submission and double trigger
        event.stopPropagation(); // Stop event bubbling

        // Call sendReplyComment only once
        window.sendReplyComment();
    }
    // Shift+Enter will use default behavior (insert newline)
    // After newline is inserted, resize will happen via input event
}

/**
 * Handle input event for auto-resize
 */
function handleChatInputInput(event) {
    autoResizeTextarea(event.target);
}

/**
 * Set a message to reply to
 */
window.setReplyMessage = function (message) {
    window.currentReplyingToMessage = message;

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText) {
        // Extract text from message (handle both text and HTML)
        const messageText = extractMessageText(message);
        const truncated = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

        previewText.textContent = truncated;
        previewContainer.style.display = 'block';
    }

    // Focus input
    const input = document.getElementById('chatReplyInput');
    if (input) input.focus();

    console.log('[REPLY] Set reply to message:', message.id || message.Id);
};

/**
 * Cancel replying to a message
 */
window.cancelReplyMessage = function () {
    window.currentReplyingToMessage = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    console.log('[REPLY] Cancelled reply');
};

/**
 * Cancel replying to a comment
 */
window.cancelReplyComment = function () {
    // Clear reply state
    currentParentCommentId = null;
    currentPostId = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    // Reset input and disable it (only allow replying to comments)
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        input.value = ''; // Clear input content
        input.disabled = true;
        input.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        input.style.background = '#f3f4f6';
        input.style.cursor = 'not-allowed';
    }

    // Disable send button
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
    }

    console.log('[REPLY] Cancelled comment reply');
};

/**
 * Cancel reply - works for both messages and comments
 */
window.cancelReply = function () {
    // Check if we're in comment or message mode
    if (currentChatType === 'comment') {
        window.cancelReplyComment();
    } else {
        window.cancelReplyMessage();
    }
};

/**
 * Extract text from message object (handles both text and HTML)
 */
function extractMessageText(message) {
    // Try different message fields
    let text = message.message || message.Message || message.text || '';

    // If HTML, extract text
    if (text.includes('<')) {
        const div = document.createElement('div');
        div.innerHTML = text;
        text = div.textContent || div.innerText || '';
    }

    return text.trim();
}

/**
 * Show/Hide sending indicator in chat modal
 */
window.showChatSendingIndicator = function(text = 'Đang gửi...', queueCount = 0) {
    const indicator = document.getElementById('chatSendingIndicator');
    const textSpan = document.getElementById('chatSendingText');
    const queueSpan = document.getElementById('chatQueueCount');

    if (indicator) {
        indicator.style.display = 'flex';
        if (textSpan) textSpan.textContent = text;
        if (queueSpan) {
            if (queueCount > 0) {
                queueSpan.textContent = `+${queueCount}`;
                queueSpan.style.display = 'block';
            } else {
                queueSpan.style.display = 'none';
            }
        }
    }
}

window.hideChatSendingIndicator = function() {
    const indicator = document.getElementById('chatSendingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

/**
 * Process message queue
 */
async function processChatMessageQueue() {
    if (window.chatIsProcessingQueue || window.chatMessageQueue.length === 0) {
        return;
    }

    window.chatIsProcessingQueue = true;

    while (window.chatMessageQueue.length > 0) {
        const queueCount = window.chatMessageQueue.length - 1;
        showChatSendingIndicator('Đang gửi...', queueCount);

        const messageData = window.chatMessageQueue.shift();
        try {
            await sendReplyCommentInternal(messageData);
        } catch (error) {
            console.error('[QUEUE] Error sending message:', error);
            // Continue with next message even if this one fails
        }
    }

    window.chatIsProcessingQueue = false;
    hideChatSendingIndicator();
}

/**
 * Gửi reply comment theo Pancake API (Public wrapper - add to queue)
 * Flow: POST /conversations/{conversationId}/messages -> POST /sync_comments -> Refresh
 */
window.sendReplyComment = async function () {
    // Prevent double sending (e.g., from Enter key + button click)
    if (isSendingMessage) {
        console.log('[SEND-REPLY] Already sending, skipping duplicate call');
        return;
    }
    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature to message (only for text messages, not images/files)
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate
        if (!message && !currentPastedImage && !window.currentPastedImage) {
            alert('Vui lòng nhập tin nhắn hoặc dán ảnh!');
            return;
        }

        // Validate required info
        const missingInfo = !currentOrder || !window.currentConversationId || !window.currentChatChannelId;
        if (missingInfo) {
            alert('Thiếu thông tin để gửi tin nhắn. Vui lòng đóng và mở lại modal.');
            console.error('[SEND-REPLY] Missing required info:', {
                currentOrder: !!currentOrder,
                currentConversationId: !!window.currentConversationId,
                currentChatChannelId: !!window.currentChatChannelId,
                currentChatType
            });
            return;
        }

        // Capture replied message ID before clearing state
        const repliedMessageId = window.currentReplyingToMessage ?
            (window.currentReplyingToMessage.id || window.currentReplyingToMessage.Id || null) : null;

        // Add message to queue
        console.log('[QUEUE] Adding message to queue', { repliedMessageId });
        window.chatMessageQueue.push({
            message,
            pastedImage: currentPastedImage || window.currentPastedImage,
            order: currentOrder,
            conversationId: window.currentConversationId,
            channelId: window.currentChatChannelId,
            chatType: currentChatType,
            parentCommentId: currentParentCommentId,
            postId: currentPostId || currentOrder.Facebook_PostId,
            repliedMessageId: repliedMessageId  // Add replied message ID
        });

        // Clear input immediately for next message
        messageInput.value = '';
        // Reset textarea height to default
        messageInput.style.height = 'auto';
        currentPastedImage = null;
        window.currentPastedImage = null;
        const previewContainer = document.getElementById('chatImagePreviewContainer');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }

        // Re-enable text input when image is sent (only for message mode, not comment mode)
        if (messageInput && currentChatType !== 'comment') {
            messageInput.disabled = false;
            messageInput.style.opacity = '1';
            messageInput.style.cursor = 'text';
            messageInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        }

        // Clear reply state (works for both messages and comments)
        window.cancelReply();

        // Process queue
        processChatMessageQueue();
    } finally {
        // Reset flag after a short delay to allow the function to complete
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

/**
 * Get image dimensions from blob/file
 * @param {Blob|File} blob
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = function() {
            URL.revokeObjectURL(url);
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };

        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

/**
 * Internal function to actually send the message (called by queue processor)
 */
async function sendReplyCommentInternal(messageData) {
    const { message, pastedImage, order, conversationId, channelId, chatType, parentCommentId, postId, repliedMessageId } = messageData;

    const isMessage = chatType === 'message';

    try {
        // Get Pancake token
        const token = await window.pancakeTokenManager.getToken();
        if (!token) {
            throw new Error('Không tìm thấy Pancake token. Vui lòng cài đặt token trong Settings.');
        }

        // Get Facebook PSID from order
        const facebookPsid = order.Facebook_ASUserId;
        if (!facebookPsid) {
            throw new Error('Không tìm thấy Facebook PSID trong đơn hàng');
        }

        // Get customer UUID from Pancake conversation data
        let pancakeCustomerUuid = null;
        if (window.pancakeDataManager) {
            const conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);
            if (conversation && conversation.customers && conversation.customers.length > 0) {
                // Extract UUID from first customer in the array
                pancakeCustomerUuid = conversation.customers[0].uuid || conversation.customers[0].id;
                console.log('[SEND-REPLY] Got Pancake customer UUID:', pancakeCustomerUuid);
            }
        }

        if (!pancakeCustomerUuid) {
            console.warn('[SEND-REPLY] Could not get Pancake customer UUID, will skip inbox_preview');
        }

        // Also get TPOS PartnerId for reference
        const customerId = order.PartnerId || (order.Partner && order.Partner.Id);

        // Check 24-hour window for INBOX messages only (skip check, already validated)
        showChatSendingIndicator('Kiểm tra 24h...');

        // Step 0: Upload image if exists (pasted image)
        let imageData = null;
        let finalMessage = message;

        // Handle pasted image
        if (pastedImage) {
            console.log('[SEND-REPLY] Uploading pasted image...');
            showChatSendingIndicator('Đang tải ảnh...');
            try {
                // Upload image and get dimensions in parallel
                const [uploadResult, dimensions] = await Promise.all([
                    window.pancakeDataManager.uploadImage(channelId, pastedImage),
                    getImageDimensions(pastedImage)
                ]);

                imageData = {
                    content_url: uploadResult.content_url,
                    content_id: uploadResult.id,
                    width: dimensions.width,
                    height: dimensions.height
                };

                console.log('[SEND-REPLY] Image uploaded:', imageData);
            } catch (uploadError) {
                console.error('[SEND-REPLY] Image upload failed:', uploadError);
                throw new Error('Tải ảnh thất bại: ' + uploadError.message);
            }
        }

        const pageId = channelId;

        console.log('[SEND-REPLY] Sending reply comment...', {
            pageId,
            conversationId,
            postId,
            parentCommentId,
            message: finalMessage,
            imageData
        });

        // Step 0.5: Fetch inbox_preview to get thread_id, thread_key, from_id for private_replies
        let threadId = null;
        let threadKey = null;
        let fromId = null;

        if (chatType === 'comment' && parentCommentId && pancakeCustomerUuid) {
            showChatSendingIndicator('Lấy thông tin thread...');
            console.log('[SEND-REPLY] Fetching inbox_preview for private_replies...');

            try {
                const inboxPreviewUrl = window.API_CONFIG.buildUrl.pancake(
                    `pages/${pageId}/customers/${pancakeCustomerUuid}/inbox_preview`,
                    `access_token=${token}`
                );

                const inboxResponse = await API_CONFIG.smartFetch(inboxPreviewUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (!inboxResponse.ok) {
                    console.error('[SEND-REPLY] Failed to fetch inbox_preview:', inboxResponse.status);
                    throw new Error(`Lấy thông tin inbox thất bại: ${inboxResponse.status}`);
                }

                const inboxData = await inboxResponse.json();
                console.log('[SEND-REPLY] inbox_preview response:', inboxData);

                if (inboxData.success) {
                    // Extract thread info from response
                    threadId = inboxData.thread_id_preview || inboxData.thread_id;
                    threadKey = inboxData.thread_key_preview || inboxData.thread_key;

                    // Get from_id from the first customer message (not from page)
                    if (inboxData.data && inboxData.data.length > 0) {
                        const customerMessage = inboxData.data.find(msg =>
                            msg.from && msg.from.id && msg.from.id !== pageId
                        );

                        if (customerMessage) {
                            fromId = customerMessage.from.id;
                        }
                    }

                    console.log('[SEND-REPLY] Got thread info:', { threadId, threadKey, fromId });
                }
            } catch (inboxError) {
                console.error('[SEND-REPLY] inbox_preview fetch error:', inboxError);
                // Don't throw, fall back to regular reply_comment if needed
            }
        }

        showChatSendingIndicator('Đang gửi...');

        // Step 1: POST reply (comment or message)
        const replyUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${pageId}/conversations/${conversationId}/messages`,
            `access_token=${token}`
        );

        let fetchOptions;

        if (chatType === 'message') {
            // Payload for sending a message (reply_inbox)
            // When sending with image, use FormData (multipart/form-data)
            // When sending text only, use JSON
            if (imageData) {
                const formData = new FormData();
                formData.append('action', 'reply_inbox');
                formData.append('message', finalMessage);
                formData.append('customer_id', customerId);
                formData.append('send_by_platform', 'web');
                formData.append('content_url', imageData.content_url);
                formData.append('content_id', imageData.content_id);
                formData.append('width', imageData.width.toString());
                formData.append('height', imageData.height.toString());

                if (repliedMessageId) {
                    formData.append('replied_message_id', repliedMessageId);
                    console.log('[SEND-REPLY] Adding replied_message_id:', repliedMessageId);
                }

                fetchOptions = {
                    method: 'POST',
                    body: formData
                };

                console.log('[SEND-REPLY] Using FormData (multipart) for image message');
            } else {
                const replyBody = {
                    action: "reply_inbox",
                    message: finalMessage,
                    customer_id: customerId,
                    send_by_platform: "web"
                };

                if (repliedMessageId) {
                    replyBody.replied_message_id = repliedMessageId;
                    console.log('[SEND-REPLY] Adding replied_message_id:', repliedMessageId);
                }

                fetchOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(replyBody)
                };

                console.log('[SEND-REPLY] Using JSON for text-only message');
            }
        } else {
            // Use private_replies for all comment replies
            const replyBody = {
                action: "private_replies",
                message_id: parentCommentId,
                post_id: postId,
                message: finalMessage,
                need_thread_id: false
            };

            // Add thread info if available
            if (threadId && threadKey && fromId) {
                replyBody.thread_id_preview = threadId;
                replyBody.thread_key_preview = threadKey;
                replyBody.from_id = fromId;
                console.log('[SEND-REPLY] Using private_replies with thread info');
            } else {
                console.warn('[SEND-REPLY] Missing thread info, sending without it');
            }

            // Add image content_url if available
            if (imageData) {
                replyBody.content_url = imageData.content_url;
            }

            fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(replyBody)
            };

            console.log('[SEND-REPLY] Using private_replies action');
        }

        console.log('[SEND-REPLY] POST URL:', replyUrl);
        console.log('[SEND-REPLY] Request options:', fetchOptions);

        const replyResponse = await API_CONFIG.smartFetch(replyUrl, fetchOptions);

        if (!replyResponse.ok) {
            const errorText = await replyResponse.text();
            console.error('[SEND-REPLY] Reply failed:', errorText);
            throw new Error(`Gửi tin nhắn thất bại: ${replyResponse.status} ${replyResponse.statusText}`);
        }

        const replyData = await replyResponse.json();
        console.log('[SEND-REPLY] Reply response:', replyData);

        if (!replyData.success) {
            console.error('[SEND-REPLY] API Error Data:', replyData);
            const errorMessage = replyData.error || replyData.message || replyData.reason || 'Unknown error';
            throw new Error('Gửi tin nhắn thất bại: ' + errorMessage + ' (Success: false)');

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

        // Optimistic Update: Show message immediately with correct format
        const now = new Date().toISOString();

        // Set flag to skip webhook updates (will be reset after refetch)
        skipWebhookUpdate = true;

        if (chatType === 'message') {
            const tempMessage = {
                Id: `temp_${Date.now()}`,
                id: `temp_${Date.now()}`, // Both formats for compatibility
                Message: message,
                CreatedTime: now,
                IsOwner: true,
                is_temp: true
            };

            // Add image attachment if exists
            if (imageData) {
                tempMessage.Attachments = [{
                    Type: 'image',
                    Payload: { Url: imageData.content_url }
                }];
            }

            allChatMessages.push(tempMessage);
            renderChatMessages(allChatMessages, true);

            console.log('[SEND-REPLY] Added optimistic message to UI');
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
                ParentId: parentCommentId
            };
            allChatComments.push(tempComment);
            renderComments(allChatComments, true);
        }

        // Step 3: Refresh data (Fetch latest from API) and replace temp messages
        console.log(`[SEND-REPLY] Refreshing ${chatType}s...`);
        setTimeout(async () => {
            try {
                if (chatType === 'message' && window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                    if (response.messages && response.messages.length > 0) {
                        // Replace entire array with fresh data from API (simpler and more reliable)
                        allChatMessages = response.messages;

                        // Don't force scroll to bottom - let wasAtBottom logic decide
                        renderChatMessages(allChatMessages, false);
                        console.log('[SEND-REPLY] Replaced temp messages with real messages');
                    }
                } else if (chatType === 'comment' && window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchComments(channelId, window.currentChatPSID);
                    if (response.comments && response.comments.length > 0) {
                        // Remove temp comments before replacing
                        allChatComments = allChatComments.filter(c => !c.is_temp);

                        // Merge with new comments from API
                        response.comments.forEach(newComment => {
                            const exists = allChatComments.some(c => c.Id === newComment.Id);
                            if (!exists) {
                                allChatComments.push(newComment);
                            }
                        });

                        // Don't force scroll to bottom - let wasAtBottom logic decide
                        renderComments(allChatComments, false);
                    }
                }
            } finally {
                // Reset flag to allow webhook updates again
                skipWebhookUpdate = false;
            }
        }, 300); // Reduced delay for faster update

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn thành công!', 'success');
        }

        console.log('[SEND-REPLY] ✅ Reply sent successfully');

    } catch (error) {
        console.error('[SEND-REPLY] ❌ Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gửi tin nhắn: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi khi gửi tin nhắn: ' + error.message);
        }
        throw error; // Re-throw để queue processor biết có lỗi
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

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText && comment) {
        // Extract comment text (handle both text and HTML)
        let commentText = comment.Message || comment.message || comment.text || '';

        // If HTML, extract text content
        if (commentText.includes('<')) {
            const div = document.createElement('div');
            div.innerHTML = commentText;
            commentText = div.textContent || div.innerText || '';
        }

        // Get sender name
        const senderName = comment.FromName || comment.from?.name || 'Khách hàng';

        // Show preview with sender name and truncated message
        const maxLength = 100;
        const truncatedText = commentText.length > maxLength
            ? commentText.substring(0, maxLength) + '...'
            : commentText;

        previewText.innerHTML = `<strong>${senderName}:</strong> ${truncatedText}`;
        previewContainer.style.display = 'block';

        console.log('[REPLY] Showing preview for comment:', senderName, truncatedText);
    }

    // Focus input and enable it for replying
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        // Enable input and send button
        input.disabled = false;
        input.style.cursor = 'text';
        input.style.background = '#f9fafb';
        input.focus();
        input.placeholder = `Nhập nội dung trả lời...`;

        // Enable send button
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
        }

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

        // Handle attachments (images and audio)
        if (msg.Attachments && msg.Attachments.length > 0) {
            msg.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments (lowercase 'attachments' with 'mime_type')
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        // Get message ID for reply
        const messageId = msg.id || msg.Id || null;
        const messageJSON = JSON.stringify(msg).replace(/"/g, '&quot;');

        // Add reply button for customer messages (not owner)
        const replyButton = !isOwner && messageId ? `
            <button onclick='window.setReplyMessage(JSON.parse(this.getAttribute("data-message")))'
                    data-message='${messageJSON}'
                    class="chat-message-reply-btn"
                    style="position: absolute; top: 4px; right: 4px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; display: none; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s;"
                    onmouseover="this.style.background='white'; this.style.transform='scale(1.1)';"
                    onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.transform='scale(1)';">
                <i class="fas fa-reply" style="font-size: 11px; color: #6b7280;"></i>
            </button>
        ` : '';

        return `
            <div class="chat-message ${alignClass}" onmouseenter="this.querySelector('.chat-message-reply-btn')?.style.setProperty('display', 'flex')" onmouseleave="this.querySelector('.chat-message-reply-btn')?.style.setProperty('display', 'none')">
                <div class="chat-bubble ${bgClass}" style="position: relative;">
                    ${content}
                    <p class="chat-message-time">${formatTime(msg.CreatedTime)}</p>
                    ${replyButton}
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

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${messagesHTML}</div>`;

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalBody.scrollTop = modalBody.scrollHeight;
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
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

        // Handle attachments (images and audio) for comments
        if (comment.Attachments && comment.Attachments.length > 0) {
            comment.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments for comments
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(att => {
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                }
            });
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

                let replyContent = '';
                if (reply.Message) {
                    replyContent = `<p class="chat-message-text">${reply.Message}</p>`;
                }

                // Handle attachments in replies
                if (reply.Attachments && reply.Attachments.length > 0) {
                    reply.Attachments.forEach(att => {
                        if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                            replyContent += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                        } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.Payload.Url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        }
                    });
                }

                // Handle Pancake API format in replies
                if (reply.attachments && reply.attachments.length > 0) {
                    reply.attachments.forEach(att => {
                        if (att.mime_type === 'audio/mp4' && att.file_url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.file_url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                            replyContent += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                        }
                    });
                }

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px;">
                        <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                            ${replyContent}
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

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalBody.scrollTop = modalBody.scrollHeight;
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

// =====================================================
// NEW MESSAGE INDICATOR
// =====================================================

/**
 * Show visual indicator for new messages (without flash animation)
 */
function showNewMessageIndicator() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Check if indicator already exists
    let indicator = document.getElementById('chatNewMessageIndicator');

    if (!indicator) {
        // Create indicator element
        indicator = document.createElement('div');
        indicator.id = 'chatNewMessageIndicator';
        indicator.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 20px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                border-radius: 24px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.5)';"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)';">
                <i class="fas fa-arrow-down" style="font-size: 12px;"></i>
                <span>Tin nhắn mới</span>
            </div>
        `;

        // Position indicator at bottom center
        indicator.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10;
            display: none;
        `;

        // Scroll to bottom when clicked
        indicator.onclick = () => {
            modalBody.scrollTo({
                top: modalBody.scrollHeight,
                behavior: 'smooth'
            });
            indicator.style.display = 'none';
        };

        // Append to modal body's parent to position it correctly
        const chatModal = document.getElementById('chatModal');
        const modalContent = chatModal?.querySelector('.modal-body');
        if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.appendChild(indicator);
        }
    }

    // Show indicator with smooth appearance (no flash)
    indicator.style.display = 'block';
}

/**
 * Setup scroll listener to auto-hide indicator when user scrolls to bottom
 */
function setupNewMessageIndicatorListener() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    modalBody.addEventListener('scroll', () => {
        const isAtBottom = (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
        const indicator = document.getElementById('chatNewMessageIndicator');

        if (indicator && isAtBottom) {
            indicator.style.display = 'none';
        }
    });
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
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
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
            window.currentChatChannelId,
            window.currentChatPSID,
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
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
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
            window.currentChatChannelId,
            window.currentChatPSID,
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
    if (!window.currentChatChannelId || !window.currentChatPSID) return;

    try {
        const markReadBtn = document.getElementById('chatMarkReadBtn');
        markReadBtn.disabled = true;
        markReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

        await window.chatDataManager.markAsSeen(window.currentChatChannelId, window.currentChatPSID);

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
// PRODUCT ENCODING/DECODING UTILITIES (for Note verification)
// =====================================================
const ENCODE_KEY = 'live';
const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

/**
 * Base64URL decode
 * @param {string} str - Base64URL encoded string
 * @returns {string} Decoded string
 */
function base64UrlDecode(str) {
    const padding = '='.repeat((4 - str.length % 4) % 4);
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
    const binary = atob(base64);
    return new TextDecoder().decode(
        Uint8Array.from(binary, c => c.charCodeAt(0))
    );
}

/**
 * Generate short checksum (6 characters)
 * @param {string} str - String to checksum
 * @returns {string} Checksum in base36 (6 chars)
 */
function shortChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * XOR decryption with key
 * @param {string} encoded - Base64 encoded encrypted text
 * @param {string} key - Decryption key
 * @returns {string} Decrypted text
 */
function xorDecrypt(encoded, key) {
    // Decode from base64
    const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }

    return new TextDecoder().decode(decrypted);
}

/**
 * Decode product line - supports both old and new formats
 * NEW FORMAT: Base64URL, comma separator, orderId, checksum
 * OLD FORMAT: Base64, pipe separator, no orderId
 * @param {string} encoded - Encoded string
 * @param {number} expectedOrderId - Expected order ID (for verification in new format)
 * @returns {object|null} { orderId?, productCode, quantity, price, timestamp } or null if invalid
 */
function decodeProductLine(encoded, expectedOrderId = null) {
    try {
        // Detect format by checking for Base64URL characters
        const isNewFormat = encoded.includes('-') || encoded.includes('_') || (!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

        if (isNewFormat) {
            // ===== NEW FORMAT: Base64URL + orderId + checksum =====
            try {
                // Base64URL decode
                const decrypted = base64UrlDecode(encoded);

                // XOR decrypt
                const fullData = xorDecrypt(decrypted, ENCODE_KEY);

                // Parse
                const parts = fullData.split(',');
                if (parts.length !== 6) {
                    // Not new format, fallback to old format
                    throw new Error('Not new format');
                }

                const [orderId, productCode, quantity, price, relativeTime, checksum] = parts;

                // Verify checksum
                const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
                if (checksum !== shortChecksum(data)) {
                    console.debug('[DECODE] Checksum mismatch - data may be corrupted');
                    return null;
                }

                // Verify order ID if provided
                if (expectedOrderId !== null && orderId !== expectedOrderId.toString()) {
                    console.debug(`[DECODE] OrderId mismatch: encoded=${orderId}, expected=${expectedOrderId}`);
                    return null;
                }

                // Convert relative timestamp back to absolute
                const timestamp = parseInt(relativeTime) * 1000 + BASE_TIME;

                return {
                    orderId: parseInt(orderId),
                    productCode,
                    quantity: parseInt(quantity),
                    price: parseFloat(price),
                    timestamp
                };
            } catch (newFormatError) {
                // Fallback to old format
                console.debug('[DECODE] New format decode failed, trying old format...');
            }
        }

        // ===== OLD FORMAT: Base64 + pipe separator =====
        const decoded = xorDecrypt(encoded, ENCODE_KEY);
        const parts = decoded.split('|');

        // Support both old format (3 parts) and old format with timestamp (4 parts)
        if (parts.length !== 3 && parts.length !== 4) return null;

        const result = {
            productCode: parts[0],
            quantity: parseInt(parts[1]),
            price: parseFloat(parts[2])
        };

        // Add timestamp if present
        if (parts.length === 4) {
            result.timestamp = parseInt(parts[3]);
        }

        return result;
    } catch (error) {
        console.debug('[DECODE] Decode error:', error);
        return null;
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
 * Check if note contains VALID encoded products (belongs to this order)
 * Verifies orderId to prevent cross-order copy attacks
 * @param {string} note - Order note
 * @param {number} expectedOrderId - Order ID to verify against
 * @returns {boolean} - True if has valid encoded products belonging to this order
 */
function hasValidEncodedProducts(note, expectedOrderId) {
    if (!note || !note.trim()) return false;

    const lines = note.split('\n');
    let foundValid = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Quick pattern check (NEW format: Base64URL - compact, no padding)
        const isNewFormat = /^[A-Za-z0-9_-]{40,65}$/.test(trimmed);

        // Quick pattern check (OLD format: Base64 with padding)
        const isOldFormat = /^[A-Za-z0-9+/]{50,80}={0,2}$/.test(trimmed);

        if (!isNewFormat && !isOldFormat) {
            continue; // Not an encoded line
        }

        try {
            // ===== NEW FORMAT: Has orderId → Verify! =====
            if (isNewFormat) {
                // Decode with expectedOrderId to verify
                const decoded = decodeProductLine(trimmed, expectedOrderId);

                if (decoded && decoded.orderId === expectedOrderId) {
                    // ✅ Valid encoded product for THIS order
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ✅ Valid encoded line for order #${expectedOrderId}`);
                } else {
                    // ⚠️ Encoded line from ANOTHER order (copy attack) or decode failed
                    // Try decode without verification to see original orderId
                    const decodedNoCheck = decodeProductLine(trimmed, null);
                    if (decodedNoCheck && decodedNoCheck.orderId) {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} contains COPIED encoded line from Order #${decodedNoCheck.orderId} - REJECTED`
                        );
                    } else {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} has invalid encoded line (checksum fail or corrupted)`
                        );
                    }
                }
            }

            // ===== OLD FORMAT: No orderId → Accept for backward compatibility =====
            else if (isOldFormat) {
                const decoded = decodeProductLine(trimmed);
                if (decoded && decoded.productCode) {
                    // Old format doesn't have orderId to verify
                    // Accept as valid (backward compatibility)
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ℹ️ Found old format encoded line (no orderId verification available)`);
                }
            }

        } catch (e) {
            // Decode failed, not a valid encoded line
            console.debug(`[NOTE-TRACKER] Failed to decode line: ${trimmed.substring(0, 20)}...`);
            continue;
        }
    }

    return foundValid;
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
            // No snapshot exists - only save if note has valid encoded products
            order.noteEdited = false;

            // ✅ NEW: Verify orderId in encoded products to prevent cross-order copy
            if (hasValidEncodedProducts(currentNote, orderId)) {
                // Has valid encoded products belonging to THIS order → Save snapshot
                console.log(`[NOTE-TRACKER] 📸 Saving snapshot for order #${orderId} (has valid encoded products)`);

                newSnapshotsToSave[orderId] = {
                    note: currentNote,
                    code: order.Code,
                    stt: order.SessionIndex,
                    timestamp: Date.now()
                };
            } else {
                // No valid encoded products → Skip saving snapshot
                if (currentNote) {
                    console.log(`[NOTE-TRACKER] ⏭️ Skipping order #${orderId} (no valid encoded products)`);
                }
            }
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

/**
 * Helper to extract just the post ID from a Facebook post identifier
 * Facebook_PostId format: "pageId_postId" (e.g., "117267091364524_1382798016618291")
 * Returns: just the postId part (e.g., "1382798016618291")
 */
function extractPostId(facebookPostId) {
    if (!facebookPostId) return null;

    // If it contains underscore, it's in format pageId_postId
    if (facebookPostId.includes('_')) {
        const parts = facebookPostId.split('_');
        // Return the second part (postId)
        return parts.length >= 2 ? parts[1] : facebookPostId;
    }

    // Otherwise return as-is (already just the postId)
    return facebookPostId;
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

    // 1. UPDATE DATA MANAGERS (Crucial for filters to work)
    if (window.pancakeDataManager) {
        const convType = conversation.type || 'INBOX';
        if (convType === 'INBOX') {
            if (psid) window.pancakeDataManager.inboxMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.inboxMapByFBID.set(conversation.from.id, conversation);
        } else if (convType === 'COMMENT') {
            if (psid) window.pancakeDataManager.commentMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.commentMapByFBID.set(conversation.from.id, conversation);
        }
    }

    // 2. CHECK FILTER
    // If filtering by read/unread, we MUST re-run search to show/hide rows
    const currentFilter = document.getElementById('conversationFilter') ? document.getElementById('conversationFilter').value : 'all';
    if (currentFilter === 'unread' || currentFilter === 'read') {
        console.log(`[TAB1] Realtime update with filter '${currentFilter}' - Triggering re-search`);
        performTableSearch();
        return; // Stop here, let search handle the rendering
    }

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

            // Add click event and styling
            const clickHandler = type === 'INBOX'
                ? `openChatModal('${order.Id}', '${pageId}', '${psid}')`
                : `openChatModal('${order.Id}', '${pageId}', '${psid}', 'comment')`;

            const tooltipText = type === 'INBOX'
                ? 'Click để xem toàn bộ tin nhắn'
                : 'Click để xem bình luận';

            cell.setAttribute('onclick', clickHandler);
            cell.style.cursor = 'pointer';
            cell.title = tooltipText;

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

    // 🔄 REALTIME CHAT MODAL UPDATE - COMPLETELY REWRITTEN
    const chatModal = document.getElementById('chatModal');
    const isChatModalOpen = chatModal && chatModal.classList.contains('show');

    if (isChatModalOpen) {
        // Normalize IDs for comparison
        const isMatchingPsid = String(window.currentChatPSID) === String(psid);
        const isMatchingChannel = String(window.currentChatChannelId) === String(pageId);
        const incomingType = type === 'INBOX' ? 'message' : 'comment';
        const isMatchingType = currentChatType === incomingType;

        if (isMatchingPsid && isMatchingChannel && isMatchingType) {
            // Skip webhook update if we just sent a message
            if (skipWebhookUpdate) {
                console.log('[CHAT MODAL] ⏭️ Skipping webhook (just sent message)');
                return;
            }

            console.log('[CHAT MODAL] 🔄 Realtime update detected - updating UI...');

            // Get modal body for scroll detection
            const modalBody = document.getElementById('chatModalBody');
            if (!modalBody) return;

            // Check if user was at bottom (100px threshold)
            const wasAtBottom = (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight) < 100;

            // Fetch ALL new messages/comments to update UI
            if (currentChatType === 'comment') {
                window.chatDataManager.fetchComments(pageId, psid, null).then(response => {
                    if (!response || !response.comments || response.comments.length === 0) {
                        console.log('[CHAT MODAL] ℹ️ No comments received');
                        return;
                    }

                    // Remove temp comments first
                    allChatComments = allChatComments.filter(c => !c.is_temp);

                    // Get ALL new comments that don't exist yet
                    const newComments = response.comments.filter(newComment => {
                        const newId = newComment.Id || newComment.id;
                        return !allChatComments.some(existing =>
                            (existing.Id === newId || existing.id === newId)
                        );
                    });

                    if (newComments.length > 0) {
                        console.log(`[CHAT MODAL] ✅ ${newComments.length} new comment(s) detected, adding to UI`);

                        // Add all new comments to beginning (renderComments reverses the array)
                        // Add in reverse order so newest appears first after unshift
                        newComments.reverse().forEach(comment => {
                            allChatComments.unshift(comment);
                        });

                        // Re-render with smart scroll
                        renderComments(allChatComments, wasAtBottom);

                        // Show indicator if user wasn't at bottom
                        if (!wasAtBottom) {
                            showNewMessageIndicator();
                        }
                    } else {
                        console.log('[CHAT MODAL] ℹ️ No new comments');
                    }
                }).catch(err => {
                    console.error('[CHAT MODAL] ❌ Error fetching comment:', err);
                });
            } else {
                window.chatDataManager.fetchMessages(pageId, psid, null).then(response => {
                    if (!response || !response.messages || response.messages.length === 0) {
                        console.log('[CHAT MODAL] ℹ️ No messages received');
                        return;
                    }

                    // Remove temp messages first
                    allChatMessages = allChatMessages.filter(m => !m.is_temp);

                    // Get ALL new messages that don't exist yet
                    const newMessages = response.messages.filter(newMsg => {
                        const newId = newMsg.Id || newMsg.id;
                        return !allChatMessages.some(existing =>
                            (existing.Id === newId || existing.id === newId)
                        );
                    });

                    if (newMessages.length > 0) {
                        console.log(`[CHAT MODAL] ✅ ${newMessages.length} new message(s) detected, adding to UI`);

                        // Add all new messages to beginning (renderChatMessages reverses the array)
                        // Add in reverse order so newest appears first after unshift
                        newMessages.reverse().forEach(msg => {
                            allChatMessages.unshift(msg);
                        });

                        // Re-render with smart scroll
                        renderChatMessages(allChatMessages, wasAtBottom);

                        // Show indicator if user wasn't at bottom
                        if (!wasAtBottom) {
                            showNewMessageIndicator();
                        }
                    } else {
                        console.log('[CHAT MODAL] ℹ️ No new messages');
                    }
                }).catch(err => {
                    console.error('[CHAT MODAL] ❌ Error fetching message:', err);
                });
            }
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
const quickProductSearchEl = document.getElementById('quickProductSearch');
if (quickProductSearchEl) {
    quickProductSearchEl.addEventListener('input', function (e) {
        const query = e.target.value;

        if (quickAddSearchTimeout) clearTimeout(quickAddSearchTimeout);

        if (!query || query.trim().length < 2) {
            const suggestionsEl = document.getElementById('quickProductSuggestions');
            if (suggestionsEl) suggestionsEl.style.display = 'none';
            return;
        }

        quickAddSearchTimeout = setTimeout(() => {
            if (window.enhancedProductSearchManager) {
                const results = window.enhancedProductSearchManager.search(query, 10);
                renderQuickAddSuggestions(results);
            }
        }, 300);
    });
}

// Hide suggestions on click outside
document.addEventListener('click', function (e) {
    const suggestions = document.getElementById('quickProductSuggestions');
    const searchInput = document.getElementById('quickProductSearch');

    if (suggestions && searchInput && e.target !== searchInput && !suggestions.contains(e.target)) {
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

/* LEGACY CODE REMOVED
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
*/

// --- Search Logic ---
var chatSearchTimeout = null;

function initChatProductSearch() {
    const input = document.getElementById("chatInlineProductSearch");
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
            const resultsDiv = document.getElementById("chatInlineSearchResults");
            if (resultsDiv) resultsDiv.style.display = "none";
            return;
        }

        chatSearchTimeout = setTimeout(() => performChatProductSearch(query), 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("chatInlineSearchResults");
        const searchContainer = input.closest('.chat-product-search-inline');
        if (dropdown && searchContainer && !searchContainer.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}

async function performChatProductSearch(query) {
    console.log("[CHAT-SEARCH] Performing search for:", query);
    const resultsDiv = document.getElementById("chatInlineSearchResults");
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
    const resultsDiv = document.getElementById("chatInlineSearchResults");
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

/* LEGACY CODE REMOVED
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
*/

// --- Action Logic ---

/* LEGACY CODE REMOVED
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
*/

/* LEGACY CODE REMOVED
function removeChatProduct(index) {
    if (confirm("Bạn có chắc muốn xóa sản phẩm này?")) {
        currentChatOrderDetails.splice(index, 1);
        renderChatProductsPanel();
        saveChatProductsToFirebase('shared', currentChatOrderDetails);
    }
}
*/

// =====================================================
// MERGE ORDER PRODUCTS API FUNCTIONS
// =====================================================

/**
 * Get order details with products from API
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Order data with Details array
 */
async function getOrderDetails(orderId) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[MERGE-API] Fetched order ${orderId} with ${data.Details?.length || 0} products`);
        return data;
    } catch (error) {
        console.error(`[MERGE-API] Error fetching order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Update order products via API
 * @param {string} orderId - Order ID
 * @param {Array} productDetails - Array of product details
 * @param {number} totalAmount - Total amount
 * @param {number} totalQuantity - Total quantity
 * @returns {Promise<Object>} Updated order data
 */
async function updateOrderProducts(orderId, productDetails, totalAmount, totalQuantity) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})`;

        // Prepare payload
        const payload = {
            Details: productDetails || [],
            TotalAmount: totalAmount || 0,
            TotalQuantity: totalQuantity || 0
        };

        const response = await API_CONFIG.smartFetch(apiUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[MERGE-API] Updated order ${orderId} with ${productDetails.length} products`);
        return data;
    } catch (error) {
        console.error(`[MERGE-API] Error updating order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Execute product merge for a single merged order
 * @param {Object} mergedOrder - Merged order object with TargetOrderId and SourceOrderIds
 * @returns {Promise<Object>} Merge result
 */
async function executeMergeOrderProducts(mergedOrder) {
    if (!mergedOrder.IsMerged || !mergedOrder.TargetOrderId || !mergedOrder.SourceOrderIds || mergedOrder.SourceOrderIds.length === 0) {
        console.log('[MERGE-API] Not a merged order or no source orders to merge');
        return { success: false, message: 'Not a merged order' };
    }

    try {
        console.log(`[MERGE-API] Starting merge for phone ${mergedOrder.Telephone}`);
        console.log(`[MERGE-API] Target: STT ${mergedOrder.TargetSTT} (${mergedOrder.TargetOrderId})`);
        console.log(`[MERGE-API] Sources: STT ${mergedOrder.SourceSTTs.join(', ')} (${mergedOrder.SourceOrderIds.length} orders)`);

        // Step 1: Fetch all order details
        const targetOrderData = await getOrderDetails(mergedOrder.TargetOrderId);
        const sourceOrdersData = await Promise.all(
            mergedOrder.SourceOrderIds.map(id => getOrderDetails(id))
        );

        // Step 2: Collect all products
        let allProducts = [...(targetOrderData.Details || [])];
        let totalAmount = targetOrderData.TotalAmount || 0;
        let totalQuantity = targetOrderData.TotalQuantity || 0;

        sourceOrdersData.forEach((sourceOrder, index) => {
            const sourceProducts = sourceOrder.Details || [];
            console.log(`[MERGE-API] Source STT ${mergedOrder.SourceSTTs[index]}: ${sourceProducts.length} products`);

            // Add source products to target
            allProducts.push(...sourceProducts);
            totalAmount += (sourceOrder.TotalAmount || 0);
            totalQuantity += (sourceOrder.TotalQuantity || 0);
        });

        console.log(`[MERGE-API] Total products to merge: ${allProducts.length}`);
        console.log(`[MERGE-API] Total amount: ${totalAmount}, Total quantity: ${totalQuantity}`);

        // Step 3: Update target order with all products
        await updateOrderProducts(mergedOrder.TargetOrderId, allProducts, totalAmount, totalQuantity);
        console.log(`[MERGE-API] ✅ Updated target order STT ${mergedOrder.TargetSTT} with ${allProducts.length} products`);

        // Step 4: Clear products from source orders
        for (let i = 0; i < mergedOrder.SourceOrderIds.length; i++) {
            const sourceId = mergedOrder.SourceOrderIds[i];
            const sourceSTT = mergedOrder.SourceSTTs[i];

            await updateOrderProducts(sourceId, [], 0, 0);
            console.log(`[MERGE-API] ✅ Cleared products from source order STT ${sourceSTT}`);
        }

        console.log(`[MERGE-API] ✅ Merge completed successfully!`);
        return {
            success: true,
            message: `Đã gộp ${sourceOrdersData.length} đơn vào STT ${mergedOrder.TargetSTT}`,
            targetSTT: mergedOrder.TargetSTT,
            sourceSTTs: mergedOrder.SourceSTTs,
            totalProducts: allProducts.length
        };

    } catch (error) {
        console.error('[MERGE-API] Error during merge:', error);
        return {
            success: false,
            message: 'Lỗi: ' + error.message,
            error: error
        };
    }
}

/**
 * Execute product merge for all merged orders in current displayed data
 * @returns {Promise<Object>} Bulk merge result
 */
async function executeBulkMergeOrderProducts() {
    try {
        // Find all merged orders in displayed data
        const mergedOrders = displayedData.filter(order => order.IsMerged === true);

        if (mergedOrders.length === 0) {
            alert('Không có đơn hàng nào cần gộp sản phẩm.');
            return { success: false, message: 'No merged orders found' };
        }

        const confirmMsg = `Bạn có chắc muốn gộp sản phẩm cho ${mergedOrders.length} đơn hàng đã merge?\n\n` +
            `Hành động này sẽ:\n` +
            `- Chuyển tất cả sản phẩm từ đơn STT nhỏ sang đơn STT lớn\n` +
            `- Xóa sản phẩm khỏi các đơn STT nhỏ`;

        if (!confirm(confirmMsg)) {
            return { success: false, message: 'Cancelled by user' };
        }

        // Show loading indicator
        if (window.notificationManager) {
            window.notificationManager.show(`Đang gộp sản phẩm cho ${mergedOrders.length} đơn hàng...`, 'info');
        }

        // Execute merge for each merged order
        const results = [];
        for (let i = 0; i < mergedOrders.length; i++) {
            const order = mergedOrders[i];
            console.log(`[MERGE-BULK] Processing ${i + 1}/${mergedOrders.length}: Phone ${order.Telephone}`);

            const result = await executeMergeOrderProducts(order);
            results.push({ order, result });

            // Small delay to avoid rate limiting
            if (i < mergedOrders.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Count successes and failures
        const successCount = results.filter(r => r.result.success).length;
        const failureCount = results.length - successCount;

        let summaryMsg = `✅ Hoàn tất gộp sản phẩm:\n\n`;
        summaryMsg += `- Thành công: ${successCount}/${results.length} đơn\n`;
        if (failureCount > 0) {
            summaryMsg += `- Thất bại: ${failureCount} đơn\n\n`;
            summaryMsg += `Các đơn thất bại:\n`;
            results.filter(r => !r.result.success).forEach(r => {
                summaryMsg += `  • SĐT ${r.order.Telephone}: ${r.result.message}\n`;
            });
        }

        alert(summaryMsg);

        if (window.notificationManager) {
            window.notificationManager.show(
                `Đã gộp ${successCount}/${results.length} đơn hàng`,
                successCount === results.length ? 'success' : 'warning'
            );
        }

        // Refresh table
        performSearch();

        return {
            success: true,
            totalOrders: results.length,
            successCount,
            failureCount,
            results
        };

    } catch (error) {
        console.error('[MERGE-BULK] Error during bulk merge:', error);
        alert('❌ Lỗi khi gộp sản phẩm: ' + error.message);
        return { success: false, message: error.message, error };
    }
}

// Make function globally accessible
window.executeMergeOrderProducts = executeMergeOrderProducts;
window.executeBulkMergeOrderProducts = executeBulkMergeOrderProducts;





// =====================================================
// ADDRESS LOOKUP LOGIC
// =====================================================
async function handleAddressLookup() {
    const input = document.getElementById('addressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');
    const keyword = input.value.trim();

    if (!keyword) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng nhập từ khóa tìm kiếm', 'warning');
        } else {
            alert('Vui lòng nhập từ khóa tìm kiếm');
        }
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';

    try {
        // Use the global searchByName function from api-handler.js which returns data without DOM manipulation
        if (typeof window.searchByName !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const items = await window.searchByName(keyword);

        if (!items || items.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        resultsContainer.innerHTML = items.map(item => {
            // Determine display name and type label
            let displayName = item.name || item.ward_name || item.district_name || '';
            let typeLabel = '';
            let fullAddress = displayName; // Default to display name
            let subText = '';

            if (item.type === 'province') {
                typeLabel = 'Tỉnh/Thành phố';
            } else if (item.type === 'district') {
                typeLabel = 'Quận/Huyện';
                if (item.province_name) {
                    fullAddress = `${displayName}, ${item.province_name}`;
                }
            } else if (item.type === 'ward') {
                typeLabel = 'Phường/Xã';
                // Try to construct better address if fields exist
                if (item.district_name && item.province_name) {
                    fullAddress = `${displayName}, ${item.district_name}, ${item.province_name}`;
                } else if (item.merger_details) {
                    // Use merger details as context since district_name is missing
                    subText = `<div style="font-size: 10px; color: #9ca3af; font-style: italic;">${item.merger_details}</div>`;
                    // Construct full address with province
                    if (item.province_name) {
                        fullAddress = `${displayName}, ${item.province_name}`;
                        // Append district info from merger details if possible (simple heuristic)
                        // This is optional, but helps if the user wants the "old" district name in the text
                        fullAddress += ` (${item.merger_details})`;
                    }
                } else if (item.address) {
                    fullAddress = item.address;
                }
            }

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', '${item.type}')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${displayName}</div>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${typeLabel}</div>
                    ${subText}
                </div>
                <i class="fas fa-chevron-right" style="font-size: 12px; color: #d1d5db;"></i>
            </div>
            `;
        }).join('');

        // Add hover effect via JS since we are injecting HTML
        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function handleFullAddressLookup() {
    const input = document.getElementById('fullAddressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');

    if (!input || !resultsContainer) return;

    const keyword = input.value.trim();
    if (!keyword) {
        alert('Vui lòng nhập địa chỉ đầy đủ');
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang phân tích địa chỉ...</div>';

    try {
        if (typeof window.searchFullAddress !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const response = await window.searchFullAddress(keyword);

        if (!response || !response.data || response.data.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        // The API returns data in a simple format: { address: "...", note: "..." }

        const items = response.data;
        resultsContainer.innerHTML = items.map(item => {
            const fullAddress = item.address;

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', 'full')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${item.address}</div>
                    ${item.note ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${item.note}</div>` : ''}
                </div>
                <i class="fas fa-check" style="font-size: 12px; color: #059669;"></i>
            </div>
            `;
        }).join('');

        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Full address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

function selectAddress(fullAddress, type) {
    const addressTextarea = document.querySelector('textarea[onchange*="updateOrderInfo(\'Address\'"]');
    if (addressTextarea) {
        let newAddress = fullAddress;

        // Logic to append or replace
        if (addressTextarea.value && addressTextarea.value.trim() !== '') {
            // Simple heuristic: if the current value is short, maybe replace. If long, maybe append.
            // Or just ask the user via a simple confirm/prompt logic?
            // "Bạn muốn THAY THẾ (OK) hay NỐI THÊM (Cancel)?" -> confusing.
            // Let's just append if it's not empty, but add a separator.

            // Actually, let's try to be smart. If the textarea contains the new address already, don't do anything.
            if (!addressTextarea.value.includes(fullAddress)) {
                // Confirm with user
                if (confirm('Bạn có muốn thay thế địa chỉ hiện tại không?\nOK: Thay thế\nCancel: Nối thêm vào sau')) {
                    newAddress = fullAddress;
                } else {
                    newAddress = addressTextarea.value + ', ' + fullAddress;
                }
            }
        }

        addressTextarea.value = newAddress;
        updateOrderInfo('Address', newAddress);

        // Hide results and clear input
        document.getElementById('addressLookupResults').style.display = 'none';
        document.getElementById('addressLookupInput').value = '';

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật địa chỉ', 'success');
        }
    }
}
