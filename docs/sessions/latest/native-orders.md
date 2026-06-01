# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-135850-cbc4e8c`
**Session file**: [`./20260601-135850-cbc4e8c.md`](../20260601-135850-cbc4e8c.md)
**Commit**: `cbc4e8c` — fix(native-orders): customer hover popover overlap bug + TPOS-live address
**Last updated**: 2026-06-01 13:58:50 +07
**Summary**: fix(native-orders): customer hover popover overlap bug + TPOS-live address

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `cbc4e8cd5` fix(native-orders): customer hover popover overlap bug + TPOS-live address _(2026-06-01)_
- `407a3add6` fix(native-orders): customer hover popover bug — bỏ avatar zoom, dời popover xuống dưới row, enrich với TPOS data _(2026-06-01)_
- `648e0025e` feat(native-orders): avatar + Pancake hover popover + tách Ghi chú + dồn Trạng thái vào STT _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `29c2ab318` auto: session update _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-135850-cbc4e8c` cho Claude walk chain theo CLAUDE.md protocol.
