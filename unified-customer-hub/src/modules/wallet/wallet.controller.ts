import { Request, Response } from 'express';
import { walletService } from './wallet.service.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import type {
  DepositBody,
  DepositParams,
  WithdrawBody,
  WithdrawParams,
  IssueVirtualCreditBody,
  IssueVirtualCreditParams,
  GetWalletParams,
  TransactionHistoryQuery,
  TransactionHistoryParams,
  FreezeWalletBody,
  FreezeWalletParams,
} from './wallet.schema.js';
import type { WalletOperationContext } from './wallet.types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Build operation context from request
// ═══════════════════════════════════════════════════════════════════════════════

function buildContext(req: AuthenticatedRequest): WalletOperationContext {
  return {
    performedBy: req.user.id,
    performedByUsername: req.user.username,
    performedByRole: req.user.roleName,
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent'),
    requestId: req.requestId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /wallets/:phone - Lấy thông tin ví
// ═══════════════════════════════════════════════════════════════════════════════

export const getWallet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.params as GetWalletParams;

  const result = await walletService.getWallet(phone);

  res.json({
    success: true,
    data: {
      phone: result.wallet.phone,
      realBalance: Number(result.wallet.real_balance),
      virtualBalance: Number(result.wallet.virtual_balance),
      totalBalance: result.totalBalance,
      isFrozen: result.wallet.is_frozen,
      frozenReason: result.wallet.frozen_reason,
      stats: {
        totalDeposited: Number(result.wallet.total_deposited),
        totalWithdrawn: Number(result.wallet.total_withdrawn),
        totalVirtualIssued: Number(result.wallet.total_virtual_issued),
        totalVirtualUsed: Number(result.wallet.total_virtual_used),
        totalVirtualExpired: Number(result.wallet.total_virtual_expired),
      },
      activeVirtualCredits: result.activeVirtualCredits.map((vc) => ({
        id: vc.id,
        originalAmount: Number(vc.original_amount),
        remainingAmount: Number(vc.remaining_amount),
        expiresAt: vc.expires_at,
        sourceType: vc.source_type,
        issuedAt: vc.issued_at,
      })),
      recentTransactions: result.recentTransactions.map((tx) => ({
        id: tx.id.toString(),
        code: tx.transaction_code,
        type: tx.transaction_type,
        amount: Number(tx.amount),
        realBalanceAfter: Number(tx.real_balance_after),
        virtualBalanceAfter: Number(tx.virtual_balance_after),
        description: tx.description,
        createdAt: tx.created_at,
      })),
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /wallets/:phone/balance - Lấy số dư nhanh
// ═══════════════════════════════════════════════════════════════════════════════

export const getBalance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.params as GetWalletParams;

  const result = await walletService.getBalance(phone);

  res.json({
    success: true,
    data: {
      phone: normalizePhone(phone),
      realBalance: result.realBalance,
      virtualBalance: result.virtualBalance,
      totalBalance: result.totalBalance,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /wallets/:phone/deposit - Nạp tiền
// ═══════════════════════════════════════════════════════════════════════════════

export const deposit = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { phone } = req.params as DepositParams;
    const body = req.body as DepositBody;
    const context = buildContext(authReq);

    const result = await walletService.deposit(
      {
        phone,
        amount: body.amount,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        description: body.description,
        internalNote: body.internalNote,
      },
      context
    );

    res.status(201).json({
      success: true,
      message: `Đã nạp thành công ${body.amount.toLocaleString('vi-VN')} VND`,
      data: {
        transactionId: result.transactionId.toString(),
        transactionCode: result.transactionCode,
        newRealBalance: result.newRealBalance,
        newVirtualBalance: result.newVirtualBalance,
        totalBalance: result.totalBalance,
      },
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /wallets/:phone/withdraw - Rút tiền/Thanh toán
// ═══════════════════════════════════════════════════════════════════════════════

export const withdraw = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { phone } = req.params as WithdrawParams;
    const body = req.body as WithdrawBody;
    const context = buildContext(authReq);

    const result = await walletService.withdraw(
      {
        phone,
        amount: body.amount,
        orderId: body.orderId,
        description: body.description,
      },
      context
    );

    res.status(200).json({
      success: true,
      message: `Đã trừ thành công ${body.amount.toLocaleString('vi-VN')} VND`,
      data: {
        virtualUsed: result.virtualUsed,
        realUsed: result.realUsed,
        totalUsed: result.totalUsed,
        usedCredits: result.usedCredits.map((c) => ({
          creditId: c.creditId,
          amount: c.amount,
          remainingAfter: c.remainingAfter,
          status: c.status,
        })),
        newRealBalance: result.newRealBalance,
        newVirtualBalance: result.newVirtualBalance,
        totalBalance: result.totalBalance,
        transactionIds: result.transactionIds.map((id) => id.toString()),
      },
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /wallets/:phone/virtual-credits - Cấp công nợ ảo
// ═══════════════════════════════════════════════════════════════════════════════

export const issueVirtualCredit = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { phone } = req.params as IssueVirtualCreditParams;
    const body = req.body as IssueVirtualCreditBody;
    const context = buildContext(authReq);

    const result = await walletService.issueVirtualCredit(
      {
        phone,
        amount: body.amount,
        expiryDays: body.expiryDays,
        sourceType: body.sourceType,
        sourceTicketId: body.sourceTicketId,
        sourceNote: body.sourceNote,
      },
      context
    );

    res.status(201).json({
      success: true,
      message: `Đã cấp công nợ ảo ${body.amount.toLocaleString('vi-VN')} VND`,
      data: {
        creditId: result.creditId,
        originalAmount: result.originalAmount,
        expiresAt: result.expiresAt,
        newVirtualBalance: result.newVirtualBalance,
        transactionId: result.transactionId.toString(),
        transactionCode: result.transactionCode,
      },
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Export controller object
// ═══════════════════════════════════════════════════════════════════════════════

export const walletController = {
  getWallet,
  getBalance,
  deposit,
  withdraw,
  issueVirtualCredit,
};

export default walletController;
