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

    // Initialize auth
    if (typeof authManager !== "undefined") {
        await authManager.checkAuth();
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
    elements.btnToday = document.getElementById("btnToday");
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

    // Delete modal
    elements.deleteConfirmModal = document.getElementById("deleteConfirmModal");
    elements.deleteModalOverlay = document.getElementById("deleteModalOverlay");
    elements.btnCloseDeleteModal = document.getElementById(
        "btnCloseDeleteModal"
    );
    elements.btnCancelDelete = document.getElementById("btnCancelDelete");
    elements.btnConfirmDelete = document.getElementById("btnConfirmDelete");

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

    // Today button
    if (elements.btnToday) {
        elements.btnToday.addEventListener("click", () => {
            utils.gotoToday();
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

    // Cancel holiday button
    if (elements.btnCancelHoliday) {
        elements.btnCancelHoliday.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Save holiday button
    if (elements.btnSaveHoliday) {
        elements.btnSaveHoliday.addEventListener("click", () => {
            ui.handleSaveHoliday();
        });
    }

    console.log("Event listeners setup complete!");
}
