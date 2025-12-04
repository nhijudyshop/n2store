-- =====================================================
-- ORDER LOGS SCHEMA
-- Sổ ghi nhận order hàng từ nhà cung cấp hằng ngày
-- =====================================================

-- Bảng order logs
CREATE TABLE IF NOT EXISTS order_logs (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Thông tin order cơ bản
    date DATE NOT NULL,
    ncc VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    difference BIGINT DEFAULT 0,
    note TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Firebase user ID (for tracking who created/modified)
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Index cho tìm kiếm nhanh theo ngày
CREATE INDEX IF NOT EXISTS idx_order_logs_date ON order_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_order_logs_created_at ON order_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_logs_ncc ON order_logs(ncc);

-- Function để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_order_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger cho order_logs
DROP TRIGGER IF EXISTS update_order_logs_updated_at ON order_logs;
CREATE TRIGGER update_order_logs_updated_at
    BEFORE UPDATE ON order_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_order_logs_updated_at();

-- View để xem tổng quan theo ngày
CREATE OR REPLACE VIEW order_logs_daily_summary AS
SELECT
    date,
    COUNT(*) as total_orders,
    SUM(amount) as total_amount,
    SUM(CASE WHEN is_paid THEN amount ELSE 0 END) as paid_amount,
    SUM(CASE WHEN NOT is_paid THEN amount ELSE 0 END) as unpaid_amount,
    SUM(difference) as total_difference
FROM order_logs
GROUP BY date
ORDER BY date DESC;
