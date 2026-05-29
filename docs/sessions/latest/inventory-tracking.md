# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-145235-ef2dc55`
**Session file**: [`./20260529-145235-ef2dc55.md`](../20260529-145235-ef2dc55.md)
**Commit**: `ef2dc55` — feat(inventory): remove "Mô tả" column from invoice table
**Last updated**: 2026-05-29 14:52:35 +07
**Summary**: feat(inventory): remove "Mô tả" column from invoice table

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/column-toggle.js`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `ef2dc5546` feat(inventory): remove "Mô tả" column from invoice table _(2026-05-29)_
- `3955d51ce` feat(inventory): copy MÃ HÀNG button + drag-drop reorder product rows _(2026-05-29)_
- `ca7655f16` feat(inventory): custom confirm modal cho mọi delete action _(2026-05-29)_
- `17ddbf337` feat(inventory): show NCC count badge in shipment card header _(2026-05-29)_
- `f8299c153` feat(inventory): add inline "+ Thêm hàng" button on last row of each NCC invoice _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-145235-ef2dc55` cho Claude walk chain theo CLAUDE.md protocol.
