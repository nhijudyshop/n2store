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
                products: [], // Will fetch separately if needed
                createdAt: new Date(order.DateInvoice).getTime()
            }));

        } catch (error) {
            console.error('[API] Search orders failed:', error);
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
