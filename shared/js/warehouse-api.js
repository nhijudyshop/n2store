// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * WarehouseAPI — Shared client for Render web_warehouse endpoints
 * Used by: soluong-live, order-management (replacing direct TPOS Excel/OData calls)
 *
 * Endpoints:
 *   GET /api/v2/web-warehouse/search?q=...&limit=15  — autocomplete
 *   GET /api/v2/web-warehouse/product/:tposProductId  — product + variants
 */

(function () {
    'use strict';

    const BASE_URL = 'https://n2store-fallback.onrender.com/api/v2/web-warehouse';

    /**
     * Build proxied image URL for a product.
     * TPOS images require auth — proxy through Render to avoid CORS/auth issues.
     */
    function proxyImageUrl(row) {
        if (!row.image_url) return '';
        if (!row.tpos_product_id) return row.image_url;
        return `${BASE_URL}/image/${row.tpos_product_id}`;
    }

    /**
     * Map a web_warehouse DB row to a TPOS-compatible product object.
     * This keeps downstream code (Firebase cart, UI rendering) working
     * without changes — they still expect TPOS field names.
     */
    function toProductObject(row) {
        const img = proxyImageUrl(row);
        return {
            Id: row.tpos_product_id,
            NameGet: row.name_get || row.product_name,
            Name: row.product_name,
            DefaultCode: row.product_code,
            QtyAvailable: parseFloat(row.tpos_qty_available) || 0,
            ListPrice: parseFloat(row.selling_price) || 0,
            PriceVariant: parseFloat(row.selling_price) || 0,
            PurchasePrice: parseFloat(row.purchase_price) || 0,
            StandardPrice: parseFloat(row.standard_price) || 0,
            imageUrl: img,
            ImageUrl: img,
            ProductTmplId: row.tpos_template_id,
            Active: row.active !== false,
            Barcode: row.barcode || '',
            UOMName: row.uom_name || '',
            CategCompleteName: row.category || '',
            Variant: row.variant || '',
            ParentCode: row.parent_product_code || '',
        };
    }

    /**
     * Map a DB row to a lightweight search suggestion object.
     * Used for autocomplete dropdowns.
     */
    function toSearchSuggestion(row) {
        return {
            id: row.tpos_product_id,
            templateId: row.tpos_template_id,
            name: row.name_get || row.product_name,
            code: row.product_code,
            image: proxyImageUrl(row),
            price: parseFloat(row.selling_price) || 0,
            qty: parseFloat(row.tpos_qty_available) || 0,
            barcode: row.barcode || '',
        };
    }

    const WarehouseAPI = {
        BASE_URL,
        proxyImageUrl,
        toProductObject,
        toSearchSuggestion,

        /**
         * Search products (autocomplete).
         * @param {string} query - Search text (min 1 char)
         * @param {number} [limit=15] - Max results
         * @returns {Promise<Array>} Raw DB rows
         */
        async search(query, limit = 15) {
            if (!query || query.trim().length < 1) return [];
            try {
                const url = `${BASE_URL}/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
                const response = await fetch(url);
                if (!response.ok) return [];
                const result = await response.json();
                return result.data || [];
            } catch (err) {
                console.error('[WarehouseAPI] search error:', err.message);
                return [];
            }
        },

        /**
         * Get product details + sibling variants.
         * @param {number} tposProductId
         * @returns {Promise<{product: Object, variants: Array}|null>}
         */
        async getProduct(tposProductId) {
            if (!tposProductId) return null;
            try {
                const url = `${BASE_URL}/product/${tposProductId}`;
                const response = await fetch(url);
                if (!response.ok) return null;
                const result = await response.json();
                return {
                    product: result.product,
                    variants: result.variants || [],
                };
            } catch (err) {
                console.error('[WarehouseAPI] getProduct error:', err.message);
                return null;
            }
        },

        /**
         * Get product details and return as TPOS-compatible object with variants.
         * Convenience wrapper combining getProduct + toProductObject.
         * @param {number} tposProductId
         * @returns {Promise<{product: Object, variants: Array}|null>} TPOS-shaped objects
         */
        async getProductAsTpos(tposProductId) {
            const result = await this.getProduct(tposProductId);
            if (!result || !result.product) return null;
            return {
                product: toProductObject(result.product),
                variants: result.variants.map(toProductObject),
            };
        },
    };

    // Expose globally for script-tag usage
    window.WarehouseAPI = WarehouseAPI;
})();
