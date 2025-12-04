-- =====================================================
-- ORDER LOGS PHASE 2 - HOLIDAY MANAGEMENT
-- Thêm hỗ trợ quản lý ngày nghỉ và tracking người thực hiện
-- =====================================================

-- Thêm các cột cho ngày nghỉ vào bảng order_logs
ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS performed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN DEFAULT FALSE;

-- Bảng quản lý ngày nghỉ
CREATE TABLE IF NOT EXISTS holiday_dates (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_holiday_dates_date ON holiday_dates(date DESC);

-- Function để check xem một ngày có phải ngày nghỉ không
CREATE OR REPLACE FUNCTION is_holiday(check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM holiday_dates WHERE date = check_date);
END;
$$ LANGUAGE plpgsql;

-- View để xem orders trong ngày nghỉ
CREATE OR REPLACE VIEW holiday_orders AS
SELECT
    o.*,
    h.note as holiday_note
FROM order_logs o
INNER JOIN holiday_dates h ON o.date = h.date
ORDER BY o.date DESC, o.created_at ASC;

-- Comment
COMMENT ON TABLE holiday_dates IS 'Lưu trữ các ngày nghỉ (nhân viên chính off)';
COMMENT ON COLUMN order_logs.performed_by IS 'Người thực hiện order (chỉ dùng cho ngày nghỉ)';
COMMENT ON COLUMN order_logs.is_reconciled IS 'Đã đối soát (chỉ dùng cho ngày nghỉ)';
