import { z } from 'zod';
import { TRANSACTION_TYPES, VIRTUAL_CREDIT_SOURCE } from '../../config/constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Phone Validation Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const phoneSchema = z
  .string()
  .min(1, 'Số điện thoại không được để trống')
  .regex(/^0[0-9]{9,10}$/, 'Số điện thoại phải bắt đầu bằng 0 và có 10-11 số');

// ═══════════════════════════════════════════════════════════════════════════════
// Amount Validation Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const amountSchema = z
  .number()
  .positive('Số tiền phải lớn hơn 0')
  .max(100_000_000, 'Số tiền không được vượt quá 100 triệu VND');

// ═══════════════════════════════════════════════════════════════════════════════
// Deposit Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const depositBodySchema = z.object({
  amount: amountSchema,
  sourceType: z.enum(['bank_transfer', 'ticket', 'manual']),
  sourceId: z.string().optional(),
  description: z.string().max(500).optional(),
  internalNote: z.string().max(1000).optional(),
});

export const depositParamsSchema = z.object({
  phone: phoneSchema,
});

export type DepositBody = z.infer<typeof depositBodySchema>;
export type DepositParams = z.infer<typeof depositParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Withdraw Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const withdrawBodySchema = z.object({
  amount: amountSchema,
  orderId: z.string().min(1, 'Mã đơn hàng không được để trống'),
  description: z.string().max(500).optional(),
});

export const withdrawParamsSchema = z.object({
  phone: phoneSchema,
});

export type WithdrawBody = z.infer<typeof withdrawBodySchema>;
export type WithdrawParams = z.infer<typeof withdrawParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Issue Virtual Credit Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const issueVirtualCreditBodySchema = z.object({
  amount: amountSchema,
  expiryDays: z.number().int().min(1).max(365).optional().default(15),
  sourceType: z.enum([
    VIRTUAL_CREDIT_SOURCE.RETURN_SHIPPER,
    VIRTUAL_CREDIT_SOURCE.COMPENSATION,
    VIRTUAL_CREDIT_SOURCE.PROMOTION,
    VIRTUAL_CREDIT_SOURCE.MANUAL,
  ]),
  sourceTicketId: z.number().int().positive().optional(),
  sourceNote: z.string().max(500).optional(),
});

export const issueVirtualCreditParamsSchema = z.object({
  phone: phoneSchema,
});

export type IssueVirtualCreditBody = z.infer<typeof issueVirtualCreditBodySchema>;
export type IssueVirtualCreditParams = z.infer<typeof issueVirtualCreditParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Get Wallet Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const getWalletParamsSchema = z.object({
  phone: phoneSchema,
});

export type GetWalletParams = z.infer<typeof getWalletParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Transaction History Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const transactionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  type: z
    .enum([
      TRANSACTION_TYPES.DEPOSIT_BANK,
      TRANSACTION_TYPES.DEPOSIT_RETURN,
      TRANSACTION_TYPES.DEPOSIT_ADJUSTMENT,
      TRANSACTION_TYPES.WITHDRAW_ORDER,
      TRANSACTION_TYPES.WITHDRAW_REFUND,
      TRANSACTION_TYPES.WITHDRAW_ADJUSTMENT,
      TRANSACTION_TYPES.VIRTUAL_CREDIT_ISSUE,
      TRANSACTION_TYPES.VIRTUAL_CREDIT_USE,
      TRANSACTION_TYPES.VIRTUAL_CREDIT_EXPIRE,
    ])
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const transactionHistoryParamsSchema = z.object({
  phone: phoneSchema,
});

export type TransactionHistoryQuery = z.infer<typeof transactionHistoryQuerySchema>;
export type TransactionHistoryParams = z.infer<typeof transactionHistoryParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Freeze Wallet Schema
// ═══════════════════════════════════════════════════════════════════════════════

export const freezeWalletBodySchema = z.object({
  reason: z.string().min(1, 'Lý do đóng băng không được để trống').max(500),
});

export const freezeWalletParamsSchema = z.object({
  phone: phoneSchema,
});

export type FreezeWalletBody = z.infer<typeof freezeWalletBodySchema>;
export type FreezeWalletParams = z.infer<typeof freezeWalletParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Adjust Balance Schema (Manual adjustment by Admin/Accountant)
// ═══════════════════════════════════════════════════════════════════════════════

export const adjustBalanceBodySchema = z.object({
  amount: z.number().refine((val) => val !== 0, 'Số tiền điều chỉnh không được bằng 0'),
  type: z.enum(['add', 'subtract']),
  reason: z.string().min(1, 'Lý do điều chỉnh không được để trống').max(500),
  internalNote: z.string().max(1000).optional(),
});

export const adjustBalanceParamsSchema = z.object({
  phone: phoneSchema,
});

export type AdjustBalanceBody = z.infer<typeof adjustBalanceBodySchema>;
export type AdjustBalanceParams = z.infer<typeof adjustBalanceParamsSchema>;
