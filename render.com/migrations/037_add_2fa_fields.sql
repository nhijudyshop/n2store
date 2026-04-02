-- Migration: Add 2FA (TOTP) fields to app_users
-- Date: 2026-04-02

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255),
ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS two_fa_enabled_at TIMESTAMP;
