/**
 * TPOS Purchase Order Creator
 * Flow: Excel → PurchaseByExcel API (get OrderLines) → FastPurchaseOrder API (create PO)
 * Uses TPOSClient.authenticatedFetch() for token management
 */

window.TPOSPurchase = (function() {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // =====================================================
    // STATIC CONFIG (from TPOS - constant for NJD Live)
    // =====================================================

    const STATIC = {
        CompanyId: 1,
        JournalId: 4,
        AccountId: 4,
        PickingTypeId: 1,
        PaymentJournalId: 1,
        UserId: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',

        Company: {
            Id: 1, Name: 'NJD Live',
            Sender: 'Tổng đài:19003357', Phone: '19003357',
            Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
            CurrencyId: 1, Active: true, AllowSaleNegative: true,
            Customer: false, Supplier: false,
            DepositAccountId: 11, DeliveryCarrierId: 7,
            City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
            District: { name: 'Quận 12', code: '761', cityCode: '79' },
            Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' }
        },

        PickingType: {
            Id: 1, Code: 'incoming', Name: 'Nhận hàng', Active: true,
            WarehouseId: 1, UseCreateLots: true, UseExistingLots: true,
            NameGet: 'Nhi Judy Store: Nhận hàng'
        },

        Journal: {
            Id: 4, Name: 'Nhật ký mua hàng', Type: 'purchase',
            TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false
        },

        User: {
            Id: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',
            Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt',
            CompanyId: 1, CompanyName: 'NJD Live', Active: true
        },

        PaymentJournal: {
            Id: 1, Name: 'Tiền mặt', Type: 'cash',
            TypeGet: 'Tiền mặt', UpdatePosted: true
        },

        Account: {
            Id: 4, Name: 'Phải trả người bán', Code: '331',
            Active: true, NameGet: '331 Phải trả người bán', Reconcile: false
        }
    };

    // Format date as Vietnam timezone (+07:00) matching TPOS payload format
    function toVNDateString(date) {
        const d = date || new Date();
        const offset = 7 * 60; // +07:00 in minutes
        const local = new Date(d.getTime() + offset * 60000);
        return local.toISOString().replace('Z', '') + '+07:00';
    }

    // =====================================================
    // STEP 1: PurchaseByExcel - Convert Excel → OrderLines
    // =====================================================

    async function purchaseByExcel(base64File, partnerId, dateOrder) {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        const url = `${PROXY_URL}/api/odata/FastPurchaseOrderLine/ODataService.PurchaseByExcel?$expand=OrderLines($expand=ProductUOM,Account,Product)`;

        const body = {
            file: base64File,
            paramModel: {
                PartnerId: partnerId,
                DateOrder: dateOrder
            }
        };

        console.log('[TPOSPurchase] PurchaseByExcel → PartnerId:', partnerId);

        const response = await window.TPOSClient.authenticatedFetch(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`PurchaseByExcel API error ${response.status}: ${text}`);
        }

        const data = await response.json();

        if (data.Errors && data.Errors.length > 0) {
            console.warn('[TPOSPurchase] PurchaseByExcel errors:', data.Errors);
        }

        const orderLines = data.OrderLines || [];
        console.log(`[TPOSPurchase] PurchaseByExcel returned ${orderLines.length} OrderLines`);

        return { orderLines, errors: data.Errors || [], isError: data.IsError };
    }

    // =====================================================
    // STEP 2: FastPurchaseOrder - Create PO on TPOS
    // =====================================================

    async function createPurchaseOrder(orderLines, partnerData, orderInfo) {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        const partnerId = partnerData.tposId || partnerData.Id || partnerData.id;
        if (!partnerId) throw new Error('Partner has no TPOS ID');

        // Calculate totals from orderLines
        let amountTotal = 0;
        for (const line of orderLines) {
            amountTotal += (line.PriceUnit || 0) * (line.ProductQty || 0);
        }

        const invoiceAmount = orderInfo.invoiceAmount || 0;
        const discountAmount = orderInfo.discountAmount || 0;
        const shippingFee = orderInfo.shippingFee || 0;
        const finalAmount = invoiceAmount || amountTotal;

        // Build Partner object from Firebase data (full TPOS response)
        const partner = {
            Id: partnerId,
            Name: partnerData.Name || partnerData.name,
            DisplayName: partnerData.DisplayName || `[${partnerData.Ref || ''}] ${partnerData.Name || partnerData.name}`,
            Ref: partnerData.Ref || partnerData.tposCode,
            Supplier: true,
            Customer: partnerData.Customer || false,
            Active: true,
            NameNoSign: partnerData.NameNoSign || null,
            Street: partnerData.Street || null,
            Phone: partnerData.Phone || null,
            Email: partnerData.Email || null,
            Type: partnerData.Type || 'contact',
            CompanyType: partnerData.CompanyType || 'person',
            Status: partnerData.Status || 'Normal',
            StatusText: partnerData.StatusText || 'Bình thường',
            Source: partnerData.Source || 'Default',
            DateCreated: partnerData.DateCreated || toVNDateString()
        };

        // Build payload
        const now = new Date();
        const payload = {
            Id: 0,
            Name: null,
            PartnerId: partnerId,
            PartnerDisplayName: null,
            State: 'draft',
            Date: null,
            PickingTypeId: STATIC.PickingTypeId,
            AmountTotal: finalAmount,
            TotalQuantity: 0,
            Amount: null,
            Discount: 0,
            DiscountAmount: discountAmount,
            DecreaseAmount: 0,
            AmountTax: 0,
            AmountUntaxed: amountTotal,
            TaxId: null,
            Note: orderInfo.notes || '',
            CompanyId: STATIC.CompanyId,
            JournalId: STATIC.JournalId,
            DateInvoice: toVNDateString(now),
            Number: null,
            Type: 'invoice',
            Residual: null,
            RefundOrderId: null,
            Reconciled: null,
            AccountId: STATIC.AccountId,
            UserId: STATIC.UserId,
            AmountTotalSigned: null,
            ResidualSigned: null,
            ShowState: 'Nháp',
            UserName: null,
            PartnerNameNoSign: null,
            PaymentJournalId: STATIC.PaymentJournalId,
            PaymentAmount: 0,
            Origin: null,
            CompanyName: null,
            PartnerPhone: null,
            Address: null,
            DateCreated: toVNDateString(now),
            TaxView: null,
            CostsIncurred: shippingFee,
            VatInvoiceNumber: null,
            ExchangeRate: null,
            DestConvertCurrencyUnitId: null,
            FormAction: 'SaveAndPrint',
            PaymentInfo: [],
            Error: null,

            // Static nested objects
            Company: STATIC.Company,
            PickingType: STATIC.PickingType,
            Journal: STATIC.Journal,
            User: STATIC.User,
            PaymentJournal: STATIC.PaymentJournal,
            DestConvertCurrencyUnit: null,
            Partner: partner,
            Account: STATIC.Account,

            // OrderLines from PurchaseByExcel response
            OrderLines: orderLines.map(line => ({
                ProductUOM: line.ProductUOM,
                Name: line.Name,
                Account: line.Account,
                PriceUnit: line.PriceUnit,
                AccountId: line.Account?.Id || 7,
                PriceRecent: line.PriceRecent || line.PriceUnit,
                ProductQty: line.ProductQty,
                Product: line.Product,
                ProductId: line.ProductId,
                ProductUOMId: line.ProductUOMId || 1,
                Discount: line.Discount || 0,
                PriceSubTotal: (line.PriceUnit || 0) * (line.ProductQty || 0)
            }))
        };

        console.log('[TPOSPurchase] FastPurchaseOrder → PartnerId:', partnerId, 'Lines:', orderLines.length, 'Total:', finalAmount);

        const url = `${PROXY_URL}/api/odata/FastPurchaseOrder`;
        const response = await window.TPOSClient.authenticatedFetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`FastPurchaseOrder API error ${response.status}: ${text}`);
        }

        const result = await response.json();
        console.log('[TPOSPurchase] Purchase order created:', result.Id, result.Number, result.ShowState);

        return result;
    }

    // =====================================================
    // MAIN: Full flow - Excel → PurchaseByExcel → FastPurchaseOrder
    // =====================================================

    async function createFromExcel(workbook, order) {
        const showToast = window.notificationManager?.show?.bind(window.notificationManager)
            || ((msg, type) => console.log(`[TPOSPurchase] ${type}: ${msg}`));

        try {
            // 1. Find NCC
            const supplierName = order.supplier?.name;
            const ncc = window.NCCManager?.findByName(supplierName);
            if (!ncc || !ncc.tposId) {
                throw new Error(`Không tìm thấy NCC "${supplierName}" hoặc NCC chưa có TPOS ID. Hãy đồng bộ NCC từ TPOS trước.`);
            }

            showToast('Đang tạo đơn mua hàng trên TPOS...', 'info');

            // 2. Convert workbook to base64
            const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

            // 3. PurchaseByExcel → get OrderLines
            const orderDate = toVNDateString();

            const excelResult = await purchaseByExcel(base64, ncc.tposId, orderDate);

            if (excelResult.orderLines.length === 0) {
                throw new Error('TPOS không nhận diện được sản phẩm nào từ Excel');
            }

            // 4. Get full Partner data from Firebase
            const partnerData = await window.NCCManager.getFullPartnerData(ncc.docId);
            if (!partnerData) {
                throw new Error('Không lấy được dữ liệu NCC từ Firebase');
            }

            // 5. FastPurchaseOrder → create PO
            const poResult = await createPurchaseOrder(excelResult.orderLines, partnerData, order);

            showToast(`Đã tạo đơn mua hàng TPOS: ${poResult.Number || 'ID ' + poResult.Id}`, 'success');

            return {
                success: true,
                poId: poResult.Id,
                poNumber: poResult.Number,
                state: poResult.ShowState,
                linesCount: excelResult.orderLines.length,
                excelErrors: excelResult.errors,
                orderLines: excelResult.orderLines
            };
        } catch (error) {
            console.error('[TPOSPurchase] createFromExcel failed:', error);
            showToast('Lỗi tạo đơn TPOS: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // =====================================================
    // INIT
    // =====================================================

    console.log('[TPOSPurchase] Module loaded');

    return {
        purchaseByExcel,
        createPurchaseOrder,
        createFromExcel
    };
})();
