# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-152657-664f1b7`
**Session file**: [`./20260622-152657-664f1b7.md`](../20260622-152657-664f1b7.md)
**Commit**: `664f1b7` — feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc
**Last updated**: 2026-06-22 15:26:57 +07
**Summary**: feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-zalo.js`

## Last 5 commits touching `render.com/`

- `f4892eded` auto: session update _(2026-06-22)_
- `9efdd11e1` feat(web2-zalo) bỏ giới hạn allowlist nhóm — mặc định hiện TẤT CẢ nhóm + 1-1 (opt-in env WEB2*ZALO_GROUP_ALLOWLIST) *(2026-06-22)\_
- `f2a0f4031` feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick) _(2026-06-22)_
- `03fa29405` auto: session update _(2026-06-22)_
- `0bad2960d` feat(web2-admin) data-wipe execute: optional dropBackups (_*bak*_) + clearRecords _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-152657-664f1b7` cho Claude walk chain theo CLAUDE.md protocol.
