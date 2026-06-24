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
const TP_JSON = path.join(ROOT, 'web2/system/data/web2-third-parties.json');
const OUT_PAGEMOD_MD = path.join(ROOT, 'docs/web2/WEB2-PAGE-MODULES.md');
const OUT_TP_MD = path.join(ROOT, 'docs/web2/WEB2-THIRD-PARTIES.md');

function readJson(p, fallback) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

// Đường dẫn file → khoá "trang" (khớp codemap.pages): web2/<x>, hoặc top folder.
function pageKeyOf(filePath) {
    const p = String(filePath || '').split('/');
    if (p[0] === 'web2' && p[1] === 'shared') return 'web2/shared';
    if (p[0] === 'web2') return 'web2/' + p[1];
    return p[0];
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

    // ---- Shared modules + page↔module inversion ----
    // pageUses[pageKey] = Set(moduleName) ; module name lấy từ global đầu / basename.
    const pageUses = {};
    const shared = (codemap.sharedModules || []).map((m) => {
        const cat = catMap.get(m.file) || {};
        const name = (m.globals && m.globals[0]) || path.basename(m.file).replace(/\.js$/, '');
        // consumers → trang dùng module này (loại self web2/shared).
        const consumerPages = Array.from(
            new Set((m.consumers || []).map(pageKeyOf).filter((k) => k !== 'web2/shared'))
        ).sort();
        for (const pk of consumerPages) {
            (pageUses[pk] = pageUses[pk] || new Set()).add(name);
        }
        return {
            file: m.file,
            name,
            globals: m.globals || [],
            purpose: cat.oneLine || m.purpose || '',
            api: (m.api || []).slice(0, 14),
            lines: m.lines || 0,
            consumerCount: (m.consumers || []).length,
            consumerPages,
            category: cat.category || 'other',
        };
    });
    const sharedByName = new Map(shared.map((m) => [m.name, m]));

    // ---- Pages (kèm shared modules đang dùng) ----
    const pages = (codemap.pages || []).map((p) => {
        const files = p.files || [];
        const totalLines = files.reduce((s, f) => s + (f.lines || 0), 0);
        const globals = Array.from(new Set(files.flatMap((f) => f.globals || []))).slice(0, 20);
        const oversized = files
            .filter((f) => (f.lines || 0) > 800)
            .map((f) => ({ file: f.file, lines: f.lines }));
        const usesShared = Array.from(pageUses[p.page] || [])
            .map((nm) => {
                const sm = sharedByName.get(nm);
                return { name: nm, category: sm ? sm.category : 'other' };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        return {
            page: p.page,
            fileCount: files.length,
            totalLines,
            globals,
            oversized,
            usesShared,
            usesSharedCount: usesShared.length,
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

    // ---- Agent docs ----
    writePageModulesMd(manifest);
    writeThirdPartiesMd();
}

// =====================================================================
// DOC 1: WEB2-PAGE-MODULES.md — trang nào dùng module shared nào (2 chiều)
// =====================================================================
function writePageModulesMd(manifest) {
    const L = [];
    L.push('<!-- AUTO-GENERATED bởi scripts/gen-web2-system-data.js — KHÔNG sửa tay. -->');
    L.push('# WEB2 — Trang ↔ Module dùng chung (thống kê)');
    L.push('');
    L.push(
        `> Sinh tự động • ${manifest.generatedAt} • ${manifest.totals.sharedModules} shared · ${manifest.totals.pages} trang.`
    );
    L.push(
        '> Nguồn: `docs/web2/web2-codemap.json` (field `consumers`). Live dashboard: **web2/system → tab Module**.'
    );
    L.push(
        '> Cấu trúc/hàm chi tiết: [WEB2-CODEMAP.md](WEB2-CODEMAP.md). Bên thứ 3: [WEB2-THIRD-PARTIES.md](WEB2-THIRD-PARTIES.md).'
    );
    L.push('');

    // --- Chiều 1: TRANG → module ---
    L.push('## 1. Mỗi TRANG dùng những module shared nào');
    L.push('');
    L.push('| Trang | Số module | Module shared đang dùng |');
    L.push('| --- | ---: | --- |');
    const pagesSorted = manifest.pages
        .filter((p) => p.page !== 'web2/shared')
        .slice()
        .sort((a, b) => (b.usesSharedCount || 0) - (a.usesSharedCount || 0));
    for (const p of pagesSorted) {
        const mods = (p.usesShared || []).map((m) => `\`${m.name}\``).join(', ') || '—';
        L.push(`| ${p.page} | ${p.usesSharedCount || 0} | ${mods} |`);
    }
    L.push('');

    // --- Chiều 2: MODULE → trang (nhiều nơi dùng nhất trước) ---
    L.push('## 2. Mỗi MODULE shared được trang nào dùng (giảm dần theo độ phổ biến)');
    L.push('');
    L.push('| Module | Nhóm | # trang | Dùng ở các trang |');
    L.push('| --- | --- | ---: | --- |');
    const sharedSorted = manifest.shared
        .slice()
        .sort((a, b) => (b.consumerPages || []).length - (a.consumerPages || []).length);
    for (const m of sharedSorted) {
        const pgs = m.consumerPages || [];
        if (!pgs.length) continue;
        L.push(`| \`${m.name}\` | ${m.category} | ${pgs.length} | ${pgs.join(', ')} |`);
    }
    L.push('');
    L.push(
        '> Module không xuất hiện ở bảng 2 = chưa trang nào dùng (mồ côi / mới tạo / chỉ shared gọi shared).'
    );
    L.push('');

    fs.writeFileSync(OUT_PAGEMOD_MD, L.join('\n'));
    console.log(`✅ ${OUT_PAGEMOD_MD}`);
}

// =====================================================================
// DOC 2: WEB2-THIRD-PARTIES.md — bảng bên thứ 3 (từ registry audit 5 vòng)
// =====================================================================
function writeThirdPartiesMd() {
    const reg = readJson(TP_JSON, null);
    if (!reg || !Array.isArray(reg.thirdParties)) {
        console.log(`⚠️  bỏ qua WEB2-THIRD-PARTIES.md (thiếu ${TP_JSON})`);
        return;
    }
    const CAT_LABEL = {
        'ai-llm': 'AI / LLM',
        'tts-voice': 'Giọng nói / TTS',
        'media-gen': 'Tạo media AI',
        'stock-media': 'Kho ảnh/video',
        'messaging-social': 'Nhắn tin / MXH',
        'commerce-tpos': 'Bán hàng / TPOS',
        payment: 'Thanh toán',
        'browser-lib': 'Thư viện CDN',
        'ml-model-ondevice': 'Model ML on-device',
        'opensource-port': 'Open-source / GitHub',
        'infra-platform': 'Hạ tầng / Platform',
        font: 'Font',
        other: 'Khác',
    };
    const esc = (s) =>
        String(s == null ? '' : s)
            .replace(/\|/g, '\\|')
            .replace(/\n/g, ' ');
    const items = reg.thirdParties.slice();
    const byCat = {};
    for (const x of items) (byCat[x.category] = byCat[x.category] || []).push(x);

    const L = [];
    L.push(
        '<!-- AUTO-GENERATED bởi scripts/gen-web2-system-data.js từ web2/system/data/web2-third-parties.json — KHÔNG sửa tay. -->'
    );
    L.push('# WEB2 — Bên thứ 3 đang dùng (registry audit)');
    L.push('');
    L.push(`> Sinh tự động • ${reg.generatedAt || ''} • ${items.length} bên thứ 3.`);
    L.push(
        `> Nguồn curated: \`web2/system/data/web2-third-parties.json\` (${esc(reg.source || '')}).`
    );
    L.push('> Live dashboard: **web2/system → tab Bên thứ 3** (lọc category/layer/cost/search).');
    L.push(
        '> Module/cấu trúc: [WEB2-CODEMAP.md](WEB2-CODEMAP.md) · Trang↔module: [WEB2-PAGE-MODULES.md](WEB2-PAGE-MODULES.md).'
    );
    L.push('');
    L.push(
        '⚠️ **envKeys = chỉ TÊN biến môi trường** (giá trị thật ở `serect_dont_push.txt`, KHÔNG commit).'
    );
    L.push('');
    if (reg.summary) {
        const s = reg.summary;
        L.push(
            `**Tổng:** ${s.total} · Web 2.0: ${s.web2Count} · Web 1.0: ${s.web1Count} · Free: ${s.free} · Trả phí/freemium: ${s.paidOrFreemium}`
        );
        L.push('');
    }

    const catOrder = Object.keys(CAT_LABEL).filter((c) => byCat[c]);
    for (const c of catOrder) {
        L.push(`## ${CAT_LABEL[c]} (${byCat[c].length})`);
        L.push('');
        L.push(
            '| Tên | Provider | Loại | Chi phí | Layer | Trạng thái | License | Dùng ở | ENV keys | GitHub |'
        );
        L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
        for (const x of byCat[c].sort((a, b) => a.name.localeCompare(b.name))) {
            const used =
                (x.usedIn || [])
                    .slice(0, 4)
                    .map((u) => `\`${esc(u)}\``)
                    .join('<br>') || '—';
            const env =
                (x.envKeys || [])
                    .slice(0, 6)
                    .map((k) => `\`${esc(k)}\``)
                    .join(' ') || '—';
            const gh = x.githubUrl ? `[repo](${x.githubUrl})` : '—';
            const cost = x.cost + (x.costDetail ? ` — ${esc(x.costDetail).slice(0, 60)}` : '');
            L.push(
                `| **${esc(x.name)}** | ${esc(x.provider)} | ${esc(x.type)} | ${esc(cost)} | ${esc(x.layer)} | ${esc(x.status)} | ${esc(x.license || '—')} | ${used} | ${env} | ${gh} |`
            );
        }
        L.push('');
    }
    fs.writeFileSync(OUT_TP_MD, L.join('\n'));
    console.log(`✅ ${OUT_TP_MD}`);
}

main();
