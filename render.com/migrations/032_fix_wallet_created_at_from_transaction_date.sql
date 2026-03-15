-- Migration 032: Fix wallet_transactions and customer_activities created_at
-- Problem: Old records used approval time (NOW()) instead of bank transfer receipt time (transaction_date)
-- Fix: Update created_at to match balance_history.transaction_date (converted from VN time to UTC)

-- 1. Fix wallet_transactions.created_at
UPDATE wallet_transactions wt
SET created_at = (bh.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AT TIME ZONE 'UTC')
FROM balance_history bh
WHERE wt.reference_type = 'balance_history'
  AND wt.reference_id = bh.id::text
  AND bh.transaction_date IS NOT NULL;

-- 2. Fix customer_activities.created_at for WALLET_DEPOSIT from balance_history
UPDATE customer_activities ca
SET created_at = (bh.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AT TIME ZONE 'UTC')
FROM balance_history bh
WHERE ca.reference_type = 'balance_history'
  AND ca.reference_id = bh.id::text
  AND ca.activity_type = 'WALLET_DEPOSIT'
  AND bh.transaction_date IS NOT NULL;
