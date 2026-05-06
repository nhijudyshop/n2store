#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * One-time migration: Firestore `settings/product_code_rules` → PostgreSQL `admin_settings`.
 *
 * Reads:  Firestore document `settings/product_code_rules`
 *         Shape: { rules: [{match, codePrefix}, ...], defaultPrefix: 'N' }
 * Writes: admin_settings row with setting_key='product_code_rules' and setting_value=<JSON string>
 *
 * Idempotent — admin_settings.setSetting uses ON CONFLICT DO UPDATE. Re-running is safe.
 *
 * Usage:
 *   node render.com/scripts/migrate-product-code-rules-to-postgres.js
 *
 * Requires (env or render.com/.env):
 *   - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   - DATABASE_URL
 */

const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const { Pool } = require('pg');
const adminSettings = require('../services/admin-settings-service');

const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    console.error('[migrate] firebase-admin not installed. Run: npm install firebase-admin');
    process.exit(1);
}

function initFirebase() {
    if (admin.apps.length) return admin.apps[0];
    const projectId = process.env.FIREBASE_PROJECT_ID || 'n2shop-69e37';
    const clientEmail =
        process.env.FIREBASE_CLIENT_EMAIL ||
        'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com';
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
    if (!privateKey) {
        console.error('[migrate] FIREBASE_PRIVATE_KEY missing. Set env or render.com/.env');
        process.exit(1);
    }
    return admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
}

(async function main() {
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
    });

    try {
        initFirebase();
        const db = admin.firestore();
        const doc = await db.collection('settings').doc('product_code_rules').get();

        if (!doc.exists) {
            console.log('[migrate] Firestore document settings/product_code_rules NOT FOUND — nothing to migrate.');
            console.log('[migrate] Default rules will be used until admin saves rules in Settings UI.');
            return;
        }

        const data = doc.data() || {};
        const rules = Array.isArray(data.rules) ? data.rules : [];
        const defaultPrefix =
            typeof data.defaultPrefix === 'string' && data.defaultPrefix.trim()
                ? data.defaultPrefix.trim().toUpperCase()
                : 'N';

        const validRules = rules
            .filter((r) => r && typeof r.match === 'string' && typeof r.codePrefix === 'string')
            .map((r) => ({ match: r.match.trim(), codePrefix: r.codePrefix.trim() }))
            .filter((r) => r.match && r.codePrefix);

        const value = JSON.stringify({ rules: validRules, defaultPrefix });
        await adminSettings.setSetting(pool, 'product_code_rules', value, 'migration-script');

        console.log(`[migrate] OK — migrated ${validRules.length} rules + defaultPrefix=${defaultPrefix} to admin_settings.`);
        console.log('[migrate] Rules:', validRules);
    } catch (error) {
        console.error('[migrate] FAILED:', error);
        process.exitCode = 1;
    } finally {
        await pool.end().catch(() => {});
    }
})();
