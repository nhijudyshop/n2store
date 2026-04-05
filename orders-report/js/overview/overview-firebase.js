// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// OVERVIEW - FIREBASE: Database Operations
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

// FIREBASE FUNCTIONS
// =====================================================

/**
 * Load default table name from Firestore settings (same as tab1 uses)
 * This ensures the dropdown auto-selects the correct table on page refresh
 */
async function loadDefaultTableNameFromFirebase() {
    if (!database) {
        return 'Bảng 1'; // Default fallback
    }

    try {
        const doc = await database.collection('settings').doc('table_name').get();
        const data = doc.exists ? doc.data() : null;
        if (data && data.name) {
            return data.name;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading default table name:', error);
    }

    // Fallback to localStorage
    try {
        const stored = localStorage.getItem('orders_table_name');
        if (stored) {
            return stored;
        }
    } catch (e) {
        console.error('[REPORT] ❌ Error loading from localStorage:', e);
    }

    return 'Bảng 1'; // Default
}

// Sanitize data for Firebase (remove invalid keys and undefined values)
function sanitizeForFirebase(obj) {
    // Firebase doesn't accept undefined - convert to null
    if (obj === undefined) return null;
    if (obj === null) return null;

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirebase(item));
    }

    if (typeof obj === 'object') {
        const cleaned = {};
        for (const key in obj) {
            // Skip keys starting with @ or containing invalid characters
            if (key.startsWith('@') || key.includes('.') || key.includes('#') ||
                key.includes('$') || key.includes('/') || key.includes('[') || key.includes(']')) {
                continue;
            }
            // Skip undefined values (Firebase doesn't accept undefined)
            const value = obj[key];
            if (value === undefined) {
                continue; // Skip this key entirely
            }
            cleaned[key] = sanitizeForFirebase(value);
        }
        return cleaned;
    }

    return obj;
}

// Chunk size for splitting large orders arrays (to stay under 1MB Firestore limit)
// Reduced from 200 to 100 because orders with detailed data can be ~7KB each
const ORDERS_CHUNK_SIZE = 100; // ~100 orders per chunk to stay safely under 1MB

// Save report data via CampaignAPI (PostgreSQL) — no chunking needed
async function saveToFirebase(tableName, data) {
    try {
        const orders = data.orders || [];
        const totalOrders = orders.length;

        await window.CampaignAPI.saveReport(tableName, {
            orders: orders,
            totalOrders: totalOrders,
            successCount: totalOrders,
            errorCount: data.errorCount || 0,
            fetchedAt: data.fetchedAt || new Date().toISOString(),
            isSavedCopy: data.isSavedCopy || false,
            originalCampaign: data.originalCampaign || null,
        });

        // Update status and broadcast
        firebaseTableName = tableName;
        firebaseDataFetchedAt = data.fetchedAt;
        broadcastTableStatus();

        return true;
    } catch (error) {
        console.error('[REPORT] ❌ Error saving report:', error);
        return false;
    }
}

// Load report data via CampaignAPI (PostgreSQL) — no chunking needed
async function loadFromFirebase(tableName) {
    try {
        const report = await window.CampaignAPI.getReport(tableName);

        // Update status
        firebaseTableName = tableName;
        firebaseDataFetchedAt = report.fetchedAt;
        broadcastTableStatus();

        return report;
    } catch (error) {
        if (error.message?.includes('404') || error.message?.includes('not found')) {
            return null;
        }
        console.error('[REPORT] ❌ Error loading report:', error);
        return null;
    }
}

// Check report status via CampaignAPI
async function checkFirebaseStatus() {
    if (!currentTableName) return;

    try {
        const reports = await window.CampaignAPI.listReports();
        const match = reports.find(r => r.tableName === currentTableName);

        if (match) {
            firebaseTableName = currentTableName;
            firebaseDataFetchedAt = match.fetchedAt;
        } else {
            firebaseTableName = null;
            firebaseDataFetchedAt = null;
        }

        broadcastTableStatus();
    } catch (error) {
        console.error('[REPORT] Error checking report status:', error);
    }
}

// =====================================================
