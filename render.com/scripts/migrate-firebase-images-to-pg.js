#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migrate Firebase Storage images → PostgreSQL BYTEA
 *
 * Downloads images from firebasestorage.googleapis.com URLs,
 * stores them in purchase_order_images table, and updates
 * the order's item/invoice image URLs to point to the Render API.
 *
 * Idempotent: skips URLs already migrated (non-Firebase URLs).
 *
 * Usage: node scripts/migrate-firebase-images-to-pg.js
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const RENDER_API = 'https://n2store-fallback.onrender.com/api/v2/purchase-orders/images';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

function isFirebaseUrl(url) {
    return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

async function downloadImage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { buffer, contentType };
}

async function uploadToPG(client, buffer, contentType, filename) {
    const id = require('crypto').randomUUID();
    await client.query(
        `INSERT INTO purchase_order_images (id, data, content_type, filename, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, buffer, contentType, filename, buffer.length]
    );
    return `${RENDER_API}/${id}`;
}

async function migrate() {
    console.log('[migrate-images] Starting Firebase → PostgreSQL image migration...');

    const client = await pool.connect();
    let totalDownloaded = 0;
    let totalFailed = 0;
    let ordersUpdated = 0;

    try {
        // Find all orders with Firebase URLs
        const result = await client.query(`
            SELECT id, items, invoice_images
            FROM purchase_orders
            WHERE items::text LIKE '%firebasestorage.googleapis.com%'
               OR invoice_images::text LIKE '%firebasestorage.googleapis.com%'
        `);

        console.log(`[migrate-images] Found ${result.rows.length} orders with Firebase images`);

        for (const row of result.rows) {
            let changed = false;

            // Migrate invoice images
            const invoiceImages = row.invoice_images || [];
            const newInvoiceImages = [];
            for (const url of invoiceImages) {
                if (isFirebaseUrl(url)) {
                    try {
                        const { buffer, contentType } = await downloadImage(url);
                        const newUrl = await uploadToPG(client, buffer, contentType, `invoice_${row.id}.jpg`);
                        newInvoiceImages.push(newUrl);
                        totalDownloaded++;
                        changed = true;
                        process.stdout.write('.');
                    } catch (err) {
                        console.error(`\n[migrate-images] Failed to download invoice image for ${row.id}:`, err.message);
                        newInvoiceImages.push(url); // Keep original
                        totalFailed++;
                    }
                } else {
                    newInvoiceImages.push(url);
                }
            }

            // Migrate item images
            const items = row.items || [];
            let itemsChanged = false;
            for (const item of items) {
                // Product images
                if (item.productImages && Array.isArray(item.productImages)) {
                    const newProductImages = [];
                    for (const url of item.productImages) {
                        if (isFirebaseUrl(url)) {
                            try {
                                const { buffer, contentType } = await downloadImage(url);
                                const newUrl = await uploadToPG(client, buffer, contentType, `product_${item.id || 'unknown'}.jpg`);
                                newProductImages.push(newUrl);
                                totalDownloaded++;
                                itemsChanged = true;
                                process.stdout.write('.');
                            } catch (err) {
                                console.error(`\n[migrate-images] Failed: product image ${row.id}/${item.id}:`, err.message);
                                newProductImages.push(url);
                                totalFailed++;
                            }
                        } else {
                            newProductImages.push(url);
                        }
                    }
                    item.productImages = newProductImages;
                }

                // Price images
                if (item.priceImages && Array.isArray(item.priceImages)) {
                    const newPriceImages = [];
                    for (const url of item.priceImages) {
                        if (isFirebaseUrl(url)) {
                            try {
                                const { buffer, contentType } = await downloadImage(url);
                                const newUrl = await uploadToPG(client, buffer, contentType, `price_${item.id || 'unknown'}.jpg`);
                                newPriceImages.push(newUrl);
                                totalDownloaded++;
                                itemsChanged = true;
                                process.stdout.write('.');
                            } catch (err) {
                                console.error(`\n[migrate-images] Failed: price image ${row.id}/${item.id}:`, err.message);
                                newPriceImages.push(url);
                                totalFailed++;
                            }
                        } else {
                            newPriceImages.push(url);
                        }
                    }
                    item.priceImages = newPriceImages;
                }
            }

            if (itemsChanged) changed = true;

            // Update order
            if (changed) {
                await client.query(
                    `UPDATE purchase_orders SET invoice_images = $1, items = $2 WHERE id = $3`,
                    [newInvoiceImages, JSON.stringify(items), row.id]
                );
                ordersUpdated++;
            }
        }

        console.log(`\n\n[migrate-images] ✅ Migration complete!`);
        console.log(`  Downloaded: ${totalDownloaded}`);
        console.log(`  Failed: ${totalFailed}`);
        console.log(`  Orders updated: ${ordersUpdated}`);

        // Verify no Firebase URLs remain
        const check = await client.query(`
            SELECT COUNT(*) as remaining
            FROM purchase_orders
            WHERE items::text LIKE '%firebasestorage.googleapis.com%'
               OR invoice_images::text LIKE '%firebasestorage.googleapis.com%'
        `);
        console.log(`  Remaining Firebase URLs: ${check.rows[0].remaining}`);

    } catch (err) {
        console.error('[migrate-images] Fatal error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(err => {
    console.error('[migrate-images] Fatal:', err);
    process.exit(1);
});
