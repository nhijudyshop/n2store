PHẦN 6: IMPLEMENTATION ROADMAP
6.1 Module Priority Order

┌─────────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION PRIORITY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 0: FOUNDATION (Week 1-2)                                        ║  │
│  ║  ═══════════════════════════════                                       ║  │
│  ║                                                                        ║  │
│  ║  [0.1] Database Setup                                                  ║  │
│  ║        ├─ Create all tables (DDL from Section 2)                       ║  │
│  ║        ├─ Insert default configs                                       ║  │
│  ║        ├─ Create indexes                                               ║  │
│  ║        └─ Test phone normalization function                            ║  │
│  ║                                                                        ║  │
│  ║  [0.2] Auth & User Management                                          ║  │
│  ║        ├─ Implement JWT authentication                                 ║  │
│  ║        ├─ Create default users (admin, accountant, warehouse, cskh)    ║  │
│  ║        └─ Implement RBAC middleware                                    ║  │
│  ║                                                                        ║  │
│  ║  [0.3] Core API Structure                                              ║  │
│  ║        ├─ Express.js setup with TypeScript                             ║  │
│  ║        ├─ Error handling middleware                                    ║  │
│  ║        ├─ Request validation (Zod)                                     ║  │
│  ║        └─ Audit logging middleware                                     ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 1: CORE CUSTOMER & WALLET (Week 3-4)                            ║  │
│  ║  ══════════════════════════════════════════                            ║  │
│  ║                                                                        ║  │
│  ║  [1.1] Customer CRUD APIs                                              ║  │
│  ║        ├─ POST /api/customers (create)                                 ║  │
│  ║        ├─ GET /api/customers/:phone (360° view)                        ║  │
│  ║        ├─ PUT /api/customers/:phone (update)                           ║  │
│  ║        └─ POST /api/customers/search                                   ║  │
│  ║                                                                        ║  │
│  ║  [1.2] Wallet Core APIs ⭐ CRITICAL                                    ║  │
│  ║        ├─ GET /api/wallets/:phone                                      ║  │
│  ║        ├─ POST /api/wallets/:phone/deposit                             ║  │
│  ║        ├─ POST /api/wallets/:phone/withdraw (FIFO algorithm)           ║  │
│  ║        ├─ POST /api/wallets/:phone/virtual-credit                      ║  │
│  ║        └─ Implement atomic transactions (FOR UPDATE)                   ║  │
│  ║                                                                        ║  │
│  ║  [1.3] Customer 360 Frontend                                           ║  │
│  ║        ├─ Customer list page                                           ║  │
│  ║        ├─ Customer detail page (360° view)                             ║  │
│  ║        └─ Wallet panel component                                       ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 2: TICKETS & BANK INTEGRATION (Week 5-6)                        ║  │
│  ║  ═══════════════════════════════════════════════                       ║  │
│  ║                                                                        ║  │
│  ║  [2.1] Ticket CRUD APIs                                                ║  │
│  ║        ├─ POST /api/tickets (create with auto-wallet-credit)           ║  │
│  ║        ├─ GET /api/tickets (list with filters)                         ║  │
│  ║        ├─ PUT /api/tickets/:id                                         ║  │
│  ║        └─ POST /api/tickets/:id/action (receive, settle, complete)     ║  │
│  ║                                                                        ║  │
│  ║  [2.2] Bank Transaction Processing (SePay)                             ║  │
│  ║        ├─ POST /api/sepay/webhook (receive from SePay)                 ║  │
│  ║        ├─ Phone extraction logic                                       ║  │
│  ║        ├─ Customer matching (exact, partial, QR code)                  ║  │
│  ║        ├─ GET /api/bank-transactions (list)                            ║  │
│  ║        └─ POST /api/bank-transactions/:id/process (credit to wallet)  ║  │
│  ║                                                                        ║  │
│  ║  [2.3] Ticket Frontend                                                 ║  │
│  ║        ├─ Ticket list page (by status tabs)                            ║  │
│  ║        ├─ Create ticket form                                           ║  │
│  ║        └─ Ticket detail & actions                                      ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 3: AUTOMATION & CRON JOBS (Week 7)                              ║  │
│  ║  ════════════════════════════════════════                              ║  │
│  ║                                                                        ║  │
│  ║  [3.1] Scheduled Jobs                                                  ║  │
│  ║        ├─ Virtual credit expiry job (hourly)                           ║  │
│  ║        ├─ Carrier deadline check job (daily)                           ║  │
│  ║        ├─ RFM calculation job (weekly)                                 ║  │
│  ║        └─ QR code cleanup job (daily)                                  ║  │
│  ║                                                                        ║  │
│  ║  [3.2] Activity Timeline                                               ║  │
│  ║        ├─ Auto-log all activities                                      ║  │
│  ║        └─ Timeline UI component                                        ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 4: SECURITY & FRAUD DETECTION (Week 8)                          ║  │
│  ║  ════════════════════════════════════════════                          ║  │
│  ║                                                                        ║  │
│  ║  [4.1] Fraud Detection                                                 ║  │
│  ║        ├─ Implement fraud scoring algorithm                            ║  │
│  ║        ├─ Self-dealing detection                                       ║  │
│  ║        └─ Alert system for suspicious activities                       ║  │
│  ║                                                                        ║  │
│  ║  [4.2] Two-Person Approval                                             ║  │
│  ║        ├─ Pending approvals table                                      ║  │
│  ║        └─ Approval workflow for high-value transactions                ║  │
│  ║                                                                        ║  │
│  ║  [4.3] Audit Dashboard                                                 ║  │
│  ║        ├─ Audit log viewer                                             ║  │
│  ║        └─ Suspicious activity report                                   ║  │
│  ║                                                                        ║  │
│  
API Error: Claude's response exceeded the 32000 output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable.

Tiếp tục từ PHASE 4...

6.1 Module Priority Order (Tiếp theo)

│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 4: SECURITY & FRAUD DETECTION (Week 8) - Tiếp                   ║  │
│  ║  ════════════════════════════════════════════                          ║  │
│  ║                                                                        ║  │
│  ║  [4.3] Audit Dashboard                                                 ║  │
│  ║        ├─ Audit log viewer (filter by user, action, date)              ║  │
│  ║        └─ Suspicious activity report                                   ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 5: QR CODE & BANK HISTORY (Week 9)                              ║  │
│  ║  ════════════════════════════════════════                              ║  │
│  ║                                                                        ║  │
│  ║  [5.1] QR Code Management                                              ║  │
│  ║        ├─ Generate unique QR codes (N2 prefix)                         ║  │
│  ║        ├─ Link QR to customer                                          ║  │
│  ║        └─ Auto-match bank transactions to QR                           ║  │
│  ║                                                                        ║  │
│  ║  [5.2] Bank History UI (Balance History replacement)                   ║  │
│  ║        ├─ Transaction list with filters                                ║  │
│  ║        ├─ Customer matching UI                                         ║  │
│  ║        └─ Bulk processing                                              ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                              │                                               │
│                              ▼                                               │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║  PHASE 6: REPORTS & POLISH (Week 10)                                   ║  │
│  ║  ═══════════════════════════════════                                   ║  │
│  ║                                                                        ║  │
│  ║  [6.1] Reports                                                         ║  │
│  ║        ├─ Daily wallet summary                                         ║  │
│  ║        ├─ Ticket statistics                                            ║  │
│  ║        └─ Customer RFM report                                          ║  │
│  ║                                                                        ║  │
│  ║  [6.2] Polish & Testing                                                ║  │
│  ║        ├─ End-to-end testing                                           ║  │
│  ║        ├─ Performance optimization                                     ║  │
│  ║        └─ Documentation                                                ║  │
│  ║                                                                        ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
6.2 Project Structure (Node.js/Express + TypeScript)

unified-customer-hub/
│
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── prisma/                          # Database ORM
│   ├── schema.prisma                # Prisma schema (từ DDL ở Section 2)
│   └── migrations/
│
├── src/
│   ├── index.ts                     # Entry point
│   ├── app.ts                       # Express app setup
│   │
│   ├── config/
│   │   ├── database.ts              # PostgreSQL connection
│   │   ├── env.ts                   # Environment variables
│   │   └── constants.ts             # App constants
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts       # JWT verification
│   │   ├── rbac.middleware.ts       # Permission check
│   │   ├── audit.middleware.ts      # Auto audit logging
│   │   ├── error.middleware.ts      # Global error handler
│   │   └── validate.middleware.ts   # Zod validation
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.schema.ts       # Zod schemas
│   │   │
│   │   ├── customer/
│   │   │   ├── customer.controller.ts
│   │   │   ├── customer.service.ts
│   │   │   ├── customer.routes.ts
│   │   │   ├── customer.schema.ts
│   │   │   └── customer.types.ts
│   │   │
│   │   ├── wallet/                  # ⭐ CORE MODULE
│   │   │   ├── wallet.controller.ts
│   │   │   ├── wallet.service.ts    # Deposit, Withdraw (FIFO), VirtualCredit
│   │   │   ├── wallet.routes.ts
│   │   │   ├── wallet.schema.ts
│   │   │   ├── wallet.types.ts
│   │   │   └── wallet.utils.ts      # FIFO algorithm
│   │   │
│   │   ├── ticket/
│   │   │   ├── ticket.controller.ts
│   │   │   ├── ticket.service.ts
│   │   │   ├── ticket.routes.ts
│   │   │   ├── ticket.schema.ts
│   │   │   └── ticket.types.ts
│   │   │
│   │   ├── bank-transaction/
│   │   │   ├── bank-tx.controller.ts
│   │   │   ├── bank-tx.service.ts
│   │   │   ├── bank-tx.routes.ts
│   │   │   ├── phone-extractor.ts   # Extract phone from content
│   │   │   └── customer-matcher.ts  # Match to customer
│   │   │
│   │   ├── activity/
│   │   │   ├── activity.controller.ts
│   │   │   ├── activity.service.ts
│   │   │   └── activity.routes.ts
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.controller.ts
│   │   │   ├── audit.service.ts
│   │   │   └── audit.routes.ts
│   │   │
│   │   └── system-config/
│   │       ├── config.controller.ts
│   │       ├── config.service.ts
│   │       └── config.routes.ts
│   │
│   ├── jobs/                        # Cron Jobs
│   │   ├── job-runner.ts            # Job scheduler (node-cron)
│   │   ├── expire-virtual-credits.job.ts
│   │   ├── check-carrier-deadline.job.ts
│   │   ├── calculate-rfm.job.ts
│   │   └── fraud-detection.job.ts
│   │
│   ├── utils/
│   │   ├── phone-normalizer.ts      # normalize_phone() logic
│   │   ├── currency-formatter.ts
│   │   ├── date-utils.ts
│   │   └── logger.ts
│   │
│   └── types/
│       ├── express.d.ts             # Extend Express types
│       └── global.d.ts
│
├── tests/
│   ├── unit/
│   │   ├── wallet.service.test.ts
│   │   └── phone-normalizer.test.ts
│   └── integration/
│       ├── wallet-flow.test.ts
│       └── ticket-flow.test.ts
│
└── frontend/                        # Separate folder or monorepo
    ├── customer-hub/
    │   ├── index.html
    │   ├── customer-detail.html
    │   ├── js/
    │   │   ├── main.js
    │   │   ├── api-service.js
    │   │   ├── customer-service.js
    │   │   ├── wallet-panel.js
    │   │   ├── ticket-panel.js
    │   │   └── activity-timeline.js
    │   │
    │   └── css/
    │       └── styles.css
    │
    ├── bank-history/
    │   ├── index.html
    │   └── js/
    │
    └── shared/
        ├── auth.js
        ├── api-config.js
        └── components/

6.3 API Gateway Architecture (CRITICAL)

All client-side API requests MUST go through the Cloudflare Worker Proxy to bypass CORS issues.
- **Proxy URL Base:** `https://chatomni-proxy.nhijudyshop.workers.dev`

**Route Mapping:**
- `/api/sepay/*` → Render Backend `/api/sepay/*`
- `/api/customers/*` → Render Backend `/api/customers/*`
- `/api/wallets/*` → Render Backend `/api/wallets/*`
- `/api/tickets/*` → Render Backend `/api/tickets/*`
- `/api/bank-transactions/*` → Render Backend `/api/bank-transactions/*`
- `/api/deepseek/*` → Render Backend `/api/deepseek/*` (hoặc trực tiếp DeepSeek API)
- `/api/gemini/*` → Render Backend `/api/gemini/*`
- `/api/odata/*` → TPOS OData API `tomato.tpos.vn/odata/*`
- `/api/token` → TPOS Token API `tomato.tpos.vn/token` (with caching)
- `/api/pancake/*` → Pancake API `pancake.vn/api/v1/*`
- `/api/pancake-direct/*` → Pancake API (24h bypass)
- `/api/facebook-send` → Facebook Graph API

**Important:** Frontend clients must NEVER call `https://n2store-fallback.onrender.com` or `https://tomato.tpos.vn` directly. Always use the Cloudflare Worker Proxy.

unified-customer-hub/
│
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── prisma/                          # Database ORM
│   ├── schema.prisma                # Prisma schema (từ DDL ở Section 2)
│   └── migrations/
│
├── src/
│   ├── index.ts                     # Entry point
│   ├── app.ts                       # Express app setup
│   │
│   ├── config/
│   │   ├── database.ts              # PostgreSQL connection
│   │   ├── env.ts                   # Environment variables
│   │   └── constants.ts             # App constants
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts       # JWT verification
│   │   ├── rbac.middleware.ts       # Permission check
│   │   ├── audit.middleware.ts      # Auto audit logging
│   │   ├── error.middleware.ts      # Global error handler
│   │   └── validate.middleware.ts   # Zod validation
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.schema.ts       # Zod schemas
│   │   │
│   │   ├── customer/
│   │   │   ├── customer.controller.ts
│   │   │   ├── customer.service.ts
│   │   │   ├── customer.routes.ts
│   │   │   ├── customer.schema.ts
│   │   │   └── customer.types.ts
│   │   │
│   │   ├── wallet/                  # ⭐ CORE MODULE
│   │   │   ├── wallet.controller.ts
│   │   │   ├── wallet.service.ts    # Deposit, Withdraw (FIFO), VirtualCredit
│   │   │   ├── wallet.routes.ts
│   │   │   ├── wallet.schema.ts
│   │   │   ├── wallet.types.ts
│   │   │   └── wallet.utils.ts      # FIFO algorithm
│   │   │
│   │   ├── ticket/
│   │   │   ├── ticket.controller.ts
│   │   │   ├── ticket.service.ts
│   │   │   ├── ticket.routes.ts
│   │   │   ├── ticket.schema.ts
│   │   │   └── ticket.types.ts
│   │   │
│   │   ├── bank-transaction/
│   │   │   ├── bank-tx.controller.ts
│   │   │   ├── bank-tx.service.ts
│   │   │   ├── bank-tx.routes.ts
│   │   │   ├── phone-extractor.ts   # Extract phone from content
│   │   │   └── customer-matcher.ts  # Match to customer
│   │   │
│   │   ├── activity/
│   │   │   ├── activity.controller.ts
│   │   │   ├── activity.service.ts
│   │   │   └── activity.routes.ts
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.controller.ts
│   │   │   ├── audit.service.ts
│   │   │   └── audit.routes.ts
│   │   │
│   │   └── system-config/
│   │       ├── config.controller.ts
│   │       ├── config.service.ts
│   │       └── config.routes.ts
│   │
│   ├── jobs/                        # Cron Jobs
│   │   ├── job-runner.ts            # Job scheduler (node-cron)
│   │   ├── expire-virtual-credits.job.ts
│   │   ├── check-carrier-deadline.job.ts
│   │   ├── calculate-rfm.job.ts
│   │   └── fraud-detection.job.ts
│   │
│   ├── utils/
│   │   ├── phone-normalizer.ts      # normalize_phone() logic
│   │   ├── currency-formatter.ts
│   │   ├── date-utils.ts
│   │   └── logger.ts
│   │
│   └── types/
│       ├── express.d.ts             # Extend Express types
│       └── global.d.ts
│
├── tests/
│   ├── unit/
│   │   ├── wallet.service.test.ts
│   │   └── phone-normalizer.test.ts
│   └── integration/
│       ├── wallet-flow.test.ts
│       └── ticket-flow.test.ts
│
└── frontend/                        # Separate folder or monorepo
    ├── customer-hub/
    │   ├── index.html
    │   ├── customer-detail.html
    │   ├── js/
    │   │   ├── main.js
    │   │   ├── api-service.js
    │   │   ├── customer-service.js
    │   │   ├── wallet-panel.js
    │   │   ├── ticket-panel.js
    │   │   └── activity-timeline.js
    │   └── css/
    │       └── styles.css
    │
    ├── bank-history/
    │   ├── index.html
    │   └── js/
    │
    └── shared/
        ├── auth.js
        ├── api-config.js
        └── components/
6.3 Key Implementation Files
A. Wallet Service (Core Logic)

// src/modules/wallet/wallet.service.ts

import { PrismaClient, Prisma } from '@prisma/client';
import { WalletError } from './wallet.errors';
import { getConfig } from '../system-config/config.service';
import { createAuditLog } from '../audit/audit.service';
import { createActivity } from '../activity/activity.service';

const prisma = new PrismaClient();

interface WithdrawResult {
  virtualUsed: number;
  realUsed: number;
  totalUsed: number;
  usedCredits: { creditId: number; amount: number }[];
  newRealBalance: number;
  newVirtualBalance: number;
  transactionIds: number[];
}

/**
 * Withdraw from wallet using FIFO for virtual credits
 * This is the CORE algorithm for the entire system
 */
export async function withdrawFromWallet(
  phone: string,
  amount: number,
  orderId: string,
  performedBy: number,
  ipAddress: string
): Promise<WithdrawResult> {
  
  // Use Prisma transaction with serializable isolation
  return await prisma.$transaction(async (tx) => {
    
    // 1. Lock wallet
    const wallet = await tx.wallets.findUnique({
      where: { phone },
    });
    
    if (!wallet) {
      throw new WalletError('WALLET_NOT_FOUND', 'Ví không tồn tại');
    }
    
    if (wallet.is_frozen) {
      throw new WalletError('WALLET_FROZEN', 'Ví đã bị đóng băng');
    }
    
    const totalAvailable = Number(wallet.real_balance) + Number(wallet.virtual_balance);
    if (amount > totalAvailable) {
      throw new WalletError(
        'INSUFFICIENT_BALANCE',
        `Số dư không đủ (Có: ${totalAvailable}, Cần: ${amount})`
      );
    }
    
    // 2. Get active virtual credits (FIFO by expires_at)
    const activeCredits = await tx.virtual_credits.findMany({
      where: {
        phone,
        status: 'ACTIVE',
        expires_at: { gt: new Date() },
        remaining_amount: { gt: 0 }
      },
      orderBy: { expires_at: 'asc' }
    });
    
    // 3. Calculate deductions
    let remaining = amount;
    let virtualUsed = 0;
    let realUsed = 0;
    const usedCredits: { creditId: number; amount: number }[] = [];
    
    // Deduct from virtual credits first (FIFO)
    for (const credit of activeCredits) {
      if (remaining <= 0) break;
      
      const creditRemaining = Number(credit.remaining_amount);
      const useFromCredit = Math.min(creditRemaining, remaining);
      const newCreditRemaining = creditRemaining - useFromCredit;
      const newStatus = newCreditRemaining <= 0 ? 'USED' : 'ACTIVE';
      
      // Update credit
      const currentUsageHistory = (credit.usage_history as any[]) || [];
      currentUsageHistory.push({
        order_id: orderId,
        amount: useFromCredit,
        used_at: new Date().toISOString()
      });
      
      await tx.virtual_credits.update({
        where: { id: credit.id },
        data: {
          remaining_amount: newCreditRemaining,
          status: newStatus,
          usage_history: currentUsageHistory,
          updated_at: new Date()
        }
      });
      
      usedCredits.push({ creditId: credit.id, amount: useFromCredit });
      virtualUsed += useFromCredit;
      remaining -= useFromCredit;
    }
    
    // Deduct from real balance
    if (remaining > 0) {
      realUsed = remaining;
      remaining = 0;
    }
    
    // 4. Update wallet balances
    const newRealBalance = Number(wallet.real_balance) - realUsed;
    const newVirtualBalance = Number(wallet.virtual_balance) - virtualUsed;
    
    await tx.wallets.update({
      where: { phone },
      data: {
        real_balance: newRealBalance,
        virtual_balance: newVirtualBalance,
        total_withdrawn: { increment: realUsed },
        total_virtual_used: { increment: virtualUsed },
        updated_at: new Date()
      }
    });
    
    // 5. Create transaction logs
    const transactionIds: number[] = [];
    
    if (virtualUsed > 0) {
      const vtx = await tx.wallet_transactions.create({
        data: {
          wallet_id: wallet.id,
          phone,
          transaction_type: 'VIRTUAL_CREDIT_USE',
          amount: virtualUsed,
          real_balance_before: wallet.real_balance,
          real_balance_after: newRealBalance,
          virtual_balance_before: wallet.virtual_balance,
          virtual_balance_after: newVirtualBalance,
          source_type: 'order',
          source_id: orderId,
          description: `Trừ công nợ ảo - Đơn ${orderId}`,
          created_by: performedBy
        }
      });
      transactionIds.push(vtx.id);
    }
    
    if (realUsed > 0) {
      const rtx = await tx.wallet_transactions.create({
        data: {
          wallet_id: wallet.id,
          phone,
          transaction_type: 'WITHDRAW_ORDER',
          amount: realUsed,
          real_balance_before: wallet.real_balance,
          real_balance_after: newRealBalance,
          virtual_balance_before: wallet.virtual_balance,
          virtual_balance_after: newVirtualBalance,
          source_type: 'order',
          source_id: orderId,
          description: `Trừ số dư thực - Đơn ${orderId}`,
          created_by: performedBy
        }
      });
      transactionIds.push(rtx.id);
    }
    
    // 6. Create activity log
    await tx.customer_activities.create({
      data: {
        customer_id: wallet.customer_id,
        phone,
        activity_type: 'WALLET_WITHDRAW',
        title: `Sử dụng ví ${formatCurrency(virtualUsed + realUsed)} cho đơn hàng`,
        description: `Virtual: ${formatCurrency(virtualUsed)}, Real: ${formatCurrency(realUsed)}`,
        reference_type: 'order',
        reference_id: orderId,
        metadata: { virtualUsed, realUsed, usedCredits },
        icon: 'money-bill',
        color: 'orange',
        created_by: performedBy
      }
    });
    
    // 7. Create audit log
    await tx.audit_logs.create({
      data: {
        action: 'WALLET_WITHDRAW',
        entity_type: 'wallet',
        entity_id: wallet.id.toString(),
        entity_phone: phone,
        old_value: {
          real_balance: Number(wallet.real_balance),
          virtual_balance: Number(wallet.virtual_balance)
        },
        new_value: {
          real_balance: newRealBalance,
          virtual_balance: newVirtualBalance
        },
        description: `Withdraw ${amount} for order ${orderId}`,
        performed_by: performedBy,
        ip_address: ipAddress
      }
    });
    
    return {
      virtualUsed,
      realUsed,
      totalUsed: virtualUsed + realUsed,
      usedCredits,
      newRealBalance,
      newVirtualBalance,
      transactionIds
    };
    
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount);
}
B. Phone Normalizer Utility

// src/utils/phone-normalizer.ts

export class PhoneNormalizationError extends Error {
  constructor(public originalPhone: string, message: string) {
    super(message);
    this.name = 'PhoneNormalizationError';
  }
}

/**
 * Normalize Vietnamese phone number to standard format: 0xxxxxxxxx
 * 
 * Accepted inputs:
 * - 0901234567
 * - 84901234567
 * - +84901234567
 * - 901234567 (auto-add leading 0)
 * 
 * Output: 0901234567 (10-11 digits starting with 0)
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input || input.trim() === '') {
    throw new PhoneNormalizationError(input || '', 'Phone number is required');
  }
  
  // Remove all non-digit characters
  let cleaned = input.replace(/\D/g, '');
  
  // Handle +84 or 84 prefix
  if (cleaned.startsWith('84') && cleaned.length >= 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  
  // Add leading 0 if missing
  if (!cleaned.startsWith('0') && cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }
  
  // Validate final format
  if (!/^0[0-9]{9,10}$/.test(cleaned)) {
    throw new PhoneNormalizationError(
      input,
      `Invalid phone format. Expected 10-11 digits starting with 0, got: ${cleaned}`
    );
  }
  
  return cleaned;
}

/**
 * Try to normalize, return null if invalid (for soft matching)
 */
export function tryNormalizePhone(input: string | null | undefined): string | null {
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}

/**
 * Extract potential phone numbers from text content (for bank transaction matching)
 */
export function extractPhonesFromContent(content: string): string[] {
  const phones: string[] = [];
  
  // Pattern 1: 10-11 consecutive digits
  const digitMatches = content.match(/\d{10,11}/g) || [];
  for (const match of digitMatches) {
    const normalized = tryNormalizePhone(match);
    if (normalized) phones.push(normalized);
  }
  
  // Pattern 2: 9 digits (missing leading 0)
  const shortMatches = content.match(/\d{9}/g) || [];
  for (const match of shortMatches) {
    const normalized = tryNormalizePhone('0' + match);
    if (normalized && !phones.includes(normalized)) {
      phones.push(normalized);
    }
  }
  
  return phones;
}
C. RBAC Middleware

// src/middleware/rbac.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Resource = 'customer' | 'wallet' | 'ticket' | 'bank_tx' | 'report' | 'system';
type Action = 'create' | 'read' | 'update' | 'delete' | 'deposit' | 'withdraw' | 
              'adjust' | 'freeze' | 'audit' | 'receive' | 'settle' | 'complete' | 
              'cancel' | 'match' | 'process' | 'hide' | 'view' | 'export' | 'config' | 'users';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    permissions: Record<Resource, Action[]>;
  };
}

/**
 * Check if user has permission to perform action on resource
 */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Vui lòng đăng nhập để tiếp tục'
        });
      }
      
      const permissions = user.permissions[resource] || [];
      
      // Admin has all permissions
      if (user.role === 'ADMIN') {
        return next();
      }
      
      if (!permissions.includes(action)) {
        // Log unauthorized access attempt
        await prisma.audit_logs.create({
          data: {
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            entity_type: resource,
            description: `User ${user.username} attempted ${action} on ${resource}`,
            performed_by: user.id,
            performed_by_username: user.username,
            performed_by_role: user.role,
            ip_address: req.ip,
            is_suspicious: true,
            fraud_score: 30
          }
        });
        
        return res.status(403).json({
          success: false,
          error: 'PERMISSION_DENIED',
          message: `Bạn không có quyền ${getActionLabel(action)} ${getResourceLabel(resource)}`
        });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

function getActionLabel(action: Action): string {
  const labels: Record<Action, string> = {
    create: 'tạo mới',
    read: 'xem',
    update: 'cập nhật',
    delete: 'xóa',
    deposit: 'nạp tiền',
    withdraw: 'rút tiền',
    adjust: 'điều chỉnh',
    freeze: 'đóng băng',
    audit: 'xem audit log',
    receive: 'xác nhận nhận hàng',
    settle: 'đối soát',
    complete: 'hoàn tất',
    cancel: 'hủy',
    match: 'ghép khách hàng',
    process: 'xử lý',
    hide: 'ẩn',
    view: 'xem',
    export: 'xuất file',
    config: 'cấu hình',
    users: 'quản lý user'
  };
  return labels[action] || action;
}

function getResourceLabel(resource: Resource): string {
  const labels: Record<Resource, string> = {
    customer: 'khách hàng',
    wallet: 'ví tiền',
    ticket: 'sự vụ',
    bank_tx: 'giao dịch ngân hàng',
    report: 'báo cáo',
    system: 'hệ thống'
  };
  return labels[resource] || resource;
}
6.4 Environment Variables

# .env.example

# Database (Render PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# JWT
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="8h"

# SePay Webhook
SEPAY_WEBHOOK_SECRET="sepay-webhook-secret-for-signature-verification"
SEPAY_ALLOWED_IPS="1.2.3.4,5.6.7.8"

# App
NODE_ENV="production"
PORT=3000
FRONTEND_URL="https://your-frontend.com"

# Fraud Detection
FRAUD_ALERT_WEBHOOK="https://your-slack-or-discord-webhook"
FRAUD_ALERT_EMAIL="admin@example.com"

# Cron Jobs
CRON_ENABLED=true
6.5 Summary Checklist

┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION CHECKLIST                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ = Required  ⭐ = Critical  🔒 = Security                                 │
│                                                                              │
│  PHASE 0: FOUNDATION                                                         │
│  □ ✅ Create PostgreSQL database on Render                                  │
│  □ ✅ Run DDL scripts (all tables from Section 2)                           │
│  □ ⭐ Test normalize_phone() function                                       │
│  □ 🔒 Setup JWT authentication                                              │
│  □ 🔒 Create RBAC roles and permissions                                     │
│  □ ✅ Setup audit logging middleware                                        │
│                                                                              │
│  PHASE 1: CORE CUSTOMER & WALLET                                             │
│  □ ✅ Customer CRUD APIs                                                    │
│  □ ⭐ Wallet deposit API (with atomic transaction)                          │
│  □ ⭐ Wallet withdraw API (FIFO virtual credits)                            │
│  □ ⭐ Virtual credit issue API                                              │
│  □ ✅ Customer 360 frontend page                                            │
│  □ ✅ Wallet panel component                                                │
│                                                                              │
│  PHASE 2: TICKETS & BANK                                                     │
│  □ ✅ Ticket CRUD APIs                                                      │
│  □ ⭐ Ticket → Wallet integration (auto-credit on complete)                 │
│  □ ✅ SePay webhook receiver                                                │
│  □ ⭐ Phone extraction from bank content                                    │
│  □ ✅ Customer matching (QR, exact, partial)                                │
│  □ ✅ Bank transaction UI                                                   │
│                                                                              │
│  PHASE 3: AUTOMATION                                                         │
│  □ ⭐ Virtual credit expiry cron job                                        │
│  □ ✅ Carrier deadline check cron job                                       │
│  □ ✅ RFM calculation cron job                                              │
│  □ ✅ Activity timeline component                                           │
│                                                                              │
│  PHASE 4: SECURITY                                                           │
│  □ 🔒 Fraud scoring algorithm                                               │
│  □ 🔒 Self-dealing detection                                                │
│  □ 🔒 Two-person approval for high-value transactions                       │
│  □ 🔒 Audit dashboard                                                       │
│                                                                              │
│  PHASE 5: QR & BANK HISTORY                                                  │
│  □ ✅ QR code generation (N2 prefix)                                        │
│  □ ✅ QR → Customer linking                                                 │
│  □ ✅ Bank history UI replacement                                           │
│                                                                              │
│  PHASE 6: POLISH                                                             │
│  □ ✅ Reports (wallet, ticket, RFM)                                         │
│  □ ✅ End-to-end testing                                                    │
│  □ ✅ Documentation                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘