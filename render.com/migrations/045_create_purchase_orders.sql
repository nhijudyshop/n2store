-- Migration 045: Create purchase_orders tables (migrated from Firestore)
-- Replaces Firestore collection 'purchase_orders' with PostgreSQL for faster queries

BEGIN;

-- Main purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_type VARCHAR(100) DEFAULT 'NJD SHOP',
    order_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    previous_status VARCHAR(50),

    supplier_code VARCHAR(100),
    supplier_name TEXT,

    invoice_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    shipping_fee NUMERIC(15,2) DEFAULT 0,
    final_amount NUMERIC(15,2) DEFAULT 0,

    invoice_images TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',

    total_items INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,

    created_by_uid VARCHAR(100),
    created_by_name VARCHAR(255),
    created_by_email VARCHAR(255),
    last_modified_by_uid VARCHAR(100),
    last_modified_by_name VARCHAR(255),
    last_modified_by_email VARCHAR(255)
);

-- Purchase order items (stored as JSONB array in main table for simplicity)
-- Items are always read/written together with the order, so no separate table needed
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- Status history (audit trail)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_status_created ON purchase_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_supplier_code ON purchase_orders(supplier_code);
CREATE INDEX IF NOT EXISTS idx_po_deleted_at ON purchase_orders(deleted_at) WHERE deleted_at IS NOT NULL;

-- Full-text search on supplier name, order number, and item names
CREATE INDEX IF NOT EXISTS idx_po_search ON purchase_orders USING gin(
    to_tsvector('simple', coalesce(order_number, '') || ' ' || coalesce(supplier_name, '') || ' ' || coalesce(supplier_code, ''))
);

COMMIT;
