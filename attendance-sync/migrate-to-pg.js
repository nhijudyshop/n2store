/**
 * One-time migration script: Firestore attendance data → PostgreSQL (Render API)
 *
 * Usage: node migrate-to-pg.js [API_URL]
 * Default API_URL: https://n2store-fallback.onrender.com/api/attendance
 *
 * Safe to run multiple times (uses ON CONFLICT / upsert)
 */

const admin = require('firebase-admin');
const path = require('path');

const API_BASE = process.argv[2] || 'https://n2store-fallback.onrender.com/api/attendance';

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
});
const db = admin.firestore();

async function post(endpoint, body) {
    const url = API_BASE + endpoint;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${endpoint} failed: ${res.status} ${text}`);
    }
    return res.json();
}

async function put(endpoint, body) {
    const url = API_BASE + endpoint;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PUT ${endpoint} failed: ${res.status} ${text}`);
    }
    return res.json();
}

function ts(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return val;
}

async function migrateDeviceUsers() {
    console.log('\n--- Migrating attendance_device_users ---');
    const snap = await db.collection('attendance_device_users').get();
    console.log(`Found ${snap.size} documents`);
    if (!snap.size) return;

    const users = [];
    snap.forEach(doc => {
        const d = doc.data();
        users.push({
            user_id: doc.id,
            uid: d.uid || '',
            name: d.name || '',
            role: d.role || 0,
        });
    });

    const result = await post('/device-users/bulk', { users });
    console.log(`Uploaded: ${result.count}`);

    // Migrate custom fields (displayName, dailyRate, workStart, workEnd) via PATCH
    for (const doc of snap.docs) {
        const d = doc.data();
        const patches = {};
        if (d.displayName) patches.display_name = d.displayName;
        if (d.dailyRate) patches.daily_rate = d.dailyRate;
        if (d.workStart != null) patches.work_start = d.workStart;
        if (d.workEnd != null) patches.work_end = d.workEnd;
        if (Object.keys(patches).length > 0) {
            const url = API_BASE + '/device-users/' + doc.id;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patches),
            });
            if (!res.ok) console.error(`PATCH ${doc.id} failed: ${res.status}`);
        }
    }
    console.log('Custom fields patched');
}

async function migrateRecords() {
    console.log('\n--- Migrating attendance_records ---');
    const snap = await db.collection('attendance_records').get();
    console.log(`Found ${snap.size} documents`);
    if (!snap.size) return;

    // Batch in chunks of 500
    const allRecords = [];
    snap.forEach(doc => {
        const d = doc.data();
        allRecords.push({
            id: doc.id,
            device_user_id: d.deviceUserId || '',
            check_time: ts(d.checkTime),
            date_key: d.dateKey || '',
            type: d.type || 0,
            source: d.source || 'device',
        });
    });

    let total = 0;
    for (let i = 0; i < allRecords.length; i += 500) {
        const batch = allRecords.slice(i, i + 500);
        const result = await post('/records/bulk', { records: batch });
        total += result.count || batch.length;
        process.stdout.write(`  ${total}/${allRecords.length}\r`);
    }
    console.log(`Uploaded: ${total}`);
}

async function migratePayroll() {
    console.log('\n--- Migrating attendance_payroll ---');
    const snap = await db.collection('attendance_payroll').get();
    console.log(`Found ${snap.size} documents`);

    for (const doc of snap.docs) {
        const d = doc.data();
        await put('/payroll/' + doc.id, {
            empId: d.empId || doc.id.split('_')[0],
            monthKey: d.monthKey || doc.id.substring(doc.id.indexOf('_') + 1),
            thuongItems: d.thuongItems || [],
            giamTruItems: d.giamTruItems || [],
            daTraItems: d.daTraItems || [],
            allowances: d.allowances || [],
            ghiChu: d.ghiChu || '',
            salaryDaysOverride: d.salaryDaysOverride || null,
            otHoursOverride: d.otHoursOverride || null,
            giamTruLateOverride: d.giamTruLateOverride != null ? d.giamTruLateOverride : null,
            giamTruNote: d.giamTruNote || null,
        });
    }
    console.log(`Uploaded: ${snap.size}`);
}

async function migrateFullday() {
    console.log('\n--- Migrating attendance_fullday ---');
    const snap = await db.collection('attendance_fullday').get();
    console.log(`Found ${snap.size} documents`);

    for (const doc of snap.docs) {
        await post('/fullday/' + doc.id, {});
    }
    console.log(`Uploaded: ${snap.size}`);
}

async function migrateAllowances() {
    console.log('\n--- Migrating attendance_allowances ---');
    const snap = await db.collection('attendance_allowances').get();
    console.log(`Found ${snap.size} documents`);

    for (const doc of snap.docs) {
        const d = doc.data();
        await put('/allowances/' + doc.id, {
            empId: d.empId || doc.id.split('_')[0],
            monthKey: d.monthKey || '',
            amount: d.amount || 0,
        });
    }
    console.log(`Uploaded: ${snap.size}`);
}

async function migrateSyncStatus() {
    console.log('\n--- Migrating attendance_sync_status ---');
    const doc = await db.collection('attendance_sync_status').doc('current').get();
    if (!doc.exists) {
        console.log('No sync status document found');
        return;
    }
    const d = doc.data();
    await put('/sync-status', {
        connected: d.connected || false,
        last_sync_time: ts(d.lastSyncTime) || ts(d.updatedAt),
        last_error: d.lastError || null,
    });
    console.log('Uploaded: 1');
}

async function main() {
    console.log('=== Attendance Migration: Firestore → PostgreSQL ===');
    console.log('API:', API_BASE);

    await migrateDeviceUsers();
    await migrateRecords();
    await migratePayroll();
    await migrateFullday();
    await migrateAllowances();
    await migrateSyncStatus();

    console.log('\n=== Migration complete ===');
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
