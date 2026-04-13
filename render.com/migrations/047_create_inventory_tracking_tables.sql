-- Migration 047: Create inventory tracking tables (migrated from Firestore)
-- Replaces Firestore collections: inventory_tracking, inventory_prepayments, inventory_other_expenses, edit_history
-- Source: inventory-tracking module (3 tabs: Dat Hang, Theo Doi Don Hang, Cong No)

BEGIN;

-- =====================================================
-- 1. SUPPLIERS (NCC master)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_suppliers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stt_ncc INTEGER UNIQUE NOT NULL,          -- Supplier number (maps to Firestore doc ncc_1, ncc_2...)
    ten_ncc TEXT,                               -- Supplier name (e.g. "Bo Cu Ku Ku")
    firestore_doc_id TEXT,                     -- Original Firestore document ID for migration reference
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_suppliers_stt ON inventory_suppliers(stt_ncc);

-- =====================================================
-- 2. ORDER BOOKINGS (Tab 1: Dat Hang / datHang[])
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_order_bookings (
    id TEXT PRIMARY KEY,                       -- booking_timestamp_random
    stt_ncc INTEGER NOT NULL REFERENCES inventory_suppliers(stt_ncc),
    ngay_dat_hang DATE NOT NULL,               -- Order date
    ten_ncc TEXT,                               -- Supplier name (denormalized for fast reads)
    trang_thai VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, received, cancelled

    -- Products stored as JSONB array (always read/written together)
    -- Each item: { maSP, moTa, mauSac: [{tenMau, soLuong}], tongSoLuong, giaDonVi, thanhTien }
    san_pham JSONB NOT NULL DEFAULT '[]'::jsonb,

    tong_tien_hd NUMERIC(15,2) DEFAULT 0,     -- Total invoice amount
    tong_mon INTEGER DEFAULT 0,                -- Total items count

    -- Invoice images (Firebase Storage URLs)
    anh_hoa_don TEXT[] DEFAULT '{}',

    ghi_chu TEXT DEFAULT '',                   -- Notes

    -- Link to received shipment
    linked_dot_hang_id TEXT,

    -- Audit
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_ob_stt_ncc ON inventory_order_bookings(stt_ncc);
CREATE INDEX IF NOT EXISTS idx_inv_ob_ngay ON inventory_order_bookings(ngay_dat_hang DESC);
CREATE INDEX IF NOT EXISTS idx_inv_ob_trang_thai ON inventory_order_bookings(trang_thai);
CREATE INDEX IF NOT EXISTS idx_inv_ob_ngay_trangThai ON inventory_order_bookings(ngay_dat_hang DESC, trang_thai);
CREATE INDEX IF NOT EXISTS idx_inv_ob_search ON inventory_order_bookings USING gin(san_pham jsonb_path_ops);

-- =====================================================
-- 3. SHIPMENTS (Tab 2: Theo Doi Don Hang / dotHang[])
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_shipments (
    id TEXT PRIMARY KEY,                       -- dot_timestamp_random
    stt_ncc INTEGER NOT NULL REFERENCES inventory_suppliers(stt_ncc),
    ngay_di_hang DATE NOT NULL,                -- Shipment date
    ten_ncc TEXT,                               -- Supplier name (denormalized)

    -- Packages: [{stt, soKg}]
    kien_hang JSONB NOT NULL DEFAULT '[]'::jsonb,
    tong_kien INTEGER DEFAULT 0,
    tong_kg NUMERIC(10,2) DEFAULT 0,

    -- Products (same structure as order bookings)
    san_pham JSONB NOT NULL DEFAULT '[]'::jsonb,

    tong_tien_hd NUMERIC(15,2) DEFAULT 0,     -- Total invoice amount
    tong_mon INTEGER DEFAULT 0,                -- Total items received

    -- Shortage tracking
    so_mon_thieu INTEGER DEFAULT 0,            -- Shortage count
    ghi_chu_thieu TEXT DEFAULT '',              -- Shortage notes

    -- Invoice images
    anh_hoa_don TEXT[] DEFAULT '{}',

    ghi_chu TEXT DEFAULT '',                   -- General notes

    -- Shipping costs (admin only): [{loai, soTien}]
    chi_phi_hang_ve JSONB NOT NULL DEFAULT '[]'::jsonb,
    tong_chi_phi NUMERIC(15,2) DEFAULT 0,      -- Total shipping cost

    -- Audit
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_ship_stt_ncc ON inventory_shipments(stt_ncc);
CREATE INDEX IF NOT EXISTS idx_inv_ship_ngay ON inventory_shipments(ngay_di_hang DESC);
CREATE INDEX IF NOT EXISTS idx_inv_ship_search ON inventory_shipments USING gin(san_pham jsonb_path_ops);

-- =====================================================
-- 4. PREPAYMENTS (Tab 3: Cong No - Thanh toan truoc)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_prepayments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ngay DATE NOT NULL,                        -- Payment date
    so_tien NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Amount
    ghi_chu TEXT DEFAULT '',                   -- Notes
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_prep_ngay ON inventory_prepayments(ngay DESC);

-- =====================================================
-- 5. OTHER EXPENSES (Tab 3: Cong No - Chi phi khac)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_other_expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ngay DATE NOT NULL,                        -- Expense date
    loai_chi TEXT DEFAULT '',                   -- Expense type
    so_tien NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Amount
    ghi_chu TEXT DEFAULT '',                   -- Notes
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_exp_ngay ON inventory_other_expenses(ngay DESC);

-- =====================================================
-- 6. EDIT HISTORY (Audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_edit_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    action VARCHAR(20) NOT NULL,               -- create, update, delete
    entity_type VARCHAR(50) NOT NULL,          -- orderBooking, shipment, prepayment, otherExpense
    entity_id TEXT NOT NULL,
    stt_ncc INTEGER,
    changes JSONB DEFAULT '{}'::jsonb,         -- Before/after diff
    user_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_hist_entity ON inventory_edit_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_inv_hist_created ON inventory_edit_history(created_at DESC);

COMMIT;
