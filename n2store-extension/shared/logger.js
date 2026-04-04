// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Structured logging with [N2EXT] prefix
const PREFIX = '[N2EXT]';

export const log = {
  info: (module, ...args) => console.log(`${PREFIX}[${module}]`, ...args),
  warn: (module, ...args) => console.warn(`${PREFIX}[${module}]`, ...args),
  error: (module, ...args) => console.error(`${PREFIX}[${module}]`, ...args),
  debug: (module, ...args) => console.debug(`${PREFIX}[${module}]`, ...args),
};
