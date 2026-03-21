-- Migration: Create invoice_status tables
-- Replaces Firestore: invoice_status_v2, invoice_status_delete_v2
-- Date: 2026-03-21

-- =====================================================
-- Table 1: invoice_status
-- Replaces Firestore collection: invoice_status_v2
-- Each row = one compound key entry (SaleOnlineId_timestamp)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_status (
    id SERIAL PRIMARY KEY,
    compound_key VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    sale_online_id VARCHAR(255) NOT NULL,
    tpos_id INTEGER,
    number VARCHAR(100),
    reference VARCHAR(100),
    state VARCHAR(50),
    show_state VARCHAR(100),
    state_code VARCHAR(100),
    is_merge_cancel BOOLEAN DEFAULT FALSE,
    partner_id INTEGER,
    partner_display_name VARCHAR(255),
    amount_total DECIMAL(15,2) DEFAULT 0,
    amount_untaxed DECIMAL(15,2) DEFAULT 0,
    delivery_price DECIMAL(15,2) DEFAULT 0,
    cash_on_delivery DECIMAL(15,2) DEFAULT 0,
    payment_amount DECIMAL(15,2) DEFAULT 0,
    debt_used DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    tracking_ref VARCHAR(255),
    carrier_name TEXT,
    user_name VARCHAR(255),
    session_index VARCHAR(50),
    order_lines JSONB,
    receiver_name VARCHAR(255),
    receiver_phone VARCHAR(50),
    receiver_address TEXT,
    comment TEXT,
    delivery_note TEXT,
    error TEXT,
    date_invoice TIMESTAMP,
    date_created TIMESTAMP,
    live_campaign_id VARCHAR(255),
    entry_timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_status_sale_online_id ON invoice_status(sale_online_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status_username ON invoice_status(username);
CREATE INDEX IF NOT EXISTS idx_invoice_status_latest ON invoice_status(sale_online_id, entry_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_status_entry_timestamp ON invoice_status(entry_timestamp);
CREATE INDEX IF NOT EXISTS idx_invoice_status_tpos_id ON invoice_status(tpos_id) WHERE tpos_id IS NOT NULL;

-- =====================================================
-- Table 2: invoice_sent_bills
-- Replaces sentBills Set in Firestore doc
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_sent_bills (
    id SERIAL PRIMARY KEY,
    sale_online_id VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sale_online_id, username)
);

CREATE INDEX IF NOT EXISTS idx_invoice_sent_bills_sale_online_id ON invoice_sent_bills(sale_online_id);

-- =====================================================
-- Table 3: invoice_status_delete
-- Replaces Firestore collection: invoice_status_delete_v2
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_status_delete (
    id SERIAL PRIMARY KEY,
    compound_key VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    sale_online_id VARCHAR(255) NOT NULL,
    cancel_reason TEXT,
    deleted_at BIGINT NOT NULL,
    deleted_by VARCHAR(100),
    deleted_by_display_name VARCHAR(255),
    is_old_version BOOLEAN DEFAULT FALSE,
    hidden BOOLEAN DEFAULT FALSE,
    invoice_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_delete_sale_online_id ON invoice_status_delete(sale_online_id);
CREATE INDEX IF NOT EXISTS idx_invoice_delete_username ON invoice_status_delete(username);
CREATE INDEX IF NOT EXISTS idx_invoice_delete_deleted_at ON invoice_status_delete(deleted_at);
