-- =====================================================
-- Migration 064: Replace broken UNIQUE index from 063 with sepay_id column
-- =====================================================
--
-- Problem: Migration 063's UNIQUE index on (reference_type, reference_id)
-- was too broad. It blocked:
--   1. wallet_withdraw_fifo() which INSERTs 2 rows (VIRTUAL_DEBIT + WITHDRAW)
--      with the same (reference_type='order', reference_id=order_id) pair
--   2. Manual withdrawals that all share reference_id='MANUAL'
-- → All wallet withdraw/deposit endpoints returned HTTP 500.
--
-- Solution (proposed by user): Store sepay_id directly on wallet_transactions.
-- UNIQUE index on sepay_id (partial: only when NOT NULL).
--   - BANK_TRANSFER deposits: sepay_id = SePay's integer id → UNIQUE enforced
--   - Other types (VIRTUAL_DEBIT, WITHDRAW, ADJUSTMENT, VIRTUAL_CREDIT):
--     sepay_id = NULL → partial index skips them → no conflict
--
-- This restores withdraw functionality AND keeps the last-line-of-defense
-- against double bank-deposit crediting.
--
-- Created: 2026-04-23 (after live incident on 0902660235 + withdraw 500 on 0123456788)
-- =====================================================

BEGIN;

-- Step 1: Drop the broken UNIQUE index from migration 063
DROP INDEX IF EXISTS idx_wallet_tx_unique_reference;

-- Step 2: Add sepay_id column (nullable - only set for BANK_TRANSFER deposits)
ALTER TABLE wallet_transactions
    ADD COLUMN IF NOT EXISTS sepay_id BIGINT;

COMMENT ON COLUMN wallet_transactions.sepay_id IS
'SePay transaction id (from bank webhook). Only populated for BANK_TRANSFER deposits.
NULL for all other transaction types. UNIQUE when NOT NULL — prevents double-credit
of the same bank transaction across retries, double-clicks, webhook+approve races, etc.';

-- Step 3: Backfill sepay_id from balance_history for existing BANK_TRANSFER deposits
UPDATE wallet_transactions wt
SET sepay_id = bh.sepay_id
FROM balance_history bh
WHERE wt.type = 'DEPOSIT'
  AND wt.source = 'BANK_TRANSFER'
  AND wt.reference_type = 'balance_history'
  AND wt.reference_id = bh.id::text
  AND wt.sepay_id IS NULL
  AND bh.sepay_id IS NOT NULL;

-- Report how many rows were backfilled
SELECT 'Backfilled sepay_id on rows:' AS info,
       COUNT(*) FILTER (WHERE sepay_id IS NOT NULL) AS with_sepay_id,
       COUNT(*) AS total_deposit_rows
FROM wallet_transactions
WHERE type = 'DEPOSIT' AND source = 'BANK_TRANSFER';

-- Step 4: Create PARTIAL UNIQUE index on sepay_id
-- Partial WHERE clause means NULL values are NOT indexed → no conflict for
-- non-bank transactions that have sepay_id = NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_unique_sepay_id
ON wallet_transactions (sepay_id)
WHERE sepay_id IS NOT NULL;

COMMENT ON INDEX idx_wallet_tx_unique_sepay_id IS
'Prevents duplicate wallet_transactions for the same SePay bank transaction.
Partial index: only enforced when sepay_id IS NOT NULL. Allows unlimited
non-bank transactions (order payments, manual adjustments, virtual credits).';

-- Step 5: Verification queries
SELECT 'VERIFY: Index exists' AS info, indexname, indexdef
FROM pg_indexes
WHERE tablename='wallet_transactions'
  AND indexname='idx_wallet_tx_unique_sepay_id';

SELECT 'VERIFY: Old index 063 is gone (should return 0 rows)' AS info, indexname
FROM pg_indexes
WHERE tablename='wallet_transactions'
  AND indexname='idx_wallet_tx_unique_reference';

SELECT 'VERIFY: sepay_id column exists' AS info, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name='wallet_transactions'
  AND column_name='sepay_id';

SELECT 'VERIFY: No duplicate sepay_id values' AS info,
       COUNT(*) AS duplicate_sepay_id_groups
FROM (
    SELECT sepay_id, COUNT(*) AS cnt
    FROM wallet_transactions
    WHERE sepay_id IS NOT NULL
    GROUP BY sepay_id
    HAVING COUNT(*) > 1
) sub;

COMMIT;
