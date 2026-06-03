# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-204820-8c6859b`
**Session file**: [`./20260603-204820-8c6859b.md`](../20260603-204820-8c6859b.md)
**Commit**: `8c6859b` — feat(web2): đổi tên kho KH đơn hàng customers → web2_order_customers (web2Db)
**Last updated**: 2026-06-03 20:48:20 +07
**Summary**: feat(web2): đổi tên kho KH đơn hàng customers → web2_order_customers (web2Db)

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`

## Last 5 commits touching `web2/`

- `8cdc6c407` auto: session update _(2026-06-03)_
- `cb39039c2` fix(web2): photo-studio v8 — màn xem ảnh sau chụp + lưu ảnh đúng cách mobile _(2026-06-03)_
- `f69461956` feat(web2): photo-studio v7 — giao diện mobile camera-app + bottom sheet tùy chọn _(2026-06-03)_
- `b20eda070` auto: session update _(2026-06-03)_
- `64bf2d495` fix(web2): photo-studio v5 — hiện popup xin quyền + thông báo lỗi quyền rõ trên mobile _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-204820-8c6859b` cho Claude walk chain theo CLAUDE.md protocol.
