// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
    id: 'gemini-project',
    target: 'gemini',
    kind: 'project',
    rootSegments: ['.gemini'],
    installStatePathSegments: ['ecc-install-state.json'],
    nativeRootRelativePath: '.gemini',
});
