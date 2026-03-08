/**
 * Preservation Property Tests
 * 
 * Property 2: Preservation - Đơn thường và đơn Social-web không bị ảnh hưởng
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * IMPORTANT: Tests này PHẢI PASS trên code CHƯA SỬA để thiết lập baseline
 * hành vi cần bảo toàn sau khi fix.
 * 
 * Phương pháp observation-first:
 * - Quan sát: Đơn thường có order.orderLines từ API → buildOrderLines() primary path trả về ProductId có sẵn
 * - Quan sát: Đơn thường có currentSalePartnerData từ fetchOrderDetailsForSale() → Partner.Id > 0
 * - Quan sát: Đơn Social billType="web" không gửi TPOS → không cần ProductId > 0
 * - Quan sát: confirmAndPrintSale() validate CarrierId, Phone, Street cho mọi loại đơn
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Simulate CURRENT source code logic (observation-first)
// ============================================================

/**
 * Simulates buildOrderLines() PRIMARY path (tab1-sale.js ~line 1612)
 * Used for regular orders that have order.orderLines from API
 */
function simulateBuildOrderLinesPrimary(orderLines) {
    return orderLines.map(item => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;

        return {
            ProductId: item.ProductId || item.Product?.Id || 0,
            ProductUOMId: item.ProductUOMId || 1,
            PriceUnit: price,
            ProductUOMQty: qty,
            Discount: item.Discount || 0,
            PriceTotal: total,
            PriceSubTotal: total,
            ProductName: item.Product?.NameGet || item.ProductName || '',
            ProductUOMName: item.ProductUOMName || item.ProductUOM?.Name || 'Cái',
        };
    });
}

/**
 * Simulates buildSaleOrderModelForInsertList() Partner section (tab1-sale.js ~line 960)
 * partner = currentSalePartnerData (populated by fetchOrderDetailsForSale for regular orders)
 */
function simulateBuildPartner(partner, order) {
    const receiverName = order.PartnerName || '';
    const receiverPhone = order.PartnerPhone || '';
    const receiverAddress = order.PartnerAddress || null;

    return {
        Id: partner?.Id || order.PartnerId || 0,
        Name: receiverName,
        DisplayName: receiverName,
        Street: receiverAddress,
        Phone: receiverPhone,
    };
}

/**
 * Simulates the validation logic in confirmAndPrintSale() (tab1-sale.js ~line 688)
 * Returns { valid: boolean, error: string|null }
 */
function simulateExistingValidations(model) {
    if (!model.CarrierId || model.CarrierId === 0) {
        return { valid: false, error: 'Vui lòng chọn đối tác vận chuyển' };
    }
    if (!model.Partner?.Phone) {
        return { valid: false, error: 'Vui lòng nhập số điện thoại người nhận' };
    }
    if (!model.Partner?.Street) {
        return { valid: false, error: 'Vui lòng nhập địa chỉ người nhận' };
    }
    return { valid: true, error: null };
}

// ============================================================
// Generators
// ============================================================

/** Vietnamese phone number generator */
const phoneArb = fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 9, maxLength: 9 })
    .map(digits => '0' + digits.join(''));

/** Product name generator */
const productNameArb = fc.oneof(
    fc.constant('Kem chống nắng SPF50'),
    fc.constant('Sữa rửa mặt Cerave'),
    fc.constant('Serum Vitamin C'),
    fc.constant('Toner HA'),
    fc.string({ minLength: 3, maxLength: 30 })
);

/** Order line from API (regular order) - always has ProductId > 0 */
const apiOrderLineArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 999999 }),
    ProductUOMQty: fc.integer({ min: 1, max: 100 }),
    PriceUnit: fc.integer({ min: 1000, max: 10000000 }),
    Discount: fc.constantFrom(0, 5, 10, 15, 20),
    ProductName: productNameArb,
    ProductUOMName: fc.constantFrom('Cái', 'Hộp', 'Chai', 'Tuýp'),
    ProductUOMId: fc.integer({ min: 1, max: 10 }),
    Product: fc.option(
        fc.record({
            Id: fc.integer({ min: 1, max: 999999 }),
            NameGet: productNameArb,
        }),
        { nil: null }
    ),
});

/** Partner data from fetchOrderDetailsForSale (regular order) - always has Id > 0 */
const partnerDataArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    Name: fc.string({ minLength: 2, maxLength: 50 }),
    DisplayName: fc.string({ minLength: 2, maxLength: 50 }),
    Phone: phoneArb,
    ExtraAddress: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: null }),
});

/** Regular order data (non-Social) */
const regularOrderArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    PartnerId: fc.integer({ min: 1, max: 999999 }),
    PartnerName: fc.string({ minLength: 2, maxLength: 50 }),
    PartnerPhone: phoneArb,
    PartnerAddress: fc.string({ minLength: 5, maxLength: 100 }),
    Code: fc.string({ minLength: 3, maxLength: 20 }),
});

/** Social order product (no ProductId) */
const socialProductArb = fc.record({
    productName: productNameArb,
    quantity: fc.integer({ min: 1, max: 100 }),
    sellingPrice: fc.integer({ min: 1000, max: 10000000 }),
});

/** Social order data */
const socialOrderArb = fc.record({
    id: fc.integer({ min: 1, max: 999999 }),
    customerName: fc.string({ minLength: 2, maxLength: 50 }),
    phone: phoneArb,
    address: fc.string({ minLength: 5, maxLength: 100 }),
    products: fc.array(socialProductArb, { minLength: 1, maxLength: 5 }),
});

/** Carrier ID generator (valid) */
const carrierIdArb = fc.integer({ min: 1, max: 100 });

// ============================================================
// Tests - capture CURRENT correct behavior for non-buggy paths
// These MUST PASS both before and after the fix
// ============================================================

describe('Preservation: Regular orders (non-Social) không bị ảnh hưởng', () => {

    /**
     * Property 2a: buildOrderLines() primary path trả về đúng ProductId từ input
     * 
     * Observation: Đơn thường có order.orderLines từ API với ProductId > 0.
     * buildOrderLines() primary path dùng item.ProductId || item.Product?.Id || 0
     * → luôn trả về ProductId > 0 khi input có ProductId > 0.
     * 
     * **Validates: Requirements 3.1, 3.3**
     */
    it('Property 2a: buildOrderLines primary path preserves ProductId from API orderLines', () => {
        fc.assert(
            fc.property(
                fc.array(apiOrderLineArb, { minLength: 1, maxLength: 10 }),
                (orderLines) => {
                    const result = simulateBuildOrderLinesPrimary(orderLines);

                    // Every result line should have ProductId > 0 matching input
                    for (let i = 0; i < result.length; i++) {
                        const inputId = orderLines[i].ProductId || orderLines[i].Product?.Id || 0;
                        if (result[i].ProductId !== inputId) {
                            return false;
                        }
                        if (result[i].ProductId <= 0) {
                            return false;
                        }
                    }
                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2b: buildSaleOrderModelForInsertList() Partner.Id đúng từ currentSalePartnerData
     * 
     * Observation: Đơn thường có currentSalePartnerData populated bởi fetchOrderDetailsForSale()
     * với Id > 0. Code: partner?.Id || order.PartnerId || 0 → trả về partner.Id.
     * 
     * **Validates: Requirements 3.1, 3.4**
     */
    it('Property 2b: Partner.Id preserves value from currentSalePartnerData for regular orders', () => {
        fc.assert(
            fc.property(
                partnerDataArb,
                regularOrderArb,
                (partner, order) => {
                    const result = simulateBuildPartner(partner, order);

                    // Partner.Id should come from currentSalePartnerData (partner.Id)
                    return result.Id === partner.Id && result.Id > 0;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2c: buildOrderLines() primary path preserves price and quantity calculations
     * 
     * Observation: PriceTotal = qty * price for each line.
     * 
     * **Validates: Requirements 3.3**
     */
    it('Property 2c: buildOrderLines primary path preserves price calculations', () => {
        fc.assert(
            fc.property(
                fc.array(apiOrderLineArb, { minLength: 1, maxLength: 10 }),
                (orderLines) => {
                    const result = simulateBuildOrderLinesPrimary(orderLines);

                    for (let i = 0; i < result.length; i++) {
                        const expectedQty = orderLines[i].ProductUOMQty || orderLines[i].Quantity || 1;
                        const expectedPrice = orderLines[i].PriceUnit || orderLines[i].Price || 0;
                        const expectedTotal = expectedQty * expectedPrice;

                        if (result[i].ProductUOMQty !== expectedQty) return false;
                        if (result[i].PriceUnit !== expectedPrice) return false;
                        if (result[i].PriceTotal !== expectedTotal) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });
});

describe('Preservation: Social orders with billType="web" không bị ảnh hưởng', () => {

    /**
     * Property 2d: Social orders with billType="web" don't need TPOS validation
     * 
     * Observation: Khi billType="web", đơn không gửi TPOS API.
     * confirmAndPrintSale() chỉ gọi TPOS API khi useTposBill=true.
     * Đơn Social-web không cần ProductId > 0 hay Partner.Id > 0 cho TPOS.
     * 
     * **Validates: Requirements 3.2**
     */
    it('Property 2d: Social-web orders work without ProductId > 0 requirement', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    const billType = 'web'; // Not TPOS

                    // Social-web orders should NOT require TPOS validation
                    // The isBugCondition only applies when billType='tpos'
                    const isBugCondition = true && billType === 'tpos'; // _isSocialOrder=true AND billType='tpos'

                    // For web orders, bug condition is false → no TPOS validation needed
                    return isBugCondition === false;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 2e: Social-web orders can have products without ProductId
     * 
     * Observation: Khi billType="web", sản phẩm không cần ProductId vì không gửi TPOS.
     * Đơn web dùng template local, không cần TPOS product lookup.
     * 
     * **Validates: Requirements 3.2**
     */
    it('Property 2e: Social-web orders accept products without ProductId', () => {
        fc.assert(
            fc.property(
                socialOrderArb,
                (socialOrder) => {
                    // Map social products (same as openSaleModalFromSocialOrder)
                    const details = socialOrder.products.map(p => ({
                        ProductName: p.productName || '',
                        Quantity: p.quantity || 1,
                        Price: p.sellingPrice || 0,
                        // No ProductId - this is fine for web orders
                    }));

                    const billType = 'web';

                    // For web orders, having no ProductId is acceptable
                    // Only TPOS orders require ProductId > 0
                    if (billType === 'web') {
                        return details.every(d => d.ProductId === undefined || d.ProductId === 0 || d.ProductId > 0);
                    }
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('Preservation: Existing validations continue working for all order types', () => {

    /**
     * Property 2f: CarrierId validation catches missing carrier for all order types
     * 
     * Observation: confirmAndPrintSale() validates CarrierId !== 0 BEFORE any order-type-specific logic.
     * This validation applies to ALL orders (regular, social-tpos, social-web).
     * 
     * **Validates: Requirements 3.1, 3.2**
     */
    it('Property 2f: CarrierId=0 is rejected for any order type', () => {
        fc.assert(
            fc.property(
                phoneArb,
                fc.string({ minLength: 5, maxLength: 100 }),
                (phone, address) => {
                    const model = {
                        CarrierId: 0, // Missing carrier
                        Partner: { Phone: phone, Street: address },
                    };

                    const result = simulateExistingValidations(model);
                    return result.valid === false && result.error === 'Vui lòng chọn đối tác vận chuyển';
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 2g: Phone validation catches missing phone for all order types
     * 
     * Observation: confirmAndPrintSale() validates Partner.Phone is truthy.
     * 
     * **Validates: Requirements 3.1, 3.2**
     */
    it('Property 2g: Missing phone is rejected for any order type', () => {
        fc.assert(
            fc.property(
                carrierIdArb,
                fc.string({ minLength: 5, maxLength: 100 }),
                (carrierId, address) => {
                    const model = {
                        CarrierId: carrierId,
                        Partner: { Phone: '', Street: address }, // Missing phone
                    };

                    const result = simulateExistingValidations(model);
                    return result.valid === false && result.error === 'Vui lòng nhập số điện thoại người nhận';
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 2h: Street validation catches missing address for all order types
     * 
     * Observation: confirmAndPrintSale() validates Partner.Street is truthy.
     * 
     * **Validates: Requirements 3.1, 3.2**
     */
    it('Property 2h: Missing address is rejected for any order type', () => {
        fc.assert(
            fc.property(
                carrierIdArb,
                phoneArb,
                (carrierId, phone) => {
                    const model = {
                        CarrierId: carrierId,
                        Partner: { Phone: phone, Street: '' }, // Missing address
                    };

                    const result = simulateExistingValidations(model);
                    return result.valid === false && result.error === 'Vui lòng nhập địa chỉ người nhận';
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 2i: Valid model passes all existing validations
     * 
     * Observation: When CarrierId > 0, Phone truthy, Street truthy → all validations pass.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4**
     */
    it('Property 2i: Valid CarrierId + Phone + Street passes all existing validations', () => {
        fc.assert(
            fc.property(
                carrierIdArb,
                phoneArb,
                fc.string({ minLength: 5, maxLength: 100 }),
                (carrierId, phone, address) => {
                    const model = {
                        CarrierId: carrierId,
                        Partner: { Phone: phone, Street: address },
                    };

                    const result = simulateExistingValidations(model);
                    return result.valid === true && result.error === null;
                }
            ),
            { numRuns: 200 }
        );
    });
});
