// =====================================================
// FILTER SYSTEM FOR HIDDEN PRODUCTS
// =====================================================

let isFilteringInProgress = false;

// Apply all filters to hidden products
function applyFilters(products) {
    if (!products || !Array.isArray(products)) return [];

    const searchText = document.getElementById("filterSearch")?.value.toLowerCase().trim() || "";
    const hiddenDateFilter = document.getElementById("filterHiddenDate")?.value || "all";
    const sortBy = document.getElementById("sortBy")?.value || "newest";

    let filtered = [...products];

    // Filter by search text
    if (searchText) {
        const searchNoSign = Utils.removeVietnameseTones(searchText);
        filtered = filtered.filter(product => {
            const nameNoSign = Utils.removeVietnameseTones(product.Name || product.NameGet || "");
            const codeNoSign = Utils.removeVietnameseTones(product.Code || "");
            const variantNoSign = Utils.removeVietnameseTones(product.Variant || "");

            return (
                nameNoSign.includes(searchNoSign) ||
                codeNoSign.includes(searchNoSign) ||
                variantNoSign.includes(searchNoSign)
            );
        });
    }

    // Filter by hidden date
    if (hiddenDateFilter !== "all") {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

        filtered = filtered.filter(product => {
            const hiddenAt = product.hiddenAt || product.addedAt;
            if (!hiddenAt) return false;

            const hiddenDate = new Date(hiddenAt);
            const hiddenDateStart = new Date(
                hiddenDate.getFullYear(),
                hiddenDate.getMonth(),
                hiddenDate.getDate(),
                0, 0, 0, 0
            );

            let startDate, endDate;

            switch (hiddenDateFilter) {
                case "today":
                    startDate = new Date(todayStart);
                    endDate = new Date(todayStart);
                    break;

                case "yesterday":
                    startDate = new Date(todayStart);
                    startDate.setDate(startDate.getDate() - 1);
                    endDate = new Date(startDate);
                    break;

                case "last7days":
                    startDate = new Date(todayStart);
                    startDate.setDate(startDate.getDate() - 6);
                    endDate = new Date(todayStart);
                    break;

                case "last30days":
                    startDate = new Date(todayStart);
                    startDate.setDate(startDate.getDate() - 29);
                    endDate = new Date(todayStart);
                    break;

                default:
                    return true;
            }

            return hiddenDateStart >= startDate && hiddenDateStart <= endDate;
        });
    }

    // Sort products
    filtered = sortProducts(filtered, sortBy);

    return filtered;
}

// Sort products based on selected option
function sortProducts(products, sortBy) {
    const sorted = [...products];

    switch (sortBy) {
        case "newest":
            sorted.sort((a, b) => {
                const dateA = a.hiddenAt || a.addedAt || 0;
                const dateB = b.hiddenAt || b.addedAt || 0;
                return dateB - dateA;
            });
            break;

        case "oldest":
            sorted.sort((a, b) => {
                const dateA = a.hiddenAt || a.addedAt || 0;
                const dateB = b.hiddenAt || b.addedAt || 0;
                return dateA - dateB;
            });
            break;

        case "name":
            sorted.sort((a, b) => {
                const nameA = (a.Name || a.NameGet || "").toLowerCase();
                const nameB = (b.Name || b.NameGet || "").toLowerCase();
                return nameA.localeCompare(nameB);
            });
            break;

        case "code":
            sorted.sort((a, b) => {
                const codeA = (a.Code || "").toLowerCase();
                const codeB = (b.Code || "").toLowerCase();
                return codeA.localeCompare(codeB);
            });
            break;

        default:
            break;
    }

    return sorted;
}

// Debounced filter application
const debouncedApplyFilters = Utils.debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;

    try {
        const filtered = applyFilters(globalState.hiddenProducts);
        globalState.filteredProducts = filtered;
        renderHiddenProductsTable(filtered);
        updateStatistics();
    } catch (error) {
        console.error("Error during filtering:", error);
        Utils.showNotification("Có lỗi xảy ra khi lọc dữ liệu", "error");
    } finally {
        isFilteringInProgress = false;
    }
}, APP_CONFIG.FILTER_DEBOUNCE_DELAY);

// Execute filters
function executeFilters() {
    debouncedApplyFilters();
}

// Initialize filter events
function initializeFilterEvents() {
    const filterSearch = document.getElementById("filterSearch");
    const filterHiddenDate = document.getElementById("filterHiddenDate");
    const sortBy = document.getElementById("sortBy");

    if (filterSearch) {
        filterSearch.addEventListener("input", executeFilters);
    }

    if (filterHiddenDate) {
        filterHiddenDate.addEventListener("change", executeFilters);
    }

    if (sortBy) {
        sortBy.addEventListener("change", executeFilters);
    }

    console.log("✅ Filter events initialized");
}

// Filter toggle functionality
function initializeFilterToggle() {
    const filterCard = document.getElementById("filterCard");
    const filterBody = document.getElementById("filterBody");
    const toggleBtn = document.getElementById("toggleFilterBtn");
    const cardHeader = filterCard?.querySelector(".card-header");

    if (!filterCard || !filterBody || !toggleBtn || !cardHeader) return;

    // Load saved state
    const isCollapsed = localStorage.getItem("hiddenProducts_filterCollapsed") === "true";

    if (isCollapsed) {
        filterCard.classList.add("filter-collapsed");
        const icon = toggleBtn.querySelector("i");
        if (icon) icon.setAttribute("data-lucide", "chevron-down");
        lucide.createIcons();
    }

    // Toggle on header click
    cardHeader.addEventListener("click", function(e) {
        // Prevent toggle if clicking on the button itself
        if (e.target.closest("#toggleFilterBtn")) return;

        filterCard.classList.toggle("filter-collapsed");

        const isNowCollapsed = filterCard.classList.contains("filter-collapsed");
        localStorage.setItem("hiddenProducts_filterCollapsed", isNowCollapsed);

        const icon = toggleBtn.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", isNowCollapsed ? "chevron-down" : "chevron-up");
            lucide.createIcons();
        }
    });

    console.log("✅ Filter toggle initialized");
}

console.log("✅ Filter system loaded");
