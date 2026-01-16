-- Migration: Add created_source tracking to customers table
-- Purpose: Track where customers are created from (ticket, bank_link, manual, import, etc.)
-- Created: 2026-01-16

-- Add created_source column to track where customers are created from
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_source VARCHAR(50);

-- Add created_by column to track who created the customer
-- Note: There may already be a created_by column from previous migrations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE customers ADD COLUMN created_by VARCHAR(255);
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN customers.created_source IS 'Source of customer creation: ticket, bank_link, manual, import, customer360_view, sync_tpos, webhook_auto, unknown';
COMMENT ON COLUMN customers.created_by IS 'Email/name of user who created this customer (for manual creation)';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_customers_created_source ON customers(created_source);

-- Optional: Update existing customers without source to 'legacy'
-- UPDATE customers SET created_source = 'legacy' WHERE created_source IS NULL;
