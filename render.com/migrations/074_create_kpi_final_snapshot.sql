-- =====================================================
-- 074: KPI Final Snapshot
-- Ảnh chụp danh sách SP CUỐI CÙNG thật trên TPOS của 1 đơn.
-- Lazily-populated: fetch 1 lần (khi "Làm mới dữ liệu" / mở modal / recompute),
-- đã có thì bỏ qua (trừ force refresh).
--
-- Mục đích: tính KPI = (final TPOS − BASE) thay vì cộng dồn sự kiện audit log.
-- Audit log là "sổ sự kiện" tách rời nên trôi (drift) khỏi đơn thật
-- (vd thêm trùng 3 lần, xóa ảo) → KPI sai. Snapshot này là nguồn số lượng thật.
--
-- KHÔNG đụng attribution (vẫn giữ quy tắc chủ khoảng STT 2026-05-07) —
-- bảng này chỉ cung cấp SỐ LƯỢNG cuối để tính NET = final − base.
-- Append-only feature: bảng + endpoint RIÊNG, không sửa kpi_base/kpi_audit_log/kpi_statistics.
-- =====================================================

CREATE TABLE IF NOT EXISTS kpi_final_snapshot (
    order_code   VARCHAR(50)  PRIMARY KEY,
    order_id     VARCHAR(255),
    products     JSONB        NOT NULL DEFAULT '[]',
    fetched_by   VARCHAR(255),
    fetched_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE kpi_final_snapshot IS
    'Snapshot SP cuối thật trên TPOS (lazy, fetch 1 lần). KPI NET = final − BASE.';
COMMENT ON COLUMN kpi_final_snapshot.products IS
    '[{ProductId, ProductCode, ProductName, Quantity, Price}] — Details cuối từ TPOS';
