// =====================================================
// CONFIGURATION & INITIALIZATION
// File: soorder-config.js
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collection reference - using new structure
// Each document represents one day: { date, isHoliday, orders: [] }
const orderLogsCollectionRef = db.collection("order-logs");

// Global state
window.SoOrderState = {
    currentDate: new Date(),
    currentDateString: "",
    currentDayData: null, // { date, isHoliday, orders }
    editingOrderId: null,
    deleteOrderId: null,
};

// DOM elements (will be set after DOM ready)
window.SoOrderElements = {
    // Date navigation
    dateInput: null,
    dateDisplay: null,
    btnPrevDay: null,
    btnNextDay: null,
    btnToday: null,
    holidayBadge: null,

    // Add form
    btnToggleAddForm: null,
    addOrderFormContainer: null,
    btnCloseAddForm: null,
    btnCancelAdd: null,
    btnSubmitAdd: null,
    addSupplier: null,
    addAmount: null,
    addDifference: null,
    addNote: null,
    addPerformer: null,
    addIsReconciled: null,
    holidayFieldsAdd: null,

    // Table
    tableContainer: null,
    orderTableBody: null,
    emptyState: null,
    footerSummary: null,
    totalAmount: null,
    totalDifference: null,

    // Edit modal
    editOrderModal: null,
    editModalOverlay: null,
    btnCloseEditModal: null,
    btnCancelEdit: null,
    btnSubmitEdit: null,
    editSupplier: null,
    editAmount: null,
    editDifference: null,
    editNote: null,
    editPerformer: null,
    editIsReconciled: null,
    holidayFieldsEdit: null,

    // Holiday modal
    btnManageHolidays: null,
    holidayModal: null,
    holidayModalOverlay: null,
    btnCloseHolidayModal: null,
    btnCancelHoliday: null,
    btnSaveHoliday: null,
    holidayDate: null,
    isHolidayCheck: null,

    // Delete modal
    deleteConfirmModal: null,
    deleteModalOverlay: null,
    btnCloseDeleteModal: null,
    btnCancelDelete: null,
    btnConfirmDelete: null,

    // Toast
    toastContainer: null,
};

// Export for other modules
window.SoOrderConfig = {
    firebaseConfig,
    app,
    db,
    orderLogsCollectionRef,
};
