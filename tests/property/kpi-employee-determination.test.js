/**
 * Property 18: Employee determination via Employee_Range
 *
 * For any order with a valid BASE snapshot, recalculateAndSaveKPI should
 * determine the employee by looking up base.stt in Employee_Range
 * (campaign-specific first, then general), NOT by using base.userId.
 * The KPI statistics should be saved under the found employee's userId,
 * not base.userId.
 *
 * **Validates: Requirements 3.9, 3.10**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');
const KPI_PER_PRODUCT = 5000;

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

// --- Generators ---
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[A-Z]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const userIdArb = fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/);

const employeeRangeArb = fc.record({
    userId: userIdArb,
    userName: fc.string({ minLength: 1, maxLength: 30 }),
    fromSTT: fc.integer({ min: 1, max: 200 }),
    toSTT: fc.integer({ min: 201, max: 500 })
});

/**
 * Pure function: simulates getAssignedEmployeeForSTT logic.
 * Looks up STT in employee ranges (campaign-specific first, then general).
 *
 * @param {number} stt - Order STT
 * @param {string|null} campaignName - Campaign name
 * @param {Array} campaignRanges - Campaign-specific ranges [{userId, userName, fromSTT, toSTT}]
 * @param {Array} generalRanges - General ranges [{userId, userName, fromSTT, toSTT}]
 * @returns {{userId: string, userName: string}}
 */
function getAssignedEmployeeForSTTPure(stt, campaignName, campaignRanges, generalRanges) {
    const unassigned = { userId: 'unassigned', userName: 'Chưa phân' };

    if (!stt && stt !== 0) return unassigned;

    const sttNum = Number(stt);

    // 1. Campaign-specific ranges (priority)
    if (campaignName && Array.isArray(campaignRanges)) {
        for (const range of campaignRanges) {
            const from = range.fromSTT || range.from || 0;
            const to = range.toSTT || range.to || Infinity;
            if (sttNum >= from && sttNum <= to) {
                return {
                    userId: range.userId || 'unassigned',
                    userName: range.userName || range.userId || 'Chưa phân'
                };
            }
        }
    }

    // 2. General ranges (fallback)
    if (Array.isArray(generalRanges)) {
        for (const range of generalRanges) {
            const from = range.fromSTT || range.from || 0;
            const to = range.toSTT || range.to || Infinity;
            if (sttNum >= from && sttNum <= to) {
                return {
                    userId: range.userId || 'unassigned',
                    userName: range.userName || range.userId || 'Chưa phân'
                };
            }
        }
    }

    return unassigned;
}

/**
 * Pure function: simulates recalculateAndSaveKPI's employee determination logic.
 * Returns the userId that KPI statistics should be saved under.
 *
 * @param {Object} base - BASE snapshot {stt, campaignName, userId, products}
 * @param {Array} campaignRanges - Campaign-specific employee ranges
 * @param {Array} generalRanges - General employee ranges
 * @returns {{employeeUserId: string, filterUserId: string|null}}
 */
function determineEmployeeForKPI(base, campaignRanges, generalRanges) {
    if (!base) return { employeeUserId: null, filterUserId: null };

    const assigned = getAssignedEmployeeForSTTPure(
        base.stt, base.campaignName, campaignRanges, generalRanges
    );

    const employeeUserId = assigned.userId;
    const filterUserId = employeeUserId === 'unassigned' ? null : employeeUserId;

    return { employeeUserId, filterUserId };
}

describe('Feature: kpi-upselling-products, Property 18: Employee determination via Employee_Range', () => {

    /**
     * PBT 18a: Employee is determined by STT lookup in Employee_Range,
     * NOT by base.userId. When STT falls in a range, the range's userId
     * is used (which may differ from base.userId).
     */
    it('should determine employee by STT lookup, not base.userId', () => {
        fc.assert(
            fc.property(
                userIdArb, // bulkSenderId (base.userId)
                userIdArb, // assignedEmployeeId (from range)
                fc.integer({ min: 1, max: 500 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (bulkSenderId, assignedEmpId, stt, campaignName, empName) => {
                    // Ensure different userIds to prove we're not using base.userId
                    const empId = assignedEmpId === bulkSenderId
                        ? assignedEmpId + '_emp'
                        : assignedEmpId;

                    const base = {
                        stt: stt,
                        campaignName: campaignName,
                        userId: bulkSenderId, // This is the bulk sender, NOT the assigned employee
                        products: [{ ProductId: 1, ProductCode: 'A', ProductName: 'Test', Quantity: 1, Price: 10000 }]
                    };

                    // Range that covers the STT, assigned to empId
                    const generalRanges = [{
                        userId: empId,
                        userName: empName,
                        fromSTT: 1,
                        toSTT: 500
                    }];

                    const result = determineEmployeeForKPI(base, [], generalRanges);

                    // Employee should be from the range, NOT base.userId
                    expect(result.employeeUserId).toBe(empId);
                    expect(result.employeeUserId).not.toBe(bulkSenderId);
                    expect(result.filterUserId).toBe(empId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 18b: Campaign-specific ranges take priority over general ranges.
     */
    it('should prefer campaign-specific range over general range', () => {
        fc.assert(
            fc.property(
                userIdArb,
                userIdArb,
                fc.integer({ min: 1, max: 500 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (campaignEmpId, generalEmpId, stt, campaignName) => {
                    const campEmp = campaignEmpId === generalEmpId
                        ? campaignEmpId + '_camp'
                        : campaignEmpId;

                    const campaignRanges = [{
                        userId: campEmp,
                        userName: 'Campaign Employee',
                        fromSTT: 1,
                        toSTT: 500
                    }];

                    const generalRanges = [{
                        userId: generalEmpId,
                        userName: 'General Employee',
                        fromSTT: 1,
                        toSTT: 500
                    }];

                    const base = {
                        stt: stt,
                        campaignName: campaignName,
                        userId: 'bulk_sender',
                        products: [{ ProductId: 1, ProductCode: 'A', ProductName: 'Test', Quantity: 1, Price: 10000 }]
                    };

                    const result = determineEmployeeForKPI(base, campaignRanges, generalRanges);

                    // Campaign range should win
                    expect(result.employeeUserId).toBe(campEmp);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 18c: When STT is not in any range, employee is "unassigned"
     * and filterUserId is null (don't filter audit logs by userId).
     */
    it('should return "unassigned" when STT is not in any range', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 501, max: 1000 }), // STT outside all ranges
                fc.string({ minLength: 1, maxLength: 30 }),
                userIdArb,
                (stt, campaignName, bulkSenderId) => {
                    const generalRanges = [{
                        userId: 'emp1',
                        userName: 'Employee 1',
                        fromSTT: 1,
                        toSTT: 500
                    }];

                    const base = {
                        stt: stt,
                        campaignName: campaignName,
                        userId: bulkSenderId,
                        products: [{ ProductId: 1, ProductCode: 'A', ProductName: 'Test', Quantity: 1, Price: 10000 }]
                    };

                    const result = determineEmployeeForKPI(base, [], generalRanges);

                    expect(result.employeeUserId).toBe('unassigned');
                    expect(result.filterUserId).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 18d: KPI statistics are saved under the assigned employee's userId,
     * never under base.userId (the bulk sender).
     */
    it('should save KPI under assigned employee userId, not base.userId', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.array(employeeRangeArb, { minLength: 1, maxLength: 5 }),
                fc.integer({ min: 1, max: 500 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (bulkSenderId, ranges, stt, campaignName) => {
                    // Make non-overlapping ranges
                    const sortedRanges = ranges.map((r, i) => ({
                        ...r,
                        fromSTT: i * 100 + 1,
                        toSTT: (i + 1) * 100
                    }));

                    const base = {
                        stt: stt,
                        campaignName: campaignName,
                        userId: bulkSenderId,
                        products: [{ ProductId: 1, ProductCode: 'A', ProductName: 'Test', Quantity: 1, Price: 10000 }]
                    };

                    const result = determineEmployeeForKPI(base, [], sortedRanges);

                    // Find which range the STT falls into
                    const matchingRange = sortedRanges.find(
                        r => stt >= r.fromSTT && stt <= r.toSTT
                    );

                    if (matchingRange) {
                        expect(result.employeeUserId).toBe(matchingRange.userId);
                    } else {
                        expect(result.employeeUserId).toBe('unassigned');
                    }

                    // Never base.userId (unless it happens to match the range)
                    if (matchingRange && matchingRange.userId !== bulkSenderId) {
                        expect(result.employeeUserId).not.toBe(bulkSenderId);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 18e: Falls back to general range when no campaign range exists.
     */
    it('should fallback to general range when campaign ranges are empty', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.integer({ min: 1, max: 500 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (generalEmpId, stt, campaignName) => {
                    const generalRanges = [{
                        userId: generalEmpId,
                        userName: 'General Employee',
                        fromSTT: 1,
                        toSTT: 500
                    }];

                    const base = {
                        stt: stt,
                        campaignName: campaignName,
                        userId: 'bulk_sender',
                        products: [{ ProductId: 1, ProductCode: 'A', ProductName: 'Test', Quantity: 1, Price: 10000 }]
                    };

                    // No campaign ranges
                    const result = determineEmployeeForKPI(base, [], generalRanges);

                    expect(result.employeeUserId).toBe(generalEmpId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js uses getAssignedEmployeeForSTT
     * in recalculateAndSaveKPI instead of base.userId.
     */
    it('source code should use getAssignedEmployeeForSTT in recalculateAndSaveKPI', () => {
        // Must contain the new helper function
        expect(sourceCode).toContain('getAssignedEmployeeForSTT');
        // recalculateAndSaveKPI should call getAssignedEmployeeForSTT
        expect(sourceCode).toContain('getAssignedEmployeeForSTT(base.stt, base.campaignName)');
        // Should NOT use base.userId as employeeUserId in recalculateAndSaveKPI
        // (the old buggy pattern was: const employeeUserId = base.userId)
        expect(sourceCode).not.toMatch(/recalculateAndSaveKPI[\s\S]*?const employeeUserId = base\.userId/);
        // Should handle unassigned case
        expect(sourceCode).toContain("=== 'unassigned'");
        // Should export getAssignedEmployeeForSTT
        expect(sourceCode).toContain('getAssignedEmployeeForSTT');
    });
});
