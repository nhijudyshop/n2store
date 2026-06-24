#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 tool — sinh manifest module cho trang "Cấu hình & Hệ thống" tab Module.
// =====================================================================
// gen-web2-system-data.js — sinh web2/system/data/web2-modules.json
//
// Nguồn dữ liệu:
//   • Frontend: docs/web2/web2-codemap.json (sharedModules + pages) — chạy
//     `node scripts/gen-web2-codemap.js` trước cho mới nhất.
//   • Backend : quét render.com/routes + render.com/services cho file Web 2.0
//     (tên chứa "web2" HOẶC có marker "WEB2.0" trong ~8 dòng đầu).
//   • Category: gộp tuỳ chọn từ web2/system/data/_module-categories.json
//     (do audit workflow sinh ra; thiếu thì category='other').
//
// Chạy lại sau khi đổi cấu trúc / thêm trang / thêm route:
//   node scripts/gen-web2-system-data.js
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CODEMAP = path.join(ROOT, 'docs/web2/web2-codemap.json');
const CAT_FILE = path.join(ROOT, 'web2/system/data/_module-categories.json');
const OUT = path.join(ROOT, 'web2/system/data/web2-modules.json');

function readJson(p, fallback) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function countLines(abs) {
    try {
        return fs.readFileSync(abs, 'utf8').split('\n').length;
    } catch (_) {
        return 0;
    }
}

// Lấy 1 câu mô tả ngắn từ đầu file backend (bỏ dòng #Note + banner ===).
function backendPurpose(abs) {
    let head = '';
    try {
        head = fs.readFileSync(abs, 'utf8').split('\n').slice(0, 18).join('\n');
    } catch (_) {
        return '';
    }
    const lines = head.split('\n');
    for (const raw of lines) {
        const l = raw.trim();
        if (!l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*')) continue;
        const txt = l.replace(/^\/\*+|^\/\/+|^\*+|\*+\/$/g, '').trim();
        if (!txt) continue;
        if (/^#Note/i.test(txt)) continue;
        if (/^=+$/.test(txt)) continue;
        if (/đọc claude\.md/i.test(txt)) continue;
        // Bỏ banner kiểu "==== TITLE ===="
        const clean = txt.replace(/^=+\s*|\s*=+$/g, '').trim();
        if (clean.length >= 4) return clean.slice(0, 160);
    }
    return '';
}

function isWeb2Backend(abs, fname) {
    if (/web2/i.test(fname)) return true;
    try {
        const head = fs.readFileSync(abs, 'utf8').slice(0, 600);
        if (/WEB2\.0/i.test(head)) return true;
    } catch (_) {}
    return false;
}

// v2 routes piggy-back Web 2.0 (theo CLAUDE.md) — không có prefix web2- nhưng là Web 2.0.
const V2_WEB2_PIGGYBACK = new Set([
    'notifications.js',
    'audit-log.js',
    'supplier-aging.js',
    'dashboard-kpi.js',
    'smart-match.js',
    'inventory-forecast.js',
    'supplier-360.js',
    'cart.js',
]);

function scanBackendDir(relDir, kind) {
    const absDir = path.join(ROOT, relDir);
    let out = [];
    let entries = [];
    try {
        entries = fs.readdirSync(absDir);
    } catch (_) {
        return out;
    }
    for (const fname of entries) {
        if (!fname.endsWith('.js')) continue;
        const abs = path.join(absDir, fname);
        if (!fs.statSync(abs).isFile()) continue;
        const isPiggy = relDir.endsWith('/v2') && V2_WEB2_PIGGYBACK.has(fname);
        if (!isWeb2Backend(abs, fname) && !isPiggy) continue;
        out.push({
            file: `${relDir}/${fname}`,
            kind,
            purpose: backendPurpose(abs),
            lines: countLines(abs),
            piggyback: isPiggy || undefined,
        });
    }
    return out.sort((a, b) => a.file.localeCompare(b.file));
}

function main() {
    const codemap = readJson(CODEMAP, null);
    if (!codemap) {
        console.error(
            '❌ Không đọc được codemap:',
            CODEMAP,
            '\n   Chạy: node scripts/gen-web2-codemap.js trước.'
        );
        process.exit(1);
    }
    const catMap = new Map();
    const cats = readJson(CAT_FILE, { categories: [] });
    for (const c of cats.categories || []) {
        if (c && c.file)
            catMap.set(c.file, { category: c.category || 'other', oneLine: c.oneLine || '' });
    }

    // ---- Shared modules ----
    const shared = (codemap.sharedModules || []).map((m) => {
        const cat = catMap.get(m.file) || {};
        const name = (m.globals && m.globals[0]) || path.basename(m.file).replace(/\.js$/, '');
        return {
            file: m.file,
            name,
            globals: m.globals || [],
            purpose: cat.oneLine || m.purpose || '',
            api: (m.api || []).slice(0, 14),
            lines: m.lines || 0,
            consumerCount: (m.consumers || []).length,
            category: cat.category || 'other',
        };
    });

    // ---- Pages ----
    const pages = (codemap.pages || []).map((p) => {
        const files = p.files || [];
        const totalLines = files.reduce((s, f) => s + (f.lines || 0), 0);
        const globals = Array.from(new Set(files.flatMap((f) => f.globals || []))).slice(0, 20);
        const oversized = files
            .filter((f) => (f.lines || 0) > 800)
            .map((f) => ({ file: f.file, lines: f.lines }));
        return {
            page: p.page,
            fileCount: files.length,
            totalLines,
            globals,
            oversized,
        };
    });

    // ---- Backend ----
    const backendRoutes = [
        ...scanBackendDir('render.com/routes', 'route'),
        ...scanBackendDir('render.com/routes/v2', 'route-v2'),
    ];
    const backendServices = scanBackendDir('render.com/services', 'service');

    // ---- Category roll-up (shared) ----
    const byCategory = {};
    for (const m of shared) byCategory[m.category] = (byCategory[m.category] || 0) + 1;

    const manifest = {
        generatedAt: new Date().toISOString(),
        source: 'docs/web2/web2-codemap.json + render.com scan',
        totals: {
            sharedModules: shared.length,
            pages: pages.length,
            backendRoutes: backendRoutes.length,
            backendServices: backendServices.length,
            frontendFiles: codemap.totals && codemap.totals.files,
            functions: codemap.totals && codemap.totals.functions,
        },
        sharedByCategory: byCategory,
        shared,
        pages,
        backend: {
            routes: backendRoutes,
            services: backendServices,
        },
    };

    fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
    const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
    console.log(`✅ ${OUT} (${kb} KB)`);
    console.log(
        `   shared=${shared.length} pages=${pages.length} routes=${backendRoutes.length} services=${backendServices.length}`
    );
    const catKeys = Object.keys(byCategory).length;
    console.log(
        `   shared categories: ${catKeys}${catKeys ? '' : ' (chưa có _module-categories.json → tất cả "other")'}`
    );
}

main();
