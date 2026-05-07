// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Fix `<title>undefined — Web 2.0</title>` in web2/* pages by reading the
 * actual title from the Web2Shell.bootstrap config inside the same file.
 * Idempotent — safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const WEB2_DIR = 'web2';
const dirs = fs
    .readdirSync(WEB2_DIR)
    .filter((d) => fs.statSync(path.join(WEB2_DIR, d)).isDirectory())
    .sort();

const stats = { scanned: 0, fixed: 0, skipped: 0, noBootstrap: 0, noTitleField: 0 };
const fixed = [];
const issues = [];

for (const d of dirs) {
    const file = path.join(WEB2_DIR, d, 'index.html');
    if (!fs.existsSync(file)) continue;
    stats.scanned++;
    const html = fs.readFileSync(file, 'utf8');

    if (!/Web2Shell\.bootstrap/.test(html)) {
        stats.noBootstrap++;
        issues.push({ dir: d, reason: 'no Web2Shell.bootstrap' });
        continue;
    }

    // Extract title from bootstrap config — accept "title": "x" OR title: 'x' OR title:"x"
    const titleMatch = html.match(/["']?title["']?\s*:\s*['"]([^'"]+)['"]/);
    if (!titleMatch) {
        stats.noTitleField++;
        issues.push({ dir: d, reason: 'no title field in config' });
        continue;
    }
    const newTitle = titleMatch[1];

    // Replace <title>...</title> with the new title
    const titleTagRe = /<title>([^<]*)<\/title>/;
    const tagMatch = html.match(titleTagRe);
    if (!tagMatch) {
        stats.skipped++;
        issues.push({ dir: d, reason: 'no <title> tag' });
        continue;
    }

    const currentTitle = tagMatch[1];
    const expectedTitle = `${newTitle} — Web 2.0`;
    if (currentTitle === expectedTitle) {
        stats.skipped++;
        continue;
    }

    const newHtml = html.replace(titleTagRe, `<title>${expectedTitle}</title>`);
    fs.writeFileSync(file, newHtml);
    stats.fixed++;
    fixed.push({ dir: d, old: currentTitle, new: expectedTitle });
}

console.log(`Scanned:        ${stats.scanned}`);
console.log(`Fixed:          ${stats.fixed}`);
console.log(`Already OK:     ${stats.skipped}`);
console.log(`No bootstrap:   ${stats.noBootstrap}`);
console.log(`No title field: ${stats.noTitleField}`);
console.log();
if (fixed.length) {
    console.log('Fixed pages:');
    for (const f of fixed.slice(0, 20))
        console.log(`  ${f.dir.padEnd(40)}  '${f.old}' → '${f.new}'`);
    if (fixed.length > 20) console.log(`  ... and ${fixed.length - 20} more`);
}
if (issues.length) {
    console.log('\nIssues (need manual review):');
    for (const i of issues) console.log(`  ${i.dir.padEnd(40)}  ${i.reason}`);
}
