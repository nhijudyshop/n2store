# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-140614-5964e7c`
**Session file**: [`./20260601-140614-5964e7c.md`](../20260601-140614-5964e7c.md)
**Commit**: `5964e7c` — refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại")
**Last updated**: 2026-06-01 14:06:14 +07
**Summary**: refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại")

## Files changed in this commit (`native-orders/`)

- `native-orders/css/native-orders.css`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `5964e7cbb` refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại") _(2026-06-01)_
- `cbc4e8cd5` fix(native-orders): customer hover popover overlap bug + TPOS-live address _(2026-06-01)_
- `407a3add6` fix(native-orders): customer hover popover bug — bỏ avatar zoom, dời popover xuống dưới row, enrich với TPOS data _(2026-06-01)_
- `648e0025e` feat(native-orders): avatar + Pancake hover popover + tách Ghi chú + dồn Trạng thái vào STT _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-140614-5964e7c` cho Claude walk chain theo CLAUDE.md protocol.
