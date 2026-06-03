#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// One-time helper: lấy Chrome Web Store API refresh_token.
//
// Pipeline:
//   1. User vào Google Cloud Console → tạo OAuth2 Desktop App credentials
//      → có client_id + client_secret
//   2. Chạy script này → mở browser cho user consent
//   3. Script bắt callback → đổi auth code thành refresh_token
//   4. Print refresh_token để user paste vào serect_dont_push.txt
//
// Usage:
//   node scripts/cws-get-refresh-token.js <client_id> <client_secret>
//
// Hoặc set env vars + chạy không args:
//   CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... node scripts/cws-get-refresh-token.js

const http = require('http');
const url = require('url');
const { exec } = require('child_process');

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const clientId = process.argv[2] || process.env.CWS_CLIENT_ID;
const clientSecret = process.argv[3] || process.env.CWS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error('Usage: node scripts/cws-get-refresh-token.js <client_id> <client_secret>');
    console.error(
        '   or: CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... node scripts/cws-get-refresh-token.js'
    );
    console.error('');
    console.error('Cần lấy client_id + client_secret từ Google Cloud Console trước.');
    console.error('Hướng dẫn: docs/extension-auto-publish.md');
    process.exit(1);
}

const authUrl =
    `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline` +
    `&prompt=consent`;

function openBrowser(target) {
    const cmd =
        process.platform === 'darwin'
            ? `open "${target}"`
            : process.platform === 'win32'
              ? `start "" "${target}"`
              : `xdg-open "${target}"`;
    exec(cmd, () => {});
}

async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
    }).toString();

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    return res.json();
}

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const code = parsed.query.code;
    const error = parsed.query.error;

    if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>❌ Error: ${error}</h1><p>Đóng tab này và chạy lại script.</p>`);
        console.error('OAuth error:', error);
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.writeHead(400);
        res.end('Missing code');
        return;
    }

    console.log('\n✓ Got auth code, exchanging for refresh_token...');
    try {
        const tokens = await exchangeCodeForToken(code);

        if (tokens.refresh_token) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
<!doctype html><html><body style="font-family:system-ui;max-width:600px;margin:50px auto;padding:20px">
<h1>✅ Success!</h1>
<p>Refresh token đã được in ra terminal. Copy paste vào <code>serect_dont_push.txt</code>.</p>
<p>Có thể đóng tab này.</p>
</body></html>
      `);

            console.log('\n════════════════════════════════════════════════════════');
            console.log('✅ Refresh token (paste vào serect_dont_push.txt):');
            console.log('');
            console.log(`CWS_CLIENT_ID: ${clientId}`);
            console.log(`CWS_CLIENT_SECRET: ${clientSecret}`);
            console.log(`CWS_REFRESH_TOKEN: ${tokens.refresh_token}`);
            console.log('CWS_EXTENSION_ID: dgcicifdlgamleagjangkbbcdgbhmfea');
            console.log('════════════════════════════════════════════════════════\n');

            server.close();
            process.exit(0);
        } else {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(
                `<h1>❌ No refresh_token returned</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`
            );
            console.error('No refresh_token. Response:', tokens);
            console.error(
                '\n⚠ Có thể app đã được consent trước rồi → Google không trả refresh_token mới.'
            );
            console.error(
                'Fix: vào https://myaccount.google.com/permissions → revoke app → chạy lại script.'
            );
            server.close();
            process.exit(1);
        }
    } catch (e) {
        res.writeHead(500);
        res.end('Error: ' + e.message);
        console.error('Exchange error:', e);
        server.close();
        process.exit(1);
    }
});

server.listen(REDIRECT_PORT, () => {
    console.log(`\n→ Local callback listening on ${REDIRECT_URI}`);
    console.log(`→ Opening browser for OAuth consent...\n`);
    console.log(`(Nếu browser không tự mở, paste URL này:)`);
    console.log(authUrl);
    console.log('');
    openBrowser(authUrl);
});

setTimeout(
    () => {
        console.error('\n⏱ Timeout after 5 min — abort');
        process.exit(1);
    },
    5 * 60 * 1000
);
