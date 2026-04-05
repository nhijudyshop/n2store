#!/usr/bin/env node
/**
 * =====================================================
 * CAMPAIGN MIGRATION: Firebase Firestore → PostgreSQL
 * =====================================================
 *
 * Migrates:
 *   1. campaigns collection
 *   2. user_preferences (activeCampaignId)
 *   3. report_order_details (report_orders_v2) with chunk reassembly
 *   4. settings/employee_ranges_by_campaign
 *
 * Usage:
 *   node migrate-campaigns.js                    # Full migration
 *   node migrate-campaigns.js --export-only      # Backup to JSON only
 *   node migrate-campaigns.js --dry-run          # Show what would be migrated
 *   node migrate-campaigns.js --phase=1          # Only Phase 1 (campaigns + user prefs)
 *   node migrate-campaigns.js --phase=2          # Only Phase 2 (reports)
 *   node migrate-campaigns.js --phase=3          # Only Phase 3 (employee ranges)
 *
 * Environment Variables:
 *   DATABASE_URL    PostgreSQL connection string
 */

require('dotenv').config();
const { Pool } = require('pg');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// =====================================================
// CONFIGURATION
// =====================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isExportOnly = args.includes('--export-only');
const phaseArg = args.find(a => a.startsWith('--phase='));
const targetPhase = phaseArg ? parseInt(phaseArg.split('=')[1]) : null;

const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: 'n2shop-69e37',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com',
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
        projectId: 'n2shop-69e37'
    });
}

const db = admin.firestore();
const backupDir = path.join(__dirname, '..', 'data');

// =====================================================
// HELPERS
// =====================================================

function ensureBackupDir() {
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
}

function saveBackup(filename, data) {
    ensureBackupDir();
    const filepath = path.join(backupDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  ✅ Backup saved: ${filepath} (${data.length || Object.keys(data).length} records)`);
}

function log(msg) {
    console.log(`[MIGRATE] ${msg}`);
}

// =====================================================
// PHASE 1: CAMPAIGNS + USER PREFERENCES
// =====================================================

async function migrateCampaigns() {
    log('--- Phase 1: Campaigns ---');

    // 1. Read from Firestore
    const snapshot = await db.collection('campaigns').get();
    const campaigns = [];
    snapshot.forEach(doc => {
        campaigns.push({ id: doc.id, ...doc.data() });
    });
    log(`Found ${campaigns.length} campaigns in Firestore`);

    // 2. Backup
    const timestamp = new Date().toISOString().slice(0, 10);
    saveBackup(`backup-campaigns-${timestamp}.json`, campaigns);

    if (isExportOnly) return campaigns;

    // 3. Insert into PostgreSQL
    if (!isDryRun) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let inserted = 0;
            for (const c of campaigns) {
                await client.query(`
                    INSERT INTO campaigns (id, name, time_frame, time_frame_label, custom_start_date, custom_end_date, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        time_frame = EXCLUDED.time_frame,
                        time_frame_label = EXCLUDED.time_frame_label,
                        custom_start_date = EXCLUDED.custom_start_date,
                        custom_end_date = EXCLUDED.custom_end_date,
                        updated_at = EXCLUDED.updated_at
                `, [
                    c.id,
                    c.name || '',
                    c.timeFrame || 'custom',
                    c.timeFrameLabel || '',
                    c.customStartDate || '',
                    c.customEndDate || '',
                    c.createdAt || new Date().toISOString(),
                    c.updatedAt || new Date().toISOString()
                ]);
                inserted++;
            }
            await client.query('COMMIT');
            log(`Inserted/updated ${inserted} campaigns`);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        // 4. Verify
        const count = await pool.query('SELECT COUNT(*) FROM campaigns');
        log(`PostgreSQL campaigns count: ${count.rows[0].count}`);
    } else {
        log(`[DRY RUN] Would insert ${campaigns.length} campaigns`);
    }

    return campaigns;
}

async function migrateUserPreferences() {
    log('--- Phase 1: User Preferences ---');

    // 1. Read from Firestore
    const snapshot = await db.collection('user_preferences').get();
    const prefs = [];
    snapshot.forEach(doc => {
        prefs.push({ userId: doc.id, ...doc.data() });
    });
    log(`Found ${prefs.length} user preferences in Firestore`);

    // 2. Backup
    const timestamp = new Date().toISOString().slice(0, 10);
    saveBackup(`backup-user-preferences-${timestamp}.json`, prefs);

    if (isExportOnly) return prefs;

    // 3. Insert into PostgreSQL
    if (!isDryRun) {
        let inserted = 0;
        for (const p of prefs) {
            if (!p.activeCampaignId && !p.dateMode) continue; // skip empty prefs

            // Check if the campaign exists in campaigns table
            const campaignExists = await pool.query('SELECT id FROM campaigns WHERE id = $1', [p.activeCampaignId]);
            const activeCampaignId = campaignExists.rows.length > 0 ? p.activeCampaignId : null;

            await pool.query(`
                INSERT INTO user_campaign_preferences (user_id, active_campaign_id, filter_preferences)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE SET
                    active_campaign_id = EXCLUDED.active_campaign_id,
                    filter_preferences = EXCLUDED.filter_preferences,
                    updated_at = NOW()
            `, [
                p.userId,
                activeCampaignId,
                p.dateMode ? JSON.stringify(p.dateMode) : null
            ]);
            inserted++;
        }
        log(`Inserted/updated ${inserted} user preferences`);
    } else {
        log(`[DRY RUN] Would insert ${prefs.length} user preferences`);
    }

    return prefs;
}

// =====================================================
// PHASE 2: CAMPAIGN REPORTS (report_order_details)
// =====================================================

async function migrateReports() {
    log('--- Phase 2: Campaign Reports ---');

    const FIREBASE_PATH = 'report_order_details';
    const snapshot = await db.collection(FIREBASE_PATH).get();
    const reports = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let orders = data.orders || [];

        // Handle chunked data
        if (data.isChunked) {
            log(`  Report "${doc.id}" is chunked (${data.chunkCount || '?'} chunks), reassembling...`);
            orders = [];
            const chunksSnapshot = await doc.ref.collection('order_chunks').orderBy('chunkIndex').get();
            for (const chunk of chunksSnapshot.docs) {
                const chunkData = chunk.data();
                if (chunkData.orders && Array.isArray(chunkData.orders)) {
                    orders.push(...chunkData.orders);
                }
            }
            log(`  Reassembled ${orders.length} orders from ${chunksSnapshot.size} chunks`);
        }

        reports.push({
            tableName: data.tableName || doc.id,
            orders,
            totalOrders: data.totalOrders || orders.length,
            successCount: data.successCount || 0,
            errorCount: data.errorCount || 0,
            fetchedAt: data.fetchedAt || null,
            isSavedCopy: data.isSavedCopy || false,
            originalCampaign: data.originalCampaign || null,
        });
    }

    log(`Found ${reports.length} reports in Firestore`);

    // Backup (without orders for size)
    const timestamp = new Date().toISOString().slice(0, 10);
    const backupMeta = reports.map(r => ({
        ...r,
        orders: `[${r.orders.length} orders omitted]`,
        orderCount: r.orders.length
    }));
    saveBackup(`backup-report-orders-meta-${timestamp}.json`, backupMeta);

    // Full backup with orders
    saveBackup(`backup-report-orders-full-${timestamp}.json`, reports);

    if (isExportOnly) return reports;

    // Insert into PostgreSQL
    if (!isDryRun) {
        let inserted = 0;
        for (const r of reports) {
            try {
                await pool.query(`
                    INSERT INTO campaign_reports (table_name, orders, total_orders, success_count, error_count, fetched_at, is_saved_copy, original_campaign)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (table_name) DO UPDATE SET
                        orders = EXCLUDED.orders,
                        total_orders = EXCLUDED.total_orders,
                        success_count = EXCLUDED.success_count,
                        error_count = EXCLUDED.error_count,
                        fetched_at = EXCLUDED.fetched_at,
                        is_saved_copy = EXCLUDED.is_saved_copy,
                        original_campaign = EXCLUDED.original_campaign,
                        updated_at = NOW()
                `, [
                    r.tableName,
                    JSON.stringify(r.orders),
                    r.totalOrders,
                    r.successCount,
                    r.errorCount,
                    r.fetchedAt,
                    r.isSavedCopy,
                    r.originalCampaign
                ]);
                inserted++;
                log(`  ✅ Report "${r.tableName}" (${r.orders.length} orders)`);
            } catch (e) {
                log(`  ❌ Report "${r.tableName}" failed: ${e.message}`);
            }
        }
        log(`Inserted/updated ${inserted}/${reports.length} reports`);

        // Verify
        const count = await pool.query('SELECT COUNT(*) FROM campaign_reports');
        log(`PostgreSQL campaign_reports count: ${count.rows[0].count}`);
    }

    return reports;
}

// =====================================================
// PHASE 3: EMPLOYEE RANGES BY CAMPAIGN
// =====================================================

async function migrateEmployeeRanges() {
    log('--- Phase 3: Employee Ranges ---');

    const doc = await db.collection('settings').doc('employee_ranges_by_campaign').get();
    if (!doc.exists) {
        log('No employee_ranges_by_campaign document found');
        return {};
    }

    const allRanges = doc.data();
    const campaignNames = Object.keys(allRanges);
    log(`Found employee ranges for ${campaignNames.length} campaigns`);

    // Backup
    const timestamp = new Date().toISOString().slice(0, 10);
    saveBackup(`backup-employee-ranges-${timestamp}.json`, allRanges);

    if (isExportOnly) return allRanges;

    // Insert into PostgreSQL
    if (!isDryRun) {
        let inserted = 0;
        for (const campaignName of campaignNames) {
            const ranges = allRanges[campaignName];
            // Convert object format {0: {...}, 1: {...}} to array
            const rangesArray = Array.isArray(ranges) ? ranges : Object.values(ranges);

            await pool.query(`
                INSERT INTO campaign_employee_ranges (campaign_name, employee_ranges)
                VALUES ($1, $2)
                ON CONFLICT (campaign_name) DO UPDATE SET
                    employee_ranges = EXCLUDED.employee_ranges,
                    updated_at = NOW()
            `, [campaignName, JSON.stringify(rangesArray)]);
            inserted++;
        }
        log(`Inserted/updated ${inserted} campaign employee ranges`);

        // Verify
        const count = await pool.query('SELECT COUNT(*) FROM campaign_employee_ranges');
        log(`PostgreSQL campaign_employee_ranges count: ${count.rows[0].count}`);
    }

    return allRanges;
}

// =====================================================
// MAIN
// =====================================================

async function main() {
    log('=== Campaign Migration: Firebase → PostgreSQL ===');
    log(`Mode: ${isExportOnly ? 'EXPORT ONLY' : isDryRun ? 'DRY RUN' : 'FULL MIGRATION'}`);
    if (targetPhase) log(`Target phase: ${targetPhase}`);
    log('');

    try {
        // Ensure tables exist
        if (!isExportOnly && !isDryRun) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS campaigns (
                    id VARCHAR(100) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    time_frame VARCHAR(50) DEFAULT 'custom',
                    time_frame_label VARCHAR(255),
                    custom_start_date VARCHAR(50),
                    custom_end_date VARCHAR(50),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS user_campaign_preferences (
                    user_id VARCHAR(255) PRIMARY KEY,
                    active_campaign_id VARCHAR(100) REFERENCES campaigns(id) ON DELETE SET NULL,
                    filter_preferences JSONB,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS campaign_reports (
                    id SERIAL PRIMARY KEY,
                    table_name VARCHAR(255) NOT NULL UNIQUE,
                    orders JSONB DEFAULT '[]',
                    total_orders INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    error_count INTEGER DEFAULT 0,
                    fetched_at VARCHAR(100),
                    is_saved_copy BOOLEAN DEFAULT FALSE,
                    original_campaign VARCHAR(255),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS campaign_employee_ranges (
                    id SERIAL PRIMARY KEY,
                    campaign_name VARCHAR(255) NOT NULL UNIQUE,
                    employee_ranges JSONB DEFAULT '[]',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);
            log('Tables ensured');
        }

        // Phase 1
        if (!targetPhase || targetPhase === 1) {
            await migrateCampaigns();
            await migrateUserPreferences();
        }

        // Phase 2
        if (!targetPhase || targetPhase === 2) {
            await migrateReports();
        }

        // Phase 3
        if (!targetPhase || targetPhase === 3) {
            await migrateEmployeeRanges();
        }

        log('');
        log('=== Migration complete ===');
    } catch (error) {
        console.error('[MIGRATE] Fatal error:', error);
        process.exit(1);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

main();
