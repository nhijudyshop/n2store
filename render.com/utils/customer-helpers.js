const db = require('../db/pool'); // Assuming db connection is available via module.exports

function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/\s/g, ''); // Remove all spaces
    // If phone starts with +84, remove it
    if (normalized.startsWith('+84')) {
        normalized = '0' + normalized.substring(3);
    }
    // Ensure it starts with 0
    if (!normalized.startsWith('0')) {
        normalized = '0' + normalized;
    }
    return normalized;
}

/**
 * Get existing customer or create new one with source tracking
 * @param {Object} db - Database connection
 * @param {string} phone - Customer phone number
 * @param {string} name - Customer name (optional)
 * @param {string} source - Source of creation: 'ticket', 'bank_link', 'manual', 'import', 'webhook_auto', 'unknown'
 * @param {string} createdBy - Email/name of user who created (optional)
 * @returns {Promise<number>} Customer ID
 */
async function getOrCreateCustomer(db, phone, name, source = 'unknown', createdBy = null) {
    const normalized = normalizePhone(phone);

    let result = await db.query('SELECT id FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Auto-create customer with source tracking
    result = await db.query(`
        INSERT INTO customers (phone, name, status, tier, created_source, created_by, created_at)
        VALUES ($1, $2, 'Bình thường', 'new', $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [normalized, name || 'Khách hàng mới', source, createdBy]);

    console.log(`[AUTO-CREATE] Created customer: ${name || 'Khách hàng mới'} (${normalized}) - Source: ${source}${createdBy ? ` by ${createdBy}` : ''}`);
    return result.rows[0].id;
}

module.exports = {
    normalizePhone,
    getOrCreateCustomer
};
