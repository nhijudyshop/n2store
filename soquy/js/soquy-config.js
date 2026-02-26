// =====================================================
// SỔ QUỸ - CONFIGURATION & CONSTANTS
// File: soquy-config.js
// =====================================================

// Firebase initialized by ../shared/js/firebase-config.js
const db = getFirestore();

// Firestore collection reference
const soquyCollectionRef = db.collection('soquy_vouchers');
const soquyCountersRef = db.collection('soquy_counters');

// =====================================================
// CONSTANTS
// =====================================================

const FUND_TYPES = {
    CASH: 'cash',
    BANK: 'bank',
    EWALLET: 'ewallet',
    ALL: 'all'
};

const FUND_TYPE_LABELS = {
    [FUND_TYPES.CASH]: 'Tiền mặt',
    [FUND_TYPES.BANK]: 'Ngân hàng',
    [FUND_TYPES.EWALLET]: 'Ví điện tử',
    [FUND_TYPES.ALL]: 'Tổng quỹ'
};

const VOUCHER_TYPES = {
    RECEIPT: 'receipt',
    PAYMENT: 'payment'
};

const VOUCHER_TYPE_LABELS = {
    [VOUCHER_TYPES.RECEIPT]: 'Phiếu thu',
    [VOUCHER_TYPES.PAYMENT]: 'Phiếu chi'
};

// Voucher code prefixes per fund type
const VOUCHER_CODE_PREFIX = {
    receipt: {
        cash: 'TTM',
        bank: 'TNH',
        ewallet: 'TVD'
    },
    payment: {
        cash: 'CTM',
        bank: 'CNH',
        ewallet: 'CVD'
    }
};

const VOUCHER_STATUS = {
    PAID: 'paid',
    CANCELLED: 'cancelled'
};

const VOUCHER_STATUS_LABELS = {
    [VOUCHER_STATUS.PAID]: 'Đã thanh toán',
    [VOUCHER_STATUS.CANCELLED]: 'Đã hủy'
};

// Receipt categories (Loại thu)
const RECEIPT_CATEGORIES = [
    'Thu tiền khách hàng',
    'Thu hoàn tiền NCC',
    'Thu từ đối tác giao hàng',
    'Rút tiền ngân hàng',
    'Thu nhập khác',
    'Thu nội bộ',
    'Chuyển/Nạp'
];

// Payment categories (Loại chi)
const PAYMENT_CATEGORIES = [
    'Chi CC CHỊ NHI',
    'Chi CC A TRƯỜNG',
    'Chi phí khác',
    'Chi BB ĂN UỐNG+ĐÃM TIỆC+ĐI CHƠI',
    'Chi BB TỪ THIỆN+PHỎNG SANH+CÚNG DƯỜNG',
    'Chi BB ĐI CHỢ HÀNG NGÀY + GIA VỊ',
    'Chi DD KHOẢN CHI XÂY+SỬA NHÀ',
    'Chi trả tiền NCC',
    'Chi phí vận chuyển',
    'Chi phí mặt bằng',
    'Chi lương nhân viên',
    'Chi nội bộ',
    'Chuyển/Rút'
];

// Payer/Receiver object types
const OBJECT_TYPES = [
    'Khác',
    'Khách hàng',
    'Nhà cung cấp',
    'Nhân viên'
];

const PAGE_SIZES = [15, 30, 50, 100];
const DEFAULT_PAGE_SIZE = 15;

// Time filter options
const TIME_FILTERS = {
    THIS_MONTH: 'this_month',
    LAST_MONTH: 'last_month',
    THIS_QUARTER: 'this_quarter',
    THIS_YEAR: 'this_year',
    CUSTOM: 'custom'
};

const TIME_FILTER_LABELS = {
    [TIME_FILTERS.THIS_MONTH]: 'Tháng này',
    [TIME_FILTERS.LAST_MONTH]: 'Tháng trước',
    [TIME_FILTERS.THIS_QUARTER]: 'Quý này',
    [TIME_FILTERS.THIS_YEAR]: 'Năm nay',
    [TIME_FILTERS.CUSTOM]: 'Tùy chỉnh'
};

// Business accounting filter
const BUSINESS_ACCOUNTING = {
    ALL: 'all',
    YES: 'yes',
    NO: 'no'
};

// =====================================================
// GLOBAL STATE
// =====================================================

window.SoquyState = {
    // Current filters
    fundType: FUND_TYPES.CASH,
    timeFilter: TIME_FILTERS.THIS_MONTH,
    customStartDate: null,
    customEndDate: null,
    voucherTypeFilter: [], // empty = all, ['receipt'], ['payment'], or both
    categoryFilter: '',
    statusFilter: [VOUCHER_STATUS.PAID], // default: show paid only
    businessAccounting: BUSINESS_ACCOUNTING.ALL,
    creatorFilter: '',
    employeeFilter: '',
    searchQuery: '',

    // Pagination
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,

    // Data
    vouchers: [],
    filteredVouchers: [],
    displayedVouchers: [],

    // Summary
    openingBalance: 0,
    totalReceipts: 0,
    totalPayments: 0,
    closingBalance: 0,

    // Editing
    editingVoucherId: null,
    viewingVoucherId: null,

    // Loading
    isLoading: false,

    // Creators list (for filter dropdown)
    creators: [],
    employees: []
};

// =====================================================
// DOM ELEMENT REFERENCES
// =====================================================

window.SoquyElements = {
    // Fund type radio buttons
    fundTypeRadios: null,

    // Time filter
    timeFilterSelect: null,
    timeFilterCustom: null,
    customStartDate: null,
    customEndDate: null,

    // Voucher type checkboxes
    receiptCheckbox: null,
    paymentCheckbox: null,

    // Category filter
    categoryFilter: null,

    // Status checkboxes
    statusPaidCheckbox: null,
    statusCancelledCheckbox: null,

    // Business accounting toggles
    businessAccountingBtns: null,

    // Creator/Employee filter
    creatorFilter: null,
    employeeFilter: null,

    // Search
    searchInput: null,

    // Summary stats
    statOpeningBalance: null,
    statTotalReceipts: null,
    statTotalPayments: null,
    statClosingBalance: null,

    // Table
    tableBody: null,
    selectAllCheckbox: null,

    // Pagination
    pageSizeSelect: null,
    btnFirstPage: null,
    btnPrevPage: null,
    btnNextPage: null,
    btnLastPage: null,
    currentPageSpan: null,
    pageInfoSpan: null,

    // Action buttons
    btnCreateReceipt: null,
    btnCreatePayment: null,
    btnExportFile: null,

    // Receipt modal
    receiptModal: null,
    receiptForm: null,
    receiptVoucherCode: null,
    receiptDateTime: null,
    receiptCategory: null,
    receiptCollector: null,
    receiptObjectType: null,
    receiptPayerName: null,
    receiptAmount: null,
    receiptNote: null,
    receiptBusinessAccounting: null,
    btnSaveReceipt: null,
    btnSavePrintReceipt: null,
    btnCancelReceipt: null,
    btnCloseReceipt: null,
    receiptOverlay: null,

    // Payment modal
    paymentModal: null,
    paymentForm: null,
    paymentVoucherCode: null,
    paymentDateTime: null,
    paymentCategory: null,
    paymentCollector: null,
    paymentObjectType: null,
    paymentReceiverName: null,
    paymentAmount: null,
    paymentNote: null,
    paymentBusinessAccounting: null,
    btnSavePayment: null,
    btnSavePrintPayment: null,
    btnCancelPayment: null,
    btnClosePayment: null,
    paymentOverlay: null,

    // Detail/View modal
    detailModal: null,
    detailOverlay: null,
    btnCloseDetail: null,

    // Cancel confirm modal
    cancelModal: null,
    cancelOverlay: null,
    cancelReason: null,
    btnConfirmCancel: null,
    btnDismissCancel: null,
    btnCloseCancel: null,

    // Sidebar title
    sidebarTitle: null
};

// Export config
window.SoquyConfig = {
    db,
    soquyCollectionRef,
    soquyCountersRef,
    FUND_TYPES,
    FUND_TYPE_LABELS,
    VOUCHER_TYPES,
    VOUCHER_TYPE_LABELS,
    VOUCHER_CODE_PREFIX,
    VOUCHER_STATUS,
    VOUCHER_STATUS_LABELS,
    RECEIPT_CATEGORIES,
    PAYMENT_CATEGORIES,
    OBJECT_TYPES,
    PAGE_SIZES,
    DEFAULT_PAGE_SIZE,
    TIME_FILTERS,
    TIME_FILTER_LABELS,
    BUSINESS_ACCOUNTING
};
