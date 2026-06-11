-- =====================================================
-- Migration 076: RETURN_SHIPPER handover-to-shipper tracking
-- =====================================================
--
-- Purpose: delivery-report "Xuất excel" (tab Thu về) enriches each row with
-- quantity/value pulled from the customer's newest PENDING_GOODS
-- RETURN_SHIPPER ticket, then marks that ticket as handed over to the
-- shipper. These columns persist the mark + the delivery order it was
-- linked to, so re-exports are idempotent (same ticket, same numbers).
--
-- PROD-SAFE: Strictly ADDITIVE + IDEMPOTENT. No UPDATE/DELETE of existing
-- rows. Re-runnable (lazy bootstrap in routes/v2/tickets.js runs this on
-- every cold start). Touches ONLY the Web 1.0 table customer_tickets.
-- All new columns are NULL for existing rows — zero data impact.
--
-- Created: 2026-06-11
-- =====================================================

ALTER TABLE customer_tickets ADD COLUMN IF NOT EXISTS handover_at           TIMESTAMP;
ALTER TABLE customer_tickets ADD COLUMN IF NOT EXISTS handover_order_number VARCHAR(50);
ALTER TABLE customer_tickets ADD COLUMN IF NOT EXISTS handover_date         DATE;
ALTER TABLE customer_tickets ADD COLUMN IF NOT EXISTS handover_by           VARCHAR(100);

-- Idempotency anchor: ONE ticket per delivery-order Number, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tickets_handover_order
    ON customer_tickets(handover_order_number)
    WHERE handover_order_number IS NOT NULL;

-- Claim-path index (newest unclaimed RETURN_SHIPPER per phone)
CREATE INDEX IF NOT EXISTS idx_customer_tickets_handover_claim
    ON customer_tickets(phone, created_at DESC)
    WHERE handover_at IS NULL;

SELECT 'migration 076 applied' AS status,
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_name = 'customer_tickets'
        AND column_name IN ('handover_at', 'handover_order_number', 'handover_date', 'handover_by')) AS handover_columns_present;
