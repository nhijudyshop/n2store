-- Migration 050: Create inventory inline notes table
-- Multi-user inline editing for Thiếu (shortage) & Ghi Chú (notes) columns
-- Append mode: multiple entries per user per shipment (like mini comments)
-- Admin entries shown in black, other users in red

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_inline_notes (
    id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL,                     -- References inventory_shipments.id (dotHang ID)
    username TEXT NOT NULL,                         -- User who wrote this entry
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,        -- Whether user is admin (for color coding)

    -- Thiếu value (optional per entry)
    thieu_value INTEGER DEFAULT 0,

    -- Ghi Chú text + images (optional per entry)
    ghichu_text TEXT DEFAULT '',
    ghichu_images TEXT[] DEFAULT '{}',              -- Firebase Storage URLs

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NO unique constraint: allows multiple entries per user per shipment
);

CREATE INDEX IF NOT EXISTS idx_inv_inline_shipment ON inventory_inline_notes(shipment_id);
CREATE INDEX IF NOT EXISTS idx_inv_inline_user ON inventory_inline_notes(username);

COMMIT;
