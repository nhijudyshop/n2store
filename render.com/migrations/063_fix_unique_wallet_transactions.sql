-- =====================================================
-- Migration 063: Fix UNIQUE index on wallet_transactions
-- =====================================================
--
-- Problem: Migration 012 was never applied to production.
-- Combined with a Pool/transaction bug (BEGIN/COMMIT + FOR UPDATE running
-- on different connections via pool.query instead of client.query), this
-- allowed 1 balance_history record to create multiple wallet_transactions
-- when the accountant double-clicked "Duyệt" or a request was retried.
--
-- Confirmed case: balance_history id=3752 (customer 0902660235, 870,000đ,
-- 2026-04-22 14:54) produced wallet_transactions #7103 and #7135 (identical
-- reference_type/reference_id). Admin manually created CÔNG NỢ LỖI NHÂN ĐÔI
-- to correct the wallet balance.
--
-- Solution:
--   1. Remove existing duplicates (keep smallest id).
--   2. Recalculate affected wallet balances from transaction history.
--   3. CREATE UNIQUE INDEX on (reference_type, reference_id).
--
-- This is the LAST LINE OF DEFENSE. Application code is being refactored
-- separately to use pool.connect() + client for real transactions.
-- =====================================================

BEGIN;

-- Step 1: Log duplicates for audit before deleting
CREATE TEMP TABLE _wallet_tx_duplicates_log AS
SELECT
    wt.id,
    wt.phone,
    wt.amount,
    wt.reference_type,
    wt.reference_id,
    wt.source,
    wt.note,
    wt.created_at,
    (
        SELECT MIN(wt2.id)
        FROM wallet_transactions wt2
        WHERE wt2.reference_type = wt.reference_type
          AND wt2.reference_id = wt.reference_id
    ) AS kept_id
FROM wallet_transactions wt
WHERE wt.reference_type IS NOT NULL
  AND wt.reference_id IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM wallet_transactions wt2
      WHERE wt2.reference_type = wt.reference_type
        AND wt2.reference_id = wt.reference_id
        AND wt2.id < wt.id
  );

-- Show what will be deleted
SELECT 'WILL DELETE duplicate wallet_transactions:' AS info,
       COUNT(*) AS duplicate_count,
       COALESCE(SUM(amount), 0) AS total_duplicate_amount
FROM _wallet_tx_duplicates_log;

-- Step 2: Collect affected phones BEFORE deletion
CREATE TEMP TABLE _affected_phones AS
SELECT DISTINCT phone FROM _wallet_tx_duplicates_log WHERE phone IS NOT NULL;

-- Step 3: Delete duplicate rows (keep the FIRST / smallest id for each reference pair)
DELETE FROM wallet_transactions wt1
WHERE wt1.reference_type IS NOT NULL
  AND wt1.reference_id IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM wallet_transactions wt2
      WHERE wt2.reference_type = wt1.reference_type
        AND wt2.reference_id = wt1.reference_id
        AND wt2.id < wt1.id
  );

-- Step 4: Recalculate balance for affected wallets
-- balance = sum of transaction amounts by type
UPDATE customer_wallets cw
SET balance = COALESCE((
        SELECT SUM(
            CASE
                WHEN wt.type IN ('DEPOSIT', 'ADJUSTMENT') THEN wt.amount
                WHEN wt.type IN ('WITHDRAW') THEN -wt.amount
                ELSE 0
            END
        )
        FROM wallet_transactions wt
        WHERE wt.phone = cw.phone
          AND wt.type IN ('DEPOSIT', 'WITHDRAW', 'ADJUSTMENT')
    ), 0),
    total_deposited = COALESCE((
        SELECT SUM(amount)
        FROM wallet_transactions wt
        WHERE wt.phone = cw.phone AND wt.type = 'DEPOSIT'
    ), 0),
    updated_at = NOW()
WHERE cw.phone IN (SELECT phone FROM _affected_phones);

-- Step 5: Create the UNIQUE index (partial — only where both columns are non-null)
-- This prevents any future duplicate wallet_transactions at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_unique_reference
ON wallet_transactions (reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

COMMENT ON INDEX idx_wallet_tx_unique_reference IS
'Prevents duplicate wallet_transactions for the same (reference_type, reference_id).
Applied in migration 063 after discovering that migration 012 was never run on prod.
Last line of defense against race conditions in approval/webhook/cron code paths.';

-- Step 6: Verification
SELECT 'VERIFY: Remaining duplicates (should be 0)' AS info,
       COUNT(*) AS count
FROM (
    SELECT reference_type, reference_id
    FROM wallet_transactions
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
    GROUP BY reference_type, reference_id
    HAVING COUNT(*) > 1
) sub;

SELECT 'VERIFY: Index exists' AS info, indexname
FROM pg_indexes
WHERE tablename = 'wallet_transactions'
  AND indexname = 'idx_wallet_tx_unique_reference';

COMMIT;
