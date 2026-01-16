-- Migration: Add created_source tracking to customers table
-- Purpose: Track where customers are created from (ticket, bank_link, manual, import, etc.)
-- Created: 2026-01-16
-- Note: created_by column was removed per user request - only created_source is needed

-- Add created_source column to track where customers are created from
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_source VARCHAR(50);

-- Add comments for documentation
COMMENT ON COLUMN customers.created_source IS 'Source of customer creation: ticket, bank_link, manual, import, customer360_view, sync_tpos, webhook_auto, unknown';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_customers_created_source ON customers(created_source);

-- Optional: Update existing customers without source to 'legacy'
-- UPDATE customers SET created_source = 'legacy' WHERE created_source IS NULL;
