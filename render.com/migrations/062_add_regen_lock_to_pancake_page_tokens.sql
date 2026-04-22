-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
-- =====================================================
-- Migration 062: Add regen_lock_until to pancake_page_access_tokens
-- Date: 2026-04-22
-- Purpose: Distributed lock to prevent multiple machines regenerating
--          same PAT simultaneously (race → duplicate API calls).
--          Lock is acquired atomically via SQL UPDATE WHERE expired.
-- =====================================================

-- Ensure base table exists (safe if already created ad-hoc via Firestore migration)
CREATE TABLE IF NOT EXISTS pancake_page_access_tokens (
    page_id       VARCHAR(100) PRIMARY KEY,
    token         TEXT NOT NULL,
    page_name     VARCHAR(255),
    timestamp     BIGINT,
    saved_at      BIGINT,
    generated_by  VARCHAR(255),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Add regen lock column (nullable — lock is advisory, not enforced at DB level)
ALTER TABLE pancake_page_access_tokens
  ADD COLUMN IF NOT EXISTS regen_lock_until TIMESTAMPTZ;

-- Index for cron job: find tokens expiring in next N days
CREATE INDEX IF NOT EXISTS idx_pancake_pat_saved_at ON pancake_page_access_tokens(saved_at);

COMMENT ON COLUMN pancake_page_access_tokens.regen_lock_until IS 'Distributed lock timestamp. If > NOW(), another machine is regenerating this PAT. Clients should poll instead of regenerating.';
