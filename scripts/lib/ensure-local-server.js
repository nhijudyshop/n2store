// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
/**
 * ensure-local-server.js — auto-start localhost HTTP server cho test scripts.
 *
 * Khi `--base http://localhost:PORT` được truyền:
 *   1. Probe port — nếu đã listen, dùng tiếp.
 *   2. Nếu chưa listen → spawn `python3 -m http.server PORT` từ project root, detached.
 *   3. Wait cho server sẵn sàng (poll HEAD `/` mỗi 200ms, tối đa 10s).
 *
 * Server spawn ở mode detached: chạy tiếp khi script test exit (cho live-coding workflow).
 * User tự `pkill -f "http.server 8080"` khi muốn stop.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function isLocalUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0';
    } catch {
        return false;
    }
}

function probePort(port, host = '127.0.0.1', timeoutMs = 1000) {
    return new Promise((resolve) => {
        const req = http.request(
            { method: 'HEAD', host, port, path: '/', timeout: timeoutMs },
            (res) => {
                res.resume();
                resolve(true);
            }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

async function waitPortReady(port, host, maxMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        if (await probePort(port, host, 500)) return true;
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

/**
 * Đảm bảo localhost server chạy nếu BASE là localhost.
 * @param {string} baseUrl ví dụ "http://localhost:8080" hoặc "https://nhijudyshop.github.io/n2store"
 * @param {string} projectRoot ví dụ path.join(__dirname, '..')
 * @returns {Promise<{started:boolean, pid?:number, port?:number}>}
 */
async function ensureLocalServer(baseUrl, projectRoot) {
    if (!isLocalUrl(baseUrl)) return { started: false }; // online — skip
    const u = new URL(baseUrl);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const host = u.hostname === '0.0.0.0' ? '127.0.0.1' : u.hostname;

    if (await probePort(port, host)) {
        console.log(`[ensure-local-server] ✅ Server đã chạy ở ${host}:${port}`);
        return { started: false, port };
    }

    console.log(
        `[ensure-local-server] 🚀 Spawn 'python3 -m http.server ${port}' từ ${projectRoot}…`
    );
    const child = spawn('python3', ['-m', 'http.server', String(port)], {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
    });
    child.unref(); // KHÔNG block exit của script test
    const pid = child.pid;
    console.log(`[ensure-local-server] PID=${pid}, đợi port sẵn sàng…`);

    const ready = await waitPortReady(port, host, 10000);
    if (!ready) {
        console.error(`[ensure-local-server] ❌ Port ${port} không sẵn sàng sau 10s`);
        try {
            process.kill(-pid, 'SIGTERM');
        } catch {}
        throw new Error(`Local server failed to start on port ${port}`);
    }
    console.log(
        `[ensure-local-server] ✅ Server sẵn sàng (pid=${pid}). Stop: pkill -f "http.server ${port}"`
    );
    return { started: true, pid, port };
}

module.exports = { ensureLocalServer, isLocalUrl, probePort };
