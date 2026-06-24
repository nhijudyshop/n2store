#!/usr/bin/env node
// #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — render video HTML→MP4 (HeyGen HyperFrames) trên MÁY SHOP + tunnel + heartbeat.
/**
 * hyperframes-render — service tự host trên máy shop, biến HTML composition → MP4
 * dùng HeyGen HyperFrames (Apache-2.0). Mô hình GIỐNG vieneu-tts:
 *   server HTTP local  →  cloudflared tunnel (URL HTTPS ngẫu nhiên)
 *   →  heartbeat /register lên registry CHUNG (engine='hyperframes')
 *   →  trang web (Web2VideoRender) tự dò máy online + POST /render.
 *
 * KHÔNG cần route worker/registry mới — tái dùng web2-vieneu-registry (cột engine).
 *
 * Yêu cầu máy shop: Node 22+, FFmpeg, Chrome (Puppeteer tự tải), cloudflared.
 *   npm install            (cài express + hyperframes)
 *   node server.js         (cổng 8124 + tunnel + heartbeat)
 *   NO_TUNNEL=1 node server.js   (chỉ dùng trên chính máy này)
 *   HF_NAME="Máy render" node server.js
 *
 * ENV:
 *   PORT (8124) · HF_NAME · NO_TUNNEL=1 · VIENEU_REGISTRY_SECRET (nếu registry bật secret)
 *   HF_RENDER_CMD  — ghi đè lệnh render (mặc định: npx hyperframes render <in> <out>).
 *                    Verify lệnh đúng bằng `npx hyperframes render --help` lúc setup.
 */
'use strict';

const express = require('express');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8124', 10);
const NAME = process.env.HF_NAME || `${os.hostname().split('.')[0] || 'May-shop'} (HyperFrames)`;
const ENGINE = 'hyperframes';
const REGISTRY =
    process.env.VIENEU_REGISTRY ||
    'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-vieneu-registry';
const SECRET = process.env.VIENEU_REGISTRY_SECRET || '';
const NO_TUNNEL = process.env.NO_TUNNEL === '1';
const WORK = path.join(os.tmpdir(), 'hyperframes-render');
fs.mkdirSync(WORK, { recursive: true });

let publicUrl = `http://localhost:${PORT}`;

// ── HTTP server ──
const app = express();
app.use((req, res, n) => {
    // CORS: trang web (nhijudy.store / github.io) POST trực tiếp lên tunnel máy.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-web2-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    n();
});
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) =>
    res.json({ ok: true, engine: ENGINE, name: NAME, node: process.version })
);

// POST /render { html, name? } → MP4 (binary). Ghi HTML ra file → chạy HyperFrames CLI.
app.post('/render', async (req, res) => {
    const html = String(req.body?.html || '');
    if (!/<\w+/.test(html))
        return res.status(400).json({ ok: false, error: 'thiếu html composition' });
    const id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const dir = path.join(WORK, id);
    fs.mkdirSync(dir, { recursive: true });
    const inFile = path.join(dir, 'index.html');
    const outFile = path.join(dir, 'out.mp4');
    fs.writeFileSync(inFile, html);

    // Lệnh render: mặc định CLI HyperFrames. Operator có thể ghi đè qua HF_RENDER_CMD
    // với 2 placeholder {in} {out}. Verify flag đúng bằng `npx hyperframes render --help`.
    const tmpl = process.env.HF_RENDER_CMD || 'npx --yes hyperframes render {in} --output {out}';
    const cmd = tmpl.replace('{in}', inFile).replace('{out}', outFile);
    console.log('[hyperframes-render]', id, 'rendering →', cmd);

    const child = spawn(cmd, { shell: true, cwd: dir });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outFile)) {
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `inline; filename="${id}.mp4"`);
            fs.createReadStream(outFile)
                .on('close', () => fs.rm(dir, { recursive: true, force: true }, () => {}))
                .pipe(res);
        } else {
            console.error('[hyperframes-render]', id, 'FAIL code', code, log.slice(-800));
            fs.rm(dir, { recursive: true, force: true }, () => {});
            res.status(500).json({
                ok: false,
                error: 'render thất bại (code ' + code + ')',
                hint: 'Kiểm tra Node 22 + FFmpeg + Chrome. Xem log máy. Có thể cần đặt HF_RENDER_CMD đúng flag.',
                log: log.slice(-1200),
            });
        }
    });
});

// ── Heartbeat lên registry chung (engine='hyperframes') mỗi 30s ──
function heartbeat() {
    const body = JSON.stringify({
        name: NAME,
        url: publicUrl,
        engine: ENGINE,
        note: 'hyperframes',
    });
    fetch(REGISTRY + '/register', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(SECRET ? { 'x-vieneu-secret': SECRET } : {}),
        },
        body,
    }).catch(() => {});
}

// ── cloudflared tunnel (mirror serve.py) ──
function findCloudflared() {
    for (const c of ['cloudflared', 'cloudflared.exe']) {
        const r = spawnSync(c, ['--version'], { stdio: 'ignore', shell: true });
        if (r.status === 0) return c;
        const local = path.join(__dirname, c);
        if (fs.existsSync(local)) return local;
    }
    return null;
}
function startTunnel() {
    const cf = findCloudflared();
    if (!cf) {
        console.log(
            '⚠️  Chưa có cloudflared → trang web sẽ không dò được máy. Mac: brew install cloudflared.'
        );
        return;
    }
    console.log('▶ Mở tunnel HTTPS…');
    const p = spawn(cf, ['tunnel', '--url', `http://localhost:${PORT}`], { shell: false });
    const onLine = (buf) => {
        const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && !publicUrl.includes('trycloudflare')) {
            publicUrl = m[0];
            console.log('═'.repeat(60));
            console.log(`📹 Máy '${NAME}' ONLINE. Trang Tạo video sẽ tự hiện máy này.`);
            console.log(`   URL dự phòng: ${publicUrl}`);
            console.log('═'.repeat(60));
            heartbeat();
        }
    };
    p.stdout.on('data', onLine);
    p.stderr.on('data', onLine);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ hyperframes-render local: http://localhost:${PORT}`);
    if (NO_TUNNEL) console.log('ℹ️  NO_TUNNEL=1 → chỉ dùng trên chính máy này.');
    else startTunnel();
    heartbeat();
    setInterval(heartbeat, 30_000);
});
