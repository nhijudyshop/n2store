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

// Save data to Firestore by table name - with chunking for large datasets
async function saveToFirebase(tableName, data) {
    if (!database) {
        console.error('[REPORT] Firestore database not initialized');
        return false;
    }

    try {
        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const docRef = database.collection(FIREBASE_PATH).doc(safeTableName);

        // Sanitize orders data to remove invalid keys
        const sanitizedOrders = sanitizeForFirebase(data.orders) || [];
        const totalOrders = sanitizedOrders.length;

        // Check if we need to chunk (Firestore 1MB limit)
        if (totalOrders > ORDERS_CHUNK_SIZE) {
            // Save metadata document (without orders) - use actual count, not stale metadata
            await docRef.set({
                tableName: tableName,
                fetchedAt: data.fetchedAt,
                totalOrders: totalOrders,
                successCount: totalOrders,
                errorCount: data.errorCount || 0,
                isChunked: true,
                chunkCount: Math.ceil(totalOrders / ORDERS_CHUNK_SIZE),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Use batched writes for better performance (fewer round-trips)
            // Split into multiple batches to stay under Firestore 10MB batch size limit
            // Each chunk doc ~700KB (100 orders × ~7KB), so max ~10 writes per batch
            const BATCH_MAX_WRITES = 10;
            const chunksCollection = docRef.collection('order_chunks');
            const oldChunks = await chunksCollection.get();

            // Phase 1: Delete old chunks in one batch (deletes are small, no size concern)
            if (oldChunks.size > 0) {
                const deleteBatch = database.batch();
                oldChunks.docs.forEach(doc => deleteBatch.delete(doc.ref));
                await deleteBatch.commit();
            }

            // Phase 2: Write new chunks in size-safe batches
            const allChunks = [];
            for (let i = 0; i < totalOrders; i += ORDERS_CHUNK_SIZE) {
                const chunkIndex = Math.floor(i / ORDERS_CHUNK_SIZE);
                allChunks.push({
                    index: chunkIndex,
                    data: sanitizedOrders.slice(i, i + ORDERS_CHUNK_SIZE)
                });
            }

            for (let b = 0; b < allChunks.length; b += BATCH_MAX_WRITES) {
                const writeBatch = database.batch();
                const batchSlice = allChunks.slice(b, b + BATCH_MAX_WRITES);
                batchSlice.forEach(c => {
                    writeBatch.set(chunksCollection.doc(`chunk_${c.index}`), {
                        orders: c.data,
                        chunkIndex: c.index,
                        orderCount: c.data.length
                    });
                });
                await writeBatch.commit();
            }

        } else {
            // Small dataset - save directly (use actual count, not stale metadata)
            await docRef.set({
                tableName: tableName,
                orders: sanitizedOrders,
                fetchedAt: data.fetchedAt,
                totalOrders: totalOrders,
                successCount: totalOrders,
                errorCount: data.errorCount || 0,
                isChunked: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

        }

        // Update Firebase status and broadcast
        firebaseTableName = tableName;
        firebaseDataFetchedAt = data.fetchedAt;
        broadcastTableStatus();

        return true;
    } catch (error) {
        console.error('[REPORT] ❌ Error saving to Firestore:', error);
        return false;
    }
}

// Load data from Firestore by table name - with chunking support
async function loadFromFirebase(tableName) {
    if (!database) {
        console.error('[REPORT] Firestore database not initialized');
        return null;
    }

    try {
        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const docRef = database.collection(FIREBASE_PATH).doc(safeTableName);
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();

            // Check if data is chunked
            if (data.isChunked) {
                // Load all chunks
                const chunksSnapshot = await docRef.collection('order_chunks')
                    .orderBy('chunkIndex')
                    .get();

                const allOrders = [];
                chunksSnapshot.forEach(chunkDoc => {
                    const chunkData = chunkDoc.data();
                    if (chunkData.orders) {
                        allOrders.push(...chunkData.orders);
                    }
                });

                data.orders = allOrders;
                // Fix metadata mismatch: correct totalOrders/successCount if they don't match actual chunks
                const actualCount = allOrders.length;
                if (data.totalOrders !== actualCount || data.successCount !== actualCount) {
                    console.warn(`[REPORT] ⚠️ Metadata mismatch: totalOrders=${data.totalOrders}, actual=${actualCount}. Correcting.`);
                    data.totalOrders = actualCount;
                    data.successCount = actualCount;

                    // Fire-and-forget: update Firestore metadata to match reality
                    docRef.update({
                        totalOrders: actualCount,
                        successCount: actualCount,
                        metadataCorrectedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).catch(err => console.warn('[REPORT] Failed to correct metadata:', err));
                }
            } else {
            }

            // Update Firebase status
            firebaseTableName = tableName;
            firebaseDataFetchedAt = data.fetchedAt;
            broadcastTableStatus();

            return data;
        } else {
            return null;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading from Firestore:', error);
        return null;
    }
}

// Check Firestore for current table data
async function checkFirebaseStatus() {
    if (!currentTableName || !database) return;

    try {
        const safeTableName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
        const docRef = database.collection(FIREBASE_PATH).doc(safeTableName);
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
            firebaseTableName = currentTableName;
            firebaseDataFetchedAt = data.fetchedAt;
        } else {
            firebaseTableName = null;
            firebaseDataFetchedAt = null;
        }

        broadcastTableStatus();
    } catch (error) {
        console.error('[REPORT] Error checking Firestore status:', error);
    }
}

// =====================================================
