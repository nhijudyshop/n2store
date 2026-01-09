KẾ HOẠCH TRIỂN KHAI KỸ THUẬT TOÀN DIỆN
Unified Customer 360 & Financial Hub
PHẦN 1: CRITIQUE & GAP ANALYSIS
1.1 Xung đột Logic Hiện Tại
A. Xung đột về Data Ownership (Ai sở hữu dữ liệu?)
Vấn đề	Balance History	Issue Tracking	Customer 360 Plan
Customer Data	balance_customer_info (PostgreSQL)	Firebase issue_tracking/tickets	customers table (PostgreSQL)
Wallet Data	Không có concept "Wallet" - chỉ có giao dịch bank	Firebase customer_wallets	PostgreSQL customer_wallets
Transaction Log	balance_history table	Firebase wallet_transactions	PostgreSQL wallet_transactions
Vấn đề cốt lõi: 3 nguồn dữ liệu khác nhau cho cùng 1 khách hàng → Data Fragmentation.

B. Xung đột về Phone Normalization

Balance History:  unique_code VARCHAR(50) - Có thể là "N2ABC123" hoặc "PHONE0901234567"
Issue Tracking:   phone VARCHAR(20) - Không có constraint format
Customer 360:     phone VARCHAR(20) CHECK (phone ~ '^0[0-9]{9,10}$')
Vấn đề: Không có single source of truth cho định danh khách hàng. Một khách có thể xuất hiện với:

0901234567
+84901234567
84901234567
901234567
C. Xung đột về Wallet Logic
Nguồn tiền	Balance History Flow	Issue Tracking Flow
Bank Transfer	balance_history.transfer_type='in' → Extract phone → ???	Không có
Hoàn hàng (BOOM)	Không xử lý	Ticket → Wallet.balance += amount
Công nợ ảo (RETURN_SHIPPER)	Không có concept	Ticket → Wallet.virtualBalance += amount
Vấn đề: Balance History ghi nhận tiền vào nhưng không tự động cộng vào Wallet. Phải làm thủ công.

D. Xung đột về Trạng thái Ticket

Issue Tracking MASTER_DOCUMENTATION.md (dòng 1500-1516):
  type TicketStatus = 'PENDING_GOODS' | 'PENDING_FINANCE' | 'COMPLETED';

Customer 360 Plan (dòng 380-386):
  status VARCHAR(30) DEFAULT 'PENDING';
  -- PENDING, IN_PROGRESS, PENDING_GOODS, PENDING_FINANCE, COMPLETED, CANCELLED
Vấn đề: Thêm PENDING, IN_PROGRESS, CANCELLED nhưng không định nghĩa flow transition.

1.2 Rủi Ro Tài Chính
A. Race Condition khi Trừ Tiền
Hiện trạng (Issue Tracking - dòng 776-815):


// ❌ SAI - Read rồi Write riêng lẻ (có thể gây sai số dư)
async function depositWrong(phone, amount) {
  const wallet = await getWallet(phone);
  wallet.balance += amount;  // Race condition!
  await walletRef.update(wallet);
}
Kịch bản lỗi:

User A đọc balance = 100,000
User B đọc balance = 100,000
User A ghi balance = 100,000 + 50,000 = 150,000
User B ghi balance = 100,000 + 30,000 = 130,000 ← Mất 50,000!
B. Không có Audit Log cho Wallet Operations
Hiện trạng: wallet_transactions ghi lại giao dịch, nhưng không ghi ai thực hiện từ IP nào.

Rủi ro: Nhân viên có thể:

Tự cộng tiền cho người nhà
Xóa giao dịch rồi nói "hệ thống lỗi"
Sửa số dư trực tiếp trong Firebase Console
C. Không có Validation cho Negative Balance
Hiện trạng (Customer 360 Plan - dòng 237-239):


CONSTRAINT chk_balance_positive CHECK (balance >= 0),
CONSTRAINT chk_virtual_balance_positive CHECK (virtual_balance >= 0)
Vấn đề: Constraint ở Database level là tốt, nhưng cần thêm:

Application-level validation trước khi submit
Atomic transaction để tránh partial update
D. Công Nợ Ảo Hết Hạn Không Có Cron Job Thực Sự
Hiện trạng (Issue Tracking - dòng 1806-1831):


const CronJobs = {
  INTERVAL: 60 * 60 * 1000, // 1 giờ - CHỈ CHẠY KHI CÓ USER ONLINE!
  // ...
}
Vấn đề: Client-side polling = Nếu không ai mở trang, công nợ ảo sẽ không bao giờ bị expire.

E. Không Có Rate Limiting cho API Webhook
Hiện trạng (Balance History - dòng 349-373):
Webhook từ SePay được xử lý trực tiếp, không có:

IP whitelist
Request signature verification
Rate limiting
Rủi ro: Attacker có thể spam webhook để tạo giao dịch giả.

1.3 Frontend-Backend Communication (CORS Strategy)

**Critical Architectural Decision: All Client-side API Calls MUST go through Cloudflare Worker Proxy.**

To mitigate Cross-Origin Resource Sharing (CORS) issues when the Frontend is hosted on GitHub Pages and the Backend services (Render, TPOS, Pancake) are on different origins, all API requests from the client-side must be routed through a Cloudflare Worker Proxy.

**Proxy URL Base:** `https://chatomni-proxy.nhijudyshop.workers.dev`

**Route Mapping (managed by `cloudflare-worker/worker.js`):**
- `/api/sepay/*` → Render Backend `/api/sepay/*`
- `/api/customers/*` → Render Backend `/api/customers/*`
- `/api/wallets/*` → Render Backend `/api/wallets/*`
- `/api/tickets/*` → Render Backend `/api/tickets/*`
- `/api/bank-transactions/*` → Render Backend `/api/bank-transactions/*`
- `/api/deepseek/*` → Render Backend `/api/deepseek/*` (or directly to DeepSeek API)
- `/api/gemini/*` → Render Backend `/api/gemini/*`
- `/api/odata/*` → TPOS OData API `tomato.tpos.vn/odata/*`
- `/api/token` → TPOS Token API `tomato.tpos.vn/token` (with caching)
- `/api/pancake/*` → Pancake API `pancake.vn/api/v1/*`
- `/api/pancake-direct/*` → Pancake API (24h bypass)
- `/api/facebook-send` → Facebook Graph API

**ACTION REQUIRED:** All client-side code MUST use the Cloudflare Worker Proxy URL as the base for API calls. Direct calls to `https://n2store-fallback.onrender.com` or `https://tomato.tpos.vn` from the frontend are PROHIBITED and will result in CORS errors. Any existing direct calls must be updated to use the proxy.

PHẦN 2: NEW DATABASE ARCHITECTURE
2.1 Database Design Principles
Single Source of Truth: Mọi dữ liệu nằm ở PostgreSQL
Phone-First Identity: SĐT là unique key, enforce format
Immutable Transactions: Không bao giờ UPDATE/DELETE transaction, chỉ INSERT
Audit Everything: Mọi thay đổi quan trọng đều có log
2.2 Complete DDL Schema

-- ═══════════════════════════════════════════════════════════════════════════════
-- UNIFIED CUSTOMER 360 & FINANCIAL HUB
-- Database Schema v1.0
-- PostgreSQL 15+ Required
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 0: EXTENSIONS & TYPES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phone normalization function
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
    "wallet": ["deposit", "withdraw", "adjust", "view_audit"],
    "ticket": ["create", "read", "update", "delete", "complete", "cancel"],
    "report": ["view", "export"],
    "system": ["config", "user_management"]
}'),
('ACCOUNTANT', 'Kế toán - Quản lý tài chính', '{
    "customer": ["read", "update"],
    "wallet": ["deposit", "withdraw", "adjust", "view_audit"],
    "ticket": ["read", "update", "complete"],
    "report": ["view", "export"],
    "system": []
}'),
('WAREHOUSE', 'Kho - Nhận hàng hoàn', '{
    "customer": ["read"],
    "wallet": ["read"],
    "ticket": ["read", "receive_goods"],
    "report": ["view"],
    "system": []
}'),
('CSKH', 'Chăm sóc khách hàng - Tạo sự vụ', '{
    "customer": ["create", "read", "update"],
    "wallet": ["read"],
    "ticket": ["create", "read", "update"],
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
    tpos_partner_ids JSONB DEFAULT '[]',  -- Array of TPOS Partner IDs (có thể trùng SĐT)
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
PHẦN 3: UNIFIED BUSINESS LOGIC & FLOW
3.1 Unified Wallet Transaction Algorithm
A. Deposit Flow (Nạp tiền)

┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPOSIT FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT: phone, amount, source_type, source_id, performed_by                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 1. VALIDATE                                                              │ │
│  │    ├─ Phone normalized?                                                  │ │
│  │    ├─ Amount > 0 AND Amount <= max_transaction_amount?                   │ │
│  │    ├─ User has 'wallet.deposit' permission?                              │ │
│  │    └─ Wallet not frozen?                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 2. BEGIN TRANSACTION (Serializable Isolation)                            │ │
│  │                                                                          │ │
│  │    SELECT * FROM wallets WHERE phone = $1 FOR UPDATE;                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 3. UPDATE WALLET                                                         │ │
│  │                                                                          │ │
│  │    new_real_balance = real_balance + amount                              │ │
│  │    total_deposited += amount                                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 4. CREATE TRANSACTION LOG                                                │ │
│  │                                                                          │ │
│  │    INSERT INTO wallet_transactions (                                     │ │
│  │        wallet_id, phone, transaction_type,                               │ │
│  │        amount,                                                           │ │
│  │        real_balance_before, real_balance_after,                          │ │
│  │        virtual_balance_before, virtual_balance_after,                    │ │
│  │        source_type, source_id, created_by                                │ │
│  │    )                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 5. CREATE ACTIVITY LOG                                                   │ │
│  │                                                                          │ │
│  │    INSERT INTO customer_activities (...)                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 6. CREATE AUDIT LOG                                                      │ │
│  │                                                                          │ │
│  │    INSERT INTO audit_logs (                                              │ │
│  │        action = 'WALLET_DEPOSIT',                                        │ │
│  │        entity_type = 'wallet',                                           │ │
│  │        old_value = {real_balance: before},                               │ │
│  │        new_value = {real_balance: after},                                │ │
│  │        performed_by, ip_address                                          │ │
│  │    )                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 7. FRAUD CHECK                                                           │ │
│  │                                                                          │ │
│  │    IF amount > fraud_alert_threshold THEN                                │ │
│  │        is_suspicious = TRUE                                              │ │
│  │        fraud_score = calculate_fraud_score(...)                          │ │
│  │        NOTIFY admin                                                      │ │
│  │    END IF                                                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│                         COMMIT                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
B. Withdraw Flow (Trừ tiền - FIFO Virtual Credits)

┌─────────────────────────────────────────────────────────────────────────────┐
│                    WITHDRAW FLOW (FIFO Virtual Credits)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT: phone, amount, order_id, performed_by                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 1. VALIDATE                                                              │ │
│  │    ├─ total_balance (real + virtual) >= amount?                          │ │
│  │    ├─ Wallet not frozen?                                                 │ │
│  │    └─ User has 'wallet.withdraw' permission?                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 2. BEGIN TRANSACTION                                                     │ │
│  │                                                                          │ │
│  │    -- Lock wallet                                                        │ │
│  │    SELECT * FROM wallets WHERE phone = $1 FOR UPDATE;                    │ │
│  │                                                                          │ │
│  │    -- Lock active virtual credits (FIFO by expires_at)                   │ │
│  │    SELECT * FROM virtual_credits                                         │ │
│  │    WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()         │ │
│  │    ORDER BY expires_at ASC                                               │ │
│  │    FOR UPDATE;                                                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 3. CALCULATE DEDUCTION (FIFO Algorithm)                                  │ │
│  │                                                                          │ │
│  │    remaining = amount                                                    │ │
│  │    virtual_used = 0                                                      │ │
│  │    real_used = 0                                                         │ │
│  │    used_credits = []                                                     │ │
│  │                                                                          │ │
│  │    FOR EACH credit IN active_virtual_credits:                            │ │
│  │        IF remaining <= 0: BREAK                                          │ │
│  │                                                                          │ │
│  │        use_from_credit = MIN(credit.remaining_amount, remaining)         │ │
│  │        credit.remaining_amount -= use_from_credit                        │ │
│  │        remaining -= use_from_credit                                      │ │
│  │        virtual_used += use_from_credit                                   │ │
│  │                                                                          │ │
│  │        IF credit.remaining_amount <= 0:                                  │ │
│  │            credit.status = 'USED'                                        │ │
│  │                                                                          │ │
│  │        used_credits.append({credit_id, use_from_credit})                 │ │
│  │    END FOR                                                               │ │
│  │                                                                          │ │
│  │    IF remaining > 0:                                                     │ │
│  │        real_used = remaining                                             │ │
│  │        remaining = 0                                                     │ │
│  │    END IF                                                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 4. UPDATE WALLET                                                         │ │
│  │                                                                          │ │
│  │    real_balance -= real_used                                             │ │
│  │    virtual_balance -= virtual_used                                       │ │
│  │    total_withdrawn += real_used                                          │ │
│  │    total_virtual_used += virtual_used                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 5. CREATE TRANSACTION LOGS                                               │ │
│  │                                                                          │ │
│  │    IF virtual_used > 0:                                                  │ │
│  │        INSERT wallet_transaction (VIRTUAL_CREDIT_USE, virtual_used)      │ │
│  │                                                                          │ │
│  │    IF real_used > 0:                                                     │ │
│  │        INSERT wallet_transaction (WITHDRAW_ORDER, real_used)             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 6. UPDATE VIRTUAL CREDITS                                                │ │
│  │                                                                          │ │
│  │    FOR EACH {credit_id, amount} IN used_credits:                         │ │
│  │        UPDATE virtual_credits SET                                        │ │
│  │            remaining_amount = remaining_amount,                          │ │
│  │            status = status,                                              │ │
│  │            usage_history = usage_history || {order_id, amount, now()}    │ │
│  │        WHERE id = credit_id                                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│                         COMMIT                                               │
│                                                                              │
│  OUTPUT: {                                                                   │
│      virtual_used,                                                           │
│      real_used,                                                              │
│      total_used: virtual_used + real_used,                                   │
│      used_credits: [{credit_id, amount}],                                    │
│      new_real_balance,                                                       │
│      new_virtual_balance                                                     │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
C. Return Goods Flow (Hoàn hàng - Logic quyết định Real vs Virtual)

┌─────────────────────────────────────────────────────────────────────────────┐
│                     RETURN GOODS → WALLET CREDIT DECISION                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT: ticket_type, refund_amount, phone, ticket_id                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     DECISION MATRIX                                      │ │
│  │                                                                          │ │
│  │  ticket_type          │  wallet_action      │  Lý do                     │ │
│  │  ─────────────────────┼─────────────────────┼──────────────────────────  │ │
│  │  BOOM                 │  CREDIT_REAL        │  Khách boom = tiền về shop │ │
│  │  FIX_COD              │  NONE               │  Đối soát ĐVVC, không ví   │ │
│  │  RETURN_CLIENT        │  CREDIT_REAL        │  KH gửi hàng về = hoàn ví  │ │
│  │  RETURN_SHIPPER       │  CREDIT_VIRTUAL     │  Đổi hàng = công nợ ảo     │ │
│  │  COMPLAINT            │  DEPENDS            │  Tùy case                  │ │
│  │  WARRANTY             │  NONE               │  Bảo hành không liên quan  │ │
│  │  OTHER                │  NONE               │  Tùy case                  │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  IF wallet_action = 'CREDIT_REAL':                                       │ │
│  │                                                                          │ │
│  │      CALL deposit(                                                       │ │
│  │          phone = phone,                                                  │ │
│  │          amount = refund_amount,                                         │ │
│  │          source_type = 'ticket',                                         │ │
│  │          source_id = ticket_id,                                          │ │
│  │          transaction_type = 'DEPOSIT_RETURN'                             │ │
│  │      )                                                                   │ │
│  │                                                                          │ │
│  │      UPDATE tickets SET                                                  │ │
│  │          wallet_credited = TRUE,                                         │ │
│  │          wallet_transaction_id = <new_tx_id>                             │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  IF wallet_action = 'CREDIT_VIRTUAL':                                    │ │
│  │                                                                          │ │
│  │      -- Get expiry days from config                                      │ │
│  │      expiry_days = SELECT value FROM system_config                       │ │
│  │                    WHERE key = 'virtual_credit_expiry_days'              │ │
│  │                                                                          │ │
│  │      -- Create virtual credit                                            │ │
│  │      INSERT INTO virtual_credits (                                       │ │
│  │          wallet_id, phone,                                               │ │
│  │          original_amount = refund_amount,                                │ │
│  │          remaining_amount = refund_amount,                               │ │
│  │          expires_at = NOW() + (expiry_days || ' days')::INTERVAL,        │ │
│  │          source_type = 'RETURN_SHIPPER',                                 │ │
│  │          source_ticket_id = ticket_id                                    │ │
│  │      ) RETURNING id                                                      │ │
│  │                                                                          │ │
│  │      -- Update wallet virtual_balance                                    │ │
│  │      UPDATE wallets SET                                                  │ │
│  │          virtual_balance = virtual_balance + refund_amount,              │ │
│  │          total_virtual_issued = total_virtual_issued + refund_amount     │ │
│  │                                                                          │ │
│  │      -- Log transaction                                                  │ │
│  │      INSERT INTO wallet_transactions (                                   │ │
│  │          transaction_type = 'VIRTUAL_CREDIT_ISSUE',                      │ │
│  │          virtual_credit_id = <new_vc_id>                                 │ │
│  │      )                                                                   │ │
│  │                                                                          │ │
│  │      UPDATE tickets SET                                                  │ │
│  │          wallet_credited = TRUE,                                         │ │
│  │          virtual_credit_id = <new_vc_id>                                 │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
3.2 Cron Jobs Design

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCHEDULED JOBS DESIGN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  JOB 1: EXPIRE_VIRTUAL_CREDITS                                         ║  │
│  ║  Schedule: Every hour (0 * * * *)                                      ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  1. SELECT all virtual_credits WHERE                                   ║  │
│  ║        status = 'ACTIVE' AND expires_at <= NOW()                       ║  │
│  ║                                                                        ║  │
│  ║  2. FOR EACH expired_credit:                                           ║  │
│  ║        BEGIN TRANSACTION                                               ║  │
│  ║                                                                        ║  │
│  ║        -- Lock wallet                                                  ║  │
│  ║        SELECT * FROM wallets WHERE id = credit.wallet_id FOR UPDATE    ║  │
│  ║                                                                        ║  │
│  ║        -- Update credit status                                         ║  │
│  ║        UPDATE virtual_credits SET status = 'EXPIRED'                   ║  │
│  ║                                                                        ║  │
│  ║        -- Reduce wallet virtual_balance                                ║  │
│  ║        UPDATE wallets SET                                              ║  │
│  ║            virtual_balance = virtual_balance - credit.remaining_amount ║  │
│  ║            total_virtual_expired += credit.remaining_amount            ║  │
│  ║                                                                        ║  │
│  ║        -- Log transaction                                              ║  │
│  ║        INSERT wallet_transactions (VIRTUAL_CREDIT_EXPIRE)              ║  │
│  ║                                                                        ║  │
│  ║        -- Create activity                                              ║  │
│  ║        INSERT customer_activities (WALLET_VIRTUAL_EXPIRE)              ║  │
│  ║                                                                        ║  │
│  ║        -- Update related ticket (if any)                               ║  │
│  ║        UPDATE tickets SET status = 'COMPLETED'                         ║  │
│  ║        WHERE virtual_credit_id = credit.id                             ║  │
│  ║                                                                        ║  │
│  ║        COMMIT                                                          ║  │
│  ║                                                                        ║  │
│  ║  3. Log job result to scheduled_jobs table                             ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  JOB 2: CHECK_CARRIER_DEADLINE                                         ║  │
│  ║  Schedule: Daily at 8 AM (0 8 * * *)                                   ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  1. SELECT tickets WHERE                                               ║  │
│  ║        status = 'PENDING_GOODS' AND                                    ║  │
│  ║        carrier_deadline < NOW() AND                                    ║  │
│  ║        carrier_issue_flag = FALSE                                      ║  │
│  ║                                                                        ║  │
│  ║  2. FOR EACH overdue_ticket:                                           ║  │
│  ║        UPDATE tickets SET carrier_issue_flag = TRUE                    ║  │
│  ║        INSERT customer_activities (TICKET_CARRIER_OVERDUE)             ║  │
│  ║        NOTIFY_WEBHOOK('carrier_overdue', ticket_details)               ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  JOB 3: CALCULATE_RFM_SCORES                                           ║  │
│  ║  Schedule: Weekly on Sunday 2 AM (0 2 * * 0)                           ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  1. Get thresholds from system_config                                  ║  │
│  ║                                                                        ║  │
│  ║  2. UPDATE customers SET                                               ║  │
│  ║        rfm_recency = CASE                                              ║  │
│  ║            WHEN days_since_last_order <= 7 THEN 5                      ║  │
│  ║            WHEN days_since_last_order <= 30 THEN 4                     ║  │
│  ║            WHEN days_since_last_order <= 90 THEN 3                     ║  │
│  ║            WHEN days_since_last_order <= 180 THEN 2                    ║  │
│  ║            ELSE 1                                                      ║  │
│  ║        END,                                                            ║  │
│  ║        rfm_frequency = CASE                                            ║  │
│  ║            WHEN successful_orders >= 10 THEN 5                         ║  │
│  ║            WHEN successful_orders >= 5 THEN 4                          ║  │
│  ║            ...                                                         ║  │
│  ║        END,                                                            ║  │
│  ║        rfm_monetary = CASE ... END,                                    ║  │
│  ║        rfm_segment = CASE                                              ║  │
│  ║            WHEN rfm_r >= 4 AND rfm_f >= 4 AND rfm_m >= 4               ║  │
│  ║                THEN 'Champions'                                        ║  │
│  ║            WHEN rfm_r >= 3 AND rfm_f >= 3 THEN 'Loyal'                 ║  │
│  ║            WHEN rfm_r <= 2 AND rfm_f >= 3 THEN 'At Risk'               ║  │
│  ║            ...                                                         ║  │
│  ║        END,                                                            ║  │
│  ║        rfm_calculated_at = NOW()                                       ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  JOB 4: FRAUD_DETECTION_SCAN                                           ║  │
│  ║  Schedule: Every 6 hours (0 */6 * * *)                                 ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  1. Detect unusual patterns:                                           ║  │
│  ║     - Same user depositing to multiple unrelated customers             ║  │
│  ║     - Large deposits followed by immediate withdrawals                 ║  │
│  ║     - Deposits outside business hours                                  ║  │
│  ║     - Multiple adjustments to same wallet in short time                ║  │
│  ║                                                                        ║  │
│  ║  2. Flag suspicious audit logs                                         ║  │
│  ║                                                                        ║  │
│  ║  3. Send alert to Admin if fraud_score > threshold                     ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
PHẦN 4: SECURITY & ACCESS CONTROL
4.1 RBAC Matrix

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              RBAC PERMISSION MATRIX                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌───────────────────┬─────────┬────────────┬───────────┬──────────┬────────────────────┐  │
│  │ Action            │ ADMIN   │ ACCOUNTANT │ WAREHOUSE │ CSKH     │ Notes              │  │
│  ├───────────────────┼─────────┼────────────┼───────────┼──────────┼────────────────────┤  │
│  │                                                                                       │  │
│  │ ══════════════════ CUSTOMER ══════════════════                                        │  │
│  │ customer.create   │ ✅      │ ❌         │ ❌        │ ✅       │ CSKH tạo KH mới    │  │
│  │ customer.read     │ ✅      │ ✅         │ ✅        │ ✅       │ Tất cả xem được    │  │
│  │ customer.update   │ ✅      │ ✅         │ ❌        │ ✅       │ Kho không sửa KH   │  │
│  │ customer.delete   │ ✅      │ ❌         │ ❌        │ ❌       │ Chỉ Admin          │  │
│  │ customer.block    │ ✅      │ ✅         │ ❌        │ ❌       │ Block KH xấu       │  │
│  │                                                                                       │  │
│  │ ══════════════════ WALLET ══════════════════                                          │  │
│  │ wallet.read       │ ✅      │ ✅         │ ✅        │ ✅       │ Xem số dư          │  │
│  │ wallet.deposit    │ ✅      │ ✅         │ ❌        │ ❌       │ Nạp tiền           │  │
│  │ wallet.withdraw   │ ✅      │ ✅         │ ❌        │ ❌       │ Rút tiền           │  │
│  │ wallet.adjust     │ ✅      │ ✅         │ ❌        │ ❌       │ Điều chỉnh thủ công│  │
│  │ wallet.freeze     │ ✅      │ ❌         │ ❌        │ ❌       │ Đóng băng ví       │  │
│  │ wallet.audit      │ ✅      │ ✅         │ ❌        │ ❌       │ Xem audit log      │  │
│  │                                                                                       │  │
│  │ ══════════════════ TICKET ══════════════════                                          │  │
│  │ ticket.create     │ ✅      │ ❌         │ ❌        │ ✅       │ Tạo sự vụ          │  │
│  │ ticket.read       │ ✅      │ ✅         │ ✅        │ ✅       │ Xem sự vụ          │  │
│  │ ticket.update     │ ✅      │ ✅         │ ❌        │ ✅       │ Cập nhật thông tin │  │
│  │ ticket.receive    │ ✅      │ ❌         │ ✅        │ ❌       │ Xác nhận nhận hàng │  │
│  │ ticket.settle     │ ✅      │ ✅         │ ❌        │ ❌       │ Đối soát tài chính │  │
│  │ ticket.complete   │ ✅      │ ✅         │ ❌        │ ❌       │ Hoàn tất sự vụ     │  │
│  │ ticket.cancel     │ ✅      │ ❌         │ ❌        │ ❌       │ Hủy sự vụ          │  │
│  │                                                                                       │  │
│  │ ══════════════════ BANK TRANSACTION ══════════════════                                │  │
│  │ bank_tx.read      │ ✅      │ ✅         │ ❌        │ ✅       │ Xem giao dịch bank │  │
│  │ bank_tx.match     │ ✅      │ ✅         │ ❌        │ ✅       │ Ghép khách hàng    │  │
│  │ bank_tx.process   │ ✅      │ ✅         │ ❌        │ ❌       │ Xử lý vào ví       │  │
│  │ bank_tx.hide      │ ✅      │ ❌         │ ❌        │ ❌       │ Ẩn giao dịch       │  │
│  │                                                                                       │  │
│  │ ══════════════════ REPORT ══════════════════                                          │  │
│  │ report.view       │ ✅      │ ✅         │ ✅        │ ✅       │ Xem báo cáo        │  │
│  │ report.export     │ ✅      │ ✅         │ ❌        │ ❌       │ Xuất Excel/PDF     │  │
│  │                                                                                       │  │
│  │ ══════════════════ SYSTEM ══════════════════                                          │  │
│  │ system.config     │ ✅      │ ❌         │ ❌        │ ❌       │ Cấu hình hệ thống  │  │
│  │ system.users      │ ✅      │ ❌         │ ❌        │ ❌       │ Quản lý user       │  │
│  │ system.audit      │ ✅      │ ✅         │ ❌        │ ❌       │ Xem toàn bộ audit  │  │
│  │                                                                                       │  │
│  └───────────────────┴─────────┴────────────┴───────────┴──────────┴────────────────────┘  │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
4.2 Fraud Detection Mechanisms

┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRAUD DETECTION SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  DETECTION RULE 1: Self-Dealing Detection                              ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  Pattern: Nhân viên tự cộng tiền cho người nhà                         ║  │
│  ║                                                                        ║  │
│  ║  Detection Logic:                                                      ║  │
│  ║  1. Track relationship between user và customer:                       ║  │
│  ║     - Same name similarity > 80%                                       ║  │
│  ║     - Same address                                                     ║  │
│  ║     - User's registered phone matches customer phone                   ║  │
│  ║                                                                        ║  │
│  ║  2. Alert when:                                                        ║  │
│  ║     - User deposits to "related" customer                              ║  │
│  ║     - User adjusts wallet of "related" customer                        ║  │
│  ║     - Pattern: User A always deposits to same few customers            ║  │
│  ║                                                                        ║  │
│  ║  Implementation:                                                       ║  │
│  ║  ```sql                                                                ║  │
│  ║  -- Flag suspicious deposits                                           ║  │
│  ║  SELECT wt.*, u.full_name as operator, c.name as customer              ║  │
│  ║  FROM wallet_transactions wt                                           ║  │
│  ║  JOIN users u ON wt.created_by = u.id                                  ║  │
│  ║  JOIN customers c ON wt.phone = c.phone                                ║  │
│  ║  WHERE wt.transaction_type IN ('DEPOSIT_ADJUSTMENT', 'DEPOSIT_BANK')   ║  │
│  ║    AND (                                                               ║  │
│  ║      similarity(u.full_name, c.name) > 0.8                             ║  │
│  ║      OR u.email LIKE '%' || c.phone || '%'                             ║  │
│  ║    )                                                                   ║  │
│  ║  ```                                                                   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  DETECTION RULE 2: Anomaly Detection                                   ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  Pattern: Giao dịch bất thường                                         ║  │
│  ║                                                                        ║  │
│  ║  Flags:                                                                ║  │
│  ║  1. Amount anomaly:                                                    ║  │
│  ║     - Single transaction > 5 triệu (configurable)                      ║  │
│  ║     - Total daily transactions by same user > 20 triệu                 ║  │
│  ║                                                                        ║  │
│  ║  2. Time anomaly:                                                      ║  │
│  ║     - Transactions outside 7 AM - 10 PM                                ║  │
│  ║     - Multiple transactions in < 5 seconds (automation)                ║  │
│  ║                                                                        ║  │
│  ║  3. Pattern anomaly:                                                   ║  │
│  ║     - Deposit immediately followed by withdrawal (wash trading)        ║  │
│  ║     - Round numbers (exactly 1,000,000, 5,000,000)                     ║  │
│  ║                                                                        ║  │
│  ║  Implementation:                                                       ║  │
│  ║  ```javascript                                                         ║  │
│  ║  function calculateFraudScore(transaction, context) {                  ║  │
│  ║      let score = 0;                                                    ║  │
│  ║                                                                        ║  │
│  ║      // Amount check                                                   ║  │
│  ║      if (transaction.amount > config.fraud_alert_threshold) {          ║  │
│  ║          score += 30;                                                  ║  │
│  ║      }                                                                 ║  │
│  ║                                                                        ║  │
│  ║      // Time check                                                     ║  │
│  ║      const hour = new Date(transaction.created_at).getHours();         ║  │
│  ║      if (hour < 7 || hour > 22) {                                      ║  │
│  ║          score += 20;                                                  ║  │
│  ║      }                                                                 ║  │
│  ║                                                                        ║  │
│  ║      // Relationship check                                             ║  │
│  ║      if (context.isRelatedToOperator) {                                ║  │
│  ║          score += 40;                                                  ║  │
│  ║      }                                                                 ║  │
│  ║                                                                        ║  │
│  ║      // Recent activity check                                          ║  │
│  ║      if (context.recentAdjustmentCount > 3) {                          ║  │
│  ║          score += 25;                                                  ║  │
│  ║      }                                                                 ║  │
│  ║                                                                        ║  │
│  ║      return Math.min(score, 100);                                      ║  │
│  ║  }                                                                     ║  │
│  ║  ```                                                                   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  DETECTION RULE 3: Two-Person Rule for High-Value Transactions         ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                        ║  │
│  ║  Requirement:                                                          ║  │
│  ║  - Any ADJUSTMENT > 2 triệu requires approval from different user      ║  │
│  ║  - Any WITHDRAWAL > 10 triệu requires Admin approval                   ║  │
│  ║                                                                        ║  │
│  ║  Flow:                                                                 ║  │
│  ║  1. User A initiates adjustment                                        ║  │
│  ║  2. System creates pending_approval record                             ║  │
│  ║  3. User B (different role or higher) approves                         ║  │
│  ║  4. Transaction executes                                               ║  │
│  ║                                                                        ║  │
│  ║  Database:                                                             ║  │
│  ║  ```sql                                                                ║  │
│  ║  CREATE TABLE pending_approvals (                                      ║  │
│  ║      id SERIAL PRIMARY KEY,                                            ║  │
│  ║      action_type VARCHAR(50),                                          ║  │
│  ║      action_payload JSONB,                                             ║  │
│  ║      requested_by INTEGER REFERENCES users(id),                        ║  │
│  ║      approved_by INTEGER REFERENCES users(id),                         ║  │
│  ║      status VARCHAR(20) DEFAULT 'PENDING',                             ║  │
│  ║      created_at TIMESTAMP DEFAULT NOW(),                               ║  │
│  ║      resolved_at TIMESTAMP,                                            ║  │
│  ║      CONSTRAINT chk_diff_approver CHECK (requested_by != approved_by)  ║  │
│  ║  );                                                                    ║  │
│  ║  ```                                                                   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
PHẦN 5: UI/UX DESIGN
5.1 Customer 360 Dashboard Layout

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  ◀ Quay lại                   CUSTOMER 360° VIEW                            🔔 3  👤 Admin  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════════════════════╗  │
│  ║  CUSTOMER HEADER (Collapsible)                                                         ║  │
│  ║  ┌────────────────────────────────────────────────────────────────────────────────────┐║  │
│  ║  │  ┌──────┐                                                                          │║  │
│  ║  │  │  👤  │   Nguyễn Văn A                                            🔴 DANGER      │║  │
│  ║  │  │      │   📱 0901234567  •  ✉️ nguyenvana@email.com                              │║  │
│  ║  │  │Avatar│   📍 123 Nguyễn Trãi, Quận 1, TP.HCM                                     │║  │
│  ║  │  └──────┘                                                                          │║  │
│  ║  │           Khách từ: 15/01/2025  •  Đơn gần nhất: 3 ngày trước  •  15 đơn  (🔴 20%) │║  │
│  ║  │                                                                                    │║  │
│  ║  │  Tags: [Hay đổi size] [Boom 2 lần] [VIP cũ]                     [+ Thêm tag]      │║  │
│  ║  └────────────────────────────────────────────────────────────────────────────────────┘║  │
│  ╚═══════════════════════════════════════════════════════════════════════════════════════╝  │
│                                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════════════════════╗  │
│  ║  QUICK STATS (4 Cards)                                                                 ║  │
│  ║  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌─────────────────┐║  │
│  ║  │   💰 VÍ TIỀN      │ │   📋 SỰ VỤ       │ │   🛒 ĐƠN HÀNG    │ │  📈 CHI TIÊU    │║  │
│  ║  │                   │ │                   │ │                   │ │                 │║  │
│  ║  │  ┌─────────────┐  │ │      3 tổng      │ │    15 đơn        │ │  5,200,000đ     │║  │
│  ║  │  │  700,000đ   │  │ │  ┌─────────────┐ │ │  ┌─────────────┐ │ │  ┌───────────┐  │║  │
│  ║  │  │  ══════════ │  │ │  │  1 🟡 chờ   │ │ │  │  12 ✅ OK   │ │ │  │Avg: 347k  │  │║  │
│  ║  │  │ Thực:  500k │  │ │  │  2 ✅ xong  │ │ │  │  3 🔴 hoàn  │ │ │  │Lần gần:   │  │║  │
│  ║  │  │ Ảo:   200k │  │ │  └─────────────┘ │ │  └─────────────┘ │ │  │350k       │  │║  │
│  ║  │  │ (12 ngày nữa)│ │ │                   │ │  Tỷ lệ hoàn: 20% │ │  └───────────┘  │║  │
│  ║  │  └─────────────┘  │ │                   │ │  🔴 CAO!         │ │                 │║  │
│  ║  │  [Xem/Nạp/Rút]    │ │  [Xem chi tiết]   │ │  [Xem trên TPOS] │ │                 │║  │
│  ║  └───────────────────┘ └───────────────────┘ └───────────────────┘ └─────────────────┘║  │
│  ╚═══════════════════════════════════════════════════════════════════════════════════════╝  │
│                                                                                              │
│  ┌────────────────────────────────────────┐  ┌────────────────────────────────────────────┐ │
│  │  📝 GHI CHÚ & CẢNH BÁO                 │  │  📊 TIMELINE HOẠT ĐỘNG (Unified)          │ │
│  │  ─────────────────────────────────────│  │  ──────────────────────────────────────── │ │
│  │                                        │  │                                           │ │
│  │  ⚠️ CẢNH BÁO TỰ ĐỘNG:                 │  │  Filter: [Tất cả ▼] [7 ngày ▼]           │ │
│  │  ┌────────────────────────────────┐   │  │                                           │ │
│  │  │ 🔴 Tỷ lệ hoàn hàng 20% (>10%)  │   │  │  ───────────────────────────────────────  │ │
│  │  │ 🟡 Công nợ ảo còn 12 ngày      │   │  │  ● 05/01 10:30                            │ │
│  │  │ 🟡 Có 1 sự vụ đang chờ         │   │  │    💰 Chuyển khoản 500,000đ vào ví        │ │
│  │  └────────────────────────────────┘   │  │    └─ N2ABC123 - ACB - VCB.3278907687    │ │
│  │                                        │  │                                           │ │
│  │  📌 GHI CHÚ GHIM:                     │  │  ● 04/01 15:20                            │ │
│  │  ┌────────────────────────────────┐   │  │    📋 Sự vụ TV-2026-00003 hoàn tất        │ │
│  │  │ Khách VIP cũ, ưu tiên xử lý    │   │  │    └─ BOOM - Hoàn 300,000đ vào ví        │ │
│  │  │ đổi trả. Đã boom 2 lần nên cần │   │  │                                           │ │
│  │  │ xác nhận COD kỹ trước ship.    │   │  │  ● 03/01 09:15                            │ │
│  │  │                 - admin 05/01  │   │  │    🛒 Đơn NJD/2026/45678 giao thành công  │ │
│  │  └────────────────────────────────┘   │  │    └─ COD: 350,000đ - 2 sản phẩm          │ │
│  │                                        │  │                                           │ │
│  │  ───────────────────────────────────  │  │  ● 02/01 11:45                            │ │
│  │  + Thêm ghi chú mới...               │  │    💬 CSKH gọi điện - Hỏi về đơn hàng     │ │
│  │                                        │  │                                           │ │
│  │  Lịch sử ghi chú:                     │  │  ● 01/01 14:00                            │ │
│  │  05/01 - admin: Đã xử lý đổi size     │  │    📋 Tạo sự vụ TV-2026-00002             │ │
│  │  03/01 - cskh01: KH gọi hỏi tracking  │  │    └─ RETURN_SHIPPER - Cấp công nợ ảo    │ │
│  │                                        │  │        200,000đ (hết hạn 16/01)          │ │
│  │                                        │  │                                           │ │
│  └────────────────────────────────────────┘  │  [Xem thêm...]                            │ │
│                                              └────────────────────────────────────────────┘ │
│                                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════════════════════╗  │
│  ║  🎯 HÀNH ĐỘNG NHANH (Quick Actions)                                                    ║  │
│  ║                                                                                        ║  │
│  ║  [📋 Tạo sự vụ mới]  [💰 Nạp tiền ví]  [📤 Tạo đơn mới (TPOS)]  [💬 Ghi chú]          ║  │
│  ║                                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════════════════════╝  │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
5.2 Visual Cues & Color System

┌─────────────────────────────────────────────────────────────────────────────┐
│                         VISUAL CUES SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ══════════════════ CUSTOMER STATUS COLORS ══════════════════               │
│                                                                              │
│  ┌──────────────┬──────────────┬────────────────────────────────────────┐   │
│  │ Status       │ Color        │ Meaning                                │   │
│  ├──────────────┼──────────────┼────────────────────────────────────────┤   │
│  │ active       │ 🟢 #10b981   │ Khách bình thường                      │   │
│  │ warning      │ 🟡 #f59e0b   │ Có 1-2 lần boom hoặc return_rate <20%  │   │
│  │ danger       │ 🔴 #ef4444   │ return_rate >= 20% hoặc boom >= 3 lần  │   │
│  │ blocked      │ ⚫ #374151   │ Đã chặn, không cho đặt hàng            │   │
│  └──────────────┴──────────────┴────────────────────────────────────────┘   │
│                                                                              │
│  ══════════════════ WALLET DISPLAY ══════════════════                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Cách hiển thị số dư:                                                │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────┐                                 │    │
│  │  │  💵 Số dư khả dụng: 700,000đ   │  ← Tổng (real + virtual)       │    │
│  │  │  ════════════════════════════  │                                 │    │
│  │  │                                │                                 │    │
│  │  │  📤 Có thể rút: 500,000đ       │  ← Chỉ real_balance            │    │
│  │  │     (Tiền thực)                │                                 │    │
│  │  │                                │                                 │    │
│  │  │  🏷️ Chỉ mua hàng: 200,000đ    │  ← Chỉ virtual_balance         │    │
│  │  │     ⏰ Còn 12 ngày             │  ← Countdown                    │    │
│  │  │                                │                                 │    │
│  │  └────────────────────────────────┘                                 │    │
│  │                                                                      │    │
│  │  Color coding:                                                       │    │
│  │  - "Có thể rút" → 🟢 Green background                               │    │
│  │  - "Chỉ mua hàng" → 🟡 Amber background                             │    │
│  │  - Countdown < 3 ngày → 🔴 Red pulsing                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ══════════════════ TIMELINE ICONS ══════════════════                       │
│                                                                              │
│  ┌──────────────────┬──────────────┬───────────────────────────────────┐    │
│  │ Activity Type    │ Icon         │ Color                             │    │
│  ├──────────────────┼──────────────┼───────────────────────────────────┤    │
│  │ WALLET_DEPOSIT   │ 💰           │ 🟢 Green                          │    │
│  │ WALLET_WITHDRAW  │ 📤           │ 🟠 Orange                         │    │
│  │ WALLET_VIRTUAL   │ 🏷️          │ 🟣 Purple                         │    │
│  │ TICKET_CREATED   │ 📋           │ 🔵 Blue                           │    │
│  │ TICKET_COMPLETED │ ✅           │ 🟢 Green                          │    │
│  │ ORDER_DELIVERED  │ 🛒           │ 🟢 Green                          │    │
│  │ ORDER_RETURNED   │ 📦↩️         │ 🔴 Red                            │    │
│  │ CUSTOMER_NOTE    │ 💬           │ ⚪ Gray                           │    │
│  │ BANK_TRANSFER    │ 🏦           │ 🔵 Blue                           │    │
│  └──────────────────┴──────────────┴───────────────────────────────────┘    │
│                                                                              │
│  ══════════════════ RETURN RATE INDICATOR ══════════════════                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Hiển thị tỷ lệ hoàn:                                                │    │
│  │                                                                      │    │
│  │  return_rate < 10%:                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐│    │
│  │  │  Tỷ lệ hoàn: 5%  ████░░░░░░░░░░░░░░░░  🟢 Tốt                   ││    │
│  │  └─────────────────────────────────────────────────────────────────┘│    │
│  │                                                                      │    │
│  │  10% <= return_rate < 20%:                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐│    │
│  │  │  Tỷ lệ hoàn: 15% ██████████░░░░░░░░░░  🟡 Cần theo dõi          ││    │
│  │  └─────────────────────────────────────────────────────────────────┘│    │
│  │                                                                      │    │
│  │  return_rate >= 20%:                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐│    │
│  │  │  Tỷ lệ hoàn: 25% ████████████████░░░░  🔴 CAO - CẢNH BÁO!       ││    │
│  │  └─────────────────────────────────────────────────────────────────┘│    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
5.3 Wallet Detail Modal

┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 CHI TIẾT VÍ TIỀN - 0901234567                                     [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    TỔNG SỐ DƯ KHẢ DỤNG                                  ││
│  │                                                                         ││
│  │                      💵 700,000đ                                        ││
│  │                                                                         ││
│  │   ┌─────────────────────────┐    ┌─────────────────────────┐           ││
│  │   │  📤 CÓ THỂ RÚT         │    │  🏷️ CHỈ MUA HÀNG       │           ││
│  │   │                        │    │                         │           ││
│  │   │     500,000đ          │    │     200,000đ           │           ││
│  │   │  ───────────────────  │    │  ────────────────────  │           ││
│  │   │  Tiền thực, có thể    │    │  Công nợ ảo, chỉ dùng  │           ││
│  │   │  rút về TK ngân hàng  │    │  để mua hàng           │           ││
│  │   │                        │    │  ⏰ Còn 12 ngày        │           ││
│  │   └─────────────────────────┘    └─────────────────────────┘           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  📋 CÔNG NỢ ẢO CHI TIẾT                                                 ││
│  │  ──────────────────────────────────────────────────────────────────── ││
│  │  #1  200,000đ  RETURN_SHIPPER  01/01/2026  Hết hạn: 16/01  🟢 ACTIVE  ││
│  │      └─ Ticket: TV-2026-00002 - Đổi size áo                            ││
│  │      └─ Còn lại: 200,000đ / 200,000đ gốc                               ││
│  │                                                                         ││
│  │  (Không có công nợ ảo khác)                                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  📜 LỊCH SỬ GIAO DỊCH                                    [Xem tất cả]  ││
│  │  ──────────────────────────────────────────────────────────────────── ││
│  │  05/01  DEPOSIT_BANK     +500,000đ  Bank transfer   N2ABC123          ││
│  │         └─ ACB → VCB.3278907687                                        ││
│  │                                                                         ││
│  │  04/01  DEPOSIT_RETURN   +300,000đ  Return goods    Ticket TV-00003   ││
│  │         └─ BOOM hàng - Đơn NJD/2026/45678                              ││
│  │                                                                         ││
│  │  01/01  VIRTUAL_CREDIT   +200,000đ  Virtual credit  Ticket TV-00002   ││
│  │         └─ Công nợ ảo - Đổi hàng RETURN_SHIPPER                        ││
│  │                                                                         ││
│  │  28/12  WITHDRAW_ORDER   -150,000đ  Order payment   NJD/2026/44444    ││
│  │         └─ Trừ để thanh toán đơn hàng (Virtual: 100k, Real: 50k)       ││
│  │  ...                                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  HÀNH ĐỘNG                                               [Chỉ Kế toán] ││
│  │                                                                         ││
│  │  [💵 Nạp tiền thủ công]    [📤 Rút tiền]    [⚙️ Điều chỉnh số dư]      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
Xem tiếp tục PHẦN 6: IMPLEMENTATION ROADMAP ở 6_IMPLEMENTATION_ROADMAP_continue_Fullplan360customer.md ( n2store\6_IMPLEMENTATION_ROADMAP_continue_Fullplan360customer.md)