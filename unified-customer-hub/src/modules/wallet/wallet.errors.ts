import { AppError } from '../../middleware/error.middleware.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet Error Codes
// ═══════════════════════════════════════════════════════════════════════════════

export const WALLET_ERROR_CODES = {
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_FROZEN: 'WALLET_FROZEN',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  AMOUNT_EXCEEDS_LIMIT: 'AMOUNT_EXCEEDS_LIMIT',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CUSTOMER_BLOCKED: 'CUSTOMER_BLOCKED',
  VIRTUAL_CREDIT_NOT_FOUND: 'VIRTUAL_CREDIT_NOT_FOUND',
  VIRTUAL_CREDIT_EXPIRED: 'VIRTUAL_CREDIT_EXPIRED',
  VIRTUAL_CREDIT_CANCELLED: 'VIRTUAL_CREDIT_CANCELLED',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
} as const;

export type WalletErrorCode = (typeof WALLET_ERROR_CODES)[keyof typeof WALLET_ERROR_CODES];

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet Error Class
// ═══════════════════════════════════════════════════════════════════════════════

export class WalletError extends AppError {
  public readonly walletErrorCode: WalletErrorCode;

  constructor(
    code: WalletErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    const statusCode = getStatusCodeForWalletError(code);
    super(message, statusCode, code, details);
    this.walletErrorCode = code;
    this.name = 'WalletError';
  }

  static walletNotFound(phone: string): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.WALLET_NOT_FOUND,
      `Ví với số điện thoại ${phone} không tồn tại`,
      { phone }
    );
  }

  static walletFrozen(phone: string, reason?: string): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.WALLET_FROZEN,
      reason ? `Ví đã bị đóng băng: ${reason}` : 'Ví đã bị đóng băng',
      { phone, reason }
    );
  }

  static insufficientBalance(available: number, required: number): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.INSUFFICIENT_BALANCE,
      `Số dư không đủ. Có: ${formatCurrency(available)}, Cần: ${formatCurrency(required)}`,
      { available, required, shortage: required - available }
    );
  }

  static invalidAmount(amount: number): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.INVALID_AMOUNT,
      `Số tiền không hợp lệ: ${amount}. Số tiền phải lớn hơn 0`,
      { amount }
    );
  }

  static amountExceedsLimit(amount: number, limit: number): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.AMOUNT_EXCEEDS_LIMIT,
      `Số tiền ${formatCurrency(amount)} vượt quá giới hạn ${formatCurrency(limit)}`,
      { amount, limit }
    );
  }

  static dailyLimitExceeded(used: number, limit: number): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
      `Đã vượt quá giới hạn giao dịch trong ngày. Đã dùng: ${formatCurrency(used)}, Giới hạn: ${formatCurrency(limit)}`,
      { used, limit, remaining: Math.max(0, limit - used) }
    );
  }

  static customerNotFound(phone: string): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Khách hàng với số điện thoại ${phone} không tồn tại`,
      { phone }
    );
  }

  static customerBlocked(phone: string): WalletError {
    return new WalletError(
      WALLET_ERROR_CODES.CUSTOMER_BLOCKED,
      'Khách hàng đã bị khóa, không thể thực hiện giao dịch',
      { phone }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusCodeForWalletError(code: WalletErrorCode): number {
  switch (code) {
    case WALLET_ERROR_CODES.WALLET_NOT_FOUND:
    case WALLET_ERROR_CODES.CUSTOMER_NOT_FOUND:
    case WALLET_ERROR_CODES.VIRTUAL_CREDIT_NOT_FOUND:
      return 404;

    case WALLET_ERROR_CODES.WALLET_FROZEN:
    case WALLET_ERROR_CODES.CUSTOMER_BLOCKED:
      return 403;

    case WALLET_ERROR_CODES.INSUFFICIENT_BALANCE:
    case WALLET_ERROR_CODES.INVALID_AMOUNT:
    case WALLET_ERROR_CODES.AMOUNT_EXCEEDS_LIMIT:
    case WALLET_ERROR_CODES.DAILY_LIMIT_EXCEEDED:
    case WALLET_ERROR_CODES.VIRTUAL_CREDIT_EXPIRED:
    case WALLET_ERROR_CODES.VIRTUAL_CREDIT_CANCELLED:
      return 400;

    case WALLET_ERROR_CODES.DUPLICATE_TRANSACTION:
      return 409;

    case WALLET_ERROR_CODES.TRANSACTION_FAILED:
    default:
      return 500;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

export default WalletError;
