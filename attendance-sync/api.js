/**
 * HTTP API client for Render PostgreSQL backend
 * Drop-in replacement for firebase.js — same interface:
 *   init, uploadRecords, uploadUsers, setStatus, onCommands, updateCommand
 */

const API_BASE = process.env.ATTENDANCE_API_URL || 'https://n2store-fallback.onrender.com/api/attendance';

async function apiRequest(method, path, body) {
    const url = API_BASE + path;
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
}

function dk(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function init() {
    // No-op: no Firebase initialization needed
    console.log('[api] Using Render API:', API_BASE);
}

async function uploadRecords(records) {
    if (!records.length) return 0;
    const validStart = new Date('2020-01-01').getTime();
    const validEnd = Date.now() + 86400000; // tomorrow
    const rows = [];
    let skipped = 0;
    for (const r of records) {
        const t = new Date(r.recordTime || Date.now());
        const uid = String(r.deviceUserId || '');
        // Skip records with invalid timestamps (before 2020 or future)
        if (!uid || uid === '0' || t.getTime() < validStart || t.getTime() > validEnd) {
            skipped++;
            continue;
        }
        rows.push({
            id: uid + '_' + t.getTime(),
            device_user_id: uid,
            check_time: t.toISOString(),
            date_key: dk(t),
            type: r.type || 0,
            source: 'device',
        });
    }
    if (skipped > 0) console.log('[api] skipped ' + skipped + ' invalid records (bad timestamp or uid)');

    let total = 0;
    // Batch in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const result = await apiRequest('POST', '/records/bulk', { records: batch });
        total += result.count || batch.length;
    }
    return total;
}

async function uploadUsers(users) {
    if (!users.length) return;
    const rows = users.filter(u => u.userId || u.uid).map(u => ({
        user_id: String(u.userId || u.uid || ''),
        uid: String(u.uid || ''),
        name: u.name || ('User ' + (u.userId || u.uid)),
        role: u.role || 0,
    }));
    await apiRequest('POST', '/device-users/bulk', { users: rows });
}

async function setStatus(data) {
    await apiRequest('PUT', '/sync-status', {
        connected: data.connected,
        last_sync_time: data.lastSyncTime || new Date().toISOString(),
        last_error: data.lastError || null,
    });
}

// Poll for pending commands every 10 seconds (replaces Firestore onSnapshot)
let _pollInterval = null;

function onCommands(cb) {
    if (_pollInterval) clearInterval(_pollInterval);
    _pollInterval = setInterval(async () => {
        try {
            const data = await apiRequest('GET', '/commands/pending');
            if (data.commands && data.commands.length > 0) {
                for (const cmd of data.commands) {
                    cb({ id: cmd.id, action: cmd.action, ...cmd });
                }
            }
        } catch (e) {
            // Silent - retry next interval
        }
    }, 10000);
}

async function updateCommand(id, status, result) {
    await apiRequest('PATCH', '/commands/' + id, { status, result: result || '' });
}

module.exports = { init, uploadRecords, uploadUsers, setStatus, onCommands, updateCommand };
