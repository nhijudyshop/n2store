// =====================================================
// CRUD OPERATIONS
// File: soorder-crud.js
// =====================================================

window.SoOrderCRUD = {
    // =====================================================
    // LOAD DATA
    // =====================================================

    async loadAllOrders() {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const loadingId = utils.showLoading("Đang tải dữ liệu...");

        try {
            const doc = await config.ordersCollectionRef.doc("orders").get();

            if (!doc.exists) {
                // Initialize empty data if not exists
                await config.ordersCollectionRef.doc("orders").set({ data: [] });
                config.allOrders = [];
            } else {
                const data = doc.data();
                config.allOrders = Array.isArray(data.data) ? data.data : [];
            }

            // Sort by date descending
            config.allOrders.sort((a, b) => (b.ngay || "").localeCompare(a.ngay || ""));

            config.filteredOrders = [...config.allOrders];
            this.updateNCCFilter();

            utils.hideLoading(loadingId);
            window.SoOrderUI.renderTable();
        } catch (error) {
            utils.hideLoading(loadingId);
            console.error("Error loading orders:", error);
            utils.showError("Lỗi khi tải dữ liệu: " + error.message);
        }
    },

    async loadOffDays() {
        const config = window.SoOrderConfig;

        try {
            const snapshot = await config.offDaysCollectionRef.get();
            config.currentOffDays.clear();

            snapshot.forEach((doc) => {
                config.currentOffDays.set(doc.id, doc.data());
            });
        } catch (error) {
            console.error("Error loading off days:", error);
        }
    },

    // =====================================================
    // CREATE
    // =====================================================

    async createOrder(orderData) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        const errors = utils.validateOrder(orderData);
        if (errors.length > 0) {
            utils.showError(errors.join("\n"));
            return false;
        }

        const loadingId = utils.showLoading("Đang tạo đơn...");

        try {
            const newOrder = {
                id: utils.generateId(),
                ngay: orderData.ngay || utils.getTodayString(),
                maDon: orderData.maDon,
                ncc: orderData.ncc,
                thanhTien: orderData.thanhTien || 0,
                daThanhToan: orderData.daThanhToan || false,
                phanLoaiVanDe: orderData.phanLoaiVanDe || "binhThuong",
                soTienChenhLech: orderData.soTienChenhLech || 0,
                ghiChu: orderData.ghiChu || "",
                nguoiOrder: orderData.nguoiOrder || "",
                daDoiSoat: orderData.daDoiSoat || false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const doc = await config.ordersCollectionRef.doc("orders").get();
            const currentData = doc.exists ? doc.data().data : [];

            currentData.push(newOrder);

            await config.ordersCollectionRef.doc("orders").set({ data: currentData });

            utils.logAction("create", `Tạo đơn mới: ${newOrder.maDon}`, null, newOrder);

            utils.hideLoading(loadingId);
            utils.showSuccess("Tạo đơn thành công!");

            await this.loadAllOrders();
            return true;
        } catch (error) {
            utils.hideLoading(loadingId);
            console.error("Error creating order:", error);
            utils.showError("Lỗi khi tạo đơn: " + error.message);
            return false;
        }
    },

    // =====================================================
    // UPDATE
    // =====================================================

    async updateOrder(orderId, updates) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        try {
            const doc = await config.ordersCollectionRef.doc("orders").get();

            if (!doc.exists) {
                throw new Error("Không tìm thấy dữ liệu");
            }

            const data = doc.data();
            const orders = data.data;
            const index = orders.findIndex((o) => o.id === orderId);

            if (index === -1) {
                throw new Error("Không tìm thấy đơn hàng");
            }

            const oldOrder = { ...orders[index] };
            orders[index] = {
                ...orders[index],
                ...updates,
                updatedAt: new Date().toISOString(),
            };

            await config.ordersCollectionRef.doc("orders").set({ data: orders });

            utils.logAction(
                "update",
                `Cập nhật đơn: ${orders[index].maDon}`,
                oldOrder,
                orders[index]
            );

            // Update local data
            const localIndex = config.allOrders.findIndex((o) => o.id === orderId);
            if (localIndex !== -1) {
                config.allOrders[localIndex] = orders[index];
                utils.applyFilters();
            }

            return true;
        } catch (error) {
            console.error("Error updating order:", error);
            utils.showError("Lỗi khi cập nhật: " + error.message);
            return false;
        }
    },

    // =====================================================
    // DELETE
    // =====================================================

    async deleteOrder(orderId) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        const order = config.allOrders.find((o) => o.id === orderId);
        if (!order) {
            utils.showError("Không tìm thấy đơn hàng");
            return false;
        }

        const confirmDelete = confirm(
            `Bạn có chắc chắn muốn xóa đơn "${order.maDon}"?\nNCC: ${order.ncc}`
        );
        if (!confirmDelete) return false;

        const loadingId = utils.showLoading("Đang xóa...");

        try {
            const doc = await config.ordersCollectionRef.doc("orders").get();
            const data = doc.data();
            const orders = data.data.filter((o) => o.id !== orderId);

            await config.ordersCollectionRef.doc("orders").set({ data: orders });

            utils.logAction("delete", `Xóa đơn: ${order.maDon}`, order, null);

            utils.hideLoading(loadingId);
            utils.showSuccess("Đã xóa thành công!");

            await this.loadAllOrders();
            return true;
        } catch (error) {
            utils.hideLoading(loadingId);
            console.error("Error deleting order:", error);
            utils.showError("Lỗi khi xóa: " + error.message);
            return false;
        }
    },

    // =====================================================
    // OFF DAYS MANAGEMENT
    // =====================================================

    async saveOffDay(date, data) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        try {
            await config.offDaysCollectionRef.doc(date).set(data);
            config.currentOffDays.set(date, data);
            utils.showSuccess("Đã lưu ngày nghỉ!");
            await this.loadAllOrders(); // Reload to update UI
            return true;
        } catch (error) {
            console.error("Error saving off day:", error);
            utils.showError("Lỗi khi lưu ngày nghỉ: " + error.message);
            return false;
        }
    },

    async deleteOffDay(date) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        try {
            await config.offDaysCollectionRef.doc(date).delete();
            config.currentOffDays.delete(date);
            utils.showSuccess("Đã xóa ngày nghỉ!");
            await this.loadAllOrders(); // Reload to update UI
            return true;
        } catch (error) {
            console.error("Error deleting off day:", error);
            utils.showError("Lỗi khi xóa ngày nghỉ: " + error.message);
            return false;
        }
    },

    // =====================================================
    // HELPERS
    // =====================================================

    updateNCCFilter() {
        const config = window.SoOrderConfig;
        const filterSelect = config.filterNCCSelect;

        if (!filterSelect) return;

        // Get unique NCCs
        const nccs = [...new Set(config.allOrders.map((o) => o.ncc).filter(Boolean))];
        nccs.sort();

        // Update select options
        filterSelect.innerHTML = '<option value="all">Tất cả NCC</option>';
        nccs.forEach((ncc) => {
            const option = document.createElement("option");
            option.value = ncc;
            option.textContent = ncc;
            filterSelect.appendChild(option);
        });
    },
};
