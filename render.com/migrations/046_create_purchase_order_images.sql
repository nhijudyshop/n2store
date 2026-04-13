BEGIN;

CREATE TABLE IF NOT EXISTS purchase_order_images (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    data BYTEA NOT NULL,
    content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    filename VARCHAR(255),
    size_bytes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_created_at ON purchase_order_images(created_at DESC);

COMMIT;
