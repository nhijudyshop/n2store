// =====================================================
// MAIN INITIALIZATION
// File: soorder-main.js
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Sổ Order: Initializing...");

    // Initialize DOM elements
    initDOMElements();

    // Setup event listeners
    setupEventListeners();

    // Auth is already checked in auth.js - no need to call again
    // Just verify user is authenticated
    if (typeof authManager !== "undefined" && !authManager.isAuthenticated()) {
        console.warn("User not authenticated, redirecting...");
        return;
    }

    // Setup keyboard navigation
    window.SoOrderUtils.setupKeyboardNavigation();

    // Load today's data
    window.SoOrderUtils.gotoToday();

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    console.log("Sổ Order: Ready!");
});

function initDOMElements() {
    const elements = window.SoOrderElements;

    // Date navigation
    elements.dateInput = document.getElementById("dateInput");
    elements.dateDisplay = document.getElementById("dateDisplay");
    elements.btnPrevDay = document.getElementById("btnPrevDay");
    elements.btnNextDay = document.getElementById("btnNextDay");
    elements.dateRangeSelect = document.getElementById("dateRangeSelect");
    elements.holidayBadge = document.getElementById("holidayBadge");

    // Add form
    elements.btnToggleAddForm = document.getElementById("btnToggleAddForm");
    elements.addOrderFormContainer = document.getElementById(
        "addOrderFormContainer"
    );
    elements.btnCloseAddForm = document.getElementById("btnCloseAddForm");
    elements.btnCancelAdd = document.getElementById("btnCancelAdd");
    elements.btnSubmitAdd = document.getElementById("btnSubmitAdd");
    elements.addSupplier = document.getElementById("addSupplier");
    elements.addAmount = document.getElementById("addAmount");
    elements.addDifference = document.getElementById("addDifference");
    elements.addNote = document.getElementById("addNote");
    elements.addPerformer = document.getElementById("addPerformer");
    elements.addIsReconciled = document.getElementById("addIsReconciled");
    elements.holidayFieldsAdd = document.getElementById("holidayFieldsAdd");

    // Table
    elements.tableContainer = document.getElementById("tableContainer");
    elements.orderTableBody = document.getElementById("orderTableBody");
    elements.emptyState = document.getElementById("emptyState");
    elements.footerSummary = document.getElementById("footerSummary");
    elements.totalAmount = document.getElementById("totalAmount");
    elements.totalDifference = document.getElementById("totalDifference");

    // Edit modal
    elements.editOrderModal = document.getElementById("editOrderModal");
    elements.editModalOverlay = document.getElementById("editModalOverlay");
    elements.btnCloseEditModal = document.getElementById("btnCloseEditModal");
    elements.btnCancelEdit = document.getElementById("btnCancelEdit");
    elements.btnSubmitEdit = document.getElementById("btnSubmitEdit");
    elements.editSupplier = document.getElementById("editSupplier");
    elements.editAmount = document.getElementById("editAmount");
    elements.editDifference = document.getElementById("editDifference");
    elements.editNote = document.getElementById("editNote");
    elements.editPerformer = document.getElementById("editPerformer");
    elements.editIsReconciled = document.getElementById("editIsReconciled");
    elements.holidayFieldsEdit = document.getElementById("holidayFieldsEdit");

    // Holiday modal
    elements.btnManageHolidays = document.getElementById("btnManageHolidays");
    elements.holidayModal = document.getElementById("holidayModal");
    elements.holidayModalOverlay = document.getElementById(
        "holidayModalOverlay"
    );
    elements.btnCloseHolidayModal = document.getElementById(
        "btnCloseHolidayModal"
    );
    elements.btnCancelHoliday = document.getElementById("btnCancelHoliday");
    elements.btnSaveHoliday = document.getElementById("btnSaveHoliday");
    elements.holidayDate = document.getElementById("holidayDate");
    elements.isHolidayCheck = document.getElementById("isHolidayCheck");

    // Calendar elements
    elements.calendarMonthYear = document.getElementById("calendarMonthYear");
    elements.calendarGrid = document.getElementById("calendarGrid");
    elements.btnPrevMonth = document.getElementById("btnPrevMonth");
    elements.btnNextMonth = document.getElementById("btnNextMonth");

    // Delete modal
    elements.deleteConfirmModal = document.getElementById("deleteConfirmModal");
    elements.deleteModalOverlay = document.getElementById("deleteModalOverlay");
    elements.btnCloseDeleteModal = document.getElementById(
        "btnCloseDeleteModal"
    );
    elements.btnCancelDelete = document.getElementById("btnCancelDelete");
    elements.btnConfirmDelete = document.getElementById("btnConfirmDelete");

    // Date Range modal
    elements.dateRangeModal = document.getElementById("dateRangeModal");
    elements.dateRangeModalOverlay = document.getElementById("dateRangeModalOverlay");
    elements.btnCloseDateRangeModal = document.getElementById("btnCloseDateRangeModal");
    elements.btnCancelDateRange = document.getElementById("btnCancelDateRange");
    elements.btnApplyDateRange = document.getElementById("btnApplyDateRange");
    elements.startDateInput = document.getElementById("startDateInput");
    elements.endDateInput = document.getElementById("endDateInput");

    // Toast
    elements.toastContainer = document.getElementById("toastContainer");
}

function setupEventListeners() {
    const elements = window.SoOrderElements;
    const utils = window.SoOrderUtils;
    const ui = window.SoOrderUI;

    console.log("Setting up event listeners...");

    // =====================================================
    // DATE NAVIGATION
    // =====================================================

    // Previous day button
    if (elements.btnPrevDay) {
        elements.btnPrevDay.addEventListener("click", () => {
            utils.gotoPrevDay();
        });
    }

    // Next day button
    if (elements.btnNextDay) {
        elements.btnNextDay.addEventListener("click", () => {
            utils.gotoNextDay();
        });
    }

    // Date range dropdown
    if (elements.dateRangeSelect) {
        elements.dateRangeSelect.addEventListener("change", async (e) => {
            const value = e.target.value;

            if (value === "custom") {
                // Show date range picker modal
                ui.showDateRangeModal();
                return;
            }

            const today = new Date();

            switch (value) {
                case "today":
                    // Navigate to today (single day mode)
                    utils.navigateToDate(today);
                    break;
                case "3days": {
                    // Show last 3 days (including today)
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - 2); // Go back 2 days to get 3 days total
                    const startDateStr = utils.formatDate(startDate);
                    const endDateStr = utils.formatDate(today);
                    await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
                    break;
                }
                case "7days": {
                    // Show last 7 days (including today)
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - 6); // Go back 6 days to get 7 days total
                    const startDateStr = utils.formatDate(startDate);
                    const endDateStr = utils.formatDate(today);
                    await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
                    break;
                }
            }
        });
    }

    // Date input change
    if (elements.dateInput) {
        elements.dateInput.addEventListener("change", (e) => {
            const dateString = e.target.value;
            if (dateString) {
                const date = utils.parseDate(dateString);
                utils.navigateToDate(date);
            }
        });
    }

    // Date display click - trigger date picker
    if (elements.dateDisplay) {
        elements.dateDisplay.addEventListener("click", () => {
            if (elements.dateInput) {
                elements.dateInput.showPicker();
            }
        });
    }

    // =====================================================
    // ADD FORM
    // =====================================================

    // Toggle add form button
    if (elements.btnToggleAddForm) {
        elements.btnToggleAddForm.addEventListener("click", () => {
            ui.showAddForm();
        });
    }

    // Close add form button
    if (elements.btnCloseAddForm) {
        elements.btnCloseAddForm.addEventListener("click", () => {
            ui.hideAddForm();
        });
    }

    // Cancel add button
    if (elements.btnCancelAdd) {
        elements.btnCancelAdd.addEventListener("click", () => {
            ui.hideAddForm();
        });
    }

    // Submit add button
    if (elements.btnSubmitAdd) {
        elements.btnSubmitAdd.addEventListener("click", () => {
            ui.handleAddOrder();
        });
    }

    // Enter key in add form
    [
        elements.addSupplier,
        elements.addAmount,
        elements.addDifference,
        elements.addNote,
    ].forEach((input) => {
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    ui.handleAddOrder();
                }
            });
        }
    });

    // =====================================================
    // EDIT MODAL
    // =====================================================

    // Close edit modal button
    if (elements.btnCloseEditModal) {
        elements.btnCloseEditModal.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Edit modal overlay click
    if (elements.editModalOverlay) {
        elements.editModalOverlay.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Cancel edit button
    if (elements.btnCancelEdit) {
        elements.btnCancelEdit.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Submit edit button
    if (elements.btnSubmitEdit) {
        elements.btnSubmitEdit.addEventListener("click", () => {
            ui.handleUpdateOrder();
        });
    }

    // Enter key in edit form
    [
        elements.editSupplier,
        elements.editAmount,
        elements.editDifference,
        elements.editNote,
    ].forEach((input) => {
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    ui.handleUpdateOrder();
                }
            });
        }
    });

    // =====================================================
    // DELETE CONFIRM MODAL
    // =====================================================

    // Close delete modal button
    if (elements.btnCloseDeleteModal) {
        elements.btnCloseDeleteModal.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Delete modal overlay click
    if (elements.deleteModalOverlay) {
        elements.deleteModalOverlay.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Cancel delete button
    if (elements.btnCancelDelete) {
        elements.btnCancelDelete.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Confirm delete button
    if (elements.btnConfirmDelete) {
        elements.btnConfirmDelete.addEventListener("click", () => {
            ui.handleDeleteOrder();
        });
    }

    // =====================================================
    // HOLIDAY MODAL
    // =====================================================

    // Manage holidays button
    if (elements.btnManageHolidays) {
        elements.btnManageHolidays.addEventListener("click", () => {
            ui.showHolidayModal();
        });
    }

    // Close holiday modal button
    if (elements.btnCloseHolidayModal) {
        elements.btnCloseHolidayModal.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Holiday modal overlay click
    if (elements.holidayModalOverlay) {
        elements.holidayModalOverlay.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Cancel holiday button (now "Đóng" button)
    if (elements.btnCancelHoliday) {
        elements.btnCancelHoliday.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Save holiday button (legacy - may not exist anymore)
    if (elements.btnSaveHoliday) {
        elements.btnSaveHoliday.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Calendar month navigation
    if (elements.btnPrevMonth) {
        elements.btnPrevMonth.addEventListener("click", () => {
            ui.navigateCalendarMonth(-1);
        });
    }

    if (elements.btnNextMonth) {
        elements.btnNextMonth.addEventListener("click", () => {
            ui.navigateCalendarMonth(1);
        });
    }

    // =====================================================
    // DATE RANGE MODAL
    // =====================================================

    // Close date range modal button
    if (elements.btnCloseDateRangeModal) {
        elements.btnCloseDateRangeModal.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Date range modal overlay click
    if (elements.dateRangeModalOverlay) {
        elements.dateRangeModalOverlay.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Cancel date range button
    if (elements.btnCancelDateRange) {
        elements.btnCancelDateRange.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Apply date range button
    if (elements.btnApplyDateRange) {
        elements.btnApplyDateRange.addEventListener("click", () => {
            ui.handleApplyDateRange();
        });
    }

    console.log("Event listeners setup complete!");
}
