// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared TPOS FastPurchaseOrder refund payload builder.
 *
 * Pure function: take state + config, return POST body object.
 * Kept separate from shared/js/return-order-modal.js so the modal stays under the 800-line cap.
 *
 * Depends on window.ReturnOrderConfig for static schema constants.
 */
window.ReturnOrderPayload = (function () {
    'use strict';

    /**
     * Build the POST body for `POST /api/odata/FastPurchaseOrder` (refund type).
     *
     * @param {object} args
     * @param {object} args.selectedSupplier  - { Id, Name, Ref, DisplayName }
     * @param {Array}  args.orderLines        - [{ name, code, productId, templateId, variantData, product, quantity, price, uom, uomId }]
     * @param {Date}   args.orderDate         - posted DateInvoice
     * @param {Date}   args.now               - timestamp for DateCreated
     * @param {number} args.paymentMethodId
     * @param {object} args.paymentMethod     - { Id, Name, Type, TypeGet }
     * @param {number} args.shippingCost
     * @param {number} args.paymentAmount
     * @param {number} args.discountAmount
     * @param {string|null} args.formAction   - 'SaveAndPrint' | 'SaveAndView' | null
     * @returns {object} POST body
     */
    function buildRefundPayload({
        selectedSupplier,
        orderLines,
        orderDate,
        now,
        paymentMethodId,
        paymentMethod,
        shippingCost,
        paymentAmount,
        discountAmount,
        formAction,
    }) {
        const C = window.ReturnOrderConfig;
        if (!C) throw new Error('ReturnOrderConfig not loaded');

        const config = C.getConfig();
        const toVNDateString = C.toVNDateString;
        const STATIC_USER_ID = C.STATIC_USER_ID;
        const companyId = C.getCompanyId();

        // Calculate totals
        let amountTotal = 0;
        for (const l of orderLines) amountTotal += l.quantity * l.price;
        const finalAmount = amountTotal - discountAmount + shippingCost;

        // Build Partner object
        const partner = {
            Id: selectedSupplier.Id,
            Name: selectedSupplier.Name,
            DisplayName: selectedSupplier.DisplayName,
            Ref: selectedSupplier.Ref,
            Supplier: true,
            Customer: false,
            Active: true,
            Type: 'contact',
            CompanyType: 'person',
            Status: 'Normal',
            StatusText: 'Bình thường',
            Source: 'Default',
        };

        return {
            Id: 0,
            Name: null,
            PartnerId: selectedSupplier.Id,
            PartnerDisplayName: null,
            State: 'draft',
            Date: null,
            PickingTypeId: config.PickingTypeId,
            AmountTotal: finalAmount,
            TotalQuantity: 0,
            Amount: null,
            Discount: 0,
            DiscountAmount: 0,
            DecreaseAmount: discountAmount,
            AmountTax: 0,
            AmountUntaxed: amountTotal,
            TaxId: null,
            Note: '',
            CompanyId: companyId,
            JournalId: config.JournalId,
            DateInvoice: toVNDateString(orderDate),
            Number: null,
            Type: 'refund',
            Residual: null,
            RefundOrderId: null,
            Reconciled: null,
            AccountId: config.AccountId,
            UserId: STATIC_USER_ID,
            AmountTotalSigned: null,
            ResidualSigned: null,
            ShowState: 'Nháp',
            UserName: null,
            PartnerNameNoSign: null,
            PaymentJournalId: paymentMethodId,
            PaymentAmount: paymentAmount,
            Origin: null,
            CompanyName: null,
            PartnerPhone: null,
            Address: null,
            DateCreated: toVNDateString(now),
            TaxView: null,
            CostsIncurred: shippingCost,
            VatInvoiceNumber: null,
            ExchangeRate: null,
            DestConvertCurrencyUnitId: null,
            FormAction: formAction,
            PaymentInfo: [],
            Error: null,

            // Nested objects
            Company: config.Company,
            PickingType: config.PickingType,
            Journal: config.Journal,
            User: config.User,
            PaymentJournal: { ...paymentMethod, UpdatePosted: true },
            DestConvertCurrencyUnit: null,
            Partner: partner,
            Account: config.Account,

            // Order lines — use variant data (fetched when product was added)
            OrderLines: orderLines.map((line) => {
                const v = line.variantData;
                const p = line.product || {};
                const productObj = v
                    ? {
                          Id: v.Id,
                          Name: v.Name,
                          UOMId: v.UOMId || line.uomId,
                          UOMName: v.UOMName || p.UOMName,
                          NameGet: v.NameGet || p.NameGet,
                          Barcode: v.Barcode || v.DefaultCode || p.DefaultCode || null,
                          Price: v.Price || p.ListPrice || 0,
                          DefaultCode: v.DefaultCode || p.DefaultCode,
                          ProductTmplId: v.ProductTmplId || line.templateId,
                          PurchaseOK: true,
                          SaleOK: true,
                          PurchasePrice: v.PurchasePrice || p.PurchasePrice || 0,
                          DiscountSale: v.DiscountSale || 0,
                          Weight: v.Weight || 0,
                          DiscountPurchase: v.DiscountPurchase || 0,
                          ImageUrl: v.ImageUrl || p.ImageUrl || null,
                          Active: v.Active !== false,
                          Factor: 1,
                      }
                    : {
                          Id: line.productId,
                          Name: p.Name,
                          UOMId: line.uomId,
                          UOMName: p.UOMName,
                          NameGet: p.NameGet,
                          Barcode: p.DefaultCode || null,
                          Price: p.ListPrice || 0,
                          DefaultCode: p.DefaultCode,
                          ProductTmplId: line.templateId || p.Id,
                          PurchaseOK: true,
                          SaleOK: true,
                          PurchasePrice: p.PurchasePrice || 0,
                          Active: true,
                          Factor: 1,
                      };
                return {
                    Name: line.name,
                    ProductId: line.productId,
                    ProductUOMId: line.uomId,
                    ProductUOM: { Id: line.uomId, Name: line.uom },
                    ProductQty: line.quantity,
                    PriceUnit: line.price,
                    Discount: 0,
                    Product: productObj,
                    Account: config.Account,
                    AccountId: config.AccountId,
                    PriceRecent: null,
                    PriceSubTotal: line.quantity * line.price,
                };
            }),
        };
    }

    return { buildRefundPayload };
})();
