#!/usr/bin/env node
// =====================================================
// VERSION INCREMENT SCRIPT
// Auto-increment build number before commit
// =====================================================

const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../orders-report/version.js');

// Read current version file
const content = fs.readFileSync(versionFilePath, 'utf8');

// Extract current build number
const buildMatch = content.match(/build:\s*(\d+)/);
if (!buildMatch) {
    console.error('❌ Could not find build number in version.js');
    process.exit(1);
}

const currentBuild = parseInt(buildMatch[1]);
const newBuild = currentBuild + 1;

// Get git branch name
const { execSync } = require('child_process');
let branch = 'main';
try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
    console.warn('⚠️ Could not get git branch name');
}

// Generate new version file content
const newContent = `// =====================================================
// APP VERSION - Auto-incremented on each commit
// =====================================================

window.APP_VERSION = {
    version: '1.0.0',
    build: ${newBuild},
    timestamp: '${new Date().toISOString()}',
    branch: '${branch}'
};

console.log(\`[VERSION] App version: \${window.APP_VERSION.version} (build \${window.APP_VERSION.build})\`);
`;

// Write new version file
fs.writeFileSync(versionFilePath, newContent, 'utf8');

console.log(`✅ Version incremented: build ${currentBuild} → ${newBuild}`);
console.log(`📅 Timestamp: ${new Date().toISOString()}`);
console.log(`🌿 Branch: ${branch}`);

// Stage the version file for commit
try {
    execSync('git add orders-report/version.js', { stdio: 'inherit' });
    console.log('✅ version.js staged for commit');
} catch (e) {
    console.warn('⚠️ Could not stage version.js');
}
