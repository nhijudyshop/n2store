-- ═══════════════════════════════════════════════════════════════════════════════
-- UNIFIED CUSTOMER 360 & FINANCIAL HUB
-- Database Schema v1.0
-- PostgreSQL 15+ Required
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CRITICAL SECURITY NOTES:
-- 1. Bảng audit_logs và wallet_transactions là IMMUTABLE (không được UPDATE/DELETE)
-- 2. Tất cả giao dịch wallet PHẢI sử dụng Transaction với Row-level Locking
-- 3. Phone được normalize về format 0xxxxxxxxx
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 0: EXTENSIONS & UTILITY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- Phone Normalization Function
-- Ép kiểu tất cả SĐT về dạng 0xxxxxxxxx (10-11 số)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION normalize_phone(input_phone TEXT)
RETURNS VARCHAR(11) AS $$
DECLARE
    cleaned TEXT;
BEGIN
    IF input_phone IS NULL OR input_phone = '' THEN
        RETURN NULL;
    END IF;

    -- Remove all non-digits
    cleaned := regexp_replace(input_phone, '[^0-9]', '', 'g');

    -- Handle +84 or 84 prefix
    IF cleaned LIKE '84%' AND length(cleaned) >= 11 THEN
        cleaned := '0' || substring(cleaned FROM 3);
    END IF;

    -- Add leading 0 if missing
    IF cleaned NOT LIKE '0%' AND length(cleaned) = 9 THEN
        cleaned := '0' || cleaned;
    END IF;

    -- Validate final format
    IF cleaned ~ '^0[0-9]{9,10}$' THEN
        RETURN cleaned;
    ELSE
        RAISE EXCEPTION 'Invalid phone format: %', input_phone;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: SYSTEM CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- Default configurations
INSERT INTO system_config (key, value, description) VALUES
('virtual_credit_expiry_days', '15', 'Số ngày hết hạn công nợ ảo'),
('carrier_recovery_deadline_days', '10', 'Số ngày deadline ĐVVC mang hàng về'),
('max_transaction_amount', '100000000', 'Giới hạn tối đa 1 giao dịch (100 triệu)'),
('fraud_alert_threshold', '5000000', 'Ngưỡng cảnh báo gian lận (5 triệu)'),
('daily_withdrawal_limit', '50000000', 'Giới hạn rút tiền/ngày (50 triệu)'),
('rfm_recency_thresholds', '[7, 30, 90, 180]', 'Ngưỡng ngày cho RFM Recency score'),
('rfm_frequency_thresholds', '[2, 3, 5, 10]', 'Ngưỡng số đơn cho RFM Frequency score'),
('rfm_monetary_thresholds', '[500000, 1000000, 2000000, 5000000]', 'Ngưỡng VND cho RFM Monetary score');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: USER & ACCESS CONTROL (RBAC)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (name, description, permissions) VALUES
('ADMIN', 'Quản trị viên - Full quyền', '{
    "customer": ["create", "read", "update", "delete"],
    "wallet": ["deposit", "withdraw", "adjust", "view_audit", "freeze"],
    "ticket": ["create", "read", "update", "delete", "complete", "cancel", "receive", "settle"],
    "bank_tx": ["read", "match", "process", "hide"],
    "report": ["view", "export"],
    "system": ["config", "user_management", "audit"]
}'),
('ACCOUNTANT', 'Kế toán - Quản lý tài chính', '{
    "customer": ["read", "update"],
    "wallet": ["deposit", "withdraw", "adjust", "view_audit"],
    "ticket": ["read", "update", "complete", "settle"],
    "bank_tx": ["read", "match", "process"],
    "report": ["view", "export"],
    "system": ["audit"]
}'),
('WAREHOUSE', 'Kho - Nhận hàng hoàn', '{
    "customer": ["read"],
    "wallet": ["read"],
    "ticket": ["read", "receive"],
    "bank_tx": [],
    "report": ["view"],
    "system": []
}'),
('CSKH', 'Chăm sóc khách hàng - Tạo sự vụ', '{
    "customer": ["create", "read", "update"],
    "wallet": ["read"],
    "ticket": ["create", "read", "update"],
    "bank_tx": ["read", "match"],
    "report": ["view"],
    "system": []
}');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role_id INTEGER REFERENCES roles(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: CUSTOMERS (Master Customer Data)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,

    -- ═══ IDENTITY (CRITICAL) ═══
    phone VARCHAR(11) UNIQUE NOT NULL,  -- Normalized: 0901234567

    -- ═══ BASIC INFO ═══
    name VARCHAR(255),
    email VARCHAR(255),

    -- ═══ ADDRESSES ═══
    addresses JSONB DEFAULT '[]',
    -- Format: [{"id": 1, "address": "...", "ward": "...", "district": "...",
    --           "city": "...", "is_default": true, "label": "Nhà"}]

    -- ═══ EXTERNAL LINKS ═══
    tpos_partner_ids JSONB DEFAULT '[]',  -- Array of TPOS Partner IDs
    facebook_psid VARCHAR(100),
    zalo_id VARCHAR(100),

    -- ═══ CLASSIFICATION ═══
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'warning', 'danger', 'blocked')),
    tier VARCHAR(20) DEFAULT 'normal'
        CHECK (tier IN ('normal', 'silver', 'gold', 'vip', 'blacklist')),
    tags JSONB DEFAULT '[]',  -- ["Hay đổi size", "VIP", "Boom 2 lần"]

    -- ═══ STATISTICS (Auto-calculated) ═══
    total_orders INTEGER DEFAULT 0,
    successful_orders INTEGER DEFAULT 0,
    returned_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0,
    return_rate DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_orders > 0
             THEN ROUND((returned_orders::DECIMAL / total_orders) * 100, 2)
             ELSE 0
        END
    ) STORED,

    -- ═══ ENGAGEMENT ═══
    first_order_date TIMESTAMP,
    last_order_date TIMESTAMP,
    last_interaction_at TIMESTAMP,
    days_since_last_order INTEGER GENERATED ALWAYS AS (
        CASE WHEN last_order_date IS NOT NULL
             THEN EXTRACT(DAY FROM NOW() - last_order_date)::INTEGER
             ELSE NULL
        END
    ) STORED,

    -- ═══ RFM SCORING ═══
    rfm_recency INTEGER DEFAULT 0 CHECK (rfm_recency BETWEEN 0 AND 5),
    rfm_frequency INTEGER DEFAULT 0 CHECK (rfm_frequency BETWEEN 0 AND 5),
    rfm_monetary INTEGER DEFAULT 0 CHECK (rfm_monetary BETWEEN 0 AND 5),
    rfm_segment VARCHAR(30),
    rfm_calculated_at TIMESTAMP,

    -- ═══ NOTES ═══
    internal_note TEXT,

    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_customers_last_order ON customers(last_order_date DESC NULLS LAST);
CREATE INDEX idx_customers_rfm_segment ON customers(rfm_segment);
CREATE INDEX idx_customers_tags ON customers USING GIN(tags);
CREATE INDEX idx_customers_return_rate ON customers(return_rate DESC) WHERE return_rate > 20;

-- Trigger: Auto-normalize phone on insert/update
CREATE OR REPLACE FUNCTION trg_normalize_customer_phone()
RETURNS TRIGGER AS $$
BEGIN
    NEW.phone := normalize_phone(NEW.phone);
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_normalize_phone
BEFORE INSERT OR UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION trg_normalize_customer_phone();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: WALLETS (Unified Real + Virtual Balance)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wallets (
    id SERIAL PRIMARY KEY,

    -- ═══ IDENTITY ═══
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    phone VARCHAR(11) UNIQUE NOT NULL REFERENCES customers(phone) ON DELETE CASCADE,

    -- ═══ BALANCES ═══
    real_balance DECIMAL(15,2) DEFAULT 0 CHECK (real_balance >= 0),
    virtual_balance DECIMAL(15,2) DEFAULT 0 CHECK (virtual_balance >= 0),
    -- total_balance = real_balance + virtual_balance (calculated in queries)

    -- ═══ LIFETIME TOTALS ═══
    total_deposited DECIMAL(15,2) DEFAULT 0,
    total_withdrawn DECIMAL(15,2) DEFAULT 0,
    total_virtual_issued DECIMAL(15,2) DEFAULT 0,
    total_virtual_used DECIMAL(15,2) DEFAULT 0,
    total_virtual_expired DECIMAL(15,2) DEFAULT 0,

    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- ═══ LOCK ═══
    is_frozen BOOLEAN DEFAULT FALSE,  -- Freeze wallet khi có nghi ngờ gian lận
    frozen_reason TEXT,
    frozen_at TIMESTAMP,
    frozen_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_wallets_phone ON wallets(phone);
CREATE INDEX idx_wallets_frozen ON wallets(is_frozen) WHERE is_frozen = TRUE;

-- Auto-create wallet when customer is created
CREATE OR REPLACE FUNCTION trg_create_wallet_for_customer()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (customer_id, phone)
    VALUES (NEW.id, NEW.phone)
    ON CONFLICT (phone) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_create_wallet
AFTER INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION trg_create_wallet_for_customer();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: VIRTUAL CREDITS (Công Nợ Ảo có Thời Hạn)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE virtual_credits (
    id SERIAL PRIMARY KEY,

    -- ═══ IDENTITY ═══
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    phone VARCHAR(11) NOT NULL REFERENCES customers(phone),

    -- ═══ AMOUNTS ═══
    original_amount DECIMAL(15,2) NOT NULL CHECK (original_amount > 0),
    remaining_amount DECIMAL(15,2) NOT NULL CHECK (remaining_amount >= 0),

    -- ═══ EXPIRY ═══
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    -- ═══ STATUS ═══
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')),

    -- ═══ SOURCE ═══
    source_type VARCHAR(30) NOT NULL
        CHECK (source_type IN ('RETURN_SHIPPER', 'COMPENSATION', 'PROMOTION', 'MANUAL')),
    source_ticket_id INTEGER,  -- Reference to tickets table
    source_note TEXT,

    -- ═══ USAGE HISTORY ═══
    usage_history JSONB DEFAULT '[]',
    -- Format: [{"order_id": "NJD/2026/123", "amount": 50000, "used_at": "2026-01-05T10:00:00Z"}]

    -- ═══ METADATA ═══
    created_by INTEGER REFERENCES users(id),
    cancelled_by INTEGER REFERENCES users(id),
    cancelled_at TIMESTAMP,
    cancel_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vc_wallet ON virtual_credits(wallet_id);
CREATE INDEX idx_vc_phone ON virtual_credits(phone);
CREATE INDEX idx_vc_status ON virtual_credits(status);
CREATE INDEX idx_vc_expires ON virtual_credits(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_vc_source_ticket ON virtual_credits(source_ticket_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: WALLET TRANSACTIONS (Immutable Ledger)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wallet_transactions (
    id BIGSERIAL PRIMARY KEY,

    -- ═══ IDENTITY ═══
    transaction_code VARCHAR(30) UNIQUE NOT NULL,  -- WT-20260105-000001
    wallet_id INTEGER NOT NULL REFERENCES wallets(id),
    phone VARCHAR(11) NOT NULL REFERENCES customers(phone),

    -- ═══ TYPE ═══
    transaction_type VARCHAR(30) NOT NULL
        CHECK (transaction_type IN (
            'DEPOSIT_BANK',          -- Nạp từ chuyển khoản
            'DEPOSIT_RETURN',        -- Hoàn tiền từ đơn hoàn
            'DEPOSIT_ADJUSTMENT',    -- Điều chỉnh thủ công (+)
            'WITHDRAW_ORDER',        -- Trừ để mua hàng
            'WITHDRAW_REFUND',       -- Rút về tài khoản
            'WITHDRAW_ADJUSTMENT',   -- Điều chỉnh thủ công (-)
            'VIRTUAL_CREDIT_ISSUE',  -- Cấp công nợ ảo
            'VIRTUAL_CREDIT_USE',    -- Sử dụng công nợ ảo
            'VIRTUAL_CREDIT_EXPIRE'  -- Công nợ ảo hết hạn
        )),

    -- ═══ AMOUNTS ═══
    amount DECIMAL(15,2) NOT NULL,  -- Always positive, sign determined by type

    -- ═══ BALANCE SNAPSHOT ═══
    real_balance_before DECIMAL(15,2) NOT NULL,
    real_balance_after DECIMAL(15,2) NOT NULL,
    virtual_balance_before DECIMAL(15,2) NOT NULL,
    virtual_balance_after DECIMAL(15,2) NOT NULL,

    -- ═══ SOURCE REFERENCE ═══
    source_type VARCHAR(30),  -- 'bank_transfer', 'ticket', 'order', 'manual'
    source_id VARCHAR(100),   -- sepay_id, ticket_id, order_id
    source_details JSONB,     -- Additional source info

    -- ═══ VIRTUAL CREDIT LINK ═══
    virtual_credit_id INTEGER REFERENCES virtual_credits(id),

    -- ═══ DESCRIPTION ═══
    description TEXT,
    internal_note TEXT,

    -- ═══ METADATA ═══
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- ═══ VALIDATION ═══
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_balance_consistency CHECK (
        real_balance_after >= 0 AND virtual_balance_after >= 0
    )
);

CREATE INDEX idx_wtx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wtx_phone ON wallet_transactions(phone);
CREATE INDEX idx_wtx_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wtx_created ON wallet_transactions(created_at DESC);
CREATE INDEX idx_wtx_source ON wallet_transactions(source_type, source_id);

-- Transaction code generator
CREATE OR REPLACE FUNCTION generate_transaction_code()
RETURNS TRIGGER AS $$
DECLARE
    date_part VARCHAR(8);
    seq_num INTEGER;
BEGIN
    date_part := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(transaction_code FROM 13 FOR 6) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM wallet_transactions
    WHERE transaction_code LIKE 'WT-' || date_part || '-%';

    NEW.transaction_code := 'WT-' || date_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transactions_generate_code
BEFORE INSERT ON wallet_transactions
FOR EACH ROW
WHEN (NEW.transaction_code IS NULL)
EXECUTE FUNCTION generate_transaction_code();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: BANK TRANSACTIONS (SePay Integration)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE bank_transactions (
    id BIGSERIAL PRIMARY KEY,

    -- ═══ SEPAY DATA ═══
    sepay_id BIGINT UNIQUE NOT NULL,
    gateway VARCHAR(50) NOT NULL,  -- ACB, VCB, TCB...
    transaction_date TIMESTAMP NOT NULL,
    account_number VARCHAR(50) NOT NULL,

    -- ═══ TRANSACTION INFO ═══
    content TEXT,  -- Nội dung chuyển khoản
    transfer_type VARCHAR(10) NOT NULL CHECK (transfer_type IN ('in', 'out')),
    transfer_amount DECIMAL(15,2) NOT NULL,
    accumulated_balance DECIMAL(15,2),
    reference_code VARCHAR(100),

    -- ═══ EXTRACTION ═══
    extracted_code VARCHAR(50),      -- N2ABC123 or phone number
    extracted_phone VARCHAR(11),     -- Normalized phone if found
    extraction_method VARCHAR(30),   -- QR_CODE, PHONE_EXACT, PHONE_PARTIAL, MOMO, VCB
    extraction_note TEXT,

    -- ═══ CUSTOMER MATCHING ═══
    matched_customer_id INTEGER REFERENCES customers(id),
    matched_phone VARCHAR(11) REFERENCES customers(phone),
    match_status VARCHAR(20) DEFAULT 'PENDING'
        CHECK (match_status IN ('PENDING', 'MATCHED', 'MULTIPLE', 'NOT_FOUND', 'IGNORED')),

    -- ═══ WALLET PROCESSING ═══
    wallet_processed BOOLEAN DEFAULT FALSE,
    wallet_transaction_id BIGINT REFERENCES wallet_transactions(id),
    processed_at TIMESTAMP,
    processed_by INTEGER REFERENCES users(id),

    -- ═══ FLAGS ═══
    is_hidden BOOLEAN DEFAULT FALSE,

    -- ═══ RAW DATA ═══
    raw_webhook_data JSONB,

    -- ═══ METADATA ═══
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_btx_sepay_id ON bank_transactions(sepay_id);
CREATE INDEX idx_btx_date ON bank_transactions(transaction_date DESC);
CREATE INDEX idx_btx_matched_phone ON bank_transactions(matched_phone);
CREATE INDEX idx_btx_unprocessed ON bank_transactions(wallet_processed) WHERE wallet_processed = FALSE;
CREATE INDEX idx_btx_match_status ON bank_transactions(match_status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 8: TICKETS (Issue Tracking)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,

    -- ═══ IDENTITY ═══
    ticket_code VARCHAR(20) UNIQUE NOT NULL,  -- TV-2026-00001

    -- ═══ CUSTOMER LINK ═══
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    phone VARCHAR(11) NOT NULL REFERENCES customers(phone),
    customer_name VARCHAR(255),  -- Snapshot at creation time

    -- ═══ ORDER LINK ═══
    order_id VARCHAR(50),        -- NJD/2026/12345
    tpos_order_id INTEGER,
    tracking_code VARCHAR(50),
    carrier VARCHAR(50),

    -- ═══ TYPE & STATUS ═══
    ticket_type VARCHAR(30) NOT NULL
        CHECK (ticket_type IN ('BOOM', 'FIX_COD', 'RETURN_CLIENT', 'RETURN_SHIPPER',
                               'COMPLAINT', 'WARRANTY', 'OTHER')),
    status VARCHAR(30) DEFAULT 'PENDING_GOODS'
        CHECK (status IN ('PENDING_GOODS', 'PENDING_FINANCE', 'COMPLETED', 'CANCELLED')),
    priority VARCHAR(20) DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- ═══ PRODUCTS ═══
    products JSONB DEFAULT '[]',
    -- Format: [{"id": 123, "name": "...", "sku": "...", "price": 150000, "quantity": 1,
    --           "status": "returned", "condition": "ok|damaged"}]

    -- ═══ FINANCIAL ═══
    original_cod DECIMAL(15,2),
    new_cod DECIMAL(15,2),
    refund_amount DECIMAL(15,2),  -- Calculated difference or product value

    -- ═══ WALLET INTEGRATION ═══
    wallet_action VARCHAR(30),  -- 'CREDIT_REAL', 'CREDIT_VIRTUAL', 'NONE'
    wallet_credited BOOLEAN DEFAULT FALSE,
    wallet_transaction_id BIGINT REFERENCES wallet_transactions(id),
    virtual_credit_id INTEGER REFERENCES virtual_credits(id),

    -- ═══ FIX_COD SPECIFIC ═══
    fix_cod_reason VARCHAR(30)
        CHECK (fix_cod_reason IN ('WRONG_SHIP', 'CUSTOMER_DEBT', 'DISCOUNT', 'REJECT_PARTIAL')),

    -- ═══ RETURN_SHIPPER SPECIFIC ═══
    linked_new_order_id VARCHAR(50),
    linked_new_order_delivered_at TIMESTAMP,

    -- ═══ DEADLINES ═══
    carrier_deadline TIMESTAMP,
    carrier_issue_flag BOOLEAN DEFAULT FALSE,

    -- ═══ PROCESSING ═══
    received_at TIMESTAMP,      -- Kho nhận hàng
    received_by INTEGER REFERENCES users(id),
    settled_at TIMESTAMP,       -- Kế toán đối soát
    settled_by INTEGER REFERENCES users(id),
    completed_at TIMESTAMP,
    completed_by INTEGER REFERENCES users(id),
    cancelled_at TIMESTAMP,
    cancelled_by INTEGER REFERENCES users(id),
    cancel_reason TEXT,

    -- ═══ ASSIGNMENT ═══
    assigned_to INTEGER REFERENCES users(id),

    -- ═══ NOTES ═══
    internal_note TEXT,

    -- ═══ ACTION HISTORY ═══
    action_history JSONB DEFAULT '[]',
    -- Format: [{"action": "...", "old_status": "...", "new_status": "...",
    --           "performed_by": "username", "performed_at": "...", "note": "..."}]

    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_tickets_code ON tickets(ticket_code);
CREATE INDEX idx_tickets_phone ON tickets(phone);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_type ON tickets(ticket_type);
CREATE INDEX idx_tickets_order ON tickets(order_id);
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX idx_tickets_pending ON tickets(status) WHERE status IN ('PENDING_GOODS', 'PENDING_FINANCE');

-- Ticket code generator
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(ticket_code FROM 9 FOR 5) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM tickets
    WHERE ticket_code LIKE 'TV-' || year_part || '-%';

    NEW.ticket_code := 'TV-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_generate_code
BEFORE INSERT ON tickets
FOR EACH ROW
WHEN (NEW.ticket_code IS NULL)
EXECUTE FUNCTION generate_ticket_code();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: CUSTOMER ACTIVITIES (Unified Timeline)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_activities (
    id BIGSERIAL PRIMARY KEY,

    -- ═══ CUSTOMER LINK ═══
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    phone VARCHAR(11) NOT NULL REFERENCES customers(phone),

    -- ═══ ACTIVITY TYPE ═══
    activity_type VARCHAR(50) NOT NULL,
    -- WALLET_DEPOSIT, WALLET_WITHDRAW, WALLET_VIRTUAL_CREDIT, WALLET_VIRTUAL_EXPIRE
    -- TICKET_CREATED, TICKET_UPDATED, TICKET_COMPLETED, TICKET_CANCELLED
    -- ORDER_CREATED, ORDER_DELIVERED, ORDER_RETURNED
    -- CUSTOMER_CREATED, CUSTOMER_UPDATED, TAG_ADDED, NOTE_ADDED
    -- BANK_TRANSFER_RECEIVED

    -- ═══ CONTENT ═══
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- ═══ REFERENCE ═══
    reference_type VARCHAR(30),  -- wallet_tx, ticket, order, bank_tx
    reference_id VARCHAR(100),

    -- ═══ METADATA ═══
    metadata JSONB DEFAULT '{}',

    -- ═══ UI HINTS ═══
    icon VARCHAR(30),
    color VARCHAR(20),

    -- ═══ TIMESTAMP ═══
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activities_phone ON customer_activities(phone);
CREATE INDEX idx_activities_customer ON customer_activities(customer_id);
CREATE INDEX idx_activities_type ON customer_activities(activity_type);
CREATE INDEX idx_activities_created ON customer_activities(created_at DESC);
CREATE INDEX idx_activities_ref ON customer_activities(reference_type, reference_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 10: CUSTOMER NOTES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_notes (
    id SERIAL PRIMARY KEY,

    customer_id INTEGER NOT NULL REFERENCES customers(id),
    phone VARCHAR(11) NOT NULL REFERENCES customers(phone),

    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    category VARCHAR(30) DEFAULT 'general'
        CHECK (category IN ('general', 'warning', 'important', 'follow_up')),

    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_phone ON customer_notes(phone);
CREATE INDEX idx_notes_pinned ON customer_notes(is_pinned) WHERE is_pinned = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 11: AUDIT LOGS (Comprehensive Tracking)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,

    -- ═══ ACTION ═══
    action VARCHAR(100) NOT NULL,
    -- WALLET_DEPOSIT, WALLET_WITHDRAW, WALLET_ADJUST, WALLET_FREEZE
    -- TICKET_CREATE, TICKET_UPDATE, TICKET_COMPLETE, TICKET_CANCEL
    -- CUSTOMER_CREATE, CUSTOMER_UPDATE, CUSTOMER_BLOCK
    -- CONFIG_UPDATE, USER_LOGIN, USER_LOGOUT

    -- ═══ TARGET ═══
    entity_type VARCHAR(50) NOT NULL,  -- customer, wallet, ticket, user, config
    entity_id VARCHAR(100),
    entity_phone VARCHAR(11),

    -- ═══ CHANGES ═══
    old_value JSONB,
    new_value JSONB,

    -- ═══ CONTEXT ═══
    description TEXT,

    -- ═══ USER ═══
    performed_by INTEGER REFERENCES users(id),
    performed_by_username VARCHAR(50),
    performed_by_role VARCHAR(50),

    -- ═══ REQUEST INFO ═══
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(50),

    -- ═══ FLAGS ═══
    is_suspicious BOOLEAN DEFAULT FALSE,
    fraud_score INTEGER DEFAULT 0,  -- 0-100

    -- ═══ TIMESTAMP ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(performed_by);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_suspicious ON audit_logs(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX idx_audit_phone ON audit_logs(entity_phone);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 12: PENDING CUSTOMER MATCHES (Multi-match Resolution)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE pending_matches (
    id SERIAL PRIMARY KEY,

    -- ═══ SOURCE ═══
    bank_transaction_id BIGINT NOT NULL REFERENCES bank_transactions(id),
    extracted_phone_partial VARCHAR(20) NOT NULL,

    -- ═══ MATCHED OPTIONS ═══
    matched_customers JSONB NOT NULL,
    -- Format: [{"customer_id": 1, "phone": "0901234567", "name": "...", "match_score": 95}]

    -- ═══ RESOLUTION ═══
    selected_customer_id INTEGER REFERENCES customers(id),
    status VARCHAR(20) DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RESOLVED', 'SKIPPED')),
    resolution_note TEXT,

    -- ═══ METADATA ═══
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_status ON pending_matches(status) WHERE status = 'PENDING';
CREATE INDEX idx_pending_btx ON pending_matches(bank_transaction_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 13: QR CODE MAPPINGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE qr_code_mappings (
    id SERIAL PRIMARY KEY,

    unique_code VARCHAR(50) UNIQUE NOT NULL,  -- N2ABC123...
    customer_id INTEGER REFERENCES customers(id),
    phone VARCHAR(11) REFERENCES customers(phone),

    amount DECIMAL(15,2),  -- Expected amount (optional)

    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),

    used_at TIMESTAMP,
    bank_transaction_id BIGINT REFERENCES bank_transactions(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_qr_code ON qr_code_mappings(unique_code);
CREATE INDEX idx_qr_phone ON qr_code_mappings(phone);
CREATE INDEX idx_qr_active ON qr_code_mappings(status) WHERE status = 'ACTIVE';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 14: SCHEDULED JOBS TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE scheduled_jobs (
    id SERIAL PRIMARY KEY,

    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL,  -- EXPIRE_VIRTUAL_CREDITS, CHECK_CARRIER_DEADLINE, CALCULATE_RFM

    last_run_at TIMESTAMP,
    last_run_status VARCHAR(20),  -- SUCCESS, FAILED, SKIPPED
    last_run_duration_ms INTEGER,
    last_run_result JSONB,

    next_run_at TIMESTAMP,

    is_enabled BOOLEAN DEFAULT TRUE,
    cron_expression VARCHAR(50),  -- "0 * * * *" for hourly

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_jobs_name ON scheduled_jobs(job_name);

-- Insert default jobs
INSERT INTO scheduled_jobs (job_name, job_type, cron_expression, next_run_at) VALUES
('expire_virtual_credits', 'EXPIRE_VIRTUAL_CREDITS', '0 * * * *', CURRENT_TIMESTAMP + INTERVAL '1 hour'),
('check_carrier_deadline', 'CHECK_CARRIER_DEADLINE', '0 8 * * *', CURRENT_TIMESTAMP + INTERVAL '1 day'),
('calculate_rfm_scores', 'CALCULATE_RFM', '0 2 * * 0', CURRENT_TIMESTAMP + INTERVAL '7 days'),
('cleanup_expired_qr', 'CLEANUP_QR', '0 3 * * *', CURRENT_TIMESTAMP + INTERVAL '1 day');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 15: VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Customer 360 View
CREATE OR REPLACE VIEW customer_360_view AS
SELECT
    c.*,
    w.real_balance,
    w.virtual_balance,
    (w.real_balance + w.virtual_balance) AS total_balance,
    w.is_frozen AS wallet_frozen,
    (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('PENDING_GOODS', 'PENDING_FINANCE')) AS pending_tickets,
    (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id) AS total_tickets,
    (SELECT COUNT(*) FROM virtual_credits vc WHERE vc.phone = c.phone AND vc.status = 'ACTIVE') AS active_virtual_credits,
    (SELECT SUM(remaining_amount) FROM virtual_credits vc WHERE vc.phone = c.phone AND vc.status = 'ACTIVE') AS active_virtual_amount
FROM customers c
LEFT JOIN wallets w ON c.id = w.customer_id;

-- Pending Actions View
CREATE OR REPLACE VIEW pending_actions_view AS
SELECT
    'TICKET' AS action_type,
    t.id::TEXT AS entity_id,
    t.ticket_code AS code,
    t.phone,
    c.name AS customer_name,
    t.ticket_type AS sub_type,
    t.status,
    t.refund_amount AS amount,
    t.created_at,
    CASE
        WHEN t.status = 'PENDING_GOODS' THEN 'Chờ hàng về kho'
        WHEN t.status = 'PENDING_FINANCE' THEN 'Chờ kế toán đối soát'
    END AS action_required
FROM tickets t
JOIN customers c ON t.customer_id = c.id
WHERE t.status IN ('PENDING_GOODS', 'PENDING_FINANCE')

UNION ALL

SELECT
    'BANK_MATCH' AS action_type,
    bt.id::TEXT AS entity_id,
    bt.reference_code AS code,
    bt.extracted_phone AS phone,
    NULL AS customer_name,
    bt.extraction_method AS sub_type,
    bt.match_status AS status,
    bt.transfer_amount AS amount,
    bt.created_at,
    'Cần ghép khách hàng' AS action_required
FROM bank_transactions bt
WHERE bt.match_status = 'PENDING' OR bt.match_status = 'MULTIPLE';

-- Daily Stats View
CREATE OR REPLACE VIEW daily_wallet_stats AS
SELECT
    DATE(created_at) AS date,
    transaction_type,
    COUNT(*) AS count,
    SUM(amount) AS total_amount
FROM wallet_transactions
GROUP BY DATE(created_at), transaction_type
ORDER BY date DESC, transaction_type;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 16: IMMUTABLE DATA PROTECTION (CRITICAL SECURITY)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- BẮT BUỘC: Ngăn chặn UPDATE/DELETE trên audit_logs và wallet_transactions
-- Đây là bằng chứng tài chính, KHÔNG ĐƯỢC PHÉP sửa đổi dưới mọi hình thức
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function chung để ngăn chặn modification
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: Table % is immutable. UPDATE/DELETE operations are prohibited.', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger bảo vệ audit_logs - KHÔNG ĐƯỢC UPDATE hoặc DELETE
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Trigger bảo vệ wallet_transactions - KHÔNG ĐƯỢC UPDATE hoặc DELETE
CREATE TRIGGER trg_wallet_transactions_immutable
BEFORE UPDATE OR DELETE ON wallet_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 17: COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE audit_logs IS 'IMMUTABLE: Nhật ký hành động - Không được UPDATE/DELETE';
COMMENT ON TABLE wallet_transactions IS 'IMMUTABLE: Lịch sử giao dịch ví - Không được UPDATE/DELETE';
COMMENT ON FUNCTION normalize_phone(TEXT) IS 'Normalize phone to 0xxxxxxxxx format (10-11 digits)';
COMMENT ON FUNCTION prevent_modification() IS 'Security trigger to prevent modification of immutable tables';

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════
