-- Migration: Backfill customer_id for balance_history transactions
-- Purpose: Fix transactions that have linked_customer_phone but missing customer_id
-- Created: 2026-01-16
-- Issue: Transactions show "Chưa có" for customer name because customer_id is NULL

-- Step 1: Log current state for debugging
DO $$
DECLARE
    missing_count INTEGER;
    total_linked INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM balance_history
    WHERE linked_customer_phone IS NOT NULL
      AND customer_id IS NULL;

    SELECT COUNT(*) INTO total_linked
    FROM balance_history
    WHERE linked_customer_phone IS NOT NULL;

    RAISE NOTICE 'Balance history stats: % total linked, % missing customer_id',
        total_linked, missing_count;
END $$;

-- Step 2: Backfill customer_id by matching linked_customer_phone with customers.phone
-- This updates balance_history rows where:
--   - linked_customer_phone is set
--   - customer_id is NULL
--   - A matching customer exists in customers table
UPDATE balance_history bh
SET customer_id = c.id,
    updated_at = CURRENT_TIMESTAMP
FROM customers c
WHERE bh.linked_customer_phone = c.phone
  AND bh.customer_id IS NULL
  AND bh.linked_customer_phone IS NOT NULL;

-- Step 3: Log how many were fixed
DO $$
DECLARE
    still_missing INTEGER;
BEGIN
    SELECT COUNT(*) INTO still_missing
    FROM balance_history
    WHERE linked_customer_phone IS NOT NULL
      AND customer_id IS NULL;

    RAISE NOTICE 'After backfill: % transactions still missing customer_id (no matching customer in customers table)',
        still_missing;
END $$;

-- Step 4: List phones that have transactions but no customer record (for manual review)
-- These are phones linked in balance_history but not in customers table
-- You may need to create these customers manually or via TPOS sync
DO $$
DECLARE
    orphan_phones TEXT;
BEGIN
    SELECT string_agg(DISTINCT linked_customer_phone, ', ') INTO orphan_phones
    FROM balance_history bh
    WHERE bh.linked_customer_phone IS NOT NULL
      AND bh.customer_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM customers c WHERE c.phone = bh.linked_customer_phone
      )
    LIMIT 50;

    IF orphan_phones IS NOT NULL THEN
        RAISE NOTICE 'Orphan phones (linked but no customer record): %', orphan_phones;
    ELSE
        RAISE NOTICE 'All linked phones have matching customer records!';
    END IF;
END $$;

-- Optional: Create index for faster lookups if not exists
CREATE INDEX IF NOT EXISTS idx_balance_history_customer_id ON balance_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_linked_customer_phone ON balance_history(linked_customer_phone);
