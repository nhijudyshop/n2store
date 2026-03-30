-- Migration: Add order_code column to processing_tags
-- order_code = order.Code từ TPOS (VD: "260303625"), unique và stable
-- Cho phép lookup tags theo order code thay vì phụ thuộc campaign_id

-- 1. Add column
ALTER TABLE processing_tags ADD COLUMN IF NOT EXISTS order_code VARCHAR(100);

-- 2. Backfill from JSONB data.code field (đã được _ptagEnsureCode lưu trước đó)
UPDATE processing_tags
SET order_code = data->>'code'
WHERE order_code IS NULL
  AND data->>'code' IS NOT NULL
  AND data->>'code' != ''
  AND order_id NOT LIKE '\\_\\_%';  -- Skip __ttag_config__, __ptag_custom_flags__

-- 3. Deduplicate: nếu cùng order_code ở nhiều campaigns, giữ record mới nhất
DELETE FROM processing_tags a
USING processing_tags b
WHERE a.order_code = b.order_code
  AND a.order_code IS NOT NULL
  AND a.id < b.id;  -- Keep the one with higher id (newer)

-- 4. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ptag_order_code ON processing_tags(order_code);

-- 5. Partial unique index (NULL allowed for config records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptag_order_code_unique
  ON processing_tags(order_code) WHERE order_code IS NOT NULL;
