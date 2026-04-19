// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TPOS SOCKET.IO LISTENER
 * =====================================================
 *
 * Connects to TPOS real-time server (rt-2.tpos.app)
 * via Socket.IO to receive product change events.
 *
 * When product events are received, triggers sync of
 * affected products into web_warehouse (PostgreSQL).
 *
 * TPOS Socket.IO details:
 * - Server: https://rt-2.tpos.app
 * - Namespace: /chatomni
 * - Transport: websocket only
 * - Auth: { token: accessToken } in handshake
 * - Room: tomato.tpos.vn (query param)
 * - Event: "on-events" — all messages as JSON string
 *
 * Product events:
 * - ProductTemplate: created, deleted, deletedIds, set_active,
 *                    updatefromfile, import_file, clearcache
 * - Product: inventory_updated, update_price_file, deleted
 *
 * Created: 2026-04-11
 * =====================================================
 */

const { io } = require('socket.io-client');

const TPOS_SOCKET_URL = 'https://rt-2.tpos.app';
const TPOS_NAMESPACE = '/chatomni';
const TPOS_ROOM = 'tomato.tpos.vn';

// Debounce sync calls to avoid hammering TPOS API
const SYNC_DEBOUNCE_MS = 3000; // Wait 3s after last event before syncing

class TPOSSocketListener {
    /**
     * @param {Object} tokenManager - TPOSTokenManager instance
     * @param {Object} syncService - TPOSProductSync instance
     * @param {Function} notifySSE - SSE notify function for broadcasting to browser clients
     */
    constructor(tokenManager, syncService, notifySSE = null) {
        this.tokenManager = tokenManager;
        this.syncService = syncService;
        this.notifySSE = notifySSE;
        this.socket = null;
        this._connected = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 50;
        this._syncTimer = null;
        this._pendingTemplateIds = new Set();
        this._pendingActions = [];
        this._stats = {
            eventsReceived: 0,
            productEvents: 0,
            syncsTriggered: 0,
            errors: 0,
            connectedAt: null,
            lastEventAt: null,
        };
    }

    // =====================================================
    // CONNECTION
    // =====================================================

    async connect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        try {
            const token = await this.tokenManager.getToken();
            if (!token) {
                console.error('[TPOS-SOCKET] No token available, cannot connect');
                this._scheduleReconnect();
                return;
            }

            console.log('[TPOS-SOCKET] Connecting to', TPOS_SOCKET_URL + TPOS_NAMESPACE);

            this.socket = io(`${TPOS_SOCKET_URL}${TPOS_NAMESPACE}`, {
                transports: ['websocket'],
                query: { room: TPOS_ROOM },
                reconnectionDelayMax: 5000,
                reconnectionAttempts: this._maxReconnectAttempts,
                auth: { token },
            });

            this._setupListeners();

        } catch (error) {
            console.error('[TPOS-SOCKET] Connection error:', error.message);
            this._stats.errors++;
            this._scheduleReconnect();
        }
    }

    _setupListeners() {
        const socket = this.socket;
        if (!socket) return;

        socket.on('connect', () => {
            this._connected = true;
            this._reconnectAttempts = 0;
            this._stats.connectedAt = new Date();
            console.log('[TPOS-SOCKET] Connected to TPOS real-time server');

            if (this.notifySSE) {
                this.notifySSE('tpos_socket', { status: 'connected', timestamp: Date.now() }, 'update');
            }
        });

        socket.on('disconnect', (reason) => {
            this._connected = false;
            console.warn('[TPOS-SOCKET] Disconnected:', reason);

            if (reason === 'io server disconnect') {
                // Server forced disconnect — likely auth expired, reconnect with fresh token
                this._reconnectWithNewToken();
            }
        });

        socket.on('connect_error', (error) => {
            this._connected = false;
            this._stats.errors++;
            console.error('[TPOS-SOCKET] Connection error:', error.message);

            this._reconnectAttempts++;
            if (this._reconnectAttempts >= this._maxReconnectAttempts) {
                console.error('[TPOS-SOCKET] Max reconnect attempts reached, will retry in 5 minutes');
                setTimeout(() => {
                    this._reconnectAttempts = 0;
                    this._reconnectWithNewToken();
                }, 5 * 60 * 1000);
            }
        });

        // Main event handler — all TPOS messages come through here
        socket.on('on-events', (rawData) => {
            this._stats.eventsReceived++;
            this._stats.lastEventAt = new Date();

            try {
                const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
                this._handleEvent(data);
            } catch (err) {
                console.warn('[TPOS-SOCKET] Event parse error:', err.message);
            }
        });
    }

    // =====================================================
    // EVENT HANDLING
    // =====================================================

    _handleEvent(data) {
        const type = data.type || data.Type || '';
        const action = data.action || '';

        // Only handle product-related events
        if (type === 'ProductTemplate') {
            this._handleProductTemplateEvent(action, data);
        } else if (type === 'Product') {
            this._handleProductEvent(action, data);
        } else if (type === 'ProductInventory') {
            this._handleInventoryEvent(action, data);
        }
        // Ignore all other event types (CRMTeam, Staff, SaleOnline_Order, etc.)
    }

    _handleProductTemplateEvent(action, data) {
        this._stats.productEvents++;
        console.log(`[TPOS-SOCKET] ProductTemplate.${action}`, data.data?.Id || data.data?.Ids || '');

        switch (action) {
            case 'created':
                // Product created or updated — sync this template
                if (data.data?.Id) {
                    this._queueTemplateSync(data.data.Id);
                }
                break;

            case 'deleted':
                // Template deleted — mark inactive in web_warehouse
                if (data.data?.Id) {
                    this._deactivateTemplate(data.data.Id);
                }
                break;

            case 'deletedIds':
                // Bulk delete — mark inactive
                if (data.data?.Ids && Array.isArray(data.data.Ids)) {
                    data.data.Ids.forEach(id => this._deactivateTemplate(id));
                }
                break;

            case 'set_active':
                // Active status changed — re-sync
                if (data.data?.Id) {
                    this._queueTemplateSync(data.data.Id);
                }
                break;

            case 'updatefromfile':
            case 'import_file':
                // Bulk update from file — trigger incremental sync
                this._queueIncrementalSync();
                break;

            case 'clearcache':
                // Cache cleared — trigger incremental sync
                this._queueIncrementalSync();
                break;

            default:
                console.log(`[TPOS-SOCKET] Unhandled ProductTemplate action: ${action}`);
        }
    }

    _handleProductEvent(action, data) {
        this._stats.productEvents++;
        console.log(`[TPOS-SOCKET] Product.${action}`);

        switch (action) {
            case 'inventory_updated':
                // Inventory changed — sync affected products
                if (data.data?.Products && Array.isArray(data.data.Products)) {
                    data.data.Products.forEach(p => {
                        if (p.ProductTmplId) this._queueTemplateSync(p.ProductTmplId);
                    });
                } else {
                    // No specific products — incremental sync
                    this._queueIncrementalSync();
                }
                break;

            case 'update_price_file':
                // Price update from file — incremental sync
                this._queueIncrementalSync();
                break;

            case 'deleted':
                // Variant deleted — sync parent template
                if (data.data?.ProductTmplId) {
                    this._queueTemplateSync(data.data.ProductTmplId);
                }
                break;

            default:
                console.log(`[TPOS-SOCKET] Unhandled Product action: ${action}`);
        }
    }

    _handleInventoryEvent(action, data) {
        this._stats.productEvents++;
        // ProductInventory update — sync affected templates
        if (data.data?.ProductId) {
            // Need to find template ID — queue for sync by product ID
            this._queueIncrementalSync();
        }
    }

    // =====================================================
    // SYNC QUEUE (debounced)
    // =====================================================

    /**
     * Queue a specific template for sync (debounced)
     */
    _queueTemplateSync(templateId) {
        this._pendingTemplateIds.add(templateId);
        this._scheduleSyncFlush();
    }

    /**
     * Queue an incremental sync (debounced)
     */
    _queueIncrementalSync() {
        this._pendingActions.push('incremental');
        this._scheduleSyncFlush();
    }

    /**
     * Schedule sync flush after debounce period
     */
    _scheduleSyncFlush() {
        if (this._syncTimer) clearTimeout(this._syncTimer);

        this._syncTimer = setTimeout(async () => {
            await this._flushSync();
        }, SYNC_DEBOUNCE_MS);
    }

    /**
     * Flush pending sync operations
     */
    async _flushSync() {
        const templateIds = Array.from(this._pendingTemplateIds);
        const hasIncremental = this._pendingActions.includes('incremental');

        this._pendingTemplateIds.clear();
        this._pendingActions = [];

        if (templateIds.length === 0 && !hasIncremental) return;

        this._stats.syncsTriggered++;

        try {
            if (hasIncremental || templateIds.length > 10) {
                // Too many templates or incremental requested — full incremental sync
                console.log(`[TPOS-SOCKET] Triggering incremental sync (${templateIds.length} templates + incremental flag)`);
                await this.syncService.incrementalSync();
            } else if (templateIds.length > 0) {
                // Sync specific templates
                console.log(`[TPOS-SOCKET] Syncing ${templateIds.length} specific templates:`, templateIds);
                await this._syncSpecificTemplates(templateIds);
            }
        } catch (error) {
            console.error('[TPOS-SOCKET] Sync flush error:', error.message);
            this._stats.errors++;
        }
    }

    /**
     * Sync specific templates by ID (faster than full incremental)
     */
    async _syncSpecificTemplates(templateIds) {
        const syncStartedAt = new Date();
        const stats = { templates: 0, variants: 0, inserted: 0, updated: 0, unchanged: 0, errors: 0 };

        for (const templateId of templateIds) {
            try {
                // Fetch template from TPOS
                const data = await this.syncService._tposFetch(
                    `/api/odata/ProductTemplate(${templateId})?$expand=ProductVariants($expand=AttributeValues)`
                );

                if (data && data.Id) {
                    // Build a templateData-like object for _syncTemplate
                    const templateData = {
                        Id: data.Id,
                        Name: data.Name,
                        NameGet: data.NameGet,
                        DefaultCode: data.DefaultCode,
                        Barcode: data.Barcode,
                        ListPrice: data.ListPrice,
                        PurchasePrice: data.PurchasePrice,
                        StandardPrice: data.StandardPrice,
                        QtyAvailable: data.QtyAvailable,
                        ImageUrl: data.ImageUrl,
                        CategCompleteName: data.CategCompleteName,
                        UOMName: data.UOMName,
                    };

                    // Pass pre-fetched detail to skip duplicate TPOS call inside _syncTemplate
                    await this.syncService._syncTemplate(
                        templateData,
                        syncStartedAt,
                        stats,
                        data
                    );
                    stats.templates++;
                }

                await this.syncService._delay(200);
            } catch (err) {
                console.error(`[TPOS-SOCKET] Error syncing template ${templateId}:`, err.message);
                stats.errors++;
            }
        }

        console.log('[TPOS-SOCKET] Specific sync completed:', JSON.stringify(stats));

        // Notify browser clients
        if (this.notifySSE && (stats.inserted > 0 || stats.updated > 0)) {
            this.notifySSE('web_warehouse', {
                action: 'sync_complete',
                syncType: 'realtime',
                stats,
                templateIds,
            }, 'update');
        }
    }

    /**
     * Deactivate a template (mark all its variants as inactive)
     */
    async _deactivateTemplate(templateId) {
        try {
            const db = this.syncService.db;
            const result = await db.query(
                `UPDATE web_warehouse SET active = false, updated_at = NOW()
                 WHERE tpos_template_id = $1 AND active = true`,
                [templateId]
            );

            if (result.rowCount > 0) {
                console.log(`[TPOS-SOCKET] Deactivated ${result.rowCount} products for template ${templateId}`);
                if (this.notifySSE) {
                    this.notifySSE('web_warehouse', {
                        action: 'deactivated',
                        templateId,
                        count: result.rowCount,
                    }, 'update');
                }
            }
        } catch (error) {
            console.error(`[TPOS-SOCKET] Error deactivating template ${templateId}:`, error.message);
        }
    }

    // =====================================================
    // RECONNECT LOGIC
    // =====================================================

    async _reconnectWithNewToken() {
        console.log('[TPOS-SOCKET] Reconnecting with fresh token...');
        try {
            await this.tokenManager.refresh();
            await this.connect();
        } catch (error) {
            console.error('[TPOS-SOCKET] Reconnect with new token failed:', error.message);
            this._scheduleReconnect();
        }
    }

    _scheduleReconnect() {
        const delay = Math.min(30000, 1000 * Math.pow(2, this._reconnectAttempts));
        console.log(`[TPOS-SOCKET] Reconnecting in ${delay / 1000}s (attempt ${this._reconnectAttempts + 1})`);
        setTimeout(() => this.connect(), delay);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this._connected = false;
        if (this._syncTimer) clearTimeout(this._syncTimer);
        console.log('[TPOS-SOCKET] Disconnected');
    }

    isConnected() {
        return this._connected;
    }

    getStats() {
        return {
            ...this._stats,
            connected: this._connected,
            pendingTemplates: this._pendingTemplateIds.size,
            reconnectAttempts: this._reconnectAttempts,
        };
    }
}

module.exports = TPOSSocketListener;
