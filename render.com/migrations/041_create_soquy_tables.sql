-- Migration 041: create Soquy tables (mirror of Firestore collections)
-- Source collections: soquy_vouchers, soquy_counters, soquy_meta
-- Strategy: keep key fields as proper columns for querying, plus full doc in `raw` jsonb
-- so nothing is lost during the Firestore → Postgres migration.

CREATE TABLE IF NOT EXISTS soquy_vouchers (
    id                  TEXT PRIMARY KEY,         -- Firestore doc id
    code                TEXT,
    type                TEXT,                     -- 'receipt' | 'payment_cn' | 'payment_kd'
    fund_type           TEXT,
    category            TEXT,
    collector           TEXT,
    object_type         TEXT,
    person_name         TEXT,
    person_code         TEXT,
    phone               TEXT,
    address             TEXT,
    amount              NUMERIC(18, 2) DEFAULT 0,
    note                TEXT,
    image_data          TEXT,
    transfer_content    TEXT,
    account_name        TEXT,
    account_number      TEXT,
    branch              TEXT,
    source              TEXT,
    source_code         TEXT,
    business_accounting BOOLEAN DEFAULT FALSE,
    status              TEXT,
    voucher_date_time   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    created_by          TEXT,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT,
    raw                 JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_voucher_date_time ON soquy_vouchers (voucher_date_time DESC);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_type             ON soquy_vouchers (type);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_fund_type        ON soquy_vouchers (fund_type);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_status           ON soquy_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_code             ON soquy_vouchers (code);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_source_code      ON soquy_vouchers (source_code);

CREATE TABLE IF NOT EXISTS soquy_counters (
    id      TEXT PRIMARY KEY,    -- e.g. 'TM_payment_kd'
    value   BIGINT DEFAULT 0,
    raw     JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS soquy_meta (
    id          TEXT PRIMARY KEY,    -- e.g. 'payment_kd_categories', 'sources', 'creators'
    items       JSONB,               -- the `items` array if present
    raw         JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
