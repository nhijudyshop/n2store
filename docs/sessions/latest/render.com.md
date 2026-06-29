# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-151039-a13f211`
**Session file**: [`./20260629-151039-a13f211.md`](../20260629-151039-a13f211.md)
**Commit**: `a13f211` — fix(order-tags): co_coc tính cọc GIỎ (native deposit) + MAX cọc PBH, không đè mất
**Last updated**: 2026-06-29 15:10:39 +07
**Summary**: fix(order-tags): co_coc tính cọc GIỎ (native deposit) + MAX cọc PBH, không đè mất

## Files changed in this commit (`render.com/`)

- `render.com/routes/native-orders.js`

## Last 5 commits touching `render.com/`

- `a13f211cf` fix(order-tags): co*coc tính cọc GIỎ (native deposit) + MAX cọc PBH, không đè mất *(2026-06-29)\_
- `0290c61e0` feat(order-tags): activate + fix co*coc (enrich PBH deposit) + ship_tinh/ship_tp (derive zone từ địa chỉ) *(2026-06-29)\_
- `a58e9b478` fix(order-tags): pbh*created chỉ tính PBH thật + gỡ tag co_tin_nhan (trùng co_binh_luan) *(2026-06-29)\_
- `87114993a` fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-151039-a13f211` cho Claude walk chain theo CLAUDE.md protocol.
