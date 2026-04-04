#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * CLEAN SCRIPT
 * Remove all minified files
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning minified files...\n');

const ROOT_DIR = path.join(__dirname, '..');
const SKIP_DIRS = ['node_modules', '.git', 'build-scripts'];

let deletedCount = 0;

function walkDir(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const relativePath = path.relative(ROOT_DIR, filePath);

        // Skip certain directories
        if (SKIP_DIRS.some(d => relativePath.startsWith(d))) {
            return;
        }

        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDir(filePath);
        } else if (filePath.endsWith('.min.js') || filePath.endsWith('.min.css') || filePath.endsWith('.min.html')) {
            fs.unlinkSync(filePath);
            console.log(`  🗑️  Deleted: ${relativePath}`);
            deletedCount++;
        }
    });
}

walkDir(ROOT_DIR);

console.log(`\n✅ Cleaned ${deletedCount} minified files\n`);
