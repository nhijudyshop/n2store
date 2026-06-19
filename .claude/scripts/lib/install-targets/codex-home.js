// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
    id: 'codex-home',
    target: 'codex',
    kind: 'home',
    rootSegments: ['.codex'],
    installStatePathSegments: ['ecc-install-state.json'],
    nativeRootRelativePath: '.codex',
});
