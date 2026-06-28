# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-213318-4aed2bd`
**Session file**: [`./20260628-213318-4aed2bd.md`](../20260628-213318-4aed2bd.md)
**Commit**: `4aed2bd` — feat(admin-reset): target 'reset-flow' wipe ĐÚNG 9 domain luồng mua-ban-kho (so-order/products+units/native-orders/PBH/reconcile/supplier-debt+wallet/ck); + units vào PRODUCT_TABLES
**Last updated**: 2026-06-28 21:33:18 +07
**Summary**: feat(admin-reset): target 'reset-flow' wipe ĐÚNG 9 domain luồng mua-ban-kho (so-order/products+units/native-order...

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-data-reset.js`

## Last 5 commits touching `render.com/`

- `4aed2bd7e` feat(admin-reset): target 'reset-flow' wipe ĐÚNG 9 domain luồng mua-ban-kho (so-order/products+units/native-orders/PBH/reconcile/supplier-debt+wallet/ck); + units vào PRODUCT*TABLES *(2026-06-28)\_
- `7ce9d5a59` auto: session update _(2026-06-28)_
- `067c70534` fix(web2-product-units): native*orders cột 'code' không phải 'order_code' (resolve+assign 500) + guard jsonb non-array *(2026-06-28)\_
- `c4679e281` feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override _(2026-06-28)_
- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-213318-4aed2bd` cho Claude walk chain theo CLAUDE.md protocol.
