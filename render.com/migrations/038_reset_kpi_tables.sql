-- =====================================================
-- 038: Reset KPI Tables for Render PostgreSQL
-- Drops old tables and recreates with orderCode as primary key
-- No migration - clean slate
-- =====================================================

DROP TABLE IF EXISTS kpi_audit_log CASCADE;
DROP TABLE IF EXISTS kpi_statistics CASCADE;
DROP TABLE IF EXISTS kpi_base CASCADE;

-- =====================================================
-- 1. KPI Base - Snapshot sản phẩm gốc khi bắt đầu KPI
-- Key: order_code (mã đơn hàng từ TPOS, VD: "260400300")
-- =====================================================
CREATE TABLE kpi_base (
    order_code VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(255),
    campaign_id VARCHAR(255),
    campaign_name VARCHAR(255),
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    stt INTEGER NOT NULL DEFAULT 0,
    products JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kpi_base_campaign ON kpi_base(campaign_name);
CREATE INDEX idx_kpi_base_user ON kpi_base(user_id);
CREATE INDEX idx_kpi_base_stt ON kpi_base(stt);

COMMENT ON TABLE kpi_base IS 'KPI baseline product snapshots - immutable after creation';
COMMENT ON COLUMN kpi_base.order_code IS 'Primary key: TPOS order code (e.g. 260400300)';
COMMENT ON COLUMN kpi_base.products IS '[{ProductId, ProductCode, ProductName, Quantity, Price}]';

-- =====================================================
-- 2. KPI Audit Log - Mỗi lần thêm/bớt SP
-- Append-only, no merge actions
-- =====================================================
CREATE TABLE kpi_audit_log (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(50) NOT NULL,
    order_id VARCHAR(255),
    action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'remove')),
    product_id INTEGER,
    product_code VARCHAR(100) NOT NULL,
    product_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    source VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    campaign_id VARCHAR(255),
    campaign_name VARCHAR(255),
    out_of_range BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_order_code ON kpi_audit_log(order_code, created_at);
CREATE INDEX idx_audit_campaign ON kpi_audit_log(campaign_name);

COMMENT ON TABLE kpi_audit_log IS 'Append-only audit log of product add/remove actions';
COMMENT ON COLUMN kpi_audit_log.source IS 'chat_confirm_held|chat_decrease|chat_from_dropped|edit_modal_*|sale_modal|system';

-- =====================================================
-- 3. KPI Statistics - Tổng hợp theo nhân viên/ngày
-- =====================================================
CREATE TABLE kpi_statistics (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    stat_date DATE NOT NULL,
    total_net_products INTEGER DEFAULT 0,
    total_kpi DECIMAL(15,2) DEFAULT 0,
    orders JSONB DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date)
);

CREATE INDEX idx_kpi_stats_user_date ON kpi_statistics(user_id, stat_date DESC);
CREATE INDEX idx_kpi_stats_date ON kpi_statistics(stat_date DESC);

COMMENT ON TABLE kpi_statistics IS 'Daily KPI summary per employee';
COMMENT ON COLUMN kpi_statistics.orders IS '[{orderCode, stt, campaignName, netProducts, kpi, details, updatedAt}]';
