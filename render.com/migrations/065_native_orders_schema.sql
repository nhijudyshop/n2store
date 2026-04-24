-- =====================================================
-- NATIVE ORDERS SCHEMA
-- Web-native orders created from tpos-pancake page,
-- fully isolated from TPOS SaleOnline_Order + social_orders.
-- =====================================================
-- Auto-created at first request by routes/native-orders.js
-- This file exists for documentation / audit.
-- =====================================================

CREATE TABLE IF NOT EXISTS native_orders (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(40)  UNIQUE NOT NULL,       -- e.g. NW-20260424-0001
    session_index   INTEGER,                             -- per-customer session STT
    source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

    customer_name   VARCHAR(255),
    phone           VARCHAR(40),
    address         TEXT,
    note            TEXT,

    -- Facebook context (for traceability back to the comment)
    fb_user_id      VARCHAR(100),
    fb_user_name    VARCHAR(255),
    fb_page_id      VARCHAR(100),
    fb_post_id      VARCHAR(100),
    fb_comment_id   VARCHAR(100),
    crm_team_id     INTEGER,

    products        JSONB  DEFAULT '[]'::jsonb,          -- order lines
    total_quantity  INTEGER DEFAULT 0,
    total_amount    NUMERIC(14,2) DEFAULT 0,

    status          VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|confirmed|cancelled|delivered
    tags            JSONB  DEFAULT '[]'::jsonb,

    created_by      VARCHAR(100),
    created_by_name VARCHAR(255),
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_native_orders_created_at
    ON native_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_native_orders_fb_user_id
    ON native_orders(fb_user_id);
CREATE INDEX IF NOT EXISTS idx_native_orders_fb_post_id
    ON native_orders(fb_post_id);
CREATE INDEX IF NOT EXISTS idx_native_orders_status
    ON native_orders(status);
CREATE INDEX IF NOT EXISTS idx_native_orders_phone
    ON native_orders(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_orders_comment
    ON native_orders(fb_comment_id)
    WHERE fb_comment_id IS NOT NULL;
