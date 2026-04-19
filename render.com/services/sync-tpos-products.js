// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TPOS PRODUCT SYNC SERVICE
 * =====================================================
 *
 * Syncs product catalog from TPOS → PostgreSQL (web_warehouse).
 * Supports full sync and incremental sync.
 *
 * - Full sync: fetches ALL templates + variants (paginated)
 * - Incremental sync: fetches recently updated templates
 * - Hash-based change detection (skip unchanged records)
 * - Rate limited: 5 req/sec to TPOS
 * - Transaction per batch of 50 products
 * - SSE broadcast diffs to connected clients
 *
 * Created: 2026-04-11
 * =====================================================
 */

const crypto = require('crypto');
const { fetchWithRetry } = require('../../shared/node/fetch-utils.cjs');

const TPOS_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const RATE_LIMIT_MS = 200; // 5 req/sec
const PAGE_SIZE = 200;
const BATCH_SIZE = 50; // DB upsert batch size

class TPOSProductSync {
    /**
     * @param {Object} db - PostgreSQL pool
     * @param {Object} tokenManager - TPOSTokenManager instance
     * @param {Function} notifySSE - SSE notification function
     */
    constructor(db, tokenManager, notifySSE = null) {
        this.db = db;
        this.tokenManager = tokenManager;
        this.notifySSE = notifySSE;
        this._isRunning = false;
    }

    // =====================================================
    // TPOS API HELPERS
    // =====================================================

    async _tposFetch(path, options = {}) {
        const headers = await this.tokenManager.getAuthHeader();
        const url = `${TPOS_PROXY}${path}`;

        const response = await fetchWithRetry(url, {
            ...options,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers || {}),
            },
        }, 3, 1000, 15000);

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`TPOS ${response.status}: ${text.substring(0, 200)}`);
        }

        return response.json();
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Compute hash of product fields for change detection
     */
    _computeHash(fields) {
        const str = JSON.stringify(fields);
        return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
    }

    // =====================================================
    // SYNC LOG
    // =====================================================

    async _createSyncLog(syncType) {
        const result = await this.db.query(
            `INSERT INTO tpos_sync_log (sync_type, status) VALUES ($1, 'running') RETURNING id`,
            [syncType]
        );
        return result.rows[0].id;
    }

    async _updateSyncLog(logId, status, stats, errorMessage = null) {
        await this.db.query(
            `UPDATE tpos_sync_log SET status = $2, finished_at = NOW(), stats = $3, error_message = $4 WHERE id = $1`,
            [logId, status, JSON.stringify(stats), errorMessage]
        );
    }

    async _isAlreadyRunning() {
        const result = await this.db.query(
            `SELECT id, started_at FROM tpos_sync_log WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
        );
        if (result.rows.length === 0) return false;

        // Stale check: if running > 10 minutes, consider it dead
        const startedAt = new Date(result.rows[0].started_at);
        const staleMs = 10 * 60 * 1000;
        if (Date.now() - startedAt.getTime() > staleMs) {
            await this.db.query(
                `UPDATE tpos_sync_log SET status = 'stale', finished_at = NOW(), error_message = 'Auto-reset: stale > 10min' WHERE id = $1`,
                [result.rows[0].id]
            );
            return false;
        }
        return true;
    }

    // =====================================================
    // FULL SYNC
    // =====================================================

    /**
     * Full sync: fetch ALL TPOS product templates + variants → upsert into web_warehouse
     */
    async fullSync() {
        if (this._isRunning) {
            console.log('[SYNC] Already running, skip');
            return { skipped: true };
        }

        if (await this._isAlreadyRunning()) {
            console.log('[SYNC] Another sync is running, skip');
            return { skipped: true };
        }

        this._isRunning = true;
        const logId = await this._createSyncLog('full');
        const syncStartedAt = new Date();
        const stats = { templates: 0, variants: 0, inserted: 0, updated: 0, unchanged: 0, errors: 0, deactivated: 0 };

        console.log('[SYNC] === Full sync started ===');

        try {
            // 1. Fetch all templates paginated
            let skip = 0;
            let totalTemplates = 0;
            let allTemplateIds = [];

            do {
                const data = await this._tposFetch(
                    `/api/odata/ProductTemplate/ODataService.GetViewV2?Active=true&$top=${PAGE_SIZE}&$skip=${skip}&$count=true&$orderby=Id asc`
                );

                if (skip === 0) {
                    totalTemplates = data['@odata.count'] || 0;
                    console.log(`[SYNC] Total templates in TPOS: ${totalTemplates}`);
                }

                const templates = data.value || [];
                if (templates.length === 0) break;

                // 2. For each template, fetch variants
                for (const template of templates) {
                    try {
                        await this._syncTemplate(template, syncStartedAt, stats);
                        allTemplateIds.push(template.Id);
                        stats.templates++;
                    } catch (err) {
                        console.error(`[SYNC] Error syncing template ${template.Id}:`, err.message);
                        stats.errors++;
                    }
                    await this._delay(RATE_LIMIT_MS);
                }

                skip += PAGE_SIZE;
                console.log(`[SYNC] Progress: ${skip}/${totalTemplates} templates processed`);

            } while (skip < totalTemplates);

            // 3. Deactivate products originating from TPOS that were not seen in this full sync.
            // Guard with tpos_template_id IS NOT NULL to avoid deactivating manual/local entries.
            const deactivated = await this.db.query(
                `UPDATE web_warehouse SET active = false, updated_at = NOW()
                 WHERE tpos_template_id IS NOT NULL
                   AND (last_synced_at IS NULL OR last_synced_at < $1)
                   AND active = true`,
                [syncStartedAt]
            );
            stats.deactivated = deactivated.rowCount;

            await this._updateSyncLog(logId, 'success', stats);
            console.log('[SYNC] === Full sync completed ===', JSON.stringify(stats));

            // SSE notify
            if (this.notifySSE) {
                this.notifySSE('web_warehouse', { action: 'sync_complete', syncType: 'full', stats }, 'update');
            }

            return stats;

        } catch (error) {
            console.error('[SYNC] Full sync failed:', error.message);
            await this._updateSyncLog(logId, 'failed', stats, error.message);
            throw error;
        } finally {
            this._isRunning = false;
        }
    }

    /**
     * Sync a single template + its variants
     * @param {Object} templateData - Basic template data
     * @param {Date} syncStartedAt
     * @param {Object} stats
     * @param {Object|null} preloadedDetail - Optional pre-fetched detail (with ProductVariants) to skip extra TPOS call
     */
    async _syncTemplate(templateData, syncStartedAt, stats, preloadedDetail = null) {
        // Use pre-fetched detail if provided (saves a round-trip to TPOS)
        const detail = preloadedDetail || await this._tposFetch(
            `/api/odata/ProductTemplate(${templateData.Id})?$expand=ProductVariants($expand=AttributeValues)`
        );

        const variants = detail.ProductVariants || [];

        if (variants.length === 0) {
            // Template without variants — sync as single product
            await this._upsertProduct({
                product_code: templateData.DefaultCode || `T${templateData.Id}`,
                parent_product_code: null,
                product_name: templateData.Name,
                name_get: templateData.NameGet || templateData.Name,
                variant: null,
                category: templateData.CategCompleteName || '',
                image_url: templateData.ImageUrl || detail.ImageUrl || null,
                barcode: templateData.Barcode || null,
                uom_name: templateData.UOMName || 'Cái',
                selling_price: templateData.ListPrice || 0,
                purchase_price: templateData.PurchasePrice || 0,
                standard_price: templateData.StandardPrice || 0,
                tpos_qty_available: templateData.QtyAvailable || 0,
                tpos_product_id: templateData.Id,
                tpos_template_id: templateData.Id,
            }, syncStartedAt, stats);
            stats.variants++;
            return;
        }

        // Template with variants — sync each variant
        const templateCode = templateData.DefaultCode || `T${templateData.Id}`;

        for (const variant of variants) {
            if (!variant.Active) continue;

            // Build variant display name
            const attrParts = (variant.AttributeValues || [])
                .map(a => a.Name)
                .filter(Boolean);
            const variantStr = attrParts.join(', ');
            const nameGet = variant.NameGet || (variantStr
                ? `[${variant.DefaultCode || templateCode}] ${templateData.Name} (${variantStr})`
                : `[${variant.DefaultCode || templateCode}] ${templateData.Name}`);

            await this._upsertProduct({
                product_code: variant.DefaultCode || variant.Barcode || `V${variant.Id}`,
                parent_product_code: templateCode,
                product_name: templateData.Name,
                name_get: nameGet,
                variant: variantStr || null,
                category: templateData.CategCompleteName || '',
                image_url: variant.ImageUrl || templateData.ImageUrl || detail.ImageUrl || null,
                barcode: variant.Barcode || null,
                uom_name: templateData.UOMName || variant.UOMName || 'Cái',
                selling_price: variant.PriceVariant || variant.ListPrice || templateData.ListPrice || 0,
                purchase_price: variant.PurchasePrice || templateData.PurchasePrice || 0,
                standard_price: variant.StandardPrice || templateData.StandardPrice || 0,
                tpos_qty_available: variant.QtyAvailable || 0,
                tpos_product_id: variant.Id,
                tpos_template_id: templateData.Id,
            }, syncStartedAt, stats);
            stats.variants++;
        }
    }

    /**
     * Upsert a single product into web_warehouse
     * - If exists: update product info only (preserve quantity, source_po_ids)
     * - If new: insert with quantity=0
     */
    async _upsertProduct(product, syncStartedAt, stats) {
        const hash = this._computeHash({
            name: product.product_name,
            nameGet: product.name_get,
            variant: product.variant,
            sellingPrice: product.selling_price,
            purchasePrice: product.purchase_price,
            imageUrl: product.image_url,
            qtyAvailable: product.tpos_qty_available,
            category: product.category,
        });

        // Check existing
        const existing = await this.db.query(
            'SELECT id, data_hash FROM web_warehouse WHERE product_code = $1',
            [product.product_code]
        );

        if (existing.rows.length > 0) {
            // Existing product — check if changed
            if (existing.rows[0].data_hash === hash) {
                // Only update sync timestamp
                await this.db.query(
                    'UPDATE web_warehouse SET last_synced_at = $2, active = true WHERE id = $1',
                    [existing.rows[0].id, syncStartedAt]
                );
                stats.unchanged++;
                return;
            }

            // Changed — update product info (preserve quantity + source_po_ids)
            await this.db.query(
                `UPDATE web_warehouse SET
                    parent_product_code = COALESCE($2, parent_product_code),
                    product_name = $3,
                    name_get = $4,
                    variant = $5,
                    category = $6,
                    image_url = COALESCE($7, image_url),
                    barcode = $8,
                    uom_name = $9,
                    selling_price = CASE WHEN $10::numeric > 0 THEN $10::numeric ELSE selling_price END,
                    purchase_price = CASE WHEN $11::numeric > 0 THEN $11::numeric ELSE purchase_price END,
                    standard_price = $12,
                    tpos_qty_available = $13,
                    tpos_product_id = COALESCE($14, tpos_product_id),
                    tpos_template_id = $15,
                    data_hash = $16,
                    last_synced_at = $17,
                    active = true,
                    updated_at = NOW()
                WHERE id = $1`,
                [
                    existing.rows[0].id,
                    product.parent_product_code,
                    product.product_name,
                    product.name_get,
                    product.variant,
                    product.category,
                    product.image_url,
                    product.barcode,
                    product.uom_name,
                    product.selling_price || 0,
                    product.purchase_price || 0,
                    product.standard_price || 0,
                    product.tpos_qty_available || 0,
                    product.tpos_product_id,
                    product.tpos_template_id,
                    hash,
                    syncStartedAt,
                ]
            );
            stats.updated++;
        } else {
            // New product — insert with quantity=0
            const maxSttResult = await this.db.query('SELECT COALESCE(MAX(stt), 0) as max_stt FROM web_warehouse');
            const nextStt = maxSttResult.rows[0].max_stt + 1;

            await this.db.query(
                `INSERT INTO web_warehouse (
                    stt, product_code, parent_product_code, product_name, name_get,
                    variant, category, image_url, barcode, uom_name,
                    selling_price, purchase_price, standard_price,
                    tpos_qty_available, tpos_product_id, tpos_template_id,
                    quantity, data_hash, last_synced_at, active, source_po_ids
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$17,$18,true,'{}')`,
                [
                    nextStt,
                    product.product_code,
                    product.parent_product_code,
                    product.product_name,
                    product.name_get,
                    product.variant,
                    product.category,
                    product.image_url,
                    product.barcode,
                    product.uom_name,
                    product.selling_price || 0,
                    product.purchase_price || 0,
                    product.standard_price || 0,
                    product.tpos_qty_available || 0,
                    product.tpos_product_id,
                    product.tpos_template_id,
                    hash,
                    syncStartedAt,
                ]
            );
            stats.inserted++;
        }
    }

    // =====================================================
    // INCREMENTAL SYNC
    // =====================================================

    /**
     * Incremental sync: paginate recently updated templates.
     * Stops early when a full page returns only 'unchanged' rows (hash match),
     * which means we've reached the unchanged-history frontier.
     *
     * @param {Object} options
     * @param {number} options.maxPages - hard cap on pages (default 10 = up to 2000 templates)
     * @param {number} options.pageSize - templates per page (default 200)
     */
    async incrementalSync(options = {}) {
        const { maxPages = 10, pageSize = 200 } = options;

        if (this._isRunning) return { skipped: true };
        if (await this._isAlreadyRunning()) return { skipped: true };

        this._isRunning = true;
        const logId = await this._createSyncLog('incremental');
        const syncStartedAt = new Date();
        const stats = { templates: 0, variants: 0, inserted: 0, updated: 0, unchanged: 0, errors: 0, pages: 0 };

        console.log('[SYNC] === Incremental sync started ===');

        try {
            for (let page = 0; page < maxPages; page++) {
                const skip = page * pageSize;
                const data = await this._tposFetch(
                    `/api/odata/ProductTemplate/ODataService.GetViewV2?Active=true&$top=${pageSize}&$skip=${skip}&$count=true&$orderby=DateCreated desc`
                );

                const templates = data.value || [];
                if (templates.length === 0) break;

                stats.pages++;
                const unchangedBefore = stats.unchanged;
                console.log(`[SYNC] Incremental page ${page + 1}: ${templates.length} templates (skip=${skip})`);

                for (const template of templates) {
                    try {
                        await this._syncTemplate(template, syncStartedAt, stats);
                        stats.templates++;
                    } catch (err) {
                        console.error(`[SYNC] Error syncing template ${template.Id}:`, err.message);
                        stats.errors++;
                    }
                    await this._delay(RATE_LIMIT_MS);
                }

                // Early-stop: if entire page was unchanged (hash match), older pages are too.
                const unchangedThisPage = stats.unchanged - unchangedBefore;
                if (unchangedThisPage === templates.length) {
                    console.log('[SYNC] Incremental: full page unchanged, stopping pagination');
                    break;
                }

                // No more pages if we fetched less than a full page
                if (templates.length < pageSize) break;
            }

            await this._updateSyncLog(logId, 'success', stats);
            console.log('[SYNC] === Incremental sync completed ===', JSON.stringify(stats));

            if (this.notifySSE && (stats.inserted > 0 || stats.updated > 0)) {
                this.notifySSE('web_warehouse', { action: 'sync_complete', syncType: 'incremental', stats }, 'update');
            }

            return stats;

        } catch (error) {
            console.error('[SYNC] Incremental sync failed:', error.message);
            await this._updateSyncLog(logId, 'failed', stats, error.message);
            return stats;
        } finally {
            this._isRunning = false;
        }
    }

    // =====================================================
    // CRON MANAGEMENT
    // =====================================================

    /**
     * Start cron: incremental sync every intervalMs
     */
    startCron(intervalMs = 30 * 60 * 1000) {
        if (this._cronInterval) {
            clearInterval(this._cronInterval);
        }

        console.log(`[SYNC] Cron started: incremental sync every ${intervalMs / 60000} minutes`);

        this._cronInterval = setInterval(async () => {
            try {
                await this.incrementalSync();
            } catch (err) {
                console.error('[SYNC] Cron sync error:', err.message);
            }
        }, intervalMs);

        return this._cronInterval;
    }

    stopCron() {
        if (this._cronInterval) {
            clearInterval(this._cronInterval);
            this._cronInterval = null;
            console.log('[SYNC] Cron stopped');
        }
    }

    /**
     * Get sync status
     */
    async getStatus() {
        const lastSync = await this.db.query(
            `SELECT * FROM tpos_sync_log ORDER BY started_at DESC LIMIT 1`
        );

        const productCount = await this.db.query(
            `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active) as active,
                    COUNT(*) FILTER (WHERE quantity > 0) as with_inventory
             FROM web_warehouse`
        );

        return {
            isRunning: this._isRunning,
            cronActive: !!this._cronInterval,
            lastSync: lastSync.rows[0] || null,
            products: productCount.rows[0],
        };
    }

    /**
     * Get sync log history
     */
    async getLog(limit = 20) {
        const result = await this.db.query(
            `SELECT * FROM tpos_sync_log ORDER BY started_at DESC LIMIT $1`,
            [limit]
        );
        return result.rows;
    }
}

module.exports = TPOSProductSync;
