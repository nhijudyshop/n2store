# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-123254-2d25653`
**Session file**: [`./20260625-123254-2d25653.md`](../20260625-123254-2d25653.md)
**Commit**: `2d25653` — fix(web2/effects): hover-zoom "ảnh to hiện cuối trang" trên trang không nạp web2-effects.css
**Last updated**: 2026-06-25 12:32:54 +07
**Summary**: fix hover-zoom ảnh dump cuối trang (web2-effects tự inject CSS popup) trên trang thiếu web2-effects.css

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2d2565309` fix(web2/effects): hover-zoom "ảnh to hiện cuối trang" trên trang không nạp web2-effects.css _(2026-06-25)_
- `87a586bc1` chore(session): RESUME:20260625-123225-7f8dd21 _(2026-06-25)_
- `8449b1473` fix(web2/ai-assistant): fallback chéo provider khi provider lỗi (Groq org restricted) _(2026-06-25)_
- `8f522a7b2` chore(session): RESUME:20260625-122437-9eee345 _(2026-06-25)_
- `9eee3459a` fix(web2/ai-hub): bỏ lộ token web2 qua URL ảnh "Ảnh đã lưu" — fetch+blob thay ?token= _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-123254-2d25653` cho Claude walk chain theo CLAUDE.md protocol.
