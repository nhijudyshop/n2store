import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { walletController } from './wallet.controller.js';
import {
  depositBodySchema,
  depositParamsSchema,
  withdrawBodySchema,
  withdrawParamsSchema,
  issueVirtualCreditBodySchema,
  issueVirtualCreditParamsSchema,
  getWalletParamsSchema,
} from './wallet.schema.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// WALLET ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
//
// All routes require authentication (handled by auth middleware in app.ts)
// Permission checks should be added via RBAC middleware
//
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /wallets/:phone
 * Lấy thông tin chi tiết ví
 *
 * Permissions: wallet.read
 */
router.get(
  '/:phone',
  validate({ params: getWalletParamsSchema }),
  walletController.getWallet
);

/**
 * GET /wallets/:phone/balance
 * Lấy số dư nhanh (lightweight)
 *
 * Permissions: wallet.read
 */
router.get(
  '/:phone/balance',
  validate({ params: getWalletParamsSchema }),
  walletController.getBalance
);

/**
 * POST /wallets/:phone/deposit
 * Nạp tiền vào ví (Real Balance)
 *
 * Permissions: wallet.deposit
 *
 * Body:
 * - amount: number (required) - Số tiền nạp (> 0, <= 100 triệu)
 * - sourceType: 'bank_transfer' | 'ticket' | 'manual' (required)
 * - sourceId: string (optional) - ID nguồn (sepay_id, ticket_id)
 * - description: string (optional) - Mô tả giao dịch
 * - internalNote: string (optional) - Ghi chú nội bộ
 */
router.post(
  '/:phone/deposit',
  validate({
    params: depositParamsSchema,
    body: depositBodySchema,
  }),
  walletController.deposit
);

/**
 * POST /wallets/:phone/withdraw
 * Rút tiền/Thanh toán từ ví
 *
 * LOGIC: FIFO Virtual Credits
 * - Ưu tiên trừ tiền ảo sắp hết hạn trước
 * - Sau đó mới trừ tiền thực
 *
 * Permissions: wallet.withdraw
 *
 * Body:
 * - amount: number (required) - Số tiền rút (> 0, <= 100 triệu)
 * - orderId: string (required) - Mã đơn hàng
 * - description: string (optional) - Mô tả giao dịch
 */
router.post(
  '/:phone/withdraw',
  validate({
    params: withdrawParamsSchema,
    body: withdrawBodySchema,
  }),
  walletController.withdraw
);

/**
 * POST /wallets/:phone/virtual-credits
 * Cấp công nợ ảo
 *
 * Permissions: wallet.adjust
 *
 * Body:
 * - amount: number (required) - Số tiền công nợ ảo
 * - expiryDays: number (optional, default: 15) - Số ngày hết hạn
 * - sourceType: 'RETURN_SHIPPER' | 'COMPENSATION' | 'PROMOTION' | 'MANUAL' (required)
 * - sourceTicketId: number (optional) - ID ticket nguồn
 * - sourceNote: string (optional) - Ghi chú nguồn
 */
router.post(
  '/:phone/virtual-credits',
  validate({
    params: issueVirtualCreditParamsSchema,
    body: issueVirtualCreditBodySchema,
  }),
  walletController.issueVirtualCredit
);

export default router;
