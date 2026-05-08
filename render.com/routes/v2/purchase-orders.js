// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS API v2
 * Migrated from Firestore → PostgreSQL for faster queries
 *
 * Endpoints:
 *   GET    /                  - List orders by status with pagination
 *   GET    /stats             - Stats + status counts (single query)
 *   GET    /:id               - Get single order
 *   POST   /                  - Create order
 *   PUT    /:id               - Update order
 *   PATCH  /:id/status        - Change status
 *   DELETE /:id               - Soft delete (move to trash)
 *   POST   /:id/restore       - Restore from trash
 *   DELETE /:id/permanent     - Hard delete
 *   POST   /:id/copy          - Copy order as new draft
 *   POST   /generate-number   - Generate next order number
 *   POST   /cleanup-trash     - Auto-cleanup old trash
 *   POST   /images            - Upload image (multipart/form-data)
 *   GET    /images/:id        - Serve image binary
 *   DELETE /images/:id        - Delete image
 *   GET    /product-codes     - Distinct product codes from all orders (auto-suggest)
 *   GET    /code-rules        - Product code prefix rules (from admin_settings)
 *   PUT    /code-rules        - Save product code prefix rules (admin only)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const adminSettings = require('../../services/admin-settings-service');
const bunnyStorage = require('../../services/bunny-storage-service');

// PO images live in Bunny under prefix `po-images/`. Legacy DB rows are still
// served by `GET /images/:id` until the migration script clears them.
const BUNNY_PO_PREFIX = 'po-images';

const EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/svg+xml': 'svg',
};

function extFromMime(mime, fallbackName) {
    if (mime && EXT_BY_MIME[mime.toLowerCase()]) return EXT_BY_MIME[mime.toLowerCase()];
    if (fallbackName) {
        const e = path.extname(fallbackName).toLowerCase().replace('.', '');
        if (e) return e;
    }
    return 'jpg';
}

// Classify URLs in `invoice_images[]` so cascade-delete can route to the right backend.
// - Bunny CDN URL: https://<cdn-host>/po-images/<id>.<ext>  → DELETE on Bunny
// - Legacy DB URL: <base>/api/v2/purchase-orders/images/<id>  → DELETE row from purchase_order_images
function classifyImageUrls(urlArrays) {
    const dbIds = new Set();
    const bunnyKeys = new Set();
    const cdnHost = bunnyStorage.CDN_HOSTNAME;
    const bunnyRe = new RegExp(
        `^https?://${cdnHost.replace(/\./g, '\\.')}/(${BUNNY_PO_PREFIX}/[^?#]+)$`
    );
    for (const arr of urlArrays) {
        if (!Array.isArray(arr)) continue;
        for (const url of arr) {
            if (typeof url !== 'string') continue;
            const bm = url.match(bunnyRe);
            if (bm && bm[1]) {
                bunnyKeys.add(bm[1]);
                continue;
            }
            const dm = url.match(/\/images\/([^/?#]+)$/);
            if (dm && dm[1]) dbIds.add(dm[1]);
        }
    }
    return { dbIds: Array.from(dbIds), bunnyKeys: Array.from(bunnyKeys) };
}

async function deleteImagesFromUrls(pool, urlArrays) {
    const { dbIds, bunnyKeys } = classifyImageUrls(urlArrays);
    let deletedDb = 0;
    let deletedBunny = 0;

    // Bảng `purchase_order_images` đã drop 2026-05-08 sau migration Bunny.
    // dbIds chỉ có thể xuất hiện nếu invoice_images còn URL legacy chưa migrate —
    // không expected, nhưng fail gracefully thay vì throw cho cả request.
    if (dbIds.length) {
        try {
            const r = await pool.query(
                'DELETE FROM purchase_order_images WHERE id = ANY($1) RETURNING id',
                [dbIds]
            );
            deletedDb = r.rowCount;
        } catch (err) {
            // Table dropped → silently noop (URL trỏ ID không tồn tại).
            if (!String(err.message || '').includes('does not exist')) throw err;
        }
    }
    if (bunnyKeys.length) {
        const results = await Promise.allSettled(
            bunnyKeys.map((k) => bunnyStorage.deleteObject(k))
        );
        deletedBunny = results.filter(
            (r) => r.status === 'fulfilled' && r.value && r.value.ok
        ).length;
    }
    return { deletedDb, deletedBunny, total: deletedDb + deletedBunny };
}

// Use shared DB pool from app.locals (same as all other v2 routes)
function getDb(req) {
    return req.app.locals.chatDb;
}

// ========================================
// HELPERS
// ========================================

function getUserFromHeaders(req) {
    try {
        const authData = req.headers['x-auth-data'];
        if (authData) {
            let jsonStr;
            try {
                jsonStr = decodeURIComponent(
                    escape(Buffer.from(authData, 'base64').toString('binary'))
                );
            } catch (_) {
                jsonStr = authData;
            }
            const parsed = JSON.parse(jsonStr);
            return {
                uid: parsed.userId || parsed.userType || 'anonymous',
                displayName: parsed.userName || 'User',
                email: parsed.email || '',
            };
        }
    } catch (e) {
        /* ignore */
    }
    return { uid: 'anonymous', displayName: 'Anonymous', email: '' };
}

function toSnakeOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        orderNumber: row.order_number,
        orderType: row.order_type,
        orderDate: row.order_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        status: row.status,
        previousStatus: row.previous_status,
        supplier:
            row.supplier_code || row.supplier_name
                ? {
                      code: row.supplier_code || '',
                      name: row.supplier_name || '',
                  }
                : null,
        invoiceAmount: parseFloat(row.invoice_amount) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        shippingFee: parseFloat(row.shipping_fee) || 0,
        finalAmount: parseFloat(row.final_amount) || 0,
        invoiceImages: row.invoice_images || [],
        notes: row.notes || '',
        items: row.items || [],
        statusHistory: row.status_history || [],
        totalItems: row.total_items || 0,
        totalQuantity: row.total_quantity || 0,
        createdBy: {
            uid: row.created_by_uid || '',
            displayName: row.created_by_name || '',
            email: row.created_by_email || '',
        },
        lastModifiedBy: {
            uid: row.last_modified_by_uid || '',
            displayName: row.last_modified_by_name || '',
            email: row.last_modified_by_email || '',
        },
    };
}

// ========================================
// GET /stats — Stats + status counts (1 query)
// ========================================
router.get('/stats', async (req, res) => {
    try {
        const pool = getDb(req);
        const result = await pool.query(`
            SELECT
                status,
                COUNT(*)::int as count,
                COALESCE(SUM(final_amount), 0)::numeric as total_value
            FROM purchase_orders
            GROUP BY status
        `);

        const todayResult = await pool.query(`
            SELECT
                COUNT(*)::int as count,
                COALESCE(SUM(final_amount), 0)::numeric as total_value
            FROM purchase_orders
            WHERE created_at >= CURRENT_DATE
              AND status NOT IN ('CANCELLED', 'DELETED')
        `);

        // Count TPOS synced orders
        const tposResult = await pool.query(`
            SELECT COUNT(*)::int as synced
            FROM purchase_orders
            WHERE status NOT IN ('CANCELLED', 'DELETED')
              AND items != '[]'::jsonb
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(items) item
                  WHERE item->>'tposSyncStatus' IS DISTINCT FROM 'success'
              )
        `);

        const counts = {};
        let totalOrders = 0;
        let totalValue = 0;

        for (const row of result.rows) {
            counts[row.status] = row.count;
            if (row.status !== 'CANCELLED' && row.status !== 'DELETED') {
                totalOrders += row.count;
                totalValue += parseFloat(row.total_value);
            }
        }

        const tposSyncedCount = tposResult.rows[0]?.synced || 0;

        res.json({
            success: true,
            stats: {
                totalOrders,
                totalValue,
                todayOrders: todayResult.rows[0]?.count || 0,
                todayValue: parseFloat(todayResult.rows[0]?.total_value) || 0,
                tposSyncRate:
                    totalOrders > 0 ? Math.round((tposSyncedCount / totalOrders) * 100) : 0,
            },
            counts,
        });
    } catch (error) {
        console.error('[PO API] Stats error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải thống kê' });
    }
});

// ========================================
// GET / — List orders by status with pagination
// ========================================
router.get('/', async (req, res) => {
    try {
        const pool = getDb(req);
        const {
            status,
            page = 1,
            pageSize = 20,
            startDate,
            endDate,
            search,
            orderBy = 'created_at',
            orderDirection = 'DESC',
            statusFilter,
        } = req.query;

        const params = [];
        const conditions = [];
        let paramIndex = 1;

        // Status filter
        if (status) {
            if (status.includes(',')) {
                const statuses = status.split(',');
                conditions.push(`status = ANY($${paramIndex})`);
                params.push(statuses);
            } else {
                conditions.push(`status = $${paramIndex}`);
                params.push(status);
            }
            paramIndex++;
        }

        // Sub-status filter (for filtering within a tab, e.g. AWAITING_PURCHASE with specific sub-filter)
        if (statusFilter) {
            conditions.push(`status = $${paramIndex}`);
            params.push(statusFilter);
            paramIndex++;
        }

        // Date range
        if (startDate) {
            conditions.push(`order_date >= $${paramIndex}`);
            params.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            conditions.push(`order_date <= $${paramIndex}`);
            params.push(endDate);
            paramIndex++;
        }

        // Search (supplier name/code, order number, item product codes/names)
        if (search) {
            const searchLower = `%${search.toLowerCase()}%`;
            conditions.push(`(
                LOWER(order_number) LIKE $${paramIndex}
                OR LOWER(supplier_name) LIKE $${paramIndex}
                OR LOWER(supplier_code) LIKE $${paramIndex}
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(items) item
                    WHERE LOWER(item->>'productCode') LIKE $${paramIndex}
                       OR LOWER(item->>'productName') LIKE $${paramIndex}
                )
            )`);
            params.push(searchLower);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Validate orderBy to prevent SQL injection
        const allowedOrderBy = [
            'created_at',
            'updated_at',
            'order_date',
            'final_amount',
            'order_number',
        ];
        const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize) + 1; // +1 to check hasMore

        const query = `
            SELECT * FROM purchase_orders
            ${whereClause}
            ORDER BY ${safeOrderBy} ${safeDirection}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        const hasMore = result.rows.length > parseInt(pageSize);
        const orders = result.rows.slice(0, parseInt(pageSize)).map(toSnakeOrder);

        res.json({
            success: true,
            orders,
            hasMore,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
        });
    } catch (error) {
        console.error('[PO API] List error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải danh sách đơn hàng' });
    }
});

// ========================================
// IMAGE UPLOAD — multer config
// ========================================

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `Loại file không hợp lệ: ${file.mimetype}. Chỉ chấp nhận JPEG, PNG, WebP, GIF.`
                )
            );
        }
    },
});

const BASE_URL = 'https://n2store-fallback.onrender.com';

// CORS preflight for image routes
router.options('/images', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Data');
    res.sendStatus(204);
});

router.options('/images/:id', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Data');
    res.sendStatus(204);
});

// ========================================
// POST /images — Upload image
// ========================================
router.post(
    '/images',
    (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({
                        success: false,
                        error: `File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
                    });
                }
                return res.status(400).json({ success: false, error: err.message });
            }
            if (err) {
                return res.status(400).json({ success: false, error: err.message });
            }
            next();
        });
    },
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Không có file được upload. Sử dụng field name "image".',
                });
            }

            const { buffer, mimetype, originalname, size } = req.file;
            const id = uuidv4();
            const ext = extFromMime(mimetype, originalname);
            const key = `${BUNNY_PO_PREFIX}/${id}.${ext}`;

            const uploaded = await bunnyStorage.uploadBuffer(
                buffer,
                key,
                mimetype || 'application/octet-stream'
            );

            res.json({
                success: true,
                url: uploaded.cdnUrl,
                image: {
                    id,
                    key: uploaded.key,
                    contentType: mimetype,
                    filename: originalname || null,
                    sizeBytes: size || buffer.length,
                    createdAt: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error('[PO API] Image upload error:', error);
            res.status(500).json({ success: false, error: 'Không thể upload ảnh' });
        }
    }
);

// ========================================
// GET/DELETE /images/:id — Legacy endpoints. Bảng `purchase_order_images` đã drop
// 2026-05-08 sau khi migrate sang Bunny CDN. Các URL cũ phải đã được rewrite
// trong `purchase_orders.invoice_images[]`, nên endpoint này chỉ phục vụ
// client cache cũ — trả 410 Gone gọn gàng.
// ========================================
const LEGACY_IMAGE_GONE_MSG =
    'Endpoint deprecated. Ảnh đã chuyển sang BunnyCDN — refresh đơn để lấy URL mới.';

router.get('/images/:id', (_req, res) => {
    res.status(410).json({ success: false, error: LEGACY_IMAGE_GONE_MSG });
});

router.delete('/images/:id', (_req, res) => {
    res.status(410).json({ success: false, error: LEGACY_IMAGE_GONE_MSG });
});

// ========================================
// GET /product-codes — Distinct product codes from all orders (for auto-suggest)
// MUST be defined BEFORE /:id route to avoid being captured as an order id.
// ========================================
router.get('/product-codes', async (req, res) => {
    try {
        const pool = getDb(req);
        const result = await pool.query(`
            SELECT DISTINCT UPPER(item->>'productCode') AS code
            FROM purchase_orders, jsonb_array_elements(items) item
            WHERE item->>'productCode' IS NOT NULL
              AND item->>'productCode' != ''
        `);
        res.json({ success: true, codes: result.rows.map((r) => r.code) });
    } catch (error) {
        console.error('[PO API] /product-codes error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải danh sách mã sản phẩm' });
    }
});

// ========================================
// GET /code-rules — Read product code prefix rules from admin_settings
// ========================================
router.get('/code-rules', async (req, res) => {
    try {
        const pool = getDb(req);
        const raw = await adminSettings.getSetting(pool, 'product_code_rules');
        let parsed = null;
        if (raw) {
            try {
                parsed = JSON.parse(raw);
            } catch (_) {
                parsed = null;
            }
        }
        res.json({
            success: true,
            rules: Array.isArray(parsed?.rules) ? parsed.rules : null,
            defaultPrefix: typeof parsed?.defaultPrefix === 'string' ? parsed.defaultPrefix : null,
        });
    } catch (error) {
        console.error('[PO API] /code-rules GET error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải quy tắc mã sản phẩm' });
    }
});

// ========================================
// PUT /code-rules — Save product code prefix rules to admin_settings
// ========================================
router.put('/code-rules', async (req, res) => {
    try {
        const pool = getDb(req);
        const { rules, defaultPrefix } = req.body || {};
        if (!Array.isArray(rules) || typeof defaultPrefix !== 'string') {
            return res.status(400).json({ success: false, error: 'Payload không hợp lệ' });
        }
        const validRules = rules
            .filter((r) => r && typeof r.match === 'string' && typeof r.codePrefix === 'string')
            .map((r) => ({ match: r.match.trim(), codePrefix: r.codePrefix.trim() }))
            .filter((r) => r.match && r.codePrefix);
        const user = getUserFromHeaders(req);
        const updatedBy = user.email || user.displayName || user.uid || 'unknown';
        const value = JSON.stringify({
            rules: validRules,
            defaultPrefix: defaultPrefix.trim().toUpperCase() || 'N',
        });
        await adminSettings.setSetting(pool, 'product_code_rules', value, updatedBy);
        res.json({
            success: true,
            rules: validRules,
            defaultPrefix: defaultPrefix.trim().toUpperCase() || 'N',
        });
    } catch (error) {
        console.error('[PO API] /code-rules PUT error:', error);
        res.status(500).json({ success: false, error: 'Không thể lưu quy tắc mã sản phẩm' });
    }
});

// ========================================
// GET /:id — Get single order
// ========================================
router.get('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [
            req.params.id,
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }
        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Get error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải đơn hàng' });
    }
});

// ========================================
// POST /generate-number — Generate next order number
// ========================================
router.post('/generate-number', async (req, res) => {
    try {
        const pool = getDb(req);
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const pattern = `PO-${datePrefix}-%`;

        const result = await pool.query(
            `SELECT order_number FROM purchase_orders
             WHERE order_number LIKE $1
             ORDER BY order_number DESC LIMIT 1`,
            [pattern]
        );

        let sequence = 1;
        if (result.rows.length > 0) {
            const parts = result.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }

        res.json({
            success: true,
            orderNumber: `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`,
        });
    } catch (error) {
        console.error('[PO API] Generate number error:', error);
        res.status(500).json({ success: false, error: 'Không thể tạo mã đơn hàng' });
    }
});

// ========================================
// POST / — Create order
// ========================================
router.post('/', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const data = req.body;

        // Generate order number
        const numResult = await pool.query(
            `SELECT order_number FROM purchase_orders
             WHERE order_number LIKE $1
             ORDER BY order_number DESC LIMIT 1`,
            [`PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-%`]
        );

        let sequence = 1;
        if (numResult.rows.length > 0) {
            const parts = numResult.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }

        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const orderNumber = `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;

        const items = data.items || [];
        const totalAmount = items.reduce(
            (sum, item) => sum + (item.purchasePrice || 0) * (item.quantity || 1),
            0
        );
        const finalAmount = totalAmount - (data.discountAmount || 0) + (data.shippingFee || 0);
        const status = data.status || 'DRAFT';

        const statusHistory = [
            {
                from: null,
                to: status,
                changedAt: new Date().toISOString(),
                changedBy: user,
            },
        ];

        // Prepare items with IDs
        const preparedItems = items.map((item, index) => ({
            id: item.id || uuidv4(),
            position: index + 1,
            productCode: item.productCode || '',
            productName: item.productName || '',
            variant: item.variant || '',
            selectedAttributeValueIds: item.selectedAttributeValueIds || [],
            productImages: (item.productImages || []).filter(
                (u) => typeof u === 'string' && !u.startsWith('data:')
            ),
            priceImages: (item.priceImages || []).filter(
                (u) => typeof u === 'string' && !u.startsWith('data:')
            ),
            purchasePrice: item.purchasePrice || 0,
            sellingPrice: item.sellingPrice || 0,
            quantity: item.quantity || 1,
            subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
            notes: item.notes || '',
            tposSyncStatus: item.tposSyncStatus || null,
            tposProductId: item.tposProductId || null,
            tposProductTmplId: item.tposProductTmplId || null,
            tposSynced: item.tposSynced || false,
            tposImageUrl: item.tposImageUrl || null,
            _fromWarehouse: !!(item._fromWarehouse || item.tposSynced),
            _isExistingItem: !!(item._isExistingItem || item.tposProductId),
            // Inventory-tracking source linkage (for badge mapping)
            sourceInvoiceId: item.sourceInvoiceId || null,
            sourceItemIdx:
                typeof item.sourceItemIdx === 'number' && Number.isFinite(item.sourceItemIdx)
                    ? item.sourceItemIdx
                    : null,
        }));

        const invoiceImages = (data.invoiceImages || []).filter(
            (u) => typeof u === 'string' && !u.startsWith('data:')
        );

        const result = await pool.query(
            `
            INSERT INTO purchase_orders (
                order_number, order_type, order_date, status,
                supplier_code, supplier_name,
                invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                invoice_images, notes, items, status_history,
                total_items, total_quantity,
                created_by_uid, created_by_name, created_by_email,
                last_modified_by_uid, last_modified_by_name, last_modified_by_email
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $17,
                $18, $19, $20,
                $18, $19, $20
            )
            RETURNING *
        `,
            [
                orderNumber,
                data.orderType || 'NJD SHOP',
                data.orderDate || new Date(),
                status,
                data.supplier?.code || null,
                data.supplier?.name || null,
                data.invoiceAmount || 0,
                totalAmount,
                data.discountAmount || 0,
                data.shippingFee || 0,
                finalAmount,
                invoiceImages,
                data.notes || '',
                JSON.stringify(preparedItems),
                JSON.stringify(statusHistory),
                preparedItems.length,
                preparedItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
                user.uid,
                user.displayName,
                user.email,
            ]
        );

        res.json({ success: true, id: result.rows[0].id, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Create error:', error);
        res.status(500).json({ success: false, error: 'Không thể tạo đơn hàng' });
    }
});

// ========================================
// PUT /:id — Update order
// ========================================
router.put('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const data = req.body;
        const orderId = req.params.id;

        // Check exists
        const existing = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const current = existing.rows[0];

        // Build dynamic update
        const updates = [];
        const params = [];
        let paramIndex = 1;

        const setField = (column, value) => {
            updates.push(`${column} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        };

        if (data.orderType !== undefined) setField('order_type', data.orderType);
        if (data.orderDate !== undefined) setField('order_date', data.orderDate);
        if (data.supplier !== undefined) {
            setField('supplier_code', data.supplier?.code || null);
            setField('supplier_name', data.supplier?.name || null);
        }
        if (data.invoiceAmount !== undefined) setField('invoice_amount', data.invoiceAmount);
        if (data.discountAmount !== undefined) setField('discount_amount', data.discountAmount);
        if (data.shippingFee !== undefined) setField('shipping_fee', data.shippingFee);
        if (data.notes !== undefined) setField('notes', data.notes);
        if (data.invoiceImages !== undefined) {
            setField(
                'invoice_images',
                (data.invoiceImages || []).filter(
                    (u) => typeof u === 'string' && !u.startsWith('data:')
                )
            );
        }

        if (data.items !== undefined) {
            const items = data.items || [];
            const preparedItems = items.map((item, index) => ({
                id: item.id || uuidv4(),
                position: index + 1,
                productCode: item.productCode || '',
                productName: item.productName || '',
                variant: item.variant || '',
                selectedAttributeValueIds: item.selectedAttributeValueIds || [],
                productImages: (item.productImages || []).filter(
                    (u) => typeof u === 'string' && !u.startsWith('data:')
                ),
                priceImages: (item.priceImages || []).filter(
                    (u) => typeof u === 'string' && !u.startsWith('data:')
                ),
                purchasePrice: item.purchasePrice || 0,
                sellingPrice: item.sellingPrice || 0,
                quantity: item.quantity || 1,
                subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
                notes: item.notes || '',
                tposSyncStatus: item.tposSyncStatus || null,
                tposProductId: item.tposProductId || null,
                tposProductTmplId: item.tposProductTmplId || null,
                tposSynced: item.tposSynced || false,
                tposImageUrl: item.tposImageUrl || null,
                _fromWarehouse: !!(item._fromWarehouse || item.tposSynced),
                _isExistingItem: !!(item._isExistingItem || item.tposProductId),
                // Inventory-tracking source linkage (for badge mapping)
                sourceInvoiceId: item.sourceInvoiceId || null,
                sourceItemIdx:
                    typeof item.sourceItemIdx === 'number' && Number.isFinite(item.sourceItemIdx)
                        ? item.sourceItemIdx
                        : null,
            }));

            setField('items', JSON.stringify(preparedItems));
            const totalAmount = preparedItems.reduce((s, i) => s + i.subtotal, 0);
            const discountAmount = data.discountAmount ?? parseFloat(current.discount_amount) ?? 0;
            const shippingFee = data.shippingFee ?? parseFloat(current.shipping_fee) ?? 0;
            setField('total_amount', totalAmount);
            setField('final_amount', totalAmount - discountAmount + shippingFee);
            setField('total_items', preparedItems.length);
            setField(
                'total_quantity',
                preparedItems.reduce((s, i) => s + (i.quantity || 0), 0)
            );
        }

        setField('updated_at', new Date());
        setField('last_modified_by_uid', user.uid);
        setField('last_modified_by_name', user.displayName);
        setField('last_modified_by_email', user.email);

        params.push(orderId);
        const query = `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await pool.query(query, params);

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Update error:', error);
        res.status(500).json({ success: false, error: 'Không thể cập nhật đơn hàng' });
    }
});

// ========================================
// PATCH /:id/status — Change status
// ========================================
router.patch('/:id/status', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const { status: newStatus, reason } = req.body;
        const orderId = req.params.id;

        const existing = await pool.query(
            'SELECT status, status_history FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const currentStatus = existing.rows[0].status;
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: currentStatus,
            to: newStatus,
            changedAt: new Date().toISOString(),
            changedBy: user,
            reason: reason || null,
        });

        const result = await pool.query(
            `
            UPDATE purchase_orders
            SET status = $1, status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
            RETURNING *
        `,
            [
                newStatus,
                JSON.stringify(statusHistory),
                user.uid,
                user.displayName,
                user.email,
                orderId,
            ]
        );

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Status update error:', error);
        res.status(500).json({ success: false, error: 'Không thể cập nhật trạng thái' });
    }
});

// ========================================
// DELETE /:id — Soft delete (move to trash)
// ========================================
router.delete('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query(
            'SELECT status, status_history FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const currentStatus = existing.rows[0].status;
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: currentStatus,
            to: 'DELETED',
            changedAt: new Date().toISOString(),
            changedBy: user,
        });

        await pool.query(
            `
            UPDATE purchase_orders
            SET status = 'DELETED', deleted_at = NOW(), previous_status = $1,
                status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
        `,
            [
                currentStatus,
                JSON.stringify(statusHistory),
                user.uid,
                user.displayName,
                user.email,
                orderId,
            ]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[PO API] Delete error:', error);
        res.status(500).json({ success: false, error: 'Không thể xóa đơn hàng' });
    }
});

// ========================================
// POST /:id/restore — Restore from trash
// ========================================
router.post('/:id/restore', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query(
            'SELECT status, previous_status, status_history FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        if (existing.rows[0].status !== 'DELETED') {
            return res
                .status(400)
                .json({ success: false, error: 'Đơn hàng không nằm trong thùng rác' });
        }

        const restoreStatus = existing.rows[0].previous_status || 'DRAFT';
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: 'DELETED',
            to: restoreStatus,
            changedAt: new Date().toISOString(),
            changedBy: user,
            reason: 'Khôi phục từ thùng rác',
        });

        const result = await pool.query(
            `
            UPDATE purchase_orders
            SET status = $1, deleted_at = NULL, previous_status = NULL,
                status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
            RETURNING *
        `,
            [
                restoreStatus,
                JSON.stringify(statusHistory),
                user.uid,
                user.displayName,
                user.email,
                orderId,
            ]
        );

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Restore error:', error);
        res.status(500).json({ success: false, error: 'Không thể khôi phục đơn hàng' });
    }
});

// ========================================
// DELETE /:id/permanent — Hard delete
// ========================================
router.delete('/:id/permanent', async (req, res) => {
    try {
        const pool = getDb(req);
        const orderId = req.params.id;

        const existing = await pool.query(
            'SELECT status, invoice_images FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        if (existing.rows[0].status !== 'DELETED') {
            return res.status(400).json({
                success: false,
                error: 'Chỉ có thể xóa vĩnh viễn đơn hàng trong thùng rác',
            });
        }

        const urls = [existing.rows[0].invoice_images || []];
        await pool.query('DELETE FROM purchase_orders WHERE id = $1', [orderId]);
        const cleanup = await deleteImagesFromUrls(pool, urls);
        res.json({ success: true, deletedImages: cleanup });
    } catch (error) {
        console.error('[PO API] Permanent delete error:', error);
        res.status(500).json({ success: false, error: 'Không thể xóa vĩnh viễn đơn hàng' });
    }
});

// ========================================
// POST /:id/copy — Copy order as new draft
// ========================================
router.post('/:id/copy', async (req, res) => {
    try {
        const pool = getDb(req);
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng nguồn không tồn tại' });
        }

        const source = existing.rows[0];
        const sourceItems = source.items || [];

        // Clone items with new IDs, clear TPOS sync
        const newItems = sourceItems.map((item, index) => ({
            ...item,
            id: uuidv4(),
            position: index + 1,
            productCode: item.parentProductCode || item.productCode,
            parentProductCode: null,
            tposSyncStatus: null,
            tposProductId: null,
            tposProductTmplId: null,
            tposSynced: false,
            tposSyncError: null,
            tposImageUrl: null,
        }));

        // Generate new order number
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const numResult = await pool.query(
            `SELECT order_number FROM purchase_orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`,
            [`PO-${datePrefix}-%`]
        );

        let sequence = 1;
        if (numResult.rows.length > 0) {
            const parts = numResult.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }
        const orderNumber = `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;

        const totalAmount = newItems.reduce(
            (s, i) => s + (i.purchasePrice || 0) * (i.quantity || 1),
            0
        );
        const notes = source.notes
            ? `[Sao chép từ ${source.order_number}] ${source.notes}`
            : `Sao chép từ ${source.order_number}`;

        const statusHistory = [
            {
                from: null,
                to: 'DRAFT',
                changedAt: new Date().toISOString(),
                changedBy: user,
            },
        ];

        const result = await pool.query(
            `
            INSERT INTO purchase_orders (
                order_number, order_type, order_date, status,
                supplier_code, supplier_name,
                invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                invoice_images, notes, items, status_history,
                total_items, total_quantity,
                created_by_uid, created_by_name, created_by_email,
                last_modified_by_uid, last_modified_by_name, last_modified_by_email
            ) VALUES (
                $1, $2, NOW(), 'DRAFT',
                $3, $4,
                0, $5, 0, 0, $5,
                '{}', $6, $7, $8,
                $9, $10,
                $11, $12, $13,
                $11, $12, $13
            )
            RETURNING *
        `,
            [
                orderNumber,
                source.order_type,
                source.supplier_code,
                source.supplier_name,
                totalAmount,
                notes,
                JSON.stringify(newItems),
                JSON.stringify(statusHistory),
                newItems.length,
                newItems.reduce((s, i) => s + (i.quantity || 0), 0),
                user.uid,
                user.displayName,
                user.email,
            ]
        );

        res.json({ success: true, id: result.rows[0].id, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Copy error:', error);
        res.status(500).json({ success: false, error: 'Không thể sao chép đơn hàng' });
    }
});

// ========================================
// POST /cleanup-trash — Auto-cleanup old trash (cascade ảnh)
// ========================================
router.post('/cleanup-trash', async (req, res) => {
    try {
        const pool = getDb(req);
        const { retentionDays = 30 } = req.body;

        const result = await pool.query(
            `DELETE FROM purchase_orders
             WHERE status = 'DELETED' AND deleted_at <= NOW() - INTERVAL '1 day' * $1
             RETURNING id, invoice_images`,
            [retentionDays]
        );

        const cleanup = await deleteImagesFromUrls(
            pool,
            result.rows.map((r) => r.invoice_images || [])
        );

        res.json({ success: true, deletedCount: result.rowCount, deletedImages: cleanup });
    } catch (error) {
        console.error('[PO API] Cleanup error:', error);
        res.status(500).json({ success: false, error: 'Cleanup failed' });
    }
});

// ========================================
// POST /cleanup-orphan-images — One-shot dọn ảnh không link tới đơn nào
// (safety net cho các đơn xóa trước khi cascade được wire)
// ========================================
router.post('/cleanup-orphan-images', (_req, res) => {
    // Bảng `purchase_order_images` đã drop 2026-05-08 sau khi migrate sang
    // BunnyCDN. Cascade delete bytea không còn cần thiết. Bunny orphan cleanup
    // (nếu cần trong tương lai) sẽ là endpoint riêng so sánh objects trong
    // zone vs URLs trong invoice_images[].
    res.status(410).json({
        success: false,
        error: 'Endpoint deprecated — bảng purchase_order_images đã drop sau migration Bunny.',
    });
});

module.exports = router;
