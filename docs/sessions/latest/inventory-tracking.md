# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-094537-9f2389d`
**Session file**: [`./20260524-094537-9f2389d.md`](../20260524-094537-9f2389d.md)
**Commit**: `9f2389d` — fix(inventory): bỏ ' CNY' suffix khỏi header — giữ $ prefix
**Last updated**: 2026-05-24 09:45:37 +07
**Summary**: fix(inventory): bỏ ' CNY' suffix khỏi header — giữ $ prefix

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `9f2389d61` fix(inventory): bỏ ' CNY' suffix khỏi header — giữ $ prefix _(2026-05-24)_
- `229cb71ff` feat(tpos-comments): archive fallback via SaleOnline*Order (post xóa khỏi FB vẫn có) *(2026-05-24)\_
- `8c818cee3` auto: session update _(2026-05-22)_
- `c6adbcadf` feat(inventory): tìm kiếm theo NCC (compact search bên cạnh đợt tabs) _(2026-05-22)_
- `ec494cd4c` auto: session update _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-094537-9f2389d` cho Claude walk chain theo CLAUDE.md protocol.
