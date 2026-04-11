-- =====================================================
-- Migration 028: Create pancake_accounts table
-- Date: 2026-04-11
-- Purpose: Store Pancake accounts (JWT tokens) in PostgreSQL
-- Replaces Firestore pancake_tokens/accounts as source of truth
-- =====================================================

CREATE TABLE IF NOT EXISTS pancake_accounts (
    account_id VARCHAR(100) PRIMARY KEY,
    uid VARCHAR(100),
    name VARCHAR(255),
    token TEXT NOT NULL,
    token_exp BIGINT,
    fb_id VARCHAR(50),
    fb_name VARCHAR(255),
    pages JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP DEFAULT NOW(),
    saved_at BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pancake_accounts_uid ON pancake_accounts(uid);
CREATE INDEX IF NOT EXISTS idx_pancake_accounts_active ON pancake_accounts(is_active);

COMMENT ON TABLE pancake_accounts IS 'Pancake JWT accounts. Synced from Firestore pancake_tokens/accounts. Each account has a JWT token for Pancake API access.';

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_pancake_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_pancake_accounts ON pancake_accounts;
CREATE TRIGGER trigger_update_pancake_accounts
    BEFORE UPDATE ON pancake_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_pancake_accounts_updated_at();
