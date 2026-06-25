# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-132401-b5407f8`
**Session file**: [`./20260625-132401-b5407f8.md`](../20260625-132401-b5407f8.md)
**Commit**: `b5407f8` — feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh
**Last updated**: 2026-06-25 13:24:01 +07
**Summary**: feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b5407f840` feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh _(2026-06-25)_
- `27d38d2b5` chore(session): RESUME:20260625-130246-cefbfef _(2026-06-25)_
- `cefbfefbd` fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat _(2026-06-25)_
- `f3817fbbd` chore(session): RESUME:20260625-123254-2d25653 _(2026-06-25)_
- `2d2565309` fix(web2/effects): hover-zoom "ảnh to hiện cuối trang" trên trang không nạp web2-effects.css _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-132401-b5407f8` cho Claude walk chain theo CLAUDE.md protocol.
