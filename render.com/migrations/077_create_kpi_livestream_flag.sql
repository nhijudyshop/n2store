-- =====================================================
-- 077: KPI Livestream Flag table (cột "BH" / Bán hàng livestream)
-- Per-product-line flag: nhân viên tự đánh dấu SP nào "bán thêm trong livestream".
-- Tách HOÀN TOÀN khỏi kpi_sale_flag (KPI thường) — feature riêng, append-only.
-- BH KHÔNG cộng tiền KPI; chỉ ghi nhận số lượng, gom theo chiến dịch live.
-- Loại trừ lẫn nhau với KPI flag ở tầng UI (modal Sửa đơn hàng).
-- Cột snapshot (product_name, quantity, campaign_name, ...) denormalized để
-- tab "KPI Livestream" (orders-report/tab-kpi-commission.html) self-contained,
-- không phải re-fetch TPOS.
-- =====================================================

CREATE TABLE IF NOT EXISTS kpi_livestream_flag (
    order_code            VARCHAR(50)  NOT NULL,
    product_id            BIGINT       NOT NULL,
    is_livestream_product BOOLEAN      NOT NULL DEFAULT FALSE,
    product_code          VARCHAR(100),
    product_name          TEXT,
    quantity              INTEGER      NOT NULL DEFAULT 1,
    price                 BIGINT       NOT NULL DEFAULT 0,
    campaign_id           VARCHAR(100),
    campaign_name         TEXT,
    seller_name           VARCHAR(255),
    customer_name         TEXT,
    set_by_user_id        VARCHAR(255),
    set_by_user_name      VARCHAR(255),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_code, product_id)
);

CREATE INDEX IF NOT EXISTS idx_kpi_livestream_flag_order    ON kpi_livestream_flag(order_code);
CREATE INDEX IF NOT EXISTS idx_kpi_livestream_flag_campaign ON kpi_livestream_flag(campaign_id);
CREATE INDEX IF NOT EXISTS idx_kpi_livestream_flag_updated  ON kpi_livestream_flag(updated_at DESC);

COMMENT ON TABLE kpi_livestream_flag IS
    'Per-product-line livestream sale flag (cột "BH"). Tách khỏi kpi_sale_flag.';
COMMENT ON COLUMN kpi_livestream_flag.is_livestream_product IS
    'TRUE = SP bán thêm livestream (hiện trong tab KPI Livestream); FALSE/không row = bỏ qua';
