// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
    id: 'opencode-home',
    target: 'opencode',
    kind: 'home',
    rootSegments: ['.opencode'],
    installStatePathSegments: ['ecc-install-state.json'],
    nativeRootRelativePath: '.opencode',
});
