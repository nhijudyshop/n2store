-- Migration 058: Split inventory_product_images by (ngay_di_hang, dot_so, ncc)
-- Before: (ncc) unique — 1 image set per supplier globally
-- After: (ngay_di_hang, dot_so, ncc) unique — separate image set per shipment batch
--
-- Migration of existing data: all existing rows → (2026-04-10, 1) per user request
-- ("hiện tại cho qua đợt 1"). User will manage subsequent đợt images per batch.

BEGIN;

-- Drop existing unique constraint on ncc
ALTER TABLE inventory_product_images DROP CONSTRAINT IF EXISTS inventory_product_images_ncc_key;

-- Add new columns (nullable first for backfill)
ALTER TABLE inventory_product_images
    ADD COLUMN IF NOT EXISTS ngay_di_hang DATE,
    ADD COLUMN IF NOT EXISTS dot_so INTEGER;

-- Backfill existing rows to (2026-04-10, 1) per user directive
UPDATE inventory_product_images
SET ngay_di_hang = DATE '2026-04-10', dot_so = 1
WHERE ngay_di_hang IS NULL;

-- Enforce NOT NULL
ALTER TABLE inventory_product_images
    ALTER COLUMN ngay_di_hang SET NOT NULL,
    ALTER COLUMN dot_so SET NOT NULL;

-- New composite unique key
ALTER TABLE inventory_product_images
    ADD CONSTRAINT inventory_product_images_batch_ncc_key
    UNIQUE (ngay_di_hang, dot_so, ncc);

-- Index for fast batch lookup
CREATE INDEX IF NOT EXISTS idx_inv_prodimg_batch
    ON inventory_product_images(ngay_di_hang DESC, dot_so);

COMMIT;
