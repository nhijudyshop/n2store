// js/config.js - Configuration

const APP_CONFIG = {
    CACHE_EXPIRY: 10 * 60 * 1000, // 10 minutes
    FILTER_DEBOUNCE_DELAY: 500,
    MAX_VISIBLE_ROWS: 500,
    TIMEZONE: "Asia/Ho_Chi_Minh",
};

// Sample data for demo
const SAMPLE_DATA = [
    {
        id: generateId(),
        dateCell: Date.now(),
        supplier: "NCC A",
        productName: "Sản phẩm mẫu 1",
        productCode: "SP001",
        supplierQty: 100,
        customerOrders: 2,
        orderCodes: ["DH001", "DH002"],
        createdBy: "admin",
        createdAt: Date.now(),
        editHistory: [],
    },
    {
        id: generateId(),
        dateCell: Date.now() - 86400000,
        supplier: "NCC B",
        productName: "Sản phẩm mẫu 2",
        productCode: "SP002",
        supplierQty: 50,
        customerOrders: 1,
        orderCodes: ["DH003"],
        createdBy: "admin",
        createdAt: Date.now() - 86400000,
        editHistory: [],
    },
    {
        id: generateId(),
        dateCell: Date.now() - 172800000,
        supplier: "NCC C",
        productName: "Sản phẩm mẫu 3",
        productCode: "SP003",
        supplierQty: 75,
        customerOrders: 0,
        orderCodes: [],
        createdBy: "admin",
        createdAt: Date.now() - 172800000,
        editHistory: [],
    },
];

function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.SAMPLE_DATA = SAMPLE_DATA;
window.generateId = generateId;
