-- =====================================================
-- LIVE SALE — web-native TPOS replacement schema
-- =====================================================
-- Tables that power /api/v2/live-sale/*:
--   * live_sale_products         — product master (independent of TPOS)
--   * live_sale_orders           — order header (replaces SaleOnline_Order)
--   * live_sale_order_lines      — order lines
--   * live_sale_live_sessions    — live video session cache
--   * live_sale_comment_orders   — comment → order mapping (SessionIndex)
--
-- Plus: adds customers.facebook_id for FB user lookup.
--
-- Idempotent — safe to re-run (all CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =====================================================

-- ---- customers.facebook_id --------------------------------------------------

ALTER TABLE customers ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_customers_facebook_id ON customers(facebook_id) WHERE facebook_id IS NOT NULL;

-- ---- live_sale_products -----------------------------------------------------

CREATE TABLE IF NOT EXISTS live_sale_products (
    id              BIGSERIAL PRIMARY KEY,
    sku             TEXT UNIQUE,
    name            TEXT NOT NULL,
    default_price   NUMERIC(14, 2) DEFAULT 0,
    image_url       TEXT,
    tpos_product_id BIGINT,
    attributes      JSONB DEFAULT '{}'::jsonb,
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sale_products_active   ON live_sale_products(is_active);
CREATE INDEX IF NOT EXISTS idx_live_sale_products_tpos_ref ON live_sale_products(tpos_product_id) WHERE tpos_product_id IS NOT NULL;

-- ---- live_sale_live_sessions -----------------------------------------------

CREATE TABLE IF NOT EXISTS live_sale_live_sessions (
    id              BIGSERIAL PRIMARY KEY,
    fb_page_id      TEXT NOT NULL,
    fb_post_id      TEXT,
    fb_live_id      TEXT,
    title           TEXT,
    status          VARCHAR(20) DEFAULT 'live',
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (fb_page_id, fb_post_id)
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_page   ON live_sale_live_sessions(fb_page_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sale_live_sessions(status);

-- ---- live_sale_orders -------------------------------------------------------

CREATE TABLE IF NOT EXISTS live_sale_orders (
    id                BIGSERIAL PRIMARY KEY,
    code              TEXT UNIQUE NOT NULL,
    customer_id       BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    live_session_id   BIGINT REFERENCES live_sale_live_sessions(id) ON DELETE SET NULL,
    session_index     INT,
    fb_user_id        TEXT,
    fb_user_name      TEXT,
    fb_post_id        TEXT,
    fb_comment_id     TEXT,
    note              TEXT,
    status            VARCHAR(20) DEFAULT 'draft',
    total             NUMERIC(14, 2) DEFAULT 0,
    created_by        VARCHAR(64),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_orders_fb_user       ON live_sale_orders(fb_user_id);
CREATE INDEX IF NOT EXISTS idx_live_orders_fb_post       ON live_sale_orders(fb_post_id);
CREATE INDEX IF NOT EXISTS idx_live_orders_customer      ON live_sale_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_live_orders_status        ON live_sale_orders(status);
CREATE INDEX IF NOT EXISTS idx_live_orders_created_desc  ON live_sale_orders(created_at DESC);

-- ---- live_sale_order_lines --------------------------------------------------

CREATE TABLE IF NOT EXISTS live_sale_order_lines (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT NOT NULL REFERENCES live_sale_orders(id) ON DELETE CASCADE,
    product_id    BIGINT REFERENCES live_sale_products(id) ON DELETE SET NULL,
    product_name  TEXT NOT NULL,
    sku           TEXT,
    quantity      NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price    NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_order_lines_order ON live_sale_order_lines(order_id);

-- ---- live_sale_comment_orders (SessionIndex equivalent) ---------------------

CREATE TABLE IF NOT EXISTS live_sale_comment_orders (
    id             BIGSERIAL PRIMARY KEY,
    fb_post_id     TEXT NOT NULL,
    fb_user_id     TEXT NOT NULL,
    order_id       BIGINT NOT NULL REFERENCES live_sale_orders(id) ON DELETE CASCADE,
    order_code     TEXT NOT NULL,
    session_index  INT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (fb_post_id, fb_user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_comment_orders_post ON live_sale_comment_orders(fb_post_id);

-- ---- updated_at triggers ----------------------------------------------------

CREATE OR REPLACE FUNCTION live_sale_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_live_sale_products_touch ON live_sale_products;
CREATE TRIGGER trg_live_sale_products_touch
    BEFORE UPDATE ON live_sale_products
    FOR EACH ROW EXECUTE FUNCTION live_sale_touch_updated_at();

DROP TRIGGER IF EXISTS trg_live_sale_orders_touch ON live_sale_orders;
CREATE TRIGGER trg_live_sale_orders_touch
    BEFORE UPDATE ON live_sale_orders
    FOR EACH ROW EXECUTE FUNCTION live_sale_touch_updated_at();

-- ---- trigger: recompute order total when lines change ----------------------

CREATE OR REPLACE FUNCTION live_sale_recompute_order_total() RETURNS TRIGGER AS $$
DECLARE
    target_order_id BIGINT;
BEGIN
    target_order_id := COALESCE(NEW.order_id, OLD.order_id);
    UPDATE live_sale_orders
       SET total = (
           SELECT COALESCE(SUM(quantity * unit_price), 0)
             FROM live_sale_order_lines
            WHERE order_id = target_order_id
       ),
       updated_at = NOW()
     WHERE id = target_order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_live_sale_lines_total ON live_sale_order_lines;
CREATE TRIGGER trg_live_sale_lines_total
    AFTER INSERT OR UPDATE OR DELETE ON live_sale_order_lines
    FOR EACH ROW EXECUTE FUNCTION live_sale_recompute_order_total();
