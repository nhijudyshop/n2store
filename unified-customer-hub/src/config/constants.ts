// ═══════════════════════════════════════════════════════════════════════════════
// Application Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const TRANSACTION_TYPES = {
  DEPOSIT_BANK: 'DEPOSIT_BANK',
  DEPOSIT_RETURN: 'DEPOSIT_RETURN',
  DEPOSIT_ADJUSTMENT: 'DEPOSIT_ADJUSTMENT',
  WITHDRAW_ORDER: 'WITHDRAW_ORDER',
  WITHDRAW_REFUND: 'WITHDRAW_REFUND',
  WITHDRAW_ADJUSTMENT: 'WITHDRAW_ADJUSTMENT',
  VIRTUAL_CREDIT_ISSUE: 'VIRTUAL_CREDIT_ISSUE',
  VIRTUAL_CREDIT_USE: 'VIRTUAL_CREDIT_USE',
  VIRTUAL_CREDIT_EXPIRE: 'VIRTUAL_CREDIT_EXPIRE',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

export const TICKET_TYPES = {
  BOOM: 'BOOM',
  FIX_COD: 'FIX_COD',
  RETURN_CLIENT: 'RETURN_CLIENT',
  RETURN_SHIPPER: 'RETURN_SHIPPER',
  COMPLAINT: 'COMPLAINT',
  WARRANTY: 'WARRANTY',
  OTHER: 'OTHER',
} as const;

export type TicketType = (typeof TICKET_TYPES)[keyof typeof TICKET_TYPES];

export const TICKET_STATUS = {
  PENDING_GOODS: 'PENDING_GOODS',
  PENDING_FINANCE: 'PENDING_FINANCE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const CUSTOMER_STATUS = {
  ACTIVE: 'active',
  WARNING: 'warning',
  DANGER: 'danger',
  BLOCKED: 'blocked',
} as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS)[keyof typeof CUSTOMER_STATUS];

export const CUSTOMER_TIER = {
  NORMAL: 'normal',
  SILVER: 'silver',
  GOLD: 'gold',
  VIP: 'vip',
  BLACKLIST: 'blacklist',
} as const;

export type CustomerTier = (typeof CUSTOMER_TIER)[keyof typeof CUSTOMER_TIER];

export const VIRTUAL_CREDIT_STATUS = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type VirtualCreditStatus = (typeof VIRTUAL_CREDIT_STATUS)[keyof typeof VIRTUAL_CREDIT_STATUS];

export const VIRTUAL_CREDIT_SOURCE = {
  RETURN_SHIPPER: 'RETURN_SHIPPER',
  COMPENSATION: 'COMPENSATION',
  PROMOTION: 'PROMOTION',
  MANUAL: 'MANUAL',
} as const;

export type VirtualCreditSource = (typeof VIRTUAL_CREDIT_SOURCE)[keyof typeof VIRTUAL_CREDIT_SOURCE];

export const WALLET_ACTION = {
  CREDIT_REAL: 'CREDIT_REAL',
  CREDIT_VIRTUAL: 'CREDIT_VIRTUAL',
  NONE: 'NONE',
} as const;

export type WalletAction = (typeof WALLET_ACTION)[keyof typeof WALLET_ACTION];

export const MATCH_STATUS = {
  PENDING: 'PENDING',
  MATCHED: 'MATCHED',
  MULTIPLE: 'MULTIPLE',
  NOT_FOUND: 'NOT_FOUND',
  IGNORED: 'IGNORED',
} as const;

export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

export const AUDIT_ACTIONS = {
  // Wallet
  WALLET_DEPOSIT: 'WALLET_DEPOSIT',
  WALLET_WITHDRAW: 'WALLET_WITHDRAW',
  WALLET_ADJUST: 'WALLET_ADJUST',
  WALLET_FREEZE: 'WALLET_FREEZE',
  WALLET_UNFREEZE: 'WALLET_UNFREEZE',

  // Ticket
  TICKET_CREATE: 'TICKET_CREATE',
  TICKET_UPDATE: 'TICKET_UPDATE',
  TICKET_RECEIVE: 'TICKET_RECEIVE',
  TICKET_SETTLE: 'TICKET_SETTLE',
  TICKET_COMPLETE: 'TICKET_COMPLETE',
  TICKET_CANCEL: 'TICKET_CANCEL',

  // Customer
  CUSTOMER_CREATE: 'CUSTOMER_CREATE',
  CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
  CUSTOMER_BLOCK: 'CUSTOMER_BLOCK',
  CUSTOMER_UNBLOCK: 'CUSTOMER_UNBLOCK',

  // Virtual Credit
  VIRTUAL_CREDIT_ISSUE: 'VIRTUAL_CREDIT_ISSUE',
  VIRTUAL_CREDIT_USE: 'VIRTUAL_CREDIT_USE',
  VIRTUAL_CREDIT_EXPIRE: 'VIRTUAL_CREDIT_EXPIRE',
  VIRTUAL_CREDIT_CANCEL: 'VIRTUAL_CREDIT_CANCEL',

  // Bank Transaction
  BANK_TX_MATCH: 'BANK_TX_MATCH',
  BANK_TX_PROCESS: 'BANK_TX_PROCESS',
  BANK_TX_HIDE: 'BANK_TX_HIDE',

  // System
  CONFIG_UPDATE: 'CONFIG_UPDATE',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const ROLES = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  WAREHOUSE: 'WAREHOUSE',
  CSKH: 'CSKH',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// RFM Segments
export const RFM_SEGMENTS = {
  CHAMPIONS: 'Champions',
  LOYAL: 'Loyal',
  POTENTIAL_LOYALIST: 'Potential Loyalist',
  NEW_CUSTOMERS: 'New Customers',
  PROMISING: 'Promising',
  NEED_ATTENTION: 'Need Attention',
  ABOUT_TO_SLEEP: 'About to Sleep',
  AT_RISK: 'At Risk',
  CANT_LOSE: "Can't Lose",
  HIBERNATING: 'Hibernating',
  LOST: 'Lost',
} as const;

export type RFMSegment = (typeof RFM_SEGMENTS)[keyof typeof RFM_SEGMENTS];

// ═══════════════════════════════════════════════════════════════════════════════
// Ticket Type → Wallet Action Decision Matrix
// ═══════════════════════════════════════════════════════════════════════════════
export const TICKET_WALLET_ACTION_MAP: Record<TicketType, WalletAction> = {
  [TICKET_TYPES.BOOM]: WALLET_ACTION.CREDIT_REAL,
  [TICKET_TYPES.FIX_COD]: WALLET_ACTION.NONE,
  [TICKET_TYPES.RETURN_CLIENT]: WALLET_ACTION.CREDIT_REAL,
  [TICKET_TYPES.RETURN_SHIPPER]: WALLET_ACTION.CREDIT_VIRTUAL,
  [TICKET_TYPES.COMPLAINT]: WALLET_ACTION.NONE, // Depends on case
  [TICKET_TYPES.WARRANTY]: WALLET_ACTION.NONE,
  [TICKET_TYPES.OTHER]: WALLET_ACTION.NONE,
};
