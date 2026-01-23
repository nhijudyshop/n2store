/**
 * =====================================================
 * ADMIN SETTINGS SERVICE
 * =====================================================
 *
 * Quản lý các cài đặt hệ thống từ database
 * Hỗ trợ caching để giảm query DB
 *
 * Created: 2026-01-23
 * =====================================================
 */

// Cache settings để tránh query DB liên tục
let settingsCache = {};
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 phút

/**
 * Lấy giá trị setting từ database (có cache)
 * @param {Object} db - Database connection
 * @param {string} key - Setting key
 * @returns {any} Parsed value theo data_type
 */
async function getSetting(db, key) {
    // Check cache
    if (Date.now() < cacheExpiry && settingsCache[key] !== undefined) {
        return settingsCache[key];
    }

    try {
        const result = await db.query(
            'SELECT setting_value, data_type FROM admin_settings WHERE setting_key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            console.log(`[ADMIN-SETTINGS] Setting not found: ${key}, returning null`);
            return null;
        }

        const { setting_value, data_type } = result.rows[0];
        let value = setting_value;

        // Parse theo data_type
        if (data_type === 'boolean') {
            value = setting_value === 'true';
        } else if (data_type === 'number') {
            value = parseFloat(setting_value);
        } else if (data_type === 'json') {
            try {
                value = JSON.parse(setting_value);
            } catch (e) {
                console.error(`[ADMIN-SETTINGS] Failed to parse JSON for ${key}:`, e.message);
            }
        }

        // Update cache
        settingsCache[key] = value;
        cacheExpiry = Date.now() + CACHE_TTL;

        return value;
    } catch (error) {
        console.error(`[ADMIN-SETTINGS] Error getting setting ${key}:`, error.message);
        // Return cached value if available, even if expired
        if (settingsCache[key] !== undefined) {
            return settingsCache[key];
        }
        return null;
    }
}

/**
 * Cập nhật giá trị setting
 * @param {Object} db - Database connection
 * @param {string} key - Setting key
 * @param {any} value - New value
 * @param {string} updatedBy - User who updated
 * @returns {boolean} Success
 */
async function setSetting(db, key, value, updatedBy = 'system') {
    try {
        const stringValue = String(value);

        const result = await db.query(`
            UPDATE admin_settings
            SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
            WHERE setting_key = $3
            RETURNING *
        `, [stringValue, updatedBy, key]);

        if (result.rows.length === 0) {
            console.log(`[ADMIN-SETTINGS] Setting not found for update: ${key}`);
            return false;
        }

        // Invalidate cache for this key
        delete settingsCache[key];

        console.log(`[ADMIN-SETTINGS] Updated ${key} = ${stringValue} by ${updatedBy}`);
        return true;
    } catch (error) {
        console.error(`[ADMIN-SETTINGS] Error setting ${key}:`, error.message);
        return false;
    }
}

/**
 * Lấy tất cả settings
 * @param {Object} db - Database connection
 * @returns {Object} Map of key -> value
 */
async function getAllSettings(db) {
    try {
        const result = await db.query(
            'SELECT setting_key, setting_value, data_type, description, updated_by, updated_at FROM admin_settings ORDER BY setting_key'
        );

        const settings = {};
        for (const row of result.rows) {
            let value = row.setting_value;
            if (row.data_type === 'boolean') {
                value = row.setting_value === 'true';
            } else if (row.data_type === 'number') {
                value = parseFloat(row.setting_value);
            }
            settings[row.setting_key] = {
                value,
                raw: row.setting_value,
                dataType: row.data_type,
                description: row.description,
                updatedBy: row.updated_by,
                updatedAt: row.updated_at
            };
        }

        return settings;
    } catch (error) {
        console.error('[ADMIN-SETTINGS] Error getting all settings:', error.message);
        return {};
    }
}

/**
 * Kiểm tra auto-approve có bật không
 * Đây là shortcut function cho setting quan trọng nhất
 * @param {Object} db - Database connection
 * @returns {boolean} true nếu auto-approve bật, false nếu cần kế toán duyệt
 */
async function isAutoApproveEnabled(db) {
    const value = await getSetting(db, 'auto_approve_enabled');
    // Default false nếu không tìm thấy setting (an toàn hơn)
    return value === true;
}

/**
 * Clear cache - dùng khi cần force refresh
 */
function clearCache() {
    settingsCache = {};
    cacheExpiry = 0;
    console.log('[ADMIN-SETTINGS] Cache cleared');
}

module.exports = {
    getSetting,
    setSetting,
    getAllSettings,
    isAutoApproveEnabled,
    clearCache
};
