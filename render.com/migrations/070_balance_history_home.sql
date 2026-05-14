-- =====================================================
-- MIGRATION 070: balance_history_home
-- Bảng lịch sử biến động số dư cho SePay account thứ 2 ("Home" — sổ thu/chi nội bộ theo phòng).
-- Tách hoàn toàn với balance_history cũ (account #1). Không có customer linking, debt, wallet —
-- chỉ webhook → store → liệt kê + filter + gán mã phòng.
-- =====================================================

CREATE TABLE IF NOT EXISTS balance_history_home (
    id SERIAL PRIMARY KEY,

    -- SePay transaction data (giống schema cũ — webhook payload SePay cùng format)
    sepay_id INTEGER UNIQUE NOT NULL,
    gateway VARCHAR(100) NOT NULL,
    transaction_date TIMESTAMP NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    code VARCHAR(100),
    content TEXT,
    transfer_type VARCHAR(10) NOT NULL CHECK (transfer_type IN ('in', 'out')),
    transfer_amount BIGINT NOT NULL,
    accumulated BIGINT NOT NULL,
    sub_account VARCHAR(100),
    reference_code VARCHAR(100),
    description TEXT,

    -- Home-specific: gán mã phòng (sổ thu/chi nội bộ theo phòng)
    room_code VARCHAR(50),

    -- Show/hide (giữ tương thích với FE)
    is_hidden BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_bh_home_sepay_id ON balance_history_home(sepay_id);
CREATE INDEX IF NOT EXISTS idx_bh_home_transaction_date ON balance_history_home(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bh_home_transfer_type ON balance_history_home(transfer_type);
CREATE INDEX IF NOT EXISTS idx_bh_home_gateway ON balance_history_home(gateway);
CREATE INDEX IF NOT EXISTS idx_bh_home_account_number ON balance_history_home(account_number);
CREATE INDEX IF NOT EXISTS idx_bh_home_room_code ON balance_history_home(room_code);
CREATE INDEX IF NOT EXISTS idx_bh_home_is_hidden ON balance_history_home(is_hidden);

-- Webhook logs (tách riêng để không lẫn với account #1)
CREATE TABLE IF NOT EXISTS sepay_home_webhook_logs (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER,
    request_method VARCHAR(10),
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sepay_home_webhook_logs_created_at ON sepay_home_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sepay_home_webhook_logs_sepay_id ON sepay_home_webhook_logs(sepay_id);

-- Trigger auto-update updated_at (re-use function nếu đã có; create nếu chưa)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bh_home_updated_at ON balance_history_home;
CREATE TRIGGER update_bh_home_updated_at
    BEFORE UPDATE ON balance_history_home
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE balance_history_home IS
'SePay account #2 — Home (sổ thu/chi nội bộ theo phòng). Độc lập với balance_history (account #1).';
