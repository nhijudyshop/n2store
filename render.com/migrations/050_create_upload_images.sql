-- Migration 050: upload_images (Postgres bytea) for web image uploads
-- Replaces Firebase Storage for the shared POST /api/upload/image endpoint used by
-- inventory-tracking ("Ảnh hóa đơn") and balance-history ("Hình ảnh xác nhận chuyển khoản").
-- Firebase Storage write path failed from Render (OAuth2 token fetch "Premature close").
-- Mirrors purchase_order_images (migration 046). Web 1.0 — pool chatDb, NO web2_ prefix.
-- The route (render.com/routes/upload.js) also lazily ensures this table, so fresh deploys
-- work without manually running this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS upload_images (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    data BYTEA NOT NULL,
    content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    filename VARCHAR(255),
    folder_path VARCHAR(100),          -- keeps category: 'invoices' / 'accountant-approvals'
    size_bytes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_images_created_at ON upload_images(created_at DESC);

COMMIT;
