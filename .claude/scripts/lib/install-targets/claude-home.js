// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
    id: 'claude-home',
    target: 'claude',
    kind: 'home',
    rootSegments: ['.claude'],
    installStatePathSegments: ['ecc', 'install-state.json'],
    nativeRootRelativePath: '.claude-plugin',
});
