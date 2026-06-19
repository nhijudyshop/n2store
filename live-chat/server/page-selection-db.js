// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PAGE SELECTION — relay chỉ join WS các trang được CHỌN (per-page).
// Mặc định: tất cả trang discover được (page hết gói cước tự rớt err 122).
// User tick/bỏ tick ở pancake-settings → POST /api/connect-pages → ghi bảng này.
// Side-effect-free on require: createPageSelection(db) returns helpers; the
// CREATE TABLE only runs lazily on first call via ensureSelectionTable().
// =====================================================

const SELECTION_TABLE = 'web2_live_relay_pages';

function createPageSelection(db) {
    let _selectionTableReady = false;

    async function ensureSelectionTable() {
        if (!db || _selectionTableReady) return;
        await db.query(`
            CREATE TABLE IF NOT EXISTS ${SELECTION_TABLE} (
                page_id    VARCHAR(50) PRIMARY KEY,
                page_name  VARCHAR(255),
                user_id    VARCHAR(80),
                enabled    BOOLEAN DEFAULT true,
                updated_at BIGINT
            )
        `);
        _selectionTableReady = true;
    }

    // Trang bị TẮT (enabled=false). Trang không có row = mặc định BẬT.
    async function getDisabledPageIds() {
        if (!db) return new Set();
        try {
            await ensureSelectionTable();
            const r = await db.query(
                `SELECT page_id FROM ${SELECTION_TABLE} WHERE enabled = false`
            );
            return new Set(r.rows.map((x) => String(x.page_id)));
        } catch (e) {
            console.warn('[SELECTION] getDisabled fail:', e.message);
            return new Set();
        }
    }

    // Lưu lựa chọn: pages BẬT = enabledIds; mọi page khác của account (trong allPages) = TẮT.
    async function savePageSelection(userId, enabledIds, allPages) {
        if (!db) return;
        await ensureSelectionTable();
        const enabled = new Set((enabledIds || []).map(String));
        const now = Date.now();
        for (const p of allPages || []) {
            const pid = String(p.id);
            await db.query(
                `INSERT INTO ${SELECTION_TABLE} (page_id, page_name, user_id, enabled, updated_at)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (page_id) DO UPDATE SET
                    page_name = EXCLUDED.page_name, user_id = EXCLUDED.user_id,
                    enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
                [pid, p.name || null, userId, enabled.has(pid), now]
            );
        }
    }

    return { ensureSelectionTable, getDisabledPageIds, savePageSelection };
}

module.exports = { createPageSelection, SELECTION_TABLE };
