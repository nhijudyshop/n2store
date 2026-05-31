// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Backup toàn bộ dữ liệu inventory-tracking qua API (read-only) ra 1 file JSON
 * đặt tên theo ngày-giờ, lưu vào backups/ (đã gitignore — chứa PII, KHÔNG commit).
 *
 * Dùng:
 *   node scripts/backup-inventory-tracking.js
 *   node scripts/backup-inventory-tracking.js --base http://localhost:8080   (nếu có proxy local)
 *
 * Output: backups/inventory-tracking-YYYYMMDD-HHMMSS.json
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE =
    'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/inventory-tracking';

// Các entity cần backup (endpoint + query lấy hết bản ghi).
const ENDPOINTS = [
    { key: 'suppliers', path: '/suppliers' },
    { key: 'orderBookings', path: '/order-bookings?limit=100000' },
    { key: 'shipments', path: '/shipments?limit=100000' },
    { key: 'prepayments', path: '/prepayments' },
    { key: 'otherExpenses', path: '/other-expenses' },
    { key: 'productImages', path: '/product-images' },
];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error(`Parse fail ${url}: ${e.message} | ${body.slice(0, 160)}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('timeout 60s ' + url)));
    });
}

function pad(n) {
    return String(n).padStart(2, '0');
}

async function main() {
    const baseArgIdx = process.argv.indexOf('--base');
    const base =
        baseArgIdx > -1 && process.argv[baseArgIdx + 1]
            ? process.argv[baseArgIdx + 1].replace(/\/$/, '') + '/api/v2/inventory-tracking'
            : API_BASE;

    const now = new Date();
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
        now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const out = {
        exportedAt: now.toISOString(),
        source: base,
        counts: {},
        data: {},
    };

    for (const ep of ENDPOINTS) {
        try {
            const res = await fetchJson(base + ep.path);
            const rows = Array.isArray(res?.data) ? res.data : res?.data || res;
            out.data[ep.key] = rows;
            out.counts[ep.key] = Array.isArray(rows) ? rows.length : '(object)';
            console.log(`  ✓ ${ep.key}: ${out.counts[ep.key]}`);
        } catch (e) {
            out.data[ep.key] = null;
            out.counts[ep.key] = `ERROR: ${e.message}`;
            console.error(`  ✗ ${ep.key}: ${e.message}`);
        }
    }

    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `inventory-tracking-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');

    const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`\n✅ Backup saved: backups/inventory-tracking-${stamp}.json (${sizeKb} KB)`);
    console.log(`   Counts: ${JSON.stringify(out.counts)}`);
}

main().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
