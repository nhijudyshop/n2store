# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-191159-239c11a`
**Session file**: [`./20260609-191159-239c11a.md`](../20260609-191159-239c11a.md)
**Commit**: `239c11a` — auto: session update
**Last updated**: 2026-06-09 19:11:59 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customers/css/customers.css`
- `web2/customers/index.html`
- `web2/customers/js/customers-app.js`

## Last 5 commits touching `web2/`

- `16d3f32c9` feat(native-orders): Thêm đơn Inbox — tìm kho KH trước, fallback Pancake; chọn kho KH thì dò page nền theo SĐT _(2026-06-09)_
- `f0fc98899` feat(web2-customers): chọn SĐT phụ làm SĐT chính (hiển thị) — swap qua nút ⭐ _(2026-06-09)_
- `74c08f8e4` feat(web2-customers): 1 KH thêm nhiều SĐT (alt*phones) — modal chips + persist create/PATCH *(2026-06-09)\_
- `f1b685c61` auto: session update _(2026-06-09)_
- `c9d643e9c` auto: session update _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-191159-239c11a` cho Claude walk chain theo CLAUDE.md protocol.
