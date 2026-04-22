#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * OnCallCX Sync Daemon
 *
 * Lý do tồn tại: Render.com (SG) và CF Worker (global) KHÔNG connect được
 * pbx-ucaas.oncallcx.vn do GeoIP firewall chỉ cho phép IP Vietnam consumer ISP.
 * Máy local của user (VN ISP) thì connect được. Vì vậy chạy sync trên máy user.
 *
 * Flow:
 *   1. Login pbx-ucaas.oncallcx.vn (credentials từ serect_dont_push.txt)
 *   2. Fetch 25 CDR gần nhất từ pbxCalls.xhtml
 *   3. Lọc ra rows có Connected=Yes + Duration > 0 + CHƯA sync (state file)
 *   4. Download từng recording.wav
 *   5. POST lên Render /api/oncall/call-recordings (base64)
 *   6. Cập nhật state file → lần sau skip
 *
 * State file: ~/.n2store-oncallcx-sync/state.json
 *   { syncedRowKeys: [...], lastSyncAt: 1234567890 }
 *
 * Run: node scripts/oncallcx-sync-daemon.js
 * Hoặc one-shot: MAX=10 node scripts/oncallcx-sync-daemon.js
 * Hoặc via launchd (xem scripts/install-oncallcx-sync.sh)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const STATE_DIR = path.join(os.homedir(), '.n2store-oncallcx-sync');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOG_FILE = path.join(STATE_DIR, 'sync.log');

const RENDER_BASE = 'https://n2store-fallback.onrender.com/api/oncall';
const MAX = parseInt(process.env.MAX || '25', 10);
const DEBUG = process.env.DEBUG === '1';

// Max rowKeys to keep in state (oldest pruned when exceeded)
const STATE_CAP = 500;

// ============================================================
// Logging
// ============================================================

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function debug(msg) { if (DEBUG) log('[debug] ' + msg); }

// ============================================================
// State
// ============================================================

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return { syncedRowKeys: [], lastSyncAt: 0 };
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const s = JSON.parse(raw);
        return { syncedRowKeys: Array.isArray(s.syncedRowKeys) ? s.syncedRowKeys : [], lastSyncAt: s.lastSyncAt || 0 };
    } catch (e) {
        log(`[state] load error: ${e.message} — starting fresh`);
        return { syncedRowKeys: [], lastSyncAt: 0 };
    }
}

function saveState(state) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    // Keep only last STATE_CAP rowKeys (FIFO)
    if (state.syncedRowKeys.length > STATE_CAP) {
        state.syncedRowKeys = state.syncedRowKeys.slice(-STATE_CAP);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================
// Credentials
// ============================================================

function readCredentials() {
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content.split('\n').find(l => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    if (!line) throw new Error('No OnCallCX credentials in secrets file');
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    return { username: parts[0], password: parts.slice(1).join(' ') };
}

// ============================================================
// Duration parsing: "00:01:49" → 109 seconds
// ============================================================

function parseDurationSec(hms) {
    if (!hms) return 0;
    const parts = hms.split(':').map(s => parseInt(s, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

// "22.04.2026 14:22:29" → epoch ms
function parseTimestamp(s) {
    if (!s) return Date.now();
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return Date.now();
    const [, dd, mm, yyyy, hh, min, ss] = m;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+07:00`).getTime();
}

// ============================================================
// Direction detection: portal chỉ có Outbound Public Number,
// không phân biệt in/out rõ. Dùng heuristic.
// ============================================================

function detectDirection(call) {
    // If "from" is internal ext (3 digits) → outbound
    // Else → inbound
    if (/^\d{3}$/.test(call.from)) return 'out';
    return 'in';
}

// ============================================================
// Upload recording to Render
// ============================================================

async function uploadToRender(fetch, meta, wavBuffer) {
    const body = {
        phone: meta.phone,
        audio_b64: wavBuffer.toString('base64'),
        username: 'oncallcx-portal-sync',
        ext: meta.ext,
        name: meta.name || null,
        direction: meta.direction,
        duration: meta.duration,
        mime_type: 'audio/wav',
        timestamp: meta.timestamp,
        order_code: meta.orderCode || null,
    };
    const r = await fetch(`${RENDER_BASE}/call-recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Render upload failed ${r.status}: ${txt.slice(0, 200)}`);
    try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

// ============================================================
// Main sync
// ============================================================

async function main() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    log('=== Sync run start ===');

    const creds = readCredentials();
    const { OnCallPortalClient } = require('../render.com/services/oncall-portal-client');
    const client = new OnCallPortalClient({ username: creds.username, password: creds.password, debug: DEBUG });
    const fetch = require('../render.com/node_modules/node-fetch');

    const state = loadState();
    const syncedSet = new Set(state.syncedRowKeys);
    debug(`State: ${syncedSet.size} already synced`);

    // 1. Login + fetch CDR
    await client.login();
    log(`Logged in as ${creds.username}`);

    const { calls } = await client.listCalls({ page: 1 });
    log(`Fetched ${calls.length} CDR rows`);

    // 2. Filter eligible (has recording + not synced)
    const eligible = calls.filter(c => c.hasRecording && !syncedSet.has(c.rowKey));
    log(`Eligible for sync: ${eligible.length} (new with recording)`);
    if (!eligible.length) {
        state.lastSyncAt = Date.now();
        saveState(state);
        log('=== Nothing to sync. Done. ===');
        return;
    }

    // 3. For each: download + upload
    let synced = 0, failed = 0;
    const toProcess = eligible.slice(0, MAX);
    for (const call of toProcess) {
        const tag = `${call.start} ${call.from}->${call.outboundPublicNumber || call.to} rk=${call.rowKey}`;
        try {
            debug(`Downloading ${tag}`);
            const dl = await client.downloadRecording(call.rowKey);
            // Buffer stream to memory (WAV files ~500KB-3MB is fine)
            const chunks = [];
            await new Promise((res, rej) => {
                dl.stream.on('data', c => chunks.push(c));
                dl.stream.on('end', res);
                dl.stream.on('error', rej);
            });
            const wav = Buffer.concat(chunks);
            debug(`Got ${wav.length}B`);

            // Prepare metadata
            const direction = detectDirection(call);
            const phone = direction === 'out' ? (call.outboundPublicNumber || call.to) : call.from;
            const ext = direction === 'out' ? call.from : call.to;
            const meta = {
                phone, ext, direction,
                duration: parseDurationSec(call.duration),
                timestamp: parseTimestamp(call.start),
            };

            await uploadToRender(fetch, meta, wav);
            syncedSet.add(call.rowKey);
            state.syncedRowKeys.push(call.rowKey);
            synced++;
            log(`[ok] synced ${tag} (${wav.length}B, ${meta.duration}s)`);
            // Save after each successful sync (crash-safe)
            saveState(state);
        } catch (err) {
            failed++;
            log(`[err] ${tag} — ${err.message}`);
        }
    }

    state.lastSyncAt = Date.now();
    saveState(state);
    log(`=== Done: synced=${synced}, failed=${failed}, skipped=${eligible.length - toProcess.length}, state=${syncedSet.size} tracked ===`);
}

main().catch(err => {
    log(`[fatal] ${err.message}\n${err.stack}`);
    process.exit(1);
});
