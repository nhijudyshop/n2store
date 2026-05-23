# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-090449-5e5ec53`
**Session file**: [`./20260523-090449-5e5ec53.md`](../20260523-090449-5e5ec53.md)
**Commit**: `5e5ec53` — fix(web2/products SSE): tách \_sseReloadTimer + \_sseUsageTimer riêng
**Last updated**: 2026-05-23 09:04:49 +07
**Summary**: fix(web2/products SSE): tách \_sseReloadTimer + \_sseUsageTimer riêng

## Files changed in this commit (`scripts/`)

- `scripts/multi-tab-test.js`

## Last 5 commits touching `scripts/`

- `5e5ec5372` fix(web2/products SSE): tách _sseReloadTimer + \_sseUsageTimer riêng _(2026-05-23)\_
- `1aa81b75c` refactor(v2/cart + tpos-pancake): giỏ TPOS panel = native*orders.products (1 nguồn) *(2026-05-22)\_
- `8976f129a` fix(delivery-report): excel buttons + export content match active groups (lite=TOMATO+SHOP) _(2026-05-22)_
- `9d6fb6221` fix(delivery-report): filter+stats luon visible (auto-expanded), khong follow lite-hide _(2026-05-22)_
- `cc68e4cc5` fix(delivery-report): drStatShippingCount/drStatFailCount nay tinh dung — match table view _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-090449-5e5ec53` cho Claude walk chain theo CLAUDE.md protocol.
