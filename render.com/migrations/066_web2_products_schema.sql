-- =====================================================
-- WEB 2.0 PRODUCTS SCHEMA
-- Simple product catalog used by native_orders (order lines).
-- Fully isolated from TPOS product table + orders-report Excel cache.
-- =====================================================
-- Auto-created at first request by routes/web2-products.js.

CREATE TABLE IF NOT EXISTS web2_products (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40)  UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    price       NUMERIC(14,2) NOT NULL DEFAULT 0,
    image_url   TEXT,
    stock       INTEGER NOT NULL DEFAULT 0,
    note        TEXT,
    tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_by  VARCHAR(100),
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web2_products_code   ON web2_products(code);
CREATE INDEX IF NOT EXISTS idx_web2_products_name   ON web2_products(name);
CREATE INDEX IF NOT EXISTS idx_web2_products_active ON web2_products(is_active);
CREATE INDEX IF NOT EXISTS idx_web2_products_created ON web2_products(created_at DESC);
