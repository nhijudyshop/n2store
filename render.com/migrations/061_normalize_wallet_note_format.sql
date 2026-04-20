-- =====================================================
-- Migration 061: Normalize wallet/virtual_credit note format
--
-- Mục đích: Chuyển note cũ sang format thống nhất:
--   RETURN_SHIPPER (Thu Về): "Công Nợ Ảo Từ Thu Về ({order_id}) - {internal_note}"
--   RETURN_CLIENT  (Khách Gửi): "Công Nợ Ảo Từ Khách Gửi ({order_id}) - {internal_note}"
--
-- An toàn:
--   - Idempotent: chạy nhiều lần OK (chỉ update rows chưa có prefix "Công Nợ Ảo Từ")
--   - Backup tự động vào wallet_note_backup_061 trước khi UPDATE
--   - Rollback khả dụng qua 061_rollback_normalize_wallet_note.sql
--
-- Chạy: node render.com/migrations/061_run_normalize_note.js --apply
-- =====================================================

-- =====================================================
-- STEP 0: Tạo backup table nếu chưa có
-- =====================================================
CREATE TABLE IF NOT EXISTS wallet_note_backup_061 (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(30) NOT NULL,
    row_id INTEGER NOT NULL,
    original_note TEXT,
    migrated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (table_name, row_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_note_backup_061_table_row
    ON wallet_note_backup_061(table_name, row_id);

-- =====================================================
-- STEP 1: Backup + Transform virtual_credits (RETURN_SHIPPER / Thu Về)
-- =====================================================

-- 1a) Backup
INSERT INTO wallet_note_backup_061 (table_name, row_id, original_note)
SELECT 'virtual_credits', vc.id, vc.note
FROM virtual_credits vc
WHERE vc.source_type = 'RETURN_SHIPPER'
  AND vc.note IS NOT NULL
  AND vc.note NOT LIKE 'Công Nợ Ảo Từ%'
ON CONFLICT (table_name, row_id) DO NOTHING;

-- 1b) Transform
UPDATE virtual_credits vc
SET note = CASE
    WHEN ct.internal_note IS NOT NULL AND TRIM(ct.internal_note) <> ''
        THEN 'Công Nợ Ảo Từ Thu Về (' || COALESCE(ct.order_id, ct.ticket_code, vc.source_id) || ') - ' || ct.internal_note
    ELSE 'Công Nợ Ảo Từ Thu Về (' || COALESCE(ct.order_id, ct.ticket_code, vc.source_id) || ')'
END
FROM customer_tickets ct
WHERE (vc.source_id = ct.ticket_code OR vc.source_id = ct.order_id)
  AND vc.source_type = 'RETURN_SHIPPER'
  AND vc.note IS NOT NULL
  AND vc.note NOT LIKE 'Công Nợ Ảo Từ%';

-- =====================================================
-- STEP 2: Backup + Transform wallet_transactions
--         (VIRTUAL_CREDIT / VIRTUAL_CREDIT_ISSUE — mirror của vc issue)
-- =====================================================

-- 2a) Backup
INSERT INTO wallet_note_backup_061 (table_name, row_id, original_note)
SELECT 'wallet_transactions', wt.id, wt.note
FROM wallet_transactions wt
WHERE wt.type = 'VIRTUAL_CREDIT'
  AND wt.source = 'VIRTUAL_CREDIT_ISSUE'
  AND wt.reference_id ~ '^[0-9]+$'  -- reference_id phải là số (virtual_credit_id)
  AND EXISTS (
      SELECT 1 FROM virtual_credits vc
      WHERE vc.id = wt.reference_id::INTEGER
        AND vc.source_type = 'RETURN_SHIPPER'
  )
  AND wt.note IS NOT NULL
  AND wt.note NOT LIKE 'Công Nợ Ảo Từ%'
ON CONFLICT (table_name, row_id) DO NOTHING;

-- 2b) Transform: copy từ vc.note đã transform ở step 1
UPDATE wallet_transactions wt
SET note = vc.note
FROM virtual_credits vc
WHERE vc.id = wt.reference_id::INTEGER
  AND wt.type = 'VIRTUAL_CREDIT'
  AND wt.source = 'VIRTUAL_CREDIT_ISSUE'
  AND wt.reference_id ~ '^[0-9]+$'
  AND vc.source_type = 'RETURN_SHIPPER'
  AND vc.note LIKE 'Công Nợ Ảo Từ%'
  AND wt.note NOT LIKE 'Công Nợ Ảo Từ%';

-- =====================================================
-- STEP 3: Backup + Transform wallet_transactions
--         (RETURN_GOODS — Khách Gửi deposit)
-- =====================================================

-- 3a) Backup
INSERT INTO wallet_note_backup_061 (table_name, row_id, original_note)
SELECT 'wallet_transactions', wt.id, wt.note
FROM wallet_transactions wt
JOIN customer_tickets ct ON ct.ticket_code = wt.reference_id
WHERE wt.source = 'RETURN_GOODS'
  AND wt.note IS NOT NULL
  AND wt.note NOT LIKE 'Công Nợ Ảo Từ%'
ON CONFLICT (table_name, row_id) DO NOTHING;

-- 3b) Transform
UPDATE wallet_transactions wt
SET note = CASE
    WHEN ct.internal_note IS NOT NULL AND TRIM(ct.internal_note) <> ''
        THEN 'Công Nợ Ảo Từ Khách Gửi (' || COALESCE(ct.order_id, ct.ticket_code) || ') - ' || ct.internal_note
    ELSE 'Công Nợ Ảo Từ Khách Gửi (' || COALESCE(ct.order_id, ct.ticket_code) || ')'
END
FROM customer_tickets ct
WHERE wt.reference_id = ct.ticket_code
  AND wt.source = 'RETURN_GOODS'
  AND wt.note IS NOT NULL
  AND wt.note NOT LIKE 'Công Nợ Ảo Từ%';

-- =====================================================
-- Verify (SELECT để runner in ra kết quả)
-- =====================================================
-- Tổng rows đã backup:
--   SELECT COUNT(*) FROM wallet_note_backup_061;
-- Tổng rows đã transform (virtual_credits):
--   SELECT COUNT(*) FROM virtual_credits
--   WHERE source_type = 'RETURN_SHIPPER' AND note LIKE 'Công Nợ Ảo Từ%';
-- Tổng rows đã transform (wallet_transactions):
--   SELECT COUNT(*) FROM wallet_transactions
--   WHERE note LIKE 'Công Nợ Ảo Từ%';
