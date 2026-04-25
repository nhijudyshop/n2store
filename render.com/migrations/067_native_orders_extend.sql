-- =====================================================
-- 067 — Extend native_orders + web2_products to mirror TPOS SaleOnline_Order
-- =====================================================
-- Auto-applied at first request via routes/native-orders.js + web2-products.js
-- (each has ALTER TABLE IF NOT EXISTS-style guards). This SQL is for audit.

-- native_orders: add 9 columns
ALTER TABLE native_orders
    ADD COLUMN IF NOT EXISTS assigned_employee_id   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS assigned_employee_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS live_campaign_id       VARCHAR(100),
    ADD COLUMN IF NOT EXISTS live_campaign_name     VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deposit                NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS partner_status         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS warehouse_id           INTEGER,
    ADD COLUMN IF NOT EXISTS reversed_code          VARCHAR(40),
    ADD COLUMN IF NOT EXISTS print_count            INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_native_orders_live_campaign
    ON native_orders(live_campaign_id);
CREATE INDEX IF NOT EXISTS idx_native_orders_assigned
    ON native_orders(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_native_orders_reversed_code
    ON native_orders(reversed_code);

-- web2_products: add 3 columns (original_price, barcode, category) — no uom per user feedback
ALTER TABLE web2_products
    ADD COLUMN IF NOT EXISTS original_price NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS barcode        VARCHAR(60),
    ADD COLUMN IF NOT EXISTS category       VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_web2_products_barcode  ON web2_products(barcode);
CREATE INDEX IF NOT EXISTS idx_web2_products_category ON web2_products(category);
