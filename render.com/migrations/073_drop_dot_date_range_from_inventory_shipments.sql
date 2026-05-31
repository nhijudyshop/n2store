-- Migration 073: Drop per-đợt date range columns from inventory_shipments
-- Reverts migration 072. Chia đợt theo khoảng ngày bị bỏ (2026-06-01) vì không hợp
-- lý: 1 thanh toán CK của đợt sau có thể trùng ngày giao của đợt trước → trùng lặp.
-- Đợt giờ tách hoàn toàn theo dot_so (HĐ/CP theo shipment dot_so; TT theo mảng
-- thanh_toan_ck của đợt). 2 cột này không còn dùng → xoá cho gọn.

ALTER TABLE inventory_shipments
    DROP COLUMN IF EXISTS ngay_bat_dau,
    DROP COLUMN IF EXISTS ngay_ket_thuc;
