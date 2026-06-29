# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-144701-a58e9b4`
**Session file**: [`./20260629-144701-a58e9b4.md`](../20260629-144701-a58e9b4.md)
**Commit**: `a58e9b4` — fix(order-tags): pbh_created chỉ tính PBH thật + gỡ tag co_tin_nhan (trùng co_binh_luan)
**Last updated**: 2026-06-29 14:47:01 +07
**Summary**: order-tags: fix pbh_created + gỡ co_tin_nhan; CK flow verified

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a58e9b478` fix(order-tags): pbh*created chỉ tính PBH thật + gỡ tag co_tin_nhan (trùng co_binh_luan) *(2026-06-29)\_
- `e6c58a90f` chore(session): RESUME:20260629-141219-8711499 _(2026-06-29)_
- `87114993a` fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto _(2026-06-29)_
- `cb34c45a3` chore(session): RESUME:20260629-140045-e707261 _(2026-06-29)_
- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-144701-a58e9b4` cho Claude walk chain theo CLAUDE.md protocol.
