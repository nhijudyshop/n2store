// ═══════════════════════════════════════════════════════════════════════════════
// WALLET SERVICE UNIT TESTS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Bao gồm test Concurrency để chứng minh:
// - SELECT ... FOR UPDATE ngăn chặn Race Condition
// - Số dư luôn chính xác sau nhiều request đồng thời
//
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../src/config/database.js';
import { walletService } from '../../src/modules/wallet/wallet.service.js';
import { WalletError } from '../../src/modules/wallet/wallet.errors.js';
import type { WalletOperationContext } from '../../src/modules/wallet/wallet.types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_PHONE = '0901234567';
const TEST_PHONE_2 = '0909876543';

const mockContext: WalletOperationContext = {
  performedBy: 1,
  performedByUsername: 'test_user',
  performedByRole: 'ADMIN',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  requestId: 'test-request-id',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Setup & Teardown
// ═══════════════════════════════════════════════════════════════════════════════

async function setupTestCustomer(phone: string): Promise<void> {
  // Create test user if not exists
  await db.query(`
    INSERT INTO users (id, username, password_hash, role_id)
    VALUES (1, 'test_user', 'hash', 1)
    ON CONFLICT (id) DO NOTHING
  `);

  // Create test customer
  await db.query(`
    INSERT INTO customers (phone, name, status)
    VALUES ($1, 'Test Customer', 'active')
    ON CONFLICT (phone) DO UPDATE SET name = 'Test Customer'
  `, [phone]);

  // Reset wallet to 0
  await db.query(`
    UPDATE wallets
    SET real_balance = 0,
        virtual_balance = 0,
        total_deposited = 0,
        total_withdrawn = 0,
        total_virtual_issued = 0,
        total_virtual_used = 0,
        is_frozen = FALSE
    WHERE phone = $1
  `, [phone]);

  // Delete any existing virtual credits
  await db.query(`
    DELETE FROM virtual_credits WHERE phone = $1
  `, [phone]);
}

async function cleanupTestData(): Promise<void> {
  // Note: In real tests, we'd use a transaction and rollback
  // For simplicity, we just reset the test data
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Deposit
// ═══════════════════════════════════════════════════════════════════════════════

describe('WalletService.deposit', () => {
  beforeEach(async () => {
    await setupTestCustomer(TEST_PHONE);
  });

  it('should deposit successfully and increase real balance', async () => {
    const result = await walletService.deposit(
      {
        phone: TEST_PHONE,
        amount: 100000,
        sourceType: 'manual',
        description: 'Test deposit',
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.newRealBalance).toBe(100000);
    expect(result.newVirtualBalance).toBe(0);
    expect(result.totalBalance).toBe(100000);
    expect(result.transactionCode).toMatch(/^WT-\d{8}-\d{6}$/);
  });

  it('should accumulate deposits correctly', async () => {
    // First deposit
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 50000, sourceType: 'manual' },
      mockContext
    );

    // Second deposit
    const result = await walletService.deposit(
      { phone: TEST_PHONE, amount: 75000, sourceType: 'bank_transfer' },
      mockContext
    );

    expect(result.newRealBalance).toBe(125000);
    expect(result.totalBalance).toBe(125000);
  });

  it('should reject deposit with invalid amount', async () => {
    await expect(
      walletService.deposit(
        { phone: TEST_PHONE, amount: 0, sourceType: 'manual' },
        mockContext
      )
    ).rejects.toThrow(WalletError);

    await expect(
      walletService.deposit(
        { phone: TEST_PHONE, amount: -100, sourceType: 'manual' },
        mockContext
      )
    ).rejects.toThrow(WalletError);
  });

  it('should reject deposit to non-existent wallet', async () => {
    await expect(
      walletService.deposit(
        { phone: '0999999999', amount: 100000, sourceType: 'manual' },
        mockContext
      )
    ).rejects.toThrow(WalletError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Withdraw with FIFO Virtual Credits
// ═══════════════════════════════════════════════════════════════════════════════

describe('WalletService.withdraw (FIFO)', () => {
  beforeEach(async () => {
    await setupTestCustomer(TEST_PHONE);
  });

  it('should withdraw from real balance when no virtual credits', async () => {
    // Setup: deposit 200,000
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 200000, sourceType: 'manual' },
      mockContext
    );

    // Withdraw 100,000
    const result = await walletService.withdraw(
      { phone: TEST_PHONE, amount: 100000, orderId: 'ORDER-001' },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.virtualUsed).toBe(0);
    expect(result.realUsed).toBe(100000);
    expect(result.totalUsed).toBe(100000);
    expect(result.newRealBalance).toBe(100000);
    expect(result.newVirtualBalance).toBe(0);
  });

  it('should use virtual credits first (FIFO by expiry)', async () => {
    // Setup: deposit real balance
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 100000, sourceType: 'manual' },
      mockContext
    );

    // Issue 2 virtual credits with different expiry dates
    // Credit 1: expires in 5 days (should be used first)
    await walletService.issueVirtualCredit(
      {
        phone: TEST_PHONE,
        amount: 30000,
        expiryDays: 5,
        sourceType: 'RETURN_SHIPPER',
      },
      mockContext
    );

    // Credit 2: expires in 15 days (should be used second)
    await walletService.issueVirtualCredit(
      {
        phone: TEST_PHONE,
        amount: 50000,
        expiryDays: 15,
        sourceType: 'COMPENSATION',
      },
      mockContext
    );

    // Verify initial state
    const balanceBefore = await walletService.getBalance(TEST_PHONE);
    expect(balanceBefore.realBalance).toBe(100000);
    expect(balanceBefore.virtualBalance).toBe(80000); // 30k + 50k

    // Withdraw 60,000 - should use all of credit 1 (30k) and part of credit 2 (30k)
    const result = await walletService.withdraw(
      { phone: TEST_PHONE, amount: 60000, orderId: 'ORDER-002' },
      mockContext
    );

    expect(result.virtualUsed).toBe(60000);
    expect(result.realUsed).toBe(0);
    expect(result.usedCredits.length).toBe(2);

    // First credit should be fully used (status: USED)
    expect(result.usedCredits[0]!.amount).toBe(30000);
    expect(result.usedCredits[0]!.status).toBe('USED');

    // Second credit should be partially used (status: ACTIVE)
    expect(result.usedCredits[1]!.amount).toBe(30000);
    expect(result.usedCredits[1]!.remainingAfter).toBe(20000);
    expect(result.usedCredits[1]!.status).toBe('ACTIVE');

    expect(result.newVirtualBalance).toBe(20000);
    expect(result.newRealBalance).toBe(100000);
  });

  it('should use both virtual and real balance when virtual not enough', async () => {
    // Setup
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 100000, sourceType: 'manual' },
      mockContext
    );

    await walletService.issueVirtualCredit(
      {
        phone: TEST_PHONE,
        amount: 30000,
        expiryDays: 10,
        sourceType: 'PROMOTION',
      },
      mockContext
    );

    // Withdraw 80,000 (virtual: 30k, real: 50k)
    const result = await walletService.withdraw(
      { phone: TEST_PHONE, amount: 80000, orderId: 'ORDER-003' },
      mockContext
    );

    expect(result.virtualUsed).toBe(30000);
    expect(result.realUsed).toBe(50000);
    expect(result.totalUsed).toBe(80000);
    expect(result.newVirtualBalance).toBe(0);
    expect(result.newRealBalance).toBe(50000);
  });

  it('should reject withdrawal when insufficient balance', async () => {
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 50000, sourceType: 'manual' },
      mockContext
    );

    await expect(
      walletService.withdraw(
        { phone: TEST_PHONE, amount: 100000, orderId: 'ORDER-004' },
        mockContext
      )
    ).rejects.toThrow(WalletError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Concurrency Test (CRITICAL)
// ═══════════════════════════════════════════════════════════════════════════════
//
// This test proves that SELECT ... FOR UPDATE prevents Race Conditions
// by simulating 2 concurrent withdrawal requests
//
// ═══════════════════════════════════════════════════════════════════════════════

describe('WalletService Concurrency (Race Condition Prevention)', () => {
  beforeEach(async () => {
    await setupTestCustomer(TEST_PHONE);
  });

  it('should handle concurrent withdrawals correctly without race condition', async () => {
    // Setup: deposit 100,000
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 100000, sourceType: 'manual' },
      mockContext
    );

    // Verify initial balance
    const initialBalance = await walletService.getBalance(TEST_PHONE);
    expect(initialBalance.totalBalance).toBe(100000);

    // Simulate 2 concurrent withdraw requests for 60,000 each
    // Without proper locking, both would read balance = 100,000
    // and both would succeed, resulting in -20,000 (WRONG!)
    //
    // With SELECT ... FOR UPDATE:
    // - First request locks the row, withdraws 60,000 → balance = 40,000
    // - Second request waits, then sees balance = 40,000, fails (insufficient)

    const withdraw1Promise = walletService.withdraw(
      { phone: TEST_PHONE, amount: 60000, orderId: 'CONCURRENT-001' },
      { ...mockContext, requestId: 'req-1' }
    );

    const withdraw2Promise = walletService.withdraw(
      { phone: TEST_PHONE, amount: 60000, orderId: 'CONCURRENT-002' },
      { ...mockContext, requestId: 'req-2' }
    );

    // Execute both concurrently
    const results = await Promise.allSettled([withdraw1Promise, withdraw2Promise]);

    // One should succeed, one should fail
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // The failure should be due to insufficient balance
    const failureResult = failures[0] as PromiseRejectedResult;
    expect(failureResult.reason).toBeInstanceOf(WalletError);
    expect(failureResult.reason.walletErrorCode).toBe('INSUFFICIENT_BALANCE');

    // Final balance should be exactly 40,000 (100,000 - 60,000)
    const finalBalance = await walletService.getBalance(TEST_PHONE);
    expect(finalBalance.realBalance).toBe(40000);
    expect(finalBalance.totalBalance).toBe(40000);
  });

  it('should handle many concurrent deposits correctly', async () => {
    // Simulate 10 concurrent deposits of 10,000 each
    const depositPromises = Array.from({ length: 10 }, (_, i) =>
      walletService.deposit(
        { phone: TEST_PHONE, amount: 10000, sourceType: 'manual' },
        { ...mockContext, requestId: `deposit-${i}` }
      )
    );

    const results = await Promise.allSettled(depositPromises);

    // All should succeed
    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes.length).toBe(10);

    // Final balance should be exactly 100,000 (10 x 10,000)
    const finalBalance = await walletService.getBalance(TEST_PHONE);
    expect(finalBalance.realBalance).toBe(100000);
  });

  it('should handle mixed concurrent operations correctly', async () => {
    // Setup: initial deposit
    await walletService.deposit(
      { phone: TEST_PHONE, amount: 500000, sourceType: 'manual' },
      mockContext
    );

    // Simulate mixed operations:
    // - 5 deposits of 10,000 each (+50,000)
    // - 5 withdrawals of 20,000 each (-100,000)
    // Expected final: 500,000 + 50,000 - 100,000 = 450,000

    const operations: Promise<unknown>[] = [];

    for (let i = 0; i < 5; i++) {
      operations.push(
        walletService.deposit(
          { phone: TEST_PHONE, amount: 10000, sourceType: 'manual' },
          { ...mockContext, requestId: `mixed-deposit-${i}` }
        )
      );

      operations.push(
        walletService.withdraw(
          { phone: TEST_PHONE, amount: 20000, orderId: `MIXED-ORDER-${i}` },
          { ...mockContext, requestId: `mixed-withdraw-${i}` }
        )
      );
    }

    const results = await Promise.allSettled(operations);

    // All operations should succeed
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures.length).toBe(0);

    // Final balance should be exactly 450,000
    const finalBalance = await walletService.getBalance(TEST_PHONE);
    expect(finalBalance.realBalance).toBe(450000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Issue Virtual Credit
// ═══════════════════════════════════════════════════════════════════════════════

describe('WalletService.issueVirtualCredit', () => {
  beforeEach(async () => {
    await setupTestCustomer(TEST_PHONE);
  });

  it('should issue virtual credit successfully', async () => {
    const result = await walletService.issueVirtualCredit(
      {
        phone: TEST_PHONE,
        amount: 50000,
        expiryDays: 15,
        sourceType: 'RETURN_SHIPPER',
        sourceNote: 'Test credit',
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.originalAmount).toBe(50000);
    expect(result.newVirtualBalance).toBe(50000);
    expect(result.creditId).toBeGreaterThan(0);

    // Verify expiry date is ~15 days from now
    const now = new Date();
    const expectedExpiry = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const actualExpiry = new Date(result.expiresAt);

    // Allow 1 minute tolerance for test execution time
    expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(60000);
  });

  it('should reject virtual credit with invalid amount', async () => {
    await expect(
      walletService.issueVirtualCredit(
        {
          phone: TEST_PHONE,
          amount: 0,
          sourceType: 'MANUAL',
        },
        mockContext
      )
    ).rejects.toThrow(WalletError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

afterAll(async () => {
  await cleanupTestData();
  await db.shutdown();
});
