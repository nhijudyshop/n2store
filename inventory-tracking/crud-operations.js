// =====================================================
// CRUD OPERATIONS - INVENTORY TRACKING
// Phase 3: Create, Update, Delete operations
// =====================================================

/**
 * Create new shipment
 */
async function createShipment(data) {
    console.log('[CRUD] Creating shipment...', data);

    try {
        const now = firebase.firestore.Timestamp.now();
        const userName = authManager?.getUserName() || 'unknown';

        const shipmentData = {
            ...data,
            id: generateId('ship'),
            createdAt: now,
            updatedAt: now,
            createdBy: userName,
            updatedBy: userName
        };

        await shipmentsRef.doc(shipmentData.id).set(shipmentData);

        // Log edit history
        await logEditHistory('create', 'shipment', shipmentData.id, null, shipmentData);

        toast.success('Da tao dot hang moi');
        return shipmentData;

    } catch (error) {
        console.error('[CRUD] Error creating shipment:', error);
        toast.error('Khong the tao dot hang');
        throw error;
    }
}

/**
 * Update existing shipment
 */
async function updateShipment(id, data) {
    console.log('[CRUD] Updating shipment...', id, data);

    try {
        const now = firebase.firestore.Timestamp.now();
        const userName = authManager?.getUserName() || 'unknown';

        // Get old data for history
        const oldDoc = await shipmentsRef.doc(id).get();
        const oldData = oldDoc.data();

        const updateData = {
            ...data,
            updatedAt: now,
            updatedBy: userName
        };

        await shipmentsRef.doc(id).update(updateData);

        // Log edit history
        await logEditHistory('update', 'shipment', id, oldData, updateData);

        toast.success('Da cap nhat dot hang');
        return updateData;

    } catch (error) {
        console.error('[CRUD] Error updating shipment:', error);
        toast.error('Khong the cap nhat dot hang');
        throw error;
    }
}

/**
 * Delete shipment
 */
async function deleteShipment(id) {
    if (!confirm('Ban co chac muon xoa dot hang nay?')) {
        return false;
    }

    console.log('[CRUD] Deleting shipment...', id);

    try {
        // Get old data for history
        const oldDoc = await shipmentsRef.doc(id).get();
        const oldData = oldDoc.data();

        await shipmentsRef.doc(id).delete();

        // Log edit history
        await logEditHistory('delete', 'shipment', id, oldData, null);

        // Refresh data
        await loadShipmentsData();

        toast.success('Da xoa dot hang');
        return true;

    } catch (error) {
        console.error('[CRUD] Error deleting shipment:', error);
        toast.error('Khong the xoa dot hang');
        throw error;
    }
}

/**
 * Edit shipment (open modal)
 */
function editShipment(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        toast.error('Khong tim thay dot hang');
        return;
    }

    if (typeof openShipmentModal === 'function') {
        openShipmentModal(shipment);
    }
}

/**
 * Update shortage (open modal)
 */
function updateShortage(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        toast.error('Khong tim thay dot hang');
        return;
    }

    if (typeof openShortageModal === 'function') {
        openShortageModal(shipment);
    }
}

console.log('[CRUD] CRUD operations initialized');
