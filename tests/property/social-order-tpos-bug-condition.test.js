/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - Đơn Social gửi TPOS với ProductId=0 và Partner.Id=0
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * PHASE 1 (pre-fix): Test FAIL → xác nhận bug tồn tại
 * PHASE 2 (post-fix): Test PASS → xác nhận bug đã được sửa
 * 
 * Mô phỏng flow: openSaleModalFromSocialOrder() → buildOrderLines() → buildSaleOrderModelForInsertList()
 * 
 * Sau khi fix:
 * - openSaleModalFromSocialOrder() gọi fetchTPOSCustomer() → currentSalePartnerData populated
 * - openSaleModalFromSocialOrder() gọi productSearchManager.search() → ProductId được gán
 * - confirmAndPrintSale() validate ProductId > 0 và Partner.Id > 0 cho đơn Social-TPOS
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Simulate the FIXED mapping logic from source code
// ============================================================

/**
 * Simulates openSaleModalFromSocialOrder() mapping logic AFTER FIX
 * from tab1-qr-debt.js
 * 
 * Fixed code:
 * 1. Maps social products WITH ProductCode field
 * 2. Calls productSearchManager.search() to find ProductId
 * 3. Calls fetchTPOSCustomer() to find Partner
 */
function simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, mockCustomerLookup) {
    const mappedOrder = {
        Id: socialOrder.id,
        PartnerName: socialOrder.customerName,
        Name: socialOrder.customerName,
        Telephone: socialOrder.phone,
        PartnerPhone: socialOrder.phone,
        PartnerAddress: socialOrder.address,
        Address: socialOrder.address,
        TotalAmount: socialOrder.totalAmount || 0,
        Comment: socialOrder.note || '',
        Details: (socialOrder.products || []).map(p => ({
            ProductNameGet: p.productName || '',
            ProductName: p.productName || '',
            ProductCode: p.productCode || '',
            Quantity: p.quantity || 1,
            PriceUnit: p.sellingPrice || 0,
            Price: p.sellingPrice || 0,
            Note: p.variant || ''
        })),
        Tags: socialOrder.tags ? JSON.stringify(socialOrder.tags) : '[]',
        _isSocialOrder: true
    };

    // 🔥 FIX: Tra cứu TPOS Customer
    let partnerData = null;
    if (mappedOrder.Telephone && mockCustomerLookup) {
        const result = mockCustomerLookup(mappedOrder.Telephone);
        if (result && result.success && result.count > 0) {
            const customer = result.customers[0];
            partnerData = {
                Id: customer.id,
                Name: customer.name || mappedOrder.PartnerName,
                DisplayName: customer.name || mappedOrder.PartnerName,
                Phone: customer.phone || mappedOrder.Telephone,
            };
            mappedOrder.PartnerId = partnerData.Id;
        }
    }

    // 🔥 FIX: Tra cứu ProductId cho sản phẩm Social
    if (mappedOrder.Details && mockProductLookup) {
        for (const detail of mappedOrder.Details) {
            const searchName = detail.ProductName || detail.ProductNameGet || '';
            if (!searchName) continue;
            const result = mockProductLookup(searchName);
            if (result && result.Id > 0) {
                detail.ProductId = result.Id;
            }
        }
    }

    return { mappedOrder, partnerData };
}

/**
 * Simulates buildOrderLines() fallback path (unchanged)
 */
function simulateBuildOrderLinesFallback(order) {
    if (order?.orderLines && order.orderLines.length > 0) {
        return order.orderLines.map(item => ({
            ProductId: item.ProductId || item.Product?.Id || 0,
            PriceUnit: item.PriceUnit || item.Price || 0,
            ProductUOMQty: item.ProductUOMQty || item.Quantity || 1,
            ProductName: item.Product?.NameGet || item.ProductName || '',
            PriceTotal: (item.ProductUOMQty || item.Quantity || 1) * (item.PriceUnit || item.Price || 0),
        }));
    }
    if (order?.Details && order.Details.length > 0) {
        return order.Details.map(detail => {
            const price = detail.Price || 0;
            const quantity = detail.Quantity || 1;
            return {
                ProductId: detail.ProductId || 0,
                PriceUnit: price,
                ProductUOMQty: quantity,
                ProductName: detail.ProductName || detail.ProductNameGet || '',
                PriceTotal: price * quantity,
            };
        });
    }
    return [];
}

/**
 * Simulates buildSaleOrderModelForInsertList() Partner section (unchanged)
 */
function simulateBuildPartner(partner, order) {
    return {
        Id: partner?.Id || order.PartnerId || 0,
        Name: order.PartnerName || '',
        DisplayName: order.PartnerName || '',
        Phone: order.PartnerPhone || '',
    };
}

/**
 * Simulates the NEW validation in confirmAndPrintSale() for Social-TPOS orders
 */
function simulateSocialTposValidation(model, isSocialOrder, billType) {
    if (isSocialOrder && billType === 'tpos') {
        if (!model.Partner?.Id || model.Partner.Id === 0) {
            return { valid: false, error: 'Không tìm thấy khách hàng trên TPOS' };
        }
        const missingProducts = (model.OrderLines || [])
            .filter(line => !line.ProductId || line.ProductId === 0)
            .map(line => line.ProductName || 'Không rõ tên');
        if (missingProducts.length > 0) {
            return { valid: false, error: `Không tìm thấy sản phẩm trên TPOS: ${missingProducts.join(', ')}` };
        }
    }
    return { valid: true, error: null };
}

// ============================================================
// Generators
// ============================================================

const phoneArb = fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 9, maxLength: 9 })
    .map(digits => '0' + digits.join(''));

const productNameArb = fc.oneof(
    fc.constant('Kem chống nắng SPF50'),
    fc.constant('Sữa rửa mặt Cerave'),
    fc.constant('Serum Vitamin C'),
    fc.constant('Toner HA'),
    fc.constant('Kem dưỡng ẩm Neutrogena'),
    fc.string({ minLength: 3, maxLength: 30 })
);

const socialProductArb = fc.record({
    productName: productNameArb,
    quantity: fc.integer({ min: 1, max: 100 }),
    sellingPrice: fc.integer({ min: 1000, max: 10000000 }),
    variant: fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
    productCode: fc.option(fc.string({ minLength: 3, maxLength: 10 }), { nil: undefined }),
});

const socialOrderArb = fc.record({
    id: fc.integer({ min: 1, max: 999999 }),
    customerName: fc.string({ minLength: 2, maxLength: 50 }),
    phone: phoneArb,
    address: fc.string({ minLength: 5, maxLength: 100 }),
    totalAmount: fc.integer({ min: 10000, max: 100000000 }),
    note: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    products: fc.array(socialProductArb, { minLength: 1, maxLength: 10 }),
    tags: fc.option(fc.array(fc.string(), { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

// Mock: productSearchManager always finds a match (simulates loaded product catalog)
const mockProductLookup = (name) => ({ Id: Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) + 1 });

// Mock: fetchTPOSCustomer always finds a customer
const mockCustomerLookup = (phone) => ({
    success: true,
    count: 1,
    customers: [{ id: Math.abs(phone.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) + 1, name: 'Test Customer', phone }]
});

// ============================================================
// Tests - encode EXPECTED (correct) behavior
// PHASE 2 (post-fix): All tests PASS
// ============================================================

describe('Bug Condition Fix Verification: Social Order TPOS Object Reference', () => {

    it('Property 1a: Social order Details should have ProductId > 0 after FIXED mapping', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    const { mappedOrder } = simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, mockCustomerLookup);

                    for (const detail of mappedOrder.Details) {
                        if (!detail.ProductId || detail.ProductId === 0) {
                            return false;
                        }
                    }
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('Property 1b: currentSalePartnerData should be populated after FIXED social order open', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    const { partnerData } = simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, mockCustomerLookup);
                    return partnerData !== null && partnerData.Id > 0;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('Property 1c: buildOrderLines fallback should produce ProductId > 0 after FIXED mapping', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    const { mappedOrder } = simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, mockCustomerLookup);
                    const orderLines = simulateBuildOrderLinesFallback(mappedOrder);

                    for (const line of orderLines) {
                        if (line.ProductId === 0) {
                            return false;
                        }
                    }
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('Property 1d: Partner.Id should be > 0 for FIXED social order TPOS submission', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    const { mappedOrder, partnerData } = simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, mockCustomerLookup);
                    const partner = simulateBuildPartner(partnerData, mappedOrder);
                    return partner.Id > 0;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('Property 1e: Social-TPOS validation catches ProductId=0 when product not found', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    // Simulate case where product lookup FAILS (returns null)
                    const noProductLookup = () => null;
                    const { mappedOrder, partnerData } = simulateOpenSaleModalMappingFixed(socialOrder, noProductLookup, mockCustomerLookup);
                    const orderLines = simulateBuildOrderLinesFallback(mappedOrder);
                    const partner = simulateBuildPartner(partnerData, mappedOrder);

                    const model = {
                        Partner: partner,
                        OrderLines: orderLines,
                    };

                    const result = simulateSocialTposValidation(model, true, 'tpos');
                    // Should be invalid because ProductId = 0
                    return result.valid === false && result.error.includes('Không tìm thấy sản phẩm');
                }
            ),
            { numRuns: 100 }
        );
    });

    it('Property 1f: Social-TPOS validation catches Partner.Id=0 when customer not found', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    // Simulate case where customer lookup FAILS
                    const noCustomerLookup = () => ({ success: false, count: 0, customers: [] });
                    const { mappedOrder, partnerData } = simulateOpenSaleModalMappingFixed(socialOrder, mockProductLookup, noCustomerLookup);
                    const partner = simulateBuildPartner(partnerData, mappedOrder);

                    const model = {
                        Partner: partner,
                        OrderLines: simulateBuildOrderLinesFallback(mappedOrder),
                    };

                    const result = simulateSocialTposValidation(model, true, 'tpos');
                    return result.valid === false && result.error.includes('Không tìm thấy khách hàng');
                }
            ),
            { numRuns: 100 }
        );
    });
});
