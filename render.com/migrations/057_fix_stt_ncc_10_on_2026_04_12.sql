-- Migration 057: Fix the shipment row where user typed NCC = "10" but old
-- client parser assigned stt_ncc=901. Update to stt_ncc=10.
-- Also ensure supplier row exists for stt_ncc=10 so FK is satisfied.

BEGIN;

-- Ensure supplier row exists (no-op if already there)
INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc)
VALUES (gen_random_uuid()::text, 10, NULL)
ON CONFLICT (stt_ncc) DO NOTHING;

-- Fix the row. Specific target: id = 'dot_mo2y25w3_i2igci' (only row with
-- stt_ncc=901 AND ten_ncc='10' on 2026-04-12). Explicit guard to avoid touching
-- other rows by accident.
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM inventory_shipments
    WHERE id = 'dot_mo2y25w3_i2igci' AND stt_ncc = 901 AND ten_ncc = '10';
    IF cnt <> 1 THEN
        RAISE EXCEPTION 'Expected 1 target row, found %', cnt;
    END IF;
END$$;

UPDATE inventory_shipments
SET stt_ncc = 10, ten_ncc = NULL, updated_at = NOW()
WHERE id = 'dot_mo2y25w3_i2igci';

COMMIT;
