# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-193935-283422b`
**Session file**: [`./20260615-193935-283422b.md`](../20260615-193935-283422b.md)
**Commit**: `283422b` — feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2_customers + SSE đồng bộ
**Last updated**: 2026-06-15 19:39:35 +07
**Summary**: feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2_customers + SSE đồng bộ

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_
- `dea0ee5c5` feat(live-chat/mobile): bỏ nút Gọi/Mở FB ở sheet + highlight comment mới 3s _(2026-06-15)_
- `b5f26045a` feat(live-chat/mobile): mặc định mode ĐANG LIVE (gộp bài đang live) thay vì Tất cả _(2026-06-15)_
- `20eea9062` feat(web2/multi-tool): gửi tăng comment GIỐNG 100% Pancake (access*token JWT, body capture) + đa nhiệm JWT account *(2026-06-15)\_
- `97ae89a58` feat(web2-jt): 'Dán lịch sử' nạp dòng dán vào kho tin chat _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-193935-283422b` cho Claude walk chain theo CLAUDE.md protocol.
