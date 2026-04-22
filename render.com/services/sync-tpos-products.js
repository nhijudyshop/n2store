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

    /**
     * Serialize an array of objects to a stable JSON string — sorts by the first numeric Id-like key.
     * Prevents false-positive hash mismatches when TPOS returns identical data in different order.
     */
    _stableJson(arr) {
        if (!Array.isArray(arr)) return JSON.stringify(arr ?? []);
        const sorted = arr.slice().sort((a, b) => {
            const aKey = a?.Id ?? a?.AttributeId ?? a?.PartnerId ?? a?.ProductId ?? a?.UOMId ?? 0;
            const bKey = b?.Id ?? b?.AttributeId ?? b?.PartnerId ?? b?.ProductId ?? b?.UOMId ?? 0;
            return aKey - bKey;
        });
        return JSON.stringify(sorted);
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
        // Full $expand mirrors render.com/config/tpos.config.js — all nested relations user expects from TPOS.
        // Partner nested-expand removed (TPOS dropped this navigation property; caused HTTP 400 on every sync).
        const expand = 'UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines($expand=Attribute,Values),UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos';
        const detail = preloadedDetail || await this._tposFetch(
            `/api/odata/ProductTemplate(${templateData.Id})?$expand=${encodeURIComponent(expand)}`
        );

        const variants = detail.ProductVariants || [];

        // Fields shared between template-level + variant rows (TPOS parity — all extra columns)
        const templateShared = {
            description_sale: detail.DescriptionSale || null,
            description_purchase: detail.DescriptionPurchase || null,
            description: detail.Description || null,
            discount_sale: detail.DiscountSale || 0,
            discount_purchase: detail.DiscountPurchase || 0,
            weight: detail.Weight || 0,
            tracking: detail.Tracking || 'none',
            sale_ok: detail.SaleOK !== false,
            purchase_ok: detail.PurchaseOK !== false,
            available_in_pos: detail.AvailableInPOS !== false,
            invoice_policy: detail.InvoicePolicy || null,
            purchase_method: detail.PurchaseMethod || null,
            categ_id: detail.CategId || null,
            pos_categ_id: detail.POSCategId || null,
            uom_id: detail.UOMId || null,
            uom_po_id: detail.UOMPOId || null,
            is_combo: !!detail.IsCombo,
            // Stable order: sort by Id-like keys so TPOS reordering doesn't flip hash.
            tags: this._stableJson(detail.Tags || []),
            attribute_lines: this._stableJson(detail.AttributeLines || []),
            uom_lines: this._stableJson(detail.UOMLines || []),
            combo_products: this._stableJson(detail.ComboProducts || []),
            supplier_infos: this._stableJson(detail.ProductSupplierInfos || []),
        };

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
                price_variant: null,
                variant_attribute_values: JSON.stringify([]),
                tpos_raw: JSON.stringify(detail),
                ...templateShared,
            }, syncStartedAt, stats);
            stats.variants++;
            return;
        }

        // Template with variants — sync each variant
        const templateCode = templateData.DefaultCode || `T${templateData.Id}`;

        for (const variant of variants) {
            if (!variant.Active) continue;

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
                price_variant: variant.PriceVariant ?? null,
                variant_attribute_values: this._stableJson(variant.AttributeValues || []),
                tpos_raw: JSON.stringify(variant),
                ...templateShared,
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
        // Hash covers all 36 extracted TPOS-sourced fields. tpos_raw is NOT included —
        // it's a passthrough snapshot that would add false positives (JSON key/order noise).
        // JSONB arrays (tags, attribute_lines, ...) are already stable-sorted via _stableJson.
        const hash = this._computeHash({
            name: product.product_name,
            nameGet: product.name_get,
            variant: product.variant,
            sellingPrice: product.selling_price,
            purchasePrice: product.purchase_price,
            standardPrice: product.standard_price,
            imageUrl: product.image_url,
            qtyAvailable: product.tpos_qty_available,
            category: product.category,
            descSale: product.description_sale,
            descPurchase: product.description_purchase,
            desc: product.description,
            discSale: product.discount_sale,
            discPurchase: product.discount_purchase,
            weight: product.weight,
            tracking: product.tracking,
            saleOk: product.sale_ok,
            purchaseOk: product.purchase_ok,
            posOk: product.available_in_pos,
            invoicePolicy: product.invoice_policy,
            purchaseMethod: product.purchase_method,
            categId: product.categ_id,
            posCategId: product.pos_categ_id,
            uomId: product.uom_id,
            uomPOId: product.uom_po_id,
            isCombo: product.is_combo,
            tags: product.tags,
            attrLines: product.attribute_lines,
            uomLines: product.uom_lines,
            combos: product.combo_products,
            suppliers: product.supplier_infos,
            variantAttrs: product.variant_attribute_values,
            priceVariant: product.price_variant,
        });

        const existing = await this.db.query(
            'SELECT id, data_hash FROM web_warehouse WHERE product_code = $1',
            [product.product_code]
        );

        // Full column set for INSERT / UPDATE (TPOS parity)
        const cols = [
            'parent_product_code', 'product_name', 'name_get', 'variant', 'category',
            'image_url', 'barcode', 'uom_name',
            'selling_price', 'purchase_price', 'standard_price',
            'tpos_qty_available', 'tpos_product_id', 'tpos_template_id',
            'description_sale', 'description_purchase', 'description',
            'discount_sale', 'discount_purchase',
            'weight', 'tracking',
            'sale_ok', 'purchase_ok', 'available_in_pos',
            'invoice_policy', 'purchase_method',
            'categ_id', 'pos_categ_id', 'uom_id', 'uom_po_id',
            'is_combo', 'price_variant',
            'tags', 'attribute_lines', 'uom_lines', 'combo_products', 'supplier_infos',
            'variant_attribute_values', 'tpos_raw',
        ];
        const values = cols.map(c => product[c] ?? null);
        // numeric/decimal fallbacks
        const numericCols = ['selling_price', 'purchase_price', 'standard_price', 'tpos_qty_available', 'discount_sale', 'discount_purchase', 'weight'];
        numericCols.forEach(c => {
            const idx = cols.indexOf(c);
            if (values[idx] == null) values[idx] = 0;
        });

        if (existing.rows.length > 0) {
            if (existing.rows[0].data_hash === hash) {
                await this.db.query(
                    'UPDATE web_warehouse SET last_synced_at = $2, active = true WHERE id = $1',
                    [existing.rows[0].id, syncStartedAt]
                );
                stats.unchanged++;
                return;
            }

            // Build UPDATE — $1 = existing.id, $2+ = columns, $N = hash, $N+1 = syncStartedAt
            const setClauses = cols.map((c, i) => {
                if (c === 'parent_product_code' || c === 'image_url' || c === 'tpos_product_id') {
                    return `${c} = COALESCE($${i+2}, ${c})`;
                }
                return `${c} = $${i+2}`;
            });
            setClauses.push(`data_hash = $${cols.length+2}`);
            setClauses.push(`last_synced_at = $${cols.length+3}`);
            setClauses.push(`active = true`);
            setClauses.push(`updated_at = NOW()`);

            await this.db.query(
                `UPDATE web_warehouse SET ${setClauses.join(', ')} WHERE id = $1`,
                [existing.rows[0].id, ...values, hash, syncStartedAt]
            );
            stats.updated++;
        } else {
            const maxSttResult = await this.db.query('SELECT COALESCE(MAX(stt), 0) as max_stt FROM web_warehouse');
            const nextStt = maxSttResult.rows[0].max_stt + 1;

            // Build INSERT — prepend stt + product_code to cols, append quantity/source_po_ids/hash/sync/active
            const allCols = ['stt', 'product_code', ...cols, 'quantity', 'source_po_ids', 'data_hash', 'last_synced_at', 'active'];
            const allValues = [nextStt, product.product_code, ...values, 0, '{}', hash, syncStartedAt, true];
            const placeholders = allCols.map((_, i) => `$${i+1}`).join(', ');

            await this.db.query(
                `INSERT INTO web_warehouse (${allCols.join(', ')}) VALUES (${placeholders})`,
                allValues
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
