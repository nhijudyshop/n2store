-- Migration: Add debt match tracking columns to balance_history
-- Purpose: Track how transactions are matched to customers (QR code vs phone suffix)
-- Date: 2024-12-28

-- Add debt_match_source column
-- Values: 'qr_code', 'phone_5_digits', 'phone_6_digits', 'manual', 'pending', 'skipped', NULL
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS debt_match_source VARCHAR(20);

-- Add debt_matched_phone column
-- Stores the phone number that was matched to this transaction
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS debt_matched_phone VARCHAR(20);

-- Add pending_match_phones column (JSONB array)
-- Stores array of phone numbers when multiple customers match
-- Example: ["0901234567", "0912234567"]
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS pending_match_phones JSONB;

-- Create index for filtering pending matches
CREATE INDEX IF NOT EXISTS idx_balance_history_match_source
ON balance_history(debt_match_source)
WHERE debt_match_source IS NOT NULL;

-- Update existing records that have debt_added = true but no match source
-- These were matched via QR code in the old system
UPDATE balance_history
SET debt_match_source = 'qr_code'
WHERE debt_added = true
  AND debt_match_source IS NULL
  AND content ~ 'N2[A-Z0-9]{16}';

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: debt match tracking columns added';
    RAISE NOTICE 'Columns added: debt_match_source, debt_matched_phone, pending_match_phones';
END $$;
