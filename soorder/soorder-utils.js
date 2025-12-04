// =====================================================
// UTILITIES
// File: soorder-utils.js
// =====================================================

window.SoOrderUtils = {
    // =====================================================
    // NOTIFICATION & LOADING
    // =====================================================

    showSuccess(message) {
        this.showToast(message, "success");
    },

    showError(message) {
        this.showToast(message, "error");
    },

    showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        const container = document.getElementById("toastContainer") || this.createToastContainer();
        container.appendChild(toast);

        setTimeout(() => toast.classList.add("show"), 10);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    createToastContainer() {
        const container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
        return container;
    },

    showLoading(message = "Đang xử lý...") {
        const loadingId = `loading-${Date.now()}`;
        const loading = document.createElement("div");
        loading.id = loadingId;
        loading.className = "loading-overlay";
        loading.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(loading);
        return loadingId;
    },

    hideLoading(loadingId) {
        const loading = document.getElementById(loadingId);
        if (loading) loading.remove();
    },

    // =====================================================
    // DATE UTILITIES
    // =====================================================

    formatDate(date) {
        if (!date) return "";
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    },

    formatDisplayDate(date) {
        if (!date) return "";
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        return `${day}/${month}`;
    },

    getTodayString() {
        return this.formatDate(new Date());
    },

    getDateRange(filter) {
        const today = new Date();
        const start = new Date(today);
        const end = new Date(today);

        switch (filter) {
            case "today":
                break;
            case "yesterday":
                start.setDate(today.getDate() - 1);
                end.setDate(today.getDate() - 1);
                break;
            case "week":
                start.setDate(today.getDate() - 7);
                break;
            case "month":
                start.setMonth(today.getMonth() - 1);
                break;
            case "all":
                return null;
            default:
                return null;
        }

        return {
            start: this.formatDate(start),
            end: this.formatDate(end),
        };
    },

    // =====================================================
    // MONEY UTILITIES
    // =====================================================

    formatMoney(amount) {
        if (!amount && amount !== 0) return "";
        return new Intl.NumberFormat("vi-VN").format(amount);
    },

    parseMoney(str) {
        if (!str) return 0;
        return parseInt(str.toString().replace(/[^\d-]/g, "")) || 0;
    },

    // =====================================================
    // UUID GENERATOR
    // =====================================================

    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    // =====================================================
    // LOGGING
    // =====================================================

    async logAction(action, description, oldData = null, newData = null, orderId = null) {
        try {
            const config = window.SoOrderConfig;
            const auth = authManager ? authManager.getAuthState() : null;

            await config.historyCollectionRef.add({
                action,
                description,
                oldData,
                newData,
                orderId: orderId || (newData ? newData.id : null),
                userId: auth?.userId || "unknown",
                userName: auth?.userName || "Unknown",
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.error("Error logging action:", error);
        }
    },

    // =====================================================
    // VALIDATION
    // =====================================================

    validateOrder(order) {
        const errors = [];

        if (!order.ngay) errors.push("Ngày không được để trống");
        if (!order.maDon) errors.push("Mã đơn không được để trống");
        if (!order.ncc) errors.push("NCC không được để trống");
        if (order.thanhTien === null || order.thanhTien === undefined) {
            errors.push("Thành tiền không được để trống");
        }

        return errors;
    },

    // =====================================================
    // PHÂN LOẠI VẤN ĐỀ HELPERS
    // =====================================================

    getPhanLoaiDisplay(phanLoai) {
        const map = {
            binhThuong: "🔹 Bình thường",
            duHang: "🔸 Dư hàng",
            thieuHang: "🔸 Thiếu hàng",
            saiGia: "🔸 Sai giá",
        };
        return map[phanLoai] || "🔹 Bình thường";
    },

    getPhanLoaiClass(phanLoai) {
        const map = {
            binhThuong: "status-normal",
            duHang: "status-warning",
            thieuHang: "status-warning",
            saiGia: "status-warning",
        };
        return map[phanLoai] || "status-normal";
    },

    // =====================================================
    // FILTER HELPERS
    // =====================================================

    applyFilters() {
        const config = window.SoOrderConfig;
        const searchTerm = config.searchInput?.value.toLowerCase() || "";
        const dateFilter = config.dateFilterDropdown?.value || "all";
        const nccFilter = config.filterNCCSelect?.value || "all";
        const phanLoaiFilter = config.filterPhanLoaiSelect?.value || "all";
        const thanhToanFilter = config.filterThanhToanSelect?.value || "all";

        let filtered = [...config.allOrders];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(
                (order) =>
                    order.maDon?.toLowerCase().includes(searchTerm) ||
                    order.ncc?.toLowerCase().includes(searchTerm) ||
                    order.ghiChu?.toLowerCase().includes(searchTerm)
            );
        }

        // Date filter
        if (dateFilter !== "all") {
            const range = this.getDateRange(dateFilter);
            if (range) {
                filtered = filtered.filter(
                    (order) =>
                        order.ngay >= range.start && order.ngay <= range.end
                );
            }
        }

        // NCC filter
        if (nccFilter !== "all") {
            filtered = filtered.filter((order) => order.ncc === nccFilter);
        }

        // Phân loại filter
        if (phanLoaiFilter !== "all") {
            filtered = filtered.filter(
                (order) => order.phanLoaiVanDe === phanLoaiFilter
            );
        }

        // Thanh toán filter
        if (thanhToanFilter !== "all") {
            const isPaid = thanhToanFilter === "paid";
            filtered = filtered.filter(
                (order) => order.daThanhToan === isPaid
            );
        }

        config.filteredOrders = filtered;
        window.SoOrderUI.renderTable();
    },
};
