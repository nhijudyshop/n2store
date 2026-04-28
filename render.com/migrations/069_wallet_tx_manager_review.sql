-- Migration 069: Add manager review columns to wallet_transactions
-- Purpose: Cho phép tab "Đã Duyệt" trong balance-history hiển thị thêm các +tiền
--          từ wallet_transactions (VIRTUAL_CREDIT, WALLET_REFUND, RETURN_SHIPPER, RETURN_CLIENT)
--          và mark "✓ Kiểm tra" giống balance_history rows.
-- Created: 2026-04-28
-- Idempotent: an toàn chạy nhiều lần.

ALTER TABLE wallet_transactions
ADD COLUMN IF NOT EXISTS manager_reviewed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS manager_review_note TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_manager_reviewed
ON wallet_transactions(manager_reviewed)
WHERE manager_reviewed = TRUE;

COMMENT ON COLUMN wallet_transactions.manager_reviewed IS 'Đã được quản lý kiểm tra (mirror của balance_history.manager_reviewed)';
COMMENT ON COLUMN wallet_transactions.manager_review_note IS 'Ghi chú khi quản lý kiểm tra';
COMMENT ON COLUMN wallet_transactions.reviewed_by IS 'Email/username người kiểm tra';
COMMENT ON COLUMN wallet_transactions.reviewed_at IS 'Thời điểm kiểm tra';
