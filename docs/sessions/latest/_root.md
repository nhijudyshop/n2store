# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-191159-239c11a`
**Session file**: [`./20260609-191159-239c11a.md`](../20260609-191159-239c11a.md)
**Commit**: `239c11a` — auto: session update
**Last updated**: 2026-06-09 19:11:59 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `16d3f32c9` feat(native-orders): Thêm đơn Inbox — tìm kho KH trước, fallback Pancake; chọn kho KH thì dò page nền theo SĐT _(2026-06-09)_
- `7b58a4629` auto: session update _(2026-06-09)_
- `30b61846c` auto: session update _(2026-06-07)_
- `6643a6e58` auto: session update _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-191159-239c11a` cho Claude walk chain theo CLAUDE.md protocol.
