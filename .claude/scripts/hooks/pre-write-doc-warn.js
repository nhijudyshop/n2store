#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Backward-compatible doc warning hook entrypoint.
 * Kept for consumers that still reference pre-write-doc-warn.js directly.
 */

'use strict';

require('./doc-file-warning.js');
