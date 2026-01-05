// api-service.js
// Abstraction layer for API calls (TPOS, Firebase, LocalStorage)

const ApiService = {
    // Always use Firebase mode
    mode: 'FIREBASE',

    /**
     * Search orders from TPOS via TPOS OData Proxy
     * Uses tokenManager.authenticatedFetch() for proper auth handling
     * @param {string} query - Phone number (5-11 digits supported)
     * @returns {Promise<Array>} List of mapped orders
     */
    async searchOrders(query) {
        if (!query) return [];

        // Extract digits only
        const cleanQuery = query.replace(/\D/g, '');
        if (cleanQuery.length < 3) {
            console.log('[API] Query too short, need at least 3 digits');
            return [];
        }

        console.log(`[API] Searching orders for phone: ${cleanQuery}`);

        // Build date range (last 30 days)
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Format dates for OData (ISO 8601 with timezone)
        const startDate = thirtyDaysAgo.toISOString().replace('Z', '+00:00');
        const endDate = now.toISOString().replace('Z', '+00:00');

        // Build OData filter - matches the working TPOS request
        const filter = `(Type eq 'invoice' and IsMergeCancel ne true and DateInvoice ge ${startDate} and DateInvoice le ${endDate} and contains(Phone,'${cleanQuery}'))`;

        const url = `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.GetView?$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filter)}&$count=true`;

        console.log('[API] TPOS OData URL:', url);

        try {
            // Use tokenManager.authenticatedFetch() - handles token auto-refresh and proper headers
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[API] TPOS response error:', errorText);
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[API] TPOS response count:', data['@odata.count'], 'orders');

            if (!data.value || data.value.length === 0) {
                return [];
            }

            // Filter: only open and paid orders (exclude draft and cancel)
            const validStates = ['open', 'paid'];
            const filteredOrders = data.value.filter(order => validStates.includes(order.State));

            console.log('[API] Filtered orders (open/paid):', filteredOrders.length, 'of', data.value.length);

            // Map TPOS fields to internal format
            return filteredOrders.map(order => ({
                id: order.Id,
                tposCode: order.Number,
                reference: order.Reference,
                trackingCode: order.TrackingRef || '',
                customer: order.PartnerDisplayName || order.Ship_Receiver_Name || 'N/A',
                phone: order.Phone,
                address: order.FullAddress || order.Address || '',
                cod: order.CashOnDelivery || 0,
                totalAmount: order.AmountTotal || 0,
                status: order.State,
                stateCode: order.StateCode || 'None',
                crossCheckTimes: order.CrossCheckTimes || 0,
                carrier: order.CarrierName || '',
                channel: order.CRMTeamName || 'TPOS',
                products: [], // Will fetch separately via getOrderDetails()
                createdAt: new Date(order.DateInvoice).getTime()
            }));

        } catch (error) {
            console.error('[API] Search orders failed:', error);
            throw error;
        }
    },

    /**
     * Get order details with products (OrderLines)
     * @param {number} orderId - TPOS Order ID
     * @returns {Promise<Object>} Order details with products array
     */
    async getOrderDetails(orderId) {
        if (!orderId) return null;

        // Expand OrderLines with Product info
        const expand = 'Partner,User,Carrier,OrderLines($expand=Product,ProductUOM)';
        const url = `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${orderId})?$expand=${encodeURIComponent(expand)}`;

        console.log('[API] Fetching order details:', orderId);

        try {
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[API] Order details error:', errorText);
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[API] Order details loaded, products:', data.OrderLines?.length || 0);

            // Map to internal format
            return {
                id: data.Id,
                tposCode: data.Number,
                reference: data.Reference,
                trackingCode: data.TrackingRef || '',
                customer: data.PartnerDisplayName || data.Ship_Receiver_Name || 'N/A',
                phone: data.Phone,
                address: data.FullAddress || data.Address || '',
                cod: data.CashOnDelivery || 0,
                amountTotal: data.AmountTotal || 0,
                decreaseAmount: data.DecreaseAmount || 0,
                deliveryPrice: data.DeliveryPrice || 0,
                paymentAmount: data.PaymentAmount || 0,
                status: data.State,
                carrier: data.CarrierName || '',
                channel: data.CRMTeamName || 'TPOS',
                // Map OrderLines to products array
                products: (data.OrderLines || []).map(line => ({
                    id: line.Id,
                    productId: line.ProductId,
                    code: line.ProductBarcode || '',
                    name: line.ProductName || '',
                    quantity: line.ProductUOMQty || 1,
                    price: line.PriceUnit || 0,
                    total: line.PriceTotal || 0,
                    note: line.Note || '',
                    imageUrl: line.ProductImageUrl || ''
                })),
                createdAt: new Date(data.DateInvoice).getTime()
            };

        } catch (error) {
            console.error('[API] Get order details failed:', error);
            throw error;
        }
    },

    /**
     * Create a new ticket
     * @param {Object} ticketData
     */
    async createTicket(ticketData) {
        try {
            const newRef = getTicketsRef().push();
            const ticket = {
                ...ticketData,
                firebaseId: newRef.key,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            await newRef.set(ticket);
            console.log('[API-FB] Ticket created:', ticket.firebaseId);
            return ticket;
        } catch (error) {
            console.error('[API-FB] Create ticket failed:', error);
            throw error;
        }
    },

    /**
     * Update ticket status or content
     * @param {string} firebaseId
     * @param {Object} updates
     */
    async updateTicket(firebaseId, updates) {
        try {
            const ref = getTicketsRef().child(firebaseId);
            await ref.update({
                ...updates,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
            console.log('[API-FB] Ticket updated:', firebaseId);
        } catch (error) {
            console.error('[API-FB] Update ticket failed:', error);
            throw error;
        }
    },

    /**
     * Listen to tickets (real-time)
     * @param {Function} callback - (tickets) => void
     * @returns {Function} unsubscribe function
     */
    subscribeToTickets(callback) {
        const ref = getTicketsRef();
        const listener = ref.on('value', (snapshot) => {
            const data = snapshot.val();
            const tickets = [];
            if (data) {
                Object.keys(data).forEach(key => {
                    tickets.push({ ...data[key], firebaseId: key });
                });
            }
            tickets.sort((a, b) => b.createdAt - a.createdAt);
            callback(tickets);
        });

        return () => ref.off('value', listener);
    },

    /**
     * Process refund (Nhận hàng) - TPOS Refund Flow
     * Flow: ActionRefund -> Get Details -> PUT with SaveAndPrint -> ActionInvoiceOpenV2 -> PrintRefund
     * @param {number} originalOrderId - ID của đơn hàng gốc (tposId)
     * @returns {Promise<{refundOrderId: number, printHtml: string}>}
     */
    async processRefund(originalOrderId) {
        if (!originalOrderId) {
            throw new Error('Missing original order ID');
        }

        console.log('[API] Starting refund process for order:', originalOrderId);

        // ========== FETCH 1: Create Refund Order ==========
        console.log('[API] Step 1: ActionRefund');
        const refundResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.ActionRefund`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ id: originalOrderId })
            }
        );

        if (!refundResponse.ok) {
            const errorText = await refundResponse.text();
            console.error('[API] ActionRefund failed:', errorText);
            throw new Error(`ActionRefund failed: ${refundResponse.status}`);
        }

        const refundData = await refundResponse.json();
        const refundOrderId = refundData.value;
        console.log('[API] Refund order created with ID:', refundOrderId);

        // ========== FETCH 2: Get Refund Order Details ==========
        console.log('[API] Step 2: Get refund order details');
        const expand = 'Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,OfferAmountDetails,DestConvertCurrencyUnit,PackageImages';

        const detailsResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${refundOrderId})?$expand=${encodeURIComponent(expand)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
            }
        );

        if (!detailsResponse.ok) {
            const errorText = await detailsResponse.text();
            console.error('[API] Get refund details failed:', errorText);
            throw new Error(`Get refund details failed: ${detailsResponse.status}`);
        }

        const refundDetails = await detailsResponse.json();
        console.log('[API] Refund order details loaded');

        // ========== FETCH 3: PUT Update with FormAction: SaveAndPrint ==========
        console.log('[API] Step 3: PUT update with SaveAndPrint');

        // Prepare the payload - copy most fields and add FormAction
        const updatePayload = this._prepareRefundUpdatePayload(refundDetails);

        const updateResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${refundOrderId})`,
            {
                method: 'PUT',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify(updatePayload)
            }
        );

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('[API] PUT update failed:', errorText);
            throw new Error(`PUT update failed: ${updateResponse.status}`);
        }

        const updateResult = await updateResponse.json();
        console.log('[API] Refund order updated successfully');

        // ========== FETCH 4: ActionInvoiceOpenV2 - Confirm the order ==========
        console.log('[API] Step 4: ActionInvoiceOpenV2');

        const confirmResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.ActionInvoiceOpenV2`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ ids: [refundOrderId] })
            }
        );

        if (!confirmResponse.ok) {
            const errorText = await confirmResponse.text();
            console.error('[API] ActionInvoiceOpenV2 failed:', errorText);
            throw new Error(`ActionInvoiceOpenV2 failed: ${confirmResponse.status}`);
        }

        const confirmResult = await confirmResponse.json();
        console.log('[API] Refund order confirmed');

        // ========== FETCH 5: Print Refund - Get HTML bill ==========
        console.log('[API] Step 5: PrintRefund');

        // PrintRefund endpoint must go directly to TPOS (not through proxy)
        // because it returns HTML content and proxy doesn't have this route
        const TPOS_DIRECT_URL = 'https://tomato.tpos.vn';
        const printUrl = `${TPOS_DIRECT_URL}/fastsaleorder/PrintRefund/${refundOrderId}`;

        console.log('[API] PrintRefund URL:', printUrl);

        // Get token for authorization header (use getToken() per SHARED_TPOS.md)
        const token = await window.tokenManager.getToken();

        const printResponse = await fetch(printUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!printResponse.ok) {
            const errorText = await printResponse.text();
            console.error('[API] PrintRefund failed:', errorText);
            throw new Error(`PrintRefund failed: ${printResponse.status}`);
        }

        const printHtml = await printResponse.text();
        console.log('[API] Print HTML received, length:', printHtml.length);

        return {
            refundOrderId: refundOrderId,
            printHtml: printHtml,
            confirmResult: confirmResult
        };
    },

    /**
     * Prepare payload for refund order PUT update
     * @private
     */
    _prepareRefundUpdatePayload(details) {
        // Clone the details and add FormAction
        const payload = {
            Id: details.Id,
            Name: details.Name,
            PrintShipCount: details.PrintShipCount,
            PrintDeliveryCount: details.PrintDeliveryCount,
            PaymentMessageCount: details.PaymentMessageCount,
            MessageCount: details.MessageCount,
            PartnerId: details.PartnerId,
            PartnerDisplayName: details.PartnerDisplayName,
            PartnerEmail: details.PartnerEmail,
            PartnerFacebookId: details.PartnerFacebookId,
            PartnerFacebook: details.PartnerFacebook,
            PartnerPhone: details.PartnerPhone,
            Reference: details.Reference,
            PriceListId: details.PriceListId,
            AmountTotal: details.AmountTotal,
            TotalQuantity: details.TotalQuantity,
            Discount: details.Discount,
            DiscountAmount: details.DiscountAmount,
            DecreaseAmount: details.DecreaseAmount,
            DiscountLoyaltyTotal: details.DiscountLoyaltyTotal,
            WeightTotal: details.WeightTotal,
            AmountTax: details.AmountTax,
            AmountUntaxed: details.AmountUntaxed,
            TaxId: details.TaxId,
            MoveId: details.MoveId,
            UserId: details.UserId,
            UserName: details.UserName,
            DateInvoice: details.DateInvoice,
            DateCreated: details.DateCreated,
            CreatedById: details.CreatedById,
            State: details.State,
            ShowState: details.ShowState,
            CompanyId: details.CompanyId,
            Comment: details.Comment,
            WarehouseId: details.WarehouseId,
            SaleOnlineIds: details.SaleOnlineIds || [],
            SaleOnlineNames: details.SaleOnlineNames || [],
            Residual: details.Residual,
            Type: details.Type,
            RefundOrderId: details.RefundOrderId,
            ReferenceNumber: details.ReferenceNumber,
            AccountId: details.AccountId,
            JournalId: details.JournalId,
            Number: details.Number,
            MoveName: details.MoveName,
            PartnerNameNoSign: details.PartnerNameNoSign,
            DeliveryPrice: details.DeliveryPrice,
            CustomerDeliveryPrice: details.CustomerDeliveryPrice,
            CarrierId: details.CarrierId,
            CarrierName: details.CarrierName,
            CarrierDeliveryType: details.CarrierDeliveryType,
            DeliveryNote: details.DeliveryNote,
            ReceiverName: details.ReceiverName,
            ReceiverPhone: details.ReceiverPhone,
            ReceiverAddress: details.ReceiverAddress,
            ReceiverDate: details.ReceiverDate,
            ReceiverNote: details.ReceiverNote,
            CashOnDelivery: details.CashOnDelivery || 0,
            TrackingRef: details.TrackingRef,
            TrackingArea: details.TrackingArea,
            TrackingTransport: details.TrackingTransport,
            TrackingSortLine: details.TrackingSortLine,
            TrackingUrl: details.TrackingUrl || '',
            IsProductDefault: details.IsProductDefault,
            TrackingRefSort: details.TrackingRefSort,
            ShipStatus: details.ShipStatus,
            ShowShipStatus: details.ShowShipStatus,
            SaleOnlineName: details.SaleOnlineName || '',
            PartnerShippingId: details.PartnerShippingId,
            PaymentJournalId: details.PaymentJournalId,
            PaymentAmount: details.PaymentAmount,
            SaleOrderId: details.SaleOrderId,
            SaleOrderIds: details.SaleOrderIds || [],
            FacebookName: details.FacebookName,
            FacebookNameNosign: details.FacebookNameNosign,
            FacebookId: details.FacebookId,
            DisplayFacebookName: details.DisplayFacebookName,
            Deliver: details.Deliver,
            ShipWeight: details.ShipWeight,
            ShipPaymentStatus: details.ShipPaymentStatus,
            ShipPaymentStatusCode: details.ShipPaymentStatusCode,
            OldCredit: details.OldCredit,
            NewCredit: details.NewCredit,
            Phone: details.Phone,
            Address: details.Address,
            AmountTotalSigned: details.AmountTotalSigned,
            ResidualSigned: details.ResidualSigned,
            Origin: details.Origin,
            AmountDeposit: details.AmountDeposit,
            CompanyName: details.CompanyName,
            PreviousBalance: details.PreviousBalance,
            ToPay: details.ToPay,
            NotModifyPriceFromSO: details.NotModifyPriceFromSO,
            Ship_ServiceId: details.Ship_ServiceId,
            Ship_ServiceName: details.Ship_ServiceName,
            Ship_ServiceExtrasText: details.Ship_ServiceExtrasText || '[]',
            Ship_ExtrasText: details.Ship_ExtrasText,
            Ship_InsuranceFee: details.Ship_InsuranceFee,
            CurrencyName: details.CurrencyName,
            TeamId: details.TeamId,
            TeamOrderCode: details.TeamOrderCode,
            TeamOrderId: details.TeamOrderId,
            TeamType: details.TeamType,
            Revenue: details.Revenue,
            SaleOrderDeposit: details.SaleOrderDeposit,
            Seri: details.Seri,
            NumberOrder: details.NumberOrder,
            DateOrderRed: details.DateOrderRed,
            ApplyPromotion: details.ApplyPromotion,
            TimeLock: details.TimeLock,
            PageName: details.PageName,
            Tags: details.Tags,
            IRAttachmentUrl: details.IRAttachmentUrl,
            IRAttachmentUrls: details.IRAttachmentUrls || [],
            SaleOnlinesOfPartner: details.SaleOnlinesOfPartner,
            IsDeposited: details.IsDeposited,
            LiveCampaignName: details.LiveCampaignName,
            LiveCampaignId: details.LiveCampaignId,
            Source: details.Source,
            PartnerExtraInfoHeight: details.PartnerExtraInfoHeight,
            PartnerExtraInfoWeight: details.PartnerExtraInfoWeight,
            CartNote: details.CartNote,
            ExtraPaymentAmount: details.ExtraPaymentAmount,
            QuantityUpdateDeposit: details.QuantityUpdateDeposit,
            IsMergeCancel: details.IsMergeCancel,
            IsPickUpAtShop: details.IsPickUpAtShop,
            DateDeposit: details.DateDeposit,
            IsRefund: details.IsRefund,
            StateCode: details.StateCode,
            ActualPaymentAmount: details.ActualPaymentAmount,
            RowVersion: details.RowVersion,
            ExchangeRate: details.ExchangeRate,
            DestConvertCurrencyUnitId: details.DestConvertCurrencyUnitId,
            WiPointQRCode: details.WiPointQRCode,
            WiInvoiceId: details.WiInvoiceId,
            WiInvoiceChannelId: details.WiInvoiceChannelId,
            WiInvoiceStatus: details.WiInvoiceStatus,
            WiInvoiceTrackingUrl: details.WiInvoiceTrackingUrl || '',
            WiInvoiceIsReplate: details.WiInvoiceIsReplate,
            FormAction: 'SaveAndPrint',  // KEY: This triggers save and print
            Ship_Receiver: details.Ship_Receiver,
            Ship_Extras: details.Ship_Extras,
            PaymentInfo: details.PaymentInfo || [],
            Search: details.Search,
            ShipmentDetailsAship: details.ShipmentDetailsAship || { PackageInfo: { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 } },
            OrderMergeds: details.OrderMergeds || [],
            OrderAfterMerged: details.OrderAfterMerged,
            TPayment: details.TPayment,
            ExtraUpdateCODCarriers: details.ExtraUpdateCODCarriers || [],
            AppliedPromotionLoyalty: details.AppliedPromotionLoyalty,
            FastSaleOrderOmniExtras: details.FastSaleOrderOmniExtras,
            Billing: details.Billing,
            PackageInfo: details.PackageInfo || { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 },
            Error: details.Error,
            // Include nested objects
            Partner: details.Partner,
            User: details.User,
            Warehouse: details.Warehouse,
            Company: details.Company,
            PriceList: details.PriceList,
            RefundOrder: details.RefundOrder,
            Account: details.Account,
            Journal: details.Journal,
            PaymentJournal: details.PaymentJournal,
            Carrier: details.Carrier,
            Tax: details.Tax,
            SaleOrder: details.SaleOrder,
            HistoryDeliveryDetails: details.HistoryDeliveryDetails || [],
            OrderLines: details.OrderLines || [],
            Ship_ServiceExtras: details.Ship_ServiceExtras || [],
            OutstandingInfo: details.OutstandingInfo,
            Team: details.Team,
            OfferAmountDetails: details.OfferAmountDetails || [],
            DestConvertCurrencyUnit: details.DestConvertCurrencyUnit,
            PackageImages: details.PackageImages || []
        };

        return payload;
    }
};
