# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-211146-909de65`
**Session file**: [`./20260529-211146-909de65.md`](../20260529-211146-909de65.md)
**Commit**: `909de65` — fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight
**Last updated**: 2026-05-29 21:11:46 +07
**Summary**: fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/modal-variant.js`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `909de65fc` fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight _(2026-05-29)_
- `a36a1ebae` feat(inventory): variant modal — confirm khi tổng biến thể ≠ Tổng SL _(2026-05-29)_
- `0bd443330` feat(inventory): per-NCC + per-shipment edit history (30-day retention) _(2026-05-29)_
- `ef2dc5546` feat(inventory): remove "Mô tả" column from invoice table _(2026-05-29)_
- `3955d51ce` feat(inventory): copy MÃ HÀNG button + drag-drop reorder product rows _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-211146-909de65` cho Claude walk chain theo CLAUDE.md protocol.
