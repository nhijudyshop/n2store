-- =====================================================
-- UPDATE dropped_products schema
-- Thêm các columns thiếu so với Firebase Realtime DB data
-- Migration Date: 2026-04-05
-- =====================================================

ALTER TABLE dropped_products
  ADD COLUMN IF NOT EXISTS product_id INTEGER,
  ADD COLUMN IF NOT EXISTS product_name_get TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS price DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uom_name VARCHAR(50) DEFAULT 'Cái',
  ADD COLUMN IF NOT EXISTS reason VARCHAR(50),
  ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS removed_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS removed_from_order_stt VARCHAR(255),
  ADD COLUMN IF NOT EXISTS removed_from_customer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS removed_at BIGINT,
  ADD COLUMN IF NOT EXISTS added_date VARCHAR(100);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dropped_products_product_id ON dropped_products(product_id);
CREATE INDEX IF NOT EXISTS idx_dropped_products_campaign ON dropped_products(campaign_id);

COMMENT ON COLUMN dropped_products.product_id IS 'TPOS Product ID (integer)';
COMMENT ON COLUMN dropped_products.product_name_get IS 'Formatted name e.g. [CODE] Name';
COMMENT ON COLUMN dropped_products.reason IS 'removed, sale_removed, manual_add, returned_from_held';
COMMENT ON COLUMN dropped_products.campaign_id IS 'Live campaign ID';
COMMENT ON COLUMN dropped_products.removed_at IS 'Timestamp (ms) when removed from order';
