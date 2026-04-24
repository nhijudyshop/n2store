-- =====================================================
-- 065: KPI Sale Flag table
-- Per-product-line flag: sale nhan viên tự đánh dấu SP nào là "bán hàng thật"
-- để tính KPI. Unchecked (không có row hoặc is_sale_product=FALSE) → KPI bỏ qua.
-- Áp dụng cho orders có kpi_base.created_at ≥ cutoff (xem KPI_SALE_FLAG_EFFECTIVE_FROM
-- trong orders-report/js/managers/kpi-manager.js). Orders cũ → legacy, bỏ qua flag.
-- =====================================================

CREATE TABLE IF NOT EXISTS kpi_sale_flag (
    order_code        VARCHAR(50)   NOT NULL,
    product_id        BIGINT        NOT NULL,
    is_sale_product   BOOLEAN       NOT NULL DEFAULT FALSE,
    set_by_user_id    VARCHAR(255),
    set_by_user_name  VARCHAR(255),
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_code, product_id)
);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_flag_order ON kpi_sale_flag(order_code);

COMMENT ON TABLE kpi_sale_flag IS
    'Per-product-line sale flag. User tự đánh dấu SP nào được tính KPI.';
COMMENT ON COLUMN kpi_sale_flag.is_sale_product IS
    'TRUE = tính KPI; FALSE hoặc không có row = bỏ qua (với orders sau cutoff)';
