# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-101533-259d9a2`
**Session file**: [`./20260628-101533-259d9a2.md`](../20260628-101533-259d9a2.md)
**Commit**: `259d9a2` — fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý)
**Last updated**: 2026-06-28 10:15:33 +07
**Summary**: fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `259d9a22b` fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý) _(2026-06-28)_
- `30b4f6a60` fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_
- `afe959107` fix(ai-hub): busy 'Đang xử lý ảnh' stuck, chip đổi không đóng attach, switchTab fallback _(2026-06-28)_
- `1e1b6abde` feat(web2/overview+shared): logo riêng n2shop Web 2.0 — mark N gradient + wordmark _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-101533-259d9a2` cho Claude walk chain theo CLAUDE.md protocol.
