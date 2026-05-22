# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-135158-8976f12`
**Session file**: [`./20260522-135158-8976f12.md`](../20260522-135158-8976f12.md)
**Commit**: `8976f12` — fix(delivery-report): excel buttons + export content match active groups (lite=TOMATO+SHOP)
**Last updated**: 2026-05-22 13:51:58 +07
**Summary**: fix(delivery-report): excel buttons + export content match active groups (lite=TOMATO+SHOP)

## Files changed in this commit (`scripts/`)

- `scripts/test-dr-excel-buttons.js`

## Last 5 commits touching `scripts/`

- `8976f129a` fix(delivery-report): excel buttons + export content match active groups (lite=TOMATO+SHOP) _(2026-05-22)_
- `9d6fb6221` fix(delivery-report): filter+stats luon visible (auto-expanded), khong follow lite-hide _(2026-05-22)_
- `cc68e4cc5` fix(delivery-report): drStatShippingCount/drStatFailCount nay tinh dung — match table view _(2026-05-22)_
- `49d853d32` feat(delivery-report): filter+stats follow lite-hide logic (table-aligned visibility) _(2026-05-22)_
- `03ee08314` feat(scripts): realtime HTTP/SSE API + compound `do` cho browser-session _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-135158-8976f12` cho Claude walk chain theo CLAUDE.md protocol.
