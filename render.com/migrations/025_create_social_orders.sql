-- =====================================================
-- SOCIAL ORDERS TABLE
-- Đơn hàng nháp từ các kênh mạng xã hội (không qua TPOS)
-- =====================================================

-- Create social_orders table
CREATE TABLE IF NOT EXISTS social_orders (
    id SERIAL PRIMARY KEY,
    
    -- Order identification
    order_code VARCHAR(50) UNIQUE NOT NULL,  -- SO-YYYYMMDD-XXX
    stt INTEGER,                              -- Số thứ tự (cho phân chia NV)
    
    -- Customer info
    customer_name VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    extra_address TEXT,
    
    -- Pancake/Social info
    channel_id VARCHAR(100),                  -- Page ID
    psid VARCHAR(100),                        -- Customer PSID
    conversation_id VARCHAR(100),
    fb_customer_id VARCHAR(100),              -- Facebook customer ID
    
    -- Products (JSON array)
    -- Format: [{ "product_id": "...", "name": "...", "code": "...", "quantity": 1, "price": 100000, "note": "..." }]
    products JSONB DEFAULT '[]'::jsonb,
    
    -- Totals
    total_quantity INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    shipping_fee DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    final_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Tags (JSON array of tag objects)
    -- Format: [{ "id": "...", "name": "...", "color": "#..." }]
    tags JSONB DEFAULT '[]'::jsonb,
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft',       -- draft, processing, completed, cancelled
    
    -- Employee assignment
    assigned_user_id VARCHAR(100),
    assigned_user_name VARCHAR(255),
    
    -- Source tracking
    source VARCHAR(50) DEFAULT 'manual',      -- manual, facebook_post, instagram, tiktok, pancake_import
    campaign_name VARCHAR(255),               -- Optional campaign name
    
    -- Notes
    note TEXT,
    internal_note TEXT,
    
    -- Audit
    created_by VARCHAR(100),
    created_by_name VARCHAR(255),
    updated_by VARCHAR(100),
    updated_by_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_social_orders_phone ON social_orders(phone);
CREATE INDEX IF NOT EXISTS idx_social_orders_status ON social_orders(status);
CREATE INDEX IF NOT EXISTS idx_social_orders_source ON social_orders(source);
CREATE INDEX IF NOT EXISTS idx_social_orders_created_at ON social_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_orders_stt ON social_orders(stt);
CREATE INDEX IF NOT EXISTS idx_social_orders_assigned_user ON social_orders(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_social_orders_campaign ON social_orders(campaign_name);

-- GIN index for JSONB products and tags search
CREATE INDEX IF NOT EXISTS idx_social_orders_products ON social_orders USING GIN (products);
CREATE INDEX IF NOT EXISTS idx_social_orders_tags ON social_orders USING GIN (tags);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_social_orders_customer_name_trgm ON social_orders USING GIN (customer_name gin_trgm_ops);

-- Create sequence for order code generation
CREATE SEQUENCE IF NOT EXISTS social_order_code_seq START 1;

-- Function to generate order code: SO-YYYYMMDD-XXX
CREATE OR REPLACE FUNCTION generate_social_order_code()
RETURNS VARCHAR(50) AS $$
DECLARE
    today_str VARCHAR(8);
    seq_num INTEGER;
    order_code VARCHAR(50);
BEGIN
    today_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
    seq_num := nextval('social_order_code_seq');
    order_code := 'SO-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN order_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_social_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_social_orders_timestamp ON social_orders;
CREATE TRIGGER trigger_update_social_orders_timestamp
    BEFORE UPDATE ON social_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_social_orders_timestamp();

-- =====================================================
-- SOCIAL ORDER HISTORY TABLE (Audit log)
-- =====================================================

CREATE TABLE IF NOT EXISTS social_order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES social_orders(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,              -- created, updated, status_changed, tag_added, tag_removed, assigned
    changes JSONB,                            -- What changed
    performed_by VARCHAR(100),
    performed_by_name VARCHAR(255),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_order_history_order_id ON social_order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_social_order_history_performed_at ON social_order_history(performed_at DESC);

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE social_orders IS 'Đơn hàng nháp từ các kênh mạng xã hội (không qua TPOS)';
COMMENT ON COLUMN social_orders.order_code IS 'Mã đơn tự sinh: SO-YYYYMMDD-XXX';
COMMENT ON COLUMN social_orders.products IS 'JSON array các sản phẩm trong đơn';
COMMENT ON COLUMN social_orders.tags IS 'JSON array các tag đã gán';
COMMENT ON COLUMN social_orders.source IS 'Nguồn đơn: manual, facebook_post, instagram, tiktok, pancake_import';
