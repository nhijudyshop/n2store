-- Sprint 4 — Bulk Generate, Campaigns, SePay topup, Telegram.
-- Idempotent: safe to re-run.

-- ====================================================================
-- 1. USER SETTINGS — Telegram chat_id binding + plan + per-user prefs
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_user_settings (
    user_id           TEXT PRIMARY KEY,
    telegram_chat_id  TEXT,
    notify_on_done    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_error   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 2. TOPUP — pending SePay topups (matched by memo)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_topups (
    id           BIGSERIAL PRIMARY KEY,
    user_id      TEXT NOT NULL,
    pack_id      TEXT NOT NULL,
    credits      INTEGER NOT NULL,
    amount_vnd   INTEGER NOT NULL,
    memo         TEXT NOT NULL UNIQUE,            -- AIKOLxxxxx — unique per topup
    state        TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'paid'|'expired'|'cancelled'
    paid_at      TIMESTAMPTZ,
    paid_by_sepay_id TEXT,                         -- balance_history.sepay_id
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_topups_user  ON aikol_topups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_topups_memo  ON aikol_topups(memo);
CREATE INDEX IF NOT EXISTS idx_aikol_topups_state ON aikol_topups(state) WHERE state = 'pending';

COMMENT ON TABLE aikol_user_settings IS 'AI KOL Studio: per-user prefs (Telegram chat_id, notif toggles)';
COMMENT ON TABLE aikol_topups        IS 'AI KOL Studio: pending SePay topups (matched on webhook by memo)';
