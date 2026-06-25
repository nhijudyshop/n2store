# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-130246-cefbfef`
**Session file**: [`./20260625-130246-cefbfef.md`](../20260625-130246-cefbfef.md)
**Commit**: `cefbfef` — fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat
**Last updated**: 2026-06-25 13:02:46 +07
**Summary**: fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `cefbfefbd` fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat _(2026-06-25)_
- `f3817fbbd` chore(session): RESUME:20260625-123254-2d25653 _(2026-06-25)_
- `2d2565309` fix(web2/effects): hover-zoom "ảnh to hiện cuối trang" trên trang không nạp web2-effects.css _(2026-06-25)_
- `87a586bc1` chore(session): RESUME:20260625-123225-7f8dd21 _(2026-06-25)_
- `8449b1473` fix(web2/ai-assistant): fallback chéo provider khi provider lỗi (Groq org restricted) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-130246-cefbfef` cho Claude walk chain theo CLAUDE.md protocol.
