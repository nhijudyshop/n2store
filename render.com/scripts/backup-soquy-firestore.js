#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Backup Soquy Firestore collections to a single JSON file.
 *
 * Collections backed up:
 *   - soquy_vouchers
 *   - soquy_counters
 *   - soquy_meta
 *
 * Usage:
 *   node render.com/scripts/backup-soquy-firestore.js
 *
 * Output:
 *   render.com/backups/soquy/soquy-backup-<ISO>.json
 *
 * Requires env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * (loaded from render.com/.env if present)
 */

const path = require('path');
const fs = require('fs');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const admin = require('firebase-admin');

const COLLECTIONS = ['soquy_vouchers', 'soquy_counters', 'soquy_meta'];

function initFirebase() {
    if (admin.apps.length) return;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
    }
    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
    console.log('[backup-soquy] Firebase initialized for', projectId);
}

/**
 * Convert Firestore special types (Timestamp, GeoPoint, etc.) into a
 * JSON-friendly representation that the migration script can re-hydrate.
 */
function serialize(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof admin.firestore.Timestamp) {
        return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds, iso: value.toDate().toISOString() };
    }
    if (value instanceof admin.firestore.GeoPoint) {
        return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    }
    if (value instanceof admin.firestore.DocumentReference) {
        return { __type: 'docref', path: value.path };
    }
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = serialize(value[k]);
        return out;
    }
    return value;
}

async function dumpCollection(db, name) {
    const snap = await db.collection(name).get();
    const docs = [];
    snap.forEach(doc => docs.push({ id: doc.id, data: serialize(doc.data()) }));
    console.log(`[backup-soquy] ${name}: ${docs.length} docs`);
    return docs;
}

async function main() {
    initFirebase();
    const db = admin.firestore();

    const result = {
        backedUpAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_PROJECT_ID,
        collections: {}
    };

    for (const name of COLLECTIONS) {
        result.collections[name] = await dumpCollection(db, name);
    }

    const outDir = path.join(__dirname, '..', 'backups', 'soquy');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = result.backedUpAt.replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `soquy-backup-${stamp}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

    // Also write/overwrite a "latest" pointer for the migration script
    const latestFile = path.join(outDir, 'soquy-backup-latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

    const totals = Object.entries(result.collections).map(([k, v]) => `${k}=${v.length}`).join(', ');
    console.log(`[backup-soquy] Done → ${outFile}`);
    console.log(`[backup-soquy] Totals: ${totals}`);
}

main().catch(err => {
    console.error('[backup-soquy] FAILED:', err);
    process.exit(1);
});
