// =====================================================
// MAIN APPLICATION LOGIC FOR HIDDEN PRODUCTS
// =====================================================

// Global variables
window.savedProducts = [];
let isSyncingFromFirebase = false;

// Initialize application
document.addEventListener("DOMContentLoaded", function() {
    console.log("🚀 Initializing Hidden Products page...");

    // Check authentication
    if (!Utils.checkAuth()) {
        return;
    }

    // Initialize components
    initializeUI();
    initializeFilterEvents();
    initializeFilterToggle();
    initializeEventListeners();

    // Load data from Firebase
    loadHiddenProducts();

    console.log("✅ Hidden Products page initialized");
});

// Initialize UI components
function initializeUI() {
    // Set user info
    const auth = Utils.getAuthState();
    if (auth && auth.userName) {
        const userNameEl = document.getElementById("userName");
        if (userNameEl) {
            userNameEl.textContent = auth.userName;
        }
    }

    console.log("✅ UI initialized");
}

// Initialize event listeners
function initializeEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById("refreshButton");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            Utils.showNotification("Đang làm mới dữ liệu...", "info");
            loadHiddenProducts();
        });
    }

    // Restore all button
    const restoreAllBtn = document.getElementById("restoreAllButton");
    if (restoreAllBtn) {
        restoreAllBtn.addEventListener("click", restoreAllProducts);
    }

    // Logout button
    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    // Permissions button
    const permissionsBtn = document.getElementById("btnPermissions");
    if (permissionsBtn) {
        permissionsBtn.addEventListener("click", showPermissions);
    }

    console.log("✅ Event listeners initialized");
}

// Load hidden products from Firebase
async function loadHiddenProducts() {
    try {
        isSyncingFromFirebase = true;
        globalState.isLoading = true;

        // Show loading state
        showLoadingState();

        // Load data from Firebase
        const snapshot = await database.ref('savedProducts').once('value');
        const products = snapshot.val();

        if (products && Array.isArray(products)) {
            window.savedProducts = products;

            // Filter only hidden products
            const hiddenProducts = products.filter(p => p.isHidden === true);

            // Update global state
            globalState.hiddenProducts = hiddenProducts;

            // Apply filters and render
            const filtered = applyFilters(hiddenProducts);
            globalState.filteredProducts = filtered;

            renderHiddenProductsTable(filtered);
            updateStatistics();

            console.log(`✅ Loaded ${hiddenProducts.length} hidden products`);
            Utils.showNotification(`Đã tải ${hiddenProducts.length} sản phẩm đã ẩn`, "success", 2000);
        } else {
            console.log("No products found in Firebase");
            globalState.hiddenProducts = [];
            globalState.filteredProducts = [];
            renderHiddenProductsTable([]);
            updateStatistics();
            Utils.showNotification("Không có sản phẩm nào trong hệ thống", "warning");
        }

    } catch (error) {
        console.error("❌ Error loading hidden products:", error);
        Utils.showNotification("Lỗi khi tải dữ liệu: " + error.message, "error");

        // Show error state
        showErrorState(error.message);
    } finally {
        isSyncingFromFirebase = false;
        globalState.isLoading = false;
    }
}

// Show loading state
function showLoadingState() {
    const tbody = document.getElementById("hiddenProductsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align: center; padding: 40px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--text-secondary);">
                    <div class="loading-spinner"></div>
                    <span>Đang tải dữ liệu từ Firebase...</span>
                </div>
            </td>
        </tr>
    `;
}

// Show error state
function showErrorState(errorMessage) {
    const tbody = document.getElementById("hiddenProductsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align: center; padding: 40px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-secondary);">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #f44336;"></i>
                    <span style="font-size: 16px; color: #f44336;">Lỗi khi tải dữ liệu</span>
                    <span style="font-size: 14px; opacity: 0.7;">${Utils.sanitizeInput(errorMessage)}</span>
                    <button class="btn btn-primary" onclick="loadHiddenProducts()" style="margin-top: 12px;">
                        <i data-lucide="refresh-cw"></i>
                        Thử lại
                    </button>
                </div>
            </td>
        </tr>
    `;
    lucide.createIcons();
}

// Handle logout
function handleLogout() {
    if (confirm("Bạn có chắc muốn đăng xuất không?")) {
        localStorage.removeItem(APP_CONFIG.AUTH_STORAGE_KEY);
        window.location.href = "../loginindex/login.html";
    }
}

// Show user permissions
function showPermissions() {
    const auth = Utils.getAuthState();
    if (!auth) {
        Utils.showNotification("Không thể lấy thông tin quyền", "error");
        return;
    }

    const permissions = [];
    permissions.push(`Tên: ${auth.userName || "N/A"}`);
    permissions.push(`Email: ${auth.userEmail || "N/A"}`);
    permissions.push(`Vai trò: ${auth.userRole || "N/A"}`);
    permissions.push(`Cấp độ: ${auth.checkLogin || "N/A"}`);

    alert("QUYỀN CỦA TÔI\n\n" + permissions.join("\n"));
}

// Setup Firebase listener for real-time updates
function setupFirebaseListener() {
    database.ref('savedProducts').on('value', (snapshot) => {
        if (isSyncingFromFirebase) return;

        console.log("🔄 Firebase data changed, reloading...");
        loadHiddenProducts();
    });

    console.log("✅ Firebase listener setup");
}

// Call this after initial load to enable real-time updates
setTimeout(() => {
    setupFirebaseListener();
}, 2000);

// Export functions
window.loadHiddenProducts = loadHiddenProducts;
window.handleLogout = handleLogout;
window.showPermissions = showPermissions;

console.log("✅ Main application logic loaded");
