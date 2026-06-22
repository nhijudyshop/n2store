# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-152657-664f1b7`
**Session file**: [`./20260622-152657-664f1b7.md`](../20260622-152657-664f1b7.md)
**Commit**: `664f1b7` — feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc
**Last updated**: 2026-06-22 15:26:57 +07
**Summary**: feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `664f1b739` feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc _(2026-06-22)_
- `a16694260` chore(session): RESUME:20260622-151825-50e528e _(2026-06-22)_
- `ccbd1fa77` chore(session): RESUME:20260622-151342-c56f57e _(2026-06-22)_
- `95fed66f3` chore(session): RESUME:20260622-150713-9efdd11 _(2026-06-22)_
- `9efdd11e1` feat(web2-zalo) bỏ giới hạn allowlist nhóm — mặc định hiện TẤT CẢ nhóm + 1-1 (opt-in env WEB2*ZALO_GROUP_ALLOWLIST) *(2026-06-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-152657-664f1b7` cho Claude walk chain theo CLAUDE.md protocol.
