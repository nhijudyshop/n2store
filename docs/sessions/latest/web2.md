# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-132401-b5407f8`
**Session file**: [`./20260625-132401-b5407f8.md`](../20260625-132401-b5407f8.md)
**Commit**: `b5407f8` — feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh
**Last updated**: 2026-06-25 13:24:01 +07
**Summary**: feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `b5407f840` feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh _(2026-06-25)_
- `cefbfefbd` fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat _(2026-06-25)_
- `7f8dd21b8` auto: session update _(2026-06-25)_
- `8449b1473` fix(web2/ai-assistant): fallback chéo provider khi provider lỗi (Groq org restricted) _(2026-06-25)_
- `9eee3459a` fix(web2/ai-hub): bỏ lộ token web2 qua URL ảnh "Ảnh đã lưu" — fetch+blob thay ?token= _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-132401-b5407f8` cho Claude walk chain theo CLAUDE.md protocol.
