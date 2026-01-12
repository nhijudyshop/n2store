// =====================================================
// OVERVIEW - FIREBASE: Database Operations
// =====================================================

// FIREBASE FUNCTIONS
// =====================================================

/**
 * Load default table name from Firebase settings (same as tab1 uses)
 * This ensures the dropdown auto-selects the correct table on page refresh
 */
async function loadDefaultTableNameFromFirebase() {
    if (!database) {
        console.log('[REPORT] Firebase not available for loading default table name');
        return 'Bảng 1'; // Default fallback
    }

    try {
        const snapshot = await database.ref(TABLE_NAME_SETTINGS_PATH).once('value');
        const data = snapshot.val();
        if (data && data.name) {
            console.log('[REPORT] ✅ Loaded default table name from Firebase:', data.name);
            return data.name;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading default table name:', error);
    }

    // Fallback to localStorage
    try {
        const stored = localStorage.getItem('order_table_name');
        if (stored) {
            console.log('[REPORT] ✅ Loaded default table name from localStorage:', stored);
            return stored;
        }
    } catch (e) {
        console.error('[REPORT] ❌ Error loading from localStorage:', e);
    }

    console.log('[REPORT] Using default table name: Bảng 1');
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

// Save data to Firebase by table name
async function saveToFirebase(tableName, data) {
    if (!database) {
        console.error('[REPORT] Firebase database not initialized');
        return false;
    }

    try {
        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const ref = database.ref(`${FIREBASE_PATH}/${safeTableName}`);

        // Sanitize orders data to remove invalid keys
        const sanitizedOrders = sanitizeForFirebase(data.orders);

        await ref.set({
            tableName: tableName, // Store original table name
            orders: sanitizedOrders,
            fetchedAt: data.fetchedAt,
            totalOrders: data.totalOrders,
            successCount: data.successCount,
            errorCount: data.errorCount,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        console.log(`[REPORT] ✅ Saved to Firebase with table name: ${tableName}`);

        // Update Firebase status and broadcast
        firebaseTableName = tableName;
        firebaseDataFetchedAt = data.fetchedAt;
        broadcastTableStatus();

        return true;
    } catch (error) {
        console.error('[REPORT] ❌ Error saving to Firebase:', error);
        return false;
    }
}

// Load data from Firebase by table name
async function loadFromFirebase(tableName) {
    if (!database) {
        console.error('[REPORT] Firebase database not initialized');
        return null;
    }

    try {
        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const ref = database.ref(`${FIREBASE_PATH}/${safeTableName}`);
        const snapshot = await ref.once('value');

        if (snapshot.exists()) {
            const data = snapshot.val();
            console.log(`[REPORT] ✅ Loaded from Firebase: ${tableName}, orders: ${data.orders?.length || 0}`);

            // Update Firebase status
            firebaseTableName = tableName;
            firebaseDataFetchedAt = data.fetchedAt;
            broadcastTableStatus();

            return data;
        } else {
            console.log(`[REPORT] ⚠️ No Firebase data for table: ${tableName}`);
            return null;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading from Firebase:', error);
        return null;
    }
}

// Check Firebase for current table data
async function checkFirebaseStatus() {
    if (!currentTableName || !database) return;

    try {
        const safeTableName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
        const ref = database.ref(`${FIREBASE_PATH}/${safeTableName}`);
        const snapshot = await ref.once('value');

        if (snapshot.exists()) {
            const data = snapshot.val();
            firebaseTableName = currentTableName;
            firebaseDataFetchedAt = data.fetchedAt;
        } else {
            firebaseTableName = null;
            firebaseDataFetchedAt = null;
        }

        broadcastTableStatus();
    } catch (error) {
        console.error('[REPORT] Error checking Firebase status:', error);
    }
}

// =====================================================
