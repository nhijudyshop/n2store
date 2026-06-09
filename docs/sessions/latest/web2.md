# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-192652-3248aa8`
**Session file**: [`./20260609-192652-3248aa8.md`](../20260609-192652-3248aa8.md)
**Commit**: `3248aa8` — auto: session update
**Last updated**: 2026-06-09 19:26:52 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customers/css/customers.css`
- `web2/customers/index.html`

## Last 5 commits touching `web2/`

- `3248aa803` auto: session update _(2026-06-09)_
- `58eb2ec6c` auto: session update _(2026-06-09)_
- `eec34ebd2` fix(web2): tem mã SP — phóng to chữ tên+giá (font ×1.55, QR thu nhẹ) _(2026-06-09)_
- `28c060b6c` auto: session update _(2026-06-09)_
- `16d3f32c9` feat(native-orders): Thêm đơn Inbox — tìm kho KH trước, fallback Pancake; chọn kho KH thì dò page nền theo SĐT _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-192652-3248aa8` cho Claude walk chain theo CLAUDE.md protocol.
