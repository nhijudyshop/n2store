#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
'use strict';

const { isHookEnabled } = require('../lib/hook-flags');

const [, , hookId, profilesCsv] = process.argv;
if (!hookId) {
    process.stdout.write('yes');
    process.exit(0);
}

process.stdout.write(isHookEnabled(hookId, { profiles: profilesCsv }) ? 'yes' : 'no');
