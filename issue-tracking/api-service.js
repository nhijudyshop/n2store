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

            // Map TPOS fields to internal format
            return data.value.map(order => ({
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
                totalAmount: data.AmountTotal || 0,
                shippingFee: data.DeliveryPrice || 0,
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
    }
};
