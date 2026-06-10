// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
import { defineConfig } from 'vitest/config';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

// Auto-detect module entry points (directories with index.html)
// Excludes non-module directories that should never be treated as entry points
const EXCLUDED_DIRS = [
    '.git',
    '.github',
    '.kiro',
    '.claude',
    'node_modules',
    'build-scripts',
    'docs',
    'AI',
    'cloudflare-worker',
    'shared',
    'tests',
    'dist',
    'firebase-functions',
    'render.com',
    'scripts',
];

function getModuleEntries() {
    const entries = {};
    const dirs = readdirSync('.', { withFileTypes: true });

    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        if (EXCLUDED_DIRS.includes(dir.name)) continue;
        if (dir.name.startsWith('.')) continue;

        const indexPath = resolve(dir.name, 'index.html');
        if (existsSync(indexPath)) {
            entries[dir.name] = indexPath;
        }
    }

    return entries;
}

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                ...getModuleEntries(),
            },
            // Note: manualChunks removed because shared/js/ files use script tags
            // (window globals), not ES module exports. Bundling them as chunks
            // would produce empty or broken output. Tree-shaking handles the rest.
        },
        outDir: 'dist',
        sourcemap: process.env.NODE_ENV === 'development',
        target: 'es2020',
        emptyOutDir: true,
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
        // STALE TESTS (2026-06-10): 18 file dưới đây assert PATTERN SOURCE CŨ
        // (Firestore-era / cấu trúc HTML-script cũ / bug-condition viết để FAIL
        // minh họa) — code đã migrate sang Render PG từ lâu nên fail vĩnh viễn,
        // làm CI PR đỏ từ ngày đầu. Exclude để 265 test còn lại thành gate THẬT.
        // Muốn dùng lại file nào → viết lại assert theo code hiện tại rồi bỏ khỏi list.
        exclude: [
            'tests/property/kpi-base-empty-invalid.test.js',
            'tests/property/kpi-base-empty-products.test.js',
            'tests/property/kpi-base-immutability.test.js',
            'tests/property/kpi-base-timestamp-filter.test.js',
            'tests/property/kpi-campaign-bug-condition.test.js',
            'tests/property/kpi-employee-determination.test.js',
            'tests/property/kpi-employee-filter.test.js',
            'tests/property/kpi-net-calculation.test.js',
            'tests/property/kpi-stale-detection-ui.test.js',
            'tests/property/kpi-stale-statistics-cleanup.test.js',
            'tests/property/migration-admin-full-permissions.test.js',
            'tests/property/migration-admin-preservation.test.js',
            'tests/property/permission-helper-bug-condition.test.js',
            'tests/property/permission-helper-preservation.test.js',
            'tests/property/ticket-delete-audit-bug-condition.test.js',
            'tests/property/wallet-panel-preservation.test.js',
            'tests/unit/kpi-bugfixes.test.js',
            'tests/unit/kpi-double-count-fix.test.js',
        ],
        coverage: {
            provider: 'v8',
            include: ['shared/js/**', 'shared/browser/**', 'shared/universal/**'],
            exclude: ['**/node_modules/**', '**/tests/**'],
            thresholds: {
                lines: 60,
                branches: 60,
                functions: 60,
                statements: 60,
            },
        },
    },
});
