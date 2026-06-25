#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Convert a stored login snapshot (in `serect_dont_push.txt`) into a Playwright
// `storageState` file (`auth-state.json`) WITHOUT re-running the login form.
// Playwright MCP consumes this via its `--storage-state` flag so Claude Code
// can drive an authenticated browser to verify code.
//
// Usage:
//   node scripts/export-auth-state.js [--base http://localhost:8080]
//        [--out downloads/n2store-session/auth-state.json]
//
// Reuses readSnapshot() from restore-login-session.js. NEVER echoes secret
// values — only counts. Output file is gitignored (contains JWTs).
//
// Note: Playwright storageState supports cookies + localStorage only (no
// sessionStorage). This app keeps auth in localStorage (loginindex_auth,
// web2_auth) so that limitation is harmless here.

const fs = require('fs');
const path = require('path');
const { readSnapshot } = require('./restore-login-session.js');

const args = process.argv.slice(2);
const get = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
};
const BASE = (get('base', 'http://localhost:8080') || '').replace(/\/$/, '');
const OUT = get(
    'out',
    path.join(__dirname, '..', 'downloads', 'n2store-session', 'auth-state.json')
);

const ts = () => new Date().toISOString();
const log = (...m) => console.log(`[${ts()}]`, ...m);

const snap = readSnapshot({ base: BASE });
if (!snap) {
    console.error(
        `no saved snapshot for ${BASE} in secrets file — run save-login-session.js first`
    );
    process.exit(1);
}

// Convert snapshot → Playwright storageState shape.
const origin = snap.origin || BASE;
const localStorageEntries = Object.entries(snap.localStorage || {}).map(([name, value]) => ({
    name,
    value,
}));

const storageState = {
    cookies: Array.isArray(snap.cookies) ? snap.cookies : [],
    origins: localStorageEntries.length ? [{ origin, localStorage: localStorageEntries }] : [],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(storageState, null, 2), 'utf8');

const ageH = ((Date.now() - new Date(snap.capturedAt).getTime()) / 3600000).toFixed(1);
log(
    `Wrote storageState → ${OUT} | origin=${origin} | cookies=${storageState.cookies.length} | LS keys=${localStorageEntries.length} | snapshot age=${ageH}h`
);
