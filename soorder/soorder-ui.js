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
            reconciledCheckbox.onclick = () => {
                window.SoOrderCRUD.toggleReconciledStatus(order.id);
            };
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
    // HOLIDAY MODAL & CALENDAR
    // =====================================================

    async showHolidayModal() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Initialize calendar view date to current month
        state.calendarViewDate = new Date();

        // Load holidays from Firebase
        await this.loadHolidays();

        // Render calendar
        this.renderCalendar();

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

    async loadHolidays() {
        const state = window.SoOrderState;
        const config = window.SoOrderConfig;

        try {
            // Get all documents from order-logs to find holidays
            const snapshot = await config.orderLogsCollectionRef.get();

            state.holidays.clear();

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.isHoliday) {
                    state.holidays.set(data.date, true);
                }
            });
        } catch (error) {
            console.error("Error loading holidays:", error);
        }
    },

    renderCalendar() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        if (!elements.calendarGrid) return;

        const viewDate = state.calendarViewDate;
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // Update month/year header
        const monthNames = [
            "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
            "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
        ];
        if (elements.calendarMonthYear) {
            elements.calendarMonthYear.textContent = `${monthNames[month]}, ${year}`;
        }

        // Clear grid
        elements.calendarGrid.innerHTML = "";

        // Add day headers
        const dayHeaders = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
        dayHeaders.forEach((dayName) => {
            const header = document.createElement("div");
            header.className = "calendar-day-header";
            header.textContent = dayName;
            elements.calendarGrid.appendChild(header);
        });

        // Get first day of month and total days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const totalDays = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

        // Today's date for comparison
        const today = new Date();
        const todayString = utils.formatDate(today);

        // Add empty cells for days before month starts
        for (let i = 0; i < startDayOfWeek; i++) {
            const emptyCell = document.createElement("div");
            emptyCell.className = "calendar-day disabled";
            elements.calendarGrid.appendChild(emptyCell);
        }

        // Add days of the month
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(year, month, day);
            const dateString = utils.formatDate(date);

            const dayCell = document.createElement("div");
            dayCell.className = "calendar-day";
            dayCell.textContent = day;
            dayCell.dataset.date = dateString;

            // Check if today
            if (dateString === todayString) {
                dayCell.classList.add("today");
            }

            // Check if holiday
            if (state.holidays.has(dateString)) {
                dayCell.classList.add("holiday");
            }

            // Click handler to toggle holiday
            dayCell.addEventListener("click", () => {
                this.handleCalendarDayClick(dateString, dayCell);
            });

            elements.calendarGrid.appendChild(dayCell);
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    async handleCalendarDayClick(dateString, dayCell) {
        const state = window.SoOrderState;

        // Toggle holiday status
        const isCurrentlyHoliday = state.holidays.has(dateString);
        const newHolidayStatus = !isCurrentlyHoliday;

        // Update Firebase
        const success = await window.SoOrderCRUD.toggleHoliday(
            dateString,
            newHolidayStatus
        );

        if (success) {
            // Update local state
            if (newHolidayStatus) {
                state.holidays.set(dateString, true);
                dayCell.classList.add("holiday");
            } else {
                state.holidays.delete(dateString);
                dayCell.classList.remove("holiday");
            }

            // If we toggled the current viewing date, refresh the table
            if (dateString === state.currentDateString) {
                this.renderTable();
                this.updateFooterSummary();
                this.toggleHolidayColumnsVisibility();
            }
        }
    },

    navigateCalendarMonth(offset) {
        const state = window.SoOrderState;

        // Move calendar view date by offset months
        const newDate = new Date(state.calendarViewDate);
        newDate.setMonth(newDate.getMonth() + offset);
        state.calendarViewDate = newDate;

        // Re-render calendar
        this.renderCalendar();
    },

    // =====================================================
    // HOLIDAY COLUMNS VISIBILITY
    // =====================================================

    toggleHolidayColumnsVisibility() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const isHoliday = state.currentDayData?.isHoliday || false;

        // Show/hide holiday columns in table header
        const holidayHeaders = document.querySelectorAll("th.holiday-col");
        holidayHeaders.forEach((header) => {
            header.style.display = isHoliday ? "table-cell" : "none";
        });

        // Show/hide holiday columns in table body
        const holidayCells = document.querySelectorAll("td.holiday-col");
        holidayCells.forEach((cell) => {
            cell.style.display = isHoliday ? "table-cell" : "none";
        });

        // Show/hide holiday badge
        if (elements.holidayBadge) {
            elements.holidayBadge.style.display = isHoliday ? "inline-flex" : "none";
        }

        // Show/hide holiday fields in add form
        if (elements.holidayFieldsAdd) {
            elements.holidayFieldsAdd.style.display = isHoliday ? "flex" : "none";
        }
        if (elements.holidayFieldsEdit) {
            elements.holidayFieldsEdit.style.display = isHoliday ? "block" : "none";
        }
    },

    // =====================================================
    // FOOTER SUMMARY
    // =====================================================

    updateFooterSummary() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        const orders = state.currentDayData?.orders || [];

        if (orders.length === 0) {
            if (elements.footerSummary) {
                elements.footerSummary.style.display = "none";
            }
            return;
        }

        // Calculate totals
        let totalAmount = 0;
        let totalDifference = 0;

        orders.forEach((order) => {
            totalAmount += Number(order.amount) || 0;
            totalDifference += Number(order.difference) || 0;
        });

        // Update DOM
        if (elements.totalAmount) {
            elements.totalAmount.textContent = utils.formatCurrency(totalAmount);
        }

        if (elements.totalDifference) {
            elements.totalDifference.textContent = utils.formatCurrency(totalDifference);
            // Color based on positive/negative
            if (totalDifference > 0) {
                elements.totalDifference.style.color = "#10b981";
            } else if (totalDifference < 0) {
                elements.totalDifference.style.color = "#ef4444";
            } else {
                elements.totalDifference.style.color = "#333";
            }
        }

        if (elements.footerSummary) {
            elements.footerSummary.style.display = "flex";
        }
    },
};
