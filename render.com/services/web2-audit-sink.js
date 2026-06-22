// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-audit-sink — EVENT-SINK chung cho "Lịch sử thao tác toàn bộ" Web 2.0.
//
// Mục đích: gom audit của các trang lưu history kiểu JSONB `data.history[]`
// (purchase-refund, customers, payment-signals, returns, generic entities…) +
// bảng history riêng (kpi-assignments) về 1 bảng `web2_audit_events` để trang
// audit-log (/api/web2/audit-log) union đọc → THẬT SỰ toàn bộ.
//
// KHÔNG thay timeline inline từng record (vẫn giữ `data.history[]`). Đây là bản
// ghi SONG SONG, best-effort — lỗi sink KHÔNG chặn flow chính.
//
// Các nguồn ĐÃ có bảng riêng trong union (web2_product_history,
// fast_sale_order_history, pbh_fulfillment_logs, web2_wallet_adjustments) KHÔNG
// ghi vào đây để tránh đếm 2 lần.
//
// API: recordAuditEvent(pool, { entity, entityId, action, userId, userName, sourcePage, changes })
// =====================================================================

let _ensured = false;

async function ensureAuditSinkTable(pool) {
    if (_ensured || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_audit_events (
            id          BIGSERIAL PRIMARY KEY,
            entity      VARCHAR(48) NOT NULL,
            entity_id   VARCHAR(160),
            action      VARCHAR(60),
            user_id     VARCHAR(160),
            user_name   VARCHAR(255),
            source_page VARCHAR(80),
            changes     JSONB,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_w2ae_created ON web2_audit_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_w2ae_entity  ON web2_audit_events(entity, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_w2ae_user    ON web2_audit_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_w2ae_uname   ON web2_audit_events(user_name);
    `);
    _ensured = true;
}

// Best-effort INSERT 1 audit event. Nuốt lỗi (chỉ warn) — KHÔNG ném ra caller để
// không làm hỏng mutation chính. `changes` được cap JSON ~8KB tránh phình bảng.
async function recordAuditEvent(pool, ev) {
    if (!pool || !ev || !ev.entity) return;
    try {
        await ensureAuditSinkTable(pool);
        let changesJson = '{}';
        try {
            changesJson = JSON.stringify(ev.changes || {});
            if (changesJson.length > 8192)
                changesJson = JSON.stringify({
                    _truncated: true,
                    preview: changesJson.slice(0, 4000),
                });
        } catch {
            changesJson = '{}';
        }
        await pool.query(
            `INSERT INTO web2_audit_events
               (entity, entity_id, action, user_id, user_name, source_page, changes)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
                String(ev.entity).slice(0, 48),
                ev.entityId != null ? String(ev.entityId).slice(0, 160) : null,
                ev.action != null ? String(ev.action).slice(0, 60) : null,
                ev.userId != null ? String(ev.userId).slice(0, 160) : null,
                ev.userName != null ? String(ev.userName).slice(0, 255) : null,
                ev.sourcePage != null ? String(ev.sourcePage).slice(0, 80) : null,
                changesJson,
            ]
        );
    } catch (e) {
        console.warn('[web2-audit-sink] record failed:', e.message);
    }
}

module.exports = { recordAuditEvent, ensureAuditSinkTable };
