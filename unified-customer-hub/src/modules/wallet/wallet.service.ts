// ═══════════════════════════════════════════════════════════════════════════════
// WALLET SERVICE - CORE FINANCIAL ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CRITICAL: Tất cả các hàm thay đổi số dư PHẢI sử dụng:
// 1. Database Transaction (db.transaction)
// 2. Row-level Locking (SELECT ... FOR UPDATE)
// 3. Audit Logging trong cùng transaction
//
// ═══════════════════════════════════════════════════════════════════════════════

import { db, TransactionClient } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import { formatCurrency } from '../../utils/currency-formatter.js';
import { addDays } from '../../utils/date-utils.js';
import {
  TRANSACTION_TYPES,
  VIRTUAL_CREDIT_STATUS,
  AUDIT_ACTIONS,
} from '../../config/constants.js';
import { WalletError } from './wallet.errors.js';
import type {
  DepositInput,
  DepositResult,
  WithdrawInput,
  WithdrawResult,
  IssueVirtualCreditInput,
  IssueVirtualCreditResult,
  GetWalletResult,
  WalletOperationContext,
  UsedCreditDetail,
  Wallet,
  VirtualCredit,
  WalletTransaction,
  VirtualCreditUsage,
} from './wallet.types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEPOSIT - Nạp tiền (Cộng Real Balance)
// ═══════════════════════════════════════════════════════════════════════════════

export async function deposit(
  input: DepositInput,
  context: WalletOperationContext
): Promise<DepositResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw WalletError.customerNotFound(input.phone);
  }

  // Validate amount
  if (input.amount <= 0) {
    throw WalletError.invalidAmount(input.amount);
  }

  logger.info('Starting deposit transaction', {
    phone,
    amount: input.amount,
    sourceType: input.sourceType,
    performedBy: context.performedBy,
  });

  return db.transaction(async (tx) => {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Lock wallet row (SELECT ... FOR UPDATE)
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: walletRows } = await tx.query<Wallet>(
      `SELECT * FROM wallets WHERE phone = $1 FOR UPDATE`,
      [phone]
    );

    if (walletRows.length === 0) {
      throw WalletError.walletNotFound(phone);
    }

    const wallet = walletRows[0]!;

    // Check if wallet is frozen
    if (wallet.is_frozen) {
      throw WalletError.walletFrozen(phone, wallet.frozen_reason || undefined);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Calculate new balance
    // ═══════════════════════════════════════════════════════════════════════════
    const realBalanceBefore = Number(wallet.real_balance);
    const virtualBalanceBefore = Number(wallet.virtual_balance);
    const newRealBalance = realBalanceBefore + input.amount;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Update wallet
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `UPDATE wallets
       SET real_balance = $1,
           total_deposited = total_deposited + $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone = $3`,
      [newRealBalance, input.amount, phone]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Create wallet transaction log
    // ═══════════════════════════════════════════════════════════════════════════
    const transactionType =
      input.sourceType === 'bank_transfer'
        ? TRANSACTION_TYPES.DEPOSIT_BANK
        : input.sourceType === 'ticket'
          ? TRANSACTION_TYPES.DEPOSIT_RETURN
          : TRANSACTION_TYPES.DEPOSIT_ADJUSTMENT;

    const { rows: txRows } = await tx.query<{ id: bigint; transaction_code: string }>(
      `INSERT INTO wallet_transactions (
        wallet_id, phone, transaction_type, amount,
        real_balance_before, real_balance_after,
        virtual_balance_before, virtual_balance_after,
        source_type, source_id, description, internal_note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, transaction_code`,
      [
        wallet.id,
        phone,
        transactionType,
        input.amount,
        realBalanceBefore,
        newRealBalance,
        virtualBalanceBefore,
        virtualBalanceBefore, // Virtual balance unchanged
        input.sourceType,
        input.sourceId || null,
        input.description || `Nạp tiền ${formatCurrency(input.amount)}`,
        input.internalNote || null,
        context.performedBy,
      ]
    );

    const transaction = txRows[0]!;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Create customer activity
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO customer_activities (
        customer_id, phone, activity_type, title, description,
        reference_type, reference_id, metadata, icon, color, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        wallet.customer_id,
        phone,
        'WALLET_DEPOSIT',
        `Nạp ${formatCurrency(input.amount)} vào ví`,
        input.description || `Nguồn: ${input.sourceType}`,
        'wallet_tx',
        transaction.transaction_code,
        JSON.stringify({ amount: input.amount, sourceType: input.sourceType }),
        'plus-circle',
        'green',
        context.performedBy,
      ]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Create audit log
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO audit_logs (
        action, entity_type, entity_id, entity_phone,
        old_value, new_value, description,
        performed_by, performed_by_username, performed_by_role,
        ip_address, user_agent, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        AUDIT_ACTIONS.WALLET_DEPOSIT,
        'wallet',
        wallet.id.toString(),
        phone,
        JSON.stringify({ real_balance: realBalanceBefore }),
        JSON.stringify({ real_balance: newRealBalance }),
        `Deposit ${input.amount} from ${input.sourceType}`,
        context.performedBy,
        context.performedByUsername,
        context.performedByRole,
        context.ipAddress,
        context.userAgent || null,
        context.requestId || null,
      ]
    );

    logger.info('Deposit completed successfully', {
      phone,
      amount: input.amount,
      transactionCode: transaction.transaction_code,
      newBalance: newRealBalance,
    });

    return {
      success: true as const,
      transactionId: transaction.id,
      transactionCode: transaction.transaction_code,
      newRealBalance,
      newVirtualBalance: virtualBalanceBefore,
      totalBalance: newRealBalance + virtualBalanceBefore,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WITHDRAW - Rút tiền/Thanh toán (FIFO Virtual Credits)
// ═══════════════════════════════════════════════════════════════════════════════
//
// THUẬT TOÁN FIFO:
// 1. Ưu tiên trừ tiền ảo (Virtual Credits) sắp hết hạn trước
// 2. Nếu tiền ảo không đủ, trừ tiếp từ tiền thực (Real Balance)
// 3. Tạo transaction logs cho từng loại trừ
//
// ═══════════════════════════════════════════════════════════════════════════════

export async function withdraw(
  input: WithdrawInput,
  context: WalletOperationContext
): Promise<WithdrawResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw WalletError.customerNotFound(input.phone);
  }

  // Validate amount
  if (input.amount <= 0) {
    throw WalletError.invalidAmount(input.amount);
  }

  logger.info('Starting withdraw transaction', {
    phone,
    amount: input.amount,
    orderId: input.orderId,
    performedBy: context.performedBy,
  });

  return db.transaction(async (tx) => {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Lock wallet row (SELECT ... FOR UPDATE)
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: walletRows } = await tx.query<Wallet>(
      `SELECT * FROM wallets WHERE phone = $1 FOR UPDATE`,
      [phone]
    );

    if (walletRows.length === 0) {
      throw WalletError.walletNotFound(phone);
    }

    const wallet = walletRows[0]!;

    // Check if wallet is frozen
    if (wallet.is_frozen) {
      throw WalletError.walletFrozen(phone, wallet.frozen_reason || undefined);
    }

    // Check total available balance
    const realBalance = Number(wallet.real_balance);
    const virtualBalance = Number(wallet.virtual_balance);
    const totalAvailable = realBalance + virtualBalance;

    if (input.amount > totalAvailable) {
      throw WalletError.insufficientBalance(totalAvailable, input.amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Lock and get active virtual credits (FIFO by expires_at)
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: activeCredits } = await tx.query<VirtualCredit>(
      `SELECT * FROM virtual_credits
       WHERE phone = $1
         AND status = 'ACTIVE'
         AND expires_at > NOW()
         AND remaining_amount > 0
       ORDER BY expires_at ASC
       FOR UPDATE`,
      [phone]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Calculate deductions using FIFO algorithm
    // ═══════════════════════════════════════════════════════════════════════════
    let remaining = input.amount;
    let virtualUsed = 0;
    let realUsed = 0;
    const usedCredits: UsedCreditDetail[] = [];

    // Deduct from virtual credits first (FIFO - earliest expiry first)
    for (const credit of activeCredits) {
      if (remaining <= 0) break;

      const creditRemaining = Number(credit.remaining_amount);
      const useFromCredit = Math.min(creditRemaining, remaining);
      const newCreditRemaining = creditRemaining - useFromCredit;
      const newStatus = newCreditRemaining <= 0 ? VIRTUAL_CREDIT_STATUS.USED : VIRTUAL_CREDIT_STATUS.ACTIVE;

      // Update credit usage history
      const currentUsageHistory = (credit.usage_history as VirtualCreditUsage[]) || [];
      currentUsageHistory.push({
        order_id: input.orderId,
        amount: useFromCredit,
        used_at: new Date().toISOString(),
      });

      // Update virtual credit
      await tx.query(
        `UPDATE virtual_credits
         SET remaining_amount = $1,
             status = $2,
             usage_history = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newCreditRemaining, newStatus, JSON.stringify(currentUsageHistory), credit.id]
      );

      usedCredits.push({
        creditId: credit.id,
        amount: useFromCredit,
        remainingAfter: newCreditRemaining,
        status: newStatus,
      });

      virtualUsed += useFromCredit;
      remaining -= useFromCredit;
    }

    // Deduct from real balance if virtual credits not enough
    if (remaining > 0) {
      realUsed = remaining;
      remaining = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Update wallet balances
    // ═══════════════════════════════════════════════════════════════════════════
    const newRealBalance = realBalance - realUsed;
    const newVirtualBalance = virtualBalance - virtualUsed;

    await tx.query(
      `UPDATE wallets
       SET real_balance = $1,
           virtual_balance = $2,
           total_withdrawn = total_withdrawn + $3,
           total_virtual_used = total_virtual_used + $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone = $5`,
      [newRealBalance, newVirtualBalance, realUsed, virtualUsed, phone]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Create transaction logs
    // ═══════════════════════════════════════════════════════════════════════════
    const transactionIds: bigint[] = [];

    // Log for virtual credit usage
    if (virtualUsed > 0) {
      const { rows: vtxRows } = await tx.query<{ id: bigint }>(
        `INSERT INTO wallet_transactions (
          wallet_id, phone, transaction_type, amount,
          real_balance_before, real_balance_after,
          virtual_balance_before, virtual_balance_after,
          source_type, source_id, source_details, description, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          wallet.id,
          phone,
          TRANSACTION_TYPES.VIRTUAL_CREDIT_USE,
          virtualUsed,
          realBalance,
          newRealBalance,
          virtualBalance,
          newVirtualBalance,
          'order',
          input.orderId,
          JSON.stringify({ usedCredits }),
          `Sử dụng công nợ ảo ${formatCurrency(virtualUsed)} - Đơn ${input.orderId}`,
          context.performedBy,
        ]
      );
      transactionIds.push(vtxRows[0]!.id);
    }

    // Log for real balance usage
    if (realUsed > 0) {
      const { rows: rtxRows } = await tx.query<{ id: bigint }>(
        `INSERT INTO wallet_transactions (
          wallet_id, phone, transaction_type, amount,
          real_balance_before, real_balance_after,
          virtual_balance_before, virtual_balance_after,
          source_type, source_id, description, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          wallet.id,
          phone,
          TRANSACTION_TYPES.WITHDRAW_ORDER,
          realUsed,
          realBalance,
          newRealBalance,
          virtualBalance,
          newVirtualBalance,
          'order',
          input.orderId,
          `Trừ số dư thực ${formatCurrency(realUsed)} - Đơn ${input.orderId}`,
          context.performedBy,
        ]
      );
      transactionIds.push(rtxRows[0]!.id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Create customer activity
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO customer_activities (
        customer_id, phone, activity_type, title, description,
        reference_type, reference_id, metadata, icon, color, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        wallet.customer_id,
        phone,
        'WALLET_WITHDRAW',
        `Sử dụng ví ${formatCurrency(virtualUsed + realUsed)} cho đơn hàng`,
        `Virtual: ${formatCurrency(virtualUsed)}, Real: ${formatCurrency(realUsed)}`,
        'order',
        input.orderId,
        JSON.stringify({ virtualUsed, realUsed, usedCredits, orderId: input.orderId }),
        'minus-circle',
        'orange',
        context.performedBy,
      ]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 7: Create audit log
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO audit_logs (
        action, entity_type, entity_id, entity_phone,
        old_value, new_value, description,
        performed_by, performed_by_username, performed_by_role,
        ip_address, user_agent, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        AUDIT_ACTIONS.WALLET_WITHDRAW,
        'wallet',
        wallet.id.toString(),
        phone,
        JSON.stringify({ real_balance: realBalance, virtual_balance: virtualBalance }),
        JSON.stringify({ real_balance: newRealBalance, virtual_balance: newVirtualBalance }),
        `Withdraw ${input.amount} for order ${input.orderId}. Virtual: ${virtualUsed}, Real: ${realUsed}`,
        context.performedBy,
        context.performedByUsername,
        context.performedByRole,
        context.ipAddress,
        context.userAgent || null,
        context.requestId || null,
      ]
    );

    logger.info('Withdraw completed successfully', {
      phone,
      totalAmount: input.amount,
      virtualUsed,
      realUsed,
      orderId: input.orderId,
      newRealBalance,
      newVirtualBalance,
    });

    return {
      success: true as const,
      virtualUsed,
      realUsed,
      totalUsed: virtualUsed + realUsed,
      usedCredits,
      newRealBalance,
      newVirtualBalance,
      totalBalance: newRealBalance + newVirtualBalance,
      transactionIds,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUE VIRTUAL CREDIT - Cấp công nợ ảo
// ═══════════════════════════════════════════════════════════════════════════════

export async function issueVirtualCredit(
  input: IssueVirtualCreditInput,
  context: WalletOperationContext
): Promise<IssueVirtualCreditResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw WalletError.customerNotFound(input.phone);
  }

  // Validate amount
  if (input.amount <= 0) {
    throw WalletError.invalidAmount(input.amount);
  }

  const expiryDays = input.expiryDays || 15; // Default 15 days

  logger.info('Starting issue virtual credit transaction', {
    phone,
    amount: input.amount,
    expiryDays,
    sourceType: input.sourceType,
    performedBy: context.performedBy,
  });

  return db.transaction(async (tx) => {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Lock wallet row
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: walletRows } = await tx.query<Wallet>(
      `SELECT * FROM wallets WHERE phone = $1 FOR UPDATE`,
      [phone]
    );

    if (walletRows.length === 0) {
      throw WalletError.walletNotFound(phone);
    }

    const wallet = walletRows[0]!;

    // Check if wallet is frozen
    if (wallet.is_frozen) {
      throw WalletError.walletFrozen(phone, wallet.frozen_reason || undefined);
    }

    const virtualBalanceBefore = Number(wallet.virtual_balance);
    const realBalanceBefore = Number(wallet.real_balance);
    const expiresAt = addDays(new Date(), expiryDays);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Create virtual credit record
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: creditRows } = await tx.query<{ id: number }>(
      `INSERT INTO virtual_credits (
        wallet_id, phone, original_amount, remaining_amount,
        expires_at, source_type, source_ticket_id, source_note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        wallet.id,
        phone,
        input.amount,
        input.amount,
        expiresAt,
        input.sourceType,
        input.sourceTicketId || null,
        input.sourceNote || null,
        context.performedBy,
      ]
    );

    const creditId = creditRows[0]!.id;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Update wallet virtual balance
    // ═══════════════════════════════════════════════════════════════════════════
    const newVirtualBalance = virtualBalanceBefore + input.amount;

    await tx.query(
      `UPDATE wallets
       SET virtual_balance = $1,
           total_virtual_issued = total_virtual_issued + $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone = $3`,
      [newVirtualBalance, input.amount, phone]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Create wallet transaction log
    // ═══════════════════════════════════════════════════════════════════════════
    const { rows: txRows } = await tx.query<{ id: bigint; transaction_code: string }>(
      `INSERT INTO wallet_transactions (
        wallet_id, phone, transaction_type, amount,
        real_balance_before, real_balance_after,
        virtual_balance_before, virtual_balance_after,
        source_type, source_id, virtual_credit_id, description, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, transaction_code`,
      [
        wallet.id,
        phone,
        TRANSACTION_TYPES.VIRTUAL_CREDIT_ISSUE,
        input.amount,
        realBalanceBefore,
        realBalanceBefore, // Real balance unchanged
        virtualBalanceBefore,
        newVirtualBalance,
        input.sourceType === 'RETURN_SHIPPER' ? 'ticket' : 'manual',
        input.sourceTicketId?.toString() || null,
        creditId,
        `Cấp công nợ ảo ${formatCurrency(input.amount)} - Hạn ${expiryDays} ngày`,
        context.performedBy,
      ]
    );

    const transaction = txRows[0]!;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Create customer activity
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO customer_activities (
        customer_id, phone, activity_type, title, description,
        reference_type, reference_id, metadata, icon, color, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        wallet.customer_id,
        phone,
        'WALLET_VIRTUAL_CREDIT',
        `Cấp công nợ ảo ${formatCurrency(input.amount)}`,
        `Hạn sử dụng: ${expiryDays} ngày. Nguồn: ${input.sourceType}`,
        'wallet_tx',
        transaction.transaction_code,
        JSON.stringify({
          amount: input.amount,
          expiryDays,
          sourceType: input.sourceType,
          creditId,
        }),
        'gift',
        'purple',
        context.performedBy,
      ]
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Create audit log
    // ═══════════════════════════════════════════════════════════════════════════
    await tx.query(
      `INSERT INTO audit_logs (
        action, entity_type, entity_id, entity_phone,
        old_value, new_value, description,
        performed_by, performed_by_username, performed_by_role,
        ip_address, user_agent, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        AUDIT_ACTIONS.VIRTUAL_CREDIT_ISSUE,
        'virtual_credit',
        creditId.toString(),
        phone,
        JSON.stringify({ virtual_balance: virtualBalanceBefore }),
        JSON.stringify({ virtual_balance: newVirtualBalance, credit_id: creditId }),
        `Issue virtual credit ${input.amount}, expires in ${expiryDays} days`,
        context.performedBy,
        context.performedByUsername,
        context.performedByRole,
        context.ipAddress,
        context.userAgent || null,
        context.requestId || null,
      ]
    );

    logger.info('Virtual credit issued successfully', {
      phone,
      amount: input.amount,
      creditId,
      expiresAt,
      transactionCode: transaction.transaction_code,
    });

    return {
      success: true as const,
      creditId,
      originalAmount: input.amount,
      expiresAt,
      newVirtualBalance,
      transactionId: transaction.id,
      transactionCode: transaction.transaction_code,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET WALLET - Lấy thông tin ví
// ═══════════════════════════════════════════════════════════════════════════════

export async function getWallet(phone: string): Promise<GetWalletResult> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw WalletError.customerNotFound(phone);
  }

  // Get wallet
  const { rows: walletRows } = await db.query<Wallet>(
    `SELECT * FROM wallets WHERE phone = $1`,
    [normalizedPhone]
  );

  if (walletRows.length === 0) {
    throw WalletError.walletNotFound(normalizedPhone);
  }

  const wallet = walletRows[0]!;

  // Get active virtual credits
  const { rows: activeCredits } = await db.query<VirtualCredit>(
    `SELECT * FROM virtual_credits
     WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW() AND remaining_amount > 0
     ORDER BY expires_at ASC`,
    [normalizedPhone]
  );

  // Get recent transactions (last 10)
  const { rows: recentTransactions } = await db.query<WalletTransaction>(
    `SELECT * FROM wallet_transactions
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [normalizedPhone]
  );

  return {
    wallet,
    totalBalance: Number(wallet.real_balance) + Number(wallet.virtual_balance),
    activeVirtualCredits: activeCredits,
    recentTransactions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET BALANCE - Lấy số dư nhanh (for quick checks)
// ═══════════════════════════════════════════════════════════════════════════════

export async function getBalance(
  phone: string
): Promise<{ realBalance: number; virtualBalance: number; totalBalance: number }> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw WalletError.customerNotFound(phone);
  }

  const { rows } = await db.query<{ real_balance: string; virtual_balance: string }>(
    `SELECT real_balance, virtual_balance FROM wallets WHERE phone = $1`,
    [normalizedPhone]
  );

  if (rows.length === 0) {
    throw WalletError.walletNotFound(normalizedPhone);
  }

  const realBalance = Number(rows[0]!.real_balance);
  const virtualBalance = Number(rows[0]!.virtual_balance);

  return {
    realBalance,
    virtualBalance,
    totalBalance: realBalance + virtualBalance,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export all functions
// ═══════════════════════════════════════════════════════════════════════════════

export const walletService = {
  deposit,
  withdraw,
  issueVirtualCredit,
  getWallet,
  getBalance,
};

export default walletService;
