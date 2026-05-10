// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 ↔ TPOS sync worker.
 *
 * Pull data từ TPOS production, upsert vào Neon `web2_records` (idempotent skip
 * theo `code`). Goal: page web2/* tự động cập nhật theo TPOS, không cần seed thủ công.
 *
 * Toggle: env var `WEB2_SYNC_ENABLED=true`. Mặc định OFF để tránh ăn quota Neon
 * không cần thiết khi service vừa restart.
 *
 * Schedule (chia tier theo tốc độ thay đổi):
 *   - Reference data nhỏ (Tag, ProductCategory, ProductUOM, AccountTax,
 *     StockWarehouse, CRMTeam, ResCurrency): mỗi 6 giờ — ít thay đổi, đủ
 *   - Master data (Partner, ProductTemplate, Product variant): mỗi 1 giờ
 *   - Hot data (FastSaleOrder, FastPurchaseOrder, SaleOnline_Order, LiveCampaign):
 *     mỗi 15 phút — đơn mới phải nhanh
 *
 * Idempotent — bulk-create endpoint dùng ON CONFLICT DO NOTHING, chạy lại
 * không double-insert. Lần chạy đầu sau cleanup ~3-5 phút (full re-seed),
 * các lần sau chỉ thêm rows mới (skipped += duplicates).
 *
 * Triển khai: child_process.fork seeder script đã có (KHÔNG duplicate logic).
 * Log output capture vào console để Render logs xem được.
 */

const { spawn } = require('child_process');
const path = require('path');
const cron = require('node-cron');

const SEEDER_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'web2-seed-from-tpos.js');
const BASE_URL = process.env.WEB2_SYNC_BASE_URL || 'https://n2store-fallback.onrender.com';

// Group entities by sync frequency
const TIERS = {
    refData: [
        'tag',
        'productcategory',
        'productuom',
        'accounttax',
        'stockwarehouse',
        'crmteam',
        'rescurrency',
        'productattribute',
        'productattributevalue',
        'deliverycarrier',
        'accountjournal',
    ],
    master: ['partner-customer', 'partner-supplier', 'producttemplate', 'product'],
    hot: [
        'fastsaleorder-invoice',
        'fastpurchaseorder-invoice',
        'saleonline-facebook',
        'livecampaign',
    ],
};

let runningTier = null;

/**
 * Spawn seeder for a comma-separated slug list. Returns Promise<{exitCode, durationMs}>.
 * Skip if another tier is already running (avoid concurrent quota burn on Neon).
 */
function runSync(label, slugs) {
    if (runningTier) {
        console.log(`[WEB2-SYNC] Skip ${label} — ${runningTier} still running`);
        return Promise.resolve({ skipped: true });
    }
    runningTier = label;
    const start = Date.now();
    return new Promise((resolve) => {
        const args = ['--only', slugs.join(','), '--base', BASE_URL];
        console.log(`[WEB2-SYNC] ▶ ${label}: ${slugs.length} entities`);
        const child = spawn('node', [SEEDER_SCRIPT, ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let lastSummary = '';
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            // Only forward summary lines + errors to keep logs readable
            for (const line of text.split('\n')) {
                if (
                    /✅|❌|=== |SUMMARY|inserted=\d|skipped=\d/.test(line) &&
                    !/bulk chunk/.test(line)
                ) {
                    lastSummary += line + '\n';
                }
            }
        });
        child.stderr.on('data', (chunk) => {
            console.error(`[WEB2-SYNC] ${label} stderr:`, chunk.toString().slice(0, 200));
        });
        child.on('exit', (code) => {
            const ms = Date.now() - start;
            runningTier = null;
            console.log(`[WEB2-SYNC] ✓ ${label} done in ${(ms / 1000).toFixed(1)}s (exit ${code})`);
            if (lastSummary) console.log(`[WEB2-SYNC] ${label} summary:\n${lastSummary.trim()}`);
            resolve({ exitCode: code, durationMs: ms });
        });
        child.on('error', (e) => {
            runningTier = null;
            console.error(`[WEB2-SYNC] ${label} spawn error:`, e.message);
            resolve({ exitCode: -1, error: e.message });
        });
    });
}

function init() {
    if (process.env.WEB2_SYNC_ENABLED !== 'true') {
        console.log('[WEB2-SYNC] Disabled (set WEB2_SYNC_ENABLED=true to enable)');
        return;
    }
    console.log('[WEB2-SYNC] ✅ Enabled. Schedule: ref=6h, master=1h, hot=15min');

    // Hot tier — every 15 min
    cron.schedule('*/15 * * * *', () => {
        runSync('hot', TIERS.hot).catch(() => {});
    });

    // Master — every hour at :05 to avoid colliding with hot at :00
    cron.schedule('5 * * * *', () => {
        runSync('master', TIERS.master).catch(() => {});
    });

    // Reference — every 6h at :30
    cron.schedule('30 */6 * * *', () => {
        runSync('refData', TIERS.refData).catch(() => {});
    });

    // Initial sync 60s after boot — give DB pool time to warm up
    setTimeout(() => {
        runSync('initial-hot', TIERS.hot).catch(() => {});
    }, 60_000);
}

module.exports = { init, runSync, TIERS };
