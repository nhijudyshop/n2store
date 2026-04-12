-- Migration 044: Create invoice_njd_mapping table
-- Maps SaleOnlineOrder IDs → NJD invoice numbers (source of truth for invoice lookup)
-- Replaces unreliable Reference-based matching

CREATE TABLE IF NOT EXISTS invoice_njd_mapping (
    id SERIAL PRIMARY KEY,
    sale_online_id TEXT NOT NULL,
    order_code TEXT,                    -- mã đơn hàng (e.g. 260400867)
    njd_number TEXT NOT NULL,           -- e.g. NJD/2026/60507
    tpos_invoice_id INTEGER,            -- TPOS FastSaleOrder.Id
    partner_name TEXT,                  -- tên khách trên phiếu
    phone TEXT,
    amount_total NUMERIC,
    show_state TEXT,                    -- Đã xác nhận, Đã thanh toán, Nháp, Huỷ bỏ
    state TEXT,                         -- open, paid, draft, cancel
    state_code TEXT DEFAULT 'None',     -- None, WaitingConfirm, Confirmed
    date_invoice TIMESTAMPTZ,
    user_name TEXT,                     -- nhân viên tạo phiếu
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sale_online_id, njd_number)
);

-- Index for fast lookup by sale_online_id
CREATE INDEX IF NOT EXISTS idx_njd_mapping_sale_online_id ON invoice_njd_mapping(sale_online_id);

-- Index for lookup by order_code (fallback)
CREATE INDEX IF NOT EXISTS idx_njd_mapping_order_code ON invoice_njd_mapping(order_code);

-- Index for lookup by njd_number
CREATE INDEX IF NOT EXISTS idx_njd_mapping_njd_number ON invoice_njd_mapping(njd_number);

-- Index for lookup by tpos_invoice_id
CREATE INDEX IF NOT EXISTS idx_njd_mapping_tpos_id ON invoice_njd_mapping(tpos_invoice_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_njd_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_njd_mapping_updated_at ON invoice_njd_mapping;
CREATE TRIGGER trigger_njd_mapping_updated_at
    BEFORE UPDATE ON invoice_njd_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_njd_mapping_updated_at();
