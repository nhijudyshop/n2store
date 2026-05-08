#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

// OnCallCX Sync Daemon — DEPRECATED 2026-05-08
//
// Đã ngừng sync vì recording bị duplicate giữa Postgres và OnCallCX portal.
// Khi cần ghi âm truy thẳng portal.oncallcx.com (UI đã có nút "Portal OnCallCX").
//
// launchd plist: bash scripts/install-oncallcx-sync.sh uninstall
// Render endpoint POST /api/oncall/call-recordings hiện trả 410 Gone.
//
// Code cũ xem git history: git show HEAD~1:scripts/oncallcx-sync-daemon.js

console.error(
    '[oncallcx-sync] DEPRECATED — sync was disabled 2026-05-08. Recordings live in OnCallCX portal only.'
);
process.exit(0);
