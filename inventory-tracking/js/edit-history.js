// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// EDIT HISTORY - INVENTORY TRACKING
// Phase 7: Log edit history for audit trail
// =====================================================

/**
 * Log edit history
 * @param {string} action - Action type (create, update, delete)
 * @param {string} collection - Collection name
 * @param {string} docId - Document ID
 * @param {Object} oldData - Previous data (for updates)
 * @param {Object} newData - New data
 */
async function logEditHistory(action, collection, docId, oldData = null, newData = null) {
    try {
        const changes = oldData && newData ? getChanges(oldData, newData) : null;

        await editHistoryApi.log(action, collection, docId || '', null, {
            oldData: oldData ? sanitizeData(oldData) : null,
            newData: newData ? sanitizeData(newData) : null,
            changes
        });
        console.log('[HISTORY] Logged:', action, collection, docId);

    } catch (error) {
        console.error('[HISTORY] Error logging:', error);
        // Don't throw - history logging should not break main operations
    }
}

/**
 * Get changes between old and new data
 */
function getChanges(oldData, newData) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    allKeys.forEach(key => {
        // Skip internal fields
        if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(key)) {
            return;
        }

        const oldVal = JSON.stringify(oldData[key]);
        const newVal = JSON.stringify(newData[key]);

        if (oldVal !== newVal) {
            changes.push({
                field: key,
                oldValue: oldData[key],
                newValue: newData[key]
            });
        }
    });

    return changes;
}

/**
 * Sanitize data for Firestore (remove undefined values)
 */
function sanitizeData(data) {
    if (!data) return null;

    const sanitized = {};
    Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
            if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
                // Handle Firestore Timestamp
                if (data[key].toDate) {
                    sanitized[key] = data[key].toDate().toISOString();
                } else {
                    sanitized[key] = sanitizeData(data[key]);
                }
            } else if (Array.isArray(data[key])) {
                sanitized[key] = data[key].map(item =>
                    typeof item === 'object' ? sanitizeData(item) : item
                );
            } else {
                sanitized[key] = data[key];
            }
        }
    });
    return sanitized;
}

/**
 * Get edit history for a document
 */
async function getEditHistory(collection, docId) {
    try {
        const history = await editHistoryApi.getAll({ entityType: collection, limit: 50 });
        // Filter by entity_id client-side (API may return all for entity_type)
        return history.filter(h => !docId || h.entity_id === docId).map(h => ({
            id: h.id,
            action: h.action,
            collection: h.entity_type,
            docId: h.entity_id,
            changes: typeof h.changes === 'string' ? JSON.parse(h.changes) : (h.changes?.changes || null),
            createdBy: h.user_name,
            createdAt: h.created_at
        }));

    } catch (error) {
        console.error('[HISTORY] Error getting history:', error);
        return [];
    }
}

/**
 * Show edit history modal
 */
async function showEditHistoryModal(collection, docId, title = 'Lich Su Chinh Sua') {
    const modal = document.getElementById('modalEditHistory');
    const modalTitle = document.getElementById('modalEditHistoryTitle');
    const modalBody = document.getElementById('modalEditHistoryBody');

    if (modalTitle) {
        modalTitle.textContent = title;
    }

    if (modalBody) {
        modalBody.innerHTML = '<p class="text-center">Dang tai...</p>';
    }

    openModal('modalEditHistory');

    try {
        const history = await getEditHistory(collection, docId);

        if (modalBody) {
            modalBody.innerHTML = renderEditHistory(history);
        }

    } catch (error) {
        if (modalBody) {
            modalBody.innerHTML = '<p class="text-center text-danger">Khong the tai lich su</p>';
        }
    }
}

/**
 * Render edit history
 */
function renderEditHistory(history) {
    if (history.length === 0) {
        return '<p class="text-center">Chua co lich su chinh sua</p>';
    }

    return `
        <div class="edit-history-list">
            ${history.map(entry => `
                <div class="history-entry">
                    <div class="history-header">
                        <span class="history-action ${entry.action}">${getActionLabel(entry.action)}</span>
                        <span class="history-user">${entry.createdBy}</span>
                        <span class="history-time">${formatDateTime(entry.createdAt)}</span>
                    </div>
                    ${entry.changes ? `
                        <div class="history-changes">
                            ${entry.changes.map(change => `
                                <div class="change-item">
                                    <span class="change-field">${change.field}:</span>
                                    <span class="change-old">${formatChangeValue(change.oldValue)}</span>
                                    <span class="change-arrow">→</span>
                                    <span class="change-new">${formatChangeValue(change.newValue)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Get action label
 */
function getActionLabel(action) {
    const labels = {
        'create': 'Tao moi',
        'update': 'Cap nhat',
        'delete': 'Xoa'
    };
    return labels[action] || action;
}

/**
 * Format change value for display
 */
function formatChangeValue(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Format datetime for display
 */
function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('vi-VN');
}

console.log('[HISTORY] Edit history initialized');
