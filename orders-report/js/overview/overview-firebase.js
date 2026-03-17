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
        console.log('[REPORT] Firestore not available for loading default table name');
        return 'Bảng 1'; // Default fallback
    }

    try {
        const doc = await database.collection('settings').doc('table_name').get();
        const data = doc.exists ? doc.data() : null;
        if (data && data.name) {
            console.log('[REPORT] ✅ Loaded default table name from Firestore:', data.name);
            return data.name;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading default table name:', error);
    }

    // Fallback to localStorage
    try {
        const stored = localStorage.getItem('orders_table_name');
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
            console.log(`[REPORT] Large dataset (${totalOrders} orders), splitting into chunks...`);

            // Save metadata document (without orders)
            await docRef.set({
                tableName: tableName,
                fetchedAt: data.fetchedAt,
                totalOrders: data.totalOrders,
                successCount: data.successCount,
                errorCount: data.errorCount,
                isChunked: true,
                chunkCount: Math.ceil(totalOrders / ORDERS_CHUNK_SIZE),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Delete old chunks first
            const chunksCollection = docRef.collection('order_chunks');
            const oldChunks = await chunksCollection.get();
            const deletePromises = oldChunks.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);

            // Save orders in chunks
            const chunkPromises = [];
            for (let i = 0; i < totalOrders; i += ORDERS_CHUNK_SIZE) {
                const chunkIndex = Math.floor(i / ORDERS_CHUNK_SIZE);
                const chunk = sanitizedOrders.slice(i, i + ORDERS_CHUNK_SIZE);

                chunkPromises.push(
                    chunksCollection.doc(`chunk_${chunkIndex}`).set({
                        orders: chunk,
                        chunkIndex: chunkIndex,
                        orderCount: chunk.length
                    })
                );
            }
            await Promise.all(chunkPromises);

            console.log(`[REPORT] ✅ Saved ${totalOrders} orders in ${Math.ceil(totalOrders / ORDERS_CHUNK_SIZE)} chunks`);
        } else {
            // Small dataset - save directly
            await docRef.set({
                tableName: tableName,
                orders: sanitizedOrders,
                fetchedAt: data.fetchedAt,
                totalOrders: data.totalOrders,
                successCount: data.successCount,
                errorCount: data.errorCount,
                isChunked: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`[REPORT] ✅ Saved to Firestore with table name: ${tableName}`);
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
                console.log(`[REPORT] Loading chunked data (${data.chunkCount} chunks)...`);

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
                console.log(`[REPORT] ✅ Loaded ${allOrders.length} orders from ${chunksSnapshot.size} chunks`);
            } else {
                console.log(`[REPORT] ✅ Loaded from Firestore: ${tableName}, orders: ${data.orders?.length || 0}`);
            }

            // Update Firebase status
            firebaseTableName = tableName;
            firebaseDataFetchedAt = data.fetchedAt;
            broadcastTableStatus();

            return data;
        } else {
            console.log(`[REPORT] ⚠️ No Firestore data for table: ${tableName}`);
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
// CAMPAIGN & USER - Independent from Tab1
// =====================================================

/**
 * Get current Firebase user ID
 * @returns {string|null} - User ID or null
 */
function getCurrentUserId() {
    // Try Firebase Auth first (if Auth SDK is loaded)
    if (typeof firebase !== 'undefined' && firebase.auth) {
        try {
            const user = firebase.auth().currentUser;
            if (user) return user.uid;
        } catch (e) { /* Auth SDK not loaded */ }
    }
    // Fallback: use same localStorage key as Tab1 (orders_campaign_user_id)
    try {
        const stored = localStorage.getItem('orders_campaign_user_id');
        if (stored) return stored;
    } catch (e) { }
    return null;
}

/**
 * Load active campaign info from Firebase (independent of Tab1)
 * Reads user_preferences and campaigns collection
 * @returns {Promise<{activeCampaignId: string, activeCampaign: Object}|null>}
 */
async function loadActiveCampaignFromFirebase() {
    if (!database) {
        console.log('[REPORT] Firestore not available for loading campaign');
        return null;
    }

    try {
        const userId = getCurrentUserId();

        // 1. Try to get active campaign from user_preferences
        let activeCampaignId = null;

        if (userId) {
            const prefDoc = await database.collection('user_preferences').doc(userId).get();
            if (prefDoc.exists) {
                const prefs = prefDoc.data();
                activeCampaignId = prefs.activeCampaignId || null;
                console.log('[REPORT] ✅ Loaded user preference activeCampaignId:', activeCampaignId);
            }
        }

        // 2. If no user preference, try shared settings
        if (!activeCampaignId) {
            const settingsDoc = await database.collection('settings').doc('active_campaign').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                activeCampaignId = settings.campaignId || null;
            }
        }

        // 3. Load campaign details
        if (activeCampaignId) {
            const campaignDoc = await database.collection('campaigns').doc(activeCampaignId).get();
            if (campaignDoc.exists) {
                const campaign = campaignDoc.data();
                console.log('[REPORT] ✅ Loaded active campaign from Firebase:', campaign.name);
                return {
                    activeCampaignId,
                    activeCampaign: {
                        name: campaign.name,
                        customStartDate: campaign.customStartDate || null,
                        customEndDate: campaign.customEndDate || null
                    }
                };
            }
        }

        // 4. Fallback: use currentTableName or default table name
        console.log('[REPORT] ⚠️ No active campaign in Firebase, using table name fallback');
        return null;
    } catch (error) {
        console.error('[REPORT] ❌ Error loading active campaign from Firebase:', error);
        return null;
    }
}

// =====================================================
