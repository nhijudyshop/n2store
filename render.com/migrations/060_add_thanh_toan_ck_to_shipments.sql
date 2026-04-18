-- Migration 060: Add payment tracking (thanh_toan_ck) + exchange rate (ti_gia) to inventory_shipments
-- Purpose: Per-đợt payment tracking panel in inventory-tracking Tab 1
-- Each (ngay_di_hang, dot_so) group shares the same payment data — stored on each row
-- and kept in sync by a dedicated PATCH endpoint (/shipments/payment-by-dot).

ALTER TABLE inventory_shipments
    ADD COLUMN IF NOT EXISTS thanh_toan_ck JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ti_gia        NUMERIC(10,4) NOT NULL DEFAULT 0;

-- Index to speed up group updates by (ngay_di_hang, dot_so)
CREATE INDEX IF NOT EXISTS idx_inv_ship_ngay_dot
    ON inventory_shipments (ngay_di_hang, dot_so);

COMMENT ON COLUMN inventory_shipments.thanh_toan_ck IS
    'Per-đợt payments: [{id, ngayTT: YYYY-MM-DD, soTienTT: number, ghiChu: string}]. Synced across all NCC rows in same (ngay_di_hang, dot_so) group.';
COMMENT ON COLUMN inventory_shipments.ti_gia IS
    'Exchange rate (1 unit of soTienTT → VND). One rate per đợt group.';
