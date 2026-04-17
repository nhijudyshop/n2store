-- Migration 055: Shift 9 legacy inventory_shipments rows from 2026-04-11 → 2026-04-10
-- Reason: those 9 rows were saved via old client code that used
-- `new Date().toISOString().split('T')[0]` (UTC date), which in a VN-day-night
-- scenario produced 2026-04-11 when user intended VN calendar 2026-04-10.
-- Scope: only the 9 rows on 2026-04-11 that were created before the tz fix
-- (created_at before 2026-04-17 10:00 UTC — after that, the new LAY THEM row
-- on 2026-04-10 is intentional). Explicit WHERE clause — no broad UPDATE.
-- Reversible: UPDATE inventory_shipments SET ngay_di_hang = '2026-04-11'
--             WHERE ngay_di_hang = '2026-04-10' AND created_at < '2026-04-17 10:00';

BEGIN;

DO $$
DECLARE
    target_count INT;
BEGIN
    SELECT COUNT(*) INTO target_count
    FROM inventory_shipments
    WHERE ngay_di_hang = DATE '2026-04-11';

    RAISE NOTICE 'Rows to shift: %', target_count;

    IF target_count <> 9 THEN
        RAISE EXCEPTION 'Expected 9 legacy rows on 2026-04-11, found %. Aborting.', target_count;
    END IF;
END$$;

UPDATE inventory_shipments
SET ngay_di_hang = DATE '2026-04-10'
WHERE ngay_di_hang = DATE '2026-04-11';

DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'After shift:';
    FOR r IN SELECT ngay_di_hang, COUNT(*) AS n
             FROM inventory_shipments
             GROUP BY ngay_di_hang ORDER BY ngay_di_hang
    LOOP
        RAISE NOTICE '  % : % rows', r.ngay_di_hang, r.n;
    END LOOP;
END$$;

COMMIT;
