# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-141040-c6adbca`
**Session file**: [`./20260522-141040-c6adbca.md`](../20260522-141040-c6adbca.md)
**Commit**: `c6adbca` — feat(inventory): tìm kiếm theo NCC (compact search bên cạnh đợt tabs)
**Last updated**: 2026-05-22 14:10:40 +07
**Summary**: feat(inventory): tìm kiếm theo NCC (compact search bên cạnh đợt tabs)

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/dot-tabs.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/main.js`
- `inventory-tracking/js/ncc-search.js`

## Last 5 commits touching `inventory-tracking/`

- `c6adbcadf` feat(inventory): tìm kiếm theo NCC (compact search bên cạnh đợt tabs) _(2026-05-22)_
- `ec494cd4c` auto: session update _(2026-05-22)_
- `7ca8b0941` fix(inventory/dot-tabs): order ASC (Đợt 1, 2, 3, ...) + wire render in flattenNCCData _(2026-05-22)_
- `37f177d35` feat(inventory): đợt section tabs + stats theo tab + audit logging _(2026-05-22)_
- `ffba71603` auto: session update _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-141040-c6adbca` cho Claude walk chain theo CLAUDE.md protocol.
