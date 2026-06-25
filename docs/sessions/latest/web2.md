# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-130246-cefbfef`
**Session file**: [`./20260625-130246-cefbfef.md`](../20260625-130246-cefbfef.md)
**Commit**: `cefbfef` — fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat
**Last updated**: 2026-06-25 13:02:46 +07
**Summary**: fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-ai-page-registry.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `cefbfefbd` fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat _(2026-06-25)_
- `7f8dd21b8` auto: session update _(2026-06-25)_
- `8449b1473` fix(web2/ai-assistant): fallback chéo provider khi provider lỗi (Groq org restricted) _(2026-06-25)_
- `9eee3459a` fix(web2/ai-hub): bỏ lộ token web2 qua URL ảnh "Ảnh đã lưu" — fetch+blob thay ?token= _(2026-06-25)_
- `8deb16492` feat(web2/ai-assistant): 3 công cụ dùng chung trong widget ✨ (Ghép đồ · Card/Video · AI viết mô tả) + fix bảo mật & race _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-130246-cefbfef` cho Claude walk chain theo CLAUDE.md protocol.
