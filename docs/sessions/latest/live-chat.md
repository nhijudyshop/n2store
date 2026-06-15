# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-194932-a6d6558`
**Session file**: [`./20260615-194932-a6d6558.md`](../20260615-194932-a6d6558.md)
**Commit**: `a6d6558` — auto: session update
**Last updated**: 2026-06-15 19:49:32 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/index.html`
- `live-chat/js/live/comments-mobile.js`
- `live-chat/js/live/live-api.js`
- `live-chat/js/live/live-kho-enricher.js`

## Last 5 commits touching `live-chat/`

- `b988e2db4` fix(live-chat): write KH 401 — thêm x-web2-token vào MỌI write live-api (PATCH/upsert/status); validPhone 10 số (tránh nhầm fb*id) *(2026-06-15)\_
- `f06a60568` auto: session update _(2026-06-15)_
- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_
- `dea0ee5c5` feat(live-chat/mobile): bỏ nút Gọi/Mở FB ở sheet + highlight comment mới 3s _(2026-06-15)_
- `b5f26045a` feat(live-chat/mobile): mặc định mode ĐANG LIVE (gộp bài đang live) thay vì Tất cả _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-194932-a6d6558` cho Claude walk chain theo CLAUDE.md protocol.
