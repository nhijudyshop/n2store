// api-service.js
// Abstraction layer for API calls (TPOS, Firebase, LocalStorage)

const ApiService = {
    // Always use Firebase mode
    mode: 'FIREBASE',

    /**
     * Search orders from TPOS via TPOS OData Proxy
     * @param {string} query - Phone number or Order Code
     * @returns {Promise<Array>} List of mapped orders
     */
    async searchOrders(query) {
        if (!query) return [];

        // TODO: Implement real TPOS API search
        console.log(`[API] Searching orders for: ${query}`);
        // Placeholder - return empty for now until TPOS integration
        return [];
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
