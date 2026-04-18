-- Migration 059: Fix shipment rows where old parser auto-assigned stt_ncc=9xx
-- for inputs that were pure numbers like "24", "44", "14", "5".
-- Strategy: for each such row, set stt_ncc = CAST(ten_ncc AS INT), ten_ncc = NULL.
-- Guard: only when no conflicting row already exists at same (date, dot, stt_ncc).
-- Ensure supplier row exists for each resolved stt_ncc.

BEGIN;

-- Preview candidates
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Candidates:';
    FOR r IN
        SELECT id, stt_ncc, ten_ncc, ngay_di_hang::text d, dot_so
        FROM inventory_shipments
        WHERE stt_ncc >= 900 AND ten_ncc ~ '^\d+$'
        ORDER BY ngay_di_hang, dot_so
    LOOP
        RAISE NOTICE '  id=% stt=% ten=% d=% dot=%', r.id, r.stt_ncc, r.ten_ncc, r.d, r.dot_so;
    END LOOP;
END$$;

-- Upsert supplier rows for each numeric ten_ncc
INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc)
SELECT gen_random_uuid()::text, CAST(ten_ncc AS INT), NULL
FROM inventory_shipments
WHERE stt_ncc >= 900 AND ten_ncc ~ '^\d+$'
GROUP BY CAST(ten_ncc AS INT)
ON CONFLICT (stt_ncc) DO NOTHING;

-- Update rows, skipping any that would create a (date, dot, stt_ncc) collision
UPDATE inventory_shipments s
SET stt_ncc = CAST(s.ten_ncc AS INT),
    ten_ncc = NULL,
    updated_at = NOW()
WHERE s.stt_ncc >= 900
  AND s.ten_ncc ~ '^\d+$'
  AND NOT EXISTS (
      SELECT 1 FROM inventory_shipments s2
      WHERE s2.id <> s.id
        AND s2.ngay_di_hang = s.ngay_di_hang
        AND s2.dot_so = s.dot_so
        AND s2.stt_ncc = CAST(s.ten_ncc AS INT)
  );

DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining FROM inventory_shipments
    WHERE stt_ncc >= 900 AND ten_ncc ~ '^\d+$';
    RAISE NOTICE 'Remaining unfixable rows (collision): %', remaining;
END$$;

COMMIT;
