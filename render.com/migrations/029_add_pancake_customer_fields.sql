-- =====================================================
-- Migration 029: Enrich customers with Pancake data
-- Date: 2026-04-11
-- Purpose: Lưu đầy đủ thông tin customer từ Pancake API
-- global_id là Facebook Real Global ID — giống nhau cross-page, dùng để link khách hàng
-- =====================================================

-- Facebook Global ID (cross-page, REAL ID)
-- Khác fb_id (page-scoped, mỗi page khác nhau)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS global_id VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_global_id ON customers(global_id)
    WHERE global_id IS NOT NULL;

-- Pancake internal UUID (per page)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pancake_id VARCHAR(100);

-- Thông tin cá nhân từ Pancake
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lives_in VARCHAR(255);

-- Pancake data (orders, ad_clicks, notes — JSONB for flexibility)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pancake_data JSONB DEFAULT '{}'::jsonb;

-- Ghi chú từ Pancake (array of notes)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pancake_notes JSONB DEFAULT '[]'::jsonb;

-- Order stats từ reports_by_phone
ALTER TABLE customers ADD COLUMN IF NOT EXISTS order_success_count INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS order_fail_count INTEGER DEFAULT 0;

-- Can inbox (có thể gửi tin nhắn qua FB)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS can_inbox BOOLEAN DEFAULT true;

-- Last synced from Pancake
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pancake_synced_at TIMESTAMP;

COMMENT ON COLUMN customers.global_id IS 'Facebook REAL Global ID (cross-page). Giống nhau trên mọi page. Dùng để link khách hàng cross-page. Ví dụ: 100001957832900';
COMMENT ON COLUMN customers.fb_id IS 'Facebook Page-Scoped ID. KHÁC NHAU trên mỗi page. Ví dụ: 25717004554573583 (Store), 24948162744877764 (House)';
COMMENT ON COLUMN customers.pancake_data IS 'JSONB: { ad_clicks, web_sources, page_fb_ids: { page_id: fb_id } }';
COMMENT ON COLUMN customers.pancake_notes IS 'JSONB array: [{ id, message, created_by, created_at }]';
