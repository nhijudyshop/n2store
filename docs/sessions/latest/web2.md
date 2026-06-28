# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-104738-83392ba`
**Session file**: [`./20260628-104738-83392ba.md`](../20260628-104738-83392ba.md)
**Commit**: `83392ba` — auto: session update
**Last updated**: 2026-06-28 10:47:38 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/order-tags/js/order-tags-app.js`
- `web2/shared/web2-ai-page-registry.js`
- `web2/users/js/users-app.js`

## Last 5 commits touching `web2/`

- `83392ba94` auto: session update _(2026-06-28)_
- `697d89682` fix(web2/live): dọn SP ghost — auto hard-delete cp mồ côi khi xoá kho/Số Order _(2026-06-28)_
- `259d9a22b` fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý) _(2026-06-28)_
- `30b4f6a60` fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-104738-83392ba` cho Claude walk chain theo CLAUDE.md protocol.
