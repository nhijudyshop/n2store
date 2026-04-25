#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Sao chép API JSON từ run v3 mới nhất → resident/data/<key>.json
 * Đặt tên ngắn để clone load dễ.
 */
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', 'downloads', 'resident-crawl');
const dirs = fs
    .readdirSync(baseDir)
    .filter((d) => d.endsWith('-v3'))
    .map((d) => path.join(baseDir, d))
    .sort();
if (!dirs.length) {
    console.error('No v3 dir found');
    process.exit(1);
}
const SRC = dirs[dirs.length - 1];
const DEST = path.resolve(__dirname, '..', 'resident', 'data');
fs.mkdirSync(DEST, { recursive: true });

const m = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const apis = m.api.filter((a) => a.host === 'api.resident.vn');

// Pick first response for each (method, pathname)
const seen = new Map();
for (const a of apis) {
    const u = new URL(a.url);
    const key = `${a.method.toLowerCase()}-${u.pathname.replace(/^\//, '').replace(/\//g, '-')}`;
    if (!seen.has(key)) seen.set(key, a);
}

let n = 0;
for (const [key, a] of seen) {
    const src = path.join(SRC, a.file);
    const dst = path.join(DEST, key + '.json');
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        n++;
    }
}

// Build catalog
const catalog = [...seen.entries()].map(([key, a]) => ({
    key,
    method: a.method,
    path: new URL(a.url).pathname,
    size: a.size,
    file: key + '.json',
}));
fs.writeFileSync(path.join(DEST, '_catalog.json'), JSON.stringify(catalog, null, 2));

console.log(`Copied ${n} files to ${DEST}`);
console.log(`Catalog: ${path.join(DEST, '_catalog.json')}`);
