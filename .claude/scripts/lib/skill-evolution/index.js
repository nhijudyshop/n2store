// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
'use strict';

const provenance = require('./provenance');
const versioning = require('./versioning');
const tracker = require('./tracker');
const health = require('./health');
const dashboard = require('./dashboard');

module.exports = {
    ...provenance,
    ...versioning,
    ...tracker,
    ...health,
    ...dashboard,
    provenance,
    versioning,
    tracker,
    health,
    dashboard,
};
