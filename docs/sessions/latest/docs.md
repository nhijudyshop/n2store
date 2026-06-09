# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-192915-29adb0f`
**Session file**: [`./20260609-192915-29adb0f.md`](../20260609-192915-29adb0f.md)
**Commit**: `29adb0f` — feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option)
**Last updated**: 2026-06-09 19:29:15 +07
**Summary**: feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `29adb0f00` feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option) _(2026-06-09)_
- `6417c69c7` chore(session): RESUME:20260609-192744-b15bd2c _(2026-06-09)_
- `0746cb548` feat(orders): nút FB popup resolve qua Pancake fetch (bỏ tìm theo tên, báo 'Chưa có dữ liệu Pancake') _(2026-06-09)_
- `5153e1b21` chore(session): RESUME:20260609-192652-3248aa8 _(2026-06-09)_
- `df76becc1` chore(session): RESUME:20260609-192450-58eb2ec _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-192915-29adb0f` cho Claude walk chain theo CLAUDE.md protocol.
