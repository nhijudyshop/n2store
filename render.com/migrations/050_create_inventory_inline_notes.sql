-- Migration 050: Create inventory inline notes table
-- Multi-user inline editing for Thiếu (shortage) & Ghi Chú (notes) columns
-- Each user can independently enter values; admin entries shown in black, others in red

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_inline_notes (
    id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL,                     -- References inventory_shipments.id (dotHang ID)
    username TEXT NOT NULL,                         -- User who wrote this entry
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,        -- Whether user is admin (for color coding)

    -- Thiếu value
    thieu_value INTEGER DEFAULT 0,

    -- Ghi Chú text + images
    ghichu_text TEXT DEFAULT '',
    ghichu_images TEXT[] DEFAULT '{}',              -- Firebase Storage URLs

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user has one entry per shipment
    UNIQUE(shipment_id, username)
);

CREATE INDEX IF NOT EXISTS idx_inv_inline_shipment ON inventory_inline_notes(shipment_id);
CREATE INDEX IF NOT EXISTS idx_inv_inline_user ON inventory_inline_notes(username);

COMMIT;
