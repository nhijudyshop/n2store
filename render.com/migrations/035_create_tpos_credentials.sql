-- Migration 035: Create tpos_credentials table
-- Stores TPOS account credentials per user per company
-- Replaces localStorage bill_tpos_credentials_* and Firestore billCredentials
-- Date: 2026-03-30

CREATE TABLE IF NOT EXISTS tpos_credentials (
    username VARCHAR(100) NOT NULL,
    company_id INTEGER NOT NULL DEFAULT 1,
    auth_type VARCHAR(20) NOT NULL DEFAULT 'password', -- 'password' or 'bearer'
    tpos_username VARCHAR(255),
    tpos_password VARCHAR(255),
    bearer_token TEXT,
    refresh_token TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, company_id)
);

CREATE INDEX IF NOT EXISTS idx_tpos_credentials_username ON tpos_credentials(username);
