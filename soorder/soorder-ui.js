// =====================================================
// UI RENDERING & INTERACTIONS
// File: soorder-ui.js
// =====================================================

window.SoOrderUI = {
    // =====================================================
    // RENDER TABLE
    // =====================================================

    renderTable() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        const orders = state.currentDayData?.orders || [];
        const tbody = elements.orderTableBody;

        if (!tbody) return;

        // Clear table
        tbody.innerHTML = "";

        // Show/hide empty state
        if (orders.length === 0) {
            if (elements.emptyState) elements.emptyState.style.display = "flex";
            if (elements.tableContainer)
                elements.tableContainer.style.display = "none";
            return;
        }

        if (elements.emptyState) elements.emptyState.style.display = "none";
        if (elements.tableContainer)
            elements.tableContainer.style.display = "block";

        // Render rows
        orders.forEach((order, index) => {
            const row = this.createOrderRow(order, index + 1);
            tbody.appendChild(row);
        });

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    createOrderRow(order, stt) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;
        const isHoliday = state.currentDayData?.isHoliday || false;

        const tr = document.createElement("tr");
        tr.dataset.orderId = order.id;

        // STT
        const tdStt = document.createElement("td");
        tdStt.textContent = stt;
        tdStt.style.textAlign = "center";
        tr.appendChild(tdStt);

        // NCC
        const tdSupplier = document.createElement("td");
        tdSupplier.textContent = order.supplier;
        tr.appendChild(tdSupplier);

        // Thành Tiền (với checkbox thanh toán)
        const tdAmount = document.createElement("td");
        const amountCheckbox = document.createElement("input");
        amountCheckbox.type = "checkbox";
        amountCheckbox.checked = order.isPaid;
        amountCheckbox.className = "paid-checkbox";
        amountCheckbox.onclick = () => {
            window.SoOrderCRUD.togglePaidStatus(order.id);
        };

        const amountSpan = document.createElement("span");
        amountSpan.textContent = utils.formatCurrency(order.amount);
        amountSpan.className = "amount-text";
        if (order.isPaid) {
            amountSpan.style.textDecoration = "line-through";
            amountSpan.style.color = "#9ca3af";
        }

        tdAmount.appendChild(amountCheckbox);
        tdAmount.appendChild(amountSpan);
        tr.appendChild(tdAmount);

        // Chênh Lệch
        const tdDifference = document.createElement("td");
        tdDifference.textContent = utils.formatCurrency(order.difference);
        tdDifference.style.textAlign = "right";
        // Color based on positive/negative
        if (order.difference > 0) {
            tdDifference.style.color = "#10b981"; // Green for profit
            tdDifference.style.fontWeight = "600";
        } else if (order.difference < 0) {
            tdDifference.style.color = "#ef4444"; // Red for loss
            tdDifference.style.fontWeight = "600";
        }
        tr.appendChild(tdDifference);

        // Ghi Chú
        const tdNote = document.createElement("td");
        tdNote.textContent = order.note || "-";
        tdNote.style.maxWidth = "200px";
        tdNote.style.overflow = "hidden";
        tdNote.style.textOverflow = "ellipsis";
        tdNote.style.whiteSpace = "nowrap";
        tr.appendChild(tdNote);

        // Người thực hiện (holiday only)
        if (isHoliday) {
            const tdPerformer = document.createElement("td");
            tdPerformer.textContent = order.performer || "-";
            tdPerformer.className = "holiday-col";
            tr.appendChild(tdPerformer);

            // Đối soát (holiday only)
            const tdReconciled = document.createElement("td");
            tdReconciled.className = "holiday-col";
            tdReconciled.style.textAlign = "center";
            const reconciledCheckbox = document.createElement("input");
            reconciledCheckbox.type = "checkbox";
            reconciledCheckbox.checked = order.isReconciled;
            reconciledCheckbox.disabled = true; // Read-only, can edit via edit modal
            tdReconciled.appendChild(reconciledCheckbox);
            tr.appendChild(tdReconciled);
        }

        // Thao Tác
        const tdActions = document.createElement("td");
        tdActions.style.textAlign = "center";

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-icon btn-icon-sm";
        btnEdit.title = "Chỉnh sửa";
        btnEdit.innerHTML = '<i data-lucide="edit"></i>';
        btnEdit.onclick = () => this.showEditModal(order.id);

        const btnDelete = document.createElement("button");
        btnDelete.className = "btn-icon btn-icon-sm";
        btnDelete.title = "Xóa";
        btnDelete.innerHTML = '<i data-lucide="trash-2"></i>';
        btnDelete.onclick = () => this.showDeleteConfirm(order.id);

        tdActions.appendChild(btnEdit);
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);

        return tr;
    },

    // =====================================================
    // ADD FORM
    // =====================================================

    showAddForm() {
        const elements = window.SoOrderElements;
        if (elements.addOrderFormContainer) {
            elements.addOrderFormContainer.style.display = "block";
        }
        // Focus on supplier input
        if (elements.addSupplier) {
            setTimeout(() => elements.addSupplier.focus(), 100);
        }
    },

    hideAddForm() {
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;
        if (elements.addOrderFormContainer) {
            elements.addOrderFormContainer.style.display = "none";
        }
        utils.clearAddForm();
    },

    async handleAddOrder() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const isHoliday = state.currentDayData?.isHoliday || false;

        const orderData = {
            supplier: elements.addSupplier?.value || "",
            amount: elements.addAmount?.value || 0,
            difference: elements.addDifference?.value || 0,
            note: elements.addNote?.value || "",
            performer: isHoliday ? elements.addPerformer?.value || "" : "",
            isReconciled: isHoliday
                ? elements.addIsReconciled?.checked || false
                : false,
        };

        const success = await window.SoOrderCRUD.addOrder(orderData);

        if (success) {
            this.hideAddForm();
        }
    },

    // =====================================================
    // EDIT MODAL
    // =====================================================

    showEditModal(orderId) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) return;

        // Set editing order ID
        state.editingOrderId = orderId;

        // Fill form
        if (elements.editSupplier) elements.editSupplier.value = order.supplier;
        if (elements.editAmount) elements.editAmount.value = order.amount;
        if (elements.editDifference)
            elements.editDifference.value = order.difference;
        if (elements.editNote) elements.editNote.value = order.note || "";

        const isHoliday = state.currentDayData?.isHoliday || false;
        if (isHoliday) {
            if (elements.editPerformer)
                elements.editPerformer.value = order.performer || "";
            if (elements.editIsReconciled)
                elements.editIsReconciled.checked = order.isReconciled || false;
        }

        // Show modal
        if (elements.editOrderModal) {
            elements.editOrderModal.style.display = "flex";
        }

        // Focus on supplier input
        if (elements.editSupplier) {
            setTimeout(() => elements.editSupplier.focus(), 100);
        }
    },

    hideEditModal() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        state.editingOrderId = null;

        if (elements.editOrderModal) {
            elements.editOrderModal.style.display = "none";
        }
    },

    async handleUpdateOrder() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const isHoliday = state.currentDayData?.isHoliday || false;

        if (!state.editingOrderId) return;

        const updatedData = {
            supplier: elements.editSupplier?.value || "",
            amount: elements.editAmount?.value || 0,
            difference: elements.editDifference?.value || 0,
            note: elements.editNote?.value || "",
            performer: isHoliday ? elements.editPerformer?.value || "" : "",
            isReconciled: isHoliday
                ? elements.editIsReconciled?.checked || false
                : false,
        };

        const success = await window.SoOrderCRUD.updateOrder(
            state.editingOrderId,
            updatedData
        );

        if (success) {
            this.hideEditModal();
        }
    },

    // =====================================================
    // DELETE CONFIRM MODAL
    // =====================================================

    showDeleteConfirm(orderId) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        state.deleteOrderId = orderId;

        if (elements.deleteConfirmModal) {
            elements.deleteConfirmModal.style.display = "flex";
        }
    },

    hideDeleteConfirm() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        state.deleteOrderId = null;

        if (elements.deleteConfirmModal) {
            elements.deleteConfirmModal.style.display = "none";
        }
    },

    async handleDeleteOrder() {
        const state = window.SoOrderState;

        if (!state.deleteOrderId) return;

        const success = await window.SoOrderCRUD.deleteOrder(
            state.deleteOrderId
        );

        if (success) {
            this.hideDeleteConfirm();
        }
    },

    // =====================================================
    // HOLIDAY MODAL
    // =====================================================

    async showHolidayModal() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Set current date
        if (elements.holidayDate) {
            elements.holidayDate.value = state.currentDateString;
        }

        // Check if current date is holiday
        const isHoliday = state.currentDayData?.isHoliday || false;
        if (elements.isHolidayCheck) {
            elements.isHolidayCheck.checked = isHoliday;
        }

        // Show modal
        if (elements.holidayModal) {
            elements.holidayModal.style.display = "flex";
        }
    },

    hideHolidayModal() {
        const elements = window.SoOrderElements;

        if (elements.holidayModal) {
            elements.holidayModal.style.display = "none";
        }
    },

    async handleSaveHoliday() {
        const elements = window.SoOrderElements;

        const dateString = elements.holidayDate?.value;
        const isHoliday = elements.isHolidayCheck?.checked || false;

        if (!dateString) return;

        const success = await window.SoOrderCRUD.toggleHoliday(
            dateString,
            isHoliday
        );

        if (success) {
            this.hideHolidayModal();
        }
    },
};
