-- =====================================================
-- ADD order_context JSONB to dropped_products
-- Lưu toàn bộ context đơn hàng khi xả sản phẩm:
--   orderCode, orderId, stt, customerName, customerPhone,
--   fbUserId, fbUserName, userName (NV), liveCampaignName, ...
-- Migration Date: 2026-04-14
-- =====================================================

ALTER TABLE dropped_products
  ADD COLUMN IF NOT EXISTS order_context JSONB;

COMMENT ON COLUMN dropped_products.order_context IS 'Full order context when product was dropped: {orderCode, orderId, stt, customerName, customerPhone, fbUserId, fbUserName, userName, liveCampaignName}';
