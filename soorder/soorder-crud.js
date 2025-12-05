// =====================================================
// CRUD OPERATIONS
// File: soorder-crud.js
// =====================================================

window.SoOrderCRUD = {
    // =====================================================
    // LOAD DAY DATA
    // =====================================================

    async loadDayData(dateString) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        utils.showLoading(true);

        try {
            // Get document for this day
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            if (doc.exists) {
                state.currentDayData = doc.data();
            } else {
                // Initialize empty day data
                state.currentDayData = {
                    date: dateString,
                    isHoliday: false,
                    orders: [],
                };
            }

            // Render UI
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();

            utils.showLoading(false);
        } catch (error) {
            utils.showLoading(false);
            console.error("Error loading day data:", error);
            utils.showToast("Lỗi khi tải dữ liệu: " + error.message, "error");
        }
    },

    // =====================================================
    // SAVE DAY DATA
    // =====================================================

    async saveDayData() {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        try {
            const dateString = state.currentDateString;
            const docRef = config.orderLogsCollectionRef.doc(dateString);

            await docRef.set(state.currentDayData);

            return true;
        } catch (error) {
            console.error("Error saving day data:", error);
            utils.showToast("Lỗi khi lưu dữ liệu: " + error.message, "error");
            return false;
        }
    },

    // =====================================================
    // ADD ORDER
    // =====================================================

    async addOrder(orderData) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Validate
        if (!utils.validateOrder(orderData)) {
            return false;
        }

        // Initialize currentDayData if null
        if (!state.currentDayData) {
            state.currentDayData = {
                date: state.currentDateString,
                isHoliday: false,
                orders: [],
            };
        }

        // Create new order
        const newOrder = {
            id: utils.generateUUID(),
            supplier: orderData.supplier.trim(),
            amount: Number(orderData.amount) || 0,
            isPaid: false,
            difference: Number(orderData.difference) || 0,
            note: orderData.note || "",
            performer: orderData.performer || "",
            isReconciled: orderData.isReconciled || false,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
        };

        // Add to current day data
        if (!state.currentDayData.orders) {
            state.currentDayData.orders = [];
        }
        state.currentDayData.orders.push(newOrder);

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã thêm đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE ORDER
    // =====================================================

    async updateOrder(orderId, updatedData) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Validate
        if (!utils.validateOrder(updatedData)) {
            return false;
        }

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find and update order
        const orderIndex = state.currentDayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Update order data
        const existingOrder = state.currentDayData.orders[orderIndex];
        state.currentDayData.orders[orderIndex] = {
            ...existingOrder,
            supplier: updatedData.supplier.trim(),
            amount: Number(updatedData.amount) || 0,
            difference: Number(updatedData.difference) || 0,
            note: updatedData.note || "",
            performer: updatedData.performer || "",
            isReconciled: updatedData.isReconciled || false,
            updatedAt: firebase.firestore.Timestamp.now(),
        };

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã cập nhật đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // DELETE ORDER
    // =====================================================

    async deleteOrder(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const orderIndex = state.currentDayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Remove order
        state.currentDayData.orders.splice(orderIndex, 1);

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã xóa đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE PAID STATUS
    // =====================================================

    async togglePaidStatus(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Toggle paid status
        order.isPaid = !order.isPaid;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE RECONCILED STATUS
    // =====================================================

    async toggleReconciledStatus(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Toggle reconciled status
        order.isReconciled = !order.isReconciled;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // HOLIDAY MANAGEMENT
    // =====================================================

    async toggleHoliday(dateString, isHoliday) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        try {
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            let dayData;
            if (doc.exists) {
                dayData = doc.data();
            } else {
                dayData = {
                    date: dateString,
                    isHoliday: false,
                    orders: [],
                };
            }

            // Update holiday status
            dayData.isHoliday = isHoliday;

            // Save to Firebase
            await docRef.set(dayData);

            // If this is the current day, update state
            if (dateString === state.currentDateString) {
                state.currentDayData.isHoliday = isHoliday;
                window.SoOrderUI.toggleHolidayColumnsVisibility();
            }

            utils.showToast(
                isHoliday
                    ? "Đã đánh dấu là ngày nghỉ"
                    : "Đã bỏ đánh dấu ngày nghỉ",
                "success"
            );

            return true;
        } catch (error) {
            console.error("Error toggling holiday:", error);
            utils.showToast("Lỗi khi cập nhật ngày nghỉ: " + error.message, "error");
            return false;
        }
    },

    // Check if a date is holiday
    async checkIsHoliday(dateString) {
        const config = window.SoOrderConfig;

        try {
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            if (doc.exists) {
                return doc.data().isHoliday || false;
            }
            return false;
        } catch (error) {
            console.error("Error checking holiday:", error);
            return false;
        }
    },
};
