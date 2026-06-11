-- =====================================================
-- Migration 075: Wallet Refund Outbox + FIFO idempotency
-- =====================================================
--
-- Purpose: Make the REFUND side of wallet operations as durable as the
-- DEDUCTION side (outbox pattern), and add defense-in-depth idempotency
-- to wallet_withdraw_fifo so a double-call can never double-deduct.
--
-- PROD-SAFE: Strictly ADDITIVE + IDEMPOTENT. No UPDATE/DELETE of existing
-- rows. Re-runnable (Render restart / lazy bootstrap safe). Touches ONLY
-- the Web 1.0 table pending_wallet_withdrawals + the wallet_withdraw_fifo
-- function. Does NOT touch any web2_* table.
--
-- Reuses the existing pending_wallet_withdrawals table (migration 025) as
-- the refund outbox: ONE row tracks the full deduct -> refund lifecycle of
-- one order. UNIQUE(order_id, phone) doubles as the idempotency key AND the
-- cancel-before-deduct race guard (a CANCEL_MARKER row claims the key so a
-- late deduction POST is blocked).
--
-- New status lifecycle:
--   PENDING --claim--> PROCESSING --ok--> COMPLETED --cancel--> REFUND_DUE --> REFUNDED (terminal)
--                          |fail-> PENDING(retry) / FAILED          ^
--                          |                                        |
--   PENDING/FAILED --cancel--> CANCELLED          PROCESSING --cancel--> REFUND_DUE (cron settles)
--   (cancel, no prior row) -> INSERT marker status=CANCELLED, amount=0, source='CANCEL_MARKER'
--
-- Created: 2026-06-11
-- =====================================================

-- ---------- 1. Expand status CHECK (add REFUND_DUE, REFUNDED) ----------
-- Robust: drop ANY check constraint referencing the status column (handles
-- non-standard auto-names), then add the superset. Idempotent.
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'pending_wallet_withdrawals'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE pending_wallet_withdrawals DROP CONSTRAINT %I', c.conname);
    END LOOP;

    -- ADD is exception-safe: a concurrent instance (rolling deploy) may have re-added
    -- it between our DROP and ADD. duplicate_object is benign here.
    BEGIN
        ALTER TABLE pending_wallet_withdrawals
            ADD CONSTRAINT pending_wallet_withdrawals_status_check
            CHECK (status IN (
                'PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED','REFUND_DUE','REFUNDED'
            ));
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- ---------- 2. Relax amount CHECK (> 0  ->  >= 0) for CANCEL_MARKER rows ----------
-- ASSUMPTION: the ONLY CHECK constraint mentioning 'amount' on this table is
-- migration 025's inline `CHECK (amount > 0)`. If a future migration adds a
-- cross-column CHECK referencing 'amount' (e.g. virtual_used <= amount), update
-- this to match by column (pg_attribute) instead of text, or it will be dropped too.
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'pending_wallet_withdrawals'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%amount%'
    LOOP
        EXECUTE format('ALTER TABLE pending_wallet_withdrawals DROP CONSTRAINT %I', c.conname);
    END LOOP;

    BEGIN
        ALTER TABLE pending_wallet_withdrawals
            ADD CONSTRAINT pending_wallet_withdrawals_amount_check CHECK (amount >= 0);
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- ---------- 3. Refund tracking columns (additive) ----------
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_requested_at  TIMESTAMP;
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_reason        TEXT;
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_requested_by  VARCHAR(100);
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_retry_count   INTEGER DEFAULT 0;
-- 20 auto-retries (every 5 min ≈ 100 min) before the cron stops and the STUCK alert
-- fires. The row STAYS REFUND_DUE — the refund obligation is never dropped, only
-- auto-retry pauses (settle manually via POST /:id/process-refund).
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_max_retries   INTEGER DEFAULT 20;
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_last_error    TEXT;
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refunded_at          TIMESTAMP;
ALTER TABLE pending_wallet_withdrawals ADD COLUMN IF NOT EXISTS refund_tx_id         INTEGER;

-- ---------- 4. Indexes for refund worker + stale-PROCESSING recovery ----------
CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_refund_due
    ON pending_wallet_withdrawals(status, refund_requested_at)
    WHERE status = 'REFUND_DUE';

CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_stale_processing
    ON pending_wallet_withdrawals(status, updated_at)
    WHERE status = 'PROCESSING';

-- ---------- 5. wallet_withdraw_fifo with IDEMPOTENCY GUARD (fix A6) ----------
-- Same signature + RETURNS as migration 002. Only change vs 002: an
-- idempotency guard inserted right after the wallet lock. If this (phone,
-- order_id) already has ORDER_PAYMENT ledger rows, return the prior result
-- WITHOUT deducting again (anchored on wallet_transactions = source of truth).
CREATE OR REPLACE FUNCTION wallet_withdraw_fifo(
    p_phone VARCHAR,
    p_amount DECIMAL,
    p_order_id VARCHAR,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    virtual_used DECIMAL,
    real_used DECIMAL,
    total_used DECIMAL,
    new_balance DECIMAL,
    new_virtual_balance DECIMAL,
    error_message TEXT
) AS $$
DECLARE
    v_wallet RECORD;
    v_credit RECORD;
    v_remaining DECIMAL;
    v_virtual_used DECIMAL := 0;
    v_real_used DECIMAL := 0;
    v_use_from_credit DECIMAL;
    v_total_available DECIMAL;
    v_prior_virtual DECIMAL := 0;   -- migration 075: idempotency
    v_prior_real DECIMAL := 0;      -- migration 075: idempotency
BEGIN
    -- Lock wallet for update
    SELECT * INTO v_wallet
    FROM customer_wallets
    WHERE phone = p_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Wallet not found'::TEXT;
        RETURN;
    END IF;

    -- migration 075: IDEMPOTENCY GUARD (fix A6, defense-in-depth)
    -- Stored amounts are NEGATIVE, so negate to get the positive used amount.
    SELECT
        COALESCE(SUM(CASE WHEN type = 'VIRTUAL_DEBIT' THEN -amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'WITHDRAW'      THEN -amount ELSE 0 END), 0)
    INTO v_prior_virtual, v_prior_real
    FROM wallet_transactions
    WHERE phone = p_phone
      AND reference_id = p_order_id
      AND source = 'ORDER_PAYMENT';

    IF (v_prior_virtual + v_prior_real) > 0 THEN
        -- Already withdrawn for this order. Do NOT deduct again.
        RETURN QUERY SELECT
            TRUE,
            v_prior_virtual,
            v_prior_real,
            v_prior_virtual + v_prior_real,
            v_wallet.balance,
            v_wallet.virtual_balance,
            'ALREADY_PROCESSED'::TEXT;
        RETURN;
    END IF;

    -- Check available balance
    v_total_available := v_wallet.balance + v_wallet.virtual_balance;
    IF p_amount > v_total_available THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
            v_wallet.balance, v_wallet.virtual_balance,
            ('Insufficient balance. Available: ' || v_total_available || ', Required: ' || p_amount)::TEXT;
        RETURN;
    END IF;

    v_remaining := p_amount;

    -- Step 1: Use virtual credits first (FIFO by expires_at)
    IF v_remaining > 0 AND v_wallet.virtual_balance > 0 THEN
        FOR v_credit IN
            SELECT * FROM virtual_credits
            WHERE phone = p_phone
            AND status = 'ACTIVE'
            AND expires_at > CURRENT_TIMESTAMP
            ORDER BY expires_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining <= 0;

            v_use_from_credit := LEAST(v_credit.remaining_amount, v_remaining);

            -- Update credit
            UPDATE virtual_credits
            SET
                remaining_amount = remaining_amount - v_use_from_credit,
                status = CASE WHEN remaining_amount - v_use_from_credit <= 0 THEN 'USED' ELSE 'ACTIVE' END,
                used_in_orders = used_in_orders || jsonb_build_object(
                    'orderId', p_order_id,
                    'amount', v_use_from_credit,
                    'usedAt', CURRENT_TIMESTAMP
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_credit.id;

            v_virtual_used := v_virtual_used + v_use_from_credit;
            v_remaining := v_remaining - v_use_from_credit;
        END LOOP;
    END IF;

    -- Step 2: Use real balance for remaining
    IF v_remaining > 0 THEN
        v_real_used := v_remaining;
        v_remaining := 0;
    END IF;

    -- Step 3: Update wallet
    UPDATE customer_wallets
    SET
        balance = balance - v_real_used,
        virtual_balance = virtual_balance - v_virtual_used,
        total_withdrawn = total_withdrawn + v_real_used,
        total_virtual_used = total_virtual_used + v_virtual_used,
        updated_at = CURRENT_TIMESTAMP
    WHERE phone = p_phone;

    -- Step 4: Log transactions
    IF v_virtual_used > 0 THEN
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount,
            balance_before, balance_after,
            virtual_balance_before, virtual_balance_after,
            source, reference_type, reference_id, note
        ) VALUES (
            p_phone, v_wallet.id, 'VIRTUAL_DEBIT', -v_virtual_used,
            v_wallet.balance, v_wallet.balance - v_real_used,
            v_wallet.virtual_balance, v_wallet.virtual_balance - v_virtual_used,
            'ORDER_PAYMENT', 'order', p_order_id,
            COALESCE(p_note, 'Tru cong no ao - Don ' || p_order_id)
        );
    END IF;

    IF v_real_used > 0 THEN
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount,
            balance_before, balance_after,
            virtual_balance_before, virtual_balance_after,
            source, reference_type, reference_id, note
        ) VALUES (
            p_phone, v_wallet.id, 'WITHDRAW', -v_real_used,
            v_wallet.balance, v_wallet.balance - v_real_used,
            v_wallet.virtual_balance - v_virtual_used, v_wallet.virtual_balance - v_virtual_used,
            'ORDER_PAYMENT', 'order', p_order_id,
            COALESCE(p_note, 'Tru so du thuc - Don ' || p_order_id)
        );
    END IF;

    -- Return result
    RETURN QUERY SELECT
        TRUE,
        v_virtual_used,
        v_real_used,
        v_virtual_used + v_real_used,
        v_wallet.balance - v_real_used,
        v_wallet.virtual_balance - v_virtual_used,
        NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Verification
-- =====================================================
SELECT
    'migration 075 applied' AS status,
    (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name = 'pending_wallet_withdrawals'
         AND column_name IN ('refund_requested_at','refund_retry_count','refunded_at','refund_tx_id')
    ) AS refund_columns_present,
    (SELECT pg_get_constraintdef(con.oid)
       FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
       WHERE rel.relname = 'pending_wallet_withdrawals'
         AND con.conname = 'pending_wallet_withdrawals_status_check'
    ) AS status_check_def;
