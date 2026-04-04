// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * EVENTS MODULE - Index
 * =====================================================
 *
 * Central export for all event modules
 *
 * Created: 2026-01-12
 * =====================================================
 */

const customerEvents = require('./customer-events');

module.exports = {
    ...customerEvents
};
