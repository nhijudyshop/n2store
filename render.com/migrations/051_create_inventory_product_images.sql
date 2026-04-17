-- Migration: Create inventory_product_images table
-- Product images stored independently per NCC, mapped to shipments at render time

CREATE TABLE IF NOT EXISTS inventory_product_images (
    id SERIAL PRIMARY KEY,
    ncc INTEGER NOT NULL UNIQUE,               -- NCC number (supplier)
    urls JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of base64/URL strings
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
