-- =====================================================
-- Rollback Migration 061: Restore note cũ từ backup table
--
-- Chạy: node render.com/migrations/061_run_normalize_note.js --rollback
-- =====================================================

-- Restore virtual_credits.note
UPDATE virtual_credits vc
SET note = b.original_note
FROM wallet_note_backup_061 b
WHERE b.table_name = 'virtual_credits'
  AND b.row_id = vc.id;

-- Restore wallet_transactions.note
UPDATE wallet_transactions wt
SET note = b.original_note
FROM wallet_note_backup_061 b
WHERE b.table_name = 'wallet_transactions'
  AND b.row_id = wt.id;

-- Giữ lại backup table để audit — KHÔNG DROP.
-- Chạy thủ công nếu muốn xoá:
--   DROP TABLE wallet_note_backup_061;
