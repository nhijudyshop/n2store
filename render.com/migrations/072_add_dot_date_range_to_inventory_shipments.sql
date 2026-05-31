-- Migration 072: Add per-đợt date range (ngay_bat_dau / ngay_ket_thuc) to inventory_shipments
-- Purpose: Bound which thanh_toan_ck (CK) payments belong to an đợt by payment date.
-- Before this, an đợt's "Tổng TT / CÒN LẠI" summed ALL payments regardless of date,
-- so transfers dated after an đợt's last delivery leaked into that đợt's balance.
-- These dates are per-đợt (shared across all NCC rows in same dot_so group), set via
-- the existing PATCH /shipments/payment-by-dot endpoint alongside thanh_toan_ck / ti_gia.

ALTER TABLE inventory_shipments
    ADD COLUMN IF NOT EXISTS ngay_bat_dau  DATE,
    ADD COLUMN IF NOT EXISTS ngay_ket_thuc DATE;

COMMENT ON COLUMN inventory_shipments.ngay_bat_dau IS
    'Per-đợt CK window start (inclusive). NULL = open-ended (count all earlier payments). Synced across all NCC rows in same dot_so group.';
COMMENT ON COLUMN inventory_shipments.ngay_ket_thuc IS
    'Per-đợt CK window end (inclusive). NULL = open-ended (count all later payments). Synced across all NCC rows in same dot_so group.';
