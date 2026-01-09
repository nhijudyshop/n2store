import {
  TransactionType,
  VirtualCreditSource,
  VirtualCreditStatus,
} from '../../config/constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Wallet {
  id: number;
  customer_id: number;
  phone: string;
  real_balance: number;
  virtual_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_virtual_issued: number;
  total_virtual_used: number;
  total_virtual_expired: number;
  is_frozen: boolean;
  frozen_reason: string | null;
  frozen_at: Date | null;
  frozen_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface VirtualCredit {
  id: number;
  wallet_id: number;
  phone: string;
  original_amount: number;
  remaining_amount: number;
  issued_at: Date;
  expires_at: Date;
  status: VirtualCreditStatus;
  source_type: VirtualCreditSource;
  source_ticket_id: number | null;
  source_note: string | null;
  usage_history: VirtualCreditUsage[];
  created_by: number | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VirtualCreditUsage {
  order_id: string;
  amount: number;
  used_at: string;
}

export interface WalletTransaction {
  id: bigint;
  transaction_code: string;
  wallet_id: number;
  phone: string;
  transaction_type: TransactionType;
  amount: number;
  real_balance_before: number;
  real_balance_after: number;
  virtual_balance_before: number;
  virtual_balance_after: number;
  source_type: string | null;
  source_id: string | null;
  source_details: Record<string, unknown> | null;
  virtual_credit_id: number | null;
  description: string | null;
  internal_note: string | null;
  created_by: number | null;
  created_at: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deposit Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface DepositInput {
  phone: string;
  amount: number;
  sourceType: 'bank_transfer' | 'ticket' | 'manual';
  sourceId?: string;
  description?: string;
  internalNote?: string;
}

export interface DepositResult {
  success: true;
  transactionId: bigint;
  transactionCode: string;
  newRealBalance: number;
  newVirtualBalance: number;
  totalBalance: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Withdraw Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface WithdrawInput {
  phone: string;
  amount: number;
  orderId: string;
  description?: string;
}

export interface WithdrawResult {
  success: true;
  virtualUsed: number;
  realUsed: number;
  totalUsed: number;
  usedCredits: UsedCreditDetail[];
  newRealBalance: number;
  newVirtualBalance: number;
  totalBalance: number;
  transactionIds: bigint[];
}

export interface UsedCreditDetail {
  creditId: number;
  amount: number;
  remainingAfter: number;
  status: VirtualCreditStatus;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Virtual Credit Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface IssueVirtualCreditInput {
  phone: string;
  amount: number;
  expiryDays?: number;
  sourceType: VirtualCreditSource;
  sourceTicketId?: number;
  sourceNote?: string;
}

export interface IssueVirtualCreditResult {
  success: true;
  creditId: number;
  originalAmount: number;
  expiresAt: Date;
  newVirtualBalance: number;
  transactionId: bigint;
  transactionCode: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Query Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface GetWalletResult {
  wallet: Wallet;
  totalBalance: number;
  activeVirtualCredits: VirtualCredit[];
  recentTransactions: WalletTransaction[];
}

export interface TransactionHistoryQuery {
  phone: string;
  page?: number;
  limit?: number;
  type?: TransactionType;
  startDate?: Date;
  endDate?: Date;
}

export interface TransactionHistoryResult {
  transactions: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Types (for audit logging)
// ═══════════════════════════════════════════════════════════════════════════════

export interface WalletOperationContext {
  performedBy: number;
  performedByUsername: string;
  performedByRole: string;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
}
