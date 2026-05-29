#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * One-shot: grant bobo the 4 inventoryTracking permissions so they can
 * view + edit "Chi phí hàng về" and "Ghi chú Admin" columns.
 *
 *   view_chiPhiHangVe, edit_chiPhiHangVe, view_ghiChuAdmin, edit_ghiChuAdmin → true
 *
 * Strategy: log in as admin, fetch bobo's full user object, merge the 4
 * flips into detailedPermissions.inventoryTracking, PUT back. Other perms
 * are preserved untouched (no role_template change either).
 *
 * Run: node scripts/grant-bobo-cp-perms.js
 *      ADMIN_PASS=... node scripts/grant-bobo-cp-perms.js   # override
 */

const API = 'https://n2store-fallback.onrender.com/api';
const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@@';
const TARGET = 'bobo';
const FLIPS = {
    view_chiPhiHangVe: true,
    edit_chiPhiHangVe: true,
    view_ghiChuAdmin: true,
    edit_ghiChuAdmin: true,
};

async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = { raw: text };
    }
    return { status: res.status, body };
}

async function main() {
    console.log(`→ Logging in as ${ADMIN_USER}…`);
    const login = await jsonFetch(`${API}/users/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    if (login.status !== 200 || !login.body.token) {
        console.error('Login failed:', login.status, login.body);
        process.exit(1);
    }
    const token = login.body.token;
    const authHeader = { Authorization: `Bearer ${token}` };

    console.log(`→ Fetching ${TARGET}…`);
    const get = await jsonFetch(`${API}/users/${TARGET}`, { headers: authHeader });
    if (get.status !== 200 || !get.body.user) {
        console.error('GET failed:', get.status, get.body);
        process.exit(1);
    }
    const u = get.body.user;
    const dp = u.detailedPermissions || {};
    const inv = dp.inventoryTracking || dp.inventoryTrackingPermissions || {};

    const before = Object.fromEntries(Object.keys(FLIPS).map((k) => [k, inv[k]]));
    console.log('Before:', before);

    const updated = { ...inv, ...FLIPS };
    const newDetailed = { ...dp, inventoryTracking: updated };
    // Drop legacy alias if present so the slice doesn't drift.
    delete newDetailed.inventoryTrackingPermissions;

    console.log(`→ PUT /users/${TARGET}…`);
    const put = await jsonFetch(`${API}/users/${TARGET}`, {
        method: 'PUT',
        headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({
            displayName: u.displayName,
            identifier: u.identifier || '',
            roleTemplate: u.roleTemplate || 'custom',
            isAdmin: !!u.isAdmin,
            detailedPermissions: newDetailed,
        }),
    });
    if (put.status !== 200) {
        console.error('PUT failed:', put.status, put.body);
        process.exit(1);
    }

    console.log(`→ Verifying via public read endpoint…`);
    const verify = await jsonFetch(`${API}/v2/inventory-tracking/user-permissions/${TARGET}`);
    const perms = verify.body?.data?.permissions || {};
    const after = Object.fromEntries(Object.keys(FLIPS).map((k) => [k, perms[k]]));
    console.log('After:', after);

    const ok = Object.keys(FLIPS).every((k) => perms[k] === true);
    console.log(ok ? '✓ Permissions granted' : '✗ Verification mismatch');
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
