# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-150214-0290c61`
**Session file**: [`./20260629-150214-0290c61.md`](../20260629-150214-0290c61.md)
**Commit**: `0290c61` — feat(order-tags): activate + fix co*coc (enrich PBH deposit) + ship_tinh/ship_tp (derive zone từ địa chỉ)
**Last updated**: 2026-06-29 15:02:14 +07
**Summary**: order-tags: activate+fix co_coc+ship*\*; CK flow + GIỎ/ĐƠN; cleanup

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0290c61e0` feat(order-tags): activate + fix co*coc (enrich PBH deposit) + ship_tinh/ship_tp (derive zone từ địa chỉ) *(2026-06-29)\_
- `b614be61f` chore(session): RESUME:20260629-144701-a58e9b4 _(2026-06-29)_
- `a58e9b478` fix(order-tags): pbh*created chỉ tính PBH thật + gỡ tag co_tin_nhan (trùng co_binh_luan) *(2026-06-29)\_
- `e6c58a90f` chore(session): RESUME:20260629-141219-8711499 _(2026-06-29)_
- `87114993a` fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-150214-0290c61` cho Claude walk chain theo CLAUDE.md protocol.
