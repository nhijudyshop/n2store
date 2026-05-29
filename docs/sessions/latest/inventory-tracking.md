# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-125738-17ddbf3`
**Session file**: [`./20260529-125738-17ddbf3.md`](../20260529-125738-17ddbf3.md)
**Commit**: `17ddbf3` — feat(inventory): show NCC count badge in shipment card header
**Last updated**: 2026-05-29 12:57:38 +07
**Summary**: feat(inventory): show NCC count badge in shipment card header

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `17ddbf337` feat(inventory): show NCC count badge in shipment card header _(2026-05-29)_
- `f8299c153` feat(inventory): add inline "+ Thêm hàng" button on last row of each NCC invoice _(2026-05-29)_
- `072e13904` auto: session update _(2026-05-29)_
- `1bcb2ecab` auto: session update _(2026-05-29)_
- `09d2e3120` feat(inventory): sort NCC theo createdAt ASC trong mỗi shipment (cũ trên, mới dưới) _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-125738-17ddbf3` cho Claude walk chain theo CLAUDE.md protocol.
