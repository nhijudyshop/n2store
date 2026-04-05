#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * One-time migration script: Firebase RTDB → PostgreSQL
 * Migrates dropped_products and held_products
 *
 * Usage:
 *   node render.com/scripts/migrate-dropped-held-to-pg.js [--dry-run]
 *
 * Requires:
 *   - firebase-admin (npm install firebase-admin)
 *   - pg (already installed in render.com)
 *
 * Environment:
 *   - DATABASE_URL or hardcoded connection string
 *   - Firebase credentials from serect_dont_push.txt
 */

const admin = require('firebase-admin');
const { Pool } = require('pg');

// Firebase credentials
const FIREBASE_PROJECT_ID = 'n2shop-69e37';
const FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com';
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDJ6mpX0cgrRM4e\nyIWBbHbsmgo9yjkcXrFNpKPUKmSm3KKz9kSAURJGLG5Im8I2p4g12BXV7M9k0WCC\nV4gDOlGQeqqW4At8wkp7/liCbKF1XMu9+h/oQ9tfdfYTUh2v+9QvTwCgwUsHURtI\nHhN5xwATzUWowVm32RugaKBrqGGbafjeMuYzyeaumb04KBohdFYzRdbPksEf3WHE\nJzL1NL5Hf6s2P8xOtL+DNjrzxOZEFdkm0cLIjwF/kt440NNZmS6uiVO1tQn7QG0H\ncMDmH3mVgoKk5fOqa/UQKZUgN8LeifaXvwjq4HdpavmuVJGQ4rlkzfv7/AqEKUUh\ne0qk7QvZAgMBAAECggEABpIvM8k+XAO5N+px4QX7bAFdvY6lnShXwAPqCpWQNDEp\n+lruKV7gdJHHMdKGPeqyooEnWyobXCSUOqmulRK1mAYZI+yjcxC/nv/M0Zgt1cWK\niK9pkNCxUVuXAbn1miyP4ACqL8RNzmDAionjO5G5jVHSdCBJ7MaPNGeZqoDbhe5p\nTV3sRFcCdTduL3BdohE1nlvLATMidPCrisuZ6tSgM3YzQEiITFQsXRY9yK3NWZod\nUjFusey/KRH3SD6nt5I1cmmuiJkpvY8/QqAbXR5lfAH3bnt07Fm+1BF/LHrBy4C9\nNww6C4pSD7K0VfVuibMN+sDCE2Eyyaioa59hugB2gQKBgQD2ljl2vrvCGZZzZFZz\nBTjhIz4AiemZSQEXyhPrDttbIuDrRi0VKijzsRk0Hlr3nc87uPtTQU5PAkvlkwzN\nF9ehBWN6a5WBWf36gu4IcGY1u1jiVDE12bXpQUVaHEfC5dPeZYfPRC2JFAo2c+Yf\nDeIGd6z3b3o01h/7P90JETn7zQKBgQDRn6QpeOMTjwZWQRN+GqSLlYbPJKjopYNQ\nFy1o7aE7w0BqqI+rOnqe7Bx9dPWYfdFnI3j+ZKeyXge+xIyG8ytYfB8DdV7SJUUi\nNXZ6kb5Udr9lHFB3vaqGmOMSvHS4WrxYjs1Gi91HAmrXUE4HEbH/briKSzOy9dUv\nohL0l3g8PQKBgG7sivMAv+ODsSs9YqohGkIkoVqKr3uV3Jj//U/LAiAQI4+SpOsV\naRCehRDt6sviwHtELkJ4aSqfhNbD/IkyBXzYuLQ0Oy/R9K9BQKSpM0FOgqBlcTGh\nOvSvuOvdNubUjidIEvzI1ZcJXcK7BjTIAPoZ0cQI8Ldd70sNonfWuPetAoGAfpyN\n6v65KPcaPL7RpzkwaZ7G7haWbu6JgbZ+FwJwgEhOgB2PqTyJE7RJAP3D2XclI8ap\nLf5dy74/r1nIBzqY07kkglJCE2uvdhoUlbOx4hJXSBrx/2DvvpxZiteJKFClsleO\nZS3VWS58mdBHUL2/ZSjbDayebVlOipa6HEHgvYECgYEA2ahY99uvaYWWNXC4T6gh\nSQVClVuMRGxWpBZdQMDSY5MXfsSLxNsMsRobMz7qAlIxyd1Qh4n0inNKFdVX+ZKQ\nWE1wdh8cMj/IEMVhqHBe35vQ6V4ROWYZUPbu3Q09b45TDyzoM3xvOWSYXeEhc8Sl\nckjMdBQP8gwEVge3OuXXUAc=\n-----END PRIVATE KEY-----\n';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log('='.repeat(60));
    console.log('Migration: Firebase RTDB → PostgreSQL');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
    console.log('='.repeat(60));

    // Initialize Firebase Admin
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: FIREBASE_PROJECT_ID,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            databaseURL: `https://${FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`,
        });
    }

    const db = admin.database();

    // Initialize PostgreSQL
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('PostgreSQL connected.');

        // 1. Migrate dropped_products
        await migrateDroppedProducts(db, pool);

        // 2. Migrate held_products
        await migrateHeldProducts(db, pool);

        console.log('\n' + '='.repeat(60));
        console.log('Migration complete!');
        console.log('='.repeat(60));
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
        admin.app().delete();
    }
}

async function migrateDroppedProducts(db, pool) {
    console.log('\n--- Migrating dropped_products ---');

    const snapshot = await db.ref('dropped_products').once('value');
    const data = snapshot.val();

    if (!data) {
        console.log('No dropped_products data in Firebase.');
        return;
    }

    const entries = Object.entries(data);
    console.log(`Found ${entries.length} dropped products in Firebase.`);

    let inserted = 0;
    let errors = 0;

    for (const [id, item] of entries) {
        try {
            if (DRY_RUN) {
                console.log(`  [DRY] Would insert: ${id} - ${item.ProductNameGet || item.ProductName} (qty: ${item.Quantity})`);
                inserted++;
                continue;
            }

            await pool.query(`
                INSERT INTO dropped_products (
                    id, product_id, product_code, product_name, product_name_get,
                    image_url, price, quantity, uom_name, reason,
                    campaign_id, campaign_name, removed_by, removed_from_order_stt,
                    removed_from_customer, removed_at, added_date, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14,
                    $15, $16, $17, $18, CURRENT_TIMESTAMP
                )
                ON CONFLICT (id) DO UPDATE SET
                    quantity = $8,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                id,
                item.ProductId || null,
                item.ProductCode || null,
                item.ProductName || null,
                item.ProductNameGet || null,
                item.ImageUrl || null,
                item.Price || 0,
                item.Quantity || 0,
                item.UOMName || 'Cái',
                item.reason || null,
                item.campaignId || null,
                item.campaignName || null,
                item.removedBy || null,
                item.removedFromOrderSTT || null,
                item.removedFromCustomer || null,
                item.removedAt || null,
                item.addedDate || null,
                item.addedAt ? new Date(item.addedAt) : new Date(),
            ]);

            inserted++;
        } catch (err) {
            console.error(`  Error inserting ${id}:`, err.message);
            errors++;
        }
    }

    console.log(`  Inserted: ${inserted}, Errors: ${errors}`);
}

async function migrateHeldProducts(db, pool) {
    console.log('\n--- Migrating held_products ---');

    const snapshot = await db.ref('held_products').once('value');
    const data = snapshot.val();

    if (!data) {
        console.log('No held_products data in Firebase.');
        return;
    }

    let totalEntries = 0;
    let inserted = 0;
    let errors = 0;

    // Firebase structure: held_products/{orderId}/{productId}/{userId} = { ...data }
    for (const orderId in data) {
        const orderProducts = data[orderId];
        if (!orderProducts) continue;

        for (const productId in orderProducts) {
            const productHolders = orderProducts[productId];
            if (!productHolders) continue;

            for (const userId in productHolders) {
                const holderData = productHolders[userId];
                if (!holderData) continue;

                totalEntries++;

                try {
                    const isDraft = holderData.isDraft === true;
                    const dataToStore = { ...holderData };
                    delete dataToStore.isDraft;

                    if (DRY_RUN) {
                        console.log(`  [DRY] Would insert: ${orderId}/${productId}/${userId} (qty: ${holderData.quantity}, draft: ${isDraft})`);
                        inserted++;
                        continue;
                    }

                    await pool.query(`
                        INSERT INTO held_products (order_id, product_id, user_id, data, is_draft, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT (order_id, product_id, user_id) DO UPDATE SET
                            data = $4,
                            is_draft = $5,
                            updated_at = CURRENT_TIMESTAMP
                    `, [orderId, productId, userId, JSON.stringify(dataToStore), isDraft]);

                    inserted++;
                } catch (err) {
                    console.error(`  Error inserting ${orderId}/${productId}/${userId}:`, err.message);
                    errors++;
                }
            }
        }
    }

    console.log(`  Total entries: ${totalEntries}, Inserted: ${inserted}, Errors: ${errors}`);
}

main();
