-- Migration: Create inventory_product_images table
-- Product images are stored independently, mapped to shipments by STT/NCC at render time

CREATE TABLE IF NOT EXISTS inventory_product_images (
    id SERIAL PRIMARY KEY,
    stt INTEGER NOT NULL,                      -- Product STT (1-based)
    ncc INTEGER,                               -- NCC number (NULL = all NCCs)
    urls JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of base64/URL strings
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint: one entry per (stt, ncc) combo
-- Use COALESCE to handle NULL ncc (0 = all NCCs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_stt_ncc
    ON inventory_product_images (stt, COALESCE(ncc, 0));
