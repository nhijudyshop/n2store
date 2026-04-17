-- Migration 053: Add dot_so (batch number) to inventory_shipments
-- Scope: per-date batch number (mỗi ngày đếm lại từ 1)
-- Backfill: dùng ROW_NUMBER() OVER (PARTITION BY ngay_di_hang ORDER BY created_at)
-- Cũng backfill ten_ncc rỗng từ inventory_suppliers

BEGIN;

-- =====================================================
-- 1. Add dot_so column (nullable first for backfill)
-- =====================================================
ALTER TABLE inventory_shipments
    ADD COLUMN IF NOT EXISTS dot_so INTEGER;

-- =====================================================
-- 2. Backfill dot_so: gán 1, 2, 3... cho từng ngày theo created_at
-- Các row cùng ngày + cùng stt_ncc + cùng created_at (cùng đợt nhập) → cùng dot_so
-- Dùng dense_rank theo (ngày, min(created_at) của group (ngày, stt_ncc)) để các NCC trong cùng đợt có cùng dot_so
-- Đơn giản hóa: mỗi created_at giây distinct trong cùng ngày = 1 đợt
-- =====================================================
WITH grouped AS (
    -- Group by date + created_at truncated to minute (để các dòng tạo gần nhau cùng 1 đợt)
    SELECT
        id,
        ngay_di_hang,
        date_trunc('minute', created_at) AS batch_key,
        DENSE_RANK() OVER (
            PARTITION BY ngay_di_hang
            ORDER BY date_trunc('minute', created_at)
        ) AS computed_dot_so
    FROM inventory_shipments
)
UPDATE inventory_shipments s
SET dot_so = g.computed_dot_so
FROM grouped g
WHERE s.id = g.id
  AND s.dot_so IS NULL;

-- =====================================================
-- 3. Set NOT NULL + DEFAULT 1 sau khi backfill xong
-- =====================================================
ALTER TABLE inventory_shipments
    ALTER COLUMN dot_so SET DEFAULT 1;

ALTER TABLE inventory_shipments
    ALTER COLUMN dot_so SET NOT NULL;

-- =====================================================
-- 4. Backfill ten_ncc rỗng từ inventory_suppliers
-- =====================================================
UPDATE inventory_shipments s
SET ten_ncc = sup.ten_ncc
FROM inventory_suppliers sup
WHERE s.stt_ncc = sup.stt_ncc
  AND (s.ten_ncc IS NULL OR s.ten_ncc = '')
  AND sup.ten_ncc IS NOT NULL
  AND sup.ten_ncc <> '';

-- =====================================================
-- 5. Index for fast lookup (ngay_di_hang, dot_so)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_inv_ship_ngay_dotso
    ON inventory_shipments(ngay_di_hang DESC, dot_so);

COMMIT;
