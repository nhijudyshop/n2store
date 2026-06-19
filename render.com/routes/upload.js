// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// UPLOAD ROUTE
// Handles image uploads from web frontend → Postgres bytea (table `upload_images`).
//
// Migrated OFF Firebase Storage 2026-06-19: the Firebase Admin SDK write path
// failed from Render (OAuth2 token fetch to googleapis.com → "Premature close"),
// breaking "Ảnh hóa đơn" (inventory-tracking) and "Hình ảnh xác nhận chuyển khoản"
// (balance-history). Both POST to this shared endpoint. Now stores bytes in Postgres
// and serves them back from Render — no external dependency. Mirrors the
// purchase_order_images pattern (render.com/routes/v2/purchase-orders.js, migration 046).
//
// Contract is UNCHANGED so the frontends need no edits:
//   POST /api/upload/image   body { image: base64, fileName, folderPath?, mimeType? }
//                            → { success, url, fileName, folderPath }
//   GET  /api/upload/images/:id  → image bytes (for <img src>)
//   DELETE /api/upload/image  body { url }  (routes to Postgres or legacy Firebase by URL)
// Web 1.0 — pool chatDb, table NOT prefixed web2_.
// =====================================================

const express = require('express');
const router = express.Router();
// Kept only for cascade-delete of LEGACY Firebase URLs still stored in the DB.
// New uploads never touch Firebase. (Telegram bot still uploads via this service —
// do not remove its upload functions.)
const firebaseStorageService = require('../services/firebase-storage-service');

const BASE_URL = 'https://n2store-fallback.onrender.com';

// CORS middleware for all upload routes
const setCorsHeaders = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Data, X-User-Id, X-API-Key');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    next();
};
router.use(setCorsHeaders);

// Handle OPTIONS preflight requests
router.options('*', (req, res) => {
    res.status(204).send();
});

// Use shared Web 1.0 DB pool (same as all other Web 1.0 routes). NOT web2Db.
function getDb(req) {
    return req.app.locals.chatDb;
}

// Lazy schema creation — gives fresh deploys a working table without manually
// running migration 050. Same pattern as purchase-orders.ensureImagesTable.
let _uploadImagesTableCreated = false;
async function ensureUploadImagesTable(pool) {
    if (_uploadImagesTableCreated) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS upload_images (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            data BYTEA NOT NULL,
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
            filename VARCHAR(255),
            folder_path VARCHAR(100),
            size_bytes INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_upload_images_created_at
            ON upload_images(created_at DESC);
    `);
    _uploadImagesTableCreated = true;
}

/**
 * Upload image from web frontend (base64 JSON) → Postgres bytea
 * POST /api/upload/image
 * Body: { image: "base64_string", fileName: "invoice_123.jpg", folderPath: "invoices", mimeType: "image/jpeg" }
 */
router.post('/image', async (req, res) => {
    try {
        const { image, fileName, folderPath, mimeType } = req.body;

        // Validation
        if (!image || !fileName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: image, fileName'
            });
        }

        // Strip data URI prefix (e.g. "data:image/jpeg;base64,") if present
        const base64Data = String(image).replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        if (!buffer.length) {
            return res.status(400).json({
                success: false,
                error: 'Empty or invalid image data'
            });
        }

        const contentType = mimeType || 'image/jpeg';
        const pool = getDb(req);
        await ensureUploadImagesTable(pool);

        const result = await pool.query(
            `INSERT INTO upload_images (data, content_type, filename, folder_path, size_bytes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [buffer, contentType, fileName, folderPath || 'uploads', buffer.length]
        );

        const id = result.rows[0].id;
        const url = `${BASE_URL}/api/upload/images/${id}`;
        console.log('[UPLOAD] Frontend image stored in Postgres:', url);

        res.json({
            success: true,
            url,
            fileName,
            folderPath: folderPath || 'uploads'
        });

    } catch (error) {
        console.error('[UPLOAD] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Serve image binary from Postgres
 * GET /api/upload/images/:id
 */
router.get('/images/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        await ensureUploadImagesTable(pool);

        const result = await pool.query(
            'SELECT data, content_type, filename FROM upload_images WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Image not found' });
        }

        const { data, content_type, filename } = result.rows[0];
        res.setHeader('Content-Type', content_type || 'image/jpeg');
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (filename) {
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        }
        res.send(data);

    } catch (error) {
        console.error('[UPLOAD] Serve error:', error.message);
        res.status(500).json({ success: false, error: 'Cannot serve image' });
    }
});

/**
 * Delete image
 * DELETE /api/upload/image
 * Body: { url: "<base>/api/upload/images/<id>"  OR  legacy firebase URL }
 */
router.delete('/image', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Missing image URL'
            });
        }

        // New Postgres-backed URL: <base>/api/upload/images/<id>
        const dbMatch = String(url).match(/\/api\/upload\/images\/([^/?#]+)$/);
        if (dbMatch && dbMatch[1]) {
            const pool = getDb(req);
            await ensureUploadImagesTable(pool);
            const r = await pool.query(
                'DELETE FROM upload_images WHERE id = $1 RETURNING id',
                [dbMatch[1]]
            );
            return res.json({
                success: r.rowCount > 0,
                message: r.rowCount > 0 ? 'Image deleted successfully' : 'Image not found or already deleted'
            });
        }

        // Legacy Firebase Storage URL — best-effort cleanup (may fail if Firebase is
        // unreachable; that's non-fatal — the DB no longer references it once removed
        // from the parent record).
        if (/firebasestorage\.googleapis\.com|storage\.googleapis\.com/.test(url)) {
            let deleted = false;
            try {
                deleted = await firebaseStorageService.deleteImage(url);
            } catch (e) {
                console.warn('[UPLOAD] Legacy Firebase delete failed (ignored):', e.message);
            }
            return res.json({
                success: deleted,
                message: deleted ? 'Legacy image deleted' : 'Legacy image not found or unreachable'
            });
        }

        return res.json({ success: false, message: 'Unknown URL format, skipped' });

    } catch (error) {
        console.error('[UPLOAD] Delete error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check
 * GET /api/upload/health
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Upload Service',
        backend: 'postgres-bytea',
        features: ['image_upload', 'image_serve', 'image_delete'],
        supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
});

module.exports = router;
