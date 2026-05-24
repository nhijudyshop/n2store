# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-095001-fc67992`
**Session file**: [`./20260524-095001-fc67992.md`](../20260524-095001-fc67992.md)
**Commit**: `fc67992` — fix(inventory/header): ép data 1 hàng — nowrap + overflow-x scroll cho row dài
**Last updated**: 2026-05-24 09:50:01 +07
**Summary**: fix(inventory/header): ép data 1 hàng — nowrap + overflow-x scroll cho row dài

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`

## Last 5 commits touching `inventory-tracking/`

- `fc6799241` fix(inventory/header): ép data 1 hàng — nowrap + overflow-x scroll cho row dài _(2026-05-24)_
- `9f2389d61` fix(inventory): bỏ ' CNY' suffix khỏi header — giữ $ prefix _(2026-05-24)_
- `229cb71ff` feat(tpos-comments): archive fallback via SaleOnline*Order (post xóa khỏi FB vẫn có) *(2026-05-24)\_
- `8c818cee3` auto: session update _(2026-05-22)_
- `c6adbcadf` feat(inventory): tìm kiếm theo NCC (compact search bên cạnh đợt tabs) _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-095001-fc67992` cho Claude walk chain theo CLAUDE.md protocol.
