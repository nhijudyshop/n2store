#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 tool — sinh bản đồ code Web 2.0 (codemap) cho Claude/dev đọc hiểu nhanh.
// =====================================================================
// gen-web2-codemap.js — QUÉT toàn bộ JS Web 2.0 → sinh "bản đồ code thông minh".
//
// Mục tiêu: 1 file DUY NHẤT (docs/web2/WEB2-CODEMAP.md + .json) để Claude Code
// đọc vào là hiểu NGAY:
//   • Web 2.0 có những trang/feature gì, mỗi trang làm gì.
//   • Mỗi file có HÀM gì, exposes global gì → cần thì tìm ở đâu.
//   • Module DÙNG CHUNG (web2/shared/) nào cung cấp capability gì + ai đang dùng
//     → trang mới CẦN gì thì TÁI DÙNG shared, KHÔNG viết lại.
//   • Hàm TRÙNG TÊN ở nhiều file (ứng viên đưa vào shared) + file quá to (>800 dòng).
//
// Auto-generated — chạy lại sau khi đổi cấu trúc:  node scripts/gen-web2-codemap.js
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Thư mục thuộc hệ Web 2.0 (frontend). Backend route xem docs/render/.
const SCAN_DIRS = ['web2', 'native-orders', 'so-order', 'live-chat'];
const SHARED_DIR = path.join('web2', 'shared');
const MAX_LINES = 800; // CLAUDE.md: 800 dòng là trần.

// Bỏ qua: node_modules, thư viện vendored (min + receiptline), file map.
const SKIP_FILE = (rel) =>
    /node_modules\//.test(rel) ||
    /\.min\.js$/.test(rel) ||
    /\/receiptline\.js$/.test(rel) ||
    /\.map$/.test(rel);

// Từ khoá KHÔNG phải tên hàm (để lọc nhiễu khi regex method-shorthand).
const KEYWORDS = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'return',
    'else',
    'do',
    'try',
    'finally',
    'with',
    'case',
    'typeof',
    'await',
    'new',
    'in',
    'of',
    'class',
    'const',
    'let',
    'var',
    'throw',
    'delete',
    'void',
    'yield',
    'super',
    'this',
    'default',
    'break',
    'continue',
    'instanceof',
    'extends',
    'import',
    'export',
    'async',
    'static',
    'get',
    'set',
    'constructor',
]);

// ──────────────────────────────────────────────────────────────────────
// Walk
// ──────────────────────────────────────────────────────────────────────
function walk(dir, out) {
    let entries;
    try {
        entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.git') continue;
            walk(rel, out);
        } else if (e.isFile() && e.name.endsWith('.js') && !SKIP_FILE(rel)) {
            out.push(rel);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// Per-file extraction
// ──────────────────────────────────────────────────────────────────────
function headerBlock(lines) {
    // Lấy khối comment liền nhau ở đầu file (// ... hoặc /* */ ).
    const block = [];
    for (const ln of lines) {
        const t = ln.trim();
        if (t.startsWith('//')) {
            block.push(t.replace(/^\/\/\s?/, ''));
        } else if (t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/')) {
            block.push(
                t
                    .replace(/^\/\*+/, '')
                    .replace(/\*+\/$/, '')
                    .replace(/^\*\s?/, '')
                    .trim()
            );
        } else if (t === '') {
            if (block.length) break; // hết khối header
        } else {
            break; // gặp code
        }
        if (block.length > 60) break;
    }
    return block;
}

function purposeFrom(block) {
    // #Note có hậu tố "| ... mô tả thật" → lấy phần sau "|".
    const note = block.find((l) => l.startsWith('#Note'));
    if (note && note.includes('|')) {
        const after = note.split('|').slice(1).join('|').trim();
        // Bỏ phần boilerplate "Read these files...".
        const clean = after.replace(/Read these files.*$/i, '').trim();
        if (clean && !/Đọc CLAUDE/.test(clean)) return clean.replace(/\s+/g, ' ');
    }
    // Dòng comment đầu tiên có nghĩa (không phải boilerplate / banner).
    for (const l of block) {
        if (!l || l.startsWith('#Note') || /^=+$/.test(l) || /Đọc CLAUDE/.test(l)) continue;
        if (/^[A-Za-z0-9_]+\s+—/.test(l) || l.length > 12)
            return l.replace(/\s+/g, ' ').slice(0, 240);
    }
    return '';
}

function apiLinesFrom(block) {
    // Nhiều shared module có khối "API:" liệt kê method. Lấy các dòng signature.
    const out = [];
    let inApi = false;
    for (const l of block) {
        if (/^API\s*:/.test(l)) {
            inApi = true;
            continue;
        }
        if (inApi) {
            if (/^opts\b/i.test(l) || /^=+$/.test(l) || l === '') {
                if (out.length) break;
                else continue;
            }
            const m = l.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\([^)]*\)[^→]*→?.*)$/);
            if (m) out.push(l.replace(/\s+/g, ' '));
            else if (out.length && !/^\s/.test(l)) break;
        }
    }
    return out.slice(0, 24);
}

function extractGlobals(src) {
    const set = new Set();
    let m;
    const re1 = /\b(?:window|global)\.([A-Z][A-Za-z0-9_]+)\s*=(?!=)/g;
    while ((m = re1.exec(src))) set.add(m[1]);
    const re2 = /\b(?:window|global)\.([A-Z][A-Za-z0-9_]+)\s*=\s*(?:window|global)\.\1\s*\|\|/g;
    while ((m = re2.exec(src))) set.add(m[1]);
    return [...set];
}

function extractFunctions(src) {
    const set = new Set();
    let m;
    // function name( / async function name(
    const reFn = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = reFn.exec(src))) if (!KEYWORDS.has(m[1])) set.add(m[1]);
    // const name = (..)=> / function expr
    const reConst =
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = reConst.exec(src))) if (!KEYWORDS.has(m[1])) set.add(m[1]);
    // name: function / name: async (..)=>
    const reProp = /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>)/g;
    while ((m = reProp.exec(src))) if (!KEYWORDS.has(m[1])) set.add(m[1]);
    // NS.name = function / NS.name = (..)=>
    const reAssign =
        /\b[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g;
    while ((m = reAssign.exec(src))) if (!KEYWORDS.has(m[1])) set.add(m[1]);
    // object method shorthand:  name(args) {   (lọc keyword + chỉ indent ≥2)
    const reMethod = /^[ \t]{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
    while ((m = reMethod.exec(src))) if (!KEYWORDS.has(m[1])) set.add(m[1]);
    return [...set].sort();
}

function analyze(rel) {
    const abs = path.join(ROOT, rel);
    const src = fs.readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    const block = headerBlock(lines);
    return {
        file: rel.split(path.sep).join('/'),
        lines: lines.length,
        isShared: rel.split(path.sep).join('/').startsWith(SHARED_DIR.split(path.sep).join('/')),
        isServer: /\/server\//.test(rel) || /server\.js$/.test(rel),
        purpose: purposeFrom(block),
        api: apiLinesFrom(block),
        globals: extractGlobals(src),
        functions: extractFunctions(src),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Build model
// ──────────────────────────────────────────────────────────────────────
const allFiles = [];
for (const d of SCAN_DIRS) walk(d, allFiles);
allFiles.sort();
const files = allFiles.map(analyze);

// Tập global của shared (để dò "ai dùng module nào").
const sharedGlobals = new Map(); // global -> file
for (const f of files) {
    if (!f.isShared) continue;
    for (const g of f.globals) sharedGlobals.set(g, f.file);
}

// Reverse-index: shared global -> file consumers.
const consumers = new Map(); // global -> Set(file)
for (const g of sharedGlobals.keys()) consumers.set(g, new Set());
for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f.file), 'utf8');
    for (const g of sharedGlobals.keys()) {
        if (f.file === sharedGlobals.get(g)) continue;
        if (new RegExp('\\b' + g + '\\b').test(src)) consumers.get(g).add(f.file);
    }
    // Lưu "uses" (shared module mà file tham chiếu) lên chính file.
    f.uses = [...sharedGlobals.keys()].filter(
        (g) => f.file !== sharedGlobals.get(g) && new RegExp('\\b' + g + '\\b').test(src)
    );
}

// Duplicate-function detector (ứng viên đưa vào shared).
// NOISE: tên KHÔNG phải ứng viên rút-shared — lifecycle riêng từng component
// (init/close/open…), CRUD per-entity (list/get/set…), callback-option keys
// (snapshot/apply/rollback…), DOM handler (on*). Lọc để §4 chỉ còn tín hiệu thật.
const NOISE = new Set([
    'init',
    'notify',
    'close',
    'open',
    'load',
    'refresh',
    'destroy',
    'cleanup',
    'mount',
    'unmount',
    'start',
    'stop',
    'render',
    'show',
    'hide',
    'toggle',
    'update',
    'reset',
    'save',
    'remove',
    'snapshot',
    'apply',
    'run',
    'rollback',
    'list',
    'add',
    'clear',
    'build',
    'setup',
    'bind',
    'unbind',
    'handle',
    'tick',
    'loop',
    'poll',
    'sync',
    'emit',
    'next',
    'prev',
    'subscribe',
    'unsubscribe',
    'enable',
    'disable',
    'attach',
    'detach',
    'register',
    'create',
    'remove',
]);
const fnIndex = new Map(); // fnName -> Set(file)
for (const f of files) {
    if (f.isServer) continue;
    for (const fn of f.functions) {
        if (fn.length < 4) continue; // bỏ tên quá ngắn (nhiễu)
        if (NOISE.has(fn)) continue;
        if (/^on[a-zA-Z]/.test(fn)) continue; // DOM handler / callback option
        if (!fnIndex.has(fn)) fnIndex.set(fn, new Set());
        fnIndex.get(fn).add(f.file);
    }
}
const dupes = [...fnIndex.entries()]
    .map(([fn, set]) => ({ fn, files: [...set].sort(), count: set.size }))
    .filter((d) => d.count >= 3)
    .sort((a, b) => b.count - a.count || a.fn.localeCompare(b.fn));

// Group pages by folder (top-2 path segments cho web2/*, top-1 cho khác).
function pageKey(file) {
    const parts = file.split('/');
    if (parts[0] === 'web2') return parts[1] === 'shared' ? 'web2/shared' : `web2/${parts[1]}`;
    return parts[0];
}
const pages = new Map();
for (const f of files) {
    const k = pageKey(f.file);
    if (!pages.has(k)) pages.set(k, []);
    pages.get(k).push(f);
}

const oversized = files.filter((f) => f.lines > MAX_LINES).sort((a, b) => b.lines - a.lines);

// ──────────────────────────────────────────────────────────────────────
// Emit JSON
// ──────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
const sharedFiles = files.filter((f) => f.isShared).sort((a, b) => a.file.localeCompare(b.file));

const json = {
    generatedAt: stamp,
    totals: {
        files: files.length,
        sharedModules: sharedFiles.length,
        functions: [...fnIndex.keys()].length,
        oversized: oversized.length,
    },
    sharedModules: sharedFiles.map((f) => ({
        file: f.file,
        globals: f.globals,
        purpose: f.purpose,
        api: f.api,
        consumers: f.globals
            .flatMap((g) => [...(consumers.get(g) || [])])
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort(),
        lines: f.lines,
    })),
    pages: [...pages.entries()].map(([k, fs2]) => ({
        page: k,
        files: fs2.map((f) => ({
            file: f.file,
            lines: f.lines,
            purpose: f.purpose,
            globals: f.globals,
            uses: f.uses,
            functions: f.functions,
        })),
    })),
    duplicateFunctions: dupes,
    oversized: oversized.map((f) => ({ file: f.file, lines: f.lines })),
};
fs.writeFileSync(
    path.join(ROOT, 'docs/web2/web2-codemap.json'),
    JSON.stringify(json, null, 2) + '\n'
);

// ──────────────────────────────────────────────────────────────────────
// Emit Markdown
// ──────────────────────────────────────────────────────────────────────
const md = [];
const P = (s) => md.push(s);

P(
    '<!-- AUTO-GENERATED bởi scripts/gen-web2-codemap.js — KHÔNG SỬA TAY. Regenerate: node scripts/gen-web2-codemap.js -->'
);
P('# WEB2-CODEMAP — Bản đồ code Web 2.0');
P('');
P(
    `> **Auto-generated** • ${stamp} • ${json.totals.files} files, ${json.totals.sharedModules} shared modules, ${json.totals.functions} hàm, ${json.totals.oversized} file > ${MAX_LINES} dòng.`
);
P(
    '> Sinh lại: `node scripts/gen-web2-codemap.js` (chạy sau khi đổi cấu trúc/ tách module / thêm trang).'
);
P('');
P('## 0. Cách dùng (Claude / dev đọc TRƯỚC khi code)');
P('');
P(
    '1. **Cần 1 capability** (chat KH, sinh QR, popup/confirm, quét barcode, đếm SP, ví, SSE realtime, NCC, kho KH…) → tra **§1 Shared Modules TRƯỚC**. Có sẵn → tái dùng, **KHÔNG viết lại**.'
);
P(
    '2. **Cần biết 1 trang làm gì / có hàm gì / tìm ở đâu** → **§3 Pages** (mỗi file: mục đích + globals + shared đang dùng + danh sách hàm).'
);
P(
    '3. **Viết hàm mới mà thấy tên đã có ≥2 nơi** → **§4 Hàm trùng** → cân nhắc rút vào `web2/shared/` (1 nguồn dùng chung).'
);
P('4. **File > ' + MAX_LINES + ' dòng** → **§5** (nợ kỹ thuật, cần tách module).');
P('');
P(
    '> Quy tắc gốc (CLAUDE.md): Web 2.0 tách **nhiều module nhỏ** (200-400 dòng, max ' +
        MAX_LINES +
        '); cái gì ≥2 nơi cần → **shared 1 nguồn**, trang chỉ điều phối.'
);
P('');

// §1 Shared registry
P('## 1. Shared Modules Registry — `web2/shared/` (NGUỒN DÙNG CHUNG)');
P('');
P('| Module (global) | File | Mục đích | Consumers |');
P('| --- | --- | --- | --- |');
for (const f of sharedFiles) {
    if (!f.globals.length && !f.purpose) continue;
    const cons = f.globals
        .flatMap((g) => [...(consumers.get(g) || [])])
        .filter((v, i, a) => a.indexOf(v) === i);
    const gl = f.globals.length ? f.globals.map((g) => '`' + g + '`').join(', ') : '—';
    P(
        `| ${gl} | [${f.file.split('/').pop()}](../../${f.file}) | ${(f.purpose || '').replace(/\|/g, '\\|').slice(0, 120)} | ${cons.length} |`
    );
}
P('');
P('<details><summary><b>Chi tiết API từng shared module</b> (bấm mở)</summary>');
P('');
for (const f of sharedFiles) {
    if (!f.globals.length && !f.api.length) continue;
    P(
        `#### ${f.globals.map((g) => '`' + g + '`').join(', ') || f.file.split('/').pop()} — [${f.file}](../../${f.file}) · ${f.lines} dòng`
    );
    if (f.purpose) P(`${f.purpose}`);
    if (f.api.length) {
        P('');
        P('```');
        for (const a of f.api) P(a);
        P('```');
    }
    const cons = f.globals
        .flatMap((g) => [...(consumers.get(g) || [])])
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort();
    if (cons.length) P(`**Dùng bởi:** ${cons.map((c) => '`' + c + '`').join(', ')}`);
    P('');
}
P('</details>');
P('');

// §3 Pages
P('## 3. Pages / Surfaces');
P('');
const pageOrder = [...pages.keys()].sort((a, b) => {
    if (a === 'web2/shared') return 1;
    if (b === 'web2/shared') return -1;
    return a.localeCompare(b);
});
for (const k of pageOrder) {
    const fs2 = pages.get(k).sort((a, b) => a.file.localeCompare(b.file));
    const pagePurpose = (fs2.find((f) => f.purpose) || {}).purpose || '';
    P(`### ${k}${pagePurpose ? ' — ' + pagePurpose.slice(0, 140) : ''}`);
    for (const f of fs2) {
        const flag = f.lines > MAX_LINES ? ` ⚠️${f.lines}` : ` ·${f.lines}`;
        P(
            `- **[${f.file.split('/').pop()}](../../${f.file})**${flag}${f.purpose ? ' — ' + f.purpose.slice(0, 160) : ''}`
        );
        if (f.globals.length) P(`  - exposes: ${f.globals.map((g) => '`' + g + '`').join(', ')}`);
        if (f.uses && f.uses.length)
            P(`  - uses shared: ${f.uses.map((g) => '`' + g + '`').join(', ')}`);
        if (f.functions.length) {
            const fns = f.functions.slice(0, 60).join(', ');
            P(`  - funcs (${f.functions.length}): ${fns}${f.functions.length > 60 ? ' …' : ''}`);
        }
    }
    P('');
}

// §4 Duplicate
P('## 4. Hàm trùng tên (≥3 file) — ứng viên rút vào `web2/shared/`');
P('');
// Gợi ý shared target cho các util phổ biến (đã có hoặc nên tạo).
const SUGGEST = (fn) => {
    if (/^escapeHtml$|^_esc$|^esc$|^escape/.test(fn)) return '→ `Web2Escape` (web2-escape.js)';
    if (/^(fmt|format).*(Vnd|Money|Price|Currency)/i.test(fn) || /^fmtVnd$|^fmtMoney$/.test(fn))
        return '→ shared format tiền (nên gom `Web2Format`)';
    if (/^(fmt|format).*(Date|Time)/i.test(fn) || /^fmtDate$|^fmtTime$/.test(fn))
        return '→ shared format ngày/giờ GMT+7 (nên gom `Web2Format`)';
    if (/auth.*header|^_?w2auth|^authHeaders$/i.test(fn)) return '→ `Web2Auth.authHeaders`';
    if (/phone/i.test(fn)) return '→ `Web2CustomerStore` (normPhone)';
    if (/^render(Pagination|Rows|List)$|^applyFilters$|^closeModal$/.test(fn))
        return '→ `Web2Page` (page-builder) nếu là list-page';
    if (/^ensureStyles$/.test(fn)) return '→ CSS shared / theme thay vì inject lặp';
    return '';
};
if (!dupes.length) {
    P('_Không phát hiện hàm trùng đáng kể._');
} else {
    P('| Hàm | Số file | Gợi ý | Files |');
    P('| --- | --- | --- | --- |');
    for (const d of dupes.slice(0, 60)) {
        P(
            `| \`${d.fn}\` | ${d.count} | ${SUGGEST(d.fn)} | ${d.files.map((x) => x.split('/').pop()).join(', ')} |`
        );
    }
    if (dupes.length > 60)
        P(`\n_…và ${dupes.length - 60} hàm trùng khác (xem web2-codemap.json)._`);
}
P('');

// §5 Oversized
P(`## 5. File quá lớn (> ${MAX_LINES} dòng) — cần tách module`);
P('');
P('| File | Dòng |');
P('| --- | --- |');
for (const f of oversized) P(`| [${f.file}](../../${f.file}) | ${f.lines} |`);
P('');

fs.writeFileSync(path.join(ROOT, 'docs/web2/WEB2-CODEMAP.md'), md.join('\n'));

console.log(
    `[codemap] ${json.totals.files} files · ${json.totals.sharedModules} shared · ${json.totals.functions} funcs · ${dupes.length} dup-names · ${oversized.length} oversized`
);
console.log('[codemap] wrote docs/web2/WEB2-CODEMAP.md + docs/web2/web2-codemap.json');
